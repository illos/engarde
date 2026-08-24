import type {
  CharacteristicLetter,
  Characteristics,
  ParticipantState,
  PotencyThreshold,
} from './schemas.js';

/**
 * Potency resolution core — the ONE home for the potency gate
 * (docs/power-roll-design.md §6).
 *
 * "Ability effects that have a potency are applied to a target only if the
 * effect's potency value is higher than the target's indicated
 * characteristic score" [rule.character/potency] — i.e. the effect applies
 * iff targetScore < potencyValue, STRICTLY less (the record's worked
 * example pins the boundary: Agility 0 vs `A < 0` → resisted).
 *
 * Named thresholds (WEAK/AVERAGE/STRONG) resolve from the imposer's STORED
 * potency values — never derived here (Gate-3 Q2: the corpus carries an
 * unresolved "highest characteristic" vs "determined by your class" tension).
 */

export const POTENCY_CANON = 'mcdm.heroes.v1/rule.character/potency';

export const CHARACTERISTIC_KEY: Record<CharacteristicLetter, keyof Characteristics> = {
  M: 'might',
  A: 'agility',
  R: 'reason',
  I: 'intuition',
  P: 'presence',
};

export type PotencyResolution =
  | {
      resolved: true;
      potencyValue: number;
      adjustedValue: number;
      targetScore: number;
      applies: boolean;
    }
  | { resolved: false; reason: string };

export function resolvePotency(
  potency: { characteristic: CharacteristicLetter; threshold: PotencyThreshold },
  imposer: ParticipantState,
  target: ParticipantState,
  adjustmentTotal: number,
): PotencyResolution {
  let potencyValue: number;
  if (potency.threshold.kind === 'numeric') {
    potencyValue = potency.threshold.value;
  } else {
    const potencies = imposer.stats?.potencies ?? null;
    if (potencies === null) {
      return {
        resolved: false,
        reason: `${imposer.id} has no stored potency values to resolve ${potency.threshold.name.toUpperCase()}`,
      };
    }
    potencyValue = potencies[potency.threshold.name];
  }
  if (target.stats === null) {
    return {
      resolved: false,
      reason: `${target.id} has no tracked characteristics to compare against the potency`,
    };
  }
  const adjustedValue = potencyValue + adjustmentTotal;
  const targetScore = target.stats.characteristics[CHARACTERISTIC_KEY[potency.characteristic]];
  return {
    resolved: true,
    potencyValue,
    adjustedValue,
    targetScore,
    applies: targetScore < adjustedValue,
  };
}
