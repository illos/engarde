> **Provenance — read before implementing.**
> Structure in this file is mapped from **Forge Steel**
> (github.com/andyaiken/forgesteel, GPL-3.0), commit `01672c1`, read 2026-08-29.
> Forge Steel is an independent third-party transcription of Draw Steel and is
> **not** our canon source. Every name, number, count and option list below is
> **UNVERIFIED** and must be confirmed against the pinned SteelCompendium
> corpus (DEC-0008) before it is implemented or shown to a user.
> This file is a **structural map for UI and data-model design**, not a rules source.

# Class: Null — structural map

Source files (read-only):

- `src/data/classes/null/null.ts` (1000 lines)
- `src/data/classes/null/chronokinetic.ts`
- `src/data/classes/null/cryokinetic.ts`
- `src/data/classes/null/metakinetic.ts`

Every feature `description` / ability `sections` body in the source is rulebook
prose. It is **not** transcribed here. Wherever a feature's rules text carries
mechanical weight, the row's Selection-shape or Notes column says
`text: VERIFY-AGAINST-PIN`.

---

## Identity

| Field | Value in source | Notes |
|---|---|---|
| `id` | `class-null` | stable definition key |
| `name` | `Null` | |
| `description` | prose + an attributed in-fiction quote | `text: VERIFY-AGAINST-PIN` |
| `type` | `'standard'` | (the alternative in `HeroClass` is `'master'`) |
| `subclassName` | `Tradition` | the noun the builder must use in UI labels, not "subclass" |
| `subclassCount` | `1` | pick exactly one Tradition |
| `primaryCharacteristicsOptions` | `[[Agility, Intuition]]` | **one** option array ⇒ not a player choice |
| `primaryCharacteristics` | `[]` | runtime field; populated when the class is attached to a hero |
| `featuresByLevel` | 10 entries, levels 1–10 | 46 top-level features (see below) |
| `abilities` | 28 abilities | the pool `ClassAbility` choices draw from |
| `subclasses` | `[chronokinetic, cryokinetic, metakinetic]` | ids `null-sub-1` / `-2` / `-3` |
| `level` | `1` | runtime field living on the definition object (see Anomalies) |
| `characteristics` | `[]` | runtime field living on the definition object (see Anomalies) |

Derived, not stored: because `primaryCharacteristicsOptions.length === 1`, the
builder auto-assigns Agility + Intuition as primaries
(`hero-edit-page.tsx:268`). With 2 primaries, `HeroLogic.getCharacteristicArrays(2)`
offers the arrays `[2,-1,-1]`, `[1,0,0]`, `[1,1,-1]` for the remaining three
characteristics — that array pick **is** a choice point, but it lives in the
class section generally, not in a `Feature`.

**No Kit.** Null has zero `FeatureType.Kit` features at any level. Eight other
Forge Steel classes/subclasses do (`fury/berserker`, `fury/reaver`,
`fury/stormwight`, `shadow`, `beastheart`, `troubadour`, `censor`, `tactician`).
The Null builder must not render a kit control.

---

## Level progression

