// @ts-check
/** Delve screen: exploration stays visible while combat opens in a separate overlay. */

import { el } from '../dom.js';
import { renderBoard } from '../board.js';
import { renderParty, renderLog } from '../hud.js';
import { currentRoom } from '../../core/dungeon.js';
import { activeActor, attackOptions, movementOptions, abilityOptions } from '../../core/combat.js';
import { abilitiesOf, usesRemaining } from '../../core/abilities.js';
import { stepOptions } from '../../core/exploration.js';

export function delveScreen({ session, pendingAbility, actions }) {
  const room = currentRoom(session.dungeon);
  const depth = `Room ${session.dungeon.current} of ${session.dungeon.depth - 1}`;
  const header = el('div.header', {}, [
    el('h1', { text: room.name }),
    el('span.meta', {}, [
      el('span', { text: depth }), el('span', { text: '  ' }),
      el('span.gold', { text: String(session.gold) }),
      el('span', { text: `  Stash ${session.stash.length}` }),
    ]),
  ]);
  const body = exploreBody(session, actions);
  if (session.phase === 'combat' && session.combat) {
    body.push(combatModal(session, pendingAbility, actions));
  }
  return el('div.stack', { style: 'flex:1; min-height:0;' }, [header, ...body]);
}

function exploreBody(session, actions) {
  const room = currentRoom(session.dungeon);
  const walking = session.phase === 'explore' && Boolean(room.fog);
  const reachable = walking
    ? new Set(stepOptions(room.tile, room.fog).map((c) => `${c.x},${c.y}`))
    : new Set();
  const board = renderBoard({
    tile: room.tile, actors: [], fog: room.fog ?? undefined, reachable,
    onCell: walking ? ({ x, y }) => actions.step({ x, y }) : undefined,
  });

  let hint = session.phase === 'combat' ? 'Combat interrupts exploration.' : 'Tap a lit cell to move.';
  let warn = session.phase === 'combat';
  let actionNodes = [el('button', { type: 'button', text: 'Abandon', onClick: actions.abandon })];

  if (session.phase === 'event') {
    hint = session.pending?.event?.text ?? 'Something happens.';
    warn = true;
    actionNodes.push(el('button.primary', { type: 'button', text: 'Go on', onClick: actions.acknowledge }));
  } else if (session.phase === 'loot') {
    hint = (session.pending?.lines ?? ['You find something.']).join(' ');
    const item = session.pending?.item;
    if (item && !session.pending?.assignedTo && session.stash.some((entry) => entry.id === item.id)) {
      for (const hero of session.party.filter((candidate) => candidate.alive)) {
        actionNodes.push(el('button', {
          type: 'button', text: `Give to ${hero.name}`,
          onClick: () => actions.assignItem(item.id, hero.id),
        }));
      }
    }
    actionNodes.push(el('button.primary', { type: 'button', text: 'Continue', onClick: actions.acknowledge }));
  }

  return [board, renderParty(session.party), renderLog(session.journal),
    el('p.hint', { class: warn ? 'warn' : '', text: hint }),
    el('div.actions', {}, actionNodes)];
}

function combatModal(session, pendingAbility, actions) {
  const combat = session.combat;
  const ordered = combat.order.map((id) => combat.actors.find((actor) => actor.id === id)).filter(Boolean);
  const queue = el('div.initiative', {}, ordered.map((actor, index) => el('span', {
    class: index === combat.turn ? 'current' : '',
    text: `${index + 1}. ${actor.name}`,
  })));
  return el('div.combat-overlay', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Combat' }, [
    el('div.combat-modal.stack', {}, [
      el('div.header', {}, [el('h1', { text: combat.tile.name ?? 'Combat' }), el('span.meta', { text: `Round ${combat.round}` })]),
      queue,
      ...combatBody(session, pendingAbility, actions),
    ]),
  ]);
}

function combatBody(session, pendingAbility, actions) {
  const combat = session.combat;
  const actor = activeActor(combat);
  const isHeroTurn = Boolean(actor && actor.side === 'hero' && actor.alive);
  const usable = isHeroTurn ? abilityOptions(combat) : [];
  const abilities = actor ? abilitiesOf(actor).filter((ability) => ability.kind !== 'passive').map((ability) => ({
    ability, option: usable.find((o) => o.ability.id === ability.id) ?? null,
    usesLeft: usesRemaining(actor, ability),
  })) : [];
  const selected = pendingAbility ? usable.find((option) => option.ability.id === pendingAbility) : null;
  let reachable = new Map();
  let targets = new Set();
  let allies = new Set();
  if (isHeroTurn && selected) {
    const cells = selected.targets.map((t) => `${t.x},${t.y}`);
    if (selected.ability.kind === 'heal') allies = new Set(cells);
    else targets = new Set(cells);
  } else if (isHeroTurn) {
    reachable = movementOptions(combat);
    const options = attackOptions(combat);
    targets = new Set([...options.melee, ...options.ranged].map((t) => `${t.x},${t.y}`));
  }

  const board = renderBoard({
    tile: combat.tile, actors: combat.actors, reachable, targets, allies, active: actor,
    onCell: isHeroTurn ? ({ x, y, actor: occupant }) => {
      if (selected && occupant) actions.useAbility(selected.ability.id, occupant);
      else if (occupant) actions.attack(occupant);
      else actions.move({ x, y });
    } : undefined,
  });

  const hint = isHeroTurn
    ? (selected ? `${selected.ability.name}: choose a target.` : `${actor.name}: ${combat.movementLeft} move left.`)
    : 'The enemy moves.';
  const bar = el('div.actions', {}, [
    ...abilities.map(({ ability, option, usesLeft }) => el('button', {
      type: 'button', class: ability.id === pendingAbility ? 'selected' : '',
      text: ability.uses === undefined ? ability.name : `${ability.name} (${usesLeft})`,
      disabled: !isHeroTurn || !option,
      onClick: () => actions.selectAbility(ability.id === pendingAbility ? null : ability.id),
    })),
    el('button', { type: 'button', text: 'Brace', disabled: !isHeroTurn || combat.hasActed, onClick: actions.brace }),
    el('button.primary', { type: 'button', text: 'End turn', disabled: !isHeroTurn, onClick: actions.endTurn }),
  ]);
  return [board, renderParty(session.party, isHeroTurn ? actor : undefined), renderLog(combat.log),
    el('p.hint', { class: isHeroTurn ? '' : 'warn', text: hint }), bar];
}
