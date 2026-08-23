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

/**
 * Batch-review surface v1: self-contained HTML with the VERBATIM artifact
 * text embedded beside every proposed classification, so the reviewer
 * verifies in place — no book lookups. (Pilot feedback 2026-08-22: a
 * classification table without its source material cannot be reviewed.)
 * Rendering only; the canonical bytes live in the bundles.
 */
export function renderClassificationReviewHtml(
  batches: readonly ClassificationBatch[],
  coverage: ClassificationCoverageReport,
  artifactText: ReadonlyMap<string, string>,
): string {
  const escapeHtml = (value: string): string =>
    value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  // Presentation-only link reduction: [text](scc.v1:id) renders as the text
  // with the target in a tooltip. The canonical bytes are untouched.
  const renderText = (value: string): string =>
    escapeHtml(value).replace(
      /\[([^\]]+)\]\((scc\.v1:[^)]+)\)/g,
      '<span class="scc" title="$2">$1</span>',
    );
  const anchorOf = (id: string): string => id.replace(/[^a-zA-Z0-9]+/g, '-');

  const all = batches
    .flatMap((batch) => batch.proposals.map((proposal) => ({ batch, proposal })))
    .sort((a, b) => a.proposal.artifactId.localeCompare(b.proposal.artifactId));

  const card = ({ batch, proposal }: (typeof all)[number], open: boolean): string => {
    const text = artifactText.get(proposal.artifactId);
    const chips = [
      `tier ${proposal.tier}`,
      proposal.implementability,
      proposal.playCategory,
      ...(proposal.spatialProfile.length > 0 ? [proposal.spatialProfile.join(' · ')] : []),
    ]
      .map((chip) => `<span class="chip">${escapeHtml(chip)}</span>`)
      .join(' ');
    const warn = proposal.uncertain ? ' warn' : '';
    const note = proposal.uncertaintyNote
      ? `<p class="note">⚠ ${escapeHtml(proposal.uncertaintyNote)}</p>`
      : '';
    return `<details id="${anchorOf(proposal.artifactId)}" class="card${warn}"${open ? ' open' : ''}>
<summary><code>${escapeHtml(proposal.artifactId)}</code>${proposal.uncertain ? ' ⚠' : ''} ${chips}</summary>
<p class="rationale">${escapeHtml(proposal.rationale)} <span class="lane">(${escapeHtml(batch.laneId)})</span></p>
${note}
${text === undefined ? '<p class="note">⚠ artifact text unavailable</p>' : `<pre class="text">${renderText(text.trim())}</pre>`}
</details>`;
  };

  const uncertainCards = all.filter((entry) => entry.proposal.uncertain);
  const byType = new Map<string, typeof all>();
  for (const entry of all) {
    const list = byType.get(entry.proposal.contentType) ?? [];
    list.push(entry);
    byType.set(entry.proposal.contentType, list);
  }

  const countLine = (counts: Record<string, number>): string =>
    Object.entries(counts)
      .map(([key, count]) => `${escapeHtml(key)}: ${count}`)
      .join(' · ');

  const sections: string[] = [];
  if (uncertainCards.length > 0) {
    sections.push(`<h2>Uncertainty queue (${uncertainCards.length})</h2>`);
    sections.push(...uncertainCards.map((entry) => card(entry, true)));
  }
  for (const [contentType, entries] of [...byType.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    sections.push(`<h2>${escapeHtml(contentType)} (${entries.length})</h2>`);
    sections.push(...entries.map((entry) => card(entry, false)));
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Classification review — conditions pilot</title><style>
body{font-family:-apple-system,system-ui,sans-serif;margin:1rem;line-height:1.45;color:#1a1a18;background:#faf9f6;max-width:60rem}
h1{font-size:1.35rem} h2{font-size:1.1rem;margin-top:1.6rem;border-bottom:1px solid #ddd9d0;padding-bottom:0.2rem}
code{font-family:ui-monospace,Menlo,monospace;font-size:0.8em;word-break:break-all}
.chip{display:inline-block;background:#e8e4da;border-radius:9px;padding:0.05em 0.55em;font-size:0.72rem;margin-left:0.25em;white-space:nowrap}
.card{border:1px solid #ddd9d0;border-radius:8px;margin:0.45rem 0;padding:0.35rem 0.7rem;background:#fff}
.card.warn{background:#fdf6dd;border-color:#e4cf7c}
.card summary{cursor:pointer;padding:0.25rem 0}
.rationale{font-size:0.88rem;margin:0.5rem 0 0.2rem}
.lane{color:#8a857a;font-size:0.78rem}
.note{font-size:0.85rem;background:#fdf3d8;padding:0.35rem 0.6rem;border-radius:6px}
.text{white-space:pre-wrap;font-family:ui-monospace,Menlo,monospace;font-size:0.78rem;background:#f4f2ec;border-left:3px solid #c9c3b4;padding:0.6rem 0.8rem;border-radius:0 6px 6px 0;overflow-x:auto}
.scc{text-decoration:underline dotted #a89f8c}
.meta{font-size:0.85rem}
</style></head><body>
<h1>Classification review — conditions pilot</h1>
<p class="meta">Coverage: <b>${coverage.classified}/${coverage.expected}</b> classified · ${coverage.uncertain.length} uncertain · ${coverage.findings.length} findings · ok=${coverage.ok}</p>
<p class="meta">Tier — ${countLine(coverage.counts.byTier)}<br>
Implementability — ${countLine(coverage.counts.byImplementability)}<br>
Play category — ${countLine(coverage.counts.byPlayCategory)}<br>
Content type — ${countLine(coverage.counts.byContentType)}</p>
<p class="meta">Each card shows the model's proposed classification above the <b>verbatim source text</b> it classified — verify in place, tap to expand. Dotted-underlined words are corpus cross-links (target in the tooltip); the canonical bytes live in the artifact bundles.</p>
${sections.join('\n')}
</body></html>
`;
}

/**
 * Dual-reader comparison (engine-plan principle 6 applied to classification):
 * two independent runs over the identical packets; agreement is evidence,
 * disagreement routes to human adjudication. Spatial profiles compare as
 * sets. The comparison never merges runs — it only measures and routes.
 */
export interface ClassificationComparison {
  labels: { a: string; b: string };
  compared: number;
  fullAgreement: number;
  fields: Record<string, { agree: number; disagree: number; rate: number }>;
  onlyInA: string[];
  onlyInB: string[];
  uncertainty: { aOnly: string[]; bOnly: string[]; both: string[] };
  disagreements: Array<{
    artifactId: string;
    fields: string[];
    a: ClassificationProposal;
    b: ClassificationProposal;
  }>;
}

export function compareClassificationRuns(
  aBatches: readonly ClassificationBatch[],
  bBatches: readonly ClassificationBatch[],
  labels: { a: string; b: string },
): ClassificationComparison {
  const index = (batches: readonly ClassificationBatch[]): Map<string, ClassificationProposal> => {
    const map = new Map<string, ClassificationProposal>();
    for (const batch of batches) {
      for (const proposal of batch.proposals) map.set(proposal.artifactId, proposal);
    }
    return map;
  };
  const a = index(aBatches);
  const b = index(bBatches);

  const sameSpatial = (left: readonly string[], right: readonly string[]): boolean => {
    const l = new Set(left);
    const r = new Set(right);
    return l.size === r.size && [...l].every((facet) => r.has(facet));
  };
  const comparators: Array<
    [string, (x: ClassificationProposal, y: ClassificationProposal) => boolean]
  > = [
    ['tier', (x, y) => x.tier === y.tier],
    ['implementability', (x, y) => x.implementability === y.implementability],
    ['playCategory', (x, y) => x.playCategory === y.playCategory],
    ['spatialProfile', (x, y) => sameSpatial(x.spatialProfile, y.spatialProfile)],
  ];

  const shared = [...a.keys()].filter((id) => b.has(id)).sort();
  const fields: ClassificationComparison['fields'] = {};
  for (const [name] of comparators) fields[name] = { agree: 0, disagree: 0, rate: 0 };
  const disagreements: ClassificationComparison['disagreements'] = [];
  let fullAgreement = 0;

  for (const id of shared) {
    const left = a.get(id);
    const right = b.get(id);
    if (!left || !right) continue;
    const differing = comparators.filter(([, equal]) => !equal(left, right)).map(([name]) => name);
    for (const [name] of comparators) {
      const bucket = fields[name];
      if (!bucket) continue;
      if (differing.includes(name)) bucket.disagree += 1;
      else bucket.agree += 1;
    }
    if (differing.length === 0) fullAgreement += 1;
    else disagreements.push({ artifactId: id, fields: differing, a: left, b: right });
  }
  for (const bucket of Object.values(fields)) {
    const total = bucket.agree + bucket.disagree;
    bucket.rate = total === 0 ? 1 : bucket.agree / total;
  }

  const uncertainIn = (map: Map<string, ClassificationProposal>): Set<string> =>
    new Set([...map.values()].filter((proposal) => proposal.uncertain).map((p) => p.artifactId));
  const aUncertain = uncertainIn(a);
  const bUncertain = uncertainIn(b);

  return {
    labels,
    compared: shared.length,
    fullAgreement,
    fields,
    onlyInA: [...a.keys()].filter((id) => !b.has(id)).sort(),
    onlyInB: [...b.keys()].filter((id) => !a.has(id)).sort(),
    uncertainty: {
      aOnly: [...aUncertain].filter((id) => !bUncertain.has(id)).sort(),
      bOnly: [...bUncertain].filter((id) => !aUncertain.has(id)).sort(),
      both: [...aUncertain].filter((id) => bUncertain.has(id)).sort(),
    },
    disagreements,
  };
}

/** Verify-in-place adjudication surface for dual-reader disagreements. */
export function renderComparisonHtml(
  comparison: ClassificationComparison,
  artifactText: ReadonlyMap<string, string>,
): string {
  const escapeHtml = (value: string): string =>
    value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  const renderText = (value: string): string =>
    escapeHtml(value).replace(
      /\[([^\]]+)\]\((scc\.v1:[^)]+)\)/g,
      '<span class="scc" title="$2">$1</span>',
    );
  const pct = (rate: number): string => `${(rate * 100).toFixed(1)}%`;
  const spatial = (profile: readonly string[]): string =>
    profile.length > 0 ? profile.join(' · ') : '—';

  const fieldRows = Object.entries(comparison.fields)
    .map(
      ([name, bucket]) =>
        `<tr><td>${escapeHtml(name)}</td><td>${bucket.agree}</td><td>${bucket.disagree}</td><td>${pct(bucket.rate)}</td></tr>`,
    )
    .join('\n');

  const cards = comparison.disagreements
    .map(({ artifactId, fields: differing, a, b }) => {
      const text = artifactText.get(artifactId);
      const row = (name: string, left: string, right: string): string => {
        const differs = differing.includes(name);
        return `<tr${differs ? ' class="diff"' : ''}><td>${escapeHtml(name)}</td><td>${escapeHtml(left)}</td><td>${escapeHtml(right)}</td></tr>`;
      };
      return `<details class="card" open>
<summary><code>${escapeHtml(artifactId)}</code> <span class="chip">${escapeHtml(differing.join(', '))}</span></summary>
<table class="cmp"><tr><th></th><th>${escapeHtml(comparison.labels.a)}</th><th>${escapeHtml(comparison.labels.b)}</th></tr>
${row('tier', a.tier, b.tier)}
${row('implementability', a.implementability, b.implementability)}
${row('playCategory', a.playCategory, b.playCategory)}
${row('spatialProfile', spatial(a.spatialProfile), spatial(b.spatialProfile))}
${row('uncertain', String(a.uncertain), String(b.uncertain))}
</table>
<p class="rationale"><b>${escapeHtml(comparison.labels.a)}:</b> ${escapeHtml(a.rationale)}${a.uncertaintyNote ? ` <i>⚠ ${escapeHtml(a.uncertaintyNote)}</i>` : ''}</p>
<p class="rationale"><b>${escapeHtml(comparison.labels.b)}:</b> ${escapeHtml(b.rationale)}${b.uncertaintyNote ? ` <i>⚠ ${escapeHtml(b.uncertaintyNote)}</i>` : ''}</p>
${text === undefined ? '<p class="note">⚠ artifact text unavailable</p>' : `<pre class="text">${renderText(text.trim())}</pre>`}
</details>`;
    })
    .join('\n');

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Dual-reader comparison — conditions pilot</title><style>
body{font-family:-apple-system,system-ui,sans-serif;margin:1rem;line-height:1.45;color:#1a1a18;background:#faf9f6;max-width:60rem}
h1{font-size:1.35rem} h2{font-size:1.1rem;margin-top:1.6rem;border-bottom:1px solid #ddd9d0;padding-bottom:0.2rem}
code{font-family:ui-monospace,Menlo,monospace;font-size:0.8em;word-break:break-all}
.chip{display:inline-block;background:#e8e4da;border-radius:9px;padding:0.05em 0.55em;font-size:0.72rem;margin-left:0.25em}
.card{border:1px solid #ddd9d0;border-radius:8px;margin:0.6rem 0;padding:0.35rem 0.7rem;background:#fff}
.card summary{cursor:pointer;padding:0.25rem 0}
table{border-collapse:collapse;margin:0.5rem 0;font-size:0.85rem}
th,td{border:1px solid #ddd9d0;padding:4px 10px;text-align:left}
th{background:#eeece6}
tr.diff td{background:#fdf3d8;font-weight:600}
.rationale{font-size:0.85rem;margin:0.3rem 0}
.note{font-size:0.85rem;background:#fdf3d8;padding:0.35rem 0.6rem;border-radius:6px}
.text{white-space:pre-wrap;font-family:ui-monospace,Menlo,monospace;font-size:0.78rem;background:#f4f2ec;border-left:3px solid #c9c3b4;padding:0.6rem 0.8rem;border-radius:0 6px 6px 0;overflow-x:auto}
.scc{text-decoration:underline dotted #a89f8c}
.meta{font-size:0.9rem}
</style></head><body>
<h1>Dual-reader comparison — conditions pilot</h1>
<p class="meta"><b>${escapeHtml(comparison.labels.a)}</b> vs <b>${escapeHtml(comparison.labels.b)}</b> over ${comparison.compared} shared artifacts · full agreement on ${comparison.fullAgreement} (${pct(comparison.compared === 0 ? 1 : comparison.fullAgreement / comparison.compared)}) · ${comparison.disagreements.length} to adjudicate</p>
<table><tr><th>Field</th><th>Agree</th><th>Disagree</th><th>Rate</th></tr>
${fieldRows}</table>
<p class="meta">Uncertainty: both flagged ${comparison.uncertainty.both.length} · only ${escapeHtml(comparison.labels.a)} ${comparison.uncertainty.aOnly.length} · only ${escapeHtml(comparison.labels.b)} ${comparison.uncertainty.bOnly.length}${comparison.onlyInA.length + comparison.onlyInB.length > 0 ? ` · coverage gaps: ${comparison.onlyInA.length}/${comparison.onlyInB.length}` : ''}</p>
<h2>Disagreements (${comparison.disagreements.length})</h2>
<p class="meta">Differing fields are highlighted; the verbatim source text is below each card — adjudicate in place.</p>
${cards}
</body></html>
`;
}
