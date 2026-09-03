// @ts-check
/**
 * Room-local exploration: fog of war, cell content, and per-step ambush rolls.
 *
 * A room's tile has exactly one DOOR cell, which doubles as both the party's spawn point and
 * the room's only exit — there is nothing to author per room, no separate "exits" list. The
 * party spawns standing on it; the first step necessarily moves away, and only a deliberate
 * step back onto it, later, means "leave this room." `enterRoom` seeds that spawn directly
 * rather than going through `stepInto`, so the door can never ambush the party on arrival.
 */

import {
  DOOR, isPassable, cellAt, neighbours, reachable, floorCells,
} from './grid.js';

/** @typedef {import('./rng.js').Rng} Rng */
/** @typedef {import('./grid.js').Tile} Tile */
/** @typedef {import('./entities.js').Actor} Actor */
/** @typedef {import('./corruption.js').CorruptionTheme} CorruptionTheme */

/**
 * @typedef {object} CellContent
 * @property {'trap' | 'treasure'} kind
 * @property {number} severity
 */

/**
 * @typedef {object} Fog
 * @property {Set<string>} revealed        Cells whose geometry is known.
 * @property {Set<string>} contentKnown    Cells whose content is sensed but not yet visited.
 * @property {Map<string, CellContent>} cellContent   Unresolved content, keyed by "x,y".
 * @property {Set<string>} visitedCells    Cells the party has actually stood on.
 * @property {{x: number, y: number}} partyCell
 * @property {boolean} ambushSpent   At most one ambush per room (v1) — see docs/design/balance.md.
 */

const key = (x, y) => `${x},${y}`;
const cellKey = (c) => key(c.x, c.y);

/** Chance a given non-door floor cell holds trap/treasure content, rolled once at room entry. */
export const CONTENT_CELL_CHANCE = 0.12;

/** Base chance per newly-visited cell that an ambush fires, before intensity scales it. */
export const BASE_AMBUSH_CHANCE = 0.08;

/** Hard ceiling so no single step is a certain ambush, however high the intensity climbs. */
export const MAX_AMBUSH_CHANCE = 0.5;

/** @param {number} intensity */
export const ambushChance = (intensity) => Math.min(MAX_AMBUSH_CHANCE, BASE_AMBUSH_CHANCE * intensity);

/**
 * Reveal radius from the party's average Initiative — passive scouting, no player action and
 * no new resource, per the design brief. One radius drives both geometry and content-sensing;
 * splitting them into separate ranges is a clean follow-up, not needed for v1.
 *
 * @param {Actor[]} party
 * @returns {number}
 */
export function revealRadius(party) {
  const alive = party.filter((h) => h.alive);
  if (alive.length === 0) return 1;
  const avgInit = alive.reduce((sum, h) => sum + h.canon.init, 0) / alive.length;
  return Math.min(4, Math.max(1, 1 + Math.floor((avgInit - 3) / 2)));
}

/**
 * Find the tile's one door cell. Every authored room tile has exactly one; content validation
 * (`content.js`) is the right place to enforce that, this just fails loudly if it's ever wrong.
 * @param {Tile} tile
 */
export function findDoor(tile) {
  for (let y = 0; y < tile.h; y++) {
    for (let x = 0; x < tile.w; x++) {
      if (cellAt(tile, x, y) === DOOR) return { x, y };
    }
  }
  throw new Error(`tile "${tile.id}" has no door cell`);
}

/**
 * Reveal geometry and sensed content around the party's current position.
 * @param {Tile} tile
 * @param {Fog} fog
 * @param {Actor[]} party
 */
export function revealAround(tile, fog, party) {
  const radius = revealRadius(party);
  const cells = reachable(tile, fog.partyCell, radius);
  for (const k of cells.keys()) {
    fog.revealed.add(k);
    if (fog.cellContent.has(k)) fog.contentKnown.add(k);
  }
}

/**
 * Scatter trap/treasure content across a room's floor at entry time. The door and its immediate
 * neighbours are excluded so the spawn point is always safe.
 *
 * @param {Tile} tile
 * @param {Rng} rng
 * @param {number} depthRatio   0 at the entrance, 1 at the objective — mirrors the severity
 *                              formula the old room-level trap/treasure encounters used.
 * @returns {Map<string, CellContent>}
 */
