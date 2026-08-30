# The Effect-prose gap — measured analysis (2026-08-29)

> **Audit status:** §10 is a heuristic first pass, not an approval-grade
> backlog or build plan. A manual audit of 961 unique lines found material
> classifier and cohort errors, including false bulk-build claims for timing,
> subscriptions, and stat rewrites. The superseding checkpoint is
> [effect-prose-manual-audit.md](effect-prose-manual-audit.md). Keep §10 as the
> provenance of the candidate inventory; do not use its 1,200 / 397 / 24 split
> or its 117 / 134 / 54 ordering as committed accounting.

## Why this exists

`grammar-sweep` names one unshipped mechanism — **Effect prose semantics** —
needed by **1,024 artifacts** and the sole blocker of **238**. It is by an order
of magnitude the largest remaining item in the corpus, and it has been carried
as "its own future project" since R-0044 without anyone scoping it.

This document is that scoping pass. Every number below is measured at canon pin
`520553438a4e8d199bfaaf676b8aa9bd273f4d61`; the method for reproducing each is
in §7. The conclusion is that **"the Effect hole" is not a project**, and the
useful next moves are not the obvious one.

## 1. The shape of the gap

1,688 whole-line `**Effect:**` instructions exist. 67 are automated. **1,621
remain verbatim table directives, across 1,024 artifacts** (582 heroes / 1,039
monsters). Most affected artifacts carry exactly one such line:

```
lines per artifact:  1 → 735 artifacts   2 → 159   3 → 51   4 → 31
                     5 → 16   6 → 22   7 → 5   8 → 4   12 → 1
```

## 2. The finding that governs everything else

**Almost every Effect line is a unique sentence.**

| family | lines | artifacts | unique templates | **templates ÷ line** |
|---|---:|---:|---:|---:|
| other | 410 | 343 | 386 | **0.94** |
| movement | 355 | 295 | 334 | **0.94** |
| condition | 238 | 201 | 233 | **0.98** |
| damage | 157 | 146 | 143 | **0.91** |
| edge-bane | 138 | 133 | 132 | **0.96** |
| free-strike | 76 | 68 | 74 | **0.97** |
| surge | 45 | 44 | 44 | **0.98** |
| choice-menu | 40 | 40 | 3 | **0.07** |
| stamina-regain | 33 | 33 | 29 | 0.88 |
| recovery | 28 | 28 | 28 | 1.00 |
| terrain | 27 | 27 | 24 | 0.89 |
| characteristic-test | 25 | 25 | 25 | 1.00 |
| temporary-stamina | 21 | 21 | 21 | 1.00 |
| malice | 17 | 17 | 17 | 1.00 |
| heroic-resource | 11 | 11 | 11 | 1.00 |

Every family but one sits at 0.88–1.00 templates per line. Only **six exact
payloads repeat three or more times**, covering 67 lines — and 39 of those 67
are the `choice-menu-intro` line, which is already closed-form and deliberately
deferred. There are **241
distinct capability combinations** across the 1,621 lines; 21 of them cover
half the corpus and the remaining 220 cover the other half.

This is the corpus behaving as designed, not a parser weakness. The books put
regular mechanics in tier-outcome bullets — already automated by the power-roll
cluster — and use the Effect line for the irregular thing. A grammar big enough
to eat Effect lines is a grammar big enough to eat English.

**The closed-template pool is exhausted.** Every anchored whole-payload template
except `choice-menu-intro` has been implemented (characteristic-test, next-roll
grant, spend-recovery, difficult terrain, flat regain, temporary Stamina). The
method that produced the last four families has nothing left to harvest.

## 3. What is actually blocking, by measured share

Capability probes over all 1,621 lines (regexes in §7; a line can need several):

