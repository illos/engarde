# Action economy + two-phase commit — slice report (2026-08-27)

Gate-3 rulings **R-0029..R-0033** were user-accepted and recorded in
`docs/canon-rulings.md`. The implementation arc landed as engine core
(`7a49c50`), CLI (`ce131d8`), backend (`eb1b062`), asserted-tier parity
(`b3d9935`), web Table (`aa081de`), and two audit-fix batches (`76c8921`,
`42ae76e`), followed by the residual closeout commit containing this report.

## What shipped

**Engine schema v6 and economy.** Encounter state carries combat turn order,
per-participant action budgets and grants, triggered counters, per-ability
use counters, villain-action economy, and a keyed resolution stack. One
`ACTION_COST_DEBITS` table and one `debitActionCost` path govern every spend.
Printed violations warn and apply with receipts; structural failures refuse
without change. Minion members spend individual budgets inside the squad's
shared turn, while the squad occupies one turn-order slot.

**Two-phase resolution.** A rolling combat ability debits and opens a
resolution with a canonical payload hash and complete roll receipt. Commit
re-supplies and verifies the payload, applies ordered modifications against
commit-time state, then resolves damage/effects and closes once-per-action
bleeding. Hosts pipeline commit for the common one-tap path or hold the entry
open for reactions; end-turn force-commits before boundary sweeps.

**Hosts.** CLI, Convex, and web expose turn/round control, budgets, grants,
conversion, triggered and villain actions, hold/modify/commit, and visible
warning receipts. The final N-3 seam adds optional economy attribution to
manual damage: callers name the actor and canon ability only; host/CLI derive
the action cost and printed cap from the exact owned power-roll header, with
suffix-required refusal for ambiguous stat blocks. Ordinary Director damage
remains an adjudication with no ability debit.

**Corpus accounting.** The accepted pin's action-cost header vocabulary is
closed and swept to zero compiled residue, including the exact Wave of Blood
dash exception. Common actions are frozen truthfully at 17 prose features +
5 companion abilities; deferred prose remains a table directive, never
silently counted as compiled.

## Audit and closeout

The first implementation audit found gaps in asserted-tier debit plumbing,
receipt-aware invariants, malformed header cells, common-action accounting,
host authority/attribution, triggered derivation, grant reachability, and web
view/control surfaces. The two same-day fix batches closed those findings and
the independent re-verdict was GO.

A final residual walk closed three more bounded issues: shared asserted
`partOf` dispatches now count one ability use (N-1); triggered derivation
honors an explicit in-record suffix (N-2); and damage-only assertions have a
host/CLI/web debit affordance with canon-derived cost/cap (N-3). The durable
finding-by-finding disposition and remaining follow-up boundaries live in
`docs/action-economy-redteam.md` under “Re-audit (same-day closeout).” Final
verdict: **GO**.

## Verification

- Workspace tests: **550 passed** — engine 264; canon 139 (+36 corpus-gated
  skips); backend 91 (+5 skipped); control-center 5; web 51.
- Workspace TypeScript, Biome lint, and production builds: green.
- `pnpm corpus:certify` refreshed the certification stamp after the rule-code
  changes; `pnpm corpus:verify` reproduced it cleanly (CONV-0003).

## Follow-up boundaries

Reaction-effect automation, turn-scheduling ability automation, heroic
resources, malice, replacement effects, troubadour performance slots,
start-of-turn ordering, movement math, mounted turn pairing, and stitched
common-action execution remain the explicit design §4 cuts. The final audit
also records declared-before-roll targeting state, squad-owned bleeding
qualification, authenticated user↔participant binding, suffix-aware
multi-ability derivation, and corpus pin-bump tripwires for the next
implementers.
