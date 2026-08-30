> **Provenance — read before implementing.**
> Structure in this file is mapped from **Forge Steel**
> (github.com/andyaiken/forgesteel, GPL-3.0), commit `01672c1`, read 2026-08-29.
> Forge Steel is an independent third-party transcription of Draw Steel and is
> **not** our canon source. Every name, number, count and option list below is
> **UNVERIFIED** and must be confirmed against the pinned SteelCompendium
> corpus (DEC-0008) before it is implemented or shown to a user.
> This file is a **structural map for UI and data-model design**, not a rules source.

# Elementalist — structural map

Source files (read-only):
`.reference/forgesteel/src/data/classes/elementalist/elementalist.ts` (1523 lines),
`earth.ts`, `fire.ts`, `green.ts`, `void.ts`.

**FeaturePackage / FeaturePackageContent: absent.** No `createPackage`,
`createPackageContent`, `createTaggedFeature`, `createTaggedFeatureChoice`, or
`createAbilitySectionPackage` call appears anywhere in the Elementalist data
(class or subclasses). The tag-based aggregation mechanism is **not used by this
class**. The class *does* use a different tag mechanism — `HeroicResourceGain`
`tag` / `replacesTags` — which is a distinct system (see
[Anomalies](#anomalies--open-questions) §A6).

---

## Identity

| Field | Value in source | Notes |
|---|---|---|
| `id` | `class-elementalist` | |
| `name` | `Elementalist` | |
| `description` | present (prose) | `text: VERIFY-AGAINST-PIN` |
| `type` | `'standard'` | not `'master'` |
| `subclassName` | `Elemental Specialization` | the label the builder shows for the subclass control |
| `subclassCount` | `1` | pick exactly 1 of 4 |
| `primaryCharacteristicsOptions` | `[ [ Reason ] ]` | a single option containing a single characteristic — a **degenerate choice** (see §A1) |
| `primaryCharacteristics` | `[]` | empty in the definition; populated on the hero copy |
| `featuresByLevel` | levels 1–10, **42** top-level features | see [Level progression](#level-progression) |
| `abilities` | **40** | see [Abilities](#abilities) |
| `subclasses` | `[ earth, fire, green, voidSubclass ]` | 4 |
| `level` | `1` | definition-side default; per-hero state in our model |
| `characteristics` | `[]` | definition-side default; per-hero state in our model |

Derived stats granted at level 1 (not choices):

| Feature id | FeatureType | Field | value | valuePerLevel | valuePerEchelon |
|---|---|---|---|---|---|
| `elementalist-stamina` | `Bonus` | `Stamina` | 18 | 6 | 0 |
| `elementalist-recoveries` | `Bonus` | `Recoveries` | 8 | 0 | 0 |

(`createBonus` defaults not overridden here: `valueFromController: null`,
`valueCharacteristics: []`, `valueCharacteristicMultiplier: 1`.)

Heroic resource:

| Feature id | FeatureType | name | resource `type` | `canBeNegative` | `thresholds` | gains |
|---|---|---|---|---|---|---|
| `elementalist-resource` | `HeroicResource` | Essence | `heroic` (default) | `false` (default) | `[]` (always empty — Elementalist has no `HeroicResourceThreshold` features) | 2 (below) |
| `elementalist-10-1` | `HeroicResource` | Breath | `epic` | `false` | `[]` | 1 (below) |

`elementalist-resource` gains (inline `ResourceGain[]`, not `HeroicResourceGain` features):

| tag | trigger | value | frequency | used |
|---|---|---|---|---|
| `start` | `Start of your turn` | `'2'` | `OncePerRound` | false |
| `take-damage` | (damage-taken trigger) `text: VERIFY-AGAINST-PIN` | `'1'` | `OncePerRound` | false |

`elementalist-10-1` (Breath, epic) gains:

| tag | trigger | value | frequency | used |
|---|---|---|---|---|
| `respite` | `Finish a respite` | `'XP gained'` (a **string expression**, not a number) | `AtWill` | false |

---

## Level progression

Columns: `Choice?` = does the player decide anything. `count` / `selectAt` are the
resolved values *after* factory defaults. `Option source` = where the option list
comes from. `Selection shape` = what a sparse per-hero selection map would store.

Nested rows (indented `↳`) are option features inside a choice — they are
**definition data**, not separate choice points, unless marked.

### Level 1 — 13 top-level features

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 1 | `elementalist-stamina` | Stamina *(name defaulted from `field`)* | `Bonus` | no | — | — | — | none |
| 1 | `elementalist-recoveries` | Recoveries *(name defaulted from `field`)* | `Bonus` | no | — | — | — | none |
| 1 | `elementalist-resource` | Essence | `HeroicResource` | no | — | — | — | none (runtime `value` only) |
| 1 | `elementalist-1-1` | Skill *(name defaulted)* | `SkillChoice` | **yes** | 1 | `build` | `options: []`, `listOptions: []` → **defaulted to all 5 lists** (Crafting, Exploration, Interpersonal, Intrigue, Lore) | `string[]` — **pre-seeded `['Magic']`** (see §A2) |
| 1 | `elementalist-1-2` | Crafting / Lore Skills *(name defaulted)* | `SkillChoice` | **yes** | **3** | `build` | `listOptions: [Crafting, Lore]` | `string[]` len ≤ 3 |
| 1 | `elementalist-1-4` | Hurl Element | `Ability` | no | — | — | — | none |
| 1 | `elementalist-1-5` | Persistent Magic | `Text` | no | — | — | — | none — `text: VERIFY-AGAINST-PIN` (this is the rule that drives every "Persist" field on the ability list; see §A5) |
| 1 | `elementalist-1-6` | Practical Magic | `Ability` | no | — | — | — | none (the ability's *three modal effects* are prose inside one text section — **not** modelled as options; see §A9) |
| 1 | `elementalist-1-7` | Enchantment | `Choice` | **yes** | 1 | **`respite`** | 5 inline option features | `Feature[]` len 1 → store option id |
| 1 | ↳ `elementalist-1-7a` | Enchantment of Battle | `Multiple` | — | — | — | — | contains 3 sub-features |
| 1 | ↳↳ `elementalist-1-7aa` | Stamina *(defaulted)* | `Bonus` | no | — | — | field `Stamina`, `value 0`, `valuePerEchelon 3` | none |
| 1 | ↳↳ `elementalist-1-7ab` | Ability damage modifier *(defaulted)* | `AbilityDamage` | no | — | — | keywords `[Weapon]`, `value 1`, `damageType` defaulted to `Damage` | none |
| 1 | ↳↳ `elementalist-1-7ac` | Proficiency *(defaulted)* | `Proficiency` | no | — | — | weapons `[Light]`, armor `[Light]` | none |
| 1 | ↳ `elementalist-1-7b` | Enchantment of Celerity | `Multiple` | — | — | — | — | contains 2 sub-features |
| 1 | ↳↳ `elementalist-1-7ba` | Speed *(defaulted)* | `Bonus` | no | — | — | field `Speed`, `value 1` | none |
| 1 | ↳↳ `elementalist-1-7bb` | Disengage *(defaulted)* | `Bonus` | no | — | — | field `Disengage`, `value 1` | none |
| 1 | ↳ `elementalist-1-7c` | Enchantment of Destruction | `AbilityDamage` | no | — | — | keywords `[Magic]`, `value 1` | none |
| 1 | ↳ `elementalist-1-7d` | Enchantment of Distance | `AbilityDistance` | no | — | — | keywords `[Magic, Ranged]`, `value 2` | none |
| 1 | ↳ `elementalist-1-7e` | Enchantment of Permanence | `Multiple` | — | — | — | — | contains 2 sub-features; **`description` absent** → `createMultiple` defaults the name from sub-feature names, but an explicit `name` is given, so only the description is empty (see §A3) |
| 1 | ↳↳ `elementalist-1-7e-1` | Stamina *(defaulted)* | `Bonus` | no | — | — | field `Stamina`, `valuePerEchelon 6` | none |
| 1 | ↳↳ `elementalist-1-7e-2` | Stability *(defaulted)* | `Bonus` | no | — | — | field `Stability`, `value 1` | none |
| 1 | `elementalist-1-8` | Elementalist Ward | `Choice` | **yes** | 1 | **`respite`** | 4 inline option features | `Feature[]` len 1 → store option id |
| 1 | ↳ `elementalist-1-8a` | Ward of Delightful Consequences | `SurgeGain` | no | — | — | tag `take-damage`, trigger `You take damage`, value `'1'`, frequency `OncePerRound`, `replacesTags: []`, `condition: ''` (both defaulted) | none |
| 1 | ↳ `elementalist-1-8b` | Ward of Excellent Protection | **`Choice`** | **YES — nested** | 1 | **`build`** (defaulted) | 7 inline `DamageModifier` options | `Feature[]` len 1 — **a choice inside a choice option** (see §A4) |
| 1 | ↳↳ `elementalist-1-8ba` | Damage Modifier *(defaulted)* | `DamageModifier` | — | — | — | Acid / `Immunity` / `valueCharacteristics: [Reason]`, multiplier 1 | — |
| 1 | ↳↳ `elementalist-1-8bb` | Damage Modifier *(defaulted)* | `DamageModifier` | — | — | — | Cold / `Immunity` / `[Reason]` | — |
| 1 | ↳↳ `elementalist-1-8bc` | Damage Modifier *(defaulted)* | `DamageModifier` | — | — | — | Corruption / `Immunity` / `[Reason]` | — |
| 1 | ↳↳ `elementalist-1-8bd` | Damage Modifier *(defaulted)* | `DamageModifier` | — | — | — | Fire / `Immunity` / `[Reason]` | — |
| 1 | ↳↳ `elementalist-1-8be` | Damage Modifier *(defaulted)* | `DamageModifier` | — | — | — | Lightning / `Immunity` / `[Reason]` | — |
| 1 | ↳↳ `elementalist-1-8bf` | Damage Modifier *(defaulted)* | `DamageModifier` | — | — | — | Poison / `Immunity` / `[Reason]` | — |
| 1 | ↳↳ `elementalist-1-8bg` | Damage Modifier *(defaulted)* | `DamageModifier` | — | — | — | Sonic / `Immunity` / `[Reason]` | — |
| 1 | ↳ `elementalist-1-8c` | Ward of Nature's Affection | `Ability` | no | — | — | triggered action, `free: true` | none |
| 1 | ↳ `elementalist-1-8d` | Ward of Surprising Reactivity | `Ability` | no | — | — | triggered action, `free: true` | none |
| 1 | `elementalist-1-9` | Signature Ability *(name defaulted)* | `ClassAbility` | **yes** | **2** | build (n/a — `ClassAbility` has no `selectAt`) | `cost: 'signature'`, `minLevel: 1` (defaulted); sources `fromClassAbilities: true`, `fromSelectedSubclassAbilities: true`, all four "levels"/"unselected" flags `false` | `selectedIDs: string[]` len ≤ 2 |
| 1 | `elementalist-1-10` | 3pt Ability *(name defaulted)* | `ClassAbility` | **yes** | 1 | — | `cost: 3`, `minLevel: 1` (defaulted) | `selectedIDs: string[]` len ≤ 1 |
| 1 | `elementalist-1-11` | 5pt Ability *(name defaulted)* | `ClassAbility` | **yes** | 1 | — | `cost: 5`, `minLevel: 1` (defaulted) | `selectedIDs: string[]` len ≤ 1 |

### Level 2 — 2 features

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 2 | `elementalist-2-1` | Crafting / Lore / Supernatural Perk *(defaulted)* | `Perk` | **yes** | 1 | — (`Perk` has no `selectAt`) | `lists: [Crafting, Lore, Supernatural]` | `Perk[]` len ≤ 1 → store perk id |
| 2 | `elementalist-2-2` | 5pt Ability *(defaulted)* | `ClassAbility` | **yes** | 1 | — | `cost: 5`, **`minLevel: 2`** | `selectedIDs` len ≤ 1 |

### Level 3 — 1 feature

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 3 | `elementalist-3-1` | 7pt Ability *(defaulted)* | `ClassAbility` | **yes** | 1 | — | `cost: 7`, **`minLevel: 3`** | `selectedIDs` len ≤ 1 |

### Level 4 — 5 features

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 4 | `elementalist-4-1a` | Characteristic Increase: Reason | `CharacteristicBonus` | no | — | — | `Reason +1` | none |
| 4 | `elementalist-4-1b` | Characteristic Increase: Additional Choice | `Choice` | **yes** | 1 | `build` (defaulted) | 5 inline options | `Feature[]` len 1 |
| 4 | ↳ `elementalist-4-1ba` | Might *(defaulted)* | `CharacteristicBonus` | — | — | — | `Might +1` | — |
| 4 | ↳ `elementalist-4-1bb` | Agility *(defaulted)* | `CharacteristicBonus` | — | — | — | `Agility +1` | — |
| 4 | ↳ `elementalist-4-1bc` | Reason *(defaulted)* | `CharacteristicBonus` | — | — | — | `Reason +1` — **Reason is offered again here** (contrast level 10, §A7) | — |
| 4 | ↳ `elementalist-4-1bd` | Intuition *(defaulted)* | `CharacteristicBonus` | — | — | — | `Intuition +1` | — |
| 4 | ↳ `elementalist-4-1be` | Presence *(defaulted)* | `CharacteristicBonus` | — | — | — | `Presence +1` | — |
| 4 | `elementalist-4-2` | Font of Essence | `HeroicResourceGain` | no | — | — | tag `take-damage 2`, value `'2'`, `OncePerRound`, **`replacesTags: ['take-damage']`** | none |
| 4 | `elementalist-4-3` | Perk *(defaulted — all 6 lists ⇒ no prefix)* | `Perk` | **yes** | 1 | — | `lists:` all 6 (Interpersonal, Crafting, Lore, Supernatural, Intrigue, Exploration) | `Perk[]` len ≤ 1 |
| 4 | `elementalist-4-4` | Skill *(defaulted)* | `SkillChoice` | **yes** | 1 | `build` | `listOptions:` all 5 lists (explicit) | `string[]` len ≤ 1 |

### Level 5 — 1 feature

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 5 | `elementalist-5-1` | 9pt Ability *(defaulted)* | `ClassAbility` | **yes** | 1 | — | `cost: 9`, **`minLevel: 5`** | `selectedIDs` len ≤ 1 |

### Level 6 — 3 features

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 6 | `elementalist-6-1` | Crafting / Lore / Supernatural Perk *(defaulted)* | `Perk` | **yes** | 1 | — | `lists: [Crafting, Lore, Supernatural]` | `Perk[]` len ≤ 1 |
| 6 | `elementalist-6-2` | Wyrding | `Text` | no | — | — | — | none — `text: VERIFY-AGAINST-PIN`. The prose enumerates **six** freeform effects as a markdown bullet list; **not** modelled as a `Choice` (see §A9) |
| 6 | `elementalist-6-3` | 9pt Ability *(defaulted)* | `ClassAbility` | **yes** | 1 | — | `cost: 9`, **`minLevel: 6`** | `selectedIDs` len ≤ 1 |

### Level 7 — 7 features

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 7 | `elementalist-7-1a` | Might *(defaulted)* | `CharacteristicBonus` | no | — | — | `Might +1` | none |
| 7 | `elementalist-7-1b` | Agility *(defaulted)* | `CharacteristicBonus` | no | — | — | `Agility +1` | none |
| 7 | `elementalist-7-1c` | Reason *(defaulted)* | `CharacteristicBonus` | no | — | — | `Reason +1` | none |
| 7 | `elementalist-7-1d` | Intuition *(defaulted)* | `CharacteristicBonus` | no | — | — | `Intuition +1` | none |
| 7 | `elementalist-7-1e` | Presence *(defaulted)* | `CharacteristicBonus` | no | — | — | `Presence +1` | none |
| 7 | `elementalist-7-2` | Surging Essence | `HeroicResourceGain` | no | — | — | tag `start 2`, value `'3'`, `OncePerRound`, **`replacesTags: ['start']`** | none |
| 7 | `elementalist-7-3` | Skill *(defaulted)* | `SkillChoice` | **yes** | 1 | `build` | `listOptions:` all 5 lists (explicit) | `string[]` len ≤ 1 |

### Level 8 — 2 features

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 8 | `elementalist-8-1` | Perk *(defaulted — all 6 lists)* | `Perk` | **yes** | 1 | — | `lists:` all 6 | `Perk[]` len ≤ 1 |
| 8 | `elementalist-8-2` | 11pt Ability *(defaulted)* | `ClassAbility` | **yes** | 1 | — | `cost: 11`, **`minLevel: 8`** | `selectedIDs` len ≤ 1 |

### Level 9 — 2 features

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 9 | `elementalist-9-1` | Grand Wyrding | `Text` | no | — | — | — | none — `text: VERIFY-AGAINST-PIN`. Prose contains a **conditional 7-way damage-type pick** gated on Victories ≥ 5; **not** modelled as a `Choice` (see §A9) |
| 9 | `elementalist-9-2` | 11pt Ability *(defaulted)* | `ClassAbility` | **yes** | 1 | — | `cost: 11`, **`minLevel: 9`** | `selectedIDs` len ≤ 1 |

### Level 10 — 6 features

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 10 | `elementalist-10-1` | Breath | `HeroicResource` | no | — | — | `type: 'epic'`, gains `[{ tag: 'respite', value: 'XP gained', AtWill }]` | none (runtime `value` only) |
| 10 | `elementalist-10-2` | Characteristic Increase: Reason | `CharacteristicBonus` | no | — | — | `Reason +1` | none |
| 10 | `elementalist-10-3` | Characteristic Increase: Additional Choice | `Choice` | **yes** | 1 | `build` (defaulted) | **4** inline options | `Feature[]` len 1 |
| 10 | ↳ `elementalist-10-3-1` | Might *(defaulted)* | `CharacteristicBonus` | — | — | — | `Might +1` | — |
| 10 | ↳ `elementalist-10-3-2` | Agility *(defaulted)* | `CharacteristicBonus` | — | — | — | `Agility +1` | — |
| 10 | ↳ `elementalist-10-3-4` | Intuition *(defaulted)* | `CharacteristicBonus` | — | — | — | `Intuition +1` — **note the id skips `-3-3`** | — |
| 10 | ↳ `elementalist-10-3-5` | Presence *(defaulted)* | `CharacteristicBonus` | — | — | — | `Presence +1` | — |
| 10 | `elementalist-10-4` | Essential Being | `HeroicResourceGain` | no | — | — | tag `start 3`, value `'4'`, `OncePerRound`, **`replacesTags: ['start', 'start 2']`** | none |
| 10 | `elementalist-10-5` | Crafting / Lore / Supernatural Perk *(defaulted)* | `Perk` | **yes** | 1 | — | `lists: [Crafting, Lore, Supernatural]` | `Perk[]` len ≤ 1 |
| 10 | `elementalist-10-6` | Skill *(defaulted)* | `SkillChoice` | **yes** | 1 | `build` | `listOptions:` all 5 lists (explicit) | `string[]` len ≤ 1 |

**Top-level class feature count: 42** (13 / 2 / 1 / 5 / 1 / 3 / 7 / 2 / 2 / 6).

---

## Subclasses

`subclassName: 'Elemental Specialization'`, `subclassCount: 1`, 4 options.

**Subclass selection is not a `Feature`.** It is the boolean `SubClass.selected`
flag on each entry of `HeroClass.subclasses`. Forge Steel's hero-edit page tests
`hero.class.subclasses.filter(sc => sc.selected).length < hero.class.subclassCount`
to know whether the control is unresolved. See §A8.

All four subclasses share the same skeleton:
- `classID: ''` — **empty in every subclass definition** (see §A10).
- `abilities: []` — **empty in every subclass.** Every subclass ability is granted
  as a `FeatureType.Ability` inside `featuresByLevel`, never via the selectable
  `abilities` pool. Consequence: the class-ability picker's
  `fromSelectedSubclassAbilities: true` flag contributes **nothing** for this
  class (see §A11).
- `selected: false`.
- `featuresByLevel` keys: **1, 2, 3, 4, 5, 6, 7, 8, 10** — level 6 is present but
  `features: []`, and **level 9 is entirely absent** (see §A12).
- **Zero choice points.** No subclass contains a `Choice`, `SkillChoice`, `Perk`,
  `ClassAbility`, or any other selectable FeatureType. Subclass features are all
  grants.

### Subclass 1 — Earth (`elementalist-sub-1`)

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 1 | `elementalist-sub-1-1-1` | Earth: Acolyte of Earth | `Text` | no | — | — | — | none — `text: VERIFY-AGAINST-PIN` |
| 1 | `elementalist-sub-1-1-2` | Motivate Earth | `Ability` | no | — | — | main action, keywords `[Earth, Magic, Melee]`, distance melee (defaulted value), target `Special`, `cost` absent → **0** | none |
| 1 | `elementalist-sub-1-1-3` | Skin Like Castle Walls | `Ability` | no | — | — | **triggered action, `free` absent → `false`**; keywords `[Earth, Magic, Ranged]`, ranged 10, target `Self or one ally`; has a `Spend` field section (name defaulted to `'Spend'`, `value` defaulted to **1**) | none |
| 2 | `elementalist-sub-1-2-1` | Disciple of Earth | `Bonus` | no | — | — | field `Stamina`, `value 3`, `valuePerLevel 3` — **carries an inline source comment admitting a divergence from RAW** (see §A13) | none |
| 3 | `elementalist-sub-1-3-1` | The Earth Accepts Me | `Ability` | no | — | — | main action, `[Earth, Magic]`, distance self, target `Self`, `cost` absent → 0 | none |
| 4 | `elementalist-sub-1-4-1` | Mantle of Essence: Quaking Earth | `Text` | no | — | — | — | none — `text: VERIFY-AGAINST-PIN` |
| 5 | `elementalist-sub-1-5-1` | The Mountain Does Not Move | `Multiple` | no | — | — | 2 sub-features | none |
| 5 | ↳ `elementalist-sub-1-5-1a` | Stability *(defaulted)* | `Bonus` | no | — | — | field `Stability`, `value 1`, `valuePerLevel 1` | none |
| 5 | ↳ `elementalist-sub-1-5-1b` | The Mountain Does Not Move | `Ability` | no | — | — | **free triggered action** (`createTrigger(..., { free: true })`); distance `createSpecial('The distance of your Hurl Element ability')`; target `One ally`; `keywords` absent → `[]`; `description` absent → `''` | none |
| 6 | — | — | — | — | — | — | **`features: []`** — level entry present, empty | — |
| 7 | `elementalist-sub-1-6-1` | Mantle of Quintessence | `Text` | no | — | — | — | none — **id says `-6-` but the level is 7** (see §A14) |
| 8 | `elementalist-sub-1-7-1` | Summon Source of Earth | `Ability` | no | — | — | main action, `[Earth, Magic, Ranged]`, ranged 10, target `Special`, cost 0; **`Persist` field section, `value: 2`** | none — **id says `-7-` but the level is 8** |
| 9 | — | — | — | — | — | — | **level 9 absent from `featuresByLevel`** | — |
| 10 | `elementalist-sub-1-8-1` | One: Master of Earth | `Text` | no | — | — | — | none — **id says `-8-` but the level is 10** |

### Subclass 2 — Fire (`elementalist-sub-2`)

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 1 | `elementalist-sub-2-1-1` | Acolyte of Fire | `AbilityDamage` | no | — | — | keywords `[Fire, Magic]`, `value 1`, `damageType` defaulted to `Damage`, `description` absent → `''` | none |
| 1 | `elementalist-sub-2-1-2` | Return to Formlessness | `Ability` | no | — | — | main action, `[Fire, Magic, Melee]`, melee, target `One mundane object`, cost 0 | none |
| 1 | `elementalist-sub-2-1-3` | Explosive Assistance | `Ability` | no | — | — | **triggered action, `free: false`** (defaulted); `[Fire, Magic, Ranged]`, ranged 10, target `Self or one ally`; `Spend` section, value defaulted **1** | none |
| 2 | `elementalist-sub-2-2-1` | Disciple of Fire | `Text` | no | — | — | — | none — `text: VERIFY-AGAINST-PIN` |
| 2 | `elementalist-sub-2-2-2` | Damage Modifier *(name defaulted)* | `DamageModifier` | no | — | — | `createValuePlusPerLevel({ Fire, Immunity, value 5, perLevel 1 })` ⇒ stored `value: 6`, `valuePerLevel: 1` (**the factory pre-adds `perLevel` into `value`** — see §A15) | none |
| 3 | `elementalist-sub-2-3-1` | A Conversation with Fire | `Text` | no | — | — | — | none |
| 4 | `elementalist-sub-2-4-1` | Mantle of Essence: Burning Grounds | `Text` | no | — | — | — | none |
| 5 | `elementalist-sub-2-5-1` | Smoldering Step | `Text` | no | — | — | — | none |
| 6 | — | — | — | — | — | — | **`features: []`** | — |
| 7 | `elementalist-sub-2-6-1` | Mantle of Quintessence | `Text` | no | — | — | — | none — id/level offset |
| 8 | `elementalist-sub-2-7-1` | The Flame Primordial | `Text` | no | — | — | — | none — id/level offset |
| 9 | — | — | — | — | — | — | **absent** | — |
| 10 | `elementalist-sub-2-8-1a` | One: Master of Fire | `Text` | no | — | — | — | none — id/level offset, **and a trailing `a` suffix with no sibling `b`** (see §A14) |

### Subclass 3 — Green (`elementalist-sub-3`)

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 1 | `elementalist-sub-3-1-1` | Acolyte of the Green | `Text` | no | — | — | — | none — `text: VERIFY-AGAINST-PIN` |
| 1 | `elementalist-sub-3-1-2` | It Is the Soul Which Hears | `Text` | no | — | — | — | none |
| 1 | `elementalist-sub-3-1-3` | Breath of Dawn Remembered | `Ability` | no | — | — | **triggered action, `free: false`**; `[Green, Magic, Ranged]`, ranged 10, target `Self or one ally`; `Spend` section with **`repeatable: true`**, name defaulted `'Spend'`, value defaulted **1** — the only `repeatable` spend in the whole class | none |
| 2 | `elementalist-sub-3-2-1` | Disciple of the Green | `Text` | no | — | — | — | none — **carries a 20-row markdown table of animal forms inside `description`** (see §A16). `text: VERIFY-AGAINST-PIN` |
| 3 | `elementalist-sub-3-3-1` | Remember Growth and Sun and Rain | `Ability` | no | — | — | main action, `[Green, Magic, Melee]`, melee, target `One mundane wooden object`, cost 0 | none |
| 4 | `elementalist-sub-3-4-1` | Mantle of Essence: Flowering Bed | `Text` | no | — | — | — | none |
| 5 | `elementalist-sub-3-5-1` | Hide of Tenfold Shields | `Text` | no | — | — | — | none |
| 6 | — | — | — | — | — | — | **`features: []`** | — |
| 7 | `elementalist-sub-3-6-1` | Mantle of Quintessence | `Text` | no | — | — | — | none — id/level offset |
| 8 | `elementalist-sub-3-7-1` | Chimeric Manifestation | `Text` | no | — | — | — | none — id/level offset |
| 9 | — | — | — | — | — | — | **absent** | — |
| 10 | `elementalist-sub-3-8-1` | One: Master of Green | `Text` | no | — | — | — | none — id/level offset |

### Subclass 4 — Void (`elementalist-sub-4`, exported as `voidSubclass`)

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 1 | `elementalist-sub-4-1-1` | Acolyte of the Void | `AbilityDistance` | no | — | — | keywords `[Magic, Ranged, Void]`, `value 2`, `description` absent → `''` | none |
| 1 | `elementalist-sub-4-1-2` | A Beyonding of Vision | `Text` | no | — | — | — | none |
| 1 | `elementalist-sub-4-1-3` | Shared Void Sense | `Ability` | no | — | — | maneuver, `[Magic, Ranged, Void]`, ranged 10, target `Special`, cost 0 | none |
| 1 | `elementalist-sub-4-1-4` | Subtle Relocation | `Ability` | no | — | — | **triggered action, `free: false`**; `[Magic, Ranged, Void]`, ranged 10, target `Self or one ally`; `Spend` section, value defaulted **1** | none |
| 2 | `elementalist-sub-4-2-1` | There is No Space Between | `Ability` | no | — | — | maneuver, `[Magic, Ranged, Void]`, ranged 10, target `Special`, cost 0 | none |
| 3 | `elementalist-sub-4-3-1` | Distance is Only Memory | `Text` | no | — | — | — | none |
| 4 | `elementalist-sub-4-4-1` | Mantle of Essence: Veiling Bed | `Text` | no | — | — | — | none |
| 5 | `elementalist-sub-4-5-1` | Pierce the Veil of Substance | `Text` | no | — | — | — | none |
| 6 | — | — | — | — | — | — | **`features: []`** | — |
| 7 | `elementalist-sub-4-6-1` | Mantle of Quintessence | `Text` | no | — | — | — | none — id/level offset |
| 8 | `elementalist-sub-4-7-1` | Black Hole Star | `Text` | no | — | — | — | none — id/level offset |
| 9 | — | — | — | — | — | — | **absent** | — |
| 10 | `elementalist-sub-4-8-1` | One: Master of Void | `Text` | no | — | — | — | none — id/level offset |

**Subclass feature counts: Earth 10, Fire 11, Green 10, Void 11 → 42 total.**

---

## Abilities

`HeroClass.abilities` — 40 entries, all `FactoryLogic.createAbility`. These are
the pool the `ClassAbility` choice features draw from.

`Cost` is the `cost` field (`'signature'` or a number). `Min level` is the
ability's own `minLevel` (default `1` when absent). `Persist` is the `value` of
an `AbilitySectionSpend` section named `Persist` (`—` = no such section;
`createAbilitySectionSpend` defaults `value` to **1** when omitted).
`Distance`/`Target` are structural fields, not prose.

| # | Ability ID | Name | Cost | Min level | Action type | Keywords | Distance | Target | Persist |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `elementalist-ability-1` | Afflict a Bountiful Decay | signature | 1 | Main | Green, Rot, Magic, Ranged, Strike | Ranged 10 | One creature | — |
| 2 | `elementalist-ability-2` | Bifurcated Incineration | signature | 1 | Main | Fire, Magic, Ranged, Strike | Ranged 10 | Two creatures or objects | — |
| 3 | `elementalist-ability-3` | Grasp of Beyond | signature | 1 | Main | Magic, Melee, Strike, Void | Melee | One creature | — |
| 4 | `elementalist-ability-4` | The Green Within, The Green Without | signature | 1 | Main | Green, Magic, Ranged, Strike | Ranged 10 | One creature | — |
| 5 | `elementalist-ability-5` | A Meteoric Introduction | signature | 1 | Main | Earth, Magic, Melee, Strike | Melee | One creature or object | — |
| 6 | `elementalist-ability-6` | Ray of Agonizing Self Reflection | signature | 1 | Main | Magic, Ranged, Strike, Void | Ranged 10 | One creature or object | — |
| 7 | `elementalist-ability-7` | Unquiet Ground | signature | 1 | Main | Area, Earth, Magic, Ranged | Cube 2 within 10 | Each enemy in the area | — |
| 8 | `elementalist-ability-8` | Viscous Fire | signature | 1 | Main | Fire, Magic, Ranged, Strike | Ranged 10 | One creature or object | — |
| 9 | `elementalist-ability-9` | Behold the Mystery | 3 | 1 | Main | Area, Magic, Ranged, Void | Cube 3 within 10 | Each enemy in the area | 1 |
| 10 | `elementalist-ability-10` | The Flesh, a Crucible | 3 | 1 | Main | Fire, Magic, Ranged, Strike | Ranged 10 | One creature or object | 1 |
| 11 | `elementalist-ability-11` | Invigorating Growth | 3 | 1 | Main | Green, Magic, Ranged, Strike | Ranged 10 | One creature | — |
| 12 | `elementalist-ability-12` | Ripples in the Earth | 3 | 1 | Main | Area, Earth, Magic | Burst 2 | Each enemy in the area | — |
| 13 | `elementalist-ability-13` | Conflagration | 5 | 1 | Main | Area, Fire, Magic, Ranged | Cube 3 within 10 | Each enemy in the area | 2 |
| 14 | `elementalist-ability-14` | Instantaneous Excavation | 5 | 1 | Maneuver | Earth, Magic, Ranged | Ranged 10 | Special | 1 |
| 15 | `elementalist-ability-15` | No More than a Breeze | 5 | 1 | Maneuver | Magic, Ranged, Void | Ranged 10 | Self or one ally | 1 |
| 16 | `elementalist-ability-16` | Test of Rain | 5 | 1 | Main | Area, Green, Magic, Ranged | Cube 3 within 10 | Each enemy in the area | — |
| 17 | `elementalist-ability-17` | O Flower Aid, O Earth Defend | 5 | **2** | Maneuver | Area, Earth, Green, Magic, Ranged | Cube 3 within 10 | Special | 1 |
| 18 | `elementalist-ability-18` | Subvert the Green Within | 5 | **2** | Main | Green, Magic, Ranged, Strike, Void | Ranged 10 | One creature | — |
| 19 | `elementalist-ability-19` | Translated Through Flame | 5 | **2** | Main | Fire, Magic, Ranged, Void | Ranged 10 | Self or one ally | — |
| 20 | `elementalist-ability-20` | Volcano's Embrace | 5 | **2** | Main | Earth, Fire, Magic, Ranged, Strike | Ranged 10 | One creature | — |
| 21 | `elementalist-ability-21` | Erase | 7 | **3** | Main | Magic, Ranged, Strike, Void | Ranged 10 | Special | — |
| 22 | `elementalist-ability-22` | Maw of Earth | 7 | **3** | Main | Area, Earth, Magic, Ranged | Cube 3 within 10 | Each enemy in the area | — |
| 23 | `elementalist-ability-23` | Swarm of Spirits | 7 | **3** | Main | Area, Green, Magic | Aura 3 | Each enemy in the area | 1 |
| 24 | `elementalist-ability-24` | Wall of Fire | 7 | **3** | Maneuver | Area, Fire, Magic, Ranged | Wall 10 within 10 | Special | 1 |
| 25 | `elementalist-ability-25` | Combustion Deferred | 9 | **5** | Main | Fire, Magic, Ranged, Strike | Ranged 10 | One creature or object | — |
| 26 | `elementalist-ability-26` | Storm of Sands | 9 | **5** | Main | Area, Magic, Earth, Ranged | Cube 4 within 10 | Each enemy in the area | 1 |
| 27 | `elementalist-ability-27` | Subverted Perception of Space | 9 | **5** | Main | Void, Magic, Ranged, Strike | Ranged 10 | One creature or object | 1 |
| 28 | `elementalist-ability-28` | Web of All That's Come Before | 9 | **5** | Main | Area, Magic, Green, Ranged | Cube 4 within 10 | Each enemy in the area | 1 |
| 29 | `elementalist-ability-29` | Luminous Champion Aloft | 9 | **6** | Maneuver | Fire, Green, Magic, Ranged, Void | Cube 4 within 10 | Self or one ally | 1 |
| 30 | `elementalist-ability-30` | Magma Titan | 9 | **6** | Maneuver | Fire, Green, Magic, Ranged, Earth | Ranged 10 | Self or one ally | 2 |
| 31 | `elementalist-ability-31` | Meteor | 9 | **6** | Main | Earth, Fire, Magic, Void, Ranged | Ranged 10 | One creature or object | — |
| 32 | `elementalist-ability-32` | The Wode Remembers and Returns | 9 | **6** | Main | Area, Green, Magic, Earth, Void | Burst 4 | Special | 2 |
| 33 | `elementalist-ability-33` | Heart of the Wode | 11 | **8** | Main | Green, Magic, Ranged | Ranged 10 | Special | — |
| 34 | `elementalist-ability-34` | Muse of Fire | 11 | **8** | Main | Earth, Fire, Magic, Void, Ranged | Cube 5 within 10 | Each enemy in the area | — |
| 35 | `elementalist-ability-35` | Return to Oblivion | 11 | **8** | Main | Area, Magic, Void, Ranged | Ranged 10 | Special | — |
| 36 | `elementalist-ability-36` | World Torn Asunder | 11 | **8** | Main | Area, Magic, Earth | Burst 5 | Each enemy in the area | — |
| 37 | `elementalist-ability-37` | Earth Rejects You | 11 | **9** | Main | Area, Magic, Earth, Ranged | Cube 5 within 10 | Each enemy and object in the area | 2 |
| 38 | `elementalist-ability-38` | The Green Defends Its Servants | 11 | **9** | Maneuver | Green, Magic, Ranged | Ranged 10 | Self or one ally | 2 |
| 39 | `elementalist-ability-39` | Prism | 11 | **9** | Main | Magic, Void | Self | Self | — |
| 40 | `elementalist-ability-40` | Unquenchable Fire | 11 | **9** | Main | Fire, Magic, Strike, Ranged | Ranged 10 | One enemy or object | — |

Cost × min-level distribution (this is the pool-sizing table the picker needs):

| Cost | minLevel 1 | 2 | 3 | 5 | 6 | 8 | 9 | Total |
|---|---|---|---|---|---|---|---|---|
| signature | 8 | | | | | | | 8 |
| 3 | 4 | | | | | | | 4 |
| 5 | 4 | 4 | | | | | | 8 |
| 7 | | | 4 | | | | | 4 |
| 9 | | | | 4 | 4 | | | 8 |
| 11 | | | | | | 4 | 4 | 8 |
| **Total** | 16 | 4 | 4 | 4 | 4 | 4 | 4 | **40** |

Class-level abilities granted (not chosen), i.e. `FeatureType.Ability` in
`featuresByLevel`:

| Ability ID | Name | Source | Cost | Action type | Keywords | Distance | Target |
|---|---|---|---|---|---|---|---|
| `elementalist-1-4` | Hurl Element | class L1 | absent → **0** | Main, `freeStrike: true`, `qualifiers: ['can be used as a ranged free strike']` | Magic, Ranged, Strike | Ranged 10 | One creature or object |
| `elementalist-1-6` | Practical Magic | class L1 | absent → **0** | Maneuver | Magic, Ranged | Self | Self |
| `elementalist-1-8c` | Ward of Nature's Affection | class L1, inside `Choice` `elementalist-1-8` | absent → 0 | **Free triggered action** (`free: true`) | absent → `[]` | Self | Self |
| `elementalist-1-8d` | Ward of Surprising Reactivity | class L1, inside `Choice` `elementalist-1-8` | absent → 0 | **Free triggered action** (`free: true`) | absent → `[]` | Self | Self |

Subclass-granted abilities (all `cost` absent → 0; none is selectable):

| Ability ID | Name | Subclass / level | Action type | Keywords | Distance | Target | Spend / Persist |
|---|---|---|---|---|---|---|---|
| `elementalist-sub-1-1-2` | Motivate Earth | Earth L1 | Main | Earth, Magic, Melee | Melee | Special | — |
| `elementalist-sub-1-1-3` | Skin Like Castle Walls | Earth L1 | Triggered (`free: false`) | Earth, Magic, Ranged | Ranged 10 | Self or one ally | `Spend` (name + value defaulted → `'Spend'`, 1) |
| `elementalist-sub-1-3-1` | The Earth Accepts Me | Earth L3 | Main | Earth, Magic | Self | Self | — |
| `elementalist-sub-1-5-1b` | The Mountain Does Not Move | Earth L5 (inside `Multiple`) | **Free** triggered (`free: true`) | absent → `[]` | Special (prose distance) | One ally | — |
| `elementalist-sub-1-7-1` | Summon Source of Earth | Earth L8 | Main | Earth, Magic, Ranged | Ranged 10 | Special | `Persist`, value **2** |
| `elementalist-sub-2-1-2` | Return to Formlessness | Fire L1 | Main | Fire, Magic, Melee | Melee | One mundane object | — |
| `elementalist-sub-2-1-3` | Explosive Assistance | Fire L1 | Triggered (`free: false`) | Fire, Magic, Ranged | Ranged 10 | Self or one ally | `Spend` (defaulted, 1) |
| `elementalist-sub-3-1-3` | Breath of Dawn Remembered | Green L1 | Triggered (`free: false`) | Green, Magic, Ranged | Ranged 10 | Self or one ally | `Spend` (defaulted, 1), **`repeatable: true`** |
| `elementalist-sub-3-3-1` | Remember Growth and Sun and Rain | Green L3 | Main | Green, Magic, Melee | Melee | One mundane wooden object | — |
| `elementalist-sub-4-1-3` | Shared Void Sense | Void L1 | Maneuver | Magic, Ranged, Void | Ranged 10 | Special | — |
| `elementalist-sub-4-1-4` | Subtle Relocation | Void L1 | Triggered (`free: false`) | Magic, Ranged, Void | Ranged 10 | Self or one ally | `Spend` (defaulted, 1) |
| `elementalist-sub-4-2-1` | There is No Space Between | Void L2 | Maneuver | Magic, Ranged, Void | Ranged 10 | Special | — |

Total abilities the Elementalist can hold: 40 selectable + 4 class-granted
(2 unconditional, 2 conditional on the Ward choice) + 12 subclass-granted
(3–5 of which apply, depending on subclass) = **56 ability records** in the
definition data.

---

## Choice-point inventory

In build order. "Cardinality" = how many things the player picks. Anything marked
**respite** is re-decidable after the character exists — it is *not* build-only
state.

| # | Choice point | Feature id | FeatureType | Cardinality | When | Option list | Depends on |
|---|---|---|---|---|---|---|---|
| 1 | Elemental Specialization (subclass) | *(none — `SubClass.selected` flag)* | — | 1 of 4 | build | Earth / Fire / Green / Void | — |
| 2 | Primary characteristic | *(none — `primaryCharacteristicsOptions`)* | — | **1 of 1 → degenerate** | build | `[Reason]` only | — |
| 3 | Level-1 skill | `elementalist-1-1` | `SkillChoice` | 1 | build | **all 5 skill lists** (factory default) | — |
| 4 | Level-1 skills | `elementalist-1-2` | `SkillChoice` | **3** | build | Crafting + Lore lists | — |
| 5 | Enchantment | `elementalist-1-7` | `Choice` | 1 of 5 | **respite** | Battle / Celerity / Destruction / Distance / Permanence | — |
| 6 | Elementalist Ward | `elementalist-1-8` | `Choice` | 1 of 4 | **respite** | Delightful Consequences / Excellent Protection / Nature's Affection / Surprising Reactivity | — |
| 6a | Ward damage type | `elementalist-1-8b` | `Choice` (nested) | 1 of 7 | **build** (defaulted) | Acid / Cold / Corruption / Fire / Lightning / Poison / Sonic | **only exists if #6 = Excellent Protection** |
| 7 | Signature abilities | `elementalist-1-9` | `ClassAbility` | **2** | build | cost `signature`, `minLevel ≤ 1` → 8 options | already-known abilities excluded |
| 8 | 3pt ability | `elementalist-1-10` | `ClassAbility` | 1 | build | cost 3, `minLevel ≤ 1` → 4 options | as above |
| 9 | 5pt ability (L1) | `elementalist-1-11` | `ClassAbility` | 1 | build | cost 5, `minLevel ≤ 1` → 4 options | as above |
| 10 | Perk (L2) | `elementalist-2-1` | `Perk` | 1 | build | Crafting / Lore / Supernatural perk lists | — |
| 11 | 5pt ability (L2) | `elementalist-2-2` | `ClassAbility` | 1 | build | cost 5, `minLevel ≤ 2` → 8 options **minus #9's pick** | **#9** |
| 12 | 7pt ability | `elementalist-3-1` | `ClassAbility` | 1 | build | cost 7, `minLevel ≤ 3` → 4 options | — |
| 13 | Characteristic increase (L4) | `elementalist-4-1b` | `Choice` | 1 of **5** | build | Might / Agility / **Reason** / Intuition / Presence | — |
| 14 | Perk (L4) | `elementalist-4-3` | `Perk` | 1 | build | all 6 perk lists | — |
| 15 | Skill (L4) | `elementalist-4-4` | `SkillChoice` | 1 | build | all 5 skill lists | — |
| 16 | 9pt ability (L5) | `elementalist-5-1` | `ClassAbility` | 1 | build | cost 9, `minLevel ≤ 5` → 4 options | — |
| 17 | Perk (L6) | `elementalist-6-1` | `Perk` | 1 | build | Crafting / Lore / Supernatural | — |
| 18 | 9pt ability (L6) | `elementalist-6-3` | `ClassAbility` | 1 | build | cost 9, `minLevel ≤ 6` → 8 options **minus #16's pick** | **#16** |
| 19 | Skill (L7) | `elementalist-7-3` | `SkillChoice` | 1 | build | all 5 skill lists | — |
| 20 | Perk (L8) | `elementalist-8-1` | `Perk` | 1 | build | all 6 perk lists | — |
| 21 | 11pt ability (L8) | `elementalist-8-2` | `ClassAbility` | 1 | build | cost 11, `minLevel ≤ 8` → 4 options | — |
| 22 | 11pt ability (L9) | `elementalist-9-2` | `ClassAbility` | 1 | build | cost 11, `minLevel ≤ 9` → 8 options **minus #21's pick** | **#21** |
| 23 | Characteristic increase (L10) | `elementalist-10-3` | `Choice` | 1 of **4** | build | Might / Agility / Intuition / Presence (**no Reason**) | — |
| 24 | Perk (L10) | `elementalist-10-5` | `Perk` | 1 | build | Crafting / Lore / Supernatural | — |
| 25 | Skill (L10) | `elementalist-10-6` | `SkillChoice` | 1 | build | all 5 skill lists | — |

**Totals:** rows 1–25 above, of which **#2 is degenerate** (one option) → **24
real choice points**, plus the conditional nested **6a** = **25**.
By level: L1 = 9 (subclass, #3, #4, #5, #6, #6a, #7, #8, #9), L2 = 2, L3 = 1,
L4 = 3, L5 = 1, L6 = 2, L7 = 1, L8 = 2, L9 = 1, L10 = 3.
By timing: **23 build**, **2 respite**, **0 play**.
Discrete picks a level-10 Elementalist has made: 1 subclass + 7 skills (1 + 3 at
L1, then L4 / L7 / L10) + 1 Enchantment + 1 Ward (+1 nested damage type when the
Ward is Excellent Protection) + 10 abilities (2 signature + 8 costed) + 5 perks
+ 2 characteristic increases = **28 decisions**.

Choices this class does **not** have (all absent in source — do not add them):
Kit, Domain, DomainFeature, Language / LanguageChoice, TitleChoice, ItemChoice,
Companion, Retainer, Follower, Complication, AncestryFeatureChoice, SummonChoice,
Toggle, SwitchOptions/SwitchValue, SkillCancelChoice, Package / PackageContent,
TaggedFeature / TaggedFeatureChoice, `HeroicResourceThreshold`.
**Notably: the Elementalist has no Kit feature at all** — see §A17.

---

## UI surface

Ordered list of controls the builder renders for an Elementalist. Level gating is
"show when hero level ≥ N".

**Class step (level-independent)**

1. **Elemental Specialization** — *single-select*, 4 cards (Earth / Fire / Green
   / Void), each expandable to preview its per-level features. Not backed by a
   Feature; writes the subclass id.
2. **Primary characteristic** — *display-only*. One option (`Reason`). Render as a
   locked badge, not a picker.

**Level 1**

3. Stamina / Recoveries — *display-only* derived readout (18 + 6/level; 8).
4. Essence (heroic resource) — *display-only* readout, incl. the two gain rows.
5. **Skill** (`elementalist-1-1`) — *searchable single-select* over all 5 skill
   lists, **pre-filled with `Magic`**. Decide deliberately whether ours is a
   locked grant or an editable pre-fill (§A2).
6. **Crafting / Lore Skills** (`elementalist-1-2`) — *multi-select-3*, searchable,
   scoped to Crafting + Lore.
7. Hurl Element — *display-only* ability card (free-strike qualifier badge).
8. Persistent Magic — *display-only* rules text.
9. Practical Magic — *display-only* ability card. Its three modal effects are
   prose; if we want them pickable at play time that is **our** design addition,
   not Forge Steel's shape (§A9).
10. **Enchantment** — *single-select*, 5 options, **flagged "re-choose at
    respite"**. Options 1, 2 and 5 are `Multiple` bundles → render as one card
    listing its bundled effects.
11. **Elementalist Ward** — *single-select*, 4 options, **flagged "re-choose at
    respite"**.
    11a. **Ward damage type** — *nested sub-choice*, single-select of 7 damage
    types. Renders **only** when option 2 is selected. Note the timing mismatch
    (outer respite, inner build) — §A4.
12. **Signature Abilities** — *multi-select-2* from a searchable ability list
    (8 candidates), each row an expandable ability card.
13. **3pt Ability** — *searchable single-select* (4 candidates).
14. **5pt Ability** — *searchable single-select* (4 candidates).

**Level 2**

15. **Perk** — *searchable single-select*, Crafting / Lore / Supernatural.
16. **5pt Ability** — *searchable single-select* (8 candidates minus #14).
17. Earth only: Disciple of Earth — display-only.
    Fire only: Disciple of Fire + fire immunity — display-only.
    Green only: Disciple of the Green — display-only, **renders a 20-row table**
    (needs a real table component, not a paragraph — §A16).
    Void only: There is No Space Between — display-only ability card.

**Level 3** — 18. **7pt Ability** — *searchable single-select* (4 candidates).
Plus the subclass's L3 display-only feature.

**Level 4**

19. Characteristic Increase: Reason — *display-only*.
20. **Characteristic Increase: Additional Choice** — *single-select* of 5.
21. Font of Essence — *display-only*; must visibly **supersede** the level-1
    `take-damage` gain row in the Essence readout, not append to it (§A6).
22. **Perk** — *searchable single-select*, all 6 lists.
23. **Skill** — *searchable single-select*, all 5 lists.
24. Subclass "Mantle of Essence: …" — display-only.

**Level 5** — 25. **9pt Ability** — *searchable single-select* (4 candidates).
Plus the subclass L5 feature (Earth's is a `Multiple` → one card, two effects).

**Level 6** — 26. **Perk** (Crafting / Lore / Supernatural). 27. Wyrding —
display-only (six bulleted effects; not a control). 28. **9pt Ability**
(8 candidates minus #25). **No subclass feature at level 6** — render nothing,
not an empty section header.

**Level 7** — 29. Five simultaneous +1 characteristic increases — *display-only*,
one grouped readout ("+1 to every characteristic"), **not** five separate rows.
30. Surging Essence — display-only, supersedes the `start` gain row.
31. **Skill** — *searchable single-select*, all 5 lists.
32. Subclass Mantle of Quintessence — display-only.

**Level 8** — 33. **Perk** (all 6 lists). 34. **11pt Ability** (4 candidates).
Plus subclass L8 feature.

**Level 9** — 35. Grand Wyrding — display-only. **36. 11pt Ability**
(8 candidates minus #34). **No subclass feature at level 9.**

**Level 10** — 37. Breath (epic resource) — display-only readout.
38. Characteristic Increase: Reason — display-only.
39. **Characteristic Increase: Additional Choice** — *single-select of 4*
(no Reason). 40. Essential Being — display-only, supersedes `start` / `start 2`.
41. **Perk** (Crafting / Lore / Supernatural). 42. **Skill** (all 5 lists).
43. Subclass "One: Master of …" — display-only.

**Respite surface (separate from the builder)**

A respite screen must re-present exactly two controls for this class:
`elementalist-1-7` (Enchantment) and `elementalist-1-8` (Elementalist Ward).
Nothing else in the class is `selectAt: 'respite'`, and nothing is
`selectAt: 'play'`.

**Control-kind summary**

| Control kind | Count | Where |
|---|---|---|
| single-select (radio/card) | 5 | subclass, Enchantment, Ward, characteristic increase L4, characteristic increase L10 |
| nested sub-choice | 1 | Ward damage type |
| searchable single-select (ability) | 8 | 3pt, 5pt×2, 7pt, 9pt×2, 11pt×2 |
| searchable multi-select-N (ability) | 1 | Signature ×2 |
| searchable single-select (skill) | 4 | L1 seeded, L4, L7, L10 |
| searchable multi-select-N (skill) | 1 | L1 ×3 |
| searchable single-select (perk) | 5 | L2, L4, L6, L8, L10 |
| toggle | 0 | — |
| free text | 0 | — |
| display-only | remainder | grants, resources, subclass features |

---

## Convex data model notes

### Definition data (seeded once, shared, versioned by source)

- `classes` — one row: identity fields above. `primaryCharacteristicsOptions`
  stored as `string[][]`.
- `classFeatures` — 42 rows for the class + 42 rows for the four subclasses,
  keyed by the source `id` string (these ids are stable and human-readable; keep
  them as the external key and let Convex `_id` be internal). Each row carries
  `level`, `ownerKind: 'class' | 'subclass'`, `ownerId`, `featureType`, and a
  discriminated `data` blob mirroring the `Feature` union.
- Nested option features (`Choice.options[].feature`, `Multiple.features[]`) —
  **flatten into the same table** with `parentFeatureId` + `optionValue`
  (all `value: 1` here) rather than nesting JSON. Two nesting levels occur in
  this class: `Choice → Multiple → Bonus` and `Choice → Choice → DamageModifier`.
  A recursive-JSON blob would work but makes "which option did the hero pick"
  un-joinable.
- `abilities` — 56 rows (40 selectable + 4 class-granted + 12 subclass-granted),
  with `cost`, `minLevel`, `actionType`, `free`, `freeStrike`, `qualifiers`,
  `keywords[]`, `distance[]`, `target`, and `sections[]`.
  **`sections` is where the `Persist` spend fields live** — model an ability
  section as a tagged union `{ kind: 'text' | 'roll' | 'field' }`, with `field`
  carrying `{ name, value, repeatable, effect }`. Do not special-case "Persist";
  it is just a `field` section whose `name` is `Persist` (§A5).
- All prose (`description`, section `text`/`effect`) → `text:
  VERIFY-AGAINST-PIN` until reconciled with the pinned corpus. Do not seed
  Forge Steel prose.

### Selection state (per hero, sparse, keyed by feature id)

A sparse map is viable for this class. Proposed shape:

```
heroClassSelections: {
  heroId,
  classId: 'class-elementalist',
  subclassId: 'elementalist-sub-1' | ... ,          // NOT keyed by a feature id
  selections: {
    'elementalist-1-1':  { kind: 'skills',      value: ['Magic'] },
    'elementalist-1-2':  { kind: 'skills',      value: [s1, s2, s3] },
    'elementalist-1-7':  { kind: 'option',      value: 'elementalist-1-7c' },
    'elementalist-1-8':  { kind: 'option',      value: 'elementalist-1-8b' },
    'elementalist-1-8b': { kind: 'option',      value: 'elementalist-1-8bd' },
    'elementalist-1-9':  { kind: 'abilityIds',  value: [id, id] },
    'elementalist-2-1':  { kind: 'perk',        value: perkId },
    'elementalist-4-1b': { kind: 'option',      value: 'elementalist-4-1bc' },
    ...
  }
}
```

Every entry is `featureId → { kind, value }`; no deep copy of the class object.

### Where the definition/selection split is hard

1. **The nested Ward choice (`elementalist-1-8b`) is a child of an option, not of
   a level.** Its key is only *reachable* when `elementalist-1-8` resolves to
   `elementalist-1-8b`. A sparse map handles the storage fine, but it needs an
   explicit **orphan rule**: when the hero re-chooses their Ward at a respite,
   `elementalist-1-8b`'s entry becomes dangling. Decide: garbage-collect on
   write, or keep it so switching back restores the old damage type. Keeping it
   is friendlier and costs nothing; but the *validator* must then ignore
   unreachable keys instead of counting them as satisfied choices.
2. **Two different `selectAt` values in one nested tree.** Outer choice is
   `respite`, inner is `build`. Forge Steel's respite modal filters on the
   *top-level* feature's `selectAt` and then renders the whole option subtree —
   so the inner build-time choice is *de facto* re-decidable at respite. Our
   respite screen must decide explicitly whether it descends into `build`-timed
   children. Recommendation: **it must**, otherwise picking Excellent Protection
   at respite leaves a required sub-choice with no surface to make it in.
3. **Respite-timed choices break "build state is immutable after creation."** Two
   of this class's choice points are re-decidable for the character's whole life.
   Selection state cannot be a write-once build artifact; it needs a mutation
   path from the respite flow and (if we ever want it) an audit trail of what was
   selected during which session.
4. **`ClassAbility` option lists are cross-feature dependent.** The picker filters
   `cost === feature.cost && ability.minLevel <= feature.minLevel`, then removes
   abilities the hero *already knows from any source* and de-dupes by **name**.
   So `elementalist-2-2`'s legal set is a function of `elementalist-1-11`'s
   selection (and vice versa: freeing a pick re-widens the other's list). The
   option list is **not** a static property of the definition row — it is a query
   over (definition ∪ current selections). Do not denormalize it.
5. **`HeroicResourceGain.replacesTags` mutates an *earlier* feature's data.**
   `elementalist-4-2`, `-7-2` and `-10-4` don't add a gain row so much as
   *supersede* one. The Essence readout is a fold over all gain rows minus every
   tag named in any `replacesTags`, evaluated at the hero's current level. This
   is a feature that changes another feature's effect — it must be computed in a
   derived view, never stored.
6. **`Perk` and `SkillChoice` selections point at *other* definition tables**
   (perk list, skill list) that are not class-scoped. Selection values are
   foreign keys into a global catalogue, not into the class definition. Skills
   are stored as bare strings in Forge Steel; decide early whether ours are ids.
7. **Subclass selection is not a feature.** Storing it inside the same
   `selections` map (under a fake feature id) is tempting and wrong: it has
   different cardinality semantics (`subclassCount`), and the *whole subclass
   feature tree* is conditional on it. Give it a dedicated column.
8. **Ability `sections` are per-hero mutable at runtime, not at build.** `Persist`
   spend values, `used` flags on resource gains, and `HeroicResource.value` are
   **encounter state**, not build state. Forge Steel stores them on the same deep
   copy; we must keep them in a separate runtime table or the build record will
   churn every combat round.

---

## Anomalies & open questions

**A1 — `primaryCharacteristicsOptions` is a one-element list of a one-element
list.** `[[Reason]]`. Structurally a choice; semantically none. Our builder should
render a locked badge. Flagged because most classes in this codebase offer a real
pick here, so a generic renderer will show a pointless radio group.

**A2 — `elementalist-1-1` is a `SkillChoice` pre-seeded with `['Magic']`, with no
options constraint.** The call is `createSkillChoice({ id, selected: ['Magic'] })`
— `options` and `listOptions` are both omitted, so the factory falls through to
"no options provided → let the user choose any skill" and installs **all five
skill lists**. The result is a fully-editable single skill choice that merely
*starts* on Magic. Whether the rulebook grants Magic outright (and this is a
transcription shortcut) or genuinely offers a free skill is **unresolved from the
source — verify against the pin.** This is the single highest-risk row in the
file: if it is a grant, an editable control lets players silently build an
illegal character.

**A3 — `elementalist-1-7e` (Enchantment of Permanence) has no `description`.**
Every sibling option carries one. `createMultiple` defaults `description` to `''`,
so the option renders with a name and two bonus rows and no explanatory text.
Either a source omission or the rulebook genuinely has none — verify.

**A4 — A `Choice` nested directly inside a `Choice` option, with a *different*
`selectAt`.** `elementalist-1-8` (`selectAt: 'respite'`) → option
`elementalist-1-8b` is itself a `Choice` (`selectAt: 'build'`, defaulted) of 7
damage types. This is the one place in the class where the naive
"definition tree / flat selection map" split needs an explicit reachability rule.
See Convex notes §1–2. It is also the only choice point whose *existence* is
conditional on another choice.

**A5 — "Persist" is encoded as an `AbilitySectionSpend` whose `name` is the string
`'Persist'`, and its default `value` is 1.** 16 of the 40 selectable abilities and
1 subclass ability carry one. Twelve use the defaulted value 1 (only the
*name* is passed); five pass `value: 2` explicitly (abilities 13, 30, 32, 37, 38
— four in the selectable pool plus Earth's `Summon Source of Earth`). There is **no structured
"persistent" flag** on `Ability` — the whole Persistent Magic subsystem
(`elementalist-1-5`) is discovered by string-matching a section name. If we want
persistence to be a first-class engine concept, we must add that field ourselves;
Forge Steel's shape will not give it to us. **This is the class's defining
mechanic and its weakest structural point in the source.**

**A6 — Resource-gain tag collision between two independent systems.**
`elementalist-1-8a` (Ward of Delightful Consequences) is a **`SurgeGain`** with
`tag: 'take-damage'`. The class's Essence resource has an inline gain also tagged
`take-damage`, and `elementalist-4-2` declares `replacesTags: ['take-damage']`.
Reading `hero-logic.ts`, surge gains and heroic-resource gains are folded in
**separate functions** (`getSurgeGains` vs `getHeroicResources`), each computing
its own `replacedTags` from its own feature type — so the level-4 feature does
**not** suppress the Ward's surge gain. The behaviour is correct **by accident of
which list each fold reads**, not by namespacing. If we implement one unified
`resourceGains` table keyed by tag, we will silently break the Ward at level 4.
**Namespace the tags by resource, or keep the two folds separate deliberately.**

**A7 — The level-4 and level-10 characteristic-increase choices are
inconsistent.** L4 (`elementalist-4-1b`) offers **five** options *including
Reason*, alongside an automatic `Reason +1`. L10 (`elementalist-10-3`) offers
**four**, *excluding* Reason, alongside the same automatic `Reason +1`. One of
these is wrong. The L10 option ids also skip `-3-3` (they run `-3-1`, `-3-2`,
`-3-4`, `-3-5`), which is exactly the fingerprint of a deleted Reason option —
suggesting **L4 is the un-corrected one**. Verify against the pin; do not
replicate both shapes.

**A8 — Subclass choice is not a `Feature`.** It lives as `SubClass.selected`
booleans on the class object, checked against `HeroClass.subclassCount`. Any
generic "walk the features, collect the unresolved choices" routine will miss it
entirely. Our builder must special-case it (and so must our completeness
validator).

**A9 — Three features encode a genuine player decision as markdown prose, not as
options.** (a) `elementalist-1-6` Practical Magic — "choose one of the following
effects", three bullets, one `Text` section. (b) `elementalist-6-2` Wyrding — six
bulleted freeform effects. (c) `elementalist-9-1` Grand Wyrding — a 7-way damage
type pick gated on Victories ≥ 5. None is a `Choice`. Forge Steel is a sheet, so
prose is adequate for it; **we are building an engine, and these are play-time
decision points that will need structure.** Cross-reference CONV-0004 before
building machinery: (a) and (c) are real branch points; (b) may be pure
Director adjudication.

**A10 — `classID` is `''` in all four subclasses.** The `SubClass` model declares
`classID: string`, but every Elementalist subclass ships it empty; the parent
relationship is carried only by array membership in `HeroClass.subclasses`. Our
schema should make the FK authoritative and not rely on containment.

**A11 — `SubClass.abilities` is `[]` in all four subclasses, so
`fromSelectedSubclassAbilities: true` on every `ClassAbility` choice contributes
nothing.** Subclass abilities are granted as `FeatureType.Ability` features
inside `featuresByLevel` instead. The six-boolean `source` object on
`FeatureClassAbility` is therefore almost entirely inert for this class (only
`fromClassAbilities` matters). Do not port the six-flag shape without checking
whether any class actually uses the other five.

**A12 — Every subclass has an empty level 6 and no level 9 at all.** `level: 6,
features: []` is present in all four; a `level: 9` entry is absent in all four.
Two different encodings for "nothing here." Our seeder must tolerate both, and
our UI must not render an empty section header for level 6.

**A13 — Earth's `Disciple of Earth` carries an inline comment admitting a
deliberate divergence from the rules.** Source comment:
`// RAW is 6 stamina at 2nd level and 3 for each level after that, but the 3 per
level will get added at lvl 2 as well here`. The shipped values are
`value: 3, valuePerLevel: 3`. This is a **known Forge Steel approximation**, not
canon. Concrete proof that Forge Steel numbers cannot be trusted as source; flag
it for the pin reconciliation.

**A14 — Subclass feature ids are off-by-one against their levels from level 7
up.** In all four subclasses: level 7 → id `…-6-1`, level 8 → id `…-7-1`,
level 10 → id `…-8-1`. Fire's level-10 id additionally carries a trailing `a`
(`elementalist-sub-2-8-1a`) with no `b` sibling. The ids are stable keys and must
be preserved verbatim — but **never derive a level from an id**.

**A15 — `createValuePlusPerLevel` pre-adds `perLevel` into `value`.** Fire's
level-2 immunity is written `{ value: 5, perLevel: 1 }` and stored as
`{ value: 6, valuePerLevel: 1 }`. If we read the *stored* number as the base we
will be off by one; if we read the *call site* we will be off by one the other
way at level 1. Resolve which convention our engine uses before seeding.

**A16 — Green's level-2 `Disciple of the Green` embeds a 20-row markdown table in
a `description` string.** Columns: Animal Type / Level / Temporary Stamina /
Speed / Size / Stability Bonus / Melee Damage Bonus / Special, with a per-row
prerequisite level from 2nd to 10th. Structurally this is a **level-gated
lookup table** — arguably 20 shapeshift forms, each with its own stat deltas,
plus a level-8 rule (`Chimeric Manifestation`) that combines two of them subject
to a level-sum cap. It is by far the largest piece of hidden structure in the
class and, in our model, should be its own table with its own selection state
(which form is the hero currently in — runtime, not build). **Contents are
unverified Forge Steel transcription; `text: VERIFY-AGAINST-PIN`.**

**A17 — The Elementalist has no `Kit` feature.** No `createKitChoice` anywhere in
the class. Yet the `Enchantment of Battle` option's prose says it grants light
armor/weapon use "even though you don't have a kit" and ends with a hard
constraint ("If you have a kit, you can't take this enchantment"). That
constraint is **prose only and unenforced** — the option carries a `Proficiency`
feature and nothing that checks for a kit. If some other source (an ancestry, a
title, a treasure) can grant a kit, our validator will need a cross-entity check
Forge Steel does not have.

**A18 — Level-7's characteristic increase is five separate features, not a
choice.** `elementalist-7-1a` … `-7-1e`, one `CharacteristicBonus +1` per
characteristic, with no wrapper. A generic renderer shows five rows; the intent
is one statement. Cosmetic, but it will look broken.

**A19 — Level-1 feature ids skip `elementalist-1-3`.** The sequence runs
`-1-1`, `-1-2`, `-1-4`, `-1-5`, … Likely a removed feature. Nothing to port —
recorded so nobody "fixes" the numbering and breaks key stability. Same class of
gap as `elementalist-10-3-3` (§A7).

**A20 — `Breath`'s gain value is the string `'XP gained'`.** `ResourceGain.value`
is typed `string`, and every other gain in the class is a numeral-as-string
(`'1'`, `'2'`, `'3'`, `'4'`). This one is an English expression that must be
evaluated against session state. Our schema should not type this field as
"stringly-typed number"; it needs either an expression grammar or an explicit
`{ kind: 'xpGained' }` variant.

**A21 — Four subclass triggered abilities are non-free triggered actions.**
`Skin Like Castle Walls`, `Explosive Assistance`, `Breath of Dawn Remembered`,
`Subtle Relocation` all call `createTrigger(trigger)` with **no** `{ free: true }`
— unlike the two class Wards (`elementalist-1-8c`, `-1-8d`), which pass it
explicitly. Since `free` defaults to `false`, this may be deliberate or may be
four omissions. It is a meaningful mechanical difference (triggered action vs
free triggered action). **Verify all four against the pin.**

**A22 — `elementalist-sub-1-5-1b` has neither `keywords` nor `description`.**
Both default to empty. It is the only granted ability in the class with an empty
keyword list besides the two Wards (which are also `keywords`-less). If keywords
matter to our engine's targeting/immunity logic, three abilities will silently
match nothing.

**A23 — Terminology note (not a source defect).** `HeroOverview.background` exists
in the Forge Steel hero model; it is a **display concatenation** of ancestry /
culture / career, not a Draw Steel concept. Do not create a `background` field.
Nothing in the Elementalist data references it.
