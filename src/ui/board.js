// @ts-check
/**
 * The dungeon board.
 *
 * Rendered as DOM elements on a CSS grid rather than a canvas: a tile is at most a few dozen
 * cells, so the cost is trivial, and text scaling, focus rings and hit testing come for free.
 *
 * Fog is optional: combat renders the whole tile (nothing left to discover mid-fight), while
 * exploration passes the room's `Fog` so unrevealed cells stay dark regardless of what's
 * actually there — a wall and an unvisited floor cell must be indistinguishable until revealed.
 */

import { el, woundClass } from './dom.js';
import { cellAt, WALL, HAZARD } from '../core/grid.js';

/** @typedef {import('../core/grid.js').Tile} Tile */
/** @typedef {import('../core/entities.js').Actor} Actor */
/** @typedef {import('../core/exploration.js').Fog} Fog */

/**
 * @param {object} args
 * @param {Tile} args.tile
 * @param {Actor[]} args.actors            Occupants to draw, if any.
 * @param {Map<string, number>} [args.reachable]  Cells the party/active actor can move to.
 * @param {Set<string>} [args.targets]     Cells holding a legal attack target.
 * @param {Set<string>} [args.allies]      Cells holding a legal friendly target.
 * @param {Actor} [args.active]            The actor whose turn it is.
 * @param {Fog} [args.fog]                 Room fog; omitted means nothing is hidden (combat).
 * @param {(payload: {x: number, y: number, actor: Actor | undefined}) => void} [args.onCell]
 * @returns {HTMLElement}
 */
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
  const sensed = Boolean(
    fog && !unseen && !occupant && fog.contentKnown.has(key) && !fog.visitedCells.has(key),
  );

  const classes = ['cell'];
  if (unseen) classes.push('unseen');
  if (code === WALL) classes.push('wall');
  if (code === HAZARD) classes.push('hazard');
  if (sensed) classes.push('sensed');
  if (reachable?.has(key)) classes.push('reachable');
  if (targets?.has(key)) classes.push('targetable');
  if (allies?.has(key)) classes.push('healable');
  if (occupant) classes.push(occupant.side === 'hero' ? 'hero' : 'monster');
  if (active && occupant?.id === active.id) classes.push('active');

  const interactive = Boolean(
    onCell && !unseen && code !== WALL && (reachable?.has(key) || targets?.has(key) || allies?.has(key)),
  );

  // Cells are buttons only when they can be acted on, so a phone's focus order skips scenery.
  const cell = el(interactive ? 'button' : 'div', {
    class: classes.join(' '),
    type: interactive ? 'button' : undefined,
    'aria-label': describeCell({ unseen, sensed, code, occupant, x, y }),
    disabled: interactive ? false : undefined,
    onClick: interactive ? () => onCell({ x, y, actor: occupant }) : undefined,
  });

  if (occupant) {
    cell.append(el('span.glyph', { text: occupant.glyph }));
    const track = el('div.bar');
    const fill = el('span', {
      class: woundClass(occupant.wounds, occupant.maxWounds),
      style: `width: ${Math.max(0, (occupant.wounds / occupant.maxWounds) * 100)}%`,
    });
    track.append(fill);
    cell.append(track);
  } else if (sensed) {
    cell.append(el('span.glyph.sense-mark', { text: '?', 'aria-hidden': 'true' }));
  }
  return cell;
}

/** @param {{unseen: boolean, sensed: boolean, code: string | null, occupant: Actor | undefined, x: number, y: number}} args */
function describeCell({ unseen, sensed, code, occupant, x, y }) {
  if (unseen) return `unexplored, ${x}, ${y}`;
  if (occupant) return `${occupant.name}, ${occupant.wounds} of ${occupant.maxWounds} wounds`;
  if (sensed) return `something sensed here, ${x}, ${y}`;
  if (code === WALL) return 'wall';
  if (code === HAZARD) return `hazard at ${x}, ${y}`;
  return `floor at ${x}, ${y}`;
}
