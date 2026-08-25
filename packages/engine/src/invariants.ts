import type { ApplyResult } from './apply-intent.js';
import { POWER_ROLL_DIE, type PowerRollResolution, resolvePowerRoll } from './power-roll.js';
import {
  type EncounterState,
  EncounterStateSchema,
  type Intent,
  LogEntrySchema,
} from './schemas.js';

/**
 * Invariant property suite v0 (engine-plan 4.4, pilot thin form): universal
 * properties checked over every dispatch, independent of any specific rule.
 * The centerpiece is STATE↔LOG RECONCILIATION — every changed condition
 * instance must be attributable to a mutation log entry's machine-readable
 * claim, and every mutation entry must map to a real change. Silent
 * mutations and phantom log lines both fail.
 *
 * This is the oracle the driver harness and agent-playthrough fuzzing run
 * against (pilot steps 7–8); tests use it on every scenario dispatch.
 */

export interface InvariantViolation {
  code:
    | 'invalid-state'
    | 'invalid-log-entry'
    | 'misattributed-entry'
    | 'participant-set-changed'
    | 'duplicate-instance-id'
    | 'unattributed-add'
    | 'unattributed-remove'
    | 'phantom-claim'
    | 'refusal-with-change'
    | 'unattributed-stamina-change'
    | 'phantom-stamina-claim'
    | 'duplicate-grant-id'
    | 'unattributed-grant-add'
    | 'unattributed-grant-remove'
    | 'phantom-grant-claim'
    | 'dice-out-of-range'
    | 'breakdown-mismatch'
    | 'potency-gate-bypassed'
    | 'effect-receipt-mismatch';
  detail: string;
}

function instanceIds(state: EncounterState): Map<string, string> {
  const ids = new Map<string, string>();
  for (const participant of Object.values(state.participants)) {
    for (const instance of participant.conditions) {
      ids.set(instance.instanceId, participant.id);
    }
  }
  return ids;
}

function grantIds(state: EncounterState): Map<string, string> {
  const ids = new Map<string, string>();
  for (const participant of Object.values(state.participants)) {
    for (const grant of participant.grants) {
      ids.set(grant.grantId, participant.id);
    }
  }
  return ids;
}

