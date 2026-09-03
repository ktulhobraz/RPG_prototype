// @ts-check
/**
 * Content loading.
 *
 * Two loaders exist because core must not assume an environment: the browser fetches JSON, the
 * test runner reads it from disk. Both produce the same shape, and neither lives inside core's
 * pure modules.
 */

/** @typedef {import('./state.js').Content} Content */

const FILES = /** @type {const} */ (
  ['heroes', 'monsters', 'rooms', 'events', 'items', 'corruptions']
);

/**
 * @param {(name: string) => Promise<any>} read
 * @returns {Promise<Content>}
 */
export async function loadContent(read) {
  const entries = await Promise.all(FILES.map(async (name) => [name, await read(name)]));
  const content = /** @type {any} */ (Object.fromEntries(entries));
  validateContent(content);
  return content;
}

/**
 * Fail loudly at load time rather than mid-delve, where a missing tile would be far harder
 * to trace back to the file that caused it.
 * @param {Content} content
 */
export function validateContent(content) {
  for (const name of FILES) {
    const list = /** @type {any} */ (content)[name];
    if (!Array.isArray(list) || list.length === 0) {
      throw new Error(`content: "${name}" must be a non-empty array`);
    }
  }
  if (!content.rooms.some((r) => r.kind === 'entrance')) {
    throw new Error('content: rooms must include an "entrance" tile');
  }
  if (!content.rooms.some((r) => r.kind === 'objective')) {
    throw new Error('content: rooms must include an "objective" tile');
  }
  if (!content.monsters.some((m) => m.role === 'boss')) {
    throw new Error('content: monsters must include a "boss"');
  }
  for (const theme of content.corruptions) {
    // A theme with no tier-1 monster goes silent for the first half of any delve it's rolled
    // for — the ambush pool comes up empty until depthRatio crosses 0.6. Catch it at load time.
    const hasEarlyMonster = content.monsters.some(
      (m) => theme.factions.includes(m.faction) && (m.tier ?? 1) === 1,
    );
    if (!hasEarlyMonster) {
      throw new Error(`content: corruption "${theme.id}" has no tier-1 monster in its factions`);
    }
  }
  for (const room of content.rooms) {
    if (room.cells.length !== room.h) {
      throw new Error(`room ${room.id}: declares h=${room.h} but has ${room.cells.length} rows`);
    }
    for (const row of room.cells) {
      if (row.length !== room.w) {
        throw new Error(`room ${room.id}: declares w=${room.w} but has a row of ${row.length}`);
      }
    }
  }
  return content;
}
