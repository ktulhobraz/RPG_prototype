// @ts-check
/**
 * Between-room events. Every exploration step rolls once, so lingering in the dungeon carries
 * a running cost — the pressure that keeps a delve moving forward.
 */

/** @typedef {import('./rng.js').Rng} Rng */
/** @typedef {import('./entities.js').Actor} Actor */

/** Chance per exploration step that anything happens at all. */
export const EVENT_CHANCE = 1 / 3;

/**
 * @param {Rng} rng
 * @param {any[]} events
 * @returns {any | null}
 */
export function rollEvent(rng, events) {
  if (rng.next() >= EVENT_CHANCE) return null;
  const total = events.reduce((sum, e) => sum + (e.weight ?? 1), 0);
  let roll = rng.next() * total;
  for (const event of events) {
    roll -= event.weight ?? 1;
    if (roll <= 0) return event;
  }
  return events[events.length - 1];
}

/**
 * Pick the actors an effect applies to. Selection is deterministic apart from the explicit
 * "random" case, which draws from the rng like everything else.
 *
 * @param {Actor[]} party
 * @param {string} target
 * @param {Rng} rng
 * @returns {Actor[]}
 */
export function selectTargets(party, target, rng) {
  const alive = party.filter((hero) => hero.alive);
  if (alive.length === 0) return [];
  if (target === 'all') return alive;
  if (target === 'random') return [rng.pick(alive)];
  if (target === 'weakest') {
    // Lowest remaining wounds; ties broken by id so the same seed picks the same hero.
    return [alive.slice().sort((a, b) => a.wounds - b.wounds || (a.id < b.id ? -1 : 1))[0]];
  }
  return [alive[0]];
}
