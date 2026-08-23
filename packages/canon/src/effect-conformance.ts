import { type EncounterState, type Intent, applyIntent } from '@engarde/engine';
import type { RandomSource } from '@engarde/engine';
import type { TierOutcomeData } from './effect-grammar.js';

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
    unexecuted.push({
      part: 'damage',
      detail: `${data.damage.amount}${data.damage.characteristic ? ` + ${data.damage.characteristic}` : ''} damage — no damage/Stamina mechanism yet`,
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
