# Squad attacks + With-Captain benefits — design (rev 2.1, 2026-08-26)

> **Gate-3 CLEARED 2026-08-26:** R-0034..R-0039 all accepted (hashes 6/6
> verified; blob archived at
> `.artifacts/canon/squad-attack/rulings-blob-2026-08-26.json`). R-0038
> AMENDED in review: **detach is automatic on captain death** (user note:
> "Detach should be automatic on Capt.'s death. No other changes
> needed.") — folded into §3/§4 below; recorded in
> `docs/canon-rulings.md`.

> **BUILD CLOSEOUT 2026-08-27:** engine/canon/Convex/CLI/Table implementation
> landed from action-economy base `5baaa39`; verification and dispositions are
> in `docs/squad-attack-report.md`. The accepted R-0036 premise was partly
> falsified by the bounded grammar attempt: Knockback's pure Push tiers compile,
> but Grab's interleaved target free strike requires reaction nesting. Grab
> therefore remains a verbatim, maneuver-debiting directive pending the exact
> human amendment review; no support was invented.

Rev 1 was red-teamed by four independent lanes (Gate-2 PDF confirmation,
canon fidelity, substrate scalability, rules-lawyer counterexamples); the
findings ledger is `docs/squad-attack-redteam.md`. Rev 2 folds in all
blockers. The family named by R-0028 (With-Captain automation deferral)
and R-0033 (squad ATTACK math scope note). Grounding inputs, all at
accepted pin `520553438a4e8d199bfaaf676b8aa9bd273f4d61`:

- Deterministic survey `.artifacts/canon/squad-attack/survey.json`
  (116 Minion-organization statblocks; template patterns recorded in the
  output's `method` block).
- Verbatim canon base: the PDF-recovered "Acting Together" prose recorded
  in full inside R-0033 (canon-rulings.md; Monsters p.8–9) and the captain
  prose recorded inside R-0028 (Monsters p.9). Gate-2 lane (this arc,
  2026-08-26): the elided §Squad Action worked example RECOVERED verbatim
  (Monsters p.8 + a p.9 sidebar restatement); six With-Captain statblock
  entries spot-confirmed EXACT; §Organized as Squads anchor recovered;
  silences confirmed at PDF level — no printed rule for squad splitting,
  ranged/melee mixing within one squad action, or area abilities used BY
  a squad.
- Dependencies: schema v6 shapes from `action-economy-design.md` §3 at
  rev 2.1 (per-member minion budgets, `action` grants with escape flags,
  the resolution stack — `actorId: participantId | squadId`, widened for
  this family while that leg was open — and the boundary-sweep registry).
  **This family's build starts only after that leg lands**; nothing here
  duplicates it.
- Prior rulings bearing on this family: R-0014/R-0015 (per-target
  edge/bane pools; count → cap → cancel arithmetic; same-ability
  duplicates collapse), R-0023..R-0028 (squad pools, area cap,
  weakness/immunity once-last, captains), R-0030..R-0033 (permissive
  economy posture, interception points, resolution stack, minion
  per-member budgets).
- Minion-pool audit latent L-3: a dead captain stays attached until
  manual detach; the nudge lands here.

Everything quoted is byte-verbatim from the pinned bundle, or PDF-verbatim
where flagged (the Acting Together prose recorded in R-0033; this arc's
Gate-2 recoveries, which the R-0034 card records durably).

## 1. Canon base (verbatim anchors; full quotes + pages on the ruling cards)

All §-quotes below are PDF-verbatim Acting Together prose (Monsters
p.8–9; recorded in R-0033 except where marked as this arc's recovery).

- **One roll for the squad** (§Squad Action): "Each minion has a signature
  ability that is typically a strike targeting one creature or object.
  When multiple minions in a squad use their signature ability on a turn,
  you make one roll for the whole squad. Each target of a minion's
  signature ability is affected by only one instance of the ability."
- **Free-strike-value stacking** (§Squad Action): "But when two or three
  (at maximum) of a squad's minions attack the same creature or object
  simultaneously, each additional minion causes the signature ability to
  deal extra damage to the target equal to the minion's free strike
  value."
- **The pitling worked example** (§Squad Action, Monsters p.8; Gate-2
  PDF-recovered this arc — this family's printed-example golden): "As an
  example, a squad of three demon pitlings are attacking a shadow and a
  conduit with their Spit signature ability, with a tier 2 outcome on the
  power roll. One pitling targets the shadow, dealing 4 poison damage.
  Two pitlings target the conduit, dealing 4 poison damage plus an extra
  2 poison damage for the additional pitling." A p.9 sidebar restates it:
  "One pitling spits at the shadow for 4 damage, one pitling spits at the
  conduit for 4 damage, and the remaining pitling deals an extra 2 damage
  to the conduit." Pin reconciliation: pitling Spit tier-2 is "4 poison
  damage", pitling free strike value is 2 — the example's numbers derive
  exactly. Note the example TYPES the extra damage ("an extra 2 poison
  damage"): stacking extras inherit the tier packet's type.
- **Squad crit** (§Squad Action): "If a minion squad scores a critical
  hit with their signature ability, all the minions who participated in
  using the ability can take another main action."
- **Squads make squad attacks** (§Organized as Squads, Monsters p.7;
  Gate-2 this arc): "Minions with the same name (for instance, goblin
  sniper) can be organized into squads of up to eight creatures. All
  members of a minion squad act together on the same initiative, and can
  make squad attacks (see Acting Together below)."
- **Minion Maneuvers** (§Minion Maneuvers): "Minions in a squad use the
  Grab, Hide, Knockback, and Search for Hidden Creatures maneuvers
  together. For Grab, Knockback, and Search in particular, you make one
  roll for the whole squad, and each target of a minion's maneuver is
  only affected by one instance of the ability."
- **Free Strike Together** (§Free Strike Together): "If several minions
  in a squad make a free strike at the same target at the same time, such
  as from a hero provoking an opportunity attack by moving away from
  several minions surrounding them, the damage from each minion's free
  strike is added together and treated as one strike."
- **Captain benefits** (R-0028; Monsters p.9): "While a minion squad has
  a captain, each minion in the squad gains the benefits noted at the
  'With Captain' entry on their stat block." And the printed taxonomy
  (Gate-2 this arc): "Usually, this benefit is either a damage boost, a
  bonus to speed, or additional Stamina."

## 2. Survey facts (deterministic; regexes in survey.json `method`)

- **116** Minion statblocks; **every one** carries exactly one feature
  with `ability_type: "Signature Ability"`, usage `Main action`, with a
  power roll. Printed free-strike values span 1–5
  (1×25, 2×38, 3×29, 4×19, 5×5).
- Signature targets: `One creature or object per minion` ×104,
  `One creature per minion` ×10, `Each enemy and object in the area` ×2
  (fire-giant-fireballer Blazing Leap, cyclops Wild Slam — both `1 burst`,
  keyword Area). 19 signatures carry the Charge keyword.
- Signature tier-text edge cases the engine must survive (rules-lawyer
  lane): war-dog-socialite's tiers are damage-less self-strikes ("The
  target makes a free strike (tier N result) against themself");
  attacker-referent riders exist corpus-wide ("the tonguer shifts…",
  "away from the draconite", "the wildling can make a free strike
  against a creature adjacent to the target"); multi-packet tiers
  (war-dog-draconite "4 damage, 3 psychic damage") and flagged tiers
  (optacus "this damage ignores immunity").
- Bespoke minion triggered actions exist but are rare — 5 total
  (4× radenwight "Ready Rodent", mindkiller-whelp "Feast") — matching the
  printed "usually don't have bespoke triggered actions." Ready Rodent
  triggers on "An ally deals damage to the target"; Feast transforms the
  whelp and mutates the squad pool (see §5).
- Free-strike-modifying traits exist outside minions' own values:
  skeleton-knight "More Swings" (two free strikes instead), ogre
  blue-blood "In My Stead" (an ally strikes instead).
- **With Captain**: 21 distinct verbatim strings over 116 statblocks,
  falling into a closed template set with ONE residue:
  | template bucket | statblocks | example (verbatim) |
  |---|---|---|
  | edge-on-strikes | 27 | "Gain an edge on strikes" |
  | double-edge-on-strikes | 1 | "Have a double edge on strikes" (unguloid) |
  | strike-damage-bonus | 28 | "+2 damage bonus to strikes" |
  | speed-bonus | 29 | "+3 bonus to speed" |
  | ranged-distance-bonus | 14 | "+5 bonus to ranged distance" |
  | melee-distance-bonus | 4 | "+2 bonus to melee distance" |
  | stamina-bonus | 10 | "+2/+3/+4/+6 bonus to Stamina" |
  | forced-movement-distance-bonus | 1 | "+2 bonus to forced movement distance" (orc-bloodspark) |
  | strikes-bonus (ambiguous) | 1 | "+1 bonus to strikes" (lizardfolk-tonguer) |
  | RESIDUE (bespoke) | 1 | "Lightning spread increases by 1 square" (war-dog-sparkslinger) |
- Squad-maneuver material in-pin: common ability artifacts
  `feature.ability.common/{grab,knockback}` (roll-bearing) + prose
  features `feature.common.maneuvers/{grab,hide,knockback,
  search-for-hidden-creatures}`. (The survey selector's 7th hit,
  `skill.intrigue/hide`, is a regex false-positive — excluded, stated
  here per accounting discipline.) Search has NO roll-bearing compiled
  artifact in-pin.

## 3. Gate-3 ruling candidates (R-0034..R-0039 — nothing auto-applies until accepted)

- **R-0034 — Squad Action one-roll automation.** A squad's signature
  attack dispatches as ONE ability use by the squad (the resolution
  entry's actor is the squadId — v6 rev 2.1): an ordered participation
  list `[{targetId, instanceOwner, memberIds}]` (order is the damager's
  printed choice, hash-witnessed), one power roll, one resolution entry.
  Per target: one instance of the tier result, plus stacking — each
  attacker beyond the first adds their printed free-strike value as
  extra damage, **typed by inheritance** from the tier's damage packet
  (the pitling example prints "an extra 2 poison damage"). The printed
  "two or three (at maximum)" is enforced as WARN-and-apply (R-0030
  posture) when a payload names 4+ attackers on one target. Adjudications
  of confirmed book silence, stated for ruling: (a) attacker-referent
  tier riders ("the tonguer shifts…") resolve against the target's
  designated **instance owner**; (b) stacking extras apply only when the
  tier result carries an ability damage packet — a damage-less tier
  (war-dog-socialite's self-strike tiers) with 2+ attackers on one
  target emits a warn receipt carrying the verbatim tier text (residue,
  never a guess); (c) multi-packet and flag-carrying tiers
  (war-dog-draconite, optacus) are the same residue class for the
  extras' type/flags; (d) a participating member's outbound next-roll
  grants join the per-target pools only for targets that member attacks
  (inbound marks on targets apply per-target as already shipped).
  Members outside the participation list are the printed "waste their
  main action doing nothing" case (budget debits per R-0033 regardless).
  The two Area-keyword signatures dispatch through the same extracted
  pipeline with the squad's single roll; the asserted target list is the
  union across members' areas, each target listed once (one instance),
  and stacking never applies (confirmed silence: no rule governs area
  abilities used BY a squad). A member may deliver the signature via the
  Charge main action (`partOf` composition; movement table-asserted).
- **R-0035 — Squad crit grants.** A natural-crit squad roll (existing
  crit one-home from the power-roll cluster) compiles to one plain
  main-action `action` grant (schema v6 union) per PARTICIPATING member,
  carrying the printed crit escapes ("whether or not it's your turn and
  even if you are dazed", Heroes p.75). Both halves are adjudications:
  the printed minion sentence says only "can take another main action" —
  it prints neither the escapes nor any turn restriction. No
  squad-machinery consumption constraint (rev 1's was incoherent with
  the escapes and has no home in the grant shape); odd spends warn under
  the permissive posture.
- **R-0036 — Minion Maneuvers together.** Grab / Knockback / Search for
  Hidden Creatures dispatch squad-together with the same participation
  shape: one roll for the whole squad; each target affected by one
  instance. Grab and Knockback resolve through their compiled common
  ability artifacts; Search has no roll-bearing artifact in-pin and
  rides as a directive receipt until its prose feature compiles
  (accounted, never dropped). Hide is used "together" but the printed
  "one roll" list names only "Grab, Knockback, and Search in particular"
  — Hide-together rides as a directive receipt. The individual-maneuver
  forfeit is per-member budget state already automated by R-0033; this
  ruling adds the together-roll.
- **R-0037 — Free Strike Together.** A combined free-strike dispatch —
  contributions `[{memberId, count}]` (count defaults 1; skeleton-knight
  "More Swings" contributes 2) against one target — produces ONE damage
  instance equal to the sum of contributions, "treated as one strike"
  (the printed anchor): the target's weakness/immunity applies once to
  the summed instance, and per-strike triggered effects see one strike.
  Substitution traits (ogre "In My Stead") are out of payload scope —
  the substitute's strike is its own dispatch. Triggered free strikes
  off the SAME trigger occurrence may join one combined dispatch (the
  printed example — several minions' opportunity attacks off one move —
  is itself a same-occurrence multi-trigger; radenwight Ready Rodent ×k
  off one damage event is the corpus case); sequential occurrences stay
  individual. Simultaneity is table-asserted — the dispatch is the
  assertion.
- **R-0038 — With-Captain benefit automation by closed template.** The
  classifier ships benefit-source-generic (`parseBenefitPhrase`; the
  same phrases recur in non-captain traits, e.g. kobold signifer), with
  `parseWithCaptain` a thin caller over the `with_captain` field, on a
  `CONSTANTS`-style closed template table. While a captain is attached
  (R-0028 state), automated buckets flow through a new named **derived-
  modifier channel** (persistent while-attached, receipt-visible, its
  own field in the roll receipt beside asserted and granted modifiers —
  admitted as new substrate; benefit-source-generic so terrain/trait
  families reuse it): edge-on-strikes contributes **one edge per benefit
  per roll** — NOT one per participating member (per-member summing
  would double-edge every 2+-member captained squad under the
  count→cap→cancel arithmetic, making 27 printed single-edge statblocks
  identical to unguloid's unique printed double edge; the recorded
  same-ability-duplicates-collapse discipline points the same way) —
  double-edge contributes two; **this aggregation is itself a question
  on the card**. strike-damage-bonus: +N once per target-instance on
  the signature (stacking extras are free-strike values, not strikes);
  +N per contribution in Free Strike Together (each minion's free strike
  gains the bonus before the printed sum). Movement-plane benefits —
  speed, ranged-distance, melee-distance, forced-movement-distance —
  have no engine home (no map substrate; flat-resource precedent) and
  surface as verbatim directive chips while attached (unchanged R-0028
  behavior, now template-tagged). The bespoke residue stays a verbatim
  directive (war-dog-sparkslinger "Lightning spread increases by 1
  square" — the referent is the ability's own printed Effect parameter,
  Monsters p.304; parameter mutation inside tier prose is not substrate
  this family builds). **Sub-question for the user:** lizardfolk-tonguer
  prints "+1 bonus to strikes" (Monsters p.199) where 28 other
  statblocks print "+N damage bonus to strikes"; the general rule offers
  only "Usually, this benefit is either a damage boost, a bonus to
  speed, or additional Stamina" (Monsters p.9). Proposed: rule it a
  damage bonus; if declined it stays a verbatim directive. Unknown
  FUTURE strings refuse to classify — residue, never a guess. Dead
  captain (audit L-3; **amended in Gate-3 review**): captain death
  AUTOMATICALLY detaches the captain — benefits end at that moment, the
  R-0039 pool adjustment fires if applicable, and the receipt quotes the
  printed succession rule. Re-attach remains the Director's act; Director
  detach stays available for all non-death cases (amends R-0028's
  manual-detach-only posture for the death case).
- **R-0039 — Stamina-type benefits and the mid-fight pool question.**
  10 statblocks print "+N bonus to Stamina" as a With-Captain benefit;
  squad pools are seeded per-minion-Stamina × members (R-0023). The
  books are silent on an in-progress pool when a captain arrives or is
  lost mid-fight (the question R-0028 explicitly parked for this
  family). Proposed for ruling: while attached, the squad's **effective
  per-minion Stamina** is printed + N — pool, max, the kill divisor,
  and the area per-contribution cap (R-0025) all move together, so the
  one-home damage math and the ruling never diverge. Attach adds
  N × living members to pool and max; detach/death removes
  N × living-at-detach, floored at 0 — kills already recorded are never
  retroactively undone; both movements receipt-visible. Alternative if
  declined: Stamina-type benefits stay verbatim directives (the other
  buckets automate unchanged).

## 4. Engine design (builds on schema v6 rev 2.1 — nothing lands before that leg)

- **Prework (first build commit, zero behavior change).** Extract the
  roll-resolution pipeline — outbound/inbound grant consumption →
  per-target modifier pools → per-target `resolvePowerRoll` → roll
  receipt — from `handleUseAbility` into one exported function.
  `handleUseAbility`, the squad signature path, and the Area-signature
  dispatch all call it (the red-team's second-implementer test: without
  this the squad handler copy-pastes ~150 lines of grant/lifecycle
  code, and the reaction family would face three roll paths to
  intercept instead of one).
- **No new state slot.** The family rides `squads` (v5), `grants` /
  `actionBudget` / `abilityUses` / `resolutionStack` (v6; squad-capable
  `actorId` per rev 2.1). New payload shapes only:
  `SquadSignatureAttack {squadId, participation: [{targetId,
  instanceOwner, memberIds}]}`, `SquadFreeStrike {squadId, targetId,
  contributions: [{memberId, count}]}`, `SquadManeuver {squadId,
  maneuver, participation}`. One admitted new substrate piece: the
  **derived-modifier channel** (§3 R-0038) with its own roll-receipt
  field and recompute-invariant coverage.
- **One home per rule.** The stacking one-home is a PURE function
  `participation → per-target breakdown[]` — each breakdown row carries
  `(tier packet | residue, stacking extras as (value, type, flags),
  instanceOwner)` — stored on the resolution entry so the reaction
  family's halvers/retargeters modify data, not numbers computed inside
  commit (retargeting is a participation edit pre-commit). The same
  exported summation serves R-0034 extras and R-0037 contributions —
  never two summations. `parseBenefitPhrase` in `packages/canon` with a
  `CONSTANTS`-style closed template table.
- **Resolution flow.** A squad signature attack opens one squad-owned
  resolution entry (R-0032): interception points and modifications
  apply to the single squad roll; commit applies, per R-0032's recorded
  order, damage to all targets (tier packet + stacking extras per the
  breakdown) → tier effects in presented order — attacker-referent
  riders against the instance owner — through the existing per-target
  effect applicator. Free-strike value parses into `StatblockStats` →
  `ParticipantStatsSchema` (nullable, with the statsJson-predates-field
  lift — the `withCaptain` precedent trio, landing beside the v6
  migration).
- **Crit grants** compile through the v6 grant registry — per-kind
  config, no call-site lifecycle code (Glowing-Eyes directive).
- **Hosts.** Convex view: squad attack affordance with participation
  picker (ordered targets, instance owner, stacking preview from the
  breakdown) + receipts; CLI verbs `squadattack` / `squadfs`; Table:
  participation chips on the squad card, With-Captain chip upgraded
  from verbatim-only to template-tagged (automated buckets show live
  modifier state; directive buckets unchanged).
- **Goldens.** The pitling printed example as an exact golden: three
  pitlings, Spit, tier-2 outcome, targets {shadow: 1 attacker → 4
  poison; conduit: 2 attackers → 4 + 2 poison, poison-typed extras};
  both p.8 and p.9 printed renderings assert the same totals. Plus a
  free-strike-together golden derived from the printed
  opportunity-attack example shape. E2E: squad turn → signature attack
  with stacking → crit → granted second action, against a captained
  squad with an edge-type benefit.

## 5. Deliberate scope cuts (tracked, not hidden)

- **Reaction-effect automation** for the bespoke minion triggered
  actions: Ready Rodent ×4 ride the interception points as directives
  (their free strikes may join R-0037 dispatches — §3); **Feast
  (mindkiller-whelp) is NOT directive-coverable** — its Effect mutates
  engine-owned squad state (the pool loses the whelp's Stamina; the
  member transforms out of the squad mid-encounter). Named forward-dep:
  a Director member-detach/transform intent (roster + pool + max
  decrement, receipt-visible); its kill trigger rides the existing
  Director kill-identity intent (minion-pool family). Until then the
  Feast receipt carries the verbatim text AND the declared gap.
- **Summoner-book minion rules** — entirely outside the pin (unchanged
  minion-pool cut).
- **Splitting/merging squads, demoralized optional rule, Mount roles**
  — unchanged minion-pool cuts.
- **Movement math** (speed / distance / forced-movement-distance
  benefit automation; Charge movement; attacker-referent movement
  geometry) — no map substrate; verbatim directives (§3 R-0038,
  R-0034).
- **Hide-together and Search-together resolution** — directive receipts
  (§3 R-0036).
- **Squad-vs-squad free strikes and multi-squad simultaneity** — the
  dispatch shape is per-squad; cross-squad simultaneity is
  table-asserted by separate dispatches.
- **Substitution traits** (ogre "In My Stead") — the substitute's
  strike is its own dispatch; no cross-creature payload splice (§3
  R-0037).
