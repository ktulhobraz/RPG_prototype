// @ts-check
/**
 * Corruption: the theme and intensity of a delve.
 *
 * A dungeon is touched by exactly one corruption, rolled once at generation and constant for
 * the whole delve (D-19-adjacent: one system, not several, to keep one thing balanced instead
 * of several). The theme restricts which monster factions can appear; the intensity scales
 * encounter size as a second, independent multiplier layered on top of the existing depth-based
 * scaling — at intensity 1.0 this reproduces the pre-corruption budget exactly, which is the
 * calibration target for the ranges in corruptions.json.
 *
 * Every name here is original — no Games Workshop vocabulary, per D-14.
 */

/** @typedef {import('./rng.js').Rng} Rng */

/**
 * @typedef {object} CorruptionTheme
 * @property {string} id
 * @property {string} name
 * @property {string} [blurb]
 * @property {string[]} factions   Monster `faction` values this theme may spawn.
 * @property {[number, number]} intensity   Inclusive roll range for this delve's intensity.
 */

/**
 * @typedef {object} Corruption
 * @property {string} themeId
 * @property {string} name
 * @property {number} intensity
 */

/**
 * @param {Rng} rng
 * @param {CorruptionTheme[]} themes
 * @returns {Corruption}
 */
export function rollCorruption(rng, themes) {
  const theme = rng.pick(themes);
  const [min, max] = theme.intensity;
  const intensity = Math.round((min + rng.next() * (max - min)) * 100) / 100;
  return { themeId: theme.id, name: theme.name, intensity };
}

/**
 * Monsters a theme allows. The boss is exempt everywhere it's used directly (callers filter
 * `role !== 'boss'` themselves, matching the existing convention), so this never needs to know
 * about bosses at all.
 *
 * @param {any[]} monsters
 * @param {CorruptionTheme} theme
 * @returns {any[]}
 */
export function permittedMonsters(monsters, theme) {
  return monsters.filter((m) => theme.factions.includes(m.faction));
}

/**
 * Build a monster group for an encounter. This is the corruption-aware replacement for the old
 * flat `rollSpawns`: same tier/budget shape, restricted to the delve's theme, with intensity as
 * a second multiplier on top of the existing depth-based scaling.
 *
 * @param {any[]} monsters
 * @param {Rng} rng
 * @param {object} args
 * @param {number} args.depthRatio   0 at the entrance, 1 at the objective.
 * @param {number} args.partySize
 * @param {number} [args.intensity]  Corruption intensity for this delve. Defaults to 1.0 (no
 *                                   scaling), so callers without a corruption context — tests,
 *                                   the boss escort before theming — still get sane output.
 * @param {CorruptionTheme} [args.theme]  Restrict the pool to this theme's factions. Omitted
 *                                        means no restriction (used for the theme-agnostic boss).
 * @returns {{ id: string, count: number }[]}
 */
export function rollEncounterSpawns(monsters, rng, { depthRatio, partySize, intensity = 1, theme }) {
  const tierCap = depthRatio > 0.6 ? 2 : 1;
  const themed = theme ? permittedMonsters(monsters, theme) : monsters;
  const pool = themed.filter((m) => (m.tier ?? 1) <= tierCap && m.role !== 'boss');
  if (pool.length === 0) return [];

  // Budget scales with party size so a four-hero party is not swamped by a two-hero encounter.
  // The base coefficients are set by simulation, not taste: see tests/sim.js and
  // docs/design/balance.md. Intensity multiplies on top; at 1.0 this is bit-for-bit the old
  // pre-corruption formula.
  const budget = Math.max(2, Math.round(partySize * (0.5 + depthRatio * 0.6) * intensity));
  /** @type {Map<string, number>} */
  const groups = new Map();
  let spent = 0;
  let guard = 0;

  while (spent < budget && guard++ < 40) {
    const monster = rng.pick(pool);
    const cost = (monster.tier ?? 1) >= 2 ? 2 : 1;
    if (spent + cost > budget + 1) break;
    groups.set(monster.id, (groups.get(monster.id) ?? 0) + 1);
    spent += cost;
  }
  return [...groups].map(([id, count]) => ({ id, count }));
}