One row per feature. Rows prefixed `↳` are nested inside the row above them
(inside a `Multiple`'s `features`, a `Choice`'s `options`, or a
`HeroicResourceThreshold`'s `feature`) and are **not** separately selectable.

Where a builder call omitted an optional argument, the column shows the
**resolved default** from `FactoryFeatureLogic`, not a blank.

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 1 | `null-stamina` | Stamina *(name defaulted from `field`)* | `Bonus` | no | — | — | — | none — `field: Stamina, value: 21, valuePerLevel: 9` |
| 1 | `null-recoveries` | Recoveries *(defaulted)* | `Bonus` | no | — | — | — | none — `field: Recoveries, value: 8` |
| 1 | `null-resource` | Discipline | `HeroicResource` | no | — | — | — | none — `type: 'heroic'`, `canBeNegative: false`, `value: 0`, `thresholds: []`, 3 `gains` (below) |
| 1 | ↳ gain `start` | — | `ResourceGain` (inline) | no | — | — | — | `trigger: 'Start of your turn'`, `value: '2'`, `frequency: Per Round` |
| 1 | ↳ gain `action` | — | `ResourceGain` (inline) | no | — | — | — | `trigger:` enemy in Null Field aura uses a main action, `value: '1'`, `Per Round` |
| 1 | ↳ gain `malice` | — | `ResourceGain` (inline) | no | — | — | — | `trigger:` Director uses a Malice ability, `value: '1'`, `Per Round` |
| 1 | `null-1-1` | Skill *(defaulted)* | `SkillChoice` | **yes** | 1 *(default)* | `build` *(default)* | `listOptions` defaulted to all 5 lists (Crafting, Exploration, Interpersonal, Intrigue, Lore) | `string[]` — **pre-seeded `['Psionics']`** |
| 1 | `null-1-2` | Interpersonal / Lore Skills *(defaulted)* | `SkillChoice` | **yes** | 2 | `build` | `listOptions: [Interpersonal, Lore]` | `string[]` len 2 |
| 1 | `null-1-4` | Null Field | `Ability` | no | — | — | — | none — grants ability `null-1-4` (see Abilities) |
| 1 | `null-1-5` | Inertial Shield | `Ability` | no | — | — | — | none — grants ability `null-1-5` |
| 1 | `null-1-6` | Null Speed | `Multiple` | no | — | — | — | none — container |
| 1 | ↳ `null-1-6a` | Null Speed | `Bonus` | no | — | — | — | `field: Speed`, `valueCharacteristics: [Agility]`, multiplier 1 *(default)* |
| 1 | ↳ `null-1-6b` | Null Speed | `Bonus` | no | — | — | — | `field: Disengage`, `valueCharacteristics: [Agility]`, multiplier 1 |
| 1 | `null-1-7` | Psionic Augmentation | `Choice` | **yes** | 1 *(default)* | **`respite`** | 3 inline options, each `value: 1` | `Feature[]` len 1 — **re-selectable at every respite** |
| 1 | ↳ `null-1-7a` | Density Augmentation | `Multiple` | option | — | — | — | contains 2 `Bonus` |
| 1 | ↳ ↳ `null-1-7aa` | Stability *(defaulted)* | `Bonus` | — | — | — | — | `field: Stability, value: 1` |
| 1 | ↳ ↳ `null-1-7ab` | Stamina *(defaulted)* | `Bonus` | — | — | — | — | `field: Stamina, valuePerEchelon: 6` |
| 1 | ↳ `null-1-7b` | Force Augmentation | `AbilityDamage` | option | — | — | — | `keywords: [Psionic], value: 1, damageType: Damage` *(default)* |
| 1 | ↳ `null-1-7c` | Speed Augmentation | `Multiple` | option | — | — | — | contains 2 `Bonus` |
| 1 | ↳ ↳ `null-1-7ca` | Speed *(defaulted)* | `Bonus` | — | — | — | — | `field: Speed, value: 1` |
| 1 | ↳ ↳ `null-1-7cb` | Disengage *(defaulted)* | `Bonus` | — | — | — | — | `field: Disengage, value: 1` |
| 1 | `null-1-8` | *(no name given — auto-derived as* `Psionic Martial Arts, Psionic Martial Arts, Psionic Martial Arts`*)* | `Multiple` | no | — | — | — | none — container |
| 1 | ↳ `null-1-8a` | Psionic Martial Arts | `Text` | no | — | — | — | `data: null`; `text: VERIFY-AGAINST-PIN` |
| 1 | ↳ `null-1-8b` | Psionic Martial Arts | `PackageContent` | no | — | — | — | `tag: 'null-psionic-martial-arts-grab'`; `text: VERIFY-AGAINST-PIN` |
| 1 | ↳ `null-1-8c` | Psionic Martial Arts | `PackageContent` | no | — | — | — | `tag: 'null-psionic-martial-arts-knockback'`; `text: VERIFY-AGAINST-PIN` |
| 1 | `null-1-9` | Signature Ability *(defaulted)* | `ClassAbility` | **yes** | 2 | n/a (no `selectAt` field) | `cost: 'signature'`, `minLevel: 1`, `source.fromClassAbilities: true`, `source.fromSelectedSubclassAbilities: true`, all four `*Levels` flags `false` | `selectedIDs: string[]` len 2 |
| 1 | `null-1-10` | 3pt Ability *(defaulted)* | `ClassAbility` | **yes** | 1 *(default)* | n/a | `cost: 3`, same source flags | `selectedIDs` len 1 |
| 1 | `null-1-11` | 5pt Ability *(defaulted)* | `ClassAbility` | **yes** | 1 | n/a | `cost: 5`, same source flags | `selectedIDs` len 1 |
| 2 | `null-2-1` | Exploration / Interpersonal / Intrigue Perk *(defaulted)* | `Perk` | **yes** | 1 *(default)* | — | `lists: [Exploration, Interpersonal, Intrigue]` | `Perk[]` len 1 |
| 3 | `null-3-1` | Psionic Leap | `Text` | no | — | — | — | `text: VERIFY-AGAINST-PIN` |
| 3 | `null-3-2` | Reorder | `Ability` | no | — | — | — | grants ability `null-3-2` |
| 3 | `null-3-3` | 7pt Ability *(defaulted)* | `ClassAbility` | **yes** | 1 | n/a | `cost: 7` | `selectedIDs` len 1 |
| 4 | `null-4-1a` | Agility *(defaulted)* | `CharacteristicBonus` | no | — | — | — | `Agility +1` |
| 4 | `null-4-1b` | Intuition *(defaulted)* | `CharacteristicBonus` | no | — | — | — | `Intuition +1` |
| 4 | `null-4-2` | Enhanced Null Field | `PackageContent` | no | — | — | — | `tag: 'null-field'`; `text: VERIFY-AGAINST-PIN` |
| 4 | `null-4-3` | Perk *(defaulted)* | `Perk` | **yes** | 1 | — | `lists` defaulted to all 6 (Crafting, Exploration, Interpersonal, Intrigue, Lore, Supernatural) | `Perk[]` len 1 |
| 4 | `null-4-4` | Regenerative Field | `HeroicResourceGain` | no | — | — | — | `tag: 'action 2'`, `value: '2'`, `Per Round`, **`replacesTags: ['action']`** |
| 4 | `null-4-5` | Skill *(defaulted)* | `SkillChoice` | **yes** | 1 | `build` | `listOptions:` all 5 lists (written explicitly) | `string[]` len 1 |
| 5 | `null-5-1` | 9pt Ability *(defaulted)* | `ClassAbility` | **yes** | 1 | n/a | `cost: 9` | `selectedIDs` len 1 |
| 6 | `null-6-1` | Elemental Absorption | `PackageContent` | no | — | — | — | `tag: 'inertial-shield'`; `text: VERIFY-AGAINST-PIN` |
| 6 | `null-6-2` | Elemental Buffer | `SurgeGain` | no | — | — | — | `tag: 'reduce-damage'`, `value: '2'`, `At Will`, `replacesTags: []`, non-empty `condition` (`VERIFY-AGAINST-PIN`) |
| 6 | `null-6-3` | Exploration / Interpersonal / Intrigue Perk *(defaulted)* | `Perk` | **yes** | 1 | — | `lists: [Exploration, Interpersonal, Intrigue]` | `Perk[]` len 1 |
| 7 | `null-7-1a` | Might *(defaulted)* | `CharacteristicBonus` | no | — | — | — | `Might +1` |
| 7 | `null-7-1b` | Agility *(defaulted)* | `CharacteristicBonus` | no | — | — | — | `Agility +1` |
| 7 | `null-7-1c` | Reason *(defaulted)* | `CharacteristicBonus` | no | — | — | — | `Reason +1` |
| 7 | `null-7-1d` | Intuition *(defaulted)* | `CharacteristicBonus` | no | — | — | — | `Intuition +1` |
| 7 | `null-7-1e` | Presence *(defaulted)* | `CharacteristicBonus` | no | — | — | — | `Presence +1` |
| 7 | `null-7-2` | Psi Boost | `Text` | no | — | — | — | `text: VERIFY-AGAINST-PIN` — **7 named spend options are prose only, not modelled** (see Anomalies) |
| 7 | `null-7-3` | Improved Body | `HeroicResourceGain` | no | — | — | — | `tag: 'start 2'`, `value: '3'`, `Per Round`, `replacesTags: ['start']` |
| 7 | `null-7-4` | Skill *(defaulted)* | `SkillChoice` | **yes** | 1 | `build` | all 5 lists | `string[]` len 1 |
| 8 | `null-8-1` | Perk *(defaulted)* | `Perk` | **yes** | 1 | — | `lists` defaulted to all 6 | `Perk[]` len 1 |
| 8 | `null-8-2` | 11pt Ability *(defaulted)* | `ClassAbility` | **yes** | 1 | n/a | `cost: 11` | `selectedIDs` len 1 |
| 9 | `null-9-1a` | I Am the Weapon | `Bonus` | no | — | — | — | `field: Stamina, value: 21` (flat, no per-level) |
| 9 | `null-9-1b` | I Am the Weapon | `ConditionImmunity` | no | — | — | — | `conditions: [Bleeding]` |
| 10 | `null-10-1a` | Agility *(defaulted)* | `CharacteristicBonus` | no | — | — | — | `Agility +1` |
| 10 | `null-10-1b` | Intuition *(defaulted)* | `CharacteristicBonus` | no | — | — | — | `Intuition +1` |
| 10 | `null-10-2` | Manifold Body | `HeroicResourceGain` | no | — | — | — | `tag: 'start 3'`, `value: '4'`, `Per Round`, `replacesTags: ['start', 'start 2']` |
| 10 | `null-10-3` | Manifold Resonance | `Text` | no | — | — | — | `text: VERIFY-AGAINST-PIN` |
| 10 | `null-10-4` | Order | `HeroicResource` | no | — | — | — | **`type: 'epic'`**, 1 gain: `tag: 'respite'`, `trigger: 'Finish a respite'`, `value: 'XP gained'` (a **non-numeric** value string), `At Will`; `canBeNegative: false`; `text: VERIFY-AGAINST-PIN` |
| 10 | `null-10-5` | Perk *(defaulted)* | `Perk` | **yes** | 1 | — | all 6 lists | `Perk[]` len 1 |
| 10 | `null-10-6` | Skill *(defaulted)* | `SkillChoice` | **yes** | 1 | `build` | all 5 lists | `string[]` len 1 |

**Class feature counts (top level):** L1 = 13, L2 = 1, L3 = 3, L4 = 6, L5 = 1,
L6 = 3, L7 = 8, L8 = 2, L9 = 2, L10 = 7 → **46**.

**Class choice-bearing features:** 17 (`null-1-1`, `null-1-2`, `null-1-7`,
`null-1-9`, `null-1-10`, `null-1-11`, `null-2-1`, `null-3-3`, `null-4-3`,
`null-4-5`, `null-5-1`, `null-6-3`, `null-7-4`, `null-8-1`, `null-8-2`,
`null-10-5`, `null-10-6`).

**Empty feature levels:** none at class level (every level 1–10 has ≥ 1 feature).

---

## Subclasses

`subclassName: 'Tradition'`, `subclassCount: 1`, three options. All three carry
`classID: ''` (empty — the back-link is not populated in the data files) and
`selected: false`, and all three have **`abilities: []`** — every Tradition
ability is embedded inside a `Choice` option instead of living in the subclass
ability pool.

All three Traditions share an identical skeleton:

- **L1**: one 1-list `SkillChoice` + one `Multiple` "<Tradition> Mastery"
  holding `HeroicResourceThreshold` entries at Discipline 2 / 4 / 6 plus one
  `PackageContent` tagged `inertial-shield`.
- **L2**: a flavour feature + a 2-option `Choice` of a cost-5 ability.
- **L3**: `features: []` — an empty level entry.
- **L4**: `HeroicResourceThreshold` at Discipline 8 (a `SurgeGain` that
  `replacesTags` the L1 Discipline-4 surge tag).
- **L5**: one `Text` feature.
- **L6**: a 2-option `Choice` of a cost-9 ability.
- **L7**: `HeroicResourceThreshold` at Discipline 10 → `Multiple` of two
  `RollModifier` (`DoubleEdge` on `Grab` and on `Knockback`).
- **L8**: one `Text` feature.
- **L9**: a 2-option `Choice` of a cost-11 ability.
- **L10**: `HeroicResourceThreshold` at Discipline 12 → one `Text` feature.

### Subclass — Chronokinetic (`null-sub-1`)

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 1 | `null-sub-1-1-1` | Lore Skill *(defaulted)* | `SkillChoice` | **yes** | 1 *(default)* | `build` *(default)* | `listOptions: [Lore]` | `string[]` len 1 |
| 1 | `null-sub-1-1-2` | Chronokinetic Mastery | `Multiple` | no | — | — | — | container; `text: VERIFY-AGAINST-PIN` |
| 1 | ↳ `null-sub-1-1-2-2` | Discipline 2 *(defaulted)* | `HeroicResourceThreshold` | no | — | — | — | `resource: 'Discipline'`, `value: 2`, `level: 1` *(default)* |
| 1 | ↳ ↳ `null-sub-1-1-2-2a` | Chronokinetic Mastery (Discipline 2) | `Text` | no | — | — | — | `text: VERIFY-AGAINST-PIN` |
| 1 | ↳ `null-sub-1-1-2-4` | Discipline 4 *(defaulted)* | `HeroicResourceThreshold` | no | — | — | — | `value: 4`, `level: 1` |
| 1 | ↳ ↳ `null-sub-1-1-2-4a` | Chronokinetic Mastery (Discipline 4) | `SurgeGain` | no | — | — | — | `tag: 'move'`, `value: '1'`, `Per Round`, `replacesTags: []`, `condition: ''` *(defaults)* |
| 1 | ↳ `null-sub-1-1-2-6` | Discipline 6 *(defaulted)* | `HeroicResourceThreshold` | no | — | — | — | `value: 6`, `level: 1` |
| 1 | ↳ ↳ `null-sub-1-1-2-6a` | Chronokinetic Mastery (Discipline 6) | `Multiple` | no | — | — | — | container |
| 1 | ↳ ↳ ↳ `null-sub-1-1-2-6a-grab` | Chronokinetic Mastery (Discipline 6) | `RollModifier` | no | — | — | — | `modifier: Edge`, `rollType: Grab`, `condition: ''` |
| 1 | ↳ ↳ ↳ `null-sub-1-1-2-6a-knockback` | Chronokinetic Mastery (Discipline 6) | `RollModifier` | no | — | — | — | `modifier: Edge`, `rollType: Knockback` |
| 1 | ↳ `null-sub-1-1-2b` | Chronokinetic Mastery | `PackageContent` | no | — | — | — | `tag: 'inertial-shield'`; `text: VERIFY-AGAINST-PIN` |
| 2 | `null-sub-1-2-1` | Rapid Processing | `Text` | no | — | — | — | `text: VERIFY-AGAINST-PIN` |
| 2 | `null-sub-1-2-2` | 2nd-Level Tradition Ability | `Choice` | **yes** | 1 *(default)* | `build` *(default)* | 2 inline options, each `value: 1` | `Feature[]` len 1 |
| 2 | ↳ `null-sub-1-2-2a` | Blur | `Ability` | option | — | — | — | cost 5 |
| 2 | ↳ `null-sub-1-2-2b` | Force Redirected | `Ability` | option | — | — | — | cost 5 |
| 3 | — | — | — | — | — | — | — | **`features: []`** (empty level) |
| 4 | `null-sub-1-4-1` | Chronokinetic Mastery Improvement | `HeroicResourceThreshold` | no | — | — | — | `resource: 'Discipline'`, `value: 8`, `level: 1` *(default — note the mismatch)* |
| 4 | ↳ `null-sub-1-4-1a` | Chronokinetic Mastery (Discipline 8) | `SurgeGain` | no | — | — | — | `tag: 'move 2'`, `value: '2'`, `Per Round`, `replacesTags: ['move']` |
| 5 | `null-sub-1-5-1` | Instant Action | `Text` | no | — | — | — | `text: VERIFY-AGAINST-PIN` |
| 6 | `null-sub-1-6-1` | 6th-Level Tradition Ability | `Choice` | **yes** | 1 | `build` | 2 inline options, each `value: 1` | `Feature[]` len 1 |
| 6 | ↳ `null-sub-1-6-1a` | Interphase | `Ability` | option | — | — | — | cost 9 |
| 6 | ↳ `null-sub-1-6-1b` | Phase Step | `Ability` | option | — | — | — | cost 9 |
| 7 | `null-sub-1-7-1` | Chronokinetic Mastery Improvement | `HeroicResourceThreshold` | no | — | — | — | `value: 10`, `level: 1` |
| 7 | ↳ `null-sub-1-7-1a` | Chronokinetic Mastery (Discipline 10) | `Multiple` | no | — | — | — | container |
| 7 | ↳ ↳ `null-sub-1-7-1a-grab` | Chronokinetic Mastery (Discipline 10) | `RollModifier` | no | — | — | — | `DoubleEdge` / `Grab` |
| 7 | ↳ ↳ `null-sub-1-7-1a-knockback` | Chronokinetic Mastery (Discipline 10) | `RollModifier` | no | — | — | — | `DoubleEdge` / `Knockback` |
| 8 | `null-sub-1-8-1` | Shared Momentum | `Text` | no | — | — | — | `text: VERIFY-AGAINST-PIN` |
| 9 | `null-sub-1-9-1` | 9th-Level Tradition Ability | `Choice` | **yes** | 1 | `build` | 2 inline options, each `value: 1` | `Feature[]` len 1 |
| 9 | ↳ `null-sub-1-9-1a` | Arrestor Cycle | `Ability` | option | — | — | — | cost 11 |
| 9 | ↳ `null-sub-1-9-1b` | Time Loop | `Ability` | option | — | — | — | cost 11 |
| 10 | `null-sub-1-10-1` | Chronokinetic Mastery Improvement | `HeroicResourceThreshold` | no | — | — | — | `value: 12`, `level: 1` |
| 10 | ↳ `null-sub-1-10-1a` | Chronokinetic Mastery (Discipline 12) | `Text` | no | — | — | — | `text: VERIFY-AGAINST-PIN` |

Top-level features: L1 = 2, L2 = 2, L3 = 0, L4 = 1, L5 = 1, L6 = 1, L7 = 1,
L8 = 1, L9 = 1, L10 = 1 → **11**. Choice-bearing: 4.

### Subclass — Cryokinetic (`null-sub-2`)

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 1 | `null-sub-2-1-1` | Crafting Skill *(defaulted)* | `SkillChoice` | **yes** | 1 *(default)* | `build` *(default)* | `listOptions: [Crafting]` | `string[]` len 1 |
| 1 | `null-sub-2-1-2` | Cryokinetic Mastery | `Multiple` | no | — | — | — | container; `text: VERIFY-AGAINST-PIN` |
| 1 | ↳ `null-sub-2-1-2-2` | Discipline 2 *(defaulted)* | `HeroicResourceThreshold` | no | — | — | — | `resource: 'Discipline'`, `value: 2`, `level: 1` |
| 1 | ↳ ↳ `null-sub-2-1-2-2a` | Cryokinetic Mastery (Discipline 2) | `Text` | no | — | — | — | `text: VERIFY-AGAINST-PIN` |
| 1 | ↳ `null-sub-2-1-2-4` | Discipline 4 *(defaulted)* | `HeroicResourceThreshold` | no | — | — | — | `value: 4` |
| 1 | ↳ ↳ `null-sub-2-1-2-4a` | Cryokinetic Mastery (Discipline 4) | `SurgeGain` | no | — | — | — | `tag: 'grab-or-move'`, `value: '1'`, `Per Round`, `condition: ''` |
| 1 | ↳ `null-sub-2-1-2-6` | Discipline 6 *(defaulted)* | `HeroicResourceThreshold` | no | — | — | — | `value: 6` |
| 1 | ↳ ↳ `null-sub-2-1-2-6a` | Cryokinetic Mastery (Discipline 6) | `Multiple` | no | — | — | — | container |
| 1 | ↳ ↳ ↳ `null-sub-2-1-2-6a-grab` | Cryokinetic Mastery (Discipline 6) | `RollModifier` | no | — | — | — | `Edge` / `Grab` |
| 1 | ↳ ↳ ↳ `null-sub-2-1-2-6a-knockback` | Cryokinetic Mastery (Discipline 6) | `RollModifier` | no | — | — | — | `Edge` / `Knockback` |
| 1 | ↳ `null-sub-2-1-2b` | Cryokinetic Mastery | `PackageContent` | no | — | — | — | `tag: 'inertial-shield'`; `text: VERIFY-AGAINST-PIN` |
| 2 | `null-sub-2-2-1` | Entropic Adaptability | `Text` | no | — | — | — | `text: VERIFY-AGAINST-PIN` |
| 2 | `null-sub-2-2-1b` | Damage Modifier *(defaulted — no name given)* | `DamageModifier` | no | — | — | — | 1 modifier: `damageType: Cold`, `type: Immunity`, `valueCharacteristics: [Intuition]`, `valueCharacteristicMultiplier: 2` |
| 2 | `null-sub-2-2-2` | 2nd-Level Tradition Ability | `Choice` | **yes** | 1 | `build` | 2 inline options, each `value: 1` | `Feature[]` len 1 |
| 2 | ↳ `null-sub-2-2-2a` | Entropic Field | `Ability` | option | — | — | — | cost 5 |
| 2 | ↳ `null-sub-2-2-2b` | Heat Sink | `Ability` | option | — | — | — | cost 5 |
| 3 | — | — | — | — | — | — | — | **`features: []`** (empty level) |
| 4 | `null-sub-2-4-1` | Cryokinetic Mastery Improvement | `HeroicResourceThreshold` | no | — | — | — | `value: 8`, `level: 1` |
| 4 | ↳ `null-sub-2-4-1a` | Cryokinetic Mastery (Discipline 8) | `SurgeGain` | no | — | — | — | `tag: 'grab-or-move 2'`, `value: '2'`, `Per Round`, `replacesTags: ['grab-or-move']` |
| 5 | `null-sub-2-5-1` | Chilling Readiness | `Text` | no | — | — | — | `text: VERIFY-AGAINST-PIN` |
| 6 | `null-sub-2-6-1` | 6th-Level Tradition Ability | `Choice` | **yes** | 1 | `build` | 2 inline options | `Feature[]` len 1 |
| 6 | ↳ `null-sub-2-6-1a` | Ice Pillars | `Ability` | option | — | — | — | cost 9 |
| 6 | ↳ `null-sub-2-6-1b` | Wall of Ice | `Ability` | option | — | — | — | cost 9 |
| 7 | `null-sub-2-7-1` | Cryokinetic Mastery Improvement | `HeroicResourceThreshold` | no | — | — | — | `value: 10`, `level: 1` |
| 7 | ↳ `null-sub-2-7-1a` | Cryokinetic Mastery (Discipline 10) | `Multiple` | no | — | — | — | container |
| 7 | ↳ ↳ `null-sub-2-7-1a-grab` | Cryokinetic Mastery (Discipline 10) | `RollModifier` | no | — | — | — | `DoubleEdge` / `Grab` |
| 7 | ↳ ↳ `null-sub-2-7-1a-knockback` | Cryokinetic Mastery (Discipline 10) | `RollModifier` | no | — | — | — | `DoubleEdge` / `Knockback` |
| 8 | `null-sub-2-8-1` | Synaptic Triage | `Text` | no | — | — | — | `text: VERIFY-AGAINST-PIN` |
| 9 | `null-sub-2-9-1` | 9th-Level Tradition Ability | `Choice` | **yes** | 1 | `build` | 2 inline options | `Feature[]` len 1 |
| 9 | ↳ `null-sub-2-9-1a` | Absolute Zero | `Ability` | option | — | — | — | cost 11 |
| 9 | ↳ `null-sub-2-9-1b` | Heat Drain | `Ability` | option | — | — | — | cost 11 |
| 10 | `null-sub-2-10-1` | Cryokinetic Mastery Improvement | `HeroicResourceThreshold` | no | — | — | — | `value: 12`, `level: 1` |
| 10 | ↳ `null-sub-2-10-1a` | Cryokinetic Mastery (Discipline 12) | `Text` | no | — | — | — | `text: VERIFY-AGAINST-PIN` |

Top-level features: L1 = 2, L2 = 3, L3 = 0, L4 = 1, L5 = 1, L6 = 1, L7 = 1,
L8 = 1, L9 = 1, L10 = 1 → **12**. Choice-bearing: 4.

### Subclass — Metakinetic (`null-sub-3`)

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 1 | `null-sub-3-1-1` | Exploration Skill *(defaulted)* | `SkillChoice` | **yes** | 1 *(default)* | `build` *(default)* | `listOptions: [Exploration]` | `string[]` len 1 |
| 1 | `null-sub-3-1-2` | Metakinetic Mastery | `Multiple` | no | — | — | — | container; `text: VERIFY-AGAINST-PIN` |
| 1 | ↳ `null-sub-3-1-2-2` | Discipline 2 *(defaulted)* | `HeroicResourceThreshold` | no | — | — | — | `resource: 'Discipline'`, `value: 2`, `level: 1` |
| 1 | ↳ ↳ `null-sub-3-1-2-2a` | Metakinetic Mastery (Discipline 2) | `Text` | no | — | — | — | `text: VERIFY-AGAINST-PIN` |
| 1 | ↳ `null-sub-3-1-2-4` | Discipline 4 *(defaulted)* | `HeroicResourceThreshold` | no | — | — | — | `value: 4` |
| 1 | ↳ ↳ `null-sub-3-1-2-4a` | Metakinetic Mastery (Discipline 4) | `SurgeGain` | no | — | — | — | `tag: 'take-damage'`, `value: '1'`, `Per Round`, `condition: ''` |
| 1 | ↳ `null-sub-3-1-2-6` | Discipline 6 *(defaulted)* | `HeroicResourceThreshold` | no | — | — | — | `value: 6` |
| 1 | ↳ ↳ `null-sub-3-1-2-6a` | Metakinetic Mastery (Discipline 6) | `Multiple` | no | — | — | — | container |
| 1 | ↳ ↳ ↳ `null-sub-3-1-2-6a-grab` | Metakinetic Mastery (Discipline 6) | `RollModifier` | no | — | — | — | `Edge` / `Grab` |
| 1 | ↳ ↳ ↳ `null-sub-3-1-2-6a-knockback` | Metakinetic Mastery (Discipline 6) | `RollModifier` | no | — | — | — | `Edge` / `Knockback` |
| 1 | ↳ `null-sub-3-1-2b` | Metakinetic Mastery | `PackageContent` | no | — | — | — | `tag: 'inertial-shield'`; `text: VERIFY-AGAINST-PIN` |
| 2 | `null-sub-3-2-1` | Inertial Sink | `Text` | no | — | — | — | `text: VERIFY-AGAINST-PIN` |
| 2 | `null-sub-3-2-2` | 2nd-Level Tradition Ability | `Choice` | **yes** | 1 | `build` | 2 inline options, each `value: 1` | `Feature[]` len 1 |
| 2 | ↳ `null-sub-3-2-2a` | Gravitic Strike | `Ability` | option | — | — | — | cost 5 |
| 2 | ↳ `null-sub-3-2-2b` | Kinetic Shield | `Ability` | option | — | — | — | cost 5 |
| 3 | — | — | — | — | — | — | — | **`features: []`** (empty level) |
| 4 | `null-sub-3-4-1` | Metakinetic Mastery Improvement | `HeroicResourceThreshold` | no | — | — | — | `value: 8`, `level: 1` |
| 4 | ↳ `null-sub-3-4-1a` | Metakinetic Mastery (Discipline 8) | `SurgeGain` | no | — | — | — | `tag: 'take-damage 2'`, `value: '2'`, `Per Round`, `replacesTags: ['take-damage']` |
| 5 | `null-sub-3-5-1` | Inertial Fulcrum | `Text` | no | — | — | — | `text: VERIFY-AGAINST-PIN` |
| 6 | `null-sub-3-6-1` | 6th-Level Tradition Ability | `Choice` | **yes** | 1 | `build` | 2 inline options | `Feature[]` len 1 |
| 6 | ↳ `null-sub-3-6-1a` | Gravitic Charge | `Ability` | option | — | — | — | cost 9 |
| 6 | ↳ `null-sub-3-6-1b` | Iron Body | `Ability` | option | — | — | — | cost 9 |
| 7 | `null-sub-3-7-1` | Metakinetic Mastery Improvement | `HeroicResourceThreshold` | no | — | — | — | `value: 10`, `level: 1` |
| 7 | ↳ `null-sub-3-7-1a` | Metakinetic Mastery (Discipline 10) | `Multiple` | no | — | — | — | container |
| 7 | ↳ ↳ `null-sub-3-7-1a-grab` | Metakinetic Mastery (Discipline 10) | `RollModifier` | no | — | — | — | `DoubleEdge` / `Grab` |
| 7 | ↳ ↳ `null-sub-3-7-1a-knockback` | Metakinetic Mastery (Discipline 10) | `RollModifier` | no | — | — | — | `DoubleEdge` / `Knockback` |
| 8 | `null-sub-3-8-1` | Inertial Dampener | `Text` | no | — | — | — | `text: VERIFY-AGAINST-PIN` |
| 9 | `null-sub-3-9-1` | 9th-Level Tradition Ability | `Choice` | **yes** | 1 | `build` | 2 inline options | `Feature[]` len 1 |
| 9 | ↳ `null-sub-3-9-1a` | Inertial Absorption | `Ability` | option | — | — | — | cost 11 |
| 9 | ↳ `null-sub-3-9-1b` | Realitas | `Ability` | option | — | — | — | cost 11 |
| 10 | `null-sub-3-10-1` | Metakinetic Mastery Improvement | `HeroicResourceThreshold` | no | — | — | — | `value: 12`, `level: 1` |
| 10 | ↳ `null-sub-3-10-1a` | Metakinetic Mastery (Discipline 12) | `Text` | no | — | — | — | `text: VERIFY-AGAINST-PIN` |

Top-level features: L1 = 2, L2 = 2, L3 = 0, L4 = 1, L5 = 1, L6 = 1, L7 = 1,
L8 = 1, L9 = 1, L10 = 1 → **11**. Choice-bearing: 4.

---

## Abilities

### Class ability pool — `nullClass.abilities` (28)

These are the only entries a `ClassAbility` choice can draw from (subclass
ability arrays are empty). Action type comes from `FactoryAbilityTypeLogic`;
distance from `FactoryDistanceLogic`. All 28 have `repeatable: false` and
`minLevel: 1` (both defaults). Section bodies: `text: VERIFY-AGAINST-PIN`.

| ID | Name | Cost | Keywords | Action type | Distance | Target | Sections |
|---|---|---|---|---|---|---|---|
| `null-ability-1` | Dance of Blows | `signature` | Area, Psionic, Weapon | Main Action | Burst 1 | Each enemy in the area | roll (Agility) + text |
| `null-ability-2` | Faster than the Eye | `signature` | Melee, Psionic, Strike, Weapon | Main Action | Melee 1 | Two creatures or objects | roll (Agility) + text |
| `null-ability-3` | Inertial Step | `signature` | Melee, Psionic, Strike, Weapon | Main Action | Melee 1 | One creature or object | roll (Agility) + text |
| `null-ability-4` | Joint Lock | `signature` | Melee, Psionic, Strike, Weapon | Main Action | Melee 1 | One creature or object | roll (Agility) |
| `null-ability-5` | Kinetic Strike | `signature` | Melee, Psionic, Strike, Weapon | Main Action | Melee 1 | One creature or object | roll (Agility) |
| `null-ability-6` | Magnetic Strike | `signature` | Melee, Psionic, Strike, Weapon | Main Action | Melee **2** | One creature | roll (Agility) |
| `null-ability-7` | Phase Inversion Strike | `signature` | Melee, Psionic, Strike, Weapon | Main Action | Melee 1 | One creature or object | roll (Agility) + text |
| `null-ability-8` | Pressure Points | `signature` | Melee, Psionic, Strike, Weapon | Main Action | Melee 1 | One creature or object | roll (Agility) |
| `null-ability-9` | Chronal Spike | 3 | Melee, Psionic, Strike, Weapon | Main Action | Melee 1 | One creature or object | roll (Agility) + text |
| `null-ability-10` | Psychic Pulse | 3 | Area, Psionic | Maneuver | Burst 2 | Each enemy in the area | text |
| `null-ability-11` | Relentless Nemesis | 3 | Melee, Psionic, Strike, Weapon | Main Action | Melee 1 | One creature or object | roll (Agility) + text |
| `null-ability-12` | Stunning Blow | 3 | Melee, Psionic, Strike, Weapon | Main Action | Melee 1 | One creature or object | roll (Agility) |
| `null-ability-13` | Arcane Disruptor | 5 | Melee, Psionic, Strike, Weapon | Main Action | Melee 1 | One creature | roll (Agility) + text |
| `null-ability-14` | Impart Force | 5 | Melee, Psionic, Strike, Weapon | **Maneuver** | Melee 1 | One creature or object | roll (**Intuition**) + text |
| `null-ability-15` | Phase Strike | 5 | Melee, Psionic, Strike, Weapon | Main Action | Melee 1 | One creature | roll (Agility) + text |
| `null-ability-16` | A Squad Unto Myself | 5 | Area, Psionic, Weapon | Main Action | Burst 2 | Each enemy in the area | roll (Agility) + text |
| `null-ability-17` | Absorption Field | 7 | Psionic | Maneuver | Self | Self | text |
| `null-ability-18` | Molecular Rearrangement Field | 7 | Psionic | Maneuver | Self | Self | text |
| `null-ability-19` | Stabilizing Field | 7 | Psionic | Maneuver | Self | Self | text |
| `null-ability-20` | Synapse Field | 7 | Psionic | Maneuver | Self | Self | text |
| `null-ability-21` | Anticipating Strike | 9 | Melee, Psionic, Strike, Weapon | Triggered Action, `free: true` | Melee 1 | One creature | roll (Agility) + text |
| `null-ability-22` | Iron Grip | 9 | Melee, Psionic, Strike, Weapon | Main Action | Melee 1 | One creature | roll (Agility) + text |
| `null-ability-23` | Phase Leap | 9 | Psionic | **Move Action** | Self | Self | text |
| `null-ability-24` | Synaptic Reset | 9 | Area, Psionic | Maneuver | Burst 3 | Self and each ally in the area | text |
| `null-ability-25` | Arcane Purge | 11 | Melee, Psionic, Strike, Weapon | Main Action | Melee 1 | One creature | roll (Agility) + text |
| `null-ability-26` | Phase Hurl | 11 | Melee, Psionic, Strike, Weapon | Main Action | Melee 1 | One creature | roll (Agility) + text |
| `null-ability-27` | Scalar Assault | 11 | Area, Psionic | Main Action | Cube 3 within 1 | Each enemy in the area | roll (Agility) |
| `null-ability-28` | Synaptic Anchor | 11 | Psionic | Triggered Action, `free: true` | Special (`'Self; see below'`) | Self or one creature | text |

Cost tiers present in the pool: `signature` ×8, 3 ×4, 5 ×4, 7 ×4, 9 ×4, 11 ×4.
Cost tiers the class actually buys: signature (×2), 3, 5, 7, 9, 11 — **every
tier in the pool is purchasable**, and each non-signature tier is a 1-of-4 pick.

### Granted (non-purchased) class abilities

Delivered as `FeatureType.Ability` features rather than pool entries; `cost`
defaults to `0`.

| Feature ID | Name | Level | Cost | Keywords | Action type | Distance | Target | Sections |
|---|---|---|---|---|---|---|---|---|
| `null-1-4` | Null Field | 1 | 0 *(default)* | Area, Psionic | Maneuver | **Aura 1** | All enemies | text + **package `'null-field'`** |
| `null-1-5` | Inertial Shield | 1 | 0 | Psionic | Triggered Action (`free: false`), trigger `'You take damage.'` | Self | Self | text + **spend field** (`name: 'Spend'`, `value: 1`, `repeatable: false`) + **package `'inertial-shield'`** |
| `null-3-2` | Reorder | 3 | 0 | *(none)* | Triggered Action, `free: true`, trigger `'You start your turn.'` | Self | Self | text |

### Tradition abilities (inside `Choice` options — never in `subclass.abilities`)

| Subclass | Level | ID | Name | Cost | Keywords | Action type | Distance | Target |
|---|---|---|---|---|---|---|---|---|
| Chronokinetic | 2 | `null-sub-1-2-2a` | Blur | 5 | Psionic | Maneuver | Self | Self |
| Chronokinetic | 2 | `null-sub-1-2-2b` | Force Redirected | 5 | Melee, Psionic, Strike, Weapon | Main Action | Melee 3 | One creature |
| Chronokinetic | 6 | `null-sub-1-6-1a` | Interphase | 9 | Psionic | Main Action | Self | Self |
| Chronokinetic | 6 | `null-sub-1-6-1b` | Phase Step | 9 | Melee, Psionic, Weapon | Main Action | Special (`'Self; see below'`) | Self |
| Chronokinetic | 9 | `null-sub-1-9-1a` | Arrestor Cycle | 11 | Psionic, Ranged | Triggered Action, `free: true` | Ranged 10 | One creature |
| Chronokinetic | 9 | `null-sub-1-9-1b` | Time Loop | 11 | Psionic | Triggered Action, `free: true` | Self | Self |
| Cryokinetic | 2 | `null-sub-2-2-2a` | Entropic Field | 5 | Area, Psionic, Weapon | Main Action | Cube 3 within 1 | Each enemy in the area |
| Cryokinetic | 2 | `null-sub-2-2-2b` | Heat Sink | 5 | Psionic | Maneuver | Self | Self |
| Cryokinetic | 6 | `null-sub-2-6-1a` | Ice Pillars | 9 | Psionic | Main Action | Ranged 10 | Three creatures or objects |
| Cryokinetic | 6 | `null-sub-2-6-1b` | Wall of Ice | 9 | Melee, Psionic, Weapon | Main Action | Wall 10 within 10 | Special |
| Cryokinetic | 9 | `null-sub-2-9-1a` | Absolute Zero | 11 | Psionic | Maneuver | Self | Self |
| Cryokinetic | 9 | `null-sub-2-9-1b` | Heat Drain | 11 | Melee, Psionic, Strike | Maneuver | Melee 1 | One creature |
| Metakinetic | 2 | `null-sub-3-2-2a` | Gravitic Strike | 5 | Melee, Psionic, Strike, Weapon | Main Action | Melee 3 | One creature |
| Metakinetic | 2 | `null-sub-3-2-2b` | Kinetic Shield | 5 | Psionic | Maneuver | Self | Self |
| Metakinetic | 6 | `null-sub-3-6-1a` | Gravitic Charge | 9 | Psionic | Maneuver | Self | Self |
| Metakinetic | 6 | `null-sub-3-6-1b` | Iron Body | 9 | Psionic | Maneuver | Self | Self |
| Metakinetic | 9 | `null-sub-3-9-1a` | Inertial Absorption | 11 | Psionic | Triggered Action, `free: true` | Self | Self |
| Metakinetic | 9 | `null-sub-3-9-1b` | Realitas | 11 | Melee, Psionic, Strike, Weapon | Main Action | Melee 1 | One creature |

**Ability totals:** 28 pool + 3 granted + 18 Tradition = **49 ability objects**
under the Null class tree. A level-10 Null holds 3 granted + 8 purchased +
3 Tradition = **14**.

---

## Choice-point inventory

In build order for a hero taken from level 1 to level 10. "Cardinality" is the
number of selected values, not the number of controls.

| # | Level | Choice | Feature ID | Cardinality | Option pool | Notes |
|---|---|---|---|---|---|---|
| 1 | class pick | Class = Null | *(not a `Feature`)* | 1 | all classes in enabled sources | |
| 2 | class pick | Primary characteristics | *(not a `Feature`)* | — | `primaryCharacteristicsOptions` has 1 entry | **auto-assigned**, render read-only |
| 3 | class pick | Characteristic array | *(not a `Feature`)* | 1 of 3 arrays, then an assignment of 3 values to 3 characteristics | `[2,-1,-1]`, `[1,0,0]`, `[1,1,-1]` | 2 primaries fixed at 2 |
| 4 | 1 | **Tradition** | `subclasses[].selected` | 1 of 3 | Chronokinetic / Cryokinetic / Metakinetic | `subclassCount: 1` |
| 5 | 1 | Skill (pre-seeded `Psionics`) | `null-1-1` | 1 | any skill from all 5 lists | **the seeded value is editable** — see Anomalies |
| 6 | 1 | Skills | `null-1-2` | 2 | Interpersonal + Lore lists | |
| 7 | 1 | Psionic Augmentation | `null-1-7` | 1 of 3 | Density / Force / Speed | **`selectAt: 'respite'`** — re-made after every respite |
| 8 | 1 | Signature abilities | `null-1-9` | 2 | 8 signature abilities in the class pool | |
| 9 | 1 | 3pt ability | `null-1-10` | 1 | 4 cost-3 abilities | |
| 10 | 1 | 5pt ability | `null-1-11` | 1 | 4 cost-5 abilities | |
| 11 | 1 | Tradition skill | `null-sub-{1,2,3}-1-1` | 1 | Lore / Crafting / Exploration list (per Tradition) | **pool depends on choice #4** |
| 12 | 2 | Perk | `null-2-1` | 1 | Exploration + Interpersonal + Intrigue perk lists | |
| 13 | 2 | 2nd-Level Tradition Ability | `null-sub-{1,2,3}-2-2` | 1 of 2 | per-Tradition pair (cost 5) | **pool depends on choice #4** |
| 14 | 3 | 7pt ability | `null-3-3` | 1 | 4 cost-7 abilities | |
| 15 | 4 | Perk | `null-4-3` | 1 | all 6 perk lists | |
| 16 | 4 | Skill | `null-4-5` | 1 | all 5 skill lists | |
| 17 | 5 | 9pt ability | `null-5-1` | 1 | 4 cost-9 abilities | |
| 18 | 6 | Perk | `null-6-3` | 1 | Exploration + Interpersonal + Intrigue | |
| 19 | 6 | 6th-Level Tradition Ability | `null-sub-{1,2,3}-6-1` | 1 of 2 | per-Tradition pair (cost 9) | **pool depends on choice #4** |
| 20 | 7 | Skill | `null-7-4` | 1 | all 5 skill lists | |
| 21 | 8 | Perk | `null-8-1` | 1 | all 6 perk lists | |
| 22 | 8 | 11pt ability | `null-8-2` | 1 | 4 cost-11 abilities | |
| 23 | 9 | 9th-Level Tradition Ability | `null-sub-{1,2,3}-9-1` | 1 of 2 | per-Tradition pair (cost 11) | **pool depends on choice #4** |
| 24 | 10 | Perk | `null-10-5` | 1 | all 6 perk lists | |
| 25 | 10 | Skill | `null-10-6` | 1 | all 5 skill lists | |

**Totals for a level-10 Null:** 22 `Feature`-backed choice controls
(17 class + 4 Tradition + Tradition selection) plus 2 non-`Feature` controls
(characteristic array; primaries are auto-assigned). Selected values:
7 skills, 5 perks, 8 class abilities, 3 Tradition abilities, 1 augmentation,
1 Tradition = **25 stored selections**.

At level 1 alone: 7 controls (Tradition, 2 skill controls, Tradition skill,
augmentation, 3 ability controls) yielding 8 stored selections.

Choices per level: L1 = 7 controls, L2 = 2, L3 = 1, L4 = 2, L5 = 1, L6 = 2,
L7 = 1, L8 = 2, L9 = 1, L10 = 2.

---

## UI surface

Ordered list of controls the Null builder renders. Control kind is ours, not
Forge Steel's.

**Class step (before any level feature):**

1. Class picker — searchable list (Null among all classes).
2. Primary characteristics — **read-only display** ("Agility and Intuition").
   Do not render a picker: `primaryCharacteristicsOptions.length === 1`.
3. Characteristic array — single-select over 3 arrays, then a per-characteristic
   assignment control for the 3 non-primary characteristics (Might, Reason,
   Presence). Two-stage nested control.
4. Tradition picker — single-select of 3, each with description + a preview of
   its L1 Mastery table. Selecting it **unlocks 4 downstream controls**.

**Level 1:**

5. Skill (`null-1-1`) — searchable single-select across all 5 skill lists,
   pre-filled with `Psionics`. Decide deliberately whether we lock it (see
   Anomalies) — Forge Steel leaves it editable.
6. Skills (`null-1-2`) — multi-select-2, filtered to Interpersonal + Lore.
7. Tradition skill (`null-sub-N-1-1`) — single-select filtered to one list
   (Lore / Crafting / Exploration). Rendered only after control 4.
8. Psionic Augmentation (`null-1-7`) — single-select of 3, each option showing
   its nested bonuses. Must be flagged in the UI as **respite-changeable**, and
   must also be reachable from the play/character sheet, not only the builder.
9. Signature abilities (`null-1-9`) — multi-select-2 over the 8 signature
   abilities, with ability cards.
10. 3pt ability (`null-1-10`) — single-select of 4 cards.
11. 5pt ability (`null-1-11`) — single-select of 4 cards.

**Read-only panels at level 1** (no control, but must render): Stamina/Recoveries
bonuses; the Discipline resource with its 3 gain triggers; Null Field; Inertial
Shield; Null Speed; Psionic Martial Arts; the Tradition Mastery threshold table
(Discipline 2/4/6 rows).

**Level 2:** 12. Perk (`null-2-1`) — searchable single-select, 3 lists.
13. 2nd-Level Tradition Ability — single-select of 2 ability cards.
Read-only: the Tradition's L2 flavour feature (+ Cryokinetic's cold-immunity
damage modifier).

