# Character builder — structural foundation

> **Provenance — read before implementing.**
> Structure in this file is mapped from **Forge Steel**
> (github.com/andyaiken/forgesteel, GPL-3.0), commit `01672c1`, read 2026-08-29.
> Forge Steel is an independent third-party transcription of Draw Steel and is
> **not** our canon source. Every name, number, count and option list below is
> **UNVERIFIED** and must be confirmed against the pinned SteelCompendium
> corpus (DEC-0008) before it is implemented or shown to a user.
> This file is a **structural map for UI and data-model design**, not a rules source.

## What this document is

V1 of our character builder targets **1:1 structural parity with Forge Steel** —
its layout, its attribution of features to classes, and its level progression.
We are not adopting its code or its data structures. This document is the
**shared spine**: the vocabulary, the build model, and the definition/selection
split that every per-class and per-element spec in this directory conforms to.

Companion files:

| File | Covers |
|---|---|
| `class-*.md` (11) | One per class, levels 1–10, incl. subclasses |
| `ancestries.md` | 12 ancestries + the ancestry-points economy |
| `careers-and-cultures.md` | 18 careers + inciting incidents + the culture composite |
| `complications-titles-perks.md` | Three selection pools |
| `kits-domains-items.md` | Three option pools that attach to a hero |
| `_AGENT-BRIEF.md` | The brief those specs were produced against |

## 1. The build pillars

A hero is assembled from **five pillars**, each independently selected:

```
Hero
├── ancestry      (Ancestry | null)      — features[] + ancestryPoints budget
├── culture       (Culture | null)       — language + environment/organization/upbringing
├── career        (Career | null)        — features[] + inciting incident
├── class         (HeroClass | null)     — featuresByLevel[] + subclasses[] + abilities[]
├── complication  (Complication | null)  — features[] (optional pillar)
├── features[]    — hero-level customisations outside the pillars
└── state         (HeroState)            — runtime: stamina damage, xp, titles, inventory, conditions
```

**Only `class` carries levels.** Ancestry, culture, career, and complication are
flat feature bags with no per-level progression. This is the single most
important shape fact for the builder UI: the level-up flow touches exactly one
pillar.

