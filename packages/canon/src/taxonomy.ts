import { z } from 'zod';
import { Sha256Schema } from './schemas.js';

/**
 * Classification taxonomy (engine-plan 2.1, pilot thin form). Classification
 * is DISCOVERY METADATA layered over artifacts — models propose it, a human
 * approves it in batches, and misclassification is always recoverable because
 * artifact text is never model-produced. Nothing here is a canon claim.
 *
 * A proposal pins the artifact VERSION (span hash), so a re-cut artifact
 * automatically invalidates its classification (coverage validation fails
 * until the new version is re-classified).
 */

/** Spatial dependency facets, per engine-plan 2.1. Empty profile = none. */
export const SPATIAL_FACETS = [
  'target-only',
  'distance',
  'area',
  'movement',
  'line-of-effect',
] as const;

export const PLAY_CATEGORIES = [
  'combat',
  'exploration',
  'social',
  'downtime',
  'character-build',
  'meta',
  'mixed',
] as const;

/** Which tier of the three-tier model the content reaches the player at. */
export const TIER_VALUES = ['1', '2', '3', 'not-a-rule', 'unclear'] as const;

export const IMPLEMENTABILITY_VALUES = [
  'engine-mechanism',
  'data-only',
  'display-only',
  'unclear',
] as const;

export const ClassificationProposalSchema = z.object({
  artifactId: z.string().min(1),
  artifactVersion: Sha256Schema,
  contentType: z.string().min(1),
  playCategory: z.enum(PLAY_CATEGORIES),
  tier: z.enum(TIER_VALUES),
  implementability: z.enum(IMPLEMENTABILITY_VALUES),
  spatialProfile: z.array(z.enum(SPATIAL_FACETS)),
  rationale: z.string().min(1).max(300),
  uncertain: z.boolean().default(false),
  uncertaintyNote: z.string().min(1).optional(),
});

export type ClassificationProposal = z.infer<typeof ClassificationProposalSchema>;

export const ClassificationBatchSchema = z.object({
  schemaVersion: z.literal(1),
  schema: z.literal('engarde-classification-proposal-v1'),
  laneId: z.string().min(1),
  manifestSha256: Sha256Schema,
  proposals: z.array(ClassificationProposalSchema).min(1),
});

export type ClassificationBatch = z.infer<typeof ClassificationBatchSchema>;

export const ClassificationPacketSchema = z.object({
  schemaVersion: z.literal(1),
  schema: z.literal('engarde-classification-packet-v1'),
  laneId: z.string().min(1),
  manifestSha256: Sha256Schema,
  outputContract: z.object({
    format: z.literal('json'),
    schema: z.literal('engarde-classification-proposal-v1'),
    instructions: z.array(z.string().min(1)),
  }),
  artifacts: z.array(
    z.object({
      artifactId: z.string().min(1),
      artifactVersion: Sha256Schema,
      contentType: z.string().min(1),
      references: z.array(z.string()),
      text: z.string(),
    }),
  ),
});

export type ClassificationPacket = z.infer<typeof ClassificationPacketSchema>;

/**
 * Content type is mechanical — the corpus category namespace of the artifact
 * id — so it is computed here, echoed in packets, and never asked of a model.
 */
export function contentTypeOf(artifactId: string): string {
  if (artifactId.includes('#')) return 'chapter';
  const segments = artifactId.split('/');
  const category = segments.length > 1 ? (segments[1] ?? '') : '';
  const head = category.split('.')[0] ?? '';
  if (head.length === 0) throw new Error(`cannot derive content type from id: ${artifactId}`);
  return head;
}

export interface ClassifiableArtifact {
  artifactId: string;
  artifactVersion: string;
  references: string[];
  text: string;
}

const PACKET_INSTRUCTIONS = [
  'Return ONLY a JSON document conforming to engarde-classification-proposal-v1; no prose around it.',
  'Classify every artifact in this packet exactly once; echo artifactId, artifactVersion, and contentType unchanged.',
  'tier uses the three-tier model: 1 = automatic (engine computes, applies, logs), 2 = player-initiated but engine-resolved, 3 = player-asserted with the engine offering options; not-a-rule = prose with no mechanical behavior; unclear when genuinely undecidable.',
  'implementability: engine-mechanism needs interpreter behavior; data-only feeds existing display/data paths without new mechanisms; display-only renders verbatim; unclear when undecidable.',
  'spatialProfile lists every spatial facet the text depends on (target-only, distance, area, movement, line-of-effect); empty array means none.',
  'rationale is a short justification (max 300 chars). Never restate, summarize, or quote rule text into it beyond naming the mechanic.',
  'When uncertain, set uncertain=true with an uncertaintyNote instead of guessing. Uncertainty is routed to review; a wrong guess is worse than a flag.',
] as const;

