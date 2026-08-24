/**
 * Narrative triage — deterministic candidate detection + review surface for
 * "can this Effect line ever reasonably be implemented deterministically?"
 *
 * The bar (user ruling, 2026-08-24): lines whose text carries mechanical
 * vocabulary — condition application, damage, Stamina/resources, rolls,
 * forced movement, modifiers, targeting/summoning, action economy, effect
 * removal — have a chance of engine implementation. Lines with ZERO such
 * signals are flagged as candidates for a manual "never implementable /
 * narrative" ruling by the user. The signal table below is SEARCH VOCABULARY
 * drawn from observed corpus text, not rule content; detection never changes
 * a byte of source and never feeds execution.
 *
 * Rulings come back as a JSON blob exported from the generated HTML page and
 * validate against NarrativeTriageRulingsSchema. Every ruling is keyed by
 * artifact id + ordinal + payload SHA-256 so a corpus drift invalidates it
 * loudly instead of silently.
 */
import { z } from 'zod';
import { sha256 } from './bytes.js';
import type { CoreEffectFixture } from './effect-corpus-fixtures.js';
import { stripCanonLinks } from './effect-shape-inventory.js';

/** Mechanical vocabulary — any hit means "engine implementation is at least
 * conceivable", so the line is NOT a narrative-triage candidate. */
