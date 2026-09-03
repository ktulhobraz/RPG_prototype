import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const CORE = new URL('../src/core/', import.meta.url).pathname;

/** @param {string} dir @returns {string[]} */
function jsFilesIn(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return jsFilesIn(full);
    return entry.endsWith('.js') ? [full] : [];
  });
}

/**
 * Strip comments and string literals so a rule is judged on code, not on prose about the rule.
 * A doc comment that says "core never calls Math.random()" must not fail the check it describes.
 */
function codeOnly(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')   // block comments
    .replace(/(^|[^:])\/\/.*$/gm, '$1')  // line comments, leaving protocol-relative URLs alone
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/`(?:\\.|[^`\\])*`/g, '``');
}

/**
 * D-11 and D-16, enforced rather than merely documented: core is pure logic, so it can be tested
 * headlessly and ported to another shell without dragging a browser along, and every random
 * decision comes from an injected seeded generator so delves replay exactly.
 */
const FORBIDDEN = [
  { pattern: /\bdocument\b/, why: 'core must not touch the DOM (D-11)' },
  { pattern: /\bwindow\s*\./, why: 'core must not reach for browser globals (D-11)' },
  { pattern: /\blocalStorage\b/, why: 'core takes an injected storage adapter instead (D-11)' },
  { pattern: /\bsessionStorage\b/, why: 'core takes an injected storage adapter instead (D-11)' },
  { pattern: /\bMath\s*\.\s*random\b/, why: 'core must roll through the seeded Rng (D-16)' },
  { pattern: /\bDate\s*\.\s*now\b/, why: 'core must stay deterministic; time is not an input (D-16)' },
  { pattern: /\bfetch\s*\(/, why: 'core must not perform I/O; content is passed in (D-11)' },
];

test('src/core stays free of the DOM, ambient randomness and I/O', () => {
  const files = jsFilesIn(CORE);
  assert.ok(files.length > 5, 'expected to find the core modules');

  /** @type {string[]} */
  const violations = [];
  for (const file of files) {
    const code = codeOnly(readFileSync(file, 'utf8'));
    for (const { pattern, why } of FORBIDDEN) {
      if (pattern.test(code)) {
        violations.push(`${file.replace(CORE, 'src/core/')}: ${pattern.source} — ${why}`);
      }
    }
  }
  assert.deepEqual(violations, [], `core purity violated:\n  ${violations.join('\n  ')}`);
});

test('the purity check would actually catch a violation', () => {
  // Guards the stripper: without this, a bug that blanks all code would make the test above
  // pass vacuously forever.
  const sample = codeOnly(`
    // core must never call Math.random() directly
    /* nor localStorage */
    const note = "document is not available here";
    const value = Math.random();
  `);
  assert.ok(/\bMath\s*\.\s*random\b/.test(sample), 'real code must survive stripping');
  assert.ok(!/\bdocument\b/.test(sample), 'strings must be stripped');
  assert.ok(!/\blocalStorage\b/.test(sample), 'block comments must be stripped');
});
