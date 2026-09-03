// @ts-check
/**
 * The delve screen: exploration, combat, events and loot all share one frame.
 *
 * Interaction is tap-only and modeless by default: a highlighted floor cell moves the active
 * hero, a highlighted enemy attacks it. Selecting an ability from the action bar switches the
 * board into that ability's targeting mode until it is used or cancelled.
 */

import { el } from '../dom.js';
import { renderBoard } from '../board.js';
import { renderParty, renderLog } from '../hud.js';
import { currentRoom } from '../../core/dungeon.js';
import { activeActor, attackOptions, movementOptions, abilityOptions } from '../../core/combat.js';
import { abilitiesOf, usesRemaining } from '../../core/abilities.js';
import { stepOptions } from '../../core/exploration.js';

/** @typedef {import('../../core/state.js').Session} Session */

/**
 * @param {object} args
 * @param {Session} args.session
 * @param {string | null} args.pendingAbility  Ability id currently in targeting mode.
 * @param {object} args.actions                Callbacks into the controller.
 * @returns {HTMLElement}
 */
export function delveScreen({ session, pendingAbility, actions }) {
  const room = currentRoom(session.dungeon);
  // The entrance is never shown (startSession walks straight past it), so it doesn't count
  // toward the displayed total either — the first room the party actually sees reads "1 of N".
  const depth = `Room ${session.dungeon.current} of ${session.dungeon.depth - 1}`;

  const header = el('div.header', {}, [
    el('h1', { text: room.name }),
    el('span.meta', {}, [
      el('span', { text: depth }),
      el('span', { text: '  ' }),
      el('span.gold', { text: String(session.gold) }),
    ]),
  ]);

  const body = session.phase === 'combat'
    ? combatBody(session, pendingAbility, actions)
    : exploreBody(session, actions);

  return el('div.stack', { style: 'flex:1; min-height:0;' }, [header, ...body]);
}

/* ---------- exploration, events and loot ---------- */

/**
 * @param {Session} session
 * @param {any} actions
 */
function exploreBody(session, actions) {
  const room = currentRoom(session.dungeon);
  const walking = session.phase === 'explore' && Boolean(room.fog);

  // Tap-to-move: a highlighted, already-revealed neighbour cell is the only thing offered —
  // stepOptions already excludes walls, so nothing more needs filtering here.
  const reachable = walking
    ? new Set(stepOptions(room.tile, room.fog).map((c) => `${c.x},${c.y}`))
    : new Set();

  const board = renderBoard({
    tile: room.tile,
    actors: [],
    fog: room.fog ?? undefined,
    reachable,
    onCell: walking ? ({ x, y }) => actions.step({ x, y }) : undefined,
  });

  let hint = 'Tap a lit cell to move.';
  let warn = false;
  let acknowledgeBar = null;

  if (session.phase === 'event') {
    hint = session.pending?.event?.text ?? 'Something happens.';
    warn = true;
    acknowledgeBar = { label: 'Go on', onAct: actions.acknowledge };
  } else if (session.phase === 'loot') {
    hint = (session.pending?.lines ?? ['You find something.']).join(' ');
    acknowledgeBar = { label: 'Take it', onAct: actions.acknowledge };
  }

  const actionsBar = acknowledgeBar
    ? el('div.actions', {}, [
        el('button', { type: 'button', text: 'Abandon', onClick: actions.abandon }),
        el('button.primary', { type: 'button', text: acknowledgeBar.label, onClick: acknowledgeBar.onAct }),
      ])
    : el('div.actions', {}, [
        el('button', { type: 'button', text: 'Abandon', onClick: actions.abandon }),
      ]);

  return [
    board,
    renderParty(session.party),
    renderLog(session.journal),
    el('p.hint', { class: warn ? 'warn' : '', text: hint }),
    actionsBar,
  ];
}

/* ---------- combat ---------- */

/**
 * @param {Session} session
 * @param {string | null} pendingAbility
 * @param {any} actions
 */
function combatBody(session, pendingAbility, actions) {
  const combat = session.combat;
  const actor = activeActor(combat);
  const isHeroTurn = Boolean(actor && actor.side === 'hero' && actor.alive);

  // Every active ability the hero owns is shown, usable or not: a button that vanishes when
  // spent hides the ability from a player who has not seen it work yet, and shifts the bar
  // under their thumb mid-fight.
  const usable = isHeroTurn ? abilityOptions(combat) : [];
  const abilities = actor
    ? abilitiesOf(actor)
        .filter((ability) => ability.kind !== 'passive')
        .map((ability) => ({
          ability,
          option: usable.find((o) => o.ability.id === ability.id) ?? null,
          usesLeft: usesRemaining(actor, ability),
        }))
    : [];
  const selected = pendingAbility
    ? usable.find((option) => option.ability.id === pendingAbility)
    : null;

  /** @type {Map<string, number>} */
  let reachable = new Map();
  /** @type {Set<string>} */
  let targets = new Set();
  /** @type {Set<string>} */
  let allies = new Set();

  if (isHeroTurn && selected) {
    // Ability targeting replaces the default highlights entirely, so the board never shows two
    // meanings for one tap.
    const cells = selected.targets.map((t) => `${t.x},${t.y}`);
    if (selected.ability.kind === 'heal') allies = new Set(cells);
    else targets = new Set(cells);
  } else if (isHeroTurn) {
    reachable = movementOptions(combat);
    const options = attackOptions(combat);
    targets = new Set([...options.melee, ...options.ranged].map((t) => `${t.x},${t.y}`));
  }

  const board = renderBoard({
    tile: combat.tile,
    actors: combat.actors,
    reachable,
    targets,
    allies,
    active: actor,
    onCell: isHeroTurn
      ? ({ x, y, actor: occupant }) => {
          if (selected && occupant) actions.useAbility(selected.ability.id, occupant);
          else if (occupant) actions.attack(occupant);
          else actions.move({ x, y });
        }
      : undefined,
  });

  const hint = isHeroTurn
    ? (selected
        ? `${selected.ability.name}: choose a target.`
        : `${actor.name} — ${combat.movementLeft} move left. Tap a cell to move, an enemy to attack.`)
    : 'The enemy moves.';

  const bar = el('div.actions', {}, [
    ...abilities.map(({ ability, option, usesLeft }) => el('button', {
      type: 'button',
      class: ability.id === pendingAbility ? 'selected' : '',
      text: ability.uses === undefined ? ability.name : `${ability.name} (${usesLeft})`,
      disabled: !isHeroTurn || !option,
      onClick: () => actions.selectAbility(ability.id === pendingAbility ? null : ability.id),
    })),
    el('button', {
      type: 'button',
      text: 'Brace',
      disabled: !isHeroTurn || combat.hasActed,
      onClick: actions.brace,
    }),
    el('button.primary', {
      type: 'button',
      text: 'End turn',
      disabled: !isHeroTurn,
      onClick: actions.endTurn,
    }),
  ]);

  return [
    board,
    renderParty(session.party, isHeroTurn ? actor : undefined),
    renderLog(combat.log),
    el('p.hint', { class: isHeroTurn ? '' : 'warn', text: hint }),
    bar,
  ];
}
