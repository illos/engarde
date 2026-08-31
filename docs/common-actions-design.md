# Common Actions — one slice, seventeen actions

> **LEAD CORRECTION (verified 2026-08-29, before adoption).** This document's
> `W0-a` — the claim that §Assist a Test, §Hiding and §Searching for Hidden
> Creatures are "not pinned artifacts" — is **FALSE**, and every dependency on
> it below is void. The cross-cutting agent checked only
> `.artifacts/canon/bundles/` (structured per-file bundles) and missed
> `.artifacts/canon/campaign/accepted/`, where the chapter bundles live. All
> four sections are pinned artifacts in `heroes--tests.bundle.json` with text
> and version hashes:
>
> | artifact | bytes | version |
> | --- | ---: | --- |
> | `mcdm.heroes.v1/chapter/tests#assist-a-test` | 2,327 | `e00f76346bfc` |
> | `mcdm.heroes.v1/chapter/tests#hiding` | 3,171 | `eca32ae1a77f` |
> | `mcdm.heroes.v1/chapter/tests#hide-and-sneak` | 230 | `0234abb35658` |
> | `mcdm.heroes.v1/chapter/tests#searching-for-hidden-creatures` | 2,000 | `7087fb19f626` |
>
> **Consequence:** W0-a is struck. Waves 9, 10 and 11 (Make or Assist a Test,
> Hide, Search for Hidden Creatures) are NOT pipeline-blocked, and there is no
> unversioned-provenance risk — those specs quote pinned, hashed canon. The
> remaining W0 rulings (size ordering, the occurrence mapping, grant windows)
> stand and were independently spot-checked.
>
> Three other load-bearing claims WERE verified true: `spatialFacts` has zero
> readers (one declaration hit repo-wide); the Area-keyword membership test is
> inlined six times exactly as listed; `size` and `stability` do not exist on
> `ParticipantStatsSchema`.



> **IMPLEMENTATION STATUS (2026-08-31).** **Waves 1–4 are SHIPPED** —
> S2 + S3 (prose-feature program source + dispatch-supplied cost),
> S1 (`use-common-action` over one factored resolution dispatch path),
> S4 + S5 + S14 (eligibility-gate registry, asserted-fact reader, offer
> surface), and the four wave-4 arms (Advance, Ride, Catch Breath, Free
> Strike). ROAD-0005 seam #3 (the per-actor allow/exclude slot) landed with
> S14. Waves 5–13 are unbuilt.
>
> Four things this document says that implementation corrected or decided:
>
> 1. **S17's premise is FALSE.** `ability-used` does NOT require a non-null
>    `resolutionId` — the schema field is nullable and the nonrolling
>    application claim already derives the occurrence that way. The real
>    question is a vocabulary one (should a common action fire the printed
>    trigger word "ability"?), and the answer shipped as **no**: the arm
>    emits no nonrolling claim, so no `ability-used` fires for Advance. The
>    dedicated arm + the W0-c mapping ruling still stand as W10 work.
> 2. **§4 item 4 (Ride vs Disengage double-debit) is decided: route (a).**
>    The mount's free triggered Disengage is debited *inside* the arm, and
>    it is compiled DATA, not a per-action branch — the alternative carries
>    a `targetAction {artifactId, actionCost}` read from its own printed
>    sentence and proved against those bytes. A host must not also dispatch
>    `use-triggered-action` for the mount.
> 3. **The shared pre-combat posture is the permissive one** (Advance §9):
>    `turnState === null` skips the debit, emits the directive, and refuses
>    nothing. Picked once, for all 17.
> 4. **The debit contract covers four actions, not one.** Free Strike is
>    joined by Grab, Escape Grab and Knockback, whose prose hands off
>    verbatim ("using the following ability") to a companion carrying the
>    printed cell — and those three are *exactly* the three of the 17 whose
>    prose never prints its own group's cost words. The compiler enforces
>    that correspondence.

**Status:** waves 1–4 shipped; waves 5–13 designed, not authorized. **Inputs:** the 17 specs under
`.artifacts/canon/common-actions-spec/specs/`, `SUBSTRATE-BRIEF.md`, and three
cross-cutting analyses (shared substrate, duplication audit, asserted-fact
vocabulary). **Repo:** `../engarde`. **Related:** DEC-0011 (spatial belongs to
the VTT plug-in), DEC-0013 (aim at a playable session), CONV-0004, GOTCHA-0009.

---

## 1. What this slice delivers, and what it deliberately does not

This is **one slice**: *common-action substrate*. It makes all 17
`feature.common.*` actions dispatchable, debited, receipted and observable
through a **single code path**, then ships them in 13 waves behind that path. It
delivers a prose-feature program source in `packages/canon` (the 17 headerless
artifacts compiled to a dispatchable envelope), a dispatch-supplied `actionCost`
with a group-directory default, one `use-common-action` reducer arm that is a
thin caller into a shared preamble factored out of `executeUseEffect`, a
printed-eligibility gate registry, a **reader** for the already-declared-but-
never-read `spatialFacts`, a per-turn action menu that can offer a compiled
companion ability, and then the per-action arms in dependency order.

It deliberately does **not** deliver: any geometry, distance, path, speed or
terrain-containment model (DEC-0011 — no `speed`, no `disengageBonus`, no
distance fact); a durable consumable-charge ledger (campaign-layer, not engine);
slam damage on forced movement (blocked on a boundary ruling); a skill model or
a skill-bonus constant (character-builder substrate dispatched from the wrong
direction); a `moved` occurrence arm (named, flagged, deferred until a reaction
actually keys off movement); and **any answer to the printed silences in §6** —
those go to the user as canon rulings and none is answered here. It also does
not ship Hide's reveal sweep until W0-c settles the occurrence mapping, and it
does not claim Hide is maintainable until §7's asserted-fact staleness decision
is made. The Assist, Hiding, and Searching sections are already pinned;
provenance is not a blocker for waves 9–11.

**The defect this slice exists to prevent.** Individually the 17 specs are
substrate-honest — nine state outright that they need no action-specific
substrate, and deduplicated they propose ~20 shared items against ~5 genuinely
per-action pieces of code. The defect is the thing no single spec could see:
they collectively propose **four competing dispatch surfaces** for one family
(`use-common-action`, `use-effect` with a synthesized program, `remove-condition`
+ asserted band, and `use-ability`/`apply-damage`). Five cross-cutting concerns —
the cost debit, the printed-eligibility gate, the asserted-fact check, the
pre-combat posture, and `partOf` composition — would then be implemented once
per surface. That is the Glowing Eyes shape at 4x, invisible in each spec
because each one is locally correct.

---

## 2. Shared substrate, in dependency order

Each item names its **second implementer**, per prime directive #2. Items are
numbered by the shared-substrate analysis (S*n*); wave numbers are §3.

### Wave 0 — rulings that change substrate SHAPE (human, blocking)

These are not code. Each gates a shape, not a field value.

