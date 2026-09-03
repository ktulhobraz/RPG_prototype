// @ts-check
/** Room-local exploration: fog, cell content, a separate runtime exit, and ambush rolls. */

import { DOOR, isPassable, cellAt, neighbours, reachable, floorCells } from './grid.js';

/** @typedef {import('./rng.js').Rng} Rng */
/** @typedef {import('./grid.js').Tile} Tile */
/** @typedef {import('./entities.js').Actor} Actor */
/** @typedef {import('./corruption.js').CorruptionTheme} CorruptionTheme */

/** @typedef {{kind:'trap'|'treasure', severity:number}} CellContent */
/**
 * @typedef {object} Fog
 * @property {Set<string>} revealed
 * @property {Set<string>} contentKnown
 * @property {Map<string, CellContent>} cellContent
 * @property {Set<string>} visitedCells
 * @property {{x:number,y:number}} partyCell
 * @property {{x:number,y:number}} exitCell
 * @property {boolean} ambushSpent
 */

const key = (x, y) => `${x},${y}`;
const cellKey = (c) => key(c.x, c.y);

export const CONTENT_CELL_CHANCE = 0.12;
export const BASE_AMBUSH_CHANCE = 0.08;
export const MAX_AMBUSH_CHANCE = 0.5;
export const ambushChance = (intensity) => Math.min(MAX_AMBUSH_CHANCE, BASE_AMBUSH_CHANCE * intensity);

/** @param {Actor[]} party */
export function revealRadius(party) {
  const alive = party.filter((h) => h.alive);
  if (alive.length === 0) return 1;
  const avgInit = alive.reduce((sum, h) => sum + h.canon.init, 0) / alive.length;
  return Math.min(4, Math.max(1, 1 + Math.floor((avgInit - 3) / 2)));
}

/** @param {Tile} tile */
export function findDoor(tile) {
  for (let y = 0; y < tile.h; y++) {
    for (let x = 0; x < tile.w; x++) {
      if (cellAt(tile, x, y) === DOOR) return { x, y };
    }
  }
  throw new Error(`tile "${tile.id}" has no door cell`);
}

/**
 * Pick a deterministic-but-seeded exit away from the entrance. Only the farthest 40% of
 * reachable cells are candidates, preventing the next-room exit from spawning beside the party.
 * @param {Tile} tile @param {Rng} rng
 */
export function chooseExitCell(tile, rng) {
  const door = findDoor(tile);
  const distances = reachable(tile, door, tile.w * tile.h);
  const candidates = floorCells(tile)
    .filter((c) => cellAt(tile, c.x, c.y) !== DOOR)
    .map((c) => ({ cell: c, distance: distances.get(cellKey(c)) ?? -1 }))
    .filter((entry) => entry.distance > 0);
  if (!candidates.length) throw new Error(`tile "${tile.id}" has no valid exit cell`);
  const maxDistance = Math.max(...candidates.map((entry) => entry.distance));
  const threshold = Math.max(2, Math.ceil(maxDistance * 0.6));
  const far = candidates.filter((entry) => entry.distance >= threshold).map((entry) => entry.cell);
  return rng.pick(far.length ? far : candidates.map((entry) => entry.cell));
}

/** @param {Tile} tile @param {Fog} fog @param {Actor[]} party */
export function revealAround(tile, fog, party) {
  const radius = revealRadius(party);
  const cells = reachable(tile, fog.partyCell, radius);
  for (const k of cells.keys()) {
    fog.revealed.add(k);
    if (fog.cellContent.has(k)) fog.contentKnown.add(k);
  }
}

/**
 * @param {Tile} tile @param {Rng} rng @param {number} depthRatio
 * @param {Set<string>} [extraExcluded]
 * @returns {Map<string, CellContent>}
 */
export function placeCellContent(tile, rng, depthRatio, extraExcluded = new Set()) {
  const door = findDoor(tile);
  const excluded = new Set([
    cellKey(door), ...neighbours(door.x, door.y).map(cellKey), ...extraExcluded,
  ]);
  const severity = 1 + Math.round(depthRatio * 2);
  const content = new Map();
  for (const cell of floorCells(tile)) {
    const k = cellKey(cell);
    if (excluded.has(k) || rng.next() >= CONTENT_CELL_CHANCE) continue;
    content.set(k, { kind: rng.next() < 0.5 ? 'trap' : 'treasure', severity });
  }
  return content;
}

/** @param {Tile} tile @param {Rng} rng @param {{depthRatio:number,party:Actor[]}} args */
export function enterRoom(tile, rng, { depthRatio, party }) {
  const door = findDoor(tile);
  const exitCell = chooseExitCell(tile, rng);
  const fog = {
    revealed: new Set(),
    contentKnown: new Set(),
    cellContent: placeCellContent(tile, rng, depthRatio, new Set([cellKey(exitCell)])),
    visitedCells: new Set([cellKey(door)]),
    partyCell: door,
    exitCell,
    ambushSpent: false,
  };
  revealAround(tile, fog, party);
  return fog;
}

/** @param {Tile} tile @param {Fog} fog */
export function stepOptions(tile, fog) {
  return neighbours(fog.partyCell.x, fog.partyCell.y).filter((c) => isPassable(tile, c.x, c.y));
}

/** @typedef {{kind:'move'}|{kind:'ambush',theme?:CorruptionTheme}|{kind:'trap'|'treasure',severity:number}|{kind:'exit'}} StepResult */

/**
 * The runtime exit is resolved before ambush/content, making the staircase itself safe. All
 * other newly visited cells retain the existing ambush-before-content ordering.
 * @param {Tile} tile @param {Fog} fog @param {Rng} rng
 * @param {{cell:{x:number,y:number},party:Actor[],intensity:number}} args
 * @returns {StepResult}
 */
export function stepInto(tile, fog, rng, { cell, party, intensity }) {
  const k = cellKey(cell);
  const firstVisit = !fog.visitedCells.has(k);
  fog.partyCell = cell;
  fog.visitedCells.add(k);
  revealAround(tile, fog, party);

  if (cell.x === fog.exitCell.x && cell.y === fog.exitCell.y) return { kind: 'exit' };

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
  return { kind: 'move' };
}
