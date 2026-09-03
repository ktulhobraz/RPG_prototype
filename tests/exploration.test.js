import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/core/rng.js';
import { isPassable, neighbours } from '../src/core/grid.js';
import {
  findDoor, revealRadius, revealAround, placeCellContent, enterRoom, stepOptions, stepInto,
  ambushChance, BASE_AMBUSH_CHANCE, MAX_AMBUSH_CHANCE,
} from '../src/core/exploration.js';
import { loadTestContent } from './helpers.js';

const content = loadTestContent();
const objective = content.rooms.find((r) => r.kind === 'objective');
const middleTile = content.rooms.find((r) => r.kind === 'room') ?? content.rooms[1];

const party = (init) => [{ alive: true, canon: { init } }];

/** A rng stand-in whose `next()` is fixed, for forcing or forbidding a roll deterministically. */
const fixedRng = (value) => ({
  next: () => value, int: (a) => a, pick: (a) => a[0], shuffle: (a) => a, state: () => 0,
});

test('every authored room tile has exactly one door', () => {
  for (const tile of content.rooms) {
    const door = findDoor(tile);
    assert.equal(tile.cells[door.y][door.x], '+');
  }
});

test('revealRadius scales with average Initiative and stays clamped', () => {
  assert.equal(revealRadius(party(1)), 1);
  assert.equal(revealRadius(party(3)), 1);
  assert.equal(revealRadius(party(5)), 2);
  assert.equal(revealRadius(party(9)), 4, 'must not exceed the clamp even for very high init');
  assert.equal(revealRadius([]), 1, 'no living heroes must not throw or divide by zero');
  assert.equal(revealRadius([{ alive: false, canon: { init: 9 } }]), 1, 'the dead do not scout');
});

test('placeCellContent never touches the door or its neighbours', () => {
  const rng = createRng('content-safety');
  const door = findDoor(middleTile);
  const forbidden = new Set(
    [door, ...neighbours(door.x, door.y)].map((c) => `${c.x},${c.y}`),
  );
  for (let i = 0; i < 50; i++) {
    const cellContent = placeCellContent(middleTile, createRng(`safety-${i}`), 0.5);
    for (const key of cellContent.keys()) {
      assert.ok(!forbidden.has(key), `content placed on/near the door: ${key}`);
    }
  }
});

test('placeCellContent only ever produces trap or treasure', () => {
  const rng = createRng('content-kind');
  const cellContent = placeCellContent(objective, rng, 1);
  for (const entry of cellContent.values()) {
    assert.ok(entry.kind === 'trap' || entry.kind === 'treasure');
    assert.ok(entry.severity >= 1);
  }
});

test('enterRoom spawns the party on the door with it pre-visited', () => {
  const rng = createRng('enter');
  const fog = enterRoom(middleTile, rng, { depthRatio: 0.3, party: party(3) });
  const door = findDoor(middleTile);
  assert.deepEqual(fog.partyCell, door);
  assert.ok(fog.visitedCells.has(`${door.x},${door.y}`));
  assert.ok(fog.revealed.has(`${door.x},${door.y}`));
  assert.equal(fog.ambushSpent, false);
});

test('revealAround only reveals cells reachable through passable terrain', () => {
  const rng = createRng('reveal');
  const fog = enterRoom(middleTile, rng, { depthRatio: 0, party: party(3) });
  for (const key of fog.revealed) {
    const [x, y] = key.split(',').map(Number);
    assert.ok(isPassable(middleTile, x, y), `revealed a non-passable cell: ${key}`);
  }
});

test('stepOptions returns only passable neighbours of the current cell', () => {
  const rng = createRng('options');
  const fog = enterRoom(middleTile, rng, { depthRatio: 0, party: party(3) });
  const options = stepOptions(middleTile, fog);
  assert.ok(options.length > 0, 'a door cell must have at least one passable neighbour');
  for (const cell of options) {
    assert.ok(isPassable(middleTile, cell.x, cell.y));
  }
});

