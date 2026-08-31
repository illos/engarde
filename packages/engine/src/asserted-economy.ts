import { debitActionCost } from './action-economy.js';
import type { LifecycleContext } from './condition-lifecycle.js';
import {
  type AssertedAbilityUse,
  type EncounterState,
  type LogEntry,
  nonrollingAbilityApplicationClaim,
} from './schemas.js';

/**
 * The ONE home for the asserted-band economy prelude [R-0029/R-0030].
 *
 * A manual tier assertion for a grammar-incompilable ability is still a USE
 * of that ability: it records a nonrolling application claim and it debits
 * through the one `ACTION_COST_DEBITS` home exactly like the rolled path
 * (silent grant consumption, warn-and-apply violations), while opening NO
 * resolution entry — nothing was rolled.
 *
 * Three intents carry an asserted band — `apply-condition`, `apply-damage`
 * and `remove-condition` — and the third is why this is a function. The
 * first two shipped byte-similar copies of the same fifteen lines; a third
 * copy is how the claim shape, the `partOf` semantics and the
 * combat-only guard drift apart between the intent that imposes a condition
 * and the intent that ends one.
 */

/**
 * The refusal an asserted band can produce on its own: the payload names a
 * payer who is not in the encounter. Hoisted by every caller ABOVE its own
 * mutation, so a refusal never follows a state change.
 */
export function assertedActorRefusal(
  state: EncounterState,
  asserted: AssertedAbilityUse | null,
): string | null {
  if (asserted === null) return null;
  return state.participants[asserted.actorParticipantId]
    ? null
    : `unknown participant ${asserted.actorParticipantId}`;
}

/**
 * The receipt half: "X applies <ability> to Y without a power roll", with
 * the machine-readable claim `deriveOccurrences` reads.
 *
 * `partOf` suppresses it — a child application of an already-recorded
 * printed use is not another ability use in its own right.
 */
export function assertedApplicationEntry(
  context: LifecycleContext,
  asserted: AssertedAbilityUse,
  targetId: string,
): LogEntry | null {
  if (asserted.partOf !== undefined) return null;
  return {
    kind: 'informational',
    intentId: context.intentId,
    actor: context.actor,
    canonRefs: [asserted.abilityArtifactId],
    message: `${asserted.actorParticipantId} applies ${asserted.abilityArtifactId} to ${targetId} without a power roll`,
    data: {
      nonrollingAbilityApplication: nonrollingAbilityApplicationClaim({
        actorId: asserted.actorParticipantId,
        abilityArtifactId: asserted.abilityArtifactId,
        targetIds: [targetId],
      }),
    },
  };
}

/**
 * The claim entry plus the debit, in that order. Outside combat
 * (`turnState === null`) the debit is a documented no-op and the claim
 * still lands — an asserted use is a use whether or not a turn is running.
 */
export function assertedEconomyPrelude(
  state: EncounterState,
  asserted: AssertedAbilityUse | null,
  targetId: string,
  context: LifecycleContext,
): { state: EncounterState; log: LogEntry[] } {
  if (asserted === null) return { state, log: [] };
  const log: LogEntry[] = [];
  const application = assertedApplicationEntry(context, asserted, targetId);
  if (application !== null) log.push(application);
  if (state.turnState === null) return { state, log };
  const debited = debitActionCost(
    state,
    {
      cost: asserted.actionCost,
      payerId: asserted.actorParticipantId,
      abilityKey: asserted.abilityArtifactId,
      usesPerRound: asserted.usesPerRound,
      partOf: asserted.partOf ?? null,
      // Several asserted dispatches realizing ONE ability use (a tier's
      // damage plus its condition) share the first dispatch's debit AND its
      // use counter — the same `partOf` semantics as the rolled path.
      sharesAbilityUse: asserted.partOf !== undefined,
    },
    context,
  );
  return { state: debited.state, log: [...log, ...debited.log] };
}
