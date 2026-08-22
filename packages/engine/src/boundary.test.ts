import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The engine boundary, enforced mechanically from the first commit
 * (engine-plan 0.1): production sources are pure — no I/O, no framework,
 * no ambient time or randomness. Test files may use node APIs; production
 * files may not.
 */

const SRC_DIR = join(import.meta.dirname, '.');
const ALLOWED_BARE_IMPORTS = new Set(['zod']);

/** Comments may NAME forbidden APIs (to say they're forbidden); code may not use them. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const productionFiles = readdirSync(SRC_DIR)
  .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
  .map((name) => ({ name, text: stripComments(readFileSync(join(SRC_DIR, name), 'utf8')) }));

describe('engine boundary', () => {
  it('scans at least one production file', () => {
    expect(productionFiles.length).toBeGreaterThan(0);
  });

  it.each(productionFiles)('$name imports only zod or relative modules', ({ text }) => {
    const imports = [...text.matchAll(/(?:import|export)[^'"]*from\s+['"]([^'"]+)['"]/g)].map(
      (m) => m[1] as string,
    );
    for (const specifier of imports) {
      const allowed = specifier.startsWith('./') || ALLOWED_BARE_IMPORTS.has(specifier);
      expect(allowed, `forbidden import "${specifier}"`).toBe(true);
    }
  });

  it.each(productionFiles)('$name uses no ambient time, randomness, or I/O', ({ text }) => {
    const forbidden = [
      /Math\s*\.\s*random/,
      /Date\s*\.\s*now/,
      /new\s+Date\s*\(/,
      /\bprocess\s*\./,
      /\bfetch\s*\(/,
      /\brequire\s*\(/,
      /setTimeout|setInterval/,
      /\bcrypto\s*\./,
    ];
    for (const pattern of forbidden) {
      expect(pattern.test(text), `forbidden pattern ${pattern}`).toBe(false);
    }
  });
});
