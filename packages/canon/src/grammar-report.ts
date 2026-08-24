import type { EffectClause, GrammarParse } from './effect-grammar.js';

/**
 * The expressibility/residue report (engine-plan 6.1 in miniature): what the
 * grammar can express, what it cannot yet, and what mechanisms the parsed
 * constructs demand — ranked by how many artifacts each unlocks. This is the
 * pilot-scale prototype of the corpus-wide mechanism backlog.
 */

export interface GrammarReportEntry {
  artifactId: string;
  parse: GrammarParse;
}

export interface GrammarReport {
  artifacts: Array<{
    artifactId: string;
    totalBytes: number;
    parsedBytes: number;
    residueBytes: number;
    parsedRatio: number;
    clauseKinds: Record<string, number>;
    residueSpans: number;
  }>;
  constructs: Array<{ construct: string; artifacts: string[]; count: number }>;
  backlog: Array<{ mechanism: string; artifacts: string[]; occurrences: number }>;
}

export function constructsOf(clause: EffectClause): string[] {
  switch (clause.kind) {
    case 'tier-outcome': {
      const parts: string[] = ['tier-outcome'];
      if (clause.data.damage) parts.push('tier-damage');
      if (clause.data.potency) parts.push('potency-gate');
      if (clause.data.conditionIds.length > 0) parts.push('condition-application');
      if (clause.data.ending === 'save-ends') parts.push('save-ends-duration');
      return parts;
    }
    case 'ability-header':
      return ['ability-header'];
    case 'power-roll':
      return ['power-roll'];
    default:
      return [];
  }
}

/** Mechanisms a parsed construct needs at runtime; absent = already served. */
export const CONSTRUCT_MECHANISM: Record<string, string> = {
  'tier-damage': 'damage / Stamina application (SHIPPED: power-roll cluster)',
  'potency-gate': 'potency resolution (SHIPPED: power-roll cluster)',
  'power-roll': 'power roll resolution (SHIPPED: power-roll cluster)',
  'condition-application': 'condition lifecycle (SHIPPED: pilot step 4)',
  'save-ends-duration': 'saving throws (SHIPPED: pilot step 4)',
};

export function buildGrammarReport(entries: readonly GrammarReportEntry[]): GrammarReport {
  const constructMap = new Map<string, Set<string>>();
  const constructCounts = new Map<string, number>();
  const artifacts: GrammarReport['artifacts'] = [];

  for (const { artifactId, parse } of entries) {
    const clauseKinds: Record<string, number> = {};
    for (const clause of parse.clauses) {
      clauseKinds[clause.kind] = (clauseKinds[clause.kind] ?? 0) + 1;
      for (const construct of constructsOf(clause)) {
        constructCounts.set(construct, (constructCounts.get(construct) ?? 0) + 1);
        const set = constructMap.get(construct) ?? new Set<string>();
        set.add(artifactId);
        constructMap.set(construct, set);
      }
    }
    artifacts.push({
      artifactId,
      totalBytes: parse.stats.totalBytes,
      parsedBytes: parse.stats.parsedBytes,
      residueBytes: parse.stats.residueBytes,
      parsedRatio:
        parse.stats.totalBytes === 0 ? 1 : parse.stats.parsedBytes / parse.stats.totalBytes,
      clauseKinds,
      residueSpans: parse.residue.length,
    });
  }

  const constructs = [...constructMap.entries()]
    .map(([construct, ids]) => ({
      construct,
      artifacts: [...ids].sort(),
      count: constructCounts.get(construct) ?? 0,
    }))
    .sort(
      (a, b) => b.artifacts.length - a.artifacts.length || a.construct.localeCompare(b.construct),
    );

  const backlog = constructs
    .filter(({ construct }) => {
      const mechanism = CONSTRUCT_MECHANISM[construct];
      return mechanism !== undefined && !mechanism.includes('SHIPPED');
    })
    .map(({ construct, artifacts: ids, count }) => ({
      mechanism: CONSTRUCT_MECHANISM[construct] ?? construct,
      artifacts: ids,
      occurrences: count,
    }));

  return { artifacts, constructs, backlog };
}

