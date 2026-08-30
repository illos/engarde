# Class — Talent

> **Provenance — read before implementing.**
> Structure in this file is mapped from **Forge Steel**
> (github.com/andyaiken/forgesteel, GPL-3.0), commit `01672c1`, read 2026-08-29.
> Forge Steel is an independent third-party transcription of Draw Steel and is
> **not** our canon source. Every name, number, count and option list below is
> **UNVERIFIED** and must be confirmed against the pinned SteelCompendium
> corpus (DEC-0008) before it is implemented or shown to a user.
> This file is a **structural map for UI and data-model design**, not a rules source.

Source files (read-only):
`src/data/classes/talent/talent.ts` (1208 lines),
`chronopathy.ts` (318), `telekinesis.ts` (337), `telepathy.ts` (334).

Read `00-foundation.md` first — the vocabulary, the `Feature` union, the
definition/selection split and the characteristic-array rules are defined there
and are not repeated here.

---

## Identity

| Field | Value | Notes |
|---|---|---|
| `id` | `class-talent` | |
| `name` | `Talent` | |
| `description` | `text: VERIFY-AGAINST-PIN` | two paragraphs of flavour prose |
| `type` | `'standard'` | not `'master'` |
| `subclassName` | `Tradition` | UI label for the subclass control |
| `subclassCount` | `1` | pick exactly one tradition |
| `primaryCharacteristicsOptions` | `[ [ Reason, Presence ] ]` | **one** option group → **no player choice**; `hero-edit-page.tsx:268` auto-assigns when `length === 1` |
| `primaryCharacteristics` | `[]` in the definition | populated per-hero from the above |
| `featuresByLevel` | levels 1–10, all present | 46 top-level features |
| `abilities` | 28 abilities | the `ClassAbility` draw pool |
| `subclasses` | `chronopathy`, `telekinesis`, `telepathy` | ids `talent-sub-1/2/3` |
| `level` | `1` | definition default; per-hero in practice |
| `characteristics` | `[]` | definition default; per-hero in practice |

Because there are exactly two primary characteristics, the permitted
characteristic arrays are the `primaryCount === 2` set: `[2,-1,-1]`, `[1,0,0]`,
`[1,1,-1]` applied to Might / Agility / Intuition, with Reason and Presence
fixed at 2. (`HeroLogic.getCharacteristicArrays` / `calculateCharacteristicArrays`.)

**Heroic resource:** `Clarity` (`talent-resource`, level 1).
**Epic resource:** `Vision` (`talent-10-7`, level 10, `type: 'epic'`).
**No `Kit` feature at any level** — Talent is a kitless class; see Anomalies §A8.

---

## Level progression

Builder-call defaults are resolved in every row (e.g. `createChoice` with no
`count` → `count: 1`, `selectAt: 'build'`; `createPerk` with no `lists` → all
six perk lists; `createSkillChoice` with no `options`/`listOptions` → the five
non-Custom skill lists). "Choice? = no" rows are inert or flat-stat features
that fold into derived stats with no control.

Column `Selection shape` describes the payload we would store under
`selections[featureId]`; `—` means nothing is stored.

### Level 1 — 13 features

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 1 | `talent-stamina` | Stamina | `Bonus` | no | — | — | `field: Stamina, value: 18, valuePerLevel: 6, valuePerEchelon: 0` | — |
| 1 | `talent-recoveries` | Recoveries | `Bonus` | no | — | — | `field: Recoveries, value: 8` | — |
| 1 | `talent-resource` | Clarity | `HeroicResource` | no | — | — | `type: 'heroic'`, 2 `gains`, `thresholds: []`, `canBeNegative: true`, `value: 0`, `details: VERIFY-AGAINST-PIN` | — (runtime value, not a build selection) |
| 1 | `talent-skill-a` | Skills | `SkillChoice` | **yes** | 2 | `build` | `options: []`, `listOptions` → default `[Crafting, Exploration, Interpersonal, Intrigue, Lore]` | `string[2]` — **ships pre-filled `['Psionics','Read Person']`** (see §A1) |
| 1 | `talent-skill-c` | Interpersonal / Lore Skills | `SkillChoice` | **yes** | 2 | `build` | `listOptions: [Interpersonal, Lore]` | `string[2]` |
| 1 | `talent-1-2` | Mind Spike | `Ability` | no | — | — | granted ability, `cost: 0` | — |
| 1 | `talent-1-3` | Language | `LanguageChoice` | **yes** | 1 | `build` | `options: []`, `allowedTypes` → default `[Common, Regional, Cultural, Dead]` | `string[1]` — **ships pre-filled `['Mindspeech']`** (see §A1) |
| 1 | `talent-1-4` | Telepathic Speech | `Text` | no | — | — | `text: VERIFY-AGAINST-PIN` | — |
| 1 | `talent-1-5` | Psionic Augmentation | `Choice` | **yes** | 1 | **`respite`** | 5 inline options, each `value: 1` | `featureId` of the chosen option |
| 1 | `talent-1-6` | Talent Ward | `Choice` | **yes** | 1 | **`respite`** | 4 inline options, each `value: 1` | `featureId` of the chosen option |
| 1 | `talent-1-7` | Signature Ability | `ClassAbility` | **yes** | 2 | build | `cost: 'signature'`, `minLevel: 1`, `source: { fromClassAbilities: true, fromSelectedSubclassAbilities: true, rest false }` → 8 candidates | `abilityId[2]` |
| 1 | `talent-1-8` | 3pt Ability | `ClassAbility` | **yes** | 1 | build | `cost: 3`, same source mask → 4 candidates | `abilityId[1]` |
| 1 | `talent-1-9` | 5pt Ability | `ClassAbility` | **yes** | 1 | build | `cost: 5`, same source mask → 4 candidates | `abilityId[1]` |

`talent-resource` gains (both `frequency: OncePerRound`, `used: false`):

| tag | trigger | value |
|---|---|---|
| `start` | `Start of your turn` | `1d3` |
| `move` | `A creature is force moved` | `1` |

**`talent-1-5` Psionic Augmentation — option tree** (all options `value: 1`):

| Option ID | Name | FeatureType | Contents |
|---|---|---|---|
| `talent-1-5a` | Battle Augmentation | `Multiple` | `talent-1-5aa` `Bonus` `field: Stamina, value: 0, valuePerEchelon: 3` · `talent-1-5ab` `AbilityDamage` `keywords: [Weapon], value: 1, damageType: Damage` · `talent-1-5ac` `Proficiency` `weapons: [Light], armor: [Light]` |
| `talent-1-5b` | Density Augmentation | `Multiple` | `talent-1-5ba` `Bonus` `field: Stamina, valuePerEchelon: 6` · `talent-1-5bb` `Bonus` `field: Stability, value: 1` |
| `talent-1-5c` | Distance Augmentation | `AbilityDistance` | `keywords: [Psionic, Ranged], value: 2` (bare, **not** wrapped in `Multiple`) |
| `talent-1-5d` | Force Augmentation | `AbilityDamage` | `keywords: [Psionic], value: 1, damageType: Damage` (bare) |
| `talent-1-5e` | Speed Augmentation | `Multiple` | `talent-1-5ea` `Bonus` `field: Speed, value: 1` · `talent-1-5eb` `Bonus` `field: Disengage, value: 1` |

**`talent-1-6` Talent Ward — option tree** (all options `value: 1`):

| Option ID | Name | FeatureType | Contents |
|---|---|---|---|
| `talent-1-6a` | Entropy Ward | `Text` | `text: VERIFY-AGAINST-PIN` |
| `talent-1-6b` | Repulsive Ward | `Ability` | free triggered action, `trigger: 'An adjacent creature deals damage to you.'`, `distance: [Self]`, `target: 'Self'`, `keywords: []`, `cost: 0` |
| `talent-1-6c` | Steel Ward | `Text` | `text: VERIFY-AGAINST-PIN` |
| `talent-1-6d` | Vanishing Ward | `Text` | `text: VERIFY-AGAINST-PIN` |

