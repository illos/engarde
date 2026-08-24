# Canon Effect instruction engine — 2026-08-24

## Result

The engine now has a pure, typed execution path for every whole-line
`**Effect:**` instruction in the pinned Heroes and Monsters corpus.

- 1,688 Effect instructions across 1,044 accepted artifacts
- 12 exact instructions execute automatically
  - 5 fixed-damage instructions use the existing damage/Stamina core
  - 5 exact grabbed instructions use the condition lifecycle core with an
    external ending
  - 2 exact taunted instructions use the condition lifecycle core with an
    end-of-target's-next-turn ending and the canonical new-source replacement
    rule
- 1,676 bespoke instructions remain verbatim table directives
- 1,688/1,688 programs execute through the pure reducer with no refusals or
  invariant violations
- Grammar coverage: 30.4% → 39.3% of 4,485,334 corpus bytes
- 0 grammar-conservation violations across all 3,529 accepted artifacts

This is intentionally not a claim that arbitrary Effect prose has been
semantically automated. The grammar recognizes each complete Effect line as
an attributed instruction. It marks an instruction automatic only when the
entire payload matches a closed form already served by an engine core.
Everything else is a `table` program whose log message is the exact source
payload. The sweep continues to report those semantics as mechanism-pending.

The parser recognizes the marker only at column zero (or after the canonical
`> ` quote prefix), excludes the physical line ending, and preserves every
payload byte including Markdown trailing spaces. Indented code blocks are not
Effect instructions. Grabbed automation is closed to the five independently
reviewed bugbear forms; a new imposer or any appended rider remains table.

## Data and execution boundary

`EffectProgramData` carries:

- artifact id, one-based occurrence ordinal, and byte span;
- exact Markdown source payload;
- every explicit `scc.v1` reference in source order;
- nearest preceding action/targets header metadata;
- one validated resolution: fixed damage, condition application, or table.

Artifact id plus text is not sufficient provenance: six core statblocks
repeat identical Effect text within one artifact. Ordinal plus byte span makes
selection and replay unambiguous.

The `use-effect` intent runs through the same driver and invariant oracle as
all other engine mutations. It validates the actor and any named participant
targets before mutation, reuses the one-home damage and condition mechanisms,
and records a self-describing `effectResolution` receipt. Manual area, object,
or world instructions may correctly name no participant target; automatic
damage and condition programs require at least one.

Target metadata remains permissive and attributed: exceeding a recognized
numeric or singular `The triggering creature[/or object]` target declaration
warns and applies. The real Essence of Storms program is certified to emit
that warning when two participants are named; an `Each marked enemy` program
correctly permits an open participant count.

Replaying the same condition intent refuses before mutation if its
deterministic instance identity already exists. The driver and Convex host
also treat invariant failures as transaction blockers: candidate state and
candidate mutation claims are not adopted or persisted.

The Convex host recompiles an ordinal-addressed instruction from stored canon
rather than accepting executable data from the client, and verifies the
stored text's SHA-256 before parsing. The Table exposes exact instruction
selection, zero-target manual directives, multi-participant targeting, and
the knockout choice for automatic damage.

The headless play surface exposes:

```text
effect <record> <actor> <target|none> [occurrence]
```

When a record has several Effect instructions, the CLI lists them and requires
an occurrence selection. Automatic and table programs are visibly labeled.

## Exact automatic corpus

Fixed damage:

- `mcdm.heroes.v1/project/imbue-treasure`
- `mcdm.monsters.v1/monster.elemental.statblock/essence-of-storms`
- `mcdm.monsters.v1/monster.elf-wode.statblock/wode-elf-sentry`
- `mcdm.monsters.v1/monster.undead.2nd-echelon.statblock/mummy`
- `mcdm.monsters.v1/monster.war-dog.4th-echelon.statblock/soulbinder-psyche`

External grabbed condition:

- bugbear channeler, commander, roughneck, and sneak statblocks
- bugbear commando retainer statblock

End-next-turn taunted condition:

- `mcdm.heroes.v1/feature.ability.shining-armor/protective-attack`
- `mcdm.heroes.v1/kit/shining-armor`

These seven condition programs automate condition-instance application,
ending, source attribution, and the taunted rule that a taunt from a new source
replaces the old one. Cross-source replacement and the surviving instance's
end-of-turn expiry are certified together against the real Protective Attack
program. The derived roll and movement rules of grabbed and taunted are still
named mechanism gaps.

## Conservative negative fixtures

- Blood for Blood's self-damage-for-extra-damage choice remains table.
- Multi-sentence, conditional, delayed, coupled, or dice-derived damage stays
  table.
- The 39 `Choose one of the following benefits/effects:` introductions are
  table programs; their following branches remain grammar residue.
- Area, terrain, object, movement, resource, free-strike, and action-economy
  semantics remain table unless a future closed grammar and core mechanism
  land together.
- `(EoT)` and alternative tier branches remain unsupported as recorded by the
  power-roll exhaustive audit.

## Independent expectation channel

The production parser/compiler does not define its own expected answer. A
separate reviewed golden manifest freezes the 12 automatic identities at the
accepted canon pin `520553438a4e8d199bfaaf676b8aa9bd273f4d61`, including
artifact id, occurrence ordinal, source path, UTF-8 byte span, exact source,
targets declaration, and expected amount/type or condition/ending/replacement
behavior. Every other independently inventoried Effect line is expected to
compile as table.

The exhaustive suite compares production output to that manifest, then uses
the golden resolution—not the compiled resolution—to assert engine state.
The raw physical-line scanner is separate from the grammar and verifies count,
ordinal, exact payload, and UTF-8 byte boundaries before fixtures are emitted.

## Reproduction

```sh
pnpm test
pnpm typecheck
pnpm lint

cd packages/canon
ENGARDE_CORPUS_ROOT=../../.reference/steelcompendium \
ENGARDE_CANON_MANIFEST=../../.artifacts/canon/campaign/accepted/final-campaign-manifest.json \
pnpm test -- effect-grammar.test.ts effect-exhaustive.test.ts grammar-sweep.test.ts play.test.ts

pnpm corpus grammar-sweep \
  --root ../../.reference/steelcompendium \
  --structured-bundles ../../.artifacts/canon/bundles \
  --chapter-bundles ../../.artifacts/canon/campaign/accepted \
  --out ../../.artifacts/canon/sweep/effect-engine-grammar-sweep.json \
  --html ../../.artifacts/canon/sweep/effect-engine-sweep.html
```

The exhaustive test independently fixes the accepted inventory at 1,688
instructions / 1,044 artifacts and the truthfulness split at
5 damage / 7 condition-lifecycle / 1,676 table programs.
