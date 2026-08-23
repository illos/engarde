# Conditions vertical pilot — judgment report (ROAD-0004, step 9)

> Status: **delivered for user judgment** (2026-08-22). The pilot is graded on
> completeness of flagging, not coverage: implementing 60% while precisely
> enumerating the other 40% succeeds; 90% with a silent hole fails.
> Regenerable evidence lives under gitignored `.artifacts/canon/pilot/`;
> every number below traces to a manifest, queue, or transcript there.

## Exit criterion check

**Zero artifacts in unknown state within pilot scope: PASS.** All 196 scoped
artifacts validate against the total lifecycle contract
(`extracted/unclassified→proposed/unparsed/none`); classification for all 196
is `proposed` (awaiting batch approval — a human act by design).

**Every not-implemented item in an explicit queue with a reason: PASS,
with one caught lapse.** The step-8 transcript review found that the
encounter script's *declared* known-unknowns were narrower than the
project's actual known gaps (declared per instance, not per rule class).
The last verification layer caught it — which is the design working — and
the declaration discipline is now fixed (see §Lessons). Nothing was lost;
seven findings were re-attributed to already-known gap classes and the
queue now names the classes.

## Total accounting

| Layer | Result |
|---|---|
| Scope (discovered closure) | 196 artifacts: 14 seed / 142 dependency / 7 resolution / 31 inbound-machinery / 2 reviewed supplements; 10 context-only edges; 661 inbound candidates enumerated-not-included; **0 findings** |
| Byte conservation | 169 contributing bundles audited, **0 failures** |
| Classification (sonnet) | 196/196 at pinned versions, 0 coverage findings, 35 uncertain (queued, not guessed) |
| Classification (opus, independent) | 196/196, 29 uncertain; dual-reader agreement: tier 78.1%, implementability 83.7%, playCategory 90.8%, spatial 83.2%; 97 disagreements await adjudication |
| Effect grammar (5 abilities) | Full consumption on all 5; parsed ratios: blood-for-blood 81.5%, sentenced 69.9%, toxic-plants 32.4%, mark 12.4%, grab 0.9% (pointer record) |
| Channel-1 conformance | Grammar→engine exhaustive-delta green on real blood-for-blood; damage/potency explicit unexecuted backlog |
| Channel-2 expectations | 5 independent readers, 94 assertions, 0 provenance violations, 36 matches, 0 value conflicts; 10 channel-2-only witnesses of grammar residue |
| Invariants | 7 universal properties incl. exact state↔log reconciliation; negative tests prove each violation class fires |
| Mini-encounter | 3 corpus actors, 8 steps, **0 invariant violations**, deterministic transcript |
| Transcript review (step 8) | 14 findings, all evidence machine-verified verbatim: 2 protocol/economy catches, 7 under-declared gaps (now class-declared), 4 confirmed known-unknowns, 1 canon ambiguity |

## The mechanism backlog (expressibility report in miniature)

Ranked by artifacts unlocked over the pilot's five abilities — the phase-6.1
corpus-wide report will have exactly this shape over 3,529 artifacts:

1. **Potency resolution** (characteristic vs threshold) — 3 artifacts, 9 occurrences
2. **Damage / Stamina application** — 2 artifacts, 6 occurrences
3. **Power-roll resolution** (2d10 + characteristic, tier banding) — 1 artifact
4. **Derived condition effects** (banes, speed changes, action restrictions,
   granted edges) — every applied condition; surfaced by transcript review
5. **Imposing-effect riders carried on condition instances** (sentenced's
   forced-movement override, sleep-spores' prone rider)
6. **Action economy** (budgets, canonical prohibitions, free-maneuver costs)
7. **Spatial facts for ability use** (melee distance/targeting) + an
   **area-membership** fact the vocabulary lacks (hazard triggers)
8. **Per-hero keep attribution** at end of encounter (intent-protocol change)

Already shipped: condition lifecycle (apply/remove/expiry/stacking/replace)
and saving throws.

## Exception queue

`.artifacts/canon/pilot/exception-queue.json` — 24 items: the 14 review
findings (each carrying its engine backlog item **and** its pipeline hole,
per the two-findings rule) and the 10 dual-channel residue witnesses. Plus
four open user decisions (below).

## Did anything surprise us that the system didn't flag?

**One process surprise, caught by the system's last layer:** steps 4–7
declared known-unknowns per instance ("the free-maneuver cost is not
budgeted") when the true gap was a class ("action economy including
prohibitions"). The step-8 reviewer, reading only the transcript packet,
correctly refused to accept the narrow declarations. No rule content was
lost — but if step 8 had not existed, the transcript would have silently
over-claimed fidelity. Verdict: the layered design worked, and the
declaration discipline it exposed is now a standing rule (declare gap
CLASSES). Nothing else surfaced outside a queue.

Secondary surprises, all flagged by the system itself: pointer-only corpus
records (grab/knockback/escape-grab texts point at abilities defined
elsewhere), the classification tier-2/3 boundary being under-specified
(structured sonnet→opus disagreement), and corpus link markup splitting
words inside quotes (provenance validator hardened).

## Lessons → standing rules

1. **Review surfaces embed the evidence being judged** (user feedback,
   step 3). Every surface since (classification, comparison, grammar) does.
2. **Declare known-unknowns by rule class, not instance** (step 8).
3. **Models point, code cuts held everywhere**: no model output became
   canonical text at any layer; provenance was mechanical at every step.
4. **Comparison-layer canonicalization belongs in the comparator**, never in
   stored data (dual-channel normalization).
5. Chunk **hierarchy completion** is a candidate mechanical rule for scope
   assembly (the two supplements were hierarchy-reachable).
6. Classification **rationales drift into rule summaries** — tighten packet
   instructions or mechanically strip before corpus scale.

## Open user decisions (pilot gate)

1. **Classification batch approval** — 196 proposals, 35-item uncertainty
   queue: https://presidium-iv.tail41404c.ts.net:9500/
2. **Dual-reader adjudication** — 97 disagreements, decides the corpus-scale
   classification model tier: /compare.html
3. **Canon question** — off-turn free-maneuver timing (review finding f10):
   needs a wider canon read (rulebot-class research) or a table ruling.
4. **The pilot verdict itself** — accept this pipeline for corpus scale, and
   set the scale parameters it was built to inform: chunking throughput,
   review-UX investment, classification model tier, and mechanism-backlog
   order (the ranked list above is the recommended build order).
