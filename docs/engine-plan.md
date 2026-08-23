# Engine plan — books-to-engine pipeline

> Status: **ratified** (designed 2026-08-22, five-exchange design session;
> ratified by the user 2026-08-22 — logged as DEC-0009).
> This is the implementation plan for `packages/engine` and the content pipeline that
> feeds it. It is a **greenfield** design: it learns from Ironyard's canon-gating
> workflow but imports none of its content or code. Ironyard stays frozen reference.

## Relationship to prior strategy (ratified 2026-08-22)

This plan **supersedes the verbatim engine port** promised by ROAD-0002,
`docs/architecture.md`, and `docs/sessions-plan.md`: the engine is rebuilt
greenfield around the pipeline (pure core, dice-as-input, spatial resolvers)
rather than ported from Ironyard's `packages/rules`. Ironyard's engine remains
readable reference for mechanism design; no code or content crosses over. The
supersession is logged as **DEC-0009**; the architecture / sessions-plan /
roadmap language has been updated to match.

## Prerequisites (pre-Phase-0 gate)

Phase 0 does not start until:

1. The pending sessions / control-center slice is reviewed and committed.
2. The open foundation findings are closed (control-grant correctness bugs and
   bounded-read/DoS findings, per the foundation audit).
3. CI exists and is green (typecheck, lint, tests). Task 0.1's "boundary lint
   enforced in CI from the first commit" presupposes a CI to enforce it.

## Why the old workflow failed

Ironyard v1 died of hallucinated rules; v2's answer (three-gate canon workflow,
`requireCanon`) was sound in principle but put a **per-rule, unbatched human review**
on the critical path of every feature, interleaved with implementation. The workload
was unsustainable and the project went dormant. The redesign keeps the goal (nothing
un-verified reaches the table) and changes the economics: machines verify everything
that can be verified mechanically; the human reviews **exceptions and samples, in
batches**, never exhaustive passes.

## Constitutional principles

Every phase below is constrained by these. They are the load-bearing decisions; the
task list can flex, these cannot.

1. **Models point, code cuts.** No LLM output ever becomes canonical text. Agents
   emit coordinates (source file, line span, classification); deterministic scripts
   cut the verbatim text and stamp a checksum linking artifact → source bytes.
   Transcription fidelity is CI-verifiable byte equality, never a review act.
