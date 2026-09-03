// @ts-check
/**
 * Application shell.
 *
 * This is the only module that touches the DOM lifecycle, storage and timers. It holds the
 * session, forwards taps to core intent functions, and re-renders. It contains no game rules:
 * anything that decides an outcome lives in src/core.
 */

import { loadContent } from '../core/content.js';
import {
  startSession, explore, acknowledge, endHeroTurn, runAiTurns, restoreSession, finish,
} from '../core/state.js';
import {
  activeActor, moveTo, attack, defend, useAbility, attackOptions,
} from '../core/combat.js';
import { RULES } from '../core/rules/index.js';
import { createStorageAdapter, save, load, clearSave } from '../core/save.js';
import { el, replace } from './dom.js';
import { partyScreen, PARTY_SIZE } from './screens/party.js';
import { delveScreen } from './screens/delve.js';
import { outcomeScreen } from './screens/outcome.js';

/** How long the board rests on a monster's move before the next one, in milliseconds. */
const AI_BEAT = 420;

const root = /** @type {HTMLElement} */ (document.getElementById('app'));
const storage = createStorageAdapter(globalThis.localStorage);

/** @type {{content: any, session: any, selected: string[], pendingAbility: string | null, aiTimer: any}} */
const ui = {
  content: null,
  session: null,
  selected: [],
  pendingAbility: null,
  aiTimer: null,
};

/* ---------- intents ---------- */

const actions = {
  explore() {
    explore(ui.session);
    persist();
    render();
    scheduleAi();
  },

  acknowledge() {
    acknowledge(ui.session);
    persist();
    render();
    scheduleAi();
  },

  move(cell) {
    moveTo(ui.session.combat, cell);
    render();
  },

  attack(target) {
    const combat = ui.session.combat;
    const options = attackOptions(combat);
    const kind = options.melee.some((t) => t.id === target.id) ? 'melee' : 'ranged';
    if (attack(combat, target, kind, RULES, ui.session.rng)) {
      ui.pendingAbility = null;
      afterHeroAction();
    }
  },

  selectAbility(id) {
    ui.pendingAbility = id;
    render();
  },

  useAbility(id, target) {
    if (useAbility(ui.session.combat, id, target, RULES, ui.session.rng)) {
      ui.pendingAbility = null;
      afterHeroAction();
    }
  },

  brace() {
    defend(ui.session.combat, ui.session.rng);
    render();
  },

  endTurn() {
    ui.pendingAbility = null;
    endHeroTurn(ui.session);
    persist();
    render();
    scheduleAi();
  },

  abandon() {
    finish(ui.session, 'defeat');
    clearSave(storage);
    render();
  },

  again() {
    ui.session = null;
    ui.pendingAbility = null;
    clearSave(storage);
    render();
  },
};

/**
 * After an attack or ability the hero has spent its action, but may still have movement.
 * The turn is not ended automatically — repositioning after a kill is a real decision.
 */
function afterHeroAction() {
  const combat = ui.session.combat;
  if (combat && combat.status !== 'active') {
    endHeroTurn(ui.session);
    persist();
  }
  render();
  scheduleAi();
}

/**
 * Let monsters act one beat at a time, so a phone player can see what happened rather than
 * being shown the aftermath. The engine resolves them all at once; this only paces the redraw.
 */
function scheduleAi() {
  clearTimeout(ui.aiTimer);
  const session = ui.session;
  if (!session || session.phase !== 'combat') return;

  const actor = activeActor(session.combat);
  if (!actor || actor.side === 'hero') return;

  ui.aiTimer = setTimeout(() => {
    runAiTurns(session);
    persist();
    render();
  }, AI_BEAT);
}

function persist() {
  if (!ui.session) return;
  if (ui.session.phase === 'victory' || ui.session.phase === 'defeat') clearSave(storage);
  else save(storage, ui.session);
}

/* ---------- rendering ---------- */

function render() {
  const session = ui.session;

  if (!session) {
    replace(root, [partyScreen({
      heroes: ui.content.heroes,
      selected: ui.selected,
      hasSave: Boolean(load(storage)),
      onToggle: (ids) => { ui.selected = ids.slice(0, PARTY_SIZE); render(); },
      onStart: startDelve,
      onContinue: continueDelve,
    })]);
    return;
  }

  if (session.phase === 'victory' || session.phase === 'defeat') {
    replace(root, [outcomeScreen({ session, onAgain: actions.again })]);
    return;
  }

  replace(root, [delveScreen({ session, pendingAbility: ui.pendingAbility, actions })]);
}

function startDelve() {
  ui.session = startSession({
    content: ui.content,
    heroIds: ui.selected,
    // A readable seed, so a good run can be shared and replayed exactly.
    seed: Math.random().toString(36).slice(2, 8),
  });
  ui.pendingAbility = null;
  persist();
  render();
}

function continueDelve() {
  const snapshot = load(storage);
  const restored = snapshot ? restoreSession(snapshot, ui.content) : null;
  if (!restored) {
    // A save we cannot read is worse than none; clear it rather than offering it again.
    clearSave(storage);
    render();
    return;
  }
  ui.session = restored;
  ui.pendingAbility = null;
  render();
  scheduleAi();
}

/* ---------- boot ---------- */

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
      el('p.faint', {
        text: 'This page uses ES modules and fetch, so it must be served over http rather than '
          + 'opened as a file. Try: python3 -m http.server 8080',
      }),
    ])]);
    return;
  }

  ui.selected = ui.content.heroes.slice(0, PARTY_SIZE).map((h) => h.id);
  render();
}

boot();
