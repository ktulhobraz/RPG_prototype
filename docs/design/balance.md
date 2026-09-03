# Balance

Balance here is measured, not judged by feel. `npm run sim` plays complete delves headlessly with
a scripted party controller (`src/core/autoplay.js`) and reports the numbers below. A dozen manual
playthroughs cannot separate a 20% win rate from a 45% one; a few hundred simulated delves can.

## Current figures

Over 600 delves with the default four heroes:

| Measure | Value |
|---------|-------|
| Win rate | ~52% |
| Rooms reached | 8.0 of 8 |
| Survivors | 1.5 of 4 |
| Average wipe room | 7.0 |

The shape matters as much as the win rate: parties almost always reach the objective and lose to
the boss, rather than bleeding out in room three. A delve should feel survivable but expensive.
These figures are from the current corruption-driven, cell-by-cell exploration model (below);
the original room-level pre-rolled model that produced the first ~48% baseline no longer exists.

## What the numbers cost to get there

The first working build sat at a **7.5% win rate**. Three things were wrong, and none of them
were dice tuning:

1. **Nothing healed.** A delve is roughly five fights, and no wounds came back between them, so
   attrition alone killed any party regardless of play. Fixed by `shortRest` in `state.js`:
   clearing a room restores a quarter of each survivor's maximum wounds. Partial on purpose —
   damage still accumulates across a delve, it just no longer accumulates monotonically.
2. **Abilities were data with no implementation.** Heroes listed abilities, including the caster's
   `mend`, that the engine never read. Implementing `src/core/abilities.js` gave the party its
   only in-combat healing.
3. **Encounters were too large, and the boss room stacked a second encounter on top of the boss.**
   The spawn budget dropped from `partySize * (0.8 + depth * 0.9)` to `partySize * (0.5 + depth * 0.6)`,
   and the boss escort shrank to a single extra monster.

## The corruption and exploration rework

Rooms no longer pre-roll their encounter at dungeon generation. Each delve rolls one *corruption*
— a theme (which restricts which monster faction can appear) and an intensity (`src/core/corruption.js`)
— once, fixed for the whole run. Within a room, the party walks the tile cell by cell
(`src/core/exploration.js`); each newly-visited cell has an independent chance of an ambush,
`min(0.5, 0.08 * intensity)`, capped at one ambush per room. The spawn budget itself is unchanged
from the figure above, with `intensity` as a second, independent multiplier — at `intensity = 1.0`
it reproduces the old formula exactly, which was the calibration target for the ranges in
`corruptions.json`.

This rework reproduced the pre-existing balance almost exactly (~52% against the prior ~48%) with
no further tuning needed — the spawn-budget math didn't change, only how and when it fires. Two
real bugs surfaced only under simulation, both structural rather than numeric:

- **A monster faction with no tier-1 entry goes silent for the first half of any delve that rolls
  it**, since the tier filter (`depthRatio > 0.6 ? tier 2 : tier 1`) excludes everything until
  halfway down. `content.js`'s `validateContent` now refuses to load a theme with no tier-1
  monster in its factions, so this fails at load time instead of surfacing as an unusually easy
  playthrough nobody can explain.
- **The scripted simulation bot deadlocked** the instant a forced ambush (the "spawn" event
  effect) resolved before the party had taken a single exploration step: it was still standing
  exactly on the room's door, and "path to the door" from the door itself has nowhere to go.
  Fixed in `autoExplore` (`src/core/autoplay.js`) by stepping off the door first when this happens.
  Real players are never blocked by this — a UI always offers *some* tap — but a stuck bot makes
  the balance simulation and the "every delve terminates" test both lie, so it needed the same
  fix as a real bug, not a simulation-only workaround.

## Guard rail

`tests/session.test.js` runs 150 simulated delves and fails outside a 20-80% win rate. It is a
crude band, not a target: it catches a change that makes the game trivial or unwinnable, which is
the failure mode that otherwise goes unnoticed until someone plays it. Tightening it further would
make the suite flaky for no gain.

## Retuning

The knobs worth reaching for first, in order of effect:

| Knob | Where |
|------|-------|
| Ambush frequency | `BASE_AMBUSH_CHANCE`, `MAX_AMBUSH_CHANCE` in `src/core/exploration.js` |
| Corruption intensity range (per theme) | `src/data/corruptions.json` |
| Encounter size | `rollEncounterSpawns` budget in `src/core/corruption.js` |
| Recovery between rooms | `SHORT_REST_FRACTION` in `src/core/state.js` |
| Boss escort | objective encounter in `createDungeon` |
| Healing strength and uses | `mend` in `src/core/abilities.js` |
| Individual stat blocks | `src/data/heroes.json`, `src/data/monsters.json` |

Change one, run `npm run sim 600`, and compare all five figures — win rate alone hides whether a
change made fights shorter or the party luckier.
