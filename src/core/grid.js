// @ts-check
/**
 * Tile geometry: the small grid a single room occupies during combat and exploration.
 * Pure functions over cell codes; nothing here knows about rendering.
 */

export const WALL = '#';
export const FLOOR = '.';
export const DOOR = '+';
export const HAZARD = '~';

/** Cells a creature may stand on. */
const PASSABLE = new Set([FLOOR, DOOR, HAZARD]);

/**
 * @typedef {object} Tile
 * @property {string} id
 * @property {number} w
 * @property {number} h
 * @property {string[]} cells  One string per row.
 * @property {string} kind
 */

/** @param {Tile} tile @param {number} x @param {number} y */
export function cellAt(tile, x, y) {
  if (y < 0 || y >= tile.h || x < 0 || x >= tile.w) return WALL;
  return tile.cells[y][x] ?? WALL;
}

/** @param {Tile} tile @param {number} x @param {number} y */
export const isPassable = (tile, x, y) => PASSABLE.has(cellAt(tile, x, y));

/**
 * Four-way neighbours. Diagonal movement is deliberately excluded: it keeps distance
 * intuitive on a phone-sized board and avoids corner-cutting rules.
 * @param {number} x @param {number} y
 */
export function neighbours(x, y) {
  return [
    { x, y: y - 1 }, { x: x + 1, y }, { x, y: y + 1 }, { x: x - 1, y },
  ];
}

/** Manhattan distance, matching the four-way movement rule. */
export const distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/** @param {{x:number,y:number}} a @param {{x:number,y:number}} b */
export const isAdjacent = (a, b) => distance(a, b) === 1;

/** @param {{x:number,y:number}} a @param {{x:number,y:number}} b */
export const samePosition = (a, b) => a.x === b.x && a.y === b.y;

/**
 * Breadth-first walk outward from a start cell, respecting walls and occupied cells.
 * Returns a map of "x,y" -> steps, used for both movement range and pathing.
 *
 * @param {Tile} tile
 * @param {{x:number,y:number}} start
 * @param {number} maxSteps
 * @param {Set<string>} [blocked]  Cells occupied by other creatures.
 * @returns {Map<string, number>}
 */
export function reachable(tile, start, maxSteps, blocked = new Set()) {
  const key = (x, y) => `${x},${y}`;
  const seen = new Map([[key(start.x, start.y), 0]]);
  let frontier = [start];

  for (let step = 1; step <= maxSteps; step++) {
    /** @type {{x:number,y:number}[]} */
    const next = [];
    for (const cell of frontier) {
      for (const n of neighbours(cell.x, cell.y)) {
        const k = key(n.x, n.y);
        if (seen.has(k) || !isPassable(tile, n.x, n.y) || blocked.has(k)) continue;
        seen.set(k, step);
        next.push(n);
      }
    }
    if (next.length === 0) break;
    frontier = next;
  }
  return seen;
}

/**
 * Shortest path between two cells, or null when unreachable. The goal itself may be occupied
 * (you path *to* an enemy), so it is exempt from the blocked set.
 *
 * @param {Tile} tile
 * @param {{x:number,y:number}} from
 * @param {{x:number,y:number}} to
 * @param {Set<string>} [blocked]
 * @returns {{x:number,y:number}[] | null}
 */
export function findPath(tile, from, to, blocked = new Set()) {
  const key = (x, y) => `${x},${y}`;
  const goal = key(to.x, to.y);
  if (!isPassable(tile, to.x, to.y)) return null;

  const cameFrom = new Map([[key(from.x, from.y), null]]);
  let frontier = [from];

  while (frontier.length) {
    /** @type {{x:number,y:number}[]} */
    const next = [];
    for (const cell of frontier) {
      for (const n of neighbours(cell.x, cell.y)) {
        const k = key(n.x, n.y);
        if (cameFrom.has(k) || !isPassable(tile, n.x, n.y)) continue;
        if (blocked.has(k) && k !== goal) continue;
        cameFrom.set(k, cell);
        if (k === goal) {
          const path = [];
          let cursor = /** @type {any} */ (n);
          let cursorKey = k;
          while (cursor) {
            path.unshift(cursor);
            cursor = cameFrom.get(cursorKey);
            if (cursor) cursorKey = key(cursor.x, cursor.y);
          }
          return path.slice(1);
        }
        next.push(n);
      }
    }
    frontier = next;
  }
  return null;
}

/**
 * Line of sight by Bresenham. Walls block; creatures do not, so ranged attacks can shoot
 * past allies. That is a deliberate simplification for a phone-sized board.
 *
 * @param {Tile} tile
 * @param {{x:number,y:number}} from
 * @param {{x:number,y:number}} to
 */
export function hasLineOfSight(tile, from, to) {
  let { x: x0, y: y0 } = from;
  const { x: x1, y: y1 } = to;
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;

  while (!(x0 === x1 && y0 === y1)) {
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
    if (x0 === x1 && y0 === y1) break;
    if (cellAt(tile, x0, y0) === WALL) return false;
  }
  return true;
}

/**
 * All passable cells, in a stable order. Used to place creatures deterministically.
 * @param {Tile} tile
 */
export function floorCells(tile) {
  const out = [];
  for (let y = 0; y < tile.h; y++) {
    for (let x = 0; x < tile.w; x++) {
      if (isPassable(tile, x, y)) out.push({ x, y });
    }
  }
  return out;
}