export function renderGrammarReportHtml(
  entries: readonly GrammarReportEntry[],
  report: GrammarReport,
): string {
  const escapeHtml = (value: string): string =>
    value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  const pct = (ratio: number): string => `${(ratio * 100).toFixed(1)}%`;

  const artifactRows = report.artifacts
    .map(
      (entry) =>
        `<tr><td><code>${escapeHtml(entry.artifactId)}</code></td><td>${pct(entry.parsedRatio)}</td><td>${entry.residueSpans}</td></tr>`,
    )
    .join('\n');
  const constructRows = report.constructs
    .map(
      (entry) =>
        `<tr><td>${escapeHtml(entry.construct)}</td><td>${entry.count}</td><td>${entry.artifacts.length}</td></tr>`,
    )
    .join('\n');
  const backlogRows = report.backlog
    .map(
      (entry) =>
        `<tr><td>${escapeHtml(entry.mechanism)}</td><td>${entry.occurrences}</td><td>${entry.artifacts.length}</td></tr>`,
    )
    .join('\n');

  const bodies = entries
    .map(({ artifactId, parse }) => {
      const pieces = [
        ...parse.clauses.map((clause) => ({
          span: clause.span,
          cls: 'parsed',
          label: clause.kind,
        })),
        ...parse.residue.map((item) => ({ span: item.span, cls: 'residue', label: 'residue' })),
      ].sort((a, b) => a.span.byteStart - b.span.byteStart);
      const rendered = pieces
        .map(
          (piece) =>
            `<span class="${piece.cls}" title="${escapeHtml(piece.label)}">${escapeHtml(piece.span.text)}</span>`,
        )
        .join('');
      return `<h2><code>${escapeHtml(artifactId)}</code></h2>\n<pre class="text">${rendered}</pre>`;
    })
    .join('\n');

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Effect grammar — residue &amp; expressibility (conditions pilot)</title><style>
body{font-family:-apple-system,system-ui,sans-serif;margin:1rem;line-height:1.45;color:#1a1a18;background:#faf9f6;max-width:60rem}
h1{font-size:1.35rem} h2{font-size:1rem;margin-top:1.4rem}
code{font-family:ui-monospace,Menlo,monospace;font-size:0.8em;word-break:break-all}
table{border-collapse:collapse;margin:0.6rem 0;font-size:0.85rem}
th,td{border:1px solid #ddd9d0;padding:4px 10px;text-align:left}
th{background:#eeece6}
.text{white-space:pre-wrap;font-family:ui-monospace,Menlo,monospace;font-size:0.78rem;background:#fff;border:1px solid #ddd9d0;padding:0.6rem 0.8rem;border-radius:6px}
.parsed{background:#e4efdd}
.residue{background:#fdf3d8}
.legend span{padding:0.1em 0.5em;border-radius:4px;margin-right:0.6em;font-size:0.8rem}
</style></head><body>
<h1>Effect grammar — residue &amp; expressibility</h1>
<p class="legend"><span class="parsed">parsed</span><span class="residue">residue (explicitly unparsed — routed, not dropped)</span></p>
<h2>Per-artifact consumption</h2>
<table><tr><th>Artifact</th><th>Parsed</th><th>Residue spans</th></tr>
${artifactRows}</table>
<h2>Constructs found</h2>
<table><tr><th>Construct</th><th>Occurrences</th><th>Artifacts</th></tr>
${constructRows}</table>
<h2>Mechanism backlog (ranked by artifacts unlocked)</h2>
<table><tr><th>Mechanism</th><th>Occurrences</th><th>Artifacts</th></tr>
${backlogRows}</table>
${bodies}
</body></html>
`;
}
