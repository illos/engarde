# Canon rulings — Gate-3-approved answers to rules ambiguities

Each entry: a question the corpus underdetermined, researched with verbatim
evidence (markdown + print PDF), ruled on by the user. Engine mechanisms cite
these entries when they encode the ruled behavior.

**Provenance.** Every entry here was drafted by a Claude model and approved by
the user — the verdict is the user's, the prose is not. Which model drafted
what is recorded in the commit trailers; `git log -- docs/canon-rulings.md`
answers it. Summary and the pending second-model pass:
[`authorship.md`](authorship.md).

## R-0001 — Free maneuvers are turn-only (approved 2026-08-23)

**Question:** May a free maneuver be used outside the acting creature's own
turn? Motivating case: the Ending Effects rule ("A creature who imposes an
effect on another creature using an ability can end that effect as a free
maneuver unless the ability says otherwise" — Classes, book p.76).

**Ruling: turn-only.** Evidence (verbatim, markdown + PDF confirmed):

- Glossary, Heroes p.13 (pointer to p.267): "Free Maneuver: A maneuver that
  doesn't count against the one maneuver per turn a creature can take. A
  free maneuver can only be used by a creature on their turn."
- Body rule, Combat book p.267: "you can undertake such straightforward
  activities as free maneuvers on your turn."
- Off-turn activity is a separate category (same page): "When it isn't your
  turn, you can typically undertake even simpler activities requiring no
  action with the Director's approval."
- Design-pattern corroboration: eight abilities grant anytime ending via
  explicit "(no action required)" text (tactician Mark, censor Judgment and
  Faithful Friend, null Null Field, talent Strained, fury To Stone, conduit
  Blessing of Secrets, shadow I'm No Threat) — the "unless the ability says
  otherwise" escape hatch, which would be pointless if free maneuvers
  already worked off-turn.

**Gate 3:** the explicit "only" sentence appears in the glossary alone; the
body rule implies it. User reviewed and approved relying on it, 2026-08-23.

**Engine consequence:** an imposer ending an ability effect off-turn without
an ability-text override is a rule violation → warn-and-apply (permissive
engine). First concrete test case: the pilot mini-encounter's step 7. Lands
with the action-economy mechanism.

**Open per-ability edges (not blockers, queued):** Harlequin Gambit, Trail
of Cinders, Bait and Ambush, Shake It Off grant free maneuvers in
trigger-adjacent contexts where off-turn use is conceivable and the books
are silent; resolve individually when those abilities are implemented.

## R-0002 — Natural 19–20 overrides double bane (approved 2026-08-24)

**Ruling:** Yes. A natural 19–20 produces tier 3 even under a double bane.
The rule's “regardless of any modifiers” includes the double-bane tier
decrease. The natural tier-3 floor is therefore applied after that decrease.

## R-0003 — Hero potency derivation deferred (approved 2026-08-24)

**Ruling:** Do not derive hero weak, average, and strong potency yet. Resolve
the tension between “highest characteristic” and the class-determined basis
when the character-building pipeline is designed. Until then, the engine may
consume explicitly stored potency values but must not invent them.

## R-0004 — Dying-mandated bleeding removal is refused (approved 2026-08-24)

**Ruling:** No removal is permitted while the hero remains dying. The rule
says that this instance “can't be negated or removed in any way until you are
no longer dying”; an attempted removal is a refusal that leaves state
unchanged, not a warn-and-apply violation.

## R-0005 — Director creatures die at 0 Stamina by default (approved 2026-08-24)

**Ruling:** Yes. A Director-controlled creature dies when its Stamina reaches
0 or lower unless the damaging intent explicitly chooses knockout. Other
exceptional circumstances can be introduced later as attributed Director
assertions.

## R-0006 — Tests resolve through the power-roll core, with the test critical layer (approved 2026-08-25)

**Ruling:** A statblock-forced characteristic test resolves through the
certified power-roll core unchanged: 2d10 + the roller's named characteristic
score, tier bands ≤11 / 12–16 / 17+, natural 19–20 floors to tier 3. In
addition, natural 19–20 on a test is a named **critical success** recorded on
the receipt so the Director can grant the reward layer.

**Evidence (verbatim, accepted pin):** "A test is any power roll that has
failure or consequences as an option." [chapter/tests §overview]. "Whenever
you get a natural 19 or 20 on the power roll for a test—a total of 19 or 20
before adding your characteristic score or other modifiers you score a
critical success. This critical success automatically lets you succeed on the
task with a reward, even if the test has a medium or hard difficulty."
[rule.dice/natural-19-20].

**Engine consequence:** no new roll math; the existing `naturalTopEnd`
resolution flag is surfaced as test critical success in the log entry.

## R-0007 — Each creature target rolls independently; objects auto-obtain tier 1 (approved 2026-08-25)

**Ruling:** "(The|Each) target makes a[n] X test" means each creature target
rolls their own independent test using their own named characteristic score;
the acting monster contributes nothing to the roll; target cardinality comes
from the ability's targets header. An **object** target does not roll: it
automatically obtains a tier 1 result.

**Evidence (verbatim):** "If an ability forces an object to make a test, the
object automatically gets a tier 1 result on the test." [rule.combat/target].
Structural corroboration: Sanguine Mist's tier table deals the roller less
damage at 17+ than at ≤11 — the target is the roller.

**Engine consequence:** one roll per creature target, each banded and
resolved separately. Nine of the 29 occurrences permit object targets; the
slice must support object auto-tier-1 explicitly (participant schema has no
object kind yet — the mechanism must not fake an object as a rolling
creature).

## R-0008 — Test difficulty is outcome mapping, displaced by statblock tier tables (approved 2026-08-25)

**Ruling:** Easy/moderate/hard difficulty supplies **no DC and no roll
modifier** — the engine applies nothing numeric. Difficulty does carry real
tier-to-outcome mapping semantics for ordinary (non-statblock) tests; in this
slice the statblock's own exact tier table displaces that mapping entirely.
A future ordinary-test feature must not inherit "difficulty is nothing."

**Evidence:** the difficulty guidance is framed "though these are not hard
and fast rules" [chapter/tests §heroes-make-tests]; the natural-19-20 rule's
"even if the test has a medium or hard difficulty" presupposes the
outcome-mapping reading [rule.dice/natural-19-20].

## R-0009 — Skills cannot modify creature/DTO reactive tests (approved 2026-08-25)

**Ruling:** Skill modifiers are **rejected**, not defaulted off, for
statblock-forced tests: the intent shape simply carries no skill input.
Sourced edges/banes and rule-specified numeric modifiers remain valid inputs
through the core's existing attributed-modifier channels.

**Evidence (verbatim):** "Creature and DTO Tests: Some creatures and dynamic
terrain objects in *Draw Steel: Monsters* have features and abilities that
require heroes to make reactive tests. These tests can't be modified by
skills." [rule.test/reactive-test].

## R-0010 — Assist is unavailable on creature/DTO reactive tests (approved 2026-08-25)

**Ruling:** The Assist-a-Test mechanism does not apply to statblock-forced
tests. **Derived, user-approved:** Assist is predicated on an applicable
skill — "provided you have a skill that applies to the test" [chapter/tests
§assist-a-test] — and R-0009's source prohibits skills from modifying these
tests; therefore no assist. This is a derivation, not a verbatim sentence,
and was explicitly approved as such.

## R-0011 — All 87 tier bullets attach losslessly; 21 automatic today (approved 2026-08-25)

**Ruling:** The characteristic-test slice attaches **all 87** tier bullets
across the 29 occurrences, each either executing through the certified tier
grammar or emitted as a verbatim tier-level table directive — never only the
zero-parse occurrences, never a lossy parse. The safe automatic boundary at
this pin is **21 bullets**: the Sanguine Mist ≤11 bullet parses today but
drops its explicit "until the end of the encounter" duration
[count-rhodar-von-glauer §Sanguine Mist], so it stays verbatim unless the
end-of-encounter ending is typed and certified. Build preconditions: fix the
`compileAbilities` cluster-ownership leak (test tier clauses must not join
the preceding power-roll cluster), and resolve trailing prose / sibling
Effect lines once at ability level, never once per target.

## R-0012 — Bare next-roll grants: until consumed, swept at encounter end (approved 2026-08-25)

**Ruling:** A grant with no printed bound ("The target takes a bane on their
next strike.") pends until its matching roll consumes it; anything unconsumed
is cleared by the encounter-end sweep. This is an **engine adjudication, not
a claimed printed duration** — the books are silent on one-shot grant expiry.
No next-turn expiry is imported: the authors write bounds explicitly when
they intend them (Raider's Awe "made before the end of their next turn"
[feature.ability.raider/raiders-awe]; Orc Warleader "before the end of the
encounter"; Hobgoblin Bloodlord "until the start of their next turn").

**Evidence (verbatim):** "When a creature suffers a lasting effect, whatever
ability, feature, hazard, or other mechanic imposed the effect specifies how
long the effect lasts. Unless otherwise noted, all effects and conditions
that are imposed on heroes during a combat encounter end when the encounter
is over if the hero wants them to, except for being winded, unconscious, or
dying." [chapter/classes §Ending Effects]. That hero-retention option means
out-of-encounter persistence of a beneficial unconsumed grant remains
Director/table state — outside the encounter runtime, documented here, not
modeled.

## R-0013 — Consumption scope: "next strike" waits for a Strike-keyword ability roll; "next power roll" catches ability roll or test; saving throws never (approved 2026-08-25)

**Ruling:** A "next strike" grant is consumed only by the target's next
Strike-keyword ability roll; intervening tests and Area-ability rolls are
neither modified nor consume it (dormancy is the plain reading of "next
strike", confirmed at Gate 3). A "next power roll" grant is consumed by the
next ability roll **or test**, whichever comes first. Saving throws are d10
rolls, not power rolls — grants never touch them.

**Evidence (verbatim):** "The Strike keyword and phrases such as 'makes a
strike' are reserved for abilities that have a creature targeting specific
creatures or objects (not affecting creatures or objects in an area) and
harming those targets in some way by making a power roll. … That means if a
feature distinctly interacts with a strike, that feature has no effect on
abilities with the Area keyword." [rule.combat/strike]. "The game uses two
types of power rolls. An ability roll … A test is a power roll you make
outside of using your abilities…" [rule.dice/power-roll §Types of Power
Rolls]. "To make a saving throw, a creature rolls a d10." [rule.general/
saving-throw]. Free strikes carry the Strike keyword
[feature.ability.common/melee-weapon-free-strike] and qualify.

## R-0014 — Inbound marks are stored on the target, target-local, spent by the first qualifying strike against them (approved 2026-08-25)

**Ruling:** "The next strike made against the target gains an edge" stores a
mark on the struck target; the first Strike-keyword ability roll made against
them (by any attacker) gains the edge and spends the mark. **Target-local
resolution:** under Roll Against Multiple Creatures, one multi-target strike
computes edges/banes per target — a strike hitting two marked creatures gains
each mark's edge against that creature only; marks on different targets never
combine into a global double edge. Different-ability marks on the same target
combine into that target's count; same-ability duplicates on one target
collapse. Every included marked target's qualifying mark is consumed by the
strike. Expiry follows R-0012's default. The one-shot storage model is an
adjudication forced by book silence (nearest printed analogues — surprised,
flanking — are continuous, not one-shot).

**Evidence (verbatim):** "When an ability has multiple targets (whether a
strike with more than one target or an area affect), you make one power roll
and apply the total to all targets. If you have edges or banes … against some
but not all of your targets, you might apply a different tier outcome to
individual targets." [chapter/classes §Roll Against Multiple Creatures]. "The
unique effects of different abilities are combined—effectively stacking on
top of each other—if their durations and targets overlap. However, the
effects of the same ability used multiple times don't stack." [chapter/
classes §Stacking Unique Effects].

**Engine consequence:** the roll path must support per-target edge/bane
pools on multi-target strikes (today's roll input carries one count per
dispatch); the cancellation arithmetic runs per target through its one home.

## R-0015 — Granted modifiers use the one edge/bane arithmetic; a grant is spent even when cancellation zeroes it (approved 2026-08-25)

**Ruling:** "Gains an edge", "takes a bane", "has a double edge" are the
rulebook's own operative verbs for its single edge/bane system. Granted
modifiers join situational ones in the same count → cap (2) → cancel
arithmetic, resolved through the engine's existing single implementation —
never re-derived. Every matching granted modifier is recorded in the roll
receipt and **consumed before the net result is evaluated**: a grant whose
effect cancellation zeroes is still spent (adjudication — the books do not
address consumption-on-cancel; the roll "is made" with the modifier
factored). Target-local inbound modifiers use the same implementation.

**Evidence (verbatim):** "In general, edges and banes cancel each other out,
resolving as follows: If you have an edge and a bane, or if you have a double
edge and a double bane, the roll is made as usual without any edges or banes.
If you have a double edge and just one bane, the roll is made with one edge,
regardless of how many individual edges contribute to the double edge. If you
have a double bane and just one edge, the roll is made with one bane…"
[rule.dice/power-roll §Rolling With Edges and Banes]; edge/bane values and
double-tier steps [rule.dice/edge], [rule.dice/bane].

## R-0016 — "Made before the end of their next turn" is the target's window via the standard EoT rule (approved 2026-08-25)

**Ruling:** Both "their"s are the target's. The grant window uses the book's
standard EoT machinery including the current-turn clause: imposed during the
target's own turn, it expires at the end of that current turn; otherwise at
the end of their next turn. Inside the window it is consumed by the target's
first power roll of any kind (the text says "power roll" — a test inside the
window consumes it); it expires unconsumed when the window closes.

**Evidence (verbatim):** "Many effects last until the end of the target's
next turn, abbreviated as '(EoT)' … A creature suffers from such an effect
until the end of their next turn, or the end of their current turn if the
effect was imposed on their current turn." [rule.combat/end-of-turn].
Carriers at this pin: Raider's Awe [feature.ability.raider/raiders-awe,
also the raider kit record]; same template in the Displacing II/III
enhancement (outside the current corpus family).

## R-0017 — Regained Stamina adds signed and clamps at maximum; winded/dying end by definition (approved 2026-08-25)

**Ruling:** "Regains X Stamina" adds X to current Stamina as a signed value
(a dying hero at −3 regaining 5 goes to 2) and never takes current Stamina
above Stamina maximum. Winded and dying are derived predicates: rising above
the winded value / above 0 ends those states automatically with
informational log entries, no action required. Leaving dying does NOT
auto-remove the dying-mandated bleeding instance — it becomes removable
again (R-0004's refusal gate keys on the derived dying state). Regaining
Stamina never restores temporary Stamina. The clamp and the signed
arithmetic are adjudications: the books state neither generally.

**Evidence (verbatim):** "Some effects can also reduce your Stamina maximum,
limiting the amount of Stamina you can regain." [Combat §Stamina, Heroes
p.277 — clamp by implication only]. "While your Stamina is lower than 0, if
it reaches the negative of your winded value, you die." [Combat §Dying and
Death, p.278 — one signed number]. "Your winded value equals half your
Stamina maximum. When your Stamina is equal to or less than your winded
value, you are winded." [Combat §Winded, p.278]. "…you are bleeding, and
this instance of the condition can't be negated or removed in any way until
you are no longer dying." [Combat §Dying and Death, p.278]. "Regaining
Stamina can't restore temporary Stamina." [Combat §Temporary Stamina,
p.278]. Per-ability clamp precedent: Renegotiated Contract "Neither of you
can gain more Stamina than your maximum this way." [Classes, p.214].

