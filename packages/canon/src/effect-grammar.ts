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
  | {
      /** "(The|Each) target makes a[n] X test." [R-0006, R-0007]. Tier
       * bullets attach at compile time (effect-conformance), not here. */
      kind: 'test';
      characteristic: 'might' | 'agility' | 'reason' | 'intuition' | 'presence';
      subject: 'the-target' | 'each-target';
    }
  | {
      /** "(The|Each) target (takes a bane|takes a double bane|gains an
       * edge|has a double edge) on their next (strike|power roll)[ made
       * before the end of their next turn]." and "The next strike made
       * against the target (gains an edge|takes a bane)." — one-shot
       * next-roll modifier grants [R-0012..R-0016]. */
      kind: 'next-roll-grant';
      polarity: 'edge' | 'double-edge' | 'bane' | 'double-bane';
      scope: 'strike' | 'power-roll';
      direction: 'outbound' | 'inbound';
      subject: 'the-target' | 'each-target';
      window: 'end-of-targets-next-turn' | null;
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

/** The display labels of condition links, in source order — the words the
 * book actually prints for each condition in this payload. */
function conditionLabelsIn(value: string): string[] {
  const labels: string[] = [];
  for (const match of value.matchAll(SCC_LINK)) {
    if ((match[2] ?? '').includes('/condition/')) labels.push(match[1] ?? '');
  }
  return labels;
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
/** "(The|Each) target makes a[n] X test." — anchored whole payload,
 * bold-tolerant [R-0006, R-0007]. Any rider or second sentence fails the
 * anchor and the line stays table. */
const CHARACTERISTIC_TEST_EFFECT =
  /^(The target|Each target) makes an? (?:\*\*)?(Might|Agility|Reason|Intuition|Presence) test(?:\*\*)?\.$/;
/** The two closed next-roll grant templates (effect-shape inventory ids
 * `edge-bane-next-roll` + `next-strike-against-target`) — anchored whole
 * payload; any rider or second sentence stays table [R-0012..R-0016]. */
const NEXT_ROLL_GRANT_EFFECT =
  /^(The target|Each target) (takes a bane|takes a double bane|gains an edge|has a double edge) on their next (strike|power roll)( made before the end of their next turn)?\.$/;
const INBOUND_NEXT_STRIKE_EFFECT =
  /^The next strike made against the target (gains an edge|takes a bane)\.$/;
const GRANT_POLARITY: Record<string, 'edge' | 'double-edge' | 'bane' | 'double-bane'> = {
  'gains an edge': 'edge',
  'has a double edge': 'double-edge',
  'takes a bane': 'bane',
  'takes a double bane': 'double-bane',
};

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

  const test = CHARACTERISTIC_TEST_EFFECT.exec(plain);
  if (test) {
    return {
      sourceText: payload,
      canonRefs,
      resolution: {
        kind: 'test',
        characteristic: (test[2] ?? '').toLowerCase() as
          | 'might'
          | 'agility'
          | 'reason'
          | 'intuition'
          | 'presence',
        subject: test[1] === 'The target' ? 'the-target' : 'each-target',
      },
    };
  }

  const outboundGrant = NEXT_ROLL_GRANT_EFFECT.exec(plain);
  if (outboundGrant) {
    const polarity = GRANT_POLARITY[outboundGrant[2] ?? ''];
    if (polarity) {
      return {
        sourceText: payload,
        canonRefs,
        resolution: {
          kind: 'next-roll-grant',
          polarity,
          scope: outboundGrant[3] === 'strike' ? 'strike' : 'power-roll',
          direction: 'outbound',
          subject: outboundGrant[1] === 'The target' ? 'the-target' : 'each-target',
          window: outboundGrant[4] !== undefined ? 'end-of-targets-next-turn' : null,
        },
      };
    }
  }
  const inboundGrant = INBOUND_NEXT_STRIKE_EFFECT.exec(plain);
  if (inboundGrant) {
    const polarity = GRANT_POLARITY[inboundGrant[1] ?? ''];
    if (polarity) {
      return {
        sourceText: payload,
        canonRefs,
        resolution: {
          kind: 'next-roll-grant',
          polarity,
          scope: 'strike',
          direction: 'inbound',
          subject: 'the-target',
          window: null,
        },
      };
    }
  }

  return { sourceText: payload, canonRefs, resolution: { kind: 'table' } };
}

/** Match one physical tier-bullet line ("- **≤11:** …", optional quote
 * prefix), returning its band and exact payload. Used by the compiler to
 * attach test tier bullets losslessly [R-0011]; the payload is NOT parsed
 * here — attachment and (possible) automation are separate concerns. */
export function matchTierBulletLine(
  lineText: string,
): { band: '≤11' | '12-16' | '17+'; payload: string } | null {
  const withoutNewline = lineText.endsWith('\n') ? lineText.slice(0, -1) : lineText;
  const exact = withoutNewline.endsWith('\r') ? withoutNewline.slice(0, -1) : withoutNewline;
  const match = TIER_LINE.exec(exact.trim());
  if (!match) return null;
  return { band: match[1] as '≤11' | '12-16' | '17+', payload: match[2] ?? '' };
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

  // Whatever remains must be EXACTLY the linked condition labels joined by
  // "," / "and" — compared word-for-word against the link labels, not by
  // count. The count-only check this replaces silently swallowed middle
  // clauses ("push 3;", "the target gains 1 rage;"), un-anchored potency
  // gates, mid-payload "(save ends)" endings, and duration tails ("until the
  // end of the encounter") — certifying conditions without their gates. A
  // payload that says more than the grammar reads fails to residue, whole.
  if (conditionText.length > 0) {
    const labels = conditionLabelsIn(payload);
    const namesOnly = conditionText
      .split(/,| and /)
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    if (
      conditionIds.length === 0 ||
      namesOnly.length !== labels.length ||
      !namesOnly.every((part, index) => part.toLowerCase() === (labels[index] ?? '').toLowerCase())
    ) {
      return null;
    }
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
