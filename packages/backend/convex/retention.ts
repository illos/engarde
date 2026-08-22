import { v } from 'convex/values';
import { internal } from './_generated/api';
import { internalMutation } from './_generated/server';

const DAY_MS = 24 * 60 * 60 * 1_000;
const AUTH_LIMIT_RETENTION_MS = DAY_MS;
const LOBBY_MESSAGE_RETENTION_MS = 30 * DAY_MS;
const CLEANUP_BATCH_SIZE = 200;

export const cleanupExpired = internalMutation({
  args: {},
  returns: v.object({ authLimitsDeleted: v.number(), lobbyMessagesDeleted: v.number() }),
  handler: async (ctx) => {
    const now = Date.now();
    const [authLimits, lobbyMessages] = await Promise.all([
      ctx.db
        .query('authEmailIssuanceLimits')
        .withIndex('by_windowStartedAt', (q) =>
          q.lt('windowStartedAt', now - AUTH_LIMIT_RETENTION_MS),
        )
        .take(CLEANUP_BATCH_SIZE),
      ctx.db
        .query('lobbyMessages')
        .withIndex('by_sentAt', (q) => q.lt('sentAt', now - LOBBY_MESSAGE_RETENTION_MS))
        .take(CLEANUP_BATCH_SIZE),
    ]);
    for (const row of authLimits) await ctx.db.delete(row._id);
    for (const row of lobbyMessages) await ctx.db.delete(row._id);

    if (authLimits.length === CLEANUP_BATCH_SIZE || lobbyMessages.length === CLEANUP_BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, internal.retention.cleanupExpired, {});
    }
    return {
      authLimitsDeleted: authLimits.length,
      lobbyMessagesDeleted: lobbyMessages.length,
    };
  },
});