## R-0018 — Ability-granted Recovery spends: one-third-max one home, no action cost, declinable offer, dying may accept (approved 2026-08-25)

**Ruling:** Spending a Recovery decrements the hero's Recoveries by 1 and
regains Stamina equal to their recovery value = floor(staminaMax / 3), a
single implementation home serving every consumer; temporary Stamina is
excluded from the derivation. An ability-granted spend consumes nothing from
the recipient's action economy — the granting ability already paid. "Can
spend" is an offer: the dispatch carries each offered participant's
accept/decline, declining is legal, and the receipt records who did what. A
dying hero may accept (explicit in the book); the Catch-Breath-while-dying
prohibition does not apply to ability-granted spends. Eligibility phrases
("one ally within distance", "adjacent to the target", "in the area") are
table-asserted dispatch bindings — the engine has no spatial model.

**Evidence (verbatim):** "Each hero has a number of Recoveries determined by
their class. A hero also has a recovery value that equals one-third of their
Stamina maximum, rounded down." [Combat §Recoveries and Recovery Value,
p.277]. "Some heroes have abilities that allow them or their allies to spend
more Recoveries without using the Catch Breath maneuver." [Basics §Spending
Recoveries, p.7]. "While you are dying, you can still act, your allies can
help you spend Recoveries in combat…" [Combat §Dying and Death, p.278].
"Temporary Stamina shouldn't be included in a creature's Stamina total when
figuring out a creature's recovery value or winded value." [Combat
§Temporary Stamina, p.278].

## R-0019 — Zero Recoveries refuses; NPCs convert to one-third max; minions route to table (approved 2026-08-25)

