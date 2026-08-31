import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ingestStructuredRecord } from './extract.js';
import { FURY_CLASS } from './fixtures/fury-class.verbatim.js';
import { KIT_RECORDS, STORMWIGHT_KIT_BONUS_RECORDS } from './fixtures/kits.verbatim.js';
import { parseFrontmatter } from './frontmatter.js';
import { FURY_L1_OVERLAY, STANDARD_KITS, STORMWIGHT_KITS } from './hero-overlay-fury.js';

/**
 * Corpus-gated drift guards for the Fury-vertical fixtures and overlay:
 * every committed verbatim cut is re-cut from the live pinned corpus and
 * byte-compared, and every overlay claim (pool membership, costs, grants)
 * is re-derived from pin bytes. A fixture or overlay row that no longer
 * matches the books fails here — nothing can silently diverge.
 */

const sourceRoot = process.env.ENGARDE_CORPUS_ROOT
  ? resolve(process.env.ENGARDE_CORPUS_ROOT)
  : undefined;

type Fixture = {
  artifactId: string;
  sourcePath: string;
  textSha256: string;
  text: string;
  structuredJson: string;
};

async function recut(markdownPath: string) {
  const jsonPath = markdownPath.replace('/md/', '/json/').replace(/\.md$/, '.json');
  const bundle = ingestStructuredRecord({
    markdownPath,
    markdown: await readFile(resolve(sourceRoot ?? '', markdownPath)),
    jsonPath,
    json: await readFile(resolve(sourceRoot ?? '', jsonPath)),
  });
  const artifact = bundle.records.find((record) => record.recordKind === 'artifact');
  if (!artifact || artifact.recordKind !== 'artifact')
    throw new Error(`no artifact: ${markdownPath}`);
  return artifact;
}

async function expectFixtureMatches(fixture: Fixture) {
  const artifact = await recut(fixture.sourcePath);
  expect(artifact.id).toBe(fixture.artifactId);
  expect(artifact.text).toBe(fixture.text);
  expect(createHash('sha256').update(fixture.text, 'utf8').digest('hex')).toBe(fixture.textSha256);
  expect(JSON.stringify(artifact.structuredData)).toBe(fixture.structuredJson);
}

describe.skipIf(!sourceRoot)('fury-vertical fixtures match the pinned corpus', () => {
  it('fury class record (text AND structuredJson) is byte-identical', async () => {
    await expectFixtureMatches(FURY_CLASS);
  });

  it('every kit record is byte-identical, and the sweep is COMPLETE (all pin kits committed)', async () => {
    for (const fixture of KIT_RECORDS) await expectFixtureMatches(fixture);
    const kitDir = resolve(sourceRoot ?? '', 'en/books/heroes/md/kit');
    const pinKits = (await readdir(kitDir)).filter((file) => file.endsWith('.md')).sort();
    expect(KIT_RECORDS.map((fixture) => `${fixture.slug}.md`).sort()).toEqual(pinKits);
  });

  it('every stormwight kit-bonuses record is byte-identical', async () => {
    for (const fixture of STORMWIGHT_KIT_BONUS_RECORDS) await expectFixtureMatches(fixture);
  });
});

