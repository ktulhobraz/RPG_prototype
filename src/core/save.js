// @ts-check
/** Save and load with injected storage. */

export const SAVE_KEY = 'rpg-prototype.save.v2';

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
    setItem: (key, value) => { try { storage.setItem(key, value); } catch { /* blocked/quota */ } },
    removeItem: (key) => { try { storage.removeItem(key); } catch { /* ignore */ } },
  };
}

export function createNullStorage() {
  return { available: false, getItem: () => null, setItem: () => {}, removeItem: () => {} };
}

export function createMemoryStorage() {
  const map = new Map();
  return {
    available: true,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => { map.set(key, value); },
    removeItem: (key) => { map.delete(key); },
  };
}

/** @param {any} session */
export function serialize(session) {
  return {
    version: 2,
    seed: session.seed,
    rulesId: session.rules.id,
    rngState: session.rng.state(),
    gold: session.gold,
    stash: session.stash.map((item) => item.id),
    phase: session.phase,
    roomIndex: session.dungeon.current,
    corruption: session.dungeon.corruption,
    dungeon: session.dungeon.rooms.map((room) => ({
      tileId: room.tile.id,
      encounter: room.encounter,
      cleared: room.cleared,
      visited: room.visited,
      fog: room.fog ? serializeFog(room.fog) : null,
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

function serializeFog(fog) {
  return {
    revealed: [...fog.revealed],
    contentKnown: [...fog.contentKnown],
    cellContent: [...fog.cellContent.entries()],
    visitedCells: [...fog.visitedCells],
    partyCell: fog.partyCell,
    exitCell: fog.exitCell,
    ambushSpent: fog.ambushSpent,
  };
}

export function save(storage, session) {
  if (!storage.available) return false;
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(serialize(session)));
    return true;
  } catch {
    return false;
  }
}

export function load(storage) {
  const raw = storage.getItem(SAVE_KEY);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    return data?.version === 2 ? data : null;
  } catch {
    return null;
  }
}

export function clearSave(storage) {
  storage.removeItem(SAVE_KEY);
}
