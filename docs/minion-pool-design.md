# Minion squad Stamina pools — design (rev 1, 2026-08-25)

Slice: mechanize the shared squad Stamina pool for Director-controlled
minions — the oldest named follow-up from the power-roll cluster. Today
`damageAutomationBlocker` routes **every** damage instance against any of the
**116 in-pin minion statblocks** to the table ("minion squads share a Stamina
pool the engine does not yet mechanize"), and `regainAutomationBlocker` does
the same for regains. This arc replaces the damage-side blocker with real
pool math and upgrades the regain-side blocker to its rule-mandated form.

Counts at pin `520553438a4e8d199bfaaf676b8aa9bd273f4d61`: 437 monster
statblocks carry parsed stats; 116 have `organization: Minion` (all 116 also
carry a `with_captain` entry; 10 of those are Stamina-type benefits; 21
distinct benefit strings). The Summoner book's separate minion rule set
(squad pools with summoner-overflow and largest-single-instance strikes) is
**entirely excluded from the pin** (227 summoner entries, 0 included) and is
NOT part of this design. Effect-line accounting (67 automated / 1,621 table)
is unchanged by this arc — it automates a *dispatch path*, not Effect lines.

Gate-3 status: **R-0023..R-0028 are CANDIDATES — nothing below auto-applies
until the user accepts the rulings.** Canon research: Gate-1 verbatim
extraction from the pinned corpus (read-only lane, 2026-08-25) + Gate-2 page
confirmation in `Draw_Steel_Monsters_v1.01.pdf` (rulebot lane, same day; all
passages verbatim; pages cited below are book pages).

## 1. Canon base (verbatim anchors; full quotes on the ruling cards)

- **Organization** — "Minions are weaker enemies who are made to die fast and
  threaten heroes en masse." [rule/organization/minion, Monsters p.4]
- **Squads** — "Minions with the same name (for instance, goblin sniper) can
  be organized into squads of up to eight creatures." [rule/monster/squad,
  Monsters p.7]
- **Shared pool** — "Each squad of minions shares a Stamina pool, with
  initial Stamina equal to each individual minion's Stamina multiplied by the
  number of minions in the squad. … Whenever a minion in a squad takes
  damage, the squad's Stamina pool is reduced by a number equal to the damage
  taken. Because minion Stamina is tracked as a pool, minions can't be
  winded, can't regain Stamina, and can't gain temporary Stamina during a
  battle." [chapter/monster-basics §Shared Low Stamina, Monsters p.7]
- **Dropping One Minion** — one death per per-minion-Stamina reduction; the
  damaged minion dies; the damager chooses among several damage-takers;
  "When a minion is taken out of the fight, they count as being reduced to 0
  Stamina for triggering effects." [ibid. §Dropping One Minion, p.7]
- **Dropping Multiple Minions** — "If a minion takes damage from any source
  except an area effect (including abilities with the Area keyword)" and the
  reduction covers two or more minions' Stamina, multiple die: damage-takers
  first, then "the minions nearest to those taken out suffer the same fate."
  [ibid. §Dropping Multiple Minions, p.8]
- **Area effects** — "such area effects can kill only those minions who are
  in the area"; worked example: tier-3 Incinerate deals 6 to each of three
  Stamina-5 spinecleavers in the area → "the minion pool loses 15 Stamina
  instead of 18, leaving the other minions in the squad unscathed."
  [ibid. §Minions and Area Effects, p.8]
- **Weakness/immunity** — "apply the effects to the minion's squad once, even
  if multiple minions share the same immunity or weakness. These effects are
  the last things applied when calculating damage." [ibid. §Minion Weakness
  and Immunity, p.8]
- **Pool prep** — squads lose a minion at each written-out damage total
  (5/10/…/40 for eight spinecleavers). [ibid. §Prepping Minion Stamina
  Pools, p.8]
- **Captains** — non-Mount, non-minion, shared language; "A squad of minions
  can have only one captain, and a creature can't be captain to more than one
  squad of minions."; "A captain's Stamina isn't added to a minion squad's
  Stamina pool"; benefits per the stat block's "With Captain" entry; on loss,
  "a new allied creature can become that squad's captain at the start of the
  next round (no action required)". [rule/monster/captain, Monsters p.9]
- **Encounter building** — bought four at a time; "arranged into squads of
  any size you need, up to a maximum of eight minions in a squad."
  [chapter/monster-basics §Minions Come in Groups of Four, p.12]

