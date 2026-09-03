// @ts-check
/** Single-hero development arena. Intentionally separate from delve progression and saves. */

import { el } from '../dom.js';
import { renderBoard } from '../board.js';
import { renderParty, renderLog } from '../hud.js';
import { heroTokenSprite, spriteNode } from '../sprites.js';
import { activeActor, attackOptions, movementOptions, abilityOptions } from '../../core/combat.js';
import { abilitiesOf, usesRemaining } from '../../core/abilities.js';
import { currentArenaOpponent, nextArenaOpponent } from '../../core/arena.js';

export function arenaSetupScreen({ heroes, selectedHeroId, onSelect, onStart, onBack }) {
  return el('div.stack', { style: 'flex:1; min-height:0;' }, [
    el('div', {}, [
      el('h1.title', { text: 'Test Arena' }),
      el('p.subtitle', { text: 'Choose one hero. Each matchup starts from that hero’s baseline loadout and full health.' }),
    ]),
    el('div.roster', {}, heroes.map((hero) => {
      const selected = hero.id === selectedHeroId;
      const portrait = spriteNode(heroTokenSprite(hero.id), 'roster-portrait');
      return el('button.panel.roster-item', {
        type: 'button',
        class: selected ? 'selected' : '',
        'aria-pressed': String(selected),
        onClick: () => onSelect(hero.id),
      }, [
        el('span.mark', {}, [portrait ?? el('span', { text: hero.glyph ?? hero.name[0] })]),
        el('span.body', {}, [
          el('div.who', { text: hero.name }),
          el('div.blurb', { text: hero.blurb ?? '' }),
          el('div.stats', {
            text: `WS ${hero.profile.ws} · BS ${hero.profile.bs} · S ${hero.profile.str} · T ${hero.profile.tou} · W ${hero.profile.wounds} · move ${hero.profile.move}`,
          }),
        ]),
      ]);
    })),
    el('div.actions', {}, [
      el('button', { type: 'button', text: 'Back', onClick: onBack }),
      el('button.primary', { type: 'button', text: 'Start arena', disabled: !selectedHeroId, onClick: onStart }),
    ]),
  ]);
}

export function arenaScreen({ arena, pendingAbility, actions }) {
  const opponent = currentArenaOpponent(arena);
  const header = el('div.header', {}, [
    el('h1', { text: 'Test Arena' }),
    el('span.meta', { text: opponent ? `Wins ${arena.wins} · ${opponent.name}` : `Wins ${arena.wins}` }),
    el('button', { type: 'button', text: 'Exit', onClick: actions.exitArena }),
  ]);

  if (arena.phase === 'combat' && arena.combat) {
    return el('div.stack', { style: 'flex:1; min-height:0;' }, [header, ...arenaCombatBody(arena, pendingAbility, actions)]);
  }

  const log = arena.combat ? renderLog(arena.combat.log) : null;
  if (arena.phase === 'between') {
    const next = nextArenaOpponent(arena);
    return el('div.stack', { style: 'flex:1; min-height:0;' }, [
      header,
      el('div.panel', {}, [
        el('h2', { text: 'Match won' }),
        el('p.muted', { text: `${opponent?.name ?? 'Opponent'} defeated. The selected hero will be reset before the next test fight.` }),
      ]),
      renderParty(arena.party),
      log,
      el('div.actions', {}, [
        el('button', { type: 'button', text: 'Retry opponent', onClick: actions.retryArena }),
        el('button.primary', { type: 'button', text: `Next: ${next?.name ?? 'opponent'}`, onClick: actions.nextArena }),
      ]),
    ].filter(Boolean));
  }

  return el('div.stack', { style: 'flex:1; min-height:0;' }, [
    header,
    el('div.panel', {}, [
      el('h2', { text: 'Hero defeated' }),
      el('p.muted', { text: `${opponent?.name ?? 'The opponent'} won this matchup. Retry starts from the same clean baseline.` }),
    ]),
    renderParty(arena.party),
    log,
    el('div.actions', {}, [
      el('button.primary', { type: 'button', text: 'Retry opponent', onClick: actions.retryArena }),
      el('button', { type: 'button', text: 'Exit arena', onClick: actions.exitArena }),
    ]),
  ].filter(Boolean));
}

function arenaCombatBody(arena, pendingAbility, actions) {
  const combat = arena.combat;
  const actor = activeActor(combat);
  const isHeroTurn = Boolean(actor && actor.side === 'hero' && actor.alive);
  const usable = isHeroTurn ? abilityOptions(combat) : [];
  const abilities = actor ? abilitiesOf(actor).filter((ability) => ability.kind !== 'passive').map((ability) => ({
    ability,
    option: usable.find((entry) => entry.ability.id === ability.id) ?? null,
    usesLeft: usesRemaining(actor, ability),
  })) : [];
  const selected = pendingAbility ? usable.find((option) => option.ability.id === pendingAbility) : null;

  let reachable = new Map();
  let targets = new Set();
  let allies = new Set();
  if (isHeroTurn && selected) {
    const cells = selected.targets.map((target) => `${target.x},${target.y}`);
    if (selected.ability.kind === 'heal') allies = new Set(cells);
    else targets = new Set(cells);
  } else if (isHeroTurn) {
    reachable = movementOptions(combat);
    const options = attackOptions(combat);
    targets = new Set([...options.melee, ...options.ranged].map((target) => `${target.x},${target.y}`));
  }

  const board = renderBoard({
    tile: combat.tile,
    actors: combat.actors,
    reachable,
    targets,
    allies,
    active: actor,
    onCell: isHeroTurn ? ({ x, y, actor: occupant }) => {
      if (selected && occupant) actions.useAbility(selected.ability.id, occupant);
      else if (occupant) actions.attack(occupant);
      else actions.move({ x, y });
    } : undefined,
  });

  const ordered = combat.order.map((id) => combat.actors.find((candidate) => candidate.id === id)).filter(Boolean);
  const queue = el('div.initiative', {}, ordered.map((candidate, index) => el('span', {
    class: index === combat.turn ? 'current' : '',
    text: `${index + 1}. ${candidate.name}`,
  })));
  const hint = isHeroTurn
    ? (selected ? `${selected.ability.name}: choose a target.` : `${actor.name}: ${combat.movementLeft} move left.`)
    : 'The enemy moves.';
  const bar = el('div.actions', {}, [
    ...abilities.map(({ ability, option, usesLeft }) => el('button', {
      type: 'button',
      class: ability.id === pendingAbility ? 'selected' : '',
      text: ability.uses === undefined ? ability.name : `${ability.name} (${usesLeft})`,
      disabled: !isHeroTurn || !option,
      onClick: () => actions.selectAbility(ability.id === pendingAbility ? null : ability.id),
    })),
    el('button', { type: 'button', text: 'Brace', disabled: !isHeroTurn || combat.hasActed, onClick: actions.brace }),
    el('button.primary', { type: 'button', text: 'End turn', disabled: !isHeroTurn, onClick: actions.endTurn }),
  ]);

  return [
    queue,
    board,
    renderParty(arena.party, isHeroTurn ? actor : undefined),
    renderLog(combat.log),
    el('p.hint', { class: isHeroTurn ? '' : 'warn', text: hint }),
    bar,
  ];
}