| # | Ruling | Why it precedes code |
|---|---|---|
| **W0-a** | The `chapter/tests` pipeline gap — §Assist a Test / §Hiding / §Searching for Hidden Creatures are **[STRUCK — see Lead Correction; they ARE pinned in `heroes--tests.bundle.json`]**. | Not one action's problem: it is the source for three of the 17. Any of them shipped from raw `.reference` bytes creates a second, unversioned provenance path beside the pinned one. |
| **W0-b** | The `size` ordering type — the printed total order plus the *irregular size* object case. | Grab S7 / Escape Grab S6 / Knockback K9 are one question. Whichever spec lands first without it types size as a number and the other two are silently wrong on the ordering. The deferral ring between the three specs is already correct; only the ruling is missing. |
| **W0-c** | The printed-word-to-occurrence mapping for *"If you use an ability."* | The engine's occurrence vocabulary fires for `use-ability` **and** `use-effect` — strictly broader than the printed word. Without it, Hide's reveal sweep un-hides a creature for taking Catch Breath, Stand Up, or Hide itself. Gates the **sweep** only; the occurrence **arm** (S17) is unblocked. |
| **W0-d** | The grant participant-restriction vocabulary — one ruling covering `consumer`, `versus` and `qualifier`. | All three land in the same ~30-line predicate family, and two of the three specs nominate the *same* corpus rule as their own field's second implementer. Nothing reads a condition as a modifier today, so whichever ships first implements that family and the losers still look unbuilt. |

### Wave 1 — S2 + S3, one commit

**S2 · Prose-feature program source in `packages/canon`.** The 17 headerless
artifacts compiled to a dispatchable envelope: verbatim `sourceText` + byte span
+ `canonRefs`, a group-directory→`ActionCost` default, a **provenance
discriminator** so a prose feature is never labelled as an `**Effect:**` line,
and the existing `ONCE_PER_ROUND` matcher extended to iterate prose-feature text
(today it iterates ability-header clauses only).
*Second implementer:* Heal, Catch Breath and Charge each independently named this
item — the count must be one, not three. The cap half fails its own test if built
as a boolean: Ride prints two cap sentences with **different subjects**, so the
compiled shape must carry a per-subject record or the mount-side counter loses
its provenance.

**S3 · `actionCost` as a dispatch-supplied override,** with the group-directory
value recorded as the default; the receipt carries default + effective +
`costSource`.
*Second implementer:* shipping S2's map alone is the live conflict. Make-or-Assist
prints three costs and hands the choice to the Director; two class features print
Disengage at a free triggered action; one prints Hide at a free maneuver; one
prints Knockback at a free maneuver; 4 of 35 consumables print a non-maneuver
cost; free strikes are reached off-turn. Defaulting to the group value is right
31 times and **silently wrong 4 times**. The field exists on day one or it is
retrofitted four times.

### Wave 2 — S1

**S1 · One common-action dispatch path.** Factor `executeUseEffect` into a shared
**preamble** + an `applyResolution(...)` executor; add `use-common-action` as a
thin arm over that preamble; route all 17 through it. The preamble runs
participant refusals, the eligibility-gate registry, `debitActionCost`, the
verbatim table-directive **via the existing emitter** (`effect-execution.ts:634-647`),
and the occurrence claim. Per-action behaviour is an optional `EffectResolution`.
Pick the pre-combat posture (`turnState === null`) **once**, for all 17.
*Second implementer:* #1 is Advance (~15 lines, zero per-action code). #2 is Ride,
and it is the real test — two payers, two costs, two independently-subjected
per-round caps, and a `sharesAbilityUse` requirement Advance cannot surface.

### Wave 3 — S4, S5, S14 (preamble + offer surface)

**S4 · Printed-eligibility-precondition gate registry.**
`{ actionArtifactId, holds(state, actorId, payload) => true | false | 'unknown', verbatim, canonRefs }`,
evaluated in the preamble **before** the debit, emitting a warning that quotes the
printed sentence and **never** short-circuiting. Eight of the 17 register.
*Second implementer:* Disengage proves the shape — `slowed` prints a bar on the
**movement** and never names Disengage, so a registration must be allowed to cite
a rule that never mentions the action. Stand Up proves the second constraint —
`restrained` bars the restrained creature from **using** Stand Up and says nothing
about being the **target** of an ally's, so the gate keys on the *role in the
dispatch*. The tri-state is not optional: five of the eight read table-asserted
facts.

**S5 · The asserted-fact READER** (not new enum members) — see §5.

**S14 · A per-turn action menu that can offer a compiled companion ability,**
with a per-entry availability predicate.
*Second implementer:* Stand Up shapes the predicate (availability is a condition
membership test, so the menu takes a predicate per entry or each action bolts a
gate into the UI). Free Strike adds the double-debit constraint: its arm must be
**behaviourally empty** — directive, no debit — because its child carries the
printed cost, while Charge's arm debits and its child composes via `partOf`.

### Later shared items (each lands with the wave that needs it)

