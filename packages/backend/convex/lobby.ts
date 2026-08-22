import { ConvexError, v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { type MutationCtx, type QueryCtx, mutation, query } from './_generated/server';
import { requireActiveMember } from './authz';

// The Table — a campaign's live lobby. Presence is heartbeat-based: the page
// joins on mount, heartbeats every HEARTBEAT_MS, and leaves on unmount; a row
// not refreshed within PRESENCE_STALE_MS reads as absent (covers crashed tabs
// with no goodbye). Every viewer of the Table is themselves heartbeating, so
// each heartbeat re-runs the presence query for all subscribers and stale
// players drop off within the window — no cron needed at this scale.

export const HEARTBEAT_MS = 15_000;
export const PRESENCE_STALE_MS = 45_000;
const MESSAGE_MAX_LENGTH = 1_000;
const MESSAGE_PAGE_SIZE = 50;

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

// Refresh the caller's row and sweep any stale rows in the same campaign so
// crashed tabs don't accumulate. Bounded by campaign size.
async function touchPresence(ctx: MutationCtx, campaignId: Id<'campaigns'>, userId: Id<'users'>) {
  const now = Date.now();
  const existing = await presenceRow(ctx, campaignId, userId);
  if (existing) {
    await ctx.db.patch(existing._id, { lastSeenAt: now });
  } else {
    await ctx.db.insert('lobbyPresence', { campaignId, userId, joinedAt: now, lastSeenAt: now });
  }
  const rows = await ctx.db
    .query('lobbyPresence')
    .withIndex('by_campaignId', (q) => q.eq('campaignId', campaignId))
    .collect();
  for (const row of rows) {
    if (row.userId !== userId && now - row.lastSeenAt > PRESENCE_STALE_MS)
      await ctx.db.delete(row._id);
  }
}

export const join = mutation({
  args: { campaignId: v.id('campaigns') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { profile } = await requireActiveMember(ctx, args.campaignId);
    await touchPresence(ctx, args.campaignId, profile.userId);
    return null;
  },
});

export const heartbeat = mutation({
  args: { campaignId: v.id('campaigns') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { profile } = await requireActiveMember(ctx, args.campaignId);
    await touchPresence(ctx, args.campaignId, profile.userId);
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
      .collect();
    const cutoff = Date.now() - PRESENCE_STALE_MS;
    const players = [];
    for (const row of rows) {
      if (row.lastSeenAt < cutoff) continue;
      const profile = await ctx.db
        .query('profiles')
        .withIndex('by_userId', (q) => q.eq('userId', row.userId))
        .unique();
      const membership = await ctx.db
        .query('campaignMemberships')
        .withIndex('by_campaignId_userId', (q) =>
          q.eq('campaignId', campaign._id).eq('userId', row.userId),
        )
        .unique();
      // A member removed from the campaign mid-session keeps a presence row
      // until it goes stale; they're no longer at the Table.
      if (!profile || !membership || membership.status !== 'active') continue;
      players.push({
        userId: row.userId,
        displayName: profile.displayName,
        handle: profile.handle,
        role: membership.role,
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
    await ctx.db.insert('lobbyMessages', {
      campaignId: campaign._id,
      authorUserId: profile.userId,
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
    const messages = [];
    for (const row of latest) {
      const profile = await ctx.db
        .query('profiles')
        .withIndex('by_userId', (q) => q.eq('userId', row.authorUserId))
        .unique();
      messages.push({
        messageId: row._id,
        authorUserId: row.authorUserId,
        authorName: profile?.displayName ?? 'Unknown',
        authorHandle: profile?.handle ?? '',
        body: row.body,
        sentAt: row.sentAt,
      });
    }
    return messages;
  },
});
