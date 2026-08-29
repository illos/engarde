# Effect-prose manual audit checkpoint (2026-08-29)

## Outcome

The committed automation-versus-presentation classifier was useful for making
review lanes, but its headline and proposed implementation order do not survive
manual audit.

Nine row-level audits made 1,062 judgments over **961 unique Effect lines**,
59.3% of the 1,621 table-directive corpus. Seven overlaps disagreed; the merged
checkpoint resolves them conservatively (`automation-needed` before
`undecidable` before `presentation-complete`) and prefers the narrower
full-context audit.

| manual verdict | unique lines |
|---|---:|
| presentation-complete | **502** |
| automation-needed | **390** |
| undecidable / payload join or ruling needed | **69** |
| **reviewed** | **961** |
| not manually reviewed | 660 |

These are review counts, not an extrapolation. In particular, **397 is not a
ceiling on the automation backlog**, and the first pass's 397–460 range has no
defensible population inference behind it. Its 40-line audit and this pass's
risk-enriched samples establish failure modes; neither is a self-weighting
prevalence sample.

No coherent implementation slice in the audited candidate lanes clears 25
complete Effect lines, so no engine build was launched from these cohorts. A generic
event → predicate → lifetime → effect system would reach many rows, but that is
the Effect execution VM, not a bounded family.

## The number that can come down now

The full census of automated-P, no-slot movement rows found **119 / 140** whose
entire remaining responsibility is spatial or whose nonspatial one-shot already
has an ordinary intent path. DEC-0011 already assigns those positions, paths,
distances, adjacency, concealment, and movement permissions to the VTT/table.
They are presentation-complete today.

The runtime truthfulness count remains **1,621 table directives**: a correct
table directive does not become an automatic program merely because no engine
mechanism is missing. The backlog accounting changes instead:

| table-directed status | before this pass | after accepted spatial census |
|---|---:|---:|
| permanently manual narrative (existing reviewed set) | 12 | 12 |
| presentation-complete under DEC-0011 | 0 | **119** |
| still pending review or mechanism | 1,609 | **1,490** |
| **table directives** | **1,621** | **1,621** |

The merged 502 P verdicts also contain all 12 previously accepted narrative
lines. The other **371** manually reviewed presentation-complete lines are
provisional. Moving them into durable backlog accounting needs a Gate-3 ruling
that extends R-0044's reaction-residue posture to general Effect directives.
This pass does not silently make that policy decision.

## Corrections to the first-pass build order

### Timing and duration: 117 mentions are not 117 compilable lines

The classifier treated a known boundary as sufficient substrate. It is not.
Schema v8 has boundary dispatch and a sweep registry, but no generic persistent
effect instance carrying value, holder, source, selector/predicate, stacking,
and expiry.

The 70-row near-substrate audit found 39 presentation-complete, 30
automation-needed, and 1 undecidable—40 disagreements with the machine A
verdict. Standing edges/banes, damage and speed modifiers, suppression, delayed
payloads, fixture state, and source-anchored effects do not become representable
by adding an ending enum. The largest reusable label was 13 manual-roll-input
rows, a presentation cohort rather than a compiler family.

### Existing occurrences: only 43 / 134 have exact event coverage

The occurrence tag matched trigger vocabulary and occurrence vocabulary
anywhere in the same line; it did not prove that the recorded event was the
event that triggers the effect.

Manual census of all 134 rows found 43 exact, 81 partial, and 10 with no
occurrence coverage. The largest exact cohort is 16 damage-reactive rows, still
split by selector, predicate, lifetime, value expression, and payload. The
`ability-used` occurrence is also narrower than its name: it is derived from
`resolutionOpened`, so non-rolling maneuvers, triggered actions, and
table-directed abilities do not emit it.

The smallest honest VM vertical is condition-linked turn-boundary damage, but
it reaches fewer than 25 lines and is a substrate proof, not a bulk decrement.

### Stat rewrites: overlays, not a `ParticipantStats` setter

All 54 audited weakness/immunity rows can affect the damage pipeline, but a
direct stats mutation cannot preserve or restore overlapping sources. The safe
shape is an attributed overlay instance with source, holder, type selector,
value, and lifetime, folded with seeded rows in the existing weakness-first /
immunity-last home. Expiry removes one instance; it never restores a saved
snapshot.

The largest coherent stat-clause cohort is 21 fixed participant overlays. Only
**8 whole Effect lines** in it need no other missing substrate. There are zero
maximum-Stamina rows in the 54-row cohort, so the first pass's max-Stamina claim
was unsupported; max changes still need separate current-Stamina, threshold,
composition, and restoration rulings.

### Choice menus cannot be classified from their intro line

All 40 `choice-menu` rows contain only “choose …” introductions; their arms are
outside the captured Effect line. A census classified all 40 as undecidable
pending source joining. The first pass's “choice-menu is 0% A” conclusion does
not follow from payload-free rows.

### Structural regexes are candidate generators, not inventories

The 99-row structural/off-vocabulary audit found 39 rows with at least one
false selected tag. Participant creation overfired on conjured shields,
same-actor reappearance, ability names containing “Manifest,” and illustrative
mentions of separately summoned creatures. Timing probes repeatedly mistook
“an effect that ends at the end of their turn” (an immediate eligibility test)
for a future turn subscription.