| Item | Lands | Second-implementer justification (compressed) |
|---|---|---|
| **S15** `hasKeyword` / `isAreaAbility` | W5 | Measured duplication at **six** sites today. Charge would add a 7th, Hide an 8th. Convert all six in the same commit — a partial extraction leaves seven homes, one of them looking canonical. |
| **S12** condition-REMOVAL in the tier/resolution vocabulary | W6 | 13 measured pinned files carry a *"no longer X"* clause. Ship the **shape** only; instance selection stays dispatch-supplied until the multi-instance ruling. |
| **S11** `assertedAbilityUse` on `remove-condition` | W6 | `apply-condition` and `apply-damage` carry it; `remove-condition` does not. Two hard constraints: mutual exclusion with the existing imposer free-maneuver debit (a real dispatch satisfies both, and the costs differ), and the unknown-instance refusal **hoisted above** the debit. |
| **S10** `resolveSavingThrow` extraction + `saving-throw` resolution member | W7 | The only saving-throw site loops every instance at end of turn; Heal needs a single named instance and there is no entry point. Corpus family: 232 + 29 pinned files. Shape it as the exact sibling of `recoverySpends`. Leave the modifier surface a **named but unfilled** slot. |
| **S6** `standing` grant kind + `standingContribution` | W8 | #1 Defend, #2 Hide, #3–#8 the six unimplemented printed conditions — each a **pure data row**, zero new lifecycle code. No condition contributes a modifier anywhere in the engine today. Reads rather than consumes, so declare→roll→commit is idempotent over it. |
| **S7** the matching predicate extended **once** | W8 | Three specs independently propose the same new scope member. `versus` and `qualifier` must **not** collapse — one printed condition needs both. Every new caller-supplied field is **required**, never optional-with-default, or a caller that omits one matches silently wrong. |
| **S8** the **anchored** grant window + `startOfTurnGrantSweep` | W8 | Already failed once on paper. Defend's holder-only case is the anchored case with a null anchor; a holder-only sweep never expires an anchored grant and reads correct on every Defend test. The sweep scans **every** participant. Registry-shaped: no handler edit. |
| **S9** `rollTest(...)` extraction + `targetId`→`rollerId` rename | W9 | Search runs the identical body N+1 times. Must **not** carry the reactive-test canon refs or statblock skill prohibitions — a copy-paste imports exactly the wrong refs. Forward: montage, group tests, downtime, negotiation. |
| **S20** `TEST_DIFFICULTY_OUTCOMES` / `outcomeForTest` / `isSuccess` | W9 | Only one of the 17 needs it — which is why it must not live in that arm; its second implementers are every ordinary test in the game. Tier bands stay where they are; the table supplies **labels only**. Convert the already-inlined outcome string in the same commit. |
| **S18** `hiddenFrom` directed fact set + `clear-hidden-fact` | W10 | Implementer #2 supplies the proof: Hide writes `(self→observer)`; Search erases along **two** axes in one dispatch, including for allies who made no roll. A participant-local field cannot express the second. Filing it as a condition would import save-ends, immunity and stacking the text never grants, and would invert a documented field's meaning. |
| **S17** `common-action-used` occurrence arm | W10 | `ability-used` requires a non-null `resolutionId`, so a common-action dispatch is currently **invisible** to printed triggers. Three real corpus consumers already exist. Arm unblocked; sweep blocked on W0-c — do not conflate. |
| **S19** `resolveOpposedPowerRoll` + `OPPOSED_DOUBLE_MODIFIER` | W11 | The one genuinely **new** rules math in all 17 specs. The wrapper *calls* `resolvePowerRoll` and reads its net edge/bane; it never recomputes the cap. Same commit: the `roll-made` tier-nullability fix, or an opposed roll publishes a tier the printed rule says does not exist. |
| **S13** `size` + `stability` as stored stats, two bounded grammar extensions, generic *"only one X at a time"* cap | W12 | Printed on 526 stat-block files, parsed by neither canon nor engine. The concurrency cap's measured second implementers are four unrelated corpus features — which is why a bespoke grab-cap constant must not be built. |
| **S16** `moved` occurrence arm + `manner` discriminator | **deferred** | The canonical printed movement trigger discriminates two of the four movement actions on exactly one word, so an arm without `manner` gets forked on first use. Naming the home stops four specs inventing one. All four movement actions ship without it. |

---

## 3. Implementation waves

Two of the 17 — **Free Strike** and **Catch Breath** — are on the measured
critical path for a playable session (there is no hero free strike today; Catch
Breath appears in **zero** engine files). They are pulled into **wave 4**.

| Wave | Ships | Unblocks |
|---|---|---|
| **0** | — | 3 shape rulings to the user. W0-b blocks W12; W0-c blocks Hide's sweep; W0-d precedes W8. W1–W11 can otherwise proceed in dependency order; W0-a is struck. |
| **1** | — | **S2 + S3 in one commit.** Nothing dispatches without it. |
| **2** | — | **S1.** Collapses four dispatch surfaces to one. Unblocks all 17 arms. |
| **3** | — | **S4 + S5 + S14.** All three become unbuildable-once the moment a second arm exists. |
| **4** | **Advance → Ride → Catch Breath → Free Strike** | **The proof wave and the critical path.** Advance is the ~15-line proof. Ride immediately second as the second-implementer test. Then the two critical-path actions: Catch Breath is a program literal + one gate registration; Free Strike's arm is behaviourally **empty** — its compiled companions already ride the whole existing pipeline and the menu was the entire gap. |
| **5** | **Disengage, Charge, Knockback** | S15 first (extract, convert all six sites, one commit). Charge's residue is a two-line keyword disjunction *inside* the shared arm, never an export. Knockback ships with the receipt correction applied to **both** existing forced-movement emitters, consolidated; its size gate rides the S5 asserted surface until W12. |
| **6** | **Stand Up** | S12 + S11. Unblocks Heal branch B, Escape Grab's top tier, and 13 corpus files. |
| **7** | **Heal** | S10. Unblocks the 232-file save-ends corpus family. |
| **8** | **Defend → Aid Attack** | **The grant substrate as ONE commit:** S6 + S7 + S8. Defend with a null anchor; Aid Attack proves consumer + anchor. Then the **six unimplemented printed conditions land as pure data rows** — the largest single yield in the slice, and the test that the substrate is done. Requires W0-d. |
| **9** | **Make or Assist a Test** | S9 + S20. Unblocks montage, group tests, downtime, negotiation. Both halves use pinned chapter artifacts. |
| **10** | **Hide** | S18 + S17 + the three spatial members. Sweep is blocked on W0-c; whole action is gated on the staleness decision (§7), not provenance. |
| **11** | **Search for Hidden Creatures** | S19. Blocked on W10 — Search is the eraser, Hide the writer. Its source section is pinned. |
| **12** | **Grab → Escape Grab** | S13 + the two grammar extensions + the concurrency cap. Requires W0-b. Retroactively upgrades Knockback's size gate and grabbed's speed clause from asserted to engine-known. |
| **13** | **Use Consumable** | Nothing. Rides S1 + S3, hands off via `partOf`; the charge ledger is campaign-layer. Ships last on purpose. |
| **14** | — | S16, deferred until a reaction actually keys off movement. |

---

## 4. Must fix before implementation

Ordered by severity. A wrong pick in the first five **fails silently**.

1. **HIGH · Grant restriction vocabulary — three rival mechanisms for one rule.**
   Aid Attack proposes `consumer`, Hide `versus`, Defend a `qualifier` enum;
   two of them nominate the **same** corpus rule as their own field's second
   implementer, and one asserts "ship both" without having read the other's
   proposal. Home: `grant-lifecycle.ts:97`, whose own comment calls the binding
   *"the seam."* **Fix:** rule once (W0-d), then extend the **one** predicate with
   all agreed fields in one commit (S7). No local membership test in any arm.
2. **HIGH · Two homes for the common-action debit-and-receipt.** Seven specs
   propose a new arm with its own `debitActionCost` and its own directive
   builder; five route the identical shape through `use-effect`, which already
   does exactly that pair (`effect-execution.ts:332-360`, `:634-646`). Only the
   Disengage spec names it. **Fix:** S1 — the new arm is a *thin caller* into the
   existing emitter; strike the second-builder idea from every spec.
3. **HIGH · Two incompatible start-of-turn expiry mechanisms.** Holder-only
   (Defend) vs anchored (Aid Attack); only one flags the conflict. A holder-only
   sweep silently never expires an anchored grant. Home:
   `grant-lifecycle.ts:191-213`. **Fix:** build the anchored form only (S8);
   Defend passes null.
4. **HIGH · Ride and Disengage both own the mount's free-triggered Disengage.**
   Following both debits the mount twice and double-increments the per-ability
   counter (`action-economy.ts:286-296`). Ride's double-debit warning is scoped
   only to a *separate* triggered-action dispatch and never considers a Disengage
   common-action dispatch. **Fix:** pick one route before W4 ships Ride; write
   the payer-of-record into the arm, not into a test.
