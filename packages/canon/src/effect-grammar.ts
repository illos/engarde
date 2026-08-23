/**
 * Effect grammar (engine-plan 3.5, pilot thin form): permissive line-based
 * parsing of ability rule text into effect data, with FULL-CONSUMPTION
 * accounting — every byte of the artifact text is owned by exactly one
 * parsed clause or one explicit residue span. The grammar consumes a whole
 * line or none of it: a line whose payload doesn't fully match its clause
 * sub-grammar goes to residue intact, so no clause tail is ever silently
 * dropped (engine-plan constitutional principle 5).
 *
 * The clause vocabulary is grounded in the pilot's five sample abilities
 * (blood-for-blood, sentenced, mark, grab lead-in, toxic-plants): flavor
 * lines, ability-header tables, power-roll headings, and tier-outcome lines.
 * Effect prose, hazard blocks, and upgrade riders are RESIDUE by design —
 * they route to tier 2/3 or the mechanism backlog, never silently away.
 */

export interface TextSpan {
  byteStart: number;
  byteEnd: number;
  text: string;
}

export interface TierOutcomeData {
  band: '≤11' | '12-16' | '17+';
  damage: { amount: number; characteristic: string | null } | null;
  potency: { characteristic: string; threshold: string } | null;
  /** Condition artifact ids taken from the explicit scc.v1 links. */
  conditionIds: string[];
  ending: 'save-ends' | null;
}

export type EffectClause =
  | { kind: 'flavor'; span: TextSpan }
  | { kind: 'whitespace'; span: TextSpan }
  | {
      kind: 'ability-header';
      span: TextSpan;
      keywords: string[];
      actionType: string;
      distance: string | null;
      targets: string | null;
    }
  | { kind: 'power-roll'; span: TextSpan; bonus: string }
  | { kind: 'tier-outcome'; span: TextSpan; data: TierOutcomeData };

export interface ResidueSpan {
  span: TextSpan;
  reason: 'unrecognized';
}

export interface GrammarParse {
  clauses: EffectClause[];
  residue: ResidueSpan[];
  stats: { totalBytes: number; parsedBytes: number; residueBytes: number };
}

interface Line {
  byteStart: number;
  byteEnd: number;
  text: string;
}

const encoder = new TextEncoder();

function splitLines(text: string): Line[] {
  const lines: Line[] = [];
  let byteStart = 0;
  let charStart = 0;
  while (charStart <= text.length) {
    const newlineAt = text.indexOf('\n', charStart);
    const charEnd = newlineAt === -1 ? text.length : newlineAt + 1;
    const slice = text.slice(charStart, charEnd);
    const byteEnd = byteStart + encoder.encode(slice).length;
    if (slice.length > 0) lines.push({ byteStart, byteEnd, text: slice });
    if (newlineAt === -1) break;
    byteStart = byteEnd;
    charStart = charEnd;
  }
  return lines;
}

const SCC_LINK = /\[([^\]]+)\]\(scc\.v1:([^)]+)\)/g;

function stripSccLinks(value: string): string {
  return value.replace(SCC_LINK, '$1');
}

function conditionIdsIn(value: string): string[] {
  const ids: string[] = [];
  for (const match of value.matchAll(SCC_LINK)) {
    const target = match[2] ?? '';
    if (target.includes('/condition/')) ids.push(target);
  }
  return ids;
}

/** `- **≤11:** 4 + M damage; M < WEAK, bleeding and weakened (save ends)` */
const TIER_LINE = /^(?:> )?- \*\*(≤11|12-16|17\+):\*\* (.+?)\s*$/;
const DAMAGE_PART = /^(\d+)(?: \+ ([A-Z]))? damage$/;
const POTENCY_PREFIX = /^([A-Z]) < (WEAK|AVERAGE|STRONG|\d+),? ?/;

function parseTierPayload(payload: string): Omit<TierOutcomeData, 'band'> | null {
  const conditionIds = conditionIdsIn(payload);
  let rest = stripSccLinks(payload).trim();

  let ending: TierOutcomeData['ending'] = null;
  if (rest.endsWith('(save ends)')) {
    ending = 'save-ends';
    rest = rest.slice(0, -'(save ends)'.length).trim();
  }

  let damage: TierOutcomeData['damage'] = null;
  const semicolon = rest.indexOf(';');
  const damageText = semicolon === -1 ? rest : rest.slice(0, semicolon).trim();
  const afterDamage = semicolon === -1 ? '' : rest.slice(semicolon + 1).trim();
  const damageMatch = DAMAGE_PART.exec(damageText);
  let conditionText: string;
  if (damageMatch) {
    damage = {
      amount: Number(damageMatch[1]),
      characteristic: damageMatch[2] ?? null,
    };
    conditionText = afterDamage;
  } else if (semicolon === -1) {
    conditionText = rest;
  } else {
    return null; // a semicolon promises a damage part this grammar can't read
  }

  let potency: TierOutcomeData['potency'] = null;
  const potencyMatch = POTENCY_PREFIX.exec(conditionText);
  if (potencyMatch) {
    potency = {
      characteristic: potencyMatch[1] ?? '',
      threshold: potencyMatch[2] ?? '',
    };
    conditionText = conditionText.slice(potencyMatch[0].length).trim();
  }

  // Whatever names remain must be exactly the linked conditions joined by
  // "and" — anything else means this line says more than the grammar reads.
  if (conditionText.length > 0) {
    const namesOnly = conditionText
      .split(/,| and /)
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    if (conditionIds.length === 0 || namesOnly.length !== conditionIds.length) return null;
  } else if (conditionIds.length > 0) {
    return null;
  }

  return { damage, potency, conditionIds, ending };
}

