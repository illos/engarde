/**
 * Deterministic shape inventory over table-directed `**Effect:**` programs.
 *
 * The Effect pipeline (docs/effect-engine-report.md) compiles every whole-line
 * Effect instruction; 12 exact instructions execute automatically and the rest
 * are verbatim table directives. This module groups those table directives by
 * OBSERVABLE STRUCTURE ONLY — anchored regular expressions over the exact
 * source payload — so the next automation family is chosen from measured
 * evidence, not guessed meaning.
 *
 * Normalization here exists solely for grouping/comparison. It never feeds
 * execution: every row retains the untouched source payload, artifact id,
 * ordinal, and source path, and nothing in this module writes engine state.
 */
import type { CoreEffectFixture } from './effect-corpus-fixtures.js';

/** Replace `[label](scc.v1:...)` canon links with their visible label. */
export function stripCanonLinks(text: string): string {
  return text.replace(/\[([^\]]*)\]\(scc\.v1:[^)]*\)/g, '$1');
}

/**
 * Comparison-only template: canon links reduced to labels, bold markers
 * dropped, dice expressions then bare integers replaced by placeholders.
 */
export function normalizeTemplate(text: string): string {
  return stripCanonLinks(text)
    .replaceAll('**', '')
    .replace(/\b\d+d\d+(\s*\+\s*\d+)?\b/g, '<DICE>')
    .replace(/\b\d+\b/g, '<N>');
}

/** Terminal-punctuation sentence count over the link-stripped payload. */
export function sentenceCount(text: string): number {
  return (stripCanonLinks(text).match(/[.!?](?:\s|$)/g) ?? []).length;
}

export const EFFECT_SHAPE_FAMILIES = [
  'choice-menu',
  'characteristic-test',
  'movement',
  'condition',
  'edge-bane',
  'surge',
  'recovery',
  'temporary-stamina',
  'stamina-regain',
  'malice',
  'heroic-resource',
  'free-strike',
  'damage',
  'terrain',
  'other',
] as const;

export type EffectShapeFamily = (typeof EFFECT_SHAPE_FAMILIES)[number];

/**
 * Family patterns, matched against the link-stripped payload. A payload can
 * match several; its PRIMARY family is the first match in
 * EFFECT_SHAPE_FAMILIES order (most specific first). The order is part of the
 * inventory's contract: changing it changes the report and must show up in
 * the frozen conformance counts.
 */
const FAMILY_PATTERNS: Record<Exclude<EffectShapeFamily, 'other'>, RegExp> = {
  'choice-menu': /^Choose (one|two) of the following/,
  'characteristic-test':
    /\bmakes? (an? )?(\*\*)?(Might|Agility|Reason|Intuition|Presence) test|\bmakes? a test using their highest characteristic\b/,
  movement:
    /\b(push(es|ed)?|pull(s|ed)?|slid(e|es|ed)|shift(s|ed)?|teleport(s|ed)?|force moved?)\b/i,
  condition: /\b(bleeding|dazed|frightened|grabbed|prone|restrained|slowed|taunted|weakened)\b/i,
  'edge-bane': /\b(edge|bane)\b/i,
  surge: /\bsurges?\b/,
  recovery: /\bRecover(y|ies)\b/,
  'temporary-stamina': /\btemporary Stamina\b/,
  'stamina-regain': /\bregains?\b[^.]*\bStamina\b/,
  malice: /\bMalice\b/i,
  'heroic-resource': /\b(Heroic Resource|ferocity|wrath|clarity|rage)\b/,
  'free-strike': /\bfree strikes?\b/i,
  damage: /\b(takes?|deals?)\b[^.]*\bdamage\b/i,
  terrain: /\bdifficult terrain\b/i,
};

/** Orthogonal structure tags — gates, timing, and optionality markers. */
const STRUCTURE_PATTERNS = {
  'save-ends': /\(save ends\)/,
  eot: /\(EoT\)/,
  'potency-gate': /\b[MARIP]\s*<\s*\d/,
  'if-gate': /\bif\b/i,
  'while-gate': /\bwhile\b/i,
  'when-trigger': /\bwhen(ever)?\b/i,
  'until-duration': /\buntil the (start|end) of\b/i,
  'turn-phase': /\b(start|end) of (each of )?(their|your|his|her|its|the)\b/i,
  'optional-can': /\b(can|may)\b/i,
} as const;

