import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cellAt, isPassable, distance, isAdjacent, reachable, findPath, hasLineOfSight, floorCells, WALL,
} from '../src/core/grid.js';

/** A small room with a wall stub jutting in from the top. */
const tile = {
  id: 'test', w: 5, h: 5, kind: 'room',
  cells: [
    '#####',
    '#...#',
    '#.#.#',
    '#...#',
    '#####',
  ],
};

test('cells outside the tile read as wall', () => {
  assert.equal(cellAt(tile, -1, 0), WALL);
  assert.equal(cellAt(tile, 0, -1), WALL);
  assert.equal(cellAt(tile, 99, 99), WALL);
  assert.equal(cellAt(tile, 1, 1), '.');
});

test('walls are not passable', () => {
  assert.equal(isPassable(tile, 1, 1), true);
  assert.equal(isPassable(tile, 2, 2), false);
  assert.equal(isPassable(tile, 0, 0), false);
});

test('distance is manhattan, matching four-way movement', () => {
  assert.equal(distance({ x: 1, y: 1 }, { x: 3, y: 3 }), 4);
  assert.equal(isAdjacent({ x: 1, y: 1 }, { x: 1, y: 2 }), true);
  // Diagonals are deliberately not adjacent.
  assert.equal(isAdjacent({ x: 1, y: 1 }, { x: 2, y: 2 }), false);
});

test('reachable respects walls, budget and occupied cells', () => {
  const near = reachable(tile, { x: 1, y: 1 }, 1);
  assert.equal(near.get('1,2'), 1);
  assert.equal(near.get('2,1'), 1);
  assert.equal(near.has('2,2'), false, 'cannot step into a wall');
  assert.equal(near.has('3,3'), false, 'beyond the movement budget');

  const blocked = reachable(tile, { x: 1, y: 1 }, 6, new Set(['1,2', '2,1']));
  assert.equal(blocked.size, 1, 'boxed in by occupied cells, only the start remains');
});

test('findPath routes around an obstruction and reports impossibility', () => {
  const path = findPath(tile, { x: 1, y: 1 }, { x: 3, y: 3 });
  assert.ok(path, 'a path should exist');
  assert.equal(path[path.length - 1].x, 3);
  assert.equal(path[path.length - 1].y, 3);
  // Four-way movement around the central pillar: four steps, never through it.
  assert.equal(path.length, 4);
  assert.ok(!path.some((c) => c.x === 2 && c.y === 2), 'must not path through the wall');

  assert.equal(findPath(tile, { x: 1, y: 1 }, { x: 2, y: 2 }), null, 'a wall is not a destination');
});

test('findPath may target an occupied cell but not route through one', () => {
  const goal = { x: 3, y: 1 };
  const blocked = new Set(['3,1']);
  const path = findPath(tile, { x: 1, y: 1 }, goal, blocked);
  assert.ok(path, 'you can path to an enemy standing in a cell');

  const walled = findPath(tile, { x: 1, y: 1 }, { x: 3, y: 3 }, new Set(['2,1', '1,2']));
  assert.equal(walled, null, 'every route blocked means no path');
});

test('line of sight is blocked by walls but not by distance alone', () => {
  assert.equal(hasLineOfSight(tile, { x: 1, y: 1 }, { x: 1, y: 3 }), true);
  assert.equal(hasLineOfSight(tile, { x: 1, y: 2 }, { x: 3, y: 2 }), false, 'the pillar blocks');
});

test('floorCells lists every passable cell in a stable order', () => {
  const cells = floorCells(tile);
  assert.equal(cells.length, 8, '3x3 interior minus the central pillar');
  const again = floorCells(tile);
  assert.deepEqual(cells, again, 'ordering must be deterministic');
  assert.deepEqual(cells[0], { x: 1, y: 1 }, 'reading order, top-left first');
});
