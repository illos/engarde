> **Provenance — read before implementing.**
> Structure in this file is mapped from **Forge Steel**
> (github.com/andyaiken/forgesteel, GPL-3.0), commit `01672c1`, read 2026-08-29.
> Forge Steel is an independent third-party transcription of Draw Steel and is
> **not** our canon source. Every name, number, count and option list below is
> **UNVERIFIED** and must be confirmed against the pinned SteelCompendium
> corpus (DEC-0008) before it is implemented or shown to a user.
> This file is a **structural map for UI and data-model design**, not a rules source.

# Fury — structural map

Source files read in full:

- `src/data/classes/fury/fury.ts` (780 lines)
- `src/data/classes/fury/berserker.ts` (396 lines)
- `src/data/classes/fury/reaver.ts` (422 lines)
- `src/data/classes/fury/stormwight.ts` (285 lines)
- `src/data/kits/stormwight/{boren,corven,raden,vuken}.ts` (889 lines total)
- Vocabulary: `src/enums/feature-type.ts`, `src/models/feature.ts`,
  `src/models/class.ts`, `src/models/subclass.ts`, `src/models/kit.ts`,
  `src/logic/factory-logic.ts`, `src/logic/factory-feature-logic.ts`,
  `src/logic/factory-ability-type-logic.ts`, `src/logic/factory-distance-logic.ts`,
  `src/logic/feature-logic.ts`, `src/logic/hero-logic.ts`,
  `src/components/features/feature-data/{kit,skill-choice,class-ability}.tsx`,
  `src/components/pages/heroes/hero-edit/class-section/class-section.tsx`,
  `src/components/modals/hero-respite/hero-respite-modal.tsx`

Every `FactoryLogic.feature.create*` call below has been resolved to its
`FeatureType` **and** its defaulted field values. Where the source omits an
argument, the resolved default is stated explicitly and marked *(default)*.

---

## Identity

| Field | Value | Notes |
|---|---|---|
| `id` | `class-fury` | |
| `name` | `Fury` | |
| `description` | `text: VERIFY-AGAINST-PIN` | Two paragraphs of flavour prose in source. Not transcribed. |
| `type` | `'standard'` | `HeroClass.type` is `'standard' \| 'master'`. |
| `subclassName` | `Primordial Aspect` | Drives UI copy: "Choose a Primordial Aspect". |
| `subclassCount` | `1` | Exactly one aspect. |
| `primaryCharacteristicsOptions` | `[ [ Might, Agility ] ]` | **One** option ⇒ no player choice; auto-assigned. |
| `primaryCharacteristics` | `[]` in definition | Populated per-hero on class selection (see Anomalies A-1). |
| `featuresByLevel` | levels 1–10, **40 top-level features** | Table below. |
| `abilities` | **24** abilities (the class ability pool) | 4 signature + 4 each at 3/5/7/9/11pt. |
| `subclasses` | `[ berserker, reaver, stormwight ]` | ids `fury-sub-1` / `fury-sub-2` / `fury-sub-3`. |
| `level` | `1` in definition | Per-hero mutable field on the deep-copied class object. |
| `characteristics` | `[]` in definition | Per-hero `{characteristic, value}[]`. |

**Stamina / Recoveries** are ordinary `FeatureBonus` rows at level 1, not
top-level identity fields: Stamina `value: 21, valuePerLevel: 9`; Recoveries
`value: 10`.

**Heroic resource:** `Ferocity` (`FeatureHeroicResource`, `type: 'heroic'`),
declared at level 1 as feature `fury-resource`.

---

## Level progression

`Choice?` = does `FeatureLogic.isChoice()` return true for this `FeatureType`
(i.e. does the builder render a config control for it).
`selectAt` is only a real field on `FeatureChoice`, `FeatureSkillChoice` and
`FeatureLanguageChoice`; `—` means the type has no such field.

### Class features (all Fury heroes)

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 1 | `fury-stamina` | `Stamina` *(default name = field)* | `Bonus` | no | — | — | — | none — `{field: Stamina, value: 21, valuePerLevel: 9, valueCharacteristicMultiplier: 1 (default), valuePerEchelon: 0 (default)}` |
| 1 | `fury-recoveries` | `Recoveries` *(default name = field)* | `Bonus` | no | — | — | — | none — `{field: Recoveries, value: 10}` |
| 1 | `fury-resource` | `Ferocity` | `HeroicResource` | no | — | — | — | runtime value only. `type: 'heroic' (default)`, `canBeNegative: false (default)`, `details: '' (default)`, `thresholds: [] (default — populated by subclass/kit threshold features at runtime)`, 3 `gains` — see Resource-gain table |
| 1 | `fury-1-1` | `Skill` *(default)* | `SkillChoice` | **yes** | 1 *(default)* | `build` *(default)* | `listOptions` defaults to all 5 lists (Crafting, Exploration, Interpersonal, Intrigue, Lore); `options: []` | `selected: ['Nature']` **pre-populated in the definition** — a fixed grant modelled as a satisfied choice. Removable in UI. |
| 1 | `fury-1-2` | `Exploration / Intrigue Skills` *(default)* | `SkillChoice` | **yes** | 2 | `build` *(default)* | `listOptions: [Exploration, Intrigue]` | `selected: string[]` (2 skill names) |
| 1 | `fury-1-4` | `Mighty Leaps` | `Text` | no | — | — | — | none. `text: VERIFY-AGAINST-PIN` |
| 1 | `fury-1-5` | `Signature Ability` *(default)* | `ClassAbility` | **yes** | 1 *(default)* | — | `cost: 'signature'`; `source.fromClassAbilities: true (default)`, `source.fromSelectedSubclassAbilities: true (default)`, all four other source flags `false`; `minLevel: 1 (default)`; `classID: undefined (default)` | `selectedIDs: string[]` |
| 1 | `fury-1-6` | `3pt Ability` *(default)* | `ClassAbility` | **yes** | 1 *(default)* | — | as above, `cost: 3` | `selectedIDs: string[]` |
| 1 | `fury-1-7` | `5pt Ability` *(default)* | `ClassAbility` | **yes** | 1 *(default)* | — | as above, `cost: 5` | `selectedIDs: string[]` |
| 2 | `fury-2-1` | `Crafting / Exploration / Intrigue Perk` *(default)* | `Perk` | **yes** | 1 *(default)* | — | `lists: [Crafting, Exploration, Intrigue]` | `selected: Perk[]` |
| 3 | `fury-3-1` | `7pt Ability` *(default)* | `ClassAbility` | **yes** | 1 *(default)* | — | `cost: 7`, sources as `fury-1-5` | `selectedIDs: string[]` |
| 4 | `fury-4-1a` | `Might` *(default name = characteristic)* | `CharacteristicBonus` | no | — | — | — | none — `{characteristic: Might, value: 1}` |
| 4 | `fury-4-1b` | `Agility` *(default)* | `CharacteristicBonus` | no | — | — | — | none — `{characteristic: Agility, value: 1}` |
| 4 | `fury-4-2` | `Damaging Ferocity` | `HeroicResourceGain` | no | — | — | — | none — `{tag: 'take-damage 2', trigger: VERIFY-AGAINST-PIN, value: '2', frequency: OncePerRound, replacesTags: ['take-damage'], used: false}` |
| 4 | `fury-4-3` | `Perk` *(default)* | `Perk` | **yes** | 1 *(default)* | — | `lists` omitted ⇒ **all 6** (Crafting, Exploration, Interpersonal, Intrigue, Lore, Supernatural) | `selected: Perk[]` |
| 4 | `fury-4-4` | `Primordial Attunement` | `Text` | no | — | — | — | none. `text: VERIFY-AGAINST-PIN` |
| 4 | `fury-4-5` | `Primordial Strike` | `Text` | no | — | — | — | none. `text: VERIFY-AGAINST-PIN` — **but see A-7**: it is a per-strike ferocity spend, i.e. play-time state modelled as inert text. |
| 4 | `fury-4-6` | `Skill` *(default)* | `SkillChoice` | **yes** | 1 *(default)* | `build` *(default)* | all 5 lists *(default)* | `selected: string[]` |
| 5 | `fury-5-1` | `9pt Ability` *(default)* | `ClassAbility` | **yes** | 1 *(default)* | — | `cost: 9`, sources as `fury-1-5` | `selectedIDs: string[]` |
| 6 | `fury-6-1` | `Marauder of the Primordial Chaos` | `Text` | no | — | — | — | none. `text: VERIFY-AGAINST-PIN` |
| 6 | `fury-6-2` | `Primordial Portal` | `Text` | no | — | — | — | none. `text: VERIFY-AGAINST-PIN` |
| 6 | `fury-6-3` | `Crafting / Exploration / Intrigue Perk` *(default)* | `Perk` | **yes** | 1 *(default)* | — | `lists: [Crafting, Exploration, Intrigue]` | `selected: Perk[]` |
| 7 | `fury-7-1a` | `Might` *(default)* | `CharacteristicBonus` | no | — | — | — | `{Might, +1}` |
| 7 | `fury-7-1b` | `Agility` *(default)* | `CharacteristicBonus` | no | — | — | — | `{Agility, +1}` |
| 7 | `fury-7-1c` | `Reason` *(default)* | `CharacteristicBonus` | no | — | — | — | `{Reason, +1}` |
| 7 | `fury-7-1d` | `Intuition` *(default)* | `CharacteristicBonus` | no | — | — | — | `{Intuition, +1}` |
| 7 | `fury-7-1e` | `Presence` *(default)* | `CharacteristicBonus` | no | — | — | — | `{Presence, +1}` |
| 7 | `fury-7-2` | `Elemental Form` | `Text` | no | — | — | — | none. `text: VERIFY-AGAINST-PIN` — **branches on selected subclass** (see A-8). |
| 7 | `fury-7-3` | `Greater Ferocity` | `HeroicResourceGain` | no | — | — | — | `{tag: 'start 2', trigger: VERIFY-AGAINST-PIN, value: '1d3 + 1', frequency: OncePerRound, replacesTags: ['start']}` |
| 7 | `fury-7-4` | `Skill` *(default)* | `SkillChoice` | **yes** | 1 *(default)* | `build` *(default)* | all 5 lists *(default)* | `selected: string[]` |
| 8 | `fury-8-1` | `Perk` *(default)* | `Perk` | **yes** | 1 *(default)* | — | all 6 lists *(default)* | `selected: Perk[]` |
| 8 | `fury-8-2` | `11pt Ability` *(default)* | `ClassAbility` | **yes** | 1 *(default)* | — | `cost: 11`, sources as `fury-1-5` | `selectedIDs: string[]` |
| 9 | `fury-9-1` | `Harbinger of the Primordial Chaos` | `Text` | no | — | — | — | none. `text: VERIFY-AGAINST-PIN` |
| 10 | `fury-10-1` | `Chaos Incarnate` | `Text` | no | — | — | — | none. `text: VERIFY-AGAINST-PIN` — **branches on selected subclass** (see A-8). |
| 10 | `fury-10-2a` | `Might` *(default)* | `CharacteristicBonus` | no | — | — | — | `{Might, +1}` |
| 10 | `fury-10-2b` | `Agility` *(default)* | `CharacteristicBonus` | no | — | — | — | `{Agility, +1}` |
| 10 | `fury-10-3` | `Perk` *(default)* | `Perk` | **yes** | 1 *(default)* | — | all 6 lists *(default)* | `selected: Perk[]` |
| 10 | `fury-10-4` | `Primordial Ferocity` | `HeroicResourceGain` | no | — | — | — | `{tag: 'take-damage 3', trigger: VERIFY-AGAINST-PIN, value: '3', frequency: OncePerRound, replacesTags: ['take-damage', 'take-damage 2']}` |
| 10 | `fury-10-5` | `Primordial Power` | `HeroicResource` | no | — | — | — | second resource. `type: 'epic'`, one gain `{tag: 'respite', trigger: VERIFY-AGAINST-PIN, value: 'XP gained', frequency: AtWill}`. `description` set; `details: '' (default)` — see A-9. |
| 10 | `fury-10-6` | `Skill` *(default)* | `SkillChoice` | **yes** | 1 *(default)* | `build` *(default)* | all 5 lists *(default)* | `selected: string[]` |

