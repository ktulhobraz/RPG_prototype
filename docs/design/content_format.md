# Content Format

All content is data. The engine imports no setting vocabulary.

## `heroes.json` / `monsters.json`

```json
{
  "id": "warrior",
  "name": "Warrior",
  "role": "melee",
  "profile": { "ws": 4, "bs": 3, "str": 4, "tou": 4, "wounds": 12,
               "init": 3, "attacks": 1, "move": 4 },
  "abilities": ["cleave"],
  "glyph": "W"
}
```

`glyph` is a single character drawn on the board; no image assets are used.

## `rooms.json`

An exploration tile is an authored grid. It contains exactly one `+` entrance cell. The exit is
**not authored into the tile**: `enterRoom` chooses a seeded distant passable cell at runtime and
stores it in the room fog state as `exitCell`.

```json
{
  "id": "hall",
  "name": "Old Hall",
  "w": 7,
  "h": 5,
  "kind": "room",
  "cells": ["###+###", "#.....#", "#..#..#", "#.....#", "#######"]
}
```

`#` wall, `.` floor, `+` entrance, `~` hazard.

The runtime exit is excluded from trap/treasure placement and resolves before ambush checks, so
stepping onto it is always a room transition rather than another encounter roll.

## `battlefields.json`

Combat geometry is separate from exploration geometry. Battlefields are authored tiles selected
through the seeded PRNG when an encounter starts.

```json
{
  "id": "stone_arena",
  "name": "Stone Arena",
  "kind": "battlefield",
  "w": 9,
  "h": 7,
  "cells": ["#########", "#.......#", "#..#.#..#", "#.......#", "#..#.#..#", "#.......#", "#########"]
}
```

A battlefield does not need an exploration entrance or exit. Combat placement uses passable cells
on the battlefield itself.

## `events.json`

```json
{ "id": "cave_in", "weight": 3, "text": "...",
  "effect": { "kind": "damage", "target": "random", "amount": 2 } }
```

Effect kinds: `damage`, `heal`, `gold`, `spawn`, `item`, `none`.

An `item` event places the rolled item into the party stash; it does not auto-equip a hero.

## `items.json`

```json
{ "id": "keen_blade", "name": "Keen Blade", "slot": "weapon",
  "mods": { "str": 1 }, "value": 40, "loot": true }
```

Found items enter the party stash. Assigning an item to a hero calls the existing equipment logic:
consumables remain carried, while slotted equipment replaces the previous item in that slot and
applies its numeric `mods` to the hero's effective canonical profile.

The prototype deliberately does not model weight, encumbrance, durability, capacity, or item size.

## `corruptions.json`

Each record defines a delve-wide corruption theme, its permitted monster factions, and the range
from which the seeded intensity multiplier is rolled.

## Re-skinning

Replacing the records in `src/data/*.json` changes names, stat blocks, room geometry and battlefield
geometry without moving setting vocabulary into the engine.