/** `| **Melee, Strike, Weapon** | **Main action** |` + `| **📏 Melee 1** | **🎯 One creature** |` */
function parseHeaderTable(
  lines: Line[],
): Omit<Extract<EffectClause, { kind: 'ability-header' }>, 'kind' | 'span'> | null {
  const rows = lines
    .map((line) => stripSccLinks(line.text).trim().replace(/^> /, ''))
    .filter((row) => row.length > 0 && !/^\|[-| :]+\|$/.test(row));
  const cells = rows.map((row) =>
    row
      .split('|')
      .map((cell) => cell.trim().replace(/^\*\*|\*\*$/g, ''))
      .filter((cell) => cell.length > 0),
  );
  const first = cells[0];
  if (!first || first.length < 2) return null;
  const distanceRow = cells.find((row) => row.some((cell) => cell.startsWith('📏')));
  const targetRow = cells.find((row) => row.some((cell) => cell.startsWith('🎯')));
  return {
    keywords: (first[0] ?? '').split(',').map((keyword) => keyword.trim()),
    actionType: first[first.length - 1] ?? '',
    distance:
      distanceRow
        ?.find((cell) => cell.startsWith('📏'))
        ?.slice('📏'.length)
        .trim() ?? null,
    targets:
      targetRow
        ?.find((cell) => cell.startsWith('🎯'))
        ?.slice('🎯'.length)
        .trim() ?? null,
  };
}

const POWER_ROLL_LINE = /^(?:> )?\*\*Power Roll \+ ([^:*]+):\*\*\s*$/;
const FLAVOR_LINE = /^\*[^*].*\*\s*$/;
const TABLE_LINE = /^(?:> )?\|.*\|\s*$/;

function span(lines: Line[]): TextSpan {
  const first = lines[0];
  const last = lines[lines.length - 1];
  if (!first || !last) throw new Error('span of no lines');
  return {
    byteStart: first.byteStart,
    byteEnd: last.byteEnd,
    text: lines.map((line) => line.text).join(''),
  };
}

export function parseEffectText(text: string): GrammarParse {
  const lines = splitLines(text);
  const clauses: EffectClause[] = [];
  const residue: ResidueSpan[] = [];
  let residueBuffer: Line[] = [];

  const flushResidue = (): void => {
    if (residueBuffer.length > 0) {
      residue.push({ span: span(residueBuffer), reason: 'unrecognized' });
      residueBuffer = [];
    }
  };

  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line) break;
    const trimmed = line.text.trim();

    if (trimmed.length === 0) {
      flushResidue();
      clauses.push({ kind: 'whitespace', span: span([line]) });
      index += 1;
      continue;
    }
    if (FLAVOR_LINE.test(trimmed)) {
      flushResidue();
      clauses.push({ kind: 'flavor', span: span([line]) });
      index += 1;
      continue;
    }
    if (TABLE_LINE.test(trimmed)) {
      const tableLines: Line[] = [];
      while (index < lines.length) {
        const candidate = lines[index];
        if (!candidate || !TABLE_LINE.test(candidate.text.trim())) break;
        tableLines.push(candidate);
        index += 1;
      }
      const header = parseHeaderTable(tableLines);
      if (header) {
        flushResidue();
        clauses.push({ kind: 'ability-header', span: span(tableLines), ...header });
      } else {
        residueBuffer.push(...tableLines);
      }
      continue;
    }
    const powerRoll = POWER_ROLL_LINE.exec(trimmed);
    if (powerRoll) {
      flushResidue();
      clauses.push({ kind: 'power-roll', span: span([line]), bonus: powerRoll[1] ?? '' });
      index += 1;
      continue;
    }
    const tier = TIER_LINE.exec(trimmed);
    if (tier) {
      const payload = parseTierPayload(tier[2] ?? '');
      if (payload) {
        flushResidue();
        clauses.push({
          kind: 'tier-outcome',
          span: span([line]),
          data: { band: tier[1] as TierOutcomeData['band'], ...payload },
        });
        index += 1;
        continue;
      }
    }
    residueBuffer.push(line);
    index += 1;
  }
  flushResidue();

  const totalBytes = encoder.encode(text).length;
  const parsedBytes = clauses.reduce(
    (sum, clause) => sum + (clause.span.byteEnd - clause.span.byteStart),
    0,
  );
  const residueBytes = residue.reduce(
    (sum, item) => sum + (item.span.byteEnd - item.span.byteStart),
    0,
  );
  return { clauses, residue, stats: { totalBytes, parsedBytes, residueBytes } };
}

/**
 * The full-consumption invariant: clause + residue spans, in order, exactly
 * partition the text's bytes. Returns violations (empty = conserved).
 */
export function auditGrammarConservation(text: string, parse: GrammarParse): string[] {
  const problems: string[] = [];
  const spans = [
    ...parse.clauses.map((clause) => clause.span),
    ...parse.residue.map((item) => item.span),
  ].sort((a, b) => a.byteStart - b.byteStart);
  let position = 0;
  for (const item of spans) {
    if (item.byteStart !== position) {
      problems.push(`gap or overlap at byte ${position} (next span starts ${item.byteStart})`);
      break;
    }
    position = item.byteEnd;
  }
  const totalBytes = encoder.encode(text).length;
  if (position !== totalBytes) {
    problems.push(`coverage ends at byte ${position} of ${totalBytes}`);
  }
  if (parse.stats.parsedBytes + parse.stats.residueBytes !== totalBytes) {
    problems.push('stats do not sum to total bytes');
  }
  return problems;
}
