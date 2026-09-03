// @ts-check
/** Experience and levelling. Kept deliberately shallow — one delve is not a campaign. */

/** @typedef {import('./entities.js').Actor} Actor */

/** Experience needed for each level beyond the first. */
export const XP_PER_LEVEL = 100;

/** @param {number} xp */
export const levelForXp = (xp) => 1 + Math.floor(xp / XP_PER_LEVEL);

/**
 * Split experience across the surviving party. The dead earn nothing — a small pressure to
 * keep everyone standing.
 *
 * @param {Actor[]} party
 * @param {number} amount
 * @returns {string[]} log lines for anyone who levelled
 */
export function awardXp(party, amount) {
  const alive = party.filter((h) => h.alive);
  if (alive.length === 0) return [];
  const share = Math.max(1, Math.floor(amount / alive.length));
  /** @type {string[]} */
  const lines = [];

  for (const hero of alive) {
    hero.xp += share;
    const level = levelForXp(hero.xp);
    while (hero.level < level) {
      hero.level += 1;
      // A level is one point of toughness and two wounds: noticeable, not transformative.
      hero.canon.tou += 1;
      hero.maxWounds += 2;
      hero.wounds += 2;
      lines.push(`${hero.name} reaches level ${hero.level}.`);
    }
  }
  return lines;
}

/**
 * Total experience a monster group is worth.
 * @param {{id: string, count: number}[]} spawns @param {any[]} monsterData
 */
export function encounterXp(spawns, monsterData) {
  return spawns.reduce((sum, spawn) => {
    const data = monsterData.find((m) => m.id === spawn.id);
    return sum + (data?.xpValue ?? 10) * spawn.count;
  }, 0);
}
