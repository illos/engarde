import { targetCountOf } from './ability-execution.js';
import { type LifecycleContext, applyConditionInstance } from './condition-lifecycle.js';
import { applyDamage, damageAutomationBlocker, withParticipant } from './damage.js';
import type { EncounterState, LogEntry, ParsedIntent } from './schemas.js';

/**
 * Executor for compiled `**Effect:**` programs. This is deliberately a small
 * interpreter over canon-produced data: exact damage and condition forms use
 * their one-home engine cores; everything else becomes an attributed,
 * verbatim table directive. All refusal gates run before mutation.
 */

type UseEffectIntent = Extract<ParsedIntent, { kind: 'use-effect' }>;

interface ExecutionResult {
  state: EncounterState;
  log: LogEntry[];
}

function refs(
  effect: UseEffectIntent['payload']['effect'],
  extra: readonly string[] = [],
): string[] {
  return [...new Set([effect.effectArtifactId, ...effect.canonRefs, ...extra])];
}

function entry(
  context: LifecycleContext,
  kind: LogEntry['kind'],
  message: string,
  canonRefs: string[],
  data: Record<string, unknown>,
): LogEntry {
  return { kind, intentId: context.intentId, actor: context.actor, canonRefs, message, data };
}

function receipt(intent: UseEffectIntent): Record<string, unknown> {
  return {
    effectResolution: {
      effectArtifactId: intent.payload.effect.effectArtifactId,
      effectOrdinal: intent.payload.effect.effectOrdinal,
      sourceSpan: intent.payload.effect.sourceSpan,
      sourceText: intent.payload.effect.sourceText,
      resolutionKind: intent.payload.effect.resolution.kind,
      targets: intent.payload.targets,
    },
  };
}

export function executeUseEffect(state: EncounterState, intent: UseEffectIntent): ExecutionResult {
  const context: LifecycleContext = { intentId: intent.intentId, actor: intent.actor };
  const { effect, targets } = intent.payload;
  if (!state.participants[intent.payload.actorParticipantId]) {
    return {
      state,
      log: [
        entry(
          context,
          'refusal',
          `unknown participant ${intent.payload.actorParticipantId}`,
          refs(effect),
          receipt(intent),
        ),
      ],
    };
  }
  for (const targetId of targets) {
    if (!state.participants[targetId]) {
      return {
        state,
        log: [
          entry(
            context,
            'refusal',
            `unknown participant ${targetId}`,
            refs(effect),
            receipt(intent),
          ),
        ],
      };
    }
  }
  if (effect.resolution.kind === 'condition') {
    for (const targetId of targets) {
      const instanceId = `${effect.resolution.conditionId}#${intent.intentId}-${targetId}`;
      if (
        state.participants[targetId]?.conditions.some(
          (instance) => instance.instanceId === instanceId,
        )
      ) {
        return {
          state,
          log: [
            entry(
              context,
              'refusal',
              `condition instance ${instanceId} already exists on ${targetId}`,
              refs(effect),
              receipt(intent),
            ),
          ],
        };
      }
    }
  }

  const log: LogEntry[] = [
    entry(
      context,
      'informational',
      `${intent.payload.actorParticipantId} resolves ${effect.effectArtifactId} Effect for ${targets.join(', ')}`,
      refs(effect),
      receipt(intent),
    ),
  ];
  const declaredTargets = targetCountOf(effect.targetsText);
  if (declaredTargets !== null && targets.length > declaredTargets) {
    log.push(
      entry(
        context,
        'warning',
        `${targets.length} targets named; the effect's targets line reads "${effect.targetsText}"`,
        refs(effect),
        { declaredTargets, namedTargets: targets.length },
      ),
    );
  }

  if (effect.resolution.kind === 'table') {
    log.push(
      entry(context, 'table-directive', effect.sourceText, refs(effect), {
        manualEffect: {
          effectArtifactId: effect.effectArtifactId,
          effectOrdinal: effect.effectOrdinal,
          sourceSpan: effect.sourceSpan,
          sourceText: effect.sourceText,
          targets,
        },
      }),
    );
    return { state, log };
  }

  let nextState = state;
  if (effect.resolution.kind === 'damage') {
    for (const targetId of targets) {
      const target = nextState.participants[targetId];
      if (!target) continue;
      const blocker = damageAutomationBlocker(target);
      if (blocker !== null) {
        log.push(
          entry(
            context,
            'table-directive',
            `${targetId} takes ${effect.resolution.amount}${effect.resolution.damageType ? ` ${effect.resolution.damageType}` : ''} damage — ${blocker}`,
            refs(effect),
            {
              unautomatedDamage: {
                targetId,
                amount: effect.resolution.amount,
                damageType: effect.resolution.damageType,
              },
            },
          ),
        );
        continue;
      }
      const outcome = applyDamage(
        target,
        { amount: effect.resolution.amount, type: effect.resolution.damageType },
        {
          knockOut: intent.payload.knockOut,
          reason: `damage from ${effect.effectArtifactId} Effect`,
        },
        context,
      );
      nextState = withParticipant(nextState, outcome.participant);
      log.push(
        ...outcome.log.map((item) => ({
          ...item,
          canonRefs: refs(effect, item.canonRefs),
        })),
      );
    }
    return { state: nextState, log };
  }

  for (const targetId of targets) {
    const target = nextState.participants[targetId];
    if (!target) continue;
    const applied = applyConditionInstance(
      nextState,
      {
        target,
        instance: {
          instanceId: `${effect.resolution.conditionId}#${intent.intentId}-${targetId}`,
          conditionId: effect.resolution.conditionId,
          ending: effect.resolution.ending,
          source: {
            participantId: intent.payload.actorParticipantId,
            effectArtifactId: effect.effectArtifactId,
          },
        },
        replacesOnNewSource: effect.resolution.replacesOnNewSource,
      },
      context,
    );
    nextState = applied.state;
    log.push(
      ...applied.log.map((item) => ({
        ...item,
        canonRefs: refs(effect, item.canonRefs),
      })),
    );
  }
  return { state: nextState, log };
}
