// @ts-check
/** Purpose-specific generated art mapping for UI-only rendering. */

import { el } from './dom.js';

/** @typedef {{atlas:string,x:number,y:number,cols:number,rows:number}} SpriteRef */

/** @returns {SpriteRef} */
const ref = (atlas, x, cols, y = 0, rows = 1) => Object.freeze({ atlas, x, y, cols, rows });

const HERO_PORTRAIT = Object.freeze({
  warrior: ref('hero-portraits', 0, 3, 0, 2),
  slayer: ref('hero-portraits', 1, 3, 0, 2),
  ranger: ref('hero-portraits', 2, 3, 0, 2),
  scholar: ref('hero-portraits', 0, 3, 1, 2),
  zealot: ref('hero-portraits', 1, 3, 1, 2),
  thief: ref('hero-portraits', 2, 3, 1, 2),
});

const HERO_TOKEN = Object.freeze({
  warrior: ref('hero-tokens', 0, 3, 0, 2),
  slayer: ref('hero-tokens', 1, 3, 0, 2),
  ranger: ref('hero-tokens', 2, 3, 0, 2),
  scholar: ref('hero-tokens', 0, 3, 1, 2),
  zealot: ref('hero-tokens', 1, 3, 1, 2),
  thief: ref('hero-tokens', 2, 3, 1, 2),
});

const MONSTER = Object.freeze({
  ratkin: ref('enemy-tokens', 0, 4, 0, 2),
  ratkin_slinger: ref('enemy-tokens', 0, 4, 0, 2),
  ratkin_brute: ref('enemy-tokens', 0, 4, 0, 2),
  beastman: ref('enemy-tokens', 3, 4, 1, 2),
  husk: ref('enemy-tokens', 2, 4, 0, 2),
  risen: ref('enemy-tokens', 2, 4, 0, 2),
  tallow_cultist: ref('enemy-tokens', 3, 4, 0, 2),
  bloat_spawn: ref('enemy-tokens', 1, 4, 1, 2),
  warlock: ref('enemy-tokens', 3, 4, 0, 2),
});

const ITEM = Object.freeze({
  heavy_blade: ref('items-r0', 0, 4),
  twin_axes: ref('items-r0', 0, 4),
  flail: ref('items-r0', 0, 4),
  longbow: ref('items-r0', 2, 4),
  throwing_knives: ref('items-r0', 1, 4),
  keen_dagger: ref('items-r0', 1, 4),
  staff: ref('items-r0', 3, 4),
  shield: ref('items-r1', 0, 4),
  lockpicks: ref('items-r3', 0, 4),
  mail_shirt: ref('items-r1', 2, 4),
  plated_coat: ref('items-r1', 2, 4),
  swift_boots: ref('items-r1', 3, 4),
  warding_charm: ref('items-r2', 1, 4),
  hunters_ring: ref('items-r2', 0, 4),
  grim_talisman: ref('items-r2', 1, 4),
  vial_of_stitchwort: ref('items-r2', 2, 4),
});

const UI = Object.freeze({
  inventory: ref('items-r3', 3, 4),
  gold: ref('items-r3', 1, 4),
});

const TERRAIN = Object.freeze({
  floor0: ref('tiles-r0', 0, 4),
  floor1: ref('tiles-r0', 1, 4),
  floor2: ref('tiles-r0', 2, 4),
  fog: ref('tiles-r0', 3, 4),
  wall: ref('tiles-r1', 0, 4),
  obstacle: ref('tiles-r1', 1, 4),
  hazard: ref('tiles-r1', 2, 4),
  trap: ref('tiles-r1', 3, 4),
  door: ref('tiles-r2', 0, 4),
  exit: ref('tiles-r2', 1, 4),
  treasure: ref('tiles-r2', 2, 4),
  objective: ref('tiles-r2', 3, 4),
});

/** @param {SpriteRef | null | undefined} sprite */
export function spriteStyle(sprite) {
  if (!sprite) return '';
  const x = sprite.cols <= 1 ? 0 : (sprite.x / (sprite.cols - 1)) * 100;
  const y = sprite.rows <= 1 ? 0 : (sprite.y / (sprite.rows - 1)) * 100;
  return `--sprite-x:${x}%;--sprite-y:${y}%;`;
}

/** @param {SpriteRef | null | undefined} sprite @param {string} [className] */
export function spriteNode(sprite, className = '') {
  if (!sprite) return null;
  return el('span', {
    class: `sprite atlas-${sprite.atlas}${className ? ` ${className}` : ''}`,
    style: spriteStyle(sprite),
    'aria-hidden': 'true',
  });
}

/** @param {string} id */
export const heroSprite = (id) => /** @type {SpriteRef | null} */ (HERO_PORTRAIT[id] ?? null);

/** @param {string} id */
export const heroTokenSprite = (id) => /** @type {SpriteRef | null} */ (HERO_TOKEN[id] ?? null);

/** @param {string} id */
export const monsterSprite = (id) => /** @type {SpriteRef | null} */ (MONSTER[id] ?? null);

/** @param {string} id */
export const itemSprite = (id) => /** @type {SpriteRef | null} */ (ITEM[id] ?? null);

/** @param {string} id */
export const uiSprite = (id) => /** @type {SpriteRef | null} */ (UI[id] ?? null);

/** @param {string} id */
export const terrainSprite = (id) => /** @type {SpriteRef | null} */ (TERRAIN[id] ?? null);

/** @param {any} actor */
export function actorSprite(actor) {
  return actor.side === 'hero' ? heroTokenSprite(actor.dataId) : monsterSprite(actor.dataId);
}
