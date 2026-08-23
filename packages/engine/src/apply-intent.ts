import {
  CANON,
  SAVING_THROW,
  applyConditionInstance,
  endEncounterSweep,
  endOfTurnSweep,
  removeConditionInstance,
} from './condition-lifecycle.js';
import type { RandomSource } from './determinism.js';
import { type EncounterState, type Intent, IntentSchema, type LogEntry } from './schemas.js';

/**
 * The pure reducer (engine-plan 3.1): state + intent (dice as input) → new
 * state + structured log. Identical inputs are identical outputs; the only
 * chance enters through the injected RandomSource, and an asserted roll on
 * the payload always wins over it (manual entry is the override, auto-roll
 * the default).
 */
export interface EngineContext {
  random: RandomSource;
}

export interface ApplyResult {
  state: EncounterState;
  log: LogEntry[];
}

function refusal(intent: Intent, message: string): LogEntry {
  return {
    kind: 'refusal',
    intentId: intent.intentId,
    actor: intent.actor,
    canonRefs: [],
    message,
    data: {},
  };
}

export function applyIntent(
  state: EncounterState,
  rawIntent: Intent,
  context: EngineContext,
): ApplyResult {
  const intent = IntentSchema.parse(rawIntent);
  const lifecycleContext = { intentId: intent.intentId, actor: intent.actor };

  switch (intent.kind) {
    case 'apply-condition': {
      const target = state.participants[intent.payload.target];
      if (!target) {
        return { state, log: [refusal(intent, `unknown participant ${intent.payload.target}`)] };
      }
      return applyConditionInstance(
        state,
        {
          target,
          instance: {
            // Deterministic identity: derived from the (host-unique) intent
            // id, never from ambient randomness.
            instanceId: `${intent.payload.conditionId}#${intent.intentId}`,
            conditionId: intent.payload.conditionId,
            ending: intent.payload.ending,
            source: intent.payload.source,
          },
          replacesOnNewSource: intent.payload.replacesOnNewSource,
        },
        lifecycleContext,
      );
    }
    case 'remove-condition': {
      const target = state.participants[intent.payload.target];
      if (!target) {
        return { state, log: [refusal(intent, `unknown participant ${intent.payload.target}`)] };
      }
      return removeConditionInstance(
        state,
        target,
        intent.payload.instanceId,
        lifecycleContext,
        [CANON.creatureEndsAbilityEffect],
        `condition instance removed from ${target.id}${intent.payload.reason ? `: ${intent.payload.reason}` : ''}`,
      );
    }
    case 'end-turn': {
      const target = state.participants[intent.payload.participantId];
      if (!target) {
        return {
          state,
          log: [refusal(intent, `unknown participant ${intent.payload.participantId}`)],
        };
      }
      return endOfTurnSweep(
        state,
        target,
        intent.payload.rolls ?? {},
        () => context.random.roll(SAVING_THROW.die),
        lifecycleContext,
      );
    }
    case 'end-encounter':
      return endEncounterSweep(state, intent.payload.keepInstanceIds, lifecycleContext);
  }
}
