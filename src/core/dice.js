// @ts-check
/** Dice helpers. All of them take an Rng so results stay reproducible. */

/** @typedef {import('./rng.js').Rng} Rng */

/** @param {Rng} rng @returns {number} 1-6 */
export const d6 = (rng) => rng.int(1, 6);

/** @param {Rng} rng @returns {number} 1-10 */
export const d10 = (rng) => rng.int(1, 10);

/**
 * Roll several dice of the same size and sum them.
 * @param {Rng} rng @param {number} count @param {number} sides
 */
export function roll(rng, count, sides) {
  let total = 0;
  for (let i = 0; i < count; i++) total += rng.int(1, sides);
  return total;
}

/** @param {number} value @param {number} min @param {number} max */
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
