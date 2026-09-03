// @ts-check
/**
 * Turn-based grid combat.
 *
 * The engine owns the board, turn order and legality of actions. Every die roll is delegated to
 * the active rule system, so the engine holds no dice logic of its own.
 */

import { createActor, damageActor, healActor } from './entities.js';
import { entryCells } from './dungeon.js';
import {
  distance, isAdjacent, reachable, findPath, hasLineOfSight, cellAt, HAZARD, floorCells,
} from './grid.js';
import {
  attackModifier, extraAttacks, onTurnStart, activeOptions, spendUse, hasAbility,
} from './abilities.js';

/** @typedef {import('./rng.js').Rng} Rng */
/** @typedef {import('./entities.js').Actor} Actor */
/** @typedef {import('./rules/contract.js').RuleSystem} RuleSystem */
/** @typedef {import('./grid.js').Tile} Tile */

/** Maximum shooting distance in cells; beyond this a shot is simply not offered. */
export const MAX_RANGE = 8;

/**
 * @typedef {object} Combat
 * @property {Tile} tile
 * @property {Actor[]} actors
 * @property {string[]} order       Actor ids in initiative order.
 * @property {number} turn          Index into order.
 * @property {number} round
 * @property {number} movementLeft  Cells the active actor may still move.
 * @property {boolean} hasActed     Whether the active actor already took its action.
 * @property {string[]} log
 * @property {'active' | 'won' | 'lost'} status
 * @property {import('./rng.js').Rng} rng  Held so turn-start effects can roll without the caller.
 */

/** @param {Actor[]} actors @returns {Set<string>} */
const occupied = (actors) =>
  new Set(actors.filter((a) => a.alive).map((a) => `${a.x},${a.y}`));

/** Monsters ambushing an already-standing party keep their distance, at least this many steps. */
export const AMBUSH_MIN_DISTANCE = 2;

/**
 * Where a wandering ambush spawns its monsters: nearest free floor to the party's centroid,
 * but never closer than `AMBUSH_MIN_DISTANCE` to any hero — an ambush closes in, it doesn't
 * spawn already swinging. Same deterministic distance-then-coordinate sort as `entryCells`, so
 * a given seed and board state always lays out the same fight.
 *
 * @param {Tile} tile
 * @param {number} count
 * @param {{x: number, y: number}[]} partyCells
 * @param {Set<string>} [occupiedCells]
 * @returns {{x: number, y: number}[]}
 */
export function ambushCells(tile, count, partyCells, occupiedCells = new Set()) {
  const cx = partyCells.reduce((sum, c) => sum + c.x, 0) / partyCells.length;
  const cy = partyCells.reduce((sum, c) => sum + c.y, 0) / partyCells.length;

  const candidates = floorCells(tile).filter((c) => {
    if (occupiedCells.has(`${c.x},${c.y}`)) return false;
    return partyCells.every((p) => distance(p, c) >= AMBUSH_MIN_DISTANCE);
  });

  return candidates
    .map((c) => ({ c, d: Math.abs(c.x - cx) + Math.abs(c.y - cy) }))
    .sort((a, b) => a.d - b.d || a.c.y - b.c.y || a.c.x - b.c.x)
    .map((entry) => entry.c)
    .slice(0, count);
}

/**
 * Build a combat from a room encounter.
 *
 * @param {object} args
 * @param {Tile} args.tile
 * @param {Actor[]} args.party        Live heroes, mutated in place across the delve.
 * @param {{id: string, count: number}[]} args.spawns
 * @param {any[]} args.monsterData
 * @param {RuleSystem} args.rules
 * @param {Rng} args.rng
 * @param {'entry' | 'inPlace'} [args.placement]  'entry' (default): heroes and monsters are
 *   both freshly placed near opposite sides of the room, exactly as a room-entry fight always
 *   has been — used for the boss. 'inPlace': heroes keep whatever x/y they're already standing
 *   at (a wandering ambush mid-room) and monsters spawn via `ambushCells` instead.
 * @returns {Combat}
 */
