import type { LifecycleContext } from './condition-lifecycle.js';
import type {
  EncounterState,
  Grant,
  GrantScope,
  LogEntry,
  NextRollGrant,
  ParticipantState,
} from './schemas.js';

/**
 * Next-roll grant lifecycle substrate (R-0012..R-0016,
 * docs/next-roll-grant-design.md) — the SHARED add/consume/expiry helpers
 * every grant-carrying mechanism reuses (the Glowing Eyes lesson: the first
 * implementer ships the substrate, not a copy-paste special case).
 *
 * The arithmetic itself stays in resolvePowerRoll — grants only CONTRIBUTE
 * counts to the one cap-then-cancel home [R-0015]; nothing here re-derives
 * roll math.
 */

/** Canon artifact ids this substrate's behavior traces to (pointers only). */
export const GRANT_CANON = {
  edge: 'mcdm.heroes.v1/rule.dice/edge',
  bane: 'mcdm.heroes.v1/rule.dice/bane',
  powerRoll: 'mcdm.heroes.v1/rule.dice/power-roll',
  strike: 'mcdm.heroes.v1/rule.combat/strike',
  endOfTurn: 'mcdm.heroes.v1/rule.combat/end-of-turn',
  endingEffects: 'mcdm.heroes.v1/chapter/classes#ending-effects',
  stackingUniqueEffects: 'mcdm.heroes.v1/chapter/classes#stacking-unique-effects',
  rollAgainstMultipleCreatures: 'mcdm.heroes.v1/chapter/classes#roll-against-multiple-creatures',
} as const;

function entry(
  context: LifecycleContext,
  kind: LogEntry['kind'],
  message: string,
  canonRefs: string[],
  data: Record<string, unknown>,
): LogEntry {
  return { kind, intentId: context.intentId, actor: context.actor, canonRefs, message, data };
}

function withParticipant(state: EncounterState, participant: ParticipantState): EncounterState {
  return {
    ...state,
    participants: { ...state.participants, [participant.id]: participant },
  };
}

/** A grant's contribution to the roll's modifier pool [R-0015]: it enters
 * the normal count → cap → cancel arithmetic, nothing bespoke. */
export function grantContribution(polarity: NextRollGrant['polarity']): {
  edges: number;
  banes: number;
} {
  switch (polarity) {
    case 'edge':
      return { edges: 1, banes: 0 };
    case 'double-edge':
      return { edges: 2, banes: 0 };
    case 'bane':
      return { edges: 0, banes: 1 };
    case 'double-bane':
      return { edges: 0, banes: 2 };
  }
}

/** R-0013 consumption predicate: does a roll of this kind consume/see a
 * grant of this scope? A strike is an ability roll with the Strike keyword;
 * a test is a power roll but never a strike; saving throws never arrive
 * here (they are d10 rolls, not power rolls). */
export function scopeMatchesRoll(
  scope: GrantScope,
  roll: { kind: 'ability-roll' | 'test'; isStrike: boolean },
): boolean {
  if (scope === 'power-roll') return true;
  return roll.kind === 'ability-roll' && roll.isStrike;
}

/** The attacker/target binding of one roll-consumption question. `targetId`
 * null = the roll-wide (uniform) pool question. */
export interface RollBinding {
  attackerId: string;
  targetId: string | null;
}

/**
 * The ONE consumption predicate for next-roll grants over a roll — taken as
 * the (grant, roll, binding) TRIPLE so per-target-scoped consumption can
 * land as a predicate change, not a call-site rewrite: the squad-attack
 * family's proposed R-0034(d) scopes a squad member's outbound grants to
 * the targets THAT member attacks. Today the binding does not narrow
 * consumption (R-0013's roll-shape rule is binding-independent); the
 * parameter is the seam.
 */
export function grantConsumedByRoll(
  grant: NextRollGrant,
  roll: { kind: 'ability-roll' | 'test'; isStrike: boolean },
  _binding: RollBinding,
): boolean {
  return scopeMatchesRoll(grant.scope, roll);
}

export interface AddGrantArgs {
  target: ParticipantState;
  grant: NextRollGrant;
}

/**
 * Add a grant to its holder, collapsing a same-ability duplicate: an
 * existing grant with the same source ability, polarity, scope, and
 * direction is REPLACED (the most recent applies)
 * [classes#stacking-unique-effects, R-0014]. Different abilities coexist
 * and combine at roll time through the normal arithmetic.
 */
