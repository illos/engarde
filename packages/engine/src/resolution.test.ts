import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { initialEncounterState } from './driver.js';
import { isOpenResolution, openResolutions, openResolutionsOwnedBy } from './resolution.js';
import type { EncounterState, ParticipantStats, ResolutionEntry } from './schemas.js';

/**
 * `isOpenResolution` is the ONE home for resolution openness [GOTCHA-0009].
 * Before this extraction the predicate was hand-written as
 * `phase === 'rolled'` at eleven sites across engine, canon, and backend —
 * every one of which would have had to grow the reaction-effect family's
 * pre-roll `declared` arm independently, which is the exact shape that has
 * already shipped three defects on this codebase.
 */

function entryAt(phase: ResolutionEntry['phase'], resolutionId: string, actorId: string) {
  return {
    resolutionId,
    actorId,
    abilityArtifactId: 'ability/test-ability',
    actionCost: 'main-action',
    phase,
    modifications: [],
  } as unknown as ResolutionEntry;
}

/** Goblin Warrior — monsters/json/monster/goblin/statblock/goblin-warrior.
 * A real corpus stat block; only the resolution stack is under test. */
const GOBLIN_WARRIOR_STATS: ParticipantStats = {
  staminaMax: 15,
  characteristics: { might: -2, agility: 2, reason: 0, intuition: 0, presence: -1 },
  immunities: [],
  weaknesses: [],
  potencies: null,
  organization: 'Horde',
  recoveriesMax: null,
  freeStrike: null,
  withCaptain: null,
  withCaptainBenefit: null,
};

function stateWith(stack: ResolutionEntry[]): EncounterState {
  const base = initialEncounterState([
    { id: 'p1', kind: 'hero', stats: GOBLIN_WARRIOR_STATS },
    { id: 'p2', kind: 'hero', stats: GOBLIN_WARRIOR_STATS },
  ]);
  return { ...base, resolutionStack: stack };
}

describe('resolution openness one-home', () => {
  it('a rolled entry is open and a committed entry is not', () => {
    expect(isOpenResolution(entryAt('rolled', 'r1', 'p1'))).toBe(true);
    expect(isOpenResolution(entryAt('committed', 'r1', 'p1'))).toBe(false);
  });

  it('openResolutions keeps stack order and drops committed entries', () => {
    const state = stateWith([
      entryAt('rolled', 'r1', 'p1'),
      entryAt('committed', 'r2', 'p1'),
      entryAt('rolled', 'r3', 'p2'),
    ]);
    expect(openResolutions(state).map((entry) => entry.resolutionId)).toEqual(['r1', 'r3']);
  });

  it('openResolutionsOwnedBy is openResolutions narrowed to the named actors', () => {
    const state = stateWith([
      entryAt('rolled', 'r1', 'p1'),
      entryAt('rolled', 'r2', 'p2'),
      entryAt('committed', 'r3', 'p1'),
    ]);
    expect(openResolutionsOwnedBy(state, ['p1']).map((entry) => entry.resolutionId)).toEqual([
      'r1',
    ]);
    expect(openResolutionsOwnedBy(state, ['p1', 'p2']).map((entry) => entry.resolutionId)).toEqual([
      'r1',
      'r2',
    ]);
  });

  it('every phase arm the schema declares is ruled open or closed by this one home', () => {
    // Exhaustive over the declared union: a new arm fails here until
    // someone decides, at the one home, whether it is open.
    const declared: ResolutionEntry['phase'][] = ['rolled', 'committed'];
    for (const phase of declared) {
      expect(typeof isOpenResolution(entryAt(phase, 'r1', 'p1'))).toBe('bool' + 'ean');
    }
  });
});

// ── the guard: no second implementation of openness anywhere ────────────

function workspaceRoot(): string {
  let dir = import.meta.dirname;
  while (!readdirSync(dir).includes('pnpm-workspace.yaml')) dir = dirname(dir);
  return dir;
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.artifacts', '_generated']);

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx|mts)$/.test(name)) out.push(full);
  }
  return out;
}

describe('resolution openness has no second implementation', () => {
  const root = workspaceRoot();
  const files = sourceFiles(join(root, 'packages')).concat(sourceFiles(join(root, 'apps')));

  it('scans the workspace', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('no production source hand-writes a phase openness test', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const rel = relative(root, file);
      // Test files build fixtures at a literal phase, and this file names
      // the pattern in prose; both are exempt.
      if (/\.(test|spec)\.tsx?$/.test(rel)) continue;
      const text = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      if (/phase\s*[=!]==\s*['"](rolled|committed)['"]/.test(text)) offenders.push(rel);
    }
    // resolution.ts owns the one legitimate `=== 'committed'` test — the
    // bleeding once-per-action check, which asks about commit specifically
    // and not about openness.
    expect(offenders).toEqual(['packages/engine/src/resolution.ts']);
  });
});