export type EffectStructureTag = keyof typeof STRUCTURE_PATTERNS;

/**
 * Anchored, whole-payload closed templates — recurring forms tight enough to
 * be automation candidates. Alternations are drawn from observed corpus text;
 * a payload with any extra rider fails the anchor and stays bespoke.
 */
export const CLOSED_TEMPLATES: ReadonlyArray<{
  id: string;
  family: EffectShapeFamily;
  pattern: RegExp;
}> = [
  {
    id: 'characteristic-test-exact',
    family: 'characteristic-test',
    pattern:
      /^(The target|Each target) makes an? (\*\*)?(Might|Agility|Reason|Intuition|Presence) test(\*\*)?\.$/,
  },
  {
    id: 'edge-bane-next-roll',
    family: 'edge-bane',
    pattern:
      /^(The target|Each target) (takes a bane|takes a double bane|gains an edge|has a double edge) on their next (strike|power roll)( made before the end of their next turn)?\.$/,
  },
  {
    id: 'next-strike-against-target',
    family: 'edge-bane',
    pattern: /^The next strike made against the target (gains an edge|takes a bane)\.$/,
  },
  {
    id: 'spend-recovery-exact',
    family: 'recovery',
    pattern:
      /^(You|The target|Each target|You or one ally within distance|One ally adjacent to the target|Each ally in the area) can spend a Recovery\.$/,
  },
  {
    id: 'regains-stamina-flat',
    family: 'stamina-regain',
    pattern: /^(The target|Each target|One creature within \d+ squares) regains \d+ Stamina\.$/,
  },
  {
    id: 'temporary-stamina-flat',
    family: 'temporary-stamina',
    pattern: /^(You|The target|Each target) gains? \d+ temporary Stamina\.$/,
  },
  {
    id: 'area-difficult-terrain',
    family: 'terrain',
    pattern: /^The area is difficult terrain\.$/,
  },
  {
    id: 'choice-menu-intro',
    family: 'choice-menu',
    pattern: /^Choose (one|two) of the following (benefits|effects):$/,
  },
];

export interface EffectShapeClassification {
  family: EffectShapeFamily;
  matchedFamilies: EffectShapeFamily[];
  structureTags: EffectStructureTag[];
  closedTemplateId: string | null;
  template: string;
  sentenceCount: number;
}

export function classifyEffectShape(sourceText: string): EffectShapeClassification {
  const stripped = stripCanonLinks(sourceText);
  const matchedFamilies = EFFECT_SHAPE_FAMILIES.filter(
    (family): family is Exclude<EffectShapeFamily, 'other'> =>
      family !== 'other' && FAMILY_PATTERNS[family].test(stripped),
  );
  const structureTags = (Object.keys(STRUCTURE_PATTERNS) as EffectStructureTag[]).filter((tag) =>
    STRUCTURE_PATTERNS[tag].test(stripped),
  );
  const closed = CLOSED_TEMPLATES.find((entry) => entry.pattern.test(stripped));
  return {
    family: matchedFamilies[0] ?? 'other',
    matchedFamilies,
    structureTags,
    closedTemplateId: closed?.id ?? null,
    template: normalizeTemplate(sourceText),
    sentenceCount: sentenceCount(sourceText),
  };
}

export type CorpusBook = 'heroes' | 'monsters';

export interface EffectShapeRow {
  artifactId: string;
  effectOrdinal: number;
  sourcePath: string;
  book: CorpusBook;
  actionType: string | null;
  targetsText: string | null;
  sourceText: string;
  classification: EffectShapeClassification;
}

export interface TemplateCount {
  template: string;
  count: number;
}

export interface FamilySummary {
  family: EffectShapeFamily;
  lineCount: number;
  artifactCount: number;
  heroes: number;
  monsters: number;
  uniqueTemplates: number;
  closedMatchCount: number;
  singleSentenceCount: number;
  topTemplates: TemplateCount[];
  samples: Array<{ artifactId: string; effectOrdinal: number; sourceText: string }>;
}