describe.skipIf(!sourceRoot)('fury L1 overlay claims re-derive from pin bytes', () => {
  it('ability pools match frontmatter subtype/cost of the L1 fury ability records', async () => {
    const dir = resolve(sourceRoot ?? '', 'en/books/heroes/md/feature/ability/fury/level-1');
    const bySubtype = {
      signature: [] as string[],
      '3 Ferocity': [] as string[],
      '5 Ferocity': [] as string[],
    };
    for (const file of (await readdir(dir)).filter((name) => name.endsWith('.md'))) {
      const frontmatter = parseFrontmatter(await readFile(resolve(dir, file))).metadata;
      const scc = String(frontmatter.scc);
      if (frontmatter.subtype === 'signature') bySubtype.signature.push(scc);
      else if (frontmatter.cost === '3 Ferocity') bySubtype['3 Ferocity'].push(scc);
      else if (frontmatter.cost === '5 Ferocity') bySubtype['5 Ferocity'].push(scc);
    }
    const poolOf = (suffix: string) => {
      const row = FURY_L1_OVERLAY.find((candidate) => candidate.key.endsWith(suffix));
      if (!row || row.optionSource.kind !== 'options') throw new Error(`missing ${suffix}`);
      return row.optionSource.options.map((option) => option.key).sort();
    };
    expect(poolOf('#signature-ability')).toEqual(bySubtype.signature.sort());
    expect(poolOf('#3pt-ability')).toEqual(bySubtype['3 Ferocity'].sort());
    expect(poolOf('#5pt-ability')).toEqual(bySubtype['5 Ferocity'].sort());
  });

  it('skills pool is exactly the exploration ∪ intrigue skill groups', async () => {
    const sccs: string[] = [];
    for (const group of ['exploration', 'intrigue']) {
      const dir = resolve(sourceRoot ?? '', `en/books/heroes/md/skill/${group}`);
      for (const file of (await readdir(dir)).filter((name) => name.endsWith('.md'))) {
        sccs.push(String(parseFrontmatter(await readFile(resolve(dir, file))).metadata.scc));
      }
    }
    const row = FURY_L1_OVERLAY.find((candidate) => candidate.key.endsWith('#skills-2'));
    if (!row || row.optionSource.kind !== 'options') throw new Error('missing skills-2');
    expect(row.optionSource.options.map((option) => option.key).sort()).toEqual(sccs.sort());
  });

  it('kit pools partition the pin kit folder: 21 standard + 4 stormwight named by the Kits Table', async () => {
    const kitDir = resolve(sourceRoot ?? '', 'en/books/heroes/md/kit');
    const pinKitSccs: string[] = [];
    for (const file of (await readdir(kitDir)).filter((name) => name.endsWith('.md'))) {
      pinKitSccs.push(String(parseFrontmatter(await readFile(resolve(kitDir, file))).metadata.scc));
    }
    const standard = STANDARD_KITS.map((option) => option.key);
    const stormwight = STORMWIGHT_KITS.map((option) => option.key);
    expect([...standard, ...stormwight].sort()).toEqual(pinKitSccs.sort());
    // The 21 standard kits are exactly the sccs the Kits Table prints.
    const chapter = await readFile(
      resolve(sourceRoot ?? '', 'en/books/heroes/md/chapter/kits.md'),
      'utf8',
    );
    const tableStart = chapter.indexOf('###### Kits Table');
    expect(tableStart).toBeGreaterThan(-1);
    const table = chapter.slice(tableStart);
    for (const scc of standard) {
      expect(table).toContain(`(scc.v1:${scc})`);
    }
    for (const scc of stormwight) {
      expect(table).not.toContain(`(scc.v1:${scc})`);
    }
  });

  it('aspect options carry the printed skill and triggered-action grants', async () => {
    const aspectText = await readFile(
      resolve(sourceRoot ?? '', 'en/books/heroes/md/feature/fury/level-1/primordial-aspect.md'),
      'utf8',
    );
    const triggeredText = await readFile(
      resolve(
        sourceRoot ?? '',
        'en/books/heroes/md/feature/fury/level-1/aspect-triggered-action.md',
      ),
      'utf8',
    );
    const row = FURY_L1_OVERLAY.find(
      (candidate) => candidate.key === 'mcdm.heroes.v1/feature.fury.level-1/primordial-aspect',
    );
    if (!row || row.optionSource.kind !== 'options') throw new Error('missing aspect row');
    for (const option of row.optionSource.options) {
      expect(aspectText).toContain(`**${option.label}:**`);
      for (const grant of option.grants ?? []) {
        if (grant.kind === 'skill') expect(aspectText).toContain(`(scc.v1:${grant.scc})`);
        if (grant.kind === 'ability') expect(triggeredText).toContain(`(scc.v1:${grant.scc})`);
      }
    }
  });
});
