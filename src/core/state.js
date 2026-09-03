// @ts-check
/**
 * Session orchestration: the delve as a state machine.
 *
 * Phases: party -> explore -> (event) -> combat -> loot -> ... -> victory | defeat.
 * The UI reads this state and calls the intent functions below; it never mutates state directly
 * and contains no rules of its own.
 */

import { createRng, restoreRng } from './rng.js';
import { getRuleSystem, DEFAULT_RULE_SYSTEM } from './rules/index.js';
import { createActor, healActor, damageActor } from './entities.js';
import { createDungeon, currentRoom, isLastRoom, advance, depthRatioOf } from './dungeon.js';
import { createCombat, runMonsterTurn, endTurn, activeActor, checkEnd } from './combat.js';
import { rollEvent, selectTargets } from './events.js';
import { rollTreasure, grantItem, chooseRecipient } from './loot.js';
import { awardXp, encounterXp } from './progression.js';
import { trapDamageFor } from './abilities.js';
import { rollEncounterSpawns } from './corruption.js';
import { enterRoom, stepOptions, stepInto } from './exploration.js';
import { serialize } from './save.js';

/** @typedef {import('./entities.js').Actor} Actor */

/**
 * @typedef {object} Content
 * @property {any[]} heroes
 * @property {any[]} monsters
 * @property {any[]} rooms
 * @property {any[]} events
 * @property {any[]} items
 * @property {import('./corruption.js').CorruptionTheme[]} corruptions
 */

/**
 * @typedef {object} Session
 * @property {string} seed
 * @property {Content} content
 * @property {import('./rules/contract.js').RuleSystem} rules
 * @property {import('./rng.js').Rng} rng
 * @property {Actor[]} party
 * @property {any} dungeon
 * @property {any} combat
 * @property {'explore' | 'combat' | 'event' | 'loot' | 'victory' | 'defeat'} phase
 * @property {number} gold
 * @property {string[]} journal
 * @property {any} pending  Event or loot awaiting acknowledgement.
 */

/**
 * @param {object} args
 * @param {Content} args.content
 * @param {string[]} args.heroIds
 * @param {string} args.seed
 * @param {string} [args.rulesId]
 * @param {number} [args.depth]
 * @returns {Session}
 */
export function startSession({ content, heroIds, seed, rulesId = DEFAULT_RULE_SYSTEM, depth = 8 }) {
  const rules = getRuleSystem(rulesId);
  const rng = createRng(seed);

  const party = heroIds.map((id, index) => {
    const data = content.heroes.find((h) => h.id === id);
    if (!data) throw new Error(`unknown hero: ${id}`);
    const hero = createActor(data, rules, { side: 'hero', id: `${id}#${index}` });
    for (const itemId of data.startingItems ?? []) {
      const item = content.items.find((i) => i.id === itemId);
      if (item) grantItem(hero, item);
    }
    // Equipment changed the canonical profile, so rebuild the derived one and top the hero up.
    hero.profile = rules.toProfile(hero.canon);
    hero.maxWounds = hero.profile.wounds ?? hero.canon.wounds;
    hero.wounds = hero.maxWounds;
    return hero;
  });

  const dungeon = createDungeon({
    rooms: content.rooms,
    monsters: content.monsters,
    corruptions: content.corruptions,
    rng,
    depth,
    partySize: party.length,
  });

  /** @type {Session} */
  const session = {
    seed, content, rules, rng, party, dungeon,
    combat: null,
    phase: 'explore',
    gold: 0,
    journal: [],
    pending: null,
  };

  // The entrance is never walked — it starts cleared/visited by construction — so the delve's
  // first real interaction is stepping into the first middle room.
  advance(dungeon);
  const room = currentRoom(dungeon);
  room.fog = enterRoom(room.tile, rng, { depthRatio: depthRatioOf(room, dungeon), party });
  journal(session, `The party enters ${room.name}.`);
  return session;
}

/** @param {Session} session @param {string} line */
export function journal(session, line) {
  session.journal.push(line);
  if (session.journal.length > 80) session.journal.shift();
}

/**
 * Move the party one cell within the current room. This is the single entry point for spatial
 * exploration — the UI's tap-to-move and the balance simulation's scripted walker both call it.
 *
 * `cell` must be a legal step per `stepOptions` (a passable 4-way neighbour of where the party
 * is standing); an illegal target is silently ignored rather than thrown, so a stale UI tap
 * racing a phase change is harmless.
 *
 * @param {Session} session
 * @param {{x: number, y: number}} cell
 * @returns {Session}
 */
