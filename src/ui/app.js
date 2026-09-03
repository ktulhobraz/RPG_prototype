// @ts-check
/** Application shell: DOM lifecycle, storage and pacing only. */

import { loadContent } from '../core/content.js';
import {
  startSession, step as stepIntent, acknowledge, endHeroTurn, runAiTurns, restoreSession, finish,
  assignStashItem,
} from '../core/state.js';
import {
  startArena, nextArenaFight, retryArenaFight, endArenaHeroTurn, runArenaAiTurns,
} from '../core/arena.js';
import { activeActor, moveTo, attack, defend, useAbility, attackOptions } from '../core/combat.js';
import { RULES } from '../core/rules/index.js';
import { createStorageAdapter, save, load, clearSave } from '../core/save.js';
import { el, replace } from './dom.js';
import { partyScreen, PARTY_SIZE } from './screens/party.js';
import { delveScreen } from './screens/delve.js';
import { arenaSetupScreen, arenaScreen } from './screens/arena.js';
import { outcomeScreen } from './screens/outcome.js';

const AI_BEAT = 420;
const root = /** @type {HTMLElement} */ (document.getElementById('app'));
const storage = createStorageAdapter(globalThis.localStorage);
const ui = {
  content: null,
  session: null,
  arena: null,
  mode: 'delve',
  arenaHeroId: null,
  selected: [],
  pendingAbility: null,
  aiTimer: null,
  panel: null,
};

const actions = {
  step(cell) { stepIntent(ui.session, cell); persist(); render(); scheduleAi(); },
  acknowledge() { acknowledge(ui.session); persist(); render(); scheduleAi(); },
  assignItem(itemId, heroId) { assignStashItem(ui.session, itemId, heroId); persist(); render(); },
  openHero(heroId) { ui.panel = { kind: 'hero', heroId }; render(); },
  openStash() { ui.panel = { kind: 'stash' }; render(); },
  closePanel() { ui.panel = null; render(); },
  move(cell) { moveTo(ui.session.combat, cell); render(); },
  attack(target) {
    const combat = ui.session.combat;
    const options = attackOptions(combat);
    const kind = options.melee.some((t) => t.id === target.id) ? 'melee' : 'ranged';
    if (attack(combat, target, kind, RULES, ui.session.rng)) { ui.pendingAbility = null; afterHeroAction(); }
  },
  selectAbility(id) { ui.pendingAbility = id; render(); },
  useAbility(id, target) {
    if (useAbility(ui.session.combat, id, target, RULES, ui.session.rng)) {
      ui.pendingAbility = null; afterHeroAction();
    }
  },
  brace() { defend(ui.session.combat, ui.session.rng); render(); },
  endTurn() { ui.pendingAbility = null; endHeroTurn(ui.session); persist(); render(); scheduleAi(); },
  abandon() { finish(ui.session, 'defeat'); ui.panel = null; clearSave(storage); render(); },
  again() { ui.session = null; ui.pendingAbility = null; ui.panel = null; clearSave(storage); render(); },
};

const arenaActions = {
  move(cell) { moveTo(ui.arena.combat, cell); render(); },
  attack(target) {
    const combat = ui.arena.combat;
    const options = attackOptions(combat);
    const kind = options.melee.some((candidate) => candidate.id === target.id) ? 'melee' : 'ranged';
    if (attack(combat, target, kind, ui.arena.rules, ui.arena.rng)) {
      ui.pendingAbility = null;
      afterArenaHeroAction();
    }
  },
  selectAbility(id) { ui.pendingAbility = id; render(); },
  useAbility(id, target) {
    if (useAbility(ui.arena.combat, id, target, ui.arena.rules, ui.arena.rng)) {
      ui.pendingAbility = null;
      afterArenaHeroAction();
    }
  },
  brace() { defend(ui.arena.combat, ui.arena.rng); render(); },
  endTurn() {
    ui.pendingAbility = null;
    endArenaHeroTurn(ui.arena);
    render();
    scheduleArenaAi();
  },
  nextArena() {
    ui.pendingAbility = null;
    nextArenaFight(ui.arena);
    render();
    scheduleArenaAi();
  },
  retryArena() {
    ui.pendingAbility = null;
    retryArenaFight(ui.arena);
    render();
    scheduleArenaAi();
  },
  exitArena() {
    clearTimeout(ui.aiTimer);
    ui.arena = null;
    ui.mode = 'delve';
    ui.pendingAbility = null;
    render();
  },
};

