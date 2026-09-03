// @ts-check
/** Session orchestration: exploration, encounters, loot, recovery and progression. */

import { createRng, restoreRng } from './rng.js';
import { d6 } from './dice.js';
import { getRuleSystem, DEFAULT_RULE_SYSTEM } from './rules/index.js';
import { createActor, healActor, damageActor } from './entities.js';
import { createDungeon, currentRoom, isLastRoom, advance, depthRatioOf } from './dungeon.js';
import { createCombat, runMonsterTurn, endTurn, activeActor, checkEnd } from './combat.js';
import { rollEvent, selectTargets } from './events.js';
import { rollTreasure, grantItem } from './loot.js';
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
 * @property {any[]} battlefields
 * @property {import('./corruption.js').CorruptionTheme[]} corruptions
 */

/**
 * @typedef {object} Session
 * @property {string} seed
 * @property {Content} content
 * @property {import('./rules/contract.js').RuleSystem} rules
 * @property {import('./rng.js').Rng} rng
 * @property {Actor[]} party
 * @property {any[]} stash
 * @property {any} dungeon
 * @property {any} combat
 * @property {'explore'|'combat'|'event'|'loot'|'victory'|'defeat'} phase
 * @property {number} gold
 * @property {string[]} journal
 * @property {any} pending
 */

/** @param {{content:Content,heroIds:string[],seed:string,rulesId?:string,depth?:number}} args */
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
    hero.profile = rules.toProfile(hero.canon);
    hero.maxWounds = hero.profile.wounds ?? hero.canon.wounds;
    hero.wounds = hero.maxWounds;
    return hero;
  });

  const dungeon = createDungeon({
    rooms: content.rooms, monsters: content.monsters, corruptions: content.corruptions,
    rng, depth, partySize: party.length,
  });
  const session = {
    seed, content, rules, rng, party, stash: [], dungeon,
    combat: null, phase: 'explore', gold: 0, journal: [], pending: null,
  };

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

/** @param {Session} session @param {{x:number,y:number}} cell */
export function step(session, cell) {
  if (session.phase !== 'explore') return session;
  const room = currentRoom(session.dungeon);
  if (!room.fog) return session;
  const legal = stepOptions(room.tile, room.fog).some((c) => c.x === cell.x && c.y === cell.y);
  if (!legal) return session;
  const result = stepInto(room.tile, room.fog, session.rng, {
    cell, party: session.party, intensity: session.dungeon.corruption.intensity,
  });
  if (result.kind === 'ambush') return spawnAmbush(session, room);
  if (result.kind === 'trap') return springTrap(session, result.severity);
  if (result.kind === 'treasure') return grantTreasure(session, result.severity);
  if (result.kind === 'exit') return leaveRoom(session);
  return session;
}

/** @param {Session} session */
function battleTile(session) {
  return session.rng.pick(session.content.battlefields);
}

/** @param {Session} session @param {import('./dungeon.js').Room} room */
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
    journal(session, 'Something moves nearby, then thinks better of it.');
    return session;
  }
  room.cleared = false;
  session.combat = createCombat({
    tile: battleTile(session), party: session.party, spawns,
    monsterData: session.content.monsters, rules: session.rules, rng: session.rng,
  });
  session.phase = 'combat';
  journal(session, 'Something was waiting.');
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
 * Reaching the runtime exit is the room boundary. Recovery happens exactly once here, before the
 * existing between-room event cadence.
 * @param {Session} session
 */
function leaveRoom(session) {
  shortRest(session);
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

/** Acknowledge pending event/loot. Loot left unassigned remains in the group stash. */
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

/**
 * Move one stash item to a living hero. Equipment effects are applied by the existing grantItem
 * rules; this is the explicit player-controlled replacement for automatic recipient selection.
 * @param {Session} session @param {string} itemId @param {string} heroId
 */
export function assignStashItem(session, itemId, heroId) {
  const index = session.stash.findIndex((item) => item.id === itemId);
  const hero = session.party.find((candidate) => candidate.id === heroId && candidate.alive);
  if (index < 0 || !hero) return false;
  const [item] = session.stash.splice(index, 1);
  const line = grantItem(hero, item);
  hero.profile = session.rules.toProfile(hero.canon);
  journal(session, line);
  if (session.pending?.kind === 'loot' && session.pending.item?.id === itemId) {
    session.pending.assignedTo = hero.id;
    session.pending.lines.push(line);
  }
  return true;
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
    room.fog.ambushSpent = true;
    return spawnAmbush(session, room);
  }
  return session;
}

