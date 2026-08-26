import {
  type AbilityEffectData,
  AbilityEffectDataSchema,
  type EffectProgramData,
  EffectProgramDataSchema,
  type EncounterState,
  type Intent,
  applyIntent,
} from '@engarde/engine';
import type { RandomSource } from '@engarde/engine';
import { type HeaderCostAnnotation, annotateHeaderCosts } from './action-cost.js';
import {
  type EffectClause,
  type GrammarParse,
  type TierOutcomeData,
  matchTierBulletLine,
} from './effect-grammar.js';

/**
 * Channel 1 of the dual-reader verification stack (engine-plan 4.2, pilot
 * thin form): book → grammar → engine. Parsed tier-outcome data compiles
 * into engine intents deterministically; conformance tests then assert
 * EXHAUSTIVE state deltas — the complete set of changes, so omissions and
 * side effects both fail.
 *
 * The legacy tierOutcomeToIntents adapter still reports damage/potency as
 * `unexecuted` because it emits only condition intents; full power-roll
 * abilities use compileAbilities + use-ability for those shipped mechanisms.
 * Effect prose uses compileEffectPrograms + use-effect below.
 */

export interface TierOutcomeExecution {
  intents: Intent[];
  unexecuted: Array<{ part: 'damage' | 'potency'; detail: string }>;
}

export function tierOutcomeToIntents(
  data: TierOutcomeData,
  binding: {
    intentIdPrefix: string;
    actorParticipantId: string;
    targetParticipantId: string;
    effectArtifactId: string;
  },
): TierOutcomeExecution {
  const unexecuted: TierOutcomeExecution['unexecuted'] = [];
  if (data.damage) {
    const characteristicPart =
      data.damage.characteristicOptions.length > 0
        ? ` + ${data.damage.characteristicOptions.join(' or ')}`
        : '';
    unexecuted.push({
      part: 'damage',
      detail: `${data.damage.amount}${characteristicPart} damage — dispatch use-ability for engine resolution`,
    });
  }
  if (data.potency) {
    unexecuted.push({
      part: 'potency',
      detail: `${data.potency.characteristic} < ${data.potency.threshold} — no potency-resolution mechanism yet; conformance assumes the gate is met`,
    });
  }
  const intents: Intent[] = data.conditionIds.map((conditionId, index) => ({
    intentId: `${binding.intentIdPrefix}-${index}`,
    kind: 'apply-condition',
    actor: { kind: 'participant', participantId: binding.actorParticipantId },
    payload: {
      target: binding.targetParticipantId,
      conditionId,
      ending: data.ending === 'save-ends' ? { kind: 'save-ends' } : { kind: 'external' },
      source: {
        participantId: binding.actorParticipantId,
        effectArtifactId: binding.effectArtifactId,
      },
    },
  }));
  return { intents, unexecuted };
}

const BAND_TO_TIER = { '≤11': 'tier1', '12-16': 'tier2', '17+': 'tier3' } as const;

/** Why an ability cannot compile to engine-resolvable effect data. */
export interface CompileMiss {
  missing: string[];
}

/** Shape the parsed tier data for the engine schema; the final
 * `AbilityEffectDataSchema.parse` is the validator (letters, damage types,
 * and threshold names are checked there, not trusted here). */
function tierEffectOf(data: TierOutcomeData): unknown {
  return {
    damage: data.damage,
    potency: data.potency
      ? {
          characteristic: data.potency.characteristic,
          threshold: /^\d+$/.test(data.potency.threshold)
            ? { kind: 'numeric', value: Number(data.potency.threshold) }
            : { kind: 'named', name: data.potency.threshold.toLowerCase() },
        }
      : null,
    conditionIds: data.conditionIds,
    ending: data.ending,
  };
}

/**
 * Compile every power-roll cluster in a parsed artifact into
 * engine-resolvable effect data (the use-ability intent payload).
 * Deterministic: verbatim text → grammar → this shape; the engine
 * interprets it (data over code). Stat blocks are multi-ability artifacts,
 * so clusters are grouped by sequence: each power-roll heading owns ONLY the
 * tier lines that follow it contiguously — whitespace may intervene, but an
 * ability header, an Effect line, or any residue prose CLOSES the open
 * cluster (R-0011: tier bullets that follow a test Effect must never join
 * the preceding power-roll cluster). A cluster missing any of its three
 * tier lines is reported, never guessed at.
 */