export const MECHANICAL_SIGNALS: Record<string, RegExp> = {
  condition:
    /\b(bleeding|dazed|frightened|grabbed|prone|restrained|slowed|taunted|weakened|invisible|mark(s|ed)?|hidden|hide)\b/i,
  damage: /\bdamage\b/i,
  stamina: /\bStamina\b/i,
  recovery: /\bRecover(y|ies)\b/,
  'winded-dying': /\b(winded|dying)\b/i,
  'roll-test': /\b(power rolls?|tests?|saving throws?|tiers?|natural \d+)\b/i,
  'edge-bane': /\b(edges?|banes?)\b/i,
  surge: /\bsurges?\b/,
  dice: /\b\d+d\d+\b/,
  potency: /\b[MARIP]\s*<\s*\d|\bpotenc(y|ies)\b/i,
  movement:
    /\b(push(es|ed)?|pull(s|ed)?|slid(e|es|ed)?|shift(s|ed)?|teleport(s|ed)?|forced? move(d|ment)?|swap places|fl(y|ies|ying)|burrow(s|ing)?|climb(s|ing)?)\b/i,
  'speed-squares': /\b(speed|squares?|stability)\b/i,
  modifier:
    /\b(bonus(es)?|penalt(y|ies)|immunit(y|ies)|weakness(es)?|cover|concealment|line of effect)\b/i,
  characteristic: /\b(Might|Agility|Reason|Intuition|Presence|characteristics?)\b/,
  resource: /\b(Malice|Heroic Resource|ferocity|wrath|clarity|rage)\b/i,
  'action-economy':
    /\b(main actions?|maneuvers?|triggered actions?|free strikes?|move actions?|opportunity attacks?|takes? (your|their) turn|acted yet|turn order)\b/i,
  'usage-limit': /\bonce per (round|turn|encounter)\b|\bcan('|’)t be used again\b|\bused again\b/i,
  'effect-removal':
    /\bno longer\b|\bend(s)? (all|any|one|the|this)\b[^.]*\b(effects?|conditions?)\b|\bremove(s|d)?\b/i,
  'difficult-terrain': /\bdifficult terrain\b/i,
  size: /\bsize \d/i,
  'strike-ability': /\b(strikes?|abilit(y|ies))\b/i,
  'ability-invocation': /\b(can )?uses? [A-Z]/,
  'summon-spawn': /\b(summons?|unoccupied spaces?|within distance|minions?|appears?)\b/i,
  'choice-menu': /\bChoose (one|two) of the following\b|\bthe following (benefits|effects)\b/i,
  'build-mechanics': /\b(kits?|traits?|ancestr(y|ies)|features?|perks?|titles?)\b/i,
};

export function detectMechanicalSignals(sourceText: string): string[] {
  const stripped = stripCanonLinks(sourceText);
  return Object.entries(MECHANICAL_SIGNALS)
    .filter(([, pattern]) => pattern.test(stripped))
    .map(([name]) => name);
}

export interface NarrativeTriageCandidate {
  artifactId: string;
  effectOrdinal: number;
  sourcePath: string;
  book: 'heroes' | 'monsters';
  actionType: string | null;
  targetsText: string | null;
  sourceText: string;
  payloadSha256: string;
  /** Signals that DID hit (non-empty only when maxSignals > 0 widened the net). */
  signals: string[];
  /** Full artifact text, embedded so the review card is self-contained. */
  artifactText: string;
}

export interface NarrativeTriageReport {
  canonPin: string;
  tablePrograms: number;
  candidates: NarrativeTriageCandidate[];
}

export function buildNarrativeTriage(
  fixtures: CoreEffectFixture[],
  canonPin: string,
  maxSignals = 0,
): NarrativeTriageReport {
  const table = fixtures.filter((fixture) => fixture.program.resolution.kind === 'table');
  const candidates = table
    .map((fixture) => ({ fixture, signals: detectMechanicalSignals(fixture.program.sourceText) }))
    .filter(({ signals }) => signals.length <= maxSignals)
    .map(({ fixture, signals }) => ({
      artifactId: fixture.artifactId,
      effectOrdinal: fixture.clauseOrdinal,
      sourcePath: fixture.artifact.source.path,
      book: fixture.artifact.source.path.startsWith('en/books/heroes/')
        ? ('heroes' as const)
        : ('monsters' as const),
      actionType: fixture.program.actionType,
      targetsText: fixture.program.targetsText,
      sourceText: fixture.program.sourceText,
      payloadSha256: sha256(fixture.program.sourceText),
      signals,
      artifactText: fixture.artifact.text,
    }));
  return { canonPin, tablePrograms: table.length, candidates };
}

export const NarrativeTriageRulingSchema = z.object({
  artifactId: z.string().min(1),
  effectOrdinal: z.number().int().positive(),
  payloadSha256: z.string().length(64),
  status: z.enum(['never', 'engine-plausible', 'unreviewed']),
  comment: z.string().optional(),
});

export const NarrativeTriageRulingsSchema = z.object({
  schema: z.literal('engarde-narrative-triage-rulings-v1'),
  canonPin: z.string().min(1),
  exportedAt: z.string().min(1),
  rulings: z.array(NarrativeTriageRulingSchema),
});

export type NarrativeTriageRulings = z.infer<typeof NarrativeTriageRulingsSchema>;

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * Self-contained review one-pager: one card per candidate with the verbatim
 * payload, provenance, expandable full artifact text, ✓/✗ ruling buttons, and
 * a comment box. Progress autosaves to localStorage (keyed by canon pin);
 * "Download rulings" exports the JSON blob the CLI schema validates.
 * Keyboard: j/k move, p = plausible, n = never, u = unreviewed.
 */
export function renderNarrativeTriageHtml(report: NarrativeTriageReport): string {
  const cards = report.candidates
    .map((candidate, index) => {
      const key = `${candidate.artifactId}#${candidate.effectOrdinal}`;
      return `
<section class="card" data-index="${index}" data-key="${escapeHtml(key)}" data-sha="${candidate.payloadSha256}">
  <p class="payload">${escapeHtml(stripCanonLinks(candidate.sourceText))}</p>
  <p class="meta">${escapeHtml(candidate.artifactId)} · effect #${candidate.effectOrdinal} · ${candidate.book}${candidate.actionType ? ` · ${escapeHtml(candidate.actionType)}` : ''}${candidate.targetsText ? ` · targets: ${escapeHtml(candidate.targetsText)}` : ''}${candidate.signals.length > 0 ? ` · signals: ${escapeHtml(candidate.signals.join(', '))}` : ''}</p>
  <details><summary>Full artifact context</summary><pre>${escapeHtml(candidate.artifactText)}</pre></details>
  <div class="controls">
    <button class="rule never" type="button">✗ Never — narrative, table forever</button>
    <button class="rule plausible" type="button">✓ Engine-plausible someday</button>
    <button class="rule clear" type="button">clear</button>
    <input class="comment" type="text" placeholder="optional comment" />
  </div>
</section>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Narrative triage — ${report.candidates.length} candidates</title>
<style>
  body { font-family: Georgia, serif; margin: 0; background: #16130f; color: #e8e0d0; }
  header { position: sticky; top: 0; background: #201c15; padding: 12px 20px; border-bottom: 1px solid #3a3428;
           display: flex; gap: 16px; align-items: center; flex-wrap: wrap; z-index: 2; }
  header h1 { font-size: 16px; margin: 0; }
  header .count { font-variant-numeric: tabular-nums; }
  button { font: inherit; cursor: pointer; border-radius: 6px; border: 1px solid #55503f;
           background: #2a2519; color: #e8e0d0; padding: 8px 14px; min-height: 44px; }
  .filters button.active { outline: 2px solid #c9a86a; }
  .card { margin: 14px auto; max-width: 860px; background: #201c15; border: 1px solid #3a3428;
          border-radius: 10px; padding: 16px 20px; }
  .card.focused { border-color: #c9a86a; }
  .card.status-never { border-left: 6px solid #a04a3a; }
  .card.status-plausible { border-left: 6px solid #4a7a4a; }
  .payload { font-size: 17px; line-height: 1.45; margin: 0 0 6px; }
  .meta { font-family: ui-monospace, monospace; font-size: 12px; color: #9a917d; margin: 0 0 8px; }
  details pre { white-space: pre-wrap; font-size: 12px; background: #16130f; padding: 10px; border-radius: 6px; }
  .controls { display: flex; gap: 10px; margin-top: 10px; flex-wrap: wrap; align-items: center; }
  .rule.never.selected { background: #5c2c22; border-color: #a04a3a; }
  .rule.plausible.selected { background: #2c4a2c; border-color: #4a7a4a; }
  .comment { flex: 1; min-width: 220px; font: inherit; font-size: 14px; padding: 10px;
             background: #16130f; color: #e8e0d0; border: 1px solid #3a3428; border-radius: 6px; }
  .hidden { display: none; }
  kbd { background: #2a2519; border-radius: 4px; padding: 1px 5px; font-size: 11px; }
  .help { font-size: 12px; color: #9a917d; }
</style>
</head>
<body>
<header>
  <h1>Narrative triage · pin ${escapeHtml(report.canonPin.slice(0, 10))}…</h1>
  <span class="count" id="progress"></span>
  <span class="filters">
    <button type="button" data-filter="all" class="active">All</button>
    <button type="button" data-filter="unreviewed">Unreviewed</button>
    <button type="button" data-filter="never">Never</button>
    <button type="button" data-filter="plausible">Plausible</button>
  </span>
  <button type="button" id="download">Download rulings JSON</button>
  <span class="help"><kbd>j</kbd>/<kbd>k</kbd> move · <kbd>n</kbd> never · <kbd>p</kbd> plausible · <kbd>u</kbd> clear</span>
</header>
<main id="cards">
${cards}
</main>
<script>
'use strict';
const PIN = ${JSON.stringify(report.canonPin)};
const STORE_KEY = 'engarde-narrative-triage-' + PIN;
const cards = Array.from(document.querySelectorAll('.card'));
let state = {};
try { state = JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch { state = {}; }
let focusIndex = 0;

function save() { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
function entry(key) { return state[key] || { status: 'unreviewed', comment: '' }; }

function paint(card) {
  const e = entry(card.dataset.key);
  card.classList.toggle('status-never', e.status === 'never');
  card.classList.toggle('status-plausible', e.status === 'engine-plausible');
  card.querySelector('.rule.never').classList.toggle('selected', e.status === 'never');
  card.querySelector('.rule.plausible').classList.toggle('selected', e.status === 'engine-plausible');
  const comment = card.querySelector('.comment');
  if (comment.value !== e.comment) comment.value = e.comment || '';
}

function progress() {
  const done = cards.filter((c) => entry(c.dataset.key).status !== 'unreviewed').length;
  document.getElementById('progress').textContent = done + ' / ' + cards.length + ' ruled';
}

function setStatus(card, status) {
  const e = entry(card.dataset.key);
  e.status = status;
  state[card.dataset.key] = e;
  save(); paint(card); progress();
}

function focusCard(index) {
  focusIndex = Math.max(0, Math.min(cards.length - 1, index));
  cards.forEach((c, i) => c.classList.toggle('focused', i === focusIndex));
  cards[focusIndex].scrollIntoView({ block: 'center', behavior: 'smooth' });
}

cards.forEach((card, index) => {
  card.addEventListener('click', () => { focusIndex = index; cards.forEach((c, i) => c.classList.toggle('focused', i === focusIndex)); });
  card.querySelector('.rule.never').addEventListener('click', () => setStatus(card, 'never'));
  card.querySelector('.rule.plausible').addEventListener('click', () => setStatus(card, 'engine-plausible'));
  card.querySelector('.rule.clear').addEventListener('click', () => setStatus(card, 'unreviewed'));
  card.querySelector('.comment').addEventListener('input', (event) => {
    const e = entry(card.dataset.key);
    e.comment = event.target.value;
    state[card.dataset.key] = e;
    save();
  });
  paint(card);
});
progress();

document.querySelectorAll('.filters button').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.filters button').forEach((b) => b.classList.remove('active'));
    button.classList.add('active');
    const filter = button.dataset.filter;
    cards.forEach((card) => {
      const status = entry(card.dataset.key).status;
      const show = filter === 'all'
        || (filter === 'unreviewed' && status === 'unreviewed')
        || (filter === 'never' && status === 'never')
        || (filter === 'plausible' && status === 'engine-plausible');
      card.classList.toggle('hidden', !show);
    });
  });
});

document.addEventListener('keydown', (event) => {
  if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return;
  if (event.key === 'j') focusCard(focusIndex + 1);
  else if (event.key === 'k') focusCard(focusIndex - 1);
  else if (event.key === 'n') { setStatus(cards[focusIndex], 'never'); focusCard(focusIndex + 1); }
  else if (event.key === 'p') { setStatus(cards[focusIndex], 'engine-plausible'); focusCard(focusIndex + 1); }
  else if (event.key === 'u') setStatus(cards[focusIndex], 'unreviewed');
});

document.getElementById('download').addEventListener('click', () => {
  const rulings = cards.map((card) => {
    const e = entry(card.dataset.key);
    const [artifactId, ordinal] = [card.dataset.key.slice(0, card.dataset.key.lastIndexOf('#')), card.dataset.key.slice(card.dataset.key.lastIndexOf('#') + 1)];
    const ruling = { artifactId, effectOrdinal: Number(ordinal), payloadSha256: card.dataset.sha, status: e.status };
    if (e.comment) ruling.comment = e.comment;
    return ruling;
  });
  const blob = new Blob([JSON.stringify({
    schema: 'engarde-narrative-triage-rulings-v1',
    canonPin: PIN,
    exportedAt: new Date().toISOString(),
    rulings,
  }, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'narrative-triage-rulings.json';
  link.click();
  URL.revokeObjectURL(link.href);
});
</script>
</body>
</html>
`;
}
