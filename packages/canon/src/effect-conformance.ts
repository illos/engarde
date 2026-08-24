import {
  type AbilityEffectData,
  AbilityEffectDataSchema,
  type EncounterState,
  type Intent,
  applyIntent,
} from '@engarde/engine';
import type { RandomSource } from '@engarde/engine';
import type { EffectClause, GrammarParse, TierOutcomeData } from './effect-grammar.js';

/**
 * Channel 1 of the dual-reader verification stack (engine-plan 4.2, pilot
 * thin form): book → grammar → engine. Parsed tier-outcome data compiles
 * into engine intents deterministically; conformance tests then assert
 * EXHAUSTIVE state deltas — the complete set of changes, so omissions and
 * side effects both fail.
 *
 * Deliberately unexecuted parts of a tier outcome are returned as explicit
 * `unexecuted` items (damage application and potency resolution have no
 * engine mechanism yet — they are mechanism-backlog entries, never silent
 * drops).
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
 * so clusters are grouped by sequence: each power-roll heading owns the
 * tier lines that follow it (until the next heading), attributed to the
 * nearest preceding ability header. A cluster missing any of its three
 * tier lines is reported, never guessed at.
 */
export function compileAbilities(
  parse: GrammarParse,
  abilityArtifactId: string,
): { abilities: AbilityEffectData[]; incomplete: CompileMiss[] } {
  interface Cluster {
    header: Extract<EffectClause, { kind: 'ability-header' }> | null;
    powerRoll: Extract<EffectClause, { kind: 'power-roll' }>;
    tiers: Partial<Record<'tier1' | 'tier2' | 'tier3', TierOutcomeData>>;
    duplicateTiers: Set<'tier1' | 'tier2' | 'tier3'>;
  }
  const clusters: Cluster[] = [];
  let lastHeader: Extract<EffectClause, { kind: 'ability-header' }> | null = null;
  for (const clause of parse.clauses) {
    if (clause.kind === 'ability-header') {
      lastHeader = clause;
      continue;
    }
    if (clause.kind === 'power-roll') {
      clusters.push({
        header: lastHeader,
        powerRoll: clause,
        tiers: {},
        duplicateTiers: new Set(),
      });
      continue;
    }
    if (clause.kind === 'tier-outcome') {
      const cluster = clusters[clusters.length - 1];
      if (!cluster) continue; // tier line before any heading — stays data-only
      const slot = BAND_TO_TIER[clause.data.band];
      if (slot in cluster.tiers) cluster.duplicateTiers.add(slot);
      else cluster.tiers[slot] = clause.data;
    }
  }
  const abilities: AbilityEffectData[] = [];
  const incomplete: CompileMiss[] = [];
  for (const cluster of clusters) {
    const tier1 = cluster.tiers.tier1;
    const tier2 = cluster.tiers.tier2;
    const tier3 = cluster.tiers.tier3;
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
