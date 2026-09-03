// @ts-check
/**
 * Dungeon assembly from an authored tile deck.
 *
 * The delve is a chain of rooms drawn from a shuffled deck and capped by the objective room.
 * Generation is deliberately not procedural (D-05): tiles are hand-made, only their order and
 * contents vary. That keeps every room readable on a phone while still varying a run.
 */

import { floorCells, isPassable } from './grid.js';
import { rollCorruption, rollEncounterSpawns } from './corruption.js';

/** @typedef {import('./rng.js').Rng} Rng */
/** @typedef {import('./grid.js').Tile} Tile */
/** @typedef {import('./corruption.js').Corruption} Corruption */
/** @typedef {import('./corruption.js').CorruptionTheme} CorruptionTheme */

/**
 * @typedef {object} Encounter
 * @property {'empty' | 'exploring' | 'boss'} kind   'exploring': a middle room walked cell by
 *   cell; its ambush (if any) and its trap/treasure are per-cell content on `Room.fog`, not
 *   pre-rolled here. 'boss' keeps its `spawns`, guaranteed and placed fresh on room entry.
 * @property {{ id: string, count: number }[]} [spawns]
 */

/**
 * @typedef {object} Room
 * @property {number} index
 * @property {Tile} tile
 * @property {string} name
 * @property {Encounter} encounter
 * @property {boolean} cleared    For a middle room: false only while an in-place ambush fight
 *   is active in it. For the objective: false until the boss falls.
 * @property {boolean} visited
 * @property {import('./exploration.js').Fog | null} fog   Null until the party actually walks
 *   into this room — fog depends on the live party (Initiative-driven reveal radius), so it
 *   can't be built at generation time the way the rest of the room can.
 * @property {boolean} [forceAmbush]   Set at runtime by a "spawn" event on the room ahead;
 *   guarantees that room's ambush fires the moment it's entered, pre-empting the usual per-step
 *   roll rather than stacking on top of it.
 */

/**
 * @typedef {object} Dungeon
 * @property {string} seed
 * @property {Room[]} rooms
 * @property {number} current
 * @property {number} depth
 * @property {Corruption} corruption   Fixed for the whole delve; see corruption.js.
 */

/**
 * A room's position in the delve as a 0 (entrance) to 1 (objective) ratio — the same formula
 * that used to be computed inline during generation, exposed so exploration code can derive it
 * for a room it's resolving live (ambush size, cell-content severity) without the caller having
 * to know how the deck was built.
 *
 * @param {Room} room
 * @param {Dungeon} dungeon
 * @returns {number}
 */
export const depthRatioOf = (room, dungeon) => room.index / (dungeon.depth - 1);

/**
 * @param {object} args
 * @param {any[]} args.rooms      Room tile records from data.
 * @param {any[]} args.monsters   Monster records from data.
 * @param {CorruptionTheme[]} args.corruptions   Corruption theme records from data.
 * @param {Rng} args.rng
 * @param {number} [args.depth]   Number of rooms including entrance and objective.
 * @param {number} [args.partySize]
 * @returns {Dungeon}
 */
