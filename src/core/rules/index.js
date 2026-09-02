// @ts-check
/** Registry of available rule systems. */

import { d6System } from './d6.js';
import { d100System } from './d100.js';

/** @typedef {import('./contract.js').RuleSystem} RuleSystem */

/** @type {Record<string, RuleSystem>} */
export const RULE_SYSTEMS = {
  [d6System.id]: d6System,
  [d100System.id]: d100System,
};

export const DEFAULT_RULE_SYSTEM = d6System.id;

/**
 * Look up a system by id, falling back to the default rather than throwing — a stale id in a
 * save file should not stop the game from loading.
 * @param {string | undefined} id
 * @returns {RuleSystem}
 */
export function getRuleSystem(id) {
  return RULE_SYSTEMS[id ?? ''] ?? RULE_SYSTEMS[DEFAULT_RULE_SYSTEM];
}

/** @returns {RuleSystem[]} */
export function listRuleSystems() {
  return Object.values(RULE_SYSTEMS);
}