export function createCombat({ tile, party, spawns, monsterData, rules, rng, placement = 'entry' }) {
  const heroes = party.filter((hero) => hero.alive);
  const taken = new Set();

  if (placement === 'entry') {
    entryCells(tile, heroes.length, 'near').forEach((cell, i) => {
      heroes[i].x = cell.x;
      heroes[i].y = cell.y;
    });
  }
  for (const hero of heroes) taken.add(`${hero.x},${hero.y}`);

  /** @type {Actor[]} */
  const monsters = [];
  let counter = 0;
  for (const spawn of spawns) {
    const data = monsterData.find((m) => m.id === spawn.id);
    if (!data) continue;
    for (let i = 0; i < spawn.count; i++) {
      monsters.push(createActor(data, rules, { side: 'monster', id: `${spawn.id}#${counter++}` }));
    }
  }
  const monsterCells = placement === 'inPlace'
    ? ambushCells(tile, monsters.length, heroes, taken)
    : entryCells(tile, monsters.length, 'far', taken);
  monsterCells.forEach((cell, i) => {
    monsters[i].x = cell.x;
    monsters[i].y = cell.y;
    taken.add(`${cell.x},${cell.y}`);
  });

  // Monsters that found no free cell cannot take part; dropping them beats stacking them.
  const placed = monsters.filter((m) => taken.has(`${m.x},${m.y}`) && (m.x || m.y));
  const actors = [...heroes, ...(placed.length ? placed : monsters.slice(0, 1))];

  /** @type {Combat} */
  const combat = {
    tile,
    actors,
    order: rules.rollInitiative(actors, rng),
    turn: 0,
    round: 1,
    movementLeft: 0,
    hasActed: false,
    log: [],
    status: 'active',
    rng,
  };
  const foes = actors.filter((a) => a.side === 'monster').length;
  pushLog(combat, `${foes} ${foes === 1 ? 'enemy blocks' : 'enemies block'} the way.`);
  beginTurn(combat);
  return combat;
}

/** @param {Combat} combat @returns {Actor | undefined} */
export function activeActor(combat) {
  const id = combat.order[combat.turn];
  return combat.actors.find((a) => a.id === id);
}

/** @param {Combat} combat @param {string} line */
export function pushLog(combat, line) {
  combat.log.push(line);
  // The log is rendered on a phone; keeping it short avoids unbounded DOM growth.
  if (combat.log.length > 60) combat.log.shift();
}

/** @param {Combat} combat */
function beginTurn(combat) {
  const actor = activeActor(combat);
  combat.movementLeft = actor ? actor.canon.move : 0;
  combat.hasActed = false;
  if (actor?.alive && combat.rng) {
    for (const line of onTurnStart(actor, combat, combat.rng)) pushLog(combat, line);
  }
}

/**
 * Advance to the next living actor, skipping the dead and rolling over into a new round.
 * @param {Combat} combat
 */
export function endTurn(combat) {
  if (combat.status !== 'active') return;
  for (let i = 0; i < combat.order.length; i++) {
    combat.turn += 1;
    if (combat.turn >= combat.order.length) {
      combat.turn = 0;
      combat.round += 1;
    }
    const actor = activeActor(combat);
    if (actor?.alive) break;
  }
  beginTurn(combat);
  checkEnd(combat);
}

/** @param {Combat} combat */
export function checkEnd(combat) {
  const heroesAlive = combat.actors.some((a) => a.side === 'hero' && a.alive);
  const monstersAlive = combat.actors.some((a) => a.side === 'monster' && a.alive);
  if (!monstersAlive) combat.status = 'won';
  else if (!heroesAlive) combat.status = 'lost';
  return combat.status;
}

/**
 * Cells the active actor can still reach this turn.
 * @param {Combat} combat
 * @returns {Map<string, number>}
 */
export function movementOptions(combat) {
  const actor = activeActor(combat);
  if (!actor || combat.movementLeft <= 0) return new Map();
  const blocked = occupied(combat.actors);
  blocked.delete(`${actor.x},${actor.y}`);
  const cells = reachable(combat.tile, actor, combat.movementLeft, blocked);
  cells.delete(`${actor.x},${actor.y}`);
  return cells;
}

