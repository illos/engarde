import type { ApplyResult } from './apply-intent.js';
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
    | 'refusal-with-change';
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
