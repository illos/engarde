import type { LogEntry, Occurrence } from './schemas.js';
import { OccurrenceSchema } from './schemas.js';

/**
 * Occurrence derivation — the ONE home for turning what the engine did
 * into the vocabulary printed Triggers speak [R-0040].
 *
 * Nothing anywhere emits an occurrence directly. Every arm is read off a
 * machine-readable claim the engine already emits and the invariant suite
 * already reconciles, so a damage path that forgets to "also record an
 * occurrence" cannot exist: if the damage happened, the claim is there,
 * and the occurrence follows. That is deliberate — the alternative shape
 * (each call site emitting its own occurrence) is the one that has
 * shipped three defects on this codebase [GOTCHA-0009].
 *
 * The distinctions here are canon, not bookkeeping:
 * - "takes damage" and "loses Stamina" are separate arms, because the
 *   books print them as separate triggers on one page [Heroes p.132] and
 *   never say a loss is damage.
 * - `rolled` rides every damage occurrence, because "If an ability or
 *   effect deals damage without requiring a power roll, that is not
 *   rolled damage, and effects that add to or are triggered by rolled
 *   damage don't apply" [Heroes p.74 §Rolled Damage].
 */

/** The claim `reduceStamina` / `regainStamina` emit on every change. */
interface StaminaEventClaim {
  participantId: string;
  kind: 'damage' | 'loss' | 'regain';
  amount: number;
  damageType: string | null;
  rolled: boolean;
  sourceId: string | null;
  resolutionId: string | null;
  from: number;
  to: number;
  max: number;
}

interface HealthTransitionClaim {
  participantId: string;
  kind: string;
}

export interface DerivationContext {
  intentId: string;
  /** The round the occurrences belong to; null out of combat. */
  round: number | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asRows(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    const record = asRecord(row);
    return record ? [record] : [];
  });
}

/**
 * Derive every occurrence a batch of log entries proves happened.
 *
 * Ids are `${intentId}#${ordinal}` — deterministic and stable, because
 * intent ids are unique and the ordinal is the derivation order of a pure
 * function over the same log. A host that re-derives gets the same ids.
 */
export function deriveOccurrences(
  log: readonly LogEntry[],
  context: DerivationContext,
): Occurrence[] {
  const derived: Occurrence[] = [];
  const { intentId, round } = context;
  const next = (): string => `${intentId}#${derived.length}`;

  for (const item of log) {
    // A refusal changed nothing; nothing occurred.
    if (item.kind === 'refusal') continue;

    const staminaEvent = asRecord(item.data.staminaEvent) as unknown as StaminaEventClaim | null;
    if (staminaEvent !== null) {
      if (staminaEvent.kind === 'damage') {
        derived.push(
          OccurrenceSchema.parse({
            kind: 'damage-taken',
            occurrenceId: next(),
            intentId,
            round,
            participantId: staminaEvent.participantId,
            sourceId: staminaEvent.sourceId,
            amount: staminaEvent.amount,
            damageType: staminaEvent.damageType,
            rolled: staminaEvent.rolled,
            resolutionId: staminaEvent.resolutionId,
          }),
        );
      } else if (staminaEvent.kind === 'loss') {
        derived.push(
          OccurrenceSchema.parse({
            kind: 'stamina-lost',
            occurrenceId: next(),
            intentId,
            round,
            participantId: staminaEvent.participantId,
            amount: staminaEvent.amount,
            sourceId: staminaEvent.sourceId,
            resolutionId: staminaEvent.resolutionId,
          }),
        );
      } else if (staminaEvent.amount > 0) {
        // A clamped-to-zero regain restored nothing; nothing occurred.
        derived.push(
          OccurrenceSchema.parse({
            kind: 'stamina-regained',
            occurrenceId: next(),
            intentId,
            round,
            participantId: staminaEvent.participantId,
            amount: staminaEvent.amount,
          }),
        );
      }
    }

    for (const row of asRows(item.data.healthTransitions)) {
      const claim = row as unknown as HealthTransitionClaim;
      derived.push(
        OccurrenceSchema.parse({
          kind: 'health-transition',
          occurrenceId: next(),
          intentId,
          round,
          participantId: claim.participantId,
          transition: claim.kind,
        }),
      );
    }

    // Using an ability and making its roll are two printed trigger
    // classes off one claim: `resolutionOpened` carries both.
    const opened = asRecord(item.data.resolutionOpened);
    if (opened !== null) {
      const receipt = asRecord(opened.rollReceipt);
      derived.push(
        OccurrenceSchema.parse({
          kind: 'ability-used',
          occurrenceId: next(),
          intentId,
          round,
          actorId: opened.actorId,
          abilityArtifactId: opened.abilityArtifactId,
          resolutionId: opened.resolutionId,
        }),
      );
      if (receipt !== null) {
        derived.push(
          OccurrenceSchema.parse({
            kind: 'roll-made',
            occurrenceId: next(),
            intentId,
            round,
            actorId: opened.actorId,
            resolutionId: opened.resolutionId,
            tier: receipt.tier,
            natural: receipt.natural,
            edges: receipt.edges ?? 0,
            banes: receipt.banes ?? 0,
          }),
        );
      }
    }

    for (const row of asRows(item.data.turnOccurrences)) {
      derived.push(
        OccurrenceSchema.parse({
          kind: row.kind === 'turn-ended' ? 'turn-ended' : 'turn-started',
          occurrenceId: next(),
          intentId,
          round,
          participantId: row.participantId,
        }),
      );
    }
  }

  return derived;
}
