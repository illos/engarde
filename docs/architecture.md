# En Garde — architecture

## The three layers

The repo is organized around a hard separation of concerns, established before any
feature code. Each layer has its own workspace, its own tests, and a schema-guarded
boundary to its neighbors.

```
┌────────────────────────────────────────────────┐
│  apps/web — frontend                           │
│  How people see and touch the game.            │
│  React 19 + Vite + TanStack Router +           │
│  Tailwind v4. No game rules live here.         │
└──────────────────────┬─────────────────────────┘
                       │ Convex client (reactive queries + mutations)
┌──────────────────────┴─────────────────────────┐
│  packages/backend — backend infra              │
│  Convex deployment: schema, functions, auth,   │
│  campaigns, realtime lobby, persistence.       │
│  Knows about users and documents, not about    │
│  Draw Steel.                                   │
└──────────────────────┬─────────────────────────┘
                       │ imports (engine is a pure library)
┌──────────────────────┴─────────────────────────┐
│  packages/engine — game engine  (reserved)     │
│  Everything that turns Draw Steel rules into a │
│  playable VTT: rules canon, the intent         │
│  reducer, derived state. Pure TypeScript, no   │
│  I/O, no framework imports. Arrives only after │
│  the app substrate is proven healthy.          │
└────────────────────────────────────────────────┘
```

Boundary rules:

- **The frontend never implements a game rule.** It renders engine output and
  dispatches intents.
- **The backend never implements a game rule.** It stores state, authenticates
  actors, and (once the engine lands) invokes the engine's reducer as a pure
  function inside mutations.
- **The engine never does I/O.** No fetch, no database, no framework — a pure
  library the backend calls. This is what keeps it portable and exhaustively
  testable.
- **Data crossing any boundary is Zod-schema'd** and types are derived via
  `z.infer` — never hand-written in parallel.

## Bootstrap sequencing

1. **Substrate first (now):** backend + frontend scaffold, built, tested, CI-gated,
   proven working end-to-end — with zero game-system content.
2. **Collaborative layer:** auth (magic link), users, campaigns, memberships,
   invite codes, lobby presence, sharing.
3. **Engine port (last):** the rules engine, canon registry, and content pipeline
   arrive from the predecessor repo (`Ironyard_v2`, frozen at `pre-convex`) once
   the app is healthy. Ported verbatim, gated by its own ~22k LOC test suite.

The predecessor repo remains the reference implementation and copy source; its
`docs/convex-migration-plan.md` and `docs/engarde-bootstrap.md` carry the full
strategy and history.
