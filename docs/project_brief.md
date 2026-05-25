# Project Brief

## Current project summary

**RPG_prototype** is a survival RPG prototype centered on a group of survivors and their shelter. The player does not control a single hero in the field. Instead, the player represents the shelter itself: allocating resources, selecting squads, and absorbing outcomes back into the base.

The repository is in a **documentation-first** phase. No engine, language, or runnable build is defined yet.

## Accepted player model

> The player is a meta-character of the shelter. The player does not personally go on expeditions. Instead, the player manages the shelter, selects NPC squads, makes strategic decisions, and receives consequences back into the shelter.

Field actions are performed by **NPC squads** chosen by the player. Expedition results (loot, injuries, morale, etc.) feed back into shelter state.

### Superseded model

> The previous “main hero + companions” field model is no longer the active direction.

Do not treat a player-controlled field avatar plus companion party as current design.

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

- Full campaign and faction systems
- Procedural generation (maps, loot tables, etc.)
- Full combat system and skill lists
- 36-subclass (or similar) character taxonomy as implementation scope
- Mobile UI, complex inventory, construction, economy
- Deep NPC relationship simulation
- GameCore, CLI, and source layout (until stack decisions)

Ideas may be noted elsewhere later; they are **not** commitments for v0.1.

## Explicit non-goals (start of development)

When implementation begins, the following remain **out of scope** for the first steps:

- Choosing engine, language, or framework in this documentation pass
- Implementing GameCore or CLI
- Designing or coding full combat
- Implementing procedural generation
- Publishing a full GDD
- Building factions, full economy, construction, or relationship sims
- Reintroducing the main-hero field model
