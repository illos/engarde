import { paginationOptsValidator } from 'convex/server';
import { ConvexError, v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { type MutationCtx, type QueryCtx, mutation, query } from './_generated/server';
import { campaignAccessFor, gameRoleFor, requireCampaignAdmin, requireProfile } from './authz';
import { detachCharactersForMembershipEnd } from './characters';
import { removePresenceForMember } from './lobby';
import { rateLimiter } from './rateLimits';
import { recordDirectorHandoff } from './sessions';

// Model + invariants: docs/campaigns-plan.md. Owner authority comes from
// campaigns.ownerId (never a membership role); exactly one active director
// per campaign; joinCode is the one regenerable secret behind code + link.

const CAMPAIGN_NOT_FOUND = 'Campaign not found';
const REQUEST_FAILED = 'Unable to send request';

// Unambiguous alphabet: no 0/O, 1/I/L.
const JOIN_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const JOIN_CODE_LENGTH = 8;

// Abuse ceilings (red-team 2026-08-21): a client never controls read volume,
// and one account can't flood storage or moderation queues. Generous for real
// use; the point is boundedness, not gatekeeping.
const DIRECTORY_PAGE_CAP = 50;
const MAX_OWNED_CAMPAIGNS = 20;
const MAX_PENDING_JOIN_REQUESTS = 10;
const MAX_PENDING_REQUESTS_PER_CAMPAIGN = 100;
const MAX_ACTIVE_CAMPAIGNS_PER_USER = 100;
const MAX_CAMPAIGN_MEMBERS = 200;
const MAX_BLOCKED_ROSTER_ENTRIES = 100;

const visibilityValidator = v.union(v.literal('public'), v.literal('private'));
const joinabilityValidator = v.union(v.literal('open'), v.literal('closed'));
const gameRoleValidator = v.union(v.literal('player'), v.literal('director'));
const campaignAccessValidator = v.union(v.literal('user'), v.literal('admin'));

const joinPreviewView = v.object({
  campaignId: v.id('campaigns'),
  name: v.string(),
  description: v.string(),
  ownerName: v.string(),
  memberCount: v.number(),
  joinability: joinabilityValidator,
  viewerStatus: v.union(v.literal('none'), v.literal('pending'), v.literal('active')),
});

const joinCodePreviewResult = v.union(
  v.object({ status: v.literal('found'), preview: joinPreviewView }),
  v.object({ status: v.literal('not_found') }),
);

const directoryEntryView = v.object({
  campaignId: v.id('campaigns'),
  name: v.string(),
  description: v.string(),
  ownerName: v.string(),
  memberCount: v.number(),
  joinability: joinabilityValidator,
});

const myCampaignCardView = v.object({
  campaignId: v.id('campaigns'),
  name: v.string(),
  description: v.string(),
  status: v.union(v.literal('pending'), v.literal('active')),
  gameRole: gameRoleValidator,
  campaignAccess: campaignAccessValidator,
  isOwner: v.boolean(),
});

const rosterEntryView = v.object({
  userId: v.id('users'),
  displayName: v.string(),
  handle: v.string(),
  gameRole: gameRoleValidator,
  campaignAccess: campaignAccessValidator,
  isOwner: v.boolean(),
});

const requestEntryView = v.object({
  userId: v.id('users'),
  displayName: v.string(),
  handle: v.string(),
  requestedAt: v.number(),
});

const settingsView = v.object({
  campaignId: v.id('campaigns'),
  name: v.string(),
  description: v.string(),
  visibility: visibilityValidator,
  joinability: joinabilityValidator,
  joinCode: v.string(),
});

type DatabaseCtx = QueryCtx | MutationCtx;

function validateName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 80)
    throw new ConvexError('Campaign name must be 1–80 characters');
  return trimmed;
}

function validateDescription(description: string): string {
  const trimmed = description.trim();
  if (trimmed.length > 300) throw new ConvexError('Description must be at most 300 characters');
  return trimmed;
}

function normalizeJoinCode(code: string): string {
  return code.trim().toUpperCase();
}

