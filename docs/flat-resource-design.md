# Flat-resource closed-template family — design (rev 1, 2026-08-25)

Slice: the four remaining closed whole-payload Effect templates —
`spend-recovery-exact` (6 lines), `area-difficult-terrain` (3),
`regains-stamina-flat` (2), `temporary-stamina-flat` (1) — 12 lines across 12
artifacts at pin `520553438a4e8d199bfaaf676b8aa9bd273f4d61`. Shipping this
zeroes the closed-template pool (accounting 55 automated → 67, table 1,633 →
1,621). Selected 2026-08-25 per the effect-shape-inventory §4 guidance ("batch
as one small slice after the modifier substrate exists" — the grant substrate
shipped 2026-08-25).

Gate-3 status: **R-0017..R-0022 are CANDIDATES — nothing below auto-applies
until the user accepts the rulings.** Canon research: four independent rulebot
lanes, 2026-08-25, all quotes Gate-1 (data-md) + Gate-2 (PDF page) confirmed.

## 1. The 12 lines (verbatim, scc links elided to labels)

spend-recovery-exact (heroes 6):
- conduit L1 Drain #1 — "You or one ally within distance can spend a Recovery."
- conduit L1 Healing Grace #1 — "The target can spend a Recovery."
- conduit L3 Words of Wrath and Grace #1 — "Each ally in the area can spend a Recovery."
- elementalist L1 Breath of Dawn Remembered #1 — "The target can spend a Recovery."
- fury L5 My Turn #1 — "You can spend a Recovery."
- tactician L2 I've Got Your Back #1 — "One ally adjacent to the target can spend a Recovery."

regains-stamina-flat (monsters 2):
- human death-acolyte #1 — "One creature within 5 squares regains 1 Stamina."
- kobold signifer #2 — "Each target regains 5 Stamina."

temporary-stamina-flat (heroes 1):
- fury L3 Steelbreaker #1 — "You gain 20 temporary Stamina."

area-difficult-terrain (monsters 3):
- dynamic-terrain pillar #2, orc-terranova (Sinkhole) #2, war-dog-aerocite
  (Caustic Paste Bomb) #1 — "The area is difficult terrain."

## 2. Canon base (verbatim anchors; full quotes in the ruling cards)

- **Recovery value** — "A hero also has a recovery value that equals one-third
  of their Stamina maximum, rounded down." [Combat §Recoveries and Recovery
  Value, Heroes p.277]. Count: "Each hero has a number of Recoveries
  determined by their class." [ibid.] Refresh at respite [Basics p.7].
- **Ability-granted spends bypass Catch Breath** — "Some heroes have abilities
  that allow them or their allies to spend more Recoveries without using the
  Catch Breath maneuver." [Basics §Spending Recoveries, p.7]
- **Dying heroes may spend via ally help** — "While you are dying, you can
  still act, your allies can help you spend Recoveries in combat…" [Combat
  §Dying and Death, p.278]
- **NPC conversion** — "…a Director-controlled creature regains Stamina equal
  to one-third of their Stamina maximum." [Combat §No Recoveries, p.278]
- **Minions cannot regain** — "…minions can't be winded, can't regain
  Stamina, and can't gain temporary Stamina during a battle." [Monster Basics
  §Shared Low Stamina, Monsters p.7]
- **Temporary Stamina** — max-not-sum stacking, no cap, damage drains it
  first, excluded from recovery/winded values, "Unless otherwise indicated,
  temporary Stamina disappears at the end of an encounter." [Combat
  §Temporary Stamina, p.278]
