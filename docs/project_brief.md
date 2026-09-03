# Project Brief

## Current project summary

**RPG_prototype** is a **party-based dungeon crawler** set in a grim low-fantasy world.
The player leads a warband of four heroes into a dungeon, room by room, fighting on a tactical
grid and pulling out with whatever loot they survive to carry.

The first **executable** prototype is a static, no-build web page playable **from a mobile browser**
and deployable through GitHub Pages.

## Superseded direction

> The previous **survival / shelter meta-character** direction — where the player represented a
> shelter and dispatched NPC squads on expeditions — is no longer the active design.

Decisions D-01, D-02 and D-04 are retained in `docs/decisions.md` for history but marked
**superseded**. Do not treat shelter management, NPC-squad dispatch, or the pharmacy scavenging
vertical slice as current scope.

The even earlier "main hero + companions" note is also obsolete for a different reason: this project
now has a **party of four player-controlled heroes** with no single protagonist.

## Genre and reference shape

Tabletop-dungeon-crawler shape: top-down, tile-based dungeon assembled from a deck of room tiles,
a fixed party of four, turn-based combat on a small grid, event rolls between rooms.

1. **Party select** — pick four heroes from the roster.
2. **Explore** — the party walks each room cell by cell under fog of war, revealed by
   Initiative-driven scouting. The authored `+` tile is the entrance only. A separate seeded exit
   is placed on a distant passable cell when the room is entered. Newly-stepped cells can trigger
   a corruption ambush, trap, or treasure; the exit itself is safe.
3. **Corruption** — each delve is touched by one theme and intensity, fixed for its length. The
   theme decides which monsters can appear; the intensity scales how large an ambush is, layered
   on top of the existing depth-based difficulty curve.
4. **Combat** — encounters open on a separate authored battlefield, presented as a combat overlay
   while the exploration room state remains intact. Every hero and monster rolls individual
   initiative (`d6 + Initiative`) into one visible turn queue.
5. **Loot / inventory** — gold is shared. Found items enter a party stash; the player can assign
   an item to a specific living hero, after which existing equipment modifiers affect that hero.
   The delve UI exposes a dedicated **Party inventory** button for the stash. Tapping a hero's
   party icon opens a read-only modal with that hero's current characteristics, abilities and
   personal inventory. This is a visibility/character-sheet foundation, not yet a full equipment
   management screen.
6. **Rest / transition** — reaching the room exit passively restores injured living heroes by
   `d6 + (base Toughness - 3)`, minimum 1, then resolves the between-room event and continues.
7. **Objective room** — boss encounter on a battlefield, loot, end of the delve.
8. **Outcome** — result screen, experience and gold, progress saved locally.

## Rules

Fast tabletop-style **d6** resolution: to-hit cross-reference, `d6 + Strength` damage, Toughness
subtracted, Wounds removed. Every roll is delegated to a rule system behind a single contract, so
`combat.js` contains no dice logic.

A second, percentile system shipped briefly and was **removed**: it doubled the balancing surface
for one game and measured far worse (1.7% win rate against d6's 7.5%). The contract survives
because it keeps dice out of the engine, not because a replacement is planned.

## v0.1 target — vertical slice

Prove one complete delve end-to-end on a phone. Scope ceiling:

- 1 dungeon, 4 playable heroes, 5-6 monster types
- 8-10 exploration room tiles, a small authored battlefield set, ~12 events, ~15 items
- Balance verified by simulation, not by feel

## Technical direction

- **Static client-side only.** No backend, accounts, cloud saves, or online services.
- **Vanilla ES modules, no bundler.** Files are served as authored; `package.json` exists only to
  enable Node's built-in test runner and declares **zero dependencies**.
- **Core logic separate from UI.** `src/core/**` is pure: no `document`, no `window`,
  no `localStorage`, no `Math.random()`. All randomness flows through an injected seeded PRNG.
- **Mobile-first, touch-only.** Portrait layout, tap-to-move and tap-to-target, no hover,
  no drag, no keyboard dependency. Party-character and inventory views use touch-friendly modal
  overlays rather than introducing a separate navigation framework.
- **Generated prototype art is UI-only.** The current tiles, portraits and item icons are packed into
  `assets/game-atlas.webp` and selected by `src/ui/sprites.js`. Missing semantic matches deliberately
  fall back to the existing glyphs instead of changing content or rules to fit an image.
- **Content separate from engine.** Every name, description and stat block lives in `src/data/*.json`.
  Exploration rooms and battlefields are authored data; the engine contains no setting-specific
  vocabulary. No third-party art, fonts or logos are used.

## Deferred / out of scope

- Settlement or hub between delves, campaign structure, factions, economy
- Procedural generation (the tile deck is authored, not generated)
- Crafting and **complex** inventory rules such as encumbrance, weight, durability, capacity limits
- Manual equip/unequip flows, drag-and-drop item management, equipment-slot UI
- Deep NPC relationship simulation
- Final PC engine or production stack (still unresolved)
- Backend, accounts, cloud saves, online play
- Shelter management and NPC-squad expeditions (superseded, see above)
