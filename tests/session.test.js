import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/core/rng.js';
import { createDungeon, isTileConnected, entryCells, advance } from '../src/core/dungeon.js';
import { startSession, explore, acknowledge, restoreSession, shortRest } from '../src/core/state.js';
import { playSession } from '../src/core/autoplay.js';
import { serialize, save, load, createMemoryStorage, createNullStorage } from '../src/core/save.js';
import { validateContent } from '../src/core/content.js';
import { awardXp, levelForXp, XP_PER_LEVEL } from '../src/core/progression.js';
import { simulate } from './sim.js';
import { loadTestContent, DEFAULT_PARTY } from './helpers.js';

const content = loadTestContent();

test('every authored room tile is fully connected', () => {
  for (const tile of content.rooms) {
    assert.ok(isTileConnected(tile), `room ${tile.id} has unreachable floor cells`);
  }
});

test('content validation catches the mistakes that would surface mid-delve', () => {
  assert.throws(() => validateContent({ ...content, heroes: [] }), /heroes/);
  assert.throws(
    () => validateContent({ ...content, rooms: content.rooms.filter((r) => r.kind !== 'objective') }),
    /objective/,
  );
  assert.throws(
    () => validateContent({ ...content, monsters: content.monsters.filter((m) => m.role !== 'boss') }),
    /boss/,
  );
  // The geometry check runs last, so the fixture must otherwise be a valid deck.
  const badGeometry = {
    ...content,
    rooms: content.rooms.map((r) => (r.kind === 'entrance' ? { ...r, h: 99 } : r)),
  };
  assert.throws(() => validateContent(badGeometry), /h=99/);
});

test('a dungeon always ends in a reachable objective room', () => {
  for (let i = 0; i < 60; i++) {
    const dungeon = createDungeon({
      rooms: content.rooms,
      monsters: content.monsters,
      rng: createRng(`dungeon-${i}`),
      depth: 8,
      partySize: 4,
    });
    assert.equal(dungeon.rooms.length, 8);
    assert.equal(dungeon.rooms[0].tile.kind, 'entrance');
    const last = dungeon.rooms[dungeon.rooms.length - 1];
    assert.equal(last.tile.kind, 'objective');
    assert.equal(last.encounter.kind, 'boss');
    assert.ok(last.encounter.spawns.some((s) => s.id === 'troll'), 'the boss must be present');
  }
});

test('the party cannot walk past monsters it has not cleared', () => {
  const dungeon = createDungeon({
    rooms: content.rooms, monsters: content.monsters,
    rng: createRng('gate'), depth: 5, partySize: 4,
  });
  const fight = dungeon.rooms.findIndex((r) => !r.cleared);
  assert.ok(fight > 0, 'expected at least one uncleared room');
  dungeon.current = fight;
  assert.equal(advance(dungeon), false, 'an uncleared room blocks progress');
  dungeon.rooms[fight].cleared = true;
  assert.equal(advance(dungeon), true);
});

test('entry cells are distinct, passable and deterministic', () => {
  const tile = content.rooms.find((r) => r.kind === 'objective');
  const first = entryCells(tile, 4, 'near');
  const second = entryCells(tile, 4, 'near');
  assert.deepEqual(first, second, 'placement must not vary between calls');
  assert.equal(new Set(first.map((c) => `${c.x},${c.y}`)).size, 4, 'no two actors share a cell');

  const taken = new Set(first.map((c) => `${c.x},${c.y}`));
  const far = entryCells(tile, 3, 'far', taken);
  for (const cell of far) {
    assert.ok(!taken.has(`${cell.x},${cell.y}`), 'monsters must not spawn on heroes');
  }
});

test('the same seed replays the same delve exactly', () => {
  const run = () => {
    const session = startSession({ content: loadTestContent(), heroIds: DEFAULT_PARTY, seed: 'replay' });
    playSession(session, { explore, acknowledge });
    return {
      phase: session.phase,
      gold: session.gold,
      room: session.dungeon.current,
      wounds: session.party.map((h) => h.wounds),
      journal: session.journal,
    };
  };
  assert.deepEqual(run(), run());
});

