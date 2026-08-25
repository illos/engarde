/**
 * Whole-artifact prose triage.
 *
 * This lane finds accepted corpus artifacts that are still grammar residue but
 * contain no already-parsed mechanical clauses, no structural rule tables or
 * lists, and no vocabulary hit from the conservative mechanical-signal table.
 * A candidate is NOT automatically "not a rule". It is a bounded review item
 * whose final disposition remains drift-keyed to the canonical artifact bytes.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { sha256 } from './bytes.js';
import { parseEffectText } from './effect-grammar.js';
import { detectMechanicalSignals } from './narrative-triage.js';
import {
  type ArtifactRecord,
  CampaignAuditManifestSchema,
  ExtractionBundleSchema,
  Sha256Schema,
} from './schemas.js';

const HEADING = /^#{1,6}\s+\S/;
const STRUCTURAL_RULE_LINE = /^(?:>|\||```|~~~|[-+*]\s+|\d+[.)]\s+|\*\*[^*]+:\*\*)/;

export interface ArtifactProseCandidate {
  artifactId: string;
  artifactVersion: string;
  sourcePath: string;
  book: 'heroes' | 'monsters';
  sourceSpan: ArtifactRecord['source']['span'];
  sourceText: string;
  sourceSha256: string;
  residueText: string;
  residueSha256: string;
  signals: string[];
}

export interface ArtifactProseTriageReport {
  schema: 'engarde-artifact-prose-triage-v1';
  canonPin: string;
  acceptedArtifacts: number;
  candidates: ArtifactProseCandidate[];
}

/** Produces a focused review/accounting surface without letting callers add
 * artifacts outside the deterministic inventory. */
export function selectArtifactProseCandidates(
  report: ArtifactProseTriageReport,
  artifactIds: readonly string[],
): ArtifactProseTriageReport {
  if (artifactIds.length === 0) return report;
  const selected = new Set(artifactIds);
  if (selected.size !== artifactIds.length) {
    throw new Error('artifact selection contains duplicate ids');
  }
  const candidates = report.candidates.filter((candidate) => selected.has(candidate.artifactId));
  if (candidates.length !== selected.size) {
    const found = new Set(candidates.map((candidate) => candidate.artifactId));
    const missing = [...selected].filter((artifactId) => !found.has(artifactId));
    throw new Error(`requested artifacts are not candidates: ${missing.join(', ')}`);
  }
  return { ...report, candidates };
}

/** True only for ordinary paragraph prose (with optional Markdown headings).
 * Lists, tables, blockquotes, labeled fields, and fenced content stay out of
 * this first pass even when their vocabulary happens to be signal-free. */
export function isPlainProseResidue(text: string): boolean {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return false;
  return lines.every((line) => {
    const trimmed = line.trim();
    return HEADING.test(trimmed) || !STRUCTURAL_RULE_LINE.test(trimmed);
  });
}

function candidateFromArtifact(
  artifact: ArtifactRecord,
  maxSignals: number,
): ArtifactProseCandidate | null {
  const parse = parseEffectText(artifact.text);
  if (parse.residue.length === 0) return null;
  if (parse.clauses.some((clause) => clause.kind !== 'flavor' && clause.kind !== 'whitespace')) {
    return null;
  }
  const residueText = parse.residue.map((item) => item.span.text).join('');
  if (!isPlainProseResidue(residueText)) return null;
  // Headings are part of the evidence. A neutral-looking paragraph under a
  // heading such as "Damage Modifier" is still a mechanical candidate.
  const signals = detectMechanicalSignals(residueText);
  if (signals.length > maxSignals) return null;
  const sourceSha256 = sha256(artifact.text);
  if (sourceSha256 !== artifact.version) {
    throw new Error(`${artifact.id}: artifact version does not hash its canonical text`);
  }
  return {
    artifactId: artifact.id,
    artifactVersion: artifact.version,
    sourcePath: artifact.source.path,
    book: artifact.source.path.startsWith('en/books/heroes/') ? 'heroes' : 'monsters',
    sourceSpan: artifact.source.span,
    sourceText: artifact.text,
    sourceSha256,
    residueText,
    residueSha256: sha256(residueText),
    signals,
  };
}

