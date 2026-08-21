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
  // Campaign model: docs/campaigns-plan.md. Owner authority comes from
  // ownerId, never from a membership role; joinCode is the single regenerable
  // secret behind both the share code and the share link.
  campaigns: defineTable({
    name: v.string(),
    description: v.string(),
    ownerId: v.id('users'),
    visibility: v.union(v.literal('public'), v.literal('private')),
    joinability: v.union(v.literal('open'), v.literal('closed')),
    joinCode: v.string(),
    joinCodeRotatedAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_ownerId', ['ownerId'])
    .index('by_visibility', ['visibility'])
    .index('by_joinCode', ['joinCode']),
  // One row per (campaign, user) across the whole lifecycle: a join request
  // (pending), a roster spot (active), or a block record (blocked). role is
  // meaningful only while active; exactly one active director per campaign.
  campaignMemberships: defineTable({
    campaignId: v.id('campaigns'),
    userId: v.id('users'),
    status: v.union(v.literal('pending'), v.literal('active'), v.literal('blocked')),
    role: v.union(v.literal('player'), v.literal('director')),
    requestedAt: v.number(),
    joinedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index('by_campaignId_status', ['campaignId', 'status'])
    .index('by_userId_status', ['userId', 'status'])
    .index('by_campaignId_userId', ['campaignId', 'userId']),
});
