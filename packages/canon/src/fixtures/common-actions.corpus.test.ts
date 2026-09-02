import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ingestStructuredRecord } from '../extract.js';
import { COMMON_ACTION_FIXTURES } from './common-actions.verbatim.js';
import { GATE_SOURCE_FIXTURES } from './gate-sources.verbatim.js';
import { TEST_RULE_FIXTURES } from './test-rules.verbatim.js';

/**
 * Drift guard for the 17 committed common-action cuts: re-cut every one
 * from the live pinned corpus and require byte equality, plus the frozen
 * per-group counts. A pin bump that edits, adds or removes a printed common
 * action fails here (corpus-gated: runs wherever ENGARDE_CORPUS_ROOT is set).
 */

const sourceRoot = process.env.ENGARDE_CORPUS_ROOT
  ? resolve(process.env.ENGARDE_CORPUS_ROOT)
  : undefined;
const COMMON_ROOT = 'en/books/heroes/md/feature/common';

describe.skipIf(!sourceRoot)('committed common-action fixtures match the pinned corpus', () => {
  it('re-cuts all 17 byte-identically, with the frozen per-group counts', async () => {
    const cut = new Map<string, string>();
    for (const group of ['main-actions', 'maneuvers', 'move-actions'] as const) {
      const files = (await readdir(resolve(sourceRoot ?? '', COMMON_ROOT, group)))
        .filter((name) => name.endsWith('.md'))
        .sort();
      for (const file of files) {
        const markdownPath = `${COMMON_ROOT}/${group}/${file}`;
        const jsonPath = markdownPath.replace('/md/', '/json/').replace(/\.md$/, '.json');
        const bundle = ingestStructuredRecord({
          markdownPath,
          markdown: await readFile(resolve(sourceRoot ?? '', markdownPath)),
          jsonPath,
          json: await readFile(resolve(sourceRoot ?? '', jsonPath)),
        });
        const artifact = bundle.records.find((record) => record.recordKind === 'artifact');
        if (!artifact || artifact.recordKind !== 'artifact') throw new Error(`no artifact ${file}`);
        cut.set(artifact.id, artifact.text);
      }
    }
    expect(cut.size).toBe(17);
    expect([...cut.keys()].sort()).toEqual(
      COMMON_ACTION_FIXTURES.map((fixture) => fixture.artifactId).sort(),
    );
    for (const fixture of COMMON_ACTION_FIXTURES) {
      expect(cut.get(fixture.artifactId), fixture.artifactId).toBe(fixture.text);
      expect(
        createHash('sha256').update(fixture.text, 'utf8').digest('hex'),
        fixture.artifactId,
      ).toBe(fixture.textSha256);
    }
  });
});

describe.skipIf(!sourceRoot)(
  'committed gate-source and test-rule fixtures match the pinned corpus',
  () => {
    it('re-cuts every artifact a gate cites or the test substrate transcribes, byte-identically', async () => {
      expect(GATE_SOURCE_FIXTURES.length).toBeGreaterThan(0);
      expect(TEST_RULE_FIXTURES.length).toBeGreaterThan(0);
      for (const fixture of [...GATE_SOURCE_FIXTURES, ...TEST_RULE_FIXTURES]) {
        const jsonPath = fixture.sourcePath.replace('/md/', '/json/').replace(/\.md$/, '.json');
        const bundle = ingestStructuredRecord({
          markdownPath: fixture.sourcePath,
          markdown: await readFile(resolve(sourceRoot ?? '', fixture.sourcePath)),
          jsonPath,
          json: await readFile(resolve(sourceRoot ?? '', jsonPath)),
        });
        const artifact = bundle.records.find((record) => record.recordKind === 'artifact');
        if (!artifact || artifact.recordKind !== 'artifact') {
          throw new Error(`no artifact ${fixture.sourcePath}`);
        }
        expect(artifact.id, fixture.sourcePath).toBe(fixture.artifactId);
        expect(artifact.text, fixture.artifactId).toBe(fixture.text);
        expect(
          createHash('sha256').update(fixture.text, 'utf8').digest('hex'),
          fixture.artifactId,
        ).toBe(fixture.textSha256);
      }
    });
  },
);
