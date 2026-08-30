> **Provenance — read before implementing.**
> Structure in this file is mapped from **Forge Steel**
> (github.com/andyaiken/forgesteel, GPL-3.0), commit `01672c1`, read 2026-08-29.
> Forge Steel is an independent third-party transcription of Draw Steel and is
> **not** our canon source. Every name, number, count and option list below is
> **UNVERIFIED** and must be confirmed against the pinned SteelCompendium
> corpus (DEC-0008) before it is implemented or shown to a user.
> This file is a **structural map for UI and data-model design**, not a rules source.

# Class — Conduit

Source file: `src/data/classes/conduit/conduit.ts` (1175 lines, single file, no
subclass files). Domain definitions: `src/data/domains/*.ts` (12 files) — their
*contents* are specced elsewhere; their **attachment mechanism** is specced here
(§2.1) because it is the Conduit's defining structural feature.

Conventions used below:

- **`text: VERIFY-AGAINST-PIN`** replaces any field whose value is rulebook
  prose. Names, ids, counts, types and numeric fields are transcribed; rule
  wording is not.
- **Resolved defaults.** Every `FactoryLogic.feature.create*` call has been
  resolved against `src/logic/factory-feature-logic.ts`, so `count`, `selectAt`,
  `level`, `minLevel` and the `source` masks below are the *effective* values,
  including ones the data file omits.

---

## Identity

| Field | Value | Notes |
|---|---|---|
| `id` | `class-conduit` | |
| `name` | `Conduit` | |
| `description` | `VERIFY-AGAINST-PIN` | two-paragraph flavour blurb |
| `type` | `'standard'` | (vs `'master'`) |
| `subclassName` | `''` | empty — the Conduit has no subclass axis |
| `subclassCount` | `0` | |
| `subclasses` | `[]` | |
| `primaryCharacteristicsOptions` | `[[Intuition]]` | exactly one option |
| `primaryCharacteristics` | `[]` in the definition | auto-filled to `[Intuition]` on class selection, because `primaryCharacteristicsOptions.length === 1` (`hero-edit-page.tsx:268`). **Not a player choice.** |
| `featuresByLevel` | 10 entries, levels 1–10 | 53 top-level features total |
| `abilities` | 28 `Ability` records | 8 signature + 4 each at 3/5/7/9/11pt |
| `level` | `1` | overwritten per hero |
| `characteristics` | `[]` | filled by the characteristic-array picker |

**Derived stat contributions** (not choices — fold into the sheet):

| Feature | Field | Value |
|---|---|---|
| `conduit-stamina` | `FeatureField.Stamina` | `value: 18`, `valuePerLevel: 6`, `valuePerEchelon: 0` |
| `conduit-recoveries` | `FeatureField.Recoveries` | `value: 8` |

Heroic resource: **Piety** (`conduit-resource`, `type: 'heroic'`). Epic resource
at level 10: **Divine Power** (`conduit-10-3`, `type: 'epic'`).

No `Kit` feature anywhere in the class. The Conduit gets no kit from its class
data — **absent in source** (one level-1 Prayer option's prose references not
having a kit, but no `FeatureType.Kit` row exists).

---

## Level progression

Rows are in source order within each level. `Choice?` is
`FeatureLogic.isChoice(feature)` — i.e. whether the builder renders a control
for it. Ability-grant rows carry the *ability's* id and name (the factory copies
them onto the feature).

### Level 1 — 15 features

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 1 | `conduit-stamina` | Stamina | `Bonus` | no | — | — | — | none |
| 1 | `conduit-recoveries` | Recoveries | `Bonus` | no | — | — | — | none |
| 1 | `conduit-resource` | Piety | `HeroicResource` | no | — | — | — | none (runtime `value`, `gains[].used`) |
| 1 | `conduit-1-1` | Interpersonal / Lore Skills | `SkillChoice` | **yes** | 2 | `build` | `listOptions: [Interpersonal, Lore]` → global skill pool | `string[]` len 2 (skill names) |
| 1 | `conduit-1-2` | Domain | `Domain` | **yes** | **2** | — | all `sourcebook.domains` (12 bundled) | `string[]` len 2 (domain ids) |
| 1 | `conduit-1-3b` | Prayer | `Package` | no | — | — | — | none — aggregates `PackageContent` with `tag: 'conduit-prayer'` |
| 1 | `conduit-1-4` | 1st-Level Domain Feature | `DomainFeature` | **yes** | 1 | — | `level: 1` features of the hero's selected domains | `string` (feature id) |
| 1 | `conduit-1-5` | Healing Grace | `Ability` | no | — | — | — | none |
| 1 | `conduit-1-6` | Ray of Wrath | `Ability` | no | — | — | — | none |
| 1 | `conduit-1-7` | Triggered Action | `Choice` | **yes** | 1 | `build` | 2 inline options | `string` (option feature id) |
| 1 | `conduit-1-8` | Prayer | `Choice` | **yes** | 1 | **`respite`** | 5 inline options | `string` |
| 1 | `conduit-1-9` | Conduit Ward | `Choice` | **yes** | 1 | **`respite`** | 4 inline options | `string` |
| 1 | `conduit-1-10` | Signature Ability | `ClassAbility` | **yes** | **2** | — | `cost === 'signature'`, `minLevel ≤ 1`, class pool | `string[]` len 2 (ability ids) |
| 1 | `conduit-1-11` | 3pt Ability | `ClassAbility` | **yes** | 1 | — | `cost === 3` | `string[]` len 1 |
| 1 | `conduit-1-12` | 5pt Ability | `ClassAbility` | **yes** | 1 | — | `cost === 5` | `string[]` len 1 |

`conduit-1-7` **Triggered Action** options (each `value: 1`):

| Option id | Name | Option FeatureType | Inner ability type |
|---|---|---|---|
| `conduit-1-7a` | Word of Guidance | `Ability` | `Trigger` (`trigger: VERIFY-AGAINST-PIN`), Magic + Ranged, `Ranged 10`, target `One ally` |
| `conduit-1-7b` | Word of Judgment | `Ability` | `Trigger` (`trigger: VERIFY-AGAINST-PIN`), Magic + Ranged, `Ranged 10`, target `One ally` |

`conduit-1-8` **Prayer** options (`selectAt: 'respite'`, each `value: 1`):

| Option id | Name | Option FeatureType | Structural payload |
|---|---|---|---|
| `conduit-1-8a` | Prayer of Destruction | `AbilityDamage` | `keywords: [Magic]`, `value: 1`, `damageType: Damage` (default) |
| `conduit-1-8b` | Prayer of Distance | `AbilityDistance` | `keywords: [Magic, Ranged]`, `value: 2` |
| `conduit-1-8c` | Prayer of Soldier's Skill | `Multiple` | 3 children — see below |
| `conduit-1-8d` | Prayer of Speed | `Multiple` | 2 children — see below |
| `conduit-1-8e` | Prayer of Steel | `Multiple` | 2 children — see below |

