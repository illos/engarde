# Effect shape inventory — ranked family selection (2026-08-24)

## What this is

The Effect instruction pipeline (docs/effect-engine-report.md) left 1,676 of
1,688 whole-line `**Effect:**` instructions as verbatim table directives. This
report ranks those 1,676 by observable structure so the next automation family
is chosen from measured evidence. The analyzer is deterministic and certified:

- `packages/canon/src/effect-shape-inventory.ts` — anchored regex families,
  orthogonal structure tags, whole-payload closed templates, comparison-only
  normalization (canon links → labels, bold dropped, integers → `<N>`). No
  source byte is altered; every row keeps artifact id, ordinal, and span.
- `packages/canon/src/effect-shape-inventory.test.ts` — freezes the full count
  table at canon pin `520553438a4e8d199bfaaf676b8aa9bd273f4d61`; any corpus,
  precedence, or pattern change must fail there on purpose. Conservation is
  asserted: the 15 primary families sum to exactly 1,676.
- Regenerate the full data (JSON + generated markdown):
  `pnpm corpus effect-shape-inventory --manifest
  ../../.artifacts/canon/campaign/accepted/final-campaign-manifest.json
  --md ../../.artifacts/canon/effect-shape/effect-shape-inventory.md
  --out ../../.artifacts/canon/effect-shape/effect-shape-inventory.json`

## Headline finding

**Effect lines are the corpus's bespoke residue by design.** The books put
regular mechanics in tier-outcome bullets (already served by the power-roll
cluster); the Effect line is where authors write the irregular thing. The
measured template diversity proves it: the three biggest families — movement
(355 lines, 334 unique normalized templates), condition (238/233), damage
(157/143) — are long tails of one-off prose. "Pick the biggest bucket" would
buy an open-ended grammar project with silent-rider risk on every line.

What actually recurs in closed form is small and precise:

| family (primary) | lines | artifacts | heroes | monsters | unique templates | single-sentence | closed-form matches |
|---|---:|---:|---:|---:|---:|---:|---:|
| other | 410 | 343 | 160 | 250 | 386 | 264 | 0 |
| movement | 355 | 295 | 109 | 246 | 334 | 171 | 0 |
| condition | 238 | 201 | 59 | 179 | 233 | 133 | 0 |
| damage | 157 | 146 | 69 | 88 | 143 | 73 | 0 |
| edge-bane | 152 | 147 | 40 | 112 | 139 | 85 | 14 |
| free-strike | 76 | 68 | 13 | 63 | 74 | 49 | 0 |
| characteristic-test | 54 | 47 | 1 | 53 | 31 | 30 | 29 |
| surge | 45 | 44 | 31 | 14 | 44 | 29 | 0 |
| choice-menu | 40 | 40 | 40 | 0 | 3 | 40 | 40 |
| stamina-regain | 35 | 35 | 3 | 32 | 31 | 25 | 2 |
| recovery | 34 | 34 | 28 | 6 | 33 | 20 | 6 |
| terrain | 30 | 30 | 11 | 19 | 25 | 16 | 3 |
| temporary-stamina | 22 | 22 | 12 | 10 | 22 | 11 | 1 |
| malice | 17 | 17 | 5 | 12 | 17 | 7 | 0 |
| heroic-resource | 11 | 11 | 10 | 1 | 11 | 4 | 0 |

Closed whole-payload templates (anchored `^…$`, rider-intolerant):

| id | lines | artifacts | heroes | monsters |
|---|---:|---:|---:|---:|
| choice-menu-intro | 40 | 40 | 40 | 0 |
| characteristic-test-exact | 29 | 24 | 0 | 29 |
| edge-bane-next-roll | 12 | 12 | 2 | 10 |
| spend-recovery-exact | 6 | 6 | 6 | 0 |
| area-difficult-terrain | 3 | 3 | 0 | 3 |
| next-strike-against-target | 2 | 2 | 0 | 2 |
| regains-stamina-flat | 2 | 2 | 0 | 2 |
| temporary-stamina-flat | 1 | 1 | 1 | 0 |

A complementary axis: 13 exact payloads repeat ≥ 3 times, covering 95 lines
(9× the war-dog loyalty-collar instruction, 8× the dwarf forced-movement
rider, 7× the burning-terrain damage text, 36× the choice intro, …). Repeats
share bytes, not necessarily executable semantics; each still needs its own
closed grammar and mechanism, so repetition alone doesn't rank first.

## Ranked candidates (reach × tractability × safety)

