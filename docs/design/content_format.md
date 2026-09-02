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
  "overrides": { "d100": { "ws": 55 } },
  "abilities": ["cleave"],
  "glyph": "W"
}
```

`overrides.d100` is optional and only needed when derivation produces a bad value.
`glyph` is a single character drawn on the board; no image assets are used.

## `rooms.json`

A tile is a grid of cell codes plus exits.

```json
{ "id": "hall", "w": 7, "h": 5, "kind": "room",
  "cells": ["#######", "#.....#", "#..#..#", "#.....#", "###.###"],
  "exits": [{ "x": 3, "y": 4, "dir": "s" }] }
```

`#` wall, `.` floor, `+` door, `~` hazard.

## `events.json`

```json
{ "id": "cave_in", "weight": 3, "text": "...",
  "effect": { "kind": "damage", "target": "random", "amount": 2 } }
```

Effect kinds: `damage`, `heal`, `gold`, `spawn`, `item`, `none`.

## `items.json`

```json
{ "id": "keen_blade", "name": "Keen Blade", "slot": "weapon",
  "mods": { "str": 1 }, "value": 40 }
```

## Re-skinning

Replacing `heroes.json`, `monsters.json`, `events.json` and `items.json` changes the setting
completely without touching a line of engine code.
