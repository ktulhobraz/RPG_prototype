# Decision Log

Compact record of what is **accepted**, **superseded**, **unresolved**, or **deferred**.
Superseded entries are kept, not deleted, so the history of direction changes stays readable.

## Accepted

| ID | Decision | Notes |
|----|----------|-------|
| D-03 | **Documentation before code** | Direction is written down before implementation |
| D-05 | **Procedural generation deferred** | Dungeon is assembled from an authored tile deck |
| D-09 | First **executable** prototype: static **Web / GitHub Pages** | Not the final PC stack |
| D-10 | **GitHub Pages = static client-side hosting only** | No server in this path |
| D-11 | **Core game logic separate** from UI, rendering, and hosting | `src/core/**` has no DOM access |
| D-12 | Genre is a **party-based tabletop-style dungeon crawler** | Top-down, tile deck, party of four, grid combat |
| D-13 | **Two rule systems** (`d6`, `d100`) ship together | One canonical `d6` stat block; `d100` derived, with overrides |
| D-14 | **Content separate from engine** | All names/stats in `src/data/*.json`; engine carries no setting vocabulary; no third-party assets |
| D-15 | **Mobile-first, touch-only** | Portrait layout, tap targets >= 44px, no hover/drag/keyboard |
| D-16 | **All randomness through a seeded PRNG** | No `Math.random()` in core; delves are reproducible by seed |
| D-17 | **Vanilla ES modules, no bundler** (resolves U-07) | `package.json` only enables `node --test`; zero dependencies |
| D-18 | **`d6` is the balance reference**, `d100` is experimental | Until `d100` gets its own balance pass |

## Superseded

Retained for history. **Not** current design.

| ID | Former decision | Superseded by |
|----|-----------------|---------------|
| D-01 | Player is a **shelter meta-character** | D-12 — player directly controls a party of four heroes |
| D-02 | **NPC squads** perform expeditions | D-12 — the party is player-controlled in the field |
| D-04 | First prototype = one minimal **shelter-to-expedition loop** | D-12 — first prototype is one complete dungeon delve |
| D-06 | **Full combat design deferred** | D-13 — combat is the core system and is designed now |
| D-07 | NPCs in v0.1: minimal but meaningful depth | D-12 — heroes replace NPC squads as the unit of play |
| D-08 | **Termux removed** from initial strategy | Still true, but no longer a live topic; superseded by D-09 |

## Unresolved

| ID | Topic |
|----|--------|
| U-01 | **Final PC stack / engine** for a production version |
| U-05 | **Persistence model** beyond a single local save (meta-progression shape) |
| U-09 | Whether a **hub / settlement** layer returns between delves |
| U-10 | Whether `d100` becomes the default after its balance pass |

Resolved since the previous revision: **U-02** (no CLI in this direction), **U-03** and **U-04**
(combat model and skills are now designed, see `docs/design/`), **U-06** (repository structure fixed
by WP-01), **U-07** (see D-17), **U-08** (Python has no role in this prototype; simulation runs on Node).

## Deferred (intentional backlog)

- Settlement / hub between delves, campaign, factions, economy
- Procedural generation
- Crafting, complex inventory, deep NPC relationship simulation
- Backend services, accounts, cloud saves, online play
- Final PC engine selection
