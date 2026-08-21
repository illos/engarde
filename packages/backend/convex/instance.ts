import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

// The deployment's display name. Instance-name configurability is a feature
// (self-hosters name their own instance); the reference instance is "En Garde".
export const DEFAULT_INSTANCE_NAME = 'En Garde';

export const getName = query({
  args: {},
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
  handler: async (ctx, { name }) => {
    const row = await ctx.db
      .query('instanceSettings')
      .withIndex('by_key', (q) => q.eq('key', 'instanceName'))
      .unique();
    if (row) {
      await ctx.db.patch(row._id, { value: name });
    } else {
      await ctx.db.insert('instanceSettings', { key: 'instanceName', value: name });
    }
  },
});
