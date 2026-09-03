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
| 5b. recut | one agent per REFUTED card | workflow `mode: "recut"` | only genuine book silences / two-reading ambiguities survive as new single-decision questions; everything else lands in `settled-elsewhere.json` with its proof (ruling id, DEC/CONV id, printed quote, or engine file). The residue becomes deck `<name>b` and goes back through 3–5. Loop until the skeptics stop refuting. |
| 6. deck | deterministic | `pnpm rulings:deck ingest <deck> <workflow-output.json>` then `pnpm rulings:deck build <deck> --title …` | `verify_quotes` → `build_ruling_set` → `review.html` |
| 7. rule | the user | tailscale link to `review.html` | exported `rulings-<docKey>.json` blob |
| 8. settle | deterministic | `pnpm rulings:settle <blob> <review-set> <sources> <rulings.json> <draft.md> --deck … --next-id R-00NN` | `rulings.json` (cardHash per verdict) + a `canon-rulings.md` draft the Lead places |

Stage 6 renders every card, refuted or not, with the skeptic's objections on
the card — but a **refuted card is not handed to the user to rule on**. It is
recut (5b) and only its residue is. The rendered refuted deck is the audit
trail. A fabricated quote or an unresolved finding join blocks settlement,
never rendering.

## First run (2026-09-02) — what the loop measured

- **Deck 1** = the eight drafted effect-prose docket batches (R-0046–R-0053).
  All 159 quoted fragments verified byte-for-byte; **all 8 cards refuted** —
  every one bundled engine-design choices (the Lead's under CONV-0007) with
  points already ruled (R-0011/28/30/32/40/44, DEC-0019) and several decisions
  that would get different verdicts. Recut → **14 residue questions**, 116
  topics settled elsewhere with proof. The docket was not Gate-3 material.
- **Deck 2** = `combat` chapter, 30 engine rows not yet carried by a prior
  deck (48 of 78 were). 3 mining agents → 20 candidates → 18 cards → **15
  refuted, 3 stand** (critical-hit action conversion, opportunity-attack bane
  test net-vs-raw, falling prone-vs-effective-height). Refutations were mostly
  `pin-answers-it` and `wrong-basis` (engine-design labelled derived).
- **Settled 2026-09-03:** the assembled deck `rule-these-2026-09-03` (8
  cards: deck 2 ×3, deck 2b ×1, deck 1b ×4) came back **8/8 accepted** as
  **R-0047–R-0054** (`docs/canon-rulings.md`), one with a user note
  (R-0052). Blob docKey `d81d9a63c309e0ab`; card hashes recorded per entry.
- The skeptic stage is where the value is: without it both decks would have
  cost the user ~26 verdicts on questions the book or the project already
  answers. The merge stage dropped nothing; it needs the same strictness.
- Note for settling: the engine reserves **R-0046** for the Summoner Eidos
  residue (`packages/engine/src/schemas.ts`); decks number from R-0047.

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
