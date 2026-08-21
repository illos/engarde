# Core campaign structure plan

> Proposed 2026-08-21. Companion to `user-accounts-plan.md`; where the two
> disagree on campaigns/membership, **this document wins** (it reflects a later
> product decision — see "Supersessions" at the end). It is a plan, not yet an
> implementation decision record.

## Outcome

A campaign is the top-level, long-lived container: it has one permanent owner,
a roster of members, exactly one director at a time, and a controlled front
door. Users discover and request to join campaigns through three routes that
all converge on one **join screen**; the owner moderates requests from a
single console. Everything is built on the auth slice's `users`/`profiles`
substrate and `requireUser`/`requireProfile` helpers.

## Roles and authority

Two distinct concepts, deliberately not conflated:

- **Owner** — the user who created the campaign. Singular and permanent
  (transfer is a later, explicit feature). Source of truth:
  `campaigns.ownerId`. Owner authority covers campaign settings, visibility,
  code regeneration, request moderation, member management, and director
  assignment. Owner authority is *not* a membership role — never encode it as
  one.
- **Role** — a per-membership field: `player | director`. Every joining member
  starts as `player`. The owner may reassign the director role at any time.
  **Invariant: exactly one active member per campaign holds `director`.** At
  campaign creation the owner's own membership is created in the same
  transaction with role `director`.

Consequences:

- Assigning director is an atomic swap in one mutation: the current director
  drops to `player`, the target (must be an active member) becomes `director`.
- The owner can end up with role `player` (after handing the screen to someone
  else). They retain full owner authority regardless of role.
- If the current director leaves or is removed, the role reverts to the owner
  in the same transaction, preserving the invariant.
- The predecessor's split between "director permission" (many) and "Active
  Director" (one, runtime) is collapsed: the single exclusive `director` role
  serves both. The lobby/runtime slices read "who is behind the screen"
  directly from the membership role; no ephemeral active-director state is
  needed. This supersedes the sketch in `user-accounts-plan.md` §"Campaigns
  and membership".

Request moderation and member management are **owner-only** for now (per
product direction). If tables want the director to co-moderate later, that is
a one-line authority-check widening, not a schema change.

## Schema

```ts
campaigns: defineTable({
  name: v.string(),
  description: v.string(),          // short blurb shown on the join screen
  ownerId: v.id('users'),
  visibility: v.union(v.literal('public'), v.literal('private')),
  joinCode: v.string(),             // normalized uppercase, unique
  joinCodeRotatedAt: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
  // Later, additive: contentRating, settingTag, and other join-screen facts
  // (18+, Setting: homebrew/Orden, …). Add as optional fields when specced —
  // do not speculate shapes now.
})
  .index('by_ownerId', ['ownerId'])
  .index('by_visibility', ['visibility'])
  .index('by_joinCode', ['joinCode']),

campaignMemberships: defineTable({
  campaignId: v.id('campaigns'),
  userId: v.id('users'),
  status: v.union(v.literal('pending'), v.literal('active'), v.literal('blocked')),
  role: v.union(v.literal('player'), v.literal('director')), // meaningful only when active
  requestedAt: v.number(),
  joinedAt: v.optional(v.number()),  // set on approval
  updatedAt: v.number(),
})
  .index('by_campaignId_status', ['campaignId', 'status'])
  .index('by_userId_status', ['userId', 'status'])
  .index('by_campaignId_userId', ['campaignId', 'userId']),
```

Notes:

- **One membership row per (campaign, user), whatever its state.** Join
  request, active membership, and block are all lifecycle states of the same
  row. Uniqueness is enforced in mutations via the `by_campaignId_userId`
  index (Convex has no unique constraints); every membership mutation loads
  through that index first.
- **Deny deletes the row** (the user may request again). **Block flips it to
  `blocked`** and the row persists as the block record; a blocked user cannot
  create a new request. No stored `denied` status — supersedes the
  `pending | approved | denied` sketch.
- No unbounded member arrays on the campaign document; the roster is always a
  membership query.
- `role` stays `player` on pending/blocked rows; only mutations that operate
  on `active` rows read it.

### Join codes

- Generated at campaign creation; owner can regenerate at will (spam
  recovery). Regeneration overwrites `joinCode` — old code and all old links
  die instantly, because the **share link embeds the code**:
  `/join/<code>`. One secret, two presentations ("copy share code" / "copy
  share link"), one rotation invalidates both. No separate invites table —
  supersedes the `campaignInvites` sketch (rotation is the regenerate button;
  expiry/use-limits/audit are not needed for the friend-group trust model and
  can return later as an additive table without touching this flow).
- Format: 8 characters from an unambiguous alphabet (no `0/O`, `1/I/L`),
  normalized uppercase on entry, generated with a collision re-roll loop
  against `by_joinCode`.
- Stored plaintext (the owner must be able to copy it) but treated as a
  secret: **no public query ever returns `joinCode`** — only the owner-scoped
  settings query does. The code is a capability to *request*, not to enter:
  redemption still lands in `pending`.

## Joining — three routes, one join screen

| Route | Entry | Resolves via |
|---|---|---|
| 1. Public directory | Browse public campaigns, click a listing | `campaignId` (allowed because campaign is public) |
| 2. Code entry | Type the share code | `joinCode` |
| 3. Share link | Click `/join/<code>` | `joinCode` (same as route 2 — the link is the code) |

All three land on the **join screen**, driven by one query:

`campaigns.getJoinPreview({ code? , campaignId? })` (exactly one arg)

- `campaignId` path: returns the preview **only if the campaign is public**.
  A private campaign's ID must behave like a nonexistent one (generic
  not-found) — IDs must not be an enumeration side-channel around the code.