Book-silent gaps (declared by rule class, all found by the Gate-1 lane and
each covered by a candidate or a named scope cut): non-area overflow past
the last pool point; conditions at squad level (core has NO squad condition
rule — the Summoner book's is out of pin); mid-combat pool recompute when a
Stamina-type captain benefit attaches/detaches; splitting/merging squads
mid-combat; squad-count bookkeeping beyond build guidance.

## 2. Gate-3 ruling candidates

**R-0023 — Squad substrate & pool initialization.** Minions remain
individual participants (they occupy space, are targeted, take conditions
per-member); a **squad** is new encounter-level state — members, per-minion
Stamina, pool current/max, captain — the terrainFacts precedent. Pool
initializes to perMinionStamina × memberCount at seeding (printed formula);
membership is asserted at encounter build (printed: Director arranges).
Adjudications: a mixed-name squad is **refused** (the pool formula needs one
per-minion Stamina — canon-incoherent over-state, the zipper class); a squad
of more than eight **warns-and-applies** (printed bound, but the math stays
coherent — permissive default).

**R-0024 — Non-area damage: full decrement, threshold kills, overflow
discarded.** A damage instance against a squad member reduces the pool by
the full post-modifier damage (printed); kills = per-minion-Stamina
threshold crossings, cumulative (`kills == floor((poolMax − pool) /
perMinion)` is the standing invariant); the damaged (bound) minion dies
first automatically; additional victims are "nearest" (spatial — not
modeled), so the dispatch may name them and otherwise the engine records N
unattributed kills with a table directive for identity selection. Every
death receipts "counts as reduced to 0 Stamina for triggering effects."
Overflow past pool 0 is book-silent: proposed **discarded** (pool floors at
0; squad eliminated when pool reaches 0 / members exhausted).

**R-0025 — Area damage: per-minion contribution cap = kill cap.** For an
area source (Area-keyword ability — the printed discriminator — or a
dispatch-asserted area flag for manual/hazard damage), each bound in-area
minion contributes `min(perTargetDamage, perMinionStamina)` to the pool.
This is the only arithmetic consistent with the printed 15-not-18 Incinerate
example, and it makes "can kill only those minions who are in the area"
structural: contributions ≤ perMinion each ⇒ threshold crossings ≤ bound
targets. In-area membership = the dispatch's bound targets (no spatial
model — the established binding pattern).

**R-0026 — Squad weakness/immunity: once, last.** When a damage instance
touches a squad, the squad's damage weakness/immunity applies **once** to
the summed pool contribution, as the **final** step before kill accounting
(printed: once per squad, "the last things applied"), using the existing
one-home weakness/immunity semantics (highest applicable of each). The
composition with R-0025's per-minion cap (cap first, then the single
squad-level adjustment) is book-silent — the example carries no
weakness/immunity — and is the proposed reading.

**R-0027 — Rule-mandated exemptions & death semantics.** Squad members are
never winded/dying (printed "can't be winded" + pool tracking); regain,
temporary-Stamina, and Recovery-spend bindings against a squad member become
**rule-mandated per-binding refusals** with receipts — upgrading today's
"pool not mechanized" table routing to its printed ground ("can't regain
Stamina … during a battle"); refusal, not warn-and-apply, because no
individual Stamina exists to receive it (canon-incoherent over-state). A
member taken out is dead-for-this-encounter with the 0-Stamina trigger
receipt; knockout-instead is the Director's existing assertion (R-0005
family).

**R-0028 — Captain attachment substrate; benefits surface, not yet
automate.** The engine tracks attachment: Director attach/detach intents;
singular captainId (attaching over an existing captain warns and replaces —
the Director is exercising the printed one-captain rule); one squad per
captain enforced the same way; eligibility beyond non-Mount/non-minion
(shared language) is table-asserted. Captain Stamina stays individual
(printed). "With Captain" benefits render **verbatim** on the squad surface
while a captain is attached (tier-3: engine offers the fact, table applies);
automating the 21 benefit forms is a named follow-up family — the edge forms
want the grant substrate, and the 10 Stamina-type benefits are blocked on a
book-silent mid-combat pool-recompute question that needs its own ruling.
Succession ("start of the next round, no action required") is the Director
re-attaching; no automation.

## 3. Engine design

**Schema (v4 → v5 + migration):**
- `EncounterStateSchema` + `squads: SquadStateSchema[]` (default []) —
  `{squadId, name, perMinionStamina, pool: {current, max}, memberIds,
  deadMemberIds, captainId: string | null}`.
