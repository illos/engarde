import { auditGrammarConservation, parseEffectText } from './effect-grammar.js';
import { CONSTRUCT_MECHANISM, constructsOf } from './grammar-report.js';

/**
 * Corpus-wide grammar sweep (engine-plan 6.1): run the effect grammar over
 * EVERY ingested artifact and measure — never judge — what it can express.
 * The output is the real mechanism backlog (ranked by measured unlocks) and
 * the residue-pattern ranking (the signal for which grammar constructs to
 * build next). Residue is expected and reported, never a failure; the only
 * failure condition is a conservation violation (the grammar dropped bytes).
 *
 * Everything here is deterministic (models point, code cuts — DEC-0010):
 * residue lines are grouped by a mechanical line-shape signature, and every
 * example shown is verbatim corpus text attributed to its artifact id.
 */

export interface SweepInputEntry {
  artifactId: string;
  /** DEC-0010 attribution bucket ('unmatched' when the map has no rule). */
  bucket: string;
  text: string;
}

export type ArtifactSweepStatus =
  | 'automatic-now' // fully parsed, every construct's mechanism shipped
  | 'mechanism-blocked' // fully parsed, waiting only on engine mechanisms
  | 'grammar-blocked' // residue remains, parsed constructs need nothing
  | 'grammar-and-mechanism-blocked'; // residue remains AND mechanisms missing

export interface GrammarSweepReport {
  schema: 'engarde-grammar-sweep-v1';
  headline: {
    artifacts: number;
    byStatus: Record<ArtifactSweepStatus, number>;
    totalBytes: number;
    parsedBytes: number;
    parsedRatio: number;
    conservationViolations: number;
  };
  /** Ranked: sole blockers first (artifacts that fully unlock), then reach. */
  mechanisms: Array<{
    mechanism: string;
    shipped: boolean;
    /** Fully-parsed artifacts blocked ONLY by this mechanism. */
    soleBlockerOf: number;
    /** All artifacts whose parsed constructs need it (residue or not). */
    neededBy: number;
    occurrences: number;
  }>;
  constructs: Array<{ construct: string; artifacts: number; occurrences: number }>;
  buckets: Array<{
    bucket: string;
    artifacts: number;
    parsedRatio: number;
    byStatus: Record<ArtifactSweepStatus, number>;
  }>;
  residuePatterns: {
    totalLines: number;
    totalPatterns: number;
    /** Reported patterns cover this fraction of all residue lines. */
    reportedLineCoverage: number;
    patterns: Array<{
      signature: string;
      lines: number;
      artifacts: number;
      example: { artifactId: string; line: string };
    }>;
  };
  conservation: Array<{ artifactId: string; problems: string[] }>;
}

const SCC_LINK = /\[([^\]]+)\]\(scc\.v1:[^)]+\)/g;

/**
 * Deterministic line-shape signature for a residue line. Labels are kept
 * verbatim from the source (digits normalized to N) so the ranking speaks
 * the books' own vocabulary; free prose and names collapse into shape
 * classes so the table ranks constructs, not individual sentences.
 */
