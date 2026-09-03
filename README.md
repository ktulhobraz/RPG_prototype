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

## Rules

Fast tabletop-style d6 resolution: cross-referenced to-hit, `d6 + Strength` damage reduced by
Toughness, criticals on a natural 6. All of it lives behind one contract in `src/core/rules/`, so
the combat engine holds no dice logic of its own. See [docs/design/rules.md](docs/design/rules.md).

Delves run from a seed, so a run can be replayed exactly — which is what makes the balance
simulation and the tests meaningful.

## Development

Zero dependencies. Tests use Node's built-in runner:

```bash
npm test          # unit, contract and end-to-end delve tests
npm run sim 600   # play 600 delves headlessly and report win rate and attrition
```

Both run in CI on every pull request and on pushes to `main`. Publishing to GitHub Pages happens
on pushes to `main`, and can be triggered manually from any branch (Actions → Deploy to Pages →
Run workflow) to try a branch on a real phone before merging. This needs the repository's
**Settings → Pages → Source** set to **GitHub Actions** once.

Architecture rule: `src/core/**` is pure logic — no `document`, no `window`, no `localStorage`,
no `Math.random()`. All randomness comes from an injected seeded PRNG, which is what makes delves
reproducible and the tests deterministic. This is enforced by `tests/purity.test.js`, not left to
good intentions.

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
