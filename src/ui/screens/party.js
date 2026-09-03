// @ts-check
/** Party selection: pick four heroes, then descend. */

import { el, replace } from '../dom.js';

export const PARTY_SIZE = 4;

/**
 * @param {object} args
 * @param {any[]} args.heroes
 * @param {string[]} args.selected
 * @param {boolean} args.hasSave
 * @param {(ids: string[]) => void} args.onToggle
 * @param {() => void} args.onStart
 * @param {() => void} args.onContinue
 * @returns {HTMLElement}
 */
export function partyScreen({ heroes, selected, hasSave, onToggle, onStart, onContinue }) {
  const remaining = PARTY_SIZE - selected.length;

  const roster = el('div.roster', {}, heroes.map((hero) => {
    const isSelected = selected.includes(hero.id);
    // A full party locks the remaining choices rather than silently swapping someone out.
    const locked = !isSelected && remaining === 0;
    const p = hero.profile;

    return el('button.panel.roster-item', {
      type: 'button',
      class: isSelected ? 'selected' : '',
      disabled: locked,
      'aria-pressed': String(isSelected),
      onClick: () => onToggle(
        isSelected ? selected.filter((id) => id !== hero.id) : [...selected, hero.id],
      ),
    }, [
      el('span.mark', { text: hero.glyph ?? hero.name[0] }),
      el('span.body', {}, [
        el('div.who', { text: hero.name }),
        el('div.blurb', { text: hero.blurb ?? '' }),
        el('div.stats', {
          text: `WS ${p.ws} · BS ${p.bs} · S ${p.str} · T ${p.tou} · W ${p.wounds} · move ${p.move}`,
        }),
      ]),
    ]);
  }));

  return el('div.stack', {}, [
    el('div', {}, [
      el('h1.title', { text: 'Deep Delve' }),
      el('p.subtitle', {
        text: remaining > 0
          ? `Choose ${remaining} more ${remaining === 1 ? 'hero' : 'heroes'}.`
          : 'Your party is ready.',
      }),
    ]),
    roster,
    el('div.actions', {}, [
      hasSave && el('button', { type: 'button', text: 'Continue delve', onClick: onContinue }),
      el('button.primary', {
        type: 'button',
        text: 'Descend',
        disabled: remaining !== 0,
        onClick: onStart,
      }),
    ]),
  ]);
}
