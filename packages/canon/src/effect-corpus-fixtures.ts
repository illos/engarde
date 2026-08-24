import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { EffectProgramData } from '@engarde/engine';
import { compileEffectPrograms } from './effect-conformance.js';
import { type EffectClause, parseEffectText } from './effect-grammar.js';
import {
  type ArtifactRecord,
  type CampaignAuditManifest,
  CampaignAuditManifestSchema,
  ExtractionBundleSchema,
} from './schemas.js';

type ManifestBundle = CampaignAuditManifest['bundles'][number];

interface RawEffectLine {
  byteStart: number;
  byteEnd: number;
  sourceText: string;
}

export interface CoreEffectFixture {
  fixtureId: string;
  artifactId: string;
  artifactVersion: ArtifactRecord['version'];
  artifact: ArtifactRecord;
  bundle: ManifestBundle;
  clauseIndex: number;
  clauseOrdinal: number;
  clause: Extract<EffectClause, { kind: 'effect' }>;
  program: EffectProgramData;
}

function isCoreSource(sourcePath: string): boolean {
  return sourcePath.startsWith('en/books/heroes/') || sourcePath.startsWith('en/books/monsters/');
}

function compareArtifacts(left: ArtifactRecord, right: ArtifactRecord): number {
  return (
    left.source.span.byteStart - right.source.span.byteStart ||
    left.source.span.byteEnd - right.source.span.byteEnd ||
    left.id.localeCompare(right.id) ||
    left.version.localeCompare(right.version)
  );
}

/** Independent physical-line inventory used to catch parser omissions,
 * duplicate consumption, ordinal drift, and incorrect UTF-8 byte spans. */
function rawEffectLines(text: string): RawEffectLine[] {
  const encoder = new TextEncoder();
  const effects: RawEffectLine[] = [];
  let byteStart = 0;
  let charStart = 0;
  while (charStart <= text.length) {
    const newlineAt = text.indexOf('\n', charStart);
    const charEnd = newlineAt === -1 ? text.length : newlineAt + 1;
    const line = text.slice(charStart, charEnd);
    if (line.length === 0) break;
    const byteEnd = byteStart + encoder.encode(line).length;
    const withoutNewline = line.endsWith('\n') ? line.slice(0, -1) : line;
    const exactLine = withoutNewline.endsWith('\r') ? withoutNewline.slice(0, -1) : withoutNewline;
    const prefix = exactLine.startsWith('> **Effect:** ') ? '> **Effect:** ' : '**Effect:** ';
    if (exactLine.startsWith(prefix) && exactLine.length > prefix.length) {
      effects.push({ byteStart, byteEnd, sourceText: exactLine.slice(prefix.length) });
    }
    if (newlineAt === -1) break;
    byteStart = byteEnd;
    charStart = charEnd;
  }
  return effects;
}

/** Load every whole-line `**Effect:**` instruction from the accepted pinned
 * Heroes/Monsters campaign. Manifest paths, not filesystem discovery, define
 * the corpus boundary. */
export async function loadCoreEffectFixtures(manifestPath: string): Promise<CoreEffectFixture[]> {
  const manifest = CampaignAuditManifestSchema.parse(
    JSON.parse(await readFile(resolve(manifestPath), 'utf8')),
  );
  const fixtures: CoreEffectFixture[] = [];
  const bundles = manifest.bundles
    .filter((entry) => isCoreSource(entry.sourcePath))
    .slice()
    .sort(
      (left, right) =>
        left.sourcePath.localeCompare(right.sourcePath) ||
        left.bundlePath.localeCompare(right.bundlePath),
    );

  for (const entry of bundles) {
    const bundle = ExtractionBundleSchema.parse(
      JSON.parse(await readFile(resolve(entry.bundlePath), 'utf8')),
    );
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
      const clauses = parse.clauses.filter(
        (clause): clause is Extract<EffectClause, { kind: 'effect' }> => clause.kind === 'effect',
      );
      const programs = compileEffectPrograms(parse, artifact.id);
      const rawEffects = rawEffectLines(artifact.text);
      if (clauses.length !== programs.length || clauses.length !== rawEffects.length) {
        throw new Error(
          `${artifact.id}: ${rawEffects.length} raw Effect lines, ${clauses.length} clauses, ${programs.length} programs`,
        );
      }
      clauses.forEach((clause, clauseIndex) => {
        const program = programs[clauseIndex];
        const rawEffect = rawEffects[clauseIndex];
        if (!program) throw new Error(`${artifact.id}: missing Effect program ${clauseIndex + 1}`);
        if (
          !rawEffect ||
          rawEffect.byteStart !== clause.span.byteStart ||
          rawEffect.byteEnd !== clause.span.byteEnd ||
          rawEffect.sourceText !== clause.data.sourceText
        ) {
          throw new Error(
            `${artifact.id}: raw Effect line ${clauseIndex + 1} does not match parse`,
          );
        }
        fixtures.push({
          fixtureId: `${artifact.id}::${artifact.source.path}:${artifact.source.span.byteStart}-${artifact.source.span.byteEnd}::effect-${clauseIndex + 1}`,
          artifactId: artifact.id,
          artifactVersion: artifact.version,
          artifact,
          bundle: entry,
          clauseIndex,
          clauseOrdinal: clauseIndex + 1,
          clause,
          program,
        });
      });
    }
  }

  return fixtures.sort(
    (left, right) =>
      left.artifact.source.path.localeCompare(right.artifact.source.path) ||
      left.artifact.source.span.byteStart - right.artifact.source.span.byteStart ||
      left.artifactId.localeCompare(right.artifactId) ||
      left.clauseIndex - right.clauseIndex,
  );
}
