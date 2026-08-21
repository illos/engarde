import { ConvexError, v } from 'convex/values';
import { internalMutation } from './_generated/server';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_SENDS_PER_WINDOW = 3;

export const consume = internalMutation({
  args: { identifier: v.string(), purpose: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const key = `${args.purpose}:${args.identifier.trim().toLowerCase()}`;
    const now = Date.now();
    const existing = await ctx.db
      .query('authEmailIssuanceLimits')
      .withIndex('by_key', (q) => q.eq('key', key))
      .unique();

    if (!existing || now - existing.windowStartedAt >= WINDOW_MS) {
      if (existing) {
        await ctx.db.patch(existing._id, { windowStartedAt: now, sends: 1 });
      } else {
        await ctx.db.insert('authEmailIssuanceLimits', { key, windowStartedAt: now, sends: 1 });
      }
      return null;
    }

    if (existing.sends >= MAX_SENDS_PER_WINDOW) {
      throw new ConvexError('Too many email requests. Try again later.');
    }
    await ctx.db.patch(existing._id, { sends: existing.sends + 1 });
    return null;
  },
});