Children of the three `Multiple` options (note the **id/parent mismatch**, §8):

| Parent | Child id | FeatureType | Payload |
|---|---|---|---|
| `conduit-1-8c` | `conduit-1-8da` | `Bonus` | `field: Stamina`, `valuePerEchelon: 3` |
| `conduit-1-8c` | `conduit-1-8db` | `AbilityDamage` | `keywords: [Weapon]`, `value: 1` |
| `conduit-1-8c` | `conduit-1-8dc` | `Proficiency` | `weapons: [Light]`, `armor: [Light]` |
| `conduit-1-8d` | `conduit-1-8ca` | `Bonus` | `field: Speed`, `value: 1` |
| `conduit-1-8d` | `conduit-1-8cb` | `Bonus` | `field: Disengage`, `value: 1` |
| `conduit-1-8e` | `conduit-1-8ea` | `Bonus` | `field: Stamina`, `valuePerEchelon: 6` |
| `conduit-1-8e` | `conduit-1-8eb` | `Bonus` | `field: Stability`, `value: 1` |

`conduit-1-9` **Conduit Ward** options (`selectAt: 'respite'`, each `value: 1`):

| Option id | Name | Option FeatureType | Payload |
|---|---|---|---|
| `conduit-1-9a` | Bastion Ward | `Bonus` | `field: Save`, `value: 1` |
| `conduit-1-9b` | Quickness Ward | `Text` | `description: VERIFY-AGAINST-PIN` |
| `conduit-1-9c` | Sanctuary Ward | `Text` | `description: VERIFY-AGAINST-PIN` |
| `conduit-1-9d` | Spirit Ward | `Text` | `description: VERIFY-AGAINST-PIN` |

Only `conduit-1-9a` is mechanised; the other three wards are inert `Text`.

### Level 2 — 4 features

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 2 | `conduit-2-1` | The Lists of Heaven | `Text` | no | — | — | — | none |
| 2 | `conduit-2-2` | Crafting / Lore / Supernatural Perk | `Perk` | **yes** | 1 | — | `lists: [Crafting, Lore, Supernatural]` → global perk pool | `string` (perk id) |
| 2 | `conduit-2-3` | 2nd-Level Domain Feature | `DomainFeature` | **yes** | 1 | — | **`level: 1`** features of the selected domains | `string` |
| 2 | `conduit-2-4` | 2nd-Level Domain Ability | `DomainFeature` | **yes** | 1 | — | `level: 2` features of the selected domains | `string` |

`conduit-2-3` carries an explicit `description` whose *intent* is "the level-1
domain feature of the domain you did **not** take at level 1". That exclusion is
**prose only** — `data.level` is `1` and nothing in the option-derivation
excludes the already-taken feature. See §8.

### Level 3 — 2 features

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 3 | `conduit-3-1` | Minor Miracle | `Text` | no | — | — | — | none |
| 3 | `conduit-3-2` | 7pt Ability | `ClassAbility` | **yes** | 1 | — | `cost === 7` | `string[]` len 1 |

### Level 4 — 6 features

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 4 | `conduit-4-1` | Blessed Domain | `HeroicResourceGain` | no | — | — | — | none (`tag: 'domain'`, `frequency: AtWill`, `value: '1'`, `replacesTags: []`, `trigger: VERIFY-AGAINST-PIN`) |
| 4 | `conduit-4-1a` | Characteristic Increase: Intuition | `CharacteristicBonus` | no | — | — | — | none (`Intuition +1`) |
| 4 | `conduit-4-1b` | Characteristic Increase: Additional Choice | `Choice` | **yes** | 1 | `build` | 4 inline options | `string` |
| 4 | `conduit-4-2` | Perk | `Perk` | **yes** | 1 | — | **all 6** perk lists (`lists` omitted → default) | `string` |
| 4 | `conduit-4-3` | Skill | `SkillChoice` | **yes** | 1 | `build` | all 5 skill lists | `string[]` len 1 |
| 4 | `conduit-4-4` | 4th-Level Domain Feature | `DomainFeature` | **yes** | 1 | — | `level: 4` features of the selected domains | `string` |

`conduit-4-1b` options — all `CharacteristicBonus`, `value: 1`, each `value: 1`
weight: `conduit-4-1b-1` Agility, `conduit-4-1b-2` Might, `conduit-4-1b-3`
Reason, `conduit-4-1b-4` Presence. (Intuition is excluded because `conduit-4-1a`
already grants it.)

### Level 5 — 2 features

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 5 | `conduit-5-1` | 5th-Level Domain Feature | `DomainFeature` | **yes** | 1 | — | **`level: 4`** features of the selected domains | `string` |
| 5 | `conduit-5-2` | 9pt Ability | `ClassAbility` | **yes** | 1 | — | `cost === 9` | `string[]` len 1 |

Same "take the other domain's feature" intent as `conduit-2-3`, same
non-enforcement.

### Level 6 — 3 features

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 6 | `conduit-6-1` | Burgeoning Saint | `Text` | no | — | — | — | none |
| 6 | `conduit-6-2` | Crafting / Lore / Supernatural Perk | `Perk` | **yes** | 1 | — | `lists: [Crafting, Lore, Supernatural]` | `string` |
| 6 | `conduit-6-3` | 6th-Level Domain Ability | `DomainFeature` | **yes** | 1 | — | `level: 6` features of the selected domains | `string` |