### Level 2 — 1 feature

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 2 | `talent-2-1` | Interpersonal / Lore / Supernatural Perk | `Perk` | **yes** | 1 | build (no `selectAt` on `Perk`) | `lists: [Interpersonal, Lore, Supernatural]` resolved against the global perk pool | `perkId[1]` |

### Level 3 — 2 features

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 3 | `talent-3-1` | Scan | `Text` | no | — | — | `text: VERIFY-AGAINST-PIN` | — |
| 3 | `talent-3-2` | 7pt Ability | `ClassAbility` | **yes** | 1 | build | `cost: 7`, `minLevel: 1`, default source mask → 4 candidates | `abilityId[1]` |

### Level 4 — 7 features

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 4 | `talent-4-1a` | Reason | `CharacteristicBonus` | no | — | — | `characteristic: Reason, value: 1` | — |
| 4 | `talent-4-1b` | Presence | `CharacteristicBonus` | no | — | — | `characteristic: Presence, value: 1` | — |
| 4 | `talent-4-2` | Mind Projection | `Ability` | no | — | — | maneuver, `distance: [Self]`, `target: 'Self'`, `keywords: []`, `cost: 0` | — |
| 4 | `talent-4-3` | Mind Recovery | `Multiple` | no | — | — | `talent-4-3a` `Text` · `talent-4-3b` `HeroicResourceGain` | — |
| 4 | `talent-4-4` | Perk | `Perk` | **yes** | 1 | build | `lists` → default all six `[Crafting, Exploration, Interpersonal, Intrigue, Lore, Supernatural]` | `perkId[1]` |
| 4 | `talent-4-5` | Skill | `SkillChoice` | **yes** | 1 | build | `listOptions: [Crafting, Exploration, Interpersonal, Intrigue, Lore]` (explicit) | `string[1]` |
| 4 | `talent-4-6` | Suspensor Field | `Text` | no | — | — | `text: VERIFY-AGAINST-PIN` | — |

`talent-4-3b` `HeroicResourceGain`: `tag: 'move 2'`, `trigger: 'A creature is
force moved'`, `value: '2'`, `frequency: OncePerRound`, **`replacesTags: ['move']`**.

### Level 5 — 1 feature

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 5 | `talent-5-1` | 9pt Ability | `ClassAbility` | **yes** | 1 | build | `cost: 9`, default source mask → 4 candidates | `abilityId[1]` |

### Level 6 — 2 features

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 6 | `talent-6-1` | Interpersonal / Lore / Supernatural Perk | `Perk` | **yes** | 1 | build | `lists: [Interpersonal, Lore, Supernatural]` | `perkId[1]` |
| 6 | `talent-6-2` | Psi Boost | `Text` | no | — | — | `text: VERIFY-AGAINST-PIN` — **seven named boosts with resource costs live entirely in prose**; see §A6 | — |

### Level 7 — 9 features

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 7 | `talent-7-1` | Ancestral Memory | `Text` | no | — | — | `text: VERIFY-AGAINST-PIN` — describes a **respite-time skill swap**; see §A9 | — |
| 7 | `talent-7-2` | Cascading Strain | `Text` | no | — | — | `text: VERIFY-AGAINST-PIN` | — |
| 7 | `talent-7-3a` | Might | `CharacteristicBonus` | no | — | — | `value: 1` | — |
| 7 | `talent-7-3b` | Agility | `CharacteristicBonus` | no | — | — | `value: 1` | — |
| 7 | `talent-7-3c` | Reason | `CharacteristicBonus` | no | — | — | `value: 1` | — |
| 7 | `talent-7-3d` | Intuition | `CharacteristicBonus` | no | — | — | `value: 1` | — |
| 7 | `talent-7-3e` | Presence | `CharacteristicBonus` | no | — | — | `value: 1` | — |
| 7 | `talent-7-4` | Lucid Mind | `HeroicResourceGain` | no | — | — | `tag: 'start 2'`, `trigger: 'Start of your turn'`, `value: '1d3 + 1'`, `OncePerRound`, `replacesTags: ['start']` | — |
| 7 | `talent-7-5` | Skill | `SkillChoice` | **yes** | 1 | build | `listOptions: [Crafting, Exploration, Interpersonal, Intrigue, Lore]` | `string[1]` |

### Level 8 — 2 features

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 8 | `talent-8-1` | Perk | `Perk` | **yes** | 1 | build | `lists` → default all six | `perkId[1]` |
| 8 | `talent-8-2` | 11pt Ability | `ClassAbility` | **yes** | 1 | build | `cost: 11`, default source mask → 4 candidates | `abilityId[1]` |

### Level 9 — 1 feature

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 9 | `talent-9-1` | Fortress of Perfect Thought | `Multiple` | no | — | — | three nested features (below) | — |

| Nested ID | FeatureType | Data |
|---|---|---|
| `talent-9-1a` | `Text` | `text: VERIFY-AGAINST-PIN` |
| `talent-9-1b` | `DamageModifier` | one modifier: `damageType: Psychic, type: Immunity, value: 10, valuePerLevel: 0, valuePerEchelon: 0, valueCharacteristicMultiplier: 1` |
| `talent-9-1c` | `ConditionImmunity` | `conditions: [Taunted, Frightened]` |

### Level 10 — 8 features

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 10 | `talent-10-1a` | Reason | `CharacteristicBonus` | no | — | — | `value: 1` | — |
| 10 | `talent-10-1b` | Presence | `CharacteristicBonus` | no | — | — | `value: 1` | — |
| 10 | `talent-10-2` | Clear Mind | `HeroicResourceGain` | no | — | — | `tag: 'move 3'`, `trigger: 'A creature is force moved'`, `value: '3'`, `OncePerRound`, `replacesTags: ['move', 'move 2']` | — |
| 10 | `talent-10-3` | Omnisensory | `Multiple` | no | — | — | `talent-10-3a` `AbilityDistance` `keywords: [Ranged], value: 10` · `talent-10-3b` `Text` | — |
| 10 | `talent-10-4` | Interpersonal / Lore / Supernatural Perk | `Perk` | **yes** | 1 | build | `lists: [Interpersonal, Lore, Supernatural]` | `perkId[1]` |
| 10 | `talent-10-5` | Psion | `Multiple` | no | — | — | `talent-10-5a` `HeroicResourceGain` `tag: 'start 3'`, `value: '1d3 + 2'`, `OncePerRound`, `replacesTags: ['start', 'start 2']` · `talent-10-5b` `Text` | — |
| 10 | `talent-10-6` | Skill | `SkillChoice` | **yes** | 1 | build | `listOptions: [Crafting, Exploration, Interpersonal, Intrigue, Lore]` | `string[1]` |
| 10 | `talent-10-7` | Vision | `HeroicResource` | no | — | — | `type: 'epic'`, one gain `{ tag: 'respite', trigger: 'Finish a respite', value: 'XP gained', frequency: AtWill }`, `canBeNegative: false`, `details: VERIFY-AGAINST-PIN` | — |

---

## Subclasses

`subclassName: 'Tradition'`, `subclassCount: 1`. All three carry
`classID: ''` (empty in the data — the parent link is positional, via
`talent.subclasses`) and `abilities: []` (empty pool — **no tradition ability is
purchasable via `ClassAbility`; every tradition ability is granted or chosen
from an inline `Choice`**).

All three declare `featuresByLevel` entries for levels **1–10**, with
**levels 3, 4, 7 and 10 carrying `features: []`** — present but empty.

