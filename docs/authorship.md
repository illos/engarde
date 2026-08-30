# Authorship and model provenance

Every document, design note, report, and canon ruling in this repository was
**drafted by a model** under the project lead's direction — mostly Claude, and
since 2026-08-29 also OpenAI Codex. This file says how to query that provenance
and records the completed independent-review boundary.

## How to query it

Provenance lives in the git trailers, not in a table here. Commits carry a
`Co-Authored-By` line naming the model:

```
git log --format='%h %ad %s%n  %(trailers:key=Co-Authored-By,valueonly)' --date=short -- docs/<file>
```

That is the source of truth. Stamping as the work goes through is the whole
mechanism — no per-file or per-entry headers are maintained.

## Audited snapshot at `ed99155` (2026-08-29)

133 commits: **88 Claude Fable 5**, **12 Claude Opus 5**, **4 OpenAI Codex
GPT-5.6**, and **29 without a trailer**. These are trailer counts, not inferred
file authorship. Four of the unlabelled commits have separate durable provenance
and are the only exceptions listed below, making **16 attributable Opus
commits** at this snapshot.

**The contributor set is not single-vendor.** Codex GPT-5.6 landed
`a9aba21 fix(engine): close reaction lifecycle audit defects` and the Effect
prose manual audit — the first non-Claude authorship in the repository. Any
"read it all once with a second model" plan has to account for that: some of
the tree has already had a genuinely independent cross-model read, and the
trailer is what tells you which parts.

The trailer is commit-level provenance: a file touched by several commits can
have several authors, so this document does not maintain a per-file snapshot.
Use the query above with a path restriction when that distinction matters.

Four unlabelled commits are recoverable and recorded here rather than by
rewriting history: `99e1fa8`, `d1ed9fb`, `0aa3ace`, `c8e1f47`, all **Opus 5**
(the resolution-openness extraction, the R-0040..R-0045 recording, the
occurrence ledger, the declared phase). Their hashes are cited throughout
project memory, so a rewrite would strand those references to fix a cosmetic
gap. The trailer resumes from the commit that adds this file.

## Independent-review coverage

OpenAI Codex GPT-5.6 independently audited all **16 attributable Opus commits**
at `ed99155`. Six already had independent audit/repair coverage and ten received
a fresh review. That is the completed coverage boundary; it does not imply that
the 25 other unlabelled commits have been attributed, nor that Fable-authored
work received the same audit. Findings and remediation status live in project
memory under `GOTCHA-0011`.

Authorship and certification remain different facts. A trailer records who
contributed to a commit; canon Gate 3, invariant tests, corpus certification,
and independent audit record what scrutiny the content received.