export interface ClosedTemplateSummary {
  id: string;
  family: EffectShapeFamily;
  lineCount: number;
  artifactCount: number;
  heroes: number;
  monsters: number;
  lines: Array<{ artifactId: string; effectOrdinal: number; sourceText: string }>;
}

export interface ExactDuplicateSummary {
  sourceText: string;
  count: number;
  artifactIds: string[];
}

export interface EffectShapeInventory {
  totalPrograms: number;
  tablePrograms: number;
  families: FamilySummary[];
  closedTemplates: ClosedTemplateSummary[];
  exactDuplicates: ExactDuplicateSummary[];
  structureTagCounts: Record<EffectStructureTag, number>;
}

function bookOf(sourcePath: string): CorpusBook {
  return sourcePath.startsWith('en/books/heroes/') ? 'heroes' : 'monsters';
}

export function toEffectShapeRows(fixtures: CoreEffectFixture[]): {
  totalPrograms: number;
  rows: EffectShapeRow[];
} {
  const tableFixtures = fixtures.filter((fixture) => fixture.program.resolution.kind === 'table');
  return {
    totalPrograms: fixtures.length,
    rows: tableFixtures.map((fixture) => ({
      artifactId: fixture.artifactId,
      effectOrdinal: fixture.clauseOrdinal,
      sourcePath: fixture.artifact.source.path,
      book: bookOf(fixture.artifact.source.path),
      actionType: fixture.program.actionType,
      targetsText: fixture.program.targetsText,
      sourceText: fixture.program.sourceText,
      classification: classifyEffectShape(fixture.program.sourceText),
    })),
  };
}

const TOP_TEMPLATES = 10;
const SAMPLES = 3;
const DUPLICATE_FLOOR = 3;

export function buildEffectShapeInventory(
  totalPrograms: number,
  rows: EffectShapeRow[],
): EffectShapeInventory {
  const families: FamilySummary[] = EFFECT_SHAPE_FAMILIES.map((family) => {
    const members = rows.filter((row) => row.classification.family === family);
    const templates = new Map<string, number>();
    for (const row of members) {
      templates.set(
        row.classification.template,
        (templates.get(row.classification.template) ?? 0) + 1,
      );
    }
    return {
      family,
      lineCount: members.length,
      artifactCount: new Set(members.map((row) => row.artifactId)).size,
      heroes: members.filter((row) => row.book === 'heroes').length,
      monsters: members.filter((row) => row.book === 'monsters').length,
      uniqueTemplates: templates.size,
      closedMatchCount: members.filter((row) => row.classification.closedTemplateId !== null)
        .length,
      singleSentenceCount: members.filter((row) => row.classification.sentenceCount <= 1).length,
      topTemplates: [...templates.entries()]
        .map(([template, count]) => ({ template, count }))
        .sort(
          (left, right) => right.count - left.count || left.template.localeCompare(right.template),
        )
        .slice(0, TOP_TEMPLATES),
      samples: members.slice(0, SAMPLES).map(({ artifactId, effectOrdinal, sourceText }) => ({
        artifactId,
        effectOrdinal,
        sourceText,
      })),
    };
  })
    .filter((summary) => summary.lineCount > 0)
    .sort(
      (left, right) => right.lineCount - left.lineCount || left.family.localeCompare(right.family),
    );

  const closedTemplates: ClosedTemplateSummary[] = CLOSED_TEMPLATES.map((entry) => {
    const members = rows.filter((row) => row.classification.closedTemplateId === entry.id);
    return {
      id: entry.id,
      family: entry.family,
      lineCount: members.length,
      artifactCount: new Set(members.map((row) => row.artifactId)).size,
      heroes: members.filter((row) => row.book === 'heroes').length,
      monsters: members.filter((row) => row.book === 'monsters').length,
      lines: members.map(({ artifactId, effectOrdinal, sourceText }) => ({
        artifactId,
        effectOrdinal,
        sourceText,
      })),
    };
  }).sort((left, right) => right.lineCount - left.lineCount || left.id.localeCompare(right.id));

  const byExactText = new Map<string, EffectShapeRow[]>();
  for (const row of rows) {
    const bucket = byExactText.get(row.sourceText) ?? [];
    bucket.push(row);
    byExactText.set(row.sourceText, bucket);
  }
  const exactDuplicates = [...byExactText.entries()]
    .filter(([, members]) => members.length >= DUPLICATE_FLOOR)
    .map(([sourceText, members]) => ({
      sourceText,
      count: members.length,
      artifactIds: [...new Set(members.map((row) => row.artifactId))].sort(),
    }))
    .sort(
      (left, right) => right.count - left.count || left.sourceText.localeCompare(right.sourceText),
    );

  const structureTagCounts = Object.fromEntries(
    (Object.keys(STRUCTURE_PATTERNS) as EffectStructureTag[]).map((tag) => [
      tag,
      rows.filter((row) => row.classification.structureTags.includes(tag)).length,
    ]),
  ) as Record<EffectStructureTag, number>;

  return {
    totalPrograms,
    tablePrograms: rows.length,
    families,
    closedTemplates,
    exactDuplicates,
    structureTagCounts,
  };
}