export function addGrant(
  state: EncounterState,
  { target, grant }: AddGrantArgs,
  context: LifecycleContext,
): { state: EncounterState; log: LogEntry[] } {
  const log: LogEntry[] = [];
  const collapsed = target.grants.filter(
    (existing) =>
      existing.kind === 'next-roll' &&
      existing.source.effectArtifactId !== undefined &&
      existing.source.effectArtifactId === grant.source.effectArtifactId &&
      existing.polarity === grant.polarity &&
      existing.scope === grant.scope &&
      existing.direction === grant.direction,
  );
  const kept = target.grants.filter((existing) => !collapsed.includes(existing));
  if (collapsed.length > 0) {
    log.push(
      entry(
        context,
        'mutation',
        `a repeated use of the same ability replaces its pending ${grant.polarity} on ${target.id} (same-ability effects don't stack)`,
        [GRANT_CANON.stackingUniqueEffects],
        { removedGrantIds: collapsed.map((existing) => existing.grantId) },
      ),
    );
  }
  log.push(
    entry(
      context,
      'mutation',
      `${target.id} ${grant.direction === 'inbound' ? 'is marked: the next qualifying strike against them' : `holds a pending ${grant.polarity} on their next ${grant.scope === 'strike' ? 'strike' : 'power roll'}`}${grant.direction === 'inbound' ? ` carries a ${grant.polarity}` : ''}${grant.window === 'end-of-targets-next-turn' ? ' (expires at the end of their next turn)' : ''}`,
      [
        grant.polarity === 'edge' || grant.polarity === 'double-edge'
          ? GRANT_CANON.edge
          : GRANT_CANON.bane,
        ...(grant.window === 'end-of-targets-next-turn' ? [GRANT_CANON.endOfTurn] : []),
      ],
      { addedGrantIds: [grant.grantId], grantAdded: grant },
    ),
  );
  return {
    state: withParticipant(state, { ...target, grants: [...kept, grant] }),
    log,
  };
}

export interface ConsumedGrant {
  grant: NextRollGrant;
  holderId: string;
}

/** Pure split of a holder's grants by predicate — the caller logs and
 * threads state. */
export function splitGrants(
  holder: ParticipantState,
  shouldConsume: (grant: Grant) => boolean,
): { remaining: Grant[]; consumed: Grant[] } {
  const remaining: Grant[] = [];
  const consumed: Grant[] = [];
  for (const grant of holder.grants) {
    (shouldConsume(grant) ? consumed : remaining).push(grant);
  }
  return { remaining, consumed };
}

/**
 * Per-kind grant lifecycle registry (v6, design §3; red-team F4): each
 * grant kind declares WHERE it expires, so a new kind adds a row here —
 * never a sweep-site special case. Encounter end clears every kind (the
 * R-0012 default posture). Consumption stays with the consumer that owns
 * the kind's semantics (next-roll: the roll path [R-0013..R-0015]; action:
 * the debit home; turn: start-turn).
 */
export const GRANT_KIND_REGISTRY: {
  readonly [K in Grant['kind']]: {
    /** Expires at the HOLDER's end-of-turn sweep. */
    readonly endOfHolderTurn: (grant: Extract<Grant, { kind: K }>) => boolean;
    /** Expires at the start-of-round sweep (end-of-round expiry). */
    readonly endOfRound: (grant: Extract<Grant, { kind: K }>) => boolean;
  };
} = {
  // Windowed next-roll grants expire at the holder's end-turn event
  // [R-0016]; they never carry a round expiry.
  'next-roll': {
    endOfHolderTurn: (grant) => grant.window === 'end-of-targets-next-turn',
    endOfRound: () => false,
  },
  action: {
    endOfHolderTurn: () => false,
    endOfRound: (grant) => grant.expiry === 'end-of-round',
  },
  turn: {
    endOfHolderTurn: () => false,
    endOfRound: (grant) => grant.expiry === 'end-of-round',
  },
};

function grantExpires(grant: Grant, boundary: 'endOfHolderTurn' | 'endOfRound'): boolean {
  switch (grant.kind) {
    case 'next-roll':
      return GRANT_KIND_REGISTRY['next-roll'][boundary](grant);
    case 'action':
      return GRANT_KIND_REGISTRY.action[boundary](grant);
    case 'turn':
      return GRANT_KIND_REGISTRY.turn[boundary](grant);
  }
}

/**
 * Append a non-collapsing grant (action / turn kinds, or a manual
 * next-roll grant the Director asserts) with its machine-readable claim.
 * The next-roll same-ability collapse rule stays in `addGrant` — it is
 * that kind's printed stacking semantics, not a universal one.
 */