**Ruling:** (a) A hero with 0 Recoveries cannot accept a spend: the engine
refuses that binding with a receipt while the rest of the ability applies
(the over-state is canon-incoherent — there is no pool to draw from).
User amendment recorded verbatim: "right you cant spend recoveries you
don't have. the only exeption would be a class that gives their recoveries
away to their allys." — a donation-style ability, when one enters the
automated corpus, is its own future ruling, not covered by this refusal.
(b) A Director-controlled non-minion creature offered a spend or a
recovery-value regain instead regains floor(staminaMax / 3); nothing
decrements and the book places no limit on repetition. (c) A minion as the
target of any Stamina regain or temporary-Stamina gain routes to a
not-automated table receipt (the squad pool is not yet mechanized, and the
book forbids the regain outright).

**Evidence (verbatim):** "Outside of combat, you can spend as many
Recoveries as you have remaining." [Combat §Recoveries and Recovery Value,
p.277]. "If the hero has no Recoveries left, they can't wake up until they
finish a respite." [Combat §Knocking Creatures Out, p.278]. "Director-
controlled creatures don't have Recoveries or a recovery value. […] In such
cases, a Director-controlled creature regains Stamina equal to one-third of
their Stamina maximum." [Combat §No Recoveries, p.278]. "Because minion
Stamina is tracked as a pool, minions can't be winded, can't regain Stamina,
and can't gain temporary Stamina during a battle." [Monster Basics §Shared
Low Stamina, Monsters p.7].

## R-0020 — Flat "regains X Stamina" is automatic; targets are asserted at dispatch (approved 2026-08-25)

**Ruling:** A flat regain applies to the bound targets automatically — no
recipient choice, no action. The book writes choice language explicitly when
it means it ("can spend"); these lines carry none. "One creature within 5
squares" permits any creature, including an enemy, as the Director rules;
the binding is asserted at dispatch like all targeting. User note recorded
verbatim: "yes, once you choose to use the recovery you just get the
stamina."

**Evidence (verbatim):** "The target creature can spend a Recovery to regain
Stamina, or can make a saving throw against one effect they are suffering
that is ended by a saving throw." [Combat §Heal, p.274 — choice written when
intended]. "Some abilities, items, and other effects allow you to spend a
Recovery to regain Stamina equal to your recovery value plus a little extra
(as described by the effect), or to regain Stamina without spending a
Recovery." [Combat §Recoveries and Recovery Value, p.277]. Carriers: Human
Death Acolyte Necrotic Bolt "One creature within 5 squares regains 1
Stamina." [Monsters p.181]; Kobold Signifer Glory to the Legion "Each target
regains 5 Stamina." [Monsters p.193].

## R-0021 — Temporary Stamina: max-not-sum, no cap, cleared by the end-encounter sweep (approved 2026-08-25)

**Ruling:** Gaining temporary Stamina sets the pool to max(current
remaining, granted) — never the sum; the book's own example compares what is
left, not the original grant. No cap exists. The closed template carries no
duration override, so the default applies: the end-encounter sweep clears
temporary Stamina to 0 alongside the existing condition and grant sweeps.
(Damage-drains-temporary-first and the winded/recovery-value exclusion are
already shipped engine behavior from this same rule.)

**Evidence (verbatim):** "If you have temporary Stamina and then gain more
temporary Stamina, you get whichever amount of temporary Stamina is greater,
rather than adding the two pools together. For instance, if an ability
grants you 10 temporary Stamina when you already have 5, you have 10
temporary Stamina, not 15." / "There is no maximum to how much temporary
Stamina you can have." / "Unless otherwise indicated, temporary Stamina
disappears at the end of an encounter." [Combat §Temporary Stamina, Heroes
p.278]. Carrier: fury L3 Steelbreaker "You gain 20 temporary Stamina."

## R-0022 — "The area is difficult terrain." becomes a persistent attributed terrain fact; movement math stays table (approved 2026-08-25)

**Ruling:** The engine records a typed, attributed terrain fact — source
artifact + ordinal, the ability's verbatim area line, the creating
participant, the intent id — instead of an unread table directive. The
+1-square entry cost remains table-adjudicated until spatial substrate
lands. Duration: the fact persists until the Director clears it (a
director-authority clear intent) and does not survive the encounter. The
books give no default duration for ability-created terrain — when MCDM
intends a window they print one — and all three carriers are physical
alterations (rubble, sunken ground, caustic paste). Adjudication, not
printed text; the burst area's momentary targeting life does not evaporate
the terrain its Effect created — the footprint freezes.

**Evidence (verbatim):** "Areas of thick underbrush, rubble, spiderwebs, or
other obstacles to movement create difficult terrain. It costs 1 additional
square of movement to enter a square of difficult terrain." [Combat
§Difficult Terrain, Heroes p.270]. Duration contrast: "Until the start of
the ballistite's next turn, the area is difficult terrain…" [War Dog
Ballistite Kill Zone, Monsters p.311]. "…the radius of the burst, which
always originates from you and lasts only for as long as it takes to affect
its targets." [Classes §Burst, Heroes p.71]. Carriers: Pillar Toppling
Pillar [Monsters p.340], Orc Terranova Sinkhole [Monsters p.220], War Dog
Aerocite Caustic Paste Bomb [Monsters p.311].

## R-0023 — Squads: individual minion participants + encounter-level pool state; printed init formula (approved 2026-08-25)

**Ruling:** Minions remain individual participants (occupy squares, are
targeted, take conditions per-member). A squad is encounter-level state:
members (same-named minions, asserted at encounter seeding), the stat
block's per-minion Stamina, and the shared pool — initialized to per-minion
Stamina × member count. A squad mixing different stat blocks is **refused**
(the printed pool formula requires one per-minion Stamina number —
canon-incoherent over-state, the zipper class); a squad of more than eight
**warns-and-applies** (printed bound; the arithmetic stays coherent).

**Evidence (verbatim):** "Minions with the same name (for instance, goblin
sniper) can be organized into squads of up to eight creatures." [Organized
as Squads, Monsters p.7]. "Each squad of minions shares a Stamina pool,
with initial Stamina equal to each individual minion's Stamina multiplied
by the number of minions in the squad. For example, a goblin spinecleaver
has 5 Stamina, so a squad of eight spinecleavers has a Stamina pool of 40."
[Shared Low Stamina, Monsters p.7]. "The minions you buy can be arranged
into squads of any size you need, up to a maximum of eight minions in a
squad." [Minions Come in Groups of Four, Monsters p.12]

**Gate 3:** accepted via the minion-pool-gate3 card surface (cardHash
d9c216ce verified), 2026-08-25.

## R-0024 — Non-area damage: full pool decrement with carryover; threshold kills; past-the-end excess discarded on the record (approved 2026-08-25)

**Ruling:** A damage instance against a squad member reduces the pool by
the **full** post-modifier damage; the remainder between kill thresholds
stays in the pool and counts toward the next kill — nothing rounds away
(user amendment: "Overflow is never discarded"; worked example: minions of
2 Stamina, 7 damage → three kills and the seventh point carried). One
minion dies at each per-minion-Stamina threshold crossing
(`kills == floor((poolMax − pool) / perMinion)` is the standing invariant);
the hit (bound) minion dies first automatically; additional victims are
"nearest" (spatial — not modeled), so the dispatch may name them and
otherwise the engine records the kills as pending identity with a table
directive. Every death fires the 0-Stamina trigger receipt (R-0027). When
a hit kills every remaining minion with damage left over, the excess has
no destination in the core book: the receipt records the full damage and
nothing further happens mechanically ("Yes, then discard" — ruled in chat
after the rev-2 card).

**Evidence (verbatim):** "Whenever a minion squad's Stamina pool is reduced
by an amount equal to an individual minion's Stamina, one minion dies or is
otherwise taken out of the fight. If a squad of goblin spinecleavers has
its Stamina pool reduced from 40 to 35, the minion who took the damage that
reduced the pool dies. When the Stamina pool hits 30, 25, 20, 15, 10, 5,
and finally 0, another minion in the squad dies each time. If multiple
minions take the damage that results in the pool dropping low enough to
kill one minion, the creature who dealt the damage to the minions decides
which of those minions dies." [Dropping One Minion, Monsters p.7]. "After
dropping any minions who took the damage first, the minions nearest to
those taken out suffer the same fate." [Dropping Multiple Minions,
Monsters p.8]

**Gate 3:** rev-2 card (cardHash 639a19c8) accepted by the user in chat,
2026-08-25 ("Gotcha. Yes, then discard").

## R-0025 — Area damage: each in-area minion feeds the pool at most its own Stamina; only in-area minions die (approved 2026-08-25)

**Ruling:** For an area source — an ability with the Area keyword (the
printed discriminator) or damage dispatch-asserted as an area effect — each
bound in-area minion contributes min(damage dealt to it, per-minion
Stamina) to the pool, and only bound in-area minions can die from the
instance. "In the area" is the dispatch's bound targets (no spatial model).
This is the arithmetic the printed 15-not-18 example implies; the cap makes
the kill limit structural (each capped contribution crosses at most one
threshold).