function afterHeroAction() {
  const combat = ui.session.combat;
  if (combat && combat.status !== 'active') { endHeroTurn(ui.session); persist(); }
  render(); scheduleAi();
}

function afterArenaHeroAction() {
  const combat = ui.arena?.combat;
  if (combat && combat.status !== 'active') endArenaHeroTurn(ui.arena);
  render();
  scheduleArenaAi();
}

function scheduleAi() {
  clearTimeout(ui.aiTimer);
  const session = ui.session;
  if (!session || session.phase !== 'combat') return;
  const actor = activeActor(session.combat);
  if (!actor || actor.side === 'hero') return;
  ui.aiTimer = setTimeout(() => { runAiTurns(session); persist(); render(); }, AI_BEAT);
}

function scheduleArenaAi() {
  clearTimeout(ui.aiTimer);
  const arena = ui.arena;
  if (!arena || arena.phase !== 'combat') return;
  const actor = activeActor(arena.combat);
  if (!actor || actor.side === 'hero') return;
  ui.aiTimer = setTimeout(() => { runArenaAiTurns(arena); render(); scheduleArenaAi(); }, AI_BEAT);
}

function persist() {
  if (!ui.session) return;
  if (ui.session.phase === 'victory' || ui.session.phase === 'defeat') clearSave(storage);
  else save(storage, ui.session);
}

function render() {
  if (ui.arena) {
    replace(root, [arenaScreen({ arena: ui.arena, pendingAbility: ui.pendingAbility, actions: arenaActions })]);
    return;
  }
  if (ui.mode === 'arenaSetup') {
    replace(root, [arenaSetupScreen({
      heroes: ui.content.heroes,
      selectedHeroId: ui.arenaHeroId,
      onSelect: (heroId) => { ui.arenaHeroId = heroId; render(); },
      onStart: startArenaMode,
      onBack: () => { ui.mode = 'delve'; render(); },
    })]);
    return;
  }

  const session = ui.session;
  if (!session) {
    replace(root, [partyScreen({
      heroes: ui.content.heroes, selected: ui.selected, hasSave: Boolean(load(storage)),
      onToggle: (ids) => { ui.selected = ids.slice(0, PARTY_SIZE); render(); },
      onStart: startDelve, onContinue: continueDelve,
      onArena: () => {
        ui.mode = 'arenaSetup';
        ui.arenaHeroId = ui.arenaHeroId ?? ui.content.heroes[0]?.id ?? null;
        render();
      },
    })]);
    return;
  }
  if (session.phase === 'victory' || session.phase === 'defeat') {
    replace(root, [outcomeScreen({ session, onAgain: actions.again })]); return;
  }
  replace(root, [delveScreen({
    session,
    pendingAbility: ui.pendingAbility,
    panel: ui.panel,
    actions,
  })]);
}

function startDelve() {
  ui.session = startSession({
    content: ui.content, heroIds: ui.selected, seed: Math.random().toString(36).slice(2, 8),
  });
  ui.pendingAbility = null;
  ui.panel = null;
  persist();
  render();
}

function startArenaMode() {
  if (!ui.arenaHeroId) return;
  ui.arena = startArena({
    content: ui.content,
    heroId: ui.arenaHeroId,
    seed: Math.random().toString(36).slice(2, 8),
  });
  ui.pendingAbility = null;
  render();
  scheduleArenaAi();
}

function continueDelve() {
  const snapshot = load(storage);
  const restored = snapshot ? restoreSession(snapshot, ui.content) : null;
  if (!restored) { clearSave(storage); render(); return; }
  ui.session = restored;
  ui.pendingAbility = null;
  ui.panel = null;
  render();
  scheduleAi();
}

async function boot() {
  try {
    ui.content = await loadContent(async (name) => {
      const response = await fetch(new URL(`../data/${name}.json`, import.meta.url));
      if (!response.ok) throw new Error(`could not load ${name}.json (${response.status})`);
      return response.json();
    });
  } catch (error) {
    replace(root, [el('div.panel', {}, [
      el('p', { text: 'Could not load the game content.' }),
      el('p.muted', { text: String(error instanceof Error ? error.message : error) }),
    ])]);
    return;
  }
  ui.selected = ui.content.heroes.slice(0, PARTY_SIZE).map((h) => h.id);
  ui.arenaHeroId = ui.content.heroes[0]?.id ?? null;
  render();
}

boot();