| dependency | lines | share |
|---|---:|---:|
| **spatial** — squares, adjacent, distance, cover, concealment, aura, reach | **663** | **40.9%** |
| player choice — "can", "choose", "may", "of their choice" | 635 | 39.2% |
| conditional gate — if / while / whenever / unless | 559 | 34.5% |
| damage | 479 | 29.5% |
| timing window — until / at the start or end of / next turn | 424 | 26.2% |
| named condition | 328 | 20.2% |
| free strike or extra action | 318 | 19.6% |
| edge / bane / tier / potency | 312 | 19.2% |
| Stamina / Recovery / temporary Stamina | 171 | 10.5% |
| heroic resource / surge / malice | 111 | 6.8% |
| creature creation or summoning | 33 | 2.0% |
| out-of-encounter scope — respite, project, negotiation, title | 14 | 0.9% |

Within spatial: **voluntary movement** (shift/move/teleport) 271 lines,
**forced movement** (push/pull/slide) 172.

### Spatial is SETTLED — it is not the engine's problem

**Ruling, 2026-08-29: spatial logic belongs to the VTT plug-in. When that
plug-in is not present, the printed text is presented to the table so the
players act on it.** This confirms and generalizes R-0040 ("movement, trap
plates, and hidden-state triggers stay yours to assert — no map, no memory
substrate") and keeps faith with the plugin boundary, where grid clients are
external consumers of the intent protocol rather than something the engine
models.

The consequence for this analysis is large, and it is not the one the raw 40.9%
suggests — see §3a.

## 3a. What the spatial ruling actually changes

The raw 40.9% spatial share invites a hopeful reading: *hand geometry to the
plug-in and two-fifths of the problem disappears.* It does not. Splitting the
spatial lines by the **role** position plays:

| role | lines | share |
|---|---:|---:|
| position change **is** the effect ("the target is pushed 2 squares") | 454 | 28.0% |
| position only **selects targets** ("each creature within 2 squares takes…") | 339 | 20.9% |
| no spatial reference at all | 828 | 51.1% |

Targeting-by-position was never a blocker: the engine already takes asserted
targets at dispatch, and `SpatialFactSchema` (`adjacent`, `line-of-effect`) has
carried asserted geometry since day one. That is exactly the shape the ruling
endorses — the plug-in or the table supplies the fact, the engine consumes it.

Cross-tabulating position-role against whether the line touches engine-owned
state (Stamina/damage, conditions, action economy, roll modifiers, resources,
terrain) gives the real resize:

| | lines | share | who owns it |
|---|---:|---:|---|
| **A** position change is the whole effect | 143 | 8.8% | plug-in / table. **Correct today. Zero work.** |
| **B** engine-owned part **and** a position change | 309 | 19.1% | split — engine executes its half, plug-in/table takes the geometry |
| **C** engine-owned only, no position change | 951 | 58.7% | **the real automation target** |
| **D** neither | 218 | 13.4% | needs human judgment |

**Only 8.8% of the remaining lines are purely spatial.** The engine has
something to execute in **1,260 lines (77.7%)**. The ruling is architecturally
right and settles a real question — but it removes 143 lines from the engine's
plate, not 663. It clarifies ownership; it does not shrink the work.

Within the 1,260, the cohort that is single-sentence, ungated and choice-free —
the part reachable with substrate that already exists — is **323 lines**.

## 4. The tractable core

Layering filters over the 1,621:

| cohort | lines | share |
|---|---:|---:|
| single-sentence | 856 | 52.8% |
| + no spatial reference | 535 | 33.0% |
| + no conditional gate | 406 | 25.0% |
| **+ no player choice** | **319** | **19.7%** |

That last cohort is the honest "reachable with substrate that already exists"
set. It is **spread across 14 families** — 122 `other`, 44 condition, 40
edge-bane, 25 damage, 19 free-strike, 15 surge, 15 movement, 14 stamina-regain
— so it does not form a slice under the family-by-family method. Verbatim
examples:

> "The power roll gains an edge."
> "Using this ability costs all your Heroic Resource."
> "You spend a Recovery and the target regains Stamina equal to your recovery value."

*Correction (§10): this section originally cited "…the target has damage
weakness 10" as reachable with existing substrate. It is not.
`ParticipantStats.weaknesses` is read by the damage pipeline and written by no
intent — there is no stat-rewrite slot. The line is automation-needed and
substrate-absent.*

## 5. Why the current method cannot finish this

The characteristic-test family was a full slice — Gate-3 research pass, closed
grammar, mechanism, independent goldens, audit — and converted **29 lines**. At
that yield 1,621 lines is fifty-plus slices. The method was correct for closed
templates and it exhausted them; continuing it against a long tail of unique
sentences spends a slice per handful of lines.

## 6. The three real options

**A — Family-by-family grammar expansion.** The status quo. Rejected above on
measured yield.

**B — Build the missing capability substrates, then re-measure.** The blockers
are absent mechanisms, not absent grammar. Ranked by lines touched against
risk:

1. **Choice enumeration** — 635 lines touch a "can"/"choose"/"may". The only
   candidate that is a *presentation* mechanism rather than rule invention: the
   engine enumerates options and the player asserts, which is exactly the
   three-tier model's tier 3. `choice-menu-intro` is already closed-form (40
   lines, 3 templates) and was deferred in the 2026-08-24 inventory waiting on
   precisely this. **CONV-0004 gates it**: most printed "can" lines must first
   be proven to be real decision points, and R-0036 is the standing example of
   one that was not.
