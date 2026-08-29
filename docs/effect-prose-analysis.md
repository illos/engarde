# The Effect-prose gap — measured analysis (2026-08-29)

> Drafted by Claude Opus 5; no second-model read yet — see
> [`authorship.md`](authorship.md).

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

### The largest blocker is one we ruled out on purpose

Two of every five remaining lines need a positional model. R-0040 states the
opposite policy in as many words: movement, trap plates, and hidden-state
triggers "stay yours to assert — no map, no memory substrate." The plugin
boundary points the same way: grid clients are *external consumers* of the
intent protocol, not something the engine models.

So the biggest single sub-block is not blocked on effort. It is blocked on a
standing architectural decision, and it cannot be scheduled as a slice — it
needs an explicit ruling first.

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
> "Until the end of the encounter or until you are dying, the target has damage weakness 10."

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

## 7. Two facts that change the payoff maths

- **582 of 1,621 lines are hero-side.** Hero Effect automation is gated behind
  character building regardless of grammar, because heroes are not stat-seeded
  (R-0003's seeding gap; hero potency deferred to character building by R-0004).
  Monster-side work pays off immediately; hero-side does not.
- **238 artifacts are *sole-blocked* by Effect prose** — their grammar parses
  completely and this is the only thing between them and fully automatic. They
  are ~7% of the affected artifacts and the only cohort with a step-change
  payoff. A separate characterization pass covers them.

## 8. Recommendation

Do not attack "the Effect hole" as a project; it is not one. In order:

1. **Characterize the 238 sole-blocked artifacts** and see which capability set
   they actually need. Only cohort with a step-change payoff, and cheap.
2. **Measure automation-need versus presentation-need** across the 1,621
   (option C). This may cut the real problem by more than any build would.
3. **Choice enumeration as a presentation substrate**, preceded by a CONV-0004
   pass proving which "can" lines are live decisions.
4. **Put the spatial question up as an explicit architectural ruling** before
   any code is written against it.

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