async function generateJoinCode(ctx: MutationCtx): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const bytes = crypto.getRandomValues(new Uint8Array(JOIN_CODE_LENGTH));
    let code = '';
    for (const byte of bytes) {
      code += JOIN_CODE_ALPHABET[byte % JOIN_CODE_ALPHABET.length];
    }
    const collision = await ctx.db
      .query('campaigns')
      .withIndex('by_joinCode', (q) => q.eq('joinCode', code))
      .unique();
    if (!collision) return code;
  }
  throw new ConvexError('Could not generate a join code — try again');
}

async function getMembership(
  ctx: DatabaseCtx,
  campaignId: Id<'campaigns'>,
  userId: Id<'users'>,
): Promise<Doc<'campaignMemberships'> | null> {
  return await ctx.db
    .query('campaignMemberships')
    .withIndex('by_campaignId_userId', (q) => q.eq('campaignId', campaignId).eq('userId', userId))
    .unique();
}

async function requireOwner(
  ctx: DatabaseCtx,
  campaignId: Id<'campaigns'>,
): Promise<{ campaign: Doc<'campaigns'>; ownerId: Id<'users'> }> {
  const profile = await requireProfile(ctx);
  const campaign = await ctx.db.get(campaignId);
  if (!campaign || campaign.ownerId !== profile.userId) throw new ConvexError(CAMPAIGN_NOT_FOUND);
  return { campaign, ownerId: profile.userId };
}

async function recordCampaignEvent(
  ctx: MutationCtx,
  args: {
    campaignId: Id<'campaigns'>;
    actorUserId: Id<'users'>;
    subjectUserId?: Id<'users'>;
    sessionId?: Id<'sessions'>;
    type: Doc<'campaignAuditEvents'>['type'];
  },
): Promise<void> {
  await ctx.db.insert('campaignAuditEvents', {
    ...args,
    occurredAt: Date.now(),
  });
}

async function activeMembers(
  ctx: DatabaseCtx,
  campaignId: Id<'campaigns'>,
): Promise<Doc<'campaignMemberships'>[]> {
  return await ctx.db
    .query('campaignMemberships')
    .withIndex('by_campaignId_status', (q) => q.eq('campaignId', campaignId).eq('status', 'active'))
    .take(MAX_CAMPAIGN_MEMBERS);
}

// Recount the bounded active roster after each membership-size change. This
// both maintains the denormalized preview/directory value and repairs any
// stale legacy counter the next time that campaign changes.
async function reconcileMemberCount(ctx: MutationCtx, campaign: Doc<'campaigns'>): Promise<void> {
  const active = await ctx.db
    .query('campaignMemberships')
    .withIndex('by_campaignId_status', (q) =>
      q.eq('campaignId', campaign._id).eq('status', 'active'),
    )
    .take(MAX_CAMPAIGN_MEMBERS);
  await ctx.db.patch(campaign._id, { memberCount: active.length });
}

async function directorMembership(
  ctx: DatabaseCtx,
  campaignId: Id<'campaigns'>,
): Promise<Doc<'campaignMemberships'> | null> {
  const members = await ctx.db
    .query('campaignMemberships')
    .withIndex('by_campaignId_status', (q) => q.eq('campaignId', campaignId).eq('status', 'active'))
    .take(MAX_CAMPAIGN_MEMBERS);
  return members.find((membership) => gameRoleFor(membership) === 'director') ?? null;
}

// After the active director's row is deleted or demoted, the role reverts to
// the owner — preserving the exactly-one-director invariant.
async function revertDirectorToOwner(ctx: MutationCtx, campaign: Doc<'campaigns'>): Promise<void> {
  const ownerMembership = await getMembership(ctx, campaign._id, campaign.ownerId);
  if (!ownerMembership || ownerMembership.status !== 'active')
    throw new ConvexError('Campaign owner membership is missing');
  await ctx.db.patch(ownerMembership._id, { gameRole: 'director', updatedAt: Date.now() });
}

async function ownerDisplayName(ctx: DatabaseCtx, ownerId: Id<'users'>): Promise<string> {
  const profile = await ctx.db
    .query('profiles')
    .withIndex('by_userId', (q) => q.eq('userId', ownerId))
    .unique();
  return profile?.displayName ?? '';
}

