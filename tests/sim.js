#!/usr/bin/env node
/**
 * Balance simulation.
 *
 * Runs many delves headlessly and reports win rate, length and attrition. Tuning by feel across
 * a dozen manual playthroughs is guesswork; this is the measurement that replaces it.
 *
 * Usage: node tests/sim.js [runs]
 */

import { startSession, acknowledge } from '../src/core/state.js';
import { playSession } from '../src/core/autoplay.js';
import { loadTestContent, DEFAULT_PARTY } from './helpers.js';

/**
 * @param {number} count
 * @param {string[]} [party]
 */
export function simulate(count, party = DEFAULT_PARTY) {
  let wins = 0;
  let totalRooms = 0;
  let totalGold = 0;
  let survivors = 0;
  /** @type {number[]} */
  const deathRooms = [];

  for (let i = 0; i < count; i++) {
    const content = loadTestContent();
    const session = startSession({ content, heroIds: party, seed: `sim-${i}` });
    playSession(session, { acknowledge });

    if (session.phase === 'victory') wins++;
    totalRooms += session.dungeon.current + 1;
    totalGold += session.gold;
    const alive = session.party.filter((h) => h.alive).length;
    survivors += alive;
    if (alive === 0) deathRooms.push(session.dungeon.current);
  }

  return {
    runs: count,
    winRate: wins / count,
    avgRooms: totalRooms / count,
    avgGold: totalGold / count,
    avgSurvivors: survivors / count,
    avgWipeRoom: deathRooms.length
      ? deathRooms.reduce((a, b) => a + b, 0) / deathRooms.length
      : null,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const runs = Number(process.argv[2] ?? 300);
  const r = simulate(runs);
  console.log(`Simulated ${r.runs} delves\n`);
  console.log(`  win rate       ${(r.winRate * 100).toFixed(1)}%`);
  console.log(`  rooms reached  ${r.avgRooms.toFixed(2)}`);
  console.log(`  gold           ${r.avgGold.toFixed(0)}`);
  console.log(`  survivors      ${r.avgSurvivors.toFixed(2)} of 4`);
  console.log(`  avg wipe room  ${r.avgWipeRoom === null ? 'n/a' : r.avgWipeRoom.toFixed(2)}`);
}
