// @ts-check
/**
 * The active rule system.
 *
 * The engine talks to a rule system through the contract in ./contract.js rather than rolling
 * dice itself. Only one system ships today; the indirection is what keeps every die roll in one
 * file instead of scattered through combat, events and traps.
 */

import { d6System } from './d6.js';

/** @typedef {import('./contract.js').RuleSystem} RuleSystem */

/** @type {RuleSystem} */
export const RULES = d6System;

export const DEFAULT_RULE_SYSTEM = d6System.id;

/**
 * Resolve a rule system by id. Unknown ids fall back to the active system rather than throwing,
 * so a save written by an older build still loads.
 * @param {string} [_id]
 * @returns {RuleSystem}
 */
export function getRuleSystem(_id) {
  return RULES;
}