export interface PowerRollClusterGroup {
  header: Extract<EffectClause, { kind: 'ability-header' }> | null;
  powerRoll: Extract<EffectClause, { kind: 'power-roll' }>;
  tiers: Partial<
    Record<'tier1' | 'tier2' | 'tier3', Extract<EffectClause, { kind: 'tier-outcome' }>>
  >;
  duplicateTiers: Set<'tier1' | 'tier2' | 'tier3'>;
}

/**
 * The ONE home of power-roll cluster ownership (R-0011). Clauses and residue
 * are walked in byte order; whitespace passes through, while an ability
 * header, an Effect line, residue prose, or any other clause CLOSES the open
 * cluster, so tier bullets never attach across intervening content.
 */
export function groupPowerRollClusters(parse: GrammarParse): PowerRollClusterGroup[] {
  type OwnershipEvent =
    | { kind: 'clause'; clause: EffectClause; byteStart: number }
    | { kind: 'residue'; byteStart: number };
  const events: OwnershipEvent[] = [
    ...parse.clauses.map(
      (clause): OwnershipEvent => ({ kind: 'clause', clause, byteStart: clause.span.byteStart }),
    ),
    ...parse.residue.map(
      (item): OwnershipEvent => ({ kind: 'residue', byteStart: item.span.byteStart }),
    ),
  ].sort((left, right) => left.byteStart - right.byteStart);

  const clusters: PowerRollClusterGroup[] = [];
  let lastHeader: Extract<EffectClause, { kind: 'ability-header' }> | null = null;
  let openCluster: PowerRollClusterGroup | null = null;
  for (const event of events) {
    if (event.kind === 'residue') {
      openCluster = null; // bespoke prose separates; nothing attaches across it
      continue;
    }
    const clause = event.clause;
    if (clause.kind === 'whitespace') continue;
    if (clause.kind === 'ability-header') {
      lastHeader = clause;
      openCluster = null;
      continue;
    }
    if (clause.kind === 'power-roll') {
      openCluster = {
        header: lastHeader,
        powerRoll: clause,
        tiers: {},
        duplicateTiers: new Set(),
      };
      clusters.push(openCluster);
      continue;
    }
    if (clause.kind === 'tier-outcome') {
      if (!openCluster) continue; // no open cluster — stays data-only
      const slot = BAND_TO_TIER[clause.data.band];
      if (slot in openCluster.tiers) openCluster.duplicateTiers.add(slot);
      else openCluster.tiers[slot] = clause;
      continue;
    }
    // Any other clause (an Effect line, a flavor line, future clause kinds)
    // closes the open cluster.
    openCluster = null;
  }
  return clusters;
}

/** Economy fields for one compiled shape from its header's annotation
 * [R-0029, R-0031]; a headerless shape carries the schema defaults. */
function economyFieldsOf(annotation: HeaderCostAnnotation | undefined): Record<string, unknown> {
  if (!annotation) return {};
  return {
    actionCost: annotation.actionCost,
    actionCostResidue: annotation.actionCostResidue,
    operatorPays: annotation.operatorPays,
    usesPerRound: annotation.usesPerRound,
    reactionInterception: annotation.reactionInterception,
  };
}

