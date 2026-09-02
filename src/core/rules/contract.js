// @ts-check
/**
 * The contract every rule system implements. Types only — this module has no runtime behaviour.
 *
 * The combat engine talks to this shape and never branches on which system is active, which is
 * what lets d6 and d100 coexist without duplicating the engine or the content.
 */

/** @typedef {import('../profile.js').CanonProfile} CanonProfile */
/** @typedef {import('../rng.js').Rng} Rng */

/**
 * A combatant as the rule system sees it. The engine owns position and state; the rule system
 * only reads the profile and identity.
 *
 * @typedef {object} Combatant
 * @property {string} id
 * @property {string} name
 * @property {'hero' | 'monster'} side
 * @property {CanonProfile} canon      Canonical stats after equipment mods.
 * @property {any} profile             System-specific profile from toProfile().
 * @property {number} wounds           Current wounds remaining.
 * @property {number} maxWounds
 */

/**
 * @typedef {object} AttackContext
 * @property {'melee' | 'ranged'} kind
 * @property {number} [rangePenalty]   Applied by the engine from board distance.
 * @property {number} [modifier]       Situational bonus/penalty from abilities or events.
 */

/**
 * Uniform result shape, so the combat log and the engine stay system-agnostic.
 *
 * @typedef {object} AttackResult
 * @property {boolean} hit
 * @property {number} damage    Already reduced by toughness; never negative.
 * @property {boolean} crit
 * @property {boolean} fumble
 * @property {string} detail    Human-readable roll breakdown for the log.
 */

/**
 * @typedef {object} TestResult
 * @property {boolean} success
 * @property {number} degree    Margin of success; scale differs per system.
 * @property {string} detail
 */

/**
 * @typedef {object} RuleSystem
 * @property {string} id
 * @property {string} name
 * @property {boolean} experimental
 * @property {string} summary
 * @property {(canon: CanonProfile, overrides?: object) => any} toProfile
 * @property {(combatants: Combatant[], rng: Rng) => string[]} rollInitiative
 * @property {(attacker: Combatant, defender: Combatant, ctx: AttackContext, rng: Rng) => AttackResult} resolveAttack
 * @property {(actor: Combatant, stat: keyof CanonProfile, difficulty: number, rng: Rng) => TestResult} resolveTest
 * @property {(attacker: Combatant, defender: Combatant, result: AttackResult) => string} describe
 */

export {};