**Evidence (verbatim):** "…such area effects can kill only those minions
who are in the area. For example, a tier 3 outcome for the talent's
Incinerate ability deals 6 fire damage to each target in its area. If three
goblin spinecleavers with Stamina 5 are caught in the area, the minion pool
loses 15 Stamina instead of 18, leaving the other minions in the squad
unscathed." [Minions and Area Effects, Monsters p.8]. Discriminator: "…any
source except an area effect (including abilities with the Area keyword)…"
[Dropping Multiple Minions, Monsters p.8]

**Gate 3:** accepted via the minion-pool-gate3 card surface (cardHash
346d7be6 verified), 2026-08-25.

## R-0026 — Squad weakness/immunity applies once, as the last step (approved 2026-08-25)

**Ruling:** When a damage instance touches a squad: compute each minion's
pool contribution first (including R-0025's area cap), sum, then apply the
squad's damage weakness/immunity **once** to that sum as the final step
before kill accounting — using the existing one-home weakness/immunity
semantics (highest applicable of each). The composition order against the
area cap is the ruled reading; the books print once-per-squad and
last-in-order but show no combined example.

**Evidence (verbatim):** "If a minion has either a damage immunity or a
damage weakness for a source of damage, apply the effects to the minion's
squad once, even if multiple minions share the same immunity or weakness.
These effects are the last things applied when calculating damage and can
drop (or save!) multiple minions from any source of damage, including area
effects." [Minion Weakness and Immunity, Monsters p.8]

**Gate 3:** accepted via the minion-pool-gate3 card surface (cardHash
fd5bcc27 verified), 2026-08-25.

## R-0027 — Minion exemptions are rule-mandated per-binding refusals; a death counts as 0 Stamina for triggers (approved 2026-08-25)

**Ruling:** Squad members are never winded or dying (pool tracking replaces
those derived states). A binding that would have a squad member regain
Stamina, gain temporary Stamina, or spend a Recovery is **refused** with a
receipt citing the printed rule — per-binding, so sibling targets of the
same effect still resolve. Refusal, not warn-and-apply: there is no
individual Stamina number to receive the change (canon-incoherent
over-state). This upgrades R-0019(c)'s "pool not mechanized" table routing
to its printed ground once the pool mechanism ships. A minion taken out is
dead for the encounter and fires its "counts as being reduced to 0 Stamina"
trigger receipt once; asserting a knockout instead remains the Director's
existing call (R-0005 family).

**Evidence (verbatim):** "Because minion Stamina is tracked as a pool,
minions can't be winded, can't regain Stamina, and can't gain temporary
Stamina during a battle." [Shared Low Stamina, Monsters p.7]. "When a
minion is taken out of the fight, they count as being reduced to 0 Stamina
for triggering effects." [Dropping One Minion, Monsters p.7]

**Gate 3:** accepted via the minion-pool-gate3 card surface (cardHash
3148b4e8 verified), 2026-08-25.

## R-0028 — Captains: attachment is tracked state; benefits display verbatim; automation deferred to a named follow-up (approved 2026-08-25)

**Ruling:** The engine tracks captain attachment via Director
attach/detach: singular captain per squad (attaching over an existing
captain warns and replaces — the Director exercising the printed
one-captain rule), one squad per captain, captain Stamina individual and
never pooled. Of the printed eligibility ("Any non-Mount, non-minion
creature, who speaks a language that a squad of minions can understand"),
the engine checks ONLY non-minion; non-Mount status AND the shared language
are both table-asserted — statblock stats parse no roles and no languages —
and the attach receipt names both. While attached, the squad surface shows the stat block's
"With Captain" entry verbatim; applying the benefit is table-adjudicated
this slice (tier-3 surfacing). Benefit automation is a named follow-up
family: edge-type benefits can ride the grant substrate; the 10
Stamina-type benefits sit on a book-silent question (recomputing an
in-progress pool when a captain arrives or is lost mid-fight) that gets its
own ruling then. Succession ("start of the next round, no action required")
is the Director re-attaching; no automation.

**Evidence (verbatim):** "A squad of minions can have only one captain, and
a creature can't be captain to more than one squad of minions." · "A
captain's Stamina isn't added to a minion squad's Stamina pool, and is
tracked as for any other creature in combat." · "While a minion squad has a
captain, each minion in the squad gains the benefits noted at the 'With
Captain' entry on their stat block." · "If a squad of minions loses their
captain, a new allied creature can become that squad's captain at the start
of the next round (no action required)." [Attached Squad Captain /
Separate Actions and Stamina / Captain Benefits / I Am the Captain Now,
Monsters p.9]

**Gate 3:** accepted via the minion-pool-gate3 card surface (cardHash
410f6268 verified), 2026-08-25.

## R-0029 — Action-cost vocabulary normalization + byte-defect repair (approved 2026-08-26)

**Question:** how does the compiler normalize the 1,878 ability header
action-cost values, and what happens to the `-` cells and the two
byte-malformed printed tables?

**Ruling:** normalize to the closed enum {main-action, maneuver,
move-action, triggered-action, free-triggered-action, free-maneuver,
no-action, villain-action}. Case/spelling surface variants fold
(`Triggered` = `Triggered Action` = `Triggered action`, etc.). A bare `-`
under a `Villain Action N` name line is villain-action (156 of 157 corpus
cells). **Wave of Blood is NOT a villain action** — it is the delayed
end-of-round tail of the vampire lord's Sacrifice ("Each target is marked
for sacrifice. At the end of the round, each target who isn't dead or
destroyed takes 50 corruption damage. The vampire then uses the following
ability. **Wave of Blood:** …") and normalizes to a no-cost sub-ability;
treating it as an independent villain action would violate the printed
timing ("A creature can use a villain action at the end of any other
creature's turn during combat" — Monsters p.4) and the once-per-round /
three-per-encounter constraints. `Main action (Adjacent creature)` (22
headers, 6 siege-engine dynamic-terrain fixtures) is a main action whose
budget debit lands on the DISPATCHING ADJACENT OPERATOR — the fixture
takes no turns. The two byte-malformed printed tables (gloom-dragon
Absence of All Light: separator row missing its trailing pipe; lizardfolk
Net Trap: header row missing its leading pipe) get permissive-regex
repair so their printed costs compile — the alternative is silently
costless abilities, one of them a villain action invisible to the
villain-action economy. Unknown FUTURE values refuse to normalize and
surface as residue, never guessed.

**Gate 3:** accepted via the action-economy-gate3 card surface (cardHash
0ee3a937 verified), 2026-08-26.

## R-0030 — Permissive posture for economy violations, receipt-aware (approved 2026-08-26)

**Question:** what does the engine do when a dispatch violates the printed
action economy?

**Ruling:** WARN-AND-APPLY, extending R-0001's engine consequence to the
whole economy. Covered violation classes: over-budget action use, off-turn
action use, acting again after taking a turn ("Unless an ability or
special rule allows them to do so, any creature who has taken a turn
during a combat round can't act again until a new round begins" — Heroes
p.266), out-of-alternation order, consecutive solo turns, per-ability
once-per-round cap breaches, and dazed/surprised-restricted use (Heroes
p.77, p.266). The engine emits a rule-violation receipt naming the printed
rule and applies the dispatch; the Director adjudicates. Printed escapes
never warn: grants are spent silently and carry escape flags
(ignoresDazed / ignoresSurprised / offTurn) — critical hit's "additional
main action … whether or not it's your turn and even if you are dazed"
(Heroes p.75), the 22 solo malice-sheet Solo Actions ("They can use this
feature even if they are dazed"), tactician Out of Position ("even if you
are surprised"). Until the malice family lands, the Director grants Solo
Actions manually via the grant intent with escape flags. The invariant
oracle models the RECEIPTS: a counter above capacity WITH a matching
violation receipt is legal state; without one it is corruption. Refusals
remain structural only (unknown participant/ability, malformed payload,
hash-mismatched commit); the list does not grow.

**Gate 3:** accepted via the action-economy-gate3 card surface (cardHash
226a6c49 verified), 2026-08-26.

## R-0031 — Reaction interception points + classification residue; EXTENDED: the retarget template (approved 2026-08-26; extended 2026-08-31)

**Question:** when does a triggered/free triggered action resolve relative
to its trigger? The books are silent (bundle + PDF confirmed): they state
WHEN one may be used ("You can use one triggered action per round, either
on your turn or another creature's turn, but only when the action's
trigger occurs" — Heroes p.267) and give only two ordering rules (the
simultaneous-trigger rule, Heroes p.267; the death-effects/forced-movement
rule, Heroes p.272) — never the general sequencing.

**Ruling:** ability resolution exposes five named interception points —
**targeting** (declared, pre-roll), **rolled** (tier known, pre-commit),
**pre-application** (damage/effect computed, not yet applied), **applied**
(post-application), **replacement** (would-die / would-be-reduced
interception inside application). Reaction texts classify onto points by
DETERMINISTIC closed phrase templates only: "halves the damage" / "takes
half the damage" → pre-application; "is the target … instead" / "chooses
a new target" → targeting or pre-application per trigger; "the outcome …
is reduced by one tier" → rolled; "before X is resolved" / "after X
resolves" → as written; "would die … instead" → replacement. An
UNCLASSIFIED reaction defaults to **applied** and carries its verbatim
printed text on the receipt for table adjudication — honest residue,
never silent misresolution. The two printed ordering rules stay exactly
as printed. This arc ships the points and the economy (counters, warn
posture); reaction-EFFECT automation is a named follow-up family.

**Gate 3:** accepted via the action-economy-gate3 card surface (cardHash
e5ef4fce verified), 2026-08-26.

**EXTENSION (2026-08-31): the retarget template.** The closed set gains one
deterministic phrase template: "becomes the new target of the strike / the
[triggering] ability" → targeting or pre-application per trigger, riding the
SAME fallback as the two original retarget templates (a damage-carrying
trigger has already left the targeting step). This was ROAD-0005
generalizing seam #2, blocked on exactly this ruling: the five carriers
previously fell to unclassified residue and defaulted to **applied** — the
one point at which a retarget is meaningless, since the modification must
substitute the in-flight target between the roll and its application
(R-0032's fold in `commitResolutionEntry` already applies recorded
`retarget` modifications there; a declared-phase retarget edits the
declared target list per R-0041). The extension routes the POINT only —
effect automation posture is unchanged (R-0044): the host still dispatches
the retarget as a `modify-resolution` modification.

**Extension evidence (verbatim, the five printed occurrences — the exact
phrase appears nowhere else across all admitted books at the pin):**

- vampire, Reactive Charm (undead 3rd echelon): "**Trigger:** A creature
  makes a strike against the vampire." · "**Effect:** The target becomes
  the new target of the strike." → targeting.
- vampire-lord, Redirected Charm: same trigger and effect text, free
  triggered action → targeting.
- hulking-brain, Brawny Buffe (voiceless talker): "**Trigger:** An ally
  voiceless talker within 5 squares takes damage from an enemy ability." ·
  "**Effect:** The hulking brain shifts adjacent to the ally and becomes
  the new target of the ability." → pre-application (damage trigger). The
  shift clause and the 2-Malice prone rider stay table per R-0044.
- castellan-hoplon, Timely Intervention (war dog 4th echelon):
  "**Trigger:** An enemy within 10 squares targets an ally with an
  ability." · "**Effect:** Hoplon teleports to an unoccupied space adjacent
  to the enemy and becomes the new target of the ability. He can then make
  a free strike against the enemy, and if that enemy has R < 4 they are
  taunted until the end of their next turn." → targeting. The teleport,
  free strike, and taunt clauses stay table per R-0044.
- war-dog-mischievite, Misdirection (2nd echelon, Malice rider of a
  Maneuver): "**2 Malice:** The mischievite can use this ability as a
  triggered action when they are targeted by an ability. If they do, the
  swapped target becomes the new target of the triggering ability." → the
  template classifies the section to targeting (no Trigger line — the
  documented null-trigger fallback). The rider's maneuver-to-triggered-
  action conversion itself remains the malice family's NAMED deferral
  (granting triggered actions, R-0030/reaction-effect scope cuts), so the
  compiled Misdirection annotation still carries no interception point;
  the classification home covers the text for the day that family lands.

**Scope honesty:** the template is the printed third-person form only. The
lich's "If the target has P < 4, they swap places with the lich to become
the new target of the triggering ability." is a potency-gated swap in a
different grammatical shape and deliberately does NOT match — it stays
honest applied-default residue with its verbatim text on the receipt.
Classification deltas at the accepted pin: 266 compiled triggered/
free-triggered sections, classified 42 → 46, unclassified 224 → 220;
targeting 6 → 9, pre-application 32 → 33, applied 227 → 223 (the four
compiled carriers; Misdirection compiles as a Maneuver and is not in the
266).

**Extension Gate 3:** user-approved 2026-08-31 (R-0031 retarget-template
ruling, ROAD-0005 seam #2 unblock).

## R-0032 — The resolution stack + explicit commit (approved 2026-08-26)

**Question:** how does two-phase roll→commit work, and what may change
between the roll and its application?

**Ruling:** a rolling ability opens an entry on a keyed resolution STACK
(entries nest: a reaction that itself rolls; War Dog Breaker's Breaking
Point inserts a full turn mid-damage-application — printed play the
engine must tolerate). The entry stores the payload HASH and the complete
roll receipt (all recompute inputs including per-target edge/bane pools
per R-0014). While open, the roller may downgrade ("Whenever you make a
power roll, you can downgrade it to select the outcome of a lower tier"
— Heroes p.4) and reactions may cut in at their R-0031 points; future
families (surges, hero tokens, heroic-resource timing) spend here.
Commit is an EXPLICIT dispatch that re-supplies the payload; the engine
verifies the hash and executes against COMMIT-TIME state (target drift
since the roll produces standard degradation receipts, never
interleaving-dependent silence). Commit order: damage to all targets →
tier effects in presented order — "Unless otherwise indicated, any
effects that are determined by a power roll's tier outcome occur after
the power roll's damage has been dealt to all targets. […] If an ability
creates multiple effects, those effects resolve in the order in which
they are presented" (Heroes p.74), the ability's own text can reorder —
→ bleeding's once-per-action loss at commit-close ("This Stamina loss
can't be prevented in any way, and only happens once per action"), keyed
by resolution entry so a composed Charge strike bleeds once. Hosts
pipeline commit for one-tap UX; the engine never auto-commits.
Modifications apply in dispatch order; a downgrade dispatched after a
reaction already consumed the higher tier applies with a warning and the
full history on the receipt (Director adjudicates the paradox). Anything
arriving after commit is a warned table correction, not a reopen.

**Gate 3:** accepted via the action-economy-gate3 card surface (cardHash
a79d375a verified), 2026-08-26.

## R-0033 — Minion action economy adopted from PDF-recovered "Acting Together" (approved 2026-08-26)

**Question:** the bundle's `rule/monster/squad` forward-references "Acting
Together," which is ABSENT from the markdown bundle at the accepted pin
(GOTCHA-0008). The Gate-2 lane recovered it verbatim from the Monsters
PDF p.8–9. May the engine rely on PDF-confirmed text outside the pinned
markdown (the R-0001 precedent)?

**Ruling: yes — user note: "Yes, the books are right."** The minion
per-member turn budget automates from the recovered text: a minion squad
takes one shared turn (the squad already occupies one turn slot; "All
members of a minion squad act together on the same initiative" — Monsters
p.7), and on it each member takes only move+main, move+maneuver, or two
moves; an individual maneuver forfeits squad participation that turn;
minions make opportunity attacks; bespoke triggered actions are unusual
but not prohibited. Recovered prose, verbatim (Monsters p.8–9, PDF
confirmed):

- §Acting Together: "When minions act, each minion in the squad uses
  their main action in concert. This is because minions have squad
  actions (see below) that require participation from all minions,
  requiring all attacks by a squad to happen at the same time. Individual
  minions can choose to waste their main action doing nothing when the
  rest of their squad uses their main action in concert, or can use a
  maneuver only to alleviate their own circumstances (see Minion
  Maneuvers)."
- §Minion Action Economy: "Minion turns are meant to be short. On their
  shared turn, each minion can take only a move action and a main action,
  a move action and a maneuver, or two move actions. Individual minions
  can also make opportunity attacks. That said, minions usually don't
  have bespoke triggered actions, keeping them easy to run."
- §Squad Action: "Each minion has a signature ability that is typically a
  strike targeting one creature or object. When multiple minions in a
  squad use their signature ability on a turn, you make one roll for the
  whole squad. Each target of a minion's signature ability is affected by
  only one instance of the ability. But when two or three (at maximum) of
  a squad's minions attack the same creature or object simultaneously,
  each additional minion causes the signature ability to deal extra
  damage to the target equal to the minion's free strike value. Because a
  minion's free strike value is typically lower than the average damage
  of their signature ability, it's usually more effective to have each
  minion target a different hero." (+ the demon pitling worked example
  and: "If a minion squad scores a critical hit with their signature
  ability, all the minions who participated in using the ability can take
  another main action.")
- §Minion Maneuvers: "Minions in a squad use the Grab, Hide, Knockback,
  and Search for Hidden Creatures maneuvers together. For Grab,
  Knockback, and Search in particular, you make one roll for the whole
  squad, and each target of a minion's maneuver is only affected by one
  instance of the ability. A minion can take any other maneuver
  individually, usually to alleviate their own circumstances like
  standing up from prone or escaping a grab. If they do, they can't
  participate in their squad's main action or maneuver during the turn."
- §Free Strike Together: "If several minions in a squad make a free
  strike at the same target at the same time, such as from a hero
  provoking an opportunity attack by moving away from several minions
  surrounding them, the damage from each minion's free strike is added
  together and treated as one strike."

**Scope:** only the per-member BUDGET automates in the action-economy
arc. The squad ATTACK math (§Squad Action one-roll + free-strike-value
stacking + squad crit, §Minion Maneuvers together, §Free Strike Together)
is recorded here for the squad-attack follow-up family.

**Gate 3:** accepted via the action-economy-gate3 card surface (cardHash
fd7e05db verified; user note "Yes, the books are right"), 2026-08-26.

## R-0034 — Squad Action: one roll, per-target instances, free-strike-value stacking (approved 2026-08-26)

**Ruling:** a squad's signature attack dispatches as ONE ability use by
the squad (squad-owned resolution entry): an ordered participation list
(which members attack which targets — order is the damager's printed
choice, hash-witnessed; one designated instance owner per target), one
power roll, one instance of the tier result per target. Each attacker on
a target beyond the first adds their printed free-strike value as extra
damage, typed by inheritance from the tier's damage packet. 4+ attackers
on one target is warn-and-apply (R-0030 posture). Non-participating
members are the printed "waste their main action doing nothing" case
(per-member budget debits per R-0033 regardless). Adjudications of
confirmed book silence, accepted with the card: (a) attacker-referent
tier riders resolve against the target's instance owner; (b) a
damage-less tier result (war-dog-socialite's self-strike tiers) gives
stacking extras nothing to join — 2+ attackers on one target emits a
warn receipt with the verbatim tier text (residue, never a guess);
(c) multi-packet tiers (war-dog-draconite "4 damage, 3 psychic damage")
and flag-carrying tiers (optacus "this damage ignores immunity") are the
same residue class for the extras' type/flags; (d) a participating
member's outbound next-roll grants join the per-target pools only for
targets that member attacks. The two Area-keyword signatures
(fire-giant-fireballer, cyclops) roll with the squad's single roll, hit
each target in any member's area once (target list is the union), and
never stack — PDF-confirmed silence on squad-used area abilities. A
member may deliver the signature via Charge (`partOf` composition;
movement table-asserted).

**Evidence (verbatim, Monsters p.8 §Squad Action, PDF-recovered):**
"Each minion has a signature ability that is typically a strike
targeting one creature or object. When multiple minions in a squad use
their signature ability on a turn, you make one roll for the whole
squad. Each target of a minion's signature ability is affected by only
one instance of the ability. But when two or three (at maximum) of a
squad's minions attack the same creature or object simultaneously, each
additional minion causes the signature ability to deal extra damage to
the target equal to the minion's free strike value." · The printed
worked example (p.8, recorded durably here; the family's exact golden):
"As an example, a squad of three demon pitlings are attacking a shadow
and a conduit with their Spit signature ability, with a tier 2 outcome
on the power roll. One pitling targets the shadow, dealing 4 poison
damage. Two pitlings target the conduit, dealing 4 poison damage plus an
extra 2 poison damage for the additional pitling." · The p.9 sidebar
restatement: "Two targets are within distance of three pitlings taking
the Spit squad action. One pitling spits at the shadow for 4 damage, one
pitling spits at the conduit for 4 damage, and the remaining pitling
deals an extra 2 damage to the conduit." Pin reconciliation: pitling
Spit tier-2 "4 poison damage", free_strike 2 — the numbers derive
exactly.

**Gate 3:** accepted via the squad-attack-gate3 card surface (cardHash
d5466f78 verified), 2026-08-26.

## R-0035 — Squad crit: one main-action grant per participating member, crit fine print carries (approved 2026-08-26)

**Ruling:** a natural-crit squad roll compiles to one plain main-action
`action` grant (schema v6 union) per PARTICIPATING member, carrying the
printed critical-hit escapes ("whether or not it's your turn and even if
you are dazed", Heroes p.75). Both halves are adjudications — the
printed minion sentence prints neither the escapes nor any turn
restriction. No squad-machinery consumption constraint; odd spends warn
under the permissive posture.

**Evidence (verbatim):** "If a minion squad scores a critical hit with
their signature ability, all the minions who participated in using the
ability can take another main action." [Monsters p.8 §Squad Action,
PDF-recovered] · "A critical hit allows you to immediately take an
additional main action after resolving the power roll, whether or not
it's your turn and even if you are dazed (see Conditions below)."
[Heroes p.75 §Critical Hit]

**Gate 3:** accepted via the squad-attack-gate3 card surface (cardHash
710a3fc2 verified), 2026-08-26.

## R-0036 — Minion Maneuvers together: one roll for Grab/Knockback/Search; AMENDED: Knockback and Grab both compile, Grab sequentially (approved 2026-08-26; amended 2026-08-28)

**Ruling:** Grab, Knockback, and Search for Hidden Creatures dispatch
squad-together with the participation shape: one roll for the whole
squad, one instance per target. Grab and Knockback resolve through their
compiled common ability artifacts; Search has no roll-bearing compiled
artifact in-pin and rides as a directive receipt until its prose feature
compiles (accounted, never dropped). Hide is used together but sits
outside the printed one-roll list ("Grab, Knockback, and Search in
particular") — directive receipt. The individual-maneuver forfeit is
per-member budget state already automated by R-0033.

**Evidence (verbatim, Monsters p.9 §Minion Maneuvers, PDF-recovered):**
"Minions in a squad use the Grab, Hide, Knockback, and Search for Hidden
Creatures maneuvers together. For Grab, Knockback, and Search in
particular, you make one roll for the whole squad, and each target of a
minion's maneuver is only affected by one instance of the ability."

**AMENDMENT (2026-08-28).** Build evidence falsified the accepted card's
claim that Grab and Knockback both "resolve through their compiled common
ability artifacts." Knockback does, through a deliberately bounded grammar
accepting only a complete tier payload of `Push N`; its three pinned tiers
become receipt-visible Push 1/2/3 forced-movement directives, and the engine
invents no geometry. Grab was proposed to fall back to a whole-maneuver
directive, on the premise that its tier-2 free strike needs nested reaction
resolution. **That premise is rejected on user review: Grab compiles
sequentially.** The printed "can" is not a live decision point — the free
strike carries no printed cost, limit, or downside, opportunity attacks are
printed as free triggered actions that "doesn't count against your limit of
one triggered action per round," and Grab's free strike is not labeled a
triggered action at all. Tier 1 is "No effect." On tier 2, the target's melee
free strike against the grabber resolves first and always, then `grabbed`
applies if the grabber remains. On tier 3, `grabbed` applies directly. Three
adjudications of confirmed book silence, accepted with the amendment: (a) no
decline option is offered; (b) the free strike is not a triggered action, so
it applies even to a target who could not otherwise take one, including a
surprised target; (c) it resolves before the grab, so if it removes the
grabber, `grabbed` does not apply. The grabber's identity is **derived, never
adjudicated**: it is the participation row's Director-selected `instanceOwner`,
the free strike is attributed to that member, and "the minion who took the
damage that reduced the pool dies" is already `applySquadDamage`'s shipped
deterministic first step. Director kill-naming governs only residual
nearest-neighbor kills and never decides whether the grabber fell. Search and
Hide remain directives; nothing in this amendment changes those dispositions.

**Amendment evidence (verbatim):** "You can grab the target, but if you do,
the target can make a melee free strike against you before they are grabbed."
· "The target is grabbed by you." · "No effect."
[mcdm.heroes.v1/feature.ability.common/grab, tiers 2, 3, 1] · "≤11: Push 1 ·
12-16: Push 2 · 17+: Push 3" [.../knockback] · "the creature can take
advantage of that movement to quickly make a melee free strike against the
enemy as a free triggered action" [rule.combat/opportunity-attack] · "A free
triggered action follows the same rules as a triggered action, but it doesn't
count against your limit of one triggered action per round."
[rule.combat/triggered-action] · "A surprised creature can't take triggered
actions or free triggered actions" [rule.combat/surprised] · "If a squad of
goblin spinecleavers has its Stamina pool reduced from 40 to 35, the minion
who took the damage that reduced the pool dies." · "If multiple minions take
the damage that results in the pool dropping low enough to kill one minion,
the creature who dealt the damage to the minions decides which of those
minions dies." [Monsters §Dropping One Minion]

**Implementation status (recorded, not waived):** Knockback's bounded compile
is SHIPPED. Grab's tier-2 automation is DEFERRED behind hero free-strike
mechanics — a hero's melee free strike is itself a power roll (2/5/7 + M or A)
with a characteristic choice and kit modifiers, and the hero side is not
seeded. Until that lands, all three Grab tiers stay a lossless directive
carrying the verbatim tier text. Tiers 1 and 3 are unblocked and may compile
ahead of tier 2 at implementation's discretion. Tracked in
`docs/squad-attack-report.md` §Explicit follow-up boundaries.

**Gate 3:** accepted via the squad-attack-gate3 card surface (cardHash
7fe498ba verified), 2026-08-26. **Amendment Gate 3:** amended-and-accepted via
the squad-attack-r-0036-amendment surface, 2026-08-28 — proposed-card hash
`8ade47da` verified, verdict `amend` with the sequential-compile ruling above
(`.artifacts/canon/squad-attack/r-0036-amendment-verdict.json`).

## R-0037 — Free Strike Together: summed contributions, one strike (approved 2026-08-26)

**Ruling:** a combined free-strike dispatch — contributions
`[{memberId, count}]`, count defaulting 1 — against one target produces
ONE damage instance equal to the sum, "treated as one strike": the
target's weakness/immunity applies once to the summed instance and
per-strike triggered effects see one strike. skeleton-knight "More
Swings" contributes 2. Substitution traits (ogre blue-blood "In My
Stead") are out of payload scope — the substitute's strike is its own
dispatch. Triggered free strikes off the SAME trigger occurrence may
join one combined dispatch (the printed example is itself a
one-event multi-reaction; radenwight Ready Rodent ×k off one damage
event is the corpus case); sequential occurrences stay individual.
Simultaneity is table-asserted — the dispatch is the assertion.

**Evidence (verbatim):** "If several minions in a squad make a free
strike at the same target at the same time, such as from a hero
provoking an opportunity attack by moving away from several minions
surrounding them, the damage from each minion's free strike is added
together and treated as one strike." [Monsters p.9 §Free Strike
Together, PDF-recovered] · "Whenever the knight makes a free strike,
they can make two free strikes instead." [Skeleton Knight, More Swings]
· "Whenever the blue blood would make a free strike, an ally within 5
squares can make a free strike instead." [Ogre Blue Blood, In My Stead]
· "Trigger: An ally deals damage to the target. Effect: The scrapper
makes a free strike against the target." [Radenwight Scrapper, Ready
Rodent — carried by all four radenwight minions]

**Gate 3:** accepted via the squad-attack-gate3 card surface (cardHash
18fe976d verified), 2026-08-26.

## R-0038 — With-Captain benefits automate by closed template; AMENDED: detach is automatic on captain death (approved with amendment 2026-08-26)

**Ruling:** the 21 distinct With-Captain strings (116 statblocks)
classify by exact-text closed templates through a benefit-source-generic
one-home (`parseBenefitPhrase`; `parseWithCaptain` a thin caller), and
automated buckets flow through a named derived-modifier channel
(persistent while-attached, receipt-visible, its own roll-receipt field
beside asserted and granted modifiers). Edge lines (27× "Gain an edge on
strikes") contribute ONE edge to the squad's roll regardless of how many
members attack — per-member summing would double-edge every 2+-member
captained squad, collapsing the printed single/double distinction
(unguloid's unique "Have a double edge on strikes" contributes two);
accepted as proposed (card Question 1). Damage lines (28× "+N damage
bonus to strikes"): +N once per target-instance on the signature
(stacking extras are free-strike values, not strikes); +N per
contribution inside a summed free strike. lizardfolk-tonguer's "+1 bonus
to strikes" is ruled a damage bonus (card Question 2, accepted as
proposed; the general rule's taxonomy names no roll-bonus class).
Speed/distance lines (48 statblocks) surface as template-tagged verbatim
chips (no map substrate). war-dog-sparkslinger's bespoke line stays a
verbatim directive. Unknown FUTURE strings refuse to classify.
**AMENDMENT (user note: "Detach should be automatic on Capt.'s death.
No other changes needed."):** when an attached captain dies, the engine
detaches them automatically — benefits end at that moment, the R-0039
pool adjustment fires if applicable, and the receipt quotes the printed
succession rule; re-attach ("a new allied creature can become that
squad's captain at the start of the next round (no action required)")
remains the Director's act. This amends R-0028's manual-detach-only
posture for the death case specifically; Director detach stays available
for all other cases. Supersedes the audit-L-3 nudge design — the nudge
becomes the automatic detach's receipt.

**Evidence (verbatim):** "While a minion squad has a captain, each
minion in the squad gains the benefits noted at the 'With Captain' entry
on their stat block." [Monsters p.9 §Captain Benefits] · "Usually, this
benefit is either a damage boost, a bonus to speed, or additional
Stamina." [Monsters p.9] · "the effects of the same ability used
multiple times don't stack" [Heroes, Stacking Unique Effects — the
recorded basis of once-not-per-member] · "With Captain: +1 bonus to
strikes" [Lizardfolk Tonguer, Monsters p.199, PDF-confirmed EXACT] ·
"With Captain: Lightning spread increases by 1 square" [War Dog
Sparkslinger, Monsters p.304, PDF-confirmed EXACT; the referent is the
ability's own Effect: "The lightning's spread is the distance it arcs
from a target to nearby enemies."] · "If a squad of minions loses their
captain, a new allied creature can become that squad's captain at the
start of the next round (no action required)." [Monsters p.9, recorded
in R-0028]

**Gate 3:** amended-and-accepted via the squad-attack-gate3 card surface
(cardHash a177bd29 verified; amendment recorded above), 2026-08-26.

## R-0039 — Stamina-type With-Captain benefits shift effective per-minion Stamina; mid-fight attach/detach adjusts the pool (approved 2026-08-26)

**Ruling:** while a "+N bonus to Stamina" captain (10 statblocks;
+2/+3/+4/+6) is attached, the squad's effective per-minion Stamina is
printed + N — pool, max, the kill divisor, and the R-0025 area
per-contribution cap all move together, so the one-home damage math and
the ruling never diverge. Attach adds N × living members to pool and
max; detach/death removes N × living-at-detach, floored at 0 — kills
already recorded are never retroactively undone. Both movements
receipt-visible. (Composes with R-0038's amendment: automatic detach on
captain death fires this adjustment.) This answers the book-silent
mid-fight question R-0028 explicitly parked for this family.

**Evidence (verbatim):** "Each squad of minions shares a Stamina pool,
with initial Stamina equal to each individual minion's Stamina
multiplied by the number of minions in the squad." [Monsters p.7 §Shared
Low Stamina] · "With Captain: +2 bonus to Stamina" [Lizardfolk
Shellguard, Monsters p.199, PDF-confirmed EXACT]

**Gate 3:** accepted via the squad-attack-gate3 card surface (cardHash
a44aa128 verified), 2026-08-26.

## R-0040 — The event record reactions key off; "loses Stamina" is NOT "takes damage" (approved 2026-08-29)

**Ruling:** every application the engine performs records the events a
printed trigger could condition on — damage taken and dealt (amount,
damage types, whether it came from a power roll, and the roll's
edge/bane/tier facts), being targeted, a roll being made and its tier,
reaching 0 Stamina, dying, becoming winded (computable: half maximum
Stamina), losing OR regaining Stamina, a turn starting or ending, and an
ability being used. Using a reaction points at the exact recorded
occurrence; a player may always assert an occurrence the engine did not
see. Movement, trap plates, "twice in one turn" counters, and
hidden-state triggers stay asserted — no map and no memory substrate is
built for them.

The one book-silent call, ruled: **"loses Stamina" and "takes damage"
stay DISTINCT.** A Stamina loss that is not damage (Bleeding's drip,
paying Stamina for a perk) does not set off "takes damage" reactions.
Bleeding's own text is the map — it says "lose Stamina" everywhere
except the one case it explicitly calls damage, and that case fires.
Damage soaked by temporary Stamina still counts as taking damage
(printed). The rejected alternative was to make every Stamina drop count
as damage, which contradicts the printed wording.

**Evidence (verbatim):** "Trigger: You lose Stamina and are not dying."
[Heroes p.132 — Fury (Stormwight), Furious Change] · "Trigger: You take
damage." [Heroes p.132 — Fury (Reaver), Unearthly Reflexes — the two
phrasings, same page, same class] · "Whenever a creature takes damage,
they reduce their Stamina (see below) by an amount equal to the damage
taken." [Heroes p.277 §Damage — the printed direction; the converse is
nowhere written] · "If an ability or effect deals damage without
requiring a power roll, that is not rolled damage, and effects that add
to or are triggered by rolled damage don't apply." [Heroes p.74 §Rolled
Damage] · "The target would take damage from an ability that uses a
power roll." [Heroes — Conduit, Word of Judgment (trigger)]

**Engine consequence:** damage claims carry rolled-damage provenance;
occurrence derivation runs over the claim stream; reaction dispatch
carries an occurrence id. Asserted occurrences remain available.

**Gate 3:** accepted via the reaction-effect-gate3 card surface (cardHash
890fdf66 verified), 2026-08-29.

## R-0041 — A `declared` phase before the roll gives being-targeted reactions a lifecycle home (approved 2026-08-29)

**Ruling:** an ability that rolls opens in a `declared` state — targets
named, dice not yet thrown — then rolls, then commits. Hosts still
pipeline declare→roll→commit in one tap unless a reaction wants in.
Reactions triggered by being TARGETED now have a real moment: they may
swap the target or curse the roll before it exists, every change on the
receipt. The declared target list may legally GROW mid-resolution — the
books do it — so target changes are tracked edits, never
re-declarations. A turn ending with something declared but never rolled
cancels with a receipt; nothing was rolled, so nothing is lost.

**Evidence (verbatim):** "Trigger: A creature targets the monarch with a
strike. Effect: The ally is the target of the triggering strike
instead." [Monsters p.164 — Goblin Monarch, Meat Shield — fires at
targeting time, before any roll exists] · "The target can choose one
additional target for the triggering ability. Any damage dealt to the
additional target is sonic damage." [Heroes — Troubadour, Harmonize — a
reaction that ADDS a target mid-resolution] · "You can affect one
additional target with this strike." [Heroes — Lachomp Tooth
(consumable), tier 1; higher tiers add up to three or seven — the target
list is a function of the roll and cannot be fully fixed at declaration]

**Engine consequence:** the resolution entry becomes phase-discriminated
(schema v7) with a `declared` arm, a declaration/roll hash pair, a
declared-cancel at end-turn, and invariant claims for declared births and
transitions. Openness is decided at the one home landed as `0f5e713`
(`isOpenResolution`): `declared` is ruled OPEN; declared-cancel is not.

**Gate 3:** accepted via the reaction-effect-gate3 card surface (cardHash
f2b4e0bf verified), 2026-08-29.

## R-0042 — Halving damage: halve → weakness → immunity; two halvers stack (approved 2026-08-29)

**Ruling:** the 46 "halve the damage" reactions (all printed phrasings)
automate as a cut-in before damage lands, in the printed order **halve,
then weakness, then immunity**. Damage printed as irreducible refuses the
halve, with a receipt. Look-alikes are kept distinct: a reaction that
deals NEW damage "equal to half the triggering damage" is not a halve and
is never treated as one; reactions that halve an ally's Stamina REGAIN,
split the damage with the protector, or halve across an area automate
only their clean halve part and show the rest as printed text.

Two calls the books never make, ruled: **(1)** halve-vs-weakness order is
unprinted (only halve-vs-immunity and weakness-vs-immunity are printed) —
ruled halve first, then weakness, then immunity, matching the printed
example's shape. **(2)** two halvers on one hit is printed-legal (the
book lets multiple reactions answer one trigger) but half-of-half is
nowhere printed — ruled that they STACK (quarter), each on the receipt,
fractions settled once at the end, rounding down.

**Evidence (verbatim):** "Damage immunity should be the last thing
applied when calculating damage. For instance, if your hero has fire
immunity 5 and takes 8 fire damage, they take 3 damage. But if an ally
first halved the damage with a triggered action, your hero would take 4
damage before immunity is applied, with immunity then reducing the damage
to 0." [Heroes p.277 §Damage Immunity — the printed order AND this
family's exact golden test] · "If a creature has both damage immunity and
damage weakness for a source of damage, apply the weakness first, then
the immunity." [Heroes — Damage Weakness] · "The target takes psychic
damage equal to half the triggering damage." [Heroes — Talent, Feedback
Loop — reflected damage, NOT a halve] · "This extra damage can't be
reduced in any way." [Monsters — Ajax, Shieldbreaker Talisman]

