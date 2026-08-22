# System Control Center plan

The **System Control Center** is En Garde's separate installation-administration
application. It is not part of the player app's campaign menu, Table runtime, or
data-library planes. The people authorized to enter it are called **Operators** in
schema, authorization, and audit records.

## Naming contract

- Product and navigation name: **System Control Center**.
- Frontend package: `apps/control-center` (`@engarde/control-center`).
- Backend entitlement: `instanceOperators` and `requireInstanceOperator`.
- Campaign-local authority remains **Admin**. The player app never uses “system
  admin,” and Operator authority never implies campaign access.

## Application boundary

The control center is a distinct Vite/React entry point with its own HTML document,
router, navigation, auth bootstrap, tests, build artifact, and development port
(`5174`). It may initially be reverse-proxied beneath `/control-center` and may later
move to a dedicated hostname without changing authorization.

It shares the Convex deployment, generated API types, auth provider, and visual
tokens with `apps/web`. Local development also reads the same `VITE_CONVEX_URL`
environment file. It does not import player routes or require a player profile.

## Routes and surfaces

| Route | Surface | Authority |
|---|---|---|
| `/` | installation status, instance name, active Operators | active Operator after setup |
| `/setup` | first-Operator claim + minimum instance configuration | verified identity + one-time deployment capability while `setup_pending` |
| `/audit` | latest Operator lifecycle and instance-setting events | active Operator |

Unauthenticated visitors receive the control center's own sign-in/create/verify/reset
flow. Authenticated non-Operators receive an explicit access-denied surface, never a
player-profile onboarding prompt.

## Setup invariant

Setup is an installation action, not ordinary signup:

```text
setup_pending + verified identity + ENGARDE_SETUP_CAPABILITY
  -> first active Operator + instance name + setup_complete + audit event
```

Once complete, the setup route is sealed. The capability is never displayed,
stored, logged, or accepted again.

## Operator lifecycle

- Active Operators can grant another verified account by exact email.
- The server resolves the email and writes the entitlement atomically; the client
  never discovers or supplies authority-bearing user IDs from an untrusted source.
- Active Operators may revoke an entitlement. The final active Operator cannot be
  revoked.
- The active list identifies the signed-in Operator and shows grant source/time.
- Every bootstrap, grant, revoke, and instance-name change is append-only audited.

## Initial scope and later modules

The first slice ships setup, authentication, instance naming, Operator lifecycle,
and the audit feed. Later modules may add delivery health, backups, account
lifecycle, abuse reports, and explicit reason-bearing break-glass recovery. Those
modules remain minimal-data and Operator-gated; campaign state is not exposed by
default.

## Exit test

From a fresh local deployment, a verified identity completes sealed setup, enters
the System Control Center without creating a player profile, changes the instance
name, grants a second verified Operator by email, observes attributed audit events,
and cannot revoke the final Operator. A signed-in non-Operator cannot read or mutate
any control-center data.
