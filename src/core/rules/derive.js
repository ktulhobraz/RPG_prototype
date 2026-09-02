// @ts-check
/**
 * Canonical (d6-scale) profile -> percentile profile.
 *
 * This is the single place where the two rule systems are reconciled. Retuning the whole d100
 * system is a change to this file, not to every creature in src/data.
 */

import { clamp } from '../dice.js';

/** @typedef {import('../profile.js').CanonProfile} CanonProfile */

/**
 * @typedef {object} PercentileProfile
 * @property {number} ws        Melee skill as a percentage
 * @property {number} bs        Ranged skill as a percentage
 * @property {number} strBonus  Damage bonus
 * @property {number} touBonus  Damage reduction
 * @property {number} wounds    Hit points on the percentile scale
 * @property {number} initBonus Initiative bonus
 * @property {number} attacks   Attacks per turn
 * @property {number} move      Movement in cells
 */

/** A skill of N on the d6 scale becomes N*10+5 percent, clamped to leave room for luck. */
export const skillToPercent = (stat) => clamp(Math.round(stat * 10 + 5), 5, 95);

/**
 * Derive the percentile profile, then let a creature override individual fields.
 * Overrides exist for the handful of cases where a uniform formula reads wrong.
 *
 * @param {CanonProfile} canon
 * @param {Partial<PercentileProfile>} [overrides]
 * @returns {PercentileProfile}
 */
export function toPercentile(canon, overrides = {}) {
  /** @type {PercentileProfile} */
  const derived = {
    ws: skillToPercent(canon.ws),
    bs: skillToPercent(canon.bs),
    strBonus: canon.str,
    touBonus: canon.tou,
    // Percentile damage uses d10 rather than d6, so wounds scale up to keep fights the same length.
    wounds: Math.max(1, Math.round(canon.wounds * 1.5)),
    initBonus: 10 + canon.init * 5,
    attacks: canon.attacks,
    move: canon.move,
  };
  for (const [key, value] of Object.entries(overrides)) {
    if (typeof value === 'number' && key in derived) {
      /** @type {any} */ (derived)[key] = value;
    }
  }
  return derived;
}
