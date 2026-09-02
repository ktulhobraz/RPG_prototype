// @ts-check
/** Dice helpers. All of them take an Rng so results stay reproducible. */

/** @typedef {import('./rng.js').Rng} Rng */

/** @param {Rng} rng @returns {number} 1-6 */
export const d6 = (rng) => rng.int(1, 6);

/** @param {Rng} rng @returns {number} 1-10 */
export const d10 = (rng) => rng.int(1, 10);

/** @param {Rng} rng @returns {number} 1-100 */
export const d100 = (rng) => rng.int(1, 100);

/**
 * Roll several dice of the same size and sum them.
 * @param {Rng} rng @param {number} count @param {number} sides
 */
export function roll(rng, count, sides) {
  let total = 0;
  for (let i = 0; i < count; i++) total += rng.int(1, sides);
  return total;
}

/**
 * A d100 roll is "doubles" when both digits match (11, 22, ... 99, and 100 -> 00).
 * Used for criticals and fumbles in the percentile system.
 * @param {number} value
 */
export function isDoubles(value) {
  const v = value % 100; // 100 becomes 00
  return Math.floor(v / 10) === v % 10;
}

/** @param {number} value @param {number} min @param {number} max */
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
