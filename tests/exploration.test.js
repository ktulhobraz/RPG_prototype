import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/core/rng.js';
import { isPassable, neighbours } from '../src/core/grid.js';
import {
  findDoor, chooseExitCell, revealRadius, revealAround, placeCellContent, enterRoom, stepOptions, stepInto,
  ambushChance, BASE_AMBUSH_CHANCE, MAX_AMBUSH_CHANCE,
} from '../src/core/exploration.js';
import { loadTestContent } from './helpers.js';

const content = loadTestContent();
const objective = content.rooms.find((r) => r.kind === 'objective');
const middleTile = content.rooms.find((r) => r.kind === 'room') ?? content.rooms[1];
const party = (init) => [{ alive: true, canon: { init } }];
const fixedRng = (value) => ({
  next: () => value, int: (a) => a, pick: (a) => a[0], shuffle: (a) => a, state: () => 0,
});

test('every authored room tile has exactly one entrance door', () => {
  for (const tile of content.rooms) {
    const door = findDoor(tile);
    assert.equal(tile.cells[door.y][door.x], '+');
  }
});

test('revealRadius scales with average Initiative and stays clamped', () => {
  assert.equal(revealRadius(party(1)), 1);
  assert.equal(revealRadius(party(3)), 1);
  assert.equal(revealRadius(party(5)), 2);
  assert.equal(revealRadius(party(9)), 4);
  assert.equal(revealRadius([]), 1);
  assert.equal(revealRadius([{ alive: false, canon: { init: 9 } }]), 1);
});

test('runtime exit is deterministic, passable and separate from the entrance', () => {
  const a = chooseExitCell(middleTile, createRng('exit-seed'));
  const b = chooseExitCell(middleTile, createRng('exit-seed'));
  const door = findDoor(middleTile);
  assert.deepEqual(a, b);
  assert.ok(isPassable(middleTile, a.x, a.y));
  assert.notDeepEqual(a, door);
  assert.ok(Math.abs(a.x - door.x) + Math.abs(a.y - door.y) >= 2, 'exit must not spawn beside entrance');
});

test('placeCellContent never touches the entrance door or its neighbours', () => {
  const door = findDoor(middleTile);
  const forbidden = new Set([door, ...neighbours(door.x, door.y)].map((c) => `${c.x},${c.y}`));
  for (let i = 0; i < 50; i++) {
    const cellContent = placeCellContent(middleTile, createRng(`safety-${i}`), 0.5);
    for (const key of cellContent.keys()) assert.ok(!forbidden.has(key));
  }
});

test('placeCellContent only ever produces trap or treasure', () => {
  const cellContent = placeCellContent(objective, createRng('content-kind'), 1);
  for (const entry of cellContent.values()) {
    assert.ok(entry.kind === 'trap' || entry.kind === 'treasure');
    assert.ok(entry.severity >= 1);
  }
});

test('enterRoom spawns at entrance and creates a safe separate exit', () => {
  const fog = enterRoom(middleTile, createRng('enter'), { depthRatio: 0.3, party: party(3) });
  const door = findDoor(middleTile);
  assert.deepEqual(fog.partyCell, door);
  assert.notDeepEqual(fog.exitCell, door);
  assert.ok(fog.visitedCells.has(`${door.x},${door.y}`));
  assert.ok(fog.revealed.has(`${door.x},${door.y}`));
  assert.ok(!fog.cellContent.has(`${fog.exitCell.x},${fog.exitCell.y}`));
  assert.equal(fog.ambushSpent, false);
});

test('revealAround only reveals reachable passable cells', () => {
  const fog = enterRoom(middleTile, createRng('reveal'), { depthRatio: 0, party: party(3) });
  for (const key of fog.revealed) {
    const [x, y] = key.split(',').map(Number);
    assert.ok(isPassable(middleTile, x, y));
  }
});

test('stepOptions returns only passable neighbours of the current cell', () => {
  const fog = enterRoom(middleTile, createRng('options'), { depthRatio: 0, party: party(3) });
  const options = stepOptions(middleTile, fog);
  assert.ok(options.length > 0);
  for (const cell of options) assert.ok(isPassable(middleTile, cell.x, cell.y));
});

test('ambushChance scales with intensity and is capped', () => {
  assert.equal(ambushChance(1), BASE_AMBUSH_CHANCE);
  assert.equal(ambushChance(0), 0);
  assert.ok(ambushChance(100) <= MAX_AMBUSH_CHANCE);
});

test('runtime exit resolves before ambush and content', () => {
  const fog = enterRoom(middleTile, createRng('exit-safe'), { depthRatio: 0, party: party(3) });
  const k = `${fog.exitCell.x},${fog.exitCell.y}`;
  fog.cellContent.set(k, { kind: 'trap', severity: 3 });
  const result = stepInto(middleTile, fog, fixedRng(0), {
    cell: fog.exitCell, party: party(3), intensity: 100,
  });
  assert.deepEqual(result, { kind: 'exit' });
  assert.equal(fog.ambushSpent, false);
});

test('a first visit can ambush; the same cell revisited cannot', () => {
  const fog = enterRoom(middleTile, createRng('ambush-once'), { depthRatio: 0, party: party(3) });
  const target = stepOptions(middleTile, fog)[0];
  const first = stepInto(middleTile, fog, fixedRng(0), { cell: target, party: party(3), intensity: 1 });
  assert.deepEqual(first, { kind: 'ambush' });
  assert.equal(fog.ambushSpent, true);
  const elsewhere = stepOptions(middleTile, fog).find((c) => `${c.x},${c.y}` !== `${target.x},${target.y}`) ?? target;
  if (`${elsewhere.x},${elsewhere.y}` !== `${target.x},${target.y}`) {
    stepInto(middleTile, fog, fixedRng(0), { cell: elsewhere, party: party(3), intensity: 1 });
  }
  const second = stepInto(middleTile, fog, fixedRng(0), { cell: target, party: party(3), intensity: 1 });
  assert.notEqual(second.kind, 'ambush');
});

test('an ambush pre-empts content and content survives for a later visit', () => {
  const fog = enterRoom(middleTile, createRng('ambush-vs-content'), { depthRatio: 0, party: party(3) });
  const target = stepOptions(middleTile, fog)[0];
  const k = `${target.x},${target.y}`;
  fog.cellContent.set(k, { kind: 'treasure', severity: 2 });
  const result = stepInto(middleTile, fog, fixedRng(0), { cell: target, party: party(3), intensity: 1 });
  assert.deepEqual(result, { kind: 'ambush' });
  assert.ok(fog.cellContent.has(k));
});

test('with intensity 0, content resolves normally', () => {
  const fog = enterRoom(middleTile, createRng('no-ambush'), { depthRatio: 0, party: party(3) });
  const target = stepOptions(middleTile, fog)[0];
  const k = `${target.x},${target.y}`;
  fog.cellContent.set(k, { kind: 'trap', severity: 3 });
  const result = stepInto(middleTile, fog, fixedRng(0), { cell: target, party: party(3), intensity: 0 });
  assert.deepEqual(result, { kind: 'trap', severity: 3 });
  assert.ok(!fog.cellContent.has(k));
});

test('stepping onto a plain cell reports move', () => {
  const fog = enterRoom(middleTile, createRng('plain-move'), { depthRatio: 0, party: party(3) });
  const target = stepOptions(middleTile, fog)[0];
  fog.cellContent.delete(`${target.x},${target.y}`);
  const result = stepInto(middleTile, fog, fixedRng(1), { cell: target, party: party(3), intensity: 1 });
  assert.deepEqual(result, { kind: 'move' });
});
