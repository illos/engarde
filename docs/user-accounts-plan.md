# User accounts and collaboration plan

> Proposed 2026-08-21. This is the first design slice of the collaborative
> substrate. It is a plan, not yet an implementation decision record.

## Outcome

Build a small identity core that supports the whole product without making the
authentication record responsible for application behavior:

- **Convex Auth** owns password credentials, verification/reset tokens, optional
  magic-link authentication, and sessions.
- **User profiles** own public identity and instance-level privileges.
- **Relationships** model friendships independently of campaigns.
- **Campaign memberships** model campaign access and campaign-specific roles.
- **Library entities** (characters now; encounters, NPCs, and homebrew later) are
  owned by users and attached to campaigns explicitly.
- **Lobby presence** is ephemeral campaign activity, never stored on a user or
  campaign document.

This preserves the product's three useful distinctions: “who signed in,” “who can
see or change this resource,” and “who is currently at this table.”

## Authentication choice

Use `@convex-dev/auth` with its Password provider as the default sign-up/sign-in
method. Offer email magic links as a secondary method. The web app is a
client-rendered React/Vite app, which is the supported shape for Convex Auth. Keep
both methods behind the normal Convex Auth boundary so adding Google or passkeys
later does not change application IDs or ownership fields.

Send account-verification, password-reset, and magic-link messages through
**Cloudflare Email Service**. Because the backend runs on Convex, call
Cloudflare's Email Sending REST API from a Convex action; do not add a Cloudflare
Worker solely to access the Workers email binding. Keep that call behind one small
email-delivery adapter so tests can substitute a fake and a future provider change
does not touch auth flows.

The adapter must also ship a **no-credentials mode**: when no Cloudflare API token
is configured, it logs each verification/reset/magic-link URL to the deployment
console instead of failing. This keeps local development zero-secret (DEC-0003)
and lets a self-hosted instance run its full auth flows without Cloudflare DNS or
a Workers Paid plan until the operator wants real email delivery.

Cloudflare Email Service currently requires the sending domain to be an onboarded
Cloudflare DNS zone in the account that owns the API token. Outbound transactional
sending is in public beta and requires a Workers Paid plan, so pin those deployment
prerequisites before the real-email acceptance test. Store a least-privilege
Cloudflare API token (email-sending scope — confirm the exact scope name at token
creation) and account ID only in Convex deployment environment variables. Never
expose them to the web client.

The beta statuses above (Convex Auth; Cloudflare Email Sending) are point-in-time
facts recorded 2026-08-21 — re-verify both when Slice 1 implementation starts.

Important constraints:

- Convex Auth is currently beta. Pin its version and isolate provider-specific
  code in `convex/auth.ts` plus the client auth components.
- Password requirements, generic failure messages, reset-token expiry, and
  request throttling must be explicit and tested. Do not reveal whether an email
  address has an account during sign-in or password recovery.
- Convex Auth provides the backend flow, not finished UI. En Garde must build its
  own sign-in, verification-result, sign-out, and account-management screens.
- Always install and configure `convex/auth.config.ts`; without it authenticated
  Convex functions resolve no identity.
- Every protected function derives the actor on the server. A client-supplied
  `userId`, owner ID, or role is never authorization evidence.
- Local development gets an explicit dev-only identity mechanism, gated by an
  environment flag and impossible to enable accidentally in production. It must
  enter the same `requireUser` path as real auth rather than creating a second
  authorization model.

Known pinned-library limitation: `@convex-dev/auth@0.0.95` rejects an unknown
email during the password-reset action before invoking the delivery provider, so
a caller using the Convex API directly can distinguish registered from unknown
addresses. The web surface deliberately keeps the response and next screen
identical. This is accepted only for the initial friend-group deployment and must
be re-evaluated before open registration or when upgrading Convex Auth.

