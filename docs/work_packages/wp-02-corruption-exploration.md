# WP-02 — Corruption and Spatial Exploration

## Goal

Replace the pre-rolled, room-level encounter model from WP-01 with a delve-wide corruption
(theme + intensity) that drives probabilistic, per-step ambushes as the party walks each room
cell by cell under a fog of war — matching the tabletop-crawler shape the project targets, rather
than a sequence of instantly-resolved rooms behind a single "press on" button.

## Scope

- `src/core/corruption.js`: one theme + intensity rolled per delve, fixed for its length; theme
  restricts which monster faction can appear, intensity scales the existing depth-based spawn
  budget as a second, independent multiplier
- `src/data/corruptions.json`: four original, non-Games-Workshop themes (undead, a generic ruin
  faction, one specific ruinous power, vermin), each with a guaranteed tier-1 monster
- `src/core/exploration.js`: room-local fog of war (`enterRoom`, `revealAround`, `stepOptions`,
  `stepInto`), per-cell trap/treasure content, and the per-step ambush roll (at most one per room)
- Reveal radius driven passively by the party's average Initiative — no new player action, no new
  resource or cost
- `src/core/combat.js`: `placement:'inPlace'`, spreading a party that shares one exploration cell
  into distinct combat cells; the boss keeps the original fresh-room placement unchanged
- `src/core/state.js`: `step()` replaces the room-transition half of the old `explore()`; a middle
  room's `cleared` flag now means "no ambush is currently live in it," not "pre-rolled and won"
- Save/restore carries `dungeon.corruption` and each room's fog verbatim; a fight resumed after
  reload needs no special case, since `ambushSpent` is set before combat is ever created
- `src/core/autoplay.js`: `autoExplore` walks a room the same way the real UI does, through the
  same `state.js` calls, so the balance simulation exercises the real code path
- UI: fog masking and tap-to-move on the room board (`src/ui/board.js`, `src/ui/screens/delve.js`)

## Out of scope

- A separate top-level dungeon map (exploration stays within a room's existing tile grid; the
  room's one door cell is reused as its only exit, not a new authored `exits` field)
- Multiple ambushes per room, or corruption intensity that escalates mid-delve
- Any new player-facing action or resource for scouting
- Additional corruption themes beyond the four shipped (the pattern supports more as pure data)
- Settlement, campaign, procedural generation — unchanged from WP-01's deferred list

## Files changed

| Path | Action |
|------|--------|
| `src/core/corruption.js` | Create |
| `src/core/exploration.js` | Create |
| `src/data/corruptions.json` | Create |
| `src/data/monsters.json` | Update (`faction` field; new tier-1/2 entries per theme) |
| `src/core/dungeon.js` | Update (rooms no longer pre-roll an encounter; `depthRatioOf`) |
| `src/core/combat.js` | Update (`placement:'inPlace'`, `ambushCells`, `fanOutCells`) |
| `src/core/state.js` | Update (`step`, `spawnAmbush`, `crossDoor`, `spawnBoss`; `explore` removed) |
| `src/core/save.js` | Update (`corruption`, per-room `fog`, `forceAmbush`) |
| `src/core/autoplay.js` | Update (`autoExplore`) |
| `src/ui/board.js`, `src/ui/screens/delve.js`, `src/ui/screens/outcome.js`, `src/ui/app.js` | Update |
| `docs/design/balance.md` | Update |
| `docs/decisions.md` | Update (D-24..D-27) |
| `tests/corruption.test.js`, `tests/exploration.test.js`, `tests/combat.test.js` | Create/extend |

## Acceptance criteria

- [ ] `npm test` passes; `src/core` purity (`tests/purity.test.js`) still holds
- [ ] A dungeon's corruption theme and intensity are fixed at generation and never re-rolled,
      including across a save/reload
- [ ] Every corruption theme has a tier-1 monster, enforced at content load, not just by test
- [ ] At most one ambush fires per room; an ambush pre-empts unresolved content on the same cell
      rather than losing it
- [ ] `npm run sim 600` win rate stays inside the existing 20-80% guard band
- [ ] The mobile UI renders fog correctly (unrevealed cells indistinguishable from each other
      regardless of true content), supports tap-to-move, and a full delve is completable by touch
      alone with no console errors and no horizontal overflow

## Risks

| Risk | Mitigation |
|------|------------|
| A themed encounter pool silently produces nothing at low depth | `content.js` refuses to load a theme with no tier-1 monster in its factions |
| Exploration's single shared party position doesn't fit combat's per-actor grid | `fanOutCells` spreads the party from that one cell before combat places anyone else |
| The scripted simulation bot deadlocks on a case a human player never hits (e.g. a forced ambush resolving before any step) | Fixed as a real bug in `autoExplore`, not special-cased away — the same code path drives both the bot and the UI |
| Corruption and depth-based scaling fight each other instead of combining cleanly | Intensity is a pure multiplier on the existing budget formula; at intensity 1.0 it reproduces the old formula exactly |
