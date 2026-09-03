import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startSession, assignStashItem, shortRest, acknowledge, restoreSession } from '../src/core/state.js';
import { autoExplore } from '../src/core/autoplay.js';
import { currentRoom } from '../src/core/dungeon.js';
import { serialize } from '../src/core/save.js';
import { loadTestContent, DEFAULT_PARTY } from './helpers.js';

test('an exploration ambush opens on a dedicated battlefield', () => {
  const session = startSession({ content: loadTestContent(), heroIds: DEFAULT_PARTY, seed: 'battlefield-flow' });
  let guard = 0;
  while (session.phase !== 'combat' && guard++ < 500) {
    if (session.phase === 'event' || session.phase === 'loot') acknowledge(session);
    else autoExplore(session);
    if (session.dungeon.current > 2 && session.phase !== 'combat') break;
  }
  assert.equal(session.phase, 'combat', 'seed should reach a wandering fight');
  assert.equal(session.combat.tile.kind, 'battlefield');
  assert.notEqual(session.combat.tile.id, currentRoom(session.dungeon).tile.id);
  assert.equal(session.combat.order.length, session.combat.actors.length, 'initiative includes both sides');
});

test('loot can remain in group stash then be assigned to a specific hero', () => {
  const content = loadTestContent();
  const session = startSession({ content, heroIds: DEFAULT_PARTY, seed: 'stash' });
  const item = content.items.find((entry) => entry.id === 'mail_shirt');
  const hero = session.party[0];
  const before = hero.canon.tou;
  session.stash.push(item);
  assert.equal(assignStashItem(session, item.id, hero.id), true);
  assert.equal(session.stash.length, 0);
  assert.ok(hero.items.some((entry) => entry.id === item.id));
  assert.equal(hero.canon.tou, before + 1, 'equipped loot affects the assigned hero');
});

test('rest uses base Toughness rather than equipment-modified Toughness', () => {
  const session = startSession({ content: loadTestContent(), heroIds: DEFAULT_PARTY, seed: 'rest-base' });
  const hero = session.party[0];
  assert.ok(hero.canon.tou > hero.baseCanon.tou, 'starting shield modifies effective Toughness');
  hero.wounds = 1;
  for (const other of session.party.slice(1)) other.wounds = other.maxWounds;
  session.rng = { int: () => 3, next: () => 0.5, pick: (a) => a[0], shuffle: (a) => a, state: () => 1 };
  shortRest(session);
  assert.equal(hero.wounds, 5, 'd6(3) + base Tou modifier(1) heals exactly 4');
});

test('save v2 preserves group stash and randomized exit', () => {
  const content = loadTestContent();
  const session = startSession({ content, heroIds: DEFAULT_PARTY, seed: 'save-flow' });
  session.stash.push(content.items.find((entry) => entry.id === 'swift_boots'));
  const exitBefore = { ...currentRoom(session.dungeon).fog.exitCell };
  const restored = restoreSession(serialize(session), loadTestContent());
  assert.deepEqual(currentRoom(restored.dungeon).fog.exitCell, exitBefore);
  assert.deepEqual(restored.stash.map((entry) => entry.id), ['swift_boots']);
});
