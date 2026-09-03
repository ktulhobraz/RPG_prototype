// @ts-check
/** End of delve: what happened, and an offer to go again. */

import { el } from '../dom.js';
import { renderLog } from '../hud.js';

/** @typedef {import('../../core/state.js').Session} Session */

/**
 * @param {object} args
 * @param {Session} args.session
 * @param {() => void} args.onAgain
 * @returns {HTMLElement}
 */
export function outcomeScreen({ session, onAgain }) {
  const won = session.phase === 'victory';
  const survivors = session.party.filter((h) => h.alive);
  // The entrance is never shown or counted (startSession walks straight past it) — see the same
  // adjustment in delve.js's header.
  const rooms = session.dungeon.current;
  const totalRooms = session.dungeon.depth - 1;

  const rows = [
    ['Rooms cleared', `${rooms} of ${totalRooms}`],
    ['Gold recovered', String(session.gold)],
    ['Survivors', `${survivors.length} of ${session.party.length}`],
    ['Seed', session.seed],
  ];

  return el('div.stack', {}, [
    el('div.center', {}, [
      el('p', {
        class: `outcome ${won ? 'win' : 'loss'}`,
        text: won ? 'The party returns' : 'The dungeon keeps them',
      }),
      el('p.subtitle', {
        text: won
          ? 'Bloodied, lighter in the pack, and alive.'
          : 'No one carries word of what happened down there.',
      }),
    ]),

    el('div.panel.tally', {}, rows.map(([label, value]) => el('div', {}, [
      el('span.muted', { text: label }),
      el('span.value', { text: value }),
    ]))),

    el('div.panel', {}, [
      el('div.muted', { text: 'The party', style: 'margin-bottom:6px' }),
      ...session.party.map((hero) => el('div', {
        class: hero.alive ? '' : 'faint',
        text: `${hero.name} — ${hero.alive ? `level ${hero.level}, ${hero.wounds}/${hero.maxWounds}` : 'lost'}`,
        style: 'font-size:14px',
      })),
    ]),

    renderLog(session.journal, 12),

    el('div.actions', {}, [
      el('button.primary', { type: 'button', text: 'Delve again', onClick: onAgain }),
    ]),
  ]);
}
