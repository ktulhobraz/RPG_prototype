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
| D-14 | **Content separate from engine** | All names/stats in `src/data/*.json`; engine carries no setting vocabulary; no third-party assets |
| D-15 | **Mobile-first, touch-only** | Portrait layout, tap targets >= 44px, no hover/drag/keyboard |
| D-16 | **All randomness through a seeded PRNG** | No `Math.random()` in core; delves are reproducible by seed |
| D-17 | **Vanilla ES modules, no bundler** (resolves U-07) | `package.json` only enables `node --test`; zero dependencies |
| D-19 | **One rule system** (`d6`); the percentile system is removed | Superseded D-13/D-18. Two systems doubled the balancing surface; the percentile side measured 1.7% win rate against d6's 7.5% |
| D-20 | **Balance is measured, not judged** | `npm run sim` plays hundreds of delves; a test fails outside a 20-80% win band. See `docs/design/balance.md` |
| D-21 | **Abilities are engine behaviour, not decoration** | Ability ids in data resolve through `src/core/abilities.js`; they supply the party's only in-combat healing |
| D-22 | **Architectural rules are enforced by tests, not by convention** | `tests/purity.test.js` fails the build if core gains DOM access or ambient randomness |
| D-23 | **CI runs the suite and the balance simulation** | `.github/workflows/test.yml`; Pages deploys from `main` with manual dispatch for branch previews |
| D-24 | **Corruption**: one theme + intensity per delve, fixed for the whole run | `src/core/corruption.js`; theme restricts monster faction, intensity scales encounter size as a second multiplier layered on top of depth, not replacing it |
| D-25 | **Corruption theme and faction names are original**, no Games Workshop vocabulary | Direct continuation of D-14, not a new constraint — see `src/data/corruptions.json` |
| D-26 | **Rooms are walked cell by cell**, not entered as a single pre-rolled encounter | `src/core/exploration.js`: fog of war, per-step ambush chance (at most one per room), scattered trap/treasure content. Reveal radius is passive, from party Initiative — no new player action or resource |
| D-28 | **Combat uses a separate battlefield**, not the exploration room tile | Encounter creation selects a seeded authored tile from `src/data/battlefields.json`; UI presents combat as an overlay while exploration state remains intact |
| D-29 | **Existing individual initiative remains the turn model and is exposed in combat UI** | Every actor rolls `d6 + Initiative`; one ordered queue contains heroes and monsters and the active actor is highlighted |
| D-30 | **Loot first enters a party stash; assignment to a hero is explicit** | Found equipment is no longer auto-routed by role. Assigning it uses the existing equipment modifier rules on that hero |
| D-31 | **Entrance and exit are separate** | Authored `+` remains the room entrance. Each explored room gets a seeded runtime exit on a distant passable cell; the exit itself cannot trigger trap/content/ambush |
| D-32 | **Passive rest happens at the room exit** | Each injured living hero heals `d6 + (base Toughness - 3)`, minimum 1. Equipment Toughness does not modify recovery |
| D-33 | **Generated prototype art is split by UI purpose**, not one universal atlas | Portraits serve cards/details; compact hero/monster tokens serve the board; terrain and item art use separate row atlases. Unmatched content keeps its glyph instead of being renamed to fit available art |
| D-34 | **Test Arena is an isolated development harness, not a game mode** | One selected hero fights one monster at a time on `test_arena`; each matchup resets the hero to baseline. No dungeon progress, loot, XP or save writes are involved |
| D-35 | **Engagement and advantage are baseline combat rules** | Leaving adjacent enemies provokes one reaction strike per enemy unless an ability permits safe disengage. Surrounding (2+ adjacent enemies) and kill momentum grant `+1` attack modifiers; kill momentum ends on the attacker's first miss or when an enemy hits it |

## Superseded

Retained for history. **Not** current design.

| ID | Former decision | Superseded by |
|----|-----------------|---------------|
| D-01 | Player is a **shelter meta-character** | D-12 — player directly controls a party of four heroes |
| D-02 | **NPC squads** perform expeditions | D-12 — the party is player-controlled in the field |
| D-04 | First prototype = one minimal **shelter-to-expedition loop** | D-12 — first prototype is one complete dungeon delve |
| D-06 | **Full combat design deferred** | D-12 — combat is the core system; see `docs/design/rules.md` |
| D-07 | NPCs in v0.1: minimal but meaningful depth | D-12 — heroes replace NPC squads as the unit of play |
| D-08 | **Termux removed** from initial strategy | Still true, but no longer a live topic; superseded by D-09 |
| D-13 | **Two rule systems** (`d6`, `d100`) ship together | D-19 — the percentile system was removed after simulation |
| D-18 | `d6` is the balance reference, `d100` is experimental | D-19 — there is only one system to reference |
| D-27 | **A wandering ambush fights in place**, on the exploration tile | D-28 — all combat now uses a separate authored battlefield |

## Unresolved

| ID | Topic |
|----|--------|
| U-01 | **Final PC stack / engine** for a production version |
| U-05 | **Persistence model** beyond a single local save (meta-progression shape) |
| U-09 | Whether a **hub / settlement** layer returns between delves |
| U-11 | Whether meta-progression persists across delves, or each delve starts fresh |

Resolved since the previous revision: **U-02** (no CLI in this direction), **U-03** and **U-04**
(combat model and skills are now designed, see `docs/design/`), **U-06** (repository structure fixed
by WP-01), **U-07** (see D-17), **U-08** (Python has no role in this prototype; simulation runs on Node).

## Deferred (intentional backlog)

- Settlement / hub between delves, campaign, factions, economy
- Procedural generation
- Crafting, **complex** inventory management (weight, capacity, durability, encumbrance), deep NPC relationship simulation
- Backend services, accounts, cloud saves, online play
- Final PC engine selection
