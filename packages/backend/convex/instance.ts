import { ConvexError, v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireProfile } from './authz';

// The deployment's display name. Instance-name configurability is a feature
// (self-hosters name their own instance); the reference instance is "En Garde".
export const DEFAULT_INSTANCE_NAME = 'En Garde';

export const getName = query({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const row = await ctx.db
      .query('instanceSettings')
      .withIndex('by_key', (q) => q.eq('key', 'instanceName'))
      .unique();
    return row?.value ?? DEFAULT_INSTANCE_NAME;
  },
});

export const setName = mutation({
  args: { name: v.string() },
  returns: v.null(),
  handler: async (ctx, { name }) => {
    const profile = await requireProfile(ctx);
    if (profile.role !== 'admin') throw new ConvexError('Administrator access required');
    const row = await ctx.db
      .query('instanceSettings')
      .withIndex('by_key', (q) => q.eq('key', 'instanceName'))
      .unique();
    if (row) {
      await ctx.db.patch(row._id, { value: name });
    } else {
      await ctx.db.insert('instanceSettings', { key: 'instanceName', value: name });
    }
    return null;
  },
});
