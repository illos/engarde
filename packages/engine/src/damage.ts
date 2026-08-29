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
import type {
  DamageType,
  EncounterState,
  LogEntry,
  ParticipantState,
  ParticipantStats,
  SquadState,
} from './schemas.js';

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

/**
 * Where a Stamina change came from, recorded on every claim so occurrence
 * derivation never has to guess [R-0040]. `rolled` is a PRINTED trigger
 * sub-class, not bookkeeping: "If an ability or effect deals damage
 * without requiring a power roll, that is not rolled damage, and effects
 * that add to or are triggered by rolled damage don't apply" [Heroes p.74
 * §Rolled Damage]. It is required, never defaulted, so a new damage path
 * has to state its provenance rather than inherit a wrong one silently.
 */
export interface DamageProvenance {
  /** True only when the damage came from a power roll [Heroes p.74]. A
   * test is a power roll ("A test is any power roll that has failure or
   * consequences as an option" — chapter/tests, R-0006), so test damage
   * is rolled damage. */
  rolled: boolean;
  /** The creature that dealt it, when the engine knows one. */
  sourceId: string | null;
  /** The resolution this change belongs to, when there is one. */
  resolutionId: string | null;
}

export interface DamageOptions {
  /** rule.health/stamina §Knocking Creatures Out — the damager's choice. */
  knockOut: boolean;
  /** Human-facing attribution for the log line. */
  reason: string;
  /** R-0040 — required; see DamageProvenance. */
  provenance: DamageProvenance;
}

export interface DamageOutcome {
  participant: ParticipantState;
  log: LogEntry[];
}

/** Canon artifact ids the minion squad pool mechanism traces to
 * (R-0023..R-0028, docs/minion-pool-design.md). */
export const MINION_CANON = {
  minion: 'mcdm.monsters.v1/rule.organization/minion',
  squad: 'mcdm.monsters.v1/rule.monster/squad',
  captain: 'mcdm.monsters.v1/rule.monster/captain',
  sharedPool: 'mcdm.monsters.v1/chapter/monster-basics#shared-low-stamina',
  droppingOne: 'mcdm.monsters.v1/chapter/monster-basics#dropping-one-minion',
  droppingMultiple: 'mcdm.monsters.v1/chapter/monster-basics#dropping-multiple-minions',
  areaEffects: 'mcdm.monsters.v1/chapter/monster-basics#minions-and-area-effects',
  weaknessImmunity: 'mcdm.monsters.v1/chapter/monster-basics#minion-weakness-and-immunity',
} as const;

/** The ONE home for the Minion stat-block-organization predicate
 * [monsters chapter/monster-basics §Using Minions]. Case-insensitive over the
 * stored organization string; a participant without tracked stats is not a
 * minion. Structurally typed over the stats slot so every host of the
 * predicate — participant state, the driver's seed gate, view builders —
 * calls this one home instead of re-deriving inline. */
export function isMinion(participant: { stats?: ParticipantStats | null }): boolean {
  return participant.stats?.organization?.toLowerCase() === 'minion';
}

/** The LIVING-membership lookup: the seeded squad whose `memberIds` carry
 * this participant, if any. Dead members and never-seeded minions fall
 * through to `damageAutomationBlocker`'s table routing. */
export function squadOf(state: EncounterState, participantId: string): SquadState | undefined {
  return state.squads.find((squad) => squad.memberIds.includes(participantId));
}

/** Any member's stats carry the squad's statblock (same-statblock membership
 * is a seed-time refusal, R-0023) — the squad-level weakness/immunity rows
 * live here [R-0026]. */
export function squadMemberStats(
  state: EncounterState,
  squad: SquadState,
): ParticipantStats | null {
  for (const memberId of [...squad.memberIds, ...squad.deadMemberIds]) {
    const stats = state.participants[memberId]?.stats;
    if (stats) return stats;
  }
  return null;
}