**1. `characteristic-test` — SELECTED.**
29 exact instructions across 24 artifacts match one grammatical form —
`(The|Each) target makes a[n] <Might|Agility|Reason|Intuition|Presence>
test.` (bold-tolerant, monsters-only at this pin; e.g. devil-adjudicator #2,
crucible-dragon #6). The family has 54 lines total; the 25 non-exact lines are
multi-sentence set-ups that stay table (verbatim outliers recorded in the
generated artifact). Why it wins:
- **Mechanism reuse is near-total.** A test is a roll banded into the same
  three tiers the certified power-roll core already resolves. No new state
  slots, no timing model, no target arithmetic — subject and characteristic
  are explicit in the payload; there is no amount, duration, or rider.
- **It unlocks more than its own 29 lines.** Measured: 18 of the 29 are
  directly followed by tier-outcome clauses the grammar already parses (the
  supported tier payloads then execute through existing cores); the other 11
  are followed by tier bullets whose bespoke payloads sit in residue today.
  The slice must attach following tier bullets to the test program and emit
  unparsed tier payloads as verbatim tier-level table directives — exactly
  the boundary the Effect pipeline already established at the line level.
- **Safety.** The anchored form cannot over-capture: any rider or second
  sentence fails `^…$` and stays table (certified by the frozen counts).
- **Gate-3 questions to put to the user before implementation** (the Tests
  chapter is in the accepted campaign as `heroes--tests`): what a test's roll
  formula and tier bands are for a monster-forced test, and whether any
  modifier (edges/banes, difficulty) applies by default. No rule content is
  assumed here; the slice starts with a rulebot pass over the Tests chapter.

**2. `edge-bane-next-roll` — next after tests.** 14 closed lines (12 + 2
"next strike made against the target") across 14 artifacts. Needs one new pure
mechanism — an attributed next-roll modifier grant with expiry — which is
genuine substrate: it scales toward the broader 152-line edge-bane family and
the power-roll host already computes edge/bane arithmetic. Slightly lower rank
only because it needs a new state slot + expiry semantics (a Gate-3 pass on
edge/bane duration wording) where tests need none.

**3. `choice-menu-intro` — deferred deliberately.** 40/40 heroes lines match
exactly, but the payload is an introduction; the choice branches live in
grammar residue with fully bespoke semantics. Automating the intro without the
branches converts nothing at the Table. Worth revisiting as a *presentation*
mechanism (enumerate-and-pick UI) once enough branch families are executable.

**4. Flat resource forms — batch later.** spend-recovery (6),
area-difficult-terrain (3), regains-stamina-flat (2), temporary-stamina-flat
(1): each is unambiguous but tiny, and recoveries/terrain/temporary Stamina
each need a new engine slot. Do them as one small "flat resource" slice after
the modifier substrate exists, if their slots have shipped by then.

**Explicitly rejected as first family:** movement, condition, damage,
free-strike, surge — every one is a long-tail family whose recurring *words*
hide non-recurring *sentences* (334/233/143/74/44 unique templates). Teaching
the engine those means open-ended prose interpretation, which is the exact
failure mode the table-directive boundary exists to prevent.

## Narrative triage rulings (user review, 2026-08-24)

The zero-mechanical-signal pass flagged 24 candidate lines; the user ruled all
24 via the generated review page. Committed manifest (drift-keyed by artifact
id + ordinal + payload SHA-256, test-enforced against the pin):
`packages/canon/config/narrative-triage-rulings.json`.

- **12 never** — permanently table directives by ruling: pure narrative color
  (basilisk-malice, omen-dragon premonition, bredbeddle head-throw,
  storm-mage gust), mechanical-reset bookkeeping on dynamic terrain
  (bear-trap, pressure-plate, pulley, switch), and content ruled out of the
  *encounter* engine's scope (titles → character-creation flow; perk
  psychic-whisper; scroll-of-resurrection).
- **12 engine-plausible** — stay table for now, with the user's implementation
  notes preserved in the manifest. Recurring themes worth tracking as future
  substrate: **VTT-surface effects** (sigil on a token, terrain zones,
  darkness, terrain elevation/height), a **negotiation engine** (Mediator's
  Charm patience), **bespoke condition states** (swallowed), and open rule
  research (Deathcount, servitor explosion damage).

Resulting corpus accounting at the pin (updated 2026-08-25 after the
next-roll grant slice shipped — see `next-roll-grant-report.md`; previous
step `characteristic-test-report.md`):
**55 automated (12 exact + 29 test + 14 next-roll grant) · 1,633 table
directives, of which 12 are ruled permanently-manual and 1,621
mechanism-pending.** The edge-bane family drops 152 → 138; both of its
closed templates (`edge-bane-next-roll`, `next-strike-against-target`) are
fully implemented, count 0. The `--max-signals 1` widening (335 lines) is
available for a future second review sitting.

## Definition of done for the selected slice

The characteristic-test family accounts for **29 exact instructions across 24
artifacts** (monsters-only at pin `5205…3d61`). The slice ships when: all 29
execute canonically through the existing roll/tier machinery; every
unsupported variation (the other 25 family lines and all other table
directives) remains verbatim; following tier bullets are attached with
unparsed tier payloads emitted as verbatim tier directives; the independent
golden channel freezes all 29 identities plus adversarial negatives; the full
1,688-program corpus re-executes with zero conservation or invariant
violations; and a fresh read-only audit returns GO.
