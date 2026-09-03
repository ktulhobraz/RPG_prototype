// @ts-check
/**
 * Save and load.
 *
 * Storage is injected rather than imported, so core stays DOM-free and the game keeps running
 * when storage is unavailable — private browsing being the common case.
 */

export const SAVE_KEY = 'rpg-prototype.save.v1';

/**
 * @typedef {object} StorageAdapter
 * @property {(key: string) => string | null} getItem
 * @property {(key: string, value: string) => void} setItem
 * @property {(key: string) => void} removeItem
 * @property {boolean} available
 */

/**
 * Wrap a Web Storage object, probing it once. Browsers can throw on access rather than merely
 * returning null, so the probe is what tells us whether saving is possible at all.
 *
 * @param {any} storage
 * @returns {StorageAdapter}
 */
export function createStorageAdapter(storage) {
  let available = false;
  try {
    const probe = '__rpg_probe__';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    available = true;
  } catch {
    available = false;
  }

  if (!available) return createNullStorage();

  return {
    available: true,
    getItem: (key) => { try { return storage.getItem(key); } catch { return null; } },
    setItem: (key, value) => { try { storage.setItem(key, value); } catch { /* quota or blocked */ } },
    removeItem: (key) => { try { storage.removeItem(key); } catch { /* ignore */ } },
  };
}

/** An adapter that discards everything, used when storage is blocked or in tests. */
export function createNullStorage() {
  return {
    available: false,
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  };
}

/**
 * A memory-backed adapter, for tests that want to assert a round trip.
 * @returns {StorageAdapter}
 */
export function createMemoryStorage() {
  /** @type {Map<string, string>} */
  const map = new Map();
  return {
    available: true,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => { map.set(key, value); },
    removeItem: (key) => { map.delete(key); },
  };
}

/**
 * Reduce a session to the minimum needed to rebuild it. Actors are stored by data id plus their
 * mutable state; profiles are recomputed on load so a rules change never corrupts an old save.
 *
 * @param {any} session
 */
export function serialize(session) {
  return {
    version: 1,
    seed: session.seed,
    rulesId: session.rules.id,
    rngState: session.rng.state(),
    gold: session.gold,
    phase: session.phase,
    roomIndex: session.dungeon.current,
    corruption: session.dungeon.corruption,
    dungeon: session.dungeon.rooms.map((room) => ({
      tileId: room.tile.id,
      encounter: room.encounter,
      cleared: room.cleared,
      visited: room.visited,
      fog: room.fog ? serializeFog(room.fog) : null,
      // Set by a "spawn" event on a room not yet entered. Without this, saving in the window
      // between that event firing and the party actually walking in would silently drop the
      // guaranteed ambush it promised.
      forceAmbush: room.forceAmbush ?? false,
    })),
    party: session.party.map((hero) => ({
      dataId: hero.dataId,
      id: hero.id,
      wounds: hero.wounds,
      maxWounds: hero.maxWounds,
      alive: hero.alive,
      xp: hero.xp,
      level: hero.level,
      canon: hero.canon,
      items: hero.items.map((i) => i.id),
    })),
  };
}

/** Flatten a room's Sets/Map into JSON-safe arrays. @param {any} fog */
function serializeFog(fog) {
  return {
    revealed: [...fog.revealed],
    contentKnown: [...fog.contentKnown],
    cellContent: [...fog.cellContent.entries()],
    visitedCells: [...fog.visitedCells],
    partyCell: fog.partyCell,
    ambushSpent: fog.ambushSpent,
  };
}

/**
 * @param {StorageAdapter} storage @param {any} session
 * @returns {boolean} whether the save was written.
 */
export function save(storage, session) {
  if (!storage.available) return false;
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(serialize(session)));
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {StorageAdapter} storage
 * @returns {any | null} the raw snapshot, or null when absent or corrupt.
 */
export function load(storage) {
  const raw = storage.getItem(SAVE_KEY);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    // A save from a future or unknown version is discarded rather than half-read.
    return data?.version === 1 ? data : null;
  } catch {
    return null;
  }
}

/** @param {StorageAdapter} storage */
export function clearSave(storage) {
  storage.removeItem(SAVE_KEY);
}