> **Terminology.** Draw Steel has no "background" mechanic or build step (the
> rulebook's Background chapter uses the word narratively). Ancestry / culture / career
> are three separate build steps. The source's `HeroOverview.background` is a
> display-only concatenation, not a domain concept.

## 2. The choice-point vocabulary

Every element in the system — class, ancestry, career, subclass, domain, kit,
title — is an `Element { id, name, description }` carrying a list of
**`Feature`s**. `Feature` is a discriminated union of **55 variants** keyed by
`FeatureType`. This union *is* the vocabulary of the builder: every control the
UI renders corresponds to exactly one variant.

Grouped by what they do:

**Inert / display**
`Text`

**Flat stat contributions** (no player decision — fold into derived stats)
`Bonus` (via `FeatureField`), `CharacteristicBonus`, `Speed`, `Size`,
`SaveThreshold`, `PotencyResistance`, `Proficiency`, `ConditionImmunity`,
`DamageModifier`, `MovementMode`, `Language`, `RollModifier`

**Ability grants**
`Ability`, `AbilityCost`, `AbilityDamage`, `AbilityDistance`, `AbilityKeyword`

**Player choices** (each renders a control)
`Choice`, `ClassAbility`, `SkillChoice`, `SkillCancelChoice`, `LanguageChoice`,
`Perk`, `TitleChoice`, `ItemChoice`, `Kit`, `Domain`, `DomainFeature`,
`AncestryChoice`, `AncestryFeatureChoice`, `Complication`, `SummonChoice`,
`TaggedFeatureChoice`

**Nested entities** (a whole creature/entity hangs off the selection)
`Companion`, `Retainer`, `Follower`, `Summon`, `SummonFormation`, `Fixture`,
`ForController`

**Resource economy**
`HeroicResource`, `HeroicResourceGain`, `HeroicResourceThreshold`, `SurgeGain`

**Director-side / monster-side** (present in the union, not hero-builder surface)
`Malice`, `MaliceAbility`

**Structural combinators** (these are the ones that complicate a naive model)
`Multiple`, `Package`, `PackageContent`, `TaggedFeature`, `AddOn`,
`SwitchOptions`, `SwitchValue`, `Toggle`

### Choice semantics

Every choice-shaped variant carries some subset of a common shape:

| Field | Meaning |
|---|---|
| `options` | The candidate set. Sometimes inline, sometimes a *filter* (`listOptions`, `lists`, `types`, `allowedTypes`) resolved against a global pool. |
| `count` | How many to pick. Usually a number; `FeatureChoice.count` may be the literal `'ancestry'`, meaning "spend the ancestry-points budget" rather than a fixed count. |
| `selectAt` | **`'build' \| 'respite' \| 'play'`** — when the choice is made. Present on `Choice`, `SkillChoice`, `LanguageChoice`. |
| `selected` | The player's answer, stored **inline on the feature**. |

Two of these deserve emphasis:

- **`count: 'ancestry'`** turns a pick-N control into a **point-buy** control.
  Options carry `{ feature, value }` weights spent against `ancestryPoints`.
- **`selectAt`** means a choice is not necessarily a build-time decision. A
  `'respite'` choice is re-made between encounters; a `'play'` choice is made at
  the table. **The builder is therefore not the only surface that writes
  selections** — the runtime does too. This directly constrains where selection
  state lives.

## 3. Level progression

```ts
featuresByLevel: { level: number; features: Feature[] }[]
```

Both `HeroClass` and `SubClass` carry this. A class also carries a flat
`abilities: Ability[]` pool that `ClassAbility` choices draw from.

- Levels run **1–10**.
- `HeroClass.level` is the hero's current level; `hero.state.xp` drives
  eligibility (`getMinXP = (level - 1) * xpPerLevel`; `canLevelUp` compares xp
  against the next level's minimum, capped at the max level present in the
  class's or its subclasses' `featuresByLevel`).
- Feature *visibility* is filtered by level inside
  `FeatureLogic.getFeaturesFrom*(element, heroLevel)` — features above the
  hero's level are excluded from the derived list, not deleted.
- **Subclass** is itself a choice: `subclassCount` (usually 1) picks from
  `subclasses[]`, each of which contributes its own `featuresByLevel`.
- `primaryCharacteristicsOptions: Characteristic[][]` — the class offers one or
  more permitted primary-characteristic sets; the player picks one, which then
  determines the legal characteristic arrays (see §5).

`setLevel` also cascades into nested entities: companions, retainers and summons
have their own `level` field synced to the hero's. **Nested entity level is
derived from hero level, not independently stored.**

## 4. The derivation spine

`HeroLogic.getFeatures(hero)` is the single fold that everything else reads:

```
getFeatures(hero) -> { feature, source, level }[]
    walks: ancestry → culture → career → class (+ selected subclass)
         → complication → hero.features → state.titles → state.inventory
    filters by heroLevel
    resolves Switch/Toggle/Package/Multiple combinators
```

Every derived stat — `getStamina`, `getSpeed`, `getStability`, `getDisengage`,
`getSaveThreshold`, `getRenown`, `getWealth`, `getProjectPoints`,
`getProficiencies`, `getSkills`, `getAbilities`, `getHeroicResources` — is a
fold over that flattened list. `HeroLogic` alone exposes ~78 static helpers over it.

**Design consequence for us:** the hero record should store *selections*, and a
single pure resolver should produce the flattened feature list, with all sheet
values derived from it. That mirrors our existing engine principle (pure engine,
data over code) and keeps the character sheet a projection rather than a second
source of truth.

## 5. Characteristic assignment

At build time the player assigns characteristic values from a fixed set of
arrays, gated by how many primaries the class declares:

| Primary count | Permitted arrays (values for the *non*-primary characteristics; primaries are 2) |
|---|---|
| 2 | `[2,-1,-1]`, `[1,0,0]`, `[1,1,-1]` |
| 1 | `[2,2,-1,-1]`, `[2,1,1,-1]`, `[2,1,0,0]`, `[1,1,1,0]` |

`calculateCharacteristicArrays` expands a chosen array into every distinct
permutation across the non-primary characteristics — so the UI presents
concrete, fully-assigned candidate spreads, not a drag-and-drop allocator.
`CharacteristicBonus` features (commonly at level 4/7/10) add on top.

**Flagged for canon verification:** these arrays are rules content and must be
confirmed against the pin before use.

## 6. Definition vs selection — the central decision

**Forge Steel deep-copies the entire class/ancestry/career object into the
`Hero`, then writes the player's answers into each feature's `selected` field
in place.** The hero document *is* a mutated copy of the content.

That design gives them offline editing and trivially-versioned heroes, at the
cost of: enormous hero documents, no shared content updates (a hero never sees a
corrected class), and no clean diff of "what did the player actually choose".

**For Convex we should invert this.** The recommendation every per-element spec
is written against:

| Layer | Contents | Storage |
|---|---|---|
| **Definition** | Classes, subclasses, ancestries, careers, cultures, complications, kits, domains, perks, titles, items, abilities. Static, seeded, versioned by source. | Convex tables, shared, read-only to players |
| **Selection** | A sparse map `featureId -> selection payload`, plus the pillar ids, level, xp, and characteristic array. | On the hero document |
| **Derived** | Everything on the character sheet. | Computed by a pure resolver; never stored |

Sketch:

```ts
// definition (seeded, shared)
classes: { sourceId, classId, name, type, subclassName, subclassCount,
           primaryCharacteristicsOptions, featuresByLevel, abilities }

// selection (per hero)
heroes: {
  ownerId, name, level, xp,
  sourceIds: string[],                    // which content sources are enabled
  ancestryId, cultureId, careerId, classId, subclassId, complicationId,
  primaryCharacteristics: Characteristic[],
  characteristicArray: { characteristic, value }[],
  selections: Record<featureId, SelectionPayload>,   // sparse
  state: { ... }                          // runtime, separate concern
}
```

### Confirmed: their own serializer already does this

`src/models/pregen.ts` collapses the deep-copied hero back into a flat, sparse
record for export — which is near-identical to the shape proposed above, and is
evidence the split is **lossless**:

```ts
interface Pregen extends Element {
  sourcebookIDs: string[];
  ancestryID / cultureID / careerID / classID / complicationID: string | null;
  incitingIncidentID: string | null;
  level: number;
  characteristics: { characteristic, value }[];
  selectedSubclassIDs: string[];
  featureSelections: { featureID: string; selections: string[] }[];
}
```

Two things to carry over from it:

- **`incitingIncidentID` and `selectedSubclassIDs` are first-class fields, not
  feature-keyed entries.** They are selections that do not correspond to a
  `Feature`, so a pure `featureId -> selection` map cannot hold them.
- `selectedSubclassIDs` is **plural** — `subclassCount` is not always 1.

### Where the sparse map is hard

Every per-element spec has an **Anomalies** section flagging these. The known
categories up front:

1. **Dependent option sets** — `DomainFeature` options depend on which `Domain`
   was selected earlier; `AncestryFeatureChoice` options depend on current *and
   former* ancestries. Selection validity is order-dependent, so the resolver
   must validate selections against the *current* definition, and the UI must
   invalidate downstream picks when an upstream one changes.
2. **Non-build-time choices** — `selectAt: 'respite' | 'play'` means the
   runtime writes selections too. Selection state cannot live only behind the
   builder's write path.
3. **Point-buy budgets** — `count: 'ancestry'` needs a partially-spent budget to
   be representable and validated (spent ≤ available).
4. **Nested entities** — `Companion` (Beastheart) and `Summon` (Summoner) hang
   whole creatures off a selection, with their own add-on point-buy
   (`AddOn { category, cost, repeatable }`) and their own derived stats.
   `ForController` marks features that apply to the *controller* rather than the
   companion. These are the two hardest cases in the builder.
5. **Combinators** — `SwitchOptions`/`SwitchValue` resolve a feature by a named
   switch set elsewhere; `Package`/`PackageContent` aggregate by string tag;
   `Multiple` nests features inside features; `Toggle` swaps between two
   features on a boolean. All of these mean **a feature id is not always a leaf**,
   so the selection map's keys need a defined path convention for nested features.
6. **Ability id references** — `ClassAbility.selectedIDs` stores ability ids
   with a `source` mask describing which pools are legal
   (`fromClassAbilities`, `fromSelectedSubclassAbilities`, `fromClassLevels`, …).
   The legal pool is computed, not enumerated in the data.

## 6b. Our corpus already owns half of this — and it owns identity

**Verified against the pinned SteelCompendium checkout (`v4.20260803143953`).**
This reframes the whole exercise, so it supersedes the naive "seed definition
data from a Forge-Steel-shaped structure" reading of §6.

The pin **already carries the class→level→feature attribution** — the thing we
came to Forge Steel for. Example, `heroes/md/feature/fury/level-4/skill.md`:

```yaml
class: fury
level: "4"
name: Skill
scc: mcdm.heroes.v1/feature.fury.level-4/skill
type: feature
---
You gain one skill of your choice. See Skills in Chapter 9: [Tests](...)
```

136 such feature records exist for Fury alone, foldered by level and subclass.
Class records carry structured `starting_stamina`, `stamina_per_level`,
`recoveries`, `primary_characteristics`, and potency formulas. Cross-references
are **typed links** (`scc.v1:mcdm.heroes.v1/skill.lore/nature`), not prose.

### `scc` is the stable identifier we said we needed

Every record carries one, and they are globally unique:

| Metric | Value |
|---|---|
| Records in the pin | 3,081 |
| Records carrying `scc` | **3,081 (100%)** |
| Distinct `scc` values | **3,081 (zero collisions)** |

Format: `mcdm.<book>.v1/<category-path>/<slug>`. Namespaced by publisher, book,
schema version, category and slug. **This is what the selection map keys on** —
not Forge Steel's hand-authored ids, which §8.3 shows are broken.

### What the pin does NOT have — and what Forge Steel is actually for

The corpus record above says *"You gain one skill of your choice"* as **prose**.
It does not say `{ type: SkillChoice, count: 1, selectAt: 'build',
listOptions: [...] }`. The pin has **content, attribution and identity**; it has
no machine-readable **choice semantics**.

That is precisely the layer Forge Steel supplies, and it is the only layer we
should be taking from it:

| Layer | Source | Status |
|---|---|---|
| Rule text, stats, flavour | **Pinned corpus** | Canonical |
| Class → level → feature attribution | **Pinned corpus** | Canonical |
| Stable identity (`scc`) | **Pinned corpus** | Canonical |
| Choice-point semantics (`FeatureType`, `count`, `selectAt`, option filters) | **Modelled by us**, informed by Forge Steel | Unverified overlay |

So the builder's definition layer is a **thin choice-point overlay keyed by
`scc`**, not a re-transcription of the class. Revised sketch:

```ts
// definition — our overlay, one row per choice point, keyed to the corpus
choicePoints: {
  scc: string;              // mcdm.heroes.v1/feature.fury.level-4/skill
  kind: ChoiceKind;         // our enum, informed by FeatureType
  count: number;
  selectAt: 'build' | 'respite' | 'play';
  optionSource: OptionSource;   // filter resolved against corpus categories
}

// selection — per hero, sparse, keyed by the SAME scc
heroes: { ..., selections: Record<sccId, SelectionPayload> }
```

**Consequence for the specs in this directory:** they remain the map of *what
choice points exist and with what cardinality*. They stop being the source of
the content itself. Each spec's rows must be joined to `scc` ids during seeding,
and any row that cannot be joined is a discrepancy to resolve against the pin —
not a licence to import Forge Steel's copy.

**Divergence already observed:** Fury level 4 reads *"Might and Agility each
increase to 3"* (absolute) in the pin; Forge Steel models it as two
`CharacteristicBonus` features of `value: 1` (delta). Equivalent only when the
base is 2. Representation differences like this are exactly what the join will
surface.

**Import rules (pin overrides FS structure) — added 2026-08-30 after pin
review:**

1. **Characteristic-increase rows are absolute-with-cap, never bare deltas.**
   The pin phrases them absolutely or with an explicit cap the FS model drops
   entirely — Fury L4 `feature/fury/level-4/characteristic-increase.md`
   ("increase to 3") and Fury L7 `feature/fury/level-7/characteristic-increase.md`
   ("increases by 1, to a maximum of 4"). Seed from the pin prose.
2. **`selectAt` / respite-mutability is re-derived from pin prose, not FS
   fields.** FS models some respite-changeable choices as plain build choices —
   e.g. Summoner Formation/Quick Command
   (`feature/summoner/level-1/formation.md`: changeable "as a respite
   activity"). Feeds R-D.

## 7. Build order (the wizard)

The source's own tab order is
`start → ancestry → culture → career → class → complication → details`
(`HeroEditTab`). That is the V1 wizard order.

Per step, the controls are enumerated in each element spec's **UI surface**
section. The cross-cutting rules:

- Each step is **independently revisitable**; changing an upstream pillar must
  invalidate dependent downstream selections rather than silently keeping them.
- **Level-up** is a class-only flow: raise `level`, then resolve any newly
  unlocked `featuresByLevel` entries that carry choices.
- Content availability is gated by **enabled sources** (`sourcebookIDs` on the
  hero). Summoner and Beastheart ship in separate sourcebooks; community and
  third-party sourcebooks exist in the source and are out of V1 scope unless we
  decide otherwise.

## 8. Open questions for us

1. **Which sources does V1 ship?** The source bundles official
   (core / orden / beastheart / summoner / patreon), community, and third-party
   sourcebooks. Our canon pin is core + Summoner (admitted 2026-08-30);
   Beastheart is `exclude` in the pin config until its own admission decision,
   so `class-beastheart.md` currently has NO admitted canon substrate.
2. **Do we keep `selectAt: 'respite' | 'play'`?** It couples the builder to the
   runtime. Either the hero document is writable from the encounter runtime, or
   those choices move to a runtime-side overlay.
3. **Feature id stability — CONFIRMED BROKEN upstream.** The sparse-selection
   design depends on stable ids. Forge Steel's are hand-authored strings
   (`fury-1-5`), and a global scan of `src/data` found **9,464 id literals,
   9,233 distinct, 61 duplicated**. Most duplicates are intentionally
   locally-scoped section ids (`activate`, `deactivate`, `effect`, `hidden`),
   but a real subset are genuine collisions between distinct features:

   | Duplicated id | Collision |
   |---|---|
   | `shadow-10-1b-1` … `-4` | **Cross-class** — copy-pasted from `shadow.ts:363` into `conduit.ts:605` |
   | `tactician-sub-1-8-1` | Three different doctrines share it |
   | `fury-sub-1-3-1` | Berserker L3 and Stormwight L3 share it |
   | `summoner-1-1-1`, `summoner-2-8-2a-2`, `summoner-3-2a`–`3-2d` | Repeated within the class |

   There are also **id gaps** (`fury-1-3`, `null-1-3`, `censor-1-3`,
   `shadow-1-2`/`-1-4`, `talent-skill-b`) and **duplicate feature names** within
   a single class. A hypothesis that the `-1-3` gaps were one systematic
   deletion was tested and **does not hold** — it does not correlate with kit
   grants, and Summoner's `-1-*` sequence is a different namespace (abilities).
   They are simply unmaintained hand-authored ids.

   **Consequence:** upstream ids are usable as *labels* but not as *keys*. The
   seeding pass must mint our own stable keys — scoped at minimum by
   `(sourceId, elementId, featureId)` — and record every upstream divergence.
   Ids must never be derived from feature *names* either. This is the same
   identity-conservation principle as CONV-0006.
4. **Nested-entity modelling.** Companions and summons are creatures. Do they
   reuse the engine's existing creature representation, or get a builder-local
   one? Decide before either class is implemented.
5. **Canon verification pass.** Nothing in this directory is canon. Each spec
   needs a verification pass against the pin before it drives implementation.