2. **Timing and duration generalization** — 424 lines. Extends shipped
   substrate (ending vocabulary, expiry sweeps, grant lifecycle) rather than
   inventing any.
3. **Spatial** — 663 lines. Largest payoff, largest architectural cost,
   contradicts R-0040. A ruling, not a slice.

**C — Reframe what "done" means.** A table directive is not a failure. The
engine already surfaces the printed text with its occurrence, action cost,
once-per-round accounting, and receipt — and R-0044 ruled that posture
acceptable for the 150 reaction residue lines. **Nobody has measured what
fraction of the 1,621 needs automation rather than good presentation.** That
measurement is cheap and would resize this entire problem.

*After §7: option B is now known to be an execution-VM project rather than a
sequence of mechanism slices, which makes option C the leading candidate for
most of the corpus. See §8a.*

## 7. The 238 sole-blocked artifacts — characterized

An independent read-only pass reproduced the sweep's per-artifact statuses
byte-exactly (`automatic-now 37 / mechanism-blocked 238 / grammar-blocked 2468 /
grammar-and-mechanism-blocked 786` over 3,529 artifacts), so **238 is confirmed,
not approximated**. It covers 243 Effect lines / 236 distinct payloads. Full
data: `.artifacts/canon/effect-shape/sole-blocked-238.json`.

Three findings, each of which contradicts an assumption this document made
before the pass ran.

**(a) They are all heroes.** 238 heroes / **0 monsters**; every one in the
`classes` bucket, spread across all nine classes and all ten levels (conduit 46,
troubadour 35, censor 31, null 24, tactician 24, fury 22, shadow 22,
elementalist 18, talent 4, +12 singletons). This is a consequence of *residue
profile*, not semantic simplicity: a hero ability artifact is a short, fully
grammared block, so it lands in `mechanism-blocked`; a monster statblock carries
traits and malice features that do not parse, so it lands in
`grammar-and-mechanism-blocked`. **Building for this cohort is building the
hero-ability half of the engine** — which §8 notes is separately gated behind
character building, because heroes are not stat-seeded.

**(b) The free cohort is empty.** Zero of the 238 need nothing new; every one
carries an Effect line that failed all eight anchored closed templates. The
nearest edge is 7 artifacts needing exactly one capability, of which three are
shipped mechanisms blocked only by their envelope — e.g. `squad-gear-check`
("You and each ally adjacent to the target gain 10 temporary Stamina") is the
shipped flat-temporary-Stamina template plus adjacency-based target selection.

