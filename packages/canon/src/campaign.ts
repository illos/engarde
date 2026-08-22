import { readFile, readdir } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { auditExtractionBundle } from './audit.js';
import { sha256 } from './bytes.js';
import { parseFrontmatter } from './frontmatter.js';
import { buildCorpusInventory } from './inventory.js';
import {
  type CampaignAuditManifest,
  type CampaignFinding,
  CorpusInventorySchema,
  ExtractionBundleSchema,
  RelativeSourcePathSchema,
  type SourceLock,
} from './schemas.js';
import { inspectSourceStatus } from './source.js';

export const CAMPAIGN_AUDIT_TOOL_VERSION = '1.0.0';

export interface CampaignAuditOptions {
  sourceRoot: string;
  lock: SourceLock;
  inventoryPath: string;
  structuredBundlesRoot: string;
  chapterBundlesRoot: string;
  classesPilotBundlePath: string;
}

interface LocatedBundle {
  path: string;
  expectedDisposition: 'structured' | 'chunk';
}

function finding(
  findings: CampaignFinding[],
  code: string,
  message: string,
  context: Pick<CampaignFinding, 'sourcePath' | 'bundlePath'> = {},
): void {
  findings.push({ severity: 'error', code, message, ...context });
}

function corpusFile(sourceRoot: string, sourcePath: string): string {
  RelativeSourcePathSchema.parse(sourcePath);
  const root = resolve(sourceRoot);
  const file = resolve(root, sourcePath);
  const fromRoot = relative(root, file);
  if (isAbsolute(fromRoot) || fromRoot.startsWith('..')) {
    throw new Error(`source path escapes corpus root: ${sourcePath}`);
  }
  return file;
}

async function listBundleFiles(root: string, expectedDisposition: 'structured' | 'chunk') {
  const output: LocatedBundle[] = [];
  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile() && entry.name.endsWith('.bundle.json')) {
        output.push({ path, expectedDisposition });
      }
    }
  }
  await visit(resolve(root));
  return output.sort((left, right) => left.path.localeCompare(right.path));
}

