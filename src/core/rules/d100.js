// @ts-check
/**
 * Percentile resolution with success levels and criticals on doubles.
 *
 * Marked experimental: it is fully playable, but content is balanced against the d6 system,
 * and this one inherits its numbers through derivation rather than hand-tuning.
 */

import { d10, d100 as rollD100, isDoubles, clamp } from '../dice.js';
import { toPercentile } from './derive.js';

/** @typedef {import('./contract.js').RuleSystem} RuleSystem */

/**
 * Success levels: tens digit of the skill minus tens digit of the roll.
 * @param {number} skill @param {number} rolled
 */
export function successLevels(skill, rolled) {
  return Math.floor(skill / 10) - Math.floor(rolled / 10);
}

/** @type {RuleSystem} */
export const d100System = {
  id: 'd100',
  name: 'Percentile',
  experimental: true,
  summary: 'Percentile rolls with success levels, advantage from margin, and criticals on doubles.',

  toProfile: (canon, overrides) => toPercentile(canon, overrides ?? {}),

  rollInitiative(combatants, rng) {
    return combatants
      .map((c) => ({
        id: c.id,
        score: d10(rng) + c.profile.initBonus,
        tie: c.profile.initBonus,
      }))
      .sort((a, b) => b.score - a.score || b.tie - a.tie || (a.id < b.id ? -1 : 1))
      .map((entry) => entry.id);
  },

  resolveAttack(attacker, defender, ctx, rng) {
    const a = attacker.profile;
    const d = defender.profile;
    const baseSkill = ctx.kind === 'ranged' ? a.bs : a.ws;
    // Range penalties arrive on the d6 scale (0-3), so widen them to percentile steps.
    const penalty = (ctx.rangePenalty ?? 0) * 10;
    const skill = clamp(baseSkill - penalty + (ctx.modifier ?? 0) * 10, 5, 95);

    const rolled = rollD100(rng);
    const doubles = isDoubles(rolled);
    const success = rolled <= skill;
    const sl = successLevels(skill, rolled);

    if (!success) {
      return {
        hit: false, damage: 0, crit: false, fumble: doubles,
        detail: `d100 ${rolled} vs ${skill}% — miss (SL ${sl})`,
      };
    }

    const damageRoll = d10(rng);
    const bonus = Math.max(0, sl);
    const critBonus = doubles ? d10(rng) : 0;
    const raw = damageRoll + a.strBonus + bonus + critBonus;
    const damage = Math.max(0, raw - d.touBonus);
    const critNote = doubles ? ` +${critBonus} crit` : '';
    return {
      hit: true, damage, crit: doubles, fumble: false,
      detail: `d100 ${rolled} vs ${skill}% — hit (SL ${sl}); ${damageRoll}+${a.strBonus}+${bonus}${critNote} -${d.touBonus} tou = ${damage}`,
    };
  },

  resolveTest(actor, stat, difficulty, rng) {
    // Canonical stats are the only universal vocabulary, so tests convert on the fly.
    const canonValue = /** @type {any} */ (actor.canon)[stat] ?? 3;
    const skill = clamp(canonValue * 10 + 5 - difficulty * 10, 5, 95);
    const rolled = rollD100(rng);
    const success = rolled <= skill;
    return {
      success,
      degree: successLevels(skill, rolled),
      detail: `d100 ${rolled} vs ${skill}%`,
    };
  },

  describe(attacker, defender, result) {
    if (!result.hit) {
      return result.fumble
        ? `${attacker.name} fumbles the attack on ${defender.name}.`
        : `${attacker.name} fails to connect with ${defender.name}.`;
    }
    if (result.damage === 0) return `${attacker.name} strikes ${defender.name}, but armour holds.`;
    const verb = result.crit ? 'critically wounds' : 'wounds';
    return `${attacker.name} ${verb} ${defender.name} for ${result.damage}.`;
  },
};