/**
 * Move the active actor along the shortest path, spending movement per cell.
 * Hazard cells cost the mover a wound, which is what makes the flooded rooms mean something.
 *
 * @param {Combat} combat @param {{x:number,y:number}} to
 * @returns {boolean} whether the move happened.
 */
export function moveTo(combat, to) {
  const actor = activeActor(combat);
  if (!actor || combat.status !== 'active') return false;
  const options = movementOptions(combat);
  const cost = options.get(`${to.x},${to.y}`);
  if (cost === undefined || cost > combat.movementLeft) return false;

  const blocked = occupied(combat.actors);
  blocked.delete(`${actor.x},${actor.y}`);
  const path = findPath(combat.tile, actor, to, blocked);
  if (!path) return false;

  actor.x = to.x;
  actor.y = to.y;
  combat.movementLeft -= cost;

  if (cellAt(combat.tile, to.x, to.y) === HAZARD) {
    const dealt = damageActor(actor, 1);
    pushLog(combat, `${actor.name} wades through the muck and takes ${dealt}.`);
    if (!actor.alive) {
      pushLog(combat, `${actor.name} goes under and does not come back up.`);
      checkEnd(combat);
    }
  }
  return true;
}

/**
 * Targets the active actor may attack right now, split by attack kind.
 * @param {Combat} combat
 * @returns {{ melee: Actor[], ranged: Actor[] }}
 */
export function attackOptions(combat) {
  const actor = activeActor(combat);
  if (!actor || combat.hasActed) return { melee: [], ranged: [] };
  const enemies = combat.actors.filter((a) => a.alive && a.side !== actor.side);
  const melee = enemies.filter((e) => isAdjacent(actor, e));
  // Shooting into melee is disallowed outright rather than penalised: one fewer rule to explain
  // on a small screen, and it gives melee enemies a reason to close.
  const inMelee = melee.length > 0;
  const ranged = inMelee
    ? []
    : enemies.filter(
        (e) => distance(actor, e) <= MAX_RANGE && hasLineOfSight(combat.tile, actor, e),
      );
  return { melee, ranged };
}

/** Range penalty in d6-scale steps; the percentile system widens it internally. */
export const rangePenalty = (dist) => (dist <= 2 ? 0 : dist <= 5 ? 1 : 2);

/**
 * Resolve an attack. All randomness and all system-specific wording come from the rule system.
 *
 * @param {Combat} combat
 * @param {Actor} target
 * @param {'melee' | 'ranged'} kind
 * @param {RuleSystem} rules
 * @param {Rng} rng
 * @returns {boolean} whether the attack was legal and resolved.
 */
export function attack(combat, target, kind, rules, rng) {
  const actor = activeActor(combat);
  if (!actor || combat.hasActed || combat.status !== 'active') return false;
  const options = attackOptions(combat);
  const legal = kind === 'melee' ? options.melee : options.ranged;
  if (!legal.some((t) => t.id === target.id)) return false;

  const ctx = {
    kind,
    rangePenalty: kind === 'ranged' ? rangePenalty(distance(actor, target)) : 0,
    modifier: 0,
  };
  // Passive abilities adjust the roll; they are read here so the rule systems stay unaware of them.
  ctx.modifier = attackModifier({ attacker: actor, defender: target, ctx, combat });

  const swings = Math.max(1, actor.canon.attacks) + extraAttacks(actor, combat);
  for (let i = 0; i < swings && target.alive; i++) {
    const result = rules.resolveAttack(actor, target, ctx, rng);
    if (result.damage > 0) damageActor(target, result.damage);
    pushLog(combat, rules.describe(actor, target, result));
    if (!target.alive) pushLog(combat, `${target.name} falls.`);
  }

  combat.hasActed = true;
  checkEnd(combat);
  return true;
}

/**
 * Active abilities the current actor could use, with their legal targets.
 * @param {Combat} combat
 */
export function abilityOptions(combat) {
  const actor = activeActor(combat);
  if (!actor || combat.hasActed) return [];
  return activeOptions(actor, combat);
}