async function buildPreview(
  ctx: DatabaseCtx,
  campaign: Doc<'campaigns'>,
  viewerId: Id<'users'>,
): Promise<{
  campaignId: Id<'campaigns'>;
  name: string;
  description: string;
  ownerName: string;
  memberCount: number;
  joinability: 'open' | 'closed';
  viewerStatus: 'none' | 'pending' | 'active';
}> {
  const membership = await getMembership(ctx, campaign._id, viewerId);
  // A blocked viewer sees no special state (decided: generic-failure UX).
  const viewerStatus =
    membership && membership.status !== 'blocked' ? membership.status : ('none' as const);
  return {
    campaignId: campaign._id,
    name: campaign.name,
    description: campaign.description,
    ownerName: await ownerDisplayName(ctx, campaign.ownerId),
    memberCount: campaign.memberCount,
    joinability: campaign.joinability,
    viewerStatus,
  };
}

// Resolve the join-screen target from exactly one of code / campaignId.
// The code path reaches public and private campaigns alike; the ID path
// reaches public campaigns, plus private ones only when the viewer already
// has a pending/active membership (their own listMine cards). A private
// campaign's ID otherwise behaves as nonexistent — IDs must not become an
// enumeration side-channel around the code. Blocked counts as no membership.
async function resolveJoinTarget(
  ctx: DatabaseCtx,
  viewerId: Id<'users'>,
  args: { campaignId?: Id<'campaigns'>; code?: string },
): Promise<Doc<'campaigns'>> {
  if (args.code !== undefined) {
    if (args.campaignId !== undefined)
      throw new ConvexError('Provide either a campaign or a join code');
    const code = normalizeJoinCode(args.code);
    const campaign = await ctx.db
      .query('campaigns')
      .withIndex('by_joinCode', (q) => q.eq('joinCode', code))
      .unique();
    if (!campaign) throw new ConvexError(CAMPAIGN_NOT_FOUND);
    return campaign;
  }
  if (args.campaignId === undefined)
    throw new ConvexError('Provide either a campaign or a join code');
  const campaign = await ctx.db.get(args.campaignId);
  if (!campaign) throw new ConvexError(CAMPAIGN_NOT_FOUND);
  if (campaign.visibility === 'private') {
    const membership = await getMembership(ctx, campaign._id, viewerId);
    if (!membership || membership.status === 'blocked') throw new ConvexError(CAMPAIGN_NOT_FOUND);
  }
  return campaign;
}

