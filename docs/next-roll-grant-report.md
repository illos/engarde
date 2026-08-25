# Next-roll grant family — slice report (2026-08-25)

**Scope:** the `edge-bane-next-roll` (12 lines) + `next-strike-against-target`
(2 lines) closed templates — 14 effect lines across 14 artifacts at pin
`520553438a4e8d199bfaaf676b8aa9bd273f4d61`. Design:
`docs/next-roll-grant-design.md`. Gate-3 rulings **R-0012–R-0016**
(`docs/canon-rulings.md`, user-approved 2026-08-25 with the reviewer's
target-local amendment grounded in Roll Against Multiple Creatures, verified
verbatim at pin).

**Accounting:** automated 41 → **55** (12 exact + 29 test + 14 grant); table
1,647 → **1,633** (12 permanently-manual + 1,621 mechanism-pending);
edge-bane family 152 → 138; both closed templates → 0. Corpus certification
stamp refreshed (CONV-0003); all counts re-frozen with in-place comments.

## What shipped

- **Engine substrate (schemaVersion 2 → 3)** — the first persistent
  non-condition per-participant state: `grants: NextRollGrant[]` (polarity /
  scope / direction / source / window), with lossless v1/v2 migration.
  Lifecycle module `grant-lifecycle.ts`: add-with-collapse (same-ability
  duplicates replace per Stacking Unique Effects), pure split helpers, the
  R-0013 consumption predicate (`strike` = Strike-keyword ability roll only;
  `power-roll` = ability roll or test; saving throws never), end-of-turn
  expiry for windowed grants (the sweep event IS the current-turn clause),
  and the encounter-end clear (R-0012; hero out-of-encounter retention is
  documented Director/table state, not modeled).
- **Consumption in the roll path** — `use-ability` consumes the actor's
  matching outbound grants into the uniform base pool and each target's
  inbound marks into **that target's pool only** (R-0014): one dice draw,
  per-target `resolvePowerRoll` through the one cap-then-cancel home,
  per-target tier outcomes driving damage and effects. Receipts carry
  effective counts + `grantsConsumed` + `perTarget` breakdowns;
  `checkInvariants` re-derives base AND per-target resolutions
  (breakdown-mismatch) and reconciles grant adds/removes against
  `addedGrantIds`/`removedGrantIds` claims. A grant is spent even when
  cancellation zeroes it (R-0015). Characteristic tests consume the roller's
  power-roll-scoped grants (a test is a power roll); strike-scoped grants
  sit dormant across them.
- **Grammar + compiler** — two anchored whole-payload templates produce
  `next-roll-grant` resolutions; every differently-worded neighbor (the
  "next ability" rider, the bounded Cackletongue line, the conditional
  Wobalas double, the inbound damage rider) stays a verbatim table
  directive. `compileAbilities` now passes header **keywords** through
  (previously parsed and dropped) — the engine can finally tell a strike
  from a non-strike.
- **Independent golden** — 14 expectations produced by a separate raw
  physical-line scanner (own line walker, link stripper, minimal payload +
  header readers), cross-verified field-by-field against production
  compilation in the exhaustive suite with **zero mismatches**, then frozen.
  The execution half asserts each grant program stores exactly one
  attributed pending modifier and changes nothing else.
- **Hosts** — Convex: `encounterView` surfaces pending grants; dispatch
  needed no changes (stored-record compilation flows through); E2E on the
  new drift-guarded **skitterling** verbatim fixture: grant via Effect
  dispatch → visible in the view → consumed by the goblin warrior's next
  strike (banes=1 receipt, removal claim, no invariant violations). CLI
  `status` lists pending grants. Table UI renders them on participant cards
  (spec-covered).

## Verification

- 362 workspace tests green (engine 155, canon 103+29 corpus-gated, backend
  71, web 28, control-center 5); repo-wide typecheck and lint green.
- 13 new engine mechanism tests, every one a real `applyIntent` dispatch
  with `checkInvariants` asserted (granting, collapse, coexistence,
  strike/test consumption scope, dormancy, spend-on-cancel, target-local
  multi-target tiers, double-edge combination, windowed expiry,
  encounter-end clear, duplicate-dispatch refusal).
- `pnpm corpus:certify` green — stamp committed with the change; the full
  1,688-program corpus executes with zero invariant violations.

## Follow-ups / notes for the next implementer

- The bounded monster variants ("until the start of their next turn", Orc
  Warleader's "before the end of the encounter") need only new `window` enum
  members + sweep cases — the slot shape holds.
- The inbound **damage** rider ("The next strike made against the target
  deals an extra 5 damage", Luminator) needs a contribution generalization
  (modifier vs extra damage) — deliberately not speculatively built.
- Damage-binding pre-validation now refuses when ANY tier with damage fails
  to bind (previously only the landed tier) — stricter in a degenerate
  corner (tiers rarely differ), noted for the audit.
- The `perTarget` receipt block is emitted only when some target's pool
  differs from the base; hosts render base counts otherwise, unchanged.
