# Conditions pilot — what it proved, and the four decisions it needs from you

> 2026-08-22. Written for the judge, not the builder: every term is explained
> where it first appears, and each decision tells you exactly what to check.
> The one-line technical accounting lives in the appendix at the bottom.

## What this pilot was

We are building a factory that turns the Draw Steel rulebooks into a running
rules engine **without any AI ever writing rule text** — models only point at
locations and propose labels; deterministic code does all cutting and
checking, and you review exceptions in batches instead of every rule. Before
running that factory over the whole book set (about 3,500 extracted pieces),
we ran every layer of it once over the smallest real slice: the nine
conditions (bleeding, dazed, frightened, grabbed, prone, restrained, slowed,
taunted, weakened) and everything they depend on — 196 pieces in total.

Throughout this report, an **artifact** means one such piece: a rule,
ability, or book section cut byte-for-byte from the official text, with a
checksum proving it was never altered.

**The pilot's grading standard:** nothing may fall through silently. A layer
is allowed to *not implement* something — but only if it explicitly says so,
in a queue, with a reason. Implementing 60% and precisely listing the other
40% is a pass; 90% with one silent hole is a fail.

## The short verdict (my assessment — yours is decision 4)

Every layer ran end to end in one day. The engine now genuinely applies,
tracks, and expires conditions with every behavior traceable to a quoted
rulebook sentence. The verification net caught the one place where our own
bookkeeping over-claimed — the exact failure mode that killed version 1,
caught by the system instead of discovered later as a bug. Nothing surfaced
outside a queue. I recommend accepting the pipeline for corpus scale, with
one fix first (sharpen the tier definitions — see decision 2).

---

## Decision 1 — Approve (or correct) the classification batch

**Where:** https://presidium-iv.tail41404c.ts.net:9500/

**What happened:** AI workers read all 196 artifacts and attached four labels
to each. The labels are routing metadata — they decide which pipeline path
each artifact takes later. They are cheap to correct and never alter the
rulebook text itself. The labels:

- **Tier** — how the rule reaches the player. Tier 1: the engine does it
  automatically (e.g. a condition expiring). Tier 2: a player presses a
  button, the engine resolves it (e.g. using an ability). Tier 3: the engine
  can only offer options once a player asserts facts the software can't know
  (e.g. things depending on table positioning). "Not a rule" = flavor prose.
- **Implementability** — does this need engine code, is it pure data, or is
  it just displayed as text?
- **Play category** — combat, downtime, character building, etc.
- **Spatial profile** — which position-dependent concepts the rule touches.

**How to review it:** each card on the page shows the proposed labels
directly above the exact rulebook text they describe. You never need the
books. Two passes:

1. **Read the "Uncertainty queue" (35 cards, at the top).** These are the
   ones the AI flagged as genuine judgment calls instead of guessing. For
   each: read the text, pick the label you'd want, or leave it queued.
2. **Spot-check ~10 random cards from the rest.** For each, ask one
   question: *"Do these labels match what the text in front of me says?"*
   A card is wrong if, e.g., a rule that clearly needs automatic engine
   behavior is labeled "display-only", or button-press ability is labeled
   tier 3.

**What your answer decides:** your correction rate on the spot-checks is the
measured error rate for cheap-model classification. Roughly: if you correct
0–1 of 10, the batch process works as designed; 2–3, it needs the sharpened
instructions from decision 2 first; more, we escalate the model tier.

## Decision 2 — Who read the rules right: Sonnet or Opus?

**Where:** https://presidium-iv.tail41404c.ts.net:9500/compare.html

**What happened:** to measure how much to trust the cheap model, a stronger
model independently re-labeled the same 196 artifacts. They fully agreed on
99. The page shows the 97 disagreements — each card has both models' labels
side by side (differences highlighted) above the rulebook text.

**The one pattern that matters:** most tier conflicts are Sonnet saying
tier 3 where Opus says tier 2 (Sonnet used tier 3 twenty times, Opus twice).
That's systematic, not random — which usually means my one-line definition
of the 2-vs-3 boundary is ambiguous, not that either model is careless.

**How to review it:** you do *not* need all 97. Sample ~10 cards where the
tier row is highlighted and ask: *"Reading this text, which model's tier is
right?"* Note roughly how often each side wins.

**What your answer decides:** the model tier for classifying the remaining
~3,300 artifacts. If Opus is consistently right, cheap-model classification
still survives — we sharpen the tier definitions with worked examples and
keep Sonnet (with spot-verification). If wins look random, the taxonomy
needs the rewrite regardless. (You've also commissioned a third run from
Sol — if you want, adjudicate after that lands for a three-way read.)

## Decision 3 — One actual rules question

During the simulated fight, a character ended an effect they had imposed on
someone else. The rulebook says doing that costs a "free maneuver" — but the
character did it *outside their own turn*, and the rules text we have in
scope never says when a free maneuver may be used. The reviewer flagged it
as genuinely ambiguous rather than guessing.

**Your options:** (a) rule it at the table yourself ("only on your turn" /
"any time"), or (b) have me run a proper canon search across the wider
rulebook for a timing rule the pilot's slice didn't include. Either answer
just gets recorded; nothing is blocked on it.

## Decision 4 — The verdict: scale this factory or not?

Both pilot exit criteria pass:

- **No artifact in an unknown state.** All 196 are tracked through every
  stage; none is in limbo.
- **Every unimplemented thing is queued with a reason.** 24 queue items
  total — and notably, seven of them exist because the final review layer
  caught our own status declarations being narrower than the real gaps.
  That lapse is fixed as a standing rule, and the fact the system caught it
  is the strongest evidence in this report.

**What "yes" sets in motion:** the same pipeline runs over the full corpus,
while the engine grows mechanism by mechanism in measured order — the
grammar counted which missing mechanism unlocks the most content: potency
resolution first, then damage, then power-roll math, then conditions'
derived effects, riders, action economy, and position facts. The compendium
browser (bestiary, ability cards) falls out of the artifact store early;
the live combat tracker arrives as those mechanisms land.

**What "no" or "not yet" looks like:** name the layer you don't trust and
we deepen the pilot there before scaling — that is exactly what the pilot
format is for.

---

## Appendix — technical accounting (the builder's view)

| Layer | Result |
|---|---|
| Scope discovery | 196 artifacts, every inclusion with a mechanical reason; 0 unaccounted references |
| Byte fidelity | 169 source bundles re-audited during the pilot; 0 deviations from the books |
| Classification | 196/196 labeled by two independent models; 0 coverage gaps; 35 + 29 uncertainty flags |
| Effect grammar | 5 abilities parsed with every byte either understood or explicitly listed as residue (82% down to 1% parsed depending on the ability — prose-heavy records are the frontier) |
| Dual-channel check | An independent reader's 94 quoted assertions vs the grammar: 36 matches, 0 conflicts, 10 witnessed residue items |
| Engine + invariants | Condition lifecycle live; 7 universal safety properties incl. exact state↔log reconciliation; tampering tests prove each fires |
| Simulated encounter | 3 real corpus actors, 8 steps, 0 invariant violations, fully deterministic |
| Transcript review | 14 machine-verified findings: 2 protocol catches, 7 under-declared gaps (now class-declared), 4 confirmations, 1 ambiguity (decision 3) |

Full queues and evidence: `.artifacts/canon/pilot/exception-queue.json` and
the served pages above. Standing rules adopted during the pilot: review
surfaces always embed the evidence being judged; known-unknowns are declared
by rule class, never by instance; comparison normalization lives in the
comparator, never in stored data.
