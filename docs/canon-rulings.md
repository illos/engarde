# Canon rulings — Gate-3-approved answers to rules ambiguities

Each entry: a question the corpus underdetermined, researched with verbatim
evidence (markdown + print PDF), ruled on by the user. Engine mechanisms cite
these entries when they encode the ruled behavior.

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
never pooled. Eligibility beyond non-Mount/non-minion (shared language) is
table-asserted. While attached, the squad surface shows the stat block's
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
