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
import { createDungeon, currentRoom, isLastRoom, advance } from './dungeon.js';
import { createCombat, runMonsterTurn, endTurn, activeActor, checkEnd } from './combat.js';
import { rollEvent, selectTargets } from './events.js';
import { rollTreasure, grantItem, chooseRecipient } from './loot.js';
import { awardXp, encounterXp } from './progression.js';
import { trapDamageFor } from './abilities.js';
import { serialize } from './save.js';

/** @typedef {import('./entities.js').Actor} Actor */

/**
 * @typedef {object} Content
 * @property {any[]} heroes
 * @property {any[]} monsters
 * @property {any[]} rooms
 * @property {any[]} events
 * @property {any[]} items
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
    journal: [`The party enters ${currentRoom(dungeon).name}.`],
    pending: null,
  };
  return session;
}

/** @param {Session} session @param {string} line */
export function journal(session, line) {
  session.journal.push(line);
  if (session.journal.length > 80) session.journal.shift();
}

/**
 * Move deeper. Rolls an event first; if one fires, the party must acknowledge it before the
 * next room resolves, which is what gives events their beat.
 *
 * @param {Session} session
 * @returns {Session}
 */
export function explore(session) {
  if (session.phase !== 'explore') return session;

  if (isLastRoom(session.dungeon) && currentRoom(session.dungeon).cleared) {
    return finish(session, 'victory');
  }

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

/** Acknowledge the pending event and continue into the next room. */
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
  if (!advance(session.dungeon)) {
    // Already at the objective and it is cleared: the delve is over.
    return isLastRoom(session.dungeon) ? finish(session, 'victory') : session;
  }
  const room = currentRoom(session.dungeon);
  journal(session, `The party enters ${room.name}.`);
  return resolveRoom(session);
}

/** @param {Session} session */
function resolveRoom(session) {
  const room = currentRoom(session.dungeon);
  const { encounter } = room;

  if (encounter.kind === 'monsters' || encounter.kind === 'boss') {
    session.combat = createCombat({
      tile: room.tile,
      party: session.party,
      spawns: encounter.spawns ?? [],
      monsterData: session.content.monsters,
      rules: session.rules,
      rng: session.rng,
    });
    session.phase = 'combat';
    journal(session, encounter.kind === 'boss'
      ? 'Something very large shifts in the dark.'
      : 'Enemies!');
    // The first actor may be a monster, so let the AI act before handing control over.
    return runAiTurns(session);
  }

  if (encounter.kind === 'trap') {
    const severity = encounter.severity ?? 1;
    const victims = selectTargets(session.party, 'random', session.rng);
    for (const hero of victims) {
      const dealt = damageActor(hero, trapDamageFor(hero, severity));
      journal(session, `A trap catches ${hero.name} for ${dealt}.`);
      if (!hero.alive) journal(session, `${hero.name} does not get up.`);
    }
    room.cleared = true;
    if (!session.party.some((h) => h.alive)) return finish(session, 'defeat');
    session.phase = 'explore';
    return session;
  }

  if (encounter.kind === 'treasure') {
    room.cleared = true;
    return grantTreasure(session, encounter.severity ?? 1);
  }

  room.cleared = true;
  session.phase = 'explore';
  return session;
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
    // A spawn event seeds extra monsters into the room the party is about to enter.
    const next = session.dungeon.rooms[session.dungeon.current + 1];
    if (next) {
      const pool = session.content.monsters.filter((m) => (m.tier ?? 1) === 1 && m.role !== 'boss');
      if (pool.length) {
        const extra = session.rng.pick(pool);
        const spawns = next.encounter.spawns ?? [];
        const existing = spawns.find((s) => s.id === extra.id);
        if (existing) existing.count += effect.amount ?? 1;
        else spawns.push({ id: extra.id, count: effect.amount ?? 1 });
        next.encounter = { kind: 'monsters', spawns };
        next.cleared = false;
      }
    }
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
  const xp = encounterXp(room.encounter.spawns ?? [], session.content.monsters);
  journal(session, 'The room falls quiet.');
  for (const line of awardXp(session.party, xp)) journal(session, line);
  session.combat = null;
  shortRest(session);

  if (room.encounter.kind === 'boss') return finish(session, 'victory');

  // A cleared fight usually leaves something behind.
  if (session.rng.next() < 0.5) {
    return grantTreasure(session, 1 + Math.floor(room.index / 3));
  }
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
    dungeon: { seed: snapshot.seed, rooms, current: snapshot.roomIndex, depth: rooms.length },
    combat: null,
    // A fight in progress is not restored; the party resumes at the start of that room instead.
    phase: snapshot.phase === 'combat' ? 'explore' : snapshot.phase,
    gold: snapshot.gold ?? 0,
    journal: ['The delve resumes.'],
    pending: null,
  };

  if (session.phase === 'explore' && !currentRoom(session.dungeon).cleared) {
    return resolveRoom(session);
  }
  return session;
}

export { serialize, currentRoom, isLastRoom };