5. **HIGH · The shared arm carries opposite debit contracts,** discriminated only
   by `featureArtifactId` (Charge debits; Free Strike must not). `partOf` is an
   opaque string the pure reducer never dereferences
   (`action-economy.ts:319-331`), so a wrong contract silently skips a debit.
   Five further specs describe the same hazard with five non-normative
   mitigations. **Fix:** make the contract a **required field on the compiled
   envelope** (S2), not a per-arm convention.
6. **MEDIUM · Two homes and two packages for action-cost derivation.** Four specs
   compile from the group directory as the sole source; five require a
   dispatch-supplied cost. Two specs site "the map" in different packages, both
   described as *"beside `normalizeActionCostValue`"* —
   `packages/engine/src/action-cost.ts:40` vs
   `packages/canon/src/action-cost.ts:148`. **Fix:** S3 — one compile-time home in
   `packages/canon`, one dispatch override, receipt records both + `costSource`.
7. **MEDIUM · A correctness bug in a spec.** Search's opposed wrapper derives its
   flat modifier from `automaticOutcomeApplied`, which is an **absolute tier**
   (`power-roll.ts:81`, step 7 at `:139-148`), not a delta; the printed "tier
   increase" it means is the double-edge step the spec's own table already maps
   one row above (step 5, `:128-133`). As written it adds a fabricated modifier to
   any opposed roll carrying an automatic outcome, and double-counts a roll with
   both — **inside the wrapper written to keep that modifier in one home.** Fix
   the spec before W11.
8. **MEDIUM · Two overlapping consolidations of one inlined keyword test.** One
   spec asks for a generic helper, another for a specific Area helper and counts
   three sites; measured, it is **six** (plus a Strike variant). **Fix:** S15 —
   one generic helper, all six converted in the same commit; the Area helper, if
   kept, calls into it.
9. **MEDIUM · Printed condition clauses partitioned into two rival mechanisms.**
   The same printed clause is claimed by the standing-grant proposal, the `versus`
   proposal, **and** a proposed "condition-effect registry." Nothing reads a
   condition as a modifier today, so the loser still looks unbuilt. **Fix:** the
   six conditions ship as **data rows** on S6 in W8; no registry is built.
10. **MEDIUM · Four specs extend one matching predicate with four vocabularies in
    one pass** (`grant-lifecycle.ts:73`), three of them independently proposing
    the *same* new scope member. The hazard is the roll input growing
    caller-supplied fields from two authors. **Fix:** extend once (S7); every new
    caller-supplied field **required**.
11. **LOW · Two specs restate arithmetic they say they reuse** (the recovery-value
    formula in prose; the edge/bane cap value in a body). This is the
    specs-as-rule-authority vector `pnpm spec-prose-audit` exists to close.
    **Fix:** strike the arithmetic; reference the canon slug and symbol name.
12. **LOW · The forced-movement receipt already has two byte-similar emitters**
    (`ability-execution.ts:350-359`, `squad-actions.ts:745-753`) and Knockback's
    fix **edits both**, so they can diverge on the very sentence added to stop a
    wrong number reading as authoritative. **Fix:** consolidate into one shared
    receipt builder in the same commit as the message correction (W5).
13. **LOW · The two specs that jointly own the `No effect.` grammar change publish
    different conformance targets** (5 lines vs 24). An implementer working from
    the smaller one freezes against 5 and leaves 19 refusing. **Fix:** one grammar
    change, frozen at 24, in W12; the sentence-form condition application
    **extends** the existing closed matcher at `effect-grammar.ts:208` — never a
    rival matcher.

---

## 5. Asserted-fact vocabulary — the schema change, in prose

**The headline outranks the schema change.** `SpatialFactSchema` is declared at
`packages/engine/src/schemas.ts:1078` and referenced on the intent envelope at
`:1384`, and grep across the monorepo returns **exactly those two hits — zero
readers.** Adding members to an enum nothing reads adds zero capability. The first
unit of work (S5, wave 3) is a shared **reader** that warns — never gates, per
the permissive-engine rule — when a printed precondition's fact is absent or
contradicted. Six of the 17 specs independently rediscovered this. Land the
reader once, or the 17 each ship their own adjacency check.

**The change.** The fact enum grows **two members to five**. All three additions
are directed participant-pair predicates in the existing shape; all three serve
exactly **one** action (Hide) and are forced by one printed sentence requiring
cover or concealment from a creature who is not observing you.

- **`observing`** — *"a is observing b."* Asserted by the Director, with printed
  finality. Explicitly **not** derivable from line of effect: the books sever the
  two themselves in the sidebar on what it means to be observed.
- **`cover`** — *"a has cover from b."* A map plug-in may *propose* it (this is
  the one genuinely geometric member) but the assertion stays the Director's, and
  the engine must accept it identically from either source.
- **`concealment`** — *"a has concealment from b."* Kept separate from cover
  because they are two printed words with two different banes elsewhere, and
  because the corpus **waives them independently**: one shadow ability waives
  observation while still requiring cover or concealment; another waives both. A
  merged fact cannot express the first.

Table burden per Hide: **two assertions per named observer**, both printed
preconditions, neither removable.

**Separately, and not on `SpatialFactSchema`:** one shared **`willing`** consent
field on the common-action payload, shaped as *the subject consenting to the
actor*. This is the weakest item here and is flagged rather than smuggled —
nothing reads it and the engine is warn-not-block, so on the strictest reading it
is a receipt field. It earns its place on one argument: **the assertor is the
subject's controller, not the acting player**, and a boolean the actor ticks on
their own payload misrepresents who consented. It must be **one** field shared by
Stand Up, Use Consumable and Ride's mount, or those three diverge on whether null
means not-asserted or asserted-false. Widening `SpatialFactSchema` to carry
consent is the first crack in the vocabulary.

**Refused, each with its reason.**

- **No distance or within-N fact.** Only two clauses want one, and in both the
  dispatcher already names the participants — selection **is** the assertion, and
  the printed clause goes verbatim into the receipt. A numeric distance would make
  a human count squares to tell the engine something it will never act on.
- **No `speed` / `size` / `stability` / `disengageBonus` on `SpatialFactSchema`.**
  Per-participant stats, structurally not pair predicates. Size and stability
  become stored stats in W12; speed and disengage bonus are not built at all.
- **No path, straight-line, or terrain-containment fact.** Nothing in engine state
  can be true or false about them.
- **No ally/enemy fact class.** Expressible as a participant-id list on the
  payload or stored on the grant — and **explicitly not** derivable from
  `sideOfParticipant`, because the printed side rule admits same-side-but-mutually-
  hostile. Conflating them is invented rule content wearing an existing helper's
  name.
- **No mounted-on relation, movement-mode fact, object-participant kind, or
  "benefits the user" tag.** Each is blocked on a ruling or a stat, never on
  vocabulary.

