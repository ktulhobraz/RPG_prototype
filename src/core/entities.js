// @ts-check
/**
 * Turns content records into combatants the engine can use.
 *
 * The rule system is passed in rather than imported, so the same content produces a valid
 * combatant under either system without the factory knowing which one is active.
 */

import { normalizeProfile, applyMods } from './profile.js';

/** @typedef {import('./rules/contract.js').RuleSystem} RuleSystem */
/** @typedef {import('./rules/contract.js').Combatant} Combatant */
/** @typedef {import('./profile.js').CanonProfile} CanonProfile */

/**
 * @typedef {object} EntityData
 * @property {string} id
 * @property {string} name
 * @property {Partial<CanonProfile>} profile
 * 
 * @property {string[]} [abilities]
 * @property {string} [glyph]
 * @property {string} [role]
 * @property {number} [xpValue]
 */

/**
 * @typedef {Combatant & {
 *   dataId: string,
 *   glyph: string,
 *   role: string,
 *   abilities: string[],
 *   x: number,
 *   y: number,
 *   alive: boolean,
 *   items: any[],
 *   xp: number,
 *   level: number,
 * }} Actor
 */

/**
 * @param {EntityData} data
 * @param {RuleSystem} rules
 * @param {object} [options]
 * @param {string} [options.id]                Unique instance id; defaults to the data id.
 * @param {Partial<CanonProfile>[]} [options.mods]  Equipment or level bonuses.
 * @param {'hero' | 'monster'} [options.side]
 * @returns {Actor}
 */
export function createActor(data, rules, options = {}) {
  const base = normalizeProfile(data.profile, data.id);
  const canon = options.mods?.length ? applyMods(base, options.mods) : base;
  const profile = rules.toProfile(canon);
  // Wounds live on whichever scale the active system uses, so the pool comes from the profile.
  const maxWounds = profile.wounds ?? canon.wounds;

  return {
    id: options.id ?? data.id,
    dataId: data.id,
    name: data.name,
    side: options.side ?? 'monster',
    canon,
    profile,
    wounds: maxWounds,
    maxWounds,
    glyph: data.glyph ?? data.name.charAt(0).toUpperCase(),
    role: data.role ?? 'melee',
    abilities: data.abilities ?? [],
    x: 0,
    y: 0,
    alive: true,
    items: [],
    xp: 0,
    level: 1,
  };
}

/**
 * Apply damage and flip the alive flag. Returns the amount actually dealt, which can be less
 * than requested when the target had fewer wounds left.
 * @param {Actor} actor @param {number} amount
 */
export function damageActor(actor, amount) {
  const dealt = Math.min(actor.wounds, Math.max(0, Math.round(amount)));
  actor.wounds -= dealt;
  if (actor.wounds <= 0) {
    actor.wounds = 0;
    actor.alive = false;
  }
  return dealt;
}

/**
 * Heal without exceeding the maximum. Dead actors stay dead — recovery is a separate concern.
 * @param {Actor} actor @param {number} amount
 */
export function healActor(actor, amount) {
  if (!actor.alive) return 0;
  const healed = Math.min(actor.maxWounds - actor.wounds, Math.max(0, Math.round(amount)));
  actor.wounds += healed;
  return healed;
}