test('a short rest heals but never fully restores the party', () => {
  const session = startSession({ content: loadTestContent(), heroIds: DEFAULT_PARTY, seed: 'rest' });
  for (const hero of session.party) hero.wounds = 1;
  shortRest(session);
  for (const hero of session.party) {
    assert.ok(hero.wounds > 1, `${hero.name} should recover something`);
    assert.ok(hero.wounds < hero.maxWounds, `${hero.name} should not be fully healed`);
  }
});

test('experience levels heroes up and the dead earn nothing', () => {
  const session = startSession({ content: loadTestContent(), heroIds: DEFAULT_PARTY, seed: 'xp' });
  const [alive, ...rest] = session.party;
  for (const hero of rest) hero.alive = false;
  const toughBefore = alive.canon.tou;

  awardXp(session.party, XP_PER_LEVEL);
  assert.equal(alive.level, 2, 'the survivor levels');
  assert.equal(alive.canon.tou, toughBefore + 1, 'a level grants toughness');
  for (const hero of rest) assert.equal(hero.xp, 0, 'the dead earn nothing');
  assert.equal(levelForXp(0), 1);
  assert.equal(levelForXp(XP_PER_LEVEL * 2), 3);
});

test('a delve survives a save and reload round trip', () => {
  const storage = createMemoryStorage();
  const session = startSession({ content: loadTestContent(), heroIds: DEFAULT_PARTY, seed: 'persist' });
  session.gold = 123;
  session.party[0].wounds = 3;
  session.party[1].alive = false;

  assert.equal(save(storage, session), true);
  const restored = restoreSession(load(storage), loadTestContent());

  assert.ok(restored, 'the save should reload');
  assert.equal(restored.gold, 123);
  assert.equal(restored.party[0].wounds, 3);
  assert.equal(restored.party[1].alive, false);
  assert.equal(restored.dungeon.rooms.length, session.dungeon.rooms.length);
  assert.deepEqual(
    restored.dungeon.rooms.map((r) => r.tile.id),
    session.dungeon.rooms.map((r) => r.tile.id),
    'the same dungeon comes back',
  );
});

test('blocked storage disables saving without breaking the game', () => {
  const storage = createNullStorage();
  const session = startSession({ content: loadTestContent(), heroIds: DEFAULT_PARTY, seed: 'no-store' });
  assert.equal(storage.available, false);
  assert.equal(save(storage, session), false, 'saving reports failure rather than throwing');
  assert.equal(load(storage), null);
  // The delve still plays to completion.
  playSession(session, { explore, acknowledge });
  assert.ok(['victory', 'defeat'].includes(session.phase));
});

test('a corrupt or foreign save is discarded rather than half-read', () => {
  const storage = createMemoryStorage();
  storage.setItem('rpg-prototype.save.v1', '{not json');
  assert.equal(load(storage), null);
  storage.setItem('rpg-prototype.save.v1', JSON.stringify({ version: 99 }));
  assert.equal(load(storage), null);
  assert.equal(restoreSession(null, content), null);
});

test('serialize keeps a save small and free of engine objects', () => {
  const session = startSession({ content: loadTestContent(), heroIds: DEFAULT_PARTY, seed: 'shape' });
  const snapshot = serialize(session);
  const json = JSON.stringify(snapshot);
  assert.ok(json.length < 8000, `save is larger than expected: ${json.length} bytes`);
  // Items are stored by id, not as inlined records.
  assert.ok(snapshot.party.every((h) => h.items.every((i) => typeof i === 'string')));
});

test('every delve terminates in victory or defeat', () => {
  for (let i = 0; i < 40; i++) {
    const session = startSession({ content: loadTestContent(), heroIds: DEFAULT_PARTY, seed: `end-${i}` });
    playSession(session, { explore, acknowledge });
    assert.ok(
      session.phase === 'victory' || session.phase === 'defeat',
      `seed end-${i} stalled in phase ${session.phase}`,
    );
  }
});

// A crude guard, not a balance target: it catches a change that makes the game trivial or
// unwinnable, which is the failure mode that otherwise goes unnoticed until someone plays it.
test('the game is neither trivially won nor unwinnable', () => {
  const result = simulate(150);
  assert.ok(
    result.winRate > 0.2 && result.winRate < 0.8,
    `win rate outside the playable band: ${(result.winRate * 100).toFixed(1)}%`,
  );
  assert.ok(result.avgRooms > 3, `parties die too early: ${result.avgRooms.toFixed(2)} rooms`);
});
