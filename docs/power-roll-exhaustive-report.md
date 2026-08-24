# Exhaustive core power-roll conformance — 2026-08-24

## Result

Every power-roll cluster the current grammar and compiler can represent from
the pinned core campaign was executed through the engine at tier 1, tier 2,
and tier 3.

- 3,529 accepted core artifacts scanned from the definitive campaign manifest
- 606 complete, representable power-roll clusters across 514 artifacts
- 202 Heroes clusters and 404 Monsters clusters
- 1,818 deterministic engine executions
- 0 refusals
- 0 invariant violations
- Every resolved tier, damage amount and type, Stamina delta, potency gate,
  condition, and ending matched the corresponding parsed core artifact

The tests retain each artifact's text hash, source span/checksum, definitive
bundle provenance, and cluster ordinal. An independent audit proves every
supported cluster occurs once and receives exactly three executions.

## Defect found and corrected

The first run found that Styrich's **Tangled Nest** was falsely compiled. Its
tier outcomes contain mutually exclusive `or` branches with different potency
gates and endings. The flat tier schema had combined those branches and tried
to apply `restrained` twice, violating unique condition-instance identity.

Alternative branches and `(EoT)` endings are not represented yet, so the
grammar now conservatively leaves those lines as residue. The compiler also
rejects clusters containing duplicate tier bands instead of silently keeping
the first. These corrections reduced the claimed supported inventory from 655
to the truthful 606 clusters; unsupported text remains intact for future
grammar work.

## Reproduction

From `packages/canon`:

```sh
ENGARDE_CORPUS_ROOT=../../.reference/steelcompendium \
ENGARDE_CANON_MANIFEST=../../.artifacts/canon/campaign/accepted/final-campaign-manifest.json \
pnpm test -- effect-grammar.test.ts power-roll-exhaustive.test.ts power-roll-exhaustive-audit.test.ts
```
