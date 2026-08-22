import { ConvexError, v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { type MutationCtx, type QueryCtx, mutation, query } from './_generated/server';
import { gameRoleFor, requireActiveMember } from './authz';
import { rateLimiter } from './rateLimits';

// The Table — a campaign's live lobby. Presence is heartbeat-based: the page
// joins on mount, heartbeats every HEARTBEAT_MS, and leaves on unmount; a row
// not refreshed within PRESENCE_STALE_MS reads as absent (covers crashed tabs
// with no goodbye). Rows are bounded by the campaign membership ceiling and
// membership-end mutations remove them; heartbeats never sweep other users.

export const HEARTBEAT_MS = 15_000;
export const PRESENCE_STALE_MS = 45_000;
const MESSAGE_MAX_LENGTH = 1_000;
const MESSAGE_PAGE_SIZE = 50;
const MAX_PRESENT_PLAYERS = 200;

const roleValidator = v.union(v.literal('player'), v.literal('director'));

const presentPlayerView = v.object({
  userId: v.id('users'),
  displayName: v.string(),
  handle: v.string(),
  role: roleValidator,
  isOwner: v.boolean(),
  joinedAt: v.number(),
});

const messageView = v.object({
  messageId: v.id('lobbyMessages'),
  authorUserId: v.id('users'),
  authorName: v.string(),
  authorHandle: v.string(),
  body: v.string(),
  sentAt: v.number(),
});

type DatabaseCtx = QueryCtx | MutationCtx;

async function presenceRow(
  ctx: DatabaseCtx,
  campaignId: Id<'campaigns'>,
  userId: Id<'users'>,
): Promise<Doc<'lobbyPresence'> | null> {
  return await ctx.db
    .query('lobbyPresence')
    .withIndex('by_campaignId_userId', (q) => q.eq('campaignId', campaignId).eq('userId', userId))
    .unique();
}

async function touchPresence(
  ctx: MutationCtx,
  args: {
    campaignId: Id<'campaigns'>;
    userId: Id<'users'>;
    displayName: string;
    handle: string;
    gameRole: 'player' | 'director';
  },
) {
  const now = Date.now();
  const existing = await presenceRow(ctx, args.campaignId, args.userId);
  if (existing) {
    await ctx.db.patch(existing._id, {
      displayName: args.displayName,
      handle: args.handle,
      gameRole: args.gameRole,
      lastSeenAt: now,
    });
  } else {
    await ctx.db.insert('lobbyPresence', {
      campaignId: args.campaignId,
      userId: args.userId,
      displayName: args.displayName,
      handle: args.handle,
      gameRole: args.gameRole,
      joinedAt: now,
      lastSeenAt: now,
    });
  }
}

export async function removePresenceForMember(
  ctx: MutationCtx,
  campaignId: Id<'campaigns'>,
  userId: Id<'users'>,
): Promise<void> {
  const row = await presenceRow(ctx, campaignId, userId);
  if (row) await ctx.db.delete(row._id);
}

export const join = mutation({
  args: { campaignId: v.id('campaigns') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { profile, membership } = await requireActiveMember(ctx, args.campaignId);
    await touchPresence(ctx, {
      campaignId: args.campaignId,
      userId: profile.userId,
      displayName: profile.displayName,
      handle: profile.handle,
      gameRole: gameRoleFor(membership),
    });
    return null;
  },
});

export const heartbeat = mutation({
  args: { campaignId: v.id('campaigns') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { profile, membership } = await requireActiveMember(ctx, args.campaignId);
    await touchPresence(ctx, {
      campaignId: args.campaignId,
      userId: profile.userId,
      displayName: profile.displayName,
      handle: profile.handle,
      gameRole: gameRoleFor(membership),
    });
    return null;
  },
});

export const leave = mutation({
  args: { campaignId: v.id('campaigns') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { profile } = await requireActiveMember(ctx, args.campaignId);
    const existing = await presenceRow(ctx, args.campaignId, profile.userId);
    if (existing) await ctx.db.delete(existing._id);
    return null;
  },
});

export const listPresent = query({
  args: { campaignId: v.id('campaigns') },
  returns: v.array(presentPlayerView),
  handler: async (ctx, args) => {
    const { campaign } = await requireActiveMember(ctx, args.campaignId);
    const rows = await ctx.db
      .query('lobbyPresence')
      .withIndex('by_campaignId', (q) => q.eq('campaignId', campaign._id))
      .take(MAX_PRESENT_PLAYERS);
    const cutoff = Date.now() - PRESENCE_STALE_MS;
    const players = [];
    for (const row of rows) {
      if (row.lastSeenAt < cutoff) continue;
      if (!row.displayName || !row.handle || !row.gameRole) continue;
      players.push({
        userId: row.userId,
        displayName: row.displayName,
        handle: row.handle,
        role: row.gameRole,
        isOwner: row.userId === campaign.ownerId,
        joinedAt: row.joinedAt,
      });
    }
    players.sort((a, b) => a.joinedAt - b.joinedAt);
    return players;
  },
});

export const sendMessage = mutation({
  args: { campaignId: v.id('campaigns'), body: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { profile, campaign } = await requireActiveMember(ctx, args.campaignId);
    const body = args.body.trim();
    if (body.length < 1) throw new ConvexError('Message is empty');
    if (body.length > MESSAGE_MAX_LENGTH)
      throw new ConvexError(`Message must be at most ${MESSAGE_MAX_LENGTH} characters`);
    const [userLimit, campaignLimit] = await Promise.all([
      rateLimiter.limit(ctx, 'lobbyMessageUser', { key: profile.userId }),
      rateLimiter.limit(ctx, 'lobbyMessageCampaign', { key: campaign._id }),
    ]);
    if (!userLimit.ok || !campaignLimit.ok)
      throw new ConvexError('Messages are being sent too quickly. Try again shortly.');
    await ctx.db.insert('lobbyMessages', {
      campaignId: campaign._id,
      authorUserId: profile.userId,
      authorName: profile.displayName,
      authorHandle: profile.handle,
      body,
      sentAt: Date.now(),
    });
    return null;
  },
});

export const listMessages = query({
  args: { campaignId: v.id('campaigns') },
  returns: v.array(messageView),
  handler: async (ctx, args) => {
    const { campaign } = await requireActiveMember(ctx, args.campaignId);
    // Latest page only, oldest-first for rendering.
    const latest = await ctx.db
      .query('lobbyMessages')
      .withIndex('by_campaignId', (q) => q.eq('campaignId', campaign._id))
      .order('desc')
      .take(MESSAGE_PAGE_SIZE);
    latest.reverse();
    return latest.map((row) => ({
      messageId: row._id,
      authorUserId: row.authorUserId,
      authorName: row.authorName ?? 'Unknown',
      authorHandle: row.authorHandle ?? '',
      body: row.body,
      sentAt: row.sentAt,
    }));
  },
});
