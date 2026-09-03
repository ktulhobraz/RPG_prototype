import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const ART_FILES = [
  'hero-portraits.webp',
  'hero-tokens.webp',
  'enemy-tokens.webp',
  'tiles-row0.webp',
  'tiles-row1.webp',
  'tiles-row2.webp',
  'items-row0.webp',
  'items-row1.webp',
  'items-row2.webp',
  'items-row3.webp',
];

test('party detail, sprite and delve UI modules import without side effects', async () => {
  const details = await import('../src/ui/party_details.js');
  const sprites = await import('../src/ui/sprites.js');
  const delve = await import('../src/ui/screens/delve.js');
  assert.equal(typeof details.heroDetailsModal, 'function');
  assert.equal(typeof details.stashModal, 'function');
  assert.equal(typeof sprites.heroSprite, 'function');
  assert.equal(typeof sprites.heroTokenSprite, 'function');
  assert.equal(typeof sprites.itemSprite, 'function');
  assert.equal(typeof delve.delveScreen, 'function');
});

test('party and sprite stylesheets are loaded by the page', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /styles\/party\.css/);
  assert.match(html, /styles\/sprites\.css/);
});

test('purpose-specific generated art files are valid WebP and wired by CSS', async () => {
  const css = readFileSync(new URL('../styles/sprites.css', import.meta.url), 'utf8');
  for (const file of ART_FILES) {
    const assetUrl = new URL(`../assets/art/${file}`, import.meta.url);
    assert.equal(existsSync(assetUrl), true, `missing ${file}`);
    const asset = readFileSync(assetUrl);
    assert.equal(asset.subarray(0, 4).toString('ascii'), 'RIFF', `${file} is not RIFF`);
    assert.equal(asset.subarray(8, 12).toString('ascii'), 'WEBP', `${file} is not WebP`);
    assert.ok(asset.length > 2_000, `${file} is unexpectedly small`);
    assert.match(css, new RegExp(file.replace('.', '\\.')));
  }
  assert.doesNotMatch(css, /game-atlas-v2\.webp/);

  const sprites = await import('../src/ui/sprites.js');
  for (const id of ['warrior', 'slayer', 'ranger', 'scholar', 'zealot', 'thief']) {
    assert.ok(sprites.heroSprite(id), `missing hero portrait for ${id}`);
    assert.ok(sprites.heroTokenSprite(id), `missing hero token for ${id}`);
  }
  for (const id of ['ratkin', 'beastman', 'husk', 'tallow_cultist', 'bloat_spawn', 'warlock']) {
    assert.ok(sprites.monsterSprite(id), `missing mapped monster token for ${id}`);
  }
  assert.equal(sprites.monsterSprite('goblin'), null);
  assert.equal(sprites.monsterSprite('troll'), null);
  for (const id of ['heavy_blade', 'longbow', 'staff', 'shield', 'mail_shirt', 'vial_of_stitchwort']) {
    assert.ok(sprites.itemSprite(id), `missing item sprite for ${id}`);
  }
  for (const id of ['floor0', 'wall', 'hazard', 'door', 'exit', 'fog']) {
    assert.ok(sprites.terrainSprite(id), `missing terrain sprite for ${id}`);
  }
});
