# Squad-attack design — red-team findings ledger (2026-08-26)

Four independent lanes ran against rev 1 of `squad-attack-design.md`:
Gate-2 PDF confirmation (ran first; its recoveries were folded into rev 1
itself), canon fidelity (quote/claim verification), substrate scalability
(second-implementer test), and rules-lawyer (corpus counterexamples).
Every finding below is folded into rev 2 or explicitly dispositioned.
Lanes' full outputs are session artifacts; this ledger is the durable
record.

## Blockers (all folded into rev 2)

| # | Lane | Finding | Rev-2 disposition |
|---|---|---|---|
| B1 | substrate | The roll pipeline (grant consumption → per-target pools → per-target `resolvePowerRoll` → receipt) is inline in `handleUseAbility`; the squad path would copy-paste ~150 lines of it — the Glowing-Eyes class | Prework mandate added: extract the shared roll-resolution pipeline as an exported function; `handleUseAbility`, the squad path, and the Area-signature dispatch all call it |
| B2 | substrate + canon + rules-lawyer (convergent) | "Per-member contributions to the squad roll's edge pool" silently escalates 27 printed single-edge benefits to a double edge on any 2+-member captained squad (cap-then-cancel arithmetic), collapsing the corpus's deliberate single/double distinction (unguloid is the only printed double); and the claimed "R-0014 substrate" pathway doesn't exist — R-0014 is consumable next-roll grants, not a persistent derived modifier channel | R-0038 recast: one edge per benefit per roll (same-effect-doesn't-stack discipline), surfaced as an explicit card question; a named **derived-modifier channel** (benefit-source-generic, receipt-visible, recompute-invariant-aware) is admitted as new substrate, not relabeled as existing |
| B3 | substrate | v6 `resolutionStack.actorId` was `participantId` only — a squad-owned resolution entry was unrepresentable; `end-turn` force-commit ownership breaks for squad turns | Resolved cross-session while the v6 leg was open: action-economy design amended to rev 2.1 (`actorId: participantId \| squadId`, engarde 27fd1d1) |
| B4 | rules-lawyer | war-dog-socialite Call to Self-Sabotage: tier results are "The target makes a free strike (tier N result) against themself" — no damage packet for stacking extras to join; the scalar stacking helper cannot be written over this record | Stacking applies only when the tier result carries an ability damage packet; a damage-less tier result with 2+ attackers on one target is a named residue class (warn receipt, verbatim text, Director adjudicates the extras) — on the R-0034 card |
| B5 | rules-lawyer | mindkiller-whelp Feast cannot "ride as a directive": its Effect mutates engine-owned squad state (pool loses the whelp's Stamina; member becomes a non-minion mid-encounter) and its trigger needs outbound kill attribution the one-roll model doesn't produce | Scope cut made honest: Feast is a named forward-dep needing a member-detach/transform intent (pool + max + roster decrement, receipt-visible); its trigger rides the existing Director kill-identity intent (minion-pool family) — stated in §5, never claimed covered by a directive |

## Important (folded)

- Commit order restated to match R-0032's recorded order: damage to all
  targets (tier packet + stacking extras) → tier effects in presented
  order (canon F2; the pitling example prints the extras with the
  damage).
- R-0035's two adjudications were mutually inconsistent ("only within
  the squad's turn machinery" vs inherited `offTurn` escape). Rev 2
  picks one coherent pair: plain per-member main-action grants carrying
  the printed crit escapes; the turn-machinery restriction is dropped
  (permissive posture warns on odd spends). Both halves marked as
  adjudications on the card (canon F3, substrate F5).
- Stacking extras carry a TYPE: inherited from the tier's damage packet
  when it is a single typed packet (the printed pitling example is the
  proof of inheritance — "an extra 2 poison damage"); multi-packet tiers
  (war-dog-draconite "4 damage, 3 psychic damage") and flag-carrying
  tiers (optacus "this damage ignores immunity") are residue — extras
  apply with a warn receipt carrying the verbatim tier text. The
  summation one-home carries `(value, type, flags)`, never a scalar
  (rules-lawyer 5).
- Attacker-scoped tier riders ("the tonguer shifts", "away from the
  draconite", "the wildling can make a free strike…") have no unique
  referent under one roll + stacking. Rev 2 designates a per-target
  **instance owner** in the participation payload; attacker-referent
  riders resolve against the instance owner; proposed on the R-0034 card
  as an adjudication of confirmed book silence (rules-lawyer 4).
- Member-held outbound next-roll grants vs the one squad roll: proposed
  — a participating member's outbound grants join the per-target pools
  only for targets that member attacks; inbound marks on targets apply
  per-target as shipped (substrate F6).
- Free Strike Together contributions are `[{memberId, count}]` (default
  1): skeleton-knight More Swings contributes 2; ogre In My Stead
  substitution is out of payload scope — the substitute's strike is its
  own dispatch (rules-lawyer 6).
- "+N damage bonus to strikes" multiplicity: per-contribution in Free
  Strike Together (each minion's free strike gains +N before the printed
  sum — Σ(fs+N)); once per target-instance on the signature (the
  stacking extras are free-strike *values*, not strikes) — proposed on
  the R-0038 card (rules-lawyer 7).
- Ready Rodent (×4): triggered free strikes off the SAME trigger
  occurrence may join one combined dispatch (the printed Free Strike
  Together example is itself a same-occurrence multi-trigger);
  sequential occurrences stay individual — R-0037 card sentence
  (rules-lawyer 8).
- `freeStrike` is a parser + engine-schema + statsJson-lift trio (the
  `withCaptain` precedent), admitted in §4; v6 keeps the stats field set
  open (cross-session confirmation) (substrate F4).
- R-0039 recast so the one-home stays coherent: the benefit shifts the
  squad's **effective per-minion Stamina** while attached — pool, max,
  kill divisor, and the area per-contribution cap all move together;
  attach adds N × living members, detach removes N × living-at-detach,
  floored so kills are never retroactively undone (substrate F7).
- The template classifier ships benefit-source-generic
  (`parseBenefitPhrase`; `parseWithCaptain` a thin caller) — the same
  phrases recur in non-captain traits (kobold signifer) (substrate F8).
- The stacking one-home is a pure `participation → per-target
  breakdown[]` stored on the resolution entry; commit applies the
  breakdown — the reaction family's halvers/retargeters modify data,
  not a number computed inside commit (substrate F9).

## Nits (folded)

- Participation is an ordered array `[{targetId, memberIds}]`, not a
  Record — presentation order is R-0024's damager choice and must be
  hash-witnessed (substrate F10).
- Search for Hidden Creatures has no roll-bearing compiled artifact
  in-pin — squad-Search rides as a directive until the prose feature
  compiles; stated on the R-0036 card (substrate F11).
- Area-signature dispatch rides the same extracted pipeline + the same
  per-member debit step (substrate F12); overlapping bursts from 2+
  area-signature members dedup to one instance per target — the asserted
  target list is the union (rules-lawyer 10).
- Charge-keyword signatures (19): a member may deliver the signature via
  the Charge main action (`partOf` composition); movement is
  table-asserted (no map substrate) — card note (rules-lawyer 9).
- R-0037's authority is the printed "treated as one strike", not R-0026
  (which governs a squad's own inbound weakness/immunity) — reworded
  (canon F4).
- The pitling worked example + p.9 sidebar are durably recorded on the
  R-0034 card (they are PDF-recovered and were not yet in any committed
  record) (canon F5).
- Survey §2 notes the 7th `squad_maneuver_artifacts` hit
  (`skill.intrigue/hide`) is a selector false-positive, excluded —
  stated, not silently dropped (canon F6).

## Gate-2 PDF confirmation (ran before rev 1 froze)

Complete §Squad Action passage recovered from Monsters p.8 incl. the
pitling worked example (+ p.9 sidebar restatement); pin reconciliation
exact (Spit tier-2 "4 poison damage", free strike 2). Six With-Captain
statblock entries confirmed EXACT (bugbear snare, unguloid, lizardfolk
tonguer, war-dog sparkslinger, lizardfolk shellguard, bugbear
knightmare). §Organized as Squads recovered (Monsters p.7). Confirmed
silences: no squad splitting, no ranged/melee mixing within one squad
action, no rule for area abilities used BY a squad. The sparkslinger
"Lightning spread" referent is the ability's own printed Effect
parameter (Monsters p.304). The general captain-benefit taxonomy
sentence: "Usually, this benefit is either a damage boost, a bonus to
speed, or additional Stamina" (Monsters p.9).