**A correction to the brief's premise:** by printed text **fourteen** of the 17
carry a spatial clause, not ten; exactly three print none (Defend, Catch Breath,
Make or Assist). The undercount does not change the answer — thirteen of the
fourteen resolve to the existing `adjacent`, the existing `line-of-effect`, a
number the actor states, or a participant the dispatcher names. The spatial
surface is **wide and shallow, and it converges on one action.**

**Sequencing:** reader in W3; the twelve actions needing no new member across
W4–W9 and W12–W13; the three members in W10 with Hide, and **only after** the
user answers the staleness question in §7.

---

## 6. Silences — consolidated, deduplicated, unanswered

These are canon rulings for the user. **None is answered here.** Bracketed tags
are the originating spec items. Where two or more specs ask the same question it
is marked **ONE ruling**.

### 6.1 Movement family — Advance / Disengage / Ride / Charge

- Is a **zero-distance** move legal, and does it still consume the action?
  [Advance S1, Disengage S7, Ride S10, Charge S1+S9 — **ONE ruling**]
- Should the engine accept **segmented** dispatches at all, or must the break-up
  stay narrative — and does the permission extend past the two things named (a
  maneuver and a main action) to a free maneuver, a triggered action, or a
  converted second move action? [Advance S2+S3+S8, Disengage S6, Ride S6, Charge S2]
- When movement is **interrupted**, is the remainder forfeit or the whole action?
  [Advance S7, Charge S3, Ride S9]
- May a move action be taken **twice on a turn without conversion**?
  [Advance S4, Disengage S8 — **ONE ruling**]
- Which **movement mode** does Advance use, and what if the mover has none
  available? Charge enumerates modes; Advance does not. [Advance S5]
- What happens at **speed 0** or under a movement-constraining condition?
  [Advance S6, Ride S11, Disengage S4]

### 6.2 Disengage

- May a **slowed** creature *take* the action at all — slowed bars the movement,
  not the action; untakeable, or takeable and wasted? [S1]
- Do disengage **distance bonuses stack**? The printed additive rule is scoped to
  power rolls, and a shift distance is not one. [S2]
- Does the general **shift-to-move swap** apply, and is it a dispatch-time choice
  the engine records or purely a table matter? The consequence is large — a
  swapped Disengage is a *move*. [S3]
- Do **grabbed / restrained** (both printed as speed 0, neither printed as
  "can't shift") bar the flat 1-square shift? [S4]

### 6.3 Ride

- Does the **mount spend its own move action** in branch A? Named the single
  highest-value ruling in that spec. [S1]
- Are the **two printed caps** one limit from both ends, or two counters? The
  compiled shape cannot be written until this is ruled. [S2]
- Does **branch B tick the mount-side counter**, when the mount *uses* an action
  rather than having one applied to it? [S3]
- **One rider, two mounts** — or one mount, two riders? Neither sentence
  addresses the cross case. [S4]
- **Whose Disengage modifiers** apply in branch B? [Ride S5, Disengage S5]
- Ride's break-up sentence names only the **rider's** maneuver and main action,
  narrower than its siblings'. Meaningful or incidental? [S6]
- Cap vs a **converted second move action**? [S7]
- Ride dispatched **while not mounted**: action spent, or void? [S8]

### 6.4 Charge

- Must the strike target be a creature the charger **ended adjacent to**, or
  merely a target at the end of the move? [S4]
- Is a Charge-keyword ability's **own printed cost** additionally paid? The engine
  already answers *no* via `partOf`; the **artifact** is silent, so this is Gate-3
  confirmation of already-shipped behaviour. [S5]
- Is a Charge-keyword ability whose printed cost is **not a main action** usable
  via Charge, and what becomes of its cost? [S6]
- Does the shift prohibition forbid shifting **anywhere on that turn**, or only
  during the Charge movement? [S7]
- May the substitute ability **target more creatures** than the one Charge names?
  [S8]

### 6.5 Free Strike — the blocking one first

- **The §Free Strikes section was not supplied** with the artifact set and the
  spec was written without it; it presumably answers the next four. **Nothing may
  be implemented from this artifact until that section is read.** [S1]
- Which abilities **count** as a free strike? [S2]
- May the striker **choose freely** between melee and ranged? [S3]
- Is an **off-turn** free strike *this* main action at all, or a distinct route
  using the same ability? [S4]
- Is the **Director-creature discriminator** the engine's participant kind? A
  Director-controlled *ally* is the case that would prove it wrong. [S5]
- Is a free strike **capped** per turn or round? [S9]
- Does the advisory sentence about preferring more impactful main actions carry
  **mechanical weight**? [S10]
- The Director-creature **keyword and damage-type inheritance** belongs to a
  separate monsters artifact and needs its own Gate 3; until then that path's
  damage type is dispatch-asserted or omitted, never derived. [S8]

### 6.6 Recovery family — Heal / Catch Breath / Use Consumable (rule together)

- **How much Stamina Heal restores.** Heal prints no amount, and the generic
  recovery rule pins its value to *Catch Breath*, not to Heal. Needs Gate-3
  confirmation that Heal inherits the generic offer semantics. [Heal S1]
- Who **chooses the branch**, and may the healer pre-commit one? [Heal S2]
- May the healer **target themself**? [Heal S4]
- May the target **decline both** branches, so the action is spent for nothing?
  [Heal S5]
- May Heal target a creature with **no Recoveries and no save-ends effect** — a
  Heal that can do nothing? [Heal S11]
- Does the **target's half cost the target anything**?
  [Heal S10, Stand Up S2, Use Consumable S5 — **ONE ruling**]
- May a creature with **zero Recoveries take Catch Breath at all**? Under the
  current execution order the maneuver is debited *before* the zero-Recoveries
  branch runs, so the creature loses the maneuver and gains nothing. [CB S1]
- Is the printed **dying prohibition** — printed twice, unusually absolute for
  this corpus — a hard bar or an adjudicable one, and does a blocked attempt still
  cost the maneuver? [CB S2, CB S3]
- What are the **"other ways"** other creatures may help a dying creature spend
  Recoveries? Heal is the obvious candidate but the phrasings are not identical;
  **do not wire a cross-reference on that sentence.**
  [CB S4, Heal S9, Use Consumable S4 — **ONE ruling**]
- May **more than one Recovery** be spent per turn via Catch Breath? [CB S6]
- Is the regain **clamped** at Stamina maximum by *this* action? [CB S8]
- May an **unconscious** creature use Catch Breath? [CB S9]
- Does **temporary Stamina** interact? [CB S10]
- Do **Director-controlled creatures** use Catch Breath / receive Heal, given they
  are printed as not having Recoveries — does the existing conversion ruling, made
  for *offered* spends, extend to a Director creature *electing* the maneuver?
  [CB S5, Heal S12 — **ONE ruling**]
- **DECISION POINT, not a silence:** offer vs mandate on `spend-recovery`. Heal
  prints *"can spend"*; Catch Breath prints *"spends."* Either the Catch Breath
  program always dispatches an accept (zero code, an always-true field on the
  wire) or a mandatory flag lands on the resolution. **Not the agent's to pick.**
  Either way the hardcoded *"offered by … Effect"* reason string must be
  parameterized — it is wrong twice for a prose action.

