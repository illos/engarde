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
    // Transitional only: older local rows may still carry the retired global
    // profile role. New writes never set it and no authorization reads it.
    role: v.optional(v.union(v.literal('member'), v.literal('admin'))),
    lifecycle: v.union(v.literal('active'), v.literal('deactivated')),
    onboardingCompletedAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_handleNormalized', ['handleNormalized']),
  instanceSetup: defineTable({
    key: v.literal('installation'),
    status: v.literal('complete'),
    completedByUserId: v.id('users'),
    completedAt: v.number(),
    capabilityConsumedAt: v.number(),
  }).index('by_key', ['key']),
  instanceOperators: defineTable({
    userId: v.id('users'),
    status: v.union(v.literal('active'), v.literal('revoked')),
    source: v.union(v.literal('provisioned'), v.literal('granted')),
    grantedByUserId: v.optional(v.id('users')),
    grantedAt: v.number(),
    revokedByUserId: v.optional(v.id('users')),
    revokedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index('by_userId', ['userId'])
    .index('by_status', ['status']),
  operatorAuditEvents: defineTable({
    actorUserId: v.id('users'),
    subjectUserId: v.optional(v.id('users')),
    type: v.union(
      v.literal('installation_bootstrapped'),
      v.literal('operator_granted'),
      v.literal('operator_revoked'),
      v.literal('instance_name_set'),
    ),
    occurredAt: v.number(),
  }).index('by_occurredAt', ['occurredAt']),
  authEmailIssuanceLimits: defineTable({
    key: v.string(),
    windowStartedAt: v.number(),
    sends: v.number(),
  })
    .index('by_key', ['key'])
    .index('by_windowStartedAt', ['windowStartedAt']),
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
    // by every mutation that changes roster size (reconcileMemberCount in
    // campaigns.ts), so previews/directory never scan the roster.
    memberCount: v.number(),
    activeSessionId: v.optional(v.id('sessions')),
    nextSessionNumber: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_ownerId', ['ownerId'])
    .index('by_visibility', ['visibility'])
    .index('by_joinCode', ['joinCode']),
  // One row per (campaign, user) across the whole lifecycle: a join request
  // (pending), a roster spot (active), or a block record (blocked). The two
  // active-role axes are independent; exactly one active member is Director.
  campaignMemberships: defineTable({
    campaignId: v.id('campaigns'),
    userId: v.id('users'),
    status: v.union(v.literal('pending'), v.literal('active'), v.literal('blocked')),
    // `role` is retained only so existing local rows can deploy through the
    // transition. New writes use the two independent axes below.
    role: v.optional(v.union(v.literal('player'), v.literal('director'))),
    campaignAccess: v.optional(v.union(v.literal('user'), v.literal('admin'))),
    gameRole: v.optional(v.union(v.literal('player'), v.literal('director'))),
    requestedAt: v.number(),
    joinedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index('by_campaignId_status', ['campaignId', 'status'])
    .index('by_userId_status', ['userId', 'status'])
    .index('by_campaignId_userId', ['campaignId', 'userId'])
    // New rows use this index; transition reads also support legacy `role`
    // values until the local data migration removes them.
    .index('by_campaignId_gameRole', ['campaignId', 'gameRole']),
  campaignAuditEvents: defineTable({
    campaignId: v.id('campaigns'),
    actorUserId: v.id('users'),
    subjectUserId: v.optional(v.id('users')),
    sessionId: v.optional(v.id('sessions')),
    type: v.union(
      v.literal('admin_granted'),
      v.literal('admin_revoked'),
      v.literal('director_assigned'),
      v.literal('member_approved'),
      v.literal('member_denied'),
      v.literal('member_removed'),
      v.literal('member_blocked'),
      v.literal('member_unblocked'),
      v.literal('settings_updated'),
    ),
    occurredAt: v.number(),
  })
    .index('by_campaignId', ['campaignId'])
    .index('by_sessionId', ['sessionId']),
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
  sessions: defineTable({
    campaignId: v.id('campaigns'),
    number: v.number(),
    status: v.union(v.literal('active'), v.literal('ended')),
    startedByUserId: v.id('users'),
    startedAt: v.number(),
    endedByUserId: v.optional(v.id('users')),
    endedAt: v.optional(v.number()),
  })
    .index('by_campaignId_number', ['campaignId', 'number'])
    .index('by_campaignId_status', ['campaignId', 'status']),
  sessionRuntime: defineTable({
    sessionId: v.id('sessions'),
    status: v.union(v.literal('active'), v.literal('frozen')),
    resourceBasisCharacterCount: v.number(),
    resourceBasisLevelTotal: v.number(),
    resourcesGeneratedAt: v.number(),
    frozenAt: v.optional(v.number()),
    // Transitional only for local session rows written before the field was
    // found to have no reader or concurrency role. New sessions omit it.
    revision: v.optional(v.number()),
  }).index('by_sessionId', ['sessionId']),
  sessionRosterEntries: defineTable({
    sessionId: v.id('sessions'),
    campaignId: v.id('campaigns'),
    characterId: v.id('characters'),
    bindingId: v.id('characterCampaignBindings'),
    ownerUserIdSnapshot: v.id('users'),
    characterNameSnapshot: v.string(),
    levelSnapshot: v.number(),
    status: v.union(v.literal('active'), v.literal('removed')),
    initial: v.boolean(),
    addedByUserId: v.id('users'),
    addedAt: v.number(),
    removedByUserId: v.optional(v.id('users')),
    removedAt: v.optional(v.number()),
  })
    .index('by_sessionId', ['sessionId'])
    .index('by_sessionId_characterId', ['sessionId', 'characterId'])
    .index('by_bindingId', ['bindingId']),
  sessionRosterEvents: defineTable({
    sessionId: v.id('sessions'),
    characterId: v.id('characters'),
    actorUserId: v.id('users'),
    type: v.union(v.literal('initial'), v.literal('added'), v.literal('removed')),
    occurredAt: v.number(),
  }).index('by_sessionId', ['sessionId']),
  sessionEvents: defineTable({
    sessionId: v.id('sessions'),
    campaignId: v.id('campaigns'),
    actorUserId: v.id('users'),
    subjectUserId: v.optional(v.id('users')),
    type: v.union(v.literal('started'), v.literal('ended'), v.literal('director_handoff')),
    occurredAt: v.number(),
  }).index('by_sessionId', ['sessionId']),
  characterControlGrants: defineTable({
    campaignId: v.id('campaigns'),
    characterId: v.id('characters'),
    bindingId: v.id('characterCampaignBindings'),
    grantorUserId: v.id('users'),
    granteeUserId: v.id('users'),
    scope: v.union(v.literal('session'), v.literal('persistent')),
    sessionId: v.optional(v.id('sessions')),
    status: v.union(
      v.literal('pending'),
      v.literal('accepted'),
      v.literal('declined'),
      v.literal('revoked'),
      v.literal('relinquished'),
      v.literal('expired'),
    ),
    offeredAt: v.number(),
    respondedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index('by_bindingId_status', ['bindingId', 'status'])
    .index('by_campaignId_grantorUserId', ['campaignId', 'grantorUserId'])
    .index('by_campaignId_granteeUserId', ['campaignId', 'granteeUserId'])
    .index('by_campaignId_granteeUserId_status', ['campaignId', 'granteeUserId', 'status'])
    .index('by_granteeUserId_status_bindingId_scope_sessionId', [
      'granteeUserId',
      'status',
      'bindingId',
      'scope',
      'sessionId',
    ])
    .index('by_sessionId_status', ['sessionId', 'status']),
  // The Table (lobby runtime). Presence is heartbeat-based: one bounded row
  // per active campaign member. Display data is denormalized so the reactive
  // presence read does not join profiles and memberships once per row.
  lobbyPresence: defineTable({
    campaignId: v.id('campaigns'),
    userId: v.id('users'),
    // Optional only for local rows written before the denormalization. Every
    // join/heartbeat refreshes them, so legacy rows age out within one window.
    displayName: v.optional(v.string()),
    handle: v.optional(v.string()),
    gameRole: v.optional(v.union(v.literal('player'), v.literal('director'))),
    joinedAt: v.number(),
    lastSeenAt: v.number(),
  })
    .index('by_campaignId', ['campaignId'])
    .index('by_campaignId_userId', ['campaignId', 'userId']),
  // Canon artifact texts seeded from the extraction bundle store (`corpus
  // export-records` → `npx convex import --table canonRecords`). Verbatim
  // bytes only — the checksum pins provenance to the pinned SteelCompendium
  // snapshot. The backend never authors or edits rule text (prime directive);
  // this table is a read-only mirror for the encounter host.
  canonRecords: defineTable({
    artifactId: v.string(),
    slug: v.string(),
    text: v.string(),
    textSha256: v.string(),
    // Deterministic participant stats from the checksummed paired JSON
    // (DEC-0008; canon statblockStats) — present only for stat blocks.
    statsJson: v.optional(v.string()),
  })
    .index('by_artifactId', ['artifactId'])
    .searchIndex('search_slug', { searchField: 'slug' }),
  // The encounter host (engine-plan 6.3, thin form): the engine stays a pure
  // function; this row holds its state between dispatches. `state` is
  // engine-owned — validated by the engine's Zod EncounterStateSchema on
  // every dispatch, deliberately not mirrored as a Convex validator (one
  // schema home, no drift). rngSeed + dispatchCount make every auto-roll
  // replayable: dispatch N always draws from seed rngSeed + N.
  encounters: defineTable({
    campaignId: v.id('campaigns'),
    sessionId: v.id('sessions'),
    status: v.union(v.literal('active'), v.literal('ended')),
    state: v.any(),
    // Host-side pending-commit store (v6, R-0032): the exact use-ability
    // payloads of OPEN resolution entries, keyed by resolutionId. The host
    // builds each payload (compiled ability data never crosses the client
    // boundary) and must re-supply it byte-for-byte at commit — the engine
    // verifies its canonical SHA-256 against the hash stored at roll time,
    // so this store is a convenience, never a trust surface. Entries are
    // pruned as resolutions leave the open phase.
    openPayloads: v.optional(v.any()),
    rngSeed: v.number(),
    dispatchCount: v.number(),
    logCount: v.number(),
    startedByUserId: v.id('users'),
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index('by_campaignId_status', ['campaignId', 'status'])
    .index('by_sessionId', ['sessionId']),
  // One row per engine log entry plus host-level notes (NOT-AUTOMATED parts
  // and verbatim resolve-at-the-table cards). Engine entries carry the
  // engine's own attribution in `engineActor`; `actorUserId` is the host
  // attribution — who at the table dispatched it.
  encounterLogEntries: defineTable({
    campaignId: v.id('campaigns'),
    encounterId: v.id('encounters'),
    seq: v.number(),
    kind: v.union(
      v.literal('mutation'),
      v.literal('warning'),
      v.literal('informational'),
      v.literal('table-directive'),
      v.literal('refusal'),
      v.literal('not-automated'),
      v.literal('table-card'),
      v.literal('invariant-violation'),
    ),
    message: v.string(),
    canonRefs: v.array(v.string()),
    engineActorLabel: v.optional(v.string()),
    // The engine LogEntry's machine-readable data (power-roll breakdowns,
    // stamina delta claims) — the receipts the UI and replay read
    // (power-roll-design SE-3). Engine-owned shape, not mirrored here.
    data: v.optional(v.any()),
    // The engine dispatch this row receipts (LogEntry.intentId) — the
    // occurrence handle a use-triggered-action trigger references [I-6e].
    // Absent on host-level rows and on rows written before this column.
    intentId: v.optional(v.string()),
    actorUserId: v.id('users'),
    actorName: v.string(),
    occurredAt: v.number(),
  }).index('by_encounterId_seq', ['encounterId', 'seq']),
  lobbyMessages: defineTable({
    campaignId: v.id('campaigns'),
    authorUserId: v.id('users'),
    // Optional only for pre-denormalization local rows retained for 30 days.
    authorName: v.optional(v.string()),
    authorHandle: v.optional(v.string()),
    body: v.string(),
    sentAt: v.number(),
  })
    .index('by_campaignId', ['campaignId'])
    .index('by_sentAt', ['sentAt']),
});
