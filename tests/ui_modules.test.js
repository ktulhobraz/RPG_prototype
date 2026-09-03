import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('party detail and delve UI modules import without side effects', async () => {
  const details = await import('../src/ui/party_details.js');
  const delve = await import('../src/ui/screens/delve.js');
  assert.equal(typeof details.heroDetailsModal, 'function');
  assert.equal(typeof details.stashModal, 'function');
  assert.equal(typeof delve.delveScreen, 'function');
});

test('party detail stylesheet is loaded by the page', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /styles\/party\.css/);
});
