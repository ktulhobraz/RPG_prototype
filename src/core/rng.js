// @ts-check
/**
 * Seeded pseudo-random number generator.
 *
 * Every random decision in the game flows through one of these. Core code never calls
 * Math.random(), which is what makes delves reproducible from a seed and tests deterministic.
 */

/**
 * @typedef {object} Rng
 * @property {() => number} next        Float in [0, 1).
 * @property {(min: number, max: number) => number} int  Integer in [min, max] inclusive.
 * @property {<T>(items: readonly T[]) => T} pick        Uniform choice from a non-empty array.
 * @property {<T>(items: readonly T[]) => T[]} shuffle   New array, Fisher-Yates shuffled.
 * @property {() => number} state       Current internal state, for saving.
 */

/**
 * Hash an arbitrary string into a 32-bit seed, so players can share readable seeds.
 * @param {string} text
 * @returns {number}
 */
export function hashSeed(text) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/**
 * Create a generator. Accepts a numeric seed or a string that is hashed into one.
 * @param {number | string} seed
 * @returns {Rng}
 */
export function createRng(seed) {
  let s = (typeof seed === 'string' ? hashSeed(seed) : seed >>> 0) || 1;

  // mulberry32: small, fast, and good enough for game randomness.
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  /** @type {Rng} */
  const rng = {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (items) => items[Math.floor(next() * items.length)],
    shuffle: (items) => {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    state: () => s,
  };
  return rng;
}

/**
 * Restore a generator mid-sequence, so a saved delve continues with the same rolls.
 * @param {number} state
 * @returns {Rng}
 */
export function restoreRng(state) {
  return createRng(state);
}
