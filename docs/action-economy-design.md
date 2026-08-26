# Action economy + two-phase commit — design (rev 2, 2026-08-26)

Rev 1 was red-teamed by four independent lanes (canon fidelity, substrate
scalability, rules-lawyer counterexamples, Gate-2 PDF confirmation); the
findings ledger is `docs/action-economy-redteam.md`. Rev 2 folds in all
blockers. Grounding inputs, all at accepted pin
`520553438a4e8d199bfaaf676b8aa9bd273f4d61`:

- Deterministic shape survey `.artifacts/canon/action-economy/survey.json`
  (2,593 records; regexes recorded) — with the red-team's dash-census
  correction (157 not 156; see §2 R-0029).
- Verbatim rule dossier (bundle rule/feature/condition artifacts only; this
  bundle has NO chapter or glossary artifacts).
- Gate-2 PDF confirmation: all 20 card anchors EXACT with page numbers;
  the "Acting Together" minion-economy prose recovered verbatim from
  Monsters p.8–9 (absent from the markdown bundle — see R-0033).
- Prework landed first: engarde 5eac0af (`collectSquadContribution` +
  generic `walkClaims`), zero behavior change.
- Prior rulings bearing on economy/timing: R-0001, R-0002, R-0012..R-0016,
  R-0018, R-0024, R-0027, R-0028.

Everything quoted is byte-verbatim from the pinned bundle (inline scc links
elided where marked; any other elision is marked with bracketed ellipsis),
except the Acting Together prose, which is PDF-verbatim and flagged as such.

## 1. Canon base (verbatim anchors; full quotes + pages on the ruling cards)

**The turn budget** (`rule/combat/turn`; Heroes p.267): "Each creature in
combat—whether hero, adversary, or something in between—gets to take a
**main action**, a **maneuver**, and a **move action** on their turn
[…] Each combatant can perform their maneuver and main action in any
order, and can break up the movement granted by their move action before,
after, or between their maneuver and main action however they like. You
can also turn your main action into a move action or a maneuver, so that
your turn can alternatively consist of two move actions and a maneuver, or
two maneuvers and a move action."

**Once per round** (`rule/combat/combat-round`; Heroes p.266): "Unless an
ability or special rule allows them to do so, any creature who has taken a
turn during a combat round can't act again until a new round begins."
First side: "the Director or a player they choose rolls a d10. On a 6 or
higher, the players determine who goes first—the heroes' side or the other
side. Otherwise, the Director decides which side goes first." — and the
automatic case: a side that is entirely surprised cedes first action.
Side alternation by choice, tail-of-round free order, and "The side whose
members acted first during the initial combat round goes first in all
subsequent rounds." (Heroes p.267).

**Triggered actions** (`rule/combat/triggered-action`; Heroes p.267): "You
can use one triggered action per round, either on your turn or another
creature's turn, but only when the action's trigger occurs." Free
triggered actions: same rules, "doesn't count against your limit of one
triggered action per round." Simultaneous triggers: player-controlled
creatures decide among themselves first, then the Director. "Any effect
that prevents you from using triggered actions also prevents you from
using free triggered actions." The rule's own example is a whole-turn
scheduling grant: "a shadow hero can use their Hesitation Is Weakness
ability to take their turn in response to the trigger of another hero
ending their turn."

**Free maneuvers** (`rule/combat/free-maneuver`; Heroes p.267): same rules
as a maneuver, "you can typically take as many free maneuvers as you
like", on your turn (R-0001: turn-only, ruled and user-approved; R-0001's
glossary sentence is not in this bundle — the ruling stands on its
recorded Gate-3 evidence). Prevention coupling: "Any effect that prevents
you from using maneuvers also prevents you from using free maneuvers."

**Budget restrictions**: dazed (`condition/dazed`; Heroes p.77) — "can do
only one thing on their turn: use a main action, use a maneuver, or use a
move action," plus no triggered/free triggered/free maneuvers; surprised
(`rule/combat/surprised`; Heroes p.266) — no triggered/free triggered
actions. Printed escapes pierce restrictions: crit's grant works "even if
you are dazed" (Heroes p.75), and 22 solo malice sheets carry "They can
use this feature even if they are dazed" (Solo Action class); tactician
Out of Position fires "even if you are surprised." Escapes are a general
grant property, not a crit special case.