**Engine consequence:** the halve modification composes rather than
overwrites, and carries an irreducibility check. The p.277 worked example
ships as an exact golden.

**Gate 3:** accepted via the reaction-effect-gate3 card surface (cardHash
f9dca432 verified), 2026-08-29.

## R-0043 — Roll-touching reactions: edge/bane, tier change, reroll (approved 2026-08-29)

**Ruling:** three roll-touching shapes automate, each bound to the
specific open resolution it modifies — never a floating buff that could
land on the wrong roll. **(1) Edge/bane imposers and transformers** (32
in the corpus), including additions and conversions, applied before the
roll when triggered by targeting, or re-evaluating the already-made roll
when triggered by "would take damage". **(2) Tier changes** — down, UP,
or SET to a chosen tier. **(3) Rerolls** — the original roll is kept
intact on the receipt and everything recomputes from the new dice. All of
it composes with the shipped commit flow; tier text the templates do not
recognize keeps showing its printed words (unchanged residue posture).

**Evidence (verbatim):** "Effect: The power roll takes a bane against the
target. Spend 1 Piety: The power roll has a double bane against the
target." [Heroes — Conduit, Word of Judgment — a bane against ONE target
of an already-made roll] · "An edge on the triggering roll becomes a
bane, or a double edge becomes an edge. […] A bane becomes an edge, or a
double bane becomes a bane." [Heroes — Troubadour, Turnabout Is Fair Play
— transformation, not addition] · "The bandit chief takes 5 corruption
damage and increases the outcome of the power roll by one tier."
[Monsters — Human Bandit Chief, Bloodstones — tier goes UP] · "The target
obtains a tier 1 or tier 3 outcome on their power roll (your choice)."
[Heroes — Censor level 9, Blessing and a Curse — a tier SET; its
future-roll second half waits for the grant system, noted not dropped] ·
"You can use this ability after seeing the result of the triggering roll.
The target must reroll the power roll and use the new roll." [Heroes
p.189 — Talent, Again]