**Class feature count: 40.** Levels present: 1–10, none skipped.
**Class-level choice points: 16** (5 at L1, then 1/1/2/1/1/1/2/0/2).

#### Ferocity resource gains declared on `fury-resource`

| tag | trigger | value | frequency | replaced at |
|---|---|---|---|---|
| `start` | `VERIFY-AGAINST-PIN` (start of turn) | `1d3` | `OncePerRound` | L7 by `start 2` |
| `take-damage` | `VERIFY-AGAINST-PIN` (you take damage) | `1` | `OncePerRound` | L4 by `take-damage 2`, L10 by `take-damage 3` |
| `winded` | `VERIFY-AGAINST-PIN` (winded or dying) | `1d3` | `OncePerEncounter` | never |

Replacement is by **tag string matching** (`replacesTags`), resolved at runtime
in `HeroLogic.getHeroicResources` / `getSurgeGains`, not by feature id.

---

## Subclasses

The class has `subclassCount: 1`; the player picks exactly one of three.
All three subclasses have `abilities: []` — **no subclass contributes to the
class ability pool.** Subclass abilities are delivered as embedded
`FeatureAbility` grants or as `FeatureChoice` options.

Subclass features are only included when `subclass.selected === true`
(`FeatureLogic.getFeaturesFromClass`), and only for `lvl.level <= class.level`.

### `fury-sub-1` — Berserker

`description: text: VERIFY-AGAINST-PIN`

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 1 | `fury-sub-1-1-1` | `Skill` *(default)* | `SkillChoice` | **yes** | 1 *(default)* | `build` *(default)* | all 5 lists *(default)* | `selected: ['Lift']` pre-populated |
| 1 | `fury-sub-1-1-2` | `Kit` *(default)* | `Kit` | **yes** | 1 *(default)* | — (no field; **always** re-offered at respite) | `types: [''] (default)` ⇒ the 21 **standard** kits | `selected: Kit[]` (deep-copied kit objects) |
| 1 | `fury-sub-1-1-3` | `Primordial Strength` | `Text` | no | — | — | — | none. `text: VERIFY-AGAINST-PIN` |
| 1 | `fury-sub-1-1-4` | `Lines of Force` | `Ability` | no | — | — | — | granted ability, not a choice. See Abilities table. |
| 1 | `fury-sub-1-1-5` | `Growing Ferocity` | `Multiple` | no | — | — | — | container for 3 `HeroicResourceThreshold` children |
| 1 | └ `fury-sub-1-1-5-2` | `Ferocity 2` *(default name)* | `HeroicResourceThreshold` | no | — | — | — | `{resource: 'Ferocity', value: 2, level: 1 (default)}` → `Text` `fury-sub-1-1-5-2a` |
| 1 | └ `fury-sub-1-1-5-4` | `Ferocity 4` *(default)* | `HeroicResourceThreshold` | no | — | — | — | `{value: 4, level: 1 (default)}` → `SurgeGain` `fury-sub-1-1-5-4a` `{tag: 'push', value: '1', frequency: OncePerRound, condition: '' (default)}` |
| 1 | └ `fury-sub-1-1-5-6` | `Ferocity 6` *(default)* | `HeroicResourceThreshold` | no | — | — | — | `{value: 6, level: 1 (default)}` → `Multiple` of 2 `RollModifier`: `{Edge, rollType: Test (default), characteristics: [Might]}` and `{Edge, rollType: Knockback}` |
| 2 | `fury-sub-1-2-1` | `Unstoppable Force` | `Text` | no | — | — | — | none. `text: VERIFY-AGAINST-PIN` |
| 2 | `fury-sub-1-2-2` | `2nd-Level Aspect Ability` | `Choice` | **yes** | 1 *(default)* | `build` *(default)* | 2 inline options, each `{feature: Ability, value: 1}`: `fury-sub-1-2-2a` *Special Delivery*, `fury-sub-1-2-2b` *Wrecking Ball* | `selected: Feature[]`; satisfied when Σ`value` ≥ `count` |
| 3 | `fury-sub-1-3-1` | `Immovable Object` | `Text` | no | — | — | — | none. **ID COLLIDES with stormwight L3 — see A-2.** |
| 3 | `fury-sub-1-3-2` | `Stability` *(default name = field)* | `Bonus` | no | — | — | — | `{field: Stability, value: 0 (default), valueCharacteristics: [Might], valueCharacteristicMultiplier: 1 (default)}` |
| 4 | `fury-sub-1-4-1` | `Growing Ferocity Improvement` | `HeroicResourceThreshold` | no | — | — | — | `{value: 8, level: 1 (default)}` → `SurgeGain` `{tag: 'push 2', value: '2', OncePerRound, replacesTags: ['push']}` |
| 5 | `fury-sub-1-5-1` | `Bounder` | `Text` | no | — | — | — | none. `text: VERIFY-AGAINST-PIN` |
| 6 | `fury-sub-1-6-1` | `6th-Level Aspect Ability` | `Choice` | **yes** | 1 *(default)* | `build` *(default)* | `fury-sub-1-6-1a` *Avalanche Impact*, `fury-sub-1-6-1b` *Force of Storms* (values 1/1) | `selected: Feature[]` |
| 7 | `fury-sub-1-7-1` | `Growing Ferocity Improvement` | `HeroicResourceThreshold` | no | — | — | — | `{value: 10, level: 1 (default)}` → `Multiple` of 2 `RollModifier` `{DoubleEdge, characteristics: [Might]}` / `{DoubleEdge, rollType: Knockback}` |
| 8 | `fury-sub-1-8-1` | `Strongest There Is` | `Text` | no | — | — | — | none. `text: VERIFY-AGAINST-PIN` |
| 9 | `fury-sub-1-9-1` | `9th-Level Aspect Ability` | `Choice` | **yes** | 1 *(default)* | `build` *(default)* | `fury-sub-1-9-1a` *Death Comes for You All!*, `fury-sub-1-9-1b` *Primordial Vortex* | `selected: Feature[]` |
| 10 | `fury-sub-1-10-1` | `Growing Ferocity Improvement` | `HeroicResourceThreshold` | no | — | — | — | `{value: 12, level: 1 (default)}` → `Text` `fury-sub-1-10-1a` |

