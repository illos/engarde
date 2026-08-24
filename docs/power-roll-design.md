# Power-roll resolution cluster — design

> Status: **rev 2 — red-teamed** (2026-08-24; findings + dispositions in
> `power-roll-redteam.md`: 4 lenses, 2 blockers/majors folded in — minion
> Stamina pools, end-encounter exceptions, damage-vs-Stamina-loss split,
> state migration, downgrade interactivity, knock-out state, host log data).
> ROAD-0005 backlog items
> 2–4 built as one cluster: power roll → tier banding → damage/Stamina
> application → potency resolution. Measured priority: power roll neededBy=849
> artifacts > damage=431 > potency=212 (grammar sweep, engarde 63c717c); they
> form one cluster because tier banding gates both damage and potency
> application.
>
> Every rule statement in this doc carries its canon source. **No rule here is
> from memory.** Verbatim quotes are marked ❝…❞ with the source record. Where
> the corpus underdetermines behavior, the question is listed in §10 for a
> Gate-3 ruling — nothing silently assumed.

## 0. What this clears

- Exception queue f12 (tier-outcome damage never applied), f13 (potency gates
  assumed met), f14 (subsumed by damage gap).
- The web lobby's asserted-tier picker (`useAbility(band)`) becomes a real
  roll: dice as input, engine-computed tier, applied damage, resolved potency.
- Grammar: `tier-damage` extends to typed + characteristic-choice damage;
  `power-roll` heading extends to the four measured bonus shapes.

Out of scope, with seams (§9): derived condition modifiers (backlog 5),
imposing-effect riders (6), action economy (7), surge pools, tests-as-intent,
opposed rolls, forced movement, recoveries/healing, hero tokens, Malice.

## 1. Canon base (verbatim, all from atomized rule records)

Sources: `en/books/heroes/md/rule/…` in the pinned SteelCompendium snapshot
(`v4.20260803143953`). Record ids are `mcdm.heroes.v1/rule.<cat>/<slug>`.

- **Roll** — ❝you roll two ten-sided dice (usually noted as 2d10 in the rules)
  and add one of your characteristics❞ (`rule.dice/power-roll`). Two types:
  **ability roll** and **test** (`rule.dice/power-roll` §Types).
- **Tiers** — ❝**11 or lower** … tier 1❞, ❝**12 to 16** … tier 2❞, ❝**17 or
  higher** … tier 3❞ (`rule.dice/tier-outcome`).
- **Natural roll** — ❝The total of your power roll before your characteristic
  or any other modifiers are added❞ (`rule.dice/natural-roll`).
- **Natural 19–20** — ❝When you roll a natural 19 or 20 on a power roll, it is
  always a tier 3 result regardless of any modifiers❞ (`rule.dice/natural-roll`);
  on a test it is a critical success (`rule.dice/natural-19-20`); on a
  main-action ability roll it is a **critical hit**: ❝allows you to immediately
  take an additional main action after resolving the power roll, whether or not
  it's your turn and even if you are dazed❞; ❝You can't score a critical hit
  with an ability roll made as a maneuver or any other action type, but you can
  score a critical hit with a main action you use off your turn❞
  (`rule.combat/critical-hit`).
- **Edge / bane** — edge: ❝a +2 bonus to the roll❞; two or more = **double
  edge**: ❝you don't add anything to the power roll, but the outcome of the
  roll automatically improves one tier (to a maximum of tier 3)❞
  (`rule.dice/edge`). Bane symmetric: −2 / double bane decreases one tier, min
  tier 1 (`rule.dice/bane`).
- **Cancellation** (`rule.dice/power-roll` §Rolling With Edges and Banes):
  ❝If you have an edge and a bane, or if you have a double edge and a double
  bane, the roll is made as usual without any edges or banes.❞ ❝If you have a
  double edge and just one bane, the roll is made with one edge❞ (symmetric for
  double bane + one edge). Cap is two each (design sidebar "Why Cap?").
