// @ts-check
/**
 * A scripted hero controller.
 *
 * It exists for balance simulation, not for the player: running thousands of delves headlessly
 * is the only honest way to compare two rule systems. It plays competently but not optimally —
 * attack what is adjacent, otherwise close on the weakest reachable enemy.
 */

import {
  activeActor, attackOptions, movementOptions, moveTo, attack, defend,
  abilityOptions, useAbility,
} from './combat.js';
import { distance } from './grid.js';
import { endHeroTurn } from './state.js';

/** @typedef {import('./state.js').Session} Session */

/**
 * Play one hero turn.
 * @param {Session} session
 */
export function takeHeroTurn(session) {
  const combat = session.combat;
  if (!combat) return session;
  const actor = activeActor(combat);
  if (!actor || actor.side !== 'hero') return session;

  const enemies = combat.actors.filter((a) => a.alive && a.side === 'monster');
  if (enemies.length === 0) return endHeroTurn(session);

  // Heal a badly hurt ally before anything else — the limited uses are worth spending on
  // someone about to die, and holding them to the end of a delve wastes them entirely.
  for (const option of abilityOptions(combat)) {
    if (option.ability.kind !== 'heal') continue;
    const patient = option.targets
      .slice()
      .sort((a, b) => a.wounds / a.maxWounds - b.wounds / b.maxWounds)[0];
    if (patient && patient.wounds <= patient.maxWounds * 0.5) {
      useAbility(combat, option.ability.id, patient, session.rules, session.rng);
      return endHeroTurn(session);
    }
  }

  // Finish off whatever is already in reach before moving anywhere.
  let options = attackOptions(combat);
  const inReach = [...options.melee, ...options.ranged];
  if (inReach.length) {
    const target = inReach.slice().sort((a, b) => a.wounds - b.wounds)[0];
    const kind = options.melee.some((t) => t.id === target.id) ? 'melee' : 'ranged';
    attack(combat, target, kind, session.rules, session.rng);
    return endHeroTurn(session);
  }

  // Otherwise close the distance on the weakest enemy.
  const goal = enemies.slice().sort((a, b) => a.wounds - b.wounds)[0];
  const cells = movementOptions(combat);
  let best = null;
  let bestDistance = distance(actor, goal);
  for (const [key] of cells) {
    const [x, y] = key.split(',').map(Number);
    const d = distance({ x, y }, goal);
    if (d < bestDistance) { bestDistance = d; best = { x, y }; }
  }
  if (best) moveTo(combat, best);

  options = attackOptions(combat);
  const reachable = [...options.melee, ...options.ranged];
  if (reachable.length) {
    const target = reachable.slice().sort((a, b) => a.wounds - b.wounds)[0];
    const kind = options.melee.some((t) => t.id === target.id) ? 'melee' : 'ranged';
    attack(combat, target, kind, session.rules, session.rng);
  } else if (!best) {
    // Nothing to hit and nowhere useful to go.
    defend(combat, session.rng);
  }
  return endHeroTurn(session);
}

/**
 * Play a session to completion.
 * @param {Session} session
 * @param {(s: Session) => Session} step  Usually `explore`/`acknowledge` from state.js.
 * @param {object} handlers
 * @returns {Session}
 */
export function playSession(session, handlers) {
  let guard = 0;
  while (session.phase !== 'victory' && session.phase !== 'defeat' && guard++ < 5000) {
    if (session.phase === 'combat') takeHeroTurn(session);
    else if (session.phase === 'event' || session.phase === 'loot') handlers.acknowledge(session);
    else handlers.explore(session);
  }
  return session;
}
