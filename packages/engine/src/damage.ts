import { type LifecycleContext, applyConditionInstance } from './condition-lifecycle.js';
import {
  BLEEDING_CONDITION_ID,
  HEALTH_CANON,
  UNCONSCIOUS_CONDITION_ID,
  isDead,
  isDying,
  isWinded,
} from './health.js';
import type { DamageType, EncounterState, LogEntry, ParticipantState } from './schemas.js';

/**
 * Damage / Stamina core — the ONE home for the damage pipeline and the
 * Stamina threshold ledger (docs/power-roll-design.md §5).
 *
 * Two entry points over one shared threshold step:
 * - `applyDamage` — anything canon phrases as TAKING DAMAGE: weakness first,
 *   immunity last, temporary Stamina absorbs, remainder to current
 *   [rule.damage/damage-weakness, rule.damage/damage-immunity,
 *   rule.health/temporary-stamina, rule.health/stamina].
 * - `loseStamina` — effects canon phrases as LOSING STAMINA (e.g. bleeding's
 *   "they lose Stamina equal to 1d6 + their level"): a direct reduction that
 *   never touches immunities (design SE-1).
 *
 * Both log a machine-readable `staminaDeltas` claim (the invariant suite
 * reconciles every Stamina change against these) and run the same threshold
 * consequences: winded transitions, dying (hero → mandated bleeding
 * instance), death, knock-out unconscious, death-on-damage-while-unconscious.
 */

export interface DamageInput {
  amount: number;
  /** null = untyped damage [rule.damage/damage-type]. */
  type: DamageType | null;
}

export interface DamageOptions {
  /** rule.health/stamina §Knocking Creatures Out — the damager's choice. */
  knockOut: boolean;
  /** Human-facing attribution for the log line. */
  reason: string;
}

export interface DamageOutcome {
  participant: ParticipantState;
  log: LogEntry[];
}

