import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { AbilityEffectData } from '@engarde/engine';
import {
  type PowerRollClusterGroup,
  compileAbilities,
  groupPowerRollClusters,
} from './effect-conformance.js';
import { type EffectClause, type GrammarParse, parseEffectText } from './effect-grammar.js';
import {
  type ArtifactRecord,
  type CampaignAuditManifest,
  CampaignAuditManifestSchema,
  ExtractionBundleSchema,
} from './schemas.js';

/** The books included by the pinned core campaign manifest. */
export const CORE_POWER_ROLL_BOOKS = ['heroes', 'monsters'] as const;

type CorePowerRollBook = (typeof CORE_POWER_ROLL_BOOKS)[number];
type ManifestBundle = CampaignAuditManifest['bundles'][number];

/**
 * A compiled power-roll cluster with its complete artifact provenance.
 *
 * `clusterIndex` is zero-based within the artifact. `clusterOrdinal` is the
 * one-based presentation form used in `fixtureId`; both are exposed so a
 * multi-ability stat block remains distinguishable without relying on a
 * non-unique artifact id.
 */
export interface CorePowerRollFixture {
  fixtureId: string;
  artifactId: string;
  artifactVersion: ArtifactRecord['version'];
  text: ArtifactRecord['text'];
  source: ArtifactRecord['source'];
  artifact: ArtifactRecord;
  bundle: ManifestBundle;
  clusterIndex: number;
  clusterOrdinal: number;
  ability: AbilityEffectData;
}

export interface CorePowerRollFixtureOptions {
  /** Path to `final-campaign-manifest.json` from the accepted campaign set. */
  manifestPath: string;
  /**
   * Optional resolver for callers that relocate the accepted bundles in a
   * test fixture. By default each manifest entry's pinned `bundlePath` is
   * read verbatim.
   */
  bundlePath?: (entry: ManifestBundle) => string;
}

function isCoreSource(sourcePath: string): sourcePath is `en/books/${CorePowerRollBook}/${string}` {
  return CORE_POWER_ROLL_BOOKS.some((book) => sourcePath.startsWith(`en/books/${book}/`));
}

function compileCluster(
  parse: GrammarParse,
  cluster: PowerRollClusterGroup,
  artifactId: string,
): AbilityEffectData | undefined {
  const tier1 = cluster.tiers.tier1;
  const tier2 = cluster.tiers.tier2;
  const tier3 = cluster.tiers.tier3;
  if (!tier1 || !tier2 || !tier3 || cluster.duplicateTiers.size > 0) return undefined;

  // Feed the canonical compiler one cluster at a time. This preserves its
  // validator and mapping while allowing a later malformed cluster to remain
  // distinguishable from an earlier complete cluster in the same artifact.
  const clusterParse: GrammarParse = {
    clauses: [...(cluster.header ? [cluster.header] : []), cluster.powerRoll, tier1, tier2, tier3],
    residue: [],
    stats: parse.stats,
  };
  const compiled = compileAbilities(clusterParse, artifactId);
  return compiled.abilities[0];
}

function fixtureId(artifact: ArtifactRecord, clusterIndex: number): string {
  const { path, span } = artifact.source;
  return `${artifact.id}::${path}:${span.byteStart}-${span.byteEnd}::cluster-${clusterIndex + 1}`;
}

function compareArtifacts(left: ArtifactRecord, right: ArtifactRecord): number {
  return (
    left.source.span.byteStart - right.source.span.byteStart ||
    left.source.span.byteEnd - right.source.span.byteEnd ||
    left.id.localeCompare(right.id) ||
    left.version.localeCompare(right.version)
  );
}

function compareBundles(left: ManifestBundle, right: ManifestBundle): number {
  return (
    left.sourcePath.localeCompare(right.sourcePath) ||
    left.bundlePath.localeCompare(right.bundlePath)
  );
}

async function readBundle(path: string) {
  const bytes = await readFile(resolve(path));
  return ExtractionBundleSchema.parse(JSON.parse(bytes.toString('utf8')));
}

/**
 * Load every complete, engine-compilable power-roll cluster from the accepted
 * definitive campaign bundles for the pinned Heroes/Monsters core books.
 *
 * The accepted manifest is the authority for definitive bundles. Supplement
 * paths are filtered even if a caller supplies a broader manifest, so this
 * helper cannot silently add Beastheart or Summoner content to the corpus.
 * Results are sorted by source path, source span, artifact id, and cluster
 * index; no filesystem traversal order affects the returned records.
 */
export async function loadCorePowerRollFixtures(
  optionsOrManifestPath: CorePowerRollFixtureOptions | string,
): Promise<CorePowerRollFixture[]> {
  const options: CorePowerRollFixtureOptions =
    typeof optionsOrManifestPath === 'string'
      ? { manifestPath: optionsOrManifestPath }
      : optionsOrManifestPath;
  const manifestBytes = await readFile(resolve(options.manifestPath));
  const manifest = CampaignAuditManifestSchema.parse(JSON.parse(manifestBytes.toString('utf8')));

  const entries = manifest.bundles
    .filter((entry) => isCoreSource(entry.sourcePath))
    .slice()
    .sort(compareBundles);
  const fixtures: CorePowerRollFixture[] = [];

  for (const entry of entries) {
    const path = options.bundlePath?.(entry) ?? entry.bundlePath;
    const bundle = await readBundle(path);
    if (bundle.source.path !== entry.sourcePath) {
      throw new Error(
        `bundle source mismatch for ${entry.sourcePath}: found ${bundle.source.path}`,
      );
    }
    const artifacts = bundle.records
      .filter((record): record is ArtifactRecord => record.recordKind === 'artifact')
      .sort(compareArtifacts);

    for (const artifact of artifacts) {
      const parse = parseEffectText(artifact.text);
      const clusters = groupPowerRollClusters(parse);
      clusters.forEach((cluster, clusterIndex) => {
        const ability = compileCluster(parse, cluster, artifact.id);
        if (!ability) return;
        fixtures.push({
          fixtureId: fixtureId(artifact, clusterIndex),
          artifactId: artifact.id,
          artifactVersion: artifact.version,
          text: artifact.text,
          source: artifact.source,
          artifact,
          bundle: entry,
          clusterIndex,
          clusterOrdinal: clusterIndex + 1,
          ability,
        });
      });
    }
  }

  return fixtures.sort(
    (left, right) =>
      left.source.path.localeCompare(right.source.path) ||
      left.source.span.byteStart - right.source.span.byteStart ||
      left.source.span.byteEnd - right.source.span.byteEnd ||
      left.artifactId.localeCompare(right.artifactId) ||
      left.clusterIndex - right.clusterIndex ||
      left.fixtureId.localeCompare(right.fixtureId),
  );
}
