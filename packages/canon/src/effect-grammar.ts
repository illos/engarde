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
 * Effect prose is recognized as an attributed instruction. Only exact forms
 * with an existing engine core are marked automatic; every other Effect
 * instruction retains its verbatim payload for a table directive. Hazard
 * blocks and upgrade riders remain RESIDUE by design.
 */

export interface TextSpan {
  byteStart: number;
  byteEnd: number;
  text: string;
}

export interface TierOutcomeData {
  band: '≤11' | '12-16' | '17+';
  /** "3 + M damage" → options ['M']; "7 + M or A damage" → ['M','A'];
   * "5 corruption damage" → typeOptions ['corruption']; plain → []
   * [rule.dice/ability-roll §Characteristics and Damage,
   * rule.damage/damage-type]. */
  damage: { amount: number; characteristicOptions: string[]; typeOptions: string[] } | null;
  potency: { characteristic: string; threshold: string } | null;
  /** Condition artifact ids taken from the explicit scc.v1 links. */
  conditionIds: string[];
  ending: 'save-ends' | null;
}

/** Structured power-roll bonus [rule.dice/ability-roll; monster stat blocks
 * use the fixed "+ N" form]. The union mirrors the engine's
 * PowerRollBonusSchema; measured over the corpus, every heading fits. */
export type PowerRollBonusData =
  | { kind: 'fixed'; value: number }
  | { kind: 'characteristic'; options: string[] }
  | { kind: 'highest' };

export type EffectLineResolutionData =
  | { kind: 'damage'; amount: number; damageType: string | null }
  | {
      kind: 'condition';
      conditionId: string;
      ending: 'external' | 'end-of-targets-next-turn';
      replacesOnNewSource: boolean;
    }
  | { kind: 'table' };

