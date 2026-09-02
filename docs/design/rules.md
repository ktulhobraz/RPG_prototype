# Rule Systems

Two resolvers implement one contract. The combat engine never branches on which is active.

## Canonical profile (authored once)

Stat blocks in `src/data/*.json` use the small-integer scale:

| Stat | Meaning | Typical range |
|------|---------|---------------|
| `ws` | Weapon skill (melee) | 2-6 |
| `bs` | Ballistic skill (ranged) | 2-6 |
| `str` | Strength (damage bonus) | 2-5 |
| `tou` | Toughness (damage reduction) | 2-5 |
| `wounds` | Hit points | 4-30 |
| `init` | Initiative | 2-6 |
| `attacks` | Attacks per turn | 1-3 |
| `move` | Movement in cells | 3-6 |

## `d6` resolver — default, balance reference

- **To hit:** cross-reference attacker `ws` against defender `ws`.
  Target number = `clamp(4 - (attackerWs - defenderWs), 2, 6)`; roll `d6 >= target`.
  A natural 6 always hits, a natural 1 always misses.
- **Damage:** `d6 + str`, reduced by defender `tou`, minimum 0.
- **Critical:** natural 6 to hit adds `+d6` damage.
- **Ranged:** same shape using `bs`, target number `clamp(7 - bs, 2, 6)`, plus range penalties.
- **Initiative:** `d6 + init`, ties broken by `init` then by id for determinism.

## `d100` resolver — experimental

- **Profile derivation:** `pct = clamp(stat * 10 + 5, 5, 95)` for `ws`/`bs`;
  `str`/`tou` become bonuses (`stat`), `wounds` scale by 1.5x, `init` maps to `10 + init * 5`.
  Overrides in a creature's `overrides.d100` block replace derived values field by field.
- **To hit:** roll `d100 <= skill`. Success levels `SL = floor(skill/10) - floor(roll/10)`.
- **Critical:** doubles (11, 22, ... 99) on a success; fumble on doubles that fail.
- **Damage:** `d10 + strBonus + max(0, SL)`, reduced by `touBonus`.
- **Initiative:** `d10 + initBonus`, same tie-break rule.

Derivation lives in `src/core/rules/derive.js`, so retuning the mapping is a single-file change.

## Contract

```js
{
  id, name, experimental,
  toProfile(entityData) -> Profile,
  rollInitiative(combatants, rng) -> string[],   // ordered ids
  resolveAttack(attacker, defender, ctx, rng) -> AttackResult,
  resolveTest(actor, stat, difficulty, rng) -> TestResult,
  describe(result) -> string
}
```

`AttackResult` is `{ hit, damage, crit, fumble, detail }` in both systems, so the engine and the
combat log stay system-agnostic.