export const create = mutation({
  args: { name: v.string(), description: v.string() },
  returns: v.id('campaigns'),
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const [owned, activeMemberships] = await Promise.all([
      ctx.db
        .query('campaigns')
        .withIndex('by_ownerId', (q) => q.eq('ownerId', profile.userId))
        .take(MAX_OWNED_CAMPAIGNS),
      ctx.db
        .query('campaignMemberships')
        .withIndex('by_userId_status', (q) => q.eq('userId', profile.userId).eq('status', 'active'))
        .take(MAX_ACTIVE_CAMPAIGNS_PER_USER),
    ]);
    if (owned.length >= MAX_OWNED_CAMPAIGNS)
      throw new ConvexError(`You already own ${MAX_OWNED_CAMPAIGNS} campaigns`);
    if (activeMemberships.length >= MAX_ACTIVE_CAMPAIGNS_PER_USER)
      throw new ConvexError(
        `You already belong to ${MAX_ACTIVE_CAMPAIGNS_PER_USER} active campaigns`,
      );
    const now = Date.now();
    const campaignId = await ctx.db.insert('campaigns', {
      name: validateName(args.name),
      description: validateDescription(args.description),
      ownerId: profile.userId,
      visibility: 'private',
      joinability: 'open',
      joinCode: await generateJoinCode(ctx),
      joinCodeRotatedAt: now,
      memberCount: 1,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert('campaignMemberships', {
      campaignId,
      userId: profile.userId,
      status: 'active',
      campaignAccess: 'admin',
      gameRole: 'director',
      requestedAt: now,
      joinedAt: now,
      updatedAt: now,
    });
    return campaignId;
  },
});

export const updateSettings = mutation({
  args: { campaignId: v.id('campaigns'), name: v.string(), description: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { campaign, profile } = await requireCampaignAdmin(ctx, args.campaignId);
    await ctx.db.patch(campaign._id, {
      name: validateName(args.name),
      description: validateDescription(args.description),
      updatedAt: Date.now(),
    });
    await recordCampaignEvent(ctx, {
      campaignId: campaign._id,
      actorUserId: profile.userId,
      type: 'settings_updated',
    });
    return null;
  },
});

export const setVisibility = mutation({
  args: { campaignId: v.id('campaigns'), visibility: visibilityValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { campaign, profile } = await requireCampaignAdmin(ctx, args.campaignId);
    await ctx.db.patch(campaign._id, { visibility: args.visibility, updatedAt: Date.now() });
    await recordCampaignEvent(ctx, {
      campaignId: campaign._id,
      actorUserId: profile.userId,
      type: 'settings_updated',
    });
    return null;
  },
});

export const setJoinability = mutation({
  args: { campaignId: v.id('campaigns'), joinability: joinabilityValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { campaign, profile } = await requireCampaignAdmin(ctx, args.campaignId);
    await ctx.db.patch(campaign._id, { joinability: args.joinability, updatedAt: Date.now() });
    await recordCampaignEvent(ctx, {
      campaignId: campaign._id,
      actorUserId: profile.userId,
      type: 'settings_updated',
    });
    return null;
  },
});

export const regenerateJoinCode = mutation({
  args: { campaignId: v.id('campaigns') },
  returns: v.string(),
  handler: async (ctx, args) => {
    const { campaign, profile } = await requireCampaignAdmin(ctx, args.campaignId);
    const joinCode = await generateJoinCode(ctx);
    const now = Date.now();
    await ctx.db.patch(campaign._id, { joinCode, joinCodeRotatedAt: now, updatedAt: now });
    await recordCampaignEvent(ctx, {
      campaignId: campaign._id,
      actorUserId: profile.userId,
      type: 'settings_updated',
    });
    return joinCode;
  },
});

export const getSettings = query({
  args: { campaignId: v.id('campaigns') },
  returns: settingsView,
  handler: async (ctx, args) => {
    const { campaign } = await requireCampaignAdmin(ctx, args.campaignId);
    return {
      campaignId: campaign._id,
      name: campaign.name,
      description: campaign.description,
      visibility: campaign.visibility,
      joinability: campaign.joinability,
      joinCode: campaign.joinCode,
    };
  },
});

export const getJoinPreview = query({
  args: { campaignId: v.id('campaigns') },
  returns: joinPreviewView,
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const campaign = await resolveJoinTarget(ctx, profile.userId, { campaignId: args.campaignId });
    return await buildPreview(ctx, campaign, profile.userId);
  },
});

export const previewJoinCode = mutation({
  args: { code: v.string() },
  returns: joinCodePreviewResult,
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const limit = await rateLimiter.limit(ctx, 'joinCodePreview', {
      key: profile.userId,
    });
    if (!limit.ok) throw new ConvexError('Too many join-code attempts. Try again later.');
    const code = normalizeJoinCode(args.code);
    const campaign = await ctx.db
      .query('campaigns')
      .withIndex('by_joinCode', (q) => q.eq('joinCode', code))
      .unique();
    if (!campaign) return { status: 'not_found' } as const;
    return {
      status: 'found',
      preview: await buildPreview(ctx, campaign, profile.userId),
    } as const;
  },
});