- **Difficult terrain** — "It costs 1 additional square of movement to enter
  a square of difficult terrain." [Combat §Difficult Terrain, p.270]. No
  default duration for ability-created terrain exists anywhere; contrast
  evidence shows MCDM writes durations explicitly when intended (War Dog
  Ballistite Kill Zone: "Until the start of the ballistite's next turn, the
  area is difficult terrain…" [Monsters p.311]).

## 3. Gate-3 ruling candidates

**R-0017 — Regain arithmetic and clamp.** "Regains X Stamina" adds X to
current Stamina as a signed value (from negative while dying) and is clamped
at Stamina maximum. Basis: the book states the clamp only by implication
("Some effects can also reduce your Stamina maximum, limiting the amount of
Stamina you can regain." p.277); signed addition is the only arithmetic
consistent with one tracked number and death at −winded value. Winded and
dying remain derived predicates — regaining above the winded value /
above 0 ends those states with informational log entries, no action. The
dying-mandated bleeding instance is NOT auto-removed on leaving dying; it
merely becomes removable again (R-0004's refusal gate keys on the derived
dying state). Regaining Stamina never restores temporary Stamina (p.278).

**R-0018 — Ability-granted Recovery spends.** Spending a Recovery decrements
the hero's Recoveries by 1 and regains Stamina equal to their recovery value
= floor(staminaMax / 3), one home, temporary Stamina excluded from the
derivation (p.277 + p.278). An ability-granted spend consumes nothing from
the recipient's action economy (p.7). "Can spend" is an offer: the dispatch
carries each offered participant's accept/decline; declining is legal and
receipted. Dying heroes may accept (p.278 explicit); Catch-Breath-while-dying
refusal (R-0004 family) does not apply to ability-granted spends.

**R-0019 — Spend/regain edge cases.**
(a) A hero with 0 Recoveries cannot spend: the engine refuses the binding
with a receipt (basis: "as many Recoveries as you have remaining" p.277 +
the unconscious wake rule treating 0 as blocking p.278 — implied, not
stated; refusal is proposed because the over-state is canon-incoherent, like
zipper double-acting).
(b) A Director-controlled non-minion creature offered a spend or a
recovery-value regain instead regains floor(staminaMax/3); no pool exists,
nothing decrements, and the book places no limit on repetition (p.278).
(c) A minion squad member as the target of any regain / temporary-Stamina
gain routes to a not-automated table receipt (minion pool not yet
mechanized + "minions can't regain Stamina… during a battle" Monsters p.7),
exactly like the existing minion damage blocker.

**R-0020 — Flat regain is automatic and binding-targeted.** "regains X
Stamina" applies without recipient choice or action (contrast: Heal's
explicit "can spend" p.274; these lines carry no choice language — note
Necrotic Bolt says "One creature", so an enemy CAN be chosen). Who "One
creature within 5 squares" / "Each target" is, is a dispatch-time
participant binding asserted at the table (no spatial model), the pattern
already established for targets and objectTargetLabels.

**R-0021 — Temporary Stamina gain.** Gaining temporary Stamina sets the pool
to max(existing, granted) — never the sum (p.278 verbatim, including the
partially-depleted reading: the example compares current remaining). No cap.
The bare template carries no duration override, so the default applies:
temporary Stamina clears to 0 in the end-encounter sweep ("Unless otherwise
indicated, temporary Stamina disappears at the end of an encounter." p.278),
alongside the existing condition and grant sweeps.

**R-0022 — Area difficult terrain as a recorded fact.** The engine has no
spatial model; "The area is difficult terrain." compiles to a typed,
attributed **terrain fact** on the encounter (source artifact + ordinal,
verbatim area text from the ability header, creating participant, intent id)
rather than a verbatim table directive. The Table/CLI display the fact; the
+1-square movement cost stays table-adjudicated until spatial substrate
lands. Duration: the book gives no default for ability-created terrain
(contrast Kill Zone's explicit window), and the three sources are physical
alterations (rubble / sinkhole / caustic paste) — proposed: the fact
persists until the Director clears it (a director-authority
`clear-terrain-fact` intent) and does not survive the encounter. This is a
Gate-3 adjudication, not printed text.

## 4. Engine design

**Schema (v3 → v4 + migration):**
- `ParticipantStatsSchema` + `recoveriesMax: z.number().int().min(0).nullable()`
  — stored, class-determined (the potencies precedent: never derived). Null =
  untracked (all Director creatures; heroes without character data).
- `StaminaStateSchema` + `recoveries: z.number().int().min(0).nullable()` —
  current pool; null exactly when `recoveriesMax` is null (refined).
- `EncounterStateSchema` + `terrainFacts: TerrainFactSchema[]` (default []) —
  `{factId, terrain: 'difficult', effectArtifactId, effectOrdinal, areaText,
  createdBy, intentId}`.
- Migration stamps v4, defaults `recoveries: null` / `terrainFacts: []`.

**One homes (all in health.ts / damage.ts beside the existing ledger):**
- `recoveryValue(staminaMax)` = `Math.floor(staminaMax / 3)` — serves heroes
  (p.277) AND the NPC conversion (p.278: "one-third of their Stamina
  maximum"); HEALTH_CANON gains `recoveries` + `noRecoveries` refs.
- `regainStamina(participant, amount, …)` — third entry point over the
  shared threshold ledger in damage.ts: clamp at staminaMax (R-0017), signed
  addition, staminaDeltas claim, informational "no longer winded" / "no
  longer dying" transitions.
- `gainTemporaryStamina(participant, amount, …)` — max-not-sum (R-0021),
  temporary delta claimed.
- `spendRecovery(participant, …)` — decrement + `regainStamina(recoveryValue)`
  for heroes; NPC conversion path for director creatures (R-0019b); refusal
  at 0 (R-0019a); minion blocker (R-0019c). Claims `recoveriesDeltas`.

**Effect resolutions (EffectResolutionSchema additions):**
- `{kind: 'spend-recovery', subjectText}` — dispatch binds offered
  participants + per-participant accept/decline (R-0018).
- `{kind: 'regain-stamina', amount}` — dispatch binds targets; automatic
  (R-0020).
- `{kind: 'temporary-stamina', amount}` — subject is the acting participant
  ("You"); automatic (R-0021).
- `{kind: 'terrain-fact', terrain: 'difficult'}` — records the attributed
  fact (R-0022); `clear-terrain-fact` director intent removes one.

**Sweeps:** end-encounter sweep additionally zeroes `stamina.temporary`
(R-0021) and drops `terrainFacts` with receipts (R-0022).

**Invariants:** extend the oracle — every recoveries change claimed and
within [0, recoveriesMax]; temporary-Stamina changes claimed (gain =
max-not-sum recompute); terrainFacts reconcile against add/clear claims;
regain never exceeds staminaMax.

**Grammar/compiler:** the four anchored templates from
`effect-shape-inventory.ts` become compile rules emitting the resolutions
above; anything failing the `^…$` anchor stays a verbatim table directive
(unchanged boundary).

**Golden channel:** independent 12-entry raw-scanner golden (the next-roll
pattern): artifact, ordinal, span, exact source, targets header, compiled
resolution — zero production mismatches required.

**Hosts:** Convex boundary re-verifies SHA-256 + recompiles server-side
(established pattern); CLI + Table surface the spend offers
(accept/decline), regain receipts, temp-Stamina pool, and terrain facts;
E2E on a drift-guarded fixture (kobold-signifer is the natural pick:
multi-target regain).

## 5. Deliberate scope cuts (tracked, not hidden)

- Recovery-value "+ a little extra" variants, "The target spends a Recovery"
  (non-optional) wording, and out-of-combat free spending: none are in the
  closed templates; they stay table until their own families.
- Unconscious (knocked-out) heroes as spend targets: book silent (gap noted
  in research); the dispatch can bind them and the engine warns-and-applies
  per the permissive default — flagged in the receipt for Director
  adjudication.
- Duration-overridden temporary Stamina (respite-scoped grants, druid forms)
  — not in the corpus template; the sweep default covers the one line.
- Movement-cost math for difficult terrain — deferred to the spatial-facts
  arc; the fact record is the honest representation until then.
- Retainers (6 Recoveries, Monsters p.351) — no retainer is a corpus
  statblock target at this pin; recoveriesMax stored covers them when they
  arrive.

## 6. Definition of done

All 12 lines compile to typed resolutions and execute through the new cores;
every other line stays verbatim; counts re-frozen (automated 67 / table
1,621; recovery 34→28, stamina-regain 35→33, temporary-stamina 22→21,
terrain 30→27); independent golden zero-mismatch; full corpus re-executes
with zero conservation/invariant violations; workspace tests + typecheck +
lint green; `pnpm corpus:certify` stamp committed (CONV-0003); fresh
read-only audit GO. Gate-3: R-0017..R-0022 user-accepted BEFORE any of this
auto-applies.