/** Why a participant's Stamina cannot be automated, if it can't. */
export function damageAutomationBlocker(participant: ParticipantState): string | null {
  if (participant.stats === null || participant.stamina === null) {
    return 'no stats tracked for this participant — resolve at the table';
  }
  if (participant.stats.organization?.toLowerCase() === 'minion') {
    // Minion squads share a Stamina pool with their own drop accounting;
    // treating one as an individual would be a silent canon divergence
    // [monsters chapter/monster-basics §Minions and Stamina].
    return 'minion squads share a Stamina pool the engine does not yet mechanize — resolve at the table';
  }
  return null;
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

interface PipelineBreakdown {
  inputAmount: number;
  type: DamageType | null;
  weaknessApplied: { appliesTo: string; value: number } | null;
  afterWeakness: number;
  immunityApplied: { appliesTo: string; value: number | 'all' } | null;
  afterImmunity: number;
}

/** Weakness first, immunity last, highest applicable of each only
 * [rule.damage/damage-weakness, rule.damage/damage-immunity]. */
function runDamagePipeline(
  stats: NonNullable<ParticipantState['stats']>,
  input: DamageInput,
): PipelineBreakdown {
  const applicable = <T extends { appliesTo: 'any' | DamageType }>(rows: readonly T[]): T[] =>
    rows.filter(
      (row) => row.appliesTo === 'any' || (input.type !== null && row.appliesTo === input.type),
    );

  const weaknesses = applicable(stats.weaknesses);
  const weaknessApplied =
    weaknesses.length > 0
      ? weaknesses.reduce((best, row) => (row.value > best.value ? row : best))
      : null;
  const afterWeakness = input.amount + (weaknessApplied?.value ?? 0);

  const immunities = applicable(stats.immunities);
  const immunityApplied =
    immunities.length > 0
      ? immunities.reduce((best, row) => {
          if (best.value === 'all') return best;
          if (row.value === 'all') return row;
          return row.value > best.value ? row : best;
        })
      : null;
  const afterImmunity =
    immunityApplied === null
      ? afterWeakness
      : immunityApplied.value === 'all'
        ? 0
        : Math.max(0, afterWeakness - immunityApplied.value);

  return {
    inputAmount: input.amount,
    type: input.type,
    weaknessApplied,
    afterWeakness,
    immunityApplied,
    afterImmunity,
  };
}

/** The shared reduction + threshold step both entry points funnel into. */
function reduceStamina(
  participant: ParticipantState,
  finalAmount: number,
  breakdown: Record<string, unknown>,
  canonRefs: string[],
  options: DamageOptions,
  context: LifecycleContext,
): DamageOutcome {
  const stats = participant.stats;
  const stamina = participant.stamina;
  if (stats === null || stamina === null) throw new Error('reduceStamina requires tracked stats');

  const log: LogEntry[] = [];
  const wasUnconscious = participant.conditions.some(
    (instance) => instance.conditionId === UNCONSCIOUS_CONDITION_ID,
  );

  // Temporary Stamina decreases first [rule.health/temporary-stamina].
  const absorbedByTemporary = Math.min(stamina.temporary, finalAmount);
  const appliedToCurrent = finalAmount - absorbedByTemporary;
  const nextStamina = {
    current: stamina.current - appliedToCurrent,
    temporary: stamina.temporary - absorbedByTemporary,
  };
  const next: ParticipantState = { ...participant, stamina: nextStamina };

  log.push(
    entry(
      context,
      'mutation',
      `${participant.id} takes ${finalAmount} ${options.reason}`,
      canonRefs,
      {
        ...breakdown,
        absorbedByTemporary,
        appliedToCurrent,
        staminaDeltas: [
          {
            participantId: participant.id,
            from: stamina.current,
            to: nextStamina.current,
            temporaryFrom: stamina.temporary,
            temporaryTo: nextStamina.temporary,
          },
        ],
      },
    ),
  );

  // "If a creature takes damage while unconscious in this way, they die"
  // [rule.health/stamina §Knocking Creatures Out]. The instance is removed so
  // death derives (health.ts isDead consults it).
  if (wasUnconscious && finalAmount > 0) {
    const instance = next.conditions.find(
      (candidate) => candidate.conditionId === UNCONSCIOUS_CONDITION_ID,
    );
    if (instance) {
      const conditions = next.conditions.filter((candidate) => candidate !== instance);
      log.push(
        entry(
          context,
          'mutation',
          `${participant.id} takes damage while unconscious from a knock-out and dies`,
          [HEALTH_CANON.knockOut],
          { removedInstanceIds: [instance.instanceId], conditionId: instance.conditionId },
        ),
      );
      return { participant: { ...next, conditions }, log };
    }
  }

  const before = participant;
  let result = next;

  // Winded transitions are public, effect-free state [rule.health/winded].
  const windedBefore = isWinded(stamina.current, stats.staminaMax);
  const windedNow = isWinded(nextStamina.current, stats.staminaMax);
  if (!windedBefore && windedNow) {
    log.push(
      entry(context, 'informational', `${participant.id} is winded`, [HEALTH_CANON.winded], {}),
    );
  }

  // Crossing into dying: heroes gain the mandated, dying-sourced bleeding
  // instance [rule.health/dying].
  const dyingBefore = isDying(stamina.current);
  const dyingNow = isDying(nextStamina.current);
  if (participant.kind === 'hero' && !dyingBefore && dyingNow) {
    log.push(
      entry(context, 'informational', `${participant.id} is dying`, [HEALTH_CANON.dying], {}),
    );
    const applied = applyConditionInstance(
      { schemaVersion: 2, participants: { [result.id]: result } },
      {
        target: result,
        instance: {
          instanceId: `${BLEEDING_CONDITION_ID}#${context.intentId}-dying-${result.id}`,
          conditionId: BLEEDING_CONDITION_ID,
          ending: { kind: 'external' },
          source: { effectArtifactId: HEALTH_CANON.dying },
        },
        replacesOnNewSource: false,
      },
      context,
    );
    result = applied.state.participants[result.id] ?? result;
    log.push(...applied.log);
  }

  // Death / knock-out at the thresholds [rule.health/dying,
  // rule.health/stamina §Director-Controlled Creatures + §Knocking Creatures Out].
  const deadBefore = isDead(before);
  const wouldBeDead = isDead(result);
  if (!deadBefore && wouldBeDead) {
    if (options.knockOut) {
      const applied = applyConditionInstance(
        { schemaVersion: 2, participants: { [result.id]: result } },
        {
          target: result,
          instance: {
            instanceId: `${UNCONSCIOUS_CONDITION_ID}#${context.intentId}-${result.id}`,
            conditionId: UNCONSCIOUS_CONDITION_ID,
            ending: { kind: 'external' },
            source: { effectArtifactId: HEALTH_CANON.knockOut },
          },
          replacesOnNewSource: false,
        },
        context,
      );
      result = applied.state.participants[result.id] ?? result;
      log.push(...applied.log);
      log.push(
        entry(
          context,
          'informational',
          `${participant.id} is knocked unconscious instead of dying`,
          [HEALTH_CANON.knockOut],
          {},
        ),
      );
    } else {
      log.push(
        entry(
          context,
          'informational',
          `${participant.id} dies`,
          [participant.kind === 'hero' ? HEALTH_CANON.dying : HEALTH_CANON.stamina],
          {},
        ),
      );
    }
  }

  return { participant: result, log };
}

/** TAKING DAMAGE: the full pipeline, then the shared threshold step. */
export function applyDamage(
  participant: ParticipantState,
  input: DamageInput,
  options: DamageOptions,
  context: LifecycleContext,
): DamageOutcome {
  const stats = participant.stats;
  if (stats === null) throw new Error('applyDamage requires tracked stats');
  const breakdown = runDamagePipeline(stats, input);
  return reduceStamina(
    participant,
    breakdown.afterImmunity,
    { pipeline: breakdown },
    [
      HEALTH_CANON.damage,
      HEALTH_CANON.stamina,
      ...(breakdown.weaknessApplied ? [HEALTH_CANON.damageWeakness] : []),
      ...(breakdown.immunityApplied ? [HEALTH_CANON.damageImmunity] : []),
    ],
    options,
    context,
  );
}

/** LOSING STAMINA: direct reduction — no weakness/immunity interaction. */
export function loseStamina(
  participant: ParticipantState,
  amount: number,
  options: DamageOptions,
  context: LifecycleContext,
): DamageOutcome {
  if (participant.stats === null) throw new Error('loseStamina requires tracked stats');
  return reduceStamina(
    participant,
    amount,
    { staminaLoss: amount },
    [HEALTH_CANON.stamina],
    options,
    context,
  );
}

/** Helper for reducers: swap one participant into the state. */
export function withParticipant(
  state: EncounterState,
  participant: ParticipantState,
): EncounterState {
  return { ...state, participants: { ...state.participants, [participant.id]: participant } };
}
