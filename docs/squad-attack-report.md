# Squad attacks + With-Captain benefits — slice report (2026-08-27)

Gate-3 rulings **R-0034..R-0039** were accepted and recorded in
`docs/canon-rulings.md`; R-0038 includes automatic detach on captain death.
The implementation builds on the final action-economy dependency `5baaa39`
without replacing its debit, grant, or two-phase resolution homes.

## What shipped

**One-roll squad execution.** New signature, Free Strike Together, and squad
maneuver intents carry ordered participation rows with an explicit instance
owner. Signature attacks spend every living member's main action, roll once,
scope each member's outbound grants only to targets they attack, preserve
per-target inbound modifiers, store a typed per-target breakdown, and open one
squad-owned resolution in combat. Commit still applies damage to every target
before riders. Critical hits grant one main action to every participant.

**Lossless tier and stacking data.** `compileSquadAbilities` keeps the shared
roll when only some physical tier lines fit the closed grammar: each tier is
automatic data or exact residue. Helper damage uses the same contribution
summation home as Free Strike Together, inherits a single damage packet's type,
and records damage-less/bespoke packets as visible residue. The printed pitling
example is golden: tier-2 Spit deals 4 poison to the one-attacker target and 4
+ 2 poison to the two-attacker target. Free Strike Together produces one
damage instance, so weakness/immunity applies once.

**Captain benefits.** Statblock stats now lift printed Free Strike and a
closed-template `withCaptainBenefit`. Edge benefits enter the receipt-visible
derived-modifier channel once per roll; strike damage applies once per signature
target instance or per Free Strike Together contribution. Movement-plane and
bespoke benefits stay verbatim directives. Stamina benefits move the effective
per-minion divisor/area cap, pool current, and pool maximum together; attach,
detach, replacement, and death are claim-reconciled. A lethal dispatch
automatically detaches the captain and removes the live benefit.

**Bounded common maneuver support.** The certified grammar now compiles only
the pure `Push 1/2/3` tiers of Knockback and emits table-resolved movement
directives. Hide and Search remain directives. Grab does not compile in
this slice, but NOT for the reason first proposed: the R-0036 amendment
(accepted 2026-08-28, verdict `amend`) ruled the tier-2 free strike is not a
player decision point, so Grab compiles sequentially rather than needing
nested reaction machinery. Its automation is deferred behind hero free-strike
mechanics instead — see §Explicit follow-up boundaries. The amendment review
surface and the returned verdict are at
`.artifacts/canon/squad-attack/r-0036-amendment-review.html` and
`…/r-0036-amendment-verdict.json`. Artifact hashes:

- review HTML: `f572b3149f318bdf07ddf851c5520919ac5b4c5be49bd9d25e84b48b4a6d0cf6`
- expected-hashes JSON: `a97e572bbed2accb62ff5f7f9f80a2969296cefff5bd5cde7a7a959a286840b8`
- amendment note: `bb6ea47a9f2394fc8e767a8ba3cc74806859f3361809f57a29ff92a8c6f44f18`
- normalized proposed-card hash:
  `8ade47dae998921726896ef840b2695038ceb0d30decba345b1add97467f6769`

**Hosts.** Convex recompiles an explicitly named `record#ability-slug` from
stored canon bytes and pipelines the same explicit commit used by ordinary
abilities. CLI exposes `squadattack` and `squadfs`. The Table exposes ordered
target rows, instance-owner/member chips, signature and Free Strike Together
actions, and structured automated-modifier versus directive Captain chips.

## Audit disposition

The implementation audit found and closed three bounded integration defects:
directive maneuvers initially skipped per-member maneuver debits; member-held
outbound grants were consumed correctly but omitted from the aggregate roll
receipt; and squad damage characteristic/type bindings needed the same
pre-debit refusal gate as ordinary abilities. The red-team ledger records the
fixes. R-0036's human amendment verdict is accepted; Grab automation is now a
documented hero-free-strike dependency, not an amendment blocker. The
pre-existing squad-owned bleeding qualifier remains inert and
tracked: squads cannot currently carry conditions, so no qualifying condition
state is lost.

## Verification

- Corpus-enabled workspace: **612 tests green** (engine 276, canon 181,
  backend 97, control-center 5, web 53), including the final audit cases.
- Focused squad core: pitling split/stack, Free Strike Together, captain edge,
  crit grants, residue, outbound-grant narrowing, directive debits, Stamina
  shift, and death auto-detach.
- Backend/CLI/Table E2E: stored-canon signature compilation, ordered
  participation, combined free strikes, and structured captain benefit view.
- Workspace TypeScript, Biome lint, and production builds: green.
- `pnpm corpus:certify` runs all 29 corpus-enabled canon files (181 tests),
  refreshes the CONV-0003 stamp, and `pnpm corpus:verify` reproduces it.

## Explicit follow-up boundaries

**Grab tier-2 automation — DEFERRED behind hero free-strike mechanics.**
R-0036's 2026-08-28 amendment rejected the reaction-nesting premise: the
target's free strike is not a decision point, so Grab compiles *sequentially*,
not nested. The remaining blocker is that a hero's melee free strike is itself
a power roll (2/5/7 + M or A) with a characteristic choice and kit modifiers,
and the hero side is not seeded. Grab's tiers 1 ("No effect.") and 3 ("The
target is grabbed by you.") are unblocked and may compile ahead of tier 2.
Until then all three tiers stay a lossless directive carrying verbatim tier
text. Grabber identity is NOT a blocker — it is the participation row's
`instanceOwner`, and `applySquadDamage` already kills "the minion who took the
damage that reduced the pool" deterministically.

Also named: map geometry; Feast's member-detach/transform mutation; triggered
substitution traits; squad-vs-squad free strikes; and the inherited
squad-owned bleeding qualifier. None is represented as automated by this
slice.