export function step(session, cell) {
  if (session.phase !== 'explore') return session;
  const room = currentRoom(session.dungeon);
  if (!room.fog) return session; // the entrance/objective have no walkable fog

  const legal = stepOptions(room.tile, room.fog).some((c) => c.x === cell.x && c.y === cell.y);
  if (!legal) return session;

  const dungeon = session.dungeon;
  const result = stepInto(room.tile, room.fog, session.rng, {
    cell, party: session.party, intensity: dungeon.corruption.intensity,
  });

  if (result.kind === 'ambush') return spawnAmbush(session, room);
  if (result.kind === 'trap') return springTrap(session, result.severity);
  if (result.kind === 'treasure') return grantTreasure(session, result.severity);
  if (result.kind === 'exit') return crossDoor(session);
  return session; // plain move
}

/**
 * Resolve an ambush rolled by `stepInto`: build the encounter from the delve's corruption theme
 * and start an in-place fight exactly where the party is standing.
 * @param {Session} session @param {import('./dungeon.js').Room} room
 */
function spawnAmbush(session, room) {
  const dungeon = session.dungeon;
  const theme = session.content.corruptions.find((t) => t.id === dungeon.corruption.themeId);
  const spawns = rollEncounterSpawns(session.content.monsters, session.rng, {
    depthRatio: depthRatioOf(room, dungeon),
    partySize: session.party.filter((h) => h.alive).length,
    intensity: dungeon.corruption.intensity,
    theme,
  });

  if (spawns.length === 0) {
    // The theme's pool was empty at this depth — content.js's tier-1 guard should make this
    // unreachable in practice, but a near-miss beats a fight that spawns nothing.
    journal(session, 'Something moves nearby, then thinks better of it.');
    return session;
  }

  room.cleared = false;
  // Exploration tracks the whole party as a single token (one shared fog.partyCell); combat
  // needs each hero's own x/y, which nothing has set until now.
  for (const hero of session.party) {
    if (!hero.alive) continue;
    hero.x = room.fog.partyCell.x;
    hero.y = room.fog.partyCell.y;
  }
  session.combat = createCombat({
    tile: room.tile,
    party: session.party,
    spawns,
    monsterData: session.content.monsters,
    rules: session.rules,
    rng: session.rng,
    placement: 'inPlace',
  });
  session.phase = 'combat';
  journal(session, 'Something was waiting.');
  // The first actor may be a monster, so let the AI act before handing control over.
  return runAiTurns(session);
}

/** @param {Session} session @param {number} severity */
function springTrap(session, severity) {
  const victims = selectTargets(session.party, 'random', session.rng);
  for (const hero of victims) {
    const dealt = damageActor(hero, trapDamageFor(hero, severity));
    journal(session, `A trap catches ${hero.name} for ${dealt}.`);
    if (!hero.alive) journal(session, `${hero.name} does not get up.`);
  }
  if (!session.party.some((h) => h.alive)) return finish(session, 'defeat');
  return session;
}

/**
 * The party has stepped onto the room's door: leave. Rolls the between-room event first, same
 * cadence as before (one roll per room transition); if one fires, the party must acknowledge it
 * before the next room resolves.
 * @param {Session} session
 */
function crossDoor(session) {
  const event = rollEvent(session.rng, session.content.events);
  if (event) {
    applyEvent(session, event);
    if (session.phase === 'defeat') return session;
    session.pending = { kind: 'event', event };
    session.phase = 'event';
    return session;
  }
  return enterNextRoom(session);
}

/** Acknowledge the pending event or loot and continue. */
export function acknowledge(session) {
  if (session.phase === 'event') {
    session.pending = null;
    return enterNextRoom(session);
  }
  if (session.phase === 'loot') {
    session.pending = null;
    session.phase = 'explore';
    return session;
  }
  return session;
}

/** @param {Session} session */
function enterNextRoom(session) {
  if (!advance(session.dungeon)) return session;
  const dungeon = session.dungeon;
  const room = currentRoom(dungeon);
  journal(session, `The party enters ${room.name}.`);

  if (room.tile.kind === 'objective') return spawnBoss(session, room);

  room.fog = enterRoom(room.tile, session.rng, {
    depthRatio: depthRatioOf(room, dungeon), party: session.party,
  });
  session.phase = 'explore';

  if (room.forceAmbush) {
    // Pre-empt the normal per-step roll rather than stacking on top of it — one guaranteed
    // threat from the event, not a guaranteed one plus a second random chance at it.
    room.fog.ambushSpent = true;
    return spawnAmbush(session, room);
  }
  return session;
}

/**
 * Start the guaranteed boss fight. Unlike a wandering ambush, the boss keeps the original
 * fresh-room placement ('entry', the createCombat default) — the showdown room isn't explored.
 * @param {Session} session @param {import('./dungeon.js').Room} room
 */