- **Bonuses / penalties** — ❝calculated independently of edges and banes, and
  before edges and banes are factored into a power roll. There is no limit to
  the number of bonuses or penalties that can apply to a power roll, and
  bonuses and penalties always add together❞ (`rule.dice/bonuses-and-penalties`).
  Skills: ❝the hero gains a +2 bonus to the roll❞ (`rule.test/test`).
- **Automatic outcomes** — ❝Such effects supersede any edges, banes, bonuses,
  or penalties❞; you may still roll for roll-contingent extras (crit);
  multiple *different* autos ❝cancel each other out and all automatic outcomes
  are ignored❞; multiple same → obtain it (`rule.dice/power-roll` §Automatic
  Tier Outcomes).
- **Downgrade** — ❝Whenever you make a power roll, you can downgrade it to
  select the outcome of a lower tier❞; a downgraded critical hit keeps the
  extra-action benefit (`rule.dice/power-roll` §Downgrade).
- **Damage expressions** — ❝a number followed by a plus sign (+) and the
  letter M, A, R, I, or P … add your characteristic score … to the damage❞;
  choice form ❝7 + M or A damage❞ (`rule.dice/ability-roll` §Characteristics
  and Damage).
- **Ordering** — ❝any effects that are determined by a power roll's tier
  outcome occur after the power roll's damage has been dealt to all targets❞;
  ❝If an ability creates multiple effects, those effects resolve in the order
  in which they are presented❞ (`rule.dice/ability-roll` §Abilities With
  Damage and Effects).
- **Damage → Stamina** — ❝Whenever a creature takes damage, they reduce their
  Stamina … by an amount equal to the damage taken❞ (`rule.damage/damage`);
  ❝After any damage you take is reduced by damage immunity or other effects,
  your Stamina is reduced by an amount equal to the remaining damage❞
  (`rule.health/stamina`).
- **Damage types** — untyped default; typed set: ❝acid, cold, corruption,
  fire, holy, lightning, poison, psychic, or sonic❞ (`rule.damage/damage-type`).
- **Immunity** — reduce by value, min 0; ❝If the value of the immunity is
  "all," then the target ignores all damage of the indicated type❞; ❝Damage
  immunity should be the last thing applied❞; multiple → ❝only the immunity
  with the highest value applies❞ (`rule.damage/damage-immunity`).
- **Weakness** — extra damage; untyped weakness applies to any type; ❝apply
  the weakness first, then the immunity❞; multiple → highest only
  (`rule.damage/damage-weakness`).
- **Temporary Stamina** — ❝the temporary Stamina decreases first, and any
  leftover damage is applied to your Stamina as usual❞; not counted for winded
  / recovery values; gain = max(old, new), never additive; ❝Unless otherwise
  indicated, temporary Stamina disappears at the end of an encounter❞
  (`rule.health/temporary-stamina`).
- **Winded** — ❝Your winded value equals half your Stamina maximum. When your
  Stamina is equal to or less than your winded value, you are winded❞ — no
  intrinsic effects (`rule.health/winded`). Halving rounds down
  (`rule.general/always-round-down`).
- **Dying / death** — ❝When your Stamina is 0 or lower, you are dying. While
  dying, you can't use the Catch Breath maneuver … you are bleeding, and this
  instance of the condition can't be negated or removed in any way until you
  are no longer dying❞; ❝While your Stamina is lower than 0, if it reaches the
  negative of your winded value, you die❞ (`rule.health/dying`).
  Director-controlled creatures ❝In most circumstances … die or are destroyed
  when their Stamina drops to 0❞ (`rule.health/stamina`). Knock-out: ❝If you
  damage a creature with an ability that would kill them, you can choose to
  instead knock them unconscious❞ (`rule.health/stamina` §Knocking Creatures
  Out).