2. **Data over code.** The corpus compiles into **content** (data records); the
   engine is a small hand-written **interpreter** (mechanisms + effect grammar).
   No 1:1 rule-to-code-chunk mapping — that recreates the lifecycle-divergence bug
   class (Ironyard's "Glowing Eyes") at corpus scale. Mechanisms ↔ artifacts is
   many-to-many.
3. **Pure engine, dice as input.** The engine is a pure function: state + intent
   (with roll results / seeded RNG handle attached) → new state + structured log.
   No `Math.random()`, no `Date.now()`, no I/O, no framework imports inside
   `packages/engine`. Identical inputs are byte-identical outputs in every host
   (Convex, CLI, vitest).
4. **Spatial provenance, not a mode flag.** Spatial facts (position, distance,
   adjacency, line of effect, area membership) form one closed class behind a
   spatial-facts interface with two resolvers: **digital** (derived from tracked
   positions) and **table** (asserted on the intent, truth lives on the physical
   grid). The engine core is identical in both modes; rule semantics never fork.
   Outbound spatial effects in table mode become **table directives** in the log
   ("push 3 — resolve at the table"), with follow-up assertions where canon needs
   the spatial outcome back. Resolver choice is per-encounter, not per-install.
5. **Every gap is a known-unknown.** Conservation at ingest (leaf spans form an
   exclusive byte partition of every in-scope source file — every byte owned by
   exactly one leaf artifact or explicit exclusion, CI-blocking).
   Full-consumption parsing accounted at **byte-span granularity** — a parser
   that consumes part of a sentence and silently drops a clause fails the
   audit; unparsed residue is routed, never dropped. Every artifact lives in a total
   state machine; the dashboard headline is **"0 artifacts in unknown state."**
   A bug discovered organically instead of flagged is a system failure: treat it
   as two findings (the bug, and the pipeline hole) and close the hole's *class*.
6. **Two independent readers at every stage.** Book → grammar → engine (channel 1)
   vs. book → LLM-extracted structured assertions (channel 2) at input; state vs.
   log reconciliation in the middle; transcript-vs-canon review at output.
   Agreement is evidence; disagreement routes to the human exception queue; a
   small random sample of agreements is audited (correlated misreads exist).
7. **LLM layers find; deterministic layers hold.** Every LLM-flagged or
   fuzz-discovered bug is minimized into a deterministic regression test. An
   LLM's pass is never a gate-pass.
8. **Prime directive unchanged.** No invented rule content anywhere — including
   fixtures: test actors are real corpus records (an actual bestiary monster, an
   actual built hero), never invented stat blocks. No foreign TTRPG terminology.
   This plan deliberately states **no rule mechanics**; the pilot discovers
   mechanics from artifacts, not from anyone's memory.

## Source corpus

`.reference/steelcompendium/` is a pinned checkout of SteelCompendium's current
`data-unified` repository (Draw Steel Creator License content; art excluded), not
the frozen March `data-md` repository. The active snapshot is tag
`v4.20260803143953`, commit `5205534` (verified against upstream on 2026-08-22).
It contains **3,081 paired Markdown + JSON records** across Heroes, Monsters,
Beastheart, and Summoner. The core-book baseline is 2,613 records: 1,951 Heroes
and 662 Monsters. Beastheart and Summoner's 468 records are inventoried but
explicitly deferred.

Markdown is the canonical byte surface; paired JSON is an upstream structured
adapter whose checksum and data travel with the artifact. The consolidated
source materially reduces model extraction: the core baseline includes 2,593
mechanically ingestible records, 20 chapter files needing a chunking lane, and
153 already-atomized standalone rule records (112 Heroes, 41 Monsters). Existing
SCC links seed dependency discovery mechanically. **Every book and category has
an explicit disposition in the tracked source lock** — structured-ingest, chunk,
or exclude-with-reason — and unmatched categories fail closed. PDFs remain ground
truth, never an extraction source: numeric fields get a **systematic** mechanical
audit, prose a **sampled** one (task 1.5).

## Architecture at a glance

```
.reference/steelcompendium (pinned, gitignored)
      │  mechanical ingest + agent-proposed spans (models point, code cuts)
      ▼
canon artifact store          — checksummed verbatim chunks + classification
      │                         + lifecycle state (total state machine)
      │  effect grammar (full-consumption) + mechanism backlog
      ▼
packages/engine               — pure interpreter: intents, mechanisms,
      │                         structured log, spatial-facts interface
      ▼
driver harness                — programmatic: campaign/character/encounter/
      │                         dispatch/read-state/read-log
      ├── conformance + invariant + golden-replay test stack
      ├── CLI skin (human + agent play)
      ├── agent playthrough loop + transcript reviewer
      ├── MCP skin (later)
      └── Convex host (product integration) → table-mode UI → VTT resolver
```

---

## Phases and tasks

### Phase 0 — Foundations

- **0.1 Engine package scaffold.** `packages/engine` as a pure workspace package:
  strict TS, Zod-first shapes, injected RNG/clock interfaces, and a boundary lint
  (no framework/IO imports) enforced in CI from the first commit.
- **0.2 Artifact schema + store + execution contract.** The canon artifact
  record: id, source path, byte span (+ line span for humans), source checksum,
  verbatim text, classification fields, spatial dependency profile, lifecycle
  state, conformance status (`none → derived-only → independently-verified`).
  Zod schema is the source of truth; storage format (files vs. table) is an
  implementation detail. Deliverable includes the **total execution contract**:
  enumerated lifecycle axes and states, legal transitions, explicit
  failure/exception states, and stable artifact-ID + versioning rules — every
  later phase manipulates a closed, defined machine, not an implied one.
- **0.3 Corpus mirror.** Pin SteelCompendium `data-unified` in engarde's gitignored
  reference location and track its remote/commit/tag plus per-book/category
  dispositions. Keep the PDFs beside it for fidelity audit. The frozen Ironyard
  `data-md` checkout remains comparison material, not the ingest source.

### Phase 1 — Corpus ingest and accounting

- **1.1 Mechanical ingest.** Script walks paired per-book Markdown + JSON records
  (no models) → artifact records with both checksums, carrying Markdown
  frontmatter and upstream structured JSON. It validates pair completeness and
  identity fields before cutting canonical Markdown bytes.
- **1.2 Conservation auditor.** CI-blocking check: **leaf artifact spans form an
  exclusive partition of each in-scope source file's bytes** — every byte owned
  by exactly one leaf span (artifact or explicit exclusion-with-reason).
  Container artifacts (e.g. statblocks) reference child spans without owning
  their bytes. Byte intervals + checksums carry the invariant; line spans are
  retained as human-facing coordinates. Silent omission is structurally
  impossible.
- **1.3 Chapter chunking harness.** Agents receive checksummed, line-numbered work
  packets and propose `(stable key, start line, exact anchor, hierarchy, tags)`
  over the residual chapter prose. A script rejects stale or altered anchors and
  cuts spans verbatim; proposals land in a review queue. Ordered starts create a
  gapless partition, with bytes outside a declared pilot scope recorded as
  explicit exclusions. Conservation covers every chunked source file.
- **1.4 Artifact state machine + dashboard.** Counts per lifecycle state; the
  exception queue as an explicit state; headline metric "artifacts in unknown
  state" (target: 0).
- **1.5 Upstream fidelity audit.** SteelCompendium is an ingest adapter, not
  ground truth — the MCDM PDFs are. Dual-channel conformance cannot catch an
  upstream transcription error (both channels read the same data-md text and
  agree on the wrong value), so this audit is the sole defense for that class:
  **systematic** mechanical cross-check of all numeric fields (tier bands,
  characteristics, stamina, EV, distances) against the PDF text extraction
  (`core-rules/heroes-flat.txt` et al.); **sampled** audit for prose fidelity.
  Checksums pin the SC snapshot; upstream/errata updates land as deliberate
  diffs flagging affected artifacts and mechanisms, never silent absorption.

> **Side-effect deliverable — the compendium.** The artifact store is also the
> complete monster/rules database: bestiary records already carry structured
> stat and feature data, so ingest + classification (Phases 1–2)
> yield a browsable compendium — bestiary, ability cards, builder option lists,
> encounter queries by level/EV/role — long before any mechanism runs. Display
> completeness deliberately runs ahead of engine completeness: an unparsed
> ability still renders as a verbatim card (tier 3 at the table). Wrinkle:
> monster abilities are embedded in statblock files (not one-per-file like hero
> abilities), so statblock artifacts carry child spans per ability, with the
> conservation auditor applying within the file.

### Phase 2 — Mechanical metadata (amended 2026-08-23, DEC-0010)

> **Model classification is dropped as a pipeline stage.** The pilot ran the
> original 2.1–2.3 with four independent model runs plus a same-model repeat
> and measured the labels as judgment calls, not discovered facts (a model
> disagreed with *itself* on 36% of artifacts; four models produced no tier
> majority on 16% — largely records that genuinely mix tiers, a category
> error no prompt fixes). Nothing correctness-bearing ever consumed the
> labels. Every metadata need is served deterministically instead:

- **2.1 Mechanical metadata.** Content type derives from the artifact id.
  Spatial/targeting facts parse from ability headers. "Needs an engine
  mechanism" is the grammar's output (parsed constructs vs residue), not an
  opinion. **Tier at the table is emergent implementation state, not an
  intrinsic label**: a rule whose constructs are parsed and mechanised is
  automatic; anything else renders as a verbatim card (tier 3) until its
  mechanism lands — tracked by the artifact lifecycle state machine.
- **2.2 Category attribution by source location.** Human judgment applied
  once, at chapter scale: a committed map assigns each book chapter and each
  structured-record category namespace to a category bucket; every artifact
  **inherits mechanically** from its place in the book. ~40 human-reviewed
  rows replace ~3,500 per-artifact judgments; reproducible by construction;
  a deterministic totality check proves every artifact is attributed or
  explicitly unmatched.
- **2.3 Review surface.** Unchanged in spirit but re-scoped: the human
  reviews the ~40-row attribution map and the exception queues — never
  per-artifact label batches. Model-classification tooling from the pilot is
  retained as a diagnostic instrument (reader-agreement experiments), not a
  pipeline stage.

### Phase 3 — Engine core

- **3.1 Intent protocol + state shapes.** Every mutation is an intent; payload
  shapes carry **asserted spatial facts from day one** (they are not bolt-ons).
  Attribution on every intent. Permissive engine: warn-never-block for
  user-choice rule violations; refuse only invalid payloads, authority-gate
  failures, unverified canon, and representational invariants.
- **3.2 Structured log.** Typed entries (mutation, warning, informational, table
  directive) that render to prose; the log is data first, narrative second.
  Undo model rides on it.
- **3.3 Spatial-facts interface + table resolver.** The assertion channel, plus
  outbound table directives with follow-up assertions. The digital resolver is
  explicitly deferred (Phase 6).
- **3.4 Core mechanisms.** The small hand-written set discovered from the corpus
  (resolution math, action economy, damage/resources, condition lifecycle,
  effect grant/expire substrate, spatial-effect math emitting directives). Each
  mechanism references its canon artifacts; shared lifecycle helpers from the
  first implementer (the Glowing Eyes lesson). TDD discipline throughout.
- **3.5 Effect grammar.** Permissive parsing of artifact rule text into effect
  data — with **full-consumption accounting at byte-span granularity**: the
  parsed spans plus explicit residue spans partition each artifact's rule text,
  so a parser that recognizes one clause of a sentence and drops another fails
  the audit. Residue routes to tier 2/3 or the manual queue.

### Phase 4 — Verification stack

- **4.1 Driver harness.** Programmatic first-class: create campaign, build
  character from corpus records, load encounter, dispatch intent, read state,
  read log. The CLI and MCP are thin skins over this; tests use it directly.
- **4.2 Conformance generator (channel 1).** Per-artifact scenario fixtures using
  corpus actors; assertions are **exhaustive state deltas** (the complete set of
  changed keys — omissions and side effects both fail).
- **4.3 Independent expectations (channel 2).** LLM reads the verbatim artifact
  text → structured assertions as **symbolic expressions**, validated by leaf
  provenance: every leaf of an expression must be a literal present in the
  artifact's verbatim text, a canon constant, or a typed reference to state,
  intent input, or dice input. (Literal string-matching alone cannot validate
  derived expressions whose value depends on state or rolls.) Channel
  disagreement → exception queue; agreement sampled.
- **4.4 Invariant property suite.** ~20 universal properties run across every
  artifact and playthrough: caps, lifecycle/expiry hygiene, attribution,
  undo-integrity, and **state↔log reconciliation** (every delta key attributable
  to a log entry; every mutation entry maps to a delta — silent mutations and
  phantom log lines both fail).
- **4.5 Golden replays.** The books' worked examples of play, transcribed
  (dual-channel, once) into deterministic intent scripts with expected outcomes;
  frozen fixtures thereafter.

### Phase 5 — Play surfaces and closing gates

- **5.1 CLI skin.** Full playability headless: the permanent boundary test and
  the agent/human debug surface.
- **5.2 Agent playthrough loop.** Agents as smart fuzzers generating intent
  sequences; the invariant suite is the oracle; every trip is minimized into a
  deterministic regression test.
- **5.3 Transcript reviewer.** A rules-literate LLM reads finished game logs
  against canon artifacts; findings go to the exception queue and every catch is
  two findings (engine bug + upstream-layer hole).
- **5.4 MCP skin** (as needed, e.g. for AI Director experiments).

### Phase 6 — Scale-out and product integration

- **6.1 Expressibility report → mechanism backlog.** Run the grammar corpus-wide;
  rank unimplemented constructs by how many artifacts each unlocks; build in
  that order.
- **6.2 Batch content compilation** by record type as mechanisms land.
- **6.3 Convex host integration.** Engine mounted behind sessions/the Table
  (host contract per `docs/architecture.md`; engine stays pure, host owns
  persistence/authz/realtime).
- **6.4 Table-mode UI.** The **first shippable play mode** — no map code on the
  critical path.
- **6.5 VTT.** Digital spatial resolver + map surface, additive. First-class,
  later.

### Phase exit tests

Each phase closes on an explicit, checkable exit — defined here so "done" is
never a judgment call:

- **P0:** engine package builds with boundary lint green in CI; artifact schema
  validates a hand-written sample; execution contract (states, transitions,
  ID/version rules) enumerated and reviewed.
- **P1:** conservation auditor green over the in-scope corpus; fidelity audit
  (1.5) run with findings queued; dashboard live with 0 artifacts in unknown
  state.
- **P2:** (amended, DEC-0010) 100% of ingested artifacts mechanically
  attributed to a category bucket via the reviewed source-location map, or
  explicitly unmatched in the totality report; the map itself reviewed by the
  user end to end.
- **P3:** pilot mechanisms green under TDD suites; grammar residue fully
  accounted (byte-span partition holds over pilot artifacts).
- **P4:** dual-channel conformance run over pilot artifacts with the
  disagreement queue published; invariant suite including state↔log
  reconciliation green.
- **P5:** scripted and agent playthroughs produce transcripts through the
  reviewer; every finding either minimized to a deterministic regression test
  or queued with a reason.
- **P6:** corpus-wide expressibility report published; first record-type batch
  compiled; a table-mode encounter playable end to end through the Convex host.

---

## Pilot: the Conditions vertical

**Goal:** validate every layer of the pipeline on the smallest slice that crosses
all of them — before committing to corpus scale. Judged on **completeness of
flagging, not coverage**: a pilot that implements 60% and precisely enumerates the
other 40% succeeds; one that implements 90% with a silent hole fails.

Seed scope: the nine records in `en/books/heroes/md/condition/`, the already
atomized SCC-linked rule records they depend on, the residual condition-related
chapter spans (chunked via the 1.3 harness — the pilot's real chunking test), and
~5 ability records whose text applies conditions.

**The true scope is the canon-dependency closure of that seed, discovered — not
declared.** The shared effect-lifecycle machinery is known to live outside the
seed (the Classes chapter retains "Stacking Unique Effects" / "Ending Effects",
while saving throws and end-of-turn are standalone rule records); SCC references
seed recursive dependency discovery, which is itself a
pilot step, and conservation + accounting apply to the discovered closure. This
is deliberate: hand-declaring the scope would bypass exactly the
flagged-not-assumed property the pilot exists to prove. Small enough to
hand-verify conservation; wide enough to touch prose chunking, structured
ingest, classification, lifecycle substrate, the grammar, dual-channel
conformance, invariants, the harness, and transcript review. Whether any
condition touches movement/positioning — exercising the table-directive path —
is determined from the artifacts, not assumed.

Ordered steps:

1. **Scaffold** — 0.1 + 0.2 in thin form (engine package, artifact schema).
2. **Ingest + closure** — mechanical ingest of the nine condition files; chunk
   the condition-relevant Combat.md spans; then **dependency discovery**: any
   lifecycle machinery the seed artifacts reference but don't contain is
   located, chunked, and added to pilot scope (the pilot's first exercise of
   flagged-not-assumed gaps). Conservation auditor over the resulting closure.
3. **Classify** — *(as run, 2026-08-22/23)* agent pass over the resulting
   artifacts plus three replication runs; measured label irreproducibility led
   to DEC-0010 (drop model classification; mechanical attribution instead).
   The experiment fulfilled this step's purpose — it tested the layer.
4. **Mechanisms** — minimal intent/state/log skeleton + the condition lifecycle
   substrate (apply/remove/expiry as shared helpers), built from what the
   artifacts say. TDD.
5. **Grammar + conformance** — parse the ~5 chosen abilities; full-consumption
   residue report; channel-1 exhaustive-delta tests; channel-2 independent
   assertions; publish the disagreement queue.
6. **Invariants v0** — including state↔log reconciliation.
7. **Harness + mini-encounter** — driver v0; a scripted encounter with two corpus
   actors; transcript out.
8. **Transcript review v0** — rules-literate pass over that transcript; findings
   to the queue.
9. **Judgment** — the pilot report: total accounting table (every artifact's
   state), exception queue contents, residue list, disagreement list, and an
   honest answer to "did anything surprise us that the system didn't flag?"

Exit criterion: zero artifacts in unknown state within pilot scope, and every
not-implemented item present in an explicit queue with a reason. Then scale
decisions (chunking throughput, review UX investment, grammar shape) are made on
pilot evidence instead of guesses.
