> **Provenance — read before implementing.**
> Structure in this file is mapped from **Forge Steel**
> (github.com/andyaiken/forgesteel, GPL-3.0), commit `01672c1`, read 2026-08-29.
> Forge Steel is an independent third-party transcription of Draw Steel and is
> **not** our canon source. Every name, number, count and option list below is
> **UNVERIFIED** and must be confirmed against the pinned SteelCompendium
> corpus (DEC-0008) before it is implemented or shown to a user.
> This file is a **structural map for UI and data-model design**, not a rules source.

# Class: Censor — structural map

Source files (read-only):
`.reference/forgesteel/src/data/classes/censor/censor.ts`,
`exorcist.ts`, `oracle.ts`, `paragon.ts`.

Vocabulary resolved against `src/enums/feature-type.ts`, `src/models/feature.ts`,
`src/logic/factory-logic.ts`, `src/logic/factory-feature-logic.ts`,
`src/logic/factory-distance-logic.ts`, `src/logic/factory-ability-type-logic.ts`.

---

## Identity

| Field | Value | Notes |
|---|---|---|
| `id` | `class-censor` | |
| `name` | `Censor` | |
| `description` | prose — `text: VERIFY-AGAINST-PIN` | two paragraphs of flavour in source; not transcribed |
| `type` | `'standard'` | the `HeroClass.type` union is `'standard' \| 'master'` |
| `subclassName` | `Order` | the label the UI uses for the subclass slot |
| `subclassCount` | `1` | exactly one Order is selected |
| `primaryCharacteristicsOptions` | `[ [ Might, Presence ] ]` | **one** option array — see Anomalies #12 |
| `primaryCharacteristics` | `[]` | filled at build time from the option array |
| `featuresByLevel` | levels 1–10, 42 features total | see Level progression |
| `abilities` | 24 `Ability` records | see Abilities |
| `subclasses` | `[ exorcist, oracle, paragon ]` | ids `censor-sub-1/2/3` |
| `level` | `1` | template default; overwritten per hero |
| `characteristics` | `[]` | template default; overwritten per hero |

Derived stats granted at level 1 (as `Bonus` features, not identity fields):
Stamina `value: 21`, `valuePerLevel: 9`; Recoveries `value: 12`.
Note these are **literal** in `censor.ts` — `FactoryLogic.createClass()`'s
defaults (Stamina 18/+9, Recoveries 8, a generic Heroic Resource) do **not**
apply, because `censor` is a literal object rather than a builder call.

Heroic resource: **Wrath** (`censor-resource`, `type: 'heroic'`).
A second, epic-tier resource **Virtue** (`censor-10-5`) is added at level 10.

---

## Level progression

`Choice?` = `FeatureLogic.isChoice` would return true.
`count` / `selectAt` are the **resolved** values after builder defaults.
`—` = the FeatureType carries no such field.

### Level 1 — 12 features

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 1 | `censor-stamina` | Stamina | `Bonus` | no | — | — | — | none (static: `field: Stamina`, `value: 21`, `valuePerLevel: 9`, `valueCharacteristicMultiplier: 1`) |
| 1 | `censor-recoveries` | Recoveries | `Bonus` | no | — | — | — | none (static: `field: Recoveries`, `value: 12`) |
| 1 | `censor-resource` | Wrath | `HeroicResource` | no | — | — | — | none at build; **runtime** value + per-gain `used` flags. `type: 'heroic'`, `canBeNegative: false`, 3 gains (tags `start`, `take-damage`, `deal-damage`) |
| 1 | `censor-1-1` | Interpersonal / Lore Skills | `SkillChoice` | **yes** | `2` | `build` | `listOptions: [Interpersonal, Lore]`, `options: []` | `string[]` of 2 skill names |
| 1 | `censor-1-2` | Domain | `Domain` | **yes** | `1` | — | all `Domain` records in enabled sources (12 in core: creation, death, fate, knowledge, life, love, nature, protection, storm, sun, trickery, war) | 1 domain id. **Also carries `characteristic: Presence` and `levels: [1,4,7]`, which mutate the copied domain — Anomalies #3/#4** |
| 1 | `censor-1-4` | Judgment | `Ability` | no | — | — | — | none (grant). Maneuver; `Magic, Ranged`; `Ranged 10`; target `One enemy`; `cost: 0` (default); sections = text + `AbilitySectionPackage('censor-judgment')` |
| 1 | `censor-1-5` | Kit | `Kit` | **yes** | `1` | — | `types: ['']` (builder default) → all kits whose `Kit.type === ''`, i.e. every standard kit; excludes `type: 'Stormwight'` kits | 1 kit id |
| 1 | `censor-1-6` | My Life for Yours | `Ability` | no | — | — | — | none (grant). Triggered (`free: false`), trigger string `VERIFY-AGAINST-PIN`; `Magic, Ranged`; `Ranged 10`; target `Self or one ally`; `cost: 0`; sections = text + a `field` section (`name: 'Spend'`, `value: 1`, `repeatable: false`) |
| 1 | `censor-1-7` | 1st-Level Domain Feature | `DomainFeature` | **yes** | `1` | — | level-1 `features` of the domain(s) selected in `censor-1-2` | 1 feature id. **Degenerate: exactly one option — Anomaly #13** |
| 1 | `censor-1-8` | Signature Ability | `ClassAbility` | **yes** | `1` | — | `cost: 'signature'`, `minLevel: 1`, source `{fromClassAbilities: true, fromSelectedSubclassAbilities: true, all others false}` → the 4 signature entries in `censor.abilities` | `selectedIDs: string[]` (length 1) |
| 1 | `censor-1-9` | 3pt Ability | `ClassAbility` | **yes** | `1` | — | same source; `cost: 3` → 4 options | `selectedIDs: string[]` (length 1) |
| 1 | `censor-1-10` | 5pt Ability | `ClassAbility` | **yes** | `1` | — | same source; `cost: 5` → 4 options | `selectedIDs: string[]` (length 1) |

### Level 2 — 1 feature

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 2 | `censor-2-1` | Interpersonal / Lore / Supernatural Perk | `Perk` | **yes** | `1` | — | `lists: [Interpersonal, Lore, Supernatural]` | 1 perk id |

### Level 3 — 2 features

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 3 | `censor-3-1` | Look On My Work and Despair | `Text` | no | — | — | — | none (`text: VERIFY-AGAINST-PIN`; description embeds potency placeholders `[average]` / `[strong]`) |
| 3 | `censor-3-2` | 7pt Ability | `ClassAbility` | **yes** | `1` | — | `cost: 7`, `minLevel: 1` → the 4 Edict abilities | `selectedIDs: string[]` (length 1) |