Berserker: **16 top-level features**, levels 1–10 all present, **4 choice points**
(L1 skill, L1 kit, L2/L6/L9 aspect ability — 5 counting the pre-satisfied skill).

### `fury-sub-2` — Reaver

`description: text: VERIFY-AGAINST-PIN`

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 1 | `fury-sub-2-1-1` | `Skill` *(default)* | `SkillChoice` | **yes** | 1 *(default)* | `build` *(default)* | all 5 lists *(default)* | `selected: ['Hide']` pre-populated |
| 1 | `fury-sub-2-1-2` | `Kit` *(default)* | `Kit` | **yes** | 1 *(default)* | — (always re-offered at respite) | `types: [''] (default)` ⇒ 21 standard kits | `selected: Kit[]` |
| 1 | `fury-sub-2-1-3` | `Primordial Cunning` | `Text` | no | — | — | — | none. `text: VERIFY-AGAINST-PIN` |
| 1 | `fury-sub-2-1-4` | `Unearthly Reflexes` | `Ability` | no | — | — | — | granted ability |
| 1 | `fury-sub-2-1-5` | `Growing Ferocity` | `Multiple` | no | — | — | — | container for 3 thresholds |
| 1 | └ `fury-sub-2-1-5-2` | `Ferocity 2` *(default)* | `HeroicResourceThreshold` | no | — | — | — | `{value: 2, level: 1 (default)}` → `Text` `fury-sub-2-1-5-2a` |
| 1 | └ `fury-sub-2-1-5-4` | `Ferocity 4` *(default)* | `HeroicResourceThreshold` | no | — | — | — | `{value: 4}` → `SurgeGain` `{tag: 'slide', value: '1', OncePerRound}` |
| 1 | └ `fury-sub-2-1-5-6` | `Ferocity 6` *(default)* | `HeroicResourceThreshold` | no | — | — | — | `{value: 6}` → `Multiple` of `RollModifier` `{Edge, characteristics: [Agility]}` / `{Edge, rollType: Knockback}` |
| 2 | `fury-sub-2-2-1` | `Inescapable Wrath` | `Multiple` | no | — | — | — | children: `Text` `fury-sub-2-2-1a`; `Bonus` `fury-sub-2-2-1b` `{field: Speed, valueCharacteristics: [Agility]}` |
| 2 | `fury-sub-2-2-2` | `2nd-Level Aspect Ability` | `Choice` | **yes** | 1 *(default)* | `build` *(default)* | `fury-sub-2-2-2a` *Death … Deeaaath!*, `fury-sub-2-2-2b` *Phalanx-Breaker* | `selected: Feature[]` |
| 3 | `fury-sub-2-3-1` | `See Through Your Tricks` | `Multiple` | no | — | — | — | children: `RollModifier` `fury-sub-2-3-1a` `{DoubleEdge, rollType: Test (default), skills: ['Search','Read Person'], condition: VERIFY-AGAINST-PIN}`; `RollModifier` `fury-sub-2-3-1b` `{DoubleEdge, skills: ['Gamble'], condition: '' (default)}` |
| 4 | `fury-sub-2-4-1` | `Growing Ferocity Improvement` | `HeroicResourceThreshold` | no | — | — | — | `{value: 8, level: 1 (default)}` → `SurgeGain` `{tag: 'slide 2', value: '2', replacesTags: ['slide']}` |
| 5 | `fury-sub-2-5-1` | `Unfettered` | `Multiple` | no | — | — | — | children: `Text` `fury-sub-2-5-1a`; `RollModifier` `fury-sub-2-5-1b` `{DoubleEdge, skills: ['Escape Artist'], condition: VERIFY-AGAINST-PIN}` |
| 6 | `fury-sub-2-6-1` | `6th-Level Aspect Ability` | `Choice` | **yes** | 1 *(default)* | `build` *(default)* | `fury-sub-2-6-1a` *Death Strike*, `fury-sub-2-6-1b` *Seek and Destroy* | `selected: Feature[]` |
| 7 | `fury-sub-2-7-1` | `Growing Ferocity Improvement` | `HeroicResourceThreshold` | no | — | — | — | `{value: 10}` → `Multiple` of `RollModifier` `{DoubleEdge, characteristics: [Agility]}` / `{DoubleEdge, rollType: Knockback}` |
| 8 | `fury-sub-2-8-1` | `A Step Ahead` | `Text` | no | — | — | — | none. `text: VERIFY-AGAINST-PIN` |
| 9 | `fury-sub-2-9-1` | `9th-Level Aspect Ability` | `Choice` | **yes** | 1 *(default)* | `build` *(default)* | `fury-sub-2-9-1a` *Primordial Bane*, `fury-sub-2-9-1b` *Shower of Blood* | `selected: Feature[]` |
| 10 | `fury-sub-2-10-1` | `Growing Ferocity Improvement` | `HeroicResourceThreshold` | no | — | — | — | `{value: 12}` → `Text` `fury-sub-2-10-1a` |

Reaver: **15 top-level features**, levels 1–10 all present, **5 choice points**
(same shape as Berserker).

### `fury-sub-3` — Stormwight

`description: text: VERIFY-AGAINST-PIN`

**Levels 4, 7 and 10 are absent from `featuresByLevel` entirely.** See A-3.

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 1 | `fury-sub-3-1-1` | `Skill` *(default)* | `SkillChoice` | **yes** | 1 *(default)* | `build` *(default)* | all 5 lists *(default)* | `selected: ['Track']` pre-populated |
| 1 | `fury-sub-3-1-2` | **`Beast Shape`** (explicit name, not the `Kit` default) | `Kit` | **yes** | 1 *(default)* | — (always re-offered at respite) | **`types: ['Stormwight']`** ⇒ the 4 stormwight kits only | `selected: Kit[]` |
| 1 | `fury-sub-3-1-3` | `Relentless Hunter` | `RollModifier` | no | — | — | — | `{Edge, rollType: Test (default), skills: ['Track'], characteristics: [] (default), condition: '' (default)}` |
| 1 | `fury-sub-3-1-4` | `Furious Change` | `Ability` | no | — | — | — | granted ability |
| 1 | `fury-sub-3-1-5` | `Aspect of the Wild` | `Ability` | no | — | — | — | granted ability — the shapeshift control |
| 2 | `fury-sub-3-2-1` | `Tooth and Claw` | `Text` | no | — | — | — | none. `text: VERIFY-AGAINST-PIN` |
| 2 | `fury-sub-3-2-2` | `2nd-Level Aspect Ability` | `Choice` | **yes** | 1 *(default)* | `build` *(default)* | `fury-sub-3-2-2a` *Apex Predator*, `fury-sub-3-2-2b` *Visceral Roar* | `selected: Feature[]` |
| 3 | **`fury-sub-1-3-1`** | `Nature's Knight` | `Text` | no | — | — | — | none. **ID COLLIDES with Berserker L3 — A-2.** `text: VERIFY-AGAINST-PIN` |
| 4 | — | — | — | — | — | — | — | **no level-4 entry in source** |
| 5 | `fury-sub-3-5-1` | `Stormborn` | `Text` | no | — | — | — | none. `text: VERIFY-AGAINST-PIN` — cross-class reference to a Conduit domain feature (A-10). |
| 6 | `fury-sub-3-6-1` | `6th-Level Aspect Ability` | `Choice` | **yes** | 1 *(default)* | `build` *(default)* | `fury-sub-3-6-1a` *Pounce*, `fury-sub-3-6-1b` *Riders on the Storm* | `selected: Feature[]` |
| 7 | — | — | — | — | — | — | — | **no level-7 entry in source** |
| 8 | `fury-sub-3-8-1` | `Menagerie` | `Text` | no | — | — | — | none. `text: VERIFY-AGAINST-PIN` — **mutates the L1 kit choice's option set / respite behaviour, expressed only as prose (A-4).** |
| 9 | `fury-sub-3-9-1` | `9th-Level Aspect Ability` | `Choice` | **yes** | 1 *(default)* | `build` *(default)* | `fury-sub-3-9-1a` *Death Rattle*, `fury-sub-3-9-1b` *Deluge* | `selected: Feature[]` |
| 10 | — | — | — | — | — | — | — | **no level-10 entry in source** |