### Tradition 1 — Chronopathy (`talent-sub-1`)

10 features.

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 1 | `talent-sub-1-1-1` | Accelerate | `Ability` | no | — | — | maneuver, `cost: 0` | — |
| 1 | `talent-sub-1-1-2` | Again | `Ability` | no | — | — | triggered (non-free), `cost: 0` | — |
| 2 | `talent-sub-1-2-1` | Ease the Hours | `Text` | no | — | — | `text: VERIFY-AGAINST-PIN` | — |
| 2 | `talent-sub-1-2-2` | 2nd-Level Tradition Ability | `Choice` | **yes** | 1 | build | 2 inline options, each `value: 1`: `talent-sub-1-2-2a` Applied Chronometrics · `talent-sub-1-2-2b` Slow | `featureId` |
| 3 | — | — | — | — | — | — | **`features: []`** | — |
| 4 | — | — | — | — | — | — | **`features: []`** | — |
| 5 | `talent-sub-1-5-1` | Distortion Temporal | `Text` | no | — | — | `text: VERIFY-AGAINST-PIN` | — |
| 5 | `talent-sub-1-5-2` | Speed of Thought | `Text` | no | — | — | `text: VERIFY-AGAINST-PIN` | — |
| 6 | `talent-sub-1-6-1` | 6th-Level Tradition Ability | `Choice` | **yes** | 1 | build | 2 options: `talent-sub-1-6-1a` Fate · `talent-sub-1-6-1b` Statis Field | `featureId` |
| 7 | — | — | — | — | — | — | **`features: []`** | — |
| 8 | `talent-sub-1-8-1` | Doubling the Hours | `Text` | no | — | — | `text: VERIFY-AGAINST-PIN` | — |
| 8 | `talent-sub-1-8-2` | Stasis Shield | `Ability` | no | — | — | triggered (non-free), `cost: 3` | — |
| 9 | `talent-sub-1-9-1` | 9th-Level Tradition Ability | `Choice` | **yes** | 1 | build | 2 options: `talent-sub-1-9-1a` Acceleration Field · `talent-sub-1-9-1b` Borrow From the Future | `featureId` |
| 10 | — | — | — | — | — | — | **`features: []`** | — |

### Tradition 2 — Telekinesis (`talent-sub-2`)

10 features.

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 1 | `talent-sub-2-1-1` | Minor Telekinesis | `Ability` | no | — | — | maneuver, `cost: 0`, two `Spend` fields (one `repeatable: true`) | — |
| 1 | `talent-sub-2-1-2` | Repel | `Ability` | no | — | — | triggered (non-free), `cost: 0` | — |
| 2 | `talent-sub-2-2-1` | Ease their Fall | `Ability` | no | — | — | **free** triggered, `cost: 0`, `keywords: []`, `description: ''` | — |
| 2 | `talent-sub-2-2-2` | 2nd-Level Tradition Ability | `Choice` | **yes** | 1 | build | 2 options: `talent-sub-2-2-2a` Gravitic Burst · `talent-sub-2-2-2b` Levity and Gravity | `featureId` |
| 3 | — | — | — | — | — | — | **`features: []`** | — |
| 4 | — | — | — | — | — | — | **`features: []`** | — |
| 5 | `talent-sub-2-5-1` | Kinetic Amplifier | `Text` | no | — | — | `text: VERIFY-AGAINST-PIN` — surge spend, prose only | — |
| 5 | `talent-sub-2-5-2` | Triangulate | `Text` | no | — | — | `text: VERIFY-AGAINST-PIN` | — |
| 6 | `talent-sub-2-6-1` | 6th-Level Tradition Ability | `Choice` | **yes** | 1 | build | 2 options: `talent-sub-2-6-1a` Gravitic Well · `talent-sub-2-6-1b` Greater Kinetic Grip | `featureId` |
| 7 | — | — | — | — | — | — | **`features: []`** | — |
| 8 | `talent-sub-2-8-1` | Levitation Field | `Ability` | no | — | — | maneuver, `cost: 3`, one `Spend 5` field | — |
| 8 | `talent-sub-2-8-2` | Low Gravity | `Text` | no | — | — | `text: VERIFY-AGAINST-PIN` | — |
| 9 | `talent-sub-2-9-1` | 9th-Level Tradition Ability | `Choice` | **yes** | 1 | build | 2 options: `talent-sub-2-9-1a` Fulcrum · `talent-sub-2-9-1b` Gravitic Nova | `featureId` |
| 10 | — | — | — | — | — | — | **`features: []`** | — |

### Tradition 3 — Telepathy (`talent-sub-3`)

10 features.

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 1 | `talent-sub-3-1-1` | Feedback Loop | `Ability` | no | — | — | triggered (non-free), `cost: 0` | — |
| 1 | `talent-sub-3-1-2` | Remote Assistance | `Ability` | no | — | — | maneuver, `cost: 0`, one `Spend` field (default `value: 1`) | — |
| 2 | `talent-sub-3-2-1` | Ease the Mind | `Multiple` | no | — | — | `talent-sub-3-2-1a` `Text` · `talent-sub-3-2-1b` `RollModifier` `{ modifier: Edge, rollType: Test (default), skills: [], skillLists: [], characteristics: [], condition: 'When stopping combat and starting a negotiation' }` | — |
| 2 | `talent-sub-3-2-2` | 2nd-Level Tradition Ability | `Choice` | **yes** | 1 | build | 2 options: `talent-sub-3-2-2a` Overwhelm · `talent-sub-3-2-2b` Synaptic Override | `featureId` |
| 3 | — | — | — | — | — | — | **`features: []`** | — |
| 4 | — | — | — | — | — | — | **`features: []`** | — |
| 5 | `talent-sub-3-5-1` | Compulsion | `Text` | no | — | — | `text: VERIFY-AGAINST-PIN` | — |
| 5 | `talent-sub-3-5-2` | Remote Amplification | `Multiple` | no | — | — | `talent-sub-3-5-2a` `Text` · `talent-sub-3-5-2b` `AbilityDistance` `keywords: [Ranged, Psionic], value: 5` | — |
| 6 | `talent-sub-3-6-1` | 6th-Level Tradition Ability | `Choice` | **yes** | 1 | build | 2 options: `talent-sub-3-6-1a` Synaptic Conditioning · `talent-sub-3-6-1b` Synaptic Dissipation | `featureId` |
| 7 | — | — | — | — | — | — | **`features: []`** | — |
| 8 | `talent-sub-3-8-1` | Mindlink | `Text` | no | — | — | `text: VERIFY-AGAINST-PIN` — describes a **respite-time selection of N creatures**; see §A9 | — |
| 8 | `talent-sub-3-8-2` | Universal Connection | `Text` | no | — | — | `text: VERIFY-AGAINST-PIN` | — |
| 9 | `talent-sub-3-9-1` | 9th-Level Tradition Ability | `Choice` | **yes** | 1 | build | 2 options: `talent-sub-3-9-1a` Resonant Mind Spike · `talent-sub-3-9-1b` Synaptic Terror | `featureId` |
| 10 | — | — | — | — | — | — | **`features: []`** | — |

---

## Abilities

Structural only. `Action type` resolves the `FactoryLogic.type.create*` call:
`Main` = `AbilityUsage.MainAction`, `Maneuver` = `AbilityUsage.Maneuver`,
`Triggered` = `AbilityUsage.Trigger` (with `free: true|false`).
All abilities in these four files use the default `minLevel: 1` and
`repeatable: false` (no ability sets either). Effect prose is
`text: VERIFY-AGAINST-PIN` throughout and is not transcribed.

### `talent.abilities` — the `ClassAbility` draw pool (28)