**(c) There is no 80/20. There is a 79/16.** Capability-count per artifact:
median 4, mean 4.4, and **only 7 of 238 need exactly one**. The greedy
cumulative unlock curve is *convex then flat* — marginal yield rises through the
middle and only tails after step 18. The first ten capabilities buy 27% of the
cohort.

The capability histogram is the part worth staring at, because **the top five
are all control-flow substrate, not rules**:

| capability | artifacts | share |
|---|---:|---:|
| player choice (`can` / `may` / `choose`) | 145 | 60.9% |
| spatial model | 129 | 54.2% |
| conditional gate (`if` / `unless` / `while`) | 111 | 46.6% |
| persistent duration (`until the end of the encounter`…) | 98 | 41.2% |
| event trigger (`whenever`, `each time`, `the first time`) | 87 | 36.6% |
| movement execution | 61 | 25.6% |
| threshold predicate (winded / dying / minion / solo) | 59 | 24.8% |
| characteristic-scaled amount | 57 | 23.9% |
| action grant | 55 | 23.1% |

Nothing about Draw Steel's *mechanics* tops this list. What tops it is choice,
geometry, predicates, effect lifetime, and an event bus.

### The spatial ruling barely moves this curve

Recomputing the curve with spatial and movement removed from the engine's
responsibility, per §3a:

- 137 of the 238 need at least one spatial or movement capability, but
  **only 2 were blocked *solely* on it.** Those two now resolve as
  table/plug-in text.
- Mean engine-capability count falls from 4.4 to 3.84; the median stays 4.
- The curve keeps its shape. You still need **16 of 21** engine capabilities to
  reach 79%, and deferring the three genuinely open-ended ones (entity creation,
  narrative/Director fiction, turn-order surgery) still costs 31 artifacts.

**So the ruling is correct architecture and does not resize this problem.** I
had recorded the 238 as "the only cohort with a step-change payoff, and cheap."
That was wrong on both counts, and this section supersedes it.

## 8. What this actually is

The 238 do not decompose into a few mechanisms. They decompose into an **Effect
execution VM**: a control-flow substrate over the rule mechanisms that already
exist — choice enumeration, predicate evaluation over world state, effect
lifetimes, and a durable event/subscription bus — with the rule mechanisms
composing *through* it.

That is a materially different and larger project than "add the missing
mechanisms," and it should be named as such before anyone scopes a slice
against it. It also explains why the closed-template method exhausted at 67
lines: templates match *payloads*, and what the corpus actually varies is
*control flow*.

Two facts bound the payoff:

- **582 of 1,621 lines are hero-side**, and the 238 sole-blocked artifacts are
  100% hero-side. Hero Effect automation is gated behind character building
  regardless of grammar, because heroes are not stat-seeded (R-0003's seeding
  gap; hero potency deferred to character building by R-0004).
- **The all-or-nothing posture is a deliberate safety property, not an
  oversight.** `effect-grammar.ts` records that a count-only check "silently
  swallowed middle clauses ('push 3;', 'the target gains 1 rage;'), un-anchored
  potency gates, mid-payload '(save ends)' endings, and duration tails —
  certifying conditions without their gates," and was replaced with "a payload
  that says more than the grammar reads fails to residue, whole." Any
  clause-level extraction proposal must answer that objection before it is
  entertained; byte-level conservation accounting (already reported by the
  sweep, currently 0 violations) is the mechanism that could, but it has not
  been designed or red-teamed.

## 8a. Recommendation — SUPERSEDED BY §10

*Kept for the record. §10 measured the question this section called for and
overturned its ordering: choice enumeration is not the right first move, and the
build target is ~400 lines rather than 1,621.*

The earlier recommendation in this document is superseded by §7. Revised:

1. **Do not schedule an "Effect prose" build.** It is not a mechanism gap; it
   is a control-flow VM, and no ordering of mechanism slices reaches it.