/** Why a participant's Stamina cannot be automated, if it can't. Callers on
 * the damage path consult `squadOf` FIRST — a living squad member routes to
 * the pool [R-0024], never here. */
export function damageAutomationBlocker(participant: ParticipantState): string | null {
  if (participant.stats === null || (participant.stamina === null && !isMinion(participant))) {
    return 'no stats tracked for this participant — resolve at the table';
  }
  if (isMinion(participant)) {
    // Squad seeding is the automation boundary [R-0023]: pool math automates
    // only for minions the Director seeded into a squad; treating a minion
    // as an individual would be a silent canon divergence
    // [monsters chapter/monster-basics §Shared Low Stamina].
    return participant.stamina === null
      ? 'this minion is no longer a living member of a seeded squad — resolve at the table'
      : 'this minion is not seeded into a squad — squad Stamina pools automate only through seeding; resolve at the table';
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
  /** R-0040: "loses Stamina" and "takes damage" are DISTINCT triggers.
   * The entry point decides which; the claim carries it so no downstream
   * reader has to re-infer it from sibling keys. */
  event: { kind: 'damage' | 'loss'; damageType: DamageType | null },
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
        staminaEvent: {
          participantId: participant.id,
          kind: event.kind,
          amount: finalAmount,
          damageType: event.damageType,
          rolled: event.kind === 'damage' ? options.provenance.rolled : false,
          sourceId: options.provenance.sourceId,
          resolutionId: options.provenance.resolutionId,
          from: stamina.current,
          to: nextStamina.current,
          max: stats.staminaMax,
        },
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
          {
            removedInstanceIds: [instance.instanceId],
            conditionId: instance.conditionId,
            healthTransitions: [{ participantId: participant.id, kind: 'died' }],
          },
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
      entry(context, 'informational', `${participant.id} is winded`, [HEALTH_CANON.winded], {
        healthTransitions: [{ participantId: participant.id, kind: 'winded' }],
      }),
    );
  }

  // Crossing into dying: heroes gain the mandated, dying-sourced bleeding
  // instance [rule.health/dying].
  const dyingBefore = isDying(stamina.current);
  const dyingNow = isDying(nextStamina.current);
  if (participant.kind === 'hero' && !dyingBefore && dyingNow) {
    log.push(
      entry(context, 'informational', `${participant.id} is dying`, [HEALTH_CANON.dying], {
        healthTransitions: [{ participantId: participant.id, kind: 'dying' }],
      }),
    );
    const applied = applyConditionInstance(
      {
        schemaVersion: 8,
        participants: { [result.id]: result },
        terrainFacts: [],
        squads: [],
        turnState: null,
        villainActions: { usedThisRound: false, usedByAbility: [] },
        resolutionStack: [],
        occurrences: [],
      },
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
        {
          schemaVersion: 8,
          participants: { [result.id]: result },
          terrainFacts: [],
          squads: [],
          turnState: null,
          villainActions: { usedThisRound: false, usedByAbility: [] },
          resolutionStack: [],
          occurrences: [],
        },
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
          { healthTransitions: [{ participantId: participant.id, kind: 'knocked-out' }] },
        ),
      );
    } else {
      log.push(
        entry(
          context,
          'informational',
          `${participant.id} dies`,
          [participant.kind === 'hero' ? HEALTH_CANON.dying : HEALTH_CANON.stamina],
          { healthTransitions: [{ participantId: participant.id, kind: 'died' }] },
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
    { kind: 'damage', damageType: input.type },
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
    { kind: 'loss', damageType: null },
  );
}

/** One bound target's share of a damage instance against a squad — the
 * post-individual-modifier damage dealt to that member. */
export interface SquadDamageContribution {
  targetId: string;
  damage: number;
}

export interface SquadDamageOptions {
  /** Area source — Area-keyword ability or dispatch-asserted area flag (the
   * printed discriminator, R-0025): each contribution feeds the pool at
   * most the per-minion Stamina. */
  area: boolean;
  /** null = untyped [rule.damage/damage-type]. */
  type: DamageType | null;
  /** Damager-named extra victims beyond the damaged targets [R-0024]. */
  namedVictims?: readonly string[];
  /** Human-facing attribution for the log line. */
  reason: string;
  /** R-0040 — required; see DamageProvenance. Minions are corpus-real
   * reaction triggers ("Trigger: An ally deals damage to the target" —
   * Radenwight Ready Rodent, R-0037), so pool damage produces occurrences
   * on exactly the same claim shape as participant damage. */
  provenance: DamageProvenance;
}

export interface SquadDamageOutcome {
  squad: SquadState;
  log: LogEntry[];
}

/**
 * The ONE home for squad-pool damage (R-0024..R-0027) — the squad analog of
 * `applyDamage`. Pipeline order is ruled, not incidental:
 *
 * 1. Per contribution: an area source caps each bound minion's feed at
 *    min(damage, perMinionStamina) [R-0025, the printed 15-not-18
 *    Incinerate example]; any other source feeds the full damage [R-0024].
 * 2. Sum the (capped) contributions.
 * 3. Apply the squad's damage weakness/immunity ONCE to the sum, as the
 *    LAST step — reusing the individual pipeline's semantics (weakness
 *    first, immunity last, highest applicable of each) [R-0026, "the last
 *    things applied"]. The adjustment MAY push kills beyond the bound
 *    count, even for area damage ("can drop (or save!) multiple minions
 *    from any source of damage, including area effects").
 * 4. Decrement the pool by the final sum, flooring at 0; the receipt
 *    records the full pre-floor reduction and the discarded excess
 *    [R-0024 "Yes, then discard"] — carryover between kill thresholds
 *    otherwise stays in the pool (nothing rounds away).
 * 5. Kill accounting: kills this instance =
 *    floor((max − newPool)/perMinion) − floor((max − oldPool)/perMinion).
 *    The bound damaged targets die first (dispatch order — the damager's
 *    printed choice rides target order), then named victims, then the
 *    remainder becomes pendingKills with a table directive ("the minions
 *    nearest to those taken out suffer the same fate"). Every death counts
 *    as being reduced to 0 Stamina for triggering effects [R-0027].
 */
export function applySquadDamage(
  squad: SquadState,
  stats: ParticipantStats,
  contributions: readonly SquadDamageContribution[],
  options: SquadDamageOptions,
  context: LifecycleContext,
): SquadDamageOutcome {
  const per = squad.perMinionStamina;
  const capped = contributions.map((contribution) => ({
    targetId: contribution.targetId,
    damage: contribution.damage,
    // R-0025: "such area effects can kill only those minions who are in the
    // area" — structural via the per-contribution cap.
    counted: options.area ? Math.min(contribution.damage, per) : contribution.damage,
  }));
  const cappedSum = capped.reduce((sum, contribution) => sum + contribution.counted, 0);
  // R-0026: one squad-level weakness/immunity step on the sum, last.
  const breakdown = runDamagePipeline(stats, { amount: cappedSum, type: options.type });
  const finalSum = breakdown.afterImmunity;

  const oldPool = squad.pool.current;
  const preFloor = oldPool - finalSum;
  const newPool = Math.max(0, preFloor);
  const discarded = newPool - preFloor;
  const kills =
    Math.floor((squad.pool.max - newPool) / per) - Math.floor((squad.pool.max - oldPool) / per);

  const log: LogEntry[] = [
    entry(
      context,
      'mutation',
      `${squad.name} takes ${finalSum} pool damage ${options.reason}${
        discarded > 0 ? ` (${discarded} past the last pool point is discarded)` : ''
      }`,
      [
        MINION_CANON.sharedPool,
        ...(options.area ? [MINION_CANON.areaEffects] : []),
        ...(breakdown.weaknessApplied || breakdown.immunityApplied
          ? [MINION_CANON.weaknessImmunity]
          : []),
        ...(breakdown.weaknessApplied ? [HEALTH_CANON.damageWeakness] : []),
        ...(breakdown.immunityApplied ? [HEALTH_CANON.damageImmunity] : []),
      ],
      {
        squadDamage: {
          squadId: squad.squadId,
          area: options.area,
          damageType: options.type,
          contributions: capped,
          cappedSum,
          weaknessApplied: breakdown.weaknessApplied,
          immunityApplied: breakdown.immunityApplied,
          /** The full damage, pre-floor — R-0024's receipt requirement. */
          fullPoolReduction: finalSum,
          overflowDiscarded: discarded,
          kills,
        },
        squadPoolDeltas: [{ squadId: squad.squadId, from: oldPool, to: newPool }],
        // The SAME claim shape participant damage emits, so occurrence
        // derivation has one path, not two [R-0040]. `participantId`
        // carries the SQUAD id here — the identical widening the
        // resolution entry's `actorId` and `turnState.activeTurnId`
        // already use for squad-owned acts [R-0033].
        staminaEvent: {
          participantId: squad.squadId,
          kind: 'damage' as const,
          amount: finalSum,
          damageType: options.type,
          rolled: options.provenance.rolled,
          sourceId: options.provenance.sourceId,
          resolutionId: options.provenance.resolutionId,
          from: oldPool,
          to: newPool,
          max: squad.pool.max,
        },
      },
    ),
  ];

  // ── kill accounting [R-0024/R-0027] ─────────────────────────────────────
  const memberIds = [...squad.memberIds];
  const deadMemberIds = [...squad.deadMemberIds];
  const assigned: string[] = [];
  let remaining = kills;
  const die = (memberId: string, how: string): void => {
    const index = memberIds.indexOf(memberId);
    if (index === -1) return;
    memberIds.splice(index, 1);
    deadMemberIds.push(memberId);
    assigned.push(memberId);
    remaining -= 1;
    log.push(
      entry(
        context,
        'mutation',
        `${memberId} dies (${how}) — a minion taken out of the fight counts as being reduced to 0 Stamina for triggering effects`,
        [MINION_CANON.droppingOne],
        {
          squadDeaths: [{ squadId: squad.squadId, memberId }],
          zeroStaminaTrigger: {
            participantId: memberId,
            squadId: squad.squadId,
            ruling: 'R-0027',
          },
        },
      ),
    );
  };
  // "the minion who took the damage that reduced the pool dies" first.
  for (const contribution of capped) {
    if (remaining <= 0) break;
    if (assigned.includes(contribution.targetId)) continue;
    die(contribution.targetId, 'took the damage that reduced the pool');
  }
  // Then the damager's named victims [R-0024].
  for (const victimId of options.namedVictims ?? []) {
    if (remaining <= 0) {
      log.push(
        entry(
          context,
          'warning',
          `${victimId} was named as a victim but this instance counts no further kill — not applied`,
          [MINION_CANON.droppingOne],
          { ignoredNamedVictim: { squadId: squad.squadId, victimId } },
        ),
      );
      continue;
    }
    if (!memberIds.includes(victimId)) {
      log.push(
        entry(
          context,
          'warning',
          `${victimId} is not a living member of ${squad.name} — named victim skipped`,
          [MINION_CANON.droppingOne],
          { ignoredNamedVictim: { squadId: squad.squadId, victimId } },
        ),
      );
      continue;
    }
    die(victimId, 'named by the damager');
  }
  // The unnamed remainder is a pending-identity kill: "the minions nearest
  // to those taken out suffer the same fate" is spatial, so the table names
  // them via resolve-pending-kills [R-0024].
  let pendingKills = squad.pendingKills;
  if (remaining > 0) {
    log.push(
      entry(
        context,
        'mutation',
        `${remaining} further kill(s) counted by the pool await victim identity — the taken-out minions count as being reduced to 0 Stamina for triggering effects NOW; only their identity is pending`,
        [MINION_CANON.droppingMultiple, MINION_CANON.droppingOne],
        {
          pendingKillsDeltas: [
            { squadId: squad.squadId, from: pendingKills, to: pendingKills + remaining },
          ],
          // "When a minion is taken out of the fight, they count as being
          // reduced to 0 Stamina for triggering effects" — the taking-out
          // happens when the pool COUNTS the kill, so the trigger receipt
          // fires here, anonymously; resolve-pending-kills assigns identity
          // only, never a second trigger [R-0027].
          zeroStaminaTrigger: {
            pending: true,
            count: remaining,
            squadId: squad.squadId,
            ruling: 'R-0027',
          },
        },
      ),
    );
    log.push(
      entry(
        context,
        'table-directive',
        `name ${remaining} more victim(s) in ${squad.name} — "the minions nearest to those taken out suffer the same fate" — then dispatch resolve-pending-kills`,
        [MINION_CANON.droppingMultiple],
        { pendingKillIdentity: { squadId: squad.squadId, count: remaining } },
      ),
    );
    pendingKills += remaining;
  }
  if (newPool === 0 && oldPool > 0) {
    log.push(
      entry(
        context,
        'informational',
        `${squad.name}'s Stamina pool is exhausted`,
        [MINION_CANON.sharedPool],
        {},
      ),
    );
  }

  return {
    squad: {
      ...squad,
      pool: { ...squad.pool, current: newPool },
      memberIds,
      deadMemberIds,
      pendingKills,
    },
    log,
  };
}

/** Helper for reducers: swap one squad into the state. */
export function withSquad(state: EncounterState, squad: SquadState): EncounterState {
  return {
    ...state,
    squads: state.squads.map((candidate) =>
      candidate.squadId === squad.squadId ? squad : candidate,
    ),
  };
}

/** One collected (not yet applied) squad contribution on a dispatch path. */
export interface PendingSquadContribution {
  targetId: string;
  damage: number;
  type: DamageType | null;
}

/**
 * The ONE home for the dispatch-path collection step: a target that is a
 * living squad member routes its damage contribution into the pending map
 * (keyed by squadId; map insertion order — first contributing member —
 * fixes squad order for `flushSquadContributions`). Returns the squad when
 * the contribution was collected, or `undefined` when the target is not a
 * living member of a seeded squad and resolves individually.
 */
export function collectSquadContribution(
  state: EncounterState,
  target: ParticipantState,
  contribution: PendingSquadContribution,
  pending: Map<string, PendingSquadContribution[]>,
): SquadState | undefined {
  const squad = isMinion(target) ? squadOf(state, contribution.targetId) : undefined;
  if (!squad) return undefined;
  const list = pending.get(squad.squadId) ?? [];
  list.push(contribution);
  pending.set(squad.squadId, list);
  return squad;
}

/**
 * Shared dispatch-path flush: every executor that damages participants
 * collects same-squad contributions into ONE map and flushes them through a
 * single `applySquadDamage` call per squad — required by R-0026's
 * once-per-squad weakness/immunity step. Insertion order of the map (first
 * bound member) fixes squad order; contribution order is dispatch order.
 */
export function flushSquadContributions(
  state: EncounterState,
  pending: ReadonlyMap<string, PendingSquadContribution[]>,
  options: {
    area: boolean;
    namedVictims?: readonly string[];
    reason: string;
    /** R-0040 — required; see DamageProvenance. */
    provenance: DamageProvenance;
  },
  context: LifecycleContext,
): { state: EncounterState; log: LogEntry[] } {
  let nextState = state;
  const log: LogEntry[] = [];
  for (const [squadId, contributions] of pending) {
    const squad = nextState.squads.find((candidate) => candidate.squadId === squadId);
    if (!squad || contributions.length === 0) continue;
    const stats = squadMemberStats(nextState, squad);
    if (!stats) continue; // membership reconciliation is an invariant; unreachable on seeded state
    const types = new Set(contributions.map((contribution) => contribution.type));
    const type = types.size === 1 ? (contributions[0]?.type ?? null) : null;
    if (types.size > 1) {
      log.push(
        entry(
          context,
          'warning',
          `one damage instance against ${squad.name} mixes damage types — the once-per-squad weakness/immunity step [R-0026] applies as untyped`,
          [MINION_CANON.weaknessImmunity],
          { mixedTypes: [...types].map((item) => item ?? 'untyped') },
        ),
      );
    }
    const outcome = applySquadDamage(
      squad,
      stats,
      contributions.map(({ targetId, damage }) => ({ targetId, damage })),
      {
        area: options.area,
        type,
        namedVictims: options.namedVictims,
        reason: options.reason,
        provenance: options.provenance,
      },
      context,
    );
    nextState = withSquad(nextState, outcome.squad);
    log.push(...outcome.log);
  }
  return { state: nextState, log };
}

/** How a minion's Stamina-gain binding routes [R-0027]. */
export type MinionRegainRouting =
  | { kind: 'refusal'; message: string }
  | { kind: 'table-directive'; message: string };

/**
 * The R-0027 routing for a minion bound to regain Stamina, gain temporary
 * Stamina, or spend a Recovery. The printed rule: "Because minion Stamina
 * is tracked as a pool, minions can't be winded, can't regain Stamina, and
 * can't gain temporary Stamina during a battle" [chapter/monster-basics
 * §Shared Low Stamina].
 * - A LIVING SQUAD MEMBER gets the rule-mandated REFUSAL (not
 *   warn-and-apply): no individual Stamina exists to receive the change —
 *   canon-incoherent over-state. PER-BINDING: sibling targets of the same
 *   effect still resolve.
 * - A minion who is NOT a living member of a seeded squad (never seeded, or
 *   already dead) routes to the TABLE instead: the printed rule still
 *   applies, but their Stamina is not pooled, so the refusal's incoherence
 *   rationale does not hold — the Director adjudicates.
 * Callers consult this BEFORE `regainAutomationBlocker` (a squad member's
 * null stamina would otherwise misread as untracked stats).
 */
export function minionRegainRouting(
  state: EncounterState,
  participant: ParticipantState,
): MinionRegainRouting | null {
  if (!isMinion(participant)) return null;
  if (squadOf(state, participant.id) !== undefined) {
    return {
      kind: 'refusal',
      message:
        "minions can't regain Stamina and can't gain temporary Stamina during a battle — their Stamina is tracked as a squad pool",
    };
  }
  return {
    kind: 'table-directive',
    message:
      "minions can't regain Stamina and can't gain temporary Stamina during a battle — this minion is not a living member of a seeded squad, so the Director adjudicates at the table",
  };
}

/** Why a participant's Stamina regain cannot be automated, if it can't —
 * the table-routing (not-automatable) half; the rule-mandated minion routing
 * is `minionRegainRouting` [R-0027] and is consulted first. */
export function regainAutomationBlocker(participant: ParticipantState): string | null {
  if (participant.stats === null || participant.stamina === null) {
    return 'no stats tracked for this participant — resolve at the table';
  }
  return null;
}

/** Why a participant cannot be offered an automated Recovery spend, if they
 * can't. Director-controlled non-minions are NOT blocked — they convert to
 * the one-third-maximum regain [rule.health/stamina §No Recoveries,
 * R-0019b]. Minions route through `minionRegainRouting` [R-0027], which
 * callers consult first. */
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
        staminaEvent: {
          participantId: participant.id,
          kind: 'regain' as const,
          amount: regained,
          damageType: null,
          rolled: false,
          sourceId: null,
          resolutionId: null,
          from: stamina.current,
          to: clampedTo,
          max: stats.staminaMax,
        },
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
        { healthTransitions: [{ participantId: participant.id, kind: 'no-longer-dying' }] },
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
        { healthTransitions: [{ participantId: participant.id, kind: 'no-longer-winded' }] },
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
