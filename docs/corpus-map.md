# Corpus map — coarse bucket classification of all 3,529 artifacts

Status: first full sweep complete 2026-08-29. **Navigational only.** This map is
not a canon ruling, not a Gate-3 disposition, and not authority for any engine
behavior. Its single purpose is to chop a large unexamined body of text into
chunks a human can navigate. Rows will move; that is expected and fine.

## Why this exists

Effect-line classification (GOTCHA-0010, DEC-0012) was resolving the corpus one
prose line at a time. A census on 2026-08-29 measured the scale that approach
faced: 15,082 residue lines across 717 distinct shapes, of which the entire
Effect programme covers 1,621. At that resolution the tail is years of rulings.

The census also found the real hole: **2,173 artifacts (61.6% of the corpus,
1.74 MB, 40.6% of bytes) carried no engine construct at all** — not blocked,
never examined. Only 365 of them had ever been looked at, by the whole-artifact
prose triage funnel, which produced 9 rulings.

The user's call was to stop line-by-line, sweep everything at low resolution,
and aim at a playable session instead.

## Buckets

Eight, chosen by "who consumes this text?". Primary plus optional secondaries.

| bucket | test |
| --- | --- |
| `prose` | narrative, lore, in-world voice, designer commentary; software at most displays it |
| `engine` | a program must EXECUTE it during live play in a fight or timed scene |
| `character-builder` | shapes the character sheet rather than resolving a moment of play |
| `director-tools` | prep-time authoring: encounter building, budget maths, roles, difficulty, scene setup |
| `campaign-layer` | state between encounters: respite, projects, renown, levelling, session structure |
| `reference-data` | structured records stored/searched/displayed but never executed |
| `table-adjudication` | printed rule that is the human Director's call, or depends on table facts software cannot know |
| `unclear` | genuinely undecidable; a legitimate answer |

`spatial` rides as an independent tag, not a bucket — DEC-0011 already routes
spatial to the VTT plug-in, and it cross-cuts `engine` and `director-tools`.

`criticalPath` is a per-row flag: would a group be UNABLE to play one complete
session end to end without this implemented?

## Method

31 Opus agents. Pool A (2,173 previously unexamined artifacts) read in full
across 27 batches, one agent each, every artifact classified individually.
Pool B (1,356 already-parsed ability artifacts) classified by family rule across
90 id families, derived by one agent and adversarially checked by another.

**Measured agreement:** a stratified 10.1% sample (219 artifacts) was re-read
blind by independent agents. Exact primary-bucket match **84.0%** (184/219);
**98.2%** when the other reader's primary appears anywhere in the first
reader's primary+secondaries.

This matters because DEC-0010 dropped model classification as a pipeline stage
after measuring 36% same-model self-disagreement. The difference is the
question: DEC-0010 judged a fuzzy tier/category label; this judges "who consumes
this text", which is far more determinate. **84% is good enough to trust the
shape and route attention. It is not good enough to trust any single row.**

## Result — full corpus

| bucket | artifacts | % | KB | % bytes |
| --- | ---: | ---: | ---: | ---: |
| engine | 1,614 | 45.7% | 2,286 | 52.2% |
| character-builder | 694 | 19.7% | 586 | 13.4% |
| reference-data | 510 | 14.5% | 418 | 9.5% |
| director-tools | 301 | 8.5% | 250 | 5.7% |
| campaign-layer | 182 | 5.2% | 280 | 6.4% |
| prose | 178 | 5.0% | 487 | 11.1% |
| table-adjudication | 48 | 1.4% | 73 | 1.7% |
| unclear | 2 | 0.1% | 0 | 0.0% |

Pool A alone (the previously unexamined half) is materially different in shape:
character-builder 26.2%, engine 25.4%, reference-data 19.3%, director-tools
13.9%, prose 8.0%, campaign-layer 5.1%, table-adjudication 2.1%.

**Only 8% of the unexamined half was pure prose.** The blob was not lore.

### The pool B correction

The derivation agent filed 59 of 90 families as `reference-data`, including 29
monster families (506 artifacts, 37% of pool B), ruling from the stat-line
header alone. The adversarial checker refuted it: a statblock is mostly ability
blocks — power rolls, tier bands, save-ends conditions, malice-costed triggered
actions — structurally identical to the `feature.ability` family the same pass
called `engine`. `reference-data` is defined as records the app *never
executes*, and a monster turn cannot be run without executing these.

