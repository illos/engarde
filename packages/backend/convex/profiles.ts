import { ConvexError, v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireProfile, requireUser } from './authz';

const profileView = v.object({
  displayName: v.string(),
  handle: v.string(),
  role: v.union(v.literal('member'), v.literal('admin')),
  lifecycle: v.union(v.literal('active'), v.literal('deactivated')),
});

function normalizeHandle(handle: string): string {
  const normalized = handle.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,24}$/.test(normalized)) {
    throw new ConvexError('Handle must be 3–24 letters, numbers, or underscores');
  }
  return normalized;
}

function validateDisplayName(displayName: string): string {
  const trimmed = displayName.trim();
  if (trimmed.length < 1 || trimmed.length > 60)
    throw new ConvexError('Display name must be 1–60 characters');
  return trimmed;
}

export const current = query({
  args: {},
  returns: v.union(profileView, v.null()),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_userId', (q) => q.eq('userId', user._id))
      .unique();
    return profile
      ? {
          displayName: profile.displayName,
          handle: profile.handle,
          role: profile.role,
          lifecycle: profile.lifecycle,
        }
      : null;
  },
});

export const completeOnboarding = mutation({
  args: { displayName: v.string(), handle: v.string() },
  returns: profileView,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (user.emailVerificationTime === undefined) {
      throw new ConvexError('Verify your email before creating a profile');
    }
    const existing = await ctx.db
      .query('profiles')
      .withIndex('by_userId', (q) => q.eq('userId', user._id))
      .unique();
    if (existing)
      return {
        displayName: existing.displayName,
        handle: existing.handle,
        role: existing.role,
        lifecycle: existing.lifecycle,
      };

    const handleNormalized = normalizeHandle(args.handle);
    const collision = await ctx.db
      .query('profiles')
      .withIndex('by_handleNormalized', (q) => q.eq('handleNormalized', handleNormalized))
      .unique();
    if (collision) throw new ConvexError('That handle is already taken');

    const configuredAdminEmail = process.env.ENGARDE_INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
    const matchingConfiguredAdmin =
      configuredAdminEmail !== undefined &&
      user.email?.toLowerCase() === configuredAdminEmail &&
      user.emailVerificationTime !== undefined;
    const existingAdmin = await ctx.db
      .query('profiles')
      .withIndex('by_role', (q) => q.eq('role', 'admin'))
      .first();
    const role: 'admin' | 'member' =
      matchingConfiguredAdmin || (configuredAdminEmail === undefined && !existingAdmin)
        ? 'admin'
        : 'member';
    const now = Date.now();
    const displayName = validateDisplayName(args.displayName);
    await ctx.db.insert('profiles', {
      userId: user._id,
      displayName,
      handle: handleNormalized,
      handleNormalized,
      role,
      lifecycle: 'active',
      onboardingCompletedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    return { displayName, handle: handleNormalized, role, lifecycle: 'active' as const };
  },
});

export const update = mutation({
  args: { displayName: v.string(), handle: v.string() },
  returns: profileView,
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const displayName = validateDisplayName(args.displayName);
    const handleNormalized = normalizeHandle(args.handle);
    const collision = await ctx.db
      .query('profiles')
      .withIndex('by_handleNormalized', (q) => q.eq('handleNormalized', handleNormalized))
      .unique();
    if (collision && collision._id !== profile._id)
      throw new ConvexError('That handle is already taken');
    await ctx.db.patch(profile._id, {
      displayName,
      handle: handleNormalized,
      handleNormalized,
      updatedAt: Date.now(),
    });
    return {
      displayName,
      handle: handleNormalized,
      role: profile.role,
      lifecycle: profile.lifecycle,
    };
  },
});
