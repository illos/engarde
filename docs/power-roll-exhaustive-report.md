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

## Addendum — R-0011 ownership hardening (2026-08-25)

The characteristic-test Gate-3 audit exposed a cluster-ownership defect in
`compileAbilities`: a tier bullet attached to the most recent power-roll
heading regardless of what intervened. Hardened rule (one home,
`groupPowerRollClusters`): whitespace passes through; an ability header, an
Effect line, flavor, or residue prose closes the open cluster.

Re-certified baseline: **617 clusters / 521 artifacts / 1,851 clean runs**
(was 606 / 514 / 1,818). The delta decomposes as:

- **+16 clusters un-suppressed.** Their own three bullets were clean, but
  bullets leaking in from a following ability (usually a test Effect's tier
  bullets) registered as duplicates and suppressed the whole ability — e.g.
  devil-adjudicator's Infernal Injunction signature ability.
- **−5 clusters correctly rejected**, all previously certified in error:
  four **counterfeit assemblies** whose own bullets fail the tier grammar
  ("blood soaked", dual damage parts, "vertical push", compound condition
  clauses) and whose missing tiers were silently backfilled from a later
  ability's parsed bullets — count-rhodar-von-glauer (Sanguine Mist's test
  outcomes certified as another ability's tiers, damage order inverted),
  vampire-lord, servok-miner, fire-giant-chief; and one **silent
  precondition loss** — the-nameless compiled without its verbatim
  "**Special:** The Nameless must be winded to use this ability." gate.

The independent audit walk in `power-roll-exhaustive-audit.test.ts` was
updated to an independent implementation of the same ownership rule (two
readers preserved). Both channels now agree at 617.

## Addendum 2 — strict whole-payload tier tails (2026-08-25)

Designing the characteristic-test attachment exposed a second, deeper defect:
`parseTierPayload`'s tail check compared condition-name COUNT, not names. Any
prose between the damage part and the linked condition names — forced
movement ("push 3;"), resource grants ("the target gains 1 rage;"), an
un-anchored potency gate, a mid-payload "(save ends)", a duration tail
("until the end of the encounter") — was silently swallowed, and the bullet
certified WITHOUT it. Worst class: `6 damage; push 3; M < 1 slowed (save
ends)` certified as *unconditional* slowed with the push dropped and the
M < 1 gate erased.

The tail is now compared word-for-word against the payload's linked
condition labels; any payload that says more than the grammar reads fails to
residue whole. Regression fixtures use verbatim dwarf-launcher, Sanguine
Mist, werewolf, and servok-miner bullets.

Re-certified baseline: **583 clusters / 504 artifacts / 1,749 clean runs**
(from 617 after the ownership hardening; 34 lossy-bullet clusters correctly
fell back to verbatim). Every remaining cluster's tier data is whole-payload
exact. The excluded bullets stay attributed residue until their mechanisms
(forced movement, resource grants, per-condition endings, durations) land
with their own closed grammars.
