# @engarde/engine

The pure Draw Steel rules interpreter. Scaffold only for now — mechanisms arrive
in engine-plan Phase 3, built from canon artifacts (`packages/canon` +
`.artifacts/canon/`), never from memory.

Governing plan: [`docs/engine-plan.md`](../../docs/engine-plan.md) (ratified as
DEC-0009). The load-bearing rules for this package:

- **Pure.** `state + intent (dice as input) → new state + structured log`.
  Identical inputs are byte-identical outputs in every host (Convex, CLI,
  vitest).
- **No I/O, no framework imports, no ambient time or randomness.** The only
  permitted bare import in production sources is `zod`. `Math.random`,
  `Date.now`, `new Date()`, `process`, `fetch`, timers, and `crypto` are
  forbidden in production sources. `src/boundary.test.ts` enforces all of this
  mechanically and runs in CI with the ordinary test suite.
- **Determinism is injected.** Hosts supply a `RandomSource` (seeded) and a
  `Clock` (asserted time) via `src/determinism.ts`; dice results normally
  arrive already-rolled on the intent.
- **No invented rule content.** No mechanic, number, condition, or rulebook
  prose appears here unless it traces to a canon artifact. Test fixtures use
  real corpus records, never invented stat blocks.
