import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/core/rng.js';
import { RULES, getRuleSystem, DEFAULT_RULE_SYSTEM } from '../src/core/rules/index.js';
import { meleeTarget, rangedTarget } from '../src/core/rules/d6.js';
import { createActor } from '../src/core/entities.js';
import { normalizeProfile } from '../src/core/profile.js';
import { loadTestContent } from './helpers.js';

const content = loadTestContent();
const { heroes, monsters } = content;

test('the registry exposes the active system and tolerates unknown ids', () => {
  assert.equal(RULES.id, 'd6');
  assert.equal(getRuleSystem(DEFAULT_RULE_SYSTEM).id, 'd6');
  // A stale id in an old save must not stop the game from loading.
  assert.equal(getRuleSystem('nonsense').id, 'd6');
  assert.equal(getRuleSystem(undefined).id, 'd6');
});

test('to-hit targets follow the skill difference and stay in bounds', () => {
  assert.equal(meleeTarget(4, 4), 4);
  assert.equal(meleeTarget(5, 3), 2);
  assert.equal(meleeTarget(2, 6), 6);
  for (let a = 1; a <= 8; a++) {
    for (let d = 1; d <= 8; d++) {
      const t = meleeTarget(a, d);
      assert.ok(t >= 2 && t <= 6, `melee target out of range for ${a} vs ${d}: ${t}`);
    }
  }
  assert.equal(rangedTarget(5), 2);
  assert.equal(rangedTarget(1), 6);
});

test('every content profile normalizes without loss', () => {
  for (const data of [...heroes, ...monsters]) {
    const canon = normalizeProfile(data.profile, data.id);
    for (const [key, value] of Object.entries(data.profile)) {
      assert.equal(canon[key], value, `${data.id}.${key} changed during normalization`);
    }
    assert.ok(canon.wounds >= 1);
  }
});

test('a malformed profile is rejected where the bad file is still obvious', () => {
  assert.throws(() => normalizeProfile({ ws: 'four' }, 'broken'), /ws/);
  assert.throws(() => normalizeProfile({ wounds: 0 }, 'broken'), /wounds/);
});

const build = (data, side, id) => createActor(data, RULES, { side, id });

test('attack results always share one shape', () => {
  const rng = createRng('contract');
  const attacker = build(heroes[0], 'hero', 'a');
  const defender = build(monsters[0], 'monster', 'd');
  for (let i = 0; i < 3000; i++) {
    const result = RULES.resolveAttack(attacker, defender, { kind: 'melee' }, rng);
    assert.equal(typeof result.hit, 'boolean');
    assert.equal(typeof result.crit, 'boolean');
    assert.equal(typeof result.fumble, 'boolean');
    assert.equal(typeof result.detail, 'string');
    assert.ok(Number.isInteger(result.damage), `damage must be an integer, got ${result.damage}`);
    assert.ok(result.damage >= 0, 'damage is never negative');
    if (!result.hit) assert.equal(result.damage, 0, 'a miss deals nothing');
    assert.ok(RULES.describe(attacker, defender, result).length > 0);
  }
});

test('a natural 1 always misses and a natural 6 always hits', () => {
  const attacker = build({ id: 'a', name: 'A', profile: { ws: 2, str: 3 } }, 'hero', 'a');
  const defender = build({ id: 'd', name: 'D', profile: { ws: 6, tou: 3 } }, 'monster', 'd');
  // Against ws 2 vs ws 6 the target is 6, so only a natural 6 can land.
  const fixed = (value) => ({ int: () => value, next: () => 0, pick: (a) => a[0], shuffle: (a) => a, state: () => 0 });
  assert.equal(RULES.resolveAttack(attacker, defender, { kind: 'melee' }, fixed(1)).hit, false);
  assert.equal(RULES.resolveAttack(attacker, defender, { kind: 'melee' }, fixed(6)).hit, true);

  // And the reverse: overwhelming skill still cannot make a natural 1 connect.
  const ace = build({ id: 'x', name: 'X', profile: { ws: 6, str: 4 } }, 'hero', 'x');
  const mook = build({ id: 'y', name: 'Y', profile: { ws: 2, tou: 2 } }, 'monster', 'y');
  assert.equal(RULES.resolveAttack(ace, mook, { kind: 'melee' }, fixed(1)).hit, false);
});

test('range penalties make shooting harder', () => {
  const attacker = build(heroes[2], 'hero', 'a');
  const defender = build(monsters[0], 'monster', 'd');
  const hits = (penalty) => {
    const rng = createRng('range');
    let n = 0;
    for (let i = 0; i < 4000; i++) {
      if (RULES.resolveAttack(attacker, defender, { kind: 'ranged', rangePenalty: penalty }, rng).hit) n++;
    }
    return n;
  };
  assert.ok(hits(0) > hits(2), 'distance should make shooting harder');
});

test('a competent attacker lands between 30% and 90% of melee swings', () => {
  const rng = createRng('rate');
  const attacker = build(heroes[0], 'hero', 'a');
  const defender = build(monsters[0], 'monster', 'd');
  let hits = 0;
  const rounds = 10000;
  for (let i = 0; i < rounds; i++) {
    if (RULES.resolveAttack(attacker, defender, { kind: 'melee' }, rng).hit) hits++;
  }
  const rate = hits / rounds;
  assert.ok(rate > 0.3 && rate < 0.9, `hit rate outside sane band: ${rate.toFixed(3)}`);
});

test('initiative returns every combatant exactly once, deterministically', () => {
  const combatants = [
    build(heroes[0], 'hero', 'h1'),
    build(heroes[2], 'hero', 'h2'),
    build(monsters[0], 'monster', 'm1'),
    build(monsters[3], 'monster', 'm2'),
  ];
  const first = RULES.rollInitiative(combatants, createRng('init'));
  const second = RULES.rollInitiative(combatants, createRng('init'));
  assert.deepEqual(first, second, 'same seed, same order');
  assert.deepEqual([...first].sort(), ['h1', 'h2', 'm1', 'm2']);
});

test('stat tests succeed more often when the actor is better at them', () => {
  const weak = build({ id: 'w', name: 'Weak', profile: { ws: 2 } }, 'hero', 'w');
  const strong = build({ id: 's', name: 'Strong', profile: { ws: 6 } }, 'hero', 's');
  const rate = (actor) => {
    const rng = createRng('test-stat');
    let n = 0;
    for (let i = 0; i < 4000; i++) if (RULES.resolveTest(actor, 'ws', 3, rng).success) n++;
    return n / 4000;
  };
  assert.ok(rate(strong) > rate(weak), 'skill should matter in tests');
});
