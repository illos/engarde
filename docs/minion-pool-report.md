# Minion squad Stamina pools — slice report (2026-08-26)

Shipped on main: 1d1d7b9 (prework), 83cb349 (design + candidates), a097c25 +
2fc1cc8 (rulings recorded), 7a1fea5 (engine core), 1a10a8d (backend + CLI),
172efac (web Table), 32eb59c (audit fixes). Gate-3 rulings **R-0023..R-0028**
user-accepted 2026-08-25 (five via the :9510 card surface, blob cardHashes
6/6 verified; R-0024 via a revised rev-2 card — the user's amendment
"Overflow is never discarded" reconciled to full-decrement-with-carryover,
past-the-end excess discarded on the record — accepted in chat). Recorded in
docs/canon-rulings.md.

## What shipped

**Prework (audit latents from the flat-resource family):** `isMinion`
one-home + the shared `applyPerTarget` effect-executor applicator (zero
behavior change, certified) — both landed before the arc per the audit's
sequencing note.

**Engine (schema v4 → v5):** encounter-level `squads` slot — squadId, name,
perMinionStamina, pool current/max, memberIds/deadMemberIds, pendingKills,
captainId. Squad members are ordinary participants with `stamina: null`;
the pool is the ONE home for squad vitality. `applySquadDamage` (damage.ts)
is the single damage pipeline: per-contribution area cap min(damage,
perMinion) [R-0025] → sum → squad weakness/immunity once, LAST, via the
existing pipeline helper [R-0026, may push kills past the area-bound count]
→ full decrement with carryover, floor at 0, discarded excess receipted
pre-floor [R-0024] → threshold kills (`kills == floor((max − pool)/per)`
invariant), bound targets die first, then named victims, remainder to
pendingKills with an anonymous count-time 0-Stamina trigger receipt + a
nearest-rule table directive [R-0024/R-0027]. Regain/temp-Stamina/Recovery
against living squad members are rule-mandated per-binding refusals;
squadless minions table-route (their Stamina is individually tracked, so
the incoherence rationale doesn't apply) [R-0027, supersedes R-0019c's
routing for members]. Intents: resolve-pending-kills (identity assignment
only — the trigger fired at count time), attach-captain / detach-captain
(Director; warn-and-replace/move; engine verifies only non-minion — the
non-Mount role and shared language are receipt-named table assertions)
[R-0028]. Seeding through `initialEncounterState` (one validator for all
hosts): printed pool formula, mixed-statblock refusal, >8 warns. Invariant
oracle: 8 new codes (pool bounds + formula, dead+pending kill accounting,
two-way membership, member-stamina-null, weakness-once, claim walks).

**Golden channel:** both printed worked examples reproduced through
drift-guarded, pin-re-cut fixtures — the goblin-spinecleaver 40-pool
threshold walk (kills at 35/30/25/20/15/10/5/0) and Incinerate 15-not-18
with the real artifact compiled by the certified grammar; plus the R-0024
chat example (2-Stamina minions, 7 damage → 3 kills + 1 carried) pinned.

**Hosts:** statblockStats emits `withCaptain` verbatim (all 116 in-pin
minion statblocks; six fixture statsJson consciously re-frozen via
mechanical re-cut). Convex: squad seeds on `start` (atomic rejection of
incoherent seeds), Director-gated resolvePendingKills / attachCaptain /
detachCaptain / applyDamage (area + minionKillVictims), `view.squads` with
withCaptain shown only while attached, participants carry an
engine-computed `isMinion` flag; 5 E2Es on drift-guarded fixtures. CLI:
`--squad` seeding over statblockStats actor stats, squads status section,
damage/resolvekills/attach/detach commands. Web Table: squad cards (pool
bar, member chips, pending badge, captain + verbatim With-Captain line),
Director attach picker / detach / exact-count resolve-kills picker, squad
receipt breakdowns; generated-api types end to end (no casts).

**Verification:** 446 workspace tests green (216 engine / 112 canon / 79
backend / 5 control-center / 35 web incl. 5 squad component tests);
typecheck + lint clean; web production build green; corpus certification
stamp refreshed with every engine-touching commit (CONV-0003).

## Accounting

Effect-line accounting unchanged (67 automated / 1,621 table) — this arc
automates a dispatch path, not Effect lines: damage against the 116 in-pin
minion statblocks moves from unconditional "resolve at the table" to full
pool automation for seeded squads. The Summoner book's divergent minion
rules are out of pin (227 entries, 0 included) and out of scope.

## Audit (2026-08-26, fresh read-only): NO-GO → GO after same-day fixes

One BLOCKER: pending-identity kills fired no 0-Stamina trigger while the
resolve receipt claimed they had — fixed with the anonymous count-time
trigger receipt (the book's taking-out happens when the pool counts the
kill) and truthful resolve prose. Five IMPORTANT, all fixed same-day
(32eb59c): attach receipt names table-asserted eligibility + R-0028 ledger
sentence corrected + Mount gap tracked; regain refusal re-scoped to squad
members (squadless minions table-route — the pooled-Stamina rationale was
false for them); manual single-target area damage against a
weakness/immunity squad now warns about per-dispatch application of the
once-per-squad step; the web's type-erasing view-contract seam replaced
with generated api types; the minion predicate re-one-homed (driver seed
gate + an engine-computed view flag for the web captain picker). Clean
areas: R-0024 core math, R-0025/R-0026 composition, seeding gates, golden
channel, E2E parity, verbatim discipline, migration.

## Deliberate scope cuts (tracked in design §4)

Squad turns / Acting Together / Squad Action / Minion Maneuvers / Free
Strike Together (action-economy arc); With-Captain benefit automation
(named follow-up family; the 10 Stamina-type benefits carry a book-silent
mid-fight pool-recompute question needing its own ruling); demoralized
optional rule; splitting/merging squads mid-combat; per-member conditions
(core has no squad-level condition rule); Mount-role eligibility
(statblockStats parses no roles); manual multi-contribution damage
payload; dead-captain table nudge.

## Latents for next implementers (audit L-1..L-4)

- **L-1:** the isMinion → squadOf → contribution-Map collection loop exists
  in four call sites (ability-execution, effect-execution ×2, apply-intent)
  — extract `collectSquadContribution` BEFORE the action-economy arc copies
  it a fifth time (fails the second-implementer test as-is).
- **L-2:** mixed-damage-type single instances apply the once-per-squad
  weakness step untyped with a warning — engine-adjudicated, unruled; take
  to Gate-3 if a real corpus ability ever produces the case.
- **L-3:** a dead captain stays attached until manual detach; the tracked
  nudge (table-directive on captain death) is the natural hook for the
  With-Captain benefit family.
- **L-4:** the invariant claim-walk pattern is on its third structural copy
  (pool/pendingKills/captain) — extract a generic walker before schema v6
  adds the next state slot.
