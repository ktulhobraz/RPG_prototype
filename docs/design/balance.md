# Balance

Balance here is measured, not judged by feel. `npm run sim` plays complete delves headlessly with
a scripted party controller (`src/core/autoplay.js`) and reports the numbers below. A dozen manual
playthroughs cannot separate a 20% win rate from a 45% one; a few hundred simulated delves can.

## Current figures

Over 600 delves with the default four heroes:

| Measure | Value |
|---------|-------|
| Win rate | ~48% |
| Rooms reached | 7.9 of 8 |
| Survivors | 1.5 of 4 |
| Average wipe room | 6.8 |

The shape matters as much as the win rate: parties almost always reach the objective and lose to
the boss, rather than bleeding out in room three. A delve should feel survivable but expensive.

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

## Guard rail

`tests/session.test.js` runs 150 simulated delves and fails outside a 20-80% win rate. It is a
crude band, not a target: it catches a change that makes the game trivial or unwinnable, which is
the failure mode that otherwise goes unnoticed until someone plays it. Tightening it further would
make the suite flaky for no gain.

## Retuning

The knobs worth reaching for first, in order of effect:

| Knob | Where |
|------|-------|
| Encounter size | `rollSpawns` budget in `src/core/dungeon.js` |
| Recovery between rooms | `SHORT_REST_FRACTION` in `src/core/state.js` |
| Boss escort | objective encounter in `createDungeon` |
| Healing strength and uses | `mend` in `src/core/abilities.js` |
| Individual stat blocks | `src/data/heroes.json`, `src/data/monsters.json` |

Change one, run `npm run sim 600`, and compare all five figures — win rate alone hides whether a
change made fights shorter or the party luckier.
