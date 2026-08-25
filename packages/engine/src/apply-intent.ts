import { executeUseAbility } from './ability-execution.js';
import {
  CANON,
  SAVING_THROW,
  applyConditionInstance,
  endEncounterSweep,
  endOfTurnSweep,
  removeConditionInstance,
} from './condition-lifecycle.js';
import { applyDamage, damageAutomationBlocker, withParticipant } from './damage.js';
import type { RandomSource } from './determinism.js';
import { TERRAIN_CANON, executeUseEffect } from './effect-execution.js';
import { endEncounterGrantSweep, endOfTurnGrantSweep } from './grant-lifecycle.js';
import { HEALTH_CANON, isDying, isHealthSourcedInstance } from './health.js';
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
      const instance = target.conditions.find(
        (candidate) => candidate.instanceId === intent.payload.instanceId,
      );
      // R-0004: the dying-mandated bleeding "can't be negated or removed in
      // any way until you are no longer dying" [rule.health/dying]. This is a
      // representational refusal, not a permissive warn-and-apply violation.
      if (
        instance !== undefined &&
        isHealthSourcedInstance(instance) &&
        instance.source.effectArtifactId === HEALTH_CANON.dying &&
        target.stamina !== null &&
        isDying(target.stamina.current)
      ) {
        return {
          state,
          log: [
            {
              kind: 'refusal',
              intentId: intent.intentId,
              actor: intent.actor,
              canonRefs: [HEALTH_CANON.dying],
              message: `${target.id} is still dying — this bleeding instance can't be removed until they are no longer dying`,
              data: { instanceId: instance.instanceId },
            },
          ],
        };
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
    case 'use-ability':
      return executeUseAbility(state, intent, context.random);
    case 'use-effect':
      return executeUseEffect(state, intent, context.random);
    case 'apply-damage': {
      const target = state.participants[intent.payload.target];
      if (!target) {
        return { state, log: [refusal(intent, `unknown participant ${intent.payload.target}`)] };
      }
      const blocker = damageAutomationBlocker(target);
      if (blocker !== null) {
        return {
          state,
          log: [
            {
              kind: 'table-directive',
              intentId: intent.intentId,
              actor: intent.actor,
              canonRefs: [HEALTH_CANON.damage],
              message: `${target.id} takes ${intent.payload.amount}${intent.payload.damageType ? ` ${intent.payload.damageType}` : ''} damage (${intent.payload.reason}) — ${blocker}`,
              data: {
                unautomatedDamage: {
                  targetId: target.id,
                  amount: intent.payload.amount,
                  damageType: intent.payload.damageType ?? null,
                },
              },
            },
          ],
        };
      }
      const outcome = applyDamage(
        target,
        { amount: intent.payload.amount, type: intent.payload.damageType ?? null },
        { knockOut: intent.payload.knockOut, reason: intent.payload.reason },
        lifecycleContext,
      );
      return { state: withParticipant(state, outcome.participant), log: outcome.log };
    }
    case 'end-turn': {
      const target = state.participants[intent.payload.participantId];
      if (!target) {
        return {
          state,
          log: [refusal(intent, `unknown participant ${intent.payload.participantId}`)],
        };
      }
      const swept = endOfTurnSweep(
        state,
        target,
        intent.payload.rolls ?? {},
        () => context.random.roll(SAVING_THROW.die),
        lifecycleContext,
      );
      // Windowed next-roll grants expire at the holder's end-turn event
      // [R-0016]; the same sweep is the current-turn clause.
      const liveTarget = swept.state.participants[intent.payload.participantId];
      if (!liveTarget) return swept;
      const grantSwept = endOfTurnGrantSweep(swept.state, liveTarget, lifecycleContext);
      return { state: grantSwept.state, log: [...swept.log, ...grantSwept.log] };
    }
    case 'end-encounter': {
      const swept = endEncounterSweep(
        state,
        intent.payload.keepInstanceIds,
        lifecycleContext,
        (participant, instance) =>
          isHealthSourcedInstance(instance) &&
          (instance.source.effectArtifactId !== HEALTH_CANON.dying ||
            (participant.stamina !== null && isDying(participant.stamina.current))),
      );
      // Every remaining next-roll grant clears with the encounter [R-0012];
      // out-of-encounter retention stays Director/table state.
      const grantsSwept = endEncounterGrantSweep(swept.state, lifecycleContext);
      // Temporary Stamina disappears at the end of an encounter
      // [rule.health/temporary-stamina].
      let nextState = grantsSwept.state;
      const log = [...swept.log, ...grantsSwept.log];
      for (const participant of Object.values(nextState.participants)) {
        if (participant.stamina !== null && participant.stamina.temporary > 0) {
          const cleared = {
            ...participant,
            stamina: { ...participant.stamina, temporary: 0 },
          };
          nextState = withParticipant(nextState, cleared);
          log.push({
            kind: 'mutation',
            intentId: intent.intentId,
            actor: intent.actor,
            canonRefs: [HEALTH_CANON.temporaryStamina],
            message: `temporary Stamina on ${participant.id} disappears with the encounter`,
            data: {
              staminaDeltas: [
                {
                  participantId: participant.id,
                  from: participant.stamina.current,
                  to: participant.stamina.current,
                  temporaryFrom: participant.stamina.temporary,
                  temporaryTo: 0,
                },
              ],
            },
          });
        }
      }
      // Terrain facts do not survive the encounter [R-0022].
      if (nextState.terrainFacts.length > 0) {
        log.push({
          kind: 'mutation',
          intentId: intent.intentId,
          actor: intent.actor,
          canonRefs: [TERRAIN_CANON.difficultTerrain],
          message: `${nextState.terrainFacts.length} recorded terrain fact(s) end with the encounter`,
          data: { terrainFactsCleared: nextState.terrainFacts.map((fact) => fact.factId) },
        });
        nextState = { ...nextState, terrainFacts: [] };
      }
      return { state: nextState, log };
    }
    case 'clear-terrain-fact': {
      const fact = state.terrainFacts.find(
        (candidate) => candidate.factId === intent.payload.factId,
      );
      if (!fact) {
        return { state, log: [refusal(intent, `unknown terrain fact ${intent.payload.factId}`)] };
      }
      return {
        state: {
          ...state,
          terrainFacts: state.terrainFacts.filter((candidate) => candidate !== fact),
        },
        log: [
          {
            kind: 'mutation',
            intentId: intent.intentId,
            actor: intent.actor,
            canonRefs: [TERRAIN_CANON.difficultTerrain],
            message: `terrain fact cleared${intent.payload.reason ? `: ${intent.payload.reason}` : ''} — the area${fact.areaText ? ` (${fact.areaText})` : ''} is no longer difficult terrain`,
            data: { terrainFactCleared: fact },
          },
        ],
      };
    }
  }
}
