// @ts-check
/**
 * Tabletop-style d6 resolution. This is the default system and the balance reference:
 * every content stat block is authored against these numbers.
 */

import { d6, clamp } from '../dice.js';
import { normalizeProfile } from '../profile.js';

/** @typedef {import('./contract.js').RuleSystem} RuleSystem */
/** @typedef {import('./contract.js').Combatant} Combatant */
/** @typedef {import('./contract.js').AttackResult} AttackResult */

/**
 * To-hit number for melee: even skill needs a 4+, and each point of advantage shifts it by one.
 * @param {number} attackerWs @param {number} defenderWs
 */
export function meleeTarget(attackerWs, defenderWs) {
  return clamp(4 - (attackerWs - defenderWs), 2, 6);
}

/**
 * Ranged difficulty depends only on the shooter, plus range penalties applied by the engine.
 * @param {number} bs
 */
export function rangedTarget(bs) {
  return clamp(7 - bs, 2, 6);
}

/** @type {RuleSystem} */
export const d6System = {
  id: 'd6',
  name: 'Six-Sided',
  summary: 'Fast tabletop resolution: d6 to hit, d6+Strength damage reduced by Toughness.',

  toProfile: (canon) => normalizeProfile(canon, 'd6 profile'),

  rollInitiative(combatants, rng) {
    return combatants
      .map((c) => ({ id: c.id, score: d6(rng) + c.canon.init, init: c.canon.init }))
      // Ties fall back to the initiative stat and then to id, so ordering is fully determined.
      .sort((a, b) => b.score - a.score || b.init - a.init || (a.id < b.id ? -1 : 1))
      .map((entry) => entry.id);
  },

  resolveAttack(attacker, defender, ctx, rng) {
    const a = attacker.canon;
    const d = defender.canon;
    const base = ctx.kind === 'ranged' ? rangedTarget(a.bs) : meleeTarget(a.ws, d.ws);
    const target = clamp(base + (ctx.rangePenalty ?? 0) - (ctx.modifier ?? 0), 2, 6);

    const toHit = d6(rng);
    // Natural extremes override the target number entirely — a 6 always lands, a 1 never does.
    const fumble = toHit === 1;
    const crit = toHit === 6;
    const hit = crit || (!fumble && toHit >= target);

    if (!hit) {
      return {
        hit: false, damage: 0, crit: false, fumble,
        detail: `d6 ${toHit} vs ${target}+ — miss`,
      };
    }

    const damageRoll = d6(rng);
    const critRoll = crit ? d6(rng) : 0;
    const raw = damageRoll + a.str + critRoll;
    const damage = Math.max(0, raw - d.tou);
    const critNote = crit ? ` +${critRoll} crit` : '';
    return {
      hit: true, damage, crit, fumble: false,
      detail: `d6 ${toHit} vs ${target}+ — hit; ${damageRoll}+${a.str}${critNote} -${d.tou} tou = ${damage}`,
    };
  },

  resolveTest(actor, stat, difficulty, rng) {
    const value = /** @type {any} */ (actor.canon)[stat] ?? 3;
    const target = clamp(difficulty - value + 4, 2, 6);
    const rolled = d6(rng);
    const success = rolled !== 1 && (rolled === 6 || rolled >= target);
    return { success, degree: rolled - target, detail: `d6 ${rolled} vs ${target}+` };
  },

  describe(attacker, defender, result) {
    if (!result.hit) {
      return result.fumble
        ? `${attacker.name} fumbles against ${defender.name}.`
        : `${attacker.name} misses ${defender.name}.`;
    }
    if (result.damage === 0) return `${attacker.name} hits ${defender.name}, but the blow glances off.`;
    const verb = result.crit ? 'lands a savage blow on' : 'hits';
    return `${attacker.name} ${verb} ${defender.name} for ${result.damage}.`;
  },
};
