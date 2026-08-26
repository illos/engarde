import {
  compileAbility,
  compileEffectPrograms,
  tierOutcomeToIntents,
} from '@engarde/canon/effect-conformance';
import { auditGrammarConservation, parseEffectText } from '@engarde/canon/effect-grammar';
import type { StatblockStats } from '@engarde/canon/statblock-stats';
import {
  type DamageType,
  type DriverSquadSeed,
  type EncounterState,
  type Intent,
  type InvariantViolation,
  type LogEntry,
  type ParticipantStats,
  ParticipantStatsSchema,
  applyIntent,
  checkInvariants,
  createSeededRandomSource,
  initialEncounterState,
  isDead,
  isDying,
  isWinded,
  squadMemberStats,
  squadSeedWarnings,
  upgradeEncounterState,
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
        grants: participant.grants.map((grant) => ({
          grantId: grant.grantId,
          polarity: grant.polarity,
          scope: grant.scope,
          direction: grant.direction,
          window: grant.window,
          sourceParticipantId: grant.source.participantId ?? null,
          sourceRecordSlug: grant.source.effectArtifactId
            ? slugOf(grant.source.effectArtifactId)
            : null,
        })),
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
          // Verbatim "With Captain" entry [R-0028]; `?? null` lifts rows
          // whose statsJson predates the field.
          withCaptain: parsed.withCaptain ?? null,
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
  },
  returns: v.null(),
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
      const intents: Intent[] = [];
      const unexecuted: LogRowInput[] = [];
      for (const [index, targetId] of args.targetParticipantIds.entries()) {
        const execution = tierOutcomeToIntents(tier.data, {
          intentIdPrefix: `d${encounter.dispatchCount + 1}-${record.slug}-t${index}`,
          actorParticipantId: args.actorParticipantId,
          targetParticipantId: targetId,
          effectArtifactId: args.artifactId,
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
    const intent: Intent = {
      intentId: `d${encounter.dispatchCount + 1}-${record.slug}`,
      kind: 'use-ability',
      actor: { kind: 'participant', participantId: args.actorParticipantId },
      payload: {
        actorParticipantId: args.actorParticipantId,
        ability: compiled.ability,
        targets: args.targetParticipantIds,
        dice: args.dice as [number, number] | undefined,
        characteristicChoice: args.characteristicChoice as never,
        damageCharacteristicChoice: args.damageCharacteristicChoice as never,
        damageTypeChoice: args.damageTypeChoice as never,
        edges: args.edges ?? 0,
        banes: args.banes ?? 0,
        downgradeToTier: args.downgradeToTier as 1 | 2 | undefined,
        knockOut: args.knockOut ?? false,
      },
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
    return null;
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
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { profile, membership } = await requireActiveMember(ctx, args.campaignId);
    if (gameRoleFor(membership) !== 'director')
      throw new ConvexError('Manual damage entry is the Director’s adjudication');
    const encounter = await requireLiveEncounter(ctx, args.campaignId);
    const intent: Intent = {
      intentId: `d${encounter.dispatchCount + 1}-apply-damage`,
      kind: 'apply-damage',
      actor: { kind: 'director' },
      payload: {
        target: args.targetParticipantId,
        amount: args.amount,
        damageType: args.damageType as DamageType | undefined,
        reason: args.reason,
        knockOut: args.knockOut ?? false,
        area: args.area ?? false,
        minionKillVictims: args.minionKillVictims ?? [],
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
