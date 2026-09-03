// @ts-check
/** Treasure rolls and equipment. */

/** @typedef {import('./rng.js').Rng} Rng */
/** @typedef {import('./entities.js').Actor} Actor */

/**
 * @param {Rng} rng
 * @param {any[]} items
 * @param {number} severity  Rises with depth; deeper rooms pay better.
 * @returns {{ gold: number, item: any | null }}
 */
export function rollTreasure(rng, items, severity = 1) {
  const gold = rng.int(10, 25) * severity;
  const pool = items.filter((i) => i.loot);
  // Deeper rooms are likelier to hold something worth carrying out.
  const chance = 0.35 + severity * 0.12;
  const item = pool.length && rng.next() < chance ? rng.pick(pool) : null;
  return { gold, item };
}

/**
 * Give an item to a hero. Consumables stack in the pack; equipment replaces whatever occupies
 * its slot, and the modifier is applied to the canonical profile so both rule systems see it.
 *
 * @param {Actor} hero
 * @param {any} item
 * @returns {string} log line
 */
export function grantItem(hero, item) {
  hero.items.push(item);
  if (item.slot === 'consumable') return `${hero.name} pockets ${item.name}.`;

  const previous = hero.items.find((i) => i !== item && i.slot === item.slot);
  if (previous) {
    hero.items = hero.items.filter((i) => i !== previous);
    unapplyMods(hero, previous);
  }
  applyMods(hero, item);
  return `${hero.name} equips ${item.name}.`;
}

/** @param {Actor} hero @param {any} item */
function applyMods(hero, item) {
  for (const [key, delta] of Object.entries(item.mods ?? {})) {
    if (typeof delta === 'number' && key in hero.canon) {
      /** @type {any} */ (hero.canon)[key] += delta;
    }
  }
}

/** @param {Actor} hero @param {any} item */
function unapplyMods(hero, item) {
  for (const [key, delta] of Object.entries(item.mods ?? {})) {
    if (typeof delta === 'number' && key in hero.canon) {
      /** @type {any} */ (hero.canon)[key] -= delta;
    }
  }
}

/**
 * Choose who receives a found item: the hero whose role the item suits, else the first alive.
 * @param {Actor[]} party @param {any} item
 */
export function chooseRecipient(party, item) {
  const alive = party.filter((h) => h.alive);
  if (alive.length === 0) return null;
  if (item.mods?.bs) return alive.find((h) => h.role === 'ranged') ?? alive[0];
  if (item.mods?.ws || item.mods?.str) return alive.find((h) => h.role === 'melee') ?? alive[0];
  return alive[0];
}
