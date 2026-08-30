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
 * - "takes damage" and "loses Stamina" are separate, non-exclusive arms:
 *   a hit that lowers current Stamina records both, while damage absorbed
 *   entirely by temporary Stamina records only damage [Heroes p.132].
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
  participantId: string | null;
  kind: string;
  squadId?: string;
  pending?: boolean;
  count?: number;
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
      }
      // Damage and Stamina loss are distinct trigger classes, not
      // exclusive ones. Damage absorbed entirely by temporary Stamina has
      // no current-Stamina loss; a hit that lowers current Stamina has both.
      const staminaLost = Math.max(0, staminaEvent.from - staminaEvent.to);
      if ((staminaEvent.kind === 'damage' || staminaEvent.kind === 'loss') && staminaLost > 0) {
        derived.push(
          OccurrenceSchema.parse({
            kind: 'stamina-lost',
            occurrenceId: next(),
            intentId,
            round,
            participantId: staminaEvent.participantId,
            amount: staminaLost,
            sourceId: staminaEvent.sourceId,
            resolutionId: staminaEvent.resolutionId,
          }),
        );
      } else if (staminaEvent.kind === 'regain' && staminaEvent.amount > 0) {
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

      // Individual creatures do not need a second claim: their exact
      // current-Stamina crossing proves the printed event. Squad pool
      // deaths use `zeroStaminaTrigger` below because the victim can be
      // known or pending independently of the pool value.
      if (
        asRecord(item.data.squadDamage) === null &&
        staminaEvent.from > 0 &&
        staminaEvent.to <= 0
      ) {
        derived.push(
          OccurrenceSchema.parse({
            kind: 'stamina-reduced-to-zero',
            occurrenceId: next(),
            intentId,
            round,
            participantId: staminaEvent.participantId,
            squadId: null,
            pendingIdentity: false,
          }),
        );
      }
    }

    const zeroed = asRecord(item.data.zeroStaminaTrigger);
    if (zeroed !== null) {
      const participantId = typeof zeroed.participantId === 'string' ? zeroed.participantId : null;
      const pendingCount =
        zeroed.pending === true && typeof zeroed.count === 'number' ? zeroed.count : 1;
      const squadId = typeof zeroed.squadId === 'string' ? zeroed.squadId : null;
      for (let ordinal = 0; ordinal < pendingCount; ordinal += 1) {
        derived.push(
          OccurrenceSchema.parse({
            kind: 'stamina-reduced-to-zero',
            occurrenceId: next(),
            intentId,
            round,
            participantId,
            squadId,
            pendingIdentity: zeroed.pending === true,
          }),
        );
      }
    }

    for (const row of asRows(item.data.healthTransitions)) {
      const claim = row as unknown as HealthTransitionClaim;
      const count = claim.pending === true && typeof claim.count === 'number' ? claim.count : 1;
      for (let ordinal = 0; ordinal < count; ordinal += 1) {
        derived.push(
          OccurrenceSchema.parse({
            kind: 'health-transition',
            occurrenceId: next(),
            intentId,
            round,
            participantId: claim.participantId,
            squadId: typeof claim.squadId === 'string' ? claim.squadId : null,
            pendingIdentity: claim.pending === true,
            transition: claim.kind,
          }),
        );
      }
    }

    // Nonrolling applications have no resolution-stack lifecycle. Their
    // exact causal claim is emitted by the successful application dispatch,
    // rather than inferred from an unrelated economy debit or nearby log.
    const application = asRecord(item.data.nonrollingAbilityApplication);
    if (application !== null) {
      derived.push(
        OccurrenceSchema.parse({
          kind: 'ability-used',
          occurrenceId: next(),
          intentId,
          round,
          actorId: application.actorId,
          abilityArtifactId: application.abilityArtifactId,
          resolutionId: null,
        }),
      );
      if (Array.isArray(application.targetIds)) {
        for (const targetId of application.targetIds) {
          if (typeof targetId !== 'string') continue;
          derived.push(
            OccurrenceSchema.parse({
              kind: 'targeted',
              occurrenceId: next(),
              intentId,
              round,
              participantId: targetId,
              actorId: application.actorId,
              abilityArtifactId: application.abilityArtifactId,
              resolutionId: null,
            }),
          );
        }
      }
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
      // Being TARGETED is its own trigger class, and it fires before any
      // roll exists — "A creature targets the monarch with a strike"
      // [Monsters p.164, Meat Shield]. The declared phase is what gives it
      // a moment; this is that moment, recorded [R-0041].
      if (Array.isArray(opened.declaredTargets)) {
        for (const targetId of opened.declaredTargets) {
          if (typeof targetId !== 'string') continue;
          derived.push(
            OccurrenceSchema.parse({
              kind: 'targeted',
              occurrenceId: next(),
              intentId,
              round,
              participantId: targetId,
              actorId: opened.actorId,
              abilityArtifactId: opened.abilityArtifactId,
              resolutionId: opened.resolutionId,
            }),
          );
        }
      }
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

    // A declaration that has now ROLLED: the ability-used and targeted
    // occurrences already fired at the declaration; only the roll is new.
    const rolledClaim = asRecord(item.data.resolutionRolled);
    if (rolledClaim !== null) {
      const receipt = asRecord(rolledClaim.rollReceipt);
      if (receipt !== null) {
        derived.push(
          OccurrenceSchema.parse({
            kind: 'roll-made',
            occurrenceId: next(),
            intentId,
            round,
            actorId: rolledClaim.actorId,
            resolutionId: rolledClaim.resolutionId,
            tier: receipt.tier,
            natural: receipt.natural,
            edges: receipt.edges ?? 0,
            banes: receipt.banes ?? 0,
          }),
        );
      }
    }

    // Characteristic tests are power rolls too [R-0006], but they do not
    // open a resolution-stack entry. Their existing `testRoll` claim is
    // therefore the exact source of a roll occurrence with resolutionId
    // null.
    const testRoll = asRecord(item.data.testRoll);
    const testResolution = testRoll === null ? null : asRecord(testRoll.resolution);
    if (testRoll !== null && testResolution !== null) {
      derived.push(
        OccurrenceSchema.parse({
          kind: 'roll-made',
          occurrenceId: next(),
          intentId,
          round,
          actorId: testRoll.targetId,
          resolutionId: null,
          tier: testResolution.tier,
          natural: testResolution.natural,
          edges: testRoll.edges ?? 0,
          banes: testRoll.banes ?? 0,
        }),
      );
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