Stormwight: **12 top-level features**, levels {1,2,3,5,6,8,9}, **5 choice points**.
Stormwight has **zero** `HeroicResourceThreshold` features of its own — its entire
Growing Ferocity ladder lives inside the selected stormwight **kit** (below).

### Stormwight kits (`src/data/kits/stormwight/`)

Kits are a **flat global pool** registered in `src/data/kit-data.ts`; the only
discriminator is the `Kit.type` string. All 21 non-stormwight kits have
`type: ''` (rendered "Standard"); the 4 stormwight kits have `type: 'Stormwight'`.
`ConfigKit` filters `SourcebookLogic.getKits(sourcebooks).filter(k => kitTypes.includes(k.type))`
where `kitTypes = data.types.length > 0 ? data.types : ['']`.
So the attachment is **purely by type-string match on a shared pool** — there is
no subclass→kit foreign key anywhere.

**Standard-kit pool (Berserker / Reaver, `types: ['']`), 21 entries:** Arcane
Archer, Battlemind, Cloak and Dagger, Dual Wielder, Guisarmier, Martial Artist,
Mountain, Panther, Pugilist, Raider, Ranger, Rapid Fire, Retiarius, Shining
Armor, Sniper, Spellsword, Stick And Robe, Swashbuckler, Sword and Board,
Warrior Priest, Whirlwind.

**Stormwight pool (`types: ['Stormwight']`), 4 entries:**

| Kit id | Name | armor | weapon | stamina | speed | stability | disengage | meleeDamage (t1/t2/t3) | rangedDamage | meleeDistance | rangedDistance |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `kit-boren` | Boren | `[]` | `[Unarmed]` | 9 | 0 | 2 | 0 | 0 / 0 / 4 | `null` | 0 | 0 |
| `kit-corven` | Corven | `[]` | `[Unarmed]` | 3 | 3 | 0 | 1 | 2 / 2 / 2 | `null` | 0 | 0 |
| `kit-raden` | Raden | `[]` | `[Unarmed]` | 3 | 3 | 0 | 1 | 2 / 2 / 2 | `null` | 0 | 0 |
| `kit-vuken` | Vuken | `[]` | `[Unarmed]` | 9 | 2 | 0 | 1 | 2 / 2 / 2 | `null` | 0 | 0 |

Each kit's `features[]` (6 each, same 6-slot shape, but **not the same types** —
see A-5):

| Slot | `kit-boren` | `kit-corven` | `kit-raden` | `kit-vuken` |
|---|---|---|---|---|
| signature ability | `kit-boren-signature` **Bear Claws** (`Ability`) | `kit-corven-signature` **Wing Buffet** | `kit-raden-signature` **Driving Pounce** | `kit-vuken-signature` **Unbalancing Attack** |
| aspect benefits | `kit-boren-feature-1` `Text` | `kit-corven-feature-1` `Multiple` → `Text` `-1a` + `RollModifier` `-1b` `{Edge, skills:['Hide','Sneak']}` | `kit-raden-feature-1` `Multiple` → `Text` `-1a` + `RollModifier` `-1b` `{Edge, skills:['Hide','Sneak']}` | `kit-vuken-feature-1` `Text` |
| animal form | `kit-boren-feature-2a` **`Toggle`** `{checked:false, featureUnchecked:null}` → `Multiple`: `Size {value:2, mod:'' (default)}`, `AbilityDistance {keywords:[Melee,Weapon], value:1}` | `kit-corven-feature-2a` **`Toggle`** → `Multiple`: `Size {1,'T'}`, `MovementMode {'Fly'}`, `Text` | `kit-raden-feature-2a` **`Toggle`** → `Multiple`: `Size {1,'T'}`, `MovementMode {'Climb'}`, `Text` | `kit-vuken-feature-2a` **`Toggle`** → `Multiple`: `Size {1,'L'}`, `Bonus {Speed, +2}`, `Text` |
| hybrid form | `kit-boren-feature-2b` **`Toggle`** → `Multiple`: `Size {2}`, `AbilityDistance {+1}`, `Text` | `kit-corven-feature-2b` **`Text` (NOT a Toggle)** | `kit-raden-feature-2b` **`Text` (NOT a Toggle)** | `kit-vuken-feature-2b` **`Toggle`** → `Multiple`: `Size {1,'L'}`, `Bonus {Speed,+2}`, `Text` |
| primordial storm | `kit-boren-feature-3` `Text` — Blizzard | `kit-corven-feature-3` `Text` — Anabatic Wind | `kit-raden-feature-3` `Text` — Rat Flood | `kit-vuken-feature-3` `Text` — Lightning Storm |
| growing ferocity | `kit-boren-feature-4` `Multiple` (6 thresholds) | `kit-corven-feature-4` `Multiple` (6) | `kit-raden-feature-4` `Multiple` (6) | `kit-vuken-feature-4` `Multiple` (6) |

The damage type each Primordial Storm sets is carried **only as free prose** in
the `Text` feature's description — there is no `damageType` field. Values named
in source: boren cold, corven fire, raden corruption, vuken lightning.
`VERIFY-AGAINST-PIN`; note the structural gap (A-6).

Kit Growing Ferocity ladders (every threshold has `resource: 'Ferocity'`):

| Ferocity | `level` gate | boren | corven | raden | vuken |
|---|---|---|---|---|---|
| 2 | 1 *(default)* | `Multiple`: `Text` + `SurgeGain {tag:'strike-grabbed', value:'1', **AtWill**}` | `Text` | `Text` | `Text` |
| 4 | 1 *(default)* | `SurgeGain {tag:'grab', '1', OncePerRound}` | `SurgeGain {tag:'shift', '1', OncePerRound}` | `SurgeGain {tag:'shift', '1', OncePerRound}` | `SurgeGain {tag:'push-or-prone', '1', OncePerRound}` |
| 6 | 1 *(default)* | `Multiple`: `RollModifier {Edge, rollType: Grab}`, `{Edge, Knockback}` | `Multiple`: `{Edge, characteristics:[Agility]}`, `{Edge, EscapeGrab}`, `{Edge, Knockback}` | same 3 as corven | `Multiple`: `{Edge, characteristics:[Agility]}`, `{Edge, Knockback}` |
| 8 | **`level: 4`** | `SurgeGain {tag:'grab 2','2', replacesTags:['grab']}` | `SurgeGain {tag:'shift 2','2', replacesTags:['shift']}` | same as corven | `SurgeGain {tag:'push-or-prone 2','2', replacesTags:['push-or-prone']}` |
| 10 | **`level: 7`** | `Multiple`: `{DoubleEdge, Grab}`, `{DoubleEdge, Knockback}` | `Multiple`: `{DoubleEdge, [Agility]}`, `{DoubleEdge, EscapeGrab}`, `{DoubleEdge, Knockback}` | same as corven | `Multiple`: `{DoubleEdge, [Agility]}`, `{DoubleEdge, Knockback}` |
| 12 | **`level: 10`** | `Text` | `Text` | `Text` | `Text` |

Note the **two different level-gating mechanisms**: berserker/reaver gate their
8/10/12 thresholds by *placement in `featuresByLevel[4/7/10]`* (their `level`
field is the default `1`); the kits gate theirs by the *`level` field on the
threshold itself* (because kit features carry no level — `getFeaturesFromKit`
passes `level: undefined`). Both are honoured by
`HeroLogic.getFeatures` / `getThresholdFeatures`, which skip a threshold when
`heroLevel < threshold.data.level`.

---

## Abilities