/** @param {Session} session @param {import('./dungeon.js').Room} room */
function spawnBoss(session, room) {
  session.combat = createCombat({
    tile: battleTile(session), party: session.party,
    spawns: room.encounter.spawns ?? [], monsterData: session.content.monsters,
    rules: session.rules, rng: session.rng,
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
    session.stash.push(item);
    lines.push(`${item.name} goes into the party stash.`);
  }
  for (const line of lines) journal(session, line);
  session.pending = { kind: 'loot', gold, item, lines, assignedTo: null };
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
      session.stash.push(item);
      journal(session, `${item.name} goes into the party stash.`);
    }
  } else if (effect.kind === 'spawn') {
    const next = session.dungeon.rooms[session.dungeon.current + 1];
    if (next && next.tile.kind !== 'objective') next.forceAmbush = true;
  }
}

/** @param {Session} session */
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
  const defeated = new Map();
  for (const actor of combat.actors) {
    if (actor.side !== 'monster') continue;
    defeated.set(actor.dataId, (defeated.get(actor.dataId) ?? 0) + 1);
  }
  const xp = encounterXp([...defeated].map(([id, count]) => ({ id, count })), session.content.monsters);
  journal(session, 'The fight is over.');
  for (const line of awardXp(session.party, xp)) journal(session, line);
  session.combat = null;
  if (room.encounter.kind === 'boss') return finish(session, 'victory');
  session.phase = 'explore';
  return session;
}

/**
 * Passive recovery at a room exit: d6 + base Toughness modifier (Tou 3 = +0), minimum 1.
 * Equipment Toughness does not improve recovery because baseCanon is immutable.
 * @param {Session} session
 */
export function shortRest(session) {
  let healedAnyone = false;
  for (const hero of session.party) {
    if (!hero.alive || hero.wounds >= hero.maxWounds) continue;
    const modifier = hero.baseCanon.tou - 3;
    const amount = Math.max(1, d6(session.rng) + modifier);
    const healed = healActor(hero, amount);
    if (healed > 0) {
      healedAnyone = true;
      journal(session, `${hero.name} rests and recovers ${healed}.`);
    }
  }
  if (healedAnyone) journal(session, 'The party catches its breath before moving on.');
}

/** @param {Session} session @param {'victory'|'defeat'} outcome */
export function finish(session, outcome) {
  session.phase = outcome;
  session.combat = null;
  journal(session, outcome === 'victory'
    ? 'The way out is behind you, and you are still breathing.'
    : 'The dungeon keeps them.');
  return session;
}

/** @param {any} snapshot @param {Content} content @returns {Session|null} */
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
    hero.items = (saved.items ?? []).map((id) => content.items.find((i) => i.id === id)).filter(Boolean);
    return hero;
  }).filter(Boolean);
  if (party.length === 0) return null;

  const rooms = snapshot.dungeon.map((saved, index) => {
    const tile = content.rooms.find((r) => r.id === saved.tileId);
    if (!tile) return null;
    return {
      index, tile, name: tile.name, encounter: saved.encounter, cleared: saved.cleared,
      visited: saved.visited, fog: restoreFog(saved.fog), forceAmbush: saved.forceAmbush ?? false,
    };
  });
  if (rooms.some((r) => r === null)) return null;

  const session = {
    seed: snapshot.seed, content, rules, rng: restoreRng(snapshot.rngState),
    party: /** @type {any} */ (party),
    stash: (snapshot.stash ?? []).map((id) => content.items.find((i) => i.id === id)).filter(Boolean),
    dungeon: {
      seed: snapshot.seed, rooms, current: snapshot.roomIndex, depth: rooms.length,
      corruption: snapshot.corruption,
    },
    combat: null,
    phase: snapshot.phase === 'combat' ? 'explore' : snapshot.phase,
    gold: snapshot.gold ?? 0,
    journal: ['The delve resumes.'],
    pending: null,
  };
  const room = currentRoom(session.dungeon);
  if (session.phase === 'explore' && room.tile.kind === 'objective' && !room.cleared) {
    return spawnBoss(/** @type {Session} */ (session), room);
  }
  return /** @type {Session} */ (session);
}

/** @param {any} saved */
function restoreFog(saved) {
  if (!saved) return null;
  return {
    revealed: new Set(saved.revealed),
    contentKnown: new Set(saved.contentKnown),
    cellContent: new Map(saved.cellContent),
    visitedCells: new Set(saved.visitedCells),
    partyCell: saved.partyCell,
    exitCell: saved.exitCell,
    ambushSpent: saved.ambushSpent,
  };
}

export { serialize, currentRoom, isLastRoom };
