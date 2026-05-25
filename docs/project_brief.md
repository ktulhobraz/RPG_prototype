# Project Brief

## Current project summary

**RPG_prototype** is a survival RPG prototype centered on a group of survivors and their shelter. The player does not control a single hero in the field. Instead, the player represents the shelter itself: allocating resources, selecting squads, and absorbing outcomes back into the base.

The repository is in a **documentation-first** phase. Game design direction is set; **final PC stack is unresolved**. The likely first **executable** step is a lightweight browser prototype (see below)—not a committed production engine or language choice.

## Accepted player model

> The player is a meta-character of the shelter. The player does not personally go on expeditions. Instead, the player manages the shelter, selects NPC squads, makes strategic decisions, and receives consequences back into the shelter.

Field actions are performed by **NPC squads** chosen by the player. Expedition results (loot, injuries, morale, etc.) feed back into shelter state.

### Superseded model

> The previous “main hero + companions” field model is no longer the active direction.

Do not treat a player-controlled field avatar plus companion party as current design.

## Initial technical direction

The first **executable** prototype is expected to be a **lightweight browser-based prototype** deployable through **GitHub Pages**.

- This is **not** the final PC game stack.
- **GitHub Pages** here means **static client-side hosting only**—no backend, accounts, cloud saves, online services, or server-side logic in scope for that path.
- **Core / domain game logic** must stay **separate** from UI, rendering, and hosting so logic can be tested and later ported without rewriting rules inside the view layer.
- **Python** is **not** selected for the first executable prototype. It may be considered **later** for PC-side development tools, simulations, balancing scripts, or support utilities.
- **Termux** is **not** part of the initial development route.

Implementation setup (Vite, TypeScript, workflows, `package.json`, Pages configuration) is **out of scope** until a dedicated work package—this section records direction only.

## Core gameplay loop (target)

At a high level, the intended loop is:

1. **Shelter** — prepare, assign roles, choose who goes out.
2. **Expedition** — selected NPC squad acts in the field (details TBD).
3. **Return** — consequences update shelter state; player plans the next cycle.

The first planned playable prototype should exercise **one minimal shelter-to-expedition loop**, not a full campaign or economy.

## Current v0.1 target

**v0.1** means: prove the shelter meta-character loop end-to-end once, with minimal systems and meaningful choices—not a feature-complete game.

Planned focus:

- One shelter management layer (minimal).
- Squad selection for a single expedition type.
- One encounter resolution path (combat and skills **not** fully designed here).
- Clear feedback from expedition back to shelter.

## Minimal “Pharmacy” vertical slice (future)

The initial vertical slice is a **Pharmacy scavenging encounter**: survivors send a squad to scavenge a pharmacy; the player prepares at the shelter and commits a squad; outcomes return to the base.

This is **planned for v0.1**, not implemented. It names the first concrete scenario to build toward once implementation starts—it is not active scope for documentation-only work.

## Deferred ideas / future scope

Intentionally **not** in the current prototype path (backlog / later):

- Final PC engine / production stack (unresolved)
- Python as the **first** runnable game stack (PC-side tooling may use Python later)
- Termux as a deployment target
- Backend, accounts, cloud saves, and online services for the static web prototype
- Full campaign and faction systems
- Procedural generation (maps, loot tables, etc.)
- Full combat system and skill lists
- 36-subclass (or similar) character taxonomy as implementation scope
- Mobile UI, complex inventory, construction, economy
- Deep NPC relationship simulation
- GameCore, CLI, and full source layout (until further stack decisions)

Ideas may be noted elsewhere later; they are **not** commitments for v0.1.

## Explicit non-goals (start of development)

When implementation begins, the following remain **out of scope** for the first steps:

- Choosing **final PC** engine or production stack in documentation-only work
- Configuring GitHub Pages, CI, or a build toolchain in WP-00
- Implementing GameCore or CLI
- Designing or coding full combat
- Implementing procedural generation
- Publishing a full GDD
- Building factions, full economy, construction, or relationship sims
- Reintroducing the main-hero field model or **Termux** as an initial target
- Using **Python** as the first executable game prototype
