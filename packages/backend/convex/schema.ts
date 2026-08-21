import { authTables } from '@convex-dev/auth/server';
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

// Instance-level configuration, one row per key. Deliberately generic backend
// substrate: knows about deployments and settings, not about the game.
export default defineSchema({
  ...authTables,
  instanceSettings: defineTable({
    key: v.string(),
    value: v.string(),
  }).index('by_key', ['key']),
  profiles: defineTable({
    userId: v.id('users'),
    displayName: v.string(),
    handle: v.string(),
    handleNormalized: v.string(),
    avatarStorageId: v.optional(v.id('_storage')),
    role: v.union(v.literal('member'), v.literal('admin')),
    lifecycle: v.union(v.literal('active'), v.literal('deactivated')),
    onboardingCompletedAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_handleNormalized', ['handleNormalized'])
    .index('by_role', ['role']),
  authEmailIssuanceLimits: defineTable({
    key: v.string(),
    windowStartedAt: v.number(),
    sends: v.number(),
  }).index('by_key', ['key']),
});
