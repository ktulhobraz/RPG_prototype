import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng, hashSeed, restoreRng } from '../src/core/rng.js';

test('same seed produces the same sequence', () => {
  const a = createRng('delve-one');
  const b = createRng('delve-one');
  const seqA = Array.from({ length: 50 }, () => a.int(1, 100));
  const seqB = Array.from({ length: 50 }, () => b.int(1, 100));
  assert.deepEqual(seqA, seqB);
});

test('different seeds diverge', () => {
  const a = createRng('delve-one');
  const b = createRng('delve-two');
  const seqA = Array.from({ length: 50 }, () => a.int(1, 100));
  const seqB = Array.from({ length: 50 }, () => b.int(1, 100));
  assert.notDeepEqual(seqA, seqB);
});

test('hashSeed is stable and non-zero for typical input', () => {
  assert.equal(hashSeed('abc'), hashSeed('abc'));
  assert.notEqual(hashSeed('abc'), hashSeed('abd'));
  assert.ok(hashSeed('') >= 0);
});

test('int stays within bounds and covers them', () => {
  const rng = createRng(42);
  const seen = new Set();
  for (let i = 0; i < 5000; i++) {
    const v = rng.int(1, 6);
    assert.ok(v >= 1 && v <= 6, `out of range: ${v}`);
    seen.add(v);
  }
  assert.equal(seen.size, 6, 'every face should appear');
});

test('shuffle keeps all elements and does not mutate the input', () => {
  const rng = createRng(7);
  const input = [1, 2, 3, 4, 5, 6, 7, 8];
  const out = rng.shuffle(input);
  assert.deepEqual(input, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(out.slice().sort((a, b) => a - b), input);
});

test('restoreRng continues an interrupted sequence', () => {
  const original = createRng('save-me');
  Array.from({ length: 10 }, () => original.int(1, 6));
  const saved = original.state();
  const restored = restoreRng(saved);
  const tail = Array.from({ length: 10 }, () => original.int(1, 6));
  const replay = Array.from({ length: 10 }, () => restored.int(1, 6));
  assert.deepEqual(replay, tail);
});
