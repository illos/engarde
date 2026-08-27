import { BASE_TURN_BUDGET, withinMinionMoveMenu } from './action-economy.js';
import type { ApplyResult } from './apply-intent.js';
import { isDead } from './health.js';
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
    | 'effect-receipt-mismatch'
    | 'unattributed-recoveries-change'
    | 'phantom-recoveries-claim'
    | 'recoveries-out-of-bounds'
    | 'stamina-above-maximum'
    | 'duplicate-terrain-fact-id'
    | 'unattributed-terrain-change'
    | 'phantom-terrain-claim'
    | 'duplicate-squad-id'
    | 'squad-pool-out-of-bounds'
    | 'squad-accounting-mismatch'
    | 'squad-membership-mismatch'
    | 'unattributed-squad-change'
    | 'phantom-squad-claim'
    | 'squad-member-stamina-tracked'
    | 'squad-weakness-multiply-applied'
    | 'unattributed-budget-change'
    | 'phantom-budget-claim'
    | 'budget-over-capacity-unreceipted'
    | 'unattributed-triggered-change'
    | 'phantom-triggered-claim'
    | 'triggered-over-limit-unreceipted'
    | 'unattributed-ability-use-change'
    | 'phantom-ability-use-claim'
    | 'unattributed-turn-change'
    | 'phantom-turn-claim'
    | 'turns-over-allowance-unreceipted'
    | 'unattributed-villain-change'
    | 'phantom-villain-claim'
    | 'duplicate-resolution-id'
    | 'unattributed-resolution-change'
    | 'phantom-resolution-claim';
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

/**
 * Shared claim collection for every walked state slot: gather one field's
 * rows across the mutation entries, grouped by the row's key (participantId
 * or squadId), in log order. Rows whose key is not a string are ignored.
 */
function collectClaimRows<TClaim>(
  mutations: readonly { data: Record<string, unknown> }[],
  field: string,
  keyOf: (claim: TClaim) => unknown,
): Map<string, TClaim[]> {
  const store = new Map<string, TClaim[]>();
  for (const entry of mutations) {
    const rows = entry.data[field];
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      const claim = row as TClaim;
      const key = keyOf(claim);
      if (typeof key !== 'string') continue;
      const list = store.get(key) ?? [];
      list.push(claim);
      store.set(key, list);
    }
  }
  return store;
}

/**
 * Generic state↔log claim walker — the ONE home for the reconciliation
 * shape every walked state slot shares (stamina, Recoveries, squad pool,
 * pendingKills, captain; a schema v6 slot adds a config entry, not a
 * copy): replay the entity's claims in log order from the before-value;
 * a claim whose `from` misses the walked value is phantom, and a walk
 * that misses the after-value is an unattributed change. The slot's
 * claim/reconciliation semantics (value extraction, equality, violation
 * wording) are the parameters.
 */
/**
 * Generic add/remove SET reconciliation — the ONE home for the two-way
 * membership shape every set-shaped state slot shares (condition
 * instances, next-roll grants, terrain facts; a schema v6 set slot adds a
 * config entry, not a copy): diff the before/after member ids, require
 * every appearance/disappearance to be claimed, and flag every claim the
 * diff does not show. Members may carry arbitrary per-member payloads —
 * the caller extracts ids and claim rows, so no slot schema leaks in
 * here. Claim multiplicity and order are the caller's: phantoms emit one
 * violation per claim row, exactly as supplied. The slot's violation
 * wording is the parameter.
 */
interface SetClaim {
  op: 'added' | 'removed';
  id: string;
}

function reconcileSetClaims(
  beforeIds: readonly string[],
  afterIds: readonly string[],
  claims: readonly SetClaim[],
  semantics: {
    unattributed: (op: SetClaim['op'], id: string) => InvariantViolation;
    phantom: (op: SetClaim['op'], id: string) => InvariantViolation;
  },
): { violations: InvariantViolation[]; added: string[]; removed: string[] } {
  const beforeSet = new Set(beforeIds);
  const afterSet = new Set(afterIds);
  const added = afterIds.filter((id) => !beforeSet.has(id));
  const removed = beforeIds.filter((id) => !afterSet.has(id));
  const claimedByOp = { added: new Set<string>(), removed: new Set<string>() };
  for (const claim of claims) claimedByOp[claim.op].add(claim.id);
  const violations: InvariantViolation[] = [];
  for (const id of added) {
    if (!claimedByOp.added.has(id)) violations.push(semantics.unattributed('added', id));
  }
  for (const id of removed) {
    if (!claimedByOp.removed.has(id)) violations.push(semantics.unattributed('removed', id));
  }
  const realByOp = { added: new Set(added), removed: new Set(removed) };
  for (const claim of claims) {
    if (!realByOp[claim.op].has(claim.id)) violations.push(semantics.phantom(claim.op, claim.id));
  }
  return { violations, added, removed };
}

