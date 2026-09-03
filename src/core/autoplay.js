// @ts-check
/**
 * A scripted party controller: fights competently but not optimally (attack what's adjacent,
 * otherwise close on the weakest enemy), and explores by walking to whatever's unvisited, then
 * the door once nothing's left or the room's one ambush has already fired.
 *
 * It exists for balance simulation, not for the player: running thousands of delves headlessly,
 * through the same `state.js` calls the real UI makes, is the only honest way to catch a balance
 * regression before someone plays into it. See docs/design/balance.md.
 */

import {
  activeActor, attackOptions, movementOptions, moveTo, attack, defend,
  abilityOptions, useAbility,
} from './combat.js';
import { distance, floorCells, findPath } from './grid.js';
import { findDoor, stepOptions } from './exploration.js';
import { currentRoom } from './dungeon.js';
import { endHeroTurn, step } from './state.js';

/** @typedef {import('./state.js').Session} Session */

/**
 * Find the shortest path to the nearest cell not yet visited this room, by actual path length
 * (not raw distance, since walls matter) — ties broken by a stable coordinate order so the same
 * seed explores the same way every time.
 *
 * @param {import('./grid.js').Tile} tile
 * @param {import('./exploration.js').Fog} fog
 * @returns {{x: number, y: number}[] | null}
 */
function pathToNearestUnvisited(tile, fog) {
  const candidates = floorCells(tile)
    .filter((c) => !fog.visitedCells.has(`${c.x},${c.y}`))
    .sort((a, b) => a.y - b.y || a.x - b.x);

  let best = null;
  for (const cell of candidates) {
    const path = findPath(tile, fog.partyCell, cell);
    if (path && (!best || path.length < best.length)) best = path;
  }
  return best;
}

/**
 * Walk the current room one cell at a time: head for whatever hasn't been seen yet while the
 * room's one ambush is still available, otherwise head straight for the door. Exercises the
 * exact same `state.step` the real UI calls — coverage of the walking code path, not a shortcut
 * around it.
 *
 * @param {Session} session
 */
export function autoExplore(session) {
  const room = currentRoom(session.dungeon);
  const fog = room?.fog;
  if (!fog) return session; // the entrance/objective have no walkable fog

  if (!fog.ambushSpent) {
    const path = pathToNearestUnvisited(room.tile, fog);
    if (path) return step(session, path[0]);
  }

  const door = findDoor(room.tile);
  if (fog.partyCell.x === door.x && fog.partyCell.y === door.y) {
    // Already standing on the door — e.g. a forced ambush (a "spawn" event) resolved before the
    // party ever took a single exploration step. findPath(door, door) has nothing to return, so
    // step off it first; the next call paths back deliberately, which is what triggers "exit."
    const options = stepOptions(room.tile, fog);
    return options.length ? step(session, options[0]) : session;
  }
  const path = findPath(room.tile, fog.partyCell, door);
  return path && path.length ? step(session, path[0]) : session;
}

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
 * @param {object} handlers
 * @param {(s: Session) => Session} handlers.acknowledge  Usually `acknowledge` from state.js.
 * @returns {Session}
 */
export function playSession(session, handlers) {
  let guard = 0;
  // A cell-by-cell walk takes more calls per room than the old single "press on" advance did,
  // so the ceiling is higher than 5000 might suggest is needed — verified empirically against
  // the "every delve terminates" test rather than picked in the abstract.
  const LIMIT = 20000;
  while (session.phase !== 'victory' && session.phase !== 'defeat' && guard++ < LIMIT) {
    if (session.phase === 'combat') takeHeroTurn(session);
    else if (session.phase === 'event' || session.phase === 'loot') handlers.acknowledge(session);
    else autoExplore(session);
  }
  return session;
}
