// @vitest-environment node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ingestStructuredRecord } from '@engarde/canon';
import { statblockStats } from '@engarde/canon/statblock-stats';
import { describe, expect, it } from 'vitest';
import { HEALING_GRACE, KOBOLD_SIGNIFER, WAR_DOG_AEROCITE } from '../convex/verbatimFixtures';

/**
 * The drift guard for the backend's committed verbatim fixtures (the
 * `fixtures.corpus.test.ts` pattern from `@engarde/canon`): re-cut each
 * fixture's record from the live pinned corpus and require byte equality. A
 * fixture that no longer matches the books fails here — it can never
 * silently diverge (corpus-gated: runs wherever ENGARDE_CORPUS_ROOT is set;
 * node environment + outside `convex/` because the corpus is read from disk
 * with Node builtins the Convex runtime does not have).
 */

const sourceRoot = process.env.ENGARDE_CORPUS_ROOT
  ? resolve(process.env.ENGARDE_CORPUS_ROOT)
  : undefined;

async function recut(markdownPath: string) {
  const jsonPath = markdownPath.replace('/md/', '/json/').replace(/\.md$/, '.json');
  const bundle = ingestStructuredRecord({
    markdownPath,
    markdown: await readFile(resolve(sourceRoot ?? '', markdownPath)),
    jsonPath,
    json: await readFile(resolve(sourceRoot ?? '', jsonPath)),
  });
  const artifact = bundle.records.find((record) => record.recordKind === 'artifact');
  if (!artifact || artifact.recordKind !== 'artifact') throw new Error('no artifact');
  return artifact;
}

describe.skipIf(!sourceRoot)('committed verbatim fixtures match the pinned corpus', () => {
  it('kobold-signifer (text AND statsJson) is byte-identical to the corpus cut', async () => {
    const artifact = await recut(
      'en/books/monsters/md/monster/kobold/statblock/kobold-signifer.md',
    );
    expect(artifact.id).toBe(KOBOLD_SIGNIFER.artifactId);
    expect(artifact.text).toBe(KOBOLD_SIGNIFER.text);
    expect(createHash('sha256').update(KOBOLD_SIGNIFER.text, 'utf8').digest('hex')).toBe(
      KOBOLD_SIGNIFER.textSha256,
    );
    expect(JSON.stringify(statblockStats(artifact.structuredData))).toBe(KOBOLD_SIGNIFER.statsJson);
  });

  it('healing-grace is byte-identical to the corpus cut', async () => {
    const artifact = await recut(
      'en/books/heroes/md/feature/ability/conduit/level-1/healing-grace.md',
    );
    expect(artifact.id).toBe(HEALING_GRACE.artifactId);
    expect(artifact.text).toBe(HEALING_GRACE.text);
    expect(createHash('sha256').update(HEALING_GRACE.text, 'utf8').digest('hex')).toBe(
      HEALING_GRACE.textSha256,
    );
  });

  it('war-dog-aerocite (text AND statsJson) is byte-identical to the corpus cut', async () => {
    const artifact = await recut(
      'en/books/monsters/md/monster/war-dog/3rd-echelon/statblock/war-dog-aerocite.md',
    );
    expect(artifact.id).toBe(WAR_DOG_AEROCITE.artifactId);
    expect(artifact.text).toBe(WAR_DOG_AEROCITE.text);
    expect(createHash('sha256').update(WAR_DOG_AEROCITE.text, 'utf8').digest('hex')).toBe(
      WAR_DOG_AEROCITE.textSha256,
    );
    expect(JSON.stringify(statblockStats(artifact.structuredData))).toBe(
      WAR_DOG_AEROCITE.statsJson,
    );
  });
});