**Engine consequence:** the modification union generalizes —
roll-modifier and reroll arms added, `tier-adjust` generalized to cover
up/down/set. Edge/bane arithmetic routes through the existing one home
(R-0014/R-0015 count → cap → cancel), never a second implementation.

**Gate 3:** accepted via the reaction-effect-gate3 card surface (cardHash
02556d7e verified), 2026-08-29.

## R-0044 — Unrecognized reaction effects show printed text on the receipt; the hard cases are named now (approved 2026-08-29)

**Ruling:** the 150 reactions outside the automated shapes still get
their occurrence, their once-per-round accounting, and their cut-in
point; their effect displays verbatim for table resolution, exactly like
the unrecognized action costs ruled in the turn-structure batch. The ten
the effect engine can already execute outright are executed. Teaching the
effect engine the other ~140 is deliberately its own future project, with
this family's survey as the work-list — not smuggled into this one.

The honest hard cases are logged now rather than discovered later: a
handful of reactions rewrite things the engine owns — summoning creatures
mid-fight, a minion transforming and leaving its squad's Stamina pool, a
bargain that seizes control of a hero's next turn, "can't be brought back
to life" — and printed text on a receipt alone cannot land those. Each is
a named gap needing its own machinery; until then the receipt states both
what the book says and that the engine cannot do it yet.

