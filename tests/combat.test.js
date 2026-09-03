import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/core/rng.js';
import { RULES } from '../src/core/rules/index.js';
import { createActor } from '../src/core/entities.js';
import { distance } from '../src/core/grid.js';
import { createCombat, ambushCells, AMBUSH_MIN_DISTANCE, activeActor } from '../src/core/combat.js';
import { floorCells } from '../src/core/grid.js';
import { loadTestContent } from './helpers.js';

const content = loadTestContent();
const middleTile = content.rooms.find((r) => r.kind === 'room') ?? content.rooms[1];
const heroData = content.heroes[0];

test('ambushCells keeps every monster at least AMBUSH_MIN_DISTANCE from the party', () => {
  const partyCells = [{ x: 2, y: 2 }, { x: 3, y: 2 }];
  const cells = ambushCells(middleTile, 4, partyCells);
  assert.ok(cells.length > 0, 'expected at least one legal ambush cell in this tile');
  for (const cell of cells) {
    for (const p of partyCells) {
      assert.ok(distance(p, cell) >= AMBUSH_MIN_DISTANCE,
        `ambush cell ${cell.x},${cell.y} is only ${distance(p, cell)} from the party`);
    }
  }
});

test('ambushCells never reuses an occupied cell', () => {
  const partyCells = [{ x: 1, y: 1 }];
  const occupied = new Set(['4,2', '4,3']);
  const cells = ambushCells(middleTile, 5, partyCells, occupied);
  for (const cell of cells) {
    assert.ok(!occupied.has(`${cell.x},${cell.y}`), 'reused an occupied cell');
  }
});

test('ambushCells placement is deterministic for a given board state', () => {
  const partyCells = [{ x: 2, y: 2 }];
  const first = ambushCells(middleTile, 3, partyCells);
  const second = ambushCells(middleTile, 3, partyCells);
  assert.deepEqual(first, second);
});

test("createCombat placement:'entry' (default) still places heroes freshly, unchanged", () => {
  const party = [createActor(heroData, RULES, { side: 'hero', id: 'h1' })];
  party[0].x = 99;
  party[0].y = 99; // garbage position from a previous fight — 'entry' must overwrite it
  const combat = createCombat({
    tile: middleTile, party, spawns: [{ id: content.monsters[0].id, count: 1 }],
    monsterData: content.monsters, rules: RULES, rng: createRng('entry'),
  });
  assert.notEqual(`${party[0].x},${party[0].y}`, '99,99', "'entry' must reposition heroes");
});

test("createCombat placement:'inPlace' leaves heroes exactly where they stood", () => {
  const party = [createActor(heroData, RULES, { side: 'hero', id: 'h1' })];
  party[0].x = 3;
  party[0].y = 2;
  const combat = createCombat({
    tile: middleTile, party, spawns: [{ id: content.monsters[0].id, count: 1 }],
    monsterData: content.monsters, rules: RULES, rng: createRng('ambush'), placement: 'inPlace',
  });
  assert.equal(party[0].x, 3);
  assert.equal(party[0].y, 2);
  const monster = combat.actors.find((a) => a.side === 'monster');
  assert.ok(monster, 'the ambushing monster must be placed');
  assert.ok(distance(party[0], monster) >= AMBUSH_MIN_DISTANCE,
    'an in-place ambush must not spawn a monster already adjacent to the party');
});

test("createCombat placement:'inPlace' fans a party sharing one cell into distinct cells", () => {
  // Exploration tracks the whole party as a single token, so every hero arrives here on the
  // exact same cell — 'inPlace' must spread them out rather than stacking them in combat.
  // (A real fog.partyCell is always a floor cell; picked from the tile rather than guessed,
  // since this tile has interior pillars and a hardcoded coordinate could land on one.)
  const shared = floorCells(middleTile)[0];
  const party = content.heroes.slice(0, 3).map((data, i) =>
    createActor(data, RULES, { side: 'hero', id: `h${i}` }));
  party.forEach((hero) => { hero.x = shared.x; hero.y = shared.y; });

  createCombat({
    tile: middleTile, party, spawns: [{ id: content.monsters[0].id, count: 2 }],
    monsterData: content.monsters, rules: RULES, rng: createRng('multi'), placement: 'inPlace',
  });

  const cells = new Set(party.map((h) => `${h.x},${h.y}`));
  assert.equal(cells.size, party.length, 'every hero must end up on a distinct cell');
  assert.equal(party[0].x, shared.x, 'the first hero anchors the fan-out at the shared cell');
  assert.equal(party[0].y, shared.y);
});

test('an in-place combat still resolves initiative and starts with the usual log line', () => {
  const party = [createActor(heroData, RULES, { side: 'hero', id: 'h1' })];
  party[0].x = 2;
  party[0].y = 2;
  const combat = createCombat({
    tile: middleTile, party, spawns: [{ id: content.monsters[0].id, count: 1 }],
    monsterData: content.monsters, rules: RULES, rng: createRng('flow'), placement: 'inPlace',
  });
  assert.equal(combat.order.length, 2);
  assert.ok(activeActor(combat), 'a combat must always have an active actor at start');
  assert.ok(combat.log.length > 0);
});
