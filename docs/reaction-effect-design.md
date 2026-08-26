# Reaction effects at the interception points — design (rev 2, 2026-08-26)

Rev 1 was red-teamed by three independent lanes (canon fidelity, substrate
scalability against the landed action-economy code, rules-lawyer corpus
counterexamples; the Gate-2 PDF lane ran before rev 1 froze); the findings
ledger is `docs/reaction-effect-redteam.md`. Rev 2 folds in all eight
blockers — including a rebuild of the survey itself (v3), since three
blockers were survey-extraction defects. The family named by the recorded
R-0031 ruling: "This arc ships the points and the economy [bracketed
elision]; reaction-EFFECT automation is a named follow-up family."

Grounding inputs, all at accepted pin
`520553438a4e8d199bfaaf676b8aa9bd273f4d61`:

- Deterministic survey **v3** `.artifacts/canon/reaction-effect/
  survey.json` (246 triggered units; per-clause multi-label placement;
  regexes + the v2→v3 defect record in `method` and the ledger).
- Effect-compile coverage `.artifacts/canon/reaction-effect/
  compile-coverage.json` + `coverage-crosstab-v3.json` (shipped-grammar
  judge): of the 150 placement-residue units, 10 fully compilable, 124
  whole-to-table, 16 roll-table-only. **The family's automation payload
  is the interception classes + occurrence detection, NOT grammar
  expansion.**
- Gate-2 PDF lane (2026-08-26): exemplars EXACT (Tongue Slap, Meat
  Shield, Testudo!, Breaking Point full text); Repel re-attributed
  (talent Telekinesis tradition feature, target-scoped; fury's is
  Unearthly Reflexes); recovered: the printed halving-before-immunity
  rule + worked example (Heroes p.277), the rolled-damage sub-class rule
  (p.74), the Trigger-entry definition (p.70); confirmed silences —
  trigger invalidation before resolution, declining a triggered action,
  a triggered action's own roll timing. "Takes damage" vs "loses
  Stamina": direction printed, converse SILENT, distinct trigger
  phrasings printed side-by-side (p.132) — a Gate-3 question.
- Dependencies: action-economy substrate as LANDED (schema v6 rev 2.1 —
  five interception points, resolution stack + hash-bound commit, the
  modification fold in `commitResolutionEntry` already applying
  damage-halve / retarget / tier-adjust / downgrade / potency-adjust,
  R-0031 section-scoped classification with applied-default residue).
  **Pending-audit-commit constraints** (in the audit session's working
  tree, NOT yet landed — the build leg re-syncs on their landing
  hashes): `tierOutcomeToIntents` gains an `assertedAbilityUse` binding
  param (asserted reactions ride it); a runtime table-directive fires
  for action-cost residue (this family's residue directive matches its
  shape); `ActionGrant.cost` constrained to budget costs (granting
  triggered actions deferred to the malice family). Audit-flagged:
  the `targeting` point has NO lifecycle home (entries are born at
  `rolled` with a required receipt) — §3 R-0041 is that mechanism.
- Prior rulings bearing here: R-0014/R-0015 (per-target pools; count →
  cap → cancel), R-0026 (squad immunity once-last), R-0030 (permissive
  economy, escape flags), R-0031 (points + templates + residue), R-0032
  (stack, commit, modification union with declared apply contracts,
  commit-time state), R-0034..R-0039 (squad paths; accepted — build
  pending).

Everything quoted is byte-verbatim from the pinned bundle, or
PDF-verbatim where flagged; the ruling cards record all quotes durably.

## 1. Canon base (verbatim anchors; full quotes + pages on the ruling cards)

- **Trigger entry, WHEN-only** (Heroes p.70): "If an ability requires a
  triggered action or a free triggered action to use, a 'Trigger' entry
  is part of the ability. […] A tactician can use their Parry ability
  only when that specific triggering event occurs."
- **Halving before immunity — printed sequencing + worked example**
  (Heroes p.277): "Damage immunity should be the last thing applied when
  calculating damage. For instance, if your hero has fire immunity 5 and
  takes 8 fire damage, they take 3 damage. But if an ally first halved
  the damage with a triggered action, your hero would take 4 damage
  before immunity is applied, with immunity then reducing the damage
  to 0."
