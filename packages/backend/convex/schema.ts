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
    // Denormalized count of active memberships — maintained transactionally
    // by every mutation that changes roster size (adjustMemberCount in
    // campaigns.ts), so previews/directory never scan the roster.
    memberCount: v.number(),
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
    .index('by_campaignId_userId', ['campaignId', 'userId'])
    // Locates the single director row in O(1). Sound because role='director'
    // exists only on active rows: pending inserts, approvals, and blocks all
    // normalize role to 'player'.
    .index('by_campaignId_role', ['campaignId', 'role']),
  // A character is a canonical user-owned object. Campaign participation is
  // represented by a separate, revocable binding below: one character can be
  // bound to at most one campaign, while one user can bind many characters to
  // that campaign.
  characters: defineTable({
    ownerUserId: v.id('users'),
    name: v.string(),
    concept: v.string(),
    level: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_ownerUserId', ['ownerUserId']),
  characterCampaignBindings: defineTable({
    characterId: v.id('characters'),
    campaignId: v.id('campaigns'),
    // Denormalized from the immutable character owner for bounded campaign
    // roster reads and membership-removal cleanup.
    ownerUserId: v.id('users'),
    status: v.union(v.literal('pending'), v.literal('active')),
    submittedAt: v.number(),
    reviewedAt: v.optional(v.number()),
    reviewedBy: v.optional(v.id('users')),
    updatedAt: v.number(),
  })
    .index('by_characterId', ['characterId'])
    .index('by_campaignId_status', ['campaignId', 'status'])
    .index('by_campaignId_ownerUserId', ['campaignId', 'ownerUserId']),
  // Bindings disappear when denied/withdrawn/kicked/removed, but the history
  // must remain intelligible for campaign and session audit trails.
  characterCampaignEvents: defineTable({
    characterId: v.id('characters'),
    campaignId: v.id('campaigns'),
    actorUserId: v.id('users'),
    type: v.union(
      v.literal('submitted'),
      v.literal('auto_approved'),
      v.literal('approved'),
      v.literal('denied'),
      v.literal('withdrawn'),
      v.literal('removed'),
      v.literal('kicked'),
      v.literal('membership_ended'),
    ),
    occurredAt: v.number(),
  })
    .index('by_characterId', ['characterId'])
    .index('by_campaignId', ['campaignId']),
  // The Table (lobby runtime). Presence is heartbeat-based: one row per
  // (campaign, user) while they sit at the Table; rows older than the stale
  // window read as absent and are swept opportunistically on heartbeats.
  lobbyPresence: defineTable({
    campaignId: v.id('campaigns'),
    userId: v.id('users'),
    joinedAt: v.number(),
    lastSeenAt: v.number(),
  })
    .index('by_campaignId', ['campaignId'])
    .index('by_campaignId_userId', ['campaignId', 'userId']),
  lobbyMessages: defineTable({
    campaignId: v.id('campaigns'),
    authorUserId: v.id('users'),
    body: v.string(),
    sentAt: v.number(),
  }).index('by_campaignId', ['campaignId']),
});
