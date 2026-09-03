// @ts-check
/** Isolated single-hero combat test harness. No dungeon, loot, XP or persistence. */

import { createRng } from './rng.js';
import { getRuleSystem, DEFAULT_RULE_SYSTEM } from './rules/index.js';
import { createActor } from './entities.js';
import { grantItem } from './loot.js';
import { createCombat, activeActor, runMonsterTurn, endTurn, checkEnd } from './combat.js';

/**
 * @typedef {object} ArenaSession
 * @property {string} seed
 * @property {any} content
 * @property {any} rules
 * @property {import('./rng.js').Rng} rng
 * @property {string} heroId
 * @property {any[]} party
 * @property {any} combat
 * @property {number} opponentIndex
 * @property {number} wins
 * @property {'combat'|'between'|'defeat'} phase
 */

function arenaBattlefield(content) {
  return content.battlefields.find((tile) => tile.id === 'test_arena') ?? content.battlefields[0];
}

function createFreshHero(arena) {
  const data = arena.content.heroes.find((hero) => hero.id === arena.heroId);
  if (!data) throw new Error(`unknown arena hero: ${arena.heroId}`);
  const hero = createActor(data, arena.rules, { side: 'hero', id: `${data.id}#arena` });
  for (const itemId of data.startingItems ?? []) {
    const item = arena.content.items.find((candidate) => candidate.id === itemId);
    if (item) grantItem(hero, item);
  }
  hero.profile = arena.rules.toProfile(hero.canon);
  hero.maxWounds = hero.profile.wounds ?? hero.canon.wounds;
  hero.wounds = hero.maxWounds;
  return hero;
}

function startFight(arena, opponentIndex) {
  if (!arena.content.monsters.length) throw new Error('test arena requires at least one monster');
  const index = ((opponentIndex % arena.content.monsters.length) + arena.content.monsters.length)
    % arena.content.monsters.length;
  const opponent = arena.content.monsters[index];
  const tile = arenaBattlefield(arena.content);
  if (!tile) throw new Error('test arena requires a battlefield');

  arena.opponentIndex = index;
  arena.party = [createFreshHero(arena)];
  arena.combat = createCombat({
    tile,
    party: arena.party,
    spawns: [{ id: opponent.id, count: 1 }],
    monsterData: arena.content.monsters,
    rules: arena.rules,
    rng: arena.rng,
  });
  arena.phase = 'combat';
  return runArenaAiTurns(arena);
}

/** @param {{content:any,heroId:string,seed:string,rulesId?:string}} args */
export function startArena({ content, heroId, seed, rulesId = DEFAULT_RULE_SYSTEM }) {
  const arena = /** @type {ArenaSession} */ ({
    seed,
    content,
    rules: getRuleSystem(rulesId),
    rng: createRng(seed),
    heroId,
    party: [],
    combat: null,
    opponentIndex: 0,
    wins: 0,
    phase: 'combat',
  });
  return startFight(arena, 0);
}

/** @param {ArenaSession} arena */
export function currentArenaOpponent(arena) {
  return arena.content.monsters[arena.opponentIndex] ?? null;
}

/** @param {ArenaSession} arena */
export function nextArenaOpponent(arena) {
  return arena.content.monsters[(arena.opponentIndex + 1) % arena.content.monsters.length] ?? null;
}

/** Start the next opponent with a fresh baseline copy of the selected hero. */
export function nextArenaFight(arena) {
  if (arena.phase !== 'between') return arena;
  return startFight(arena, arena.opponentIndex + 1);
}

/** Retry the current matchup from baseline after a defeat or completed fight. */
export function retryArenaFight(arena) {
  if (arena.phase === 'combat') return arena;
  return startFight(arena, arena.opponentIndex);
}

/** @param {ArenaSession} arena */
export function concludeArenaCombat(arena) {
  const combat = arena.combat;
  if (!combat) return arena;
  checkEnd(combat);
  if (combat.status === 'active') return arena;
  if (combat.status === 'won') {
    arena.wins += 1;
    arena.phase = 'between';
  } else {
    arena.phase = 'defeat';
  }
  return arena;
}

/** @param {ArenaSession} arena */
export function runArenaAiTurns(arena) {
  const combat = arena.combat;
  if (!combat || arena.phase !== 'combat') return arena;
  let guard = 0;
  while (combat.status === 'active' && guard++ < 200) {
    const actor = activeActor(combat);
    if (!actor) break;
    if (!actor.alive) { endTurn(combat); continue; }
    if (actor.side === 'hero') break;
    runMonsterTurn(combat, arena.rules, arena.rng);
    if (combat.status !== 'active') break;
    endTurn(combat);
  }
  return concludeArenaCombat(arena);
}

/** @param {ArenaSession} arena */
export function endArenaHeroTurn(arena) {
  if (arena.phase !== 'combat' || !arena.combat) return arena;
  endTurn(arena.combat);
  return runArenaAiTurns(arena);
}