### Level 4 — 6 features

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 4 | `censor-4-1a` | Might | `CharacteristicBonus` | no | — | — | — | none (`characteristic: Might`, `value: 1`) |
| 4 | `censor-4-1b` | Presence | `CharacteristicBonus` | no | — | — | — | none (`characteristic: Presence`, `value: 1`) |
| 4 | `censor-4-2` | Perk | `Perk` | **yes** | `1` | — | all six lists (`Crafting, Exploration, Interpersonal, Intrigue, Lore, Supernatural`) | 1 perk id |
| 4 | `censor-4-3` | Skill | `SkillChoice` | **yes** | `1` | `build` | `listOptions: [Crafting, Exploration, Interpersonal, Lore, Intrigue]` (all five) | 1 skill name |
| 4 | `censor-4-4` | Wrath Beyond Wrath | `HeroicResourceGain` | no | — | — | — | none (static: `tag: 'deal-damage 2'`, `value: '2'`, `frequency: Per Round`, `replacesTags: ['deal-damage']`) |
| 4 | `censor-4-5` | 4th-Level Domain Feature | `DomainFeature` | **yes** | `1` | — | level-4 `features` of the selected domain(s) | 1 feature id |

### Level 5 — 1 feature

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 5 | `censor-5-1` | 9pt Ability | `ClassAbility` | **yes** | `1` | — | `cost: 9` → 4 options | `selectedIDs: string[]` (length 1) |

### Level 6 — 2 features

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 6 | `censor-6-1` | Implement of Wrath | `Text` | no | — | — | — | none in the data model, **but the rules text describes a per-respite choice of a weapon** — Anomaly #25 |
| 6 | `censor-6-2` | Interpersonal / Lore / Supernatural Perk | `Perk` | **yes** | `1` | — | `lists: [Interpersonal, Lore, Supernatural]` | 1 perk id |

### Level 7 — 8 features

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 7 | `censor-7-1a` | Might | `CharacteristicBonus` | no | — | — | — | none (`value: 1`) |
| 7 | `censor-7-1b` | Agility | `CharacteristicBonus` | no | — | — | — | none (`value: 1`) |
| 7 | `censor-7-1c` | Reason | `CharacteristicBonus` | no | — | — | — | none (`value: 1`) |
| 7 | `censor-7-1d` | Intuition | `CharacteristicBonus` | no | — | — | — | none (`value: 1`) |
| 7 | `censor-7-1e` | Presence | `CharacteristicBonus` | no | — | — | — | none (`value: 1`) |
| 7 | `censor-7-2` | 7th-Level Domain Feature | `DomainFeature` | **yes** | `1` | — | level-7 `features` of the selected domain(s) | 1 feature id |
| 7 | `censor-7-3` | Focused Wrath | `HeroicResourceGain` | no | — | — | — | none (`tag: 'start 2'`, `value: '3'`, `frequency: Per Round`, `replacesTags: ['start']`) |
| 7 | `censor-7-4` | Skill | `SkillChoice` | **yes** | `1` | `build` | all five skill lists | 1 skill name |

### Level 8 — 2 features

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 8 | `censor-8-1` | Perk | `Perk` | **yes** | `1` | — | all six lists | 1 perk id |
| 8 | `censor-8-2` | 11pt Ability | `ClassAbility` | **yes** | `1` | — | `cost: 11` → 4 options | `selectedIDs: string[]` (length 1) |