export const listDirectory = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(directoryEntryView),
    isDone: v.boolean(),
    continueCursor: v.string(),
    splitCursor: v.optional(v.union(v.string(), v.null())),
    pageStatus: v.optional(
      v.union(v.literal('SplitRecommended'), v.literal('SplitRequired'), v.null()),
    ),
  }),
  handler: async (ctx, args) => {
    await requireProfile(ctx);
    // Client-supplied page size is clamped: page size × one profile read per
    // entry is the whole read cost, and the client doesn't set the ceiling.
    const paginationOpts = {
      ...args.paginationOpts,
      numItems: Math.min(args.paginationOpts.numItems, DIRECTORY_PAGE_CAP),
    };
    const page = await ctx.db
      .query('campaigns')
      .withIndex('by_visibility', (q) => q.eq('visibility', 'public'))
      .order('desc')
      .paginate(paginationOpts);
    return {
      ...page,
      page: await Promise.all(
        page.page.map(async (campaign) => ({
          campaignId: campaign._id,
          name: campaign.name,
          description: campaign.description,
          ownerName: await ownerDisplayName(ctx, campaign.ownerId),
          memberCount: campaign.memberCount,
          joinability: campaign.joinability,
        })),
      ),
    };
  },
});

export const listMine = query({
  args: {},
  returns: v.array(myCampaignCardView),
  handler: async (ctx) => {
    const profile = await requireProfile(ctx);
    const cards = [];
    for (const { status, limit } of [
      { status: 'active', limit: MAX_ACTIVE_CAMPAIGNS_PER_USER },
      { status: 'pending', limit: MAX_PENDING_JOIN_REQUESTS },
    ] as const) {
      const memberships = await ctx.db
        .query('campaignMemberships')
        .withIndex('by_userId_status', (q) => q.eq('userId', profile.userId).eq('status', status))
        .take(limit);
      for (const membership of memberships) {
        const campaign = await ctx.db.get(membership.campaignId);
        if (!campaign) continue;
        cards.push({
          campaignId: campaign._id,
          name: campaign.name,
          description: campaign.description,
          status,
          gameRole: gameRoleFor(membership),
          campaignAccess: campaignAccessFor(membership, campaign),
          isOwner: campaign.ownerId === profile.userId,
        });
      }
    }
    return cards;
  },
});

export const listRoster = query({
  args: { campaignId: v.id('campaigns') },
  returns: v.object({
    viewer: v.object({
      gameRole: gameRoleValidator,
      campaignAccess: campaignAccessValidator,
      isOwner: v.boolean(),
      canAdminister: v.boolean(),
    }),
    members: v.array(rosterEntryView),
    pending: v.optional(v.array(requestEntryView)),
    blocked: v.optional(v.array(requestEntryView)),
  }),
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const campaign = await ctx.db.get(args.campaignId);
    if (!campaign) throw new ConvexError(CAMPAIGN_NOT_FOUND);
    const viewer = await getMembership(ctx, campaign._id, profile.userId);
    if (!viewer || viewer.status !== 'active') throw new ConvexError(CAMPAIGN_NOT_FOUND);

    const entryFor = async (membership: Doc<'campaignMemberships'>) => {
      const memberProfile = await ctx.db
        .query('profiles')
        .withIndex('by_userId', (q) => q.eq('userId', membership.userId))
        .unique();
      return memberProfile
        ? {
            userId: membership.userId,
            displayName: memberProfile.displayName,
            handle: memberProfile.handle,
            membership,
          }
        : null;
    };

    const members = [];
    for (const membership of await activeMembers(ctx, campaign._id)) {
      const entry = await entryFor(membership);
      if (entry)
        members.push({
          userId: entry.userId,
          displayName: entry.displayName,
          handle: entry.handle,
          gameRole: gameRoleFor(membership),
          campaignAccess: campaignAccessFor(membership, campaign),
          isOwner: membership.userId === campaign.ownerId,
        });
    }
    const viewerSummary = {
      gameRole: gameRoleFor(viewer),
      campaignAccess: campaignAccessFor(viewer, campaign),
      isOwner: campaign.ownerId === profile.userId,
      canAdminister: campaignAccessFor(viewer, campaign) === 'admin',
    };
    if (!viewerSummary.canAdminister) return { viewer: viewerSummary, members };

    const listByStatus = async (status: 'pending' | 'blocked', limit: number) => {
      const rows = await ctx.db
        .query('campaignMemberships')
        .withIndex('by_campaignId_status', (q) =>
          q.eq('campaignId', campaign._id).eq('status', status),
        )
        .order('desc')
        .take(limit);
      const entries = [];
      for (const row of rows) {
        const entry = await entryFor(row);
        if (entry)
          entries.push({
            userId: entry.userId,
            displayName: entry.displayName,
            handle: entry.handle,
            requestedAt: row.requestedAt,
          });
      }
      return entries;
    };
    return {
      viewer: viewerSummary,
      members,
      pending: await listByStatus('pending', MAX_PENDING_REQUESTS_PER_CAMPAIGN),
      blocked: await listByStatus('blocked', MAX_BLOCKED_ROSTER_ENTRIES),
    };
  },
});

