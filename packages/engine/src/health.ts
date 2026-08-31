import type { ConditionInstance, ParticipantState } from './schemas.js';

/**
 * Health selectors — the ONE home for winded/dying/death math. Derived
 * states are computed, never stored (a stored copy would be a second home
 * for the same canon rule; see docs/power-roll-design.md §3).
 */

/** Canon artifact ids this module's behavior traces to. */
export const HEALTH_CANON = {
  stamina: 'mcdm.heroes.v1/rule.health/stamina',
  temporaryStamina: 'mcdm.heroes.v1/rule.health/temporary-stamina',
  recoveries: 'mcdm.heroes.v1/rule.health/recoveries',
  noRecoveries: 'mcdm.heroes.v1/rule.health/stamina#no-recoveries',
  winded: 'mcdm.heroes.v1/rule.health/winded',
  dying: 'mcdm.heroes.v1/rule.health/dying',
  alwaysRoundDown: 'mcdm.heroes.v1/rule.general/always-round-down',
  damage: 'mcdm.heroes.v1/rule.damage/damage',
  damageImmunity: 'mcdm.heroes.v1/rule.damage/damage-immunity',
  damageWeakness: 'mcdm.heroes.v1/rule.damage/damage-weakness',
  knockOut: 'mcdm.heroes.v1/rule.health/stamina#knocking-creatures-out',
  bleeding: 'mcdm.heroes.v1/condition/bleeding',
} as const;

/** Condition id used for the dying-mandated bleeding instance
 * [rule.health/dying: "you are bleeding, and this instance … can't be
 * negated or removed in any way until you are no longer dying"]. */
export const BLEEDING_CONDITION_ID = 'mcdm.heroes.v1/condition/bleeding';

/** Condition id for the knock-out unconscious state
 * [rule.health/stamina §Knocking Creatures Out]. There is no atomized
 * unconscious condition record; the state is defined inside the stamina
 * record, so instances carry that artifact id. */
export const UNCONSCIOUS_CONDITION_ID = 'mcdm.heroes.v1/rule.health/stamina#unconscious';

/** "Your winded value equals half your Stamina maximum" [rule.health/winded]
 * + "round the result down" [rule.general/always-round-down]. Temporary
 * Stamina is excluded from the derivation [rule.health/temporary-stamina]. */
export function windedValue(staminaMax: number): number {
  return Math.floor(staminaMax / 2);
}

/** "A hero also has a recovery value that equals one-third of their Stamina
 * maximum, rounded down" [rule.health/recoveries]. The SAME derivation
 * serves the Director-creature conversion — "regains Stamina equal to
 * one-third of their Stamina maximum" [rule.health/stamina §No Recoveries,
 * R-0019b]. Temporary Stamina is excluded [rule.health/temporary-stamina]. */
export function recoveryValue(staminaMax: number): number {
  return Math.floor(staminaMax / 3);
}

/** "When your Stamina is equal to or less than your winded value, you are
 * winded" [rule.health/winded]. */
export function isWinded(current: number, staminaMax: number): boolean {
  return current <= windedValue(staminaMax);
}

/** "When your Stamina is 0 or lower, you are dying" [rule.health/dying]. */
export function isDying(current: number): boolean {
  return current <= 0;
}

function hasKnockOutInstance(conditions: readonly ConditionInstance[]): boolean {
  return conditions.some((instance) => instance.conditionId === UNCONSCIOUS_CONDITION_ID);
}

/**
 * Death:
 * - hero — "While your Stamina is lower than 0, if it reaches the negative
 *   of your winded value, you die" [rule.health/dying];
 * - director-creature — "die or are destroyed when their Stamina drops to 0"
 *   [rule.health/stamina §Director-Controlled Creatures], unless knocked
 *   unconscious instead [§Knocking Creatures Out].
 * A knock-out unconscious instance marks the not-dead alternative for both.
 */
export function isDead(participant: ParticipantState): boolean {
  if (participant.stats === null || participant.stamina === null) return false;
  if (hasKnockOutInstance(participant.conditions)) return false;
  const current = participant.stamina.current;
  if (participant.kind === 'hero') {
    return current < 0 && current <= -windedValue(participant.stats.staminaMax);
  }
  return current <= 0;
}

/** True when the participant carries the dying-mandated bleeding or the
 * knock-out unconscious instance — the health-sourced instances exempt from
 * the end-encounter default sweep ("except for being winded, unconscious,
 * or dying" [chapter/classes §Ending Effects]). */
export function isHealthSourcedInstance(instance: ConditionInstance): boolean {
  return (
    instance.conditionId === UNCONSCIOUS_CONDITION_ID ||
    (instance.conditionId === BLEEDING_CONDITION_ID &&
      instance.source.effectArtifactId === HEALTH_CANON.dying)
  );
}

/**
 * R-0004 — the ONE home for "may this condition instance be removed at
 * all?". The dying-mandated bleeding "can't be negated or removed in any
 * way until you are no longer dying" [rule.health/dying]: a
 * REPRESENTATIONAL block, not a permissive warn-and-apply rule violation,
 * because the engine cannot hold a state in which the printed instance is
 * gone while the creature is still dying.
 *
 * Returns the printed reason, or null when the instance may be removed.
 *
 * A function rather than an inline check in the `remove-condition` arm
 * because removal now has a second dispatch surface — the `end-condition`
 * resolution [S12] — and a third is already printed (Escape Grab's "You are
 * no longer grabbed." tier bullet). Every remover asks here; none re-derives
 * the predicate.
 */
export function conditionRemovalBlocker(
  target: ParticipantState,
  instance: ConditionInstance,
): string | null {
  if (
    isHealthSourcedInstance(instance) &&
    instance.source.effectArtifactId === HEALTH_CANON.dying &&
    target.stamina !== null &&
    isDying(target.stamina.current)
  ) {
    return `${target.id} is still dying — this bleeding instance can't be removed until they are no longer dying`;
  }
  return null;
}
