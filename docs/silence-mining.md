# Silence mining → Gate-3 ruling decks

Status: first run 2026-09-02 (deck-01 = the effect-prose docket, deck-02 = the
`combat` chapter pilot). Tools in `tools/`, workflow in
`tools/workflows/silence-mining.workflow.js`, decks under
`.artifacts/canon/rulings-decks/<deck>/` (gitignored with the corpus).

## Why

Engine coverage is gated by two serial bottlenecks: substrate design (one home
per rule — parallel implementers diverge, GOTCHA-0009) and the user's Gate-3
verdicts. Reading and question-finding are not serial. This loop parallelizes
the part that parallelizes and makes each user sitting cheap: only questions
the pin provably does not answer reach a card, every card embeds its verbatim
evidence, and a verdict is bound to a hash of the exact card the user saw.

Nothing in this loop rules. Agents propose; the quote checker rejects
non-verbatim evidence; the user rules; the settle step records.

## The loop

| stage | who | tool | output |
| --- | --- | --- | --- |
| 0. work list | deterministic | `pnpm rulings:mine <out> --chapter combat [--exclude prior/sources.json]` | `mine/worklist.json` + per-batch verbatim sources (corpus map = navigation only, DEC-0013; `criticalPath` ignored — the field is corrupted) |
| 1. mine | one agent per batch | workflow `mode: "mine"` | candidate silences with `pinChecked` / `engineChecked` receipts; CONV-0004 collapses costless "can"s; spatial → `table-fact` (DEC-0011) |
| 2. merge | one agent | same run | one-ruling cards + `dropped` (with proof) |
| 3. cards | deterministic | write `silences.json` (+ `pnpm rulings:sources`) then `pnpm rulings:deck prep <deck>` | `cards/<qid>.json`, self-contained for the judge |
| 4. answer | one agent per card | workflow `mode: "verify"` | proposed ruling, basis, verbatim evidence, alternatives, collapsed sub-questions, existing ruling ids |
| 5. refute | N skeptics per card | same run | findings: pin-answers-it / engine-knows-it / already-ruled / fabricated-quote / invented-rule / wrong-basis / not-one-ruling |
| 6. deck | deterministic | `pnpm rulings:deck ingest <deck> <workflow-output.json>` then `pnpm rulings:deck build <deck> --title …` | `verify_quotes` → `build_ruling_set` → `review.html` |
| 7. rule | the user | tailscale link to `review.html` | exported `rulings-<docKey>.json` blob |
| 8. settle | deterministic | `pnpm rulings:settle <blob> <review-set> <sources> <rulings.json> <draft.md> --deck … --next-id R-00NN` | `rulings.json` (cardHash per verdict) + a `canon-rulings.md` draft the Lead places |

Stage 6 renders every card, refuted or not: a refutation is shown on the card
as the skeptic's problem so the user sees why the Lead doubts it. A fabricated
quote or an unresolved finding join blocks settlement, never rendering.

## Invariants

- **Verbatim or absent.** Evidence is `artifact-id: "exact words"` fragments;
  `verify_quotes.py` fails any fragment not byte-equal (after whitespace /
  emphasis / link normalization) to the pinned text.
- **The judge never leaves the page.** Cards embed the full pinned artifact
  text for every source, the sub-questions the one ruling settles, the
  proposal, its basis, and the skeptic's objections.
- **Verdicts bind to bytes.** `docKey` (whole deck) and `cardHash` (one card)
  are recomputed from the review set at settle time; a blob from a different
  deck is refused.
- **Never mine twice.** `--exclude` drops artifacts a prior deck already
  carried as evidence.
- **Agents never write.** The workflow returns structured data; the Lead
  ingests it deterministically. Provenance rides the commit trailer (CONV-0005).

## Reading a deck as the user

Accept / Override / Director's call / Defer / Escalate per card, `j`/`k` to
move, `y n d x s` to rule, Enter to type an override. Export JSON when done and
paste the blob back. Override without a note is refused at settle time — say
what the ruling should be instead.