2. **Measure automation-need versus presentation-need across the 1,621**
   (§3a category D, 218 lines, plus a judgment pass over B and C). R-0044
   already ruled that printed text with occurrence and accounting is an
   acceptable end state. If that holds for most of the corpus, the VM is not
   needed and this stops being a gap at all. **This is the cheapest question
   with the largest possible answer, and it should be asked before any build.**
3. **If the VM is wanted anyway**, scope it as its own arc with choice
   enumeration first — the only top-five capability that is a presentation
   mechanism rather than rule invention, gated by a CONV-0004 pass proving
   which printed "can" lines are live decisions.
4. **Do not start with the 238.** They are the hero half, double-gated behind
   character building, and their curve is the flattest in the corpus.

## 9. Reproducing every number here

```bash
# family table, template diversity, closed-template exhaustion (§2)
cd packages/canon && pnpm corpus effect-shape-inventory \
  --manifest ../../.artifacts/canon/campaign/accepted/final-campaign-manifest.json \
  --out ../../.artifacts/canon/effect-shape/current-inventory.json

# corpus-wide status + mechanism sole-blocker counts (§1, §7)
cd packages/canon && pnpm corpus grammar-sweep \
  --root ../../.reference/steelcompendium \
  --structured-bundles ../../.artifacts/canon/bundles \
  --chapter-bundles ../../.artifacts/canon/campaign/accepted \
  --out ../../.artifacts/canon/sweep/current-grammar-sweep.json
```

§3a's position-role split and A/B/C/D cross-tabulation, and §7's recomputed
engine-only unlock curve, are reproducible from
`.artifacts/canon/effect-shape/table-lines.json` and
`.artifacts/canon/effect-shape/sole-blocked-238.json` respectively. The 238
cohort's own method — including all 23 capability regexes and the note that the
per-artifact statuses reproduce the published headline byte-exactly — is
recorded in that file's `method` block. Its capability tagging is **judged, not
measured**, and its author flagged the softest calls: `PLAYER-CHOICE` keys on a
bare `can` and does not separate engine-offered choice from narrative
permission; `CONDITIONAL-GATE` and `PERSISTENT-DURATION` overlap by
construction; `SPATIAL-MODEL` lumps "needs a grid" with "needs
line-of-effect/cover". Those caveats are load-bearing — read the histogram as
directional.

The capability probes in §3 and the cohort filters in §4 run over a dump of all
1,621 table lines (`artifactId`, `ordinal`, `book`, `actionType`, `targetsText`,
`family`, `tags`, `sentences`, `sourceText`), produced from
`loadCoreEffectFixtures` + `toEffectShapeRows` in
`packages/canon/src/effect-shape-inventory.ts`. Probe patterns, case-insensitive
over canon-link-stripped text:

- spatial — `square|squares|adjacent|within \d|distance|space|spaces|line of effect|cover|concealment|aura|burst|reach|push|pull|slide|shift|teleport|forced movement|vertical|flying|climb|burrow`
- forced movement — `push|pushed|pull|pulled|slide|slid|forced movement|force moved|vertical`
- voluntary movement — `shift|shifts|shifting|teleport|teleports|move up to|moves up to|flying|climb|burrow`
- player choice — `can |choose |chooses |may |your choice|of their choice`
- conditional gate — `if |while |whenever |as long as|unless `
- timing window — `until the (end|start)|at the (end|start) of|before the end of|this turn|next turn|each of their turns|end of the encounter`

These are **heuristics over prose**, not a parse. They are deliberately
inclusive: a line counts as needing a capability if it mentions it. Treat every
number in §3 as an upper bound on need and a lower bound on diversity — the
finding they support (a long tail, not a bucket) is robust to their exact
tuning, because it rests on the template-per-line ratios in §2, which are
measured rather than judged.

## 10. Automation-need versus presentation-need — heuristic first pass

§8a said this was the cheapest question with the largest possible answer. It was
asked. **The answer is large, and it supersedes §8a's own ordering.**

Each of the 1,621 lines was classified against a criterion grounded in R-0044
(printed text + occurrence + accounting is an ACCEPTED end state) and DEC-0011:

