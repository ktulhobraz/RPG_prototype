# Decision Log

Compact record of what is **accepted**, **unresolved**, or **deferred**. Dates are omitted until the project adopts a changelog convention.

## Accepted

| ID | Decision | Notes |
|----|----------|-------|
| D-01 | Player is a **shelter meta-character** | Player does not go on expeditions personally |
| D-02 | **NPC squads** perform expeditions | Player selects squads and strategic choices |
| D-03 | **Documentation before code** | First development step is project foundation docs (WP-00) |
| D-04 | First prototype target is **one minimal shelter-to-expedition loop** | Not a full campaign |
| D-05 | **Procedural generation deferred** | No proc-gen system in v0.1 scope |
| D-06 | **Full combat design deferred** | Encounter resolution TBD; not designed in WP-00 |
| D-07 | **NPCs in v0.1: minimal but meaningful depth** | Enough to matter in squad choice and outcomes, not a full sim |

## Unresolved

These need explicit decisions in later work packages—**do not assume** an answer in docs or code yet.

| ID | Topic |
|----|--------|
| U-01 | Programming language / stack for **GameCore** |
| U-02 | **CLI** structure and commands |
| U-03 | **Exact combat model** (turn structure, resolution, flee, etc.) |
| U-04 | **Exact skill list** |
| U-05 | **Exact NPC data model** (stats, traits, persistence) |
| U-06 | **Repository structure** for future source code (folders, modules) |

## Deferred (intentional backlog)

Not rejected forever—explicitly **not** for the documentation-first / v0.1 foundation phase:

- Game engine selection
- Procedural generation system
- Full combat implementation
- Full GDD and 36-subclass table as active scope
- Factions, mobile UI, complex inventory, construction, economy
- Full NPC relationship simulation
- Main hero + companions field model (superseded; see project brief)
