# Effect-prose Gate-3 docket (draft, unapproved)

Status: **superseded as a ruling docket (2026-09-03)** — run through the
silence-mining ruling-deck loop (`docs/silence-mining.md`) all eight batches
were refuted by the adversarial pass: each bundled engine-design choices with
already-ruled points. The recut salvaged 14 single-decision book ambiguities
(`.artifacts/canon/rulings-decks/deck-01b-effect-prose-residue/`), of which
four reached the user in deck `rule-these-2026-09-03`; the other 116 topics
are accounted for in that deck's `settled-elsewhere.json`. The batches below
remain useful as the map of the audited rows. Originally: source-complete,
grouped, not approved · canon pin
`520553438a4e8d199bfaaf676b8aa9bd273f4d61`

The manual Effect audit raised 77 flagged rows carrying 69 unique row-question
texts, plus five global stat-overlay questions. They are now covered exactly
once by eight decision batches instead of one card per line. The source-bearing
docket remains ignored at
`.artifacts/canon/effect-shape/effect-prose-gate3-docket.json` (SHA-256
`1e1f8c52d8208b63c6392845af7cd4c60c3153fdb31c71e3d4e4ec2c27c2b661`).
Every row retains its exact Effect text, payload SHA-256, source ledger, and all
overlapping question texts.

Nothing in this document is a ruling. The recommendations are the defaults to
put on the review cards after a final canon-evidence pass.

Nor is this docket a build-priority decision. The 396 automation-needed count
is only the audited lower bound from 961 / 1,621 lines. The remaining 660 must
be audited and merged before selecting the first VM substrate; in particular,
a 163-line movement chunk with 130 mixed positional-plus-engine rows can change
the ranking at the DEC-0011 boundary. These eight batches may be ruled now, but
their acceptance does not authorize a vertical before the full census.

| proposed ruling | batch | rows |
|---|---|---:|
| R-0046 | plane ownership and presentation completeness | 16 |
| R-0047 | attributed overlays, instance identity, and values | 15 + 5 global questions |
| R-0048 | nested ability execution and player/Director choices | 19 |
| R-0049 | VTT movement traces and target binding | 7 |
| R-0050 | participant, object, transformation, and teardown lifecycle | 6 |
| R-0051 | event ordering and effect lifetimes | 7 |
| R-0052 | counters and first-use quantifiers | 2 |
| R-0053 | bespoke resolution policies | 5 |

## R-0046 — Plane ownership and presentation completeness

**Recommended default:** encounter state consumes a character/participant
snapshot; title and advancement selection belongs to the data / character-
building plane. Explicitly cross-encounter consequences are emitted as durable
handoffs to that plane, never silently converted into encounter state or swept
early. Until the owning plane implements a handoff, exact printed text plus
occurrence, accounting, and an explicit ownership label is a truthful complete
result for the runtime plane.

This batch also carries the general policy decision needed to accept the 408
provisional presentation-complete rows. Acceptance would add them to the
hash-keyed disposition manifest; it would not relabel any table program as an
automatic program.

## R-0047 — Attributed overlays, instance identity, and values

**Recommended default:** temporary weakness/immunity and similar stat changes
are attributed effect instances, never direct `ParticipantStats` rewrites.
They join seeded rows at the existing highest-applicable weakness-first,
immunity-last fold. Same program/source/holder reapplication replaces under
unique-effect stacking; different sources coexist. Expiry removes only that
instance. Derived damage types and numeric values snapshot at application
unless the text explicitly defines a live predicate or changing value.

The card must separately settle `while` (live gating, potentially active again
while the parent instance exists) versus `until`/`ends` (consuming expiry), the
two incrementing weakness rows, non-positive derived weakness, per-target
damage-type choice, source-filtered combined damage, and maximum-Stamina
restoration/clamping. The five global stat questions are folded here verbatim.

## R-0048 — Nested ability execution and choices

**Recommended default:** a printed nested “use” runs the ordinary ability
pipeline—declare, allow reactions, roll, commit—at that point in source order.
It does not spend another action unless printed, but ordinary resource costs
and use caps still apply unless the source explicitly waives them. Every real
choice is represented as a hash-bound pending decision owned by the named
player or Director; declining and target selection are explicit, not inferred.

Row clauses still need to pin multi-use ordering, shared versus separate rolls,
when post-movement targets lock, and how explicit cost/cap waivers such as
Prism compose with the normal pipeline.

## R-0049 — VTT movement traces and target binding

**Recommended default:** DEC-0011 remains intact. The VTT/table supplies an
ordered movement/contact trace and asserted target bindings; the engine neither
stores nor recomputes geometry. “The first time … through a creature” is
deduplicated per creature for that movement. A target set gathered during
movement freezes after the movement trace and before its shared roll unless the
source explicitly names an earlier cut-in.

The card must settle failed spatial replacement (retain the original target or
cancel the replacement only) and the one mentor-distance cancellation scope.

## R-0050 — Participant, object, transformation, and teardown lifecycle

**Recommended default:** something that takes turns, uses abilities, or owns
creature statistics is a participant; something targetable/destructible but
unable to act is an object; everything else is an attributed effect instance.
Creation is atomic with roster membership and provenance. Removal/expiry tears
down only the created instance and its owned subscriptions.

The card must settle current-round turn insertion for fixed summons, killed
minion re-entry into a shared pool, detached-head and petrification state, and
the ash clone's printed identity.

## R-0051 — Event ordering and lifetimes

**Recommended default:** state commits first, then emits the occurrence that
describes the committed transition; downstream mandatory effects run in
printed order through the same resolution stack. A consumed `until`/`ends`
instance cannot resume. Simultaneous independent responders require one
receipt-visible ordering choice rather than an implicit object/map order.

The card must pin ambiguous turn pronouns, start-round refresh versus damage,
temporary-Stamina depletion versus detonation, dying-transition timing, and
competing mark terminators.

## R-0052 — Counters and first-use quantifiers

**Recommended default:** a printed base amount applies to the first use; “each
time this ability is used” updates the stored value for the next use unless the
source explicitly says the current result changes. Per-creature contact wording
decrements once for each qualifying creature per movement, not once per square
or repeat entry.

This resolves the Break Armor / Quick Shield first-use questions and
Deathcount provenance only if the final evidence pass finds no contrary worked
example.

## R-0053 — Bespoke resolution policies

Five rows do not honestly generalize: ignored nondamaging clauses on mixed
abilities (two rows), Fulcrum's roll-to-area envelope, Renegotiated Contract's
odd Stamina split, and Fake Your Death's interaction assertion.

**Recommended defaults:** ignored clauses emit a visible skipped receipt but no
state occurrence; Fulcrum uses its attached ordinary Reason ability roll and
tier-to-burst mapping; global Always Round Down gives “you” the floor half and
the target the remainder; the VTT/table asserts illusion interaction under
DEC-0011. These four source/standing-rule answers should be removed from Gate 3
if the final evidence pass confirms them, leaving no invented policy in this
batch.

## Approval and sequencing gates

Before implementation, each card needs its verbatim book anchors, alternatives,
affected-row hash, and an accept/amend/hold verdict. Approved language is then
recorded in `docs/canon-rulings.md`; held clauses remain table directives and
cannot silently shape the VM.

Separately, implementation selection waits for the remaining 660-line audit to
be merged and the complete automation families to be re-ranked. Gate-3 approval
can settle semantics in parallel; it does not freeze the current sample's build
order.
