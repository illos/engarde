# Whole-artifact prose triage

Status: first pass complete; nine `not-a-rule` rulings accepted by the user on
2026-08-25.

## Purpose and boundary

This lane searches the accepted Heroes and Monsters corpus for whole artifacts
that can leave the engine backlog because their text is only flavor,
narrative, or static display lore. A candidate is excluded if it contains a
rule, engine or app behavior, selectable option or data-entry instruction,
Director procedure, or mutable/persistent state implication. Damage, movement,
effects, conditions, terrain, resources, rolls, choices, timing, and tracking
are strong exclusion signals.

The detector is only a conservative search funnel. It never labels a candidate
`not-a-rule`, changes canonical bytes, or affects accounting. Human rulings are
keyed by canon pin, artifact ID, and artifact-version SHA-256; drift or partial
coverage fails validation.

## Correction to the initial feature-flavor lead

The initial reconnaissance found 434 exact, zero-signal feature `flavor`
strings. Those strings are real display-only prose, but they do not reduce the
grammar backlog: the existing Effect grammar already recognizes italic flavor
lines as `flavor` clauses. The useful first lane is therefore whole-artifact
residue, not those already-owned sub-artifact spans.

## Frozen first pass

At SteelCompendium pin
`520553438a4e8d199bfaaf676b8aa9bd273f4d61`, the accepted manifest contains
3,529 artifacts. The deterministic zero-signal/plain-prose boundary contains
365 candidates. The inventory is frozen by this digest:

`cef679b5aa6a34a0dd3b2056e978bed8f262cf6da3367c711e10b19ab5694375`

Three Luna lanes inspected all 365 exactly once:

| First-pass disposition | Count |
| --- | ---: |
| Pure prose | 8 |
| Unclear | 3 |
| Engine/app implication | 354 |

Two independent higher-model reviews then inspected only the 11 survivors and
agreed on every item. They retained the eight pure-prose items, promoted one
unclear item (`rewards#treasure-sourcing`), and rejected the other two because
they imply persistent soul-loss state and prescribed negotiation behavior.

The resulting nine-item shortlist is:

- `mcdm.heroes.v1/chapter/ancestries#last-names-and-bynames`
- `mcdm.heroes.v1/chapter/background#careers`
- `mcdm.heroes.v1/chapter/for-the-director#for-the-director-overview`
- `mcdm.heroes.v1/chapter/gods-and-religion#evil-gods-and-saints`
- `mcdm.heroes.v1/chapter/gods-and-religion#space-gods-of-the-timescape`
- `mcdm.heroes.v1/chapter/gods-and-religion#religion-in-the-timescape`
- `mcdm.heroes.v1/chapter/rewards#treasure-sourcing`
- `mcdm.monsters.v1/chapter/monster-basics#the-purpose-of-monsters`
- `mcdm.monsters.v1/chapter/monster-basics#everyone-loves-zombies`

The user reviewed the exact source cards and ruled: “Those are all narrative
only. No rules.” The accepted, drift-keyed manifest is
`packages/canon/config/artifact-prose-rulings.json`; it removes all nine whole
artifacts from the unresolved engine/app backlog. The focused review surface
remains reproducible at
`.artifacts/canon/artifact-prose/final-shortlist.html`.

One likely pure-lore false negative,
`gods-and-religion#gods-and-religion-overview`, was excluded mechanically by
the word “ancestry.” It remains outside this zero-signal batch and belongs in a
later bounded one-signal pass; it is not silently added by model judgment.

## Commands

Generate the frozen inventory and full review surface:

```sh
pnpm --filter @engarde/canon corpus artifact-prose-triage \
  --manifest ../../.artifacts/canon/campaign/accepted/final-campaign-manifest.json \
  --html ../../.artifacts/canon/artifact-prose/artifact-prose-triage.html \
  --out ../../.artifacts/canon/artifact-prose/artifact-prose-triage.json
```

Pass repeated `--artifact <id>` arguments to make a focused review page. The
page uses `n`, `e`, and `u` for `not-a-rule`, `engine-or-app`, and `unclear`,
stores progress locally, and exports a version-keyed rulings document. Validate
an export with `--rulings <rulings.json>`; the report's
`rulingValidation.ok` is true only for total, unique, pin-current coverage.

## Verification

`artifact-prose-triage.test.ts` freezes the accepted count, candidate count,
inventory digest, zero-signal condition, unique IDs, artifact/residue hashes,
and exact raw-source byte provenance. It also tests rule-shaped rejection,
total/version-current ruling validation, and the committed nine-item human
ruling batch against the live accepted artifacts.

Checkpoint verification on 2026-08-25: all 25 corpus-enabled canon test files
passed (128 tests), the corpus-certification stamp verified current, and all
five workspace projects passed TypeScript checking.