**Evidence (verbatim):** "Three hobgoblin recruits manifest from the
target's blood into unoccupied spaces adjacent to the target." [Monsters
— Hobgoblin Bloodlord, An Army From Blood] · "If the target accepts, they
are reduced to 1 Stamina instead. On the target's next turn, the defector
controls their move action and the target must use a signature ability
against a creature of the defector's choice or immediately die."
[Monsters — Devil Defector, Tempting Offer] · "The target can't be
brought back to life." [Monsters — Slaughter Demon, Devour Soul]

**Gate 3:** accepted via the reaction-effect-gate3 card surface (cardHash
e128aa72 verified), 2026-08-29.

## R-0045 — Printed "before"/"after" clauses route to their own cut-in point; the unconscious restriction is added (approved 2026-08-29)

**Ruling:** when a reaction's own text says when it lands, that is where
it lands — "before the damage is resolved" / "resolves before the
triggering movement" cut in ahead (4 in the corpus); "after the ability
is resolved" lands after (11). One reaction may carry both clauses, and
each clause routes to its own point. Would-die replacement traits stay as
ruled in the turn-structure batch: named cut-in, full printed text shown,
no automation yet.

Found while red-teaming and fixed here: the books forbid unconscious
creatures from using triggered actions (and everything else), but only
the dazed and surprised restrictions were ruled and built in the
turn-structure batch. The unconscious restriction is added on the same
terms — warn and apply, printed escapes pierce it. This is this family's
only change to the action-economy rules.

**Evidence (verbatim):** "Each target shifts up to 2 squares before the
damage is resolved." [Monsters p.194 — Kobold Centurion, Testudo!] · "You
take half the triggering damage, then can shift up to 2 squares after the
triggering effect resolves." [Heroes — Shadow, Defensive Roll — two
clauses, two cut-in points] · "While you are unconscious, you can't take
main actions, maneuvers, triggered actions, free triggered actions, or
free maneuvers" [Heroes §Unconscious]

**Engine consequence:** the unconscious restriction rides the shipped
R-0030 warn machinery and is escape-flag-ready.

**Gate 3:** accepted via the reaction-effect-gate3 card surface (cardHash
5b96d759 verified), 2026-08-29.
