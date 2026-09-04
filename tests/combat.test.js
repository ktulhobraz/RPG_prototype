import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/core/rng.js';
import { RULES } from '../src/core/rules/index.js';
import { createActor } from '../src/core/entities.js';
import { attackModifier } from '../src/core/abilities.js';
import { distance } from '../src/core/grid.js';
import {
  createCombat, ambushCells, AMBUSH_MIN_DISTANCE, activeActor, moveTo, attack,
  combatAdvantageModifier,
} from '../src/core/combat.js';
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

const interactionTile = {
  id: 'interaction-test', kind: 'battlefield', w: 5, h: 5,
  cells: ['#####', '#...#', '#...#', '#...#', '#####'],
};

function fighter(id, side, abilities = []) {
  return createActor({
    id, name: id, abilities,
    profile: { ws: 3, bs: 3, str: 3, tou: 3, wounds: 8, init: 3, attacks: 1, move: 4 },
  }, RULES, { side, id });
}

function manualCombat(actors, rules = RULES) {
  return {
    tile: interactionTile,
    actors,
    order: actors.map((actor) => actor.id),
    turn: 0,
    round: 1,
    movementLeft: 4,
    hasActed: false,
    log: [],
    status: 'active',
    rng: createRng('interaction'),
    rules,
  };
}

function scriptedRules(results, calls = []) {
  return {
    ...RULES,
    resolveAttack(attacker, defender, ctx) {
      calls.push({ attacker: attacker.id, defender: defender.id, ctx: { ...ctx } });
      return results.shift() ?? { hit: false, damage: 0, crit: false, fumble: false, detail: 'scripted miss' };
    },
  };
}

test('leaving engagement provokes one immediate strike from each adjacent enemy', () => {
  const hero = fighter('hero', 'hero');
  const first = fighter('first', 'monster');
  const second = fighter('second', 'monster');
  hero.x = 2; hero.y = 2;
  first.x = 2; first.y = 1;
  second.x = 1; second.y = 2;
  const calls = [];
  const rules = scriptedRules([
    { hit: true, damage: 1, crit: false, fumble: false, detail: 'hit' },
    { hit: true, damage: 1, crit: false, fumble: false, detail: 'hit' },
  ], calls);
  const combat = manualCombat([hero, first, second], rules);

  assert.equal(moveTo(combat, { x: 3, y: 2 }), true);
  assert.equal(calls.length, 2);
  assert.deepEqual(new Set(calls.map((call) => call.attacker)), new Set(['first', 'second']));
  assert.equal(hero.wounds, 6);
  assert.deepEqual({ x: hero.x, y: hero.y }, { x: 3, y: 2 });
  assert.equal(combat.hasActed, false, 'opportunity strikes do not spend the mover or reactor action');
});

test('moving while remaining adjacent still provokes the engaged enemy', () => {
  const hero = fighter('hero', 'hero');
  const enemy = fighter('enemy', 'monster');
  hero.x = 2; hero.y = 2;
  enemy.x = 2; enemy.y = 1;
  const calls = [];
  const rules = scriptedRules([
    { hit: true, damage: 1, crit: false, fumble: false, detail: 'hit' },
  ], calls);
  const combat = manualCombat([hero, enemy], rules);

  assert.equal(moveTo(combat, { x: 1, y: 2 }), true);
  assert.equal(calls.length, 1, 'circling inside engagement must provoke once');
  assert.equal(calls[0].attacker, 'enemy');
  assert.deepEqual({ x: hero.x, y: hero.y }, { x: 1, y: 2 });
});

test('Disengage allows movement inside or out of engagement without an opportunity attack', () => {
  const hero = fighter('hero', 'hero', ['disengage']);
  const enemy = fighter('enemy', 'monster');
  hero.x = 2; hero.y = 2;
  enemy.x = 2; enemy.y = 1;
  const calls = [];
  const rules = scriptedRules([], calls);
  const combat = manualCombat([hero, enemy], rules);

  assert.equal(moveTo(combat, { x: 1, y: 2 }), true);
  assert.equal(calls.length, 0);
  assert.deepEqual({ x: hero.x, y: hero.y }, { x: 1, y: 2 });
});

