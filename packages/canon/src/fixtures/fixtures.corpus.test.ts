import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ingestStructuredRecord } from '../extract.js';
import { statblockStats } from '../statblock-stats.js';
import { BLOOD_FOR_BLOOD } from './blood-for-blood.verbatim.js';
import { DEVIL_ADJUDICATOR } from './devil-adjudicator.verbatim.js';
import { GOBLIN_WARRIOR } from './goblin-warrior.verbatim.js';
import { SKITTERLING } from './skitterling.verbatim.js';

/**
 * The drift guard for committed verbatim fixtures: re-cut each fixture's
 * record from the live pinned corpus and require byte equality. A fixture
 * that no longer matches the books fails here — it can never silently
 * diverge (corpus-gated: runs wherever ENGARDE_CORPUS_ROOT is set).
 */

const sourceRoot = process.env.ENGARDE_CORPUS_ROOT
  ? resolve(process.env.ENGARDE_CORPUS_ROOT)
  : undefined;

describe.skipIf(!sourceRoot)('committed verbatim fixtures match the pinned corpus', () => {
  it('blood-for-blood is byte-identical to the corpus cut', async () => {
    const markdownPath = 'en/books/heroes/md/feature/ability/fury/level-1/blood-for-blood.md';
    const jsonPath = markdownPath.replace('/md/', '/json/').replace(/\.md$/, '.json');
    const bundle = ingestStructuredRecord({
      markdownPath,
      markdown: await readFile(resolve(sourceRoot ?? '', markdownPath)),
      jsonPath,
      json: await readFile(resolve(sourceRoot ?? '', jsonPath)),
    });
    const artifact = bundle.records.find((record) => record.recordKind === 'artifact');
    if (!artifact || artifact.recordKind !== 'artifact') throw new Error('no artifact');
    expect(artifact.id).toBe(BLOOD_FOR_BLOOD.artifactId);
    expect(artifact.text).toBe(BLOOD_FOR_BLOOD.text);
    expect(createHash('sha256').update(BLOOD_FOR_BLOOD.text, 'utf8').digest('hex')).toBe(
      BLOOD_FOR_BLOOD.textSha256,
    );
  });

  it('goblin-warrior (text AND statsJson) is byte-identical to the corpus cut', async () => {
    const markdownPath = 'en/books/monsters/md/monster/goblin/statblock/goblin-warrior.md';
    const jsonPath = markdownPath.replace('/md/', '/json/').replace(/\.md$/, '.json');
    const bundle = ingestStructuredRecord({
      markdownPath,
      markdown: await readFile(resolve(sourceRoot ?? '', markdownPath)),
      jsonPath,
      json: await readFile(resolve(sourceRoot ?? '', jsonPath)),
    });
    const artifact = bundle.records.find((record) => record.recordKind === 'artifact');
    if (!artifact || artifact.recordKind !== 'artifact') throw new Error('no artifact');
    expect(artifact.id).toBe(GOBLIN_WARRIOR.artifactId);
    expect(artifact.text).toBe(GOBLIN_WARRIOR.text);
    expect(createHash('sha256').update(GOBLIN_WARRIOR.text, 'utf8').digest('hex')).toBe(
      GOBLIN_WARRIOR.textSha256,
    );
    expect(JSON.stringify(statblockStats(artifact.structuredData))).toBe(GOBLIN_WARRIOR.statsJson);
  });

  it('devil-adjudicator is byte-identical to the corpus cut', async () => {
    const markdownPath = 'en/books/monsters/md/monster/devil/statblock/devil-adjudicator.md';
    const jsonPath = markdownPath.replace('/md/', '/json/').replace(/\.md$/, '.json');
    const bundle = ingestStructuredRecord({
      markdownPath,
      markdown: await readFile(resolve(sourceRoot ?? '', markdownPath)),
      jsonPath,
      json: await readFile(resolve(sourceRoot ?? '', jsonPath)),
    });
    const artifact = bundle.records.find((record) => record.recordKind === 'artifact');
    if (!artifact || artifact.recordKind !== 'artifact') throw new Error('no artifact');
    expect(artifact.id).toBe(DEVIL_ADJUDICATOR.artifactId);
    expect(artifact.text).toBe(DEVIL_ADJUDICATOR.text);
    expect(createHash('sha256').update(DEVIL_ADJUDICATOR.text, 'utf8').digest('hex')).toBe(
      DEVIL_ADJUDICATOR.textSha256,
    );
    expect(JSON.stringify(statblockStats(artifact.structuredData))).toBe(
      DEVIL_ADJUDICATOR.statsJson,
    );
  });

  it('skitterling is byte-identical to the corpus cut', async () => {
    const markdownPath = 'en/books/monsters/md/monster/goblin/statblock/skitterling.md';
    const jsonPath = markdownPath.replace('/md/', '/json/').replace(/\.md$/, '.json');
    const bundle = ingestStructuredRecord({
      markdownPath,
      markdown: await readFile(resolve(sourceRoot ?? '', markdownPath)),
      jsonPath,
      json: await readFile(resolve(sourceRoot ?? '', jsonPath)),
    });
    const artifact = bundle.records.find((record) => record.recordKind === 'artifact');
    if (!artifact || artifact.recordKind !== 'artifact') throw new Error('no artifact');
    expect(artifact.id).toBe(SKITTERLING.artifactId);
    expect(artifact.text).toBe(SKITTERLING.text);
    expect(createHash('sha256').update(SKITTERLING.text, 'utf8').digest('hex')).toBe(
      SKITTERLING.textSha256,
    );
    expect(JSON.stringify(statblockStats(artifact.structuredData))).toBe(SKITTERLING.statsJson);
  });
});