export function placeCellContent(tile, rng, depthRatio) {
  const door = findDoor(tile);
  const excluded = new Set([cellKey(door), ...neighbours(door.x, door.y).map(cellKey)]);
  const severity = 1 + Math.round(depthRatio * 2);

  /** @type {Map<string, CellContent>} */
  const content = new Map();
  for (const cell of floorCells(tile)) {
    const k = cellKey(cell);
    if (excluded.has(k) || rng.next() >= CONTENT_CELL_CHANCE) continue;
    content.set(k, { kind: rng.next() < 0.5 ? 'trap' : 'treasure', severity });
  }
  return content;
}

/**
 * Begin exploring a room: spawn the party on the door, scatter content, and reveal the starting
 * neighbourhood. Not a `stepInto` call — this is initialization, so the door cell is pre-seeded
 * into `visitedCells` and can never ambush the party the moment they walk back onto it.
 *
 * @param {Tile} tile
 * @param {Rng} rng
 * @param {object} args
 * @param {number} args.depthRatio
 * @param {Actor[]} args.party
 * @returns {Fog}
 */
export function enterRoom(tile, rng, { depthRatio, party }) {
  const door = findDoor(tile);
  /** @type {Fog} */
  const fog = {
    revealed: new Set(),
    contentKnown: new Set(),
    cellContent: placeCellContent(tile, rng, depthRatio),
    visitedCells: new Set([cellKey(door)]),
    partyCell: door,
    ambushSpent: false,
  };
  revealAround(tile, fog, party);
  return fog;
}

/**
 * Cells the party may step to right now: passable 4-way neighbours of their current cell.
 * These are always already revealed — `revealRadius` is never less than 1, and revealing runs
 * every time the party moves, so a cell's neighbours are known the instant it's stood on.
 *
 * @param {Tile} tile
 * @param {Fog} fog
 * @returns {{x: number, y: number}[]}
 */
export function stepOptions(tile, fog) {
  return neighbours(fog.partyCell.x, fog.partyCell.y).filter((c) => isPassable(tile, c.x, c.y));
}

/**
 * @typedef {
 *   { kind: 'move' } |
 *   { kind: 'ambush', theme?: CorruptionTheme } |
 *   { kind: 'trap' | 'treasure', severity: number } |
 *   { kind: 'exit' }
 * } StepResult
 */

/**
 * Move the party onto `cell` and resolve whatever is there.
 *
 * Order is deliberate: an ambush interrupts before content resolves — you don't calmly open a
 * chest while something is already closing in — and only a cell the party has never stood on
 * can ambush at all, which is what keeps a re-trodden room quiet and makes the door safe to
 * step back onto (it was visited at `enterRoom`, so it never reaches the ambush check).
 *
 * Caller (`state.js`) is expected to have already validated `cell` is a legal step via
 * `stepOptions`; this function does not re-check adjacency, so it stays usable for tests and
 * for restoring a session onto an already-computed cell without re-deriving legality.
 *
 * @param {Tile} tile
 * @param {Fog} fog
 * @param {Rng} rng
 * @param {object} args
 * @param {{x: number, y: number}} args.cell
 * @param {Actor[]} args.party
 * @param {number} args.intensity
 * @returns {StepResult}
 */
export function stepInto(tile, fog, rng, { cell, party, intensity }) {
  const k = cellKey(cell);
  const firstVisit = !fog.visitedCells.has(k);

  fog.partyCell = cell;
  fog.visitedCells.add(k);
  revealAround(tile, fog, party);

  if (firstVisit && !fog.ambushSpent && rng.next() < ambushChance(intensity)) {
    fog.ambushSpent = true;
    return { kind: 'ambush' };
  }

  const content = fog.cellContent.get(k);
  if (content) {
    fog.cellContent.delete(k);
    fog.contentKnown.delete(k);
    return { kind: content.kind, severity: content.severity };
  }

  if (cellAt(tile, cell.x, cell.y) === DOOR) return { kind: 'exit' };

  return { kind: 'move' };
}