export function createDungeon({ rooms, monsters, corruptions, rng, depth = 8, partySize = 4 }) {
  const corruption = rollCorruption(rng, corruptions);
  const theme = corruptions.find((t) => t.id === corruption.themeId);

  const entranceTile = rooms.find((r) => r.kind === 'entrance');
  const objectiveTile = rooms.find((r) => r.kind === 'objective');
  if (!entranceTile || !objectiveTile) {
    throw new Error('room deck must contain an "entrance" and an "objective" tile');
  }
  const middleDeck = rooms.filter((r) => r.kind !== 'entrance' && r.kind !== 'objective');
  if (middleDeck.length === 0) throw new Error('room deck has no middle rooms');

  const boss = monsters.find((m) => m.role === 'boss') ?? monsters[monsters.length - 1];
  const middleCount = Math.max(1, depth - 2);

  // Draw without replacement while the deck lasts, then allow repeats. This keeps short delves
  // varied without capping depth at the deck size.
  /** @type {any[]} */
  const drawn = [];
  let bag = rng.shuffle(middleDeck);
  for (let i = 0; i < middleCount; i++) {
    if (bag.length === 0) bag = rng.shuffle(middleDeck);
    drawn.push(bag.pop());
  }

  /** @type {Room[]} */
  const built = [];

  built.push({
    index: 0,
    tile: entranceTile,
    name: entranceTile.name,
    encounter: { kind: 'empty' },
    cleared: true,
    visited: true,
    fog: null,
  });

  // Middle rooms carry nothing pre-rolled: whether anything happens here, and what, is decided
  // step by step as the party actually walks the tile (see exploration.js). `cleared` starts
  // true — nothing blocks the door a priori — and only drops while an ambush fight is live.
  drawn.forEach((tile) => {
    built.push({
      index: built.length,
      tile,
      name: tile.name,
      encounter: { kind: 'exploring' },
      cleared: true,
      visited: false,
      fog: null,
    });
  });

  built.push({
    index: built.length,
    tile: objectiveTile,
    name: objectiveTile.name,
    encounter: {
      kind: 'boss',
      spawns: [
        { id: boss.id, count: 1 },
        // A small escort only. The boss should be the fight; a full second encounter stacked on
        // top of it just ends delves that were otherwise going well. Themed like everything
        // else in this delve, so the escort doesn't clash with what led up to it.
        ...rollEncounterSpawns(monsters, rng, {
          depthRatio: 0.4, partySize: 1, intensity: corruption.intensity, theme,
        }),
      ],
    },
    cleared: false,
    visited: false,
    fog: null,
  });

  return {
    seed: String(rng.state()), rooms: built, current: 0, depth: built.length, corruption,
  };
}

/** @param {Dungeon} dungeon */
export const currentRoom = (dungeon) => dungeon.rooms[dungeon.current];

/** @param {Dungeon} dungeon */
export const isLastRoom = (dungeon) => dungeon.current >= dungeon.rooms.length - 1;

/**
 * Advance to the next room. Refuses to move on while the current room is uncleared — in
 * practice, only while an in-place ambush fight is live in it (`state.js`'s `step` never calls
 * this mid-fight anyway, since crossing the door is only reachable from phase 'explore', but
 * the guard stays as the source of truth).
 * @param {Dungeon} dungeon
 * @returns {boolean} whether the party moved.
 */
export function advance(dungeon) {
  if (isLastRoom(dungeon)) return false;
  if (!currentRoom(dungeon).cleared) return false;
  dungeon.current += 1;
  currentRoom(dungeon).visited = true;
  return true;
}

/**
 * Deterministic starting cells for a group entering a room: nearest passable floor to the door,
 * spreading outward. Deterministic ordering matters — the same seed must lay out the same fight.
 *
 * @param {Tile} tile
 * @param {number} count
 * @param {'near' | 'far'} anchor
 * @param {Set<string>} [taken]
 */
export function entryCells(tile, count, anchor, taken = new Set()) {
  const cells = floorCells(tile).filter((c) => !taken.has(`${c.x},${c.y}`));
  const doorX = Math.floor(tile.w / 2);
  const doorY = anchor === 'near' ? 0 : tile.h - 1;
  const sorted = cells
    .map((c) => ({ c, d: Math.abs(c.x - doorX) + Math.abs(c.y - doorY) }))
    .sort((a, b) => a.d - b.d || a.c.y - b.c.y || a.c.x - b.c.x)
    .map((entry) => entry.c);
  return sorted.slice(0, count);
}

/**
 * Sanity check used by tests and by generation: every floor cell must be reachable from the
 * party's entry point, or a room could strand creatures where they can never be fought.
 * @param {Tile} tile
 */
export function isTileConnected(tile) {
  const cells = floorCells(tile);
  if (cells.length === 0) return false;
  const key = (c) => `${c.x},${c.y}`;
  const seen = new Set([key(cells[0])]);
  const queue = [cells[0]];
  while (queue.length) {
    const cell = queue.shift();
    for (const n of [
      { x: cell.x + 1, y: cell.y }, { x: cell.x - 1, y: cell.y },
      { x: cell.x, y: cell.y + 1 }, { x: cell.x, y: cell.y - 1 },
    ]) {
      const k = key(n);
      if (seen.has(k) || !isPassable(tile, n.x, n.y)) continue;
      seen.add(k);
      queue.push(n);
    }
  }
  return seen.size === cells.length;
}
