# WP-00 — Project Foundation Documentation

## Goal

Establish minimal project documentation so future work shares one clear direction—without starting implementation.

## Scope

- Update `README.md` with repository purpose and doc links
- Add `docs/project_brief.md` (direction, player model, v0.1, Pharmacy slice as future, initial technical direction)
- Add `docs/decisions.md` (accepted / unresolved / deferred)
- Add this work package record
- Document revised **initial technical direction** (Web/GitHub Pages prototype path; Termux removed; Python deferred for first executable stack)

**WP-00 is documentation-only.**

## Out of scope

- Any source code, GameCore, or CLI
- **Final PC** engine or production stack selection
- **Exact Web prototype stack** selection (plain JS vs TypeScript vs Vite, etc.)
- GitHub Pages configuration, workflows, `package.json`, Vite, TypeScript, or other build setup
- Full combat, procedural generation, or full GDD
- 36-subclass table as active implementation scope
- Full campaign, factions, economy, construction, complex inventory, mobile UI, deep NPC relationships
- Treating “main hero + companions” as active design
- **Termux** as an initial target
- **Python** as the first executable prototype stack
- Backend, accounts, cloud saves, or online services for the static prototype path

## Files changed

| File | Action |
|------|--------|
| `README.md` | Update |
| `docs/project_brief.md` | Create / update |
| `docs/decisions.md` | Create / update |
| `docs/work_packages/wp-00-project-foundation.md` | Create / update |

## Acceptance criteria

- [ ] `README.md` explains purpose and points to `docs/`
- [ ] `docs/project_brief.md` states survival RPG shelter meta-character direction
- [ ] Meta-character model accepted; main-hero field model marked superseded
- [ ] First prototype = minimal shelter-to-expedition loop
- [ ] Pharmacy described as **future** v0.1 vertical slice only
- [ ] Deferred topics marked as backlog, not current build
- [ ] **Termux** documented as **not** part of the initial route
- [ ] **Python** documented as **deferred** (not first executable stack; possible later for PC-side tooling)
- [ ] **Web / GitHub Pages** documented as likely first **executable** prototype direction (static client-side only)
- [ ] **Final PC stack** remains **unresolved**
- [ ] **Core logic vs UI/hosting separation** documented as a constraint
- [ ] No code added; no implementation setup (Pages workflow, package manager, build tools)
- [ ] No claim that the project builds, runs, or has tests
- [ ] Docs remain compact (not a full GDD)

## Risks

| Risk | Mitigation |
|------|------------|
| WP-00 grows into a full GDD | Keep brief + decision log only |
| 36 subclasses treated as v0.1 scope | Exclude from active scope in brief and WP |
| Old main-hero model reintroduced | Explicit superseded wording in brief |
| Premature **final PC** or **exact web** stack choice | List as unresolved in `decisions.md` |
| Treating web prototype direction as final PC stack | State clearly in brief and D-09 |
| Reintroducing Termux or Python-first executable path | D-08, deferred list, acceptance criteria |
| Coupling game logic to UI/hosting in future code | D-11 and brief “Initial technical direction” |
| Overdesign combat / NPC / proc-gen / UI | Defer in brief and decisions |
| Docs sound final while decisions open | Separate accepted vs unresolved tables |
| Adding GitHub Pages or build config in WP-00 | Explicit out of scope and acceptance criteria |

## Report format

When WP-00 is complete, the implementing agent or PR description should include:

- **Branch:** (e.g. `cursor/docs-wp-00-project-foundation-8a89`)
- **Base:** `main`
- **PR link:** (URL)
- **Changed files:** list
- **What was added / updated:** summary of docs
- **What was explicitly removed from initial scope:** Termux; Python as first executable stack; backend/online services for static prototype
- **What remains unresolved:** final PC stack, exact web stack, Python tooling role, plus prior U-02–U-06 topics
- **Checks performed without local run:** file presence, wording review, no code paths
- **Checks deferred until future code/CI:** build, test, lint, GitHub Pages deploy
