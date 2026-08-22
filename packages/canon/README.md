# Canon corpus extraction

This package turns the pinned SteelCompendium snapshot into checksummed canon artifacts. It is
Node-capable tooling and intentionally separate from the future pure `packages/engine` package.

The extraction boundary is strict:

- SteelCompendium Markdown is the canonical byte surface.
- Its paired JSON record is carried as upstream structured data, not treated as canonical prose.
- Models return coordinates, stable keys, hierarchy, and tags only.
- The cutter copies source bytes and rejects a stale checksum or changed line anchor.
- The conservation audit requires every Markdown byte to belong to exactly one artifact or one
  reasoned exclusion.

## Pinned source

The active gitignored checkout is `.reference/steelcompendium`, sourced from
`SteelCompendium/data-unified`. The tracked pin and per-book/category dispositions live in
`config/steelcompendium-source.json`.

From this package's scripts, verify both the checkout and current upstream `main`:

```sh
pnpm --filter @engarde/canon corpus source-status \
  --root ../../.reference/steelcompendium \
  --check-upstream
```

Do this before starting a new extraction batch. If upstream moved, do not reuse old packets or
silently pull: inspect the upstream diff, update the checkout and tracked pin deliberately, then
regenerate the inventory. Packet and proposal checksums make stale work fail closed.

## Mechanical records

Create the complete paired inventory. `--strict` exits nonzero for a missing pair, malformed
frontmatter/JSON, identity mismatch, or category without an explicit disposition.

```sh
pnpm --filter @engarde/canon corpus inventory \
  --root ../../.reference/steelcompendium \
  --strict \
  --out ../../.artifacts/canon/inventory.json
```

Ingest one record:

```sh
pnpm --filter @engarde/canon corpus ingest \
  --root ../../.reference/steelcompendium \
  --path en/books/heroes/md/condition/dazed.md \
  --out ../../.artifacts/canon/dazed.bundle.json
```

Or ingest and audit an entire structured slice without model calls:

```sh
pnpm --filter @engarde/canon corpus ingest-all \
  --root ../../.reference/steelcompendium \
  --inventory ../../.artifacts/canon/inventory.json \
  --out-dir ../../.artifacts/canon/bundles \
  --book heroes \
  --category condition
```

## Grok chapter packets

Generate a line-numbered packet for a whole chapter or a deliberately bounded pilot span. For the
Conditions pilot, SteelCompendium already atomizes conditions, saving throws, and end-of-turn; the
remaining lifecycle/stacking prose is in this small Classes chapter span:

```sh
pnpm --filter @engarde/canon corpus packet \
  --root ../../.reference/steelcompendium \
  --path en/books/heroes/md/chapter/classes.md \
  --from-line 92 \
  --to-line 110 \
  --reason "Conditions pilot: stacking and effect lifecycle" \
  --out ../../.artifacts/canon/pilot/classes-effects.packet.json
```

Give the packet to Grok and save its JSON-only response as a proposal. Grok must return chunk start
lines and exact anchors, but no source prose. A machine-readable schema for Grok structured output
is available separately:

```sh
pnpm --filter @engarde/canon corpus proposal-schema \
  --out ../../.artifacts/canon/chapter-proposal.schema.json
```

Then cut and audit:

```sh
pnpm --filter @engarde/canon corpus cut \
  --root ../../.reference/steelcompendium \
  --proposal ../../.artifacts/canon/pilot/classes-effects.proposal.json \
  --out ../../.artifacts/canon/pilot/classes-effects.bundle.json

pnpm --filter @engarde/canon corpus audit \
  --root ../../.reference/steelcompendium \
  --bundle ../../.artifacts/canon/pilot/classes-effects.bundle.json
```

The packet scope is also an accounting boundary. Bytes before and after it become explicit
`outside-declared-scope` exclusions; within it, ordered chunk starts define a gapless partition.
For a full chapter packet (no `--from-line`/`--to-line`), the scope begins at the first byte after
frontmatter, including a leading blank body line. Its required first chunk uses an empty-string
anchor when that line is blank, so a definitive bundle can cover the entire post-frontmatter body.

## Campaign-set audit and manifest

After all definitive bundles exist, audit the campaign as one set. The structured root must
contain only the 2,593 mechanically ingested core records; the chapter root must contain only one
full-body bundle for each of the 20 chapter sources. The Classes pilot is evidence only, supplied
separately so it cannot count as the definitive Classes bundle.

```sh
pnpm --filter @engarde/canon corpus campaign-audit \
  --root ../../.reference/steelcompendium \
  --inventory ../../.artifacts/canon/inventory.json \
  --structured-bundles ../../.artifacts/canon/bundles \
  --chapter-bundles ../../.artifacts/canon/campaign/accepted \
  --classes-pilot ../../.artifacts/canon/pilot/classes-effects.bundle.json \
  --out ../../.artifacts/canon/campaign/manifest.json
```

The command rechecks the clean pinned source checkout, rebuilds and compares the supplied
inventory, reads the actual Markdown and JSON bytes for every bundle, and runs byte conservation.
It rejects missing, duplicate, stale, unexpected, or excluded-source bundles; globally duplicate
artifact IDs; failed bundle audits; and chapter bundles with `outside-declared-scope` exclusions.
It also requires the five accepted Classes pilot starts (keys, byte/line starts, and parents) to
remain unchanged in the full Classes bundle. The emitted manifest includes the tool/schema version,
source pin, inventory and bundle checksums, counts, and every finding; a finding exits nonzero.