- **Potency** — ❝Ability effects that have a potency are applied to a target
  only if the effect's potency value is higher than the target's indicated
  characteristic score❞; hero values: weak = highest characteristic − 2,
  average = − 1, strong = − 0 (`rule.character/potency`; see §10 Q2 for the
  class-characteristic tension). Notation `M < WEAK` / numeric for monsters.
  Book-worked example: Judgment's Hammer vs Agility-0 bandit
  (`rule.character/potency` — golden fixture, §7).
- **Characteristics** — five (Might, Agility, Reason, Intuition, Presence),
  scores −5…+5 (`rule.character/characteristic`).
- **Surges** (seam only) — spend ≤3 on rolled damage, each = highest
  characteristic; 2 surges = potency +1 for one target, max +1
  (`rule.resource/surge`).

## 2. Resolution order (the one home for the roll math)

`packages/engine/src/power-roll.ts` — `resolvePowerRoll(input): PowerRollResolution`,
pure, no state access. **Every step cites its record; the full breakdown is
returned and logged** (receipts, replayability).

```
input: { dice: [d1, d2],                    // 1..10 each — dice are INPUT
         characteristicValue: number|null,  // chosen per §4 binding
         bonuses:  [{value, reason}],       // unlimited, additive
         penalties:[{value, reason}],
         edges: n≥0, banes: n≥0,            // asserted counts (v0; see §9 seam)
         automaticOutcomes: [tier...],      // asserted effects
         downgradeToTier?: 1|2 }
```

1. **natural** = d1 + d2 (`rule.dice/natural-roll`).
2. **cap + cancel** edges/banes: e = min(edges,2), b = min(banes,2),
   net = e − b (`rule.dice/power-roll` cancellation bullets; the three
   enumerated cases and the cap are exactly net-of-capped-counts).
3. **total** = natural + characteristic + Σbonuses − Σpenalties
   + (net = +1 → +2) + (net = −1 → −2) (`rule.dice/edge`/`bane`,
   `rule.dice/bonuses-and-penalties`: numeric modifiers independent of, and
   before, edge/bane).
4. **band**: total ≤11 → tier 1; 12–16 → tier 2; ≥17 → tier 3
   (`rule.dice/tier-outcome`).
5. **double edge/bane tier step**: net = +2 → tier +1 (max 3); net = −2 →
   tier −1 (min 1) (`rule.dice/edge`/`bane`).
6. **natural 19–20 floor**: natural ≥ 19 → tier = 3 ❝regardless of any
   modifiers❞ (`rule.dice/natural-roll`) — applied after step 5 (reading: the
   double-bane step is a modifier; Gate-3 Q1).
7. **automatic outcomes**: if asserted — distinct autos cancel entirely; same
   autos → that tier, superseding steps 2–6 (roll still resolved for crit
   detection) (`rule.dice/power-roll` §Automatic Tier Outcomes).
8. **downgrade**: if requested, tier = min(tier, requested)
   (`rule.dice/power-roll` §Downgrade). Crit status unaffected.
9. **crit flags**: naturalTopEnd = natural ≥ 19. `criticalHit` = naturalTopEnd
   ∧ ability roll ∧ actionType = main action (from the ability header;
   `rule.combat/critical-hit`). The extra-main-action grant is an
   **informational log entry + table directive** — action economy is not yet a
   mechanism (§9). Tests: `criticalSuccess` = naturalTopEnd
   (`rule.dice/natural-19-20`) — carried for the future test intent.

