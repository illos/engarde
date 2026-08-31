import {
  type DecisionAction,
  DecisionActionSchema,
  type HeroBuild,
  HeroBuildSchema,
  type HeroProjection,
  HeroRuntimeSchema,
  emptyHeroBuild,
  emptyHeroRuntime,
  projectDecisions,
  truncateDecisions,
} from '@engarde/canon/hero-document';
import { unansweredKeys } from '@engarde/canon/hero-overlay-fury';
import { ConvexError, v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { type MutationCtx, mutation, query } from './_generated/server';
import { requireProfile } from './authz';
import { requireOwnedCharacter } from './characters';

/**
 * The hero decision log (DEC-0015, 02-normative-schema.md §2.2): the
 * character wizard's write path. The stored document is the CHOICE RECORD
 * — an append-only ordered log; `level`, `classScc`, pillar columns,
 * `characteristics` and `build.selections` are STORED PROJECTIONS of it,
 * maintained atomically here (one write path, §2.3). Revert = truncate +
 * re-project (never a reconstruction).
 *
 * Validation is shape-only through the canon package's one Zod home
 * (HeroBuildSchema / DecisionActionSchema). Option LEGALITY is derived —
 * the resolver/UI reports problems; nothing blocks persistence (§2.3c:
 * a partially-built document is a first-class valid state).
 */

const MAX_DECISIONS = 500;

const provenanceValidator = v.union(
  v.literal('wizard'),
  v.literal('level-up'),
  v.literal('respite'),
  v.literal('play'),
);

function parseBuild(character: Doc<'characters'>): HeroBuild {
  return character.build === undefined ? emptyHeroBuild() : HeroBuildSchema.parse(character.build);
}

/** Stored-projection maintenance (§2.3): the SAME mutation that writes the
 * log updates the projection columns — one write path, assertable
 * invariant stored == project(log). */
async function persistProjection(
  ctx: MutationCtx,
  characterId: Id<'characters'>,
  build: HeroBuild,
  projection: HeroProjection,
): Promise<void> {
  await ctx.db.patch(characterId, {
    build: HeroBuildSchema.parse(build),
    level: projection.level,
    classScc: projection.pillars.class,
    subclassSccs:
      projection.pillars.subclass === undefined ? undefined : [projection.pillars.subclass],
    ancestryScc: projection.pillars.ancestry,
    careerScc: projection.pillars.career,
    complicationScc: projection.pillars.complication,
    incitingIncident: projection.pillars['inciting-incident'],
    characteristics: projection.characteristics ?? undefined,
    updatedAt: Date.now(),
  });
}

function buildView(character: Doc<'characters'>) {
  const build = parseBuild(character);
  const projection = projectDecisions(build.decisions);
  return {
    characterId: character._id,
    name: character.name,
    concept: character.concept,
    level: projection.level,
    build,
    runtime:
      character.runtime === undefined
        ? emptyHeroRuntime()
        : HeroRuntimeSchema.parse(character.runtime),
    projection,
    unanswered: unansweredKeys(projection),
  };
}

export const get = query({
  args: { characterId: v.id('characters') },
  // Canon-owned nested shapes (decision log, selections) cross here —
  // validated by the one Zod home in the handler, not re-mirrored as
  // Convex validators (the encounters.state precedent).
  returns: v.any(),
  handler: async (ctx, args) => {
    const { character } = await requireOwnedCharacter(ctx, args.characterId);
    return buildView(character);
  },
});

export const append = mutation({
  args: {
    characterId: v.id('characters'),
    /** A DecisionAction — validated by the canon Zod home in the handler. */
    action: v.any(),
    provenance: v.optional(provenanceValidator),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const { character } = await requireOwnedCharacter(ctx, args.characterId);
    const parsedAction = DecisionActionSchema.safeParse(args.action);
    if (!parsedAction.success)
      throw new ConvexError(
        `Invalid decision: ${parsedAction.error.issues[0]?.message ?? 'malformed action'}`,
      );
    const action: DecisionAction = parsedAction.data;
    const build = parseBuild(character);
    if (build.decisions.length >= MAX_DECISIONS)
      throw new ConvexError(`The decision log is limited to ${MAX_DECISIONS} entries`);
    const atLevel = projectDecisions(build.decisions).level;
    const entry = {
      seq: build.decisions.length,
      action,
      atLevel,
      provenance: args.provenance ?? ('wizard' as const),
      at: Date.now(),
      divergence: null,
    };
    const decisions = [...build.decisions, entry];
    const projection = projectDecisions(decisions);
    const next: HeroBuild = { ...build, decisions, selections: projection.selections };
    await persistProjection(ctx, character._id, next, projection);
    const updated = await ctx.db.get(character._id);
    if (!updated) throw new ConvexError('Character disappeared during append');
    return buildView(updated);
  },
});

export const revert = mutation({
  args: {
    characterId: v.id('characters'),
    /** Keep the first `keepCount` log entries; drop the suffix (§2.2:
     * revert = rewind — the removed suffix is gone from the document,
     * Q8 disposition). */
    keepCount: v.number(),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const { character } = await requireOwnedCharacter(ctx, args.characterId);
    const build = parseBuild(character);
    if (
      !Number.isInteger(args.keepCount) ||
      args.keepCount < 0 ||
      args.keepCount > build.decisions.length
    )
      throw new ConvexError(`keepCount must be between 0 and ${build.decisions.length}`);
    const decisions = truncateDecisions(build.decisions, args.keepCount);
    const projection = projectDecisions(decisions);
    const next: HeroBuild = { ...build, decisions, selections: projection.selections };
    // persistProjection writes every pillar column from the re-projection;
    // Convex removes fields patched with `undefined`, so columns whose
    // decisions vanished clear rather than staling.
    await persistProjection(ctx, character._id, next, projection);
    const updated = await ctx.db.get(character._id);
    if (!updated) throw new ConvexError('Character disappeared during revert');
    return buildView(updated);
  },
});

/**
 * Bounded read-only mirror of canon record texts for wizard display cards.
 * Verbatim bytes only — absent records return null so the UI renders an
 * explicit "record not seeded" gap, never invented copy.
 */
export const records = query({
  args: { artifactIds: v.array(v.string()) },
  returns: v.array(v.union(v.object({ artifactId: v.string(), text: v.string() }), v.null())),
  handler: async (ctx, args) => {
    // Any signed-in profile may read canon record text (a read-only mirror
    // of Creator-License content already served to every table).
    await requireProfile(ctx);
    if (args.artifactIds.length > 40) throw new ConvexError('Request at most 40 records at a time');
    const results = [];
    for (const artifactId of args.artifactIds) {
      const record = await ctx.db
        .query('canonRecords')
        .withIndex('by_artifactId', (q) => q.eq('artifactId', artifactId))
        .unique();
      results.push(record ? { artifactId, text: record.text } : null);
    }
    return results;
  },
});
