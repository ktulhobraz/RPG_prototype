// @ts-check
/**
 * Abilities.
 *
 * Content lists ability ids on heroes and monsters; this module is the only place that gives
 * them meaning. Two kinds exist:
 *
 *   - passive hooks the combat engine consults (attack modifiers, extra swings, turn start)
 *   - active abilities the player spends an action on, listed for the UI
 *
 * An unknown id is ignored rather than throwing, so content can name an ability before the
 * engine grows support for it.
 */

import { isAdjacent, distance } from './grid.js';

/** @typedef {import('./entities.js').Actor} Actor */
/** @typedef {import('./rng.js').Rng} Rng */

/** Below this fraction of maximum wounds an actor counts as wounded. */
const WOUNDED_AT = 0.5;

/** @param {Actor} actor */
const isWounded = (actor) => actor.wounds <= actor.maxWounds * WOUNDED_AT;

/**
 * @typedef {object} Ability
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {'passive' | 'heal' | 'attack'} kind
 * @property {number} [range]        Cells, for active abilities.
 * @property {number} [uses]         Uses per delve; omitted means unlimited.
 * @property {(ctxArgs: any) => number} [attackModifier]
 * @property {(actor: Actor, combat: any) => number} [extraAttacks]
 * @property {(actor: Actor, combat: any, rng: Rng) => string | null} [onTurnStart]
 * @property {(actor: Actor, target: Actor, rng: Rng) => string} [apply]
 */

/** @type {Record<string, Ability>} */
export const ABILITIES = {
  cleave: {
    id: 'cleave',
    name: 'Cleave',
    description: 'A second swing when more than one enemy is within reach.',
    kind: 'passive',
    extraAttacks: (actor, combat) => {
      const adjacent = combat.actors.filter(
        (a) => a.alive && a.side !== actor.side && isAdjacent(actor, a),
      );
      return adjacent.length >= 2 ? 1 : 0;
    },
  },

  frenzy: {
    id: 'frenzy',
    name: 'Frenzy',
    description: 'Strikes harder once badly hurt.',
    kind: 'passive',
    attackModifier: ({ attacker }) => (isWounded(attacker) ? 1 : 0),
  },

  fervour: {
    id: 'fervour',
    name: 'Fervour',
    description: 'Pain sharpens the blow.',
    kind: 'passive',
    attackModifier: ({ attacker }) => (isWounded(attacker) ? 1 : 0),
  },

  aimed_shot: {
    id: 'aimed_shot',
    name: 'Aimed Shot',
    description: 'Ignores the first step of range penalty.',
    kind: 'passive',
    attackModifier: ({ ctx }) => (ctx.kind === 'ranged' && (ctx.rangePenalty ?? 0) > 0 ? 1 : 0),
  },

  backstab: {
    id: 'backstab',
    name: 'Backstab',
    description: 'Deadlier against an enemy already engaged with an ally.',
    kind: 'passive',
    attackModifier: ({ attacker, defender, combat }) => {
      if (!combat) return 0;
      const engaged = combat.actors.some(
        (a) => a.alive && a.id !== attacker.id && a.side === attacker.side && isAdjacent(a, defender),
      );
      return engaged ? 1 : 0;
    },
  },

  keen_eye: {
    id: 'keen_eye',
    name: 'Keen Eye',
    description: 'Spots the trigger plate a moment before it matters.',
    kind: 'passive',
  },

  regenerate: {
    id: 'regenerate',
    name: 'Regenerate',
    description: 'Knits itself back together between blows.',
    kind: 'passive',
    onTurnStart: (actor, combat, rng) => {
      if (!actor.alive || actor.wounds >= actor.maxWounds) return null;
      const healed = Math.min(actor.maxWounds - actor.wounds, rng.int(1, 3));
      actor.wounds += healed;
      return `${actor.name} knits shut a wound (+${healed}).`;
    },
  },

  mend: {
    id: 'mend',
    name: 'Mend',
    description: 'Closes an ally\'s wounds at a distance. Three uses per delve.',
    kind: 'heal',
    range: 4,
    uses: 3,
    apply: (actor, target, rng) => {
      const amount = rng.int(3, 6);
      const healed = Math.min(target.maxWounds - target.wounds, amount);
      target.wounds += healed;
      return healed > 0
        ? `${actor.name} mends ${target.name} for ${healed}.`
        : `${actor.name} finds nothing left to mend on ${target.name}.`;
    },
  },

  bolt: {
    id: 'bolt',
    name: 'Bolt',
    description: 'A ranged strike that carries into a melee its caster is not part of.',
    kind: 'attack',
    range: 6,
  },
};

