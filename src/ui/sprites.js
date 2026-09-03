// @ts-check
/** Generated art atlas mapping for UI-only rendering. */

import { el } from './dom.js';

/** @typedef {[number, number]} SpriteCoord */

const HERO = Object.freeze({
  warrior: [0, 1],
  slayer: [1, 1],
  ranger: [2, 1],
  scholar: [3, 1],
  zealot: [4, 1],
  thief: [5, 1],
});

const MONSTER = Object.freeze({
  ratkin: [1, 2],
  ratkin_slinger: [1, 2],
  ratkin_brute: [1, 2],
  beastman: [7, 2],
  husk: [2, 2],
  risen: [2, 2],
  tallow_cultist: [3, 2],
  bloat_spawn: [5, 2],
  warlock: [3, 2],
  troll: [7, 2],
});

const ITEM = Object.freeze({
  heavy_blade: [0, 3],
  twin_axes: [0, 3],
  flail: [0, 3],
  longbow: [2, 3],
  throwing_knives: [1, 3],
  keen_dagger: [1, 3],
  staff: [3, 3],
  shield: [4, 3],
  lockpicks: [4, 4],
  mail_shirt: [6, 3],
  plated_coat: [5, 3],
  swift_boots: [7, 3],
  warding_charm: [1, 4],
  hunters_ring: [0, 4],
  grim_talisman: [1, 4],
  vial_of_stitchwort: [2, 4],
});

const UI = Object.freeze({
  inventory: [0, 5],
  character: [1, 5],
  gold: [2, 5],
  combat: [3, 5],
  move: [4, 5],
  attack: [5, 5],
  defend: [6, 5],
  heal: [7, 5],
});

const TERRAIN = Object.freeze({
  floor0: [0, 0],
  floor1: [1, 0],
  floor2: [2, 0],
  wall: [3, 0],
  hazard: [4, 0],
  door: [5, 0],
  exit: [6, 0],
  fog: [7, 0],
});

/** @param {SpriteCoord | null | undefined} coord */
export function spriteStyle(coord) {
  if (!coord) return '';
  const x = (coord[0] / 7) * 100;
  const y = (coord[1] / 5) * 100;
  return `--sprite-x:${x}%;--sprite-y:${y}%;`;
}

/** @param {SpriteCoord | null | undefined} coord @param {string} [className] */
export function spriteNode(coord, className = '') {
  if (!coord) return null;
  return el('span.sprite', {
    class: className,
    style: spriteStyle(coord),
    'aria-hidden': 'true',
  });
}

/** @param {string} id */
export const heroSprite = (id) => /** @type {SpriteCoord | null} */ (HERO[id] ?? null);

/** @param {string} id */
export const monsterSprite = (id) => /** @type {SpriteCoord | null} */ (MONSTER[id] ?? null);

/** @param {string} id */
export const itemSprite = (id) => /** @type {SpriteCoord | null} */ (ITEM[id] ?? null);

/** @param {string} id */
export const uiSprite = (id) => /** @type {SpriteCoord | null} */ (UI[id] ?? null);

/** @param {string} id */
export const terrainSprite = (id) => /** @type {SpriteCoord | null} */ (TERRAIN[id] ?? null);

/** @param {any} actor */
export function actorSprite(actor) {
  return actor.side === 'hero' ? heroSprite(actor.dataId) : monsterSprite(actor.dataId);
}
