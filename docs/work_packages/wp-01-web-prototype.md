# WP-01 — Playable Web Prototype

## Goal

Deliver one complete dungeon delve, playable from a mobile browser on a static GitHub Pages site,
with two interchangeable rule systems and a tested, DOM-free core.

## Scope

- Repository structure: `src/core` (pure logic), `src/ui` (DOM only), `src/data` (content), `tests`
- Seeded PRNG and dice; no `Math.random()` anywhere in core
- `d6` stat profiles and a single rule resolver behind one contract
- Abilities resolved by the engine, including the party's in-combat healing
- Dungeon assembly from an authored tile deck; guaranteed reachable objective room
- Turn-based grid combat: initiative, move, melee, ranged, spell, defend, flee
- Between-room event table with an unexpected-event roll each exploration turn
- Loot, experience, boss room, victory and defeat screens
- Local save via an injected storage adapter, degrading gracefully when storage is unavailable
- Mobile-first portrait UI, touch-only input
- Node built-in test suite plus a balance simulation script
- CI running tests on every pull request, and a GitHub Pages deploy workflow

## Out of scope

- Settlement / hub between delves, campaign, factions, economy
- Procedural generation; crafting; complex inventory
- Backend, accounts, cloud saves, online services
- Final PC engine selection
- Third-party art, fonts, or trademarked names in engine code

## Files changed

| Path | Action |
|------|--------|
| `README.md` | Update |
| `docs/project_brief.md` | Rewrite for new direction |
| `docs/decisions.md` | Add D-12..D-18, mark D-01/D-02/D-04/D-06/D-07/D-08 superseded |
| `docs/design/*.md` | Create |
| `docs/work_packages/wp-01-web-prototype.md` | Create |
| `index.html`, `styles/main.css`, `package.json` | Create |
| `src/core/**`, `src/ui/**`, `src/data/**` | Create |
| `tests/**` | Create |
| `.github/workflows/{test,pages}.yml` | Create |

## Acceptance criteria

- [ ] `npm test` passes with zero installed dependencies, in CI as well as locally
- [ ] No file under `src/core/` references `document`, `window`, `localStorage`, or `Math.random` (enforced by `tests/purity.test.js`)
- [ ] The same seed reproduces the same delve exactly
- [ ] A full delve is completable in portrait orientation on a phone, using taps only
- [ ] Simulated win rate stays inside the 20-80% band enforced by the test suite
- [ ] Progress survives a tab reload, and the game still runs when storage is blocked
- [ ] Dungeon generation always yields a reachable objective room
- [ ] Engine code contains no setting-specific names; all content lives in `src/data/*.json`

## Risks

| Risk | Mitigation |
|------|------------|
| Balance drifting unnoticed | `npm run sim` measures it; a test fails outside a 20-80% win band |
| Third-party IP exposure on a public page | Engine carries no trademarked vocabulary; content is swappable data; no third-party assets |
| Scope creep toward a full tabletop conversion | Hard ceiling: 1 dungeon, 4 heroes, 5-6 monsters, 8-10 tiles |
| No static types in vanilla JS | `// @ts-check` and JSDoc in core; optional `npx tsc --checkJs --noEmit` without adding dependencies |
| Logic leaking into the UI layer | Tests import only `src/core/**`; a DOM reference in core is a review failure |
| Storage unavailable in private browsing | Storage adapter is injected; absence disables saving, never crashes |