| ID | Name | Cost | Keywords | Distance | Target | Action type |
|---|---|---|---|---|---|---|
| `talent-ability-1` | Entropic Bolt | signature | Chronopathy, Psionic, Ranged, Strike | Ranged 10 | One creature or object | Main |
| `talent-ability-2` | Hoarfrost | signature | Cryokinesis, Psionic, Ranged, Strike | Ranged 10 | One creature | Main |
| `talent-ability-3` | Incinerate | signature | Area, Fire, Psionic, Ranged, Pyrokinesis | Cube 3 within 10 | Each enemy in the area | Main |
| `talent-ability-4` | Kinetic Grip | signature | Psionic, Ranged, Telekinesis | Ranged 10 | One creature or object | Main |
| `talent-ability-5` | Kinetic Pulse | signature | Area, Psionic, Telepathy | Burst 1 | Each enemy in the area | Main |
| `talent-ability-6` | Materialize | signature | Psionic, Ranged, Resopathy, Strike | Ranged 10 | One creature or object | Main |
| `talent-ability-7` | Optic Blast | signature | Metamorphosis, Psionic, Ranged, Strike | Ranged 10 | One creature or object | Main |
| `talent-ability-8` | Spirit Sword | signature | Animapathy, Melee, Psionic, Strike | Melee 2 | One creature or object | Main |
| `talent-ability-9` | Awe | 3 | Psionic, Ranged, Strike, Telepathy | Ranged 10 | One creature | Main |
| `talent-ability-10` | Choke | 3 | Psionic, Ranged, Strike, Telekinesis | Ranged 10 | One creature | Main |
| `talent-ability-11` | Precognition | 3 | Chronopathy, Melee, Psionic | Melee 2 | Self or one ally | Main |
| `talent-ability-12` | Smolder | 3 | Psionic, Pyrokinesis, Ranged, Strike | Ranged 10 | One creature | Main |
| `talent-ability-13` | Flashback | 5 | Chronopathy, Psionic, Ranged | Ranged 10 | Self or one ally | Maneuver |
| `talent-ability-14` | Inertia Soak | 5 | Psionic, Ranged, Telekinesis | Ranged 10 | Self or one ally | Maneuver |
| `talent-ability-15` | Iron | 5 | Metamorphosis, Psionic, Ranged | Ranged 10 | Self or one ally | Maneuver |
| `talent-ability-16` | Perfect Clarity | 5 | Psionic, Ranged, Telepathy | Ranged 10 | Self or one ally | Maneuver |
| `talent-ability-17` | Fling Through Time | 7 | Chronopathy, Psionic, Ranged, Strike | Ranged 10 | One creature or object | Main |
| `talent-ability-18` | Force Orb | 7 | Psionic, Ranged, Strike, Telekinesis | Self | `Self; see below` | Main |
| `talent-ability-19` | Reflector Field | 7 | Area, Psionic, Telepathy | Aura 3 | Special | Main |
| `talent-ability-20` | Soul Burn | 7 | Animapathy, Psionic, Ranged, Strike | Ranged 10 | One creature | Main |
| `talent-ability-21` | Exothermic Shield | 9 | Pyrokinesis, Psionic, Ranged | Ranged 10 | Self or one ally | Maneuver |
| `talent-ability-22` | Hypersonic | 9 | Area, Charge, Psionic, Telekinesis | Line 5 × 2 within 1 | Each enemy in the area | Main |
| `talent-ability-23` | Mind Snare | 9 | Psionic, Ranged, Strike, Telepathy | Ranged 10 | One creature | Main |
| `talent-ability-24` | Soulbound | 9 | Animapathy, Psionic, Ranged, Strike | Ranged 10 | Two enemies | Main |
| `talent-ability-25` | Doubt | 11 | Animapathy, Psionic, Ranged, Strike | Ranged 10 | One creature | Main |
| `talent-ability-26` | Mindwipe | 11 | Melee, Psionic, Ranged, Telepathy | Melee 2 | One creature | Main |
| `talent-ability-27` | Rejuvenate | 11 | Chronopathy, Psionic, Ranged | Ranged 10 | One creature | Maneuver |
| `talent-ability-28` | Steel | 11 | Metamorphosis, Psionic, Ranged | Ranged 10 | One creature | Maneuver |

Pool sizes by cost: **signature 8 · 3pt 4 · 5pt 4 · 7pt 4 · 9pt 4 · 11pt 4**.
The `ClassAbility` config filters `a.cost === data.cost && a.minLevel <= data.minLevel`,
de-duplicates by **name**, and excludes ability ids the hero already has
(`class-ability.tsx`).

### Abilities granted directly by class features (3)

| ID | Name | Cost | Keywords | Distance | Target | Action type |
|---|---|---|---|---|---|---|
| `talent-1-2` | Mind Spike | 0 | Psionic, Ranged, Strike, Telepathy | Ranged 10 | One creature | Main, `freeStrike: true`, `qualifiers: ['can be used as a ranged free strike']` |
| `talent-1-6b` | Repulsive Ward | 0 | *(none)* | Self | Self | Triggered, **free**, `trigger: 'An adjacent creature deals damage to you.'` |
| `talent-4-2` | Mind Projection | 0 | *(none)* | Self | Self | Maneuver |

`talent-1-6b` is reachable only if the `talent-1-6` Talent Ward choice selects it.

### Chronopathy abilities (9)

| ID | Name | Cost | Keywords | Distance | Target | Action type |
|---|---|---|---|---|---|---|
| `talent-sub-1-1-1` | Accelerate | 0 | Psionic, Ranged | Ranged 10 | Self or one creature | Maneuver (+ `Spend 2` field) |
| `talent-sub-1-1-2` | Again | 0 | Psionic, Ranged | Ranged 10 | Self or one creature | Triggered, non-free, `trigger: 'The target makes an ability roll.'` |
| `talent-sub-1-2-2a` | Applied Chronometrics | 5 | Chronopathy, Psionic, Ranged | Ranged 10 | Special | Maneuver |
| `talent-sub-1-2-2b` | Slow | 5 | Chronopathy, Psionic, Ranged | Ranged 10 | Three creatures or objects | Maneuver |
| `talent-sub-1-6-1a` | Fate | 9 | Chronopathy, Psionic, Melee | Melee 2 | One enemy | Main |
| `talent-sub-1-6-1b` | Statis Field | 9 | Area, Chronopathy, Psionic, Ranged | Cube 4 within 10 | Each creature and object in the area | Main |
| `talent-sub-1-8-2` | Stasis Shield | 3 | Psionic, Ranged | Ranged 10 | Self or one creature or object | Triggered, non-free, `trigger: 'The target takes damage.'` |
| `talent-sub-1-9-1a` | Acceleration Field | 11 | Chronopathy, Psionic, Ranged | Ranged 5 | Three allies | Main |
| `talent-sub-1-9-1b` | Borrow From the Future | 11 | Area, Chronopathy, Psionic | Burst 2 | Each ally in the area | Maneuver |

### Telekinesis abilities (10)