**Level 3:** 14. 7pt ability — single-select of 4.
Read-only: Psionic Leap, Reorder. **Traditions contribute nothing at level 3** —
render no Tradition section rather than an empty one.

**Level 4:** 15. Perk (all 6 lists) — searchable single-select.
16. Skill (all 5 lists) — searchable single-select.
Read-only: +1 Agility, +1 Intuition; Regenerative Field (which **supersedes**
the level-1 `action` Discipline gain — the resource panel must show 2/round, not
both rows); Enhanced Null Field (renders *inside* the Null Field ability card,
not as its own feature card); the Tradition's Discipline-8 threshold row
(which supersedes the Discipline-4 row).

**Level 5:** 17. 9pt ability — single-select of 4. Read-only: Tradition L5 text.

**Level 6:** 18. Perk (3 lists). 19. 6th-Level Tradition Ability — single-select
of 2. Read-only: Elemental Absorption (inside the Inertial Shield card),
Elemental Buffer surge gain.

**Level 7:** 20. Skill (all 5 lists). Read-only: +1 to all five characteristics;
Psi Boost (long prose — see Anomalies, it is a spend menu we may want to model);
Improved Body (supersedes the level-1 `start` gain); the Tradition's
Discipline-10 threshold (supersedes Discipline-6).

