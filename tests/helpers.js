import { readFileSync } from 'node:fs';
import { validateContent } from '../src/core/content.js';

const read = (name) =>
  JSON.parse(readFileSync(new URL(`../src/data/${name}.json`, import.meta.url), 'utf8'));

/** Fresh content on every call, so a test mutating a session cannot leak into the next. */
export function loadTestContent() {
  return validateContent({
    heroes: read('heroes'),
    monsters: read('monsters'),
    rooms: read('rooms'),
    events: read('events'),
    items: read('items'),
    corruptions: read('corruptions'),
    battlefields: read('battlefields'),
  });
}

export const DEFAULT_PARTY = ['warrior', 'slayer', 'ranger', 'scholar'];
