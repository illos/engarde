import { ConvexError, v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireInstanceOperator } from './authz';

// The deployment's display name. Instance-name configurability is a feature
// (self-hosters name their own instance); the reference instance is "En Garde".
export const DEFAULT_INSTANCE_NAME = 'En Garde';
export const INSTANCE_NAME_MAX_LENGTH = 80;

export function validateInstanceName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > INSTANCE_NAME_MAX_LENGTH)
    throw new ConvexError(`Instance name must be 1–${INSTANCE_NAME_MAX_LENGTH} characters`);
  return trimmed;
}

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
    const { user } = await requireInstanceOperator(ctx);
    const validatedName = validateInstanceName(name);
    const row = await ctx.db
      .query('instanceSettings')
      .withIndex('by_key', (q) => q.eq('key', 'instanceName'))
      .unique();
    if (row) {
      await ctx.db.patch(row._id, { value: validatedName });
    } else {
      await ctx.db.insert('instanceSettings', { key: 'instanceName', value: validatedName });
    }
    await ctx.db.insert('operatorAuditEvents', {
      actorUserId: user._id,
      type: 'instance_name_set',
      occurredAt: Date.now(),
    });
    return null;
  },
});