/** Manifest paths, never filesystem discovery, define the accepted boundary. */
export async function loadArtifactProseTriage(
  manifestPath: string,
  maxSignals = 0,
): Promise<ArtifactProseTriageReport> {
  if (!Number.isInteger(maxSignals) || maxSignals < 0) {
    throw new Error('maxSignals must be a nonnegative integer');
  }
  const manifest = CampaignAuditManifestSchema.parse(
    JSON.parse(await readFile(resolve(manifestPath), 'utf8')),
  );
  const candidates: ArtifactProseCandidate[] = [];
  let acceptedArtifacts = 0;
  const bundles = manifest.bundles
    .filter(
      (entry) =>
        entry.sourcePath.startsWith('en/books/heroes/') ||
        entry.sourcePath.startsWith('en/books/monsters/'),
    )
    .slice()
    .sort((left, right) => left.sourcePath.localeCompare(right.sourcePath));

  for (const entry of bundles) {
    const bundle = ExtractionBundleSchema.parse(
      JSON.parse(await readFile(resolve(entry.bundlePath), 'utf8')),
    );
    if (bundle.source.path !== entry.sourcePath) {
      throw new Error(
        `bundle source mismatch for ${entry.sourcePath}: found ${bundle.source.path}`,
      );
    }
    const artifacts = bundle.records.filter(
      (record): record is ArtifactRecord => record.recordKind === 'artifact',
    );
    acceptedArtifacts += artifacts.length;
    for (const artifact of artifacts) {
      const candidate = candidateFromArtifact(artifact, maxSignals);
      if (candidate) candidates.push(candidate);
    }
  }

  candidates.sort(
    (left, right) =>
      left.sourcePath.localeCompare(right.sourcePath) ||
      left.sourceSpan.byteStart - right.sourceSpan.byteStart ||
      left.artifactId.localeCompare(right.artifactId),
  );
  return {
    schema: 'engarde-artifact-prose-triage-v1',
    canonPin: manifest.source.pin,
    acceptedArtifacts,
    candidates,
  };
}

export const ArtifactProseRulingSchema = z.object({
  artifactId: z.string().min(1),
  artifactVersion: Sha256Schema,
  status: z.enum(['not-a-rule', 'engine-or-app', 'unclear']),
  comment: z.string().optional(),
});

export const ArtifactProseRulingsSchema = z.object({
  schema: z.literal('engarde-artifact-prose-rulings-v1'),
  canonPin: z.string().min(1),
  exportedAt: z.string().min(1),
  rulings: z.array(ArtifactProseRulingSchema).min(1),
});

export type ArtifactProseRulings = z.infer<typeof ArtifactProseRulingsSchema>;

export interface ArtifactProseRulingValidation {
  ok: boolean;
  expected: number;
  ruled: number;
  counts: Record<ArtifactProseRulings['rulings'][number]['status'], number>;
  findings: Array<{ code: string; artifactId: string; detail: string }>;
}

/** Proves total, unique, version-current coverage before any ruling can affect
 * accounting. A model suggestion or partial browser export cannot silently
 * become an accepted exclusion list. */
