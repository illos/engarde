import { getAuthUserId } from '@convex-dev/auth/server';
import { ConvexError } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';

type DatabaseCtx = QueryCtx | MutationCtx;

export async function requireUser(ctx: DatabaseCtx): Promise<Doc<'users'>> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError('Unauthenticated');
  const user = await ctx.db.get(userId);
  if (!user) throw new ConvexError('Unauthenticated');
  const profile = await ctx.db
    .query('profiles')
    .withIndex('by_userId', (q) => q.eq('userId', user._id))
    .unique();
  if (profile?.lifecycle === 'deactivated') throw new ConvexError('Account deactivated');
  return user;
}

export async function requireProfile(ctx: DatabaseCtx): Promise<Doc<'profiles'>> {
  const user = await requireUser(ctx);
  const profile = await ctx.db
    .query('profiles')
    .withIndex('by_userId', (q) => q.eq('userId', user._id))
    .unique();
  if (!profile) throw new ConvexError('Profile required');
  return profile;
}
