# RPG_prototype

A party-based **dungeon crawler** prototype in a grim low-fantasy setting. You lead four heroes
through a tile-built dungeon, fight turn-based battles on a grid, and try to reach the objective
room alive.

The prototype is a **static web page with no build step** and is deployable through GitHub Pages.
Because the browser loads JSON through `fetch`, it must be served over HTTP rather than opened via
`file://`.

## Rules

Fast tabletop-style d6 resolution: cross-referenced to-hit, `d6 + Strength` damage reduced by
Toughness, criticals on a natural 6. Initiative is individual: every hero and monster rolls
`d6 + Initiative` into one turn order. Rules live behind the contract in `src/core/rules/`, so the
combat engine holds no dice logic of its own. See [docs/design/rules.md](docs/design/rules.md).

Delves run from a seed, so a run can be replayed exactly.

## Current delve flow

- **Exploration:** rooms are walked cell by cell under fog of war. The authored `+` cell is the
  entrance. A separate seeded exit is placed on a distant passable cell at room entry.
- **Corruption:** one corruption theme and intensity is fixed for the whole delve. Newly visited
  cells can trigger at most one corruption-driven ambush per room.
- **Combat:** encounters use a separate authored battlefield from `src/data/battlefields.json` and
  are shown in a combat overlay. Exploration position/fog remain intact underneath.
- **Initiative:** the combat overlay exposes the single ordered queue containing both heroes and
  monsters and highlights the current actor.
- **Loot:** gold is shared; found items enter a party stash. The player can assign an item to a
  specific living hero, after which existing equipment modifiers affect that hero.
- **Rest:** reaching the room exit passively heals each injured living hero by
  `d6 + (base Toughness - 3)`, minimum 1, before the between-room event.

See [docs/project_brief.md](docs/project_brief.md) and [docs/design/balance.md](docs/design/balance.md)
for the current design and measured balance.

## Development

Zero dependencies. Tests use Node's built-in runner:

```bash
npm test
npm run sim 600
```

Both run in CI on every pull request and on pushes to `main`. Publishing to GitHub Pages happens
on pushes to `main` and can also be dispatched manually from a branch.

Architecture rule: `src/core/**` is pure logic: no `document`, no `window`, no `localStorage`,
no `Math.random()`. All randomness comes from an injected seeded PRNG. This is enforced by
`tests/purity.test.js`.

```text
src/core/   game logic, DOM-free and testable
src/ui/     DOM rendering and touch input
src/data/   authored content and geometry as JSON
tests/      node --test suites + balance simulation
```

## Documentation

| Document | Purpose |
|----------|---------|
| [docs/project_brief.md](docs/project_brief.md) | Current direction, loop, v0.1 scope |
| [docs/decisions.md](docs/decisions.md) | Accepted / superseded / unresolved decisions |
| [docs/design/rules.md](docs/design/rules.md) | Active d6 system and resolver contract |
| [docs/design/content_format.md](docs/design/content_format.md) | Current data file schemas |
| [docs/design/balance.md](docs/design/balance.md) | Simulation figures and tuning levers |
| [docs/work_packages/](docs/work_packages/) | Historical/current work package records |

The earlier shelter-management direction remains in history only and is marked superseded in the
decision log.

## Assets and naming

No third-party art, fonts, or trademarked names are used. Generated prototype art lives under
`assets/art/` and is split by use: hero portraits for cards/details, compact hero and monster tokens
for the tactical board, dungeon tile rows, and item/UI icon rows. `src/ui/sprites.js` owns the
content-id mapping. If the available art does not match a content entity, the UI keeps the existing
glyph instead of relabelling that entity to fit an image.

Setting-facing names and descriptions live in `src/data/*.json`.