export function compileAbilities(
  parse: GrammarParse,
  abilityArtifactId: string,
): { abilities: AbilityEffectData[]; incomplete: CompileMiss[] } {
  const clusters = groupPowerRollClusters(parse);
  const annotations = annotateHeaderCosts(parse);
  const abilities: AbilityEffectData[] = [];
  const incomplete: CompileMiss[] = [];
  for (const cluster of clusters) {
    const tier1 = cluster.tiers.tier1?.data;
    const tier2 = cluster.tiers.tier2?.data;
    const tier3 = cluster.tiers.tier3?.data;
    if (!tier1 || !tier2 || !tier3 || cluster.duplicateTiers.size > 0) {
      incomplete.push({
        missing: [
          ...(['tier1', 'tier2', 'tier3'] as const)
            .filter((slot) => !cluster.tiers[slot])
            .map((slot) => `${slot} outcome line`),
          ...[...cluster.duplicateTiers].map((slot) => `duplicate ${slot} outcome line`),
        ],
      });
      continue;
    }
    abilities.push(
      AbilityEffectDataSchema.parse({
        abilityArtifactId,
        actionType: cluster.header?.actionType ?? null,
        ...economyFieldsOf(cluster.header ? annotations.get(cluster.header) : undefined),
        keywords: cluster.header?.keywords ?? [],
        targetsText: cluster.header?.targets ?? null,
        powerRollBonus: cluster.powerRoll.bonusData,
        tiers: {
          tier1: tierEffectOf(tier1),
          tier2: tierEffectOf(tier2),
          tier3: tierEffectOf(tier3),
        },
      }),
    );
  }
  return { abilities, incomplete };
}

/** The first complete cluster — the single-ability common case. */
export function compileAbility(
  parse: GrammarParse,
  abilityArtifactId: string,
): { ability: AbilityEffectData } | CompileMiss {
  const { abilities, incomplete } = compileAbilities(parse, abilityArtifactId);
  const ability = abilities[0];
  if (ability) return { ability };
  return incomplete[0] ?? { missing: ['power-roll heading'] };
}

/** Compile every `**Effect:**` clause into an engine program. Exact canon
 * forms carry automatic operations; all other prose carries `table` and is
 * emitted verbatim by the engine. The nearest preceding header supplies the
 * target/action receipt metadata, but never changes the instruction text. */
type CompileEvent =
  | { kind: 'clause'; clause: EffectClause; byteStart: number }
  | { kind: 'residue'; text: string; byteStart: number };

interface AttachedTierBullet {
  band: '≤11' | '12-16' | '17+';
  /** Exact physical line, trailing newline removed. */
  sourceText: string;
  /** Present only when the certified tier grammar read the whole payload. */
  data: TierOutcomeData | null;
}

function exactLineOf(text: string): string {
  const withoutNewline = text.endsWith('\n') ? text.slice(0, -1) : text;
  return withoutNewline.endsWith('\r') ? withoutNewline.slice(0, -1) : withoutNewline;
}

/**
 * Attach the tier bullets that follow a test Effect line (R-0011: all of
 * them, losslessly). Ownership mirrors groupPowerRollClusters: whitespace
 * passes; a parsed tier-outcome clause attaches as an automatic candidate; a
 * residue chunk contributes its LEADING tier-bullet lines verbatim and any
 * non-bullet line in it closes the attachment; any other clause closes it.
 * Returns null unless exactly one bullet per band attached.
 */
function attachTestTiers(
  events: CompileEvent[],
  startIndex: number,
): Record<'tier1' | 'tier2' | 'tier3', AttachedTierBullet> | null {
  const bullets: AttachedTierBullet[] = [];
  for (let index = startIndex; index < events.length; index += 1) {
    const event = events[index];
    if (!event) break;
    if (event.kind === 'residue') {
      let sawNonBullet = false;
      for (const line of event.text.split(/(?<=\n)/)) {
        if (exactLineOf(line).length === 0) continue;
        const bullet = matchTierBulletLine(line);
        if (bullet === null) {
          sawNonBullet = true;
          break;
        }
        bullets.push({ band: bullet.band, sourceText: exactLineOf(line), data: null });
      }
      if (sawNonBullet) break;
      continue;
    }
    const clause = event.clause;
    if (clause.kind === 'whitespace') continue;
    if (clause.kind === 'tier-outcome') {
      bullets.push({
        band: clause.data.band,
        sourceText: exactLineOf(clause.span.text),
        data: clause.data,
      });
      continue;
    }
    break; // header, Effect line, power-roll, flavor — attachment closes
  }
  const byBand = new Map(bullets.map((bullet) => [bullet.band, bullet]));
  const tier1 = byBand.get('≤11');
  const tier2 = byBand.get('12-16');
  const tier3 = byBand.get('17+');
  if (!tier1 || !tier2 || !tier3 || bullets.length !== 3) return null;
  return { tier1, tier2, tier3 };
}

