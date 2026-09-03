// @ts-check
/** Scripted controller used by balance simulation. */

import {
  activeActor, attackOptions, movementOptions, moveTo, attack, defend,
  abilityOptions, useAbility,
} from './combat.js';
import { distance, floorCells, findPath } from './grid.js';
import { stepOptions } from './exploration.js';
import { currentRoom } from './dungeon.js';
import { endHeroTurn, step } from './state.js';

function pathToNearestUnvisited(tile, fog) {
  const exitKey = `${fog.exitCell.x},${fog.exitCell.y}`;
  const candidates = floorCells(tile)
    .filter((c) => !fog.visitedCells.has(`${c.x},${c.y}`) && `${c.x},${c.y}` !== exitKey)
    .sort((a, b) => a.y - b.y || a.x - b.x);
  let best = null;
  for (const cell of candidates) {
    const path = findPath(tile, fog.partyCell, cell);
    if (path && (!best || path.length < best.length)) best = path;
  }
  return best;
}

export function autoExplore(session) {
  const room = currentRoom(session.dungeon);
  const fog = room?.fog;
  if (!fog) return session;
  if (!fog.ambushSpent) {
    const path = pathToNearestUnvisited(room.tile, fog);
    if (path) return step(session, path[0]);
  }
  const path = findPath(room.tile, fog.partyCell, fog.exitCell);
  return path && path.length ? step(session, path[0]) : session;
}

export function takeHeroTurn(session) {
  const combat = session.combat;
  if (!combat) return session;
  const actor = activeActor(combat);
  if (!actor || actor.side !== 'hero') return session;
  const enemies = combat.actors.filter((a) => a.alive && a.side === 'monster');
  if (enemies.length === 0) return endHeroTurn(session);

  for (const option of abilityOptions(combat)) {
    if (option.ability.kind !== 'heal') continue;
    const patient = option.targets.slice().sort((a, b) => a.wounds / a.maxWounds - b.wounds / b.maxWounds)[0];
    if (patient && patient.wounds <= patient.maxWounds * 0.5) {
      useAbility(combat, option.ability.id, patient, session.rules, session.rng);
      return endHeroTurn(session);
    }
  }

  let options = attackOptions(combat);
  const inReach = [...options.melee, ...options.ranged];
  if (inReach.length) {
    const target = inReach.slice().sort((a, b) => a.wounds - b.wounds)[0];
    attack(combat, target, options.melee.some((t) => t.id === target.id) ? 'melee' : 'ranged', session.rules, session.rng);
    return endHeroTurn(session);
  }

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
    attack(combat, target, options.melee.some((t) => t.id === target.id) ? 'melee' : 'ranged', session.rules, session.rng);
  } else if (!best) {
    defend(combat, session.rng);
  }
  return endHeroTurn(session);
}

export function playSession(session, handlers) {
  let guard = 0;
  const LIMIT = 20000;
  while (session.phase !== 'victory' && session.phase !== 'defeat' && guard++ < LIMIT) {
    if (session.phase === 'combat') takeHeroTurn(session);
    else if (session.phase === 'event' || session.phase === 'loot') handlers.acknowledge(session);
    else autoExplore(session);
  }
  return session;
}
