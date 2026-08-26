# Action economy design — red-team findings ledger (2026-08-26)

Four independent lanes ran against rev 1 of `action-economy-design.md`:
canon fidelity (quote/silence verification), substrate scalability
(second-implementer test), rules-lawyer (corpus counterexamples), and
Gate-2 PDF page confirmation. Every finding below is folded into rev 2 or
explicitly dispositioned. Lanes' full outputs are session artifacts; this
ledger is the durable record.

## Blockers (all folded into rev 2)

| # | Lane | Finding | Rev-2 disposition |
|---|---|---|---|
| B1 | substrate | `pendingResolution` couldn't execute its second phase — pure reducer has no ability registry to dereference `abilityRef` at commit | Commit re-supplies the payload; the stack entry stores a payload HASH + complete roll receipt; engine verifies hash (Convex-boundary integrity precedent) |
| B2 | substrate + rules-lawyer | Singular window slot vs printed nesting (triggered ability rolling mid-window; Escape Grab's interleaved free strike; Breaking Point's inserted turn) | `resolutionStack` — keyed, ordered, nest-tolerant; boundary-crossing entries warn, not corrupt |
| B3 | substrate | Auto-commit predicate ("no modification legal") not computable from engine state; window would never exist on the common path | Auto-commit dropped; commit is always explicit, hosts pipeline it for one-tap UX |
| B4 | rules-lawyer | R-0031 keyword-based resolve-after default silently misresolves the no-keyword majority (damage halvers, retargeters — Repel, In All This Confusion, Shriek, Meat Shield, Lines of Force…) | Five named interception points + DETERMINISTIC closed-template classification; unclassifiable → applied + verbatim text on receipt (honest residue). Effect automation deferred to its own family |
| B5 | rules-lawyer | Targeting-step reactions (Devilish Charm pre-roll retarget/bane; Tongue Slap post-roll tier cut) fall outside a roll-opened window | `targeting` and `rolled` interception points precede/straddle the roll |
| B6 | rules-lawyer | Whole-turn scheduling grants (Hesitation Is Weakness — cited in the triggered-action rule itself — Patter Song, Prescient Grace, Time Loop…) inexpressible as budget counters; would spam spurious warnings | Grants generalized to `next-roll \| action \| turn` union; `turn` kind carries allowance/insertion + no-consecutive constraint; ability automation deferred, Director-asserted scheduling meanwhile |
| B7 | rules-lawyer | Dash census wrong (157 not 156) — two byte-malformed printed tables (gloom-dragon Absence of All Light missing trailing pipe; lizardfolk Net Trap missing leading pipe) would compile silently costless, one a villain action invisible to the villain economy | R-0029 adds permissive-regex hardening for the two byte-defect classes; census corrected on the card |

## Important (folded)

- Action grants don't fit the v3 next-roll schema → generalized grant
  union with per-kind consumption/expiry config (substrate F4).
- `modifications[]` needed a discriminated-union vocabulary with apply
  contracts, or every family shotgun-edits the commit handler (F5).
- Round advance uncomputable from "all have acted" (solos, dead/skipped
  actors, sub-actors, mounts) → Director-asserted `advance-round` with
  advisory warn (F6 + rules-lawyer 13/16).
- Round-boundary sweeps inline in handlers = the accretion point →
  boundary-sweep registry, prework-2 (F7).
- `end-turn` vs open windows: force-commit THEN endOfTurnSweep — printed
  damage never discarded; save ordering stated (F8).
- Budget invariant must model permitted-violation receipts or it flags
  every R-0030 warn-and-apply dispatch (F9) — receipt-aware invariants.
- Stale-window commits: commit executes against commit-time state with
  standard degradation receipts (F10).
- Downgrade-after-reaction retro-incoherence: modifications apply in
  dispatch order, incoherent combos warn-and-apply with full history on
  the receipt — folded into R-0032's card (F11).
- Roll receipt must pin ALL recompute inputs incl. per-target R-0014
  pools; new-mark-during-window ambiguity noted for the reaction family
  (F12).
- Wave of Blood must NOT inherit villain-action (end-of-round delayed
  tail of Sacrifice; would violate all three villain constraints) —
  R-0029 corrected (rules-lawyer 6).
- `No action` performances carry real consumption rules (Routines/
  Medley) → troubadour family cut, directive on receipt (rules-lawyer 7).
- Dazed-escape class is ~23 malice Solo Actions + hero features, not
  just crit → escape flags on `action` grants + Director manual grant
  intent (rules-lawyer 8).
- Common actions are 17 PROSE features + 5 companion abilities, not 18
  pipeline-compilable artifacts; Defend/Heal/Advance/Disengage/Ride
  compile to nothing via the ability pipeline → stitched model, counts
  fixed (rules-lawyer 9, canon F3).
- Per-ability once-per-round caps (Ride ×2, Keeper of Order's CAPPED
  free trigger, siege actions) → `abilityUses` slot; free-triggered
  bypass no longer uncaps them (rules-lawyer 10).
- Charge composes an inner Main-action ability → `partOf` consumes the
  parent's debit once; bleeding keys once on the outer resolution
  (rules-lawyer 11).
- Would-die replacement interceptors must intercept INSIDE application,
  before 0-Stamina triggers (incl. squad count-time triggers) →
  `replacement` point ships named, automation deferred (rules-lawyer 12).
- Bleeding: once-per-action dedup keyed by resolution entry, fires at
  commit-close, bypasses the modification window (rules-lawyer 15).

## Canon-fidelity corrections (folded)

- Captain quote regrammatized ("isn't" not "aren't") — requoted.
- 21 solo "two turns" statblocks (not 22; the 22nd was a draconian
  malice feature with different phrasing); Ajax is three turns + three
  triggered actions + no-consecutive.
- 10 common maneuvers / 17 features (not 11/18).
- "additional main action" = 34 artifacts: 6 statblocks, 23 malice
  features, 3 hero-side, 2 rules — grant work lands mostly in malice/
  hero pipelines, not statblocks.
- "Unless otherwise indicated," restored to the damage→effects ordering
  quote (it is R-0032's printed escape hatch).
- `begin-combat` Director override is project permissive policy, NOT
  printed authority; surprised-side automatic first-action case added.
- Elision convention: bracketed ellipsis for any non-scc-link elision.
- Maneuver→free-maneuver prevention coupling added beside the
  triggered→free-triggered one.

## Gate-2 PDF confirmation

All 20 card anchors EXACT with printed page numbers (Heroes p.4, 74, 75,
77, 266, 267, 275; Monsters p.4, 7, 8, 9). Silences independently
confirmed at PDF level: no trigger-resolution ordering rule, no
delay/ready mechanism. **Recovered: the "Acting Together" minion action
economy prose, Monsters p.8–9, verbatim** — absent from the markdown
bundle pin; grounds R-0033 (full text on the card and, if accepted, in
the rulings log).
