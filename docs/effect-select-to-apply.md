# Select-to-apply — a third disposition for Effect directives (2026-08-29)

> Drafted by Claude Opus 5; no second-model read yet — see
> [`authorship.md`](authorship.md).

## Where this came from

The first 100 lines of the unreviewed 660 (the movement chunk, where 130 of
163 rows are mixed positional-plus-engine) went to user Gate-3 review. The
review offered two dispositions — *presentation* or *automation* — and the
user added a third, which had not been in anybody's model:

> certain effects that are positional so the engine can't determine them, but
> carry meaty mechanics. The engine could apply if it knew who to apply it to,
> is a new category where it must prompt the acting party to select targets and
> then the engine applies

**8 of the 93 cards were ruled into it.** It is the largest new finding of the
pass.

## Batch-1 outcome

| disposition | cards | lines |
|---|---:|---:|
| presentation | 69 | 76 |
| automation | 15 | 15 |
| question | 9 | 9 |
| — of which **select-to-apply** | **8** | **8** |
| — of which other | 1 | 1 |

All 93 returned payload hashes verified byte-exact against the served cards;
100/100 staged lines covered. Ledger:
`.artifacts/canon/effect-shape/movement-batch1-rulings.json`
(sha256 `39fb53fd976dfae6e3de6859339d52139f805ec9608a42cab3ae4fda0be6f217`).

## The shape

Every one of the 8 has the same structure: **a positional predicate selects a
set, and a fully-specified mechanical payload applies to that set.** The engine
knows exactly WHAT to do and cannot know WHO to do it to. Verbatim:

> "The dragon expels blistering steam, dealing 7 fire damage to each target in
> the area." — Crucible Dragon, Thermodynamic Flight

> "The palinode and each target then gain 5 temporary Stamina." — High Elf
> Palinode, Recall

> "Each target shifts or flies up to their speed and regains 10 Stamina." —
> Dorzinuuth the Base, Wings of Second Wind

> "Each target is pulled up to 5 squares toward the dragon, who gains 5
> temporary Stamina for each target pulled." — Thorn Dragon, Investiture of
> Verdure

The payload is exact (7 fire damage, 5 temporary Stamina, 10 Stamina) or
derived from something the engine holds (a characteristic score, a count of the
selected set). Only the set is unknowable.

## Why this is not new engine substrate

This is **Tier 3 of the shipped three-tier model** — "player-asserted,
engine-offered: engine enumerates options conditional on facts the player
provides" — reached from the corpus side rather than the design side.

The engine already takes targets as an ASSERTED input:
`UseAbilityPayloadSchema.targets` is `z.array(ParticipantIdSchema).min(1)`, and
DEC-0011 already commits the engine to consuming asserted spatial facts rather
than computing geometry. Nothing about the *rules* is missing.

What is missing is two things, neither of them a rules mechanism:

1. **The compiler must emit a structured, executable payload beside the printed
   text** — "apply 7 fire damage to a set of size N" — instead of collapsing the
   whole line to verbatim residue.
2. **The host must prompt for the selection and dispatch it.** There is no
   prompt/selection concept anywhere in `packages/engine/src/schemas.ts` today;
   this is a protocol and UI addition above the intent layer.

That matters for planning. Every other candidate in this programme was an
execution-VM problem — control flow, lifetimes, subscriptions, predicate
evaluation (see `effect-prose-analysis.md` §10 and the manual audit). This one
is bounded, needs no new rules mechanism, and rides substrate that already
ships.

## Consequences

- **Select-to-apply is a disposition, not a build queue entry.** Its lines are
  neither presentation-complete nor VM-blocked; they should be counted
  separately, or the backlog will keep mixing "the engine can't" with "the
  engine wasn't asked."
- **The remaining 560 unreviewed lines must be reviewed against three
  dispositions, not two.** The first 100 were reviewed against two, and 8
  surfaced anyway — the true rate is a floor.
- **Already-reviewed rows may need re-reading.** The 961-line manual audit and
  the earlier automated classifier both used a two-way split. Any row filed as
  presentation *because* its targets were positional could be select-to-apply.
- The one non-select `question` — Bracers of Strife — is a different problem: an
  item-granted persistent modifier whose dependency is the inventory/character
  sheet, not the Effect pipeline.

## Named follow-ups from the batch-1 notes

- **Lumbering Egress** (`automation`) — mid-encounter minion spawn. Flagged for
  its own review; the roster is fixed at encounter start and the squad Stamina
  pool would silently omit the new minions.
- **Concealment Potion** (`automation`) — "for 10 minutes" has no clock the
  engine owns. Needs an implementation ruling; likely reads as end-of-encounter.
- **Behold the Face of Justice** (`automation`, overturning a presentation
  recommendation) — the forced movement is recorded for the future VTT and
  presented meanwhile; the damage is engine-applied. A worked example of the
  split disposition.
- **Meteor** and **World Torn Asunder** — presentation now, flagged for future
  VTT work.