| ID | Name | Cost | Keywords | Distance | Target | Action type |
|---|---|---|---|---|---|---|
| `talent-sub-2-1-1` | Minor Telekinesis | 0 | Psionic, Ranged | Ranged 10 | Self or one size 1 creature or object | Maneuver (+ `Spend 2` **repeatable**, `Spend 3`) |
| `talent-sub-2-1-2` | Repel | 0 | Psionic, Ranged | Ranged 10 | Self or one ally | Triggered, non-free, `trigger: 'The target takes damage or is force moved.'` |
| `talent-sub-2-2-1` | Ease their Fall | 0 | *(none)* | Self | Self | Triggered, **free**, `trigger: 'You land after a fall, or any falling creature lands within 2 squares of you.'` |
| `talent-sub-2-2-2a` | Gravitic Burst | 5 | Area, Psionic, Telekinesis | Burst 1 | Each enemy in the area | Main |
| `talent-sub-2-2-2b` | Levity and Gravity | 5 | Psionic, Ranged, Strike, Telekinesis | Ranged 10 | One creature or object | Main |
| `talent-sub-2-6-1a` | Gravitic Well | 9 | Area, Psionic, Ranged, Telekinesis | Cube 4 within 10 | Each enemy and object in the area | Main |
| `talent-sub-2-6-1b` | Greater Kinetic Grip | 9 | Psionic, Ranged, Strike, Telekinesis | Ranged 10 | One creature or object | Main |
| `talent-sub-2-8-1` | Levitation Field | 3 | Area, Psionic | Burst 3 | Each ally in the area | Maneuver (+ `Spend 5` field) |
| `talent-sub-2-9-1a` | Fulcrum | 11 | Area, Psionic, Telekinesis | **Special** (`special: 'Special'`) | Each enemy and object in the area | Main |
| `talent-sub-2-9-1b` | Gravitic Nova | 11 | Area, Psionic, Telekinesis | Burst 3 | Each enemy and object in the area | Main |

### Telepathy abilities (8)

| ID | Name | Cost | Keywords | Distance | Target | Action type |
|---|---|---|---|---|---|---|
| `talent-sub-3-1-1` | Feedback Loop | 0 | Psionic, Ranged | Ranged 10 | One creature | Triggered, non-free, `trigger: 'The target deals damage to an ally.'` |
| `talent-sub-3-1-2` | Remote Assistance | 0 | Psionic, Ranged | Ranged 10 | One creature or object | Maneuver (+ `Spend` field, default `value: 1`) |
| `talent-sub-3-2-2a` | Overwhelm | 5 | Psionic, Ranged, Strike, Telepathy | Ranged 10 | One creature | Main |
| `talent-sub-3-2-2b` | Synaptic Override | 5 | Psionic, Ranged, Telepathy | Ranged 10 | One enemy | Main |
| `talent-sub-3-6-1a` | Synaptic Conditioning | 9 | Psionic, Melee, Ranged, Telepathy | Melee 2 | One creature | Main |
| `talent-sub-3-6-1b` | Synaptic Dissipation | 9 | Psionic, Ranged, Strike, Telepathy | Ranged 10 | Special | Maneuver |
| `talent-sub-3-9-1a` | Resonant Mind Spike | 11 | Psionic, Ranged, Strike, Telepathy | Ranged 10 | One creature | Main |
| `talent-sub-3-9-1b` | Synaptic Terror | 11 | Area, Psionic, Telepathy | Burst 3 | Each ally and enemy in the area | Main |

**Total abilities defined across the four Talent files: 58**
(28 pool + 3 class-granted + 9 + 10 + 8 tradition).

### Ability section shapes present

| Section kind | Where | Structural note |
|---|---|---|
| `roll` (`PowerRoll`) | most attack/effect abilities | `characteristic` is `Reason` or `Presence` (never both in this class); `bonus: 0` throughout |
| `text` | most abilities | prose |
| `field` named **`Strained`** | ~all class-pool abilities and most tradition abilities | produced by `createAbilitySectionField` → `value: 0, repeatable: false`. **The only machine-readable marker of the strain mechanic is the literal name string `'Strained'`.** |
| `field` named `Spend` | `talent-sub-1-1-1`, `talent-sub-2-1-1` (×2), `talent-sub-2-8-1`, `talent-sub-3-1-2` | produced by `createAbilitySectionSpend` → `value` = the resource cost, `repeatable` optional |
| `package` | absent in this class | — |

`Strained` and `Spend` fields are the **same variant** (`AbilitySectionField`)
and are distinguishable only by the `name` string. See §A5.

---

## Choice-point inventory

In build order. "Cardinality" is the number of picks; "Pool" is the candidate
count *for this class*, where enumerable.

### Class-level, resolved at character creation

| # | Choice | Feature ID | Cardinality | Pool | Kind |
|---|---|---|---|---|---|
| 0 | Primary characteristics | — | **0 (auto)** | 1 group `[Reason, Presence]` | no control — auto-assigned |
| 1 | Characteristic array | — | 1 of 3 arrays, then 1 of the distinct permutations | `[2,-1,-1]`, `[1,0,0]`, `[1,1,-1]` over Might/Agility/Intuition | single-select over pre-expanded spreads |
| 2 | Tradition (subclass) | — | 1 | 3 | single-select |
| 3 | L1 skills (open) | `talent-skill-a` | 2 | all 5 skill lists | multi-select-2, searchable; **pre-filled** |
| 4 | L1 skills (restricted) | `talent-skill-c` | 2 | Interpersonal + Lore lists | multi-select-2, searchable |
| 5 | L1 language | `talent-1-3` | 1 | Common/Regional/Cultural/Dead languages | single-select, searchable; **pre-filled** |
| 6 | Psionic Augmentation | `talent-1-5` | 1 | 5 | single-select — **`selectAt: 'respite'`** |
| 7 | Talent Ward | `talent-1-6` | 1 | 4 | single-select — **`selectAt: 'respite'`** |
| 8 | Signature abilities | `talent-1-7` | 2 | 8 | multi-select-2, searchable |
| 9 | 3pt ability | `talent-1-8` | 1 | 4 | single-select, searchable |
| 10 | 5pt ability | `talent-1-9` | 1 | 4 | single-select, searchable |

### Per level-up

| Level | Choice | Feature ID | Cardinality | Pool |
|---|---|---|---|---|
| 2 | Perk (Interpersonal / Lore / Supernatural) | `talent-2-1` | 1 | global perk pool filtered to 3 lists |
| 2 | 2nd-Level Tradition Ability | `talent-sub-N-2-2` | 1 | 2 (per selected tradition) |
| 3 | 7pt ability | `talent-3-2` | 1 | 4 |
| 4 | Perk (any list) | `talent-4-4` | 1 | global perk pool, all 6 lists |
| 4 | Skill (any list) | `talent-4-5` | 1 | all 5 skill lists |
| 5 | 9pt ability | `talent-5-1` | 1 | 4 |
| 6 | Perk (Interpersonal / Lore / Supernatural) | `talent-6-1` | 1 | 3 lists |
| 6 | 6th-Level Tradition Ability | `talent-sub-N-6-1` | 1 | 2 |
| 7 | Skill (any list) | `talent-7-5` | 1 | all 5 skill lists |
| 8 | Perk (any list) | `talent-8-1` | 1 | all 6 lists |
| 8 | 11pt ability | `talent-8-2` | 1 | 4 |
| 9 | 9th-Level Tradition Ability | `talent-sub-N-9-1` | 1 | 2 |
| 10 | Perk (Interpersonal / Lore / Supernatural) | `talent-10-4` | 1 | 3 lists |
| 10 | Skill (any list) | `talent-10-6` | 1 | all 5 skill lists |