Structural only. `cost` is `'signature'` or a point value. `action type` is the
resolved `AbilityUsage` from `FactoryLogic.type.create*` (`free: true` shown as
"Free"). `distance` from `FactoryLogic.distance.*`. Ability *effect* text and
power-roll tier strings are **not** transcribed — `sections: VERIFY-AGAINST-PIN`.
Where a `spend` section exists it is noted, because it is a structural field
(`AbilitySectionField {name:'Spend', value, repeatable}`), not prose.

### Class ability pool — `fury.abilities` (24)

These are the only abilities reachable by a `ClassAbility` choice.
`SourcebookLogic.getAbilitiesFromClass` is filtered by `a.cost === data.cost`
and `a.minLevel <= data.minLevel`; every Fury ability has `minLevel: 1 (default)`.

| id | Name | cost | Action type | Keywords | Distance | Target | Power roll characteristic | Sections |
|---|---|---|---|---|---|---|---|---|
| `fury-ability-1` | Brutal Slam | signature | Main Action | Melee, Strike, Weapon | Melee 1 | One creature or object | Might | 1 roll |
| `fury-ability-2` | Hit And Run | signature | Main Action | Melee, Strike, Weapon | Melee 1 | One creature or object | Might | roll + text |
| `fury-ability-3` | Impaled! | signature | Main Action | Melee, Strike, Weapon | Melee 1 | One creature of your size or smaller | Might | 1 roll |
| `fury-ability-4` | To the Death! | signature | Main Action | Melee, Strike, Weapon | Melee 1 | One creature or object | Might | roll + text |
| `fury-ability-5` | Back! | 3 | Main Action | Area, Melee, Weapon | Burst 1 | Each enemy in the area | Might | 1 roll |
| `fury-ability-6` | Out of the Way! | 3 | Main Action | Melee, Strike, Weapon | Melee 1 | One creature | Might | roll + text |
| `fury-ability-7` | Tide of Death | 3 | Main Action | Melee, Weapon | Self | Self; see below | Might | text + roll + text |
| `fury-ability-8` | Your Entrails Are Your Extrails! | 3 | Main Action | Melee, Strike, Weapon | Melee 1 | One creature or object | Might | roll + text |
| `fury-ability-9` | Blood for Blood! | 5 | Main Action | Melee, Strike, Weapon | Melee 1 | One creature or object | Might | roll + text |
| `fury-ability-10` | Make Peace With Your God! | 5 | **Free** Maneuver | *(none)* | Self | Self | — | text only |
| `fury-ability-11` | Thunder Roar | 5 | Main Action | Area, Melee, Weapon | Line `value:5, value2:1, within:1` | Each enemy in the area | Might | roll + text |
| `fury-ability-12` | To the Uttermost End | 5 | Main Action | Melee, Strike, Weapon | Melee 1 | One creature | Might | roll + **spend `{value: 1 (default), repeatable: true}`** |
| `fury-ability-13` | Demon Unleashed | 7 | Maneuver | Magic | Self | Self | — | text only |
| `fury-ability-14` | Face the Storm! | 7 | Maneuver | Magic | Self | Self | — | text only |
| `fury-ability-15` | Steelbreaker | 7 | Maneuver | Magic | Self | Self | — | text only |
| `fury-ability-16` | You Are Already Dead | 7 | Main Action | Melee, Strike, Weapon | Melee 1 | One creature | — | text only (**no power roll despite Strike keyword** — A-11) |
| `fury-ability-17` | Debilitating Strike | 9 | Main Action | Melee, Strike, Weapon | Melee 1 | One creature | Might | roll + text |
| `fury-ability-18` | My Turn! | 9 | **Free** Triggered Action | Melee, Strike, Weapon | Melee 1 | The triggering creature | Might | roll + text. `trigger: VERIFY-AGAINST-PIN` |
| `fury-ability-19` | Rebounding Storm | 9 | Main Action | Melee, Strike, Weapon | Melee 1 | Two creatures or objects | Might | roll + text |
| `fury-ability-20` | To Stone! | 9 | Main Action | Magic, Melee, Strike, Weapon | Melee 1 | One creature | Might | roll + text |
| `fury-ability-21` | Elemental Ferocity | 11 | Maneuver | Magic | Self | Self | — | text only |
| `fury-ability-22` | Overkill | 11 | Main Action | Magic, Melee, Strike, Weapon | Melee 1 | One creature | Might | roll + text |
| `fury-ability-23` | Primordial Rage | 11 | Maneuver | Magic | Self | Self | — | text only |
| `fury-ability-24` | Relentless Death | 11 | Main Action | Magic, Melee, Strike, Weapon | **Self** | Self; see below | Might | text + roll (**Strike keyword with Self distance** — A-11) |

Pool sizes by cost: signature 4, 3pt 4, 5pt 4, 7pt 4, 9pt 4, 11pt 4.
The builder offers exactly `count: 1` from each — so a level-10 Fury picks 6 of 24.

### Berserker abilities (7 — all embedded, none in the pool)

| id | Name | cost | Action type | Keywords | Distance | Target | Delivery |
|---|---|---|---|---|---|---|---|
| `fury-sub-1-1-4` | Lines of Force | `0` *(default — no cost given)* | Triggered Action (not free) | Magic, Melee | Melee 1 | Self or one creature | granted at L1 (`FeatureAbility`); has **spend `{value:1 (default)}`** |
| `fury-sub-1-2-2a` | Special Delivery | 5 | Maneuver | Melee, Weapon | Melee 1 | One willing ally | L2 `Choice` option |
| `fury-sub-1-2-2b` | Wrecking Ball | 5 | Maneuver | Melee, Weapon | Self | Self; see below | L2 `Choice` option; text + roll (Might) |
| `fury-sub-1-6-1a` | Avalanche Impact | 9 | Maneuver | Magic | Self | Self | L6 `Choice` option; text + roll (Might) |
| `fury-sub-1-6-1b` | Force of Storms | 9 | Main Action | Melee, Strike, Weapon | Melee 1 | One creature | L6 `Choice` option |
| `fury-sub-1-9-1a` | Death Comes for You All! | 11 | Main Action | Area, Magic, Melee, Weapon | Burst 3 | Each enemy in the area | L9 `Choice` option |
| `fury-sub-1-9-1b` | Primordial Vortex | 11 | Main Action | Melee, **Strike**, Weapon | **Burst 3** | Each enemy in the area | L9 `Choice` option (**A-11**) |

### Reaver abilities (7)

| id | Name | cost | Action type | Keywords | Distance | Target | Delivery |
|---|---|---|---|---|---|---|---|
| `fury-sub-2-1-4` | Unearthly Reflexes | `0` *(default)* | Triggered Action (not free) | *(none)* | Self | Self | granted at L1; **spend `{value:1}`** |
| `fury-sub-2-2-2a` | Death … Deeaaath! | 5 | Main Action | Melee, Strike, Weapon | Melee 1 | One creature | L2 `Choice` option |
| `fury-sub-2-2-2b` | Phalanx-Breaker | 5 | Main Action | Melee, Weapon | Self | Self; see below | L2 `Choice` option |
| `fury-sub-2-6-1a` | Death Strike | 9 | **Free** Triggered Action | Magic, Strike, Weapon | Melee 1 | Self | L6 `Choice` option |
| `fury-sub-2-6-1b` | Seek and Destroy | 9 | Main Action | Melee, Strike, Weapon | Melee 1 | One creature | L6 `Choice` option |
| `fury-sub-2-9-1a` | Primordial Bane | 11 | Main Action | Magic, Melee, Strike, Weapon | Melee 1 | One creature | L9 `Choice` option |
| `fury-sub-2-9-1b` | Shower of Blood | 11 | Main Action | Melee, Strike, Weapon | Melee 1 | One creature | L9 `Choice` option |

### Stormwight abilities (8)

