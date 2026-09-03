// @ts-check
/** Turns content records into combatants the engine can use. */

import { normalizeProfile, applyMods } from './profile.js';

/** @typedef {import('./rules/contract.js').RuleSystem} RuleSystem */
/** @typedef {import('./rules/contract.js').Combatant} Combatant */
/** @typedef {import('./profile.js').CanonProfile} CanonProfile */

/**
 * @typedef {object} EntityData
 * @property {string} id
 * @property {string} name
 * @property {Partial<CanonProfile>} profile
 * @property {string[]} [abilities]
 * @property {string} [glyph]
 * @property {string} [role]
 * @property {number} [xpValue]
 */

/**
 * @typedef {Combatant & {
 *   dataId:string, glyph:string, role:string, abilities:string[], x:number, y:number,
 *   alive:boolean, items:any[], xp:number, level:number, baseCanon:CanonProfile
 * }} Actor
 */

/** @param {EntityData} data @param {RuleSystem} rules @param {{id?:string,mods?:Partial<CanonProfile>[],side?:'hero'|'monster'}} [options] */
export function createActor(data, rules, options = {}) {
  const baseCanon = normalizeProfile(data.profile, data.id);
  const canon = options.mods?.length ? applyMods(baseCanon, options.mods) : { ...baseCanon };
  const profile = rules.toProfile(canon);
  const maxWounds = profile.wounds ?? canon.wounds;
  return {
    id: options.id ?? data.id,
    dataId: data.id,
    name: data.name,
    side: options.side ?? 'monster',
    baseCanon: { ...baseCanon },
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

/** @param {Actor} actor @param {number} amount */
export function damageActor(actor, amount) {
  const dealt = Math.min(actor.wounds, Math.max(0, Math.round(amount)));
  actor.wounds -= dealt;
  if (actor.wounds <= 0) {
    actor.wounds = 0;
    actor.alive = false;
  }
  return dealt;
}

/** @param {Actor} actor @param {number} amount */
export function healActor(actor, amount) {
  if (!actor.alive) return 0;
  const healed = Math.min(actor.maxWounds - actor.wounds, Math.max(0, Math.round(amount)));
  actor.wounds += healed;
  return healed;
}