export const requestToJoin = mutation({
  args: { campaignId: v.optional(v.id('campaigns')), code: v.optional(v.string()) },
  returns: v.union(v.literal('pending'), v.literal('active')),
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const limit = await rateLimiter.limit(ctx, 'joinRequest', { key: profile.userId });
    if (!limit.ok) throw new ConvexError('Too many join requests. Try again later.');
    const campaign = await resolveJoinTarget(ctx, profile.userId, args);
    const membership = await getMembership(ctx, campaign._id, profile.userId);
    if (membership?.status === 'active') return 'active';
    // Closed checked before blocked: a blocked user gets the same message as
    // everyone else while the door is shut, leaking nothing.
    if (campaign.joinability === 'closed')
      throw new ConvexError('This campaign is not accepting new members');
    if (membership?.status === 'blocked') throw new ConvexError(REQUEST_FAILED);
    if (membership) return membership.status;
    const pendingElsewhere = await ctx.db
      .query('campaignMemberships')
      .withIndex('by_userId_status', (q) => q.eq('userId', profile.userId).eq('status', 'pending'))
      .take(MAX_PENDING_JOIN_REQUESTS);
    if (pendingElsewhere.length >= MAX_PENDING_JOIN_REQUESTS)
      throw new ConvexError(
        `You have ${MAX_PENDING_JOIN_REQUESTS} pending join requests — cancel one first`,
      );
    const campaignPending = await ctx.db
      .query('campaignMemberships')
      .withIndex('by_campaignId_status', (q) =>
        q.eq('campaignId', campaign._id).eq('status', 'pending'),
      )
      .take(MAX_PENDING_REQUESTS_PER_CAMPAIGN);
    if (campaignPending.length >= MAX_PENDING_REQUESTS_PER_CAMPAIGN)
      throw new ConvexError('This campaign has too many pending join requests');
    const now = Date.now();
    await ctx.db.insert('campaignMemberships', {
      campaignId: campaign._id,
      userId: profile.userId,
      status: 'pending',
      campaignAccess: 'user',
      gameRole: 'player',
      requestedAt: now,
      updatedAt: now,
    });
    return 'pending';
  },
});

export const cancelJoinRequest = mutation({
  args: { campaignId: v.id('campaigns') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const membership = await getMembership(ctx, args.campaignId, profile.userId);
    if (!membership || membership.status !== 'pending')
      throw new ConvexError('No pending request to cancel');
    await ctx.db.delete(membership._id);
    return null;
  },
});

export const approveRequest = mutation({
  args: { campaignId: v.id('campaigns'), targetUserId: v.id('users') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { campaign, profile } = await requireCampaignAdmin(ctx, args.campaignId);
    const membership = await getMembership(ctx, campaign._id, args.targetUserId);
    if (!membership || membership.status !== 'pending')
      throw new ConvexError('No pending request for that user');
    if ((await activeMembers(ctx, campaign._id)).length >= MAX_CAMPAIGN_MEMBERS)
      throw new ConvexError('This campaign has reached its member limit');
    const targetMemberships = await ctx.db
      .query('campaignMemberships')
      .withIndex('by_userId_status', (q) =>
        q.eq('userId', args.targetUserId).eq('status', 'active'),
      )
      .take(MAX_ACTIVE_CAMPAIGNS_PER_USER);
    if (targetMemberships.length >= MAX_ACTIVE_CAMPAIGNS_PER_USER)
      throw new ConvexError('That user has reached their active campaign limit');
    const now = Date.now();
    await ctx.db.patch(membership._id, {
      status: 'active',
      campaignAccess: 'user',
      gameRole: 'player',
      joinedAt: now,
      updatedAt: now,
    });
    await reconcileMemberCount(ctx, campaign);
    await recordCampaignEvent(ctx, {
      campaignId: campaign._id,
      actorUserId: profile.userId,
      subjectUserId: args.targetUserId,
      type: 'member_approved',
    });
    return null;
  },
});

