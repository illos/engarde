import type {
  Actor,
  ConditionInstance,
  EncounterState,
  LogEntry,
  ParticipantState,
} from './schemas.js';

/**
 * Condition lifecycle substrate — the SHARED apply/remove/expiry helpers
 * every condition-imposing mechanism reuses (the Glowing Eyes lesson: the
 * first implementer ships the substrate, not a copy-paste special case).
 *
 * Every helper returns {participant/state, log} and cites the canon artifact
 * its behavior traces to. No per-condition semantics live here: replacement
 * and non-stacking nuances arrive as caller-supplied data grounded in each
 * condition's verbatim text.
 */

/** Canon artifact ids this substrate's behavior traces to (pointers only). */
export const CANON = {
  conditionStacking: 'mcdm.heroes.v1/chapter/classes#condition-stacking',
  endingEffects: 'mcdm.heroes.v1/chapter/classes#ending-effects',
  creatureEndsAbilityEffect: 'mcdm.heroes.v1/chapter/classes#creature-ends-an-ability-effect',
  savingThrow: 'mcdm.heroes.v1/rule.general/saving-throw',
} as const;

/**
 * rule.general/saving-throw: "a creature rolls a d10. On a 6 or higher, the
 * effect ends." One home for the math; imported everywhere it's needed.
 */
export const SAVING_THROW = { die: 10, success: 6 } as const;

export interface LifecycleContext {
  intentId: string;
  actor: Actor;
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

function withParticipant(state: EncounterState, participant: ParticipantState): EncounterState {
  return {
    ...state,
    participants: { ...state.participants, [participant.id]: participant },
  };
}

export interface ApplyConditionArgs {
  target: ParticipantState;
  instance: ConditionInstance;
  /** From the condition's own text (frightened/taunted): new source replaces. */
  replacesOnNewSource: boolean;
}

export function applyConditionInstance(
  state: EncounterState,
  { target, instance, replacesOnNewSource }: ApplyConditionArgs,
  context: LifecycleContext,
): { state: EncounterState; log: LogEntry[] } {
  const log: LogEntry[] = [];
  let conditions = target.conditions;

  const existing = conditions.filter((candidate) => candidate.conditionId === instance.conditionId);
  const replaced = replacesOnNewSource
    ? existing.filter(
        (candidate) => candidate.source.participantId !== instance.source.participantId,
      )
    : [];
  if (replaced.length > 0) {
    conditions = conditions.filter((candidate) => !replaced.includes(candidate));
    log.push(
      entry(
        context,
        'mutation',
        `${instance.conditionId} from a new source replaces the prior instance on ${target.id}`,
        [instance.conditionId],
        { removedInstanceIds: replaced.map((candidate) => candidate.instanceId) },
      ),
    );
  } else if (existing.length > 0) {
    // classes#condition-stacking: the condition is not imposed twice — its
    // presence stays boolean — but each imposing effect keeps its own ending,
    // so the instance is still tracked.
    log.push(
      entry(
        context,
        'informational',
        `${target.id} already has ${instance.conditionId}; effects do not compound`,
        [CANON.conditionStacking],
        { existingInstanceIds: existing.map((candidate) => candidate.instanceId) },
      ),
    );
  }

  log.push(
    entry(
      context,
      'mutation',
      `${instance.conditionId} applied to ${target.id}`,
      [instance.conditionId],
      { instanceId: instance.instanceId, ending: instance.ending, source: instance.source },
    ),
  );
  return {
    state: withParticipant(state, { ...target, conditions: [...conditions, instance] }),
    log,
  };
}

export function removeConditionInstance(
  state: EncounterState,
  target: ParticipantState,
  instanceId: string,
  context: LifecycleContext,
  canonRefs: string[],
  message: string,
): { state: EncounterState; log: LogEntry[] } {
  const instance = target.conditions.find((candidate) => candidate.instanceId === instanceId);
  if (!instance) {
    return {
      state,
      log: [
        entry(context, 'refusal', `no condition instance ${instanceId} on ${target.id}`, [], {
          instanceId,
        }),
      ],
    };
  }
  const conditions = target.conditions.filter((candidate) => candidate.instanceId !== instanceId);
  return {
    state: withParticipant(state, { ...target, conditions }),
    log: [
      entry(context, 'mutation', message, [instance.conditionId, ...canonRefs], {
        instanceId,
        conditionId: instance.conditionId,
      }),
    ],
  };
}

/**
 * End-of-turn processing for one participant: saving throws for save-ends
 * instances (asserted roll wins; otherwise the injected source rolls), and
 * expiry of end-of-targets-next-turn instances.
 */
export function endOfTurnSweep(
  state: EncounterState,
  target: ParticipantState,
  rolls: Readonly<Record<string, number>>,
  rollSavingThrow: () => number,
  context: LifecycleContext,
): { state: EncounterState; log: LogEntry[] } {
  const log: LogEntry[] = [];
  const remaining: ConditionInstance[] = [];
  for (const instance of target.conditions) {
    if (instance.ending.kind === 'save-ends') {
      const roll = rolls[instance.instanceId] ?? rollSavingThrow();
      const asserted = rolls[instance.instanceId] !== undefined;
      if (roll >= SAVING_THROW.success) {
        log.push(
          entry(
            context,
            'mutation',
            `${target.id} saves against ${instance.conditionId} (rolled ${roll})`,
            [instance.conditionId, CANON.savingThrow],
            { instanceId: instance.instanceId, roll, asserted },
          ),
        );
      } else {
        log.push(
          entry(
            context,
            'informational',
            `${target.id} fails the saving throw against ${instance.conditionId} (rolled ${roll})`,
            [instance.conditionId, CANON.savingThrow],
            { instanceId: instance.instanceId, roll, asserted },
          ),
        );
        remaining.push(instance);
      }
      continue;
    }
    if (instance.ending.kind === 'end-of-targets-next-turn') {
      log.push(
        entry(
          context,
          'mutation',
          `${instance.conditionId} on ${target.id} ends at the end of their turn`,
          [instance.conditionId],
          { instanceId: instance.instanceId },
        ),
      );
      continue;
    }
    remaining.push(instance);
  }
  return { state: withParticipant(state, { ...target, conditions: remaining }), log };
}

/**
 * classes#ending-effects: conditions imposed during the encounter end when
 * it is over — ending is the default; keeping is the explicit, player-
 * asserted exception the caller passes in.
 */
export function endEncounterSweep(
  state: EncounterState,
  keepInstanceIds: readonly string[],
  context: LifecycleContext,
): { state: EncounterState; log: LogEntry[] } {
  const keep = new Set(keepInstanceIds);
  const log: LogEntry[] = [];
  let nextState = state;
  for (const participant of Object.values(state.participants)) {
    const ended = participant.conditions.filter((instance) => !keep.has(instance.instanceId));
    const kept = participant.conditions.filter((instance) => keep.has(instance.instanceId));
    if (ended.length > 0) {
      log.push(
        entry(
          context,
          'mutation',
          `conditions on ${participant.id} end with the encounter`,
          [CANON.endingEffects, ...new Set(ended.map((instance) => instance.conditionId))],
          { endedInstanceIds: ended.map((instance) => instance.instanceId) },
        ),
      );
    }
    if (kept.length > 0) {
      log.push(
        entry(
          context,
          'informational',
          `conditions kept past the encounter on ${participant.id} by explicit choice`,
          [CANON.endingEffects],
          { keptInstanceIds: kept.map((instance) => instance.instanceId) },
        ),
      );
    }
    nextState = withParticipant(nextState, { ...participant, conditions: kept });
  }
  return { state: nextState, log };
}