function walkClaims<TClaim, TValue>(
  before: TValue,
  after: TValue,
  claims: readonly TClaim[],
  semantics: {
    from: (claim: TClaim) => TValue;
    to: (claim: TClaim) => TValue;
    equals: (a: TValue, b: TValue) => boolean;
    phantom: (claim: TClaim, walked: TValue) => InvariantViolation;
    unattributed: (walked: TValue) => InvariantViolation;
  },
): InvariantViolation[] {
  const violations: InvariantViolation[] = [];
  let current = before;
  for (const claim of claims) {
    if (!semantics.equals(semantics.from(claim), current)) {
      violations.push(semantics.phantom(claim, current));
    }
    current = semantics.to(claim);
  }
  if (!semantics.equals(current, after)) {
    violations.push(semantics.unattributed(current));
  }
  return violations;
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
  const mutations = result.log.filter((entry) => entry.kind === 'mutation');
  const conditionRecon = reconcileSetClaims(
    [...instanceIds(before).keys()],
    [...instanceIds(result.state).keys()],
    mutations.flatMap((entry) => [
      ...claimed(entry.data, 'addedInstanceIds').map((id) => ({ op: 'added' as const, id })),
      ...claimed(entry.data, 'removedInstanceIds').map((id) => ({ op: 'removed' as const, id })),
    ]),
    {
      unattributed: (op, id) =>
        op === 'added'
          ? { code: 'unattributed-add', detail: `instance ${id} appeared with no claim` }
          : { code: 'unattributed-remove', detail: `instance ${id} vanished with no claim` },
      phantom: (_op, id) => ({
        code: 'phantom-claim',
        detail: `mutation entry claims ${id} but the state shows no such change`,
      }),
    },
  );
  violations.push(...conditionRecon.violations);
  // The added-instance list feeds the potency-gate consistency check below.
  const added = conditionRecon.added;

  // State↔log reconciliation over next-roll grants (v3): every grant that
  // appears or vanishes must be claimed by a mutation entry's
  // addedGrantIds / removedGrantIds, and every claim must be real.
  violations.push(
    ...reconcileSetClaims(
      [...grantIds(before).keys()],
      [...grantIds(result.state).keys()],
      mutations.flatMap((entry) => [
        ...claimed(entry.data, 'addedGrantIds').map((id) => ({ op: 'added' as const, id })),
        ...claimed(entry.data, 'removedGrantIds').map((id) => ({ op: 'removed' as const, id })),
      ]),
      {
        unattributed: (op, id) =>
          op === 'added'
            ? { code: 'unattributed-grant-add', detail: `grant ${id} appeared with no claim` }
            : { code: 'unattributed-grant-remove', detail: `grant ${id} vanished with no claim` },
        phantom: (_op, id) => ({
          code: 'phantom-grant-claim',
          detail: `mutation entry claims grant ${id} but the state shows no such change`,
        }),
      },
    ).violations,
  );

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
  const staminaClaims = collectClaimRows<StaminaClaim>(
    mutations,
    'staminaDeltas',
    (claim) => claim?.participantId,
  );
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
    violations.push(
      ...walkClaims(
        { current: beforeStamina.current, temporary: beforeStamina.temporary },
        { current: afterStamina.current, temporary: afterStamina.temporary },
        claims,
        {
          from: (claim) => ({ current: claim.from, temporary: claim.temporaryFrom }),
          to: (claim) => ({ current: claim.to, temporary: claim.temporaryTo }),
          equals: (a, b) => a.current === b.current && a.temporary === b.temporary,
          phantom: (claim, walked) => ({
            code: 'phantom-stamina-claim',
            detail: `claim on ${participant.id} starts at ${claim.from}/${claim.temporaryFrom}, state was ${walked.current}/${walked.temporary}`,
          }),
          unattributed: (walked) => ({
            code: 'unattributed-stamina-change',
            detail: `${participant.id} ended at ${afterStamina.current}/${afterStamina.temporary}; claims walk to ${walked.current}/${walked.temporary}`,
          }),
        },
      ),
    );
  }

  // ── Recoveries↔log reconciliation (v4, R-0018/R-0019) ───────────────────
  // Every participant's Recoveries delta must be walked, in log order, by the
  // machine-readable `recoveriesDeltas` claims; every claim must be real.
  // Bounds: 0 ≤ recoveries ≤ recoveriesMax whenever tracked.
  interface RecoveriesClaim {
    participantId: string;
    from: number;
    to: number;
  }
  const recoveriesClaims = collectClaimRows<RecoveriesClaim>(
    mutations,
    'recoveriesDeltas',
    (claim) => claim?.participantId,
  );
  for (const participant of Object.values(result.state.participants)) {
    const beforeParticipant = before.participants[participant.id];
    const beforeRecoveries = beforeParticipant?.stamina?.recoveries ?? null;
    const afterRecoveries = participant.stamina?.recoveries ?? null;
    const claims = recoveriesClaims.get(participant.id) ?? [];
    if (beforeRecoveries === null || afterRecoveries === null) {
      if (claims.length > 0) {
        violations.push({
          code: 'phantom-recoveries-claim',
          detail: `claims for ${participant.id}, whose Recoveries are untracked`,
        });
      }
      continue;
    }
    violations.push(
      ...walkClaims(beforeRecoveries, afterRecoveries, claims, {
        from: (claim) => claim.from,
        to: (claim) => claim.to,
        equals: (a, b) => a === b,
        phantom: (claim, walked) => ({
          code: 'phantom-recoveries-claim',
          detail: `claim on ${participant.id} starts at ${claim.from}, state was ${walked}`,
        }),
        unattributed: (walked) => ({
          code: 'unattributed-recoveries-change',
          detail: `${participant.id} ended at ${afterRecoveries} Recoveries; claims walk to ${walked}`,
        }),
      }),
    );
    const max = participant.stats?.recoveriesMax;
    if (typeof max === 'number' && (afterRecoveries < 0 || afterRecoveries > max)) {
      violations.push({
        code: 'recoveries-out-of-bounds',
        detail: `${participant.id} has ${afterRecoveries} Recoveries of ${max}`,
      });
    }
  }

  // Regain clamps at Stamina maximum [R-0017]; nothing may exceed it.
  for (const participant of Object.values(result.state.participants)) {
    if (participant.stats !== null && participant.stamina !== null) {
      if (participant.stamina.current > participant.stats.staminaMax) {
        violations.push({
          code: 'stamina-above-maximum',
          detail: `${participant.id} at ${participant.stamina.current}/${participant.stats.staminaMax}`,
        });
      }
    }
  }

  // ── Terrain-fact↔log reconciliation (v4, R-0022) ────────────────────────
  const afterFactIds = result.state.terrainFacts.map((fact) => fact.factId);
  const seenFactIds = new Set<string>();
  for (const factId of afterFactIds) {
    if (seenFactIds.has(factId)) {
      violations.push({ code: 'duplicate-terrain-fact-id', detail: factId });
    }
    seenFactIds.add(factId);
  }
  // Claims arrive as one-object add/clear receipts plus bulk clears;
  // dedupe to first occurrence (adds before removes) — a fact id claimed
  // twice is one claim against the walked set, not two.
  const claimedFactAdds = new Set<string>();
  const claimedFactRemoves = new Set<string>();
  for (const entry of mutations) {
    const addedFact = entry.data.terrainFactAdded as { factId?: unknown } | undefined;
    if (typeof addedFact?.factId === 'string') claimedFactAdds.add(addedFact.factId);
    const clearedFact = entry.data.terrainFactCleared as { factId?: unknown } | undefined;
    if (typeof clearedFact?.factId === 'string') claimedFactRemoves.add(clearedFact.factId);
    for (const id of claimed(entry.data, 'terrainFactsCleared')) claimedFactRemoves.add(id);
  }
  violations.push(
    ...reconcileSetClaims(
      before.terrainFacts.map((fact) => fact.factId),
      afterFactIds,
      [
        ...[...claimedFactAdds].map((id) => ({ op: 'added' as const, id })),
        ...[...claimedFactRemoves].map((id) => ({ op: 'removed' as const, id })),
      ],
      {
        unattributed: (op, id) => ({
          code: 'unattributed-terrain-change',
          detail:
            op === 'added'
              ? `terrain fact ${id} appeared with no claim`
              : `terrain fact ${id} vanished with no claim`,
        }),
        phantom: (op, id) => ({
          code: 'phantom-terrain-claim',
          detail: `mutation entry claims ${op} fact ${id} but the state shows no such change`,
        }),
      },
    ).violations,
  );

  // ── Squad-pool reconciliation (v5, R-0023..R-0028) ─────────────────────
  // Structural coherence: the printed pool formula, the standing R-0024
  // kill-accounting invariant, two-way membership, and null member stamina;
  // then state↔log reconciliation over pool, deaths, pendingKills, and
  // captains — every delta claimed, every claim real.
  {
    const seenSquadIds = new Set<string>();
    const memberHome = new Map<string, string>();
    for (const squad of result.state.squads) {
      if (seenSquadIds.has(squad.squadId)) {
        violations.push({ code: 'duplicate-squad-id', detail: squad.squadId });
      }
      seenSquadIds.add(squad.squadId);
      const per = squad.perMinionStamina;
      const total = squad.memberIds.length + squad.deadMemberIds.length;
      if (squad.pool.max !== per * total) {
        violations.push({
          code: 'squad-accounting-mismatch',
          detail: `${squad.squadId}: pool.max ${squad.pool.max} ≠ ${per} × ${total} members [R-0023]`,
        });
      }
      if (squad.pool.current < 0 || squad.pool.current > squad.pool.max) {
        violations.push({
          code: 'squad-pool-out-of-bounds',
          detail: `${squad.squadId}: ${squad.pool.current}/${squad.pool.max}`,
        });
      }
      const counted = Math.floor((squad.pool.max - squad.pool.current) / per);
      if (squad.deadMemberIds.length + squad.pendingKills !== counted) {
        violations.push({
          code: 'squad-accounting-mismatch',
          detail: `${squad.squadId}: ${squad.deadMemberIds.length} dead + ${squad.pendingKills} pending ≠ floor((max − pool)/perMinion) = ${counted} [R-0024]`,
        });
      }
      for (const memberId of [...squad.memberIds, ...squad.deadMemberIds]) {
        const owner = memberHome.get(memberId);
        if (owner !== undefined) {
          violations.push({
            code: 'squad-membership-mismatch',
            detail: `${memberId} appears in squads ${owner} and ${squad.squadId}`,
          });
        }
        memberHome.set(memberId, squad.squadId);
        const member = result.state.participants[memberId];
        if (!member) {
          violations.push({
            code: 'squad-membership-mismatch',
            detail: `${squad.squadId} carries unknown participant ${memberId}`,
          });
          continue;
        }
        if (member.stats === null) {
          violations.push({
            code: 'squad-membership-mismatch',
            detail: `${memberId} is a squad member without stats`,
          });
        }
        if (member.stamina !== null) {
          violations.push({
            code: 'squad-member-stamina-tracked',
            detail: `${memberId} carries individual stamina — the squad pool is the one home [R-0023]`,
          });
        }
      }
      if (squad.captainId !== null) {
        const captain = result.state.participants[squad.captainId];
        if (!captain) {
          violations.push({
            code: 'squad-membership-mismatch',
            detail: `${squad.squadId} captain ${squad.captainId} is unknown`,
          });
        } else if (captain.stats?.organization?.toLowerCase() === 'minion') {
          violations.push({
            code: 'squad-membership-mismatch',
            detail: `${squad.squadId} captain ${squad.captainId} is a minion [rule.monster/captain]`,
          });
        } else if (isDead(captain)) {
          violations.push({
            code: 'squad-membership-mismatch',
            detail: `${squad.squadId} retains dead captain ${squad.captainId}; R-0038 requires automatic detach`,
          });
        }
      }
    }
    // Every stats-tracked, stamina-null participant must be a squad member
    // (the v5 schema relaxation exists ONLY for them).
    for (const participant of Object.values(result.state.participants)) {
      if (
        participant.stats !== null &&
        participant.stamina === null &&
        !memberHome.has(participant.id)
      ) {
        violations.push({
          code: 'squad-membership-mismatch',
          detail: `${participant.id} tracks stats without stamina but is in no squad`,
        });
      }
    }

    // State↔log reconciliation. The squad SET and each squad's total member
    // roster are dispatch-constant (seeding happens at encounter build).
    const beforeSquads = new Map(before.squads.map((squad) => [squad.squadId, squad]));
    const afterSquads = new Map(result.state.squads.map((squad) => [squad.squadId, squad]));
    if ([...beforeSquads.keys()].sort().join(',') !== [...afterSquads.keys()].sort().join(',')) {
      violations.push({
        code: 'squad-membership-mismatch',
        detail: `squad set changed: ${[...beforeSquads.keys()].join(',')} -> ${[...afterSquads.keys()].join(',')}`,
      });
    }

    interface SquadNumberClaim {
      squadId: string;
      from: number;
      to: number;
    }
    interface CaptainClaim {
      squadId: string;
      from: string | null;
      to: string | null;
    }
    const poolClaims = collectClaimRows<SquadNumberClaim>(
      mutations,
      'squadPoolDeltas',
      (claim) => claim?.squadId,
    );
    const poolMaxClaims = collectClaimRows<SquadNumberClaim>(
      mutations,
      'squadPoolMaxDeltas',
      (claim) => claim?.squadId,
    );
    const perMinionClaims = collectClaimRows<SquadNumberClaim>(
      mutations,
      'squadPerMinionDeltas',
      (claim) => claim?.squadId,
    );
    const pendingClaims = collectClaimRows<SquadNumberClaim>(
      mutations,
      'pendingKillsDeltas',
      (claim) => claim?.squadId,
    );
    const captainClaims = collectClaimRows<CaptainClaim>(
      mutations,
      'captainDeltas',
      (claim) => claim?.squadId,
    );
    const deathClaims = new Map<string, string[]>();
    for (const entry of mutations) {
      const deaths = entry.data.squadDeaths;
      if (Array.isArray(deaths)) {
        for (const row of deaths) {
          const claim = row as { squadId?: unknown; memberId?: unknown };
          if (typeof claim?.squadId !== 'string' || typeof claim.memberId !== 'string') continue;
          const list = deathClaims.get(claim.squadId) ?? [];
          list.push(claim.memberId);
          deathClaims.set(claim.squadId, list);
        }
      }
    }
    for (const [squadId, afterSquad] of afterSquads) {
      const beforeSquad = beforeSquads.get(squadId);
      if (!beforeSquad) continue; // squad-set change already flagged
      const beforeRoster = [...beforeSquad.memberIds, ...beforeSquad.deadMemberIds].sort();
      const afterRoster = [...afterSquad.memberIds, ...afterSquad.deadMemberIds].sort();
      if (beforeRoster.join(',') !== afterRoster.join(',')) {
        violations.push({
          code: 'squad-membership-mismatch',
          detail: `${squadId}: total roster changed mid-encounter`,
        });
      }
      // Pool walk.
      violations.push(
        ...walkClaims(
          beforeSquad.pool.current,
          afterSquad.pool.current,
          poolClaims.get(squadId) ?? [],
          {
            from: (claim) => claim.from,
            to: (claim) => claim.to,
            equals: (a, b) => a === b,
            phantom: (claim, walked) => ({
              code: 'phantom-squad-claim',
              detail: `${squadId}: pool claim starts at ${claim.from}, state was ${walked}`,
            }),
            unattributed: (walked) => ({
              code: 'unattributed-squad-change',
              detail: `${squadId}: pool ended at ${afterSquad.pool.current}; claims walk to ${walked}`,
            }),
          },
        ),
      );
      // R-0039 effective maximum walk.
      violations.push(
        ...walkClaims(
          beforeSquad.pool.max,
          afterSquad.pool.max,
          poolMaxClaims.get(squadId) ?? [],
          {
            from: (claim) => claim.from,
            to: (claim) => claim.to,
            equals: (a, b) => a === b,
            phantom: (claim, walked) => ({
              code: 'phantom-squad-claim',
              detail: `${squadId}: pool max claim starts at ${claim.from}, state was ${walked}`,
            }),
            unattributed: (walked) => ({
              code: 'unattributed-squad-change',
              detail: `${squadId}: pool max ended at ${afterSquad.pool.max}; claims walk to ${walked}`,
            }),
          },
        ),
      );
      // R-0039 effective per-minion divisor / area-cap walk.
      violations.push(
        ...walkClaims(
          beforeSquad.perMinionStamina,
          afterSquad.perMinionStamina,
          perMinionClaims.get(squadId) ?? [],
          {
            from: (claim) => claim.from,
            to: (claim) => claim.to,
            equals: (a, b) => a === b,
            phantom: (claim, walked) => ({
              code: 'phantom-squad-claim',
              detail: `${squadId}: per-minion claim starts at ${claim.from}, state was ${walked}`,
            }),
            unattributed: (walked) => ({
              code: 'unattributed-squad-change',
              detail: `${squadId}: per-minion Stamina ended at ${afterSquad.perMinionStamina}; claims walk to ${walked}`,
            }),
          },
        ),
      );
      // pendingKills walk.
      violations.push(
        ...walkClaims(
          beforeSquad.pendingKills,
          afterSquad.pendingKills,
          pendingClaims.get(squadId) ?? [],
          {
            from: (claim) => claim.from,
            to: (claim) => claim.to,
            equals: (a, b) => a === b,
            phantom: (claim, walked) => ({
              code: 'phantom-squad-claim',
              detail: `${squadId}: pendingKills claim starts at ${claim.from}, state was ${walked}`,
            }),
            unattributed: (walked) => ({
              code: 'unattributed-squad-change',
              detail: `${squadId}: pendingKills ended at ${afterSquad.pendingKills}; claims walk to ${walked}`,
            }),
          },
        ),
      );
      // Captain walk.
      violations.push(
        ...walkClaims(
          beforeSquad.captainId,
          afterSquad.captainId,
          captainClaims.get(squadId) ?? [],
          {
            from: (claim) => claim.from,
            to: (claim) => claim.to,
            equals: (a, b) => a === b,
            phantom: (claim, walked) => ({
              code: 'phantom-squad-claim',
              detail: `${squadId}: captain claim starts at ${String(claim.from)}, state was ${String(walked)}`,
            }),
            unattributed: (walked) => ({
              code: 'unattributed-squad-change',
              detail: `${squadId}: captain ended at ${String(afterSquad.captainId)}; claims walk to ${String(walked)}`,
            }),
          },
        ),
      );
      // Death claims: exactly the live→dead transitions, each claimed once.
      const died = afterSquad.deadMemberIds.filter(
        (memberId) => !beforeSquad.deadMemberIds.includes(memberId),
      );
      const claimedDeaths = deathClaims.get(squadId) ?? [];
      for (const memberId of died) {
        if (!claimedDeaths.includes(memberId)) {
          violations.push({
            code: 'unattributed-squad-change',
            detail: `${squadId}: ${memberId} died with no claim`,
          });
        }
      }
      for (const memberId of claimedDeaths) {
        if (!died.includes(memberId)) {
          violations.push({
            code: 'phantom-squad-claim',
            detail: `${squadId}: claims death of ${memberId} but the state shows no such change`,
          });
        }
      }
    }

    // R-0026: the squad-level weakness/immunity step applies at most once
    // per squad per damage instance. Every instance emits exactly one
    // squadDamage receipt; only a test resolution (independent per-target
    // rolls) may carry several instances in one dispatch.
    const receiptCounts = new Map<string, number>();
    for (const entry of result.log) {
      const receipt = entry.data.squadDamage as { squadId?: unknown } | undefined;
      if (typeof receipt?.squadId !== 'string') continue;
      receiptCounts.set(receipt.squadId, (receiptCounts.get(receipt.squadId) ?? 0) + 1);
    }
    const multiInstanceDispatch =
      intent.kind === 'use-effect' && intent.payload.effect.resolution.kind === 'test';
    if (!multiInstanceDispatch) {
      for (const [squadId, count] of receiptCounts) {
        if (count > 1) {
          violations.push({
            code: 'squad-weakness-multiply-applied',
            detail: `${squadId}: ${count} squad damage applications in one instance — weakness/immunity must apply once [R-0026]`,
          });
        }
      }
    }
  }

  // ── Action-economy reconciliation (v6, R-0029/R-0030/R-0032/R-0033) ─────
  // Every new counter/slot walks the SAME claim machinery (walkClaims /
  // reconcileSetClaims — a bespoke walker is a design smell), and capacity
  // checks are RECEIPT-AWARE per R-0030: a counter that rose above its
  // printed capacity WITH a matching rule-violation warning in this
  // dispatch's log is legal state; without one it is corruption. (The
  // check is delta-gated: a counter left above capacity by an earlier,
  // receipted dispatch does not re-flag.)
  {
    const violationReceipts = result.log
      .filter((logEntry) => logEntry.kind === 'warning')
      .map((logEntry) => logEntry.data.ruleViolation as { participantId?: unknown } | undefined)
      .filter(
        (receiptData): receiptData is { participantId?: unknown } => receiptData !== undefined,
      );
    const hasReceiptFor = (participantId: string): boolean =>
      violationReceipts.some((receiptData) => receiptData.participantId === participantId);

    // actionBudget: per participant × cost, {used, granted} walked.
    interface BudgetClaim {
      participantId: string;
      cost: string;
      usedFrom: number;
      usedTo: number;
      grantedFrom: number;
      grantedTo: number;
    }
    const budgetClaims = collectClaimRows<BudgetClaim>(mutations, 'actionBudgetDeltas', (claim) =>
      claim ? `${claim.participantId}\u0000${claim.cost}` : undefined,
    );
    for (const participant of Object.values(result.state.participants)) {
      const beforeParticipant = before.participants[participant.id];
      const costs = new Set<string>([
        ...Object.keys(beforeParticipant?.actionBudget ?? {}),
        ...Object.keys(participant.actionBudget),
      ]);
      for (const [key, rows] of budgetClaims) {
        const [pid, cost] = key.split('\u0000');
        if (pid === participant.id && cost !== undefined && rows.length > 0) costs.add(cost);
      }
      for (const cost of costs) {
        const beforeCell = beforeParticipant?.actionBudget[cost] ?? { used: 0, granted: 0 };
        const afterCell = participant.actionBudget[cost] ?? { used: 0, granted: 0 };
        const claims = budgetClaims.get(`${participant.id}\u0000${cost}`) ?? [];
        violations.push(
          ...walkClaims(
            { used: beforeCell.used, granted: beforeCell.granted },
            { used: afterCell.used, granted: afterCell.granted },
            claims,
            {
              from: (claim) => ({ used: claim.usedFrom, granted: claim.grantedFrom }),
              to: (claim) => ({ used: claim.usedTo, granted: claim.grantedTo }),
              equals: (a, b) => a.used === b.used && a.granted === b.granted,
              phantom: (claim, walked) => ({
                code: 'phantom-budget-claim',
                detail: `${participant.id}/${cost}: claim starts at ${claim.usedFrom}/${claim.grantedFrom}, state was ${walked.used}/${walked.granted}`,
              }),
              unattributed: (walked) => ({
                code: 'unattributed-budget-change',
                detail: `${participant.id}/${cost}: ended at ${afterCell.used}/${afterCell.granted}; claims walk to ${walked.used}/${walked.granted}`,
              }),
            },
          ),
        );
        // Receipt-aware capacity, strictly delta-gated: printed budget is
        // one of each own-turn action [rule.combat/turn]; `granted`
        // counters extend it. Only NEWLY-ADDED overage needs a receipt in
        // this dispatch's log — historical overage was receipted when it
        // arose, and a grant-covered spend adds zero overage (used and
        // granted rise together), so the grant-after-overage sequence is
        // legal state [R-0030].
        const budgetOverageBefore = Math.max(
          0,
          beforeCell.used - (BASE_TURN_BUDGET + beforeCell.granted),
        );
        const budgetOverageAfter = Math.max(
          0,
          afterCell.used - (BASE_TURN_BUDGET + afterCell.granted),
        );
        // R-0033: a squad member's second move action on the squad's shared
        // turn is within the printed minion menu — legal overage, no receipt
        // required [one home: withinMinionMoveMenu].
        const menuMove =
          cost === 'move-action' &&
          withinMinionMoveMenu(
            result.state,
            result.state.turnState?.activeTurnId ?? null,
            participant.id,
            'move-action',
            afterCell.used,
          );
        if (
          budgetOverageAfter > budgetOverageBefore &&
          !menuMove &&
          !hasReceiptFor(participant.id)
        ) {
          violations.push({
            code: 'budget-over-capacity-unreceipted',
            detail: `${participant.id}/${cost}: used ${afterCell.used} of ${BASE_TURN_BUDGET + afterCell.granted} adds overage with no rule-violation receipt [R-0030]`,
          });
        }
      }

      // triggeredThisRound walk + receipt-aware limit.
      interface TriggeredClaim {
        participantId: string;
        from: number;
        to: number;
      }
      const triggeredClaims = collectClaimRows<TriggeredClaim>(
        mutations,
        'triggeredCountDeltas',
        (claim) => claim?.participantId,
      );
      const beforeTriggered = beforeParticipant?.triggeredThisRound ?? 0;
      violations.push(
        ...walkClaims(
          beforeTriggered,
          participant.triggeredThisRound,
          triggeredClaims.get(participant.id) ?? [],
          {
            from: (claim) => claim.from,
            to: (claim) => claim.to,
            equals: (a, b) => a === b,
            phantom: (claim, walked) => ({
              code: 'phantom-triggered-claim',
              detail: `${participant.id}: claim starts at ${claim.from}, state was ${walked}`,
            }),
            unattributed: (walked) => ({
              code: 'unattributed-triggered-change',
              detail: `${participant.id}: ended at ${participant.triggeredThisRound}; claims walk to ${walked}`,
            }),
          },
        ),
      );
      // Strictly delta-gated like the budget check: only newly-added
      // overage beyond the trait limit needs a receipt in this dispatch's
      // log [R-0030] — the same grant-after-overage corner, closed the
      // same way across all three receipt-aware checks.
      const triggeredLimit = participant.traits.triggeredActionLimit;
      const triggeredLimitBefore = beforeParticipant?.traits.triggeredActionLimit ?? triggeredLimit;
      const triggeredOverageBefore = Math.max(0, beforeTriggered - triggeredLimitBefore);
      const triggeredOverageAfter = Math.max(0, participant.triggeredThisRound - triggeredLimit);
      if (triggeredOverageAfter > triggeredOverageBefore && !hasReceiptFor(participant.id)) {
        violations.push({
          code: 'triggered-over-limit-unreceipted',
          detail: `${participant.id}: ${participant.triggeredThisRound} triggered actions of limit ${triggeredLimit} adds overage with no rule-violation receipt [R-0030]`,
        });
      }

      // abilityUses: per participant × abilityKey, counter triple walked.
      interface AbilityUseClaim {
        participantId: string;
        abilityKey: string;
        from: { round: number; turn: number; encounter: number };
        to: { round: number; turn: number; encounter: number };
      }
      const abilityUseClaims = collectClaimRows<AbilityUseClaim>(
        mutations,
        'abilityUseDeltas',
        (claim) => (claim ? `${claim.participantId}\u0000${claim.abilityKey}` : undefined),
      );
      const abilityKeys = new Set<string>([
        ...Object.keys(beforeParticipant?.abilityUses ?? {}),
        ...Object.keys(participant.abilityUses),
      ]);
      for (const [key, rows] of abilityUseClaims) {
        const [pid, abilityKey] = key.split('\u0000');
        if (pid === participant.id && abilityKey !== undefined && rows.length > 0)
          abilityKeys.add(abilityKey);
      }
      const zeroUses = { round: 0, turn: 0, encounter: 0 };
      for (const abilityKey of abilityKeys) {
        const beforeUses = beforeParticipant?.abilityUses[abilityKey] ?? zeroUses;
        const afterUses = participant.abilityUses[abilityKey] ?? zeroUses;
        violations.push(
          ...walkClaims(
            beforeUses,
            afterUses,
            abilityUseClaims.get(`${participant.id}\u0000${abilityKey}`) ?? [],
            {
              from: (claim) => claim.from,
              to: (claim) => claim.to,
              equals: (a, b) =>
                a.round === b.round && a.turn === b.turn && a.encounter === b.encounter,
              phantom: (claim, walked) => ({
                code: 'phantom-ability-use-claim',
                detail: `${participant.id}/${abilityKey}: claim starts at ${JSON.stringify(claim.from)}, state was ${JSON.stringify(walked)}`,
              }),
              unattributed: (walked) => ({
                code: 'unattributed-ability-use-change',
                detail: `${participant.id}/${abilityKey}: ended at ${JSON.stringify(afterUses)}; claims walk to ${JSON.stringify(walked)}`,
              }),
            },
          ),
        );
      }
    }

    // turnState: presence flips need their explicit claims; scalar fields
    // walk under the singleton-key convention (the field name is the key);
    // turnsTaken walks per turn id with receipt-aware allowance capacity.
    const beforeTurn = before.turnState;
    const afterTurn = result.state.turnState;
    if (beforeTurn === null && afterTurn !== null) {
      if (!mutations.some((logEntry) => logEntry.data.turnStateInitialized === true)) {
        violations.push({
          code: 'unattributed-turn-change',
          detail: 'turnState appeared with no turnStateInitialized claim',
        });
      }
    } else if (beforeTurn !== null && afterTurn === null) {
      if (!mutations.some((logEntry) => logEntry.data.turnStateCleared === true)) {
        violations.push({
          code: 'unattributed-turn-change',
          detail: 'turnState vanished with no turnStateCleared claim',
        });
      }
    } else if (
      beforeTurn !== null &&
      afterTurn !== null &&
      // A turnStateInitialized claim re-seeds the whole structure (the
      // warned mid-combat re-begin) — field walks don't apply across it.
      !mutations.some((logEntry) => logEntry.data.turnStateInitialized === true)
    ) {
      interface TurnFieldClaim {
        field: string;
        from: unknown;
        to: unknown;
      }
      const fieldClaims = collectClaimRows<TurnFieldClaim>(
        mutations,
        'turnStateDeltas',
        (claim) => claim?.field,
      );
      const fields = ['round', 'firstSide', 'sideToChoose', 'activeTurnId', 'lastTurnId'] as const;
      for (const field of fields) {
        violations.push(
          ...walkClaims(beforeTurn[field], afterTurn[field], fieldClaims.get(field) ?? [], {
            from: (claim) => claim.from as (typeof beforeTurn)[typeof field],
            to: (claim) => claim.to as (typeof beforeTurn)[typeof field],
            equals: (a, b) => a === b,
            phantom: (claim, walked) => ({
              code: 'phantom-turn-claim',
              detail: `turnState.${field}: claim starts at ${String(claim.from)}, state was ${String(walked)}`,
            }),
            unattributed: (walked) => ({
              code: 'unattributed-turn-change',
              detail: `turnState.${field}: ended at ${String(afterTurn[field])}; claims walk to ${String(walked)}`,
            }),
          }),
        );
      }
      interface TurnsTakenClaim {
        turnId: string;
        from: number;
        to: number;
      }
      const turnsTakenClaims = collectClaimRows<TurnsTakenClaim>(
        mutations,
        'turnsTakenDeltas',
        (claim) => claim?.turnId,
      );
      const turnIds = new Set<string>([
        ...Object.keys(beforeTurn.turnsTaken),
        ...Object.keys(afterTurn.turnsTaken),
        ...turnsTakenClaims.keys(),
      ]);
      for (const turnId of turnIds) {
        const beforeCount = beforeTurn.turnsTaken[turnId] ?? 0;
        const afterCount = afterTurn.turnsTaken[turnId] ?? 0;
        violations.push(
          ...walkClaims(beforeCount, afterCount, turnsTakenClaims.get(turnId) ?? [], {
            from: (claim) => claim.from,
            to: (claim) => claim.to,
            equals: (a, b) => a === b,
            phantom: (claim, walked) => ({
              code: 'phantom-turn-claim',
              detail: `turnsTaken[${turnId}]: claim starts at ${claim.from}, state was ${walked}`,
            }),
            unattributed: (walked) => ({
              code: 'unattributed-turn-change',
              detail: `turnsTaken[${turnId}]: ended at ${afterCount}; claims walk to ${walked}`,
            }),
          }),
        );
        // Receipt-aware allowance, strictly delta-gated like the budget
        // and triggered checks: only newly-added overage beyond the trait
        // allowance needs either a rule-violation receipt or a consumed
        // turn grant (silent printed escape) in this dispatch [R-0030].
        const allowance = result.state.participants[turnId]?.traits.turnAllowance ?? 1;
        const allowanceBefore = before.participants[turnId]?.traits.turnAllowance ?? allowance;
        const turnsOverageBefore = Math.max(0, beforeCount - allowanceBefore);
        const turnsOverageAfter = Math.max(0, afterCount - allowance);
        if (turnsOverageAfter > turnsOverageBefore) {
          const beforeTurnGrantIds = new Set(
            (before.participants[turnId]?.grants ?? [])
              .filter((grant) => grant.kind === 'turn')
              .map((grant) => grant.grantId),
          );
          const grantConsumed = mutations.some(
            (logEntry) =>
              claimed(logEntry.data, 'removedGrantIds').some((id) => beforeTurnGrantIds.has(id)) ||
              (typeof logEntry.data.grantMagnitudeConsumed === 'string' &&
                beforeTurnGrantIds.has(logEntry.data.grantMagnitudeConsumed)),
          );
          if (!grantConsumed && !hasReceiptFor(turnId)) {
            violations.push({
              code: 'turns-over-allowance-unreceipted',
              detail: `${turnId}: ${afterCount} turns of allowance ${allowance} adds overage with neither a rule-violation receipt nor a consumed turn grant [R-0030]`,
            });
          }
        }
      }
    }

    // villainActions: the per-round flag walks; per-encounter spends are a
    // set reconciliation.
    interface VillainClaim {
      usedThisRoundFrom: boolean;
      usedThisRoundTo: boolean;
    }
    const villainClaims: VillainClaim[] = mutations.flatMap((logEntry) => {
      const rows = logEntry.data.villainEconomyDeltas;
      return Array.isArray(rows) ? (rows as VillainClaim[]) : [];
    });
    violations.push(
      ...walkClaims(
        before.villainActions.usedThisRound,
        result.state.villainActions.usedThisRound,
        villainClaims,
        {
          from: (claim) => claim.usedThisRoundFrom,
          to: (claim) => claim.usedThisRoundTo,
          equals: (a, b) => a === b,
          phantom: (claim, walked) => ({
            code: 'phantom-villain-claim',
            detail: `usedThisRound claim starts at ${String(claim.usedThisRoundFrom)}, state was ${String(walked)}`,
          }),
          unattributed: (walked) => ({
            code: 'unattributed-villain-change',
            detail: `usedThisRound ended at ${String(result.state.villainActions.usedThisRound)}; claims walk to ${String(walked)}`,
          }),
        },
      ),
    );
    violations.push(
      ...reconcileSetClaims(
        before.villainActions.usedByAbility,
        result.state.villainActions.usedByAbility,
        mutations.flatMap((logEntry) => [
          ...claimed(logEntry.data, 'villainAbilityUses').map((id) => ({
            op: 'added' as const,
            id,
          })),
          ...claimed(logEntry.data, 'villainAbilitiesCleared').map((id) => ({
            op: 'removed' as const,
            id,
          })),
        ]),
        {
          unattributed: (op, id) => ({
            code: 'unattributed-villain-change',
            detail: `villain ability ${id} ${op === 'added' ? 'spent' : 'cleared'} with no claim`,
          }),
          phantom: (op, id) => ({
            code: 'phantom-villain-claim',
            detail: `mutation entry claims ${op} villain ability ${id} but the state shows no such change`,
          }),
        },
      ).violations,
    );

    // resolutionStack: id uniqueness, membership, phase walk, and
    // append-only modification counts.
    const seenResolutionIds = new Set<string>();
    for (const stackEntry of result.state.resolutionStack) {
      if (seenResolutionIds.has(stackEntry.resolutionId)) {
        violations.push({ code: 'duplicate-resolution-id', detail: stackEntry.resolutionId });
      }
      seenResolutionIds.add(stackEntry.resolutionId);
    }
    const openedClaims: string[] = [];
    for (const logEntry of mutations) {
      const opened = logEntry.data.resolutionOpened as { resolutionId?: unknown } | undefined;
      if (typeof opened?.resolutionId === 'string') openedClaims.push(opened.resolutionId);
    }
    violations.push(
      ...reconcileSetClaims(
        before.resolutionStack.map((stackEntry) => stackEntry.resolutionId),
        result.state.resolutionStack.map((stackEntry) => stackEntry.resolutionId),
        [
          ...openedClaims.map((id) => ({ op: 'added' as const, id })),
          ...mutations.flatMap((logEntry) =>
            claimed(logEntry.data, 'resolutionsCleared').map((id) => ({
              op: 'removed' as const,
              id,
            })),
          ),
        ],
        {
          unattributed: (op, id) => ({
            code: 'unattributed-resolution-change',
            detail: `resolution ${id} ${op === 'added' ? 'appeared' : 'vanished'} with no claim`,
          }),
          phantom: (op, id) => ({
            code: 'phantom-resolution-claim',
            detail: `mutation entry claims ${op} resolution ${id} but the state shows no such change`,
          }),
        },
      ).violations,
    );
    interface PhaseClaim {
      resolutionId: string;
      from: string;
      to: string;
    }
    const phaseClaims = collectClaimRows<PhaseClaim>(
      mutations,
      'resolutionPhaseDeltas',
      (claim) => claim?.resolutionId,
    );
    interface ModificationCountClaim {
      resolutionId: string;
      from: number;
      to: number;
    }
    const modificationClaims = collectClaimRows<ModificationCountClaim>(
      mutations,
      'resolutionModificationDeltas',
      (claim) => claim?.resolutionId,
    );
    const beforeEntries = new Map(
      before.resolutionStack.map((stackEntry) => [stackEntry.resolutionId, stackEntry]),
    );
    for (const stackEntry of result.state.resolutionStack) {
      const beforeEntry = beforeEntries.get(stackEntry.resolutionId);
      violations.push(
        ...walkClaims(
          beforeEntry?.phase ?? 'rolled',
          stackEntry.phase,
          phaseClaims.get(stackEntry.resolutionId) ?? [],
          {
            from: (claim) => claim.from,
            to: (claim) => claim.to,
            equals: (a, b) => a === b,
            phantom: (claim, walked) => ({
              code: 'phantom-resolution-claim',
              detail: `${stackEntry.resolutionId}: phase claim starts at ${claim.from}, state was ${walked}`,
            }),
            unattributed: (walked) => ({
              code: 'unattributed-resolution-change',
              detail: `${stackEntry.resolutionId}: phase ended at ${stackEntry.phase}; claims walk to ${walked}`,
            }),
          },
        ),
      );
      violations.push(
        ...walkClaims(
          beforeEntry?.modifications.length ?? 0,
          stackEntry.modifications.length,
          modificationClaims.get(stackEntry.resolutionId) ?? [],
          {
            from: (claim) => claim.from,
            to: (claim) => claim.to,
            equals: (a, b) => a === b,
            phantom: (claim, walked) => ({
              code: 'phantom-resolution-claim',
              detail: `${stackEntry.resolutionId}: modification-count claim starts at ${claim.from}, state was ${walked}`,
            }),
            unattributed: (walked) => ({
              code: 'unattributed-resolution-change',
              detail: `${stackEntry.resolutionId}: ${stackEntry.modifications.length} modifications; claims walk to ${walked}`,
            }),
          },
        ),
      );
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
    // (Per-binding refusals don't refuse the dispatch.)
    const refused = result.log.some(
      (entry) => entry.kind === 'refusal' && entry.data.perBinding !== true,
    );
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

  // A refused DISPATCH must leave the world untouched. A PER-BINDING refusal
  // (data.perBinding, the R-0027 minion exemptions) voids only its own
  // binding — sibling bindings legitimately mutate, so those entries are
  // exempt here.
  if (result.log.some((entry) => entry.kind === 'refusal' && entry.data.perBinding !== true)) {
    if (JSON.stringify(result.state) !== JSON.stringify(before)) {
      violations.push({ code: 'refusal-with-change', detail: 'refusal entry but state changed' });
    }
    if (mutations.length > 0) {
      violations.push({ code: 'refusal-with-change', detail: 'refusal entry alongside mutations' });
    }
  }

  return violations;
}