export const denyRequest = mutation({
  args: { campaignId: v.id('campaigns'), targetUserId: v.id('users') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { campaign, profile } = await requireCampaignAdmin(ctx, args.campaignId);
    const membership = await getMembership(ctx, campaign._id, args.targetUserId);
    if (!membership || membership.status !== 'pending')
      throw new ConvexError('No pending request for that user');
    // Deny deletes the row: the user may request again later.
    await ctx.db.delete(membership._id);
    await recordCampaignEvent(ctx, {
      campaignId: campaign._id,
      actorUserId: profile.userId,
      subjectUserId: args.targetUserId,
      type: 'member_denied',
    });
    return null;
  },
});

export const blockUser = mutation({
  args: { campaignId: v.id('campaigns'), targetUserId: v.id('users') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { campaign, profile } = await requireCampaignAdmin(ctx, args.campaignId);
    if (args.targetUserId === campaign.ownerId)
      throw new ConvexError('The owner cannot be blocked');
    const membership = await getMembership(ctx, campaign._id, args.targetUserId);
    if (!membership || membership.status === 'blocked')
      throw new ConvexError('No request or membership to block');
    if (
      profile.userId !== campaign.ownerId &&
      membership.status === 'active' &&
      campaignAccessFor(membership, campaign) === 'admin'
    )
      throw new ConvexError('Only the owner can block a campaign admin');
    const wasActive = membership.status === 'active';
    const wasDirector = wasActive && gameRoleFor(membership) === 'director';
    await ctx.db.patch(membership._id, {
      status: 'blocked',
      campaignAccess: 'user',
      gameRole: 'player',
      updatedAt: Date.now(),
    });
    if (wasActive) {
      await removePresenceForMember(ctx, campaign._id, args.targetUserId);
      await detachCharactersForMembershipEnd(ctx, {
        campaignId: campaign._id,
        ownerUserId: args.targetUserId,
        actorUserId: profile.userId,
      });
      await reconcileMemberCount(ctx, campaign);
    }
    if (wasDirector) await revertDirectorToOwner(ctx, campaign);
    await recordCampaignEvent(ctx, {
      campaignId: campaign._id,
      actorUserId: profile.userId,
      subjectUserId: args.targetUserId,
      type: 'member_blocked',
    });
    return null;
  },
});

export const unblockUser = mutation({
  args: { campaignId: v.id('campaigns'), targetUserId: v.id('users') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { campaign, profile } = await requireCampaignAdmin(ctx, args.campaignId);
    const membership = await getMembership(ctx, campaign._id, args.targetUserId);
    if (!membership || membership.status !== 'blocked')
      throw new ConvexError('That user is not blocked');
    // Unblock deletes the row: the user may request again.
    await ctx.db.delete(membership._id);
    await recordCampaignEvent(ctx, {
      campaignId: campaign._id,
      actorUserId: profile.userId,
      subjectUserId: args.targetUserId,
      type: 'member_unblocked',
    });
    return null;
  },
});

export const setDirector = mutation({
  args: { campaignId: v.id('campaigns'), targetUserId: v.id('users') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { campaign, profile } = await requireCampaignAdmin(ctx, args.campaignId);
    const target = await getMembership(ctx, campaign._id, args.targetUserId);
    if (!target || target.status !== 'active')
      throw new ConvexError('Only an active member can be made director');
    if (gameRoleFor(target) === 'director') return null;
    const now = Date.now();
    // Atomic swap keeps exactly one director: demote whoever holds it
    // (possibly the owner), then promote the target.
    const current = await directorMembership(ctx, campaign._id);
    if (current) await ctx.db.patch(current._id, { gameRole: 'player', updatedAt: now });
    await ctx.db.patch(target._id, { gameRole: 'director', updatedAt: now });
    await recordCampaignEvent(ctx, {
      campaignId: campaign._id,
      actorUserId: profile.userId,
      subjectUserId: target.userId,
      ...(campaign.activeSessionId === undefined ? {} : { sessionId: campaign.activeSessionId }),
      type: 'director_assigned',
    });
    await recordDirectorHandoff(ctx, {
      campaignId: campaign._id,
      sessionId: campaign.activeSessionId,
      actorUserId: profile.userId,
      targetUserId: target.userId,
    });
    return null;
  },
});

