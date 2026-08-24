#!/usr/bin/env node
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { AttributionConfigSchema, attributeArtifacts } from './attribution.js';
import { auditExtractionBundle } from './audit.js';
import { listBundleFiles, loadArtifactRecords } from './bundle-io.js';
import { sha256 } from './bytes.js';
import { auditCampaignSet } from './campaign.js';
import { computeReferenceClosure } from './dependency.js';
import { auditGrammarConservation, parseEffectText } from './effect-grammar.js';
import {
  type PairedSource,
  createChapterWorkPacket,
  cutChapterProposal,
  ingestStructuredRecord,
} from './extract.js';
import { buildGrammarReport, renderGrammarReportHtml } from './grammar-report.js';
import { buildGrammarSweep, renderGrammarSweepHtml } from './grammar-sweep.js';
import {
  IndependentExpectationsSchema,
  compareChannels,
  validateLeafProvenance,
} from './independent-expectations.js';
import { buildCorpusInventory } from './inventory.js';
import { runPilotEncounter } from './pilot-encounter.js';
import { PilotConfigSchema, assemblePilotScope } from './pilot-scope.js';
import {
  type ArtifactRecord,
  ArtifactRecordSchema,
  ChapterChunkProposalSchema,
  CorpusInventorySchema,
  ExtractionBundleSchema,
  RelativeSourcePathSchema,
} from './schemas.js';
import { inspectSourceStatus, readSourceLock } from './source.js';
import { statblockStats } from './statblock-stats.js';
import {
  ClassificationBatchSchema,
  buildClassificationPackets,
  compareClassificationRuns,
  renderClassificationReview,
  renderClassificationReviewHtml,
  renderComparisonHtml,
  validateClassificationCoverage,
} from './taxonomy.js';

const PilotScopeManifestHeadSchema = z.object({
  schema: z.literal('engarde-pilot-scope-manifest-v1'),
  scope: z.object({ entries: z.array(z.object({ id: z.string().min(1) })) }),
});

async function loadScopedArtifacts(manifestPath: string): Promise<{
  manifestSha256: string;
  scopedIds: string[];
  records: Map<string, ArtifactRecord>;
}> {
  const manifestBytes = await readFile(manifestPath);
  const manifest = PilotScopeManifestHeadSchema.parse(JSON.parse(manifestBytes.toString('utf8')));
  const scopedIds = manifest.scope.entries.map((entry) => entry.id);

  const records = new Map<string, ArtifactRecord>();
  const bundleFiles = [
    ...(await listBundleFiles(resolve(requiredArgument('structured-bundles')))),
    ...(await listBundleFiles(resolve(requiredArgument('chapter-bundles')))),
  ];
  for (const file of bundleFiles) {
    const parsed = ExtractionBundleSchema.parse(JSON.parse(await readFile(file, 'utf8')));
    for (const record of parsed.records) {
      if (record.recordKind === 'artifact') records.set(record.id, record);
    }
  }
  for (const id of scopedIds) {
    if (!records.has(id)) throw new Error(`scoped artifact has no bundle record: ${id}`);
  }
  return { manifestSha256: sha256(manifestBytes), scopedIds, records };
}

async function loadClassificationBatches(
  proposalsRoot: string,
): Promise<ReturnType<typeof ClassificationBatchSchema.parse>[]> {
  const entries = await readdir(proposalsRoot, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => join(proposalsRoot, entry.name))
    .sort();
  const batches = [];
  for (const file of files) {
    batches.push(ClassificationBatchSchema.parse(JSON.parse(await readFile(file, 'utf8'))));
  }
  return batches;
}

const defaultLockPath = fileURLToPath(
  new URL('../config/steelcompendium-source.json', import.meta.url),
);

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

function argumentsNamed(name: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === `--${name}` && process.argv[index + 1]) {
      values.push(process.argv[index + 1] ?? '');
    }
  }
  return values;
}

