import { tierOutcomeToIntents } from '@engarde/canon/effect-conformance';
import { auditGrammarConservation, parseEffectText } from '@engarde/canon/effect-grammar';
import {
  EncounterStateSchema,
  type Intent,
  type InvariantViolation,
  type LogEntry,
  applyIntent,
  checkInvariants,
  createSeededRandomSource,
  initialEncounterState,
} from '@engarde/engine';
import { ConvexError, v } from 'convex/values';
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
      }),
    ),
  }),
);

function slugOf(artifactId: string): string {
  return artifactId.split('/').pop() ?? artifactId;
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

async function loadRecord(
  ctx: DatabaseCtx,
  artifactId: string,
): Promise<Doc<'canonRecords'> | null> {
  return await ctx.db
    .query('canonRecords')
    .withIndex('by_artifactId', (q) => q.eq('artifactId', artifactId))
    .unique();
}

interface LogRowInput {
  kind: Doc<'encounterLogEntries'>['kind'];
  message: string;
  canonRefs: string[];
  engineActorLabel?: string;
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
  let state = EncounterStateSchema.parse(encounter.state);
  let dispatchCount = encounter.dispatchCount;
  const rows: LogRowInput[] = [...(hostRows.before ?? [])];
  const allViolations: InvariantViolation[] = [];
  for (const intent of intents) {
    dispatchCount += 1;
    const context = { random: createSeededRandomSource(encounter.rngSeed + dispatchCount) };
    const result = applyIntent(state, intent, context);
    const violations = checkInvariants(state, intent, result);
    state = result.state;
    for (const entry of result.log) {
      rows.push({
        kind: entry.kind,
        message: entry.message,
        canonRefs: entry.canonRefs,
        engineActorLabel: engineActorLabel(entry.actor),
      });
    }
    for (const violation of violations) {
      rows.push({
        kind: 'invariant-violation',
        message: `${violation.code}: ${violation.detail}`,
        canonRefs: [],
      });
      allViolations.push(violation);
    }
  }
  rows.push(...(hostRows.after ?? []));
  const logCount = await appendLog(ctx, encounter, actor, rows);
  await ctx.db.patch(encounter._id, {
    state,
    dispatchCount,
    logCount,
    updatedAt: Date.now(),
  });
  return { violations: allViolations };
}

export const getActive = query({
  args: { campaignId: v.id('campaigns') },
  returns: encounterView,
  handler: async (ctx, args) => {
    const { membership } = await requireActiveMember(ctx, args.campaignId);
    const encounter = await activeEncounter(ctx, args.campaignId);
    if (!encounter) return null;
    const state = EncounterStateSchema.parse(encounter.state);
    return {
      encounterId: encounter._id,
      status: encounter.status,
      startedAt: encounter.startedAt,
      viewerIsDirector: gameRoleFor(membership) === 'director',
      participants: Object.values(state.participants).map((participant) => ({
        id: participant.id,
        recordId: participant.sourceRecordId ?? null,
        recordSlug: participant.sourceRecordId ? slugOf(participant.sourceRecordId) : null,
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
    return hits.map((hit) => {
      const parse = parseEffectText(hit.text);
      const tiers = parse.clauses
        .filter((clause) => clause.kind === 'tier-outcome')
        .map((clause) => clause.data.band);
      return {
        artifactId: hit.artifactId,
        slug: hit.slug,
        parsedTiers: [...new Set(tiers)],
        residueSpans: parse.residue.length,
      };
    });
  },
});

export const start = mutation({
  args: {
    campaignId: v.id('campaigns'),
    participants: v.array(v.object({ id: v.string(), recordId: v.string() })),
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
    for (const participant of args.participants) {
      if (!PARTICIPANT_ID.test(participant.id))
        throw new ConvexError(`Participant handle "${participant.id}" must be short kebab-case`);
      // Participants are real corpus records, never invented (prime directive).
      if (!(await loadRecord(ctx, participant.recordId)))
        throw new ConvexError(`Unknown canon record: ${participant.recordId}`);
    }
    const state = initialEncounterState(
      args.participants.map((participant) => ({
        id: participant.id,
        sourceRecordId: participant.recordId,
      })),
    );
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
    band: bandValidator,
    actorParticipantId: v.string(),
    targetParticipantId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { profile } = await requireActiveMember(ctx, args.campaignId);
    const encounter = await requireLiveEncounter(ctx, args.campaignId);
    const record = await loadRecord(ctx, args.artifactId);
    if (!record) throw new ConvexError(`Unknown canon record: ${args.artifactId}`);
    const state = EncounterStateSchema.parse(encounter.state);
    for (const participantId of [args.actorParticipantId, args.targetParticipantId]) {
      if (!state.participants[participantId])
        throw new ConvexError(`Unknown participant: ${participantId}`);
    }

    const parse = parseEffectText(record.text);
    const conservation = auditGrammarConservation(record.text, parse);
    if (conservation.length > 0)
      throw new ConvexError(`Grammar conservation failed for ${args.artifactId}`);
    const tier = parse.clauses.find(
      (clause) => clause.kind === 'tier-outcome' && clause.data.band === args.band,
    );
    if (!tier || tier.kind !== 'tier-outcome')
      throw new ConvexError(`No parsed tier outcome at ${args.band} in ${record.slug}`);

    const execution = tierOutcomeToIntents(tier.data, {
      intentIdPrefix: `d${encounter.dispatchCount + 1}-${record.slug}`,
      actorParticipantId: args.actorParticipantId,
      targetParticipantId: args.targetParticipantId,
      effectArtifactId: args.artifactId,
    });
    const actor = { userId: profile.userId, name: profile.displayName };
    const headline: LogRowInput = {
      kind: 'informational',
      message: `${args.actorParticipantId} uses ${record.slug} (tier ${args.band}) on ${args.targetParticipantId}`,
      canonRefs: [args.artifactId],
      engineActorLabel: args.actorParticipantId,
    };
    // Receipts for what the engine did NOT do: unexecuted mechanical parts
    // and the record's residue, verbatim — the tier-3 table card.
    const receipts: LogRowInput[] = [
      ...execution.unexecuted.map((item) => ({
        kind: 'not-automated' as const,
        message: `${item.part}: ${item.detail}`,
        canonRefs: [args.artifactId],
      })),
      ...parse.residue.map((item) => ({
        kind: 'table-card' as const,
        message: item.span.text.trim(),
        canonRefs: [args.artifactId],
      })),
    ];
    await runIntents(ctx, encounter, actor, execution.intents, {
      before: [headline],
      after: receipts,
    });
    return null;
  },
});

export const endTurn = mutation({
  args: {
    campaignId: v.id('campaigns'),
    participantId: v.string(),
    rolls: v.optional(v.record(v.string(), v.number())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { profile } = await requireActiveMember(ctx, args.campaignId);
    const encounter = await requireLiveEncounter(ctx, args.campaignId);
    await runIntents(ctx, encounter, { userId: profile.userId, name: profile.displayName }, [
      {
        intentId: `d${encounter.dispatchCount + 1}-end-turn`,
        kind: 'end-turn',
        actor: { kind: 'participant', participantId: args.participantId },
        payload: { participantId: args.participantId, rolls: args.rolls },
      },
    ]);
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
    await ctx.db.patch(encounter._id, { status: 'ended', endedAt: Date.now() });
    return null;
  },
});