References: [Convex Auth overview](https://docs.convex.dev/auth/convex-auth),
[authentication overview](https://docs.convex.dev/auth/overview), and
[auth in functions](https://docs.convex.dev/auth/functions-auth). Email delivery:
[Cloudflare Email Service](https://developers.cloudflare.com/email-service/) and
[REST API](https://developers.cloudflare.com/email-service/api/send-emails/rest-api/).

## Data model

Names below describe responsibilities; exact validators land with each slice.
Use Convex `Id<...>` references and indexed queries throughout.

### Identity and profiles

`users`

- Auth-owned user document supplied by Convex Auth.
- Treat its `_id` as the stable application user ID and foreign key.
- Do not hang campaign roles, friend lists, owned entity arrays, or presence off
  this document.

`profiles`

- `userId`
- `displayName`
- unique, case-normalized `handle` for deliberate discovery and friend requests
- optional `avatarStorageId`
- no instance-wide role; installation operators are separate from app profiles
- lifecycle: `active | deactivated`
- timestamps and optional onboarding completion marker
- indexes: `by_userId`, `by_handleNormalized`

Convex Auth already stores its users in the database; the profile is a separate
app record because other users need safe public fields and En Garde needs fields
that are not authentication claims. Email stays private and comes from auth; it is
not exposed in public profile queries.

Handle uniqueness must be enforced transactionally: query the normalized-handle
index and write only if no other profile owns it. Convex schemas do not provide a
SQL-style unique constraint.

**Operator bootstrap (supersedes the original profile-admin proposal):** a fresh
installation uses a deployment-capability-gated, one-time setup transaction to grant
the first `instanceOperators` entitlement. The transaction seals setup and consumes
the capability. Profiles never carry or imply installation authority; an operator
does not need a player profile.

### Friendships

`friendships`

- `requesterId`, `addresseeId`
- `pairKey`: canonical ordered pair of user IDs
- state: `pending | accepted | declined | blocked`
- timestamps (`requestedAt`, `respondedAt`)
- indexes for requester, addressee, pair, and each user's accepted relationships

One relationship document represents a pair. Creation checks the canonical pair
inside the mutation so simultaneous crossed requests cannot create two
friendships; a crossed pending request may be accepted immediately. Only the
addressee can accept/decline. Either party can remove an accepted friendship; a
block remains private to the blocker and prevents discovery/request attempts.

Initial discovery is **exact handle lookup**, not an enumerable people directory.
That is enough for friend-group use and avoids exposing every account on an
instance. Friendship is social convenience, not an authorization shortcut:
friends do not automatically gain access to campaigns, characters, or homebrew.

### Campaigns and membership

`campaigns`

- name, description, owner ID, settings, timestamps
- no unbounded arrays of member IDs or content IDs

`campaignMemberships`

- `campaignId`, `userId`
- status: `pending | approved | denied`
- role: `player | director`
- submission/decision audit fields
- canonical `campaignUserKey` plus indexes by campaign/status and user/status

The owner has owner authority from `campaigns.ownerId`; do not encode owner as a
mutable membership role. Create the owner's approved director membership in the
same transaction as the campaign so roster queries remain uniform. Owners alone
can transfer ownership or delete a campaign; owners/directors can manage routine
campaign operations; approved players get player access.

The membership `director` role is a **permission** — who *may* sit behind the
screen — mirroring the predecessor's per-member director flag. The predecessor also
distinguishes the **Active Director**: the single member *currently* behind the
screen (at most one per campaign, defaulting to the owner). That concept is
deliberately deferred to the lobby/runtime slices — it is ephemeral runtime state,
not membership data, and must not be encoded on the membership document. Slice 5
and the later engine work should leave room for it.

`campaignInvites`

- `campaignId`, hashed code, creator, created/expiry/revoked timestamps
- optional use limit; redemption count if enabled
- index by code hash and by campaign

Prefer a separate invite document over one permanent code on the campaign. It
supports rotation, revocation, expiry, audit, and later targeted invitations.
Redeeming an invite creates a pending membership by default; owner/director
approval remains a deliberate campaign setting.

Friend invitations can later be a UI shortcut that creates an invite or pending
membership. They should not create a different membership path.

### Characters and future library content

`characters`

- `ownerId`, promoted summary fields needed for library lists, validated character
  payload, schema version, timestamps
- indexed by owner; never authorize from an owner ID supplied by the client

`campaignCharacters`

- explicit character-to-campaign attachment
- approval lifecycle and audit fields
- campaign-local progress such as XP, victories, Stamina, and recoveries

The character remains user-owned and portable. Campaign progression belongs to
the attachment, so one character can join more than one campaign without those
campaigns overwriting each other.

Use the same ownership/attachment pattern later for encounter templates, NPCs,
and homebrew:

- `contentSources`: owner, metadata, visibility, schema version
- typed content tables or a validated discriminated `contentItems` table
- explicit campaign-source attachments/enabled-source records

Do not make `contentItems` part of the auth slice. Establish only the reusable
authorization helpers and ownership convention now; choose content granularity
when the engine schemas exist.

### Lobby presence

Presence is scoped to an approved campaign membership and stored separately from
stable campaign/profile data. A presence row contains campaign, user, connection
or session ID, last-seen time, and optional activity. Joining or heartbeating must
derive the current user and verify approved membership. A query returns only the
campaign-visible projection (display name, role, activity), never auth details.

Use the current Convex presence helper/component selected during the lobby slice,
with expiry/cleanup semantics tested. A user may have multiple tabs or devices;
the UI should aggregate those into one visible member.

## Authorization foundation

Create shared backend helpers before feature functions:

- `requireUser(ctx)` returns the authenticated Convex Auth user or throws.
- `requireProfile(ctx)` returns the active app profile.
- `requireCampaignMember(ctx, campaignId)` requires approved membership.
- `requireCampaignDirector(ctx, campaignId)` accepts owner or approved director.
- `requireCampaignOwner(ctx, campaignId)` checks `campaign.ownerId`.
- `requireResourceOwner(ctx, resourceId)` loads the resource and compares its
  stored owner to the authenticated user.

Helpers load authority from Convex documents, return the loaded records to avoid
request waterfalls, and reveal no resource data before authorization succeeds.
Public queries return viewer-specific projections rather than raw documents.

## Account-management scope

The first usable account surface includes:

- sign up and sign in with email plus password; sign out
- email verification and password-forgot/reset flows through Cloudflare Email
  Service
- optional “email me a sign-in link” flow and verification result
- first-login onboarding for display name and unique handle
- view/edit display name, handle, and avatar
- list friendships and pending incoming/outgoing requests
- list campaigns and owned characters
- deactivate/account-deletion entry point

Hard account deletion is not a simple row delete once users own campaigns and
shared content. Initial behavior should be **deactivation**: sign out/revoke
sessions, hide the discoverable profile, block new activity, and retain attributed
campaign records. Before later permanent deletion, require campaign ownership
transfer or deletion, detach personal library items, anonymize retained audit/log
attribution, remove friendships/presence, and finally delete auth data. Specify and
test that policy before exposing a “permanently delete” button.

Email-address changes and credential recovery belong to Convex Auth flows, using
the Cloudflare delivery adapter, not direct profile mutations.

## Delivery slices

### Slice 1 — Password auth round trip and profile bootstrap

- Install/pin Convex Auth and configure the Password provider; add required auth
  config and key material.
- Add the Cloudflare Email Service REST adapter and deployment env contract,
  including the keyless console-logging fallback mode.
- Wire the admin-bootstrap rule (decision 6) into idempotent profile creation.
- Wire `ConvexAuthProvider` and route guards in the Vite app.
- Build password sign-up/sign-in, verification, forgot/reset-password, sign-out,
  onboarding, and account/profile UI.
- Add `requireUser`/`requireProfile`; ensure profile creation is idempotent.
- Add the tightly gated local-development identity path.

**Exit:** two distinct browser profiles sign in, create different handles, reload
without losing sessions, edit their public profiles, reset a password through the
delivery adapter (console-logged link locally; a real Cloudflare-delivered email
once the DNS/Workers-Paid prerequisites are pinned — that real-email round trip is
the acceptance test and stays a gate), sign out, and cannot call a protected
function afterward. Unknown-email recovery returns the same public result as
known-email recovery.

### Slice 1b — Optional magic-link sign-in

- Add the email magic-link provider using the same Cloudflare delivery adapter.
- Add “email me a sign-in link” beside, not ahead of, the password form.
- Exercise expiry, one-time consumption, replay rejection, and account-linking
  behavior so a password user signing in by link does not create a duplicate user.

**Exit:** an existing password user can optionally sign in by emailed link; an
expired or reused link fails safely, and both methods resolve the same user ID.

### Slice 2 — Friends

- Exact-handle discovery; request, accept, decline, remove, and block flows.
- Reactive friends and pending-request screens.
- Pair uniqueness and crossed-request concurrency tests.

**Exit:** two users become friends in separate browsers; a third user cannot read
private profile/auth data, spoof either actor, or bypass a block.

### Slice 3 — Campaigns and invites

- Campaign create/list/settings and transactional owner membership.
- Invite create/rotate/revoke/redeem; membership approval/denial.
- Owner/director/player authorization helpers and roster UI.
- Optional friend-picker as a convenience over the same invite/membership flow.

**Exit:** two users create/join a campaign, an owner approves the member and grants
director, and all three authority levels pass positive and negative tests.

### Slice 4 — Character ownership and campaign attachment

- Minimal character records sufficient to prove create/list/read/update/delete.
- Submit/approve/deny/detach character lifecycle.
- Campaign-local progression record boundary, without game-engine behavior.

**Exit:** a user manages their character library, attaches a character to an
approved campaign, and another member can see only the campaign-safe projection.

### Slice 5 — Lobby presence

- Presence integration, heartbeat/expiry, multi-tab aggregation, campaign roster.
- Membership removal immediately removes lobby authorization.

**Exit:** two campaign members see one another arrive/leave reactively; a
non-member and a removed member cannot observe or enter the lobby.

### Slice 6 — Account lifecycle hardening

- Deactivation, session revocation behavior, ownership-transfer gates, audit-log
  attribution policy, data export placeholder/contract.
- Operator recovery path that cannot impersonate ordinary users.

**Exit:** deactivated users cannot act or be discovered, while campaigns and logs
remain internally consistent and ownership cannot become orphaned.

## Verification strategy

Use `convex-test` with mocked identities for every public function. Each positive
test should have the corresponding unauthenticated, wrong-user, wrong-campaign,
wrong-role, and deactivated-user negative case. Add concurrency tests for unique
handles, friend pairs, invite redemption, and campaign creation. Keep browser smoke
tests for the real password session and Cloudflare-delivered reset/magic-link round
trips because mocked identities cannot prove provider/config/client wiring.

Every slice gates on backend tests, web tests, `pnpm typecheck`, `pnpm lint`, and a
successful push to the selected development deployment. Production env changes or
deployment remain separately consent-gated.

## Decisions to confirm before implementation

1. **Authentication methods:** decided — passwords are the default; magic links
   are optional. Cloudflare Email Service delivers auth email.
2. **Campaign join approval?** Recommended: invite redemption creates `pending`,
   with an optional future campaign setting for automatic approval.
3. **Friend discovery?** Recommended: exact unique handle only; no public directory
   or email lookup.
4. **Account deletion?** Recommended: ship deactivation first and design permanent
   deletion/export once retained campaign/log obligations are explicit.
5. **Friend requirement for campaign invites?** Recommended: no. Friends improve
   discovery and invitation UX but never confer access.
6. **Installation authority?** Decided: the separate System Control Center performs
   a verified, one-time `ENGARDE_SETUP_CAPABILITY` claim. Ordinary signup and
   profile creation never grant Operator authority; see
   `docs/system-control-center-plan.md`.
