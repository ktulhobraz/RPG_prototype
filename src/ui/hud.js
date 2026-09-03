// @ts-check
/** Party status cards and the message log. */

import { el, woundClass } from './dom.js';
import { abilitiesOf, usesRemaining } from '../core/abilities.js';

/** @typedef {import('../core/entities.js').Actor} Actor */

/**
 * @param {Actor[]} party
 * @param {Actor} [active]  The hero whose turn it is, highlighted.
 */
export function renderParty(party, active) {
  return el('div.party', {}, party.map((hero) => {
    const state = woundClass(hero.wounds, hero.maxWounds);
    const classes = ['hero-card'];
    if (!hero.alive) classes.push('dead');
    if (active && hero.id === active.id) classes.push('turn');

    const limited = abilitiesOf(hero)
      .filter((a) => a.uses !== undefined)
      .map((a) => `${a.name} ${usesRemaining(hero, a)}`);

    const track = el('div.track', {}, [
      el('span', {
        class: state,
        style: `width: ${hero.alive ? Math.max(0, (hero.wounds / hero.maxWounds) * 100) : 0}%`,
      }),
    ]);

    return el('div', { class: classes.join(' ') }, [
      el('div.name', {}, [
        el('span', { text: hero.name }),
        el('span', {
          class: `wounds ${hero.alive ? state : ''}`,
          text: hero.alive ? `${hero.wounds}/${hero.maxWounds}` : 'down',
        }),
      ]),
      el('div.faint', {
        text: limited.length ? limited.join(' · ') : `level ${hero.level}`,
        style: 'font-size:12px',
      }),
      track,
    ]);
  }));
}

/**
 * @param {string[]} lines
 * @param {number} [limit]  Most recent entries to show.
 */
export function renderLog(lines, limit = 30) {
  const recent = lines.slice(-limit);
  // An empty bordered box reads as a broken element rather than an empty one.
  const content = recent.length
    ? recent.map((line) => el('p', { text: line }))
    : [el('p.faint', { text: 'Nothing has happened yet.' })];
  const log = el('div.log', { role: 'log' }, content);
  // Newest entry is at the bottom; scroll there after the node is in the document.
  queueMicrotask(() => { log.scrollTop = log.scrollHeight; });
  return log;
}