| id | Name | cost | Action type | Keywords | Distance | Target | Delivery |
|---|---|---|---|---|---|---|---|
| `fury-sub-3-1-4` | Furious Change | `0` *(default)* | Triggered Action (not free) | *(none)* | Self | Self | granted at L1; **spend `{value:1}`** |
| `fury-sub-3-1-5` | Aspect of the Wild | `0` *(default)* | Maneuver | Magic | Self | Self | granted at L1; **spend `{value:1}`**. This is the shapeshift control. |
| `fury-sub-3-2-2a` | Apex Predator | 5 | Main Action | Melee, Strike, Weapon | Melee 1 | One creature | L2 `Choice` option |
| `fury-sub-3-2-2b` | Visceral Roar | 5 | Main Action | Area, Magic | Burst 2 | Each enemy in the area | L2 `Choice` option |
| `fury-sub-3-6-1a` | Pounce | 9 | Main Action | Magic, Melee, Strike, Weapon | Melee 1 | One creature | L6 `Choice` option |
| `fury-sub-3-6-1b` | Riders on the Storm | 9 | Maneuver | Area, Magic | Aura 3 | Each creature in the area | L6 `Choice` option |
| `fury-sub-3-9-1a` | Death Rattle | 11 | Main Action | Area, Magic | Burst 3 | Each enemy in the area | L9 `Choice` option |
| `fury-sub-3-9-1b` | Deluge | 11 | Main Action | Area, Magic, Ranged | Cube `value:5, within:10` | Each enemy in the area | L9 `Choice` option |

### Stormwight kit signature abilities (4 — granted by the kit, not chosen)

| id | Name | cost | Action type | Keywords | Distance | Target | Power roll characteristic |
|---|---|---|---|---|---|---|---|
| `kit-boren-signature` | Bear Claws | signature | Main Action | Melee, Strike, Weapon | Melee 1 | One creature or object | Might |
| `kit-corven-signature` | Wing Buffet | signature | Main Action | Area, Melee, Weapon | Burst 1 | Each enemy in the area | **Agility** |
| `kit-raden-signature` | Driving Pounce | signature | Main Action | Melee, Strike, Weapon | Melee 1 | One creature or objects *(sic)* | **Agility** |
| `kit-vuken-signature` | Unbalancing Attack | signature | Main Action | Melee, Strike, Weapon | Melee 1 | One creature or object | Might |

**Total abilities reachable by a Fury: 50** (24 class pool + 7 + 7 + 8 subclass
+ 4 kit signatures).

---

## Choice-point inventory

In build order, as `ClassSection` renders them. "Card." = cardinality.

### Stage 0 — class scaffolding (not `Feature` rows; fields on `HeroClass`)

| # | Choice | Card. | Options | Notes |
|---|---|---|---|---|
| 0.1 | Select class | 1 of N | all classes in enabled sourcebooks | Deep-copies the class into `hero.class`. |
| 0.2 | Class level | 1 of 1–10 | `NumberSpin min 1 max featuresByLevel.length` (=10) | Gates every subsequent row. |
| 0.3 | Primary characteristics | **0 — auto** | `primaryCharacteristicsOptions` has length 1 ⇒ `hero.class.primaryCharacteristics = [Might, Agility]` is assigned on class selection | **Not a player choice for Fury.** |
| 0.4 | Characteristic array | 1 of 3 | `HeroLogic.getCharacteristicArrays(2)` = `[2,-1,-1]`, `[1,0,0]`, `[1,1,-1]` | Primary characteristics are fixed at 2 each; the array covers the other three. |
| 0.5 | Array assignment | 1 of N permutations | `calculateCharacteristicArrays(array, [Might, Agility])` — distinct permutations over Reason/Intuition/Presence | 3 for `[2,-1,-1]`, 3 for `[1,1,-1]`, 1 for `[1,0,0]`. |
| 0.6 | **Primordial Aspect** | 1 of 3 | Berserker / Reaver / Stormwight | Sets `subclass.selected = true`. **Gates every subclass row and the kit pool.** |

### Stage 1 — class features by level

| # | Level | Feature | Card. | Options |
|---|---|---|---|---|
| 1.1 | 1 | `fury-1-1` skill | 1 (pre-filled `Nature`) | any skill from all 5 lists |
| 1.2 | 1 | `fury-1-2` skills | **2** | Exploration + Intrigue lists |
| 1.3 | 1 | `fury-1-5` signature ability | 1 | 4 (`fury-ability-1..4`) |
| 1.4 | 1 | `fury-1-6` 3pt ability | 1 | 4 (`fury-ability-5..8`) |
| 1.5 | 1 | `fury-1-7` 5pt ability | 1 | 4 (`fury-ability-9..12`) |
| 1.6 | 2 | `fury-2-1` perk | 1 | Crafting / Exploration / Intrigue perks |
| 1.7 | 3 | `fury-3-1` 7pt ability | 1 | 4 (`fury-ability-13..16`) |
| 1.8 | 4 | `fury-4-3` perk | 1 | all 6 perk lists |
| 1.9 | 4 | `fury-4-6` skill | 1 | all 5 skill lists |
| 1.10 | 5 | `fury-5-1` 9pt ability | 1 | 4 (`fury-ability-17..20`) |
| 1.11 | 6 | `fury-6-3` perk | 1 | Crafting / Exploration / Intrigue |
| 1.12 | 7 | `fury-7-4` skill | 1 | all 5 lists |
| 1.13 | 8 | `fury-8-1` perk | 1 | all 6 lists |
| 1.14 | 8 | `fury-8-2` 11pt ability | 1 | 4 (`fury-ability-21..24`) |
| 1.15 | 10 | `fury-10-3` perk | 1 | all 6 lists |
| 1.16 | 10 | `fury-10-6` skill | 1 | all 5 lists |

Level 9 contributes **no** choice point.
All ability pools are additionally filtered by
`!currentAbilityIDs.includes(a.id)` and de-duplicated by **name**, so a Fury can
never pick the same ability twice.
All skill pools are filtered by `!currentSkills.includes(skill.name)` where
`currentSkills` includes skills from ancestry/culture/career and cancelled skills.

### Stage 2 — subclass features (depends on 0.6)

| # | Level | Berserker | Reaver | Stormwight |
|---|---|---|---|---|
| 2.1 | 1 | skill (pre-filled `Lift`), 1 | skill (pre-filled `Hide`), 1 | skill (pre-filled `Track`), 1 |
| 2.2 | 1 | **Kit**, 1 of **21** standard | **Kit**, 1 of **21** standard | **Beast Shape**, 1 of **4** stormwight |
| 2.3 | 2 | aspect ability, 1 of 2 | aspect ability, 1 of 2 | aspect ability, 1 of 2 |
| 2.4 | 6 | aspect ability, 1 of 2 | aspect ability, 1 of 2 | aspect ability, 1 of 2 |
| 2.5 | 9 | aspect ability, 1 of 2 | aspect ability, 1 of 2 | aspect ability, 1 of 2 |

### Stage 3 — kit-internal config (rendered inside the kit's "Configure" expander)

`ConfigKit` collects `kit.features.filter(FeatureLogic.isChoice)` — for
stormwight kits that means the **`Toggle` features**:

| Kit | Toggles surfaced |
|---|---|
| `kit-boren` | Animal Form: Bear; Hybrid Form: Bear |
| `kit-corven` | Animal Form: Crow **only** (hybrid is a `Text`) |
| `kit-raden` | Animal Form: Rat **only** (hybrid is a `Text`) |
| `kit-vuken` | Animal Form: Wolf; Hybrid Form: Wolf |

These are **play state, not build choices** (`checked: false` by default; they
gate `Size`, `Speed`, `MovementMode` and `AbilityDistance` modifiers). Standard
kits contribute no such toggles. See A-5 / A-12.

**Totals for a level-10 hero:** 3 scaffolding choices + 16 class-level +
5 subclass = **24 build choice points**, plus 1–2 kit form toggles as
runtime state, plus 6 abilities picked from a 24-ability pool.

---

## UI surface

Ordered list of controls the builder renders on the Class tab. The page's own
tab order is `start → ancestry → culture → career → class → complication →
details`; only the `class` tab is specified here.

| # | Control | Kind | Bound to | Enabled when |
|---|---|---|---|---|
| 1 | Class picker (grid of class cards) | single-select | `hero.class` | always (until a class is picked) |
| 2 | "Level" spinner + XP field + "Advance to level N" button | numeric stepper (1–10) + action button | `hero.class.level` | class chosen |
| 3 | Characteristics — primary picker | *(suppressed for Fury)* | `hero.class.primaryCharacteristics` | only when `primaryCharacteristicsOptions.length > 1` — **never for Fury** |
| 4 | Characteristics — array picker | single-select, 3 buttons | local state → `characteristics` | after primaries assigned |
| 5 | Characteristics — assignment picker | single-select over stat rows | `hero.class.characteristics` | after array picked |
| 6 | "Primordial Aspect" | single-select via drawer (`SubClassSelectModal`) + remove button | `subclass.selected` | class chosen |
| 7 | "Level N Choices" expanders (one per level 1..10 that has features), auto-expanded when incomplete, ✓ when complete | accordion | — | per level ≤ `class.level` |
| 7.1 | `Skill` / `Exploration / Intrigue Skills` | searchable list in drawer (`SkillSelectModal`); N selection boxes with remove | `SkillChoice.selected` | — |
| 7.2 | `Signature/3pt/5pt/7pt/9pt/11pt Ability` | searchable list in drawer (`AbilitySelectModal`) showing full ability cards; selection box with remove + info drawer | `ClassAbility.selectedIDs` | — |
| 7.3 | `Perk` | searchable list in drawer | `Perk.selected` | — |
| 7.4 | `Kit` / `Beast Shape` | searchable list in drawer (`KitSelectModal`) showing kit stat cards; selection box with remove, info drawer, **and a nested "Configure" expander** | `Kit.selected` | subclass chosen |
| 7.4.1 | Animal Form / Hybrid Form | **toggle** (nested sub-choice inside 7.4) | `Toggle.checked` | stormwight kit selected |
| 7.5 | `2nd/6th/9th-Level Aspect Ability` | single-select over 2 inline option cards | `Choice.selected` | subclass chosen |
| 8 | Full class panel (read-only summary: stamina, recoveries, resource, abilities, features) | display | — | class chosen |

