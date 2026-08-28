import type {
  CharacteristicLetter,
  Characteristics,
  LogEntry,
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

/**
 * The ONE home for the potency gate's RECEIPTS [rule.character/potency].
 *
 * `resolvePotency` decides; this decides what the table is told. Both the
 * ordinary ability path and the squad signature path gate tier riders on a
 * potency, and before this home existed only the ordinary path spoke: the
 * squad path `continue`d silently on BOTH branches, so a squad tier whose
 * condition was resisted — or whose potency could not resolve at all —
 * dropped that condition with no line in the log at all. 112 of the pin's
 * 364 minion statblocks carry potency notation, so the resisted branch is
 * ordinary play, not an edge case. Nothing is dropped without a receipt.
 */
export function gatePotencyWithReceipt(
  potency: { characteristic: CharacteristicLetter; threshold: PotencyThreshold },
  imposer: ParticipantState,
  target: ParticipantState,
  adjustmentTotal: number,
  args: { targetId: string; conditionIds: readonly string[]; abilityArtifactId: string },
  context: { intentId: string; actor: LogEntry['actor'] },
): { applies: boolean; log: LogEntry[] } {
  const gate = resolvePotency(potency, imposer, target, adjustmentTotal);
  const threshold =
    potency.threshold.kind === 'named'
      ? potency.threshold.name.toUpperCase()
      : String(potency.threshold.value);
  if (!gate.resolved) {
    return {
      applies: false,
      log: [
        {
          kind: 'table-directive',
          intentId: context.intentId,
          actor: context.actor,
          canonRefs: [POTENCY_CANON, args.abilityArtifactId],
          message: `potency ${potency.characteristic} < ${threshold} on ${args.targetId} cannot be resolved — ${gate.reason}; effects not applied`,
          data: {
            potencyUnresolved: {
              targetId: args.targetId,
              reason: gate.reason,
              conditionIds: [...args.conditionIds],
            },
          },
        },
      ],
    };
  }
  return {
    applies: gate.applies,
    log: [
      {
        kind: 'informational',
        intentId: context.intentId,
        actor: context.actor,
        canonRefs: [POTENCY_CANON],
        message: `potency vs ${args.targetId}: ${potency.characteristic} ${gate.targetScore} < ${gate.adjustedValue} → ${gate.applies ? 'affected' : 'resisted'}`,
        data: {
          potency: { targetId: args.targetId, ...gate, conditionIds: [...args.conditionIds] },
        },
      },
    ],
  };
}
