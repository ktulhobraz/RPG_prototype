// @ts-check
/**
 * Canonical creature profile.
 *
 * Content authors write exactly one stat block per creature, in the small-integer d6 scale.
 * Every rule system derives its own working profile from this, so adding a rule system never
 * means rewriting content.
 */

/**
 * @typedef {object} CanonProfile
 * @property {number} ws       Weapon skill (melee), 2-6
 * @property {number} bs       Ballistic skill (ranged), 2-6
 * @property {number} str      Strength, 2-5
 * @property {number} tou      Toughness, 2-5
 * @property {number} wounds   Hit points
 * @property {number} init     Initiative, 2-6
 * @property {number} attacks  Attacks per turn
 * @property {number} move     Movement in cells
 */

/** The stat keys a canonical profile must define. */
export const CANON_KEYS = /** @type {const} */ ([
  'ws', 'bs', 'str', 'tou', 'wounds', 'init', 'attacks', 'move',
]);

/** @type {CanonProfile} */
const DEFAULTS = { ws: 3, bs: 3, str: 3, tou: 3, wounds: 6, init: 3, attacks: 1, move: 4 };

/**
 * Fill in any missing stats and reject malformed data early, where the bad file is still obvious.
 * @param {Partial<CanonProfile>} raw
 * @param {string} [label] Identifier used in error messages.
 * @returns {CanonProfile}
 */
export function normalizeProfile(raw, label = 'profile') {
  /** @type {any} */
  const out = { ...DEFAULTS, ...raw };
  for (const key of CANON_KEYS) {
    const value = out[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`${label}: stat "${key}" must be a finite number, got ${String(value)}`);
    }
  }
  if (out.wounds < 1) throw new Error(`${label}: wounds must be at least 1`);
  return out;
}

/**
 * Apply equipment or temporary modifiers on top of a canonical profile.
 * @param {CanonProfile} profile
 * @param {Partial<CanonProfile>[]} mods
 * @returns {CanonProfile}
 */
export function applyMods(profile, mods) {
  /** @type {any} */
  const out = { ...profile };
  for (const mod of mods) {
    for (const [key, delta] of Object.entries(mod)) {
      if (typeof delta === 'number' && key in out) out[key] += delta;
    }
  }
  return normalizeProfile(out, 'modified profile');
}