Additional surface **outside** the builder:

| Control | Kind | Where | Notes |
|---|---|---|---|
| Respite: "Change your kit" | single-select re-run of 7.4 | `HeroRespiteModal` | `FeatureType.Kit` is filtered in **unconditionally** (`return true`) — no `selectAt` involved. Every kit choice is respite-mutable by construction. |
| Respite: `selectAt === 'respite'` re-picks | single-select / multi-select | `HeroRespiteModal` | **Fury has none** — every `Choice`/`SkillChoice` on Fury resolves to `selectAt: 'build'`. |
| Ferocity tracker + threshold readout | numeric + derived list | hero sheet | `getHeroicResources` sorts thresholds by value and computes which are live. |

No control is `free text` and none is `multi-select-N` except `fury-1-2`
(skills, N=2). Everything else is single-select, searchable list, nested
sub-choice, or toggle.

---

## Convex data model notes

### Definition data (seeded once, versioned by source, shared)

| Table | Key | Contents |
|---|---|---|
| `classes` | `class-fury` | identity fields, `subclassName`, `subclassCount`, `primaryCharacteristicsOptions` |
| `classFeatures` | `(classId, level, featureId)` | the 40 rows of the level-progression table, each with `featureType` + a type-discriminated `definition` payload |
| `subclasses` | `fury-sub-1..3` | identity + `classId` |
| `subclassFeatures` | `(subclassId, level, featureId)` | 16 / 15 / 12 rows |
| `abilities` | `fury-ability-1..24`, `fury-sub-*`, `kit-*-signature` | ability cards; `poolClassId` set only for the 24 class-pool entries |
| `kits` | `kit-boren` etc. + 21 standard | stat block + `kitType` string + `features[]` |

Everything above is **static**. Forge Steel's `HeroClass.level`,
`HeroClass.characteristics`, `HeroClass.primaryCharacteristics`,
`SubClass.selected`, and every `data.selected` / `selectedIDs` /
`Toggle.checked` field are **per-hero** and must not live in these tables.

### Selection state (per hero, sparse, keyed by feature id)

```
heroClassState: {
  heroId, classId: 'class-fury',
  level: 1..10,
  primaryCharacteristics: ['Might','Agility'],   // derived, but persist it
  characteristics: [{characteristic, value} x5],
  selectedSubclassIds: ['fury-sub-2'],            // array; cardinality = subclassCount
}

featureSelections: Map<featureId, Selection>      // sparse — absent = unmade
```

`Selection` is a discriminated union mirroring the `FeatureType`:

| FeatureType | Selection payload |
|---|---|
| `SkillChoice` | `{ skills: string[] }` |
| `ClassAbility` | `{ abilityIds: string[] }` |
| `Perk` | `{ perkIds: string[] }` |
| `Kit` | `{ kitIds: string[] }` |
| `Choice` | `{ optionFeatureIds: string[] }` |
| `Toggle` | `{ checked: boolean }` — **runtime, not build** |

Store **ids, never deep copies.** Forge Steel's model is the opposite: it
`Utils.copy`s the whole class, subclass and kit objects into the hero and writes
`selected` in place, so a hero carries its own private, forkable copy of the
rules. That is what lets it survive definition edits; it is also why
`hero-update-logic.ts` needs a per-feature-type migration switch. Our sparse
id-keyed map trades that for a **migration obligation**: if a definition drops a
feature id or narrows an option list, the stale selection must be detected and
re-prompted rather than silently dropped.

### Where the definition/selection split is genuinely hard

1. **Kit selection injects a whole feature subtree.** `Kit.selected` is not a
   leaf — `simplifyFeatures` walks `kit.features` and adds every one of them to
   the hero's live feature list, *including further choice features* (the form
   `Toggle`s). So a `featureSelections` entry can create **new selectable feature
   ids** that did not exist before it was made. A flat sparse map still works,
   but the *set of valid keys* is a function of prior selections. Our resolver
   must compute the reachable feature set iteratively, not from a static
   manifest. **Nested key namespacing matters**: two heroes with different kits
   have disjoint sub-keys.
2. **Kit choice is respite-mutable with no field to say so.** `FeatureKitData`
   has no `selectAt`; the respite modal hard-codes `case FeatureType.Kit: return true`.
   We should model this explicitly (`remakeAt: 'respite'` on the definition
   row) rather than by type. Stormwight's L8 *Menagerie* additionally claims a
   free swap **and** widens the pool — prose only (A-4).
3. **Heroic-resource thresholds are a second, orthogonal unlock graph.**
   `HeroicResourceThreshold` features are *not* expanded by `simplifyFeatures`;
   `HeroLogic.getFeatures` runs a **fixpoint loop** (`do { … } while
   (unlockedFeatures.length > 0)`) unlocking thresholds whose resource value is
   met, which can in turn unlock further thresholds. Any Convex "effective
   features for this hero" query must be a fixpoint over
   `(heroLevel, currentFerocity)`, not a level filter. Note this makes the
   feature set depend on **live combat state**, which is the sharpest violation
   of the static-definition assumption in the whole class.
4. **Resource gains replace each other by tag string, across sources.**
   `fury-4-2` (`take-damage 2`) replaces the class-level `take-damage`;
   `fury-10-4` replaces both; kit surge gains replace kit surge gains
   (`grab` → `grab 2`). The replacement graph is resolved at read time by
   `replacesTags` string matching over the *union* of class + subclass + kit +
   domain gains. Model tags as first-class, and validate uniqueness at seed time
   — a typo silently produces a double-count.
5. **Two level-gating mechanisms coexist.** Berserker/Reaver gate thresholds by
   `featuresByLevel` placement (`level` field left at the default `1`); the kits
   gate by the threshold's own `level` field (kit features have no level).
   A single `minLevel` column on our feature row can normalise both, but the
   importer must read `featuresByLevel[n]` **and** `data.level` and take the max.
6. **Pre-populated `selected` arrays are fixed grants wearing a choice's
   clothes.** `fury-1-1` (`Nature`), `fury-sub-1-1-1` (`Lift`),
   `fury-sub-2-1-1` (`Hide`), `fury-sub-3-1-1` (`Track`) are `SkillChoice` with
   `count: 1` and the skill already in `selected`. `isChosen` reports them
   complete, but `ConfigSkillChoice` still renders a remove button, so a player
   can delete the granted skill and pick a different one from **any** list.
   Decide deliberately: model as `grant` (immutable) or as `choice with default`.
   Forge Steel's structure says the latter; that is almost certainly a modelling
   artefact rather than a rule.