- `code` path: works for public and private campaigns alike.
- Returns: campaign name, description, owner display name, member count,
  future join-screen facts (content rating, setting tag) — and, for a
  signed-in caller, **their own membership state** (`none | pending | active |
  blocked-as-generic-failure`, see open question 2) so the button renders
  correctly. Never returns `joinCode` or the roster.

Join screen behavior (auth-info-screen shape):

- Card: campaign name, short description, future game-specific facts.
- Button: **"Join this Campaign"** → `requestToJoin` → card updates to a
  **Pending** badge with a **"Cancel request"** action.
- Already a member → the button becomes "Open campaign".

### Account → campaigns list

`campaigns.listMine()` — the caller's memberships (`pending` + `active`) via
`by_userId_status`, joined to campaign previews. Pending cards reuse the join
screen's card (same preview data) with the Pending badge + Cancel request;
active cards open the campaign. Blocked rows never appear here.

## Owner console (campaign settings card)

- Campaigns are **private by default** at creation.
- Settings card: toggle public/private · copy share code · copy share link ·
  regenerate share code (with a "this kills existing links" confirm).
- **Members list** (visible to all active members): profile + role badge
  (Owner is a badge derived from `campaigns.ownerId`, alongside the
  Director/Player role badge).
- **Pending list** (owner-only): each request with **Approve / Deny / Block**.
- **Blocked list** (owner-only): with **Unblock** (deletes the row — the user
  may request again). Not in the original spec but the blocked list is
  unmanageable without it.

## Function surface

All mutations start with `requireUser`; owner-authority mutations then check
`campaign.ownerId === user._id`. Never trust a client-supplied user ID.

| Function | Kind | Authority | Effect |
|---|---|---|---|
| `create` | mutation | any user | Campaign (private, fresh code) + owner's `active/director` membership, one transaction |
| `updateSettings` | mutation | owner | name / description (later: join-screen facts) |
| `setVisibility` | mutation | owner | public ↔ private |
| `regenerateJoinCode` | mutation | owner | new unique code; old code + links dead |
| `getJoinPreview` | query | anyone signed-in | join-screen card data + caller's membership state |
| `listDirectory` | query | anyone signed-in | paginated public campaigns (preview fields only) |
| `listMine` | query | self | caller's pending + active campaign cards |
| `requestToJoin` | mutation | self | creates `pending` row (idempotent if already pending; fails generically if blocked; no-op message if active) |
| `cancelJoinRequest` | mutation | self | deletes own `pending` row |
| `approveRequest` | mutation | owner | `pending → active`, role `player`, sets `joinedAt` |
| `denyRequest` | mutation | owner | deletes the `pending` row |
| `blockUser` | mutation | owner | `pending → blocked` (also valid on `active`: removes from roster and blocks; owner un-blockable/un-removable; if target was director, role reverts to owner in-transaction) |
| `unblockUser` | mutation | owner | deletes the `blocked` row |
| `setDirector` | mutation | owner | atomic swap: current director → `player`, target active member → `director` |
| `removeMember` | mutation | owner | deletes an `active` row (not the owner's); director reversion as above |
| `leaveCampaign` | mutation | self | deletes own `active` row (owner cannot leave); director reversion as above |
| `listRoster` | query | active member | members with role badges; pending + blocked lists included only for the owner |

## Invariants (enforced in mutations, asserted in tests)

1. Exactly one `active` membership with role `director` per campaign.
2. The owner always has an `active` membership; no mutation may delete, block,
   or pend it. Owner cannot leave; deletion of the campaign is the (later)
   exit.
3. At most one membership row per (campaign, user).
4. `joinCode` is unique across campaigns; never present in any non-owner query
   result.
5. Private campaigns are unreachable by ID: preview, roster, and directory all
   behave as not-found for non-members without the code.
6. Every membership state change goes through a mutation listed above — no
   generic "patch membership" function.

## Testing (convex-test, per DEC-0003)

Minimum suite: create-campaign bootstrap (owner active+director, private,
code present) · each join route resolves the same preview · private-by-ID is
not-found · request→cancel · request→approve→roster · deny then re-request
succeeds · block then re-request fails generically · unblock then re-request
succeeds · setDirector swap keeps invariant 1 · director leave/remove reverts
to owner · non-owner calling each owner mutation is rejected · `joinCode`
absent from preview/directory/roster payloads · regenerate kills the old code.

## Open questions (flagged, with recommendations — not blockers)

1. **Owner as player.** After `setDirector(other)`, the owner's role is
   `player` while retaining owner authority. Recommended and assumed above;
   the alternative (owner always director) contradicts "only one director at
   a time" whenever anyone else takes the screen.
2. **What a blocked user sees.** Recommended: `requestToJoin` fails with the
   same generic "Unable to send request" a closed campaign would give, and the
   join screen shows no special state. Accepts a small it-didn't-work signal
   rather than shadow-pending complexity — consistent with the friend-group
   trust model.
3. **Kick/leave/unblock** are not in the original spec but are included above
   as necessary completions of the lifecycle. Confirm or trim.
4. **Directory ordering/search** — start with recency-ordered pagination;
   search/filters arrive with the later join-screen facts (setting, rating).

## Supersessions of `user-accounts-plan.md` §"Campaigns and membership"

- Single exclusive `director` role replaces director-as-permission + deferred
  Active Director runtime state.
- Membership status set is `pending | active | blocked`; deny deletes rather
  than storing `denied`.
- One regenerable `joinCode` on the campaign replaces the `campaignInvites`
  table; share links embed the code.
- New: `visibility: public | private` + public directory route.
- Unchanged and still binding: owner authority from `campaigns.ownerId` (never
  a membership role); owner's membership created in the campaign's creation
  transaction; no member arrays on the campaign document; friendship is never
  an authorization shortcut into campaigns.
