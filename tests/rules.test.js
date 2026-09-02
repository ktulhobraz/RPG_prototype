import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRng } from '../src/core/rng.js';
import { listRuleSystems, getRuleSystem, DEFAULT_RULE_SYSTEM } from '../src/core/rules/index.js';
import { toPercentile, skillToPercent } from '../src/core/rules/derive.js';
import { meleeTarget, rangedTarget } from '../src/core/rules/d6.js';
import { successLevels } from '../src/core/rules/d100.js';
import { createActor } from '../src/core/entities.js';
import { normalizeProfile } from '../src/core/profile.js';

const heroes = JSON.parse(readFileSync(new URL('../src/data/heroes.json', import.meta.url), 'utf8'));
const monsters = JSON.parse(readFileSync(new URL('../src/data/monsters.json', import.meta.url), 'utf8'));

test('registry exposes both systems and a working default', () => {
  const ids = listRuleSystems().map((s) => s.id).sort();
  assert.deepEqual(ids, ['d100', 'd6']);
  assert.equal(getRuleSystem(DEFAULT_RULE_SYSTEM).id, 'd6');
  // An unknown id in an old save must not break loading.
  assert.equal(getRuleSystem('nonsense').id, DEFAULT_RULE_SYSTEM);
  assert.equal(getRuleSystem(undefined).id, DEFAULT_RULE_SYSTEM);
});

test('d6 to-hit targets follow the skill difference and stay in bounds', () => {
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

test('percentile derivation stays inside the playable band', () => {
  assert.equal(skillToPercent(4), 45);
  assert.equal(skillToPercent(0), 5);
  assert.equal(skillToPercent(20), 95);
  for (const data of [...heroes, ...monsters]) {
    const canon = normalizeProfile(data.profile, data.id);
    const pct = toPercentile(canon);
    assert.ok(pct.ws >= 5 && pct.ws <= 95, `${data.id} ws out of band: ${pct.ws}`);
    assert.ok(pct.bs >= 5 && pct.bs <= 95, `${data.id} bs out of band: ${pct.bs}`);
    assert.ok(pct.wounds >= canon.wounds, `${data.id} percentile wounds should not shrink`);
    assert.equal(pct.move, canon.move, 'movement is system-independent');
  }
});

test('overrides replace derived values field by field', () => {
  const canon = normalizeProfile({ ws: 2, bs: 2, str: 3, tou: 4, wounds: 7, init: 1 }, 'risen');
  const pct = toPercentile(canon, { ws: 30 });
  assert.equal(pct.ws, 30, 'override applies');
  assert.equal(pct.bs, skillToPercent(2), 'untouched fields still derive');
});

test('success levels compare tens digits', () => {
  assert.equal(successLevels(45, 12), 3);
  assert.equal(successLevels(45, 45), 0);
  assert.equal(successLevels(30, 71), -4);
});

// The point of the contract: both systems answer the same questions with the same shapes.
for (const rules of listRuleSystems()) {
  const build = (data, side, id) => createActor(data, rules, { side, id });

  test(`[${rules.id}] attack results share one shape`, () => {
    const rng = createRng('contract');
    const attacker = build(heroes[0], 'hero', 'a');
    const defender = build(monsters[0], 'monster', 'd');
    for (let i = 0; i < 2000; i++) {
      const result = rules.resolveAttack(attacker, defender, { kind: 'melee' }, rng);
      assert.equal(typeof result.hit, 'boolean');
      assert.equal(typeof result.crit, 'boolean');
      assert.equal(typeof result.fumble, 'boolean');
      assert.equal(typeof result.detail, 'string');
      assert.ok(Number.isInteger(result.damage), `damage must be an integer, got ${result.damage}`);
      assert.ok(result.damage >= 0, 'damage is never negative');
      if (!result.hit) assert.equal(result.damage, 0, 'a miss deals nothing');
      assert.ok(rules.describe(attacker, defender, result).length > 0);
    }
  });

  test(`[${rules.id}] ranged attacks respect range penalties`, () => {
    const attacker = build(heroes[2], 'hero', 'a');
    const defender = build(monsters[0], 'monster', 'd');
    const hits = (penalty) => {
      const rng = createRng('range');
      let n = 0;
      for (let i = 0; i < 3000; i++) {
        if (rules.resolveAttack(attacker, defender, { kind: 'ranged', rangePenalty: penalty }, rng).hit) n++;
      }
      return n;
    };
    assert.ok(hits(0) > hits(2), `${rules.id}: distance should make shooting harder`);
  });

  test(`[${rules.id}] a competent attacker lands between 30% and 90% of melee swings`, () => {
    const rng = createRng('rate');
    const attacker = build(heroes[0], 'hero', 'a');
    const defender = build(monsters[0], 'monster', 'd');
    let hits = 0;
    const rounds = 10000;
    for (let i = 0; i < rounds; i++) {
      if (rules.resolveAttack(attacker, defender, { kind: 'melee' }, rng).hit) hits++;
    }
    const rate = hits / rounds;
    assert.ok(rate > 0.3 && rate < 0.9, `${rules.id} hit rate outside sane band: ${rate.toFixed(3)}`);
  });

  test(`[${rules.id}] initiative returns every combatant exactly once, deterministically`, () => {
    const combatants = [
      build(heroes[0], 'hero', 'h1'),
      build(heroes[2], 'hero', 'h2'),
      build(monsters[0], 'monster', 'm1'),
      build(monsters[3], 'monster', 'm2'),
    ];
    const first = rules.rollInitiative(combatants, createRng('init'));
    const second = rules.rollInitiative(combatants, createRng('init'));
    assert.deepEqual(first, second, 'same seed, same order');
    assert.deepEqual([...first].sort(), ['h1', 'h2', 'm1', 'm2']);
  });

  test(`[${rules.id}] stat tests succeed more often when the actor is better at them`, () => {
    const weak = build({ id: 'w', name: 'Weak', profile: { ws: 2 } }, 'hero', 'w');
    const strong = build({ id: 's', name: 'Strong', profile: { ws: 6 } }, 'hero', 's');
    const rate = (actor) => {
      const rng = createRng('test-stat');
      let n = 0;
      for (let i = 0; i < 3000; i++) if (rules.resolveTest(actor, 'ws', 3, rng).success) n++;
      return n / 3000;
    };
    assert.ok(rate(strong) > rate(weak), `${rules.id}: skill should matter in tests`);
  });
}