/**
 * @param {Actor} actor
 * @returns {Ability[]}
 */
export function abilitiesOf(actor) {
  return (actor.abilities ?? []).map((id) => ABILITIES[id]).filter(Boolean);
}

/** @param {Actor} actor @param {string} id */
export function hasAbility(actor, id) {
  return (actor.abilities ?? []).includes(id);
}

/**
 * Sum of every passive modifier that applies to this attack, in d6-scale steps.
 * @param {{attacker: Actor, defender: Actor, ctx: any, combat?: any}} args
 */
export function attackModifier(args) {
  let total = 0;
  for (const ability of abilitiesOf(args.attacker)) {
    if (ability.attackModifier) total += ability.attackModifier(args);
  }
  return total;
}

/** @param {Actor} actor @param {any} combat */
export function extraAttacks(actor, combat) {
  let total = 0;
  for (const ability of abilitiesOf(actor)) {
    if (ability.extraAttacks) total += ability.extraAttacks(actor, combat);
  }
  return total;
}

/**
 * Turn-start effects such as regeneration.
 * @param {Actor} actor @param {any} combat @param {Rng} rng
 * @returns {string[]} log lines
 */
export function onTurnStart(actor, combat, rng) {
  /** @type {string[]} */
  const lines = [];
  for (const ability of abilitiesOf(actor)) {
    if (!ability.onTurnStart) continue;
    const line = ability.onTurnStart(actor, combat, rng);
    if (line) lines.push(line);
  }
  return lines;
}

/**
 * Active abilities the actor could use right now, with their legal targets.
 * The UI renders exactly this; it does not decide legality itself.
 *
 * @param {Actor} actor @param {any} combat
 * @returns {{ ability: Ability, targets: Actor[], usesLeft: number }[]}
 */
export function activeOptions(actor, combat) {
  const out = [];
  for (const ability of abilitiesOf(actor)) {
    if (ability.kind === 'passive') continue;
    const usesLeft = usesRemaining(actor, ability);
    if (usesLeft <= 0) continue;

    const range = ability.range ?? 1;
    const candidates = combat.actors.filter((a) => {
      if (!a.alive || distance(actor, a) > range) return false;
      if (ability.kind === 'heal') return a.side === actor.side && a.wounds < a.maxWounds;
      return a.side !== actor.side;
    });
    if (candidates.length) out.push({ ability, targets: candidates, usesLeft });
  }
  return out;
}

/**
 * Uses left this delve. Counters live on the actor so they persist across rooms, which is what
 * makes a limited ability a resource to ration rather than a per-fight freebie.
 *
 * @param {Actor} actor @param {Ability} ability
 */
export function usesRemaining(actor, ability) {
  if (ability.uses === undefined) return Infinity;
  const spent = actor.abilityUses?.[ability.id] ?? 0;
  return Math.max(0, ability.uses - spent);
}

/** @param {Actor} actor @param {Ability} ability */
export function spendUse(actor, ability) {
  if (ability.uses === undefined) return;
  if (!actor.abilityUses) actor.abilityUses = {};
  actor.abilityUses[ability.id] = (actor.abilityUses[ability.id] ?? 0) + 1;
}

/**
 * Damage a trap deals to a hero, after abilities that mitigate it.
 * @param {Actor} hero @param {number} amount
 */
export function trapDamageFor(hero, amount) {
  return hasAbility(hero, 'keen_eye') ? Math.max(0, amount - 1) : amount;
}
