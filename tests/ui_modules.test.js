import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

test('party detail, sprite and delve UI modules import without side effects', async () => {
  const details = await import('../src/ui/party_details.js');
  const sprites = await import('../src/ui/sprites.js');
  const delve = await import('../src/ui/screens/delve.js');
  assert.equal(typeof details.heroDetailsModal, 'function');
  assert.equal(typeof details.stashModal, 'function');
  assert.equal(typeof sprites.heroSprite, 'function');
  assert.equal(typeof sprites.itemSprite, 'function');
  assert.equal(typeof delve.delveScreen, 'function');
});

test('party and sprite stylesheets are loaded by the page', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /styles\/party\.css/);
  assert.match(html, /styles\/sprites\.css/);
});

test('generated art atlas is a valid WebP and covers canonical prototype content ids', async () => {
  const atlasUrl = new URL('../assets/game-atlas-v2.webp', import.meta.url);
  assert.equal(existsSync(atlasUrl), true);
  const atlas = readFileSync(atlasUrl);
  assert.equal(atlas.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(atlas.subarray(8, 12).toString('ascii'), 'WEBP');
  assert.ok(atlas.length > 10_000, 'generated art atlas is unexpectedly small');

  const css = readFileSync(new URL('../styles/sprites.css', import.meta.url), 'utf8');
  assert.match(css, /game-atlas-v2\.webp/);

  const sprites = await import('../src/ui/sprites.js');
  for (const id of ['warrior', 'slayer', 'ranger', 'scholar', 'zealot', 'thief']) {
    assert.ok(sprites.heroSprite(id), `missing hero sprite for ${id}`);
  }
  for (const id of ['heavy_blade', 'longbow', 'staff', 'shield', 'mail_shirt', 'vial_of_stitchwort']) {
    assert.ok(sprites.itemSprite(id), `missing item sprite for ${id}`);
  }
});