/**
 * Spend the action on an active ability.
 *
 * @param {Combat} combat
 * @param {string} abilityId
 * @param {Actor} target
 * @param {RuleSystem} rules
 * @param {Rng} rng
 * @returns {boolean} whether the ability was legal and resolved.
 */
export function useAbility(combat, abilityId, target, rules, rng) {
  const actor = activeActor(combat);
  if (!actor || combat.hasActed || combat.status !== 'active') return false;

  const option = abilityOptions(combat).find((o) => o.ability.id === abilityId);
  if (!option || !option.targets.some((t) => t.id === target.id)) return false;

  const { ability } = option;
  if (ability.kind === 'heal' && ability.apply) {
    pushLog(combat, ability.apply(actor, target, rng));
  } else if (ability.kind === 'attack') {
    // A magical strike still resolves through the rule system, so one place owns the dice.
    const ctx = { kind: 'ranged', rangePenalty: 0, modifier: 0 };
    const result = rules.resolveAttack(actor, target, ctx, rng);
    if (result.damage > 0) damageActor(target, result.damage);
    pushLog(combat, `${ability.name}: ${rules.describe(actor, target, result)}`);
    if (!target.alive) pushLog(combat, `${target.name} falls.`);
  } else {
    return false;
  }

  spendUse(actor, ability);
  combat.hasActed = true;
  checkEnd(combat);
  return true;
}

/**
 * Spend the action to recover. Deliberately weak: it exists so a losing fight has an option
 * other than dying in place, not as a sustainable tactic.
 * @param {Combat} combat @param {Rng} rng
 */
export function defend(combat, rng) {
  const actor = activeActor(combat);
  if (!actor || combat.hasActed) return false;
  const healed = healActor(actor, rng.int(1, 2));
  pushLog(combat, healed > 0
    ? `${actor.name} catches a breath and recovers ${healed}.`
    : `${actor.name} braces.`);
  combat.hasActed = true;
  return true;
}

/**
 * Monster turn: close with the nearest hero and swing, or shoot if that is what it does.
 * Intentionally simple and predictable — a readable opponent beats a clever one on a small board.
 *
 * @param {Combat} combat @param {RuleSystem} rules @param {Rng} rng
 */
export function runMonsterTurn(combat, rules, rng) {
  const actor = activeActor(combat);
  if (!actor || actor.side !== 'monster' || !actor.alive) return;

  const heroes = combat.actors.filter((a) => a.side === 'hero' && a.alive);
  if (heroes.length === 0) { checkEnd(combat); return; }

  // Nearest, then weakest, then id — fully deterministic for a given board state.
  const target = heroes
    .slice()
    .sort((a, b) =>
      distance(actor, a) - distance(actor, b) ||
      a.wounds - b.wounds ||
      (a.id < b.id ? -1 : 1))[0];

  const shoot = () => {
    const { ranged } = attackOptions(combat);
    const shootable = ranged.find((t) => t.id === target.id) ?? ranged[0];
    return shootable ? attack(combat, shootable, 'ranged', rules, rng) : false;
  };

  if (actor.role === 'ranged' || actor.role === 'caster') {
    if (shoot()) return;
  }

  if (!isAdjacent(actor, target)) {
    const options = movementOptions(combat);
    let best = null;
    let bestDistance = distance(actor, target);
    for (const [key, cost] of options) {
      const [x, y] = key.split(',').map(Number);
      const d = distance({ x, y }, target);
      // Tie-break on movement cost, then coordinates, so the same board always plays the same.
      if (d < bestDistance || (d === bestDistance && best && cost < best.cost)) {
        bestDistance = d;
        best = { x, y, cost };
      }
    }
    if (best) moveTo(combat, best);
  }

  if (combat.status !== 'active') return;
  const { melee } = attackOptions(combat);
  const adjacent = melee.find((t) => t.id === target.id) ?? melee[0];
  if (adjacent) attack(combat, adjacent, 'melee', rules, rng);
  else if (!shoot()) pushLog(combat, `${actor.name} circles, looking for an opening.`);
}