Levels **1** and **10** are the choice-heavy levels; levels **3** and **5**
carry exactly one choice each; **level 9** carries no *class* choice (only the
tradition's 9th-level ability choice).

### Re-made outside the builder

| Choice | Feature ID | When |
|---|---|---|
| Psionic Augmentation | `talent-1-5` | every respite (`selectAt: 'respite'`) |
| Talent Ward | `talent-1-6` | every respite (`selectAt: 'respite'`) |

`hero-respite-modal.tsx` surfaces exactly the features whose
`selectAt === 'respite'` (plus all `Kit` features — Talent has none).
**No Talent feature uses `selectAt: 'play'`.**

### Totals

| Metric | Count |
|---|---|
| Levels defined | 10 (class), 10 each (×3 traditions) |
| Class features (top-level) | **46** |
| Nested features, class (inside `Multiple` / `Choice` options) | **25** |
| Nested features, traditions | **22** (6 + 6 + 10) |
| Tradition features (top-level) | **10 + 10 + 10 = 30** |
| Build-time choice points, L1 (incl. characteristic array + tradition) | **10** |
| Choice points, L2–L10 (class + one tradition) | **14** |
| Abilities defined | **58** |
| Distinct `FeatureType`s used | **18** — `Ability`, `AbilityDamage`, `AbilityDistance`, `Bonus`, `CharacteristicBonus`, `Choice`, `ClassAbility`, `ConditionImmunity`, `DamageModifier`, `HeroicResource`, `HeroicResourceGain`, `LanguageChoice`, `Multiple`, `Perk`, `Proficiency`, `RollModifier`, `SkillChoice`, `Text` |

Not used by Talent: `Kit`, `Domain`, `DomainFeature`, `TitleChoice`,
`ItemChoice`, `Companion`, `Summon*`, `Toggle`, `Switch*`, `Package*`,
`TaggedFeature*`, `HeroicResourceThreshold`, `SaveThreshold`,
`PotencyResistance`, `Size`, `Speed`, `MovementMode`, `Language`,
`SkillCancelChoice`, `AncestryChoice`, `AncestryFeatureChoice`, `Complication`,
`AddOn`, `Follower`, `Fixture`, `ForController`, `Retainer`, `Malice*`,
`AbilityCost`, `AbilityKeyword`.

---

## UI surface

Ordered controls for the class step of the wizard, at level 1.

| # | Control | Kind | Binds to |
|---|---|---|---|
| 1 | Class picker | single-select (11 classes) | `classId` |
| 2 | Primary characteristics | **read-only display** — `Reason, Presence` | `primaryCharacteristics` (auto) |
| 3 | Characteristic array | single-select over concrete pre-expanded spreads | `characteristicArray` |
| 4 | Tradition | single-select (3 cards with description) | `subclassId` |
| 5 | Skills — pick 2 | multi-select-N, searchable, source = all 5 skill lists | `selections['talent-skill-a']` |
| 6 | Skills — pick 2 (Interpersonal / Lore) | multi-select-N, searchable, filtered | `selections['talent-skill-c']` |
| 7 | Language — pick 1 | single-select, searchable | `selections['talent-1-3']` |
| 8 | Psionic Augmentation | single-select, 5 cards; **badge: "re-chosen at respite"** | `selections['talent-1-5']` |
| 9 | Talent Ward | single-select, 4 cards; **badge: "re-chosen at respite"** | `selections['talent-1-6']` |
| 10 | Signature abilities — pick 2 | multi-select-N over a searchable ability list w/ full ability cards | `selections['talent-1-7']` |
| 11 | 3pt ability — pick 1 | single-select, searchable ability list | `selections['talent-1-8']` |
| 12 | 5pt ability — pick 1 | single-select, searchable ability list | `selections['talent-1-9']` |
| 13 | Granted features (read-only) | display list: Stamina, Recoveries, Clarity, Mind Spike, Telepathic Speech | — |

Level-up adds, per level, only the controls in the *Per level-up* table above,
each of the same kind:

| Feature kind | Control kind |
|---|---|
| `ClassAbility` | searchable ability list → single- or multi-select-N; options exclude already-owned ability ids and de-duplicate by name |
| `Perk` | searchable perk list filtered by `lists` |
| `SkillChoice` | searchable skill list filtered by `listOptions` |
| `Choice` (tradition ability) | single-select over 2 full ability cards |
| `Text` / `Bonus` / `CharacteristicBonus` / `Multiple` / `HeroicResourceGain` / `DamageModifier` / `ConditionImmunity` / `RollModifier` | read-only "you gain" display |

Respite surface (not the builder):

| # | Control | Kind |
|---|---|---|
| 1 | Psionic Augmentation | single-select (5) |
| 2 | Talent Ward | single-select (4) |

No free-text, toggle, or nested-sub-choice controls are required by this class.
The `Choice` options here are all leaf single-selects — **none of Talent's
`Choice` options contains a further choice**, which makes Talent one of the
simpler classes to build.

---

## Convex data model notes

### Definition (seeded, shared, versioned by source)

```
classes/class-talent
  id, name, description, type: 'standard'
  subclassName: 'Tradition', subclassCount: 1
  primaryCharacteristicsOptions: [['Reason','Presence']]
  featuresByLevel: [ { level, features[] } ] × 10      // 46 top-level features
  abilityIds: [ talent-ability-1 .. talent-ability-28 ]

subclasses/talent-sub-1 | -2 | -3
  classId: 'class-talent'                              // FILL IN — source has classID: ''
  featuresByLevel: [ { level, features[] } ] × 10      // 10 features each; 3/4/7/10 empty

abilities/*                                            // 58 records
  id, name, cost, keywords[], distance[], target, actionType, sections[]
  ownerRef: { kind: 'classPool' | 'feature', featureId? }
```

Nested features (`Multiple.features`, `Choice.options[].feature`) are part of the
definition and need addressable ids. Their ids are already unique strings
(`talent-1-5aa`, `talent-9-1b`, …), so a **flat `featureId` keyspace works** —
no path convention is required for Talent specifically. Do not rely on that
holding for other classes.

### Selection (per hero, sparse)

```
hero.classId          = 'class-talent'
hero.subclassId       = 'talent-sub-1' | 'talent-sub-2' | 'talent-sub-3'
hero.primaryCharacteristics = ['Reason','Presence']    // derived, not chosen
hero.characteristicArray    = [{ characteristic, value } × 5]

hero.selections = {
  'talent-skill-a':  { kind: 'skills',    values: string[2] },
  'talent-skill-c':  { kind: 'skills',    values: string[2] },
  'talent-1-3':      { kind: 'languages', values: string[1] },
  'talent-1-5':      { kind: 'option',    featureId: 'talent-1-5a'..'e' },   // respite-writable
  'talent-1-6':      { kind: 'option',    featureId: 'talent-1-6a'..'d' },   // respite-writable
  'talent-1-7':      { kind: 'abilities', abilityIds: string[2] },
  'talent-1-8':      { kind: 'abilities', abilityIds: string[1] },
  'talent-1-9':      { kind: 'abilities', abilityIds: string[1] },
  'talent-2-1':      { kind: 'perks',     perkIds: string[1] },
  'talent-3-2':      { kind: 'abilities', abilityIds: string[1] },
  'talent-4-4':      { kind: 'perks',     perkIds: string[1] },
  'talent-4-5':      { kind: 'skills',    values: string[1] },
  'talent-5-1':      { kind: 'abilities', abilityIds: string[1] },
  'talent-6-1':      { kind: 'perks',     perkIds: string[1] },
  'talent-7-5':      { kind: 'skills',    values: string[1] },
  'talent-8-1':      { kind: 'perks',     perkIds: string[1] },
  'talent-8-2':      { kind: 'abilities', abilityIds: string[1] },
  'talent-10-4':     { kind: 'perks',     perkIds: string[1] },
  'talent-10-6':     { kind: 'skills',    values: string[1] },
  'talent-sub-N-2-2': { kind: 'option', featureId: … },
  'talent-sub-N-6-1': { kind: 'option', featureId: … },
  'talent-sub-N-9-1': { kind: 'option', featureId: … }
}
```

Maximum **22 selection entries** for a level-10 Talent. Everything else on the
sheet is derived.

### Derived (never stored)

- **Stamina** — `18 + 6 × (level − 1)` from `talent-stamina`, **plus** the
  augmentation's echelon-scaled bonus if `talent-1-5a` (`3 × echelon`) or
  `talent-1-5b` (`6 × echelon`) is selected. Stamina therefore depends on a
  **respite-time** selection.
- **Recoveries** — flat 8.
- **Characteristics** — array + `talent-4-1a/b` + `talent-7-3a–e` + `talent-10-1a/b`.
- **Speed / Stability / Disengage** — base + `talent-1-5b`/`talent-1-5e` if selected.
- **Proficiencies** — empty unless `talent-1-5a` (Battle Augmentation) is selected.
- **Ability list** — `talent-1-2`, `talent-4-2`, the tradition's granted
  abilities, the selected tradition-ability options, the selected class-pool
  abilities, **and `talent-1-6b` Repulsive Ward iff the ward choice selects it**.
- **Ability distance/damage modifiers** — `talent-1-5c`/`talent-1-5d` (if
  selected), `talent-10-3a`, and `talent-sub-3-5-2b` (Telepathy L5). These are
  keyword-scoped modifiers applied at render/resolve time, not stored on the
  ability.
- **Heroic resource gains** — see the tag-replacement fold below.

### The split is hard here in four places

1. **`selectAt: 'respite'` on `talent-1-5` and `talent-1-6`.** Two of Talent's
   most consequential build choices are **not build-time**. The augmentation
   feeds Stamina, Speed, Stability, Disengage, weapon/armour proficiency and
   ability distance/damage; the ward can add a whole triggered ability. Both are
   rewritable between encounters. **The encounter runtime must be able to write
   `hero.selections`**, or these two keys must live in a runtime-side overlay
   that the derivation reads. This is foundation §8 open question 2, made
   concrete: Talent is the class that forces the decision.

2. **Resource-gain tag replacement.** `HeroicResourceGain.replacesTags` forms two
   supersession chains that must be folded, not accumulated:

   | Chain | L1 | L4 | L7 | L10 |
   |---|---|---|---|---|
   | `start` | `1d3` | — | `start 2` = `1d3 + 1` replaces `start` | `start 3` = `1d3 + 2` replaces `start`, `start 2` |
   | `move` | `1` | `move 2` = `2` replaces `move` | — | `move 3` = `3` replaces `move`, `move 2` |

   A naive "collect all gains" fold gives a level-10 Talent **three** start-of-turn
   gains and **three** force-move gains. The resolver must apply `replacesTags`
   as a removal pass keyed on `tag`. One of the replacing gains (`talent-4-3b`,
   `talent-10-2` via `talent-10-5a`) is **nested inside a `Multiple`**, so the
   fold has to traverse nested features before applying replacement.

3. **Ability-pool membership is computed, not enumerated.** `ClassAbility.source`
   is a six-flag mask; Talent uses `fromClassAbilities: true` +
   `fromSelectedSubclassAbilities: true` (the createClassAbilityChoice defaults)
   with the other four false. Because all three traditions have `abilities: []`,
   the subclass flag is **inert for Talent** — but the mask must still be
   modelled, since other classes use it. The candidate set is
   `pool.filter(cost === feature.cost && minLevel <= feature.minLevel)` minus
   already-owned ids, de-duplicated by **name** (not id).

4. **Definition data ships with selections in it.** `talent-skill-a.selected =
   ['Psionics','Read Person']` and `talent-1-3.selected = ['Mindspeech']`. Under
   a clean split these are either (a) grants, modelled as flat `Language` /
   skill-grant features with no control, or (b) defaults on an editable choice.
   The source can't tell us which. **Needs a canon ruling before seeding** —
   see §A1.

---

## Anomalies & open questions

### A1 — Definition data carries pre-filled selections

`talent-skill-a` (`SkillChoice`, `count: 2`) ships
`selected: ['Psionics', 'Read Person']`, and `talent-1-3` (`LanguageChoice`,
`count: 1`) ships `selected: ['Mindspeech']`. In Forge Steel this is harmless
(the hero is a deep copy), but for us it means **static content contains
per-hero state**.

Worse: `talent-skill-a`'s option set is *unrestricted* (`options: []`,
`listOptions: []` → defaults to all five skill lists), so the UI would offer any
skill while the data asserts two specific ones. Two readings:

