import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/core/rng.js';
import { rollCorruption, permittedMonsters, rollEncounterSpawns } from '../src/core/corruption.js';
import { loadTestContent } from './helpers.js';

const content = loadTestContent();
const { monsters, corruptions } = content;

test('rollCorruption is deterministic and stays inside its declared range', () => {
  for (let i = 0; i < 200; i++) {
    const rng = createRng(`theme-${i}`);
    const first = rollCorruption(rng, corruptions);
    const again = rollCorruption(createRng(`theme-${i}`), corruptions);
    assert.deepEqual(again, first, 'same seed must roll the same theme and intensity');

    const theme = corruptions.find((t) => t.id === first.themeId);
    assert.ok(theme, 'the rolled theme must be one of the authored themes');
    const [min, max] = theme.intensity;
    assert.ok(first.intensity >= min && first.intensity <= max,
      `intensity ${first.intensity} outside ${theme.id}'s declared range [${min}, ${max}]`);
  }
});

test('permittedMonsters only returns monsters in the theme\'s factions', () => {
  for (const theme of corruptions) {
    const permitted = permittedMonsters(monsters, theme);
    assert.ok(permitted.length > 0, `theme ${theme.id} permits no monster at all`);
    for (const monster of permitted) {
      assert.ok(theme.factions.includes(monster.faction),
        `${monster.id} (faction ${monster.faction}) leaked through theme ${theme.id}`);
    }
  }
});

test('every corruption theme has an encounter at depth 0 (tier-1 coverage)', () => {
  // This is exactly the failure mode content.js's validateContent guards against: a theme with
  // no tier-1 monster stays silent for the first half of any delve rolled with it.
  for (const theme of corruptions) {
    const rng = createRng(`early-${theme.id}`);
    const spawns = rollEncounterSpawns(monsters, rng, {
      depthRatio: 0, partySize: 4, intensity: 1, theme,
    });
    assert.ok(spawns.length > 0, `theme ${theme.id} produced no spawns at depthRatio 0`);
  }
});

test('at intensity 1, rollEncounterSpawns reproduces the pre-corruption budget', () => {
  // The calibration target stated in the plan: intensity 1.0 must not shift the tuned balance.
  const budgetFor = (depthRatio, partySize) =>
    Math.max(2, Math.round(partySize * (0.5 + depthRatio * 0.6)));

  for (const [depthRatio, partySize] of [[0, 4], [0.5, 4], [1, 4], [0.4, 1]]) {
    const rng = createRng(`budget-${depthRatio}-${partySize}`);
    const spawns = rollEncounterSpawns(monsters, rng, { depthRatio, partySize, intensity: 1 });
    const cost = spawns.reduce((sum, s) => {
      const data = monsters.find((m) => m.id === s.id);
      return sum + ((data.tier ?? 1) >= 2 ? 2 : 1) * s.count;
    }, 0);
    // The loop can stop a little under budget (the `spent + cost > budget + 1` guard), so this
    // checks the spend never exceeds it, not that it hits it exactly.
    assert.ok(cost <= budgetFor(depthRatio, partySize) + 1,
      `spawn cost ${cost} exceeds the untouched budget for depthRatio ${depthRatio}`);
  }
});

test('higher intensity yields a larger or equal spawn budget on average', () => {
  const costOf = (intensity, seedPrefix) => {
    let total = 0;
    const runs = 200;
    for (let i = 0; i < runs; i++) {
      const rng = createRng(`${seedPrefix}-${i}`);
      const spawns = rollEncounterSpawns(monsters, rng, { depthRatio: 0.5, partySize: 4, intensity });
      total += spawns.reduce((sum, s) => sum + s.count, 0);
    }
    return total / runs;
  };
  assert.ok(costOf(1.4, 'high') > costOf(0.6, 'low'), 'intensity should scale encounter size');
});

test('an empty theme pool (no permitted monster at this tier) returns no spawns, not an error', () => {
  const emptyTheme = { id: 'nothing', name: 'Nothing', factions: ['no_such_faction'], intensity: [1, 1] };
  const rng = createRng('empty-theme');
  const spawns = rollEncounterSpawns(monsters, rng, {
    depthRatio: 0, partySize: 4, intensity: 1, theme: emptyTheme,
  });
  assert.deepEqual(spawns, []);
});