### 6.7 Heal, saving-throw branch

- Does branch B's save **replace or supplement** the ordinary end-of-turn save
  against that same instance? [S6]
- May branch B target an instance **imposed this turn**? The engine's skip rule is
  an end-turn design decision; Heal is not an end-turn event. [S7]
- Do the target's **saving-throw modifiers** apply? The corpus prints at least two
  forms; Heal is silent and so is the engine, which has no such surface. [S8]
- Does *"employs medicine or inspiring words"* impose any **requirement**, or is it
  flavour? Read as flavour; the reading is a ruling. [S13]

### 6.8 Grant windows and stacking — Defend / Aid Attack / Hide

- *"Until the start of their next turn"* for the **21 solo statblocks that take two
  turns per round**: next turn **slot**, or next round's turn?
  [Defend 1, Aid Attack S7, Hide 8 — **ONE ruling**]
- What ends the window when there **is no next turn** — death, skip, encounter
  end? The end-of-encounter sweep clearing it is an engine default, not a printed
  rule. And does a mark survive the death of the creature it is stored on?
  [Defend 2, Aid Attack S8]
- **Multi-target rolls:** whole roll, or only that target's resolution? The
  per-target machinery is precedent from a *different* artifact.
  [Defend 6, Aid Attack S5, Hide 7 — **ONE ruling**]
- Is Defend's **suppression clause** evaluated continuously or once? [Defend 3]
- What does Defend's **"no benefit"** cover — both printed clauses, or one? [Defend 4]
- **Whose ability rolls** does Defend's clause reach — allies' too? [Defend 5]
- **Which tests** qualify for Defend? The text names a category and enumerates
  nothing. [Defend 7]
- **Repeat and stacking.** Taking Defend again while one is live; two aiders on one
  enemy — double modifier, or does the second mark replace the first? **This is a
  live code hazard:** `addGrant`'s collapse rule replaces a grant matching on
  exactly the fields two *different* aiders share, under the authority of an
  artifact about a repeated use of the same ability by *one* creature. Whichever
  way it is ruled, the collapse predicate needs revisiting for source-attributed
  grants. [Defend 8, Aid Attack S4, Hide 10]

### 6.9 Aid Attack

- Can the aider **consume their own** benefit — does a creature count as their own
  ally here? The printed ally clause governs abilities that *target* allies; this
  targets an enemy. [S1]
- Is the **ally set fixed at the maneuver, or evaluated at roll time**? The two
  readings produce different code. [S2]
- **One total, or one per ally?** The singular article is doing all the work, and
  this ruling decides the whole shape. [S3]
- What does **"against that enemy"** cover — named target, area catch, damage
  without targeting? [S5]
- Do **tests** qualify, or only ability rolls? [S6]
- Used **off-turn** (one class feature grants it as a free triggered action), the
  window becomes up to a round-and-a-bit. Intended? [S9]
- Does it apply to an allied **minion squad's** attack roll? [S10]

### 6.10 Hide and Search — pinned; rule boundaries remain

- **Provenance is closed.** §Assist a Test, §Hiding, §Hide and Sneak, and
  §Searching for Hidden Creatures are pinned, versioned artifacts in
  `heroes--tests.bundle.json` (exact ids and hashes in the Lead Correction).
  Waves 9–11 have no pipeline blocker; the remaining questions below are rule
  and state-lifecycle boundaries.