- **Weakness before immunity — printed in the pin**
  (rule/damage/damage-weakness): "If a creature has both damage immunity
  and damage weakness for a source of damage, apply the weakness first,
  then the immunity."
- **Rolled damage sub-class** (Heroes p.74): "Certain effects talk about
  rolled damage […] If an ability or effect deals damage without
  requiring a power roll, that is not rolled damage, and effects that
  add to or are triggered by rolled damage don't apply."
- **Damage → Stamina direction** (Heroes p.277): "Whenever a creature
  takes damage, they reduce their Stamina (see below) by an amount equal
  to the damage taken." The converse is unwritten; the books print
  "Trigger: You lose Stamina and are not dying." (Furious Change) beside
  "Trigger: You take damage." (Unearthly Reflexes) on the same page
  (Heroes p.132).
- **Unconscious prevention — printed, unshipped, unruled**
  (rule/health/stamina §Unconscious): "While you are unconscious, you
  can't take main actions, maneuvers, triggered actions, free triggered
  actions, or free maneuvers" — R-0030 ruled and shipped only the dazed
  and surprised restrictions; this family adds the unconscious flag
  (§3 R-0045).
- **Placement exemplars** (PDF-confirmed EXACT or recorded in R-0031):
  rolled-point tier-cut — Tongue Slap (Monsters p.38); targeting-time
  retarget — Meat Shield (Monsters p.164; trigger "targets the monarch
  with a strike"); explicit-before — Testudo! ("before the damage is
  resolved", Monsters p.194); reroll — talent Again ("after seeing the
  result of the triggering roll. The target must reroll the power roll
  and use the new roll.", Heroes p.189); roll-modifier — conduit Word of
  Judgment ("**Effect:** The power roll takes a bane against the
  target.", trigger "The target would take damage from an ability that
  uses a power roll."), troubadour Turnabout Is Fair Play ("An edge on
  the triggering roll becomes a bane, or a double edge becomes an
  edge."); replacement trait — Breaking Point full lifecycle (Monsters
  p.312).
- **Confirmed silences** (Gate-2, PDF level): no rule for a trigger
  invalidated before resolution; none for declining a triggered action;
  none for a triggered action's own power roll timing.

## 2. Survey facts (v3 — deterministic; regexes in survey.json `method`)

- 246 triggered units (172 statblock features + 74 artifacts; 177
  triggered / 69 free-triggered). Zero empty triggers (statblock
  features whose structured effects omit the Trigger line — e.g.
  Devilish Charm — fall back to the feature's markdown section).
- Placement classes, per-clause multi-label: pre-application-halve
  **46** · roll-modifier **32** · retarget **12** · explicit-after
  **11** · rolled-tier-adjust **10** · explicit-before **4** · reroll
  **2** · derived-half-damage **1** (Feedback Loop — reflected damage,
  deliberately NOT a halve) · target-add **1** (Harmonize) · replacement
  **1** · residue **150**. Mixed-clause units (e.g. shadow Defensive
  Roll: halve now + shift after) carry multiple labels.
- Trigger-occurrence classes: targeted 83 · damage-taken 57 ·
  damage-dealt 43 · movement 40 · power-roll-made 22 · turn-boundary
  18 · zero-Stamina-or-death 16 · ability-used 14 · mechanism 6 ·
  winded 5 · condition-or-effect-gain 2 · Stamina-gain 2 · Stamina-loss
  1 · residue 11.
- Occurrence payload requirements measured: type-conditioned 38 ·
  roll-fact-conditioned 26 · amount/result-conditioned 5 ·
  counting/memory 2 · hidden-state 1 · reaction-meta 1 (Shieldbreaker
  Talisman consumes "the amount that was reduced").
- 42 units carry their own power roll (nesting per R-0032); 24 carry
  Spend/Malice rider lines; 5 multi-trigger units (frozen-pond,
  column-of-blades, throne-of-aan, gnoll-gnasher retainer feature, +1).

## 3. Gate-3 ruling candidates (R-0040..R-0045 — nothing auto-applies until accepted)

- **R-0040 — Occurrence records: classes, payloads, and the
  damage/Stamina-loss boundary.** The engine derives receipt-visible
  OCCURRENCE records from the committed claim stream after each
  dispatch and at boundary sweeps — id, class, and typed payload:
  amount, damage types, source facts (strike / melee / ranged /
  ability / uses-power-roll), roll facts (edges, banes, surges, tier
  outcome, crit), state transitions (winded, dying, dead, 0-Stamina,
  below-N thresholds), would-take vs applied, and the reduction delta
  for reaction-meta triggers. Detected classes: damage taken/dealt
  (with the printed rolled-damage sub-flag — a provenance field added
  to damage claims), Stamina loss, Stamina GAIN, winded (derivable:
  winded value is printed as half Stamina maximum), zero-Stamina/death,
  targeted, power-roll-made, ability-used, turn boundaries (from the
  sweep registry). Movement, trap mechanisms, counting/memory triggers
  ("two melee strikes in the current turn", "for the first time in the
  encounter"), hidden-state, and condition-gain stay table-asserted
  (their dispatches are the assertion). `use-triggered-action` gains an
  optional occurrence-id reference (an admitted schema addition — the
  shipped `{kind:'occurrence', intentId}` names a dispatch, and one
  dispatch emits many occurrences; a halver must name which target's
  instance it intercepts); the asserted path is unchanged. Proposed
  ruling on the confirmed silence: **"takes damage" and "loses Stamina"
  are DISTINCT classes**, matching the printed side-by-side vocabulary;
  a Stamina loss not produced by damage fires no damage-taken trigger;
  damage absorbed by temporary Stamina still fires ("Whenever you take
  damage while you have temporary Stamina…"); Bleeding's loss is a
  Stamina loss except where its own text says damage (the printed
  off-turn main-action case). Prior art cited on the card: the shipped
  engine already splits `applyDamage` from `loseStamina` with
  provenance-split Stamina claims — the proposal ratifies the committed
  boundary. Alternative if declined: every Stamina reduction fires
  damage-taken (rejected by the printed phrasings — stated).
- **R-0041 — The declared phase: a lifecycle home for the targeting
  point.** Prework first (zero behavior change): extract the `isOpen` /
  open-phase predicate to ONE home — "open" is currently hardcoded as
  `phase === 'rolled'` in six committed sites. Then: rolling abilities
  OPEN their entry at declaration in a phase-DISCRIMINATED shape —
  `declared` entries carry the asserted target list (area-shaped where
  printed: "Each ally in the area") and NO roll receipt; `rolled`
  entries carry the receipt (the committed required-receipt shape
  becomes the rolled arm of the union — a v6→v7 migration wrapping
  every existing entry as `rolled`, honest: structural, not additive).
  The `targeting` point fires at `declared`; rolling advances the
  entry, re-stamping the payload hash (declaration hash + roll hash
  both witnessed on the entry). Hosts pipeline declare→roll→commit as
  one tap (the R-0032 pipelining precedent). Adjudications stated on
  the card: (a) a still-`declared` entry at the owner's end-turn
  CANCELS with a receipt — nothing was rolled, so nothing commits and
  no printed damage is discarded; (b) the declared target list is
  asserted-and-MUTABLE: `retarget` edits it, a new `target-add`
  modification kind grows it (printed: Harmonize "The target can choose
  one additional target for the triggering ability"; Lachomp Tooth's
  tier-outcome adds arrive as target-adds at `rolled`), every edit
  hash-witnessed. Declared births and the declared→rolled transition
  get invariant claim coverage (named new work).
- **R-0042 — The halver class rides the printed damage-ordering
  chain.** The 46-unit halve class (v3 templates: active, passive, and
  gerund forms; Devilish Charm's tier-2 halves included) compiles to
  the `damage-halve` modification applied through the committed fold's
  `damageTransform` — which already runs before the damage pipeline,
  so the full printed chain is **halve → weakness → immunity**
  (weakness-first-then-immunity is printed in the pin; the p.277
  worked example is the golden). Gate-3 positions on the two real
  silences: (a) halve-vs-weakness relative order — proposed halve
  first (the modification applies to the ability's damage before the
  target's own damage math, matching the p.277 arithmetic shape);
  (b) two halvers on one instance — printed-legal (the simultaneous-
  trigger rule lets multiple react to one trigger), no half-of-half
  text and no general rounding rule exists — proposed: halves COMPOSE
  in dispatch order (half of half), each on the receipt, replacing the
  committed last-write-wins halve map; rounding position: fractions
  stand in receipts, application floors once at the end (declared
  position, not canon). The transform checks printed irreducibility
  ("This extra damage can't be reduced in any way") and refuses with a
  receipt. Scope honesty: Feedback Loop's "damage equal to half the
  triggering damage" is DERIVED damage, never a halve (survey class
  `derived-half-damage`, residue this arc); split-half (Trick of the
  Eye) automates the halve arm, the redirected remainder is a
  directive; ability-wide halves (Buss Buffe "halved for the
  cannonfall and each target also affected") apply per covered
  target's instance; regain-halves (Magic Siphon, Stolen Vitality)
  intercept a regain, not damage — directive this arc, named for the
  Stamina-gain interception future; duration-scoped halves are
  directives.
- **R-0043 — Roll modifiers, tier adjustment, reroll — the rolled/
  declared modification kinds.** THREE kinds: (1) NEW `roll-modifier`
  — impose an edge or bane (single or double) or TRANSFORM existing
  ones (Turnabout: "An edge on the triggering roll becomes a bane"),
  per-target scope (Word of Judgment's bane is "against the target"),
  hash-bound to the entry, applicable at `declared` (Devilish Charm's
  targeting-time bane — a next-roll grant is the wrong home: it isn't
  bound to the triggering entry and misfires if the striker re-declares)
  and at `rolled` (Word of Judgment triggers on "would take damage" —
  the roll exists; the fold re-evaluates tiers from receipt inputs +
  modifiers). (2) `tier-adjust` generalized: cut (Tongue Slap),
  INCREASE (Bloodstones "increases the outcome of the power roll by
  one tier"), and SET (Blessing and a Curse "obtains a tier 1 or tier
  3 outcome"); the same ability's future-roll opposite-outcome clause
  needs a tier-set grant payload — a named deferral to the grant
  substrate. (3) NEW `reroll` (Again; heist-hero title): the
  modification carries the replacement dice (host-rolled at dispatch);
  the stored receipt is IMMUTABLE — the fold recomputes preferring the
  reroll's dice, and prior tier-shifts re-fold over the new roll in
  dispatch order (adjudication stated). Compiled-shape change admitted:
  interception classification becomes PER-TIER (Devilish Charm's
  tier-1 retarget / tier-2 halve / tier-3 bane cannot live in one
  point-per-ability field) and the compiled shape carries triggerClass
  + the verbatim trigger line (the candidate-enumeration inputs).
- **R-0044 — Residue posture and the state-mutation escape surface.**
  For the 124 whole-to-table units: occurrence + economy + applied-
  default placement automate; the effect text rides the receipt
  verbatim as a table directive matching the action-cost residue shape
  (pending-audit-commit). The 10 grammar-compilable units execute
  through the shipped pipeline riding `assertedAbilityUse` (same
  pending marker). Grammar expansion is a NAMED future arc with the
  survey as its frozen work-list. **The escape surface is named:**
  residue effects that mutate engine-owned structured state cannot
  land through table corrections — each maps to a named forward-dep
  intent class, accounted on the card: summon/roster-add (An Army From
  Blood, Abyssal Protectors, Summon My Guard), squad-member transform
  (Feast — already the squad family's named forward-dep),
  replacement-with-forced-control (Tempting Offer), death-aversion
  (Feign Death), irrevocable death (Devour Soul), forced ability use
  (Word of Final Redemption). Until those intents exist their receipts
  carry the verbatim text AND the declared gap. Confirmed silences
  become declared known-unknowns by rule class: trigger invalidation
  is governed by commit-time state discipline (R-0032); declining is a
  non-event (permissive substrate).
- **R-0045 — Explicit placements + the unconscious prevention gap.**
  Per-clause placements (v3: 4 explicit-before, 11 explicit-after):
  before-clauses insert per their printed text (the stack's
  named-insertion exceptions); after-clauses land at applied; a
  mixed-clause unit (Defensive Roll: halve now, shift after) applies
  each clause at its own point. Replacement-class traits keep the
  action-economy posture (named point, full verbatim directive,
  automation deferred — Breaking Point's complete lifecycle recorded).
  **And the family closes a found canon gap:** the printed Unconscious
  restriction (quoted in §1) is in neither R-0030 nor the shipped
  prevention flags — this family adds the unconscious flag beside
  dazed/surprised, same warn-not-block posture, same escape-flag
  pierce-through. (Rev 1 claimed it shipped; it had not. This is the
  family's ONLY economy addition.)

## 4. Engine design (builds on landed v6 + the pending audit-fix batch; schema changes admitted: occurrence-id field, phase-discriminated v7 entry, canon compiled-shape per-tier fields)

- **Prework (zero behavior change):** extract the open-phase predicate
  (`isOpen(entry)`) to one home across the six committed call sites
  (engine resolution + sweeps + Convex views) BEFORE the phase union
  changes.
- **Occurrence derivation.** One home
  `deriveOccurrences(source: InterceptionPoint | BoundaryKind, claims)
  → OccurrenceRecord[]` running over the committed claim stream
  post-dispatch (the `collectClaimRows` walking precedent) — never
  per-call-site emission, so the claim vocabulary and the occurrence
  taxonomy cannot drift apart. Real named work: the rolled-damage
  provenance field on damage claims; occurrence ids stable across
  recompute (derived, ordinal-keyed like terrain factIds). The
  turn-scheduling family (fires off end-of-turn boundaries) and the
  malice family consume the same home.
- **Modification fold, extended not paralleled.** The committed fold in
  `commitResolutionEntry` already applies damage-halve / retarget /
  tier-adjust / downgrade / potency-adjust; this family adds
  `roll-modifier`, `reroll`, `target-add`, generalizes `tier-adjust`,
  and replaces the halve map's last-write-wins with dispatch-order
  composition + receipts. Adding kinds edits the fold's dispatch table
  in ONE module of per-kind pure functions — stated plainly; there is
  no separate registry, and building one beside the fold is the
  forbidden second home. The fold's per-target `damageTransform` is
  the seam the squad family's breakdown rows flow through (breakdown
  rows are fold INPUT; modifications never edit them directly —
  recorded in both families' notes).
- **Candidate enumeration (tier-2/3 surface).** Input = compiled
  holdings ∪ the grants registry (day-one malice-proofing), matched on
  the new compiled triggerClass; the view lists each candidate with
  its verbatim trigger line; one-tap dispatch carries the
  occurrence id. CLI verb `react`; web Table reaction prompts on the
  open-resolution card per phase; residue directives render like
  action-cost residue directives.
- **Goldens.** The p.277 printed example EXACT (8 fire, ally halves,
  immunity 5 → 0; without the halve → 3); halve → weakness → immunity
  chain against a weakness target (printed weakness-first rule);
  Tongue Slap tier-cut on a real statblock roll; Meat Shield retarget
  at `declared`; Word of Judgment per-target bane at `rolled`
  (re-evaluated tiers); Turnabout transform; Again reroll (receipt
  immutability + new-dice preference). E2E: declare → Meat Shield
  retargets → roll → Tongue Slap cuts a tier → Word of Judgment banes
  one target → commit → a halver fires pre-application → weakness →
  immunity last.

## 5. Deliberate scope cuts (tracked, not hidden)

- **Reaction-effect grammar expansion** (124 whole-to-table units) — a
  named future arc; survey v3 + coverage cross-tab are its frozen
  work-list.
- **State-mutating residue intents** (summon/roster-add, transform,
  forced-control, death-flags — §3 R-0044's named classes) — forward
  deps, not this arc.
- **Spend/Malice riders** (24 units) — heroic-resource and malice
  families; verbatim on receipts meanwhile.
- **Granting triggered actions** — deferred to the malice family
  (`ActionGrant.cost` budget-constrained, pending-audit-commit).
- **Replacement automation** (Breaking Point, Tempting Offer's
  in-family variant, giant zombie…) — named point + full-verbatim
  directives; unchanged deferral.
- **Regain interception** (Magic Siphon, Stolen Vitality's
  halve-and-steal) — named future beside the Stamina-gain occurrence
  class; directives meanwhile.
- **Movement / trap-mechanism / counting-memory / hidden-state
  occurrence detection** — table-asserted (no map substrate; no
  encounter-memory substrate beyond abilityUses).
- **Tier-set grants on future rolls** (Blessing and a Curse's second
  clause) — grant-substrate deferral, named.
- **Forced-movement reduction arms** (Repel) — table directive.
- **Simultaneous-trigger ordering UI** — printed table procedure;
  engine accepts any dispatch order.