function requiredArgument(name: string): string {
  const value = argument(name);
  if (!value) throw new Error(`missing required --${name}`);
  return value;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function safeSourceFile(sourceRoot: string, sourcePath: string): string {
  RelativeSourcePathSchema.parse(sourcePath);
  const root = resolve(sourceRoot);
  const file = resolve(root, sourcePath);
  const fromRoot = relative(root, file);
  if (isAbsolute(fromRoot) || fromRoot.startsWith('..')) {
    throw new Error(`source path escapes corpus root: ${sourcePath}`);
  }
  return file;
}

function pairedJsonPath(markdownPath: string): string {
  if (!markdownPath.includes('/md/') || !markdownPath.endsWith('.md')) {
    throw new Error('Markdown path must point into a book md/ directory');
  }
  return markdownPath.replace('/md/', '/json/').replace(/\.md$/, '.json');
}

async function loadPairedSource(sourceRoot: string, markdownPath: string): Promise<PairedSource> {
  const jsonPath = pairedJsonPath(markdownPath);
  return {
    markdownPath,
    markdown: await readFile(safeSourceFile(sourceRoot, markdownPath)),
    jsonPath,
    json: await readFile(safeSourceFile(sourceRoot, jsonPath)),
  };
}

async function emit(value: unknown): Promise<void> {
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  const output = argument('out');
  if (!output) {
    process.stdout.write(serialized);
    return;
  }
  await mkdir(dirname(resolve(output)), { recursive: true });
  await writeFile(resolve(output), serialized, 'utf8');
}

function usage(): never {
  throw new Error(`Usage:
  corpus proposal-schema [--out <schema.json>]
  corpus source-status --root <steelcompendium> [--check-upstream]
  corpus inventory --root <steelcompendium> [--out <inventory.json>] [--strict]
  corpus ingest --root <steelcompendium> --path <en/books/.../md/...md> [--out <bundle.json>]
  corpus ingest-all --root <steelcompendium> --inventory <inventory.json> --out-dir <directory> [--book id] [--category id]
  corpus closure --root <steelcompendium> --bundles <directory> --seed <artifact-id> [--seed <artifact-id>...] [--max-depth N] [--out <closure.json>]
  corpus packet --root <steelcompendium> --path <chapter.md> [--from-line N --to-line N --reason text] [--out <packet.json>]
  corpus cut --root <steelcompendium> --proposal <proposal.json> [--out <bundle.json>]
  corpus audit --root <steelcompendium> --bundle <bundle.json>
  corpus campaign-audit --root <steelcompendium> --inventory <inventory.json> --structured-bundles <directory> --chapter-bundles <directory> --classes-pilot <bundle.json> [--out <manifest.json>]
  corpus pilot-scope --root <steelcompendium> --structured-bundles <directory> --chapter-bundles <directory> [--config <conditions-pilot.json>] [--out <manifest.json>]
  corpus classify-packets --root <steelcompendium> --manifest <pilot-scope.manifest.json> --structured-bundles <directory> --chapter-bundles <directory> --out-dir <directory> [--lanes N]
  corpus classify-validate --root <steelcompendium> --manifest <pilot-scope.manifest.json> --structured-bundles <directory> --chapter-bundles <directory> --proposals <directory> [--out <report.json>]
  corpus classify-review --root <steelcompendium> --manifest <pilot-scope.manifest.json> --structured-bundles <directory> --chapter-bundles <directory> --proposals <directory> --out <review.md> [--html <review.html>]
  corpus grammar-report --root <steelcompendium> --path <ability.md> [--path ...] [--html <grammar.html>] [--out <report.json>]
  corpus grammar-sweep --root <steelcompendium> --structured-bundles <directory> --chapter-bundles <directory> [--attribution <category-attribution.json>] [--html <sweep.html>] [--out <report.json>]
  corpus export-records --root <steelcompendium> --structured-bundles <directory> --chapter-bundles <directory> --out <records.jsonl>
  corpus attribute --root <steelcompendium> --structured-bundles <directory> --chapter-bundles <directory> [--config <category-attribution.json>] [--out <report.json>]
  corpus pilot-encounter --root <steelcompendium> [--out <transcript.json>]
  corpus classify-compare --root <steelcompendium> --manifest <pilot-scope.manifest.json> --structured-bundles <directory> --chapter-bundles <directory> --a <proposals-dir> --b <proposals-dir> [--a-label x --b-label y] [--html <compare.html>] [--out <comparison.json>]`);
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? usage();

  if (command === 'proposal-schema') {
    await emit(z.toJSONSchema(ChapterChunkProposalSchema));
    return;
  }

  const sourceRoot = resolve(requiredArgument('root'));
  const lock = await readSourceLock(resolve(argument('lock') ?? defaultLockPath));

  if (command === 'source-status') {
    const status = await inspectSourceStatus(sourceRoot, lock, hasFlag('check-upstream'));
    await emit(status);
    if (!status.clean || !status.checkoutMatchesPin || status.upstreamMatchesPin === false) {
      process.exitCode = 1;
    }
    return;
  }

  const localStatus = await inspectSourceStatus(sourceRoot, lock);
  if (!localStatus.checkoutMatchesPin || !localStatus.clean) {
    throw new Error('source checkout must be clean and match the tracked pin');
  }

  if (command === 'inventory') {
    const inventory = await buildCorpusInventory(sourceRoot, lock);
    await emit(inventory);
    const errors = inventory.entries.flatMap((entry) =>
      entry.findings.filter((finding) => finding.severity === 'error'),
    );
    if (hasFlag('strict') && errors.length > 0) process.exitCode = 1;
    return;
  }

  if (command === 'ingest') {
    const paired = await loadPairedSource(sourceRoot, requiredArgument('path'));
    await emit(ingestStructuredRecord(paired));
    return;
  }

  if (command === 'ingest-all') {
    const inventory = CorpusInventorySchema.parse(
      JSON.parse(await readFile(resolve(requiredArgument('inventory')), 'utf8')),
    );
    if (inventory.sourceCommit !== lock.commit) {
      throw new Error('inventory source commit does not match the pinned source lock');
    }
    const inventoryErrors = inventory.entries.flatMap((entry) =>
      entry.findings.filter((finding) => finding.severity === 'error'),
    );
    if (inventoryErrors.length > 0) {
      throw new Error(`inventory contains ${inventoryErrors.length} blocking finding(s)`);
    }
    const outputRoot = resolve(requiredArgument('out-dir'));
    const requestedBook = argument('book');
    const requestedCategory = argument('category');
    const selected = inventory.entries.filter(
      (entry) =>
        entry.disposition === 'structured' &&
        (!requestedBook || entry.book === requestedBook) &&
        (!requestedCategory || entry.category === requestedCategory),
    );
    let artifacts = 0;
    for (const entry of selected) {
      const paired = await loadPairedSource(sourceRoot, entry.markdownPath);
      const extracted = ingestStructuredRecord(paired);
      const audit = auditExtractionBundle(paired.markdown, extracted);
      if (!audit.ok) throw new Error(`${entry.markdownPath}: ${audit.errors.join('; ')}`);
      const outputPath = join(outputRoot, entry.markdownPath.replace(/\.md$/, '.bundle.json'));
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, `${JSON.stringify(extracted, null, 2)}\n`, 'utf8');
      artifacts += audit.artifactCount;
    }
    await emit({ files: selected.length, artifacts, outputRoot });
    return;
  }

  if (command === 'closure') {
    const seeds = argumentsNamed('seed');
    if (seeds.length === 0) throw new Error('closure requires at least one --seed');
    const artifacts: ArtifactRecord[] = [];
    for (const file of await listBundleFiles(resolve(requiredArgument('bundles')))) {
      const parsed = ExtractionBundleSchema.parse(JSON.parse(await readFile(file, 'utf8')));
      artifacts.push(
        ...parsed.records
          .filter((record) => record.recordKind === 'artifact')
          .map((record) => ArtifactRecordSchema.parse(record)),
      );
    }
    const maximumDepth = Number(argument('max-depth') ?? '2');
    await emit(computeReferenceClosure(artifacts, seeds, { maxDepth: maximumDepth }));
    return;
  }

  if (command === 'packet') {
    const paired = await loadPairedSource(sourceRoot, requiredArgument('path'));
    const from = argument('from-line');
    const to = argument('to-line');
    const requestedScope =
      from || to
        ? {
            startLine: Number(from ?? requiredArgument('from-line')),
            endLine: Number(to ?? requiredArgument('to-line')),
            reason: argument('reason') ?? 'declared extraction scope',
          }
        : undefined;
    await emit(createChapterWorkPacket(paired, requestedScope));
    return;
  }

  if (command === 'cut') {
    const proposalPath = resolve(requiredArgument('proposal'));
    const proposal = ChapterChunkProposalSchema.parse(
      JSON.parse(await readFile(proposalPath, 'utf8')),
    );
    const paired = await loadPairedSource(sourceRoot, proposal.source.path);
    await emit(cutChapterProposal(paired, proposal));
    return;
  }

  if (command === 'audit') {
    const bundle = ExtractionBundleSchema.parse(
      JSON.parse(await readFile(resolve(requiredArgument('bundle')), 'utf8')),
    );
    const source = await readFile(safeSourceFile(sourceRoot, bundle.source.path));
    const auxiliarySources = new Map<string, Buffer>();
    for (const auxiliary of bundle.source.auxiliarySources) {
      auxiliarySources.set(
        auxiliary.path,
        await readFile(safeSourceFile(sourceRoot, auxiliary.path)),
      );
    }
    const result = auditExtractionBundle(source, bundle, auxiliarySources);
    await emit(result);
    if (!result.ok) process.exitCode = 1;
    return;
  }

  if (command === 'pilot-scope') {
    const configPath = resolve(
      argument('config') ??
        fileURLToPath(new URL('../config/conditions-pilot.json', import.meta.url)),
    );
    const configBytes = await readFile(configPath);
    const pilotConfig = PilotConfigSchema.parse(JSON.parse(configBytes.toString('utf8')));

    const artifacts: ArtifactRecord[] = [];
    const bundleByArtifactId = new Map<string, string>();
    const bundleFiles = [
      ...(await listBundleFiles(resolve(requiredArgument('structured-bundles')))),
      ...(await listBundleFiles(resolve(requiredArgument('chapter-bundles')))),
    ];
    for (const file of bundleFiles) {
      const parsed = ExtractionBundleSchema.parse(JSON.parse(await readFile(file, 'utf8')));
      for (const record of parsed.records) {
        if (record.recordKind !== 'artifact') continue;
        artifacts.push(record);
        bundleByArtifactId.set(record.id, file);
      }
    }

    const scope = assemblePilotScope(artifacts, pilotConfig);

    // Conservation over the discovered closure: every bundle contributing an
    // in-scope artifact must still pass the byte-conservation audit against
    // the pinned source.
    const contributing = new Map<string, number>();
    for (const entry of scope.entries) {
      const bundlePath = bundleByArtifactId.get(entry.id);
      if (!bundlePath) continue;
      contributing.set(bundlePath, (contributing.get(bundlePath) ?? 0) + 1);
    }
    const conservation = [];
    for (const [bundlePath, artifactsInScope] of [...contributing.entries()].sort()) {
      const bundleBytes = await readFile(bundlePath);
      const bundle = ExtractionBundleSchema.parse(JSON.parse(bundleBytes.toString('utf8')));
      const source = await readFile(safeSourceFile(sourceRoot, bundle.source.path));
      const auxiliarySources = new Map<string, Buffer>();
      for (const auxiliary of bundle.source.auxiliarySources) {
        auxiliarySources.set(
          auxiliary.path,
          await readFile(safeSourceFile(sourceRoot, auxiliary.path)),
        );
      }
      const audit = auditExtractionBundle(source, bundle, auxiliarySources);
      conservation.push({
        sourcePath: bundle.source.path,
        bundlePath,
        bundleSha256: sha256(bundleBytes),
        artifactsInScope,
        ok: audit.ok,
        errors: audit.errors,
      });
    }
    const conservationFailures = conservation.filter((entry) => !entry.ok);

    // Total lifecycle accounting: schema validation already makes an unknown
    // state impossible; the manifest still reports the per-state counts.
    const lifecycleCounts: Record<string, number> = {};
    for (const entry of scope.entries) {
      const record = artifacts.find((candidate) => candidate.id === entry.id);
      if (!record) continue;
      const key = `${record.lifecycle.ingest}/${record.lifecycle.classification}/${record.lifecycle.parsing}/${record.lifecycle.conformance}`;
      lifecycleCounts[key] = (lifecycleCounts[key] ?? 0) + 1;
    }

    const ok = scope.findings.length === 0 && conservationFailures.length === 0;
    await emit({
      schemaVersion: 1,
      schema: 'engarde-pilot-scope-manifest-v1',
      source: { pin: lock.commit, checkout: localStatus.head, clean: localStatus.clean },
      config: { path: configPath, sha256: sha256(configBytes) },
      scope,
      conservation: {
        bundlesAudited: conservation.length,
        failures: conservationFailures.length,
        bundles: conservation,
      },
      lifecycleCounts,
      ok,
    });
    if (!ok) process.exitCode = 1;
    return;
  }

  if (command === 'classify-packets') {
    const { manifestSha256, scopedIds, records } = await loadScopedArtifacts(
      resolve(requiredArgument('manifest')),
    );
    const lanes = Number(argument('lanes') ?? '4');
    const packets = buildClassificationPackets(
      scopedIds.map((id) => {
        const record = records.get(id);
        if (!record) throw new Error(`scoped artifact has no bundle record: ${id}`);
        return {
          artifactId: record.id,
          artifactVersion: record.version,
          references: record.references,
          text: record.text,
        };
      }),
      manifestSha256,
      lanes,
    );
    const outputRoot = resolve(requiredArgument('out-dir'));
    await mkdir(outputRoot, { recursive: true });
    for (const packet of packets) {
      await writeFile(
        join(outputRoot, `${packet.laneId}.packet.json`),
        `${JSON.stringify(packet, null, 2)}\n`,
        'utf8',
      );
    }
    await emit({
      manifestSha256,
      lanes: packets.map((packet) => ({
        laneId: packet.laneId,
        artifacts: packet.artifacts.length,
      })),
      outputRoot,
    });
    return;
  }

  if (command === 'classify-validate' || command === 'classify-review') {
    const { manifestSha256, scopedIds, records } = await loadScopedArtifacts(
      resolve(requiredArgument('manifest')),
    );
    const expected = new Map<string, string>();
    for (const id of scopedIds) {
      const record = records.get(id);
      if (record) expected.set(id, record.version);
    }
    const batches = await loadClassificationBatches(resolve(requiredArgument('proposals')));
    const coverage = validateClassificationCoverage(expected, batches, manifestSha256);
    if (command === 'classify-review') {
      const review = renderClassificationReview(batches, coverage);
      const output = resolve(requiredArgument('out'));
      await mkdir(dirname(output), { recursive: true });
      await writeFile(output, review, 'utf8');
      const htmlOutput = argument('html');
      if (htmlOutput) {
        const texts = new Map<string, string>();
        for (const [id, record] of records) texts.set(id, record.text);
        const html = renderClassificationReviewHtml(batches, coverage, texts);
        await mkdir(dirname(resolve(htmlOutput)), { recursive: true });
        await writeFile(resolve(htmlOutput), html, 'utf8');
      }
      process.stdout.write(
        `${JSON.stringify({ ok: coverage.ok, classified: coverage.classified, expected: coverage.expected, uncertain: coverage.uncertain.length, findings: coverage.findings.length, output, htmlOutput: htmlOutput ?? null }, null, 2)}\n`,
      );
    } else {
      await emit(coverage);
    }
    if (!coverage.ok) process.exitCode = 1;
    return;
  }

  if (command === 'grammar-report') {
    const paths = argumentsNamed('path');
    if (paths.length === 0) throw new Error('grammar-report requires at least one --path');
    const entries = [];
    for (const markdownPath of paths) {
      const paired = await loadPairedSource(sourceRoot, markdownPath);
      const extracted = ingestStructuredRecord(paired);
      const artifact = extracted.records.find((record) => record.recordKind === 'artifact');
      if (!artifact || artifact.recordKind !== 'artifact') {
        throw new Error(`no artifact record in ${markdownPath}`);
      }
      const parse = parseEffectText(artifact.text);
      const problems = auditGrammarConservation(artifact.text, parse);
      if (problems.length > 0) {
        throw new Error(`${markdownPath}: grammar conservation failed: ${problems.join('; ')}`);
      }
      entries.push({ artifactId: artifact.id, parse });
    }
    const report = buildGrammarReport(entries);
    const htmlOutput = argument('html');
    if (htmlOutput) {
      await mkdir(dirname(resolve(htmlOutput)), { recursive: true });
      await writeFile(resolve(htmlOutput), renderGrammarReportHtml(entries, report), 'utf8');
    }
    await emit(report);
    return;
  }

  if (command === 'grammar-sweep') {
    const attributionConfig = AttributionConfigSchema.parse(
      JSON.parse(
        await readFile(
          resolve(
            argument('attribution') ??
              fileURLToPath(new URL('../config/category-attribution.json', import.meta.url)),
          ),
          'utf8',
        ),
      ),
    );
    const artifacts: ArtifactRecord[] = [];
    for (const root of [
      requiredArgument('structured-bundles'),
      requiredArgument('chapter-bundles'),
    ]) {
      for (const file of await listBundleFiles(resolve(root))) {
        const parsed = ExtractionBundleSchema.parse(JSON.parse(await readFile(file, 'utf8')));
        for (const record of parsed.records) {
          if (record.recordKind === 'artifact') artifacts.push(record);
        }
      }
    }
    const attribution = attributeArtifacts(
      artifacts.map((artifact) => artifact.id),
      attributionConfig,
    );
    const bucketById = new Map(
      attribution.attributed.map((entry) => [entry.artifactId, entry.bucket]),
    );
    const report = buildGrammarSweep(
      artifacts.map((artifact) => ({
        artifactId: artifact.id,
        bucket: bucketById.get(artifact.id) ?? 'unmatched',
        text: artifact.text,
      })),
    );
    const htmlOutput = argument('html');
    if (htmlOutput) {
      await mkdir(dirname(resolve(htmlOutput)), { recursive: true });
      await writeFile(resolve(htmlOutput), renderGrammarSweepHtml(report), 'utf8');
    }
    await emit(report);
    if (report.headline.conservationViolations > 0) process.exitCode = 1;
    return;
  }

  if (command === 'export-records') {
    // Seed file for hosts that mount the engine behind a database (the
    // Convex Table host): one JSONL row per artifact — id, human-facing
    // slug, verbatim text, and the text checksum that pins provenance.
    const artifacts = await loadArtifactRecords([
      resolve(requiredArgument('structured-bundles')),
      resolve(requiredArgument('chapter-bundles')),
    ]);
    const outputPath = resolve(requiredArgument('out'));
    await mkdir(dirname(outputPath), { recursive: true });
    const lines = artifacts
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((artifact) => {
        // Deterministic participant stats from the checksummed paired JSON
        // (DEC-0008) — present only for stat blocks with full stats.
        const stats = statblockStats(artifact.structuredData);
        return JSON.stringify({
          artifactId: artifact.id,
          slug: artifact.id.split('/').pop() ?? artifact.id,
          text: artifact.text,
          textSha256: sha256(Buffer.from(artifact.text, 'utf8')),
          ...(stats ? { statsJson: JSON.stringify(stats) } : {}),
        });
      });
    await writeFile(outputPath, `${lines.join('\n')}\n`, 'utf8');
    process.stdout.write(
      `${JSON.stringify({ records: artifacts.length, out: outputPath }, null, 2)}\n`,
    );
    return;
  }

  if (command === 'expectations-validate') {
    const paired = await loadPairedSource(sourceRoot, requiredArgument('path'));
    const extracted = ingestStructuredRecord(paired);
    const artifact = extracted.records.find((record) => record.recordKind === 'artifact');
    if (!artifact || artifact.recordKind !== 'artifact') throw new Error('no artifact record');
    const expectations = IndependentExpectationsSchema.parse(
      JSON.parse(await readFile(resolve(requiredArgument('expectations')), 'utf8')),
    );
    if (expectations.artifactId !== artifact.id) {
      throw new Error(`expectations are for ${expectations.artifactId}, not ${artifact.id}`);
    }
    if (expectations.artifactVersion !== artifact.version) {
      throw new Error('expectations pinned to a different artifact version');
    }
    const provenance = validateLeafProvenance(artifact.text, expectations);
    const parse = parseEffectText(artifact.text);
    const comparison = compareChannels(parse, expectations);
    const ok = provenance.length === 0;
    await emit({ artifactId: artifact.id, ok, provenance, comparison });
    if (!ok) process.exitCode = 1;
    return;
  }

  if (command === 'attribute') {
    const configPath = resolve(
      argument('config') ??
        fileURLToPath(new URL('../config/category-attribution.json', import.meta.url)),
    );
    const attributionConfig = AttributionConfigSchema.parse(
      JSON.parse(await readFile(configPath, 'utf8')),
    );
    const ids: string[] = [];
    for (const root of [
      requiredArgument('structured-bundles'),
      requiredArgument('chapter-bundles'),
    ]) {
      for (const file of await listBundleFiles(resolve(root))) {
        const parsed = ExtractionBundleSchema.parse(JSON.parse(await readFile(file, 'utf8')));
        for (const record of parsed.records) {
          if (record.recordKind === 'artifact') ids.push(record.id);
        }
      }
    }
    const result = attributeArtifacts(ids, attributionConfig);
    await emit({
      configPath,
      configStatus: attributionConfig.status,
      totalArtifacts: ids.length,
      byBucket: result.byBucket,
      unmatched: result.unmatched,
      ok: result.ok,
    });
    if (!result.ok) process.exitCode = 1;
    return;
  }

  if (command === 'pilot-encounter') {
    const run = await runPilotEncounter((markdownPath) =>
      loadPairedSource(sourceRoot, markdownPath),
    );
    await emit({ summary: run.summary, transcript: run.transcript });
    if (run.transcript.violationCount > 0) process.exitCode = 1;
    return;
  }

  if (command === 'classify-compare') {
    const { records } = await loadScopedArtifacts(resolve(requiredArgument('manifest')));
    const aBatches = await loadClassificationBatches(resolve(requiredArgument('a')));
    const bBatches = await loadClassificationBatches(resolve(requiredArgument('b')));
    const comparison = compareClassificationRuns(aBatches, bBatches, {
      a: argument('a-label') ?? 'run-a',
      b: argument('b-label') ?? 'run-b',
    });
    const htmlOutput = argument('html');
    if (htmlOutput) {
      const texts = new Map<string, string>();
      for (const [id, record] of records) texts.set(id, record.text);
      await mkdir(dirname(resolve(htmlOutput)), { recursive: true });
      await writeFile(resolve(htmlOutput), renderComparisonHtml(comparison, texts), 'utf8');
    }
    await emit(comparison);
    return;
  }

  if (command === 'campaign-audit') {
    const manifest = await auditCampaignSet({
      sourceRoot,
      lock,
      inventoryPath: resolve(requiredArgument('inventory')),
      structuredBundlesRoot: resolve(requiredArgument('structured-bundles')),
      chapterBundlesRoot: resolve(requiredArgument('chapter-bundles')),
      classesPilotBundlePath: resolve(requiredArgument('classes-pilot')),
    });
    await emit(manifest);
    if (manifest.findings.some((finding) => finding.severity === 'error')) process.exitCode = 1;
    return;
  }

  usage();
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
