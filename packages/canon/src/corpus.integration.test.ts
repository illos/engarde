import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { auditExtractionBundle } from './audit.js';
import { ingestStructuredRecord } from './extract.js';
import { buildCorpusInventory } from './inventory.js';
import { inspectSourceStatus, readSourceLock } from './source.js';

const sourceRoot = process.env.ENGARDE_CORPUS_ROOT
  ? resolve(process.env.ENGARDE_CORPUS_ROOT)
  : undefined;
const lockPath = fileURLToPath(new URL('../config/steelcompendium-source.json', import.meta.url));

describe.skipIf(!sourceRoot)('real SteelCompendium snapshot', () => {
  it('matches the pinned source and has a fully dispositioned paired inventory', async () => {
    const lock = await readSourceLock(lockPath);
    const status = await inspectSourceStatus(sourceRoot ?? '', lock);
    const inventory = await buildCorpusInventory(sourceRoot ?? '', lock);
    const errors = inventory.entries.flatMap((entry) =>
      entry.findings.filter((finding) => finding.severity === 'error'),
    );

    expect(status.checkoutMatchesPin).toBe(true);
    expect(inventory.entries).toHaveLength(3_081);
    // Summoner admitted to the baseline (official MCDM class, Creator License):
    // +222 structured, +5 chapter chunks, -227 excluded. Beastheart remains excluded.
    expect(inventory.entries.filter((entry) => entry.disposition === 'structured')).toHaveLength(
      2_815,
    );
    expect(inventory.entries.filter((entry) => entry.disposition === 'chunk')).toHaveLength(25);
    expect(inventory.entries.filter((entry) => entry.disposition === 'exclude')).toHaveLength(241);
    expect(errors).toEqual([]);
  });

  it('mechanically ingests and conserves every core condition record', async () => {
    const lock = await readSourceLock(lockPath);
    const inventory = await buildCorpusInventory(sourceRoot ?? '', lock);
    const conditions = inventory.entries.filter(
      (entry) => entry.book === 'heroes' && entry.category === 'condition',
    );

    expect(conditions).toHaveLength(9);
    for (const condition of conditions) {
      const markdown = await readFile(resolve(sourceRoot ?? '', condition.markdownPath));
      const json = await readFile(resolve(sourceRoot ?? '', condition.jsonPath));
      const bundle = ingestStructuredRecord({
        markdownPath: condition.markdownPath,
        markdown,
        jsonPath: condition.jsonPath,
        json,
      });
      expect(
        auditExtractionBundle(markdown, bundle, new Map([[condition.jsonPath, json]])),
      ).toMatchObject({ ok: true });
    }
  });
});