export function validateArtifactProseRulings(
  report: ArtifactProseTriageReport,
  input: unknown,
): ArtifactProseRulingValidation {
  const document = ArtifactProseRulingsSchema.parse(input);
  const findings: ArtifactProseRulingValidation['findings'] = [];
  const expected = new Map(
    report.candidates.map((candidate) => [candidate.artifactId, candidate.artifactVersion]),
  );
  const seen = new Set<string>();
  const counts = { 'not-a-rule': 0, 'engine-or-app': 0, unclear: 0 };

  if (document.canonPin !== report.canonPin) {
    findings.push({
      code: 'canon-pin-mismatch',
      artifactId: '<document>',
      detail: `expected ${report.canonPin}, found ${document.canonPin}`,
    });
  }
  for (const ruling of document.rulings) {
    counts[ruling.status] += 1;
    if (seen.has(ruling.artifactId)) {
      findings.push({
        code: 'duplicate-ruling',
        artifactId: ruling.artifactId,
        detail: 'artifact was ruled more than once',
      });
      continue;
    }
    seen.add(ruling.artifactId);
    const version = expected.get(ruling.artifactId);
    if (version === undefined) {
      findings.push({
        code: 'unexpected-artifact',
        artifactId: ruling.artifactId,
        detail: 'artifact is not in the deterministic candidate inventory',
      });
    } else if (version !== ruling.artifactVersion) {
      findings.push({
        code: 'artifact-version-mismatch',
        artifactId: ruling.artifactId,
        detail: `expected ${version}, found ${ruling.artifactVersion}`,
      });
    }
  }
  for (const artifactId of expected.keys()) {
    if (!seen.has(artifactId)) {
      findings.push({
        code: 'missing-ruling',
        artifactId,
        detail: 'candidate has no ruling',
      });
    }
  }
  return {
    ok: findings.length === 0,
    expected: expected.size,
    ruled: seen.size,
    counts,
    findings,
  };
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** Self-contained, keyboard-driven review page. The browser only stores and
 * exports review metadata; canonical text is embedded verbatim and untouched. */
export function renderArtifactProseTriageHtml(report: ArtifactProseTriageReport): string {
  const cards = report.candidates
    .map(
      (
        candidate,
        index,
      ) => `<section class="card" data-index="${index}" data-id="${escapeHtml(candidate.artifactId)}" data-version="${candidate.artifactVersion}">
  <pre>${escapeHtml(candidate.sourceText)}</pre>
  <p>${escapeHtml(candidate.artifactId)} · ${candidate.book} · ${escapeHtml(candidate.sourcePath)}</p>
  <div><button data-status="not-a-rule">N · not a rule</button><button data-status="engine-or-app">E · engine/app</button><button data-status="unclear">U · unclear</button><input placeholder="optional comment"></div>
</section>`,
    )
    .join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Artifact prose triage</title><style>
body{font-family:system-ui;margin:0;background:#16130f;color:#e8e0d0}header{position:sticky;top:0;background:#201c15;padding:12px 20px;z-index:2;border-bottom:1px solid #3a3428}.card{max-width:900px;margin:14px auto;padding:16px 20px;background:#201c15;border:1px solid #3a3428;border-radius:10px}.card[data-status="not-a-rule"]{border-left:6px solid #4a7a4a}.card[data-status="engine-or-app"]{border-left:6px solid #a04a3a}.card[data-status="unclear"]{border-left:6px solid #a7873f}pre{white-space:pre-wrap;font-family:Georgia,serif;font-size:15px}p{font:12px ui-monospace;color:#9a917d}button,input{font:inherit;margin:4px;padding:8px;background:#2a2519;color:#e8e0d0;border:1px solid #55503f;border-radius:6px}input{min-width:280px}</style></head><body>
<header><b>Whole-artifact prose triage · ${report.candidates.length} candidates · pin ${escapeHtml(report.canonPin.slice(0, 10))}…</b> <span id="progress"></span> <button id="download">Download rulings</button></header><main>${cards}</main><script>
'use strict';const PIN=${JSON.stringify(report.canonPin)},KEY='engarde-artifact-prose-'+PIN,cards=[...document.querySelectorAll('.card')];let state={};try{state=JSON.parse(localStorage.getItem(KEY)||'{}')}catch{}let focus=0;
function save(){localStorage.setItem(KEY,JSON.stringify(state));document.getElementById('progress').textContent=Object.values(state).filter(x=>x.status).length+' / '+cards.length+' ruled'}
function set(card,status){const id=card.dataset.id;state[id]={...(state[id]||{}),status};card.dataset.status=status;save()}
cards.forEach((card,i)=>{const id=card.dataset.id,current=state[id]||{};if(current.status)card.dataset.status=current.status;card.querySelector('input').value=current.comment||'';card.querySelectorAll('button[data-status]').forEach(b=>b.onclick=()=>set(card,b.dataset.status));card.querySelector('input').oninput=e=>{state[id]={...(state[id]||{}),comment:e.target.value};save()};card.onclick=()=>{focus=i}});save();
document.onkeydown=e=>{if(e.target.tagName==='INPUT')return;if(e.key==='j')focus=Math.min(cards.length-1,focus+1);if(e.key==='k')focus=Math.max(0,focus-1);const status=e.key==='n'?'not-a-rule':e.key==='e'?'engine-or-app':e.key==='u'?'unclear':null;if(status){set(cards[focus],status);focus=Math.min(cards.length-1,focus+1)}cards[focus]?.scrollIntoView({block:'center'})};
document.getElementById('download').onclick=()=>{const rulings=cards.map(card=>({artifactId:card.dataset.id,artifactVersion:card.dataset.version,status:state[card.dataset.id]?.status||'unclear',...(state[card.dataset.id]?.comment?{comment:state[card.dataset.id].comment}:{})}));const blob=new Blob([JSON.stringify({schema:'engarde-artifact-prose-rulings-v1',canonPin:PIN,exportedAt:new Date().toISOString(),rulings},null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='artifact-prose-rulings.json';a.click();URL.revokeObjectURL(a.href)};
</script></body></html>`;
}
