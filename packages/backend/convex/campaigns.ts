import { paginationOptsValidator } from 'convex/server';
import { ConvexError, v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { type MutationCtx, type QueryCtx, mutation, query } from './_generated/server';
import { requireProfile } from './authz';

// Model + invariants: docs/campaigns-plan.md. Owner authority comes from
// campaigns.ownerId (never a membership role); exactly one active director
// per campaign; joinCode is the one regenerable secret behind code + link.

const CAMPAIGN_NOT_FOUND = 'Campaign not found';
const REQUEST_FAILED = 'Unable to send request';

// Unambiguous alphabet: no 0/O, 1/I/L.
const JOIN_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const JOIN_CODE_LENGTH = 8;

const visibilityValidator = v.union(v.literal('public'), v.literal('private'));
const roleValidator = v.union(v.literal('player'), v.literal('director'));

const joinPreviewView = v.object({
  campaignId: v.id('campaigns'),
  name: v.string(),
  description: v.string(),
  ownerName: v.string(),
  memberCount: v.number(),
  viewerStatus: v.union(v.literal('none'), v.literal('pending'), v.literal('active')),
});

const directoryEntryView = v.object({
  campaignId: v.id('campaigns'),
  name: v.string(),
  description: v.string(),
  ownerName: v.string(),
  memberCount: v.number(),
});

const myCampaignCardView = v.object({
  campaignId: v.id('campaigns'),
  name: v.string(),
  description: v.string(),
  status: v.union(v.literal('pending'), v.literal('active')),
  role: roleValidator,
  isOwner: v.boolean(),
});

const rosterEntryView = v.object({
  userId: v.id('users'),
  displayName: v.string(),
  handle: v.string(),
  role: roleValidator,
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

async function activeMembers(
  ctx: DatabaseCtx,
  campaignId: Id<'campaigns'>,
): Promise<Doc<'campaignMemberships'>[]> {
  return await ctx.db
    .query('campaignMemberships')
    .withIndex('by_campaignId_status', (q) => q.eq('campaignId', campaignId).eq('status', 'active'))
    .collect();
}

// After the active director's row is deleted or demoted, the role reverts to
// the owner — preserving the exactly-one-director invariant.
async function revertDirectorToOwner(ctx: MutationCtx, campaign: Doc<'campaigns'>): Promise<void> {
  const ownerMembership = await getMembership(ctx, campaign._id, campaign.ownerId);
  if (!ownerMembership || ownerMembership.status !== 'active')
    throw new ConvexError('Campaign owner membership is missing');
  await ctx.db.patch(ownerMembership._id, { role: 'director', updatedAt: Date.now() });
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
    memberCount: (await activeMembers(ctx, campaign._id)).length,
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
    const now = Date.now();
    const campaignId = await ctx.db.insert('campaigns', {
      name: validateName(args.name),
      description: validateDescription(args.description),
      ownerId: profile.userId,
      visibility: 'private',
      joinCode: await generateJoinCode(ctx),
      joinCodeRotatedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert('campaignMemberships', {
      campaignId,
      userId: profile.userId,
      status: 'active',
      role: 'director',
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
    const { campaign } = await requireOwner(ctx, args.campaignId);
    await ctx.db.patch(campaign._id, {
      name: validateName(args.name),
      description: validateDescription(args.description),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const setVisibility = mutation({
  args: { campaignId: v.id('campaigns'), visibility: visibilityValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { campaign } = await requireOwner(ctx, args.campaignId);
    await ctx.db.patch(campaign._id, { visibility: args.visibility, updatedAt: Date.now() });
    return null;
  },
});

export const regenerateJoinCode = mutation({
  args: { campaignId: v.id('campaigns') },
  returns: v.string(),
  handler: async (ctx, args) => {
    const { campaign } = await requireOwner(ctx, args.campaignId);
    const joinCode = await generateJoinCode(ctx);
    const now = Date.now();
    await ctx.db.patch(campaign._id, { joinCode, joinCodeRotatedAt: now, updatedAt: now });
    return joinCode;
  },
});

export const getSettings = query({
  args: { campaignId: v.id('campaigns') },
  returns: settingsView,
  handler: async (ctx, args) => {
    const { campaign } = await requireOwner(ctx, args.campaignId);
    return {
      campaignId: campaign._id,
      name: campaign.name,
      description: campaign.description,
      visibility: campaign.visibility,
      joinCode: campaign.joinCode,
    };
  },
});

export const getJoinPreview = query({
  args: { campaignId: v.optional(v.id('campaigns')), code: v.optional(v.string()) },
  returns: joinPreviewView,
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const campaign = await resolveJoinTarget(ctx, profile.userId, args);
    return await buildPreview(ctx, campaign, profile.userId);
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
    const page = await ctx.db
      .query('campaigns')
      .withIndex('by_visibility', (q) => q.eq('visibility', 'public'))
      .order('desc')
      .paginate(args.paginationOpts);
    return {
      ...page,
      page: await Promise.all(
        page.page.map(async (campaign) => ({
          campaignId: campaign._id,
          name: campaign.name,
          description: campaign.description,
          ownerName: await ownerDisplayName(ctx, campaign.ownerId),
          memberCount: (await activeMembers(ctx, campaign._id)).length,
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
    for (const status of ['active', 'pending'] as const) {
      const memberships = await ctx.db
        .query('campaignMemberships')
        .withIndex('by_userId_status', (q) => q.eq('userId', profile.userId).eq('status', status))
        .collect();
      for (const membership of memberships) {
        const campaign = await ctx.db.get(membership.campaignId);
        if (!campaign) continue;
        cards.push({
          campaignId: campaign._id,
          name: campaign.name,
          description: campaign.description,
          status,
          role: membership.role,
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
    viewer: v.object({ role: roleValidator, isOwner: v.boolean() }),
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
          role: membership.role,
          isOwner: membership.userId === campaign.ownerId,
        });
    }
    const viewerSummary = {
      role: viewer.role,
      isOwner: campaign.ownerId === profile.userId,
    };
    if (!viewerSummary.isOwner) return { viewer: viewerSummary, members };

    const listByStatus = async (status: 'pending' | 'blocked') => {
      const rows = await ctx.db
        .query('campaignMemberships')
        .withIndex('by_campaignId_status', (q) =>
          q.eq('campaignId', campaign._id).eq('status', status),
        )
        .collect();
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
      pending: await listByStatus('pending'),
      blocked: await listByStatus('blocked'),
    };
  },
});

export const requestToJoin = mutation({
  args: { campaignId: v.optional(v.id('campaigns')), code: v.optional(v.string()) },
  returns: v.union(v.literal('pending'), v.literal('active')),
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const campaign = await resolveJoinTarget(ctx, profile.userId, args);
    const membership = await getMembership(ctx, campaign._id, profile.userId);
    if (membership?.status === 'blocked') throw new ConvexError(REQUEST_FAILED);
    if (membership) return membership.status;
    const now = Date.now();
    await ctx.db.insert('campaignMemberships', {
      campaignId: campaign._id,
      userId: profile.userId,
      status: 'pending',
      role: 'player',
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
    const { campaign } = await requireOwner(ctx, args.campaignId);
    const membership = await getMembership(ctx, campaign._id, args.targetUserId);
    if (!membership || membership.status !== 'pending')
      throw new ConvexError('No pending request for that user');
    const now = Date.now();
    await ctx.db.patch(membership._id, {
      status: 'active',
      role: 'player',
      joinedAt: now,
      updatedAt: now,
    });
    return null;
  },
});

export const denyRequest = mutation({
  args: { campaignId: v.id('campaigns'), targetUserId: v.id('users') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { campaign } = await requireOwner(ctx, args.campaignId);
    const membership = await getMembership(ctx, campaign._id, args.targetUserId);
    if (!membership || membership.status !== 'pending')
      throw new ConvexError('No pending request for that user');
    // Deny deletes the row: the user may request again later.
    await ctx.db.delete(membership._id);
    return null;
  },
});

export const blockUser = mutation({
  args: { campaignId: v.id('campaigns'), targetUserId: v.id('users') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { campaign } = await requireOwner(ctx, args.campaignId);
    if (args.targetUserId === campaign.ownerId)
      throw new ConvexError('The owner cannot be blocked');
    const membership = await getMembership(ctx, campaign._id, args.targetUserId);
    if (!membership || membership.status === 'blocked')
      throw new ConvexError('No request or membership to block');
    const wasDirector = membership.status === 'active' && membership.role === 'director';
    await ctx.db.patch(membership._id, {
      status: 'blocked',
      role: 'player',
      updatedAt: Date.now(),
    });
    if (wasDirector) await revertDirectorToOwner(ctx, campaign);
    return null;
  },
});

export const unblockUser = mutation({
  args: { campaignId: v.id('campaigns'), targetUserId: v.id('users') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { campaign } = await requireOwner(ctx, args.campaignId);
    const membership = await getMembership(ctx, campaign._id, args.targetUserId);
    if (!membership || membership.status !== 'blocked')
      throw new ConvexError('That user is not blocked');
    // Unblock deletes the row: the user may request again.
    await ctx.db.delete(membership._id);
    return null;
  },
});

export const setDirector = mutation({
  args: { campaignId: v.id('campaigns'), targetUserId: v.id('users') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { campaign } = await requireOwner(ctx, args.campaignId);
    const target = await getMembership(ctx, campaign._id, args.targetUserId);
    if (!target || target.status !== 'active')
      throw new ConvexError('Only an active member can be made director');
    if (target.role === 'director') return null;
    const now = Date.now();
    // Atomic swap keeps exactly one director: demote whoever holds it
    // (possibly the owner), then promote the target.
    for (const membership of await activeMembers(ctx, campaign._id)) {
      if (membership.role === 'director')
        await ctx.db.patch(membership._id, { role: 'player', updatedAt: now });
    }
    await ctx.db.patch(target._id, { role: 'director', updatedAt: now });
    return null;
  },
});

export const removeMember = mutation({
  args: { campaignId: v.id('campaigns'), targetUserId: v.id('users') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { campaign } = await requireOwner(ctx, args.campaignId);
    if (args.targetUserId === campaign.ownerId)
      throw new ConvexError('The owner cannot be removed');
    const membership = await getMembership(ctx, campaign._id, args.targetUserId);
    if (!membership || membership.status !== 'active')
      throw new ConvexError('That user is not a member');
    const wasDirector = membership.role === 'director';
    await ctx.db.delete(membership._id);
    if (wasDirector) await revertDirectorToOwner(ctx, campaign);
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
    const wasDirector = membership.role === 'director';
    await ctx.db.delete(membership._id);
    if (wasDirector) await revertDirectorToOwner(ctx, campaign);
    return null;
  },
});