test('ambushChance scales with intensity and is capped', () => {
  assert.equal(ambushChance(1), BASE_AMBUSH_CHANCE);
  assert.equal(ambushChance(0), 0);
  assert.ok(ambushChance(100) <= MAX_AMBUSH_CHANCE);
});

test('stepInto never ambushes on the door, even with a guaranteed-ambush roll', () => {
  const rng = createRng('door-safe');
  const fog = enterRoom(middleTile, rng, { depthRatio: 0, party: party(3) });
  const door = findDoor(middleTile);
  // Force a move away and back so the "exit" branch is exercised, using a rng that would
  // ambush on any *new* cell (next() always 0, which beats any positive chance).
  const away = stepOptions(middleTile, fog)[0];
  stepInto(middleTile, fog, fixedRng(0), { cell: away, party: party(3), intensity: 1 });
  const result = stepInto(middleTile, fog, fixedRng(0), { cell: door, party: party(3), intensity: 1 });
  assert.deepEqual(result, { kind: 'exit' });
});

test('a first visit can ambush; the same cell revisited cannot', () => {
  const rng = createRng('ambush-once');
  const fog = enterRoom(middleTile, rng, { depthRatio: 0, party: party(3) });
  const target = stepOptions(middleTile, fog)[0];

  const first = stepInto(middleTile, fog, fixedRng(0), { cell: target, party: party(3), intensity: 1 });
  assert.deepEqual(first, { kind: 'ambush' });
  assert.equal(fog.ambushSpent, true);

  // Move elsewhere and back — even a guaranteed-ambush roll must not fire twice.
  const elsewhere = stepOptions(middleTile, fog).find(
    (c) => `${c.x},${c.y}` !== `${target.x},${target.y}`,
  ) ?? target;
  if (`${elsewhere.x},${elsewhere.y}` !== `${target.x},${target.y}`) {
    stepInto(middleTile, fog, fixedRng(0), { cell: elsewhere, party: party(3), intensity: 1 });
  }
  const second = stepInto(middleTile, fog, fixedRng(0), { cell: target, party: party(3), intensity: 1 });
  assert.notEqual(second.kind, 'ambush', 'a re-trodden cell must never re-roll an ambush');
});

test('an ambush pre-empts content — the content survives for a later visit', () => {
  // Build a fog with known content by hand, so the test does not depend on the random layout.
  const rng = createRng('ambush-vs-content');
  const fog = enterRoom(middleTile, rng, { depthRatio: 0, party: party(3) });
  const target = stepOptions(middleTile, fog)[0];
  const key = `${target.x},${target.y}`;
  fog.cellContent.set(key, { kind: 'treasure', severity: 2 });

  const result = stepInto(middleTile, fog, fixedRng(0), { cell: target, party: party(3), intensity: 1 });
  assert.deepEqual(result, { kind: 'ambush' });
  assert.ok(fog.cellContent.has(key), 'content must not be consumed when an ambush interrupts it');
});

test('with intensity 0, an unvisited cell never ambushes and content resolves normally', () => {
  const rng = createRng('no-ambush');
  const fog = enterRoom(middleTile, rng, { depthRatio: 0, party: party(3) });
  const target = stepOptions(middleTile, fog)[0];
  const key = `${target.x},${target.y}`;
  fog.cellContent.set(key, { kind: 'trap', severity: 3 });

  const result = stepInto(middleTile, fog, fixedRng(0), { cell: target, party: party(3), intensity: 0 });
  assert.deepEqual(result, { kind: 'trap', severity: 3 });
  assert.ok(!fog.cellContent.has(key), 'resolved content is consumed');
});

test('stepping onto a plain cell with nothing there reports "move"', () => {
  const rng = createRng('plain-move');
  const fog = enterRoom(middleTile, rng, { depthRatio: 0, party: party(3) });
  const target = stepOptions(middleTile, fog)[0];
  fog.cellContent.delete(`${target.x},${target.y}`);

  const result = stepInto(middleTile, fog, fixedRng(1), { cell: target, party: party(3), intensity: 1 });
  assert.deepEqual(result, { kind: 'move' });
});
