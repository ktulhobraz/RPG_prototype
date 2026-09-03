// @ts-check
/** Dungeon/battle board renderer. */

import { el, woundClass } from './dom.js';
import { cellAt, WALL, HAZARD, DOOR } from '../core/grid.js';
import { actorSprite, spriteNode, terrainSprite } from './sprites.js';

export function renderBoard({ tile, actors = [], reachable, targets, allies, active, fog, onCell }) {
  const board = el('div.board', {
    style: `grid-template-columns: repeat(${tile.w}, var(--cell));`,
    role: 'grid',
    'aria-label': 'Dungeon room',
  });
  for (let y = 0; y < tile.h; y++) {
    for (let x = 0; x < tile.w; x++) {
      board.append(renderCell({ tile, x, y, actors, reachable, targets, allies, active, fog, onCell }));
    }
  }
  return el('div.board-wrap', {}, [board]);
}

function renderCell({ tile, x, y, actors, reachable, targets, allies, active, fog, onCell }) {
  const key = `${x},${y}`;
  const unseen = Boolean(fog && !fog.revealed.has(key));
  const code = unseen ? null : cellAt(tile, x, y);
  const occupant = unseen ? undefined : actors.find((a) => a.alive && a.x === x && a.y === y);
  const sensed = Boolean(fog && !unseen && !occupant && fog.contentKnown.has(key) && !fog.visitedCells.has(key));
  const exit = Boolean(fog && !unseen && fog.exitCell && fog.exitCell.x === x && fog.exitCell.y === y);

  const classes = ['cell'];
  if (unseen) classes.push('unseen');
  if (code === WALL) classes.push('wall');
  if (code === HAZARD) classes.push('hazard');
  if (sensed) classes.push('sensed');
  if (exit) classes.push('exit');
  if (reachable?.has(key)) classes.push('reachable');
  if (targets?.has(key)) classes.push('targetable');
  if (allies?.has(key)) classes.push('healable');
  if (occupant) classes.push(occupant.side === 'hero' ? 'hero' : 'monster');
  if (active && occupant?.id === active.id) classes.push('active');

  const interactive = Boolean(onCell && !unseen && code !== WALL
    && (reachable?.has(key) || targets?.has(key) || allies?.has(key)));
  const cell = el(interactive ? 'button' : 'div', {
    class: classes.join(' '), type: interactive ? 'button' : undefined,
    'aria-label': describeCell({ unseen, sensed, exit, code, occupant, x, y }),
    disabled: interactive ? false : undefined,
    onClick: interactive ? () => onCell({ x, y, actor: occupant }) : undefined,
  });

  const terrain = spriteNode(terrainFor({ unseen, exit, code, x, y }), 'terrain-sprite');
  if (terrain) cell.append(terrain);

  if (occupant) {
    const portrait = spriteNode(actorSprite(occupant), 'actor-sprite');
    if (portrait) cell.append(portrait);
    else cell.append(el('span.glyph', { text: occupant.glyph }));
    const track = el('div.bar');
    track.append(el('span', {
      class: woundClass(occupant.wounds, occupant.maxWounds),
      style: `width: ${Math.max(0, (occupant.wounds / occupant.maxWounds) * 100)}%`,
    }));
    cell.append(track);
  } else if (exit) {
    cell.append(el('span.glyph.exit-mark', { text: '⇩', 'aria-hidden': 'true' }));
  } else if (sensed) {
    cell.append(el('span.glyph.sense-mark', { text: '?', 'aria-hidden': 'true' }));
  }
  return cell;
}

function terrainFor({ unseen, exit, code, x, y }) {
  if (unseen) return terrainSprite('fog');
  if (exit) return terrainSprite('exit');
  if (code === WALL) return terrainSprite('wall');
  if (code === HAZARD) return terrainSprite('hazard');
  if (code === DOOR) return terrainSprite('door');
  return terrainSprite(`floor${Math.abs((x * 3 + y * 5) % 3)}`);
}

function describeCell({ unseen, sensed, exit, code, occupant, x, y }) {
  if (unseen) return `unexplored, ${x}, ${y}`;
  if (occupant) return `${occupant.name}, ${occupant.wounds} of ${occupant.maxWounds} wounds`;
  if (exit) return `exit to the next room at ${x}, ${y}`;
  if (sensed) return `something sensed here, ${x}, ${y}`;
  if (code === WALL) return 'wall';
  if (code === HAZARD) return `hazard at ${x}, ${y}`;
  return `floor at ${x}, ${y}`;
}