export const setCampaignAccess = mutation({
  args: {
    campaignId: v.id('campaigns'),
    targetUserId: v.id('users'),
    campaignAccess: campaignAccessValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { campaign, ownerId } = await requireOwner(ctx, args.campaignId);
    if (args.targetUserId === campaign.ownerId)
      throw new ConvexError('The owner is always a campaign admin');
    const target = await getMembership(ctx, campaign._id, args.targetUserId);
    if (!target || target.status !== 'active')
      throw new ConvexError('Only an active member can be made campaign admin');
    if (campaignAccessFor(target, campaign) === args.campaignAccess) return null;
    await ctx.db.patch(target._id, {
      campaignAccess: args.campaignAccess,
      updatedAt: Date.now(),
    });
    await recordCampaignEvent(ctx, {
      campaignId: campaign._id,
      actorUserId: ownerId,
      subjectUserId: target.userId,
      type: args.campaignAccess === 'admin' ? 'admin_granted' : 'admin_revoked',
    });
    return null;
  },
});

export const removeMember = mutation({
  args: { campaignId: v.id('campaigns'), targetUserId: v.id('users') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { campaign, profile } = await requireCampaignAdmin(ctx, args.campaignId);
    if (args.targetUserId === campaign.ownerId)
      throw new ConvexError('The owner cannot be removed');
    const membership = await getMembership(ctx, campaign._id, args.targetUserId);
    if (!membership || membership.status !== 'active')
      throw new ConvexError('That user is not a member');
    if (profile.userId !== campaign.ownerId && campaignAccessFor(membership, campaign) === 'admin')
      throw new ConvexError('Only the owner can remove a campaign admin');
    const wasDirector = gameRoleFor(membership) === 'director';
    await removePresenceForMember(ctx, campaign._id, args.targetUserId);
    await detachCharactersForMembershipEnd(ctx, {
      campaignId: campaign._id,
      ownerUserId: args.targetUserId,
      actorUserId: profile.userId,
    });
    await ctx.db.delete(membership._id);
    await reconcileMemberCount(ctx, campaign);
    if (wasDirector) await revertDirectorToOwner(ctx, campaign);
    await recordCampaignEvent(ctx, {
      campaignId: campaign._id,
      actorUserId: profile.userId,
      subjectUserId: args.targetUserId,
      type: 'member_removed',
    });
    return null;
  },
});

export const leaveCampaign = mutation({
  args: { campaignId: v.id('campaigns') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const campaign = await ctx.db.get(args.campaignId);
    if (!campaign) throw new ConvexError(CAMPAIGN_NOT_FOUND);
    if (campaign.ownerId === profile.userId)
      throw new ConvexError('The owner cannot leave their campaign');
    const membership = await getMembership(ctx, campaign._id, profile.userId);
    // Uniform not-found: a non-member must not be able to distinguish a real
    // private campaign from a nonexistent ID through this mutation either.
    if (!membership || membership.status !== 'active') throw new ConvexError(CAMPAIGN_NOT_FOUND);
    const wasDirector = gameRoleFor(membership) === 'director';
    await removePresenceForMember(ctx, campaign._id, profile.userId);
    await detachCharactersForMembershipEnd(ctx, {
      campaignId: campaign._id,
      ownerUserId: profile.userId,
      actorUserId: profile.userId,
    });
    await ctx.db.delete(membership._id);
    await reconcileMemberCount(ctx, campaign);
    if (wasDirector) await revertDirectorToOwner(ctx, campaign);
    return null;
  },
});
