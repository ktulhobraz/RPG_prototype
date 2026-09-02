# RPG_prototype

A party-based **dungeon crawler** prototype in a grim low-fantasy setting. You lead four heroes
through a tile-built dungeon, fight turn-based battles on a grid, and try to reach the objective
room alive.

The prototype is a **static web page with no build step** — open `index.html` and it runs, including
on a phone.

## Play it

**On a phone:** open the GitHub Pages URL for this repository.

**Locally:** the page uses ES modules and `fetch`, so it needs to be served over HTTP rather than
opened as a `file://` URL:

```bash
python3 -m http.server 8080   # then open http://localhost:8080
```

## Two rule systems

Switch between them in Settings:

- **d6** — fast tabletop-style resolution. Default, and the balance reference.
- **d100** — percentile resolution with success levels and criticals on doubles. Experimental.

Creature stats are authored once in the `d6` scale; the `d100` profile is derived from it. Both
systems run on the same seed, so the same delve can be compared side by side.

## Development

Zero dependencies. Tests use Node's built-in runner:

```bash
npm test          # unit and contract tests
npm run sim       # balance simulation across many seeds, per rule system
```

Architecture rule: `src/core/**` is pure logic — no `document`, no `window`, no `localStorage`,
no `Math.random()`. All randomness comes from an injected seeded PRNG, which is what makes delves
reproducible and the tests deterministic.

```
src/core/   game logic, DOM-free and testable
src/ui/     DOM rendering and touch input
src/data/   all content as JSON; the engine holds no setting vocabulary
tests/      node --test suites + balance simulation
```

## Documentation

| Document | Purpose |
|----------|---------|
| [docs/project_brief.md](docs/project_brief.md) | Direction, genre, v0.1 scope |
| [docs/decisions.md](docs/decisions.md) | Accepted / superseded / unresolved decisions |
| [docs/design/rules.md](docs/design/rules.md) | Both rule systems and the resolver contract |
| [docs/design/content_format.md](docs/design/content_format.md) | Data file schemas |
| [docs/work_packages/](docs/work_packages/) | Work package records |

> **Note on direction:** this repository previously documented a survival game about managing a
> shelter. That direction is superseded; the earlier decisions are kept and marked as such in
> `docs/decisions.md`.

## Assets and naming

No third-party art, fonts, or trademarked names are used. The board is drawn with CSS and single
characters. All names and descriptions live in `src/data/*.json` and can be replaced wholesale.