### Level 9 — 1 feature

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 9 | `censor-9-1` | Improved Implement of Wrath | `Text` | no | — | — | — | none (`text: VERIFY-AGAINST-PIN`; modifies the level-6 feature — Anomaly #25) |

### Level 10 — 7 features

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 10 | `censor-10-1a` | Might | `CharacteristicBonus` | no | — | — | — | none (`value: 1`) |
| 10 | `censor-10-1b` | Presence | `CharacteristicBonus` | no | — | — | — | none (`value: 1`) |
| 10 | `censor-10-2` | Crafting / Lore / Supernatural Perk | `Perk` | **yes** | `1` | — | `lists: [Crafting, Lore, Supernatural]` | 1 perk id |
| 10 | `censor-10-3` | Skill | `SkillChoice` | **yes** | `1` | `build` | all five skill lists | 1 skill name |
| 10 | `censor-10-4` | Templar | `Text` | no | — | — | — | none in the data model; the text describes cross-class (conduit) domain-effect access and a respite ritual — Anomaly #6 |
| 10 | `censor-10-5` | Virtue | `HeroicResource` | no | — | — | — | none at build; runtime value. `type: 'epic'`, one gain (`tag: 'respite'`, `value: 'XP gained'` — a **non-numeric string**, `frequency: At Will`). `details: ''`; spend rules live in `description` — Anomaly #26 |
| 10 | `censor-10-6` | Wrath of the Gods | `HeroicResourceGain` | no | — | — | — | none (`tag: 'start 3'`, `value: '4'`, `frequency: Per Round`, `replacesTags: ['start', 'start 2']`) |

**Class feature totals:** L1 = 12, L2 = 1, L3 = 2, L4 = 6, L5 = 1, L6 = 2,
L7 = 8, L8 = 2, L9 = 1, L10 = 7 → **42 class features**.

---

## Subclasses

`subclassName: 'Order'`, `subclassCount: 1` — the hero picks exactly one of three.
All three share the identical level shape: features at **1, 2, 5, 6, 8, 9**;
levels **3, 4, 7, 10 are present but empty** (`features: []`).
All three carry `abilities: []` and `classID: ''` (Anomaly #11).
All three level-1 blocks are (a) a pre-selected `SkillChoice` and
(b) a `PackageContent` tagged `censor-judgment` that injects an "Order Benefit"
paragraph into the Judgment ability's rendered text (Anomaly #7).

### Exorcist (`censor-sub-1`)

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 1 | `censor-sub-1-1-1` | Skill | `SkillChoice` | **yes** | `1` | `build` | `listOptions` defaults to all five lists; `selected: ['Read Person']` pre-filled | 1 skill name, defaulted — **editable, not a grant** (Anomaly #10) |
| 1 | `censor-sub-1-1-2` | Judgment Order Benefit | `PackageContent` | no | — | — | — | none (`tag: 'censor-judgment'`; `text: VERIFY-AGAINST-PIN`) |
| 2 | `censor-sub-1-2-1` | Saint's Vigilance | `Text` | no | — | — | — | none (`text: VERIFY-AGAINST-PIN`) |
| 2 | `censor-sub-1-2-2` | A Sense for Truth | `Multiple` | no | — | — | — | container of 2 nested features (below) |
| 2 | └ `censor-sub-1-2-2a` | A Sense for Truth | `Text` | no | — | — | — | none |
| 2 | └ `censor-sub-1-2-2b` | A Sense for Truth | `RollModifier` | no | — | — | — | none (`modifier: Edge`, `rollType: Test` (default), `skills: ['Read Person']`, `condition: 'When detecting lies or hidden motives'`) |
| 2 | `censor-sub-1-2-3` | 2nd-Level Exorcist Ability | `Choice` | **yes** | `1` | `build` | 2 inline `Ability` options, each `value: 1` | 1 option feature id |
| 2 | └ `censor-sub-1-2-3a` | It Is Justice You Fear | `Ability` (option) | — | — | — | — | 5pt; Main Action |
| 2 | └ `censor-sub-1-2-3b` | Revelator | `Ability` (option) | — | — | — | — | 5pt; Maneuver |
| 3 | — | — | — | — | — | — | — | **absent in source** (`features: []`) |
| 4 | — | — | — | — | — | — | — | **absent in source** (`features: []`) |
| 5 | `censor-sub-1-3-1` | Evil Revealed | `Text` | no | — | — | — | none (`text: VERIFY-AGAINST-PIN`). **Note the id says `-3-` but the level is 5** — Anomaly #2 |
| 6 | `censor-sub-1-4-1` | 6th-Level Exorcist Ability | `Choice` | **yes** | `1` | `build` | 2 inline `Ability` options, each `value: 1` | 1 option feature id |
| 6 | └ `censor-sub-1-4-1a` | Begone | `Ability` (option) | — | — | — | — | 9pt; Main Action |
| 6 | └ `censor-sub-1-4-1b` | Pain of Your Own Making | `Ability` (option) | — | — | — | — | 9pt; Triggered, `free: true` |
| 7 | — | — | — | — | — | — | — | **absent in source** (`features: []`) |
| 8 | `censor-sub-1-5-1` | Demonologist | `Text` | no | — | — | — | none (`text: VERIFY-AGAINST-PIN`) |
| 9 | `censor-sub-1-6-1` | 9th-Level Exorcist Ability | `Choice` | **yes** | `1` | `build` | 2 inline `Ability` options, each `value: 1` | 1 option feature id |
| 9 | └ `censor-sub-1-6-1a` | Banish | `Ability` (option) | — | — | — | — | 11pt; Main Action |
| 9 | └ `censor-sub-1-6-1b` | Terror Manifest | `Ability` (option) | — | — | — | — | 11pt; Main Action |
| 10 | — | — | — | — | — | — | — | **absent in source** (`features: []`) |

### Oracle (`censor-sub-2`)

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 1 | `censor-sub-2-1-1` | Skill | `SkillChoice` | **yes** | `1` | `build` | all five lists; `selected: ['Magic']` pre-filled | 1 skill name, defaulted |
| 1 | `censor-sub-2-1-2` | Judgment Order Benefit | `PackageContent` | no | — | — | — | none (`tag: 'censor-judgment'`) |
| 2 | `censor-sub-2-2-1` | It Was Foretold | `Text` | no | — | — | — | none (`text: VERIFY-AGAINST-PIN`) |
| 2 | `censor-sub-2-2-2` | Judge of Character | `Text` | no | — | — | — | none. **Rules text substitutes Presence for Intuition on tests — not modelled as a `RollModifier` or `SwitchValue`** (Anomaly #24) |
| 2 | `censor-sub-2-2-3` | 2nd-Level Oracle Ability | `Choice` | **yes** | `1` | `build` | 2 inline `Ability` options, each `value: 1` | 1 option feature id |
| 2 | └ `censor-sub-2-2-3a` | Prescient Grace | `Ability` (option) | — | — | — | — | 5pt; Triggered, `free: false` |
| 2 | └ `censor-sub-2-2-3b` | With My Blessing | `Ability` (option) | — | — | — | — | 5pt; Main Action |
| 3 | — | — | — | — | — | — | — | **absent in source** (`features: []`) |
| 4 | — | — | — | — | — | — | — | **absent in source** (`features: []`) |
| 5 | `censor-sub-2-3-1` | Prophecy | `Text` | no | — | — | — | none. **Describes a persistent per-hero ordered list of recorded 2d10 rolls — needs a runtime state slot** (Anomaly #23) |
| 6 | `censor-sub-2-4-1` | 6th-Level Oracle Ability | `Choice` | **yes** | `1` | `build` | 2 inline `Ability` options, each `value: 1` | 1 option feature id |
| 6 | └ `censor-sub-2-4-1a` | Burden of Evil | `Ability` (option) | — | — | — | — | 9pt; Maneuver |
| 6 | └ `censor-sub-2-4-1b` | Edict of Peace | `Ability` (option) | — | — | — | — | 9pt; Maneuver |
| 7 | — | — | — | — | — | — | — | **absent in source** (`features: []`) |
| 8 | `censor-sub-2-5-1` | Their Past Revealed | `Text` | no | — | — | — | none (`text: VERIFY-AGAINST-PIN`) |
| 9 | `censor-sub-2-6-1` | 9th-Level Oracle Ability | `Choice` | **yes** | `1` | `build` | 2 inline `Ability` options, each `value: 1` | 1 option feature id |
| 9 | └ `censor-sub-2-6-1a` | Blessing and a Curse | `Ability` (option) | — | — | — | — | 11pt; Triggered, `free: false` |
| 9 | └ `censor-sub-2-6-1b` | Fulfill Your Destiny | `Ability` (option) | — | — | — | — | 11pt; Triggered, `free: false` |
| 10 | — | — | — | — | — | — | — | **absent in source** (`features: []`) |

### Paragon (`censor-sub-3`)

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 1 | `censor-sub-3-1-1` | Skill | `SkillChoice` | **yes** | `1` | `build` | all five lists; `selected: ['Lead']` pre-filled | 1 skill name, defaulted |
| 1 | `censor-sub-3-1-2` | Judgment Order Benefit | `PackageContent` | no | — | — | — | none (`tag: 'censor-judgment'`) |
| 2 | `censor-sub-3-2-1` | Lead by Example | `Text` | no | — | — | — | none (`text: VERIFY-AGAINST-PIN`) |
| 2 | `censor-sub-3-2-2` | Stalwart Example | `RollModifier` | no | — | — | — | none (`modifier: Edge`, `rollType: Test` (default), `skills: ['Intimidate', 'Persuade']`, `condition: ''`). Not wrapped in a `Multiple`, unlike Exorcist's equivalent |
| 2 | `censor-sub-3-2-3` | 2nd-Level Paragon Ability | `Choice` | **yes** | `1` | `build` | 2 inline `Ability` options, each `value: 1` | 1 option feature id |
| 2 | └ `censor-sub-3-2-3a` | Blessing of the Faithful | `Ability` (option) | — | — | — | — | 5pt; Maneuver |
| 2 | └ `censor-sub-3-2-3b` | Sentenced | `Ability` (option) | — | — | — | — | 5pt; Main Action |
| 3 | — | — | — | — | — | — | — | **absent in source** (`features: []`) |
| 4 | — | — | — | — | — | — | — | **absent in source** (`features: []`) |
| 5 | `censor-sub-3-3-1` | Stand Fast! | `Text` | no | — | — | — | none (`text: VERIFY-AGAINST-PIN`) |
| 6 | `censor-sub-3-4-1` | 6th-Level Paragon Ability | `Choice` | **yes** | `1` | `build` | 2 inline `Ability` options, each `value: 1` | 1 option feature id |
| 6 | └ `censor-sub-3-4-1a` | Congregation | `Ability` (option) | — | — | — | — | 9pt; Main Action |
| 6 | └ `censor-sub-3-4-1b` | Intercede | `Ability` (option) | — | — | — | — | 9pt; Triggered, `free: true` |
| 7 | — | — | — | — | — | — | — | **absent in source** (`features: []`) |
| 8 | `censor-sub-3-5-1` | Vow | `Text` | no | — | — | — | none (`text: VERIFY-AGAINST-PIN`) |
| 9 | `censor-sub-3-6-1` | 9th-Level Paragon Ability | `Choice` | **yes** | `1` | `build` | 2 inline `Ability` options, each `value: 1` | 1 option feature id |
| 9 | └ `censor-sub-3-6-1a` | Apostate | `Ability` (option) | — | — | — | — | 11pt; Main Action |
| 9 | └ `censor-sub-3-6-1b` | Edict of Unyielding Resolve | `Ability` (option) | — | — | — | — | 11pt; Maneuver |
| 10 | — | — | — | — | — | — | — | **absent in source** (`features: []`) |

**Subclass feature totals (each):** 9 top-level features (Exorcist has 2 extra
nested inside the level-2 `Multiple`), plus 6 inline ability options per subclass.

---

## Abilities

### `censor.abilities[]` — the class-ability pool (24)

These are the option pool for every `ClassAbility` choice. `minLevel` is `1`
on all 24 (builder default); the picker filters on `cost` and `minLevel <= data.minLevel`.
Every entry has `repeatable: false` (default). No prose transcribed —
`sections` are marked by *kind* only.

| ID | Name | Cost | Action type | Keywords | Distance | Target | Sections |
|---|---|---|---|---|---|---|---|
| `censor-ability-1` | Back, Blasphemer! | `signature` | Main Action | Area, Magic, Melee, Weapon | Cube 2 within 1 | Each enemy in the area | 1 `roll` (Presence) |
| `censor-ability-2` | Every Step ... Death! | `signature` | Main Action | Magic, Ranged, Strike | Ranged 10 | One creature | 1 `roll` (Presence) + 1 `text` |
| `censor-ability-3` | Halt, Miscreant! | `signature` | Main Action | Melee, Strike, Weapon | Melee 1 | One creature or object | 1 `roll` (Might) |
| `censor-ability-4` | Your Allies Cannot Save You! | `signature` | Main Action | Melee, Strike, Weapon | Melee 1 | One creature or object | 1 `roll` (Might) + 1 `text` |
| `censor-ability-5` | Behold, a Shield of Faith! | `3` | Main Action | Melee, Strike, Weapon | Melee 1 | One creature or object | 1 `roll` (Might) + 1 `text` |
| `censor-ability-6` | Driving Assault | `3` | Main Action | Melee, Strike, Weapon | Melee 1 | One creature or object | 1 `roll` (Might) + 1 `text` |
| `censor-ability-7` | The Gods Punish and Defend | `3` | Main Action | Magic, Melee, Strike, Weapon | Melee 1 | One creature or object | 1 `roll` (Might) + 1 `text` |
| `censor-ability-8` | Repent! | `3` | Main Action | Magic, Ranged, Strike | Ranged 10 | One creature | 1 `roll` (Presence) |
| `censor-ability-9` | Arrest | `5` | Main Action | Magic, Melee, Strike, Weapon | Melee 1 | One creature | 1 `roll` (Might) + 1 `text` |
| `censor-ability-10` | Behold the Face of Justice! | `5` | Main Action | Magic, Melee, Ranged, Strike, Weapon | Melee 1 **and** Ranged 5 | One creature | 1 `roll` (Might) + 1 `text` |
| `censor-ability-11` | Censored | `5` | Main Action | Melee, Strike, Weapon | Melee 1 | One creature | 1 `roll` (Might) + 1 `text` |
| `censor-ability-12` | Purifying Fire | `5` | Main Action | Magic, Melee, Ranged, Strike, Weapon | Melee 1 **and** Ranged 5 | One creature | 1 `roll` (Might) + 1 `text` |
| `censor-ability-13` | Edict of Disruptive Isolation | `7` | Maneuver | Area, Magic | Aura 2 | Each enemy in the area | 1 `text` (no roll) |
| `censor-ability-14` | Edict of Perfect Order | `7` | Maneuver | Area, Magic | Aura 2 | Each enemy in the area | 1 `text` (no roll) |
| `censor-ability-15` | Edict of Purifying Pacifism | `7` | Maneuver | Area, Magic | Aura 2 | Each enemy in the area | 1 `text` (no roll) |
| `censor-ability-16` | Edict of Stillness | `7` | Maneuver | Area, Magic | Aura 2 | Each enemy in the area | 1 `text` (no roll) |
| `censor-ability-17` | Gods Grant Thee Strength | `9` | Main Action | Ranged | Ranged 10 | Self or one ally | 1 `text` (no roll) |
| `censor-ability-18` | Orison of Victory | `9` | Maneuver | Area | Burst 1 | Self and each ally in the area | 1 `roll` (Presence) + 1 `text` |
| `censor-ability-19` | Righteous Judgment | `9` | Main Action | Melee, Strike, Weapon | Melee 1 | One creature | 1 `roll` (Might) + 1 `text` |
| `censor-ability-20` | Shield of the Righteous | `9` | Main Action | Melee, Strike, Weapon | Melee 1 | One creature | 1 `roll` (Might) |
| `censor-ability-21` | Excommunication | `11` | Main Action | Melee, Strike, Weapon | Melee 1 | One creature | 1 `roll` (Might) + 1 `text` |
| `censor-ability-22` | Hand of the Gods | `11` | Main Action | Ranged, Strike, Weapon | Ranged 10 | One creature | 1 `roll` (Might) + 1 `text` |
| `censor-ability-23` | Pillar of Holy Fire | `11` | Main Action | Melee, Strike, Weapon | Melee 1 | One creature | 1 `roll` (Might) + 1 `text` |
| `censor-ability-24` | Your Allies Turn on You! | `11` | Main Action | Ranged, Strike, Weapon | Ranged 10 | One creature | 1 `roll` (Presence) + 1 `text` |

**Cost distribution:** `signature` ×4, `3` ×4, `5` ×4, `7` ×4, `9` ×4, `11` ×4.
Exactly matches the six `ClassAbility` choices (L1 signature, L1 3pt, L1 5pt,
L3 7pt, L5 9pt, L8 11pt) — each is a 1-of-4 pick.

### Abilities granted as features (not in the pool)

| ID | Name | Cost | Action type | Keywords | Distance | Target | Sections |
|---|---|---|---|---|---|---|---|
| `censor-1-4` | Judgment | `0` (default) | Maneuver | Magic, Ranged | Ranged 10 | One enemy | 1 `text` + 1 `package` (`tag: 'censor-judgment'`) |
| `censor-1-6` | My Life for Yours | `0` (default) | Triggered (`free: false`) | Magic, Ranged | Ranged 10 | Self or one ally | 1 `text` + 1 `field` (`name: 'Spend'`, `value: 1`) |

### Subclass ability options (inline in `Choice` features; **not** in any `abilities[]`)

| ID | Subclass | Name | Cost | Action type | Keywords | Distance | Target | Sections |
|---|---|---|---|---|---|---|---|---|
| `censor-sub-1-2-3a` | Exorcist | It Is Justice You Fear | `5` | Main Action | Magic, Ranged, Strike | Ranged 10 | One creature | 1 `roll` (Might) + 1 `text` |
| `censor-sub-1-2-3b` | Exorcist | Revelator | `5` | Maneuver | Area, Magic | Burst 3 | Each enemy in the area | 1 `text` |
| `censor-sub-1-4-1a` | Exorcist | Begone | `9` | Main Action | Area, Magic | Burst 3 | Each enemy in the area | 1 `roll` (Presence) |
| `censor-sub-1-4-1b` | Exorcist | Pain of Your Own Making | `9` | Triggered (`free: true`) | Magic, Ranged | Ranged 10 | Self or one ally | 1 `text` |
| `censor-sub-1-6-1a` | Exorcist | Banish | `11` | Main Action | Melee, Strike, Weapon | Melee 1 | One creature | 1 `roll` (Might) + 1 `text` |
| `censor-sub-1-6-1b` | Exorcist | Terror Manifest | `11` | Main Action | Magic, Ranged, Strike | Ranged 10 | One creature | 1 `roll` (Presence) + 1 `text` |
| `censor-sub-2-2-3a` | Oracle | Prescient Grace | `5` | Triggered (`free: false`) | Magic, Ranged | Ranged 10 | Self or one ally | 1 `text` |
| `censor-sub-2-2-3b` | Oracle | With My Blessing | `5` | Main Action | Magic, Ranged | Ranged 10 | Self or one ally | 1 `text` |
| `censor-sub-2-4-1a` | Oracle | Burden of Evil | `9` | Maneuver | Magic, Ranged, Strike | Ranged 10 | Three enemies | 1 `roll` (Presence) |
| `censor-sub-2-4-1b` | Oracle | Edict of Peace | `9` | Maneuver | Area, Magic | Aura 3 | Each enemy in the area | 1 `text` |
| `censor-sub-2-6-1a` | Oracle | Blessing and a Curse | `11` | Triggered (`free: false`) | Magic, Ranged | Ranged 10 | One creature | 1 `text` |
| `censor-sub-2-6-1b` | Oracle | Fulfill Your Destiny | `11` | Triggered (`free: false`) | Magic, Ranged | Ranged 10 | One ally | 1 `text` |
| `censor-sub-3-2-3a` | Paragon | Blessing of the Faithful | `5` | Maneuver | Area, Magic | Aura 3 | Self and each ally in the area | 1 `text` |
| `censor-sub-3-2-3b` | Paragon | Sentenced | `5` | Main Action | Magic, Melee, Strike, Weapon | Melee 1 | One creature | 1 `roll` (Presence) + 1 `text` |
| `censor-sub-3-4-1a` | Paragon | Congregation | `9` | Main Action | Melee, Strike, Weapon | Melee 1 | One creature | 1 `roll` (Might) + 1 `text` |
| `censor-sub-3-4-1b` | Paragon | Intercede | `9` | Triggered (`free: true`) | Magic, Ranged | Ranged 10 | One ally | 1 `text` |
| `censor-sub-3-6-1a` | Paragon | Apostate | `11` | Main Action | Melee, Strike, Weapon | Melee 1 | One creature | 1 `roll` (Might) + 1 `text` |
| `censor-sub-3-6-1b` | Paragon | Edict of Unyielding Resolve | `11` | Maneuver | Magic, Ranged | **Aura 2** | Self and each ally in the area | 1 `text` |

Because `createClassAbilityChoice` defaults `fromSelectedSubclassLevels: false`,
these 18 subclass abilities are **not** offered by any `ClassAbility` picker.
They are reachable only through their own `Choice` feature.

---

## Choice-point inventory

Build order for a level-10 Censor. Cardinality is `pick N of M`.
"nested" = the option becomes available only after an earlier selection.

| # | Level | Choice point | Feature ID | Kind | Cardinality | Notes |
|---|---|---|---|---|---|---|
| 0 | — | Primary characteristics | `primaryCharacteristicsOptions` | derived | 1 of 1 | `[[Might, Presence]]` — no real decision; resolve automatically |
| 1 | 1 | Order (subclass) | `subclasses` / `subclassCount` | single-select | 1 of 3 | Exorcist / Oracle / Paragon |
| 2 | 1 | Interpersonal / Lore skills | `censor-1-1` | multi-select | 2 of (Interpersonal ∪ Lore) | |
| 3 | 1 | Domain | `censor-1-2` | single-select | 1 of 12 | gates #5, #12, #17 |
| 4 | 1 | Kit | `censor-1-5` | single-select | 1 of all `type: ''` kits | |
| 5 | 1 | 1st-level domain feature | `censor-1-7` | single-select (**nested** on #3) | 1 of 1 | degenerate; each core domain has exactly one L1 feature |
| 5a | 1 | *Skill inside the chosen domain feature* | e.g. `domain-sun-1-2` | single-select (**nested** on #5) | 1 of a single list | domain L1 features are `Multiple` wrappers that often contain a `SkillChoice` |
| 6 | 1 | Signature ability | `censor-1-8` | searchable list | 1 of 4 | |
| 7 | 1 | 3pt ability | `censor-1-9` | searchable list | 1 of 4 | |
| 8 | 1 | 5pt ability | `censor-1-10` | searchable list | 1 of 4 | |
| 9 | 1 | Order skill (defaulted) | `censor-sub-{1,2,3}-1-1` | single-select (**nested** on #1) | 1 of all skills | pre-filled Read Person / Magic / Lead; still editable |
| 10 | 2 | Perk | `censor-2-1` | searchable list | 1 of (Interpersonal ∪ Lore ∪ Supernatural) | |
| 11 | 3 | 7pt ability | `censor-3-2` | searchable list | 1 of 4 | |
| 12 | 4 | 4th-level domain feature | `censor-4-5` | single-select (**nested** on #3) | 1 of 1 | |
| 13 | 4 | Perk | `censor-4-2` | searchable list | 1 of all six lists | |
| 14 | 4 | Skill | `censor-4-3` | searchable list | 1 of all five lists | |
| 15 | 2 | 2nd-level Order ability | `censor-sub-{1,2,3}-2-3` | single-select (**nested** on #1) | 1 of 2 | |
| 16 | 5 | 9pt ability | `censor-5-1` | searchable list | 1 of 4 | |
| 17 | 6 | Perk | `censor-6-2` | searchable list | 1 of (Interpersonal ∪ Lore ∪ Supernatural) | |
| 18 | 6 | 6th-level Order ability | `censor-sub-{1,2,3}-4-1` | single-select (**nested** on #1) | 1 of 2 | |
| 19 | 7 | 7th-level domain feature | `censor-7-2` | single-select (**nested** on #3) | 1 of 1 | |
| 20 | 7 | Skill | `censor-7-4` | searchable list | 1 of all five lists | |
| 21 | 8 | Perk | `censor-8-1` | searchable list | 1 of all six lists | |
| 22 | 8 | 11pt ability | `censor-8-2` | searchable list | 1 of 4 | |
| 23 | 9 | 9th-level Order ability | `censor-sub-{1,2,3}-6-1` | single-select (**nested** on #1) | 1 of 2 | |
| 24 | 10 | Perk | `censor-10-2` | searchable list | 1 of (Crafting ∪ Lore ∪ Supernatural) | |
| 25 | 10 | Skill | `censor-10-3` | searchable list | 1 of all five lists | |

**Choice-point count:** 25 numbered decisions (26 rows including the degenerate
`#0` and the nested `#5a`). Of those, **9 are gated on an earlier selection**
(5, 5a, 9, 12, 15, 18, 19, 23 — plus `#0`→`primaryCharacteristics` resolution).

Choice points implied by rules text but **not modelled as features** — these have
no `Feature` entry and would need a bespoke affordance if we surface them:
- **Implement of Wrath** (`censor-6-1`) / **Improved** (`censor-9-1`) — a
  per-respite choice of one hero's weapon.
- **Templar** (`censor-10-4`) — a per-Judgment choice of a conduit domain effect.
- **Virtue** (`censor-10-5`) — spending 3 Virtue to open access to an additional
  domain until the next respite.
- **Judgment** (`censor-1-4`) — a per-trigger choice among four wrath-spend
  free triggered actions.
- **Prophecy** (Oracle, `censor-sub-2-3-1`) — recording and consuming an ordered
  list of 2d10 results.

None of these carries `selectAt: 'respite'` or `'play'` in the source; every
`selectAt` on this class is the default `'build'`.

---

## UI surface

Ordered list of controls the builder renders for a Censor, with control kind.

1. **Class identity header** — read-only. Name, `subclassName: 'Order'`,
   Stamina formula (21 + 9/level), Recoveries 12, heroic resource **Wrath**.
2. **Primary characteristics** — *display only* (single option array). Render
   as a resolved chip pair "Might, Presence"; do **not** render a picker.
3. **Order** — **single-select** (3 cards: Exorcist / Oracle / Paragon).
   Selecting one must re-render controls 10, 14, 17, 20 and the Judgment
   ability body (package injection).
4. **Interpersonal / Lore Skills** — **multi-select-2**, searchable, union of
   the Interpersonal and Lore skill lists, already-known skills filtered out.
5. **Domain** — **single-select**, searchable list of 12. Selecting one gates
   controls 6, 12, 16.
6. **1st-Level Domain Feature** — **single-select**, options from the chosen
   domain's level-1 features. Renders one option; still show as a confirmable
   selection, not an auto-grant, to keep multi-domain heroes (via Virtue) working.
   6a. **Nested sub-choice** — if the selected domain feature is a `Multiple`
   containing a `SkillChoice`, render its skill picker inline beneath it.
7. **Kit** — **single-select**, searchable list of standard kits.
8. **Signature Ability** — **searchable list**, 4 options, ability cards with
   power-roll tiers.
9. **3pt Ability** — **searchable list**, 4 options.
10. **5pt Ability** — **searchable list**, 4 options.
11. **Order Skill** — **single-select**, pre-populated with the Order's default
    (Read Person / Magic / Lead). Show the default filled in, with a "change"
    affordance; do not present it as an empty required field.
12. **Judgment (read-only ability card)** — must render the Order Benefit
    paragraph inline, sourced from the selected Order's `PackageContent`.
13. **My Life for Yours (read-only ability card)** — triggered action with a
    Spend field.
14. **Level 2:** Perk — **searchable list** (Interpersonal / Lore / Supernatural).
15. **Level 2 (Order):** 2nd-Level Order Ability — **single-select of 2**,
    rendered as two comparable ability cards.
16. **Level 3:** 7pt Ability — **searchable list**, 4 options.
17. **Level 4:** two characteristic +1 chips (read-only), Perk (**searchable
    list**, all six lists), Skill (**searchable list**, all five lists),
    Wrath Beyond Wrath (read-only resource-gain row), 4th-Level Domain Feature
    (**single-select**, nested on control 5).
18. **Level 5:** 9pt Ability — **searchable list**, 4 options.
19. **Level 6:** Implement of Wrath (read-only text), Perk (**searchable list**).
20. **Level 6 (Order):** 6th-Level Order Ability — **single-select of 2**.
21. **Level 7:** five characteristic +1 chips (read-only, group them as one row),
    7th-Level Domain Feature (**single-select**, nested), Focused Wrath
    (read-only resource-gain row, **supersedes** the level-1 `start` gain),
    Skill (**searchable list**).
22. **Level 8:** Perk (**searchable list**), 11pt Ability (**searchable list**).
23. **Level 8 (Order):** read-only text feature.
24. **Level 9:** Improved Implement of Wrath (read-only text).
25. **Level 9 (Order):** 9th-Level Order Ability — **single-select of 2**.
26. **Level 10:** two characteristic +1 chips (read-only), Perk (**searchable
    list**, Crafting / Lore / Supernatural), Skill (**searchable list**),
    Templar (read-only text), **Virtue** (read-only epic-resource card),
    Wrath of the Gods (read-only resource-gain row, supersedes `start` and
    `start 2`).

Control kinds **not** needed by this class: toggle, free text, item picker,
language picker, title picker, companion/retainer picker, multi-select-N above 2.

A **resource summary panel** is required and is level-dependent: it must show
the *effective* Wrath gain list after `replacesTags` supersession, not the raw
union. At level 10 it must show two resources (Wrath + Virtue).

---

## Convex data model notes

> **Superseded keying note (2026-08-30):** the FS-id keys sketched in this
> section are illustrative only and are **superseded** by `00-foundation.md`
> §6b + ruling R-L: every persistent key joins on the pin's `scc` identity
> (with a discriminator where one pin record carries several choice points).
> FS ids are labels, never keys.


### Definition data (static, seeded, versioned by source)

- `classes` — one document: `class-censor`. Fields: `name`, `type`,
  `subclassName`, `subclassCount`, `primaryCharacteristicsOptions`,
  plus the derived-stat formula rows.
- `classFeatures` — 42 documents keyed by `featureId` (`censor-*`), each with
  `level`, `featureType`, and a `data` blob shaped by the discriminant. The
  25 `Choice?`-true rows carry the option *query*, not the options.
- `subclasses` — 3 documents (`censor-sub-1/2/3`) with `classId: 'class-censor'`.
  (The source's `classID: ''` is a bug for our purposes; set it.)
- `subclassFeatures` — 27 documents (9 per subclass) + 2 nested under the
  Exorcist `Multiple` + 18 inline ability options.
- `abilities` — 24 class-pool abilities + 2 feature-granted + 18 subclass
  options = **44 ability documents**, each with `cost`, `minLevel`,
  `actionType`, `keywords[]`, `distance[]`, `target`, `sections[]`.
  Give every ability a stable id; the source's inline nesting is not a
  reason to denormalize them into the feature blob.
- `abilityPackages` — the `censor-judgment` tag and its 3 `PackageContent`
  contributors. Model as a join: `(packageTag, contributorFeatureId)`.

### Selection state (per-hero, sparse, keyed by feature id)

```
heroSelections: {
  heroId, featureId,            // e.g. 'censor-1-9'
  kind,                         // mirrors FeatureType, for validation
  value                         // discriminated by kind:
                                //   SkillChoice     -> string[]  (skill names)
                                //   Perk            -> string[]  (perk ids)
                                //   Kit             -> string[]  (kit ids)
                                //   Domain          -> string[]  (domain ids)
                                //   DomainFeature   -> string[]  (feature ids)
                                //   ClassAbility    -> string[]  (ability ids)
                                //   Choice          -> string[]  (option feature ids)
}
```

Plus a small number of non-feature-keyed fields on the hero:
`selectedSubclassIds: string[]` (length 1 here) and `primaryCharacteristics`.

This is a clean sparse map for **every** Censor choice point. Nothing on this
class needs the inline deep-copy Forge Steel performs. Concretely: 25 rows
maximum at level 10 (26 with the nested domain skill).

### Where the split is hard — read this before designing the seeder

1. **The domain characteristic swap.** `censor-1-2` sets
   `characteristic: Presence`. On selection, Forge Steel deep-copies the chosen
   `Domain` and runs `FeatureLogic.switchFeatureCharacteristic(..., Intuition,
   Presence)`, which **string-replaces "Intuition" → "Presence" in every copied
   feature description and ability section**, and overwrites each power roll's
   `characteristic` array. The domain definition a Censor sees is *not* the
   seeded domain definition. Our options: (a) store the swap as an overlay on
   the selection (`{ domainId, characteristicOverride: 'Presence' }`) and apply
   it at read time, or (b) seed a Censor-specific domain variant. (a) preserves
   the definition/selection split; (b) does not. Do **not** persist the
   string-replaced prose — that is generated rule text.
2. **The domain level filter.** `censor-1-2` sets `levels: [1, 4, 7]`. Forge
   Steel *drops* the other seven levels from the copied domain. Same overlay
   treatment: store `visibleDomainLevels: [1,4,7]` alongside the selection and
   filter at read time.
3. **Option lists that depend on an earlier selection.** `censor-1-7`,
   `censor-4-5`, `censor-7-2` (`DomainFeature`) resolve their options from
   `censor-1-2`'s selection. All three subclass `Choice` features depend on the
   Order pick. Changing an upstream selection must invalidate downstream ones —
   a sparse map does not express that; you need an explicit dependency edge in
   the definition data (`dependsOn: 'censor-1-2'`).
4. **Nested choice inside a selection.** A selected `DomainFeature` may itself
   be a `Multiple` containing a `SkillChoice` (e.g. `domain-sun-1-2`). The
   nested choice's feature id is stable, so it fits the map — but it only
   *exists* once the parent is chosen. Selection rows must therefore be allowed
   to reference feature ids that are not in the class's own feature set.
5. **Features that mutate other features.** `HeroicResourceGain.replacesTags`
   is a supersession edge: `censor-4-4` replaces `deal-damage`, `censor-7-3`
   replaces `start`, `censor-10-6` replaces `start` and `start 2`. The effective
   gain set is a function of level, not a union. This is definition-side logic —
   resolve it in a derived read, never by mutating seeded rows.
6. **Ability text assembled from another feature.** Judgment's rendered body is
   incomplete without the selected Order's `PackageContent`. An ability document
   is therefore not independently renderable; the renderer needs the hero's
   selections. Keep the package join in definition data and resolve at read time.
7. **Pre-filled selections.** The three Order level-1 `SkillChoice` features ship
   with `selected` already populated. In a sparse map, "absent" must not mean
   "unset" for these — seed the default into the selection row at Order-pick
   time, or store the default on the definition and treat absence as
   "default applies".
8. **Runtime state that is not a selection.** Wrath value + per-gain `used`
   flags, Virtue value, Oracle's Prophecy roll list, Implement of Wrath's
   currently-attuned weapon. None of these belong in the build-time selection
   map; they need an encounter/respite-scoped state store.

---

## Anomalies & open questions

1. **`censor-1-3` does not exist.** Level 1 runs `censor-1-1`, `-1-2`, then jumps
   to `-1-4`. Either a feature was deleted upstream or the numbering is manual.
   Do not infer a missing feature — verify the level-1 feature list against the pin.
2. **Subclass feature ids encode a sequence counter, not a level.** In every
   subclass the third segment counts feature-blocks: `censor-sub-1-3-1` sits at
   **level 5**, `-4-1` at level 6, `-5-1` at level 8, `-6-1` at level 9. Any
   importer that parses the level out of the id will be wrong for four of six
   blocks per subclass.
3. **The Domain choice rewrites the domain's rule text.** `characteristic:
   Presence` triggers a blanket `replaceAll('Intuition', 'Presence')` across
   descriptions, `text`/`field` sections, and `+ I` → `+ P` inside power-roll
   tier strings, plus a hard overwrite of `roll.characteristic`. This is
   *generated rule prose*. We must not persist it; we must model the swap as
   read-time substitution against pinned text, and confirm against the pin that
   the substitution is what the rulebook actually says.
4. **The Domain choice truncates the domain.** `levels: [1, 4, 7]` causes the
   other seven levels of the selected domain to be discarded from the hero's
   copy. Combined with #3, a Censor's "Sun domain" is a materially different
   object from a Conduit's "Sun domain" in the same app.
5. **Level-1 domain-feature choice is degenerate.** Every core domain has exactly
   one feature at level 1 (a `Multiple` wrapper), one at level 4, one at level 7.
   With `count: 1` and one domain selected, all three `DomainFeature` choices are
   1-of-1. They only become real choices if the hero has multiple domains — which
   Censor can reach at level 10 via Virtue (#6). Design the control for N options,
   not for one.
6. **Two level-10 features reach outside the class with no data-model support.**
   `censor-10-4` (Templar) references *conduit* domain effects and a
   Presence-for-Intuition substitution at the effect level; `censor-10-5`
   (Virtue) grants access to an additional domain until the next respite. Neither
   is a `Domain` or `Choice` feature — both are `Text`. If we want them playable,
   we need a runtime "temporarily-accessible domains" list that the domain-feature
   resolvers read from.
7. **Judgment's text is assembled from the subclass.** `AbilitySectionPackage
   ('censor-judgment')` + one `PackageContent` per Order. The Order Benefit
   paragraph is *only* reachable through this indirection. There is no
   `FeatureType.Package` (the declaring half) anywhere in the Censor data — only
   the three `PackageContent` contributors and the ability's section reference.
   The tag is the whole contract.
8. **Heroic-resource gains supersede rather than accumulate.** Three
   `HeroicResourceGain` features with `replacesTags`. Note that the level-1
   `take-damage` gain is **never** superseded, while `start` is superseded twice
   (L7, then L10) and `deal-damage` once (L4). A naive "sum all gains" read gives
   a level-10 Censor a wrong Wrath economy.
9. **Two heroic resources at level 10.** Virtue is `type: 'epic'` with
   `frequency: 'At Will'` and `value: 'XP gained'` — a **non-numeric string** in
   a field the other gains use for a numeral. Any parser must tolerate a symbolic
   gain value. `canBeNegative` is `false` for both.
10. **Order level-1 skills are defaulted choices, not grants.** All three use
    `createSkillChoice({ selected: ['…'] })` with no `options` and no
    `listOptions`, so the builder falls back to *all five* skill lists with
    `count: 1`. The UI presents an editable picker pre-filled with Read Person /
    Magic / Lead. Whether the rulebook grants these outright or offers a choice
    is exactly the kind of thing to verify against the pin — the Forge Steel
    shape is ambiguous.
11. **`classID: ''` on all three subclasses.** Nested subclasses never need it
    (they hang off `censor.subclasses`); it only matters on the homebrew-library
    path (`library-logic.ts:443`). Set it properly in our seed data.
12. **`primaryCharacteristicsOptions` has exactly one option.** `[[Might,
    Presence]]` with `primaryCharacteristics: []`. Structurally a choice, in
    practice a grant. Render it resolved, but keep the field an array-of-arrays
    so classes that *do* offer a real choice share the shape.
13. **Characteristic bonuses are split across lettered ids.** `4-1a/4-1b`,
    `7-1a`–`7-1e`, `10-1a/10-1b` are one logical rulebook line each, exploded
    into 2 / 5 / 2 separate `CharacteristicBonus` features. Group them by the
    numeric stem for display or the level-7 block renders as five identical rows.
14. **Level 7 grants +1 to all five characteristics.** Unusual relative to the
    level-4 and level-10 grants (Might + Presence). Flagging because it is the
    kind of transcription slip that is invisible until playtested — verify.
15. **`censor-10-4` (Templar) description contains trailing tab/whitespace
    artifacts** in the source string (a stray `\t` and trailing spaces before the
    closing backtick). Cosmetic upstream bug; noted so nobody treats the
    whitespace as meaningful when diffing against the pin.
16. **Subclass levels 3, 4, 7 and 10 are empty in all three Orders.** Present as
    `{ level: n, features: [] }`, not omitted. Consistent across Exorcist,
    Oracle and Paragon — so this is a real shape, not a gap. Our seeder should
    not emit empty rows; our UI should not render empty level headers.
17. **`FactoryLogic.createSubclass()` emits an `optionalFeatures: []` field that
    the `SubClass` model does not declare.** The three Censor files do not carry
    it. Dead field; ignore.
18. **Roll modifiers key on skill names as free strings.** Exorcist's
    `censor-sub-1-2-2b` has `skills: ['Read Person']` with a free-text
    `condition`; Paragon's `censor-sub-3-2-2` has `skills: ['Intimidate',
    'Persuade']` and `condition: ''`. Both default `rollType: Test`. The
    condition is prose the engine cannot evaluate — these are Tier-3
    (player-asserted) modifiers unless we parse the condition.
19. **Exorcist wraps its roll modifier in a `Multiple`; Paragon does not.**
    Same logical shape (a named feature that is partly prose, partly a mechanic),
    two different encodings. Do not build a UI that depends on the wrapper.
20. **`censor-sub-3-6-1b` (Edict of Unyielding Resolve) has keywords
    `[Magic, Ranged]` but a distance of `Aura 2`.** Every other aura ability in
    the class uses `[Area, Magic]`. Likely an upstream keyword error — verify
    against the pin before seeding.
21. **`censor-sub-2-4-1a` (Burden of Evil) carries the `Strike` keyword with
    target `Three enemies`.** Flagged for the same reason: a multi-target strike
    is unusual enough to be worth confirming.
22. **Judgment and My Life for Yours have `cost: 0`** (builder default) despite
    both describing wrath/Recovery expenditure in their bodies. Cost-on-the-
    ability and spend-inside-the-ability are different mechanisms in this data
    model; the `field` section (`name: 'Spend'`, `value: 1`) does not name which
    resource is spent. Our schema should name the resource explicitly.
23. **Oracle's Prophecy (`censor-sub-2-3-1`) needs an ordered, persistent,
    respite-cleared list of recorded 2d10 results.** Modelled as plain `Text`.
    There is no `FeatureType` in the entire 54-variant union that expresses it.
    This is a bespoke state slot if we want it playable rather than reference-only.
24. **Oracle's Judge of Character (`censor-sub-2-2-2`) substitutes Presence for
    Intuition on tests** and is modelled as plain `Text`, even though
    `SwitchValue` / `SwitchOptions` / `RollModifier` exist in the vocabulary.
    Compare with #3, where the same substitution *is* mechanized. Inconsistent
    upstream; we should pick one mechanism.
25. **Implement of Wrath (L6) and Improved Implement of Wrath (L9) are a
    respite-cadence choice modelled as two independent `Text` features.** The
    level-9 feature textually amends the level-6 one; nothing links them in the
    data. `selectAt: 'respite'` exists in the vocabulary and is unused here.
    If we implement the respite choice, we need both the link and the cadence.
26. **Virtue's spend rules live in `description`, not `details`.**
    `createHeroicResource` offers both; `censor-10-5` passes `description` and
    leaves `details: ''`. The Wrath resource leaves both empty. No consistent
    convention — decide ours and normalize on import.
27. **FeatureTypes entirely absent from this class** (recorded so nobody assumes
    a gap): `TitleChoice`, `LanguageChoice`, `ItemChoice`, `Companion`,
    `Retainer`, `Follower`, `Proficiency`, `ConditionImmunity`, `DamageModifier`,
    `Toggle`, `SaveThreshold`, `PotencyResistance`, `Size`, `Speed`,
    `MovementMode`, `SurgeGain`, `HeroicResourceThreshold`, `Summon*`,
    `TaggedFeature*`, `SwitchOptions`, `SwitchValue`, `AbilityCost`,
    `AbilityDamage`, `AbilityDistance`, `AbilityKeyword`, `AddOn`, `Fixture`,
    `ForController`, `Malice*`, `Package` (the declaring half), `SkillCancelChoice`.
    Censor uses 13 of the 54 variants: `Bonus`, `HeroicResource`,
    `HeroicResourceGain`, `SkillChoice`, `Domain`, `DomainFeature`, `Ability`,
    `Kit`, `ClassAbility`, `Perk`, `Text`, `CharacteristicBonus`, `Choice`,
    plus `PackageContent`, `Multiple` and `RollModifier` from the subclasses (16 total).
28. **`HeroOverview.background` is not a Draw Steel concept.** It does not appear
    in Censor data at all, but noting it here per the brief: where the source
    surfaces a "background", it is a display concatenation of ancestry / culture /
    career, not a build element.
29. **Unresolved:** whether the four wrath-spend free triggered actions inside
    Judgment's body are a single choice-per-trigger (the text says one option at a
    time) or four independent abilities. The data models them as one prose blob,
    so the structure gives no answer. Needs the pin.
30. **Unresolved:** whether the level-1 `censor-1-2` domain choice is genuinely
    1 domain (builder default `count: 1`) or whether the rulebook grants more at
    higher levels. Nothing at levels 2–10 increases the domain count, and Virtue
    is the only route to a second domain. Confirm against the pin.