- The pin grants Psionics + Read Person outright → model as grants, no control.
- The pin offers a free 2-skill choice with a suggested default → model as a
  choice with defaults.

Cannot be resolved from the source. **VERIFY-AGAINST-PIN.**

### A2 — Missing feature id `talent-skill-b`

Level 1 has `talent-skill-a` and `talent-skill-c`; there is no `talent-skill-b`
anywhere in the repository (grep across `src/data/classes/`), and **no other
class uses the `-skill-a/b/c` id convention at all**. Either a third level-1
skill feature was removed and the ids weren't renumbered, or the naming is
vestigial. If a third skill grant exists in the pin, it is **missing here**.

### A3 — `selectAt: 'respite'` on stat-bearing choices

Both level-1 `Choice` features are respite-scoped. `talent-1-5a` Battle
Augmentation grants `Proficiency` (light weapons + light armour) and
`Bonus{ Stamina, valuePerEchelon: 3 }`; `talent-1-5b` grants
`Bonus{ Stamina, valuePerEchelon: 6 }` and `+1 Stability`. **A hero's maximum
Stamina and weapon/armour proficiency therefore change at a respite.** Any
cached sheet, exported PDF, or encounter snapshot has to be invalidated on
respite. This is the sharpest instance of foundation §6 category 2 in the
class set so far.

### A4 — Battle Augmentation: prose and implementation disagree

The option's description says the light-armour Stamina bonus is `+3`, increasing
by 3 at 4th, 7th and 10th levels. The implementation is
`createBonus({ field: Stamina, valuePerEchelon: 3 })` — `value` defaults to
**0**, so at level 1 the bonus computes as `3 × echelon(1)`. Whether echelon
boundaries coincide with "4th / 7th / 10th" and whether the level-1 value is 3
must both be checked. Separately, the prose conditions on wearing light armour
and on **not having a kit** — neither condition is represented in the data
(`Toggle` or `SwitchOptions` would be the vocabulary for it). The bonus applies
unconditionally as implemented. **VERIFY-AGAINST-PIN.**

### A5 — The strain mechanic is entirely unmodelled

`Clarity` carries `canBeNegative: true` — that flag is the **only** structural
representation of strain. The "strained" state, its threshold, its damage, and
every ability's strained rider live in:

- `talent-resource.details` (free prose), and
- one `AbilitySectionField { name: 'Strained', value: 0, repeatable: false }`
  per ability.

`AbilitySectionField` is the same variant used for `Spend`, distinguished only
by the `name` string. A resolver that wants to know "does this ability have a
strain rider" has to string-match `'Strained'`. If we want strain to be
engine-visible (it interacts with damage, conditions and resource floor), it
needs a **first-class field on the ability**, not a named text section.

### A6 — Psi Boost is a Text feature

`talent-6-2` is `FeatureType.Text`. Its description contains **seven named
boosts with individual clarity costs** (Dynamic / Expanded / Extended /
Heightened / Magnified / Shared / Sharpened Power). Structurally this is a
level-6 resource-spend menu applying to any Psionic main action or maneuver —
i.e. a genuine repeated runtime choice — modelled as inert prose. Nothing in
the builder or the runtime can act on it as data.

Additionally, the description says *"you can spend additional **discipline**"* —
**discipline is the Null class's heroic resource, not Talent's**. Talent's
resource is clarity, and the boost list below that sentence prices everything in
Clarity. This is a transcription bug in the source and a concrete demonstration
that Forge Steel prose is not canon.

### A7 — Level-7 grants +1 to all five characteristics with no choice

`talent-7-3a`–`talent-7-3e` are five separate `CharacteristicBonus` features,
one per characteristic, each `value: 1`. Contrast levels 4 and 10, which grant
`+1 Reason` and `+1 Presence` only. Five sibling features rather than one
multi-characteristic feature is a data-shape choice; our model can collapse it,
but the ids must survive if we key anything on them.

