import { ConvexError, v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { type MutationCtx, type QueryCtx, mutation, query } from './_generated/server';
import { gameRoleFor, requireActiveMember, requireCurrentDirector, requireProfile } from './authz';

const MAX_SESSION_CHARACTERS = 200;
const MAX_SESSION_HISTORY = 50;
const MAX_CONTROL_GRANTS = 200;
const MAX_ACTIVE_CONTROL_GRANTS = 200;

type DatabaseCtx = QueryCtx | MutationCtx;

const grantScopeValidator = v.union(v.literal('session'), v.literal('persistent'));
const grantStatusValidator = v.union(
  v.literal('pending'),
  v.literal('accepted'),
  v.literal('declined'),
  v.literal('revoked'),
  v.literal('relinquished'),
  v.literal('expired'),
);

async function activeSessionForCampaign(
  ctx: DatabaseCtx,
  campaign: Doc<'campaigns'>,
): Promise<Doc<'sessions'> | null> {
  if (!campaign.activeSessionId) return null;
  const session = await ctx.db.get(campaign.activeSessionId);
  return session?.status === 'active' ? session : null;
}

async function rosterEntry(
  ctx: DatabaseCtx,
  sessionId: Id<'sessions'>,
  characterId: Id<'characters'>,
) {
  return await ctx.db
    .query('sessionRosterEntries')
    .withIndex('by_sessionId_characterId', (q) =>
      q.eq('sessionId', sessionId).eq('characterId', characterId),
    )
    .unique();
}

async function activeBinding(
  ctx: DatabaseCtx,
  campaignId: Id<'campaigns'>,
  characterId: Id<'characters'>,
) {
  const binding = await ctx.db
    .query('characterCampaignBindings')
    .withIndex('by_characterId', (q) => q.eq('characterId', characterId))
    .unique();
  if (!binding || binding.campaignId !== campaignId || binding.status !== 'active')
    throw new ConvexError('Character is not active in this campaign');
  return binding;
}

async function appendRosterEvent(
  ctx: MutationCtx,
  sessionId: Id<'sessions'>,
  characterId: Id<'characters'>,
  actorUserId: Id<'users'>,
  type: 'initial' | 'added' | 'removed',
) {
  await ctx.db.insert('sessionRosterEvents', {
    sessionId,
    characterId,
    actorUserId,
    type,
    occurredAt: Date.now(),
  });
}

async function acceptedGrantExists(
  ctx: DatabaseCtx,
  args: {
    bindingId: Id<'characterCampaignBindings'>;
    granteeUserId: Id<'users'>;
    sessionId: Id<'sessions'>;
  },
): Promise<boolean> {
  const [persistent, session] = await Promise.all([
    ctx.db
      .query('characterControlGrants')
      .withIndex('by_granteeUserId_status_bindingId_scope_sessionId', (q) =>
        q
          .eq('granteeUserId', args.granteeUserId)
          .eq('status', 'accepted')
          .eq('bindingId', args.bindingId)
          .eq('scope', 'persistent')
          .eq('sessionId', undefined),
      )
      .first(),
    ctx.db
      .query('characterControlGrants')
      .withIndex('by_granteeUserId_status_bindingId_scope_sessionId', (q) =>
        q
          .eq('granteeUserId', args.granteeUserId)
          .eq('status', 'accepted')
          .eq('bindingId', args.bindingId)
          .eq('scope', 'session')
          .eq('sessionId', args.sessionId),
      )
      .first(),
  ]);
  return persistent !== null || session !== null;
}

async function activeGrantCountForBinding(
  ctx: DatabaseCtx,
  bindingId: Id<'characterCampaignBindings'>,
): Promise<number> {
  const [pending, accepted] = await Promise.all([
    ctx.db
      .query('characterControlGrants')
      .withIndex('by_bindingId_status', (q) => q.eq('bindingId', bindingId).eq('status', 'pending'))
      .take(MAX_ACTIVE_CONTROL_GRANTS),
    ctx.db
      .query('characterControlGrants')
      .withIndex('by_bindingId_status', (q) =>
        q.eq('bindingId', bindingId).eq('status', 'accepted'),
      )
      .take(MAX_ACTIVE_CONTROL_GRANTS),
  ]);
  return pending.length + accepted.length;
}

async function activeGrantCountForSession(
  ctx: DatabaseCtx,
  sessionId: Id<'sessions'>,
): Promise<number> {
  const [pending, accepted] = await Promise.all([
    ctx.db
      .query('characterControlGrants')
      .withIndex('by_sessionId_status', (q) => q.eq('sessionId', sessionId).eq('status', 'pending'))
      .take(MAX_ACTIVE_CONTROL_GRANTS),
    ctx.db
      .query('characterControlGrants')
      .withIndex('by_sessionId_status', (q) =>
        q.eq('sessionId', sessionId).eq('status', 'accepted'),
      )
      .take(MAX_ACTIVE_CONTROL_GRANTS),
  ]);
  return pending.length + accepted.length;
}

export async function requireCharacterControl(
  ctx: DatabaseCtx,
  sessionId: Id<'sessions'>,
  characterId: Id<'characters'>,
): Promise<{ actorUserId: Id<'users'>; entry: Doc<'sessionRosterEntries'> }> {
  const profile = await requireProfile(ctx);
  const session = await ctx.db.get(sessionId);
  if (!session || session.status !== 'active') throw new ConvexError('Active session required');
  const { membership } = await requireActiveMember(ctx, session.campaignId);
  const entry = await rosterEntry(ctx, session._id, characterId);
  if (!entry || entry.status !== 'active') throw new ConvexError('Character is not in the session');
  const allowed =
    entry.ownerUserIdSnapshot === profile.userId ||
    gameRoleFor(membership) === 'director' ||
    (await acceptedGrantExists(ctx, {
      bindingId: entry.bindingId,
      granteeUserId: profile.userId,
      sessionId: session._id,
    }));
  if (!allowed) throw new ConvexError('Character control required');
  return { actorUserId: profile.userId, entry };
}

export async function expireControlGrantsForBinding(
  ctx: MutationCtx,
  bindingId: Id<'characterCampaignBindings'>,
): Promise<void> {
  const now = Date.now();
  for (const status of ['pending', 'accepted'] as const) {
    const grants = ctx.db
      .query('characterControlGrants')
      .withIndex('by_bindingId_status', (q) => q.eq('bindingId', bindingId).eq('status', status));
    for await (const grant of grants)
      await ctx.db.patch(grant._id, { status: 'expired', updatedAt: now });
  }
}

export async function expireControlGrantsForGranteeInCampaign(
  ctx: MutationCtx,
  args: { campaignId: Id<'campaigns'>; granteeUserId: Id<'users'> },
): Promise<void> {
  const now = Date.now();
  for (const status of ['pending', 'accepted'] as const) {
    const grants = ctx.db
      .query('characterControlGrants')
      .withIndex('by_campaignId_granteeUserId_status', (q) =>
        q
          .eq('campaignId', args.campaignId)
          .eq('granteeUserId', args.granteeUserId)
          .eq('status', status),
      );
    for await (const grant of grants)
      await ctx.db.patch(grant._id, { status: 'expired', updatedAt: now });
  }
}

export async function removeCharacterFromActiveSession(
  ctx: MutationCtx,
  args: {
    campaignId: Id<'campaigns'>;
    characterId: Id<'characters'>;
    actorUserId: Id<'users'>;
  },
): Promise<void> {
  const campaign = await ctx.db.get(args.campaignId);
  if (!campaign) return;
  const session = await activeSessionForCampaign(ctx, campaign);
  if (!session) return;
  const entry = await rosterEntry(ctx, session._id, args.characterId);
  if (!entry || entry.status !== 'active') return;
  const now = Date.now();
  await ctx.db.patch(entry._id, {
    status: 'removed',
    removedByUserId: args.actorUserId,
    removedAt: now,
  });
  await appendRosterEvent(ctx, session._id, entry.characterId, args.actorUserId, 'removed');
}

export async function recordDirectorHandoff(
  ctx: MutationCtx,
  args: {
    campaignId: Id<'campaigns'>;
    sessionId?: Id<'sessions'>;
    actorUserId: Id<'users'>;
    targetUserId: Id<'users'>;
  },
): Promise<void> {
  if (!args.sessionId) return;
  const session = await ctx.db.get(args.sessionId);
  if (!session || session.status !== 'active') return;
  await ctx.db.insert('sessionEvents', {
    sessionId: session._id,
    campaignId: args.campaignId,
    actorUserId: args.actorUserId,
    subjectUserId: args.targetUserId,
    type: 'director_handoff',
    occurredAt: Date.now(),
  });
}

export const start = mutation({
  args: { campaignId: v.id('campaigns'), characterIds: v.array(v.id('characters')) },
  returns: v.id('sessions'),
  handler: async (ctx, args) => {
    const { campaign, profile } = await requireCurrentDirector(ctx, args.campaignId);
    if (campaign.activeSessionId)
      throw new ConvexError('This campaign already has an active session');
    const characterIds = [...new Set(args.characterIds)];
    if (characterIds.length < 1) throw new ConvexError('Select at least one character');
    if (characterIds.length > MAX_SESSION_CHARACTERS)
      throw new ConvexError('Too many characters selected');

    const snapshots = [];
    for (const characterId of characterIds) {
      const binding = await activeBinding(ctx, campaign._id, characterId);
      const character = await ctx.db.get(characterId);
      if (!character) throw new ConvexError('Character is not active in this campaign');
      snapshots.push({ binding, character });
    }

    const now = Date.now();
    const number = campaign.nextSessionNumber ?? 1;
    const sessionId = await ctx.db.insert('sessions', {
      campaignId: campaign._id,
      number,
      status: 'active',
      startedByUserId: profile.userId,
      startedAt: now,
    });
    for (const { binding, character } of snapshots) {
      await ctx.db.insert('sessionRosterEntries', {
        sessionId,
        campaignId: campaign._id,
        characterId: character._id,
        bindingId: binding._id,
        ownerUserIdSnapshot: character.ownerUserId,
        characterNameSnapshot: character.name,
        levelSnapshot: character.level,
        status: 'active',
        initial: true,
        addedByUserId: profile.userId,
        addedAt: now,
      });
      await appendRosterEvent(ctx, sessionId, character._id, profile.userId, 'initial');
    }
    await ctx.db.insert('sessionRuntime', {
      sessionId,
      status: 'active',
      resourceBasisCharacterCount: snapshots.length,
      resourceBasisLevelTotal: snapshots.reduce((total, row) => total + row.character.level, 0),
      resourcesGeneratedAt: now,
    });
    await ctx.db.insert('sessionEvents', {
      sessionId,
      campaignId: campaign._id,
      actorUserId: profile.userId,
      type: 'started',
      occurredAt: now,
    });
    await ctx.db.patch(campaign._id, {
      activeSessionId: sessionId,
      nextSessionNumber: number + 1,
      updatedAt: now,
    });
    return sessionId;
  },
});

export const addCharacter = mutation({
  args: { campaignId: v.id('campaigns'), characterId: v.id('characters') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { campaign, profile } = await requireCurrentDirector(ctx, args.campaignId);
    const session = await activeSessionForCampaign(ctx, campaign);
    if (!session) throw new ConvexError('Active session required');
    const binding = await activeBinding(ctx, campaign._id, args.characterId);
    const character = await ctx.db.get(args.characterId);
    if (!character) throw new ConvexError('Character is not active in this campaign');
    const existing = await rosterEntry(ctx, session._id, character._id);
    if (existing?.status === 'active') return null;
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        bindingId: binding._id,
        ownerUserIdSnapshot: character.ownerUserId,
        characterNameSnapshot: character.name,
        levelSnapshot: character.level,
        status: 'active',
        initial: false,
        addedByUserId: profile.userId,
        addedAt: now,
        removedByUserId: undefined,
        removedAt: undefined,
      });
    } else {
      await ctx.db.insert('sessionRosterEntries', {
        sessionId: session._id,
        campaignId: campaign._id,
        characterId: character._id,
        bindingId: binding._id,
        ownerUserIdSnapshot: character.ownerUserId,
        characterNameSnapshot: character.name,
        levelSnapshot: character.level,
        status: 'active',
        initial: false,
        addedByUserId: profile.userId,
        addedAt: now,
      });
    }
    await appendRosterEvent(ctx, session._id, character._id, profile.userId, 'added');
    return null;
  },
});