function markdownEscape(text: string): string {
  return text.replaceAll('|', '\\|');
}

export function renderEffectShapeInventoryMarkdown(inventory: EffectShapeInventory): string {
  const lines: string[] = [];
  lines.push('# Effect shape inventory (generated)');
  lines.push('');
  lines.push(
    `${inventory.tablePrograms} table-directed Effect instructions out of ${inventory.totalPrograms} total. Grouping is observable structure only; every source payload is untouched. Regenerate: \`pnpm corpus effect-shape-inventory --manifest <final-campaign-manifest.json> --md <this file>\`.`,
  );
  lines.push('');
  lines.push(
    '## Families (primary assignment, precedence order documented in effect-shape-inventory.ts)',
  );
  lines.push('');
  lines.push(
    '| family | lines | artifacts | heroes | monsters | unique templates | single-sentence | closed matches |',
  );
  lines.push('|---|---:|---:|---:|---:|---:|---:|---:|');
  for (const family of inventory.families) {
    lines.push(
      `| ${family.family} | ${family.lineCount} | ${family.artifactCount} | ${family.heroes} | ${family.monsters} | ${family.uniqueTemplates} | ${family.singleSentenceCount} | ${family.closedMatchCount} |`,
    );
  }
  lines.push('');
  for (const family of inventory.families) {
    lines.push(`### ${family.family}`);
    lines.push('');
    lines.push('| count | template |');
    lines.push('|---:|---|');
    for (const template of family.topTemplates) {
      lines.push(`| ${template.count} | ${markdownEscape(template.template)} |`);
    }
    lines.push('');
  }
  lines.push('## Closed templates (anchored whole-payload forms)');
  lines.push('');
  lines.push('| id | family | lines | artifacts | heroes | monsters |');
  lines.push('|---|---|---:|---:|---:|---:|');
  for (const closed of inventory.closedTemplates) {
    lines.push(
      `| ${closed.id} | ${closed.family} | ${closed.lineCount} | ${closed.artifactCount} | ${closed.heroes} | ${closed.monsters} |`,
    );
  }
  lines.push('');
  lines.push(`## Exact duplicate payloads (>= ${DUPLICATE_FLOOR} occurrences)`);
  lines.push('');
  lines.push('| count | payload |');
  lines.push('|---:|---|');
  for (const duplicate of inventory.exactDuplicates) {
    lines.push(`| ${duplicate.count} | ${markdownEscape(duplicate.sourceText)} |`);
  }
  lines.push('');
  lines.push('## Structure tags (orthogonal, multi-label)');
  lines.push('');
  lines.push('| tag | lines |');
  lines.push('|---|---:|');
  for (const [tag, count] of Object.entries(inventory.structureTagCounts).sort(
    (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
  )) {
    lines.push(`| ${tag} | ${count} |`);
  }
  lines.push('');
  return lines.join('\n');
}