function isExactInventoryMatch(actual: unknown, expected: unknown): boolean {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function chapterHasFullBody(
  bundle: ReturnType<typeof ExtractionBundleSchema.parse>,
  source: Buffer,
) {
  const frontmatter = parseFrontmatter(source);
  const errors: string[] = [];
  const metadata = bundle.records.filter((record) => record.recordKind === 'exclusion');
  if (
    metadata.length !== 1 ||
    metadata[0]?.reasonCode !== 'source-metadata' ||
    metadata[0].source.span.byteStart !== 0 ||
    metadata[0].source.span.byteEnd !== frontmatter.byteEnd
  ) {
    errors.push(
      'chapter must have exactly one source-metadata exclusion covering only frontmatter',
    );
  }
  for (const record of bundle.records) {
    if (record.recordKind === 'exclusion' && record.reasonCode === 'outside-declared-scope') {
      errors.push('chapter contains an outside-declared-scope exclusion');
    }
    if (record.recordKind === 'artifact' && record.source.span.byteStart < frontmatter.byteEnd) {
      errors.push(`${record.id}: chapter artifact overlaps frontmatter`);
    }
  }
  return errors;
}

interface PilotStart {
  id: string;
  byteStart: number;
  lineStart: number;
  parentKey: unknown;
}

function pilotStarts(bundle: ReturnType<typeof ExtractionBundleSchema.parse>): PilotStart[] {
  return bundle.records
    .filter((record) => record.recordKind === 'artifact')
    .map((record) => ({
      id: record.id,
      byteStart: record.source.span.byteStart,
      lineStart: record.source.span.lineStart,
      parentKey: record.sourceMetadata.parentKey,
    }));
}

function checkClassesPilot(
  pilot: ReturnType<typeof ExtractionBundleSchema.parse>,
  full: ReturnType<typeof ExtractionBundleSchema.parse> | undefined,
  findings: CampaignFinding[],
): void {
  const starts = pilotStarts(pilot);
  if (starts.length !== 5) {
    finding(findings, 'classes-pilot-invalid', 'Classes pilot must contain exactly five artifacts');
    return;
  }
  if (!full) {
    finding(
      findings,
      'classes-pilot-missing-full-bundle',
      'Classes has no definitive full chapter bundle',
      {
        sourcePath: pilot.source.path,
      },
    );
    return;
  }
  for (const start of starts) {
    const matching = full.records.find(
      (record) => record.recordKind === 'artifact' && record.id === start.id,
    );
    if (
      !matching ||
      matching.recordKind !== 'artifact' ||
      matching.source.span.byteStart !== start.byteStart ||
      matching.source.span.lineStart !== start.lineStart ||
      matching.sourceMetadata.parentKey !== start.parentKey
    ) {
      finding(
        findings,
        'classes-pilot-start-changed',
        `Classes pilot start ${start.id} is missing or changed in the definitive bundle`,
        { sourcePath: pilot.source.path },
      );
    }
  }
}

export async function auditCampaignSet(
  options: CampaignAuditOptions,
): Promise<CampaignAuditManifest> {
  const findings: CampaignFinding[] = [];
  let sourceStatus: Awaited<ReturnType<typeof inspectSourceStatus>> | undefined;
  try {
    sourceStatus = await inspectSourceStatus(options.sourceRoot, options.lock);
    if (!sourceStatus.checkoutMatchesPin) {
      finding(findings, 'source-pin-mismatch', 'source checkout does not match the pinned commit');
    }
    if (!sourceStatus.clean)
      finding(findings, 'source-checkout-dirty', 'source checkout is not clean');
  } catch (error) {
    finding(
      findings,
      'source-status-failed',
      error instanceof Error ? error.message : String(error),
    );
  }

  const inventoryBytes = await readFile(resolve(options.inventoryPath));
  const inventoryChecksum = sha256(inventoryBytes);
  const inventory = CorpusInventorySchema.parse(JSON.parse(inventoryBytes.toString('utf8')));
  if (inventory.sourceCommit !== options.lock.commit) {
    finding(
      findings,
      'inventory-source-pin-mismatch',
      'inventory source commit does not match lock',
    );
  }
  try {
    const rebuilt = await buildCorpusInventory(options.sourceRoot, options.lock);
    if (!isExactInventoryMatch(inventory, rebuilt)) {
      finding(findings, 'stale-inventory', 'inventory does not match the actual source and lock');
    }
  } catch (error) {
    finding(
      findings,
      'inventory-rebuild-failed',
      error instanceof Error ? error.message : String(error),
    );
  }
  for (const entry of inventory.entries) {
    if (entry.findings.some((entryFinding) => entryFinding.severity === 'error')) {
      finding(findings, 'inventory-blocking-finding', 'inventory entry has a blocking finding', {
        sourcePath: entry.markdownPath,
      });
    }
  }

  const located: LocatedBundle[] = [];
  for (const [root, disposition] of [
    [options.structuredBundlesRoot, 'structured'],
    [options.chapterBundlesRoot, 'chunk'],
  ] as const) {
    try {
      located.push(...(await listBundleFiles(root, disposition)));
    } catch (error) {
      finding(
        findings,
        'bundle-root-unreadable',
        error instanceof Error ? error.message : String(error),
        {
          bundlePath: resolve(root),
        },
      );
    }
  }

  const expectedByPath = new Map(inventory.entries.map((entry) => [entry.markdownPath, entry]));
  const bundlesBySource = new Map<string, LocatedBundle[]>();
  const globalArtifactIds = new Map<string, string>();
  const manifestBundles: CampaignAuditManifest['bundles'] = [];
  const parsedBundles = new Map<string, ReturnType<typeof ExtractionBundleSchema.parse>>();
  let artifactRecords = 0;
  let exclusionRecords = 0;

  for (const locatedBundle of located) {
    let bytes: Buffer;
    let bundle: ReturnType<typeof ExtractionBundleSchema.parse>;
    try {
      bytes = await readFile(locatedBundle.path);
      bundle = ExtractionBundleSchema.parse(JSON.parse(bytes.toString('utf8')));
    } catch (error) {
      finding(findings, 'invalid-bundle', error instanceof Error ? error.message : String(error), {
        bundlePath: locatedBundle.path,
      });
      continue;
    }
    parsedBundles.set(locatedBundle.path, bundle);
    const sourcePath = bundle.source.path;
    const collection = bundlesBySource.get(sourcePath) ?? [];
    collection.push(locatedBundle);
    bundlesBySource.set(sourcePath, collection);
    const entry = expectedByPath.get(sourcePath);
    if (!entry) {
      finding(findings, 'unexpected-bundle', 'bundle source is absent from inventory', {
        sourcePath,
        bundlePath: locatedBundle.path,
      });
    } else {
      if (entry.disposition === 'exclude') {
        finding(findings, 'excluded-source-bundle', 'excluded inventory source has a bundle', {
          sourcePath,
          bundlePath: locatedBundle.path,
        });
      }
      if (entry.disposition !== locatedBundle.expectedDisposition) {
        finding(findings, 'bundle-disposition-mismatch', 'bundle is in the wrong definitive root', {
          sourcePath,
          bundlePath: locatedBundle.path,
        });
      }
      if (bundle.source.sha256 !== entry.markdownSha256) {
        finding(
          findings,
          'bundle-inventory-checksum-mismatch',
          'bundle Markdown checksum differs from inventory',
          {
            sourcePath,
            bundlePath: locatedBundle.path,
          },
        );
      }
      if (
        bundle.source.auxiliarySources.length !== 1 ||
        bundle.source.auxiliarySources[0]?.path !== entry.jsonPath ||
        bundle.source.auxiliarySources[0]?.sha256 !== entry.jsonSha256
      ) {
        finding(
          findings,
          'bundle-auxiliary-mismatch',
          'bundle JSON provenance differs from inventory',
          {
            sourcePath,
            bundlePath: locatedBundle.path,
          },
        );
      }
    }

    try {
      const source = await readFile(corpusFile(options.sourceRoot, sourcePath));
      const auxiliary = new Map<string, Buffer>();
      for (const item of bundle.source.auxiliarySources) {
        auxiliary.set(item.path, await readFile(corpusFile(options.sourceRoot, item.path)));
      }
      const result = auditExtractionBundle(source, bundle, auxiliary);
      if (!result.ok) {
        finding(findings, 'failed-bundle-audit', result.errors.join('; '), {
          sourcePath,
          bundlePath: locatedBundle.path,
        });
      }
      if (entry?.disposition === 'chunk') {
        for (const error of chapterHasFullBody(bundle, source)) {
          finding(findings, 'scoped-chapter-bundle', error, {
            sourcePath,
            bundlePath: locatedBundle.path,
          });
        }
      }
    } catch (error) {
      finding(
        findings,
        'bundle-source-read-failed',
        error instanceof Error ? error.message : String(error),
        {
          sourcePath,
          bundlePath: locatedBundle.path,
        },
      );
    }

    for (const record of bundle.records) {
      if (record.recordKind === 'artifact') {
        artifactRecords += 1;
        const previous = globalArtifactIds.get(record.id);
        if (previous) {
          finding(
            findings,
            'duplicate-global-artifact-id',
            `artifact ID also occurs in ${previous}`,
            {
              sourcePath,
              bundlePath: locatedBundle.path,
            },
          );
        } else {
          globalArtifactIds.set(record.id, locatedBundle.path);
        }
      } else {
        exclusionRecords += 1;
      }
    }
    manifestBundles.push({
      sourcePath,
      disposition: locatedBundle.expectedDisposition,
      bundlePath: locatedBundle.path,
      bundleSha256: sha256(bytes),
      artifactCount: bundle.records.filter((record) => record.recordKind === 'artifact').length,
      exclusionCount: bundle.records.filter((record) => record.recordKind === 'exclusion').length,
    });
  }

  for (const entry of inventory.entries) {
    const bundles = bundlesBySource.get(entry.markdownPath) ?? [];
    if (entry.disposition === 'exclude') {
      if (bundles.length > 0) {
        finding(
          findings,
          'excluded-source-has-bundle',
          'excluded source must not have a definitive bundle',
          {
            sourcePath: entry.markdownPath,
          },
        );
      }
    } else if (bundles.length === 0) {
      finding(findings, 'missing-definitive-bundle', 'included source has no definitive bundle', {
        sourcePath: entry.markdownPath,
      });
    } else if (bundles.length > 1) {
      finding(
        findings,
        'duplicate-definitive-bundle',
        'included source has more than one definitive bundle',
        {
          sourcePath: entry.markdownPath,
        },
      );
    }
  }

  try {
    const pilot = ExtractionBundleSchema.parse(
      JSON.parse(await readFile(resolve(options.classesPilotBundlePath), 'utf8')),
    );
    if (pilot.source.path !== 'en/books/heroes/md/chapter/classes.md') {
      finding(findings, 'classes-pilot-invalid', 'Classes pilot must be sourced from classes.md', {
        bundlePath: resolve(options.classesPilotBundlePath),
      });
    }
    try {
      const source = await readFile(corpusFile(options.sourceRoot, pilot.source.path));
      const auxiliary = new Map<string, Buffer>();
      for (const item of pilot.source.auxiliarySources) {
        auxiliary.set(item.path, await readFile(corpusFile(options.sourceRoot, item.path)));
      }
      const pilotAudit = auditExtractionBundle(source, pilot, auxiliary);
      if (!pilotAudit.ok) {
        finding(findings, 'classes-pilot-invalid', pilotAudit.errors.join('; '), {
          sourcePath: pilot.source.path,
          bundlePath: resolve(options.classesPilotBundlePath),
        });
      }
    } catch (error) {
      finding(
        findings,
        'classes-pilot-invalid',
        error instanceof Error ? error.message : String(error),
        {
          sourcePath: pilot.source.path,
          bundlePath: resolve(options.classesPilotBundlePath),
        },
      );
    }
    const full = [...parsedBundles.entries()]
      .map(([, bundle]) => bundle)
      .find((bundle) => bundle.source.path === pilot.source.path);
    checkClassesPilot(pilot, full, findings);
  } catch (error) {
    finding(
      findings,
      'classes-pilot-unreadable',
      error instanceof Error ? error.message : String(error),
      {
        bundlePath: resolve(options.classesPilotBundlePath),
      },
    );
  }

  const structuredSources = inventory.entries.filter(
    (entry) => entry.disposition === 'structured',
  ).length;
  const chapterSources = inventory.entries.filter((entry) => entry.disposition === 'chunk').length;
  return {
    schemaVersion: 1,
    toolVersion: CAMPAIGN_AUDIT_TOOL_VERSION,
    source: {
      pin: options.lock.commit,
      ...(sourceStatus ? { checkout: sourceStatus.head, clean: sourceStatus.clean } : {}),
    },
    inventory: {
      checksum: inventoryChecksum,
      snapshotChecksum: inventory.snapshotSha256,
      sourceCommit: inventory.sourceCommit,
    },
    bundles: manifestBundles.sort((left, right) => left.sourcePath.localeCompare(right.sourcePath)),
    counts: {
      inventoryEntries: inventory.entries.length,
      includedSources: structuredSources + chapterSources,
      structuredSources,
      chapterSources,
      excludedSources: inventory.entries.filter((entry) => entry.disposition === 'exclude').length,
      definitiveBundles: manifestBundles.length,
      artifactRecords,
      exclusionRecords,
    },
    findings,
  };
}
