# WP-00 — Project Foundation Documentation

## Goal

Establish minimal project documentation so future work shares one clear direction—without starting implementation.

## Scope

- Update `README.md` with repository purpose and doc links
- Add `docs/project_brief.md` (direction, player model, v0.1, Pharmacy slice as future)
- Add `docs/decisions.md` (accepted / unresolved / deferred)
- Add this work package record

**WP-00 is documentation-only.**

## Out of scope

- Any source code, GameCore, or CLI
- Engine, language, or stack selection
- Full combat, procedural generation, or full GDD
- 36-subclass table as active implementation scope
- Full campaign, factions, economy, construction, complex inventory, mobile UI, deep NPC relationships
- Treating “main hero + companions” as active design

## Files changed

| File | Action |
|------|--------|
| `README.md` | Update |
| `docs/project_brief.md` | Create |
| `docs/decisions.md` | Create |
| `docs/work_packages/wp-00-project-foundation.md` | Create |

## Acceptance criteria

- [ ] `README.md` explains purpose and points to `docs/`
- [ ] `docs/project_brief.md` states survival RPG shelter meta-character direction
- [ ] Meta-character model accepted; main-hero field model marked superseded
- [ ] First prototype = minimal shelter-to-expedition loop
- [ ] Pharmacy described as **future** v0.1 vertical slice only
- [ ] Deferred topics marked as backlog, not current build
- [ ] No code added; no engine/stack/language chosen
- [ ] No claim that the project builds, runs, or has tests
- [ ] Docs remain compact (not a full GDD)

## Risks

| Risk | Mitigation |
|------|------------|
| WP-00 grows into a full GDD | Keep brief + decision log only |
| 36 subclasses treated as v0.1 scope | Exclude from active scope in brief and WP |
| Old main-hero model reintroduced | Explicit superseded wording in brief |
| Premature stack choice | List stack as unresolved in `decisions.md` |
| Overdesign combat / NPC / proc-gen / UI | Defer in brief and decisions |
| Docs sound final while decisions open | Separate accepted vs unresolved tables |

## Report format

When WP-00 is complete, the implementing agent or PR description should include:

- **Branch:** (e.g. `cursor/docs-wp-00-project-foundation-8a89`)
- **Base:** `main`
- **PR link:** (URL)
- **Changed files:** list
- **What was added:** summary of new docs
- **What was not added:** code, stack, engine, tests, full GDD
- **Accepted decisions documented:** D-01 … D-07 (see `decisions.md`)
- **Unresolved decisions documented:** U-01 … U-06
- **Checks performed without local run:** file presence, wording review, no code paths
- **Checks deferred until future code/CI:** build, test, lint
