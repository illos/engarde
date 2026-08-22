import { getAuthUserId } from '@convex-dev/auth/server';
import { ConvexError } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
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

// Gate for member-only campaign surfaces (roster, the Table). Uniform
// not-found: a non-member must not be able to distinguish a real private
// campaign from a nonexistent ID.
export async function requireActiveMember(
  ctx: DatabaseCtx,
  campaignId: Id<'campaigns'>,
): Promise<{
  profile: Doc<'profiles'>;
  campaign: Doc<'campaigns'>;
  membership: Doc<'campaignMemberships'>;
}> {
  const profile = await requireProfile(ctx);
  const campaign = await ctx.db.get(campaignId);
  if (!campaign) throw new ConvexError('Campaign not found');
  const membership = await ctx.db
    .query('campaignMemberships')
    .withIndex('by_campaignId_userId', (q) =>
      q.eq('campaignId', campaignId).eq('userId', profile.userId),
    )
    .unique();
  if (!membership || membership.status !== 'active') throw new ConvexError('Campaign not found');
  return { profile, campaign, membership };
}