function claimed(data: Record<string, unknown>, field: string): string[] {
  const value = data[field];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

export function checkInvariants(
  before: EncounterState,
  intent: Intent,
  result: ApplyResult,
): InvariantViolation[] {
  const violations: InvariantViolation[] = [];

  const parsedState = EncounterStateSchema.safeParse(result.state);
  if (!parsedState.success) {
    violations.push({ code: 'invalid-state', detail: parsedState.error.message });
    return violations;
  }
  for (const entry of result.log) {
    const parsedEntry = LogEntrySchema.safeParse(entry);
    if (!parsedEntry.success) {
      violations.push({ code: 'invalid-log-entry', detail: parsedEntry.error.message });
      continue;
    }
    if (entry.intentId !== intent.intentId) {
      violations.push({
        code: 'misattributed-entry',
        detail: `entry carries intent ${entry.intentId}, dispatched ${intent.intentId}`,
      });
    }
    if (JSON.stringify(entry.actor) !== JSON.stringify(intent.actor)) {
      violations.push({
        code: 'misattributed-entry',
        detail: 'entry actor differs from intent actor',
      });
    }
  }

  const beforeParticipants = Object.keys(before.participants).sort().join(',');
  const afterParticipants = Object.keys(result.state.participants).sort().join(',');
  if (beforeParticipants !== afterParticipants) {
    violations.push({
      code: 'participant-set-changed',
      detail: `${beforeParticipants} -> ${afterParticipants}`,
    });
  }

  for (const participant of Object.values(result.state.participants)) {
    const seen = new Set<string>();
    for (const instance of participant.conditions) {
      if (seen.has(instance.instanceId)) {
        violations.push({
          code: 'duplicate-instance-id',
          detail: `${instance.instanceId} on ${participant.id}`,
        });
      }
      seen.add(instance.instanceId);
    }
    const seenGrants = new Set<string>();
    for (const grant of participant.grants) {
      if (seenGrants.has(grant.grantId)) {
        violations.push({
          code: 'duplicate-grant-id',
          detail: `${grant.grantId} on ${participant.id}`,
        });
      }
      seenGrants.add(grant.grantId);
    }
  }

  // State↔log reconciliation over condition instances.
  const beforeIds = instanceIds(before);
  const afterIds = instanceIds(result.state);
  const added = [...afterIds.keys()].filter((id) => !beforeIds.has(id));
  const removed = [...beforeIds.keys()].filter((id) => !afterIds.has(id));

  const mutations = result.log.filter((entry) => entry.kind === 'mutation');
  const claimedAdds = new Set(
    mutations.flatMap((entry) => claimed(entry.data, 'addedInstanceIds')),
  );
  const claimedRemoves = new Set(
    mutations.flatMap((entry) => claimed(entry.data, 'removedInstanceIds')),
  );

  for (const id of added) {
    if (!claimedAdds.has(id)) {
      violations.push({
        code: 'unattributed-add',
        detail: `instance ${id} appeared with no claim`,
      });
    }
  }
  for (const id of removed) {
    if (!claimedRemoves.has(id)) {
      violations.push({
        code: 'unattributed-remove',
        detail: `instance ${id} vanished with no claim`,
      });
    }
  }
  const addedSet = new Set(added);
  const removedSet = new Set(removed);
  for (const entry of mutations) {
    const claims = [
      ...claimed(entry.data, 'addedInstanceIds').map((id) => ({ id, real: addedSet.has(id) })),
      ...claimed(entry.data, 'removedInstanceIds').map((id) => ({ id, real: removedSet.has(id) })),
    ];
    for (const claim of claims) {
      if (!claim.real) {
        violations.push({
          code: 'phantom-claim',
          detail: `mutation entry claims ${claim.id} but the state shows no such change`,
        });
      }
    }
  }

  // State↔log reconciliation over next-roll grants (v3): every grant that
  // appears or vanishes must be claimed by a mutation entry's
  // addedGrantIds / removedGrantIds, and every claim must be real.
  const beforeGrantIds = grantIds(before);
  const afterGrantIds = grantIds(result.state);
  const grantsAdded = [...afterGrantIds.keys()].filter((id) => !beforeGrantIds.has(id));
  const grantsRemoved = [...beforeGrantIds.keys()].filter((id) => !afterGrantIds.has(id));
  const claimedGrantAdds = new Set(
    mutations.flatMap((entry) => claimed(entry.data, 'addedGrantIds')),
  );
  const claimedGrantRemoves = new Set(
    mutations.flatMap((entry) => claimed(entry.data, 'removedGrantIds')),
  );
  for (const id of grantsAdded) {
    if (!claimedGrantAdds.has(id)) {
      violations.push({
        code: 'unattributed-grant-add',
        detail: `grant ${id} appeared with no claim`,
      });
    }
  }
  for (const id of grantsRemoved) {
    if (!claimedGrantRemoves.has(id)) {
      violations.push({
        code: 'unattributed-grant-remove',
        detail: `grant ${id} vanished with no claim`,
      });
    }
  }
  const grantsAddedSet = new Set(grantsAdded);
  const grantsRemovedSet = new Set(grantsRemoved);
  for (const entry of mutations) {
    const grantClaims = [
      ...claimed(entry.data, 'addedGrantIds').map((id) => ({ id, real: grantsAddedSet.has(id) })),
      ...claimed(entry.data, 'removedGrantIds').map((id) => ({
        id,
        real: grantsRemovedSet.has(id),
      })),
    ];
    for (const claim of grantClaims) {
      if (!claim.real) {
        violations.push({
          code: 'phantom-grant-claim',
          detail: `mutation entry claims grant ${claim.id} but the state shows no such change`,
        });
      }
    }
  }

  // ── Stamina↔log reconciliation (power-roll cluster) ─────────────────────
  // Every participant's stamina delta must be walked, in log order, by the
  // machine-readable `staminaDeltas` claims; every claim must be real.
  interface StaminaClaim {
    participantId: string;
    from: number;
    to: number;
    temporaryFrom: number;
    temporaryTo: number;
  }
  const staminaClaims = new Map<string, StaminaClaim[]>();
  for (const entry of mutations) {
    const rows = entry.data.staminaDeltas;
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      const claim = row as StaminaClaim;
      if (typeof claim?.participantId !== 'string') continue;
      const list = staminaClaims.get(claim.participantId) ?? [];
      list.push(claim);
      staminaClaims.set(claim.participantId, list);
    }
  }
  for (const participant of Object.values(result.state.participants)) {
    const beforeParticipant = before.participants[participant.id];
    const beforeStamina = beforeParticipant?.stamina ?? null;
    const afterStamina = participant.stamina;
    const claims = staminaClaims.get(participant.id) ?? [];
    if (beforeStamina === null || afterStamina === null) {
      if (claims.length > 0) {
        violations.push({
          code: 'phantom-stamina-claim',
          detail: `claims for ${participant.id}, whose stamina is untracked`,
        });
      }
      continue;
    }
    let current = beforeStamina.current;
    let temporary = beforeStamina.temporary;
    for (const claim of claims) {
      if (claim.from !== current || claim.temporaryFrom !== temporary) {
        violations.push({
          code: 'phantom-stamina-claim',
          detail: `claim on ${participant.id} starts at ${claim.from}/${claim.temporaryFrom}, state was ${current}/${temporary}`,
        });
      }
      current = claim.to;
      temporary = claim.temporaryTo;
    }
    if (current !== afterStamina.current || temporary !== afterStamina.temporary) {
      violations.push({
        code: 'unattributed-stamina-change',
        detail: `${participant.id} ended at ${afterStamina.current}/${afterStamina.temporary}; claims walk to ${current}/${temporary}`,
      });
    }
  }

  // ── power-roll breakdown recompute (design SE-8) ────────────────────────
  // Re-derive the resolution from the logged inputs; any total/tier drift is
  // a violation. The roll path is self-auditing on every dispatch.
  for (const entry of result.log) {
    const rollData = entry.data.powerRoll as
      | {
          dice: [number, number];
          characteristicValue: number;
          bonuses: { value: number; reason: string }[];
          penalties: { value: number; reason: string }[];
          edges: number;
          banes: number;
          automaticOutcomes: (1 | 2 | 3)[];
          downgradeToTier: 1 | 2 | null;
          resolution: PowerRollResolution;
          perTarget?: Record<
            string,
            { edges: number; banes: number; resolution: PowerRollResolution }
          >;
        }
      | undefined;
    if (rollData === undefined) continue;
    for (const die of rollData.dice) {
      if (!Number.isInteger(die) || die < 1 || die > POWER_ROLL_DIE) {
        violations.push({ code: 'dice-out-of-range', detail: `die ${die}` });
      }
    }
    if (rollData.dice.every((die) => Number.isInteger(die) && die >= 1 && die <= POWER_ROLL_DIE)) {
      const recomputed = resolvePowerRoll({
        dice: rollData.dice,
        characteristicValue: rollData.characteristicValue,
        bonuses: rollData.bonuses,
        penalties: rollData.penalties,
        edges: rollData.edges,
        banes: rollData.banes,
        automaticOutcomes: rollData.automaticOutcomes,
        downgradeToTier: rollData.downgradeToTier ?? undefined,
      });
      if (
        recomputed.total !== rollData.resolution.total ||
        recomputed.tier !== rollData.resolution.tier
      ) {
        violations.push({
          code: 'breakdown-mismatch',
          detail: `logged total ${rollData.resolution.total}/tier ${rollData.resolution.tier}, recomputed ${recomputed.total}/${recomputed.tier}`,
        });
      }
      // Per-target pools (inbound marks, R-0014) re-derive the same way:
      // same dice and additive modifiers, that target's edge/bane counts.
      for (const [targetId, perTarget] of Object.entries(rollData.perTarget ?? {})) {
        const recomputedTarget = resolvePowerRoll({
          dice: rollData.dice,
          characteristicValue: rollData.characteristicValue,
          bonuses: rollData.bonuses,
          penalties: rollData.penalties,
          edges: perTarget.edges,
          banes: perTarget.banes,
          automaticOutcomes: rollData.automaticOutcomes,
          downgradeToTier: rollData.downgradeToTier ?? undefined,
        });
        if (
          recomputedTarget.total !== perTarget.resolution.total ||
          recomputedTarget.tier !== perTarget.resolution.tier
        ) {
          violations.push({
            code: 'breakdown-mismatch',
            detail: `perTarget ${targetId}: logged total ${perTarget.resolution.total}/tier ${perTarget.resolution.tier}, recomputed ${recomputedTarget.total}/${recomputedTarget.tier}`,
          });
        }
      }
    }
  }

  // ── Effect provenance consistency ──────────────────────────────────────
  // Every use-effect dispatch carries exactly one self-describing receipt;
  // a manual program also keeps its exact source text in the directive.
  if (intent.kind === 'use-effect') {
    const receipts = result.log
      .map((entry) => entry.data.effectResolution)
      .filter((value) => value !== undefined) as Array<{
      effectArtifactId?: unknown;
      effectOrdinal?: unknown;
      sourceSpan?: unknown;
      sourceText?: unknown;
      resolutionKind?: unknown;
      targets?: unknown;
    }>;
    const receipt = receipts[0];
    if (
      receipts.length !== 1 ||
      receipt?.effectArtifactId !== intent.payload.effect.effectArtifactId ||
      receipt.effectOrdinal !== intent.payload.effect.effectOrdinal ||
      JSON.stringify(receipt.sourceSpan) !== JSON.stringify(intent.payload.effect.sourceSpan) ||
      receipt.sourceText !== intent.payload.effect.sourceText ||
      receipt.resolutionKind !== intent.payload.effect.resolution.kind ||
      JSON.stringify(receipt.targets) !== JSON.stringify(intent.payload.targets)
    ) {
      violations.push({
        code: 'effect-receipt-mismatch',
        detail: 'use-effect log does not carry exactly one matching effectResolution receipt',
      });
    }
    // A refused dispatch legitimately mutates nothing and emits no
    // directive — its receipt travels on the refusal entry itself.
    const refused = result.log.some((entry) => entry.kind === 'refusal');
    if (intent.payload.effect.resolution.kind === 'table' && !refused) {
      const directive = result.log.find((entry) => entry.data.manualEffect !== undefined);
      const manual = directive?.data.manualEffect as { sourceText?: unknown } | undefined;
      if (
        directive?.kind !== 'table-directive' ||
        manual?.sourceText !== intent.payload.effect.sourceText
      ) {
        violations.push({
          code: 'effect-receipt-mismatch',
          detail: 'manual Effect directive does not preserve the compiled source text',
        });
      }
    }
    // A test resolution logs exactly one roll receipt per creature target
    // and one automatic tier-1 entry per object target — none on refusal.
    if (intent.payload.effect.resolution.kind === 'test' && !refused) {
      const rollReceipts = result.log.filter((entry) => entry.data.testRoll !== undefined);
      const rolledTargets = rollReceipts.map(
        (entry) => (entry.data.testRoll as { targetId?: unknown }).targetId,
      );
      if (JSON.stringify(rolledTargets) !== JSON.stringify(intent.payload.targets)) {
        violations.push({
          code: 'effect-receipt-mismatch',
          detail: 'test resolution must log exactly one roll receipt per creature target, in order',
        });
      }
      const objectEntries = result.log.filter((entry) => entry.data.objectTestTier1 !== undefined);
      if (objectEntries.length !== (intent.payload.objectTargets ?? []).length) {
        violations.push({
          code: 'effect-receipt-mismatch',
          detail: 'test resolution must log one automatic tier-1 entry per object target',
        });
      }
    }
  }

  // ── potency-gate consistency ────────────────────────────────────────────
  // A logged resisted/unresolved gate for target T + conditions C means no C
  // instance may have been added to T by this intent.
  for (const entry of result.log) {
    const gate = entry.data.potency as
      | { targetId: string; applies: boolean; conditionIds: string[] }
      | undefined;
    const unresolved = entry.data.potencyUnresolved as
      | { targetId: string; conditionIds: string[] }
      | undefined;
    const blocked =
      gate !== undefined && gate.applies === false
        ? gate
        : unresolved !== undefined
          ? { targetId: unresolved.targetId, conditionIds: unresolved.conditionIds }
          : null;
    if (blocked === null) continue;
    for (const conditionId of blocked.conditionIds) {
      const participant = result.state.participants[blocked.targetId];
      const gained = participant?.conditions.some(
        (instance) => instance.conditionId === conditionId && added.includes(instance.instanceId),
      );
      if (gained) {
        violations.push({
          code: 'potency-gate-bypassed',
          detail: `${conditionId} applied to ${blocked.targetId} despite a failed/unresolved potency gate`,
        });
      }
    }
  }

  // A refused dispatch must leave the world untouched.
  if (result.log.some((entry) => entry.kind === 'refusal')) {
    if (JSON.stringify(result.state) !== JSON.stringify(before)) {
      violations.push({ code: 'refusal-with-change', detail: 'refusal entry but state changed' });
    }
    if (mutations.length > 0) {
      violations.push({ code: 'refusal-with-change', detail: 'refusal entry alongside mutations' });
    }
  }

  return violations;
}