/** A test tier bullet automates only when the certified tier grammar read
 * the whole payload AND the data needs no binding a test cannot express
 * (flat damage, at most one type option). Everything else stays verbatim. */
function testTierOf(bullet: AttachedTierBullet): unknown {
  const automatable =
    bullet.data !== null &&
    (bullet.data.damage === null ||
      (bullet.data.damage.characteristicOptions.length === 0 &&
        bullet.data.damage.typeOptions.length <= 1));
  if (automatable && bullet.data) {
    return { kind: 'automatic', data: tierEffectOf(bullet.data), sourceText: bullet.sourceText };
  }
  return { kind: 'verbatim', sourceText: bullet.sourceText };
}

export function compileEffectPrograms(
  parse: GrammarParse,
  effectArtifactId: string,
): EffectProgramData[] {
  const events: CompileEvent[] = [
    ...parse.clauses.map(
      (clause): CompileEvent => ({ kind: 'clause', clause, byteStart: clause.span.byteStart }),
    ),
    ...parse.residue.map(
      (item): CompileEvent => ({
        kind: 'residue',
        text: item.span.text,
        byteStart: item.span.byteStart,
      }),
    ),
  ].sort((left, right) => left.byteStart - right.byteStart);

  const annotations = annotateHeaderCosts(parse);
  const programs: EffectProgramData[] = [];
  let lastHeader: Extract<EffectClause, { kind: 'ability-header' }> | null = null;
  let effectOrdinal = 0;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (!event || event.kind !== 'clause') continue;
    const clause = event.clause;
    if (clause.kind === 'ability-header') {
      lastHeader = clause;
      continue;
    }
    if (clause.kind !== 'effect') continue;
    effectOrdinal += 1;

    let resolution: unknown;
    if (clause.data.resolution.kind === 'condition') {
      resolution = {
        ...clause.data.resolution,
        ending: { kind: clause.data.resolution.ending },
      };
    } else if (clause.data.resolution.kind === 'test') {
      // R-0011: a test compiles only with all three bullets attached
      // losslessly; otherwise the whole line stays a verbatim table
      // directive — never a partial program.
      const tiers = attachTestTiers(events, index + 1);
      resolution = tiers
        ? {
            kind: 'test',
            characteristic: clause.data.resolution.characteristic,
            subject: clause.data.resolution.subject,
            tiers: {
              tier1: testTierOf(tiers.tier1),
              tier2: testTierOf(tiers.tier2),
              tier3: testTierOf(tiers.tier3),
            },
          }
        : { kind: 'table' };
    } else {
      resolution = clause.data.resolution;
    }

    programs.push(
      EffectProgramDataSchema.parse({
        effectArtifactId,
        effectOrdinal,
        sourceSpan: {
          byteStart: clause.span.byteStart,
          byteEnd: clause.span.byteEnd,
        },
        sourceText: clause.data.sourceText,
        canonRefs: clause.data.canonRefs,
        actionType: lastHeader?.actionType ?? null,
        ...economyFieldsOf(lastHeader ? annotations.get(lastHeader) : undefined),
        targetsText: lastHeader?.targets ?? null,
        distanceText: lastHeader?.distance ?? null,
        // Header keywords pass through like the ability form's — the Area
        // keyword is the printed discriminator for the squad-pool area cap
        // [chapter/monster-basics §Dropping Multiple Minions, R-0025].
        keywords: lastHeader?.keywords ?? [],
        resolution,
      }),
    );
  }
  return programs;
}

/** The first Effect instruction — the single-effect common case. */
export function compileEffectProgram(
  parse: GrammarParse,
  effectArtifactId: string,
): { effect: EffectProgramData } | CompileMiss {
  const effect = compileEffectPrograms(parse, effectArtifactId)[0];
  return effect ? { effect } : { missing: ['Effect instruction'] };
}

export function executeIntents(
  state: EncounterState,
  intents: readonly Intent[],
  random: RandomSource,
): { state: EncounterState; logKinds: string[] } {
  let current = state;
  const logKinds: string[] = [];
  for (const intent of intents) {
    const result = applyIntent(current, intent, { random });
    current = result.state;
    logKinds.push(...result.log.map((entry) => entry.kind));
  }
  return { state: current, logKinds };
}
