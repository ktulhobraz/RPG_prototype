# Balance

Balance here is measured, not judged by feel. `npm run sim` plays complete delves headlessly with
a scripted party controller (`src/core/autoplay.js`) and reports the numbers below. Manual play is
still needed for UX and tactical feel, but not for pretending four anecdotes are statistics.

## Current figures

GitHub Actions for PR #4 ran 400 delves on the revised flow:

| Measure | Value |
|---------|-------|
| Win rate | 50.0% |
| Rooms reached | 7.99 of 8 |
| Gold | 85 |
| Survivors | 0.84 of 4 |
| Average wipe room | 6.99 |

The win rate remains near the previous ~52% baseline and parties still almost always reach the
objective. Survivor count is materially lower than the previous ~1.5/4 sample, so this is a real
balance signal to watch even though the broad 20-80% guard remains green. Do not tune it from one
400-run sample alone; compare another 600+ run after any numeric change.

## Recovery

Recovery no longer happens automatically after each combat. Reaching the room's runtime exit is
the recovery point, immediately before the between-room event. Each injured living hero heals:

`d6 + (base Toughness - 3)`, minimum 1.

`base Toughness` is the immutable authored stat. Equipment that raises effective Toughness does
not also improve recovery. This keeps armour from quietly becoming a regeneration item.

The earlier fixed `25% max Wounds` short rest is historical and is no longer the active rule.

## Corruption and exploration

Each delve rolls one corruption theme and intensity, fixed for the run. Newly visited exploration
cells roll an ambush chance of `min(0.5, 0.08 * intensity)`, capped at one ambush per room. Encounter
size still comes from `rollEncounterSpawns`, with intensity layered on top of depth.

The exploration entrance and exit are now separate. The authored `+` cell is the spawn entrance;
a seeded runtime exit is selected among distant reachable cells. The exit cannot itself trigger an
ambush, trap, or treasure. The simulation controller follows the same runtime exit through
`state.step` as the player UI.

## Combat geometry

Triggered encounters no longer fight on the exploration tile. Combat chooses an authored tile from
`src/data/battlefields.json` through the seeded RNG. This changes tactical geometry while leaving
the encounter budget formula untouched, so balance changes from battlefield layout should be
measured rather than inferred.

## Guard rail

`tests/session.test.js` runs 150 simulated delves and fails outside a 20-80% win rate. It is a
coarse regression guard, not a target. GitHub Actions additionally runs `npm run sim 400` on each
PR and push to `main`.

## Retuning

Preferred knobs, roughly in order of leverage:

| Knob | Where |
|------|-------|
| Ambush frequency | `BASE_AMBUSH_CHANCE`, `MAX_AMBUSH_CHANCE` in `src/core/exploration.js` |
| Corruption intensity range | `src/data/corruptions.json` |
| Encounter size | `rollEncounterSpawns` in `src/core/corruption.js` |
| Exit recovery | `shortRest` in `src/core/state.js` |
| Battlefield geometry | `src/data/battlefields.json` |
| Boss escort | objective encounter in `createDungeon` |
| Healing strength and uses | `mend` in `src/core/abilities.js` |
| Individual stat blocks | `src/data/heroes.json`, `src/data/monsters.json` |

Change one numeric lever at a time, run at least 600 delves, and compare all reported figures. Win
rate alone can hide a prototype where everyone technically wins while three quarters of the party
are routinely carried out in buckets.