`conduit-6-1` bundles a damage-immunity *choice* ("corruption immunity 10 **or**
holy immunity 10") in prose only — it is a plain `Text` feature, **not** a
`DamageModifier` and **not** a `Choice`. See §8.

### Level 7 — 8 features

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 7 | `conduit-7-1a` | Might | `CharacteristicBonus` | no | — | — | — | none (`+1`) |
| 7 | `conduit-7-1b` | Agility | `CharacteristicBonus` | no | — | — | — | none (`+1`) |
| 7 | `conduit-7-1c` | Reason | `CharacteristicBonus` | no | — | — | — | none (`+1`) |
| 7 | `conduit-7-1d` | Intuition | `CharacteristicBonus` | no | — | — | — | none (`+1`) |
| 7 | `conduit-7-1e` | Presence | `CharacteristicBonus` | no | — | — | — | none (`+1`) |
| 7 | `conduit-7-2` | Faithful's Reward | `HeroicResourceGain` | no | — | — | — | none (`tag: 'start 2'`, `OncePerRound`, `value: '1d3 + 1'`, **`replacesTags: []`**) |
| 7 | `conduit-7-3` | Skill | `SkillChoice` | **yes** | 1 | `build` | all 5 skill lists | `string[]` len 1 |
| 7 | `conduit-7-4` | 7th-Level Domain Feature | `DomainFeature` | **yes** | 1 | — | `level: 7` features of the selected domains | `string` |

Level 7 grants **+1 to all five characteristics** as five separate un-chosen
`CharacteristicBonus` rows — no player decision here (unlike levels 4 and 10).

### Level 8 — 3 features

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 8 | `conduit-8-1` | Perk | `Perk` | **yes** | 1 | — | all 6 perk lists | `string` |
| 8 | `conduit-8-2` | 8th-Level Domain Feature | `DomainFeature` | **yes** | 1 | — | **`level: 7`** features of the selected domains | `string` |
| 8 | `conduit-8-3` | 11pt Ability | `ClassAbility` | **yes** | 1 | — | `cost === 11` | `string[]` len 1 |

### Level 9 — 3 features

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 9 | `conduit-9-1` | Faith's Sword | `Text` | no | — | — | — | none |
| 9 | `conduit-9-2` | Ordained | `Multiple` | no | — | — | — | none (2 children) |
| 9 | `conduit-9-3` | 9th-Level Domain Ability | `DomainFeature` | **yes** | 1 | — | `level: 9` features of the selected domains | `string` |

`conduit-9-2` children:

| Child id | FeatureType | Payload |
|---|---|---|
| `conduit-9-2a` | `PotencyResistance` | `characteristics: []` (empty), `value: 1` (default) |
| `conduit-9-2b` | `RollModifier` | `modifier: DoubleEdge`, `rollType: Test` (default), `characteristics: [Presence]`, `condition: VERIFY-AGAINST-PIN` |

`conduit-9-2a`'s empty `characteristics` array is almost certainly wrong — see §8.

`conduit-9-1` grants an ally a copy of `conduit-6-1`'s benefits at respite plus a
piety→ally-resource conversion. Modelled as inert `Text`; **no** `selectAt:
'respite'` choice row exists for picking that ally. See §8.

### Level 10 — 7 features

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 10 | `conduit-10-1` | Avatar | `Text` | no | — | — | — | none |
| 10 | `conduit-10-2a` | Characteristic Increase: Intuition | `CharacteristicBonus` | no | — | — | — | none (`Intuition +1`) |
| 10 | `conduit-10-2b` | Characteristic Increase: Additional Choice | `Choice` | **yes** | 1 | `build` | 4 inline options | `string` |
| 10 | `conduit-10-3` | Divine Power | `HeroicResource` | no | — | — | — | none (`type: 'epic'`, one `AtWill` gain, `tag: 'respite'`, `value: 'XP gained'`) |
| 10 | `conduit-10-4` | Most Pious | `Text` | no | — | — | — | none |
| 10 | `conduit-10-5` | Crafting / Lore / Supernatural Perk | `Perk` | **yes** | 1 | — | `lists: [Crafting, Lore, Supernatural]` | `string` |
| 10 | `conduit-10-6` | Skill | `SkillChoice` | **yes** | 1 | `build` | all 5 skill lists | `string[]` len 1 |

`conduit-10-2b` options — all `CharacteristicBonus`, `value: 1`, but their ids
are **`shadow-10-1b-1` … `shadow-10-1b-4`** (Might / Agility / Reason /
Presence). These ids are copy-pasted from the Shadow class and collide with
`src/data/classes/shadow/shadow.ts:363`. See §8 — this breaks any global
feature-id keyed selection map.

### Cross-level summary

| Level | Features | Of which choices | Domain-dependent choices |
|---|---:|---:|---:|
| 1 | 15 | 9 | 1 (`conduit-1-4`) + the domain pick itself |
| 2 | 4 | 3 | 2 |
| 3 | 2 | 1 | 0 |
| 4 | 6 | 4 | 1 |
| 5 | 2 | 2 | 1 |
| 6 | 3 | 2 | 1 |
| 7 | 8 | 2 | 1 |
| 8 | 3 | 3 | 1 |
| 9 | 3 | 1 | 1 |
| 10 | 7 | 3 | 0 |
| **total** | **53** | **30** | **9 + 1 domain pick** |

(30 = 28 class-level choice rows + the 2 nested skill choices that only exist
once a level-1 domain feature has been selected — see §2.1.)

---

### 2.1 The domain attachment mechanism — `Domain` + `DomainFeature`

This is the single most important structural fact about the Conduit, and the
place a naive sparse selection map breaks. Read this before modelling anything.

#### The two feature types

```ts
// src/models/feature.ts
interface FeatureDomainData {          // FeatureType.Domain
  characteristic: Characteristic;      // default Intuition
  levels: number[];                    // default [1..10]
  count: number;                       // default 1
  selected: Domain[];                  // WHOLE domain objects, deep-copied
}

interface FeatureDomainFeatureData {   // FeatureType.DomainFeature
  level: number;                       // which domain level to draw from
  count: number;                       // default 1
  selected: Feature[];                 // WHOLE feature objects, deep-copied
}
```

```ts
// src/models/domain.ts
interface Domain extends Element {
  featuresByLevel: { level: number; features: Feature[] }[];   // 10 entries
  resourceGains: ({ resource: string } & ResourceGain)[];
  defaultFeatures: Feature[];
}
```

The Conduit's `conduit-1-2` resolves to
`{ characteristic: Intuition, levels: [1,2,3,4,5,6,7,8,9,10], count: 2 }`.

#### What selecting a domain does (three separate effects)

1. **`defaultFeatures` are granted automatically, no choice.**
   `FeatureLogic.simplifyFeatures` handles `FeatureType.Domain` by walking
   `selected[].defaultFeatures` only — **never** `featuresByLevel`. For all 12
   domains `defaultFeatures` is exactly one `PackageContent` with
   `tag: 'conduit-prayer'`, which is what the class's `conduit-1-3b` `Package`
   feature aggregates and displays. Two domains → two prayer effects on the
   sheet, with no extra decision.
2. **`resourceGains` join the Piety economy.**
   `HeroLogic.getAllResourceGains` and `getHeroicResources` pull
   `getDomains(hero).flatMap(d => d.resourceGains)` and keep those whose
   `resource` matches the resource feature's `name`. All 12 domains declare
   `resource: 'Piety'`, `tag: ''`, `value: '2'`,
   `frequency: OncePerEncounter`, `trigger: VERIFY-AGAINST-PIN`. (This is also
   how the Censor is excluded — its resource is not named Piety.)
3. **`featuresByLevel` becomes the *option pool* for every `DomainFeature` row.**
   Nothing from `featuresByLevel` is granted; it is only ever *offered*.

#### The exact option-derivation rule

Both the config UI (`components/features/feature-data/domain-feature.tsx`) and
the randomiser (`hero-logic.ts:1662`) compute it the same way:

```
options(DomainFeature f) =
    HeroLogic.getDomains(hero)                     // ALL Domain features on the hero
      .flatMap(d => d.featuresByLevel)
      .filter(lvl => lvl.level === f.data.level)
      .flatMap(lvl => lvl.features)
```

Three consequences worth stating explicitly:

- **`getDomains(hero)` is hero-wide, not class-wide.** It folds every
  `FeatureType.Domain` feature anywhere on the hero. The **Godsworn title**
  (`data/title-data.ts:1148`) also carries a `Domain` + a level-1
  `DomainFeature`, so taking that title *widens the Conduit's domain-feature
  option lists at every level*. The option pool is not a function of the class.
- **The UI applies no exclusion.** Unlike `ConfigClassAbility` (which filters
  `currentAbilityIDs`), `ConfigDomainFeature` offers the full pool. The
  randomiser *does* exclude already-held ids; the human path does not. So a
  player can pick the same level-1 domain feature at both `conduit-1-4` and
  `conduit-2-3`.
- **`FeatureDomain.levels` prunes the copy.** On selection, the domain is
  deep-copied and `featuresByLevel` is filtered to `data.levels`. For the
  Conduit that keeps everything; for the Censor (`levels: [1,4,7]`) it discards
  levels 2/6/9. **The stored domain object is not the definition object.**

#### Cardinality: what the option lists actually contain

Per-level top-level feature counts across all 12 bundled domains:

| Domain | id | L1 | L2 | L3 | L4 | L5 | L6 | L7 | L8 | L9 | L10 |
|---|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| Creation | `domain-creation` | 1 | 1 | 0 | 1 | 0 | 1 | 1 | 0 | 1 | 0 |
| Death | `domain-death` | 1 | 1 | 0 | 1 | 0 | 1 | 1 | 0 | 1 | 0 |
| Fate | `domain-fate` | 1 | 1 | 0 | 1 | 0 | 1 | 1 | 0 | 1 | 0 |
| Knowledge | `domain-knowledge` | 1 | 1 | 0 | 1 | 0 | 1 | 1 | 0 | 1 | 0 |
| Life | `domain-life` | 1 | 1 | 0 | 1 | 0 | 1 | 1 | 0 | 1 | 0 |
| Love | `domain-love` | 1 | 1 | 0 | 1 | 0 | 1 | **2** | 0 | 1 | 0 |
| Nature | `domain-nature` | 1 | 1 | 0 | 1 | 0 | 1 | 1 | 0 | 1 | 0 |
| Protection | `domain-protection` | 1 | 1 | 0 | 1 | 0 | 1 | 1 | 0 | 1 | 0 |
| Storm | `domain-storm` | 1 | 1 | 0 | 1 | 0 | 1 | 1 | 0 | 1 | 0 |
| Sun | `domain-sun` | 1 | 1 | 0 | 1 | 0 | 1 | 1 | 0 | 1 | 0 |
| Trickery | `domain-trickery` | 1 | 1 | 0 | 1 | 0 | 1 | 1 | 0 | 1 | 0 |
| War | `domain-war` | 1 | 1 | 0 | 1 | 0 | 1 | 1 | 0 | 1 | 0 |

So with 2 domains selected, every `DomainFeature` control is a **1-of-2**
picker — **except** at level 7, where a Conduit who took Love faces a **1-of-3**
list (`domain-love-7-1` Covenant of the Heart and `domain-love-7-2` Guided to
Your Side are two sibling top-level features, not one `Multiple`). Levels 3, 5,
8 and 10 are empty in every domain, which is why the class has no `DomainFeature`
row for those levels.

#### The nested choice: every level-1 domain feature contains a `SkillChoice`

Uniform across all 12 domains, the `level: 1` entry is a single
`FeatureType.Multiple` (`domain-<name>-1`) containing:

- one named feature — `Text` or `Ability` (`domain-<name>-1-1`), and
- one **`SkillChoice`** (`domain-<name>-1-2`), `count: 1`, `selectAt: 'build'`,
  one `listOptions` entry.

Skill list per domain: Creation → Crafting; Death → Lore; Fate → Lore;
Knowledge → Lore; Life → Exploration; Love → Interpersonal; Nature →
Exploration; Protection → Exploration; Storm → Exploration; Sun → Lore;
Trickery → Intrigue; War → Exploration.

**This means selecting a `DomainFeature` at level 1 (and again at level 2)
*creates a new choice point that did not exist before*.** `simplifyFeatures`
recurses through `DomainFeature.selected` → `Multiple.features`, so the nested
`SkillChoice` appears in the class tab's level-1 (resp. level-2) choice list the
moment the domain feature is chosen. The builder's control list is therefore
**not statically derivable from the class definition** — it must be recomputed
after every selection.

#### Resolution ordering constraint

`HeroUpdateLogic` explicitly runs its feature-data pass **twice**
(`hero-update-logic.ts:361`):

```
// We have to make sure we handle Domain features before we handle
// Domain Feature features. That's why we do the below logic twice
pass 1: features where type === FeatureType.Domain
pass 2: features where type !== FeatureType.Domain
```

Any resolver we write inherits this: **`Domain` selections must be materialised
before `DomainFeature` selections can be validated**, because the latter's legal
option set is a function of the former. This is a hard topological edge in the
selection graph, and the only one in the Conduit.

#### The string-rewriting landmine

On selection *and* on every migration, Forge Steel runs

```ts
FeatureLogic.switchFeatureCharacteristic(f, Characteristic.Intuition, data.characteristic)
```

over `defaultFeatures` and every retained `featuresByLevel` feature. It
`replaceAll`s the characteristic *name* through descriptions, ability section
text, and power-roll tier strings, and rewrites `+ I` → `+ P`. For the Conduit
(`characteristic: Intuition`) this is a no-op. It exists because domain content
is shared with the Censor (`characteristic: Presence`), and several domain
features carry explicit "If you are a **Conduit** … / If you are a **Censor** …"
branches in a single prose blob (e.g. `domain-life-4`, `domain-life-7`).

**Do not port this.** It is text mutation standing in for a data model. Our
version should either (a) store the branch as structured per-class variants in
the definition, or (b) store the characteristic as a parameter and resolve it at
render time. Either way the definition must stay immutable.

---

## Subclasses

**Not applicable.** `subclassName: ''`, `subclassCount: 0`, `subclasses: []`.
The Conduit has no subclass axis. Its differentiation axis is the **2-domain
selection at level 1**, which the class-section UI does *not* render as a
subclass control (the subclass panel is gated on `subclassCount > 0`); it is an
ordinary level-1 `Domain` choice row.

Structural note for our builder: the Conduit and Censor are the only two classes
that use `FeatureType.Domain`, and neither has domains as a subclass. If our UI
gives subclasses special prominence, the Conduit needs the **domain picker**
given that prominence instead.

Consequence for `ClassAbility` option pools: the default source mask is
`{ fromClassAbilities: true, fromSelectedSubclassAbilities: true, … all others false }`.
With no subclasses, every Conduit `ClassAbility` row draws from
`heroClass.abilities` alone.

---

## Abilities

28 entries in `conduit.abilities`. All have `minLevel: 1` (default),
`repeatable: false` (default), `characteristic: [Intuition]` on every power roll.
Tier text is rules content — `tiers: VERIFY-AGAINST-PIN` throughout.

| id | Name | Cost | Action type | Keywords | Distance | Target | Has power roll |
|---|---|---|---|---|---|---|---|
| `conduit-ability-1` | Blessed Light | signature | Main | Magic, Ranged, Strike | Ranged 10 | One creature or object | yes |
| `conduit-ability-2` | Drain | signature | Main | Magic, Melee, Strike | Melee 1 | One creature | yes |
| `conduit-ability-3` | Holy Lash | signature | Main | Magic, Ranged, Strike | Ranged 10 | One creature or object | yes |
| `conduit-ability-4` | Lightfall | signature | Main | Area, Magic | Burst 2 | Each enemy in the area | yes |
| `conduit-ability-5` | Sacrificial Offer | signature | Main | Magic, Ranged, Strike | Ranged 10 | One creature | yes |
| `conduit-ability-6` | Staggering Curse | signature | Main | Magic, Melee, Strike | Melee 1 | One creature or object | yes |
| `conduit-ability-7` | Warrior's Prayer | signature | Main | Magic, Ranged, Strike | Ranged 10 | One creature | yes |
| `conduit-ability-8` | Wither | signature | Main | Magic, Ranged, Strike | Ranged 10 | One creature or object | yes |
| `conduit-ability-9` | Call the Thunder Down | 3 | Main | Area, Magic, Ranged | Cube 3 within 10 | Each enemy in the area | yes |
| `conduit-ability-10` | Font of Wrath | 3 | Main | Magic, Ranged | Ranged 10 | Special | no |
| `conduit-ability-11` | Judgment's Hammer | 3 | Main | Magic, Ranged, Strike | Ranged 10 | One creature or object | yes |
| `conduit-ability-12` | Violence Will Not Aid Thee | 3 | Main | Magic, Ranged, Strike | Ranged 10 | One creature | yes |
| `conduit-ability-13` | Corruption's Curse | 5 | Main | Magic, Ranged, Strike | Ranged 10 | One creature or object | yes |
| `conduit-ability-14` | Curse of Terror | 5 | Main | Magic, Ranged, Strike | Ranged 10 | One creature | yes |
| `conduit-ability-15` | Faith is Our Armor | 5 | Maneuver | Magic, Ranged | Ranged 10 | Four allies | yes |
| `conduit-ability-16` | Sermon of Grace | 5 | Main | Area, Magic | Burst 4 | Each ally in the area | no |
| `conduit-ability-17` | Fear of the Gods | 7 | Main | Area, Magic, Ranged | Cube 5 within 10 | Each enemy in the area | yes |
| `conduit-ability-18` | Saint's Raiment | 7 | Maneuver | Magic, Ranged | Ranged 10 | One ally | no |
| `conduit-ability-19` | Soul Siphon | 7 | Main | Magic, Ranged, Strike | Ranged 10 | One enemy | yes |
| `conduit-ability-20` | Words of Wrath and Grace | 7 | Main | Area, Magic | Burst 5 | Each enemy in the area | yes |
| `conduit-ability-21` | Beacon of Grace | 9 | Main | Magic, Ranged, Strike | Ranged 10 | One creature | yes |
| `conduit-ability-22` | Penance | 9 | Main | Area, Magic, Ranged | Cube 4 within 10 | Each enemy in the area | yes |
| `conduit-ability-23` | Sanctuary | 9 | Maneuver | Magic, Ranged | Ranged 10 | Self or one ally | no |
| `conduit-ability-24` | Vessel of Retribution | 9 | Maneuver | Magic, Ranged | Ranged 10 | Self or one ally | no |
| `conduit-ability-25` | Arise! | 11 | Main | Magic, Ranged | Ranged 10 | Self or one ally | no |
| `conduit-ability-26` | Blessing of Steel | 11 | Maneuver | Area, Magic | Aura 5 | Self and each ally in the area | no |
| `conduit-ability-27` | Blessing of the Blade | 11 | Maneuver | Area, Magic | Aura 5 | Self and each ally in the area | no |
| `conduit-ability-28` | Drag the Unworthy | 11 | Main | Magic, Ranged, Strike | Ranged 10 | One creature or object | yes |

Cost distribution: **signature ×8, 3pt ×4, 5pt ×4, 7pt ×4, 9pt ×4, 11pt ×4.**
A level-10 Conduit picks **7** of these 28 (2 signature + one each at 3/5/7/9/11).

**Abilities granted as features, not chosen** (they live in `featuresByLevel`,
not in `abilities`, so they are never `ClassAbility` options):

| id | Name | Cost | Action type | Keywords | Distance | Target |
|---|---|---|---|---|---|---|
| `conduit-1-5` | Healing Grace | 0 (default) | Maneuver | Magic, Ranged | Ranged 10 | Self or one ally |
| `conduit-1-6` | Ray of Wrath | 0 (default) | Main, `freeStrike: true`, `qualifiers: ['can be used as a ranged free strike']` | Magic, Ranged, Strike | Ranged 10 | One creature or object |
| `conduit-1-7a` | Word of Guidance | 0 (default) | Trigger | Magic, Ranged | Ranged 10 | One ally |
| `conduit-1-7b` | Word of Judgment | 0 (default) | Trigger | Magic, Ranged | Ranged 10 | One ally |

`conduit-1-5` carries an `AbilitySectionField` created by
`createAbilitySectionSpend({ repeatable: true, … })` → `{ type: 'field',
name: 'Spend', value: 1, repeatable: true, effect: VERIFY-AGAINST-PIN }`. This
is the only repeatable spend section in the class; both level-1 triggered
actions carry a non-repeatable `Spend` field (`value: 1`).

---

## Choice-point inventory

In build order. "1 of N" is the option-list cardinality at that point.

**Before the class tab's level list:**

| # | Decision | Cardinality | Notes |
|---|---|---|---|
| 0 | Class = Conduit | 1 of all classes in enabled sources | |
| 0a | Primary characteristics | **no choice** | auto-set to `[Intuition]` (single option) |
| 0b | Characteristic array | 1 of 4 | `[2,2,-1,-1] / [2,1,1,-1] / [2,1,0,0] / [1,1,1,0]` (primary count 1) |
| 0c | Array → characteristic assignment | 1 of the distinct permutations of the chosen array over Might/Agility/Reason/Presence | 12, 12, 12, 4 respectively |

**Level 1** (9 rows, 11 individual picks):

| # | Feature | Decision | Cardinality | selectAt |
|---|---|---|---|---|
| 1 | `conduit-1-1` | 2 skills | 2 of (Interpersonal ∪ Lore) | build |
| 2 | `conduit-1-2` | **2 domains** | 2 of 12 | build |
| 3 | `conduit-1-4` | level-1 domain feature | 1 of 2 | build |
| 3a | `domain-<x>-1-2` | *nested* — skill from the chosen domain's list | 1 of that list | build — **only exists after #3** |
| 4 | `conduit-1-7` | triggered action | 1 of 2 | build |
| 5 | `conduit-1-10` | signature abilities | 2 of 8 | build |
| 6 | `conduit-1-11` | 3pt ability | 1 of 4 | build |
| 7 | `conduit-1-12` | 5pt ability | 1 of 4 | build |
| 8 | `conduit-1-8` | **Prayer** | 1 of 5 | **respite** |
| 9 | `conduit-1-9` | **Conduit Ward** | 1 of 4 | **respite** |

**Levels 2–10:**

| # | Level | Feature | Decision | Cardinality |
|---|---|---|---|---|
| 10 | 2 | `conduit-2-2` | perk | 1 of (Crafting ∪ Lore ∪ Supernatural) |
| 11 | 2 | `conduit-2-3` | level-1 domain feature (the other one) | 1 of 2 — **not deduplicated** |
| 11a | 2 | `domain-<y>-1-2` | *nested* skill | 1 of that domain's list |
| 12 | 2 | `conduit-2-4` | level-2 domain ability | 1 of 2 |
| 13 | 3 | `conduit-3-2` | 7pt ability | 1 of 4 |
| 14 | 4 | `conduit-4-1b` | characteristic +1 | 1 of 4 (Agility/Might/Reason/Presence) |
| 15 | 4 | `conduit-4-2` | perk | 1 of all 6 lists |
| 16 | 4 | `conduit-4-3` | skill | 1 of any list |
| 17 | 4 | `conduit-4-4` | level-4 domain feature | 1 of 2 |
| 18 | 5 | `conduit-5-1` | level-4 domain feature (the other one) | 1 of 2 — **not deduplicated** |
| 19 | 5 | `conduit-5-2` | 9pt ability | 1 of 4 |
| 20 | 6 | `conduit-6-2` | perk | 1 of (Crafting ∪ Lore ∪ Supernatural) |
| 21 | 6 | `conduit-6-3` | level-6 domain ability | 1 of 2 |
| 22 | 7 | `conduit-7-3` | skill | 1 of any list |
| 23 | 7 | `conduit-7-4` | level-7 domain feature | 1 of 2 — **1 of 3 if Love is one of the domains** |
| 24 | 8 | `conduit-8-1` | perk | 1 of all 6 lists |
| 25 | 8 | `conduit-8-2` | level-7 domain feature (the other one) | 1 of 2 (or 3) |
| 26 | 8 | `conduit-8-3` | 11pt ability | 1 of 4 |
| 27 | 9 | `conduit-9-3` | level-9 domain ability | 1 of 2 |
| 28 | 10 | `conduit-10-2b` | characteristic +1 | 1 of 4 (Might/Agility/Reason/Presence) |
| 29 | 10 | `conduit-10-5` | perk | 1 of (Crafting ∪ Lore ∪ Supernatural) |
| 30 | 10 | `conduit-10-6` | skill | 1 of any list |

**Totals at level 10:** 28 static class choice rows + 2 dynamically-created
nested domain skill choices = **30 controls**; **33 individual picks** (three
rows pick 2 each: `conduit-1-1`, `conduit-1-2`, `conduit-1-10`). Of those, **2
are `selectAt: 'respite'`** and must be re-openable from the runtime, not just
the builder. **9 controls (+2 nested) depend on the domain pick.**

**Choices the source does NOT model** (prose-only; the player will expect a
control): the level-6 corruption-vs-holy immunity pick, the level-9 ally pick,
and the level-10 "up to three prayers" expansion. See §8.

---

## UI surface

The class tab (`components/pages/heroes/hero-edit/class-section/class-section.tsx`)
renders: a left column with the full class panel, and a right "Choices" column of
per-level `Expander`s (auto-expanded when incomplete, check-marked when
`every(isChosen)`). Only features where `FeatureLogic.isChoice(f)` render a
control; everything else is display-only.

Ordered control list for the Conduit:

| Order | Control | Kind | Notes |
|---|---|---|---|
| 1 | Level | number spinner (1–10) + "Advance to level N" button | XP-gated |
| 2 | Characteristics | **two-stage**: 1-of-4 array buttons, then 1-of-N assigned-spread rows | Primary characteristic panel is skipped (single option) |
| — | *(subclass panel)* | **not rendered** | `subclassCount === 0` |
| 3 | `conduit-1-1` Interpersonal / Lore Skills | **multi-select-2**, searchable | 2 skill lists merged |
| 4 | `conduit-1-2` Domain | **multi-select-2** with `maxCount: 2`, each selection expanding to a detail drawer | The Conduit's identity control — give it subclass-grade prominence |
| 5 | `conduit-1-4` 1st-Level Domain Feature | **single-select**, disabled with "Choose a domain to enable this feature" until #4 is answered | Options derived, not static |
| 5a | domain level-1 skill | **single-select** (searchable) | **Appears only after #5**; nested inside the chosen `Multiple` |
| 6 | `conduit-1-7` Triggered Action | **single-select** (2 cards, each an ability preview) | |
| 7 | `conduit-1-8` Prayer | **single-select** (5 cards) | mark as *re-chosen at respite* |
| 8 | `conduit-1-9` Conduit Ward | **single-select** (4 cards) | mark as *re-chosen at respite* |
| 9 | `conduit-1-10` Signature Ability | **searchable list, pick 2** (drawer + ability preview) | already-held abilities excluded |
| 10 | `conduit-1-11` 3pt Ability | searchable list, pick 1 | |
| 11 | `conduit-1-12` 5pt Ability | searchable list, pick 1 | |
| 12 | `conduit-2-2` Perk | searchable list, pick 1 | list-filtered |
| 13 | `conduit-2-3` 2nd-Level Domain Feature | single-select (derived) | |
| 13a | domain level-1 skill (2nd domain) | single-select | appears after #13 |
| 14 | `conduit-2-4` 2nd-Level Domain Ability | single-select (derived) | |
| 15 | `conduit-3-2` 7pt Ability | searchable list, pick 1 | |
| 16 | `conduit-4-1b` Characteristic Increase | single-select (4) | paired with the un-chosen Intuition +1 shown as text |
| 17 | `conduit-4-2` Perk | searchable list, pick 1 | all lists |
| 18 | `conduit-4-3` Skill | searchable list, pick 1 | any list |
| 19 | `conduit-4-4` 4th-Level Domain Feature | single-select (derived) | |
| 20 | `conduit-5-1` 5th-Level Domain Feature | single-select (derived) | |
| 21 | `conduit-5-2` 9pt Ability | searchable list, pick 1 | |
| 22 | `conduit-6-2` Perk | searchable list, pick 1 | |
| 23 | `conduit-6-3` 6th-Level Domain Ability | single-select (derived) | |
| 24 | `conduit-7-3` Skill | searchable list, pick 1 | |
| 25 | `conduit-7-4` 7th-Level Domain Feature | single-select (derived) | may be 3 options |
| 26 | `conduit-8-1` Perk | searchable list, pick 1 | |
| 27 | `conduit-8-2` 8th-Level Domain Feature | single-select (derived) | |
| 28 | `conduit-8-3` 11pt Ability | searchable list, pick 1 | |
| 29 | `conduit-9-3` 9th-Level Domain Ability | single-select (derived) | |
| 30 | `conduit-10-2b` Characteristic Increase | single-select (4) | |
| 31 | `conduit-10-5` Perk | searchable list, pick 1 | |
| 32 | `conduit-10-6` Skill | searchable list, pick 1 | |

Display-only panels the class tab must still render (no control): Stamina /
Recoveries bonuses, the **Piety** resource block with its gain rows, the
**Prayer** `Package` block (which renders the *selected domains'* prayer effects
inline), `conduit-1-5` / `conduit-1-6` ability cards, all `Text` features
(2-1, 3-1, 6-1, 9-1, 10-1, 10-4), `conduit-9-2` Ordained, the five level-7
characteristic bumps, and the level-10 **Divine Power** epic resource.

**Controls we should add that the source lacks** (all flagged in §8): a
corruption/holy immunity toggle at level 6, an ally picker at level 9, and a
prayer multi-select (up to 3) at level 10.

---

## Convex data model notes

### Definition (seeded, shared, versioned by source)

```ts
classes: {
  sourceId, classId: 'class-conduit', name: 'Conduit',
  type: 'standard', subclassName: '', subclassCount: 0, subclasses: [],
  primaryCharacteristicsOptions: [['Intuition']],
  featuresByLevel: FeatureDef[][],   // 53 features across levels 1-10
  abilities: AbilityDef[]            // 28
}

domains: {                            // separate definition table
  sourceId, domainId: 'domain-life', name: 'Life',
  featuresByLevel: FeatureDef[][],   // 10 entries; 3/5/8/10 empty for all 12
  resourceGains: [{ resource: 'Piety', tag: '', value: '2',
                    frequency: 'Per Encounter', trigger }],
  defaultFeatures: FeatureDef[]      // exactly one PackageContent, tag 'conduit-prayer'
}
```

Domains are **not** nested under the class. They are a first-class option pool
referenced by id, shared with the Censor. Forge Steel's decision to deep-copy
the whole `Domain` into the hero (and then to *rewrite its strings*) is the
single thing we most need to not replicate.

### Selection (per hero, sparse)

```ts
heroes: {
  …,
  classId: 'class-conduit',
  primaryCharacteristics: ['Intuition'],       // derived, but store it: it is
                                              // an input to the array validator
  characteristicArray: [{ characteristic, value } × 5],
  selections: {
    'conduit-1-1':    { skills: ['…','…'] },
    'conduit-1-2':    { domainIds: ['domain-life','domain-war'] },
    'conduit-1-4':    { featureId: 'domain-life-1' },
    'domain-life-1-2':{ skills: ['…'] },        // nested, created by conduit-1-4
    'conduit-1-7':    { featureId: 'conduit-1-7a' },
    'conduit-1-8':    { featureId: 'conduit-1-8e' },   // respite-mutable
    'conduit-1-9':    { featureId: 'conduit-1-9a' },   // respite-mutable
    'conduit-1-10':   { abilityIds: ['conduit-ability-1','conduit-ability-4'] },
    …
  }
}
```

Six specific requirements the Conduit imposes on that map:

1. **Keys must be namespaced, not raw feature ids.** `conduit-10-2b`'s options
   are `shadow-10-1b-1…4`, ids owned by another class. A key of
   `${sourceId}:${featureId}` (or `${classId}:${featureId}`) is the minimum;
   raw `featureId` keys will collide the moment a hero's selection payload is
   compared across classes or a title reuses an id.
2. **Nested feature keys need a path convention.** `domain-life-1-2` is reached
   as `conduit-1-4 → selected(domain-life-1) → Multiple.features[1]`. Store it
   either as a flat key that is *only valid while its parent selection holds*,
   or as a path key (`conduit-1-4/domain-life-1/domain-life-1-2`). Either way
   the resolver must **garbage-collect orphaned nested selections** when the
   parent domain-feature pick changes.
3. **The domain edge is a topological constraint, not just an ordering
   preference.** Resolve `conduit-1-2` first, then every `DomainFeature`. Changing
   `conduit-1-2` invalidates up to 9 downstream selections plus 2 nested ones.
   The resolver should return those as *invalidated*, not silently drop them —
   the builder needs to show the player what it just broke.
4. **`selectAt: 'respite'` selections are runtime-writable.** `conduit-1-8` and
   `conduit-1-9` are re-chosen between encounters. They cannot live behind a
   builder-only write path, and their history matters at the table. Either put
   them in a separate `respiteSelections` sub-document with the same key space,
   or tag the payload with its `selectAt` so the runtime is authorised to write
   only those keys.
5. **The option pool for `DomainFeature` is hero-wide.** The resolver must fold
   *all* `Domain`-typed features on the hero (class **and** titles — the Godsworn
   title carries one), not just the class's. Do not shortcut this to
   `hero.selections['conduit-1-2']`.
6. **Store selections as ids, never as copied objects.** Forge Steel stores
   whole `Domain` and `Feature` objects in `selected`, which is why it needs a
   795-line `HeroUpdateLogic` to re-hydrate a hero against updated content. Ids
   + a pure resolver gets us content updates for free.

### Derived (never stored)

Piety gains are a fold over: the `HeroicResource.gains` (`tag: 'start'`), every
`HeroicResourceGain` feature (`tag: 'domain'` at L4, `tag: 'start 2'` at L7),
and **each selected domain's `resourceGains` filtered by `resource === 'Piety'`**,
minus any gain whose `tag` appears in some gain's `replacesTags`
(`hero-logic.ts:1302`). Our resolver needs the same replaces-tag pass, and needs
domain gains keyed by resource **name**, or by an explicit resource id if we fix
the name-matching (recommended — see §8).

---

## Anomalies & open questions

**A1 — Foreign feature ids at level 10 (`shadow-10-1b-1` … `-4`).**
`conduit-10-2b`'s four characteristic options carry Shadow-class ids, colliding
verbatim with `data/classes/shadow/shadow.ts:363`. A global feature-id-keyed
selection map will alias the Conduit's and Shadow's level-10 characteristic
picks. Our ids must be regenerated, not imported.

**A2 — `conduit-7-2` is missing `replacesTags: ['start']`.**
Every other class's level-7 `tag: 'start 2'` start-of-turn gain declares
`replacesTags: ['start']` (verified in Tactician, Shadow, Elementalist, Talent,
Summoner, Censor). The Conduit's does not. Because `getHeroicResources` filters
gains by `replacedTags`, a level-7+ Conduit shows **both** start-of-turn piety
gains (`1d3` and `1d3 + 1`) as separately clickable. Almost certainly a
transcription bug; must be resolved against the pin before we model the Piety
economy.

**A3 — The "take the other domain's feature" rows are not enforced.**
`conduit-2-3` (level-1 pool), `conduit-5-1` and `conduit-8-2` (level-4 and
level-7 pools) all describe taking the feature from the domain whose feature you
*didn't* take. `ConfigDomainFeature` applies **no exclusion filter** — the same
option can be picked twice. (The randomiser at `hero-logic.ts:1662` *does*
exclude already-held ids, so the two paths disagree.) Our builder should enforce
the exclusion; the exclusion rule itself needs canon confirmation.

**A4 — Prose-only choices with no control.** Three places where the player owes
a decision that the data model doesn't represent:
- `conduit-6-1` *Burgeoning Saint* — "corruption immunity 10 **or** holy
  immunity 10 (your choice)" is inside a `Text` description. Should be a
  `Choice` of two `DamageModifier` features.
- `conduit-9-1` *Faith's Sword* — pick a hero ally at each respite. `Text` only;
  no `selectAt: 'respite'` row, no target slot.
- `conduit-10-1` *Avatar* — raises the Prayer feature to "up to three prayers at
  once" and lets prayers **and** the ward be re-chosen at respite. `conduit-1-8`'s
  `count` stays `1`. **A level-10 feature mutating an earlier feature's `count`
  is exactly the case a sparse map by feature id handles badly** — the count must
  come from the resolver (a function of hero level), not from the definition row.

**A5 — `conduit-9-2a` PotencyResistance has `characteristics: []`.**
Empty array with `value: 1` (default). Either the resistance applies to all
characteristics and the empty array is the encoding for "all", or it is an
omission. `FeaturePotencyResistanceData` gives no guidance. Unresolved from the
source — verify against the pin.

**A6 — Domain resource gains all share `tag: ''`.**
All 12 domains use the empty tag. In `hero-resources-modal.tsx`, taking a gain
marks used every gain with a matching tag — so a Conduit with two domains
consumes **both** domains' once-per-encounter piety gains by claiming either
one. Our model must give each domain gain a distinct tag (or key gains by
`domainId`).

**A7 — Domain resource gains are matched to the resource by *name*.**
`getHeroicResources` filters domain gains with `g.resource === f.name`, i.e. the
literal string `'Piety'`. Rename the resource in the definition and every domain
gain silently detaches. Use an id.

**A8 — Love's level 7 has two sibling features, breaking the 1-of-2 uniformity.**
`domain-love-7-1` and `domain-love-7-2` are two top-level features at the same
level; every other (domain, level) pair has exactly one. So `conduit-7-4` /
`conduit-8-2` present 3 options for a Love-domain Conduit and 2 otherwise, and a
Love Conduit can end up with *both* of Love's level-7 features and none of the
other domain's. Whether that's intended is a canon question.

**A9 — `Package` / `PackageContent` binds by bare string tag.**
`conduit-1-3b` has `tag: 'conduit-prayer'`; all 12 domains' `defaultFeatures`
carry the same tag. There is no referential integrity: a typo in a homebrew
domain silently drops its prayer effect from the sheet. If we keep the tag
mechanism, it needs validation at seed time.

**A10 — Child ids of the level-1 Prayer options are mismatched to their
parents.** `conduit-1-8c` (Prayer of Soldier's Skill) has children
`conduit-1-8da/db/dc`, while `conduit-1-8d` (Prayer of Speed) has children
`conduit-1-8ca/cb`. Cosmetic in Forge Steel (ids are only read for React keys
here) but poisonous for a path-keyed selection map or for debugging.

**A11 — `switchFeatureCharacteristic` mutates definition text.**
Domain features and default features are string-rewritten on selection and on
every hero migration (Intuition → the `FeatureDomain.characteristic`). For the
Conduit this is a no-op, but it means the domain objects stored on a Censor hero
are *not* byte-identical to the definition, and it means domain prose carries
"If you are a Conduit … / If you are a Censor …" branches inside a single string.
We need structured per-class variants instead. Flagged for the domains spec.

**A12 — Id-sequence gaps and duplicated names.**
`conduit-1-3b` exists with no `conduit-1-3` or `conduit-1-3a`. `conduit-4-1`
(Blessed Domain) sits alongside `conduit-4-1a` / `conduit-4-1b`, which are
unrelated characteristic features. Two different features are both named
**"Prayer"** (`conduit-1-3b` the `Package`, `conduit-1-8` the respite `Choice`),
and level 1 also contains the ability *Warrior's Prayer* in the class pool.
Display disambiguation is on us.

**A13 — The Conduit has no `Kit` feature.**
Absent in source. `conduit-1-8c` (Prayer of Soldier's Skill) grants light
weapon/armor proficiency and its prose says it can't be taken if you have a kit —
but nothing in the class grants or offers a kit, and no validation exists. Where
a Conduit could acquire a kit is unresolved from this file.

**A14 — `FeatureDomain.levels` is a pruning filter we may not need.**
The Conduit's value is the full `[1..10]`, so it does nothing here; the Censor
uses `[1,4,7]`. If we model "which domain levels this class can draw from" as a
property of the *class's `DomainFeature` rows* (which already carry `level`)
rather than as a destructive filter on the stored domain copy, the field
disappears entirely. Recommended.

**A15 — Level 3, 5, 8, 10 have no domain rows, and levels 3/5/8/10 of every
domain are empty.** Consistent, but it means our seed validation should assert
the correspondence rather than assume `featuresByLevel` is dense.
