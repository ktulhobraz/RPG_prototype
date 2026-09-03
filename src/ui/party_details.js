// @ts-check
/** Read-only party detail overlays: hero sheet/inventory and shared stash. */

import { el } from './dom.js';
import { abilitiesOf, usesRemaining } from '../core/abilities.js';
import { heroTokenSprite, itemSprite, spriteNode } from './sprites.js';

const STAT_ROWS = [
  ['ws', 'WS'], ['bs', 'BS'], ['str', 'STR'], ['tou', 'TOU'],
  ['init', 'INIT'], ['attacks', 'ATK'], ['move', 'MOVE'],
];

/** @param {any} item */
function itemMeta(item) {
  const parts = [];
  if (item.slot) parts.push(item.slot);
  const mods = Object.entries(item.mods ?? {})
    .filter(([, value]) => typeof value === 'number' && value !== 0)
    .map(([key, value]) => `${key.toUpperCase()} ${Number(value) > 0 ? '+' : ''}${value}`);
  if (mods.length) parts.push(mods.join(', '));
  if (typeof item.heals === 'number') parts.push(`heals ${item.heals}`);
  return parts.join(' · ');
}

/** @param {any[]} items */
function inventoryList(items) {
  if (!items.length) return el('p.faint', { text: 'Empty.' });
  return el('div.inventory-list', {}, items.map((item) => {
    const icon = spriteNode(itemSprite(item.id), 'inventory-item-icon');
    return el('div.inventory-item', {}, [
      icon,
      el('div.inventory-item-copy', {}, [
        el('div.inventory-item-name', { text: item.name }),
        el('div.faint', { text: itemMeta(item) || 'No modifiers' }),
      ]),
    ]);
  }));
}

/** @param {any} hero */
function statGrid(hero) {
  const cells = STAT_ROWS.map(([key, label]) => {
    const current = hero.canon?.[key];
    const base = hero.baseCanon?.[key];
    const changed = typeof current === 'number' && typeof base === 'number' && current !== base;
    return el('div.stat-cell', {}, [
      el('span.stat-label', { text: label }),
      el('strong', { text: String(current ?? '—') }),
      changed ? el('span.stat-base', { text: `base ${base}` }) : null,
    ]);
  });
  cells.push(el('div.stat-cell', {}, [
    el('span.stat-label', { text: 'WOUNDS' }),
    el('strong', { text: `${hero.wounds}/${hero.maxWounds}` }),
  ]));
  return el('div.stat-grid', {}, cells);
}

/** @param {any} hero */
function abilityList(hero) {
  const abilities = abilitiesOf(hero);
  if (!abilities.length) return el('p.faint', { text: 'No abilities.' });
  return el('div.ability-list', {}, abilities.map((ability) => {
    const uses = ability.uses === undefined ? '' : ` · ${usesRemaining(hero, ability)}/${ability.uses} uses`;
    return el('div.ability-card', {}, [
      el('div.ability-name', { text: `${ability.name}${uses}` }),
      el('div.faint', { text: ability.description }),
    ]);
  }));
}

function overlay(title, body, onClose, ariaLabel) {
  return el('div.party-overlay', { role: 'dialog', 'aria-modal': 'true', 'aria-label': ariaLabel }, [
    el('div.party-modal.stack', {}, [
      el('div.header', {}, [
        el('h1', { text: title }),
        el('button.modal-close', { type: 'button', text: 'Close', onClick: onClose }),
      ]),
      ...body,
    ]),
  ]);
}

/** @param {{hero:any,onClose:()=>void}} args */
export function heroDetailsModal({ hero, onClose }) {
  const portrait = spriteNode(heroTokenSprite(hero.dataId), 'character-portrait');
  return overlay(hero.name, [
    el('div.character-summary', {}, [
      el('div.character-glyph', {}, [portrait ?? el('span', { text: hero.glyph })]),
      el('div', {}, [
        el('div', { text: `Level ${hero.level} · ${hero.role}` }),
        el('div.faint', { text: `${hero.xp} XP${hero.alive ? '' : ' · down'}` }),
      ]),
    ]),
    el('section.detail-section', {}, [
      el('h2', { text: 'Character' }),
      statGrid(hero),
    ]),
    el('section.detail-section', {}, [
      el('h2', { text: 'Abilities' }),
      abilityList(hero),
    ]),
    el('section.detail-section', {}, [
      el('h2', { text: `Inventory (${hero.items.length})` }),
      inventoryList(hero.items),
    ]),
  ], onClose, `${hero.name} character sheet and inventory`);
}

/** @param {{stash:any[],onClose:()=>void}} args */
export function stashModal({ stash, onClose }) {
  return overlay(`Party inventory (${stash.length})`, [
    el('p.muted', { text: 'Shared loot waiting to be assigned to a hero.' }),
    inventoryList(stash),
  ], onClose, 'Party inventory');
}