export function residueLineSignature(raw: string): string {
  let line = raw.replace(SCC_LINK, '$1').trim();
  while (line.startsWith('>')) line = line.slice(1).trim();
  if (line.length === 0) return '(blank inside blockquote)';
  if (/^\|.*\|$/.test(line)) return '| table row |';
  const heading = /^(#{1,6})\s/.exec(line);
  if (heading) return `${heading[1]} (heading)`;
  const list = /^[-*+]\s+/.exec(line);
  const prefix = list ? '- ' : '';
  if (list) line = line.slice(list[0].length);
  // A short symbol prefix (the books' glyph markers, e.g. ⭐️ before malice
  // features) may precede a bold label; keep it in the signature.
  const bold = /^([^\w\s*]{1,4}\s+)?\*\*([^*]+)\*\*/.exec(line);
  if (bold) {
    const glyph = (bold[1] ?? '').trim();
    const glyphPrefix = glyph.length > 0 ? `${glyph} ` : '';
    const label = (bold[2] ?? '').replace(/\d+/g, 'N').trim();
    const parenthetical = /\(([^)]+)\)\s*$/.exec(label);
    if (parenthetical) return `${prefix}${glyphPrefix}**… (${parenthetical[1]})**`;
    if (label.endsWith(':')) return `${prefix}${glyphPrefix}**${label}**`;
    return `${prefix}${glyphPrefix}**(name)**`;
  }
  const labeled = /^([A-Z][A-Za-z' ]{0,30}):\s/.exec(line);
  if (labeled) return `${prefix}${labeled[1]}: (prose)`;
  return prefix ? '- (list item prose)' : '(prose)';
}

const STATUSES: ArtifactSweepStatus[] = [
  'automatic-now',
  'mechanism-blocked',
  'grammar-blocked',
  'grammar-and-mechanism-blocked',
];

function emptyStatusCounts(): Record<ArtifactSweepStatus, number> {
  return Object.fromEntries(STATUSES.map((status) => [status, 0])) as Record<
    ArtifactSweepStatus,
    number
  >;
}

function mechanismOf(construct: string): { mechanism: string; shipped: boolean } | null {
  const mechanism = CONSTRUCT_MECHANISM[construct];
  if (mechanism === undefined) return null;
  return { mechanism, shipped: mechanism.includes('SHIPPED') };
}

const REPORTED_PATTERN_CAP = 200;

export function buildGrammarSweep(entries: readonly SweepInputEntry[]): GrammarSweepReport {
  const byStatus = emptyStatusCounts();
  let totalBytes = 0;
  let parsedBytes = 0;
  const conservation: GrammarSweepReport['conservation'] = [];

  const mechanismStats = new Map<
    string,
    { shipped: boolean; soleBlockerOf: number; neededBy: Set<string>; occurrences: number }
  >();
  const constructStats = new Map<string, { artifacts: Set<string>; occurrences: number }>();
  const bucketStats = new Map<
    string,
    {
      artifacts: number;
      totalBytes: number;
      parsedBytes: number;
      byStatus: Record<ArtifactSweepStatus, number>;
    }
  >();
  const patternStats = new Map<
    string,
    { lines: number; artifacts: Set<string>; example: { artifactId: string; line: string } }
  >();
  let residueLineCount = 0;

  for (const entry of entries) {
    const parse = parseEffectText(entry.text);
    const problems = auditGrammarConservation(entry.text, parse);
    if (problems.length > 0) conservation.push({ artifactId: entry.artifactId, problems });

    const needed = new Set<string>();
    for (const clause of parse.clauses) {
      for (const construct of constructsOf(clause)) {
        const stats = constructStats.get(construct) ?? { artifacts: new Set(), occurrences: 0 };
        stats.artifacts.add(entry.artifactId);
        stats.occurrences += 1;
        constructStats.set(construct, stats);

        const mapping = mechanismOf(construct);
        if (!mapping) continue;
        const mechanism = mechanismStats.get(mapping.mechanism) ?? {
          shipped: mapping.shipped,
          soleBlockerOf: 0,
          neededBy: new Set<string>(),
          occurrences: 0,
        };
        mechanism.occurrences += 1;
        if (!mapping.shipped) {
          mechanism.neededBy.add(entry.artifactId);
          needed.add(mapping.mechanism);
        }
        mechanismStats.set(mapping.mechanism, mechanism);
      }
    }

    const hasResidue = parse.residue.length > 0;
    const status: ArtifactSweepStatus = hasResidue
      ? needed.size > 0
        ? 'grammar-and-mechanism-blocked'
        : 'grammar-blocked'
      : needed.size > 0
        ? 'mechanism-blocked'
        : 'automatic-now';
    byStatus[status] += 1;
    if (!hasResidue && needed.size === 1) {
      const [only] = needed;
      if (only !== undefined) {
        const mechanism = mechanismStats.get(only);
        if (mechanism) mechanism.soleBlockerOf += 1;
      }
    }

    totalBytes += parse.stats.totalBytes;
    parsedBytes += parse.stats.parsedBytes;
    const bucket = bucketStats.get(entry.bucket) ?? {
      artifacts: 0,
      totalBytes: 0,
      parsedBytes: 0,
      byStatus: emptyStatusCounts(),
    };
    bucket.artifacts += 1;
    bucket.totalBytes += parse.stats.totalBytes;
    bucket.parsedBytes += parse.stats.parsedBytes;
    bucket.byStatus[status] += 1;
    bucketStats.set(entry.bucket, bucket);

    for (const item of parse.residue) {
      for (const rawLine of item.span.text.split('\n')) {
        if (rawLine.trim().length === 0) continue;
        residueLineCount += 1;
        const signature = residueLineSignature(rawLine);
        const pattern = patternStats.get(signature) ?? {
          lines: 0,
          artifacts: new Set<string>(),
          example: { artifactId: entry.artifactId, line: rawLine.trim() },
        };
        pattern.lines += 1;
        pattern.artifacts.add(entry.artifactId);
        patternStats.set(signature, pattern);
      }
    }
  }

  const rankedPatterns = [...patternStats.entries()]
    .map(([signature, stats]) => ({
      signature,
      lines: stats.lines,
      artifacts: stats.artifacts.size,
      example: stats.example,
    }))
    .sort((a, b) => b.artifacts - a.artifacts || b.lines - a.lines);
  const reported = rankedPatterns.slice(0, REPORTED_PATTERN_CAP);
  const reportedLines = reported.reduce((sum, pattern) => sum + pattern.lines, 0);

  return {
    schema: 'engarde-grammar-sweep-v1',
    headline: {
      artifacts: entries.length,
      byStatus,
      totalBytes,
      parsedBytes,
      parsedRatio: totalBytes === 0 ? 1 : parsedBytes / totalBytes,
      conservationViolations: conservation.length,
    },
    mechanisms: [...mechanismStats.entries()]
      .map(([mechanism, stats]) => ({
        mechanism,
        shipped: stats.shipped,
        soleBlockerOf: stats.soleBlockerOf,
        neededBy: stats.neededBy.size,
        occurrences: stats.occurrences,
      }))
      .sort(
        (a, b) =>
          Number(a.shipped) - Number(b.shipped) ||
          b.soleBlockerOf - a.soleBlockerOf ||
          b.neededBy - a.neededBy,
      ),
    constructs: [...constructStats.entries()]
      .map(([construct, stats]) => ({
        construct,
        artifacts: stats.artifacts.size,
        occurrences: stats.occurrences,
      }))
      .sort((a, b) => b.artifacts - a.artifacts || a.construct.localeCompare(b.construct)),
    buckets: [...bucketStats.entries()]
      .map(([bucket, stats]) => ({
        bucket,
        artifacts: stats.artifacts,
        parsedRatio: stats.totalBytes === 0 ? 1 : stats.parsedBytes / stats.totalBytes,
        byStatus: stats.byStatus,
      }))
      .sort((a, b) => b.artifacts - a.artifacts || a.bucket.localeCompare(b.bucket)),
    residuePatterns: {
      totalLines: residueLineCount,
      totalPatterns: rankedPatterns.length,
      reportedLineCoverage: residueLineCount === 0 ? 1 : reportedLines / residueLineCount,
      patterns: reported,
    },
    conservation,
  };
}

export function renderGrammarSweepHtml(report: GrammarSweepReport): string {
  const escapeHtml = (value: string): string =>
    value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  const pct = (ratio: number): string => `${(ratio * 100).toFixed(1)}%`;

  const statusLabel: Record<ArtifactSweepStatus, string> = {
    'automatic-now': 'Automatic now',
    'mechanism-blocked': 'Waiting on engine mechanisms only',
    'grammar-blocked': 'Waiting on grammar only',
    'grammar-and-mechanism-blocked': 'Waiting on grammar + mechanisms',
  };

  const tiles = STATUSES.map(
    (status) =>
      `<div class="tile"><div class="n">${report.headline.byStatus[status]}</div><div class="l">${statusLabel[status]}</div></div>`,
  ).join('\n');

  const mechanismRows = report.mechanisms
    .map(
      (entry) =>
        `<tr><td>${escapeHtml(entry.mechanism)}</td><td>${entry.shipped ? 'yes' : 'no'}</td><td>${entry.soleBlockerOf}</td><td>${entry.neededBy}</td><td>${entry.occurrences}</td></tr>`,
    )
    .join('\n');

  const patternRows = report.residuePatterns.patterns
    .slice(0, 60)
    .map(
      (entry) =>
        `<tr><td><code>${escapeHtml(entry.signature)}</code></td><td>${entry.artifacts}</td><td>${entry.lines}</td><td><code class="ex">${escapeHtml(entry.example.line)}</code><div class="src">${escapeHtml(entry.example.artifactId)}</div></td></tr>`,
    )
    .join('\n');

  const bucketRows = report.buckets
    .map(
      (entry) =>
        `<tr><td>${escapeHtml(entry.bucket)}</td><td>${entry.artifacts}</td><td>${pct(entry.parsedRatio)}</td><td>${entry.byStatus['automatic-now']}</td><td>${entry.byStatus['mechanism-blocked']}</td><td>${entry.byStatus['grammar-blocked']}</td><td>${entry.byStatus['grammar-and-mechanism-blocked']}</td></tr>`,
    )
    .join('\n');

  const constructRows = report.constructs
    .map(
      (entry) =>
        `<tr><td>${escapeHtml(entry.construct)}</td><td>${entry.artifacts}</td><td>${entry.occurrences}</td></tr>`,
    )
    .join('\n');

  const conservationNote =
    report.headline.conservationViolations === 0
      ? '<p class="ok">Byte conservation held for every artifact: every byte of every rule text is owned by exactly one parsed clause or one explicit residue span. Nothing was silently dropped.</p>'
      : `<p class="bad">${report.headline.conservationViolations} artifact(s) FAILED byte conservation — the grammar dropped bytes. This is a bug; see the JSON report's <code>conservation</code> list.</p>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Corpus-wide grammar sweep — what the engine can express today</title><style>
body{font-family:-apple-system,system-ui,sans-serif;margin:1rem;line-height:1.5;color:#1a1a18;background:#faf9f6;max-width:70rem}
h1{font-size:1.4rem} h2{font-size:1.05rem;margin-top:1.8rem}
code{font-family:ui-monospace,Menlo,monospace;font-size:0.82em;word-break:break-word}
table{border-collapse:collapse;margin:0.6rem 0;font-size:0.85rem;width:100%}
th,td{border:1px solid #ddd9d0;padding:5px 10px;text-align:left;vertical-align:top}
th{background:#eeece6}
.tiles{display:flex;gap:0.8rem;flex-wrap:wrap;margin:1rem 0}
.tile{background:#fff;border:1px solid #ddd9d0;border-radius:8px;padding:0.7rem 1.1rem;min-width:9rem}
.tile .n{font-size:1.6rem;font-weight:700}
.tile .l{font-size:0.8rem;color:#555}
.ok{color:#2c6e31} .bad{color:#a2262b;font-weight:600}
.ex{display:block;background:#fff;border:1px solid #eee9df;border-radius:4px;padding:2px 6px;margin-bottom:2px;white-space:pre-wrap}
.src{font-size:0.72rem;color:#777;font-family:ui-monospace,Menlo,monospace}
p.note{font-size:0.88rem;color:#444}
</style></head><body>
<h1>Corpus-wide grammar sweep</h1>
<p class="note">The effect grammar (the deterministic parser that turns rulebook
text into engine data) ran over all ${report.headline.artifacts} ingested artifacts.
${pct(report.headline.parsedRatio)} of all rule-text bytes parse today. Every number
below is measured by code — no model judged anything. Residue (text the grammar
doesn't recognize yet) is expected and fully accounted; it is the to-do list, not an error.</p>
${conservationNote}
<div class="tiles">${tiles}</div>
<h2>Which engine mechanism to build next (ranked by measured unlocks)</h2>
<p class="note">"Sole blocker" counts fully-parsed artifacts that become automatic the
moment that one mechanism ships — the sharpest build-next signal.</p>
<table><tr><th>Mechanism</th><th>Shipped</th><th>Sole blocker of</th><th>Needed by</th><th>Occurrences</th></tr>
${mechanismRows}</table>
<h2>Which grammar construct to build next (residue line shapes, ranked)</h2>
<p class="note">Residue lines grouped by mechanical line-shape signature (labels verbatim
from the books, numbers normalized to N). Each row shows one verbatim example and the
artifact it came from. Top 60 of ${report.residuePatterns.totalPatterns} patterns shown
(covering ${pct(report.residuePatterns.reportedLineCoverage)} of the
${report.residuePatterns.totalLines} residue lines in the top ${report.residuePatterns.patterns.length} JSON-reported patterns).</p>
<table><tr><th>Line shape</th><th>Artifacts</th><th>Lines</th><th>Verbatim example (source artifact below)</th></tr>
${patternRows}</table>
<h2>By category (MCDM's own chapters — DEC-0010 attribution)</h2>
<table><tr><th>Category</th><th>Artifacts</th><th>Bytes parsed</th><th>Automatic</th><th>Mechanisms only</th><th>Grammar only</th><th>Grammar + mechanisms</th></tr>
${bucketRows}</table>
<h2>Constructs the grammar already recognizes</h2>
<table><tr><th>Construct</th><th>Artifacts</th><th>Occurrences</th></tr>
${constructRows}</table>
</body></html>
`;
}
