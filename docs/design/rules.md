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

These are canonical creature characteristics. Equipment modifies the canonical profile before a
fight; temporary combat states such as advantage do not rewrite the profile.

## Resolution

- **To hit (melee):** target number `clamp(4 - (attackerWs - defenderWs), 2, 6)`; roll `d6 >= target`.
  A natural 6 always hits, a natural 1 always misses, whatever the target number says.
- **To hit (ranged):** target `clamp(7 - bs, 2, 6)`, plus a range penalty of 0 within 2 cells,
  1 within 5, 2 beyond. Shooting into a melee you are part of is not allowed at all.
- **Positive attack modifier:** every `+1` lowers the required d6 target by one step before the
  final 2+ to 6+ clamp. Negative modifiers raise it. Natural 1/6 still override modifiers.
- **Damage:** `d6 + str`, reduced by the defender's `tou`, minimum 0.
- **Critical:** a natural 6 to hit adds another `d6` of damage.
- **Initiative:** `d6 + init`, ties broken by `init` then by id so ordering is fully determined.
- **Stat test:** target `clamp(difficulty - stat + 4, 2, 6)` on a d6.

## Engagement and opportunity attacks

Adjacency is four-way, matching movement: a creature is engaged with every living enemy on an
orthogonally neighbouring cell.

- A creature may still move while engaged.
- When a movement step leaves an enemy's adjacency, that enemy immediately makes one melee
  **opportunity attack** before the mover enters the next cell.
- Every enemy whose adjacency is broken may react once during that movement.
- Opportunity attacks do not consume the reacting creature's normal action or attacks-per-turn.
- If an opportunity attack kills the mover, movement stops on the last cell it successfully reached.
- The passive `disengage` ability suppresses these opportunity attacks. The hook exists for future
  content; no current hero or monster is assigned that ability.

## Advantage

Advantage is expressed as a positive attack modifier, not as an extra die.

### Surrounding advantage

If a defender has at least **two living adjacent enemies**, melee attacks made by those adjacent
enemies gain `+1` to hit. A ranged attacker outside the surrounding group does not receive this
bonus merely because allies are surrounding the target.

### Kill advantage

When a creature kills an enemy with an attack, it gains a persistent `+1` attack modifier for the
rest of the current combat until either of these happens:

1. the advantaged creature makes its first attack that misses; or
2. an enemy attack hits the advantaged creature.

A hit removes kill advantage even when Toughness reduces its damage to zero. Kill advantage does
not stack with itself, but it does stack with surrounding advantage and existing ability modifiers.
Starting a new combat clears it.

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
engine an attack modifier, extra swings or a movement exception; active ones (`mend`, `bolt`) cost
the actor's action and may be limited to a number of uses per delve. An id the engine does not know
is ignored, so content can name an ability before it is implemented.