export const removeCharacter = mutation({
  args: { campaignId: v.id('campaigns'), characterId: v.id('characters') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { campaign, profile } = await requireCurrentDirector(ctx, args.campaignId);
    const session = await activeSessionForCampaign(ctx, campaign);
    if (!session) throw new ConvexError('Active session required');
    const entry = await rosterEntry(ctx, session._id, args.characterId);
    if (!entry || entry.status !== 'active')
      throw new ConvexError('Character is not in the session');
    await removeCharacterFromActiveSession(ctx, {
      campaignId: campaign._id,
      characterId: args.characterId,
      actorUserId: profile.userId,
    });
    return null;
  },
});

export const end = mutation({
  args: { campaignId: v.id('campaigns') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { campaign, profile } = await requireCurrentDirector(ctx, args.campaignId);
    const session = await activeSessionForCampaign(ctx, campaign);
    if (!session) throw new ConvexError('Active session required');
    const runtime = await ctx.db
      .query('sessionRuntime')
      .withIndex('by_sessionId', (q) => q.eq('sessionId', session._id))
      .unique();
    if (!runtime) throw new ConvexError('Session runtime is missing');
    const now = Date.now();
    for (const status of ['pending', 'accepted'] as const) {
      const grants = ctx.db
        .query('characterControlGrants')
        .withIndex('by_sessionId_status', (q) =>
          q.eq('sessionId', session._id).eq('status', status),
        );
      for await (const grant of grants)
        await ctx.db.patch(grant._id, { status: 'expired', updatedAt: now });
    }
    await ctx.db.patch(runtime._id, { status: 'frozen', frozenAt: now });
    await ctx.db.patch(session._id, {
      status: 'ended',
      endedByUserId: profile.userId,
      endedAt: now,
    });
    await ctx.db.patch(campaign._id, { activeSessionId: undefined, updatedAt: now });
    await ctx.db.insert('sessionEvents', {
      sessionId: session._id,
      campaignId: campaign._id,
      actorUserId: profile.userId,
      type: 'ended',
      occurredAt: now,
    });
    return null;
  },
});