function spawnBoss(session, room) {
  session.combat = createCombat({
    tile: room.tile,
    party: session.party,
    spawns: room.encounter.spawns ?? [],
    monsterData: session.content.monsters,
    rules: session.rules,
    rng: session.rng,
  });
  session.phase = 'combat';
  journal(session, 'Something very large shifts in the dark.');
  return runAiTurns(session);
}

/** @param {Session} session @param {number} severity */
function grantTreasure(session, severity) {
  const { gold, item } = rollTreasure(session.rng, session.content.items, severity);
  session.gold += gold;
  const lines = [`The party recovers ${gold} gold.`];
  if (item) {
    const recipient = chooseRecipient(session.party, item);
    if (recipient) lines.push(grantItem(recipient, item));
  }
  for (const line of lines) journal(session, line);
  session.pending = { kind: 'loot', gold, item, lines };
  session.phase = 'loot';
  return session;
}

/** @param {Session} session @param {any} event */
function applyEvent(session, event) {
  journal(session, event.text);
  const effect = event.effect ?? { kind: 'none' };

  if (effect.kind === 'damage') {
    for (const hero of selectTargets(session.party, effect.target ?? 'random', session.rng)) {
      const dealt = damageActor(hero, effect.amount ?? 1);
      journal(session, `${hero.name} takes ${dealt}.`);
      if (!hero.alive) journal(session, `${hero.name} is lost.`);
    }
    if (!session.party.some((h) => h.alive)) finish(session, 'defeat');
  } else if (effect.kind === 'heal') {
    for (const hero of selectTargets(session.party, effect.target ?? 'all', session.rng)) {
      const healed = healActor(hero, effect.amount ?? 1);
      if (healed > 0) journal(session, `${hero.name} recovers ${healed}.`);
    }
  } else if (effect.kind === 'gold') {
    session.gold += effect.amount ?? 10;
    journal(session, `${effect.amount ?? 10} gold, quietly pocketed.`);
  } else if (effect.kind === 'item') {
    const pool = session.content.items.filter((i) => i.loot);
    if (pool.length) {
      const item = session.rng.pick(pool);
      const recipient = chooseRecipient(session.party, item);
      if (recipient) journal(session, grantItem(recipient, item));
    }
  } else if (effect.kind === 'spawn') {
    // Something was stirred up ahead. Rooms no longer carry a pre-rolled fight to pad, so this
    // instead guarantees the wandering ambush in the *next* room: `enterNextRoom` checks this
    // flag right after building that room's fog and, if set, skips the usual per-step roll and
    // spawns immediately — the horn is answered the moment the party walks in.
    const next = session.dungeon.rooms[session.dungeon.current + 1];
    if (next && next.tile.kind !== 'objective') next.forceAmbush = true;
  }
}

/**
 * Run monster turns until it is a hero's turn again, or the fight ends.
 * Bounded by a guard: a bug in monster AI should stall a turn, not hang the browser.
 * @param {Session} session
 */
export function runAiTurns(session) {
  const combat = session.combat;
  if (!combat || session.phase !== 'combat') return session;

  let guard = 0;
  while (combat.status === 'active' && guard++ < 200) {
    const actor = activeActor(combat);
    if (!actor) break;
    if (!actor.alive) { endTurn(combat); continue; }
    if (actor.side === 'hero') break;
    runMonsterTurn(combat, session.rules, session.rng);
    if (combat.status !== 'active') break;
    endTurn(combat);
  }
  return concludeCombat(session);
}

/** End the active hero's turn and let the monsters act. */
export function endHeroTurn(session) {
  if (session.phase !== 'combat' || !session.combat) return session;
  endTurn(session.combat);
  return runAiTurns(session);
}

/** @param {Session} session */
function concludeCombat(session) {
  const combat = session.combat;
  if (!combat) return session;
  checkEnd(combat);
  if (combat.status === 'active') return session;

  if (combat.status === 'lost') {
    for (const line of combat.log.slice(-3)) journal(session, line);
    return finish(session, 'defeat');
  }

  const room = currentRoom(session.dungeon);
  room.cleared = true;
  // Read who was actually in the fight rather than the room's encounter record: a wandering
  // ambush no longer carries a pre-rolled spawn list the way the boss room still does, and
  // deriving XP from the live combatants works for both without a special case.
  const defeated = new Map();
  for (const actor of combat.actors) {
    if (actor.side !== 'monster') continue;
    defeated.set(actor.dataId, (defeated.get(actor.dataId) ?? 0) + 1);
  }
  const xp = encounterXp([...defeated].map(([id, count]) => ({ id, count })), session.content.monsters);
  journal(session, 'The room falls quiet.');
  for (const line of awardXp(session.party, xp)) journal(session, line);
  session.combat = null;
  shortRest(session);

  if (room.encounter.kind === 'boss') return finish(session, 'victory');

  // No bonus roll here for an ambush win: the room's cell content (placeCellContent) already
  // scatters treasure independently, and stacking a second roll on top would just double the
  // loot density for no reason.
  session.phase = 'explore';
  return session;
}

