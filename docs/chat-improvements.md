# Chat foundation and improvements

Status: proposed hardening plan  
Scope: campaign Table chat and presence

## Current foundation

The Table chat uses two campaign-scoped Convex tables with deliberately different
lifecycles:

- `lobbyMessages` is durable chat history.
- `lobbyPresence` is disposable heartbeat state describing who is currently at the
  Table.

This is the right basic separation for a permanent chat feature.

### Message storage

The browser calls `lobby.sendMessage` with a `campaignId` and message `body`. The
backend derives the author from the authenticated identity, verifies that the user
is an active campaign member, trims the body, rejects empty messages and messages
over 1,000 characters, then inserts:

```ts
{
  campaignId: Id<'campaigns'>,
  authorUserId: Id<'users'>,
  body: string,
  sentAt: number,
}
```

Convex also supplies the document `_id` and `_creationTime`. Messages currently
survive leaving the Table, signing out, closing the browser, and restarting the
application. They have no expiry or deletion path.

`lobby.listMessages` verifies active membership, reads the newest 50 messages by
the campaign index, reverses them into oldest-first display order, and resolves the
current profile for each author. The web client subscribes with `useQuery`, so
Convex pushes a refreshed result when the campaign's messages change; the client
does not poll for chat messages.

### Presence storage

Presence uses one `lobbyPresence` row per campaign and user:

```ts
{
  campaignId: Id<'campaigns'>,
  userId: Id<'users'>,
  joinedAt: number,
  lastSeenAt: number,
}
```

The campaign page joins on mount, heartbeats every 15 seconds, and attempts to
leave on unmount. A row older than 45 seconds reads as absent, covering crashed
tabs that cannot send a goodbye. Heartbeats opportunistically delete stale rows.
Presence can therefore disappear without affecting durable chat history.

### Authorization

Every public chat and presence function passes through `requireActiveMember`.
Authorship is derived on the server rather than accepted from the client. Pending
members, removed members, and outsiders cannot read or write a campaign's chat.

No critical security issue was found in this foundation.

## Improvements before permanent release

### 1. Add cursor pagination

The database retains every message, but clients can retrieve only the newest 50.
Convert `listMessages` to a paginated query and let the chat pane load earlier
messages when the user scrolls upward.

### 2. Decide retention and deletion semantics

Define what happens to messages when:

- a Director deletes an individual message;
- an author deletes their account;
- a campaign is deleted or archived;
- a configured retention window expires, if retention is desired.

Implement campaign cleanup so messages and presence rows cannot become orphaned.
Soft deletion (`deletedAt`, `deletedBy`) may be preferable when a moderation audit
trail matters; hard deletion may be preferable for explicit privacy guarantees.
Choose and document one policy.

### 3. Snapshot the displayed author identity

Messages currently store only `authorUserId`, while reads resolve the author's
current profile. Renaming a profile therefore changes the apparent author of every
old message, and a missing profile renders as `Unknown`.

Store `authorName` and, if useful, `authorHandle` on the message at send time while
retaining `authorUserId` as the canonical relationship. Historical chat then
remains intelligible after profile changes.

### 4. Add send rate limiting

The 1,000-character limit bounds one document but does not limit message frequency.
Add a per-user, per-campaign rate limit to prevent accidental duplicate sends,
spam, and unbounded storage growth. Return an actionable retry error to the UI.

### 5. Define moderation behavior

Decide which first-release controls are required:

- author edit;
- author delete;
- Director delete;
- report or flag;
- pinning important Table messages.

The initial schema can reserve `editedAt`, `deletedAt`, and `deletedBy` if these are
near-term features. Avoid speculative fields for controls that are not actually on
the roadmap.

### 6. Make presence time-reactivity explicit

`listPresent` uses `Date.now()` inside a reactive query. Active viewers normally
trigger fresh results through their own heartbeats, so the current implementation
works at tabletop scale, but elapsed time alone is not reactive database state.
Before broadening presence behavior, use a maintained presence component or an
explicit scheduled cleanup/expiry design.

### 7. Revisit presence reads only if room sizes grow

Each heartbeat currently collects the campaign's presence rows, and `listPresent`
resolves a profile and membership for every row. This is reasonable for normal
tabletop campaign sizes. If campaigns ever become large public rooms, denormalize
the safe display fields or adopt a dedicated presence component rather than
stretching this implementation beyond its intended scale.

## Recommended first hardening slice

Before treating chat as a permanent production feature:

1. Add cursor pagination and upward history loading.
2. Snapshot author display identity on new messages.
3. Add per-user/per-campaign send rate limiting.
4. Define and implement message, campaign, and account cleanup behavior.
5. Add the minimum agreed moderation controls.
6. Test pagination, rate limits, profile deletion/renaming, removed members, and
   campaign cleanup.

The existing campaign-scoped documents, indexed reads, server-derived authorship,
active-member authorization, reactive subscriptions, and separate ephemeral
presence table should remain. This work is hardening, not a redesign.