The largest closed implementation cohorts were five siege reload gates, four
fixed canonical summons, and three ability-counter period extensions. None is a
bulk path.

## What the manual pass categorized

| lane | row judgments | main result |
|---|---:|---|
| P/U boundary stress test | 184 | original U → 15 A / 9 P; sampled P → 20 A / 126 P / 14 U |
| lifecycle / near-substrate | 70 | 39 P / 30 A / 1 U; no 25-line build |
| occurrence-backed candidates | 134 | 43 exact / 81 partial / 10 none |
| stat rewrite | 54 | all need an overlay; only 8 whole-line simple wins |
| no-slot `other` census | 222 | 177 P / 27 A / 18 U |
| predicate lifetime | 92 | 41 P / 51 A; largest whole-line cohort 12 |
| no-slot movement census | 140 | **119 P / 21 hidden A** |
| no-slot remainder census | 67 | 24 P / 43 payload joins |
| structural/event-outside | 99 | no implementation cohort above 5 |

The no-slot `other` census is the other large categorization result: 177 lines
are presentation-complete, while the 27 false-P rows cluster around participant
creation, durable markers/sources, recurring boundaries, roll set/reroll,
stat/potency rewrites, suppression, and counters. Eighteen need joined context
or cross-encounter ownership decisions.

## Tier-3 queue

Across the nine ledgers, **77 unique rows** carry a Tier-3 flag, representing
**69 unique row questions**; the stat lane adds five global overlay questions.
Some row questions intentionally overlap and should collapse into rulings by
rule class. The largest classes are:

- source-attributed stat stacking, snapshotting, and expiry removal;
- nested ability costs/caps, target declaration, and reaction interleaving;
- participant/object creation, ownership, turn insertion, and teardown;
- first-use / first-creature counter quantifiers;
- cross-encounter title, item, revival, and temporary-Stamina ownership;
- ambiguous turn anchors and mixed-effect suppression ordering.

The 43 payload-join rows are **not** Gate-3 questions yet. Their source is
incomplete (40 choice-menu intros plus three referenced payloads); join the
payload before asking for a ruling.

## Row ledgers and integrity

The source-text-bearing ledgers stay in ignored `.artifacts/` rather than the
repository. Every row key and exact source text was checked against
`automation-vs-presentation.json`; the initial four lanes had 442 judgments
over 433 unique lines with no verdict conflict, and the final union has seven
cross-lane disagreements. Their conservative dispositions are:

- Coat the Blade, Giant's Blood: Flame, Hellcharger Helm, and Bull Shot are A;
  the structural audit found the future event/mode hidden by the predicate
  lane's presentation verdict.
- Orc Warleader #6 and Hulking Brain #3 are A; the full movement census found
  nested ability execution and open-resolution retargeting respectively.
- Soulbinder Psyche #4 is A with a Tier-3 quantifier question; the state gap is
  certain even though “first time … any creature” is ambiguous.

JSON hashes at this checkpoint:

| ledger | rows | SHA-256 |
|---|---:|---|
| `manual-boundary-audit.json` | 184 | `5d6ebc91110945b78c553f5be98419ebe0f87cda5840d9a00bba2574de55984e` |
| `manual-lifecycle-audit.json` | 70 | `a55be7533b9a97a7374c520ac4a90a57a3bb350264ab1a0a149f0d5eda9d10ef` |
| `manual-occurrence-audit.json` | 134 | `924f23c9df6d89a2b63eaed33c15d65ac7c396aa564c7adf688ca2010e27fcab` |
| `manual-stat-audit.json` | 54 | `840458ce58405a14fbe75831b3e9d8c4e00fb2538de11408a6f79aeb76f81705` |
| `manual-no-slot-other-audit.json` | 222 | `9de1c023532d98a1d51252f97836d36fa115af1298b8903a3c36c530dbbee14c` |
| `manual-predicate-lifetime-audit.json` | 92 | `4c66bff26cb7d8639244954e385bfaccfaaf7720d25843a0c46783c8946e5c9e` |
| `manual-no-slot-movement-audit.json` | 140 | `17d9dda908c62765236bf47b6feedbb83927aea3409baa97bf4bec3082107b8d` |
| `manual-no-slot-remainder-audit.json` | 67 | `8e0b26c51f787ae98b8a13f32a462f64feed16920bf8b7e60387d4bd3e2e7cf7` |
| `manual-structural-audit.json` | 99 | `26ae77574709a25699f06d5879a3803f2a4e52e22e54255f0f077aa98a8e9778` |

The ledgers use source `artifactId + ordinal` keys and retain exact `sourceText`,
confidence, rationale, and per-row Tier-3 fields. They are a review checkpoint,
not a committed rulings manifest. A future accepted manifest must add payload
hashes and complete coverage validation like the existing narrative-triage
rulings.

## Next pass

1. Join the 43 delegated payloads before classifying them; do not infer menu
   semantics from their introductions.
2. Put the 69 row questions and five global stat questions through Gate 3,
   grouped by rule class rather than one card per line.
3. Convert the 119 DEC-0011 rows into a hash-keyed accepted presentation
   manifest so the 1,490 pending count is enforced rather than documentary.
4. If an Effect VM is later chosen, start with the sub-25 condition-linked
   turn-damage vertical and treat it as architecture validation, not a promised
   bulk unlock.