/** Fraction of maximum wounds the party binds up after clearing a room. */
export const SHORT_REST_FRACTION = 0.25;

/**
 * Bind wounds after a fight.
 *
 * Without this the delve is pure one-way attrition: seven fights with no recovery kills any
 * party regardless of how well it plays, which is exactly what simulation showed. The rest is
 * deliberately partial, so damage still accumulates across a delve — it slows the bleed, it does
 * not reset it.
 *
 * @param {Session} session
 */
export function shortRest(session) {
  let healedAnyone = false;
  for (const hero of session.party) {
    if (!hero.alive) continue;
    const amount = Math.max(1, Math.round(hero.maxWounds * SHORT_REST_FRACTION));
    if (healActor(hero, amount) > 0) healedAnyone = true;
  }
  if (healedAnyone) journal(session, 'The party binds its wounds.');
}

/** @param {Session} session @param {'victory' | 'defeat'} outcome */
export function finish(session, outcome) {
  session.phase = outcome;
  session.combat = null;
  journal(session, outcome === 'victory'
    ? 'The way out is behind you, and you are still breathing.'
    : 'The dungeon keeps them.');
  return session;
}

/**
 * Rebuild a session from a save snapshot. Profiles are recomputed rather than restored, so a
 * rules change never leaves a save holding stale numbers.
 *
 * @param {any} snapshot @param {Content} content
 * @returns {Session | null}
 */
export function restoreSession(snapshot, content) {
  if (!snapshot) return null;
  const rules = getRuleSystem(snapshot.rulesId);

  const party = snapshot.party.map((saved) => {
    const data = content.heroes.find((h) => h.id === saved.dataId);
    if (!data) return null;
    const hero = createActor(data, rules, { side: 'hero', id: saved.id });
    hero.canon = { ...hero.canon, ...saved.canon };
    hero.profile = rules.toProfile(hero.canon);
    hero.maxWounds = saved.maxWounds;
    hero.wounds = saved.wounds;
    hero.alive = saved.alive;
    hero.xp = saved.xp;
    hero.level = saved.level;
    hero.items = (saved.items ?? [])
      .map((id) => content.items.find((i) => i.id === id))
      .filter(Boolean);
    return hero;
  }).filter(Boolean);

  if (party.length === 0) return null;

  const rooms = snapshot.dungeon.map((saved, index) => {
    const tile = content.rooms.find((r) => r.id === saved.tileId);
    if (!tile) return null;
    return {
      index,
      tile,
      name: tile.name,
      encounter: saved.encounter,
      cleared: saved.cleared,
      visited: saved.visited,
      fog: restoreFog(saved.fog),
      forceAmbush: saved.forceAmbush ?? false,
    };
  });
  if (rooms.some((r) => r === null)) return null;

  /** @type {Session} */
  const session = {
    seed: snapshot.seed,
    content,
    rules,
    rng: restoreRng(snapshot.rngState),
    party: /** @type {any} */ (party),
    dungeon: {
      seed: snapshot.seed, rooms, current: snapshot.roomIndex, depth: rooms.length,
      // Never re-rolled: the theme and intensity are a mid-delve constant, exactly like the
      // seed. Re-rolling here would also desync the restored rng stream from what actually
      // happened.
      corruption: snapshot.corruption,
    },
    combat: null,
    // A fight in progress is not restored as-is. For a wandering ambush this needs nothing
    // special: ambushSpent was set the instant the roll fired (see exploration.js), before
    // combat was ever created, so the restored fog already shows it spent and the party simply
    // resumes standing where the fight was — no second ambush can trigger there. The boss is
    // the one real special case, since it has no fog to fall back on.
    phase: snapshot.phase === 'combat' ? 'explore' : snapshot.phase,
    gold: snapshot.gold ?? 0,
    journal: ['The delve resumes.'],
    pending: null,
  };

  const room = currentRoom(session.dungeon);
  if (session.phase === 'explore' && room.tile.kind === 'objective' && !room.cleared) {
    return spawnBoss(session, room);
  }
  return session;
}

/** @param {any} saved @returns {import('./exploration.js').Fog | null} */
function restoreFog(saved) {
  if (!saved) return null;
  return {
    revealed: new Set(saved.revealed),
    contentKnown: new Set(saved.contentKnown),
    cellContent: new Map(saved.cellContent),
    visitedCells: new Set(saved.visitedCells),
    partyCell: saved.partyCell,
    ambushSpent: saved.ambushSpent,
  };
}

export { serialize, currentRoom, isLastRoom };
