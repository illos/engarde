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