export function buildClassificationPackets(
  artifacts: readonly ClassifiableArtifact[],
  manifestSha256: string,
  laneCount: number,
): ClassificationPacket[] {
  if (!Number.isInteger(laneCount) || laneCount < 1) {
    throw new Error('laneCount must be a positive integer');
  }
  const sorted = [...artifacts].sort((a, b) => a.artifactId.localeCompare(b.artifactId));
  const lanes: ClassificationPacket[] = [];
  const laneSize = Math.ceil(sorted.length / laneCount);
  for (let index = 0; index < laneCount; index += 1) {
    const slice = sorted.slice(index * laneSize, (index + 1) * laneSize);
    if (slice.length === 0) continue;
    lanes.push({
      schemaVersion: 1,
      schema: 'engarde-classification-packet-v1',
      laneId: `lane-${index + 1}`,
      manifestSha256,
      outputContract: {
        format: 'json',
        schema: 'engarde-classification-proposal-v1',
        instructions: [...PACKET_INSTRUCTIONS],
      },
      artifacts: slice.map((artifact) => ({
        artifactId: artifact.artifactId,
        artifactVersion: artifact.artifactVersion,
        contentType: contentTypeOf(artifact.artifactId),
        references: artifact.references,
        text: artifact.text,
      })),
    });
  }
  return lanes;
}

export interface ClassificationCoverageReport {
  ok: boolean;
  classified: number;
  expected: number;
  uncertain: string[];
  findings: Array<{ code: string; artifactId: string; detail: string }>;
  counts: {
    byTier: Record<string, number>;
    byImplementability: Record<string, number>;
    byPlayCategory: Record<string, number>;
    byContentType: Record<string, number>;
  };
}

/**
 * Total coverage validation: every expected artifact classified exactly once,
 * at the expected version, with the mechanical content type unchanged.
 * Anything else is a finding — coverage is proven, never assumed.
 */
