import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { sha256 } from './bytes.js';
import { type CampaignAuditOptions, auditCampaignSet } from './campaign.js';
import { type PairedSource, cutChapterProposal } from './extract.js';
import { buildCorpusInventory } from './inventory.js';
import type { ExtractionBundle, SourceLock } from './schemas.js';

const execFileAsync = promisify(execFile);
const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true })));
});

interface Fixture {
  options: CampaignAuditOptions;
  chapterBundlePath: string;
  sourcePath: string;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function proposal(
  paired: PairedSource,
  endLine: number,
  includeBodyPreamble = false,
): Parameters<typeof cutChapterProposal>[1] {
  return {
    schemaVersion: 1,
    schema: 'engarde-chapter-chunk-proposal-v1',
    source: {
      path: paired.markdownPath,
      sha256: sha256(paired.markdown),
      stableId: 'mcdm.heroes.v1/chapter/classes',
      scope: { startLine: includeBodyPreamble ? 6 : 7, endLine, reason: 'fixture scope' },
    },
    chunks: [
      ...(includeBodyPreamble ? [['body-preamble', 6, '', null] as const] : []),
      ['stacking-unique-effects', 7, '## Stacking Unique Effects', null],
      ['condition-stacking', 9, '## Condition Stacking', 'stacking-unique-effects'],
      ['ending-effects', 11, '## Ending Effects', 'stacking-unique-effects'],
      ['end-of-encounter', 13, '## End of Encounter', 'stacking-unique-effects'],
      [
        'creature-ends-an-ability-effect',
        15,
        '## Creature Ends an Ability Effect',
        'stacking-unique-effects',
      ],
    ].map(([key, startLine, anchor, parentKey]) => ({
      key,
      startLine,
      anchor,
      title: key,
      parentKey,
      tags: [],
    })),
  } as Parameters<typeof cutChapterProposal>[1];
}

async function fixture(): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), 'engarde-canon-campaign-'));
  temporaryRoots.push(root);
  const sourceRoot = join(root, 'source');
  const artifactsRoot = join(root, 'artifacts');
  const sourcePath = 'en/books/heroes/md/chapter/classes.md';
  const jsonPath = 'en/books/heroes/json/chapter/classes.json';
  const markdown = Buffer.from(
    '---\nname: Classes\nscc: mcdm.heroes.v1/chapter/classes\ntype: chapter\n---\n\n## Stacking Unique Effects\nText.\n## Condition Stacking\nText.\n## Ending Effects\nText.\n## End of Encounter\nText.\n## Creature Ends an Ability Effect\nText.\n',
    'utf8',
  );
  const json = Buffer.from(
    JSON.stringify({ name: 'Classes', scc: 'mcdm.heroes.v1/chapter/classes', type: 'chapter' }),
    'utf8',
  );
  await mkdir(join(sourceRoot, 'en/books/heroes/md/chapter'), { recursive: true });
  await writeFile(join(sourceRoot, sourcePath), markdown, { flag: 'w' });
  await mkdir(join(sourceRoot, 'en/books/heroes/json/chapter'), { recursive: true });
  await writeFile(join(sourceRoot, jsonPath), json);
  await execFileAsync('git', ['init', '--quiet', sourceRoot]);
  await execFileAsync('git', ['-C', sourceRoot, 'config', 'user.email', 'fixture@example.test']);
  await execFileAsync('git', ['-C', sourceRoot, 'config', 'user.name', 'Fixture']);
  await execFileAsync('git', ['-C', sourceRoot, 'add', '.']);
  await execFileAsync('git', ['-C', sourceRoot, 'commit', '--quiet', '-m', 'fixture']);
  const commit = (
    await execFileAsync('git', ['-C', sourceRoot, 'rev-parse', 'HEAD'])
  ).stdout.trim();
  const lock: SourceLock = {
    schemaVersion: 1,
    source: 'steelcompendium-data-unified',
    remote: 'https://example.test/steelcompendium.git',
    commit,
    tag: 'fixture',
    commitDate: '2026-08-03T10:39:51-04:00',
    books: [
      {
        id: 'heroes',
        disposition: 'include',
        reason: 'fixture',
        categories: { chapter: 'chunk' },
      },
    ],
  };
  const inventoryPath = join(artifactsRoot, 'inventory.json');
  await writeJson(inventoryPath, await buildCorpusInventory(sourceRoot, lock));
  const paired: PairedSource = { markdownPath: sourcePath, markdown, jsonPath, json };
  const chapterRoot = join(artifactsRoot, 'chapters');
  const chapterBundlePath = join(chapterRoot, 'classes.bundle.json');
  await writeJson(chapterBundlePath, cutChapterProposal(paired, proposal(paired, 16, true)));
  const pilotPath = join(artifactsRoot, 'pilot.bundle.json');
  await writeJson(pilotPath, cutChapterProposal(paired, proposal(paired, 15)));
  const structuredRoot = join(artifactsRoot, 'structured');
  await mkdir(structuredRoot, { recursive: true });
  return {
    sourcePath,
    chapterBundlePath,
    options: {
      sourceRoot,
      lock,
      inventoryPath,
      structuredBundlesRoot: structuredRoot,
      chapterBundlesRoot: chapterRoot,
      classesPilotBundlePath: pilotPath,
    },
  };
}

