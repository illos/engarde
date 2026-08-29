# Authorship and model provenance

Every document, design note, report, and canon ruling in this repository was
**drafted by a Claude model** under the project lead's direction. This file
says how to find out which one, and what is queued for a second pass.

## How to query it

Provenance lives in the git trailers, not in a table here. Commits carry a
`Co-Authored-By` line naming the model:

```
git log --format='%h %ad %s%n  %(trailers:key=Co-Authored-By,valueonly)' --date=short -- docs/<file>
```

That is the source of truth. Stamping as the work goes through is the whole
mechanism — no per-file or per-entry headers are maintained.

## Snapshot at 2026-08-29

119 commits: **88 Claude Fable 5**, **6 Claude Opus 5**, **29 unlabelled**
(2026-08-21..08-29; most too old to attribute, and this file does not guess).

Nearly all of `docs/` is Fable-drafted. Opus has touched two documents:
`canon-rulings.md` — the **R-0036 amendment** and **R-0040..R-0045**, the rest
Fable — and `squad-attack-report.md`.

Four unlabelled commits are recoverable and recorded here rather than by
rewriting history: `99e1fa8`, `d1ed9fb`, `0aa3ace`, `c8e1f47`, all **Opus 5**
(the resolution-openness extraction, the R-0040..R-0045 recording, the
occurrence ledger, the declared phase). Their hashes are cited throughout
project memory, so a rewrite would strand those references to fix a cosmetic
gap. The trailer resumes from the commit that adds this file.

## Standing intent: one Fable pass over everything

The project lead wants every model-authored artifact read once by **Claude
Fable 5**. Deferred on token budget, not scheduled — recorded so it is not
lost. Priority order:

1. **The Opus-drafted canon rulings** — R-0036 amendment, R-0040..R-0045.
   Highest stakes (the engine gates on them), smallest scope, no second-model
   read yet.
2. **`squad-attack-report.md`**.
3. **The engine code shipped with those rulings** — `99e1fa8`, `0aa3ace`,
   `c8e1f47`, and the squad-attack closeout. Reviewed by tests and the
   invariant oracle, not by a second model.
4. **The Fable-drafted corpus** — lowest value for a *Fable* pass specifically,
   since a same-model reread buys least where that model already wrote it.

Nothing here blocks a gate. Canon three-gate review, the invariant suite, and
corpus certification are unchanged and independent of it.