- Squad members keep `stats` (organization Minion) and carry
  `stamina: null` — the pool is the ONE home for squad vitality; the
  invariant oracle rejects a squad member with individual stamina.
- Migration stamps v5, defaults `squads: []`.

**One homes (damage.ts, beside the existing ledger):**
- `applySquadDamage(squad, contributions, …)` — pool decrement (R-0024/25
  caps applied by the caller per binding), single squad-level
  weakness/immunity step (R-0026) reusing the existing helper, kill
  accounting via the floor invariant, death receipts (R-0027), overflow
  floor at 0.
- `isMinion` (already extracted, 1d1d7b9) + `squadOf(state, participantId)`
  membership lookup.
- `damageAutomationBlocker` drops its minion branch (members of a seeded
  squad route to the pool; a minion participant with NO squad still routes
  to table — seeding is the boundary); `regainAutomationBlocker`'s minion
  branch becomes the R-0027 rule-mandated refusal.

**Dispatch plumbing:** ability executions already bind targets and (since
the next-roll family) carry header keywords — the Area keyword selects the
R-0025 path; `apply-damage` (manual) gains an optional `area: boolean` +
optional `minionKillVictims: string[]` for named extra kills (R-0024).
Multi-target instances against one squad aggregate their contributions into
ONE `applySquadDamage` call (required by R-0026's once-per-squad step).

**Invariants:** every pool delta claimed; `pool.current ∈ [0, pool.max]`;
`pool.max == perMinionStamina × (memberIds.length + deadMemberIds.length)`;
`deadMemberIds.length == floor((pool.max − pool.current) / perMinionStamina)`;
membership two-way reconciliation (no phantom members — the terrainFacts
pattern); weakness/immunity claimed at most once per squad per instance; no
squad member with individual stamina or a winded/dying derivation.

**Golden channel:** the two printed worked examples reproduced exactly as
conformance fixtures — the spinecleaver 40-pool threshold walk (p.7/p.8
prep table: kills at 35/30/25/20/15/10/5/0) and the Incinerate 15-not-18
area cap (p.8). Plus the skitterling drift-guarded fixture gains a
squad-seeded E2E.

**Hosts:** Convex view: squad cards (pool current/max, living/dead members,
captain, verbatim With-Captain entry when attached), Director attach/detach
+ kill-identity selection pass-through; server re-verification per the
established pattern. CLI: squad vitals + `attach:`/`detach:` + victim
naming. Table UI: squad card with pool bar + member chips.

## 4. Deliberate scope cuts (tracked, not hidden)

- **Squad turns / Acting Together / Squad Action / Minion Maneuvers / Free
  Strike Together** (Monsters p.8–9): the action-economy arc's material —
  minion turn shape, one-roll squad attacks, free-strike summation. Nothing
  here blocks pool math; abilities already resolve per-target.
- **With-Captain benefit automation** (R-0028): named follow-up family;
  Stamina-type benefits carry their own book-silent recompute ruling.
- **Mount-role eligibility gate** (R-0028): the printed captain eligibility
  is "Any non-Mount, non-minion creature, who speaks a language that a
  squad of minions can understand" — `statblockStats` parses no roles (and
  no languages), so the engine verifies only non-minion; non-Mount status
  and the shared language are table-asserted and named in the attach
  receipt. Role parsing lands with whatever future arc needs roles (Mount
  rules themselves are unimplemented).
- **Manual multi-contribution area payload**: the manual `apply-damage`
  dispatch carries ONE contributor, so a manual area instance that damaged
  several squad members cannot be batched into one dispatch the way ability
  executions are — and the once-per-squad weakness/immunity step [R-0026]
  would apply once per dispatch instead of once per instance. The engine
  warns on exactly this shape (area dispatch + squad target + a
  weakness/immunity row); a multi-target manual payload is the tracked fix.
- **Dead-captain nudge** (R-0028): no table-directive fires when an
  attached captain dies — detach remains a manual Director act. The nudge
  is a natural hook for the With-Captain benefit follow-up family (which
  must track captain lifecycle anyway).
- **Demoralized** optional rule (pool set to living-member count, Monsters
  chapter p.964 region): optional Director rule; a future Director
  pool-override intent, not this slice.
- **Splitting/merging squads or reinforcements mid-combat**: book-silent;
  the Director re-seeds (tear down + new squad) at the table for now.
- **Conditions on squads**: core is silent; conditions stay per-member
  (members are participants) — nothing new ships, noted so the boundary is
  visible.
- **Summoner-book minion rules**: out of pin, out of scope (see header).
