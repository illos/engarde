import { annotateHeaderCosts } from '@engarde/canon/action-cost';
import {
  compileAbility,
  compileEffectPrograms,
  groupPowerRollClusters,
  resolvePowerRollAbilityHeader,
  tierOutcomeToIntents,
} from '@engarde/canon/effect-conformance';
import { auditGrammarConservation, parseEffectText } from '@engarde/canon/effect-grammar';
import type { StatblockStats } from '@engarde/canon/statblock-stats';
import {
  type ActionGrant,
  type AssertedAbilityUse,
  BUDGET_ACTION_COSTS,
  type DamageType,
  type DriverSquadSeed,
  type EncounterState,
  type Intent,
  type InvariantViolation,
  type LogEntry,
  type ParticipantStats,
  ParticipantStatsSchema,
  type ResolutionModification,
  type TurnGrant,
  type UseAbilityPayloadInput,
  applyIntent,
  checkInvariants,
  createSeededRandomSource,
  initialEncounterState,
  isDead,
  isDying,
  isMinion,
  isWinded,
  openResolutionsOwnedBy,
  squadMemberStats,
  squadSeedWarnings,
  upgradeEncounterState,
} from '@engarde/engine';
import { ConvexError, type Infer, v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { type MutationCtx, type QueryCtx, mutation, query } from './_generated/server';
import { gameRoleFor, requireActiveMember, requireCurrentDirector } from './authz';

// The encounter host (engine-plan 6.3, thin form): the pure engine mounted
// behind the Table. This file owns persistence, authz, and attribution ONLY —
// every game consequence flows through `applyIntent` on engine-validated
// state, ability effects compile from the verbatim canon text seeded in
// `canonRecords` (channel-1 compiler), and whatever the grammar cannot parse
// is surfaced verbatim as a table card, never silently dropped. The host
// never authors rule text or rule semantics (prime directive).
//
// Trust model: any active campaign member at the Table may act, with both
// engine attribution (which participant) and host attribution (which user)
// recorded on every log row — permissive play, receipts always. Starting and
// ending an encounter is the Director's.

const MAX_PARTICIPANTS = 12;
const PARTICIPANT_ID = /^[a-z0-9][a-z0-9-]{0,31}$/;
const LOG_PAGE = 100;
const SEARCH_LIMIT = 12;

const bandValidator = v.union(v.literal('≤11'), v.literal('12-16'), v.literal('17+'));

const endingView = v.union(
  v.literal('save-ends'),
  v.literal('end-of-encounter'),
  v.literal('end-of-targets-next-turn'),
  v.literal('external'),
);

const sideView = v.union(v.literal('heroes'), v.literal('director'));

/** The closed action-cost vocabulary [R-0029] — mirrors the engine enum. */
const actionCostView = v.union(
  v.literal('main-action'),
  v.literal('maneuver'),
  v.literal('move-action'),
  v.literal('triggered-action'),
  v.literal('free-triggered-action'),
  v.literal('free-maneuver'),
  v.literal('no-action'),
  v.literal('villain-action'),
);

/** The three per-turn budget counters — the only costs an `action` grant
 * can extend (a grant of any other cost would be dead: the consumption
 * filter matches only these). Mirrors the engine's one-home
 * BUDGET_ACTION_COSTS enum [M-2]; the pin below fails the compile if the
 * engine enum ever widens without this validator following. */
const budgetActionCostView = v.union(
  v.literal('main-action'),
  v.literal('maneuver'),
  v.literal('move-action'),
);
const _budgetCostDriftPin: readonly Infer<typeof budgetActionCostView>[] = BUDGET_ACTION_COSTS;
void _budgetCostDriftPin;

const grantExpiryView = v.union(v.literal('end-of-round'), v.null());

/** The R-0032 modification vocabulary, mirrored for the view (optional
 * engine members lift to null). */
const modificationView = v.union(
  v.object({ kind: v.literal('downgrade'), toTier: v.union(v.literal(1), v.literal(2)) }),
  v.object({ kind: v.literal('tier-adjust'), delta: v.number(), reason: v.string() }),
  v.object({
    kind: v.literal('potency-adjust'),
    delta: v.number(),
    target: v.union(v.string(), v.null()),
    reason: v.string(),
  }),
  v.object({
    kind: v.literal('retarget'),
    from: v.string(),
    to: v.string(),
    reason: v.string(),
  }),
  v.object({
    kind: v.literal('damage-halve'),
    target: v.union(v.string(), v.null()),
    rounding: v.union(v.literal('down'), v.literal('up')),
    reason: v.string(),
  }),
);

const encounterView = v.union(
  v.null(),
  v.object({
    encounterId: v.id('encounters'),
    status: v.union(v.literal('active'), v.literal('ended')),
    startedAt: v.number(),
    viewerIsDirector: v.boolean(),
    participants: v.array(
      v.object({
        id: v.string(),
        recordId: v.union(v.string(), v.null()),
        recordSlug: v.union(v.string(), v.null()),
        /** The engine's one-home Minion predicate over the stat block —
         * clients never re-derive it from `vitals.organization` (a squad
         * member's vitals are null, so re-derivation misreads them). */
        isMinion: v.boolean(),
        // Vitals from engine state + the health selectors (derived flags are
        // computed, never stored). null = table-mode actor (no automation).
        vitals: v.union(
          v.null(),
          v.object({
            staminaCurrent: v.number(),
            staminaTemporary: v.number(),
            staminaMax: v.number(),
            winded: v.boolean(),
            dying: v.boolean(),
            dead: v.boolean(),
            organization: v.union(v.string(), v.null()),
            /** Remaining/maximum Recoveries [R-0018, R-0019]. null = untracked
             * (Director creatures have none; heroes without character data). */
            recoveriesCurrent: v.union(v.number(), v.null()),
            recoveriesMax: v.union(v.number(), v.null()),
          }),
        ),
        conditions: v.array(
          v.object({
            instanceId: v.string(),
            conditionId: v.string(),
            conditionSlug: v.string(),
            ending: endingView,
            sourceParticipantId: v.union(v.string(), v.null()),
            sourceRecordSlug: v.union(v.string(), v.null()),
          }),
        ),
        /** Pending next-roll edge/bane grants [R-0012..R-0016]. */
        grants: v.array(
          v.object({
            grantId: v.string(),
            polarity: v.union(
              v.literal('edge'),
              v.literal('double-edge'),
              v.literal('bane'),
              v.literal('double-bane'),
            ),
            scope: v.union(v.literal('strike'), v.literal('power-roll')),
            direction: v.union(v.literal('outbound'), v.literal('inbound')),
            window: v.union(v.literal('end-of-targets-next-turn'), v.null()),
            sourceParticipantId: v.union(v.string(), v.null()),
            sourceRecordSlug: v.union(v.string(), v.null()),
          }),
        ),
        /** Pending extra-action grants (v6, R-0030): consumed silently by
         * the one debit home; escapes suppress the matching violation
         * warnings (crit's grant works "even if you are dazed"). */
        actionGrants: v.array(
          v.object({
            grantId: v.string(),
            cost: actionCostView,
            magnitude: v.number(),
            escapes: v.object({
              ignoresDazed: v.boolean(),
              ignoresSurprised: v.boolean(),
              offTurn: v.boolean(),
            }),
            expiry: grantExpiryView,
            sourceParticipantId: v.union(v.string(), v.null()),
            sourceRecordSlug: v.union(v.string(), v.null()),
          }),
        ),
        /** Pending whole-turn scheduling grants (v6, design §3). */
        turnGrants: v.array(
          v.object({
            grantId: v.string(),
            mode: v.union(v.literal('allowance'), v.literal('insertion')),
            magnitude: v.number(),
            constraint: v.union(v.literal('no-consecutive'), v.null()),
            expiry: grantExpiryView,
            sourceParticipantId: v.union(v.string(), v.null()),
            sourceRecordSlug: v.union(v.string(), v.null()),
          }),
        ),
        /** Per-turn action budget cells keyed by the R-0029 cost enum
         * (used/granted counters; capacity = printed 1 + granted). Empty
         * until combat begins. */
        actionBudget: v.record(v.string(), v.object({ used: v.number(), granted: v.number() })),
        /** "You can use one triggered action per round" [Heroes p.267] —
         * the counter and the seeded per-participant limit (Ajax's 3). */
        triggeredThisRound: v.number(),
        triggeredActionLimit: v.number(),
        /** Seeded turn-scheduling traits (v6, design §3): how many turns
         * this participant takes per round (a solo's 2 must never read as a
         * violation), whether consecutive turns are constrained, and the
         * sub-actor binding (a sub-actor acts inside its operator's turn —
         * never a turn taker of its own). */
        turnAllowance: v.number(),
        noConsecutiveTurns: v.boolean(),
        subActorOf: v.union(v.string(), v.null()),
        /** Per-ability usage counters keyed by ability artifact id (the
         * printed once-per-round cap family warns through these). */
        abilityUses: v.record(
          v.string(),
          v.object({ round: v.number(), turn: v.number(), encounter: v.number() }),
        ),
      }),
    ),
    /** Combat turn structure (v6, design §3). Null until begin-combat. */
    turnState: v.union(
      v.null(),
      v.object({
        round: v.number(),
        firstSide: sideView,
        sideToChoose: sideView,
        activeTurnId: v.union(v.string(), v.null()),
        lastTurnId: v.union(v.string(), v.null()),
        /** Turn COUNT per participant/squad id (solos take 2, Ajax 3). */
        turnsTaken: v.record(v.string(), v.number()),
      }),
    ),
    /** Encounter-level villain-action economy (v6): three per creature,
     * once each, no more than one per round even across creatures. */
    villainActions: v.object({
      usedThisRound: v.boolean(),
      usedByAbility: v.array(v.string()),
    }),
    /** OPEN resolution-stack entries [R-0032] — enough for the client's
     * open-roll card: who rolled what, the roll receipt summary, and the
     * recorded modification list (applied in dispatch order at commit). */
    resolutions: v.array(
      v.object({
        resolutionId: v.string(),
        /** A participant id or a squad id (the activeTurnId widening). */
        actorId: v.string(),
        abilityArtifactId: v.string(),
        abilitySlug: v.string(),
        actionCost: v.union(actionCostView, v.null()),
        phase: v.union(v.literal('rolled'), v.literal('committed')),
        roll: v.object({
          dice: v.array(v.number()),
          natural: v.number(),
          total: v.number(),
          tier: v.number(),
        }),
        modifications: v.array(modificationView),
      }),
    ),
    /** Recorded terrain alterations [R-0022]: attributed facts, displayed at
     * the table; the +1-square entry cost stays table-adjudicated. */
    terrainFacts: v.array(
      v.object({
        factId: v.string(),
        terrain: v.literal('difficult'),
        areaText: v.union(v.string(), v.null()),
        sourceRecordSlug: v.union(v.string(), v.null()),
        createdBy: v.union(v.string(), v.null()),
      }),
    ),
    /** Minion squad Stamina pools [R-0023..R-0028]: the squad card is the
     * ONE vitals surface for its members (member `vitals` stay null — the
     * pool is the one home for squad vitality). `withCaptain` is the stat
     * block's VERBATIM "With Captain" entry, present only while a captain
     * is attached (display only, never automated) [R-0028]. */
    squads: v.array(
      v.object({
        squadId: v.string(),
        name: v.string(),
        poolCurrent: v.number(),
        poolMax: v.number(),
        perMinionStamina: v.number(),
        livingMemberIds: v.array(v.string()),
        deadMemberIds: v.array(v.string()),
        pendingKills: v.number(),
        captainId: v.union(v.string(), v.null()),
        withCaptain: v.union(v.string(), v.null()),
        withCaptainBenefit: v.union(
          v.object({ kind: v.literal('strike-edge'), magnitude: v.number(), sourceText: v.string() }),
          v.object({ kind: v.literal('strike-damage'), amount: v.number(), sourceText: v.string() }),
          v.object({ kind: v.literal('stamina'), amount: v.number(), sourceText: v.string() }),
          v.object({
            kind: v.literal('directive'),
            template: v.union(
              v.literal('speed'),
              v.literal('ranged-distance'),
              v.literal('melee-distance'),
              v.literal('forced-movement-distance'),
            ),
            amount: v.number(),
            sourceText: v.string(),
          }),
          v.object({ kind: v.literal('residue'), sourceText: v.string() }),
          v.null(),
        ),
      }),
    ),
  }),
);

function slugOf(artifactId: string): string {
  return artifactId.split('/').pop() ?? artifactId;
}

/** Attribution pair shared by every grant-view mapping. */
function sourceView(source: { participantId?: string; effectArtifactId?: string }): {
  sourceParticipantId: string | null;
  sourceRecordSlug: string | null;
} {
  return {
    sourceParticipantId: source.participantId ?? null,
    sourceRecordSlug: source.effectArtifactId ? slugOf(source.effectArtifactId) : null,
  };
}

/** Lift an engine modification to the view shape (optional target → null). */
function modificationToView(modification: ResolutionModification) {
  switch (modification.kind) {
    case 'downgrade':
      return { kind: 'downgrade' as const, toTier: modification.toTier };
    case 'tier-adjust':
      return {
        kind: 'tier-adjust' as const,
        delta: modification.delta,
        reason: modification.reason,
      };
    case 'potency-adjust':
      return {
        kind: 'potency-adjust' as const,
        delta: modification.delta,
        target: modification.target ?? null,
        reason: modification.reason,
      };
    case 'retarget':
      return {
        kind: 'retarget' as const,
        from: modification.from,
        to: modification.to,
        reason: modification.reason,
      };
    case 'damage-halve':
      return {
        kind: 'damage-halve' as const,
        target: modification.target ?? null,
        rounding: modification.rounding,
        reason: modification.reason,
      };
  }
}

type DatabaseCtx = QueryCtx | MutationCtx;

async function activeEncounter(
  ctx: DatabaseCtx,
  campaignId: Id<'campaigns'>,
): Promise<Doc<'encounters'> | null> {
  return await ctx.db
    .query('encounters')
    .withIndex('by_campaignId_status', (q) => q.eq('campaignId', campaignId).eq('status', 'active'))
    .unique();
}

async function requireLiveEncounter(
  ctx: DatabaseCtx,
  campaignId: Id<'campaigns'>,
): Promise<Doc<'encounters'>> {
  const encounter = await activeEncounter(ctx, campaignId);
  if (!encounter) throw new ConvexError('No active encounter');
  const session = await ctx.db.get(encounter.sessionId);
  if (!session || session.status !== 'active')
    throw new ConvexError('The session behind this encounter has ended');
  return encounter;
}

async function sha256Text(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function loadRecord(
  ctx: DatabaseCtx,
  artifactId: string,
): Promise<Doc<'canonRecords'> | null> {
  const record = await ctx.db
    .query('canonRecords')
    .withIndex('by_artifactId', (q) => q.eq('artifactId', artifactId))
    .unique();
  if (record && (await sha256Text(record.text)) !== record.textSha256) {
    throw new ConvexError(`Canon record checksum mismatch: ${artifactId}`);
  }
  return record;
}

interface LogRowInput {
  kind: Doc<'encounterLogEntries'>['kind'];
  message: string;
  canonRefs: string[];
  engineActorLabel?: string;
  /** Engine LogEntry.data — persisted verbatim (power-roll-design SE-3). */
  data?: Record<string, unknown>;
  /** The engine dispatch this row receipts (LogEntry.intentId) — the
   * occurrence handle a triggered action can reference [I-6e]. Host-level
   * rows (table cards, NOT-AUTOMATED notes) carry none. */
  intentId?: string;
}

function engineActorLabel(actor: LogEntry['actor']): string {
  return actor.kind === 'director' ? 'director' : actor.participantId;
}

async function appendLog(
  ctx: MutationCtx,
  encounter: Doc<'encounters'>,
  actor: { userId: Id<'users'>; name: string },
  rows: readonly LogRowInput[],
): Promise<number> {
  let seq = encounter.logCount;
  for (const row of rows) {
    seq += 1;
    await ctx.db.insert('encounterLogEntries', {
      campaignId: encounter.campaignId,
      encounterId: encounter._id,
      seq,
      kind: row.kind,
      message: row.message,
      canonRefs: row.canonRefs,
      engineActorLabel: row.engineActorLabel,
      data: row.data,
      intentId: row.intentId,
      actorUserId: actor.userId,
      actorName: actor.name,
      occurredAt: Date.now(),
    });
  }
  return seq;
}

/** Run intents through the pure engine and persist state + the full log
 * sequence (host rows before, engine rows, host receipt rows after) in one
 * transaction. The RNG is seeded per dispatch from (rngSeed, dispatchCount),
 * so every auto-roll is replayable from the stored row. */
async function runIntents(
  ctx: MutationCtx,
  encounter: Doc<'encounters'>,
  actor: { userId: Id<'users'>; name: string },
  intents: readonly Intent[],
  hostRows: { before?: LogRowInput[]; after?: LogRowInput[] } = {},
): Promise<{ violations: InvariantViolation[] }> {
  // Stored states may predate schema v2 — the engine's pure upgrade lifts
  // them losslessly on read (power-roll-design SE-2).
  const initialState = upgradeEncounterState(encounter.state);
  let state = initialState;
  let dispatchCount = encounter.dispatchCount;
  const rows: LogRowInput[] = [...(hostRows.before ?? [])];
  const engineRows: LogRowInput[] = [];
  const allViolations: InvariantViolation[] = [];
  let invariantFailed = false;
  for (const intent of intents) {
    dispatchCount += 1;
    const context = { random: createSeededRandomSource(encounter.rngSeed + dispatchCount) };
    const result = applyIntent(state, intent, context);
    const violations = checkInvariants(state, intent, result);
    for (const violation of violations) {
      rows.push({
        kind: 'invariant-violation',
        message: `${violation.code}: ${violation.detail}`,
        canonRefs: [],
      });
      allViolations.push(violation);
    }
    if (violations.length > 0) {
      invariantFailed = true;
      break;
    }
    state = result.state;
    for (const entry of result.log) {
      engineRows.push({
        kind: entry.kind,
        message: entry.message,
        canonRefs: entry.canonRefs,
        engineActorLabel: engineActorLabel(entry.actor),
        data: entry.data,
        intentId: entry.intentId,
      });
    }
  }
  if (invariantFailed) {
    // An oracle failure invalidates the whole host dispatch. Keep only the
    // attempted-operation and invariant diagnostics; never persist candidate
    // mutation claims or any partial state.
    state = initialState;
  } else {
    rows.push(...engineRows, ...(hostRows.after ?? []));
  }
  const logCount = await appendLog(ctx, encounter, actor, rows);
  await ctx.db.patch(encounter._id, {
    state,
    dispatchCount,
    logCount,
    updatedAt: Date.now(),
  });
  return { violations: allViolations };
}

/** Drop pending-commit payloads whose resolution is no longer OPEN — after
 * a commit, an end-turn force-commit, or a begin-combat stack clear. The
 * store's invariant: its keys are a subset of the open resolution ids. */
async function pruneOpenPayloads(ctx: MutationCtx, encounterId: Id<'encounters'>): Promise<void> {
  const fresh = await ctx.db.get(encounterId);
  if (!fresh) return;
  const stored = (fresh.openPayloads ?? {}) as Record<string, unknown>;
  if (Object.keys(stored).length === 0) return;
  const open = new Set(
    upgradeEncounterState(fresh.state)
      .resolutionStack.filter((entry) => entry.phase === 'rolled')
      .map((entry) => entry.resolutionId),
  );
  const kept = Object.fromEntries(Object.entries(stored).filter(([id]) => open.has(id)));
  if (Object.keys(kept).length !== Object.keys(stored).length) {
    await ctx.db.patch(encounterId, { openPayloads: kept });
  }
}

export const getActive = query({
  args: { campaignId: v.id('campaigns') },
  returns: encounterView,
  handler: async (ctx, args) => {
    const { membership } = await requireActiveMember(ctx, args.campaignId);
    const encounter = await activeEncounter(ctx, args.campaignId);
    if (!encounter) return null;
    const state = upgradeEncounterState(encounter.state);
    return {
      encounterId: encounter._id,
      status: encounter.status,
      startedAt: encounter.startedAt,
      viewerIsDirector: gameRoleFor(membership) === 'director',
      participants: Object.values(state.participants).map((participant) => ({
        id: participant.id,
        recordId: participant.sourceRecordId ?? null,
        recordSlug: participant.sourceRecordId ? slugOf(participant.sourceRecordId) : null,
        isMinion: isMinion(participant),
        vitals:
          participant.stats && participant.stamina
            ? {
                staminaCurrent: participant.stamina.current,
                staminaTemporary: participant.stamina.temporary,
                staminaMax: participant.stats.staminaMax,
                winded: isWinded(participant.stamina.current, participant.stats.staminaMax),
                dying: isDying(participant.stamina.current),
                dead: isDead(participant),
                organization: participant.stats.organization,
                recoveriesCurrent: participant.stamina.recoveries,
                recoveriesMax: participant.stats.recoveriesMax,
              }
            : null,
        conditions: participant.conditions.map((instance) => ({
          instanceId: instance.instanceId,
          conditionId: instance.conditionId,
          conditionSlug: slugOf(instance.conditionId),
          ending: instance.ending.kind,
          sourceParticipantId: instance.source.participantId ?? null,
          sourceRecordSlug: instance.source.effectArtifactId
            ? slugOf(instance.source.effectArtifactId)
            : null,
        })),
        // Next-roll grants keep their v3 shape; the v6 action/turn grant
        // kinds surface in their own lists — split by kind, never mislabeled.
        grants: participant.grants
          .filter(
            (grant): grant is Extract<typeof grant, { kind: 'next-roll' }> =>
              grant.kind === 'next-roll',
          )
          .map((grant) => ({
            grantId: grant.grantId,
            polarity: grant.polarity,
            scope: grant.scope,
            direction: grant.direction,
            window: grant.window,
            ...sourceView(grant.source),
          })),
        actionGrants: participant.grants
          .filter((grant): grant is ActionGrant => grant.kind === 'action')
          .map((grant) => ({
            grantId: grant.grantId,
            cost: grant.cost,
            magnitude: grant.magnitude,
            escapes: grant.escapes,
            expiry: grant.expiry,
            ...sourceView(grant.source),
          })),
        turnGrants: participant.grants
          .filter((grant): grant is TurnGrant => grant.kind === 'turn')
          .map((grant) => ({
            grantId: grant.grantId,
            mode: grant.mode,
            magnitude: grant.magnitude,
            constraint: grant.constraint,
            expiry: grant.expiry,
            ...sourceView(grant.source),
          })),
        actionBudget: participant.actionBudget,
        triggeredThisRound: participant.triggeredThisRound,
        triggeredActionLimit: participant.traits.triggeredActionLimit,
        turnAllowance: participant.traits.turnAllowance,
        noConsecutiveTurns: participant.traits.noConsecutiveTurns,
        subActorOf: participant.traits.subActorOf,
        abilityUses: participant.abilityUses,
      })),
      turnState:
        state.turnState === null
          ? null
          : {
              round: state.turnState.round,
              firstSide: state.turnState.firstSide,
              sideToChoose: state.turnState.sideToChoose,
              activeTurnId: state.turnState.activeTurnId,
              lastTurnId: state.turnState.lastTurnId,
              turnsTaken: state.turnState.turnsTaken,
            },
      villainActions: {
        usedThisRound: state.villainActions.usedThisRound,
        usedByAbility: state.villainActions.usedByAbility,
      },
      resolutions: state.resolutionStack
        .filter((entry) => entry.phase === 'rolled')
        .map((entry) => ({
          resolutionId: entry.resolutionId,
          actorId: entry.actorId,
          abilityArtifactId: entry.abilityArtifactId,
          abilitySlug: slugOf(entry.abilityArtifactId),
          actionCost: entry.actionCost,
          phase: entry.phase,
          roll: {
            dice: [...entry.rollReceipt.dice],
            natural: entry.rollReceipt.natural,
            total: entry.rollReceipt.total,
            tier: entry.rollReceipt.tier,
          },
          modifications: entry.modifications.map(modificationToView),
        })),
      terrainFacts: state.terrainFacts.map((fact) => ({
        factId: fact.factId,
        terrain: fact.terrain,
        areaText: fact.areaText,
        sourceRecordSlug: slugOf(fact.effectArtifactId),
        createdBy: fact.createdBy,
      })),
      squads: state.squads.map((squad) => ({
        squadId: squad.squadId,
        name: squad.name,
        poolCurrent: squad.pool.current,
        poolMax: squad.pool.max,
        perMinionStamina: squad.perMinionStamina,
        livingMemberIds: squad.memberIds,
        deadMemberIds: squad.deadMemberIds,
        pendingKills: squad.pendingKills,
        captainId: squad.captainId,
        // R-0028: the verbatim "With Captain" entry surfaces only while a
        // captain is attached; the squad's statblock (any member's stats)
        // carries it.
        withCaptain:
          squad.captainId !== null ? (squadMemberStats(state, squad)?.withCaptain ?? null) : null,
        withCaptainBenefit:
          squad.captainId !== null
            ? (squadMemberStats(state, squad)?.withCaptainBenefit ?? null)
            : null,
      })),
    };
  },
});

export const listLog = query({
  args: { campaignId: v.id('campaigns'), encounterId: v.id('encounters') },
  returns: v.array(
    v.object({
      entryId: v.id('encounterLogEntries'),
      seq: v.number(),
      kind: v.string(),
      message: v.string(),
      canonRefs: v.array(v.string()),
      engineActorLabel: v.union(v.string(), v.null()),
      data: v.union(v.any(), v.null()),
      /** The engine dispatch this row receipts — the occurrence handle a
       * use-triggered-action trigger can reference [I-6e]; null for
       * host-level rows. */
      intentId: v.union(v.string(), v.null()),
      actorName: v.string(),
      occurredAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    await requireActiveMember(ctx, args.campaignId);
    const encounter = await ctx.db.get(args.encounterId);
    if (!encounter || encounter.campaignId !== args.campaignId)
      throw new ConvexError('Encounter not found');
    const rows = await ctx.db
      .query('encounterLogEntries')
      .withIndex('by_encounterId_seq', (q) => q.eq('encounterId', args.encounterId))
      .order('desc')
      .take(LOG_PAGE);
    return rows.reverse().map((row) => ({
      entryId: row._id,
      seq: row.seq,
      kind: row.kind,
      message: row.message,
      canonRefs: row.canonRefs,
      engineActorLabel: row.engineActorLabel ?? null,
      data: row.data ?? null,
      intentId: row.intentId ?? null,
      actorName: row.actorName,
      occurredAt: row.occurredAt,
    }));
  },
});

// Record search for the play panel: full-text over the human-facing slug,
// with what the grammar can currently do with each hit (parsed tiers = the
// engine-dispatchable part; residue = shown verbatim at the table).
export const searchRecords = query({
  args: { campaignId: v.id('campaigns'), term: v.string() },
  returns: v.array(
    v.object({
      artifactId: v.string(),
      slug: v.string(),
      parsedTiers: v.array(v.string()),
      residueSpans: v.number(),
      effects: v.array(
        v.object({
          effectOrdinal: v.number(),
          sourceText: v.string(),
          resolutionKind: v.union(
            v.literal('damage'),
            v.literal('condition'),
            v.literal('test'),
            v.literal('next-roll-grant'),
            v.literal('spend-recovery'),
            v.literal('regain-stamina'),
            v.literal('temporary-stamina'),
            v.literal('terrain-fact'),
            v.literal('table'),
          ),
        }),
      ),
      /** True when the power-roll cluster compiles — the engine can roll,
       * band, damage, and gate potency itself. */
      autoRollable: v.boolean(),
      hasStats: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    await requireActiveMember(ctx, args.campaignId);
    const term = args.term.trim();
    if (term.length === 0) return [];
    const hits = await ctx.db
      .query('canonRecords')
      .withSearchIndex('search_slug', (q) => q.search('slug', term))
      .take(SEARCH_LIMIT);
    return await Promise.all(
      hits.map(async (hit) => {
        if ((await sha256Text(hit.text)) !== hit.textSha256) {
          throw new ConvexError(`Canon record checksum mismatch: ${hit.artifactId}`);
        }
        const parse = parseEffectText(hit.text);
        const tiers = parse.clauses
          .filter((clause) => clause.kind === 'tier-outcome')
          .map((clause) => clause.data.band);
        const effects = compileEffectPrograms(parse, hit.artifactId);
        return {
          artifactId: hit.artifactId,
          slug: hit.slug,
          parsedTiers: [...new Set(tiers)],
          residueSpans: parse.residue.length,
          effects: effects.map((effect) => ({
            effectOrdinal: effect.effectOrdinal,
            sourceText: effect.sourceText,
            resolutionKind: effect.resolution.kind,
          })),
          autoRollable: 'ability' in compileAbility(parse, hit.artifactId),
          hasStats: hit.statsJson !== undefined,
        };
      }),
    );
  },
});

export const start = mutation({
  args: {
    campaignId: v.id('campaigns'),
    participants: v.array(v.object({ id: v.string(), recordId: v.string() })),
    /** Minion squad seeds [R-0023]: members are participant handles from
     * `participants`. Seeding is the automation boundary — the engine's
     * `initialEncounterState` refuses a canon-incoherent seed (mixed
     * statblock, non-minion, statless or unknown member) and the mutation
     * rejects atomically with its reason; the printed up-to-eight bound
     * warns-and-applies (permissive engine). */
    squads: v.optional(
      v.array(v.object({ squadId: v.string(), name: v.string(), memberIds: v.array(v.string()) })),
    ),
  },
  returns: v.id('encounters'),
  handler: async (ctx, args) => {
    const { profile } = await requireCurrentDirector(ctx, args.campaignId);
    const session = await ctx.db
      .query('sessions')
      .withIndex('by_campaignId_status', (q) =>
        q.eq('campaignId', args.campaignId).eq('status', 'active'),
      )
      .unique();
    if (!session) throw new ConvexError('Start a session before starting an encounter');
    if (await activeEncounter(ctx, args.campaignId))
      throw new ConvexError('An encounter is already running');
    if (args.participants.length === 0 || args.participants.length > MAX_PARTICIPANTS)
      throw new ConvexError(`Choose 1–${MAX_PARTICIPANTS} participants`);
    const statsReceipts: string[] = [];
    const seeded: {
      id: string;
      sourceRecordId: string;
      kind: 'director-creature';
      stats?: ParticipantStats;
    }[] = [];
    for (const participant of args.participants) {
      if (!PARTICIPANT_ID.test(participant.id))
        throw new ConvexError(`Participant handle "${participant.id}" must be short kebab-case`);
      // Participants are real corpus records, never invented (prime directive).
      const record = await loadRecord(ctx, participant.recordId);
      if (!record) throw new ConvexError(`Unknown canon record: ${participant.recordId}`);
      // Deterministic stats from the stat block's checksummed paired JSON
      // (DEC-0008; seeded by `corpus export-records`). Records without stats
      // play in table mode — every damage/potency touch becomes a receipt.
      let stats: ParticipantStats | undefined;
      if (record.statsJson) {
        const parsed = JSON.parse(record.statsJson) as StatblockStats;
        stats = ParticipantStatsSchema.parse({
          staminaMax: parsed.staminaMax,
          characteristics: parsed.characteristics,
          immunities: parsed.immunities,
          weaknesses: parsed.weaknesses,
          potencies: parsed.potencies,
          organization: parsed.organization,
          freeStrike: parsed.freeStrike ?? null,
          // Verbatim "With Captain" entry [R-0028]; `?? null` lifts rows
          // whose statsJson predates the field.
          withCaptain: parsed.withCaptain ?? null,
          withCaptainBenefit: parsed.withCaptainBenefit ?? null,
        });
        for (const row of parsed.unparsedRows) {
          statsReceipts.push(
            `${participant.id}: unreadable stat-block row "${row}" — apply at the table`,
          );
        }
      } else {
        statsReceipts.push(`${participant.id}: no stat automation for this record — table mode`);
      }
      seeded.push({
        id: participant.id,
        sourceRecordId: participant.recordId,
        kind: 'director-creature',
        stats,
      });
    }
    const squadSeeds: DriverSquadSeed[] = (args.squads ?? []).map((squad) => {
      if (!PARTICIPANT_ID.test(squad.squadId))
        throw new ConvexError(`Squad id "${squad.squadId}" must be short kebab-case`);
      return squad;
    });
    // The engine is the one seed validator [R-0023]: a canon-incoherent
    // squad (mixed statblock, non-minion or statless member, duplicate or
    // unknown handle) throws, and the whole start rejects atomically —
    // no encounter row, no partial state.
    let state: EncounterState;
    try {
      state = initialEncounterState(seeded, squadSeeds);
    } catch (error) {
      throw new ConvexError(
        `Encounter seed rejected: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    // The printed "up to eight creatures" bound warns-and-applies
    // (permissive engine, R-0023) — surfaced via the log like every warning.
    const seedWarnings = squadSeedWarnings(squadSeeds);
    const now = Date.now();
    const encounterId = await ctx.db.insert('encounters', {
      campaignId: args.campaignId,
      sessionId: session._id,
      status: 'active',
      state,
      rngSeed: Math.floor(Math.random() * 2 ** 31),
      dispatchCount: 0,
      logCount: 0,
      startedByUserId: profile.userId,
      startedAt: now,
      updatedAt: now,
    });
    const encounter = await ctx.db.get(encounterId);
    if (encounter) {
      const logCount = await appendLog(
        ctx,
        encounter,
        { userId: profile.userId, name: profile.displayName },
        [
          {
            kind: 'informational',
            message: `Encounter started with ${args.participants.map((entry) => entry.id).join(', ')}`,
            canonRefs: [],
          },
          ...state.squads.map(
            (squad): LogRowInput => ({
              kind: 'informational',
              message: `squad ${squad.name} seeded with ${squad.memberIds.join(', ')} — Stamina pool ${squad.pool.current}/${squad.pool.max}`,
              canonRefs: [],
            }),
          ),
          ...seedWarnings.map(
            (message): LogRowInput => ({ kind: 'warning', message, canonRefs: [] }),
          ),
          ...statsReceipts.map(
            (message): LogRowInput => ({ kind: 'not-automated', message, canonRefs: [] }),
          ),
        ],
      );
      await ctx.db.patch(encounterId, { logCount });
    }
    return encounterId;
  },
});

export const useAbility = mutation({
  args: {
    campaignId: v.id('campaigns'),
    artifactId: v.string(),
    actorParticipantId: v.string(),
    targetParticipantIds: v.array(v.string()),
    /** Asserted tier — the manual override, and the only path for abilities
     * whose power-roll cluster the grammar cannot fully compile. */
    band: v.optional(bandValidator),
    /** Asserted dice (manual entry); absent = auto-roll from the encounter's
     * replayable seed. */
    dice: v.optional(v.array(v.number())),
    characteristicChoice: v.optional(v.string()),
    damageCharacteristicChoice: v.optional(v.string()),
    damageTypeChoice: v.optional(v.string()),
    edges: v.optional(v.number()),
    banes: v.optional(v.number()),
    downgradeToTier: v.optional(v.number()),
    knockOut: v.optional(v.boolean()),
    /** Composition reference [design §3]: the parent dispatch's intent id.
     * The inner Charge-keyword ability consumes the parent's already-debited
     * main action, never a second one. */
    partOf: v.optional(v.string()),
    /** `Main action (Adjacent creature)` [R-0029]: the dispatching adjacent
     * operator who pays the budget debit on an operator-paid fixture
     * ability. */
    operatorId: v.optional(v.string()),
    /** Two-phase commit [R-0032]: in combat a rolling dispatch opens a
     * resolution entry, and this host PIPELINES the explicit commit in the
     * same mutation for one-tap UX — the ENGINE never auto-commits. Pass
     * `hold: true` to leave the entry open for reactions/modifications;
     * commit it later via commitResolution (or let end-turn force-commit
     * it). */
    hold: v.optional(v.boolean()),
  },
  /** The opened resolutionId when this dispatch rolled in combat (whether
   * pipelined-committed or held open); null otherwise. */
  returns: v.union(v.null(), v.string()),
  handler: async (ctx, args) => {
    const { profile } = await requireActiveMember(ctx, args.campaignId);
    const encounter = await requireLiveEncounter(ctx, args.campaignId);
    const record = await loadRecord(ctx, args.artifactId);
    if (!record) throw new ConvexError(`Unknown canon record: ${args.artifactId}`);
    const state = upgradeEncounterState(encounter.state);
    if (args.targetParticipantIds.length === 0) throw new ConvexError('Name at least one target');
    for (const participantId of [args.actorParticipantId, ...args.targetParticipantIds]) {
      if (!state.participants[participantId])
        throw new ConvexError(`Unknown participant: ${participantId}`);
    }

    const parse = parseEffectText(record.text);
    const conservation = auditGrammarConservation(record.text, parse);
    if (conservation.length > 0)
      throw new ConvexError(`Grammar conservation failed for ${args.artifactId}`);
    const actor = { userId: profile.userId, name: profile.displayName };
    const residueCards: LogRowInput[] = parse.residue.map((item) => ({
      kind: 'table-card' as const,
      message: item.span.text.trim(),
      canonRefs: [args.artifactId],
    }));

    if (args.band !== undefined) {
      // Asserted-tier path (manual override / grammar fallback): the pilot
      // flow — conditions apply, damage/potency stay receipts.
      const tier = parse.clauses.find(
        (clause) => clause.kind === 'tier-outcome' && clause.data.band === args.band,
      );
      if (!tier || tier.kind !== 'tier-outcome')
        throw new ConvexError(`No parsed tier outcome at ${args.band} in ${record.slug}`);
      // Asserted-band economy parity [B-2, R-0029/R-0030]: an asserted tier
      // is still a USE of the ability, so the dispatch carries the compiled
      // header's cost through the tierOutcomeToIntents binding seam. The
      // owning header comes from the one cluster-ownership home
      // (groupPowerRollClusters) + annotateHeaderCosts on the SAME parse; a
      // tier with no owning header or an unresolved cost carries NO debit —
      // honest residue, never a guessed one.
      const owningCluster = groupPowerRollClusters(parse).find((cluster) =>
        Object.values(cluster.tiers).some((clause) => clause === tier),
      );
      const annotation = owningCluster?.header
        ? annotateHeaderCosts(parse, args.artifactId).get(owningCluster.header)
        : undefined;
      const assertedBase: AssertedAbilityUse | null =
        annotation && annotation.actionCost !== null
          ? {
              actorParticipantId: args.actorParticipantId,
              abilityArtifactId: args.artifactId,
              actionCost: annotation.actionCost,
              usesPerRound: annotation.usesPerRound,
            }
          : null;
      // One ability use, one debit: the first target's first intent pays;
      // every other target's intents share it via partOf (the rolled path's
      // composition semantics).
      const firstIntentId = `d${encounter.dispatchCount + 1}-${record.slug}-t0-0`;
      const intents: Intent[] = [];
      const unexecuted: LogRowInput[] = [];
      for (const [index, targetId] of args.targetParticipantIds.entries()) {
        const execution = tierOutcomeToIntents(tier.data, {
          intentIdPrefix: `d${encounter.dispatchCount + 1}-${record.slug}-t${index}`,
          actorParticipantId: args.actorParticipantId,
          targetParticipantId: targetId,
          effectArtifactId: args.artifactId,
          assertedAbilityUse:
            assertedBase === null
              ? null
              : index === 0
                ? assertedBase
                : { ...assertedBase, partOf: firstIntentId },
        });
        intents.push(...execution.intents);
        unexecuted.push(
          ...execution.unexecuted.map((item) => ({
            kind: 'not-automated' as const,
            message: `${targetId} — ${item.part}: ${item.detail}`,
            canonRefs: [args.artifactId],
          })),
        );
      }
      await runIntents(ctx, encounter, actor, intents, {
        before: [
          {
            kind: 'informational',
            message: `${args.actorParticipantId} uses ${record.slug} (asserted tier ${args.band}) on ${args.targetParticipantIds.join(', ')}`,
            canonRefs: [args.artifactId],
            engineActorLabel: args.actorParticipantId,
          },
        ],
        after: [...unexecuted, ...residueCards],
      });
      return null;
    }

    // Rolled path: the engine resolves the power roll, tier, damage, and
    // potency from the compiled verbatim text (power-roll-design §4.1).
    const compiled = compileAbility(parse, args.artifactId);
    if (!('ability' in compiled))
      throw new ConvexError(
        `${record.slug} cannot be auto-resolved (${compiled.missing.join(', ')}) — assert a tier instead`,
      );
    if (args.dice !== undefined && args.dice.length !== 2)
      throw new ConvexError('Asserted dice must be exactly two d10 results');
    // The payload is built ONCE and JSON-cleaned: commit must re-supply it
    // byte-for-byte in canonical form so the engine's stored SHA-256
    // verifies [R-0032] — the effect-boundary precedent, where executable
    // data is always rebuilt server-side and never crosses the client.
    const intentId = `d${encounter.dispatchCount + 1}-${record.slug}`;
    const payload = JSON.parse(
      JSON.stringify({
        actorParticipantId: args.actorParticipantId,
        ability: compiled.ability,
        targets: args.targetParticipantIds,
        partOf: args.partOf,
        operatorId: args.operatorId,
        dice: args.dice as [number, number] | undefined,
        characteristicChoice: args.characteristicChoice as never,
        damageCharacteristicChoice: args.damageCharacteristicChoice as never,
        damageTypeChoice: args.damageTypeChoice as never,
        edges: args.edges ?? 0,
        banes: args.banes ?? 0,
        downgradeToTier: args.downgradeToTier as 1 | 2 | undefined,
        knockOut: args.knockOut ?? false,
      }),
    ) as UseAbilityPayloadInput;
    const intent: Intent = {
      intentId,
      kind: 'use-ability',
      actor: { kind: 'participant', participantId: args.actorParticipantId },
      payload,
    };
    try {
      await runIntents(ctx, encounter, actor, [intent], {
        before: [
          {
            kind: 'informational',
            message: `${args.actorParticipantId} uses ${record.slug} on ${args.targetParticipantIds.join(', ')}`,
            canonRefs: [args.artifactId],
            engineActorLabel: args.actorParticipantId,
          },
        ],
        after: residueCards,
      });
    } catch (error) {
      if (error instanceof ConvexError) throw error;
      throw new ConvexError(
        `Invalid ability dispatch: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    // ── two-phase commit pipelining [R-0032, design §3] ────────────────────
    // In combat the rolled dispatch opened a resolution entry (its id is
    // this dispatch's intent id). Store the payload for re-supply, then
    // commit in the same mutation unless the caller holds the entry open —
    // the pipelining lives HERE in the host; the engine never auto-commits.
    const afterRoll = await ctx.db.get(encounter._id);
    if (!afterRoll) return null;
    const opened = upgradeEncounterState(afterRoll.state).resolutionStack.find(
      (entry) => entry.resolutionId === intentId && entry.phase === 'rolled',
    );
    if (!opened) return null;
    await ctx.db.patch(encounter._id, {
      openPayloads: {
        ...((afterRoll.openPayloads ?? {}) as Record<string, unknown>),
        [intentId]: payload,
      },
    });
    if (args.hold === true) return intentId;
    const forCommit = await ctx.db.get(encounter._id);
    if (!forCommit) return intentId;
    try {
      await runIntents(ctx, forCommit, actor, [
        {
          intentId: `d${forCommit.dispatchCount + 1}-commit-${record.slug}`,
          kind: 'commit-resolution',
          actor: { kind: 'participant', participantId: args.actorParticipantId },
          payload: { resolutionId: intentId, payload },
        },
      ]);
    } catch (error) {
      if (error instanceof ConvexError) throw error;
      throw new ConvexError(
        `Invalid resolution commit: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    await pruneOpenPayloads(ctx, encounter._id);
    return intentId;
  },
});

/** Compile one ordinal-addressed `Effect:` instruction from the stored canon
 * record and dispatch it through the pure engine. The client supplies only
 * the occurrence and participant bindings; executable data and exact source
 * text are always rebuilt from the checksummed record at the trust boundary. */
export const useEffect = mutation({
  args: {
    campaignId: v.id('campaigns'),
    artifactId: v.string(),
    effectOrdinal: v.number(),
    actorParticipantId: v.string(),
    targetParticipantIds: v.array(v.string()),
    /** Non-participant object targets of a characteristic test — they never
     * roll and automatically obtain a tier 1 result [R-0007]. */
    objectTargetLabels: v.optional(v.array(v.string())),
    knockOut: v.optional(v.boolean()),
    /** Per-offered-participant accept/decline for a spend-recovery
     * resolution [R-0018]: true = spends, false = declines. The engine
     * requires an answer for every bound target. */
    recoverySpends: v.optional(v.record(v.string(), v.boolean())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { profile } = await requireActiveMember(ctx, args.campaignId);
    const encounter = await requireLiveEncounter(ctx, args.campaignId);
    const record = await loadRecord(ctx, args.artifactId);
    if (!record) throw new ConvexError(`Unknown canon record: ${args.artifactId}`);
    const state = upgradeEncounterState(encounter.state);
    for (const participantId of [args.actorParticipantId, ...args.targetParticipantIds]) {
      if (!state.participants[participantId])
        throw new ConvexError(`Unknown participant: ${participantId}`);
    }

    const parse = parseEffectText(record.text);
    const conservation = auditGrammarConservation(record.text, parse);
    if (conservation.length > 0)
      throw new ConvexError(`Grammar conservation failed for ${args.artifactId}`);
    const effect = compileEffectPrograms(parse, args.artifactId).find(
      (candidate) => candidate.effectOrdinal === args.effectOrdinal,
    );
    if (!effect)
      throw new ConvexError(`No Effect instruction #${args.effectOrdinal} in ${record.slug}`);

    const intent: Intent = {
      intentId: `d${encounter.dispatchCount + 1}-${record.slug}-effect-${effect.effectOrdinal}`,
      kind: 'use-effect',
      actor: { kind: 'participant', participantId: args.actorParticipantId },
      payload: {
        actorParticipantId: args.actorParticipantId,
        effect,
        targets: args.targetParticipantIds,
        objectTargets: args.objectTargetLabels ?? [],
        knockOut: args.knockOut ?? false,
        recoverySpends: args.recoverySpends,
      },
    };
    try {
      await runIntents(ctx, encounter, { userId: profile.userId, name: profile.displayName }, [
        intent,
      ]);
    } catch (error) {
      if (error instanceof ConvexError) throw error;
      throw new ConvexError(
        `Invalid Effect dispatch: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return null;
  },
});

export const endTurn = mutation({
  args: {
    campaignId: v.id('campaigns'),
    /** The ending turn's id — a participant id, or a squad id (a squad
     * occupies one turn slot [R-0033]). */
    participantId: v.string(),
    rolls: v.optional(v.record(v.string(), v.number())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { profile } = await requireActiveMember(ctx, args.campaignId);
    const encounter = await requireLiveEncounter(ctx, args.campaignId);
    const state = upgradeEncounterState(encounter.state);
    // end-turn FORCE-COMMITS the ending actor's open resolutions first
    // [design §3, R-0032] — printed damage is never discarded. The engine
    // requires each payload re-supplied; this host holds them in the
    // pending-commit store, so the client never ships payload bytes.
    const endingSquad = state.squads.find((squad) => squad.squadId === args.participantId);
    const owned =
      state.turnState === null
        ? []
        : openResolutionsOwnedBy(state, [
            args.participantId,
            ...(endingSquad ? endingSquad.memberIds : []),
          ]);
    const stored = (encounter.openPayloads ?? {}) as Record<string, UseAbilityPayloadInput>;
    const commitPayloads: Record<string, UseAbilityPayloadInput> = {};
    for (const entry of owned) {
      const payload = stored[entry.resolutionId];
      if (payload === undefined) {
        throw new ConvexError(
          `resolution ${entry.resolutionId} is open but this host holds no payload for it — commit or modify it explicitly before ending the turn`,
        );
      }
      commitPayloads[entry.resolutionId] = payload;
    }
    await runIntents(ctx, encounter, { userId: profile.userId, name: profile.displayName }, [
      {
        intentId: `d${encounter.dispatchCount + 1}-end-turn`,
        kind: 'end-turn',
        actor: { kind: 'participant', participantId: args.participantId },
        payload: { participantId: args.participantId, rolls: args.rolls, commitPayloads },
      },
    ]);
    await pruneOpenPayloads(ctx, encounter._id);
    return null;
  },
});

export const removeCondition = mutation({
  args: {
    campaignId: v.id('campaigns'),
    targetParticipantId: v.string(),
    instanceId: v.string(),
    asParticipantId: v.optional(v.string()),
    reason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { profile, membership } = await requireActiveMember(ctx, args.campaignId);
    const encounter = await requireLiveEncounter(ctx, args.campaignId);
    if (!args.asParticipantId && gameRoleFor(membership) !== 'director')
      throw new ConvexError('Name the participant acting, or ask the Director');
    await runIntents(ctx, encounter, { userId: profile.userId, name: profile.displayName }, [
      {
        intentId: `d${encounter.dispatchCount + 1}-remove`,
        kind: 'remove-condition',
        actor: args.asParticipantId
          ? { kind: 'participant', participantId: args.asParticipantId }
          : { kind: 'director' },
        payload: {
          target: args.targetParticipantId,
          instanceId: args.instanceId,
          reason: args.reason,
        },
      },
    ]);
    return null;
  },
});

/** Remove one recorded terrain fact [R-0022]. Terrain clearing is Director
 * adjudication (rubble cleared, paste scraped away) — unlike condition
 * removal there is no acting-participant path, so the director game role is
 * always required. */
export const clearTerrainFact = mutation({
  args: {
    campaignId: v.id('campaigns'),
    factId: v.string(),
    reason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { profile, membership } = await requireActiveMember(ctx, args.campaignId);
    if (gameRoleFor(membership) !== 'director')
      throw new ConvexError('Clearing terrain is the Director’s adjudication');
    const encounter = await requireLiveEncounter(ctx, args.campaignId);
    await runIntents(ctx, encounter, { userId: profile.userId, name: profile.displayName }, [
      {
        intentId: `d${encounter.dispatchCount + 1}-clear-terrain`,
        kind: 'clear-terrain-fact',
        actor: { kind: 'director' },
        payload: { factId: args.factId, reason: args.reason },
      },
    ]);
    return null;
  },
});

/** Manual damage assertion — the host surface for the apply-damage intent.
 * Director adjudication (the clearTerrainFact authority pattern): raw damage
 * entry is table adjudication, not a player ability dispatch. Passes the
 * R-0025 `area` discriminator and the R-0024 `minionKillVictims` naming
 * through to the engine untouched; a living squad member's damage decrements
 * the shared pool (the engine routes it — one home). */
export const applyDamage = mutation({
  args: {
    campaignId: v.id('campaigns'),
    targetParticipantId: v.string(),
    amount: v.number(),
    damageType: v.optional(v.string()),
    reason: v.string(),
    knockOut: v.optional(v.boolean()),
    /** Dispatch-asserted area source [R-0025] — hazards and other
     * non-ability area damage carry no Area keyword. */
    area: v.optional(v.boolean()),
    /** Damager-named extra victims when one instance kills beyond the
     * damaged target [R-0024]. */
    minionKillVictims: v.optional(v.array(v.string())),
    /** Optional assertion that this manually entered damage realizes a
     * printed ability use [N-3]. The host derives cost/cap from canon; the
     * client cannot author either value. */
    abilityAssertion: v.optional(
      v.object({
        actorParticipantId: v.string(),
        /** Bare record only when it has one power-roll ability; multi-
         * ability stat blocks require `record#ability-slug`. */
        abilityArtifactId: v.string(),
        partOf: v.optional(v.string()),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { profile, membership } = await requireActiveMember(ctx, args.campaignId);
    if (gameRoleFor(membership) !== 'director')
      throw new ConvexError('Manual damage entry is the Director’s adjudication');
    const encounter = await requireLiveEncounter(ctx, args.campaignId);
    let assertedAbilityUse: AssertedAbilityUse | null = null;
    if (args.abilityAssertion !== undefined) {
      const assertion = args.abilityAssertion;
      const state = upgradeEncounterState(encounter.state);
      if (!state.participants[assertion.actorParticipantId])
        throw new ConvexError(`Unknown participant: ${assertion.actorParticipantId}`);
      const baseArtifactId = assertion.abilityArtifactId.split('#')[0] ?? '';
      const record = await loadRecord(ctx, baseArtifactId);
      if (!record) throw new ConvexError(`Unknown canon record: ${baseArtifactId}`);
      const parse = parseEffectText(record.text);
      const conservation = auditGrammarConservation(record.text, parse);
      if (conservation.length > 0)
        throw new ConvexError(`Grammar conservation failed for ${baseArtifactId}`);
      const resolved = resolvePowerRollAbilityHeader(
        parse,
        baseArtifactId,
        assertion.abilityArtifactId,
      );
      if (resolved === null) {
        throw new ConvexError(
          `Cannot derive one printed power-roll ability from ${assertion.abilityArtifactId}; use an exact record#ability-slug reference`,
        );
      }
      assertedAbilityUse = {
        actorParticipantId: assertion.actorParticipantId,
        abilityArtifactId: resolved.abilityArtifactId,
        actionCost: resolved.annotation.actionCost,
        usesPerRound: resolved.annotation.usesPerRound,
        ...(assertion.partOf === undefined ? {} : { partOf: assertion.partOf }),
      };
    }
    const intent: Intent = {
      intentId: `d${encounter.dispatchCount + 1}-apply-damage`,
      kind: 'apply-damage',
      actor:
        assertedAbilityUse === null
          ? { kind: 'director' }
          : { kind: 'participant', participantId: assertedAbilityUse.actorParticipantId },
      payload: {
        target: args.targetParticipantId,
        amount: args.amount,
        damageType: args.damageType as DamageType | undefined,
        reason: args.reason,
        knockOut: args.knockOut ?? false,
        area: args.area ?? false,
        minionKillVictims: args.minionKillVictims ?? [],
        assertedAbilityUse,
      },
    };
    try {
      await runIntents(ctx, encounter, { userId: profile.userId, name: profile.displayName }, [
        intent,
      ]);
    } catch (error) {
      if (error instanceof ConvexError) throw error;
      throw new ConvexError(
        `Invalid damage dispatch: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return null;
  },
});

/** Name the victims of pool-counted kills [R-0024]: "the minions nearest to
 * those taken out suffer the same fate" is spatial, so the table names them.
 * Director adjudication (the clearTerrainFact authority pattern); the engine
 * refuses non-living or over-counted victims with receipts. */
export const resolvePendingKills = mutation({
  args: {
    campaignId: v.id('campaigns'),
    squadId: v.string(),
    victimMemberIds: v.array(v.string()),
    reason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { profile, membership } = await requireActiveMember(ctx, args.campaignId);
    if (gameRoleFor(membership) !== 'director')
      throw new ConvexError('Naming pending-kill victims is the Director’s adjudication');
    const encounter = await requireLiveEncounter(ctx, args.campaignId);
    try {
      await runIntents(ctx, encounter, { userId: profile.userId, name: profile.displayName }, [
        {
          intentId: `d${encounter.dispatchCount + 1}-resolve-pending-kills`,
          kind: 'resolve-pending-kills',
          actor: { kind: 'director' },
          payload: {
            squadId: args.squadId,
            victimMemberIds: args.victimMemberIds,
            reason: args.reason,
          },
        },
      ]);
    } catch (error) {
      if (error instanceof ConvexError) throw error;
      throw new ConvexError(
        `Invalid pending-kill dispatch: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return null;
  },
});

/** Attach a captain to a squad [R-0028]. Director adjudication (the
 * clearTerrainFact authority pattern); the engine warns-and-replaces over an
 * existing captain and warns-and-moves a captain attached elsewhere — the
 * Director exercising the printed one-captain rule — and refuses a minion
 * captain. Captain Stamina stays individual, never pooled. */
export const attachCaptain = mutation({
  args: {
    campaignId: v.id('campaigns'),
    squadId: v.string(),
    captainId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { profile, membership } = await requireActiveMember(ctx, args.campaignId);
    if (gameRoleFor(membership) !== 'director')
      throw new ConvexError('Captain attachment is the Director’s adjudication');
    const encounter = await requireLiveEncounter(ctx, args.campaignId);
    await runIntents(ctx, encounter, { userId: profile.userId, name: profile.displayName }, [
      {
        intentId: `d${encounter.dispatchCount + 1}-attach-captain`,
        kind: 'attach-captain',
        actor: { kind: 'director' },
        payload: { squadId: args.squadId, captainId: args.captainId },
      },
    ]);
    return null;
  },
});

/** Detach a squad's captain [R-0028] — on death or the Director's call;
 * succession is the Director re-attaching. Director adjudication (the
 * clearTerrainFact authority pattern). */
export const detachCaptain = mutation({
  args: {
    campaignId: v.id('campaigns'),
    squadId: v.string(),
    reason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { profile, membership } = await requireActiveMember(ctx, args.campaignId);
    if (gameRoleFor(membership) !== 'director')
      throw new ConvexError('Captain detachment is the Director’s adjudication');
    const encounter = await requireLiveEncounter(ctx, args.campaignId);
    await runIntents(ctx, encounter, { userId: profile.userId, name: profile.displayName }, [
      {
        intentId: `d${encounter.dispatchCount + 1}-detach-captain`,
        kind: 'detach-captain',
        actor: { kind: 'director' },
        payload: { squadId: args.squadId, reason: args.reason },
      },
    ]);
    return null;
  },
});

// ─── action economy + two-phase commit (v6, R-0029..R-0033) ─────────────────
// Turn-rail mutations are the Director's (the encounter-start authority
// pattern): begin-combat, start-turn, advance-round, add-grant,
// use-villain-action. Play mutations stay member-reachable with attribution
// (permissive play, receipts always): use-ability, use-triggered-action,
// convert-action (the conversion is the acting participant's own printed
// choice [I-5]), modify-resolution, commit-resolution.

export const beginCombat = mutation({
  args: {
    campaignId: v.id('campaigns'),
    /** The side taking the first turn — the table's outcome of the printed
     * procedure [rule.combat/combat-round §Determine Who Goes First]. */
    firstSide: sideView,
    /** The automatic case: a side that is entirely surprised cedes first
     * action. */
    surprisedSide: v.optional(sideView),
    /** Asserted d10 (manual entry wins); absent = server-rolled from the
     * encounter's replayable seed — the established server-dice path. */
    roll: v.optional(v.number()),
    /** Who made the 1–5/6+ choice, when asserted; a deviation from the
     * rolled assignment is warn-and-apply (R-0030). */
    chosenBy: v.optional(v.union(v.literal('players'), v.literal('director'))),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { profile } = await requireCurrentDirector(ctx, args.campaignId);
    const encounter = await requireLiveEncounter(ctx, args.campaignId);
    try {
      await runIntents(ctx, encounter, { userId: profile.userId, name: profile.displayName }, [
        {
          intentId: `d${encounter.dispatchCount + 1}-begin-combat`,
          kind: 'begin-combat',
          actor: { kind: 'director' },
          payload: {
            firstSide: args.firstSide,
            surprisedSide: args.surprisedSide ?? null,
            roll: args.roll as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | undefined,
            chosenBy: args.chosenBy,
          },
        },
      ]);
    } catch (error) {
      if (error instanceof ConvexError) throw error;
      throw new ConvexError(
        `Invalid begin-combat dispatch: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    // A mid-combat re-begin clears the resolution stack — drop held payloads.
    await pruneOpenPayloads(ctx, encounter._id);
    return null;
  },
});

export const startTurn = mutation({
  args: {
    campaignId: v.id('campaigns'),
    /** A participant id or squad id (a squad occupies one turn slot,
     * R-0033). R-0030 violations warn-and-apply. */
    turnId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { profile } = await requireCurrentDirector(ctx, args.campaignId);
    const encounter = await requireLiveEncounter(ctx, args.campaignId);
    await runIntents(ctx, encounter, { userId: profile.userId, name: profile.displayName }, [
      {
        intentId: `d${encounter.dispatchCount + 1}-start-turn`,
        kind: 'start-turn',
        actor: { kind: 'director' },
        payload: { turnId: args.turnId },
      },
    ]);
    return null;
  },
});

/** Director-asserted round advance [design §3]: the engine warns listing
 * living unspent turns, then runs the start-of-round sweeps (budget resets,
 * triggered counters, villain per-round flag, grant expiries). */
export const advanceRound = mutation({
  args: {
    campaignId: v.id('campaigns'),
    reason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { profile } = await requireCurrentDirector(ctx, args.campaignId);
    const encounter = await requireLiveEncounter(ctx, args.campaignId);
    await runIntents(ctx, encounter, { userId: profile.userId, name: profile.displayName }, [
      {
        intentId: `d${encounter.dispatchCount + 1}-advance-round`,
        kind: 'advance-round',
        actor: { kind: 'director' },
        payload: { reason: args.reason },
      },
    ]);
    return null;
  },
});

/** "You can also turn your main action into a move action or a maneuver"
 * [rule.combat/turn] — debits the main action through the one home, then
 * grants the target cost. The conversion is the acting participant's OWN
 * printed choice, so this stays member-reachable with attribution (the
 * useAbility posture; DEC-0007: game power, not campaign admin) — the
 * engine actor is the participant, both attributions land on the log, and
 * economy violations warn-and-apply [I-5, R-0030]. */
export const convertAction = mutation({
  args: {
    campaignId: v.id('campaigns'),
    participantId: v.string(),
    to: v.union(v.literal('maneuver'), v.literal('move-action')),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { profile } = await requireActiveMember(ctx, args.campaignId);
    const encounter = await requireLiveEncounter(ctx, args.campaignId);
    await runIntents(ctx, encounter, { userId: profile.userId, name: profile.displayName }, [
      {
        intentId: `d${encounter.dispatchCount + 1}-convert-action`,
        kind: 'convert-action',
        actor: { kind: 'participant', participantId: args.participantId },
        payload: { participantId: args.participantId, to: args.to },
      },
    ]);
    return null;
  },
});

/** Director grant intent [design §3, R-0030]: escape-flagged action grants
 * cover the Solo Action malice spends until the malice family lands; turn
 * grants cover Director-asserted scheduling. Consumption is silent — printed
 * escapes never produce spurious warnings. */
export const addGrant = mutation({
  args: {
    campaignId: v.id('campaigns'),
    targetParticipantId: v.string(),
    grant: v.union(
      v.object({
        kind: v.literal('next-roll'),
        polarity: v.union(
          v.literal('edge'),
          v.literal('double-edge'),
          v.literal('bane'),
          v.literal('double-bane'),
        ),
        scope: v.union(v.literal('strike'), v.literal('power-roll')),
        direction: v.union(v.literal('outbound'), v.literal('inbound')),
        window: v.optional(v.union(v.literal('end-of-targets-next-turn'), v.null())),
      }),
      v.object({
        kind: v.literal('action'),
        /** Budget costs only [M-2] — a dead grant (a cost the consumption
         * filter could never match) is unrepresentable at this boundary,
         * matching the engine's ActionGrantSchema. */
        cost: budgetActionCostView,
        magnitude: v.optional(v.number()),
        escapes: v.optional(
          v.object({
            ignoresDazed: v.boolean(),
            ignoresSurprised: v.boolean(),
            offTurn: v.boolean(),
          }),
        ),
        expiry: v.optional(grantExpiryView),
      }),
      v.object({
        kind: v.literal('turn'),
        mode: v.union(v.literal('allowance'), v.literal('insertion')),
        magnitude: v.optional(v.number()),
        constraint: v.optional(v.union(v.literal('no-consecutive'), v.null())),
        expiry: v.optional(grantExpiryView),
      }),
    ),
    /** Attribution: the participant and/or canon artifact the grant traces
     * to (e.g. a malice Solo Action sheet), when known. */
    sourceParticipantId: v.optional(v.string()),
    sourceArtifactId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { profile } = await requireCurrentDirector(ctx, args.campaignId);
    const encounter = await requireLiveEncounter(ctx, args.campaignId);
    const source = {
      participantId: args.sourceParticipantId,
      effectArtifactId: args.sourceArtifactId,
    };
    const grant =
      args.grant.kind === 'next-roll'
        ? { ...args.grant, window: args.grant.window ?? null, source }
        : { ...args.grant, source };
    try {
      await runIntents(ctx, encounter, { userId: profile.userId, name: profile.displayName }, [
        {
          intentId: `d${encounter.dispatchCount + 1}-add-grant`,
          kind: 'add-grant',
          actor: { kind: 'director' },
          payload: { target: args.targetParticipantId, grant },
        },
      ]);
    } catch (error) {
      if (error instanceof ConvexError) throw error;
      throw new ConvexError(
        `Invalid grant dispatch: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return null;
  },
});

/** "You can use one triggered action per round, either on your turn or
 * another creature's turn, but only when the action's trigger occurs"
 * [rule.combat/triggered-action]. Free triggered actions bypass the round
 * counter but honor per-ability caps and both prevention couplings. */
export const useTriggeredAction = mutation({
  args: {
    campaignId: v.id('campaigns'),
    participantId: v.string(),
    /** The printed triggered ability exercised — a real corpus artifact id,
     * optionally `#`-suffixed with the ability slug for abilities living
     * inside a statblock record. */
    abilityArtifactId: v.string(),
    /** Manual override for asserted cases; absent = derived from the
     * compiled header annotation on the loaded record [I-6d]. */
    free: v.optional(v.boolean()),
    /** A receipt-visible trigger occurrence (a prior dispatch's intent id)
     * — wins over an asserted-text trigger when both are given. */
    triggerIntentId: v.optional(v.string()),
    /** A table-asserted trigger (Ride's triggerless free-trigger
     * dispatches without an occurrence). */
    triggerText: v.optional(v.string()),
    /** Manual once-per-round-cap override; absent = the compiled printed
     * cap from the header annotation (Keeper of Order = 1) [I-6d]. Feeds
     * the R-0030 warn machinery only — never state legality. */
    perRoundCap: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { profile } = await requireActiveMember(ctx, args.campaignId);
    const encounter = await requireLiveEncounter(ctx, args.campaignId);
    // The ability is a real corpus record, never invented (prime
    // directive): verify the base artifact behind any `#ability` suffix.
    const baseArtifactId = args.abilityArtifactId.split('#')[0] ?? args.abilityArtifactId;
    const record = await loadRecord(ctx, baseArtifactId);
    if (!record) throw new ConvexError(`Unknown canon record: ${baseArtifactId}`);
    // Compiled header annotation [R-0029/R-0031, I-6d]: the printed cost
    // decides free-triggered on its own; the once-per-round cap rides
    // along. Resolved HERE from the record this mutation already loads (the
    // CLI-proven derivation — smaller than shipping the annotation through
    // the search payload); explicit args stay the asserted-case override.
    // No annotation = table-asserted dispatch, exactly as before.
    const abilitySuffix = args.abilityArtifactId.includes('#')
      ? (args.abilityArtifactId.split('#')[1] ?? '')
      : null;
    const annotation =
      args.free === undefined || args.perRoundCap === undefined
        ? [...annotateHeaderCosts(parseEffectText(record.text), baseArtifactId).values()].find(
            (candidate) =>
              (abilitySuffix === null || candidate.abilitySlug === abilitySuffix) &&
              (candidate.actionCost === 'triggered-action' ||
                candidate.actionCost === 'free-triggered-action'),
          )
        : undefined;
    const free = args.free ?? annotation?.actionCost === 'free-triggered-action';
    const perRoundCap = args.perRoundCap ?? annotation?.usesPerRound ?? null;
    try {
      await runIntents(ctx, encounter, { userId: profile.userId, name: profile.displayName }, [
        {
          intentId: `d${encounter.dispatchCount + 1}-triggered-${slugOf(args.abilityArtifactId)}`,
          kind: 'use-triggered-action',
          actor: { kind: 'participant', participantId: args.participantId },
          payload: {
            participantId: args.participantId,
            abilityArtifactId: args.abilityArtifactId,
            free,
            trigger:
              args.triggerIntentId !== undefined
                ? { kind: 'occurrence', intentId: args.triggerIntentId }
                : args.triggerText !== undefined
                  ? { kind: 'asserted', text: args.triggerText }
                  : null,
            perRoundCap,
          },
        },
      ]);
    } catch (error) {
      if (error instanceof ConvexError) throw error;
      throw new ConvexError(
        `Invalid triggered-action dispatch: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return null;
  },
});

/** The three printed villain-action constraints — always three, once each
 * per encounter, no more than one per round even across creatures, at the
 * end of another creature's turn — enforced as warns [R-0030]. */
export const useVillainAction = mutation({
  args: {
    campaignId: v.id('campaigns'),
    participantId: v.string(),
    abilityArtifactId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { profile } = await requireCurrentDirector(ctx, args.campaignId);
    const encounter = await requireLiveEncounter(ctx, args.campaignId);
    const baseArtifactId = args.abilityArtifactId.split('#')[0] ?? args.abilityArtifactId;
    const record = await loadRecord(ctx, baseArtifactId);
    if (!record) throw new ConvexError(`Unknown canon record: ${baseArtifactId}`);
    await runIntents(ctx, encounter, { userId: profile.userId, name: profile.displayName }, [
      {
        intentId: `d${encounter.dispatchCount + 1}-villain-${slugOf(args.abilityArtifactId)}`,
        kind: 'use-villain-action',
        actor: { kind: 'participant', participantId: args.participantId },
        payload: {
          participantId: args.participantId,
          abilityArtifactId: args.abilityArtifactId,
        },
      },
    ]);
    return null;
  },
});

/** Record a modification on an open resolution entry [R-0032]:
 * modifications apply in dispatch order at commit; a post-commit
 * modification is a warned table correction, never a reopen. */
export const modifyResolution = mutation({
  args: {
    campaignId: v.id('campaigns'),
    resolutionId: v.string(),
    modification: v.union(
      /** "you can downgrade it to select the outcome of a lower tier"
       * [rule.dice/power-roll]. */
      v.object({ kind: v.literal('downgrade'), toTier: v.union(v.literal(1), v.literal(2)) }),
      v.object({ kind: v.literal('tier-adjust'), delta: v.number(), reason: v.string() }),
      v.object({
        kind: v.literal('potency-adjust'),
        delta: v.number(),
        target: v.optional(v.string()),
        reason: v.string(),
      }),
      v.object({
        kind: v.literal('retarget'),
        from: v.string(),
        to: v.string(),
        reason: v.string(),
      }),
      v.object({
        kind: v.literal('damage-halve'),
        target: v.optional(v.string()),
        rounding: v.union(v.literal('down'), v.literal('up')),
        reason: v.string(),
      }),
    ),
    /** The participant acting (the removeCondition authority pattern): a
     * non-director member must name one; the Director may act as such. */
    asParticipantId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { profile, membership } = await requireActiveMember(ctx, args.campaignId);
    if (!args.asParticipantId && gameRoleFor(membership) !== 'director')
      throw new ConvexError('Name the participant acting, or ask the Director');
    const encounter = await requireLiveEncounter(ctx, args.campaignId);
    try {
      await runIntents(ctx, encounter, { userId: profile.userId, name: profile.displayName }, [
        {
          intentId: `d${encounter.dispatchCount + 1}-modify-${args.resolutionId}`,
          kind: 'modify-resolution',
          actor: args.asParticipantId
            ? { kind: 'participant', participantId: args.asParticipantId }
            : { kind: 'director' },
          payload: { resolutionId: args.resolutionId, modification: args.modification },
        },
      ]);
    } catch (error) {
      if (error instanceof ConvexError) throw error;
      throw new ConvexError(
        `Invalid modification dispatch: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return null;
  },
});

/** Explicitly commit a HELD resolution [R-0032]: the host re-supplies the
 * pending-commit payload it stored at roll time and the engine verifies its
 * canonical SHA-256 against the entry, then executes against commit-time
 * state. The one-tap path never comes here — useAbility pipelines its own
 * commit unless the caller held the entry open. */
export const commitResolution = mutation({
  args: {
    campaignId: v.id('campaigns'),
    resolutionId: v.string(),
    /** The participant acting (the removeCondition authority pattern). */
    asParticipantId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { profile, membership } = await requireActiveMember(ctx, args.campaignId);
    if (!args.asParticipantId && gameRoleFor(membership) !== 'director')
      throw new ConvexError('Name the participant acting, or ask the Director');
    const encounter = await requireLiveEncounter(ctx, args.campaignId);
    const stored = (encounter.openPayloads ?? {}) as Record<string, UseAbilityPayloadInput>;
    const payload = stored[args.resolutionId];
    if (payload === undefined) {
      throw new ConvexError(
        `No held payload for resolution ${args.resolutionId} — it is not open on this host (already committed, swept, or never opened here)`,
      );
    }
    try {
      await runIntents(ctx, encounter, { userId: profile.userId, name: profile.displayName }, [
        {
          intentId: `d${encounter.dispatchCount + 1}-commit-${args.resolutionId}`,
          kind: 'commit-resolution',
          actor: args.asParticipantId
            ? { kind: 'participant', participantId: args.asParticipantId }
            : { kind: 'director' },
          payload: { resolutionId: args.resolutionId, payload },
        },
      ]);
    } catch (error) {
      if (error instanceof ConvexError) throw error;
      throw new ConvexError(
        `Invalid resolution commit: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    await pruneOpenPayloads(ctx, encounter._id);
    return null;
  },
});

export const endEncounter = mutation({
  args: {
    campaignId: v.id('campaigns'),
    keepInstanceIds: v.optional(v.array(v.string())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { profile } = await requireCurrentDirector(ctx, args.campaignId);
    const encounter = await requireLiveEncounter(ctx, args.campaignId);
    await runIntents(ctx, encounter, { userId: profile.userId, name: profile.displayName }, [
      {
        intentId: `d${encounter.dispatchCount + 1}-end-encounter`,
        kind: 'end-encounter',
        actor: { kind: 'director' },
        payload: { keepInstanceIds: args.keepInstanceIds ?? [] },
      },
    ]);
    await ctx.db.patch(encounter._id, { status: 'ended', endedAt: Date.now(), openPayloads: {} });
    return null;
  },
});