| class | lines | share |
|---|---:|---:|
| **P — presentation-complete** | **1,200** | **74.0%** |
| **A — automation-needed** | **397** | **24.5%** |
| U — undecidable from the line alone | 24 | 1.5% |

The discriminator for A is **silent state divergence**: a line is A only if
leaving it as printed text makes the engine's state *contradict* the fiction —
orphaned expiries, miscounted caps, unfired subscriptions, wrong tracked
numbers. A rider the engine merely never applies is P, because holding *less*
than the fiction is exactly the state R-0044 accepted.

**1,621 is not the build target. ~400 lines across ~330 artifacts is** — and of
those, only ~180 need substrate that is genuinely absent rather than a
subscription over events the engine already records.

### What actually breaks, in the A cohort

| divergence | lines | what goes wrong |
|---|---:|---|
| orphan-expiry | 209 | the printed ending is outside `EndingSpec` / `GrantWindow` / `GrantExpiry`; the engine sweeps at the wrong moment or never |
| recurring-number | 121 | Stamina/damage moves on a repeating boundary; forget once and the engine's number is wrong |
| unrepresentable | 86 | no intent expresses it |
| unheld-subscription | 73 | a later trigger nobody is holding |
| miscount | 59 | a cap the engine polices, on an event it cannot see |

Bucketed by hardest need: **11 lines are shipped-but-uncompiled, 59 are
extensions of shipped substrate, 327 need absent substrate.**

### This overturns §6's ordering

- **Choice enumeration is NOT the right first move.** Choice lines split 491 P /
  131 A, and the `choice-menu` family is **0% A** — a menu the table reads and
  answers leaves no engine state to diverge. §6 ranked it first on the 635-line
  reach figure; reach was the wrong metric.
- **Timing and duration generalization ranks first** — §6's #2. It is 117 A
  lines, the largest single need in the cohort, and the cheapest: every boundary
  already exists and `boundary-sweeps.ts` was built as a registry where a new
  swept slot adds an entry rather than handler plumbing. Almost all of it is one
  phrase family (`until the start of X's next turn`, plus `until the end of your
  next turn`, `until the end of the round`, and the `or until you are dying`
  disjunct).
- **Spatial and choice are not what makes a line dangerous. Time is.** The
  majority of lines carrying spatial or choice markers are P.
- **The 238 cohort is retired from a second direction.** Its 243 Effect lines
  are 137 P / 100 A — independent confirmation of §7's retraction.

### A defensible target, in yield-per-risk order

1. **Ending vocabulary + boundary-sweep rows** — 117 lines, no new architecture.
2. **A durable subscription bus over the existing occurrence ledger** — 134
   lines whose events schema v7 already names. Half-built: the engine records
   the event, nobody holds a subscription to it.
3. **A stat-rewrite slot** — 54 lines; one new `ParticipantStats` mutation
   intent (weakness/immunity/max Stamina are read by the damage pipeline and
   written by nothing).

That is ~305 of the 397 **without building a VM**. The residue — predicate-
evaluated lifetimes, off-vocabulary movement triggers, participant creation —
is ~180 lines, and that is where the VM argument actually lives.

### How much to trust the 397

The classifier is a heuristic over prose, self-audited on a 40-line random
sample with **77.5% agreement**, and the disagreements ran **toward
under-counting A** (4 false-P against 2 false-A). Known systematic blind spot:
**unbounded-persistent effects with no explicit time word** — every duration
discriminator keys on one, so "Allies gain an edge on abilities against a target
marked by any wode elf" scored P despite being a standing modifier a one-shot
`NextRollGrant` under-lives.

Plausible true range: **397–460 lines (24.5%–28%)**. The direction — P is a
large majority — is far more robust than the digit, and the top of the range
does not change the ordering above.

Full per-line data and the classifier source: `.artifacts/canon/effect-shape/
automation-vs-presentation.json`.