test('two adjacent enemies grant +1 melee advantage against the surrounded target', () => {
  const defender = fighter('defender', 'hero');
  const attacker = fighter('attacker', 'monster');
  const ally = fighter('ally', 'monster');
  defender.x = 2; defender.y = 2;
  attacker.x = 1; attacker.y = 2;
  ally.x = 2; ally.y = 1;
  const combat = manualCombat([attacker, ally, defender]);

  assert.equal(combatAdvantageModifier(combat, attacker, defender, 'melee'), 1);
  assert.equal(combatAdvantageModifier(combat, attacker, defender, 'ranged'), 0);
  ally.alive = false;
  assert.equal(combatAdvantageModifier(combat, attacker, defender, 'melee'), 0);
});

test('a kill grants +1 attack momentum', () => {
  const attacker = fighter('attacker', 'hero');
  const defender = fighter('defender', 'monster');
  attacker.x = 1; attacker.y = 2;
  defender.x = 2; defender.y = 2;
  const calls = [];
  const rules = scriptedRules([
    { hit: true, damage: 99, crit: false, fumble: false, detail: 'kill' },
  ], calls);
  const combat = manualCombat([attacker, defender], rules);

  assert.equal(attack(combat, defender, 'melee', rules, combat.rng), true);
  assert.equal(defender.alive, false);
  assert.equal(attacker.momentum, true);
});

test('kill momentum applies to the next attack and ends on the first miss', () => {
  const attacker = fighter('attacker', 'hero');
  const defender = fighter('defender', 'monster');
  attacker.x = 1; attacker.y = 2;
  defender.x = 2; defender.y = 2;
  attacker.momentum = true;
  const calls = [];
  const rules = scriptedRules([
    { hit: false, damage: 0, crit: false, fumble: false, detail: 'miss' },
  ], calls);
  const combat = manualCombat([attacker, defender], rules);

  assert.equal(attack(combat, defender, 'melee', rules, combat.rng), true);
  assert.equal(calls[0].ctx.modifier, 1);
  assert.equal(attacker.momentum, false);
});

test('being hit removes kill momentum even when the hit deals zero damage', () => {
  const attacker = fighter('attacker', 'monster');
  const defender = fighter('defender', 'hero');
  attacker.x = 1; attacker.y = 2;
  defender.x = 2; defender.y = 2;
  defender.momentum = true;
  const rules = scriptedRules([
    { hit: true, damage: 0, crit: false, fumble: false, detail: 'glancing hit' },
  ]);
  const combat = manualCombat([attacker, defender], rules);

  assert.equal(attack(combat, defender, 'melee', rules, combat.rng), true);
  assert.equal(defender.momentum, false);
});

test('starting a new combat clears kill momentum carried by a persistent hero actor', () => {
  const hero = createActor(heroData, RULES, { side: 'hero', id: 'persistent' });
  hero.momentum = true;
  createCombat({
    tile: middleTile, party: [hero], spawns: [{ id: content.monsters[0].id, count: 1 }],
    monsterData: content.monsters, rules: RULES, rng: createRng('momentum-reset'),
  });
  assert.equal(hero.momentum, false);
});

test('Slayer Surrounded Fury scales with adjacent enemies and caps at +2', () => {
  const slayerData = content.heroes.find((hero) => hero.id === 'slayer');
  assert.ok(slayerData?.abilities.includes('surrounded_fury'));
  const slayer = createActor(slayerData, RULES, { side: 'hero', id: 'slayer' });
  const first = fighter('first', 'monster');
  const second = fighter('second', 'monster');
  const third = fighter('third', 'monster');
  slayer.x = 2; slayer.y = 2;
  first.x = 1; first.y = 2;
  second.x = 2; second.y = 1;
  third.x = 3; third.y = 2;
  const combat = manualCombat([slayer, first, second, third]);
  const ctx = { kind: 'melee', rangePenalty: 0, modifier: 0 };

  second.alive = false;
  third.alive = false;
  assert.equal(attackModifier({ attacker: slayer, defender: first, ctx, combat }), 0);
  second.alive = true;
  assert.equal(attackModifier({ attacker: slayer, defender: first, ctx, combat }), 1);
  third.alive = true;
  assert.equal(attackModifier({ attacker: slayer, defender: first, ctx, combat }), 2);
});
