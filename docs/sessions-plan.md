# Sessions, roster, resources, and character control

This document is the implementation contract for the runtime beneath a campaign's
Table. It realizes DEC-0006 without importing game-engine rules ahead of the engine
port.

## Runtime hierarchy

- A campaign has at most one active session and a monotonic session number.
- Only the current live Director may start or end a session.
- A Director handoff changes authority immediately and leaves the active session,
  roster, and resources untouched.
- Ended sessions are immutable history and cannot be reopened.
- Active campaign members can read the 50 most recently completed sessions,
  newest first, from the Table's session-history list. An active session enters
  that history only when it ends.

## Durable roster and resource basis

Starting a session atomically writes the session, the selected character snapshots,
the initial roster events, and one `sessionRuntime` row. Selection comes from active
campaign character bindings and requires at least one character; lobby presence is
never consulted.

The runtime freezes the pre-engine resource-generation basis as the initial
character count and total level, with its generation timestamp and revision. This is
the stable host contract for the later verbatim engine port. Mid-session roster adds
and removals append events but never rewrite that basis.

Roster rows retain character name, owner, level, and binding-incarnation snapshots.
Removing a character binding or ending its owner's membership removes any active
roster entry in the same transaction and expires grants tied to that binding. Ending
membership also expires pending and accepted grants received by that member, so leaving
and later rejoining never revives prior consent.

## Character control

Effective control is resolved on the server for each active roster character:

1. the immutable character owner;
2. the campaign's current Director; or
3. an accepted grant whose binding incarnation and scope are still effective.

Offers are inert until the recipient accepts. Session grants expire at session end.
Persistent grants survive later sessions in the same campaign only while the exact
character-campaign binding remains active. Owners may revoke and recipients may
decline or relinquish; terminal states remain queryable as history.

Authorization, duplicate detection, and cleanup query active status-specific indexes;
terminal history can never push a live grant behind a flat row limit. The Table resolves
the viewer's accepted grants once per campaign rather than scanning grant history for
each roster entry. Each binding and session permits at most 200 simultaneous pending or
accepted grants so binding removal and session end remain bounded atomic transactions.
The client-visible history is the viewer's 200 newest granted-or-received rows.

## Verification contract

`convex-test` covers negative Director authorization, immutable resource basis,
mid-session Director handoff, completed-session history ordering, acceptance-gated
control, session expiry, persistent grant reuse, and binding cleanup. Frontend tests
cover the Table session controls and history list; workspace typecheck, lint, and
local Convex code generation must remain green.

Grant regressions additionally cover leave/rejoin cleanup and fresh persistent/session
grants after 200 terminal historical rows.