53 families were corrected to `engine` primary / `reference-data` secondary /
`mixed: true`. Left unfixed, the map would have told an implementer that a third
of the corpus is display-only.

## The critical path — 30 artifacts

The proposed build order for a playable session. 27 `engine`, 3
`character-builder`, concentrated in exactly the chapters the census flagged as
having had no lane: `combat` (13), `introduction` glossary (6), `the-basics`
(4), `classes` (3), `making-a-hero` (2), `tests` (1), `monster-basics` (1).

Cross-checked against `packages/engine/src`, they split three ways:

**Already shipped** — power roll, tier bands, damage, Stamina, saving throws,
recoveries (`spend-recovery`), dying, conditions, action economy, malice
(partial, squad path only).

**Not shipped, no substrate** —
- **Turn scheduling.** `begin-combat` / `advance-round` / `start-turn` /
  `end-turn` exist; nothing decides *who acts next*. Already a named remaining
  arc on ROAD-0005. `.artifacts/canon/turn-scheduling/survey.json` exists;
  no build.
- **The 17 common actions.** `feature.common.*` — 4 main actions, 10 maneuvers,
  3 move actions — inventoried in `packages/canon/src/common-actions.test.ts`
  and carried losslessly, but not executed. `free-strike` exists only on the
  squad path (`squad-free-strike`); there is no hero free strike. Catch Breath
  appears in zero engine files. These are the things every character does every
  turn.
- **Hero-side malice / heroic resource** as an open-form arc.

**Blocked by an existing decision** — grid movement, movement speed, distance,
line of effect, and target legality are all flagged criticalPath, and all are
spatial. DEC-0011 assigns spatial to the VTT plug-in with the engine consuming
ASSERTED facts. So the critical path does not mean "build geometry"; it means
the assertion surface for these facts has to exist and be exercised, or a
session cannot legally resolve targeting.

## Where the buckets fought back

Five boundaries, from the disagreement analysis. Recorded because they predict
where a later pass will have to re-cut, not as defects.

1. **engine vs character-builder on class features** — the largest fault line (7
   of 35 disagreements) and `classes` is the biggest chapter (1,235 across both
   pools). Is a standing modifier the grant (sheet) or the application (play)?
   Nearly every such row already lists the other bucket as a secondary; the
   recommendation is to record both rather than keep asking.
2. **reference-data vs engine on the introduction glossary** — worst large-n
   chapter at 72.0% agreement. Every glossary entry is simultaneously a lookup
   record and a statement of a rule the engine runs. The real question is "is
   this the rule's home or a pointer to it?", which the vocabulary cannot say.
3. **reference-data vs prose on fielded lore** — gods-and-religion scored 40%.
   Fights back whenever the data-to-prose ratio is small but nonzero.
4. **campaign-layer vs director-tools on awarded resources** — weakest bucket
   stability measured (campaign-layer 62.5%). Victories are both a Director
   judgment and persistent between-encounter state; the distinction that matters
   is granting-moment vs ledger, and each bucket captures one half.
5. **the negotiation subsystem** — a genuine four-way split, joint-lowest
   chapter at 40%. The interest track is a keyed lookup, a state machine, a
   narration cue and a referee call at once. Relatedly `table-adjudication` is
   the least confident bucket overall (37% of its rows below high confidence) —
   it is behaving as a cross-cutting property rather than a peer bucket.

## Artifacts

All under `.artifacts/canon/corpus-map/` (gitignored, regenerable):

- `corpus-map.json` — all 3,529 rows: id, chapter, bytes, pool, primary,
  secondaries, spatial, criticalPath, confidence, justification
- `rulings/batch-01..27.json` — pool A, one file per agent
- `rulings/recheck-1..3.json` — the blind re-read sample
- `pool-b-map.json` — the 90 family rules (corrected) + materialized rows
- `batches/`, `pool-b-sample.json`, `batch-index.json` — inputs

Regenerate the inputs from the accepted campaign manifest; the rulings are model
output and are not reproducible byte-for-byte.