async function bundle(path: string): Promise<ExtractionBundle> {
  return JSON.parse(await readFile(path, 'utf8')) as ExtractionBundle;
}

async function rewriteBundle(
  path: string,
  mutate: (value: ExtractionBundle) => void,
): Promise<void> {
  const value = await bundle(path);
  mutate(value);
  await writeJson(path, value);
}

function codes(result: Awaited<ReturnType<typeof auditCampaignSet>>): string[] {
  return result.findings.map((finding) => finding.code);
}

describe('campaign-set audit', () => {
  it('accepts one full, byte-conserved definitive bundle and preserves the Classes pilot starts', async () => {
    const test = await fixture();
    const result = await auditCampaignSet(test.options);
    expect(result.findings).toEqual([]);
    expect(result.counts).toMatchObject({ includedSources: 1, definitiveBundles: 1 });
  });

  it('reports a missing included bundle', async () => {
    const test = await fixture();
    await rm(test.chapterBundlePath);
    expect(codes(await auditCampaignSet(test.options))).toContain('missing-definitive-bundle');
  });

  it('reports duplicate definitive bundles for one source', async () => {
    const test = await fixture();
    await writeFile(
      join(test.options.chapterBundlesRoot, 'duplicate.bundle.json'),
      await readFile(test.chapterBundlePath),
    );
    expect(codes(await auditCampaignSet(test.options))).toContain('duplicate-definitive-bundle');
  });

  it('reports a stale inventory and source-backed bundle after source bytes change', async () => {
    const test = await fixture();
    await writeFile(join(test.options.sourceRoot, test.sourcePath), 'stale source\n');
    const result = await auditCampaignSet(test.options);
    expect(codes(result)).toContain('stale-inventory');
    expect(codes(result)).toContain('failed-bundle-audit');
  });

  it('reports an unexpected bundle source', async () => {
    const test = await fixture();
    await rewriteBundle(test.chapterBundlePath, (value) => {
      value.source.path = 'en/books/heroes/md/chapter/unknown.md';
      for (const record of value.records) record.source.path = value.source.path;
    });
    expect(codes(await auditCampaignSet(test.options))).toContain('unexpected-bundle');
  });

  it('reports duplicate artifact IDs globally', async () => {
    const test = await fixture();
    await rewriteBundle(test.chapterBundlePath, (value) => {
      const artifact = value.records.find((record) => record.recordKind === 'artifact');
      if (artifact) value.records.push({ ...artifact });
    });
    expect(codes(await auditCampaignSet(test.options))).toContain('duplicate-global-artifact-id');
  });

  it('reports a failed bundle conservation audit', async () => {
    const test = await fixture();
    await rewriteBundle(test.chapterBundlePath, (value) => {
      const artifact = value.records.find((record) => record.recordKind === 'artifact');
      if (artifact?.recordKind === 'artifact') artifact.text = 'not source bytes';
    });
    expect(codes(await auditCampaignSet(test.options))).toContain('failed-bundle-audit');
  });

  it('rejects a scoped chapter bundle even when its local partition conserves bytes', async () => {
    const test = await fixture();
    await writeFile(test.chapterBundlePath, await readFile(test.options.classesPilotBundlePath));
    expect(codes(await auditCampaignSet(test.options))).toContain('scoped-chapter-bundle');
  });

  it('requires all five accepted Classes pilot starts unchanged', async () => {
    const test = await fixture();
    await rewriteBundle(test.chapterBundlePath, (value) => {
      const artifact = value.records.find(
        (record) =>
          record.recordKind === 'artifact' && record.id.endsWith('#stacking-unique-effects'),
      );
      if (artifact) artifact.id = `${artifact.id}-changed`;
    });
    expect(codes(await auditCampaignSet(test.options))).toContain('classes-pilot-start-changed');
  });
});
