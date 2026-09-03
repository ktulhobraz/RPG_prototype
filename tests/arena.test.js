import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  startArena, currentArenaOpponent, nextArenaFight, retryArenaFight, concludeArenaCombat,
} from '../src/core/arena.js';

const json = (name) => JSON.parse(readFileSync(new URL(`../src/data/${name}.json`, import.meta.url), 'utf8'));
const content = {
  heroes: json('heroes'),
  monsters: json('monsters'),
  items: json('items'),
  battlefields: json('battlefields'),
};

test('test arena starts one selected hero against one opponent on the dedicated battlefield', () => {
  const arena = startArena({ content, heroId: 'warrior', seed: 'arena-start' });
  assert.equal(arena.heroId, 'warrior');
  assert.equal(arena.party.length, 1);
  assert.equal(arena.party[0].dataId, 'warrior');
  assert.equal(arena.combat.tile.id, 'test_arena');
  assert.equal(arena.combat.actors.filter((actor) => actor.side === 'hero').length, 1);
  assert.equal(arena.combat.actors.filter((actor) => actor.side === 'monster').length, 1);
  assert.equal(currentArenaOpponent(arena).id, content.monsters[0].id);
});

test('winning advances the ladder and resets the hero to baseline for the next matchup', () => {
  const arena = startArena({ content, heroId: 'ranger', seed: 'arena-next' });
  arena.combat.status = 'won';
  concludeArenaCombat(arena);
  assert.equal(arena.phase, 'between');
  assert.equal(arena.wins, 1);

  const previousHero = arena.party[0];
  previousHero.wounds = 1;
  nextArenaFight(arena);

  assert.equal(arena.opponentIndex, 1);
  assert.equal(arena.party[0].dataId, 'ranger');
  assert.notEqual(arena.party[0], previousHero);
  assert.equal(arena.party[0].wounds, arena.party[0].maxWounds);
  assert.equal(arena.combat.actors.filter((actor) => actor.side === 'monster').length, 1);
});

test('a defeated arena hero can retry the same opponent from baseline', () => {
  const arena = startArena({ content, heroId: 'scholar', seed: 'arena-retry' });
  const opponent = arena.opponentIndex;
  arena.combat.status = 'lost';
  concludeArenaCombat(arena);
  assert.equal(arena.phase, 'defeat');

  retryArenaFight(arena);
  assert.equal(arena.opponentIndex, opponent);
  assert.equal(arena.party[0].wounds, arena.party[0].maxWounds);
  assert.equal(arena.phase, 'combat');
});
