# Rule System

The engine rolls no dice of its own. Every roll goes through the rule system in
`src/core/rules/`, which implements the contract in `contract.js`. One system ships.

## Profile (authored once per creature)

Stat blocks in `src/data/*.json` use small integers:

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

## Resolution

- **To hit (melee):** target number `clamp(4 - (attackerWs - defenderWs), 2, 6)`; roll `d6 >= target`.
  A natural 6 always hits, a natural 1 always misses, whatever the target number says.
- **To hit (ranged):** target `clamp(7 - bs, 2, 6)`, plus a range penalty of 0 within 2 cells,
  1 within 5, 2 beyond. Shooting into a melee you are part of is not allowed at all.
- **Damage:** `d6 + str`, reduced by the defender's `tou`, minimum 0.
- **Critical:** a natural 6 to hit adds another `d6` of damage.
- **Initiative:** `d6 + init`, ties broken by `init` then by id so ordering is fully determined.
- **Stat test:** target `clamp(difficulty - stat + 4, 2, 6)` on a d6.

## Contract

```js
{
  id, name, summary,
  toProfile(canon)                              -> Profile,
  rollInitiative(combatants, rng)               -> string[],   // ordered ids
  resolveAttack(attacker, defender, ctx, rng)   -> AttackResult,
  resolveTest(actor, stat, difficulty, rng)     -> TestResult,
  describe(attacker, defender, result)          -> string
}
```

`AttackResult` is `{ hit, damage, crit, fumble, detail }`. The engine and the combat log read
only that shape, so a second system could be added behind the same contract without touching
`combat.js`.

> A percentile (d100) system shipped alongside this one during development and was removed.
> It doubled the balancing surface for one game, and simulation put it at a 1.7% win rate against
> d6's 7.5% — percentile damage outgrew the wound scaling it was derived against. The contract
> stays because it keeps dice logic out of the engine, not because a second system is planned.

## Abilities

`src/core/abilities.js` is the only place ability ids get meaning. Passive abilities feed the
engine an attack modifier or extra swings; active ones (`mend`, `bolt`) cost the actor's action
and may be limited to a number of uses per delve. An id the engine does not know is ignored, so
content can name an ability before it is implemented.