### A8 — Talent is kitless

No `FeatureType.Kit` appears at any level in the class or any tradition. The
`hero-respite-modal` surfaces all `Kit` features unconditionally, which for
Talent contributes nothing. Battle Augmentation is the substitute path to
weapon/armour proficiency, and its prose explicitly excludes stacking with a kit
(unenforced — see §A4). Our builder must not assume every class has a kit step.

### A9 — Respite-time and play-time behaviours hidden inside `Text`

Three features describe recurring player decisions but carry no `selectAt` and
no option list:

| Feature | Level | Hidden decision |
|---|---|---|
| `talent-7-1` Ancestral Memory | 7 | "each time you finish a respite, replace up to `Reason` skills with interpersonal/lore skills, until your next respite" — a **respite-scoped, temporary, N-cardinality skill swap** where N is a derived characteristic |
| `talent-sub-3-8-1` Mindlink (Telepathy) | 8 | "during a respite, choose up to `Reason` creatures you have telepathically contacted" — a respite-scoped selection over an **arbitrary, non-enumerable pool** (NPCs met in play) |
| `talent-sub-2-5-1` Kinetic Amplifier (Telekinesis) | 5 | spend up to 2 surges on forced movement — a per-use runtime spend |

None of these is expressible in the existing selection vocabulary. Ancestral
Memory in particular is a *temporary override* of a build-time selection, which
a sparse `featureId -> selection` map has no slot for. **Open question:** do we
model temporary overrides as a second, respite-lifetime selection layer?

### A10 — Distance/target determined by the power roll

Four abilities determine their **area or target count** from the tier outcome
rather than declaring it in `distance`/`target`:

| Ability | Declared | Actually determined by |
|---|---|---|
| `talent-sub-2-9-1a` Fulcrum | `distance: Special('Special')` | tiers read `2 burst` / `3 burst` / `4 burst` |
| `talent-sub-1-2-2a` Applied Chronometrics | `target: 'Special'` | tiers read "two/three/four creatures" |
| `talent-sub-3-6-1b` Synaptic Dissipation | `target: 'Special'` | tiers read "Two/Three/Five creatures" |
| `talent-ability-19` Reflector Field | `target: 'Special'` | prose |

Fulcrum's `special` string is literally `'Special'` — it carries **no
information at all**; the distance renders as the word "Special". Any UI that
shows a distance chip has to handle a content-free special distance. Our ability
model needs a representation for *roll-determined area/target count*.

### A11 — Ability section ordering is not canonical

Several abilities place the `Strained` field **before** the `roll` section:
`talent-sub-1-6-1a` Fate (text → Strained → roll), `talent-sub-1-6-1b` Statis
Field (text → roll → Strained), `talent-sub-1-9-1a` Acceleration Field
(text → Strained → roll). Others put the roll first. A renderer that assumes
"roll, then effects, then riders" will mis-order these. Sections are an ordered
list in the source and the order is inconsistent — **do not treat position as
semantics.**

### A12 — Keyword / distance mismatches

- `talent-ability-26` **Mindwipe** carries the `Ranged` keyword but its only
  distance entry is `Melee 2`. Either the keyword or the distance is wrong.
- `talent-sub-3-6-1a` **Synaptic Conditioning** carries both `Melee` and
  `Ranged` keywords with a single `Melee 2` distance — same shape.
- `talent-ability-3` **Incinerate** lists keywords in a non-alphabetical order
  (`Area, Fire, Psionic, Ranged, Pyrokinesis`) unlike every sibling; cosmetic,
  but a hint that this record was hand-edited.

**VERIFY-AGAINST-PIN** for all three.

### A13 — Truncated and misspelled source strings

- `talent-sub-2-6-1a` Gravitic Well, tier 1: `'6 damage; vertical pull 5 toward
  the center of the a'` — **the string is cut off mid-word**. Tiers 2 and 3 are
  complete. This is a data defect, not a rendering artefact.
- `talent-sub-1-6-1b` is named **`Statis Field`**; the level-8 ability is
  `Stasis Shield`. "Statis" is almost certainly a typo for "Stasis" — but a
  spec must not silently correct a name. Flagged, not fixed.
- `talent-sub-2-2-1` **Ease their Fall** has `description: ''` and
  `keywords: []` — the only ability in the class with an empty description, and
  one of three with no keywords at all.

### A14 — Inconsistent wrapping of augmentation options

Three of the five Psionic Augmentation options wrap their effects in a
`Multiple` (`talent-1-5a`, `-5b`, `-5e`); two are **bare modifier features**
whose display name is set on the modifier itself (`talent-1-5c` an
`AbilityDistance` named "Distance Augmentation", `talent-1-5d` an
`AbilityDamage` named "Force Augmentation"). Our seeder should normalise —
every option should be a named container — otherwise the option-card renderer
has two shapes to handle for one control.

### A15 — Subclass `classID` is empty

All three traditions carry `classID: ''`. The parent link is positional
(`talent.subclasses`), and `SubClass.classID` is dead in this data. If we
normalise subclasses into their own Convex table (as the sketch above does), the
`classId` must be **synthesised at seed time**, not read from the source.

### A16 — `Choice.options[].value` is uniformly 1 and inert

Every option in every Talent `Choice` carries `value: 1`. The `{ feature, value }`
weighting exists for the ancestry point-buy path (`count: 'ancestry'`); with a
numeric `count`, the weight is never read. Safe to drop for this class; must not
be dropped from the schema.

### A17 — `HeroClass.characteristics` and `level` on the definition

The definition object carries `level: 1` and `characteristics: []` — per-hero
fields living on shared content, an artefact of the deep-copy model. Do not seed
them.

### A18 — Empty subclass level entries

Every tradition declares `{ level: 3, features: [] }`, `{ level: 4, features: [] }`,
`{ level: 7, features: [] }`, `{ level: 10, features: [] }`. These are
structurally meaningful (they assert "this tradition grants nothing at this
level"), but a seeder that filters empty arrays will change the max-level
computation (`canLevelUp` reads the max level present across the class *and its
subclasses'* `featuresByLevel`). **Keep the empty entries or compute max level
from the class alone.**

### A19 — `Vision` (epic resource) gain value is a non-numeric string

`talent-10-7`'s single gain has `value: 'XP gained'` with
`frequency: AtWill`. Other Talent gain values are dice expressions
(`'1d3'`, `'1d3 + 1'`, `'1d3 + 2'`) or integers-as-strings (`'1'`, `'2'`, `'3'`).
So `ResourceGain.value` is an untyped string spanning **integers, dice
expressions, and free-text formulas**. Our model needs either a small expression
grammar with an explicit "manual entry" escape, or a discriminated value union.

### A20 — Open questions

1. **Are Psionics / Read Person / Mindspeech grants or defaults?** (§A1) —
   blocks seeding level 1.
2. **Does a `talent-skill-b` feature exist in the pin?** (§A2)
3. **Where does respite-time selection state live?** (§A3) — Talent forces the
   foundation's open question 2.
4. **Does strain become a first-class ability field?** (§A5) — affects the
   ability schema for the whole corpus, not just Talent.
5. **Is Psi Boost modelled as data?** (§A6) — if yes, it needs a new
   vocabulary entry (a per-use, multi-select resource-spend modifier menu); if
   no, a level-6 Talent has a major mechanic the app can't help with.
6. **How do we represent roll-determined area / target count?** (§A10)
7. **Do we model temporary respite-lifetime overrides of build selections?**
   (§A9, Ancestral Memory)
8. **Echelon vs. "4th / 7th / 10th level"** — confirm the two are the same
   thing before implementing any `valuePerEchelon` feature (§A4).