- The **printed-word-to-occurrence mapping** for *"If you use an ability."*
  [Hide 3, Search S9, Make-or-Assist S12 — **ONE ruling; blocks Hide's sweep**]
- Is **one Hide dispatch one observer or all** of them? One quote is plural, the
  other singular. [Hide 1]
- *"Unless the Director deems otherwise"* is an explicit **veto with no printed
  criteria** — refusal, warning, or a flag that simply writes no fact? [Hide 2]
- Does an **Area ability** that catches a hidden creature reveal them? [Hide 4]
- Are creatures that **enter later** hidden-from or not? [Hide 5]
- **Movement in combat:** on a plain reading any movement reveals, since sneaking
  is printed as out-of-combat only. Needs a ruling before any movement path touches
  this. [Hide 6]
- Does losing hidden **from one observer affect the others**? Every clause is
  per-pair, but the reveal list reads global. [Hide 9]
- **Whose turn** is *"the end of the turn in which you are no longer hidden"* when
  the reveal lands on another creature's turn? [Hide 8]
- **Out-of-combat Hide:** the Director *might* ask for a test to determine *how
  well* hidden — no difficulty, no tier bullets, no printed meaning. Not
  automatable as printed. [Hide 11]
- A class piety feature's printed **link points at a skill id** while its printed
  words say *maneuver* — which id does the trigger key on? A source-data ruling.
  [Hide 12]
- **Hidden is not one of the nine printed conditions,** so nothing that removes or
  prevents conditions touches it — but no printed text says so out loud. Rule it
  explicitly so a later implementer does not helpfully file it as a condition.
  [Hide 13]
- Does the searcher roll **once, or once per hidden creature**? Decides whether the
  searcher's roll is one object or a map. [Search S2]
- What does a **natural top-end roll** do on an opposed roll, given the opposed
  rule prints no tiers and forbids the reward? [Search S3]
- Does a successful search **reveal the creature to anyone else**? Rule it so no
  implementer helpfully clears the set. [Search S4]
- May the same searcher **search the same creature again next round** — is a fresh
  round a changed circumstance? No attempt-history gate before this is ruled.
  [Search S5]
- Does the **point-out** require the creature still hidden from the ally, or the
  ally to have line of effect? The printed condition is proximity only. [Search S7]
- May **mode B** be dispatched for allies the searcher never won a roll against?
  [Search S8]
- Do **minions and squads** route here at all once the hero path is automated? The
  squad maneuver enum already carries the literal. [Search S10]

### 6.11 Make or Assist a Test

- Does the printed **skill bonus** interact with edges and banes, or stack? Whether
  a *skill* bonus is an ordinary bonus is a Gate-3 read of a separate artifact. [S3]
- Does **difficulty apply to an assist test**? Its tier bullets have no difficulty
  column — structurally identical to the statblock table that a prior ruling says
  displaces difficulty — but the text never says so. [S4]
- **What binds the assist grant and when does it lapse** — if the test is never
  made, if an intervening roll or a *different* test consumes it, whether it
  survives the turn, round, or encounter? The pends-until-consumed default was an
  adjudication for printed one-shot grants; extending it is a new ruling. [S5]
- Does assisting require **proximity**? None printed — while the sibling maneuver
  prints adjacency explicitly. The silence looks deliberate, but it is a silence. [S7]
- May **more than one creature assist**, and how do assists combine? The only
  printed constraint reads as *permitting* a second. [S8]
- Is assist's **own cost fixed**, or does it vary with the assisted task? [S10]
- May assist be dispatched **off the assister's turn**? [S11]
- **NOT A GAP TO CLOSE:** which tests are maneuvers, main actions, free maneuvers
  or impossible in combat is explicitly and permanently the Director's. Flagged
  only so nobody builds a classifier — it is a dispatch input. [S2]
- **FORWARD DEP:** the hero-token reroll has no substrate (hero tokens appear in
  zero engine files), and it means a test may produce two `roll-made` occurrences
  with the second superseding the first — nothing expresses supersession. [S9]
- **CONSTRAINT, not a silence:** an ordinary maneuver test is the *opposite* case
  to a statblock-forced test on both counts, so this path must not carry the
  reactive-test canon refs or the statblock skill prohibitions. Recorded because a
  copy-paste from `executeTest` imports exactly the wrong refs. [S6]

### 6.12 Grab / Escape Grab / Knockback

- **The size ordering type** — what datum is stored, and how does an object of
  *irregular size* compare? **SHAPE-GATING.**
  [Grab S7, Escape S6, Knockback K9 — **ONE ruling, three specs**]
- What does the printed hedge **"usually"** mean on the size targeting gate — and
  note the divergence that the condition text restates the grab gate *without* the
  hedge, which is itself the ruling. [Grab S1, Knockback K1 — **ONE ruling**]
- May these actions target an **object**? The targets lines read *"One creature"*;
  two other artifacts admit objects; the engine has no object participant kind.
  [Grab S2, Knockback K4, Free Strike S7 — **ONE ruling**]
- Is the **targeting/size gate a warn or a refusal**? One item prints an explicit
  size waiver, which a refusal would silently contradict.
  [Grab S6, Knockback K6 — **ONE ruling**]
- **The tier-2 free strike's action cost.** No cost, no limit, no downside is
  printed on it and it is not labelled a triggered action, yet the compiled
  companion's header prints a main action and the strike happens off-turn. A prior
  ruling said what it is *not*, not what it *is*. Until ruled, the `partOf`
  composition is a mechanism choice, not a licensed answer.
  [Grab S4, Escape S4 — **ONE ruling, both artifacts**]
- Does the **low tier band spend the maneuver**? Structural in the engine (the
  debit happens at use, not at success) — say so on the card rather than letting it
  be inferred from an implementation. [Grab S8, Escape S8, Knockback K10]
- **Several grabbers / two grabbers on one target.** Does the escape's top tier end
  *all* instances or one, and does its middle tier produce one free strike or one
  per grabber? The printed cap bounds the **grabber**, not the grabbee, and no text
  bounds how many creatures may have one creature grabbed. **SHAPE-GATING for the
  removal representation.** [Escape S1, Grab S10 — **ONE ruling**]
- Where does the **cap override** live — a seeded per-creature stat or a dispatch
  assertion? Both printings carry an override clause, which is why no cap
  *constant* may be built. [Grab S3]
- **"If the grabber remains" on the hero path.** A prior ruling covered a squad
  minion grabber, where removal is deterministic; a hero grabber reduced to zero
  Stamina is still a participant. Does the grab still apply, and is the resolution
  downgrade the licensed expression? [Grab S5]
- Does the grabber's **own grabbed-imposed bane** apply to a *second* Grab? A
  grabber who is themself grabbed by a third party is a literal instance; nothing
  says otherwise and nothing implements it. [Grab S9]
- **The highest-impact silence in Escape Grab:** does grabbed's own bane apply to
  Escape Grab itself? Its targets line is Self and does not target the grabber, so
  on a literal read the escapee always takes that bane — and stacked with a size
  bane the roll carries a double bane. Nothing says exempt; nothing says not. [Escape S7]
- **Grabbed by an object or an effect:** the middle tier names a *creature* who can
  free-strike, so on a literal read an object grabber makes that tier identical to
  the top tier. Intended? [Escape S2]
- Is the middle tier's *"You can escape"* a **live choice**? A prior ruling made the
  identical call for a *different* artifact; CONV-0004 requires proving the pin does
  not answer it, and it does not answer it here either way. If it is a choice,
  select-to-apply (DEC-0012) is the disposition. [Escape S3]
- If the middle tier's free strike **removes the escapee**, does the escape still
  resolve? The mirror case was ruled; a mirror *suggests*, it does not *state*. [Escape S5]
- Is the prose **precondition enforceable** — a dispatch by an ungrabbed creature is
  nonsense in fiction but coherent in engine state. [Escape S10]
- **NOTED ONLY, so nobody adds a second rule:** the dazed action limit already warns
  through the existing debit and no Escape-Grab text modifies it. [Escape S9]
- **UNOWNED:** the printed maneuver *inside* the grabbed condition that moves a
  grabbed creature is a printed maneuver, is not one of the 17, and no spec in this
  arc owns it. Does it need one? [Grab S11]

### 6.13 Knockback, action-specific

- **Who applies stability, and when?** A printed permission with a printed limit — a
  CONV-0004 decision point. Target-supplied input, automatic subtraction, or
  table-adjudicated? And does it stack with the pusher's own printed discretion, or
  are they the same knob from two sides? [K2]
- Does **Big Versus Little apply within size 1**? The size rule prints an order
  *inside* size 1 and also says a mechanic mentioning size 1 applies to all of them.
  This changes the distance on most hero-vs-hero and hero-vs-humanoid pushes. [K3]
- **The biggest unruled boundary Knockback touches, generalizing to all 227
  forced-movement lines:** where is the line on **slam damage**? It is engine-shaped
  output from a geometry-shaped input. Permanently out of scope, an `apply-damage`
  the VTT dispatches, or an asserted "squares remaining" input? [K5]
- Are the two printed **grabbed prohibitions** warns or refusals? Both are hard
  printed can'ts. [K8]
- Does the **actual push distance ever become engine state**? Today the receipt names
  the printed number and stops; if the VTT resolves the movement, may the receipt
  name a pre-modifier number, or must the dispatch carry an asserted final distance
  for the log to be honest? [K7]
- **SCOPING:** does Knockback ship unmodified? The modifier surface is 22 artifacts
  and a fury or a null at the table meets one immediately. In the first
  playable-session slice, or does Knockback ship with a receipt that is right about
  the book and wrong about the character sheet? [K11]
- **UNOWNED:** two class features change the *identity* of the compiled ability
  rather than modifying it — one makes Knockback ranged, another turns the push into
  a slide. No spec in this arc owns them. [K12]

### 6.14 Stand Up

- **Which prone instance(s) end** when a creature carries more than one? The printed
  phrase names the **condition**; the engine's unit of removal is the **instance**.
  Same shape as the several-grabbers question on a second condition — write the
  ruling **once, for conditions generally**, not twice. **SHAPE-GATING for S12.**
  [S1, with Escape S1]
- Is the **standee's own action economy** touched in branch B? The artifact prints
  one maneuver and attributes it to the user. [S2]
- Does restrained's bar on **using** Stand Up reach the **target** role? The haunt's
  explicit *"on themself"* shows the books scope this distinction when they mean to. [S3]
- What does prone's **"says otherwise"** escape hatch license, mechanically? It names
  no vocabulary; the corpus prints two window forms and at least one bespoke
  sentence. This is why the design ships an opaque verbatim-carrying rider and not a
  boolean. [S4]
- Does an unscoped **"can't stand" rider** bar an *ally's* Stand Up? It is the
  difference between 29 files and 30. [S5]
- Can an **unconscious or dying** creature be *willing*? [S6, with Use Consumable S4]
- May Stand Up be taken by a **non-prone creature**, or against a **non-prone
  target**? The precondition is printed; the consequence of violating it is not. [S7]
- Does Stand Up **exist or cost anything outside combat**? With a null turn state the
  debit is a documented no-op — a behaviour, not a ruling. [S8, with CB S7]
- May a **prone creature use branch B** on another prone creature? [S9]
- Does a **minion's individual Stand Up forfeit squad participation in the engine**?
  The monster rules answer the *rule* and name standing up as the example; Stand Up's
  own artifact is silent and a prior ruling scoped this out of the action-economy
  arc. [S10]

### 6.15 Use Consumable — two blocking first

- **What makes a consumable one "that benefits the user"?** The phrase gates the
  entire administer branch, is defined nowhere, and **no consumable is tagged.** One
  clearly qualifies, one clearly does not, at least one is genuinely unclear.
  Director call per item, derivable property, or a narrower technical meaning?
  **BLOCKS the administer branch.** [S1]
- Does **"unless otherwise noted in its description"** reach the administer branch?
  One sentence carries it; the next says flatly that this maneuver administers. May a
  main-action consumable be *administered* as a maneuver? May a triggered-action one
  be administered at all? The readings differ mechanically. [S2]
- **What does "willing" mean and who declares it?** No printed definition exists in
  the rules directory; the nearest clause is about abilities that *target* allies, and
  this artifact names no ally and is not an ability. Importing it is a ruling.
  [S3, with Stand Up S6 and Ride's mount — **ONE ruling**]
- May a creature **administer to an unconscious or dying** adjacent creature — the
  precise moment the rule is reached for? Rule jointly with the Catch Breath and Heal
  dying questions. [S4]
- **Who pays the action** on the administer branch, and does the recipient spend
  anything at all? The engine has an operator-pays concept precisely because the book
  sometimes charges the other party. [S5, identical in shape to Stand Up S2]
- Is **one Use Consumable one charge**? Multi-charge items are printed; whether one
  activation may spend more than one is not. [S6]
- Do **Director-controlled creatures** use consumables? The artifact says *"a
  creature"*; the consumables rule is hero-facing. [S7]
- Is there any **per-turn or per-round limit**? None printed; with conversion a
  creature already takes two maneuvers, and outside combat the debit is a no-op — so
  it is currently unbounded by the engine. That may be correct; it is not stated. [S8]
- What if the recipient **stops being adjacent or willing** between dispatch and
  resolution? [S9]

### 6.16 Cross-cutting, affecting all 17

- **The out-of-combat posture.** With a null turn state the debit is a documented
  no-op across every common action. For Catch Breath that *happens* to match the
  printed out-of-combat licence — by accident, not by ruling. Rule the posture once,
  for the family. [CB S7, Stand Up S8, Advance implicit]
- **Warn-vs-refuse confirmation.** Every one of the 17 applies the permissive default
  to its printed "can't," and every spec asks for that to be confirmed on the card
  rather than inherited. Two are called out as unusually absolute: Catch Breath's
  dying bar (printed twice) and Knockback's two grabbed prohibitions.
- **The offer/mandate framing on `spend-recovery`** (§6.6) is a design decision the
  specs explicitly refused to make.

---

## 7. Risks and blocked items

**Closed — chapter provenance.** The three chapter sections used by waves 9–11
are pinned in `heroes--tests.bundle.json`. They require no alternate source path
and impose no pipeline gate. The remaining blockers are W0-c, W10's writer/eraser
dependency, and Hide's maintenance decision below.

**Blocked on a user decision, not a rule — Hide maintenance.** The printed ending
is a **continuously evaluated** geometric predicate; asserted facts are
point-in-time. Nothing fires when the hider steps out of cover, so hidden rows go
stale silently and the engine keeps granting the modifier and constraining
targeting after canon has already ended both. The three new members make Hide
**dispatchable**; they do not make it **maintainable**. Take this to the user
*before* adding the members: if the answer is *"the Director re-asserts,"* Hide is
a table procedure with engine bookkeeping; if the answer is *"the engine should
know,"* Hide waits for the VTT plug-in.

**The arm is the whole bet.** If wave 4's Advance is not ~15 lines with zero
Advance-specific code, or if Ride cannot be expressed without Ride-shaped
branching leaking into the other 16 paths, **stop and redesign before shipping
anything else.** That signal is exactly what prime directive #2 exists to produce,
and it costs one action to get at implementer #2 versus seventeen at #17.

**Silent-failure vectors.** (a) *The debit contract* — `partOf` is opaque to the
pure reducer, so a wrong contract does not throw; a free strike either costs
nothing or costs two main actions. Make it a required envelope field in wave 1.
(b) *The grant window* — a holder-only sweep reads correct on every Defend test
and never expires an anchored grant. (c) *The size type* — whichever of the three
lands first without W0-b types size as a number and the other two are silently
wrong.

**A correctness defect already in a spec.** Search's opposed wrapper misreads an
absolute tier as a delta (must-fix #7). Fix the spec before wave 11 implements
from it.

**Scope pressure on Knockback.** It ships in wave 5 with a receipt that is right
about the book and wrong about the character sheet: 22 corpus artifacts modify the
push distance. Either the modifier surface joins wave 5, or the receipt says
plainly — in its named modifier families — that it reports the printed value only.

**`addGrant` collapse predicate.** The existing rule replaces a grant matching on
exactly the fields two *different* aiders share, under the authority of an artifact
about a repeated use of the same ability by one creature. Live in wave 8 regardless
of how the two-aiders silence is ruled.

**Concurrent-lead collision.** A Codex lead shares the `engarde` tree and owns
`packages/canon/config/effect-presentation-rulings.json`. Wave 1 lands new
compile-time machinery in `packages/canon`. Coordinate first; brief them on
DEC-0012 and DEC-0013. Per the parallel-session partition: message-first split,
new files only, one working-note owner.

**This slice does not close the critical path.** It delivers the 17 actions and
the asserted-fact reader; **turn scheduling** and **hero malice** remain open
substrate gaps with nothing under them. Do not read a green wave 13 as a playable
session.

**Audit coverage.** `pnpm canon-constants` gains entries for
`OPPOSED_DOUBLE_MODIFIER` and `TEST_DIFFICULTY_OUTCOMES` in the same commits that
introduce them. Run `pnpm spec-prose-audit` over the 17 spec bodies before
implementation — three of them restate arithmetic they claim to reuse.
