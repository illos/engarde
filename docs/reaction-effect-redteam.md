# Reaction-effect design — red-team findings ledger (2026-08-26)

Three independent lanes ran against rev 1 of `reaction-effect-design.md`
(the Gate-2 PDF lane ran before rev 1 froze and its recoveries are inside
it): canon fidelity, substrate scalability (against the LANDED
action-economy code), and rules-lawyer (corpus counterexamples). Eight
blockers; every finding below is folded into rev 2 or explicitly
dispositioned. Lanes' full outputs are session artifacts; this ledger is
the durable record. The survey was REBUILT (v3) because three blockers
were survey-extraction defects — rev 2's numbers are v3's.

## Blockers (all folded)

| # | Lane | Finding | Rev-2 disposition |
|---|---|---|---|
| B1 | substrate | "Additive v6→v7" was false: entries are born at `rolled` with a REQUIRED rollReceipt; "open" is hardcoded as `phase === 'rolled'` in six sites with no shared predicate; force-committing an unrolled entry is undefined; the invariant phase-walker assumes rolled births; payloadHash is stamped over the roll-time payload | R-0041 recast honestly: phase-discriminated entry (declared entries carry no receipt), `isOpen` one-home extracted as PREWORK before any phase lands, declared entries CANCEL with receipt at end-turn (nothing rolled → nothing to commit; adjudication stated on the card), declaration/roll hash pair both witnessed, declared-birth + declared→rolled invariant claims admitted as new coverage |
| B2 | substrate | The shipped trigger reference is `{kind:'occurrence', intentId}` — it names a DISPATCH, not an occurrence; one dispatch emits many occurrences and a halver must name which target's instance it intercepts | Occurrence records get real ids; the intent payload gains an optional occurrence-id field — an admitted schema change, no longer disclaimed |
| B3 | rules-lawyer | The payload-free occurrence record cannot classify the printed trigger vocabulary (subjunctive "would take damage", type-conditioned, amount/result-conditioned, roll-fact-conditioned, counting/memory, reaction-meta reduction deltas) | Occurrence record carries typed payloads (amount, damage types, source facts, roll facts incl. tier outcome, state transitions incl. below-N thresholds, would-take vs applied, reduction delta); payload-requirement flags are now measured in survey v3 (38 type-, 26 roll-fact-, 5 amount/result-conditioned, 2 counting, 1 hidden, 1 reaction-meta); counting/memory + hidden-state stay table-asserted |
| B4 | rules-lawyer | "Declaration asserts targets" breaks in print: tier-dependent target adds (Lachomp Tooth), effect-time adds with per-target banes (fire-giant lightbearer), a reaction that ADDS a target (Harmonize), state-contingent mid-resolution retargets (Hammer and Anvil), and area-shaped reaction target lists (Testudo!) | Declared target list is asserted-and-mutable, area-shaped where printed; new `target-add` modification kind; per-target roll modifiers exist via B6's kind; tier-dependent adds arrive as modifications at `rolled` |
| B5 | rules-lawyer | The 32-unit halver class had a FALSE POSITIVE (Feedback Loop reflects "damage equal to half the triggering damage" — compiling it to damage-halve would wrongly halve the incoming damage) and missed ≥10 passive/gerund-form halvers ("is halved", "halving the damage") | Survey v3 templates rebuilt: halve class is 46 units; `derived-half-damage` is its own class (1 unit, residue this arc); the negative-lookbehind excluding "equal to half" is recorded in the method block |
| B6 | rules-lawyer | The modification union lacks an edge/bane kind; 12+ real reactions impose or TRANSFORM edges/banes (word-of-judgment's retroactive per-target bane, Turnabout's edge→bane transforms, Devilish Charm's targeting-time bane) and neither next-roll grants (wrong binding, wrong timing) nor any declared kind fits | New `roll-modifier` modification kind: impose edge/bane (incl. double) or transform existing, per-target scope, hash-bound to the entry, applicable at `declared` (pre-roll) and `rolled` (retroactive re-evaluation through the fold). Survey v3 counts the class: 32 units |
| B7 | rules-lawyer | Placement counts (2 after / 1 before) were regex artifacts — the survey misclassified the design's OWN explicit-before exemplar (Testudo!) and missed ≥7 real placement clauses; mixed-clause units (halve now + shift after) can't carry one label | Survey v3: per-clause multi-label classification; corrected counts explicit-before 4 / explicit-after 11; mixed-clause units carry both labels and apply per clause |
| B8 | canon | "dazed/surprised/unconscious prevention: all shipped (R-0030)" — unconscious appears in NEITHER the ruling nor the code, yet the printed Unconscious text mandates it ("While you are unconscious, you can't take main actions, maneuvers, triggered actions, free triggered actions, or free maneuvers") | Real canon gap, filed IN this family: R-0045 adds the unconscious prevention flag beside dazed/surprised (the design's "adds no economy" is amended to "adds exactly this flag"); the miscitation is corrected |

## Important (folded)

- The audit-derived constraints (assertedAbilityUse param, ActionGrant
  budget-cost constraint, action-cost residue directive) are in code-67's
  UNCOMMITTED working tree — rev 2 marks them pending-audit-commit and the
  build leg re-syncs on their landing hashes (canon F3).
- The opening R-0031 quote was the action-economy DESIGN doc's words, not
  the recorded ruling's — re-quoted from the ruling with elision marked
  (canon F2).
- §4's "registry config" language described plumbing that doesn't exist:
  the committed apply path is an inline fold switch in
  `commitResolutionEntry` (which already applies damage-halve / retarget /
  tier-adjust / downgrade / potency-adjust). Rev 2 extends the FOLD (per-
  kind functions in one module; adding a kind touches the fold's dispatch
  table, admitted), never a parallel apply home (substrate F3).
- Reroll contract completed: new dice arrive in the modification payload
  (host-rolled at dispatch time); the stored receipt is IMMUTABLE — the
  fold recomputes from receipt inputs preferring the reroll's dice; prior
  tier-shifts re-fold over the new roll in dispatch order (substrate F4).
- Squad composition stated explicitly: the squad build leg funnels its
  per-target breakdown rows through the SAME fold `damageTransform` seam —
  breakdown rows are fold input; modifications never edit them directly
  (substrate F5; recorded in the squad family's working note).
- Candidate enumeration needs compiled fields that don't exist: the
  canon-side compiled shape gains triggerClass + verbatim trigger line,
  and per-tier interception entries (Devilish Charm's tier-1 retarget /
  tier-2 halve / tier-3 bane need per-tier output — one point per ability
  cannot hold it); the classifier already reads full sections including
  tier bullets, so input coverage was NOT the gap (substrate F6, F7).
- `deriveOccurrences` domain widened to interception points ∪ boundary
  kinds (the turn-scheduling family fires off end-of-turn); derivation
  runs over the committed CLAIM stream post-dispatch (staminaDeltas with
  the pipeline/staminaLoss provenance split — prior art for R-0040's
  boundary, cited on the card; powerRoll rows; effectiveTargets) rather
  than per-call-site emission; the rolled-damage provenance field on
  damage claims is named as real work (substrate F8).
- Stamina-GAIN is a detectable occurrence class the design omitted
  (Stolen Vitality, You Would Flounder…); winded is a distinct printed
  threshold class (5 units), engine-derivable — both added to R-0040
  (rules-lawyer F2, F3).
- Halve scope variants named: split-half (Trick of the Eye — halve
  automates, remainder-redirect is directive), ability-wide halves (Buss
  Buffe — per covered target's instance), regain-halves (Magic Siphon,
  Stolen Vitality — regain interception is not in the damage pipeline;
  directive this arc, named future), duration-scoped halves (directive);
  irreducible damage ("can't be reduced in any way") checked in the
  transform (rules-lawyer F7).
- Weakness ordering IS printed in the pin ("apply the weakness first,
  then the immunity" — rule/damage/damage-weakness) — the one-home
  encodes halve → weakness → immunity; the two real silences (halve-vs-
  weakness relative order; stacked halves + rounding) are declared
  Gate-3 positions on the R-0042 card, and the committed fold's
  last-write-wins halve Map is replaced by compose-with-receipt
  (substrate F10, rules-lawyer F8).
- Tier-adjust generalized: cut AND increase (Bloodstones) and SET
  (Blessing and a Curse first clause); the future-roll opposite-outcome
  clause needs a tier-set grant payload — named deferral (rules-lawyer
  F10). A second reroll unit exists (heist-hero title) — reroll kind
  confirmed 2 units.
- State-mutating residue effects are named with an escape surface:
  summons/roster adds (An Army From Blood, Abyssal Protectors, Summon My
  Guard), member transform (Feast — the squad family's named forward-dep),
  replacement offers with forced control (Tempting Offer), death-aversion
  (Feign Death), irrevocable death (Devour Soul), forced ability use
  (Word of Final Redemption) — each maps to a named forward-dep intent
  class; a verbatim directive alone cannot land them in-engine
  (rules-lawyer F11).

## Nits (folded)

- "4 multi-trigger terrain units" → v3 counts 5 multi-trigger units; the
  composition is stated, not labeled terrain (canon F4).
- `condition-or-effect-gain` (2 units) explicitly assigned to the
  asserted path in R-0040's accounting (canon F5).
- Spend/Malice-rider count is now a recorded survey field with its regex
  (24 units) (canon F6).
- Enumeration input is defined over compiled holdings ∪ the grants
  registry from day one (malice family proofing) (substrate F9).
- Confirmed-positive: fold `damageTransform` runs before the committed
  weakness-first/immunity-last pipeline, so the p.277 golden falls out of
  shipped ordering; the residue directive reuses the action-cost residue
  shape (substrate F10-positive).

## Survey v3 relative to v2 (defect-driven rebuild, recorded)

Empty triggers 15→0 (markdown-fallback extraction for statblock features
whose structured effects omit the Trigger line); trigger residue 34→11;
damage class split (taken 57 / dealt 43 / Stamina-loss 1 / Stamina-gain
2 / winded 5 / zero-Stamina-or-death 16); placement per-clause
multi-label (halve 46, roll-modifier 32, retarget 12, explicit-after 11,
tier-adjust 10, explicit-before 4, reroll 2, derived-half 1, target-add
1, replacement 1; residue 150); own-roll 42; spend lines 24. Coverage
cross-tab recomputed against v3 labels
(`coverage-crosstab-v3.json`): of 150 residue units — 10 fully
compilable, 124 whole-to-table, 16 roll-table-only.