**Level 8:** 21. Perk (all 6 lists). 22. 11pt ability — single-select of 4.
Read-only: Tradition L8 text.

**Level 9:** 23. 9th-Level Tradition Ability — single-select of 2.
Read-only: I Am the Weapon (+21 Stamina, Bleeding immunity).

**Level 10:** 24. Perk (all 6 lists). 25. Skill (all 5 lists).
Read-only: +1 Agility / +1 Intuition; Manifold Body (supersedes both earlier
`start` gains); Manifold Resonance; **Order** — a *second* resource meter of
`type: 'epic'` that the sheet must render alongside Discipline; the Tradition's
Discipline-12 threshold.

**Control kinds used:** single-select (14), multi-select-N (2 — `null-1-2` at 2,
`null-1-9` at 2), searchable list (skills + perks — 12 of the single-selects
should be search-backed), nested sub-choice (characteristic array; Tradition →
Tradition-scoped controls), toggle (none — Null has no `FeatureType.Toggle`),
free text (none from the class; hero name/details live outside this spec).

---

## Convex data model notes

### Definition data (seeded, versioned by source, shared)

- `classes` — one document for Null: id, name, description, `type`,
  `subclassName`, `subclassCount`, `primaryCharacteristicsOptions`.
  **Do not seed `level` or `characteristics`** — Forge Steel puts both on the
  class object, but they are per-hero runtime state (see Anomalies).
