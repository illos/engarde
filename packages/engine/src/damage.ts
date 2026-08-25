import { type LifecycleContext, applyConditionInstance } from './condition-lifecycle.js';
import {
  BLEEDING_CONDITION_ID,
  HEALTH_CANON,
  UNCONSCIOUS_CONDITION_ID,
  isDead,
  isDying,
  isWinded,
  recoveryValue,
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
    recoveries: stamina.recoveries,
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
      { schemaVersion: 4, participants: { [result.id]: result }, terrainFacts: [] },
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
        { schemaVersion: 4, participants: { [result.id]: result }, terrainFacts: [] },
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

/** Why a participant's Stamina regain cannot be automated, if it can't.
 * Minions additionally CAN'T regain by rule — "minions can't be winded,
 * can't regain Stamina, and can't gain temporary Stamina during a battle"
 * [monsters chapter/monster-basics §Shared Low Stamina, R-0019c] — but the
 * pool is also not mechanized, so both regain paths route to the table. */
export function regainAutomationBlocker(participant: ParticipantState): string | null {
  if (participant.stats === null || participant.stamina === null) {
    return 'no stats tracked for this participant — resolve at the table';
  }
  if (participant.stats.organization?.toLowerCase() === 'minion') {
    return 'minions cannot regain Stamina or gain temporary Stamina during a battle, and squad pools are not mechanized — resolve at the table';
  }
  return null;
}

/** Why a participant cannot be offered an automated Recovery spend, if they
 * can't. Director-controlled non-minions are NOT blocked — they convert to
 * the one-third-maximum regain [rule.health/stamina §No Recoveries,
 * R-0019b]. */
export function recoverySpendBlocker(participant: ParticipantState): string | null {
  const regainBlocker = regainAutomationBlocker(participant);
  if (regainBlocker !== null) return regainBlocker;
  if (participant.kind === 'hero' && participant.stats?.recoveriesMax == null) {
    return 'Recoveries are not tracked for this hero — resolve at the table';
  }
  return null;
}

/**
 * REGAINING STAMINA [R-0017]: signed addition clamped at Stamina maximum
 * ("Some effects can also reduce your Stamina maximum, limiting the amount
 * of Stamina you can regain" [rule.health/stamina] — the clamp and the
 * signed arithmetic are Gate-3 adjudications). Never touches temporary
 * Stamina ("Regaining Stamina can't restore temporary Stamina"
 * [rule.health/temporary-stamina]). Winded and dying end by definition —
 * informational transitions, no action [rule.health/winded,
 * rule.health/dying]; the dying-mandated bleeding instance is NOT
 * auto-removed — it becomes removable again (R-0004 gates on the derived
 * dying state).
 */
export function regainStamina(
  participant: ParticipantState,
  amount: number,
  options: { reason: string; canonRefs?: string[] },
  context: LifecycleContext,
): DamageOutcome {
  const stats = participant.stats;
  const stamina = participant.stamina;
  if (stats === null || stamina === null) throw new Error('regainStamina requires tracked stats');

  const clampedTo = Math.min(stamina.current + amount, stats.staminaMax);
  const regained = clampedTo - stamina.current;
  const nextStamina = { ...stamina, current: clampedTo };
  const next: ParticipantState = { ...participant, stamina: nextStamina };

  const log: LogEntry[] = [
    entry(
      context,
      'mutation',
      `${participant.id} regains ${regained} Stamina (${options.reason})`,
      options.canonRefs ?? [HEALTH_CANON.stamina],
      {
        requestedAmount: amount,
        regained,
        clampedAtMax: regained < amount,
        staminaDeltas: [
          {
            participantId: participant.id,
            from: stamina.current,
            to: clampedTo,
            temporaryFrom: stamina.temporary,
            temporaryTo: stamina.temporary,
          },
        ],
      },
    ),
  ];

  if (isDying(stamina.current) && !isDying(clampedTo)) {
    log.push(
      entry(
        context,
        'informational',
        `${participant.id} is no longer dying`,
        [HEALTH_CANON.dying],
        {},
      ),
    );
  }
  if (isWinded(stamina.current, stats.staminaMax) && !isWinded(clampedTo, stats.staminaMax)) {
    log.push(
      entry(
        context,
        'informational',
        `${participant.id} is no longer winded`,
        [HEALTH_CANON.winded],
        {},
      ),
    );
  }

  return { participant: next, log };
}

/**
 * GAINING TEMPORARY STAMINA [R-0021]: the pool becomes whichever amount is
 * greater — what remains or what is granted — never the sum; no cap; the
 * end-encounter sweep clears it ("Unless otherwise indicated, temporary
 * Stamina disappears at the end of an encounter")
 * [rule.health/temporary-stamina].
 */
export function gainTemporaryStamina(
  participant: ParticipantState,
  amount: number,
  options: { reason: string },
  context: LifecycleContext,
): DamageOutcome {
  const stamina = participant.stamina;
  if (participant.stats === null || stamina === null) {
    throw new Error('gainTemporaryStamina requires tracked stats');
  }

  const nextTemporary = Math.max(stamina.temporary, amount);
  const next: ParticipantState = {
    ...participant,
    stamina: { ...stamina, temporary: nextTemporary },
  };
  const log: LogEntry[] = [
    entry(
      context,
      'mutation',
      `${participant.id} gains ${amount} temporary Stamina (${options.reason})${
        nextTemporary === stamina.temporary && stamina.temporary >= amount
          ? ' — existing pool is greater, no change'
          : ''
      }`,
      [HEALTH_CANON.temporaryStamina],
      {
        grantedAmount: amount,
        maxNotSum: true,
        staminaDeltas: [
          {
            participantId: participant.id,
            from: stamina.current,
            to: stamina.current,
            temporaryFrom: stamina.temporary,
            temporaryTo: nextTemporary,
          },
        ],
      },
    ),
  ];
  return { participant: next, log };
}

/**
 * SPENDING A RECOVERY via an ability-granted offer [R-0018, R-0019]:
 * - hero — Recoveries −1, regain recoveryValue(staminaMax); 0 Recoveries
 *   refuses (there is no pool to draw from — R-0019a);
 * - Director-controlled non-minion — regains floor(staminaMax / 3), nothing
 *   decrements, no repetition limit [rule.health/stamina §No Recoveries].
 * The spend costs the recipient nothing from their action economy
 * [rule.health/recoveries §Spending Recoveries]; dying heroes may accept
 * ("your allies can help you spend Recoveries in combat"
 * [rule.health/dying]). Callers consult recoverySpendBlocker first.
 */
export function spendRecovery(
  participant: ParticipantState,
  options: { reason: string },
  context: LifecycleContext,
): DamageOutcome {
  const stats = participant.stats;
  const stamina = participant.stamina;
  if (stats === null || stamina === null) throw new Error('spendRecovery requires tracked stats');

  if (participant.kind !== 'hero') {
    return regainStamina(
      participant,
      recoveryValue(stats.staminaMax),
      {
        reason: `${options.reason} — Director-creature conversion, one-third Stamina maximum`,
        canonRefs: [HEALTH_CANON.noRecoveries, HEALTH_CANON.stamina],
      },
      context,
    );
  }

  if (stats.recoveriesMax === null || stamina.recoveries === null) {
    throw new Error('spendRecovery requires tracked Recoveries for a hero');
  }
  if (stamina.recoveries === 0) {
    return {
      participant,
      log: [
        entry(
          context,
          'refusal',
          `${participant.id} has no Recoveries left and cannot spend one`,
          [HEALTH_CANON.recoveries],
          { recoveries: 0, recoveriesMax: stats.recoveriesMax, ruling: 'R-0019' },
        ),
      ],
    };
  }

  const decremented: ParticipantState = {
    ...participant,
    stamina: { ...stamina, recoveries: stamina.recoveries - 1 },
  };
  const spendEntry = entry(
    context,
    'mutation',
    `${participant.id} spends a Recovery (${options.reason})`,
    [HEALTH_CANON.recoveries],
    {
      recoveriesDeltas: [
        {
          participantId: participant.id,
          from: stamina.recoveries,
          to: stamina.recoveries - 1,
        },
      ],
    },
  );
  const outcome = regainStamina(
    decremented,
    recoveryValue(stats.staminaMax),
    { reason: 'Recovery: one-third Stamina maximum, rounded down' },
    context,
  );
  return { participant: outcome.participant, log: [spendEntry, ...outcome.log] };
}

/** Helper for reducers: swap one participant into the state. */
export function withParticipant(
  state: EncounterState,
  participant: ParticipantState,
): EncounterState {
  return { ...state, participants: { ...state.participants, [participant.id]: participant } };
}