export interface EffectLineData {
  /** Exact Markdown payload after `**Effect:**` (no normalization). */
  sourceText: string;
  /** Explicit scc.v1 targets in source order, de-duplicated. */
  canonRefs: string[];
  resolution: EffectLineResolutionData;
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
  | { kind: 'power-roll'; span: TextSpan; bonus: string; bonusData: PowerRollBonusData }
  | { kind: 'tier-outcome'; span: TextSpan; data: TierOutcomeData }
  | { kind: 'effect'; span: TextSpan; data: EffectLineData };

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

function canonRefsIn(value: string): string[] {
  const refs: string[] = [];
  for (const match of value.matchAll(SCC_LINK)) {
    const target = match[2];
    if (target && !refs.includes(target)) refs.push(target);
  }
  return refs;
}

const EFFECT_LINE = /^(?:> )?\*\*Effect:\*\* (.+)$/;
/** The nine typed damage kinds [rule.damage/damage-type] — a closed set. */
const DAMAGE_TYPE = '(?:acid|cold|corruption|fire|holy|lightning|poison|psychic|sonic)';
const DIRECT_EFFECT_DAMAGE = new RegExp(
  `^(?:The target|Each target) takes (\\d+)(?: (${DAMAGE_TYPE.slice(3, -1)}))? damage\\.$`,
);
const LINKED_CONDITION = '\\[[^\\]]+\\]\\(scc\\.v1:[^)]*\\/condition\\/[^)]+\\)';
/** Closed over the five independently reviewed accepted-corpus forms. A new
 * imposer name or any appended rider stays table until its ending is audited. */
const EXTERNAL_GRABBED_EFFECT =
  /^The target is \[grabbed\]\(scc\.v1:mcdm\.heroes\.v1\/condition\/grabbed\) by the (?:channeler|commander|roughneck|sneak|commando)\.$/;
const NEXT_TURN_CONDITION_EFFECT = new RegExp(
  `^The target is ${LINKED_CONDITION} until the end of their next \\[[^\\]]+\\]\\(scc\\.v1:mcdm\\.heroes\\.v1/rule\\.combat/turn\\)\\.$`,
);

function parseEffectPayload(payload: string): EffectLineData {
  const canonRefs = canonRefsIn(payload);
  // Markdown line-break spaces are retained in sourceText/provenance while
  // semantic matching ignores only that presentation suffix.
  const semanticPayload = payload.trimEnd();
  const plain = stripSccLinks(semanticPayload);
  const damage = DIRECT_EFFECT_DAMAGE.exec(plain);
  if (damage) {
    return {
      sourceText: payload,
      canonRefs,
      resolution: {
        kind: 'damage',
        amount: Number(damage[1]),
        damageType: damage[2] ?? null,
      },
    };
  }

  const conditionIds = conditionIdsIn(payload);
  const conditionId = conditionIds.length === 1 ? conditionIds[0] : undefined;
  if (
    conditionId === 'mcdm.heroes.v1/condition/grabbed' &&
    EXTERNAL_GRABBED_EFFECT.test(semanticPayload)
  ) {
    return {
      sourceText: payload,
      canonRefs,
      resolution: {
        kind: 'condition',
        conditionId,
        ending: 'external',
        replacesOnNewSource: false,
      },
    };
  }
  if (
    conditionId === 'mcdm.heroes.v1/condition/taunted' &&
    NEXT_TURN_CONDITION_EFFECT.test(semanticPayload)
  ) {
    return {
      sourceText: payload,
      canonRefs,
      resolution: {
        kind: 'condition',
        conditionId,
        ending: 'end-of-targets-next-turn',
        replacesOnNewSource: true,
      },
    };
  }

  return { sourceText: payload, canonRefs, resolution: { kind: 'table' } };
}

/** `- **≤11:** 4 + M damage; M < WEAK, bleeding and weakened (save ends)` */
const TIER_LINE = /^(?:> )?- \*\*(≤11|12-16|17\+):\*\* (.+?)\s*$/;
/** Anything outside the closed damage-type set fails the line to residue. */
const DAMAGE_CHARACTERISTIC = '[MARIP]';
/** `N [+ C[, C…][ or C]] [type[, type…][ or type]] damage` — measured to
 * cover 98.0% of the corpus's damage-carrying tier heads; the long tail
 * (dual damage parts, dice expressions, prose) stays residue. */
const DAMAGE_PART = new RegExp(
  `^(\\d+)(?: \\+ (${DAMAGE_CHARACTERISTIC}(?:, ${DAMAGE_CHARACTERISTIC})*(?:,? or ${DAMAGE_CHARACTERISTIC})?))?( ${DAMAGE_TYPE}(?:, ${DAMAGE_TYPE})*(?:,? or ${DAMAGE_TYPE})?)? damage$`,
);
const POTENCY_PREFIX = /^([A-Z]) < (WEAK|AVERAGE|STRONG|\d+),? ?/;

function splitOptions(list: string): string[] {
  return list
    .split(/,| or /)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

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
  // Bold-wrapped characteristics ("8 + **A** psychic damage") normalize for
  // the head match only; the span keeps the raw bytes.
  const damageText = (semicolon === -1 ? rest : rest.slice(0, semicolon))
    .replace(/\*\*/g, '')
    .trim();
  const afterDamage = semicolon === -1 ? '' : rest.slice(semicolon + 1).trim();
  const damageMatch = DAMAGE_PART.exec(damageText);
  let conditionText: string;
  if (damageMatch) {
    damage = {
      amount: Number(damageMatch[1]),
      characteristicOptions: damageMatch[2] ? splitOptions(damageMatch[2]) : [],
      typeOptions: damageMatch[3] ? splitOptions(damageMatch[3]) : [],
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

  // Alternative outcome branches and (EoT) endings are not represented by
  // TierOutcomeData yet. Do not flatten them into one list of conditions:
  // e.g. Styrich's Tangled Nest says "restrained (EoT) or ... restrained
  // (save ends)", whose branches have different gates and endings.
  if (/\bor\b/.test(conditionText) || conditionText.includes('(EoT)')) return null;

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

const CHARACTERISTIC_LETTER: Record<string, string> = {
  might: 'M',
  agility: 'A',
  reason: 'R',
  intuition: 'I',
  presence: 'P',
};

/** The four measured bonus shapes: fixed `N` (monster stat blocks), one
 * characteristic, a characteristic choice list, or the "highest
 * characteristic" form. An unrecognized bonus fails the line to residue —
 * never a guessed binding. */
function parsePowerRollBonus(bonusText: string): PowerRollBonusData | null {
  const text = bonusText.trim();
  if (/^\d+$/.test(text)) return { kind: 'fixed', value: Number(text) };
  if (/^(?:your )?highest characteristic(?: score)?$/i.test(text)) return { kind: 'highest' };
  const options = splitOptions(text).map((name) => CHARACTERISTIC_LETTER[name.toLowerCase()]);
  if (options.length === 0 || options.some((letter) => letter === undefined)) return null;
  return { kind: 'characteristic', options: options as string[] };
}
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
    const withoutNewline = line.text.endsWith('\n') ? line.text.slice(0, -1) : line.text;
    const exactLine = withoutNewline.endsWith('\r') ? withoutNewline.slice(0, -1) : withoutNewline;

    if (trimmed.length === 0 || /^>+$/.test(trimmed)) {
      // A blank line, or a quote marker with nothing after it — structural
      // whitespace inside statblock quote blocks, never content.
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
    // Like tier payloads and header tables, the power-roll heading is
    // matched with scc links stripped (the span keeps the raw bytes).
    const powerRoll = POWER_ROLL_LINE.exec(stripSccLinks(trimmed));
    if (powerRoll) {
      const bonusData = parsePowerRollBonus(powerRoll[1] ?? '');
      if (bonusData) {
        flushResidue();
        clauses.push({
          kind: 'power-roll',
          span: span([line]),
          bonus: powerRoll[1] ?? '',
          bonusData,
        });
        index += 1;
        continue;
      }
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
    const effect = EFFECT_LINE.exec(exactLine);
    if (effect) {
      flushResidue();
      clauses.push({
        kind: 'effect',
        span: span([line]),
        data: parseEffectPayload(effect[1] ?? ''),
      });
      index += 1;
      continue;
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