**Post-resolution and scheduling grants**: critical hit
(`rule/combat/critical-hit`; Heroes p.75) — "immediately take an
additional main action after resolving the power roll, whether or not
it's your turn and even if you are dazed"; "additional main action"
appears in 34 artifacts (6 statblocks, 23 malice features, 3 hero-side,
2 rule artifacts). Whole-turn scheduling grants are corpus-wide: shadow
Hesitation Is Weakness ("You take your turn after the triggering hero" —
with an anti-chain constraint), tactician This Is What We Planned For,
troubadour Patter Song (scheduling as a tier outcome), censor Prescient
Grace (insertion *before* the triggering enemy's turn), null Time Loop
("You take a bonus turn immediately after the triggering creature").
Solo turn allowances: exactly 21 statblocks print "two turns each round";
Ajax prints "takes up to three turns each round. He can't take turns
consecutively. Additionally, he can use three triggered actions in a
round while he isn't dazed." Every two-turn solo also prints "They can't
take turns consecutively." War Dog Breaker's Breaking Point *inserts* a
full turn mid-damage-application ("they delay that effect […] and
immediately take a turn, regardless of whether they have already taken a
turn this round").

**Villain actions** (`rule/monster/villain-action`; Monsters p.4): always
three, each once per encounter, "no more than one villain action can be
used per round" even across creatures, usable "at the end of any other
creature's turn during combat."

**Common actions are features**: 17 artifacts — 4 main actions (Charge,
Defend, Free Strike, Heal), 10 maneuvers (Aid Attack, Catch Breath,
Escape Grab, Grab, Hide, Knockback, Make or Assist a Test, Search for
Hidden Creatures, Stand Up, Use Consumable), 3 move actions (Advance,
Disengage, Ride). These are PROSE features; the roll-bearing halves live
in 5 companion ability artifacts (`feature/ability/common/`: grab,
escape-grab, knockback, melee-weapon-free-strike, ranged-weapon-
free-strike) stitched by printed reference. Charge composes: "If the
creature has an ability with the Charge keyword, they can use that
ability against the target instead of a free strike" — the inner ability
carries its own `Main action` header (one printed cost, two headers).

**Reaction timing classes (all printed, mostly keyword-free)**: the
dominant triggered-action pattern modifies its own triggering event with
no placement keyword — "You take half the damage" (Repel, In All This
Confusion), "halves the damage" (ghost Shriek, dwarf shieldwall), "The
ally is the target of the triggering strike instead" (goblin monarch),
"would be force moved → new target instead" (fury Lines of Force);
targeting-step reactions fire before any roll exists (devil Devilish
Charm: tier 1 retargets the strike, tier 3 imposes "a bane on the
strike"); tier-outcome mutations land post-roll pre-commit (angulotl
Tongue Slap: "The outcome of the strike's power roll is reduced by one
tier", triggered only by non-crits); explicit-"before" texts exist
(kobold Testudo!, Anticipating Strike "This strike resolves before the
triggering movement or main action"); replacement interceptors gate
death itself ("Whenever you would die, you can spend a Recovery to
regain Stamina instead"; giant zombie "they instead have 50 Stamina").

**Two-phase evidence** (`rule/dice/power-roll`, `rule/dice/ability-roll`;
Heroes p.4, p.74): downgrade is chosen after rolling ("Whenever you make
a power roll, you can downgrade it to select the outcome of a lower
tier"); "Unless otherwise indicated, any effects that are determined by
a power roll's tier outcome occur after the power roll's damage has been
dealt to all targets. […] If an ability creates multiple effects, those
effects resolve in the order in which they are presented"; surge spends
and hero tokens are printed post-roll windows (future families); potency
adjustment abilities manipulate potencies mid-resolution; bleeding fires
"after the main action, triggered action, or power roll is resolved.
This Stamina loss can't be prevented in any way, and only happens once
per action."

**Survey facts** (red-team-corrected): 1,878 ability header tables carry
an action-cost value; closed observed vocabulary Main action / Maneuver /
Triggered action / Free triggered action / No action / Free maneuver /
Move action (+ case/spelling variants), `Main action (Adjacent creature)`
(22 headers, 6 siege-engine fixtures — the cost is paid by an adjacent
OPERATOR, not the fixture), and `-` — **157** cells: 156 under `Villain
Action N` name lines + Wave of Blood (the delayed end-of-round tail of
vampire-lord's Sacrifice, NOT an independent villain action). Two printed
tables are byte-malformed (gloom-dragon Absence of All Light: separator
row missing its trailing pipe; lizardfolk Net Trap: header row missing
its leading pipe) — known values behind byte defects, a distinct class
from unknown values. Per-ability once-per-round caps are a printed family
(Ride ×2 counters, siege-engine actions, devil Barbed Tail, memonek
Keeper of Order — a CAPPED free triggered action, shadow Time Bomb).
Sub-actors legitimately spend within another creature's turn slot
(Xorannox's eyestalks, gloom-dragon's illusion, blackcap ash clones).
Troubadour `No action` performances carry real consumption rules
(Routines: start-of-round exclusive slot, gated on "not dazed, dead, or
surprised"; Medley: two slots) — scoped out, see §4.

## 2. Gate-3 ruling candidates (nothing auto-applies until accepted)

- **R-0029 — action-cost vocabulary normalization + byte-defect repair.**
  The compiler normalizes surface variants to a closed enum: main-action,
  maneuver, move-action, triggered-action, free-triggered-action,
  free-maneuver, no-action, villain-action. Case/spelling variants fold
  (`Triggered` → triggered-action, etc.). `-` → villain-action when the
  ability sits under a `Villain Action N` name line (156 of 157);
  **Wave of Blood normalizes to no-cost sub-ability** resolved by
  Sacrifice's delayed end-of-round effect — it inherits none of the
  villain-action constraints (which it would violate: end-of-round
  timing, a second villain action that round, outside the three).
  `Main action (Adjacent creature)` → main-action with the parenthetical
  retained verbatim; the budget debit lands on the DISPATCHING OPERATOR
  (the fixture takes no turns) — stated so it isn't rediscovered as a
  bug. The two byte-malformed printed tables (gloom-dragon Absence of
  All Light, lizardfolk Net Trap) get permissive-regex hardening so
  their printed costs compile (the alternative — silently costless
  abilities, one of them a villain action invisible to the villain-action
  economy — is a canon divergence). Unknown FUTURE values refuse to
  normalize (residue), never guess.
- **R-0030 — permissive posture for economy violations, receipt-aware.**
  Over-budget use, off-turn action use, acting again after taking a
  turn, out-of-alternation order, consecutive solo turns, per-ability
  once-per-round cap breaches, and dazed/surprised-restricted use are
  WARN-AND-APPLY: a rule-violation receipt naming the printed rule, and
  the dispatch applies. Grants (see §3) consume silently — no warning —
  and carry escape flags (`ignoresDazed`, `ignoresSurprised`,
  `offTurn`) so printed escapes (crit, Solo Action malice spends granted
  manually by the Director until the malice family lands, Out of
  Position) never produce spurious warnings. The invariant oracle models
  the RECEIPTS: a counter above capacity WITH a matching violation
  receipt is a legal state; without one it is corruption. Refusals stay
  structural only (unknown participant/ability, malformed payload,
  hash-mismatched commit). Extends R-0001's engine consequence to the
  whole economy.
- **R-0031 — reaction interception points + classification residue.**
  The books define WHEN a triggered action may be used, never how it
  sequences against its trigger (PDF-confirmed silence; the only printed
  ordering rules are the simultaneous-trigger rule and the death-effects/
  forced-movement rule, which stay as printed). Proposed: ability
  resolution exposes five named interception points — **targeting**
  (declared, pre-roll), **rolled** (tier known, pre-commit),
  **pre-application** (damage/effect computed, not yet applied),
  **applied** (post-application), and **replacement** (would-die /
  would-be-reduced interception inside application). Reaction texts are
  classified onto points by DETERMINISTIC closed templates only ("halves
  the damage" / "takes half the damage" → pre-application; "is the
  target … instead" / "chooses a new target" → targeting or
  pre-application per trigger; "outcome … is reduced by one tier" →
  rolled; "before X is resolved" → per text; "after X resolves" →
  applied; "would die … instead" → replacement). An UNCLASSIFIED
  reaction defaults to **applied** and carries its verbatim text on the
  receipt for table adjudication — honest residue, never silent
  misresolution. This arc ships the points and the economy (counters,
  warn posture); reaction-EFFECT automation is the named follow-up
  family that plugs into the points.
- **R-0032 — the resolution stack + explicit commit.** A rolling ability
  opens a resolution entry on a keyed STACK (entries nest: a triggered
  ability rolling inside an open window, Escape Grab's interleaved free
  strike, Breaking Point's inserted turn). The entry stores the payload
  HASH, the complete roll receipt (all recompute inputs including
  per-target edge/bane pools per R-0014), and the modification list (a
  discriminated union — downgrade | tier-adjust | potency-adjust |
  retarget | damage-halve | future-family kinds — each with a declared
  apply contract). Commit is an EXPLICIT dispatch that re-supplies the
  payload; the engine verifies the hash (the Convex-boundary integrity
  precedent) and executes against COMMIT-TIME state (target drift since
  the roll produces the standard degradation receipts, never
  interleaving-dependent silence). Then: damage to all targets → tier
  effects in presented order — carrying the printed "Unless otherwise
  indicated" escape — then bleeding's once-per-action loss at
  commit-close (unpreventable, keyed by resolution entry so Charge's
  composed strike bleeds once). Hosts pipeline commit for one-tap UX;
  the engine never auto-commits (it cannot know who holds reactions).
  Modifications apply in dispatch order; a downgrade dispatched after a
  reaction already consumed that outcome is warn-and-apply with the full
  history on the receipt (permissive posture — the Director adjudicates
  retro-incoherence). A modification after commit is a warn-and-receipt
  table correction, not a reopen.
- **R-0033 — adopt the PDF-recovered minion action economy.** The
  bundle's `rule/monster/squad` forward-references "Acting Together,"
  which is absent from the markdown pin; the Gate-2 lane recovered it
  verbatim from Monsters p.8–9 (full prose on the card): each minion on
  the squad's shared turn takes "only a move action and a main action, a
  move action and a maneuver, or two move actions"; a minion taking an
  individual maneuver "can't participate in their squad's main action or
  maneuver during the turn"; minions make opportunity attacks but
  "usually don't have bespoke triggered actions." Proposed: rely on the
  PDF-confirmed text (the R-0001 precedent the user already approved
  once) to automate the minion per-member budget within the squad's
  single turn slot (printed: squads occupy one turn choice; "All members
  of a minion squad act together on the same initiative"). The squad
  ATTACK math (one roll for the squad, +free-strike-value stacking for
  2–3 minions on one target, squad crit granting participating minions
  another main action, Minion Maneuvers together, Free Strike Together)
  is recorded verbatim in the rulings log for the squad-attack follow-up
  family — not scoped into this arc. Alternative if declined: minion
  member budgets stay table directives.

## 3. Engine design

**Schema v5 → v6.** Additions:

- Encounter-level `turnState`: `{round, firstSide, sideToChoose,
  activeTurnId: participantId | squadId | null, lastTurnId,
  turnsTaken: Record<id, count>}` — a count map, not a set (solos take
  2, Ajax 3; `turnAllowance` per participant defaults 1, overridden by
  grant or seeded trait). `lastTurnId` serves the no-consecutive-turns
  warn. Global slots walk under a documented singleton-key convention in
  `collectClaimRows`.
- Per-participant `actionBudget`: a Record keyed by the actionCost enum
  (not a closed struct — a future cost category is an enum member, not a
  schema migration), consumed/granted counters. The enum→debit mapping
  (no-action, free-maneuver debit nothing; free-triggered-action debits
  nothing but honors the prevention coupling; villain-action debits the
  encounter-level villain economy, not a personal counter) lives in ONE
  exported table — a `CONSTANTS` entry per the canon-constants gate.
- Per-participant `triggeredThisRound` counter + per-participant limit
  (default 1; Ajax's 3 is seeded trait data, conditionally not-dazed —
  the condition rides an escape-flagged grant).
- Per-ability usage counters: `abilityUses: Record<abilityKey,
  {round, turn, encounter counts}>` — the printed once-per-round family
  (Ride's two counters, Keeper of Order's capped free-trigger, siege
  actions) can at least warn correctly; caps compile from the closed
  template "only once per round" / "once per round" where present.
- Encounter-level `villainActions`: `{usedThisRound: bool,
  usedByAbility: string[]}` (three-per-creature, once each, ≤1/round).
- Encounter-level `resolutionStack`: ordered entries
  `{resolutionId, actorId: participantId | squadId, payloadHash,
  rollReceipt, phase, modifications[]}` per R-0032. `actorId` is widened
  like `activeTurnId` (rev 2.1, squad-attack red-team): squad signature
  attacks open squad-owned entries, and end-turn force-commit already
  names squad turns as ending actors — participant-only would force a
  v6→v7 migration one family later. Invariants check stack coherence
  (LIFO discipline with named-insertion exceptions, hash presence,
  entries resolved by encounter end — warn, not corruption, on
  boundary-crossing entries: Breaking Point is printed-legal).
- **Generalized grants**: the v3 `grants` slot becomes a discriminated
  union `kind: 'next-roll' | 'action' | 'turn'`. `action` grants carry
  `{cost: enum, magnitude, escapes: {ignoresDazed, ignoresSurprised,
  offTurn}, expiry}` (crit compiles to one; Director manual grant intent
  covers malice Solo Actions until that family). `turn` grants carry
  `{allowance | insertion, constraint: 'no-consecutive' | …}` — the
  scheduling family (Hesitation Is Weakness etc.) plugs in later; this
  arc ships the shape plus Director-asserted scheduling. Migration wraps
  existing entries as `kind: 'next-roll'`; per-kind consumption/expiry
  config lives in the grant registry, not per-call-site code.

**Prework-2 (first build commit, zero behavior change):** extract the
invariant SET-RECONCILIATION generic (three structural copies today:
conditions, grants, terrain facts — the resolution stack and generalized
grants would be copies four and five) and a BOUNDARY-SWEEP REGISTRY
(per-slot config for end-of-turn / start-of-round / end-of-encounter
behavior — today's hand-appended sweep calls in `apply-intent.ts` are
the accretion point every future family would edit). The sweep analogue
of `walkClaims`.

**Round/turn flow.** `begin-combat` (server-rolled d10; the printed rule
assigns the 1–5 choice to the Director and the surprised-side automatic
case; any Director deviation from the rolled assignment is
warn-and-apply — project policy, not printed authority). `start-turn`
warns per R-0030 (already-acted without allowance, out-of-alternation,
consecutive solo turns) and never computes round advance.
`advance-round` is DIRECTOR-ASSERTED: it warns listing living
participants with unspent turns (the printed round definition is
advisory; dead/skipped/sub-actor participants make "all have acted"
uncomputable), then runs the start-of-round sweeps from the registry
(budget resets, triggered counters, villain per-round flag, grant
expiries). `end-turn` force-commits any open resolution entries owned by
the ending actor (commit, then `endOfTurnSweep` — printed damage is
never discarded; saving throws run after the forced commit so a
just-imposed save-ends condition saves next turn, not this one), then
sweeps per registry. Sub-actors (eyestalks, illusions, ash clones) spend
budgets within the owner's active turn without entering `turnsTaken` —
the invariant tolerates budget spend by declared sub-actors; the
declaration is seeded trait data.

**use-ability / commit.** `use-ability` consumes per the one debit
table (or an `action` grant, silently); a `partOf` payload reference
implements Charge composition — the inner Charge-keyword ability
consumes the parent's already-debited main action, never a second one
(and bleeding keys once on the outer resolution). Rolling abilities open
a resolution entry; non-rolling abilities apply directly (no window —
one dispatch, unchanged UX). `commit-resolution` per R-0032.
`use-triggered-action` references a trigger occurrence where one exists
(a receipt-visible event id) or asserts one at the table (Ride's
triggerless free-trigger dispatches without an occurrence);
one-per-round enforced as warn; free-triggered bypasses the round
counter but honors per-ability caps and the prevention coupling
(both couplings: triggered→free-triggered AND maneuver→free-maneuver).
`use-villain-action` enforces the three printed constraints as warns.
R-0001 wiring: the off-turn effect-ending maneuver warn, tested by
pilot step 7 — the first mandated test of the arc.

**Common actions.** Compile the 5 companion ability artifacts through
the existing pipeline (they are ordinary statblock-shaped abilities).
The 12 prose features: those whose text the existing grammar covers
execute (Catch Breath's Recovery spend has its schema-v4 home; Defend's
until-start-of-next-turn double bane fits the grant machinery); the
rest carry exact text as table directives — accounted, never dropped.
Counts on the accounting card: 17 features + 5 companions.

**Hosts.** Convex view gains turnState (round, active turn, turns-taken,
budgets, resolution stack, villain economy); Director mutations for
begin-combat / start-turn / advance-round / grants / villain actions;
CLI verbs `turn` / `endturn` / `advround` / `commit` / `convert` /
`grant`; web Table: turn tracker rail, budget chips, open-resolution
card with commit + modification affordances. New drift-guarded E2E
fixture: a two-side encounter walking a full round with a triggered
action, a crit grant, and a squad turn.

## 4. Deliberate scope cuts (tracked, not hidden)

- **Reaction-effect automation** (the halvers/retargeters/interceptors,
  ~30+ closed-template artifacts + Devilish Charm's test-inside-trigger)
  — the named follow-up family; this arc ships the interception points,
  the classification templates' RESIDUE accounting, and the economy.
- **Turn-scheduling ability automation** (Hesitation Is Weakness,
  Patter Song, Prescient Grace, Time Loop, This Is What We Planned For,
  wode-elf guerrilla) — the `turn` grant kind ships; the abilities stay
  table directives until their family; Director-asserted scheduling
  covers play meanwhile.
- **Surge spends, hero tokens, Heroic Resource timing** — future
  families; the modification union + stack are their slots. Hero-token
  saving-throw windows attach to save rolls later; save sites are not
  windowed this arc.
- **Malice accrual/spends** — malice family; villain actions ship (pure
  economy); Solo Action dazed-escapes ride Director manual grants with
  escape flags meanwhile (no spurious warns).
- **Would-die replacement automation** (Life enhancement, stasis field,
  giant zombie, Tempting Offer, Breaking Point) — the `replacement`
  interception point ships as a named point with table-directive
  receipts; automation deferred. 0-Stamina triggers (incl. the squad
  count-time triggers) fire only after the replacement point passes.
- **Troubadour performances** (`No action`, Routines/Medley slot rules)
  — normalize to no-cost; the performance-slot state is the troubadour
  family's; Routines text rides the receipt as a directive.
- **Squad ATTACK math** (one-roll squad actions, free-strike-value
  stacking, squad crit, Minion Maneuvers together, Free Strike Together)
  — recorded verbatim in the rulings log for the squad-attack family;
  only the minion per-member BUDGET automates this arc (per R-0033, if
  accepted).
- **Start-of-turn effect automation** — the registry fires the boundary
  event; ordering is a declared known-unknown by rule class (books
  silent, PDF-confirmed).
- **Delay/ready** — no such mechanism exists (bundle + PDF confirmed);
  nothing to build. Alternative Turn Order sidebar + argument timer are
  table procedure.
- **Movement math** — no map substrate; move-action budget ships,
  spatial math stays table-asserted (flat-resource precedent).
- **Mounted-combat turn pairing** — needs the Mount role
  (statblockStats parses no roles; minion-pool cut); mounts act as
  ordinary participants meanwhile. Ride's mount-side once-per-round
  counter still warns via `abilityUses`.
- **Common-actions stitched-model deferral** — Defend/Catch Breath prose
  execution is deferred and their costs stay dispatch-asserted pending a
  path-derivation ruling; the 17 `feature.common.*` prose features + 5
  `feature.ability.common` companions are count-frozen as accounted
  directives/compiled abilities (`packages/canon/src/common-actions.test.ts`).
- **Known flag (b)** — target-side reactive test rolls open no resolution
  entry (R-0032 read as: the ACTOR's ability rolls open entries); this is
  the reaction family's extension point.