export function appendGrant(
  state: EncounterState,
  { target, grant }: { target: ParticipantState; grant: Grant },
  context: LifecycleContext,
): { state: EncounterState; log: LogEntry[] } {
  const description =
    grant.kind === 'action'
      ? `an additional ${grant.cost}${grant.magnitude > 1 ? ` ×${grant.magnitude}` : ''} (escapes: ${
          Object.entries(grant.escapes)
            .filter(([, held]) => held)
            .map(([name]) => name)
            .join(', ') || 'none'
        })`
      : grant.kind === 'turn'
        ? grant.mode === 'allowance'
          ? `${grant.magnitude} extra turn allowance this round${grant.constraint === 'no-consecutive' ? ' (no consecutive turns)' : ''}`
          : 'an inserted out-of-order turn'
        : `a pending ${grant.polarity} on their next ${grant.scope === 'strike' ? 'strike' : 'power roll'}`;
  return {
    state: withParticipant(state, { ...target, grants: [...target.grants, grant] }),
    log: [
      entry(
        context,
        'mutation',
        `${target.id} is granted ${description}`,
        grant.source.effectArtifactId ? [grant.source.effectArtifactId] : [],
        { addedGrantIds: [grant.grantId], grantAdded: grant },
      ),
    ],
  };
}

/** Start-of-round expiry sweep: every grant whose kind's registry row
 * declares an end-of-round expiry clears for every participant. */
export function startOfRoundGrantSweep(
  state: EncounterState,
  context: LifecycleContext,
): { state: EncounterState; log: LogEntry[] } {
  const log: LogEntry[] = [];
  let nextState = state;
  for (const participant of Object.values(state.participants)) {
    const expired = participant.grants.filter((grant) => grantExpires(grant, 'endOfRound'));
    if (expired.length === 0) continue;
    const remaining = participant.grants.filter((grant) => !grantExpires(grant, 'endOfRound'));
    nextState = withParticipant(nextState, { ...participant, grants: remaining });
    log.push(
      entry(
        context,
        'mutation',
        `granted actions/turns on ${participant.id} expire with the round`,
        [GRANT_CANON.endOfTurn],
        { removedGrantIds: expired.map((grant) => grant.grantId), grantsExpired: expired },
      ),
    );
  }
  return { state: nextState, log };
}

/**
 * End-of-turn expiry for one participant's windowed grants [R-0016]: an
 * end-of-targets-next-turn grant expires at the holder's next end-turn
 * event — which is also the current-turn clause ("or the end of their
 * current turn if the effect was imposed on their current turn"), since a
 * grant landing mid-turn meets this sweep at that same turn's end.
 */
export function endOfTurnGrantSweep(
  state: EncounterState,
  target: ParticipantState,
  context: LifecycleContext,
): { state: EncounterState; log: LogEntry[] } {
  const expired = target.grants.filter((grant) => grantExpires(grant, 'endOfHolderTurn'));
  if (expired.length === 0) return { state, log: [] };
  const remaining = target.grants.filter((grant) => !grantExpires(grant, 'endOfHolderTurn'));
  return {
    state: withParticipant(state, { ...target, grants: remaining }),
    log: [
      entry(
        context,
        'mutation',
        `pending next-roll modifiers on ${target.id} expire unconsumed at the end of their turn`,
        [GRANT_CANON.endOfTurn],
        {
          removedGrantIds: expired.map((grant) => grant.grantId),
          grantsExpired: expired,
        },
      ),
    ],
  };
}

/**
 * Encounter-end sweep [R-0012]: every remaining grant clears. Out-of-
 * encounter retention of a beneficial grant by a hero (Ending Effects "if
 * the hero wants them to") is Director/table state — the encounter runtime
 * cannot represent out-of-encounter rolls, so nothing is kept.
 */
export function endEncounterGrantSweep(
  state: EncounterState,
  context: LifecycleContext,
): { state: EncounterState; log: LogEntry[] } {
  const log: LogEntry[] = [];
  let nextState = state;
  for (const participant of Object.values(state.participants)) {
    if (participant.grants.length === 0) continue;
    log.push(
      entry(
        context,
        'mutation',
        `pending grants on ${participant.id} end with the encounter`,
        [GRANT_CANON.endingEffects],
        {
          removedGrantIds: participant.grants.map((grant) => grant.grantId),
          grantsCleared: participant.grants,
        },
      ),
    );
    nextState = withParticipant(nextState, { ...participant, grants: [] });
  }
  return { state: nextState, log };
}