7. **Subclass-conditional prose.** `fury-7-2` and `fury-10-1` branch on which
   aspect was chosen ("if you are a berserker or reaver … if you are a
   stormwight …"). There is no structural conditional — no `SwitchOptions`,
   no `Toggle`. If we want the sheet to show only the applicable half, we need a
   condition field the source does not provide (A-8).
8. **`HeroOverview.background` is a display concatenation**, built in
   `HeroLogic` from `culture.name`, `career.name` and the selected inciting
   incident. There is no "background" concept in Draw Steel; do **not** create a
   `background` column.

---

## Anomalies & open questions

**A-1 — `fury-1-3` does not exist.** Level-1 feature ids run
`fury-1-1, fury-1-2, fury-1-4, fury-1-5, fury-1-6, fury-1-7`. The gap is almost
certainly a removed feature — plausibly the kit grant, which now lives on each
subclass instead. **The Fury class itself grants no kit**; all three subclasses
do, at level 1. Verify against the pin whether the kit is a class feature or an
aspect feature; if it is a class feature, our importer must not reproduce the
three-way duplication.

**A-2 — Duplicate feature id `fury-sub-1-3-1` across two subclasses.**
Berserker's level-3 *Immovable Object* and Stormwight's level-3
*Nature's Knight* carry the **same id**. This is a real defect in the source
(Stormwight's should presumably be `fury-sub-3-3-1`). Because Forge Steel
namespaces selections by feature id inside a per-hero deep copy, the collision is
harmless there — a hero has only one subclass. It is **not** harmless for a
sparse global `featureSelections` map or for a `subclassFeatures` table with a
unique `featureId` key. Our importer must rewrite the id and record the rewrite.

**A-3 — Stormwight has no features at levels 4, 7 and 10.** Berserker and Reaver
each have entries at all ten levels; Stormwight's `featuresByLevel` is
`{1,2,3,5,6,8,9}`. The missing levels are exactly the levels at which
Berserker/Reaver receive their Growing Ferocity 8/10/12 improvements — Stormwight
gets those from its **kit** instead (thresholds carrying explicit
`level: 4 / 7 / 10`). So the ladder is complete, but it is *sourced from a
different object*, and the builder's "Level 4 Choices" expander simply will not
render for a Stormwight. Confirm against the pin that Stormwight genuinely has no
other level-4/7/10 aspect feature.

**A-4 — *Menagerie* (Stormwight L8) mutates an earlier choice, in prose only.**
It claims (a) access to *all* stormwight kits, (b) a free kit swap during a
respite that does not consume the respite activity, and (c) an upgrade to
*Nature's Knight*'s sensing radius, and (d) a three-dice tracking test. None of
this is structural: it is a single `FeatureType.Text`. (a) is already true —
`Beast Shape` offers all 4 stormwight kits from level 1 — so either the source is
over-generous at level 1 or the rulebook restricts the level-1 pool in a way
Forge Steel does not encode. **Open question for the pin.** (b) is a real
cross-level dependency: an L8 feature changes the *cost model* of an L1 choice.
(c) is a feature-mutates-feature edge that our sparse map cannot express without
a supersession mechanism.

**A-5 — The four stormwight kits are not structurally uniform.**
Boren and Vuken model *hybrid form* as a `Toggle` with a real feature subtree;
Corven and Raden model it as inert `Text` ("your size is your choice of 1S or
1M. At 4th level, you can fly / climb"). So for two of four kits the hybrid form
grants nothing mechanical to the engine, and for two of four it grants
Size/Speed/MovementMode. Likewise *Aspect Benefits* is a `Text` for Boren/Vuken
but a `Multiple` containing a `RollModifier` for Corven/Raden. Do not assume a
uniform kit shape; the importer must be shape-tolerant, and the pin should be
consulted on whether Corven/Raden hybrid forms really have no toggled effects.
Corven's hybrid `Text` also embeds a **level-4 conditional** ("At 4th level, you
can fly") with no `level` field to gate it.

**A-6 — "Primordial damage type" has no field.** Each kit declares its damage
type only in the prose of a `Text` feature (`kit-*-feature-3`). But four other
features reference it mechanically: `fury-7-2` and `fury-10-1` scale immunity off
it; `fury-sub-3-2-2b` *Visceral Roar* and `fury-sub-3-9-1b` *Deluge* deal it;
`fury-sub-3-6-1b` *Riders on the Storm* deals it. We need a real
`primordialDamageType` field on the kit definition, derived at import. Values
named in source (all `VERIFY-AGAINST-PIN`): boren cold, corven fire, raden
corruption, vuken lightning.

**A-7 — *Primordial Strike* (`fury-4-5`) is a resource-spend mechanic modelled as
inert text.** It lets a strike consume 1 ferocity for 1 surge with a
player-chosen damage type, and `fury-10-1` raises the cap to 3. Nothing in the
structure expresses "spend N, gain N surges, choose a type." Compare
`AbilitySectionSpend`, which *does* exist and is used on `fury-ability-12`. If we
want a tracker affordance, we must author the structure ourselves.

**A-8 — Two class features branch on the chosen subclass with no conditional
construct.** `fury-7-2` *Elemental Form* and `fury-10-1` *Chaos Incarnate* both
read "if you are a berserker or reaver … if you are a stormwight …". Forge Steel
has `FeatureType.SwitchOptions` / `SwitchValue` for exactly this and does not use
them here. Candidate for restructuring at import, or for a `condition` field on
our feature row.

**A-9 — `fury-10-5` puts its rules text in the wrong slot.**
`createHeroicResource` accepts both `description` (→ the `Element.description`)
and `details` (→ `data.details`, which is the field the resource panel renders as
the resource's usage rules). *Primordial Power* passes `description`, so
`data.details` is `''`. Every other Fury resource-shaped field is empty too
(`fury-resource` passes neither). Low-stakes, but it means "how do I spend this
resource" is not in the field a UI would read.

**A-10 — Cross-class reference with no link.** Stormwight L5 *Stormborn* says the
hero uses "the Blessing of Fortunate Weather feature as if you were a 1st-level
conduit". It is plain `Text`; there is no `FeatureType.DomainFeature` and no id
pointing at the Conduit feature. Any implementation has to resolve that by hand.

**A-11 — Keyword/distance combinations that look inconsistent.**
`fury-ability-16` *You Are Already Dead* carries the `Strike` keyword and a Melee
distance but has **no power roll** (text-only section).
`fury-ability-24` *Relentless Death* carries `Melee, Strike` keywords with a
**Self** distance.
`fury-sub-1-9-1b` *Primordial Vortex* carries `Melee, Strike` with a **Burst 3**
distance and targets "Each enemy in the area".
`fury-ability-7` *Tide of Death* and `fury-sub-2-2-2b` *Phalanx-Breaker* carry
`Melee, Weapon` with a **Self** distance.
These may be faithful transcriptions of unusual abilities or transcription
errors; each is `VERIFY-AGAINST-PIN`. Do not let a validator reject them until
the pin has ruled.

**A-12 — Kit form toggles are combat state living in the build tree.**
`FeatureLogic.isChoice` returns `true` for `Toggle`, so `ConfigKit` renders
"Animal Form" / "Hybrid Form" checkboxes inside the *character builder*. They
default to `checked: false`, and `simplifyFeatures` only applies the subtree when
checked — so a hero's Size, Speed and MovementMode change based on a checkbox in
the builder. In our model these belong to encounter state, not to
`featureSelections`. Also note the two toggles are not mutually exclusive in the
data: nothing stops a Boren from having both Animal Form and Hybrid Form checked,
which *Aspect of the Wild*'s prose implies should be impossible.

**A-13 — `Lines of Force`, `Unearthly Reflexes`, `Furious Change` and
`Aspect of the Wild` have `cost: 0` by default.** None of the four passes a
`cost`, so `createAbility` defaults it to `0` — indistinguishable from a real
zero-cost ability. All four carry a `Spend` section with `value: 1 (default)`,
which is presumably "spend 1 ferocity for the enhanced effect". Confirm the
intended costs; a `0` cost also means these abilities would match a
`ClassAbility` choice with `cost: 0` if one were ever authored.

**A-14 — Hard-coded skill grants can collide with earlier-tab grants, and the
builder only warns.** `ConfigSkillChoice` filters the *option list* against
`HeroLogic.getSkills` (which collates every `SkillChoice.selected` on the hero,
including ancestry/culture/career ones) plus cancelled skills — so a *player*
can never pick a duplicate. But `Nature`, `Lift`, `Hide` and `Track` are written
straight into `selected` in the definition and bypass that filter entirely. The
panel does render a `Duplicated` warning field, and `isChosen` still reports the
choice complete, so the collision is visible but not blocking and not
auto-resolved. Decide whether our importer treats these as grants (and
de-duplicates at resolve time) or as defaults (and re-prompts on collision).

**A-15 — Unresolved from source.**
- Whether `subclassCount: 1` is ever raised (no Fury mechanism to do so exists).
- Whether the `winded` ferocity gain (`OncePerEncounter`) is intended to be
  reset by `resetGains` at the same boundary as the `OncePerRound` gains — the
  reset call takes an optional frequency filter and the Fury data does not
  indicate which boundary the caller uses.
- The `Perk` default list set includes `Supernatural` but **not** `Special`
  (`PerkList.Special` exists in the enum and is excluded from the factory
  default). Whether a Fury may take a `Special` perk is not answerable from this
  data.
- `SkillList.Custom` is likewise excluded from every default skill pool.