Constants live once: `TIER_BANDS`, `EDGE_VALUE = +2`, `BANE_VALUE = −2`,
`EDGE_BANE_CAP = 2`, `NATURAL_TIER3_MIN = 19`, each with its canon ref
(Ironyard's duplicated-rule-math lesson: one home, imported everywhere).

## 3. State substrate (schemas.ts extensions)

```ts
CharacteristicsSchema = { might, agility, reason, intuition, presence: int −5..5 }  // rule.character/characteristic
DamageModifierSchema  = { type: DamageType | 'untyped-all', value: number | 'all' } // immunity/weakness rows
ParticipantStatsSchema = {
  staminaMax: int > 0,
  characteristics: CharacteristicsSchema,
  immunities: DamageModifierSchema[],       // from statblock JSON / asserted
  weaknesses: DamageModifierSchema[],
  potencies: { weak, average, strong }?,    // heroes: stored values, not derived (Gate-3 Q2)
  organization: string | null,              // statblock field; 'Minion' routes to receipts (CF-1)
}
ParticipantState += {
  kind: 'hero' | 'director-creature',       // rule.health/stamina splits death rules; EXPLICIT in seed payload, no default
  stats: ParticipantStatsSchema | null,     // null = table-mode actor: no automation, receipts only
  stamina: { current: int, temporary: int≥0 } | null,  // current MAY be negative (rule.health/dying)
}
// Zod refinement: stamina present ⇔ stats present (SE-5).
```

- **Migration (SE-2)**: `schemaVersion` bumps to 2; the engine exports pure
  `upgradeEncounterState(v1) → v2` (one home). v1 participants upgrade to
  `stats: null`, `stamina: null`, `kind: 'director-creature'` (all v1 lobby
  participants are corpus monster records; no v1 field is dropped, so the
  upgrade is lossless). Hosts call it on read — the Convex host migrates each
  stored encounter state the first time it touches it.
- **Minion organizations (CF-1)**: canon gives minion squads a **shared
  Stamina pool** with its own drop accounting (❝Each squad of minions shares
  a Stamina pool…❞, `monsters/md/chapter/monster-basics.md`; minions can't be
  winded, can't regain, can't gain temporary). The per-participant model is
  wrong for them, so damage/potency against a participant whose
  `organization` is `Minion` routes to the `not-automated` receipt path —
  never silently treated as an individual. The squad mechanism is a named
  follow-up slice (§9).

- **Derived, never stored**: winded (current ≤ ⌊max/2⌋), dying (current ≤ 0),
  dead (current ≤ −⌊max/2⌋). One selector module `health.ts` with the canon
  refs; hosts and UI import it. Storing them would create a second home for
  the same rule math.
- **Stat provenance**: statblock participants take stats deterministically
  from the paired structured JSON (DEC-0008: checksummed structured input) at
  encounter start; the seeding pipeline (`corpus export-records`) is extended
  to carry the stat fields + JSON checksum. Non-statblock participants (v0
  heroes) get **Director-asserted stats** at start — an assertion, logged as
  such, never invented by the engine — or `stats: null`, in which case every
  damage/potency touch degrades to a `not-automated` receipt (the tier-3 table
  card path).

## 4. Intents

### 4.1 `use-ability` (replaces the host's asserted-band flow)

```ts
payload: {
  abilityArtifactId,                 // verbatim record; grammar-compiled server-side
  targets: ParticipantId[],          // ≥1; ability header's target count NOT enforced (warn seam, §9)
  dice?: [int 1..10, int 1..10],     // asserted dice win; absent → context.random (auto-roll default)
                                     // RNG discipline (SE-4): asserted dice = ZERO draws; auto = exactly two, d1 then d2
  characteristicChoice?: 'M'|'A'|'R'|'I'|'P',  // required iff the power-roll bonus is a choice/highest form
  damageCharacteristicChoice?: 'M'|'A'|'R'|'I'|'P',  // for "N + M or A damage" (PL-5); default = actor's highest among offered, logged as defaulted
  edges?: n, banes?: n,              // asserted counts + optional reasons
  bonuses?: [{value, reason}], penalties?: [{value, reason}],
  automaticOutcomes?: [1|2|3],
  downgradeToTier?: 1|2,             // v0 pre-declared (PL-1): canon downgrade is a post-roll choice; the
                                     // result log emits "downgrade available to tiers < N"; the faithful
                                     // two-phase roll→commit flow is a named follow-up (§9) bundled with
                                     // action economy, whose roll-window triggers need the same shape
  extraDamage?: [{value, reason, target?}],     // surge-shaped assertion seam (§9)
  potencyAdjustments?: [{delta, reason, target?}],
  knockOut?: boolean,                // rule.health/stamina §Knocking Creatures Out
}
```

Executor (one shared pipeline, `ability-execution.ts`):

1. Parse ability text (grammar, conservation-audited), find power-roll clause
   + tier lines. No power-roll clause → refusal (nothing to roll).
2. Bind the roll characteristic: fixed `+N` (monster) → that number, no
   characteristic; single characteristic → actor's score; choice list /
   "highest characteristic" → `characteristicChoice` (validated against the
   list) or highest of actor's stats. Actor stats null → dice still roll;
   characteristic unresolvable → refusal with "assert stats first" (the roll
   math cannot be represented coherently without it).
3. `resolvePowerRoll` once — **one roll for the ability, all targets**
   (`rule.dice/ability-roll`: strikes/areas roll once; per-target variation
   enters at damage/potency, not the roll).
4. **Damage to all targets first** (`rule.dice/ability-roll` ordering), each
   through the damage core (§5), honoring per-target `extraDamage`.
5. **Then non-damage effects per target, in presented order**: potency gate
   (§6) → condition application via the existing lifecycle substrate
   (`applyConditionInstance` — the pilot's shared helpers, unchanged).
6. Unparsed tier-payload parts and ability residue → `not-automated` +
   `table-card` receipts exactly as today. Nothing silently dropped.

The **mutation log entry carries the full breakdown**: dice, natural,
characteristic (+which), bonuses/penalties with reasons, capped/net edge-bane,
band-before-adjust, tier steps applied, final tier, crit flags, per-target
damage pipeline numbers, per-target potency comparisons. The log is the
receipt; channel-2 and the transcript reviewer read it against canon.

### 4.2 `apply-damage` (standalone)

Director/hazard/manual damage: `{target, amount ≥ 0, damageType?, reason,
knockOut?}` → same damage core. Exists so the *second* implementer of a
damage-shaped effect (hazards, bleeding's end-of-turn loss, falling) imports
the mechanism instead of copy-pasting it (the Glowing Eyes lesson).

### 4.3 Unchanged

`apply-condition`, `remove-condition`, `end-turn`, `end-encounter`. End-turn's
saving-throw sweep is untouched. `end-encounter` additionally clears temporary
Stamina (❝disappears at the end of an encounter❞,
`rule.health/temporary-stamina`) and **exempts health-sourced condition
instances from the end-by-default sweep** (CF-2): ❝…end when the encounter is
over if the hero wants them to, **except for being winded, unconscious, or
dying**❞ (`chapter/classes.md` §Ending Effects). Winded/dying are
stamina-derived and unaffected; the knock-out `unconscious` instance and the
dying-sourced `bleeding` instance (both sourced to `rule.health/*` artifacts)
survive the sweep while their stamina precondition holds.

### 4.4 Intent-misuse dispositions (SE-7, permissive-engine-consistent)

- **Zod refusals** (invalid payloads): duplicate or empty `targets`; dice
  outside 1..10; negative `bonuses`/`penalties`/`extraDamage` values;
  `characteristicChoice`/`damageCharacteristicChoice` not offered by the
  ability's text.
- **Warn-and-apply** (rule-violation class): target count exceeding the
  ability header's target line.
- **No-op + informational**: `downgradeToTier` ≥ the computed tier; `knockOut`
  on a non-killing blow.
- **Exact semantics**: `automaticOutcomes` — duplicates of the same tier →
  that tier obtains; differing tiers present → all ignored
  (`rule.dice/power-roll` §Automatic Tier Outcomes). Self-targeting is
  allowed silently (the corpus has self-damage effects).

## 5. Damage core (`damage.ts`, one home)

Two entry points over one shared threshold/ledger core (SE-1): **`applyDamage`**
(the full pipeline below — for anything canon phrases as *taking damage*) and
**`loseStamina`** (direct Stamina reduction, steps 3–4 only — for effects canon
phrases as *losing Stamina*, e.g. bleeding's ❝they lose Stamina equal to 1d6 +
their level❞, which never touches immunities). The second implementer of a
Stamina-loss effect imports `loseStamina`; routing it through immunities would
be a canon divergence.

`applyDamage(target, {amount, type}, options)`:

1. **Weakness first** (`rule.damage/damage-weakness`): applicable = typed
   match ∪ untyped-all; take the **highest one only**; amount += value.
2. **Immunity last** (`rule.damage/damage-immunity`): applicable same way;
   highest only; `'all'` → damage becomes 0; else amount = max(0, amount − value).
3. **Temporary Stamina absorbs first** (`rule.health/temporary-stamina`),
   remainder reduces `stamina.current` — which may go **negative**
   (`rule.health/dying`).
4. **Threshold consequences** (all computed against the selector module):
   - crossing into dying (hero): auto-apply `bleeding` condition instance
     sourced to `rule.health/dying`, `ending: external`; while dying, a
     `remove-condition` on it **warns and applies** (permissive engine;
     Gate-3 Q3 asks whether this one is instead a representational refusal).
   - hero death at current ≤ −⌊max/2⌋: logged `death`; state keeps the number
     (no participant removal — invariant: participant set never changes).
   - director-creature at ≤ 0: dies — unless the damaging intent asserted
     `knockOut`, in which case a tracked `unconscious` condition instance is
     applied, sourced to `rule.health/stamina` §Knocking Creatures Out (PL-2).
     ❝If a creature takes damage while unconscious in this way, they die❞ —
     the damage core checks for that instance on every application and logs
     the death claim. The choice belongs to the damager at dispatch time.
   - `organization: Minion` target (CF-1): no application — `not-automated`
     receipt citing the squad-pool rules; the squad mechanism is a follow-up
     slice.
   - winded transitions (in/out) logged informationally (no intrinsic effect,
     but ❝You can tell when other creatures are winded❞ — it's public state).
5. Halving effects (Parry-style) are **not** in this cluster; the core takes a
   final pre-immunity amount precisely so a future halving step composes
   before immunity (❝immunity … the last thing applied❞ with the halving
   example, `rule.damage/damage-immunity`).

Target `stats`/`stamina` null → no application; `not-automated` receipt with
the computed would-be amount left unstated (we can't compute it) — verbatim
tier text on the card instead.

## 6. Potency core (`potency.ts`, one home)

`resolvePotency({characteristic, threshold}, imposer, target, adjustments)`:

- threshold numeric (monster notation) → value as written.
- `WEAK|AVERAGE|STRONG` → imposer's stored `potencies` values (v0: stored on
  stats, asserted or derived at seed time — derivation ambiguity is Gate-3
  Q2, so the engine consumes values, never derives them yet).
- apply `potencyAdjustments` (surge/Null-Field-shaped assertions, attributed).
- **Gate**: effect applies iff `target.characteristics[C] < value`
  (`rule.character/potency` — strictly less; the record's worked example
  pins the boundary case: Agility 0 vs `A < 0` → resisted).
- Imposer potencies unknown, or target characteristics unknown → the gate is
  unresolvable → `not-automated` receipt naming exactly what's missing;
  condition is NOT applied (conformance no longer "assumes the gate is met" —
  clears f13's class).

## 7. Grammar extensions (measured against 3,936 corpus tier lines)

- **Damage sub-grammar**:
  `N [+ C[, C…][ or C]] [type[, type…][ or type]] damage` →
  `{amount, characteristicOptions: C[], typeOptions: DamageType[]}`.
  Types = the nine from `rule.damage/damage-type` (closed enum; anything else
  fails the line to residue). Covers ~95% of damage-carrying heads (measured:
  1639 plain + 371 `+C` + ~900 typed + 93 `C or C` + ~180 `+C typed` + ~50
  multi-choice). Long tail (dual damage parts, dice `2d6 + 7 + A`, prose) →
  residue, line-atomic, as today.
- **Power-roll heading**: `Power Roll + X` where X ∈ fixed `N` (684) | one
  characteristic (337) | choice list (~60) | ❝highest characteristic❞ (84) →
  structured `bonus` union replacing today's raw string.
- **Tier payload**: damage part per above; potency prefix unchanged; the
  trailing effect must still be exactly the linked conditions (line-atomic
  conservation preserved). `- **N+:**` free-prose bands (~640 artifacts,
  complications etc.) stay residue — next grammar item, not this cluster.
- Conservation: unchanged full-consumption line accounting; sweep re-run after
  ship must show parsedRatio strictly above the 29.0% baseline and
  `tier-damage`-blocked artifact count falling.

## 8. Verification stack

- **TDD** (`/tdd-cycle` discipline): resolution core table-driven over the
  full modifier lattice (edge/bane counts 0–3 × bonuses × nat-19/20 × autos ×
  downgrade), band boundaries (11/12, 16/17), dice bounds; damage core
  (weakness/immunity/temp/negative/thresholds, 'all', highest-only-of-several,
  knock-out); potency boundary (strictly-less, worked example values).
- **Conformance (channel 1)**: fixtures are real corpus records across the
  measured shapes — blood-for-blood (M-damage + STRONG potency + conditions,
  committed checksum-pinned), sentenced (P-damage + WEAK), Judgment's Hammer
  (the book's own worked example → **golden fixture**: conduit I=2 vs bandit
  A=0, all three tiers, exact expected Stamina deltas from
  `rule.character/potency`), a goblin statblock child ability (fixed `+2`
  bonus, numeric potency `M < 1`, bleeding), a typed-damage ability, an
  `M or A` choice ability. Assertions are exhaustive state deltas.
- **Channel 2**: independent expectations over the same fixtures via the
  existing machinery; disagreements → exception queue.
- **Invariants (new, on every dispatch)**: Stamina↔log reconciliation (every
  stamina/temporary delta claimed by a mutation entry via
  `staminaDeltas: [{participantId, from, to, temporaryFrom, temporaryTo}]`;
  every claim real — mirrors the condition-instance reconciliation);
  dice-in-range; **breakdown-recompute** (SE-8: re-run `resolvePowerRoll` from
  the logged inputs and fail on any total/tier mismatch — the roll path is
  self-auditing on every dispatch); potency-gate consistency (a logged
  resisted gate for target T + condition C ⇒ no addedInstanceIds for C on T
  in the same intent); tier ∈ {1,2,3}; no stored derived health state;
  refusal-with-change (existing) extended to stamina.
- **Replayable fight**: scripted encounter (goblins vs corpus actors) through
  the driver exercising roll/damage/potency/dying/knock-out; transcript
  through the reviewer (pilot step 8 pattern).
- Workspace: all tests + lint + typecheck green; sweep re-run with measured
  gain recorded in the ship report.

## 9. Known-unknowns — declared by rule class, seams ready

| Class | Status | Seam |
|---|---|---|
| Derived condition roll modifiers (weakened→bane, restrained→edge-against, prone…) | backlog 5 | modifiers carry `{value, reason}` attribution; derived sources will merge with asserted ones, dedupe by reason |
| Imposing-effect riders | backlog 6 | condition instances already carry source/effectArtifactId |
| Action economy (crit's extra main action; maneuver-can't-crit enforcement; R-0001 warn) | backlog 7 | crit emits informational + table directive; actionType captured from header |
| Surge pools (gain/track/spend) | resource mechanism, later | `extraDamage` / `potencyAdjustments` assertions with reasons — surge spends arrive as attributed assertions today, become verified spends later |
| Tests as intents (difficulty table, skills, opposed rolls) | later | `resolvePowerRoll` is roll-kind-agnostic; difficulty table is data on the future `make-test` intent; `criticalSuccess` flag already computed |
| Forced movement (`push N` in tier lines) | spatial, backlog 8 | stays residue → table-card (unchanged) |
| Recoveries / healing / Catch Breath | later cluster | health selectors + stamina shape already hold max/current/temp |
| Ability target-count / distance enforcement | warn seam with spatial facts (backlog 8) | targets array unrestricted, header captured |
| Hero tokens, Malice, heroic resources | later | none needed now |
| **Minion squad Stamina pools** (shared pool, drop accounting, area-only multi-kill, no winded/regain/temp — `monsters/md/chapter/monster-basics.md`) | **named follow-up slice** (CF-1) | `organization` on stats; Minion targets route to receipts, never treated as individuals |
| **Two-phase roll→commit** (post-roll downgrade choice; roll-window triggered actions) | follow-up with action economy (PL-1) | `resolvePowerRoll` pure/separable; single-phase intent logs "downgrade available" |
| `(EoT)` ending marker in tier lines | next ending-vocab item (GR-3) | residue today, line-atomic |
| Multi-target tier variation (❝the creature using the ability picks which tier of rolled effect applies❞ for self/Director-targeted effects) | rare; residue path | effects target only `targets[]` v0 |

## 10. Gate-3 questions (user rulings needed; none block the build behind the chosen defaults)

1. **Natural 19–20 vs double bane.** ❝always a tier 3 result regardless of any
   modifiers❞ — does a double bane's tier *decrease* count as a "modifier" the
   nat-19/20 floor overrides? **Default encoded: yes** (floor wins, applied
   after the tier step). Counter-reading: the tier step is not a "modifier to
   the roll." Affects step 5/6 ordering only when natural ≥ 19 with net −2.
2. **Hero potency basis.** `rule.character/potency` bullets say weak/average/
   strong derive from ❝your highest characteristic score❞; the same record
   says the value is ❝based on one of your characteristics and determined by
   your class❞ (conduit example uses Intuition — which is both). **Default: the
   engine consumes stored potency values and never derives them**, so the
   ruling gates only the future character-build pipeline.
3. **Dying-bleeding removal.** ❝can't be negated or removed in any way until
   you are no longer dying❞ — warn-and-apply (permissive default, encoded) or
   substrate refusal (the only rule text with "in any way")? **Default: warn.**
4. **Director-creature death timing.** ❝In most circumstances … die … when
   their Stamina drops to 0❞ + knock-out choice. **Default: death at ≤0 unless
   the killing intent asserts `knockOut`**; any other "circumstance" is a
   Director assertion later.

## 11. Host + UI (thin, after engine green)

- `encounters.useAbility` drops the `band` arg for the new payload; seeded RNG
  per dispatch unchanged (auto-roll replayable); asserted dice/modifiers pass
  through. Search/table-card surfaces unchanged. **`appendLog` persists the
  engine `LogEntry.data`** (SE-3) — today it is dropped, which would discard
  the breakdown receipts the UI and replay depend on.
- `encounters.start` seeds stats for statblock records (structured JSON via
  extended `corpus export-records`); Director-asserted stats input for others;
  stats-null allowed.
- EncounterPanel: tier picker → Roll button (auto-roll default, manual dice
  override), modifier chips (edges/banes/bonuses with reasons), the breakdown
  rendered from the log entry's data (receipts on the page), Stamina bars with
  winded/dying/dead states from the selector module, knock-out toggle on the
  killing blow. Touch-first, 44px targets.

## 12. Build order

1. Schemas + `upgradeEncounterState` + selectors (+ boundary/purity tests).
2. Invariant extensions FIRST (SE-9: everything after is born under the
   oracle), then `resolvePowerRoll` TDD → `damage.ts`/`loseStamina` TDD →
   `potency.ts` TDD.
3. Grammar extensions TDD (measured fixtures) + conservation.
4. `use-ability` / `apply-damage` executor.
5. Conformance fixtures (channel 1 + golden Judgment's Hammer) + channel 2.
6. Scripted replayable fight + transcript review.
7. Sweep re-run; record measured gain.
8. Host + UI wiring (incl. `appendLog` data persistence + state migration on
   read); user verifies in the lobby (their vocabulary, in place).