- `classFeatures` — 46 top-level rows keyed by `(classId, level, featureId)`,
  plus the nested rows. The nesting is 4 deep at worst
  (`Multiple → HeroicResourceThreshold → Multiple → RollModifier`), so either
  store the feature tree as a JSON blob per top-level feature, or normalise with
  a `parentFeatureId` + `containerKind` (`multiple` | `choiceOption` |
  `thresholdBenefit`) discriminator. Prefer the latter — nested rows need to be
  addressable (a `Choice` option's id becomes the selection value).
- `subclasses` — 3 rows; `classID` must be **populated by us**, it is `''` in
  the source.
- `subclassFeatures` — 11 / 12 / 11 rows respectively, same shape.
- `abilities` — 49 rows: 28 pool (`source: 'classPool'`, indexed by
  `(classId, cost)` so a `ClassAbility` control is one index read), 3 granted
  (`source: 'feature'`, `grantedByFeatureId`), 18 Tradition
  (`source: 'choiceOption'`, `optionOfFeatureId`).
- `resourceGains` — flatten the 3 inline gains on `null-resource` plus the 3
  standalone `HeroicResourceGain` features into one table with
  `(tag, trigger, value, frequency, replacesTags[])`, so supersession is one
  query and not a special case per level.

### Selection state (per hero, sparse, keyed by feature id)

Recommended shape:

```
heroClassSelections: {
  heroId, classId,
  subclassIds: string[],              // len 1 for Null
  primaryCharacteristics: string[],   // derived, but store it — it's echelon-stable
  characteristicArray: number[],      // the picked array
  characteristicAssignment: Record<Characteristic, number>,
  featureSelections: Record<featureId, Selection>
}
```

`Selection` is a small discriminated union, one variant per selecting
`FeatureType` Null actually uses — only **four**:

| FeatureType | Selection payload | Null feature ids |
|---|---|---|
| `SkillChoice` | `{ kind: 'skills', skills: string[] }` | `null-1-1`, `null-1-2`, `null-4-5`, `null-7-4`, `null-10-6`, `null-sub-N-1-1` |
| `Perk` | `{ kind: 'perks', perkIds: string[] }` | `null-2-1`, `null-4-3`, `null-6-3`, `null-8-1`, `null-10-5` |
| `ClassAbility` | `{ kind: 'abilities', abilityIds: string[] }` | `null-1-9`, `null-1-10`, `null-1-11`, `null-3-3`, `null-5-1`, `null-8-2` |
| `Choice` | `{ kind: 'options', optionFeatureIds: string[] }` | `null-1-7`, `null-sub-N-2-2`, `null-sub-N-6-1`, `null-sub-N-9-1` |

Null needs **no** `Kit`, `Domain`, `DomainFeature`, `LanguageChoice`,
`ItemChoice`, `TitleChoice`, `Toggle`, `Companion`, `Retainer`, `SummonChoice`,
`AncestryFeatureChoice`, or `SkillCancelChoice` variant. That is the whole class
in four selection shapes — a good argument for the sparse map over Forge Steel's
deep-copy.

### Where the definition/selection split is hard

1. **`null-1-7` Psionic Augmentation has `selectAt: 'respite'`.** This is not a
   build-time selection at all — it is mutable campaign state that changes
   between encounters and retroactively changes derived stats (Stability,
   Stamina-per-echelon, Speed, Disengage, or psionic damage). Either the sparse
   selection map must be writable outside the builder (with an audit trail), or
   respite-scoped selections need their own table
   (`heroRespiteSelections`) that the stat derivation reads *last*. Note also
   that the Forge Steel field name `respiteChange` on `FeatureChoiceData` is
   marked `@deprecated`; `selectAt` is the live field — do not model the
   deprecated one.
2. **Tradition-conditional option pools.** Controls 11, 13, 19 and 23 do not
   exist until the Tradition is chosen, and their option lists differ per
   Tradition. A flat `Record<featureId, Selection>` survives this only because
   the feature ids are Tradition-scoped (`null-sub-1-2-2` vs `null-sub-2-2-2`).
   **Switching Tradition must garbage-collect the other Traditions' keys**, or
   the map accumulates orphan selections that a naive "count chosen features"
   validator will happily accept.
3. **`replacesTags` supersession chains.** `start` → `start 2` (L7) → `start 3`
   (L10); `action` → `action 2` (L4); per-Tradition `move`/`grab-or-move`/
   `take-damage` → `... 2` (L4). These are definition-level rewrites keyed on a
   *string tag*, not a feature id. Resolution must happen in the derivation
   layer, not the seed, because it depends on hero level. A sparse selection map
   is unaffected, but any denormalised "current resource gains" cache is.
4. **`HeroicResourceThreshold` benefits are conditional on live resource value.**
   The Discipline 2/4/6/8/10/12 benefits are not build-time at all — they switch
   on and off during an encounter as Discipline rises and falls. They are
   definition data with a runtime predicate; never fold them into the hero's
   static derived-stats blob.
5. **`PackageContent` features have no standalone identity.** `null-4-2`,
   `null-6-1`, `null-1-8b`, `null-1-8c`, `null-sub-N-1-2b` render *inside*
   another ability's card, matched by string `tag`. Our ability-render path
   needs the same join (`abilitySection.tag === packageContent.tag`, filtered to
   features the hero actually has). Forge Steel explicitly suppresses these from
   the flat feature list (`hero-sheet-builder.ts:77`).
6. **Two simultaneous resources at level 10.** `null-resource` (Discipline,
   heroic) and `null-10-4` (Order, epic) coexist, and Order's gain `value` is
   the **non-numeric string `'XP gained'`**. Any `number` typing on resource
   gain values will break here; the source types `ResourceGain.value` as
   `string` for exactly this reason.

---

## Anomalies & open questions

1. **A Null-specific package tag is hardcoded into the *global* common-maneuver
   data.** `src/data/ability-data.ts:179` and `:212` — the shared `Grab` and
   `Knockback` maneuvers carry
   `createAbilitySectionPackage('null-psionic-martial-arts-grab' / '-knockback')`.
   Every hero of every class renders those maneuvers, and the package section
   silently resolves to nothing unless the hero is a Null. If we adopt the
   package mechanism we inherit a cross-class coupling from a class file into
   the universal action list. Recommend inverting it: let a feature *declare*
   which ability it augments, rather than the shared ability declaring a slot
   named after one class.

2. **`null-1-1` is a granted skill modelled as an editable choice.**
   `createSkillChoice({ id: 'null-1-1', selected: ['Psionics'] })` resolves to
   `count: 1`, `listOptions:` all 5 lists, `selected: ['Psionics']`. It renders
   as a live single-select the player can change away from Psionics. It is
   unresolvable from the source whether the rule grants Psionics or offers a
   free skill pre-set to Psionics. **VERIFY-AGAINST-PIN before deciding whether
   our control is locked.** Note also the overlap: `Psionics` is a **Lore**
   skill (`data/sourcebooks/official/core.ts:735`), so it sits inside both this
   control's default pool (all 5 lists) *and* `null-1-2`'s pool
   (Interpersonal + Lore). Nothing in the source prevents a player from picking
   Psionics again in `null-1-2`; our multi-select must dedupe against skills
   already known.

3. **`null-1-3` does not exist.** Level 1 ids run `null-1-1`, `null-1-2`,
   `null-1-4` … `null-1-11`. Either a feature was deleted without renumbering,
   or a Draw Steel level-1 Null feature is missing from the transcription.
   Diff the level-1 feature list against the pin.

4. **Psi Boost (`null-7-2`) is a 7-option spend menu modelled as plain `Text`.**
   The description lists seven named boosts with individual Discipline costs
   (1/1/1/1/3/5/5). Structurally this is the single largest un-modelled decision
   surface in the class — it is a per-ability-use choice, made at play time, and
   Forge Steel gives the player no control for it at all. Our runtime will need
   a real spend-menu structure here; the builder does not, but the data model
   should not bury it in a prose blob. Same category, smaller: Null Field's own
   "spend 1 discipline for one of three named effects" free-maneuver menu
   (Gravitic Disruption / Inertial Anchor / Synaptic Break) is prose inside the
   `null-1-4` ability text.

5. **`level` and `characteristics` live on the class *definition* object.**
   `HeroClass.level` and `HeroClass.characteristics` are runtime per-hero fields
   on the same object as the static definition — the direct consequence of Forge
   Steel deep-copying the class into the hero. Our seed must drop both.
   Similarly `SubClass.selected: boolean` is per-hero state on a shared
   definition, and `FeatureChoiceData.selected` / `FeatureClassAbilityData.selectedIDs`
   / `FeatureSkillChoiceData.selected` are per-hero state living inside the
   definition tree.

6. **`SubClass.classID` is `''` in all three Null subclass files.** The
   back-pointer is never populated in data; association is positional (the
   `subclasses` array on the class). Our seed must set it explicitly.

7. **Subclass `abilities` arrays are all empty, yet `ClassAbility` choices claim
   to read them.** `createClassAbilityChoice` defaults
   `source.fromSelectedSubclassAbilities` to `true`, so all six of Null's
   ability-purchase controls advertise a subclass ability source that is
   permanently empty. Tradition abilities are instead delivered through `Choice`
   options at L2/L6/L9. Two different mechanisms for "gain an ability of cost N".
   Decide on **one** for our model — probably `Choice`-of-options for both,
   since a cost-tier pick is just a `Choice` with a computed option list.

8. **Level 3 is empty for every Tradition** (`features: []`, present but empty).
   The builder must not render an empty "Tradition" section at level 3. Also
   note the class *does* have level-3 content, so the level itself isn't blank.

9. **All three Traditions' Discipline-12 (level 10) benefits are byte-identical
   prose.** `null-sub-1-10-1a`, `null-sub-2-10-1a`, `null-sub-3-10-1a` carry the
   same description. Likewise the Discipline-6 and Discipline-10 benefits are
   structurally identical across all three (Edge, then DoubleEdge, on Grab and
   Knockback). Either the rulebook genuinely repeats these, or the transcription
   copy-pasted. **VERIFY-AGAINST-PIN** — if genuine, hoist to a shared
   class-level feature rather than triplicating rows.

10. **`HeroicResourceThreshold.level` is `1` on every threshold, including the
    level-4/7/10 ones.** `createHeroicResourceThreshold` defaults `level` to `1`
    and none of the Null files pass it. The threshold's real gating level is its
    *placement* in `featuresByLevel`, so the `level` field is dead/misleading
    data. Do not carry it into our schema; derive from placement.

11. **Two `null-9-1*` features share the name "I Am the Weapon".** `null-9-1a`
    (Bonus) and `null-9-1b` (ConditionImmunity) are one rulebook feature split
    into two rows with a duplicated name. Our renderer must group by name (or we
    should wrap them in a `Multiple` at seed time, as `null-1-6` does for Null
    Speed) or the sheet shows the same heading twice.

12. **`null-1-8` (Multiple) has no `name`.** The factory derives one by joining
    child names → `"Psionic Martial Arts, Psionic Martial Arts, Psionic Martial
    Arts"`. Cosmetic bug in the source; give it an explicit name.

13. **`null-sub-2-2-1b` (Cryokinetic cold immunity) has no `name`** → defaults to
    `"Damage Modifier"`. It is mechanically part of *Entropic Adaptability*
    (`null-sub-2-2-1`), and the level-9 ability *Absolute Zero* refers back to
    "the cold damage immunity granted by your Entropic Adaptability trait" —
    a cross-feature reference by prose name that our data has no link for. This
    is why Cryokinetic has 12 top-level features where the others have 11.

14. **`null-1-5` Inertial Shield is a triggered action with `free: false`**,
    while every other Null triggered ability (`null-3-2` Reorder,
    `null-ability-21`, `null-ability-28`, and the L9 Tradition triggers) is
    `free: true`. Structurally significant — it consumes the non-free triggered
    action slot. **VERIFY-AGAINST-PIN.**

15. **Two abilities use `AbilityDistanceType.Special` with the literal string
    `'Self; see below'`** (`null-ability-28`, `null-sub-1-6-1b`) and one uses
    `target: 'Special'` (`null-sub-2-6-1b` Wall of Ice). Distances and targets
    are free strings in this model, not structured; anything we want to reason
    about spatially (per DEC-0011 the engine consumes asserted facts, not
    geometry) will hit these three.

16. **`null-1-4` Null Field is a persistent, out-of-encounter aura.** Its text
    says it "remains active even after an encounter ends" and ends only on dying
    or a voluntary no-action dismissal, and at least six later features/abilities
    read its area (`null-3-2`, `null-4-2`, `null-ability-10`, `-17` … `-20`,
    `-23`, `-28`, and Tradition features at L5/L8). Structurally it is a
    long-lived hero-scoped effect with a mutable size (increased by
    `null-ability-10` +1, the level-7/9/11 field abilities +1 each until end of
    encounter, and 1 Order at level 10). Our runtime needs a first-class
    "aura size" value; the builder needs to display it. **Text
    VERIFY-AGAINST-PIN** — I have not reproduced the rules text here.

17. **`Perk` default list includes `Supernatural`, and `SkillList` has a
    `Custom` member the perk default has no analogue for.** `null-4-3`,
    `null-8-1`, `null-10-5` fall back to all 6 perk lists including
    `Supernatural`; the skill defaults use 5 lists and exclude
    `SkillList.Custom`. Worth confirming the "any perk" and "any skill" pools
    against the pin rather than inheriting Forge Steel's defaults.

18. **Unresolved from the source:** whether the level-1 `Choice`
    (`selectAt: 'respite'`) is also re-selectable during play, whether
    `HeroOverview.background` matters here (it does not — Null contributes
    nothing to it; it is a display concatenation and there is no "background" in
    Draw Steel), and what the missing `null-1-3` was.