export function validateClassificationCoverage(
  expected: ReadonlyMap<string, string>,
  batches: readonly ClassificationBatch[],
  manifestSha256: string,
): ClassificationCoverageReport {
  const findings: ClassificationCoverageReport['findings'] = [];
  const seen = new Map<string, ClassificationProposal>();
  const uncertain: string[] = [];

  for (const batch of batches) {
    if (batch.manifestSha256 !== manifestSha256) {
      findings.push({
        code: 'stale-manifest',
        artifactId: batch.laneId,
        detail: `batch pinned to ${batch.manifestSha256}`,
      });
    }
    for (const proposal of batch.proposals) {
      if (seen.has(proposal.artifactId)) {
        findings.push({
          code: 'duplicate-classification',
          artifactId: proposal.artifactId,
          detail: 'also classified in an earlier lane',
        });
        continue;
      }
      seen.set(proposal.artifactId, proposal);
      const expectedVersion = expected.get(proposal.artifactId);
      if (expectedVersion === undefined) {
        findings.push({
          code: 'unexpected-artifact',
          artifactId: proposal.artifactId,
          detail: 'not in the pilot scope',
        });
        continue;
      }
      if (expectedVersion !== proposal.artifactVersion) {
        findings.push({
          code: 'version-mismatch',
          artifactId: proposal.artifactId,
          detail: `expected ${expectedVersion}`,
        });
      }
      if (contentTypeOf(proposal.artifactId) !== proposal.contentType) {
        findings.push({
          code: 'content-type-drift',
          artifactId: proposal.artifactId,
          detail: `expected ${contentTypeOf(proposal.artifactId)}`,
        });
      }
      if (proposal.uncertain) uncertain.push(proposal.artifactId);
      if (proposal.uncertain && proposal.uncertaintyNote === undefined) {
        findings.push({
          code: 'uncertain-without-note',
          artifactId: proposal.artifactId,
          detail: 'uncertain=true requires uncertaintyNote',
        });
      }
      if (!proposal.uncertain && proposal.uncertaintyNote !== undefined) {
        findings.push({
          code: 'note-without-uncertain',
          artifactId: proposal.artifactId,
          detail: 'uncertaintyNote requires uncertain=true',
        });
      }
    }
  }

  for (const artifactId of [...expected.keys()].sort()) {
    if (!seen.has(artifactId)) {
      findings.push({ code: 'unclassified-artifact', artifactId, detail: 'no proposal received' });
    }
  }

  const tally = (select: (proposal: ClassificationProposal) => string): Record<string, number> => {
    const counts: Record<string, number> = {};
    for (const proposal of seen.values()) {
      if (!expected.has(proposal.artifactId)) continue;
      const key = select(proposal);
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
  };

  findings.sort((a, b) => a.code.localeCompare(b.code) || a.artifactId.localeCompare(b.artifactId));
  return {
    ok: findings.length === 0,
    classified: [...seen.keys()].filter((id) => expected.has(id)).length,
    expected: expected.size,
    uncertain: uncertain.sort(),
    findings,
    counts: {
      byTier: tally((proposal) => proposal.tier),
      byImplementability: tally((proposal) => proposal.implementability),
      byPlayCategory: tally((proposal) => proposal.playCategory),
      byContentType: tally((proposal) => proposal.contentType),
    },
  };
}

/**
 * Batch-review surface v0 (engine-plan 2.3, pilot thin form): a generated
 * markdown table the human can skim per batch — approve, spot-check, or work
 * the uncertainty queue. Rendering only; approval is a human act recorded
 * elsewhere.
 */
export function renderClassificationReview(
  batches: readonly ClassificationBatch[],
  coverage: ClassificationCoverageReport,
): string {
  const lines: string[] = [];
  lines.push('# Classification review — conditions pilot');
  lines.push('');
  lines.push(
    `Coverage: ${coverage.classified}/${coverage.expected} classified · ` +
      `${coverage.uncertain.length} uncertain · ${coverage.findings.length} findings · ` +
      `ok=${coverage.ok}`,
  );
  lines.push('');
  for (const [title, counts] of [
    ['By tier', coverage.counts.byTier],
    ['By implementability', coverage.counts.byImplementability],
    ['By play category', coverage.counts.byPlayCategory],
    ['By content type', coverage.counts.byContentType],
  ] as const) {
    const summary = Object.entries(counts)
      .map(([key, count]) => `${key}: ${count}`)
      .join(' · ');
    lines.push(`- **${title}** — ${summary}`);
  }
  lines.push('');
  if (coverage.findings.length > 0) {
    lines.push('## Findings (blocking)');
    lines.push('');
    for (const finding of coverage.findings) {
      lines.push(`- \`${finding.code}\` ${finding.artifactId} — ${finding.detail}`);
    }
    lines.push('');
  }
  if (coverage.uncertain.length > 0) {
    lines.push('## Uncertainty queue');
    lines.push('');
    for (const batch of batches) {
      for (const proposal of batch.proposals) {
        if (!proposal.uncertain) continue;
        lines.push(
          `- ${proposal.artifactId} (${batch.laneId}) — ${proposal.uncertaintyNote ?? 'no note'}`,
        );
      }
    }
    lines.push('');
  }
  lines.push('## Proposals');
  lines.push('');
  lines.push('| Artifact | Type | Category | Tier | Implementability | Spatial | Rationale |');
  lines.push('|---|---|---|---|---|---|---|');
  const all = batches
    .flatMap((batch) => batch.proposals)
    .sort((a, b) => a.artifactId.localeCompare(b.artifactId));
  for (const proposal of all) {
    const spatial = proposal.spatialProfile.length > 0 ? proposal.spatialProfile.join(', ') : '—';
    const flag = proposal.uncertain ? ' ⚠' : '';
    lines.push(
      `| \`${proposal.artifactId}\`${flag} | ${proposal.contentType} | ${proposal.playCategory} ` +
        `| ${proposal.tier} | ${proposal.implementability} | ${spatial} ` +
        `| ${proposal.rationale.replaceAll('|', '\\|')} |`,
    );
  }
  lines.push('');
  return lines.join('\n');
}