## SCC reference closure

After ingesting the structured core records, use their existing SCC links to produce an
over-inclusive, deterministic reference closure before asking a model to infer any missing semantic
dependencies:

```sh
pnpm --filter @engarde/canon corpus closure \
  --root ../../.reference/steelcompendium \
  --bundles ../../.artifacts/canon/bundles \
  --seed mcdm.heroes.v1/condition/bleeding \
  --seed mcdm.heroes.v1/condition/dazed \
  --max-depth 2 \
  --out ../../.artifacts/canon/pilot/conditions.reference-closure.json
```

The report includes resolved artifact IDs and unresolved SCC references. It is a candidate closure,
not a claim that every hyperlink is a runtime dependency; classification narrows it later. The CLI
defaults to depth 2 because transitive prose links quickly reach most of the book; increase the bound
deliberately when investigating a specific unresolved dependency.

## Tests

Normal tests use content-neutral fixtures for byte/UTF-8/CRLF, stale-proposal, pairing, and
conservation behavior. The explicit corpus suite verifies the pinned 3,081-record snapshot and
mechanically ingests all nine core conditions:

```sh
pnpm --filter @engarde/canon test
pnpm --filter @engarde/canon test:corpus
```

## Execution contract (engine-plan 0.2)

Every artifact lives in a **total state machine** defined in `src/lifecycle.ts`
— four axes (`ingest`, `classification`, `parsing`, `conformance`), each with an
exhaustive state list, an initial state, and a legal-transition table.
`ArtifactRecordSchema` derives its lifecycle enums from that one home, so a
state outside the contract fails validation: "unknown state" is structurally
impossible at rest, which is what makes the dashboard headline ("0 artifacts in
unknown state") checkable.

Identity and versioning: an artifact's `id` is its stable identity; its
`version` is the SHA-256 of its verbatim source span. A re-cut with different
bytes is a new version of the same id — its lifecycle restarts and the prior
version's ingest state moves to `superseded`, so upstream/errata updates land
as deliberate diffs, never silent absorption. `exception` is an explicit state
on every post-ingest axis; `isLegalTransition` guards state changes.

## Conditions pilot scope (ROAD-0004, engine-plan §Pilot step 2)

`corpus pilot-scope` assembles the pilot's discovered dependency closure and runs
the conservation audit over every contributing bundle:

```sh
pnpm --filter @engarde/canon corpus pilot-scope \
  --root ../../.reference/steelcompendium \
  --structured-bundles ../../.artifacts/canon/bundles \
  --chapter-bundles ../../.artifacts/canon/campaign/accepted \
  --out ../../.artifacts/canon/pilot/pilot-scope.manifest.json
```

Inputs live in the committed `config/conditions-pilot.json`: the nine condition
seeds plus five sampled condition-applying abilities, the accepted chapter-base
resolutions (a chapter hyperlink is a discovery lead, never resolved blindly to
every child), and reviewed semantic supplements with recorded reasons. Every
inclusion carries provenance (`seed` / `dependency` / `resolution` /
`inbound-machinery` / `semantic-supplement`); chapter chunks that reference the
condition core are pulled in as machinery via the inbound pass; structured
inbound hits are enumerated as candidates, not silently included. Any edge the
walk cannot account for is a finding and fails the run.

## Classification (ROAD-0004, engine-plan §Pilot step 3)

Classification is discovery metadata layered over artifacts — models propose,
a human approves in batches, and misclassification is always recoverable
because artifact text is never model-produced. Content type is mechanical
(derived from the artifact id) and never asked of a model. A proposal pins the
artifact version, so a re-cut artifact automatically invalidates its
classification.

```sh
# 1. deterministic work packets (id, version, references, verbatim text)
pnpm --filter @engarde/canon corpus classify-packets \
  --root ../../.reference/steelcompendium \
  --manifest ../../.artifacts/canon/pilot/pilot-scope.manifest.json \
  --structured-bundles ../../.artifacts/canon/bundles \
  --chapter-bundles ../../.artifacts/canon/campaign/accepted \
  --out-dir ../../.artifacts/canon/pilot/classify/packets --lanes 4

# 2. agents write lane proposals (engarde-classification-proposal-v1) to
#    .artifacts/canon/pilot/classify/proposals/

# 3. total coverage validation — every scoped artifact classified exactly
#    once at the pinned version; anything else is a blocking finding
pnpm --filter @engarde/canon corpus classify-validate \
  --root ../../.reference/steelcompendium \
  --manifest ../../.artifacts/canon/pilot/pilot-scope.manifest.json \
  --structured-bundles ../../.artifacts/canon/bundles \
  --chapter-bundles ../../.artifacts/canon/campaign/accepted \
  --proposals ../../.artifacts/canon/pilot/classify/proposals

# 4. batch-review surface v0 — a markdown table for the human skim
pnpm --filter @engarde/canon corpus classify-review \
  --root ../../.reference/steelcompendium \
  --manifest ../../.artifacts/canon/pilot/pilot-scope.manifest.json \
  --structured-bundles ../../.artifacts/canon/bundles \
  --chapter-bundles ../../.artifacts/canon/campaign/accepted \
  --proposals ../../.artifacts/canon/pilot/classify/proposals \
  --out ../../.artifacts/canon/pilot/classify/review.md
```

Uncertainty is a first-class outcome: a proposal may set `uncertain=true` with
a note instead of guessing, and the review surface surfaces the queue. Batch
approval is a human act; the pilot records it in the working note / decisions
log, not by self-clearing.
