import { ConvexError, v } from 'convex/values';
import { type MutationCtx, internalMutation } from './_generated/server';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_SENDS_PER_WINDOW = 3;
const MAX_GLOBAL_SENDS_PER_WINDOW = 1_000;

async function consumeWindow(ctx: MutationCtx, key: string, limit: number, now: number) {
  const existing = await ctx.db
    .query('authEmailIssuanceLimits')
    .withIndex('by_key', (q) => q.eq('key', key))
    .unique();

  if (!existing || now - existing.windowStartedAt >= WINDOW_MS) {
    if (existing) await ctx.db.patch(existing._id, { windowStartedAt: now, sends: 1 });
    else await ctx.db.insert('authEmailIssuanceLimits', { key, windowStartedAt: now, sends: 1 });
    return;
  }
  if (existing.sends >= limit) throw new ConvexError('Too many email requests. Try again later.');
  await ctx.db.patch(existing._id, { sends: existing.sends + 1 });
}

export const consume = internalMutation({
  args: { identifier: v.string(), purpose: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const key = `${args.purpose}:${args.identifier.trim().toLowerCase()}`;
    const now = Date.now();
    await consumeWindow(ctx, '__global__', MAX_GLOBAL_SENDS_PER_WINDOW, now);
    await consumeWindow(ctx, key, MAX_SENDS_PER_WINDOW, now);
    return null;
  },
});