export const getActive = query({
  args: { campaignId: v.id('campaigns') },
  returns: v.union(
    v.null(),
    v.object({
      sessionId: v.id('sessions'),
      number: v.number(),
      startedAt: v.number(),
      startedByUserId: v.id('users'),
      viewer: v.object({ userId: v.id('users'), isDirector: v.boolean() }),
      resources: v.object({
        basisCharacterCount: v.number(),
        basisLevelTotal: v.number(),
        generatedAt: v.number(),
      }),
      roster: v.array(
        v.object({
          characterId: v.id('characters'),
          bindingId: v.id('characterCampaignBindings'),
          name: v.string(),
          ownerUserId: v.id('users'),
          level: v.number(),
          initial: v.boolean(),
          canControl: v.boolean(),
        }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const { campaign, profile, membership } = await requireActiveMember(ctx, args.campaignId);
    const session = await activeSessionForCampaign(ctx, campaign);
    if (!session) return null;
    const runtime = await ctx.db
      .query('sessionRuntime')
      .withIndex('by_sessionId', (q) => q.eq('sessionId', session._id))
      .unique();
    if (!runtime) throw new ConvexError('Session runtime is missing');
    const entries = await ctx.db
      .query('sessionRosterEntries')
      .withIndex('by_sessionId', (q) => q.eq('sessionId', session._id))
      .take(MAX_SESSION_CHARACTERS);
    const isDirector = gameRoleFor(membership) === 'director';
    const acceptedGrants = isDirector
      ? []
      : await ctx.db
          .query('characterControlGrants')
          .withIndex('by_campaignId_granteeUserId_status', (q) =>
            q
              .eq('campaignId', campaign._id)
              .eq('granteeUserId', profile.userId)
              .eq('status', 'accepted'),
          )
          .take(MAX_SESSION_CHARACTERS * 2);
    const controlledBindings = new Set(
      acceptedGrants
        .filter((grant) => grant.scope === 'persistent' || grant.sessionId === session._id)
        .map((grant) => grant.bindingId),
    );
    const roster = [];
    for (const entry of entries) {
      if (entry.status !== 'active') continue;
      roster.push({
        characterId: entry.characterId,
        bindingId: entry.bindingId,
        name: entry.characterNameSnapshot,
        ownerUserId: entry.ownerUserIdSnapshot,
        level: entry.levelSnapshot,
        initial: entry.initial,
        canControl:
          isDirector ||
          entry.ownerUserIdSnapshot === profile.userId ||
          controlledBindings.has(entry.bindingId),
      });
    }
    return {
      sessionId: session._id,
      number: session.number,
      startedAt: session.startedAt,
      startedByUserId: session.startedByUserId,
      viewer: { userId: profile.userId, isDirector },
      resources: {
        basisCharacterCount: runtime.resourceBasisCharacterCount,
        basisLevelTotal: runtime.resourceBasisLevelTotal,
        generatedAt: runtime.resourcesGeneratedAt,
      },
      roster,
    };
  },
});

export const listHistory = query({
  args: { campaignId: v.id('campaigns') },
  returns: v.array(
    v.object({
      sessionId: v.id('sessions'),
      number: v.number(),
      startedAt: v.number(),
      startedByUserId: v.id('users'),
      endedAt: v.number(),
      endedByUserId: v.id('users'),
    }),
  ),
  handler: async (ctx, args) => {
    await requireActiveMember(ctx, args.campaignId);
    const sessions = await ctx.db
      .query('sessions')
      .withIndex('by_campaignId_status', (q) =>
        q.eq('campaignId', args.campaignId).eq('status', 'ended'),
      )
      .order('desc')
      .take(MAX_SESSION_HISTORY);
    return sessions.map((session) => {
      if (session.endedAt === undefined || session.endedByUserId === undefined)
        throw new ConvexError('Ended session is incomplete');
      return {
        sessionId: session._id,
        number: session.number,
        startedAt: session.startedAt,
        startedByUserId: session.startedByUserId,
        endedAt: session.endedAt,
        endedByUserId: session.endedByUserId,
      };
    });
  },
});

export const offerControl = mutation({
  args: {
    characterId: v.id('characters'),
    granteeUserId: v.id('users'),
    scope: grantScopeValidator,
  },
  returns: v.id('characterControlGrants'),
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const character = await ctx.db.get(args.characterId);
    if (!character || character.ownerUserId !== profile.userId)
      throw new ConvexError('Character not found');
    const binding = await ctx.db
      .query('characterCampaignBindings')
      .withIndex('by_characterId', (q) => q.eq('characterId', character._id))
      .unique();
    if (!binding || binding.status !== 'active')
      throw new ConvexError('Character is not active in a campaign');
    const { campaign } = await requireActiveMember(ctx, binding.campaignId);
    if (args.granteeUserId === profile.userId)
      throw new ConvexError('You already control this character');
    const grantee = await ctx.db
      .query('campaignMemberships')
      .withIndex('by_campaignId_userId', (q) =>
        q.eq('campaignId', campaign._id).eq('userId', args.granteeUserId),
      )
      .unique();
    if (!grantee || grantee.status !== 'active')
      throw new ConvexError('Control can only be offered to an active member');
    const session = await activeSessionForCampaign(ctx, campaign);
    if (args.scope === 'session') {
      if (!session) throw new ConvexError('Active session required');
      const entry = await rosterEntry(ctx, session._id, character._id);
      if (!entry || entry.status !== 'active')
        throw new ConvexError('Character is not in the session');
    }
    const grantSessionId = args.scope === 'session' ? session?._id : undefined;
    const [pendingDuplicate, acceptedDuplicate] = await Promise.all([
      ctx.db
        .query('characterControlGrants')
        .withIndex('by_granteeUserId_status_bindingId_scope_sessionId', (q) =>
          q
            .eq('granteeUserId', args.granteeUserId)
            .eq('status', 'pending')
            .eq('bindingId', binding._id)
            .eq('scope', args.scope)
            .eq('sessionId', grantSessionId),
        )
        .first(),
      ctx.db
        .query('characterControlGrants')
        .withIndex('by_granteeUserId_status_bindingId_scope_sessionId', (q) =>
          q
            .eq('granteeUserId', args.granteeUserId)
            .eq('status', 'accepted')
            .eq('bindingId', binding._id)
            .eq('scope', args.scope)
            .eq('sessionId', grantSessionId),
        )
        .first(),
    ]);
    if (pendingDuplicate || acceptedDuplicate)
      throw new ConvexError('An active control offer already exists');
    if ((await activeGrantCountForBinding(ctx, binding._id)) >= MAX_ACTIVE_CONTROL_GRANTS)
      throw new ConvexError('This character has reached its active control grant limit');
    if (
      grantSessionId !== undefined &&
      (await activeGrantCountForSession(ctx, grantSessionId)) >= MAX_ACTIVE_CONTROL_GRANTS
    )
      throw new ConvexError('This session has reached its active control grant limit');
    const now = Date.now();
    return await ctx.db.insert('characterControlGrants', {
      campaignId: campaign._id,
      characterId: character._id,
      bindingId: binding._id,
      grantorUserId: profile.userId,
      granteeUserId: args.granteeUserId,
      scope: args.scope,
      ...(grantSessionId === undefined ? {} : { sessionId: grantSessionId }),
      status: 'pending',
      offeredAt: now,
      updatedAt: now,
    });
  },
});

async function requireGrantParticipant(
  ctx: MutationCtx,
  grantId: Id<'characterControlGrants'>,
  side: 'grantor' | 'grantee',
) {
  const profile = await requireProfile(ctx);
  const grant = await ctx.db.get(grantId);
  const expected = side === 'grantor' ? grant?.grantorUserId : grant?.granteeUserId;
  if (!grant || expected !== profile.userId) throw new ConvexError('Control offer not found');
  return grant;
}

export const respondToControl = mutation({
  args: { grantId: v.id('characterControlGrants'), accept: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const grant = await requireGrantParticipant(ctx, args.grantId, 'grantee');
    if (grant.status !== 'pending') throw new ConvexError('Control offer is no longer pending');
    await requireActiveMember(ctx, grant.campaignId);
    const binding = await ctx.db.get(grant.bindingId);
    if (!binding || binding.status !== 'active' || binding.campaignId !== grant.campaignId)
      throw new ConvexError('Control offer has expired');
    if (grant.scope === 'session') {
      const campaign = await ctx.db.get(grant.campaignId);
      if (!campaign || campaign.activeSessionId !== grant.sessionId)
        throw new ConvexError('Control offer has expired');
      const entry = await rosterEntry(ctx, grant.sessionId as Id<'sessions'>, grant.characterId);
      if (!entry || entry.status !== 'active') throw new ConvexError('Control offer has expired');
    }
    const now = Date.now();
    await ctx.db.patch(grant._id, {
      status: args.accept ? 'accepted' : 'declined',
      respondedAt: now,
      updatedAt: now,
    });
    return null;
  },
});

export const revokeControl = mutation({
  args: { grantId: v.id('characterControlGrants') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const grant = await requireGrantParticipant(ctx, args.grantId, 'grantor');
    if (grant.status !== 'pending' && grant.status !== 'accepted')
      throw new ConvexError('Control grant is no longer active');
    const now = Date.now();
    await ctx.db.patch(grant._id, { status: 'revoked', revokedAt: now, updatedAt: now });
    return null;
  },
});

export const relinquishControl = mutation({
  args: { grantId: v.id('characterControlGrants') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const grant = await requireGrantParticipant(ctx, args.grantId, 'grantee');
    if (grant.status !== 'accepted') throw new ConvexError('Control grant is not accepted');
    await ctx.db.patch(grant._id, { status: 'relinquished', updatedAt: Date.now() });
    return null;
  },
});

export const listControlGrants = query({
  args: { campaignId: v.id('campaigns') },
  returns: v.array(
    v.object({
      grantId: v.id('characterControlGrants'),
      characterId: v.id('characters'),
      characterName: v.string(),
      grantorUserId: v.id('users'),
      granteeUserId: v.id('users'),
      granteeName: v.string(),
      scope: grantScopeValidator,
      status: grantStatusValidator,
    }),
  ),
  handler: async (ctx, args) => {
    const { profile } = await requireActiveMember(ctx, args.campaignId);
    const [granted, received] = await Promise.all([
      ctx.db
        .query('characterControlGrants')
        .withIndex('by_campaignId_grantorUserId', (q) =>
          q.eq('campaignId', args.campaignId).eq('grantorUserId', profile.userId),
        )
        .order('desc')
        .take(MAX_CONTROL_GRANTS),
      ctx.db
        .query('characterControlGrants')
        .withIndex('by_campaignId_granteeUserId', (q) =>
          q.eq('campaignId', args.campaignId).eq('granteeUserId', profile.userId),
        )
        .order('desc')
        .take(MAX_CONTROL_GRANTS),
    ]);
    const grants = [...granted, ...received]
      .sort((left, right) => right._creationTime - left._creationTime)
      .slice(0, MAX_CONTROL_GRANTS);
    const result = [];
    for (const grant of grants) {
      if (grant.grantorUserId !== profile.userId && grant.granteeUserId !== profile.userId)
        continue;
      const character = await ctx.db.get(grant.characterId);
      const granteeProfile = await ctx.db
        .query('profiles')
        .withIndex('by_userId', (q) => q.eq('userId', grant.granteeUserId))
        .unique();
      result.push({
        grantId: grant._id,
        characterId: grant.characterId,
        characterName: character?.name ?? 'Unknown character',
        grantorUserId: grant.grantorUserId,
        granteeUserId: grant.granteeUserId,
        granteeName: granteeProfile?.displayName ?? 'Unknown player',
        scope: grant.scope,
        status: grant.status,
      });
    }
    return result;
  },
});
