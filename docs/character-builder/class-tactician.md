# Character builder — Tactician

> **Provenance — read before implementing.**
> Structure in this file is mapped from **Forge Steel**
> (github.com/andyaiken/forgesteel, GPL-3.0), commit `01672c1`, read 2026-08-29.
> Forge Steel is an independent third-party transcription of Draw Steel and is
> **not** our canon source. Every name, number, count and option list below is
> **UNVERIFIED** and must be confirmed against the pinned SteelCompendium
> corpus (DEC-0008) before it is implemented or shown to a user.
> This file is a **structural map for UI and data-model design**, not a rules source.

Source files read:
`src/data/classes/tactician/tactician.ts`, `insurgent.ts`, `mastermind.ts`,
`vanguard.ts`. Vocabulary resolved against `src/enums/feature-type.ts`,
`src/models/feature.ts`, `src/models/class.ts`, `src/models/subclass.ts`,
`src/models/ability.ts`, `src/logic/factory-logic.ts`,
`src/logic/factory-feature-logic.ts`, `src/logic/feature-logic.ts`,
`src/logic/hero-logic.ts`.

All `FeatureType` values, `count`s, `selectAt`s and default field values below
are **resolved through the factory builders**, not read off the call site. Where
a data file omits an argument, the resolved default is stated explicitly.

---

## Identity

| Field | Value | Notes |
|---|---|---|
| `id` | `class-tactician` | |
| `name` | `Tactician` | |
| `description` | prose | `text: VERIFY-AGAINST-PIN` |
| `type` | `'standard'` | Not `'master'`. |
| `subclassName` | `Tactical Doctrine` | The label the subclass picker renders. |
| `subclassCount` | `1` | Exactly one doctrine. |
| `primaryCharacteristicsOptions` | `[ [ Might, Reason ] ]` | **One** option only. |
| `primaryCharacteristics` | `[]` in the definition | Auto-filled at class selection — see Anomalies §A1. |
| `featuresByLevel` | levels 1–10, all present | Levels 1–10 all non-empty on the class. |
| `abilities` | 20 `Ability` records | The `ClassAbility` draw pool. |
| `subclasses` | `insurgent`, `mastermind`, `vanguard` | ids `tactician-sub-1/2/3`. |
| `level` | `1` | Definition-side seed; overwritten per hero. |
| `characteristics` | `[]` | Definition-side seed; per-hero assignment. |

Derived stat contributions declared at level 1 (not choices):

| Field | Value |
|---|---|
| Stamina | `21` base, `+9` per level (`FeatureField.Stamina`) |
| Recoveries | `10` (`FeatureField.Recoveries`) |
| Heroic resource | **Focus** (`type: 'heroic'`, `canBeNegative: false`) |

Characteristic assignment: primaries are Might + Reason (fixed), so
`getCharacteristicArrays(2)` applies — permitted non-primary arrays
`[2,-1,-1]`, `[1,0,0]`, `[1,1,-1]` permuted across Agility / Intuition /
Presence. (Rules content — verify against pin.)

---

## Level progression

Class features. Nested rows (children of a `Multiple`) are indented with `↳`.
`selectAt` is `—` where the `FeatureType` has no `selectAt` field at all.

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 1 | `tatician-stamina` | Stamina | `Bonus` | no | — | — | `field: Stamina, value: 21, valuePerLevel: 9`; defaults `valueCharacteristics: []`, `valueCharacteristicMultiplier: 1`, `valuePerEchelon: 0`, `valueFromController: null` | none — folds into derived Stamina |
| 1 | `tactician-recoveries` | Recoveries | `Bonus` | no | — | — | `field: Recoveries, value: 10` | none — folds into derived Recoveries |
| 1 | `tactician-resource` | Focus | `HeroicResource` | no | — | — | `type: 'heroic'`, `canBeNegative: false`, `thresholds: []`, `value: 0`; 3 `gains` (below) | none at build; runtime counter |
| 1 | `tactician-1-1` | Skill | `SkillChoice` | **yes** | `1` | `build` | `options: []`, `listOptions: []` → factory defaults to **all 5 skill lists**; ships with `selected: ['Lead']` pre-filled | `string[]` of skill names |
| 1 | `tactician-1-2` | Skills | `SkillChoice` | **yes** | `2` | `build` | `options: [Alertness, Architecture, Blacksmithing, Brag, Culture, Empathize, Fletching, Mechanics, Monsters, Search, Strategy]` **plus** `listOptions: [Exploration]` | `string[]` of skill names |
| 1 | `tactician-1-4` | Field Arsenal | `Kit` | **yes** | `2` | — | `types` **omitted** → factory default `['']` = **unrestricted**, any kit in enabled sources | `Kit[]` (Forge Steel stores whole deep-copied kits) |
| 1 | `tactician-1-5` | Mark | `Multiple` | no | — | — | 2 nested `Ability` features | none — container |
| 1 | ↳ `tactician-1-5a` | Mark | `Ability` | no | — | — | granted ability, `cost: 0` (factory default), Maneuver, Ranged 10 | none |
| 1 | ↳ `tactician-1-5b` | Mark: Trigger | `Ability` | no | — | — | granted ability, `cost: 1`, free triggered action | none |
| 1 | `tactician-1-6` | “Strike Now!” | `Ability` | no | — | — | granted ability, `cost: 0`, Main action, Ranged 10 | none |
| 1 | `tactician-1-7` | 3pt Ability | `ClassAbility` | **yes** | `1` | — | `cost: 3`; `source.fromClassAbilities: true`, `fromSelectedSubclassAbilities: true`, all `from*Levels: false`; `minLevel: 1` | `selectedIDs: string[]` (ability ids) |
| 1 | `tactician-1-8` | 5pt Ability | `ClassAbility` | **yes** | `1` | — | `cost: 5`; same source mask; `minLevel: 1` | `selectedIDs: string[]` |
| 2 | `tactician-2-1` | Exploration / Interpersonal / Intrigue Perk | `Perk` | **yes** | `1` | — | `lists: [Exploration, Interpersonal, Intrigue]` | `Perk[]` |
| 3 | `tactician-3-1` | Out of Position | `Text` | no | — | — | `data: null`; `text: VERIFY-AGAINST-PIN` | none |
| 3 | `tactician-3-2` | 7pt Ability | `ClassAbility` | **yes** | `1` | — | `cost: 7`; default source mask; `minLevel: 1` | `selectedIDs: string[]` |
| 4 | `tactician-4-1a` | Might | `CharacteristicBonus` | no | — | — | `characteristic: Might, value: 1` | none |
| 4 | `tactician-4-1b` | Reason | `CharacteristicBonus` | no | — | — | `characteristic: Reason, value: 1` | none |
| 4 | `tactician-4-2` | Focus on Their Weakness | `HeroicResourceGain` | no | — | — | `tag: 'deal-damage 2'`, `value: '2'`, `frequency: OncePerRound`, `replacesTags: ['deal-damage']` | none |
| 4 | `tactician-4-3` | Improved Field Arsenal | `RollModifier` | no | — | — | `modifier: Edge`, `rollType: Ability`, `skills: []`, `skillLists: []`, `characteristics: []`, `condition:` **prose string** | none |
| 4 | `tactician-4-4` | Perk | `Perk` | **yes** | `1` | — | `lists: []` → factory default **all 6 perk lists** (Crafting, Exploration, Interpersonal, Intrigue, Lore, Supernatural) | `Perk[]` |
| 4 | `tactician-4-5` | Skill | `SkillChoice` | **yes** | `1` | `build` | no options/lists → factory default **all 5 skill lists** | `string[]` |
| 5 | `tactician-5-1` | 9pt Ability | `ClassAbility` | **yes** | `1` | — | `cost: 9`; default source mask; `minLevel: 1` | `selectedIDs: string[]` |
| 6 | `tactician-6-1` | Master of Arms | `Text` | no | — | — | `text: VERIFY-AGAINST-PIN` | none |
| 6 | `tactician-6-2` | Exploration / Interpersonal / Intrigue Perk | `Perk` | **yes** | `1` | — | `lists: [Exploration, Interpersonal, Intrigue]` | `Perk[]` |
| 7 | `tactician-7-1a` | Might | `CharacteristicBonus` | no | — | — | `value: 1` | none |
| 7 | `tactician-7-1b` | Agility | `CharacteristicBonus` | no | — | — | `value: 1` | none |
| 7 | `tactician-7-1c` | Reason | `CharacteristicBonus` | no | — | — | `value: 1` | none |
| 7 | `tactician-7-1d` | Intuition | `CharacteristicBonus` | no | — | — | `value: 1` | none |
| 7 | `tactician-7-1e` | Presence | `CharacteristicBonus` | no | — | — | `value: 1` | none |
| 7 | `tactician-7-2` | Heightened Focus | `HeroicResourceGain` | no | — | — | `tag: 'start 2'`, `value: '3'`, `frequency: OncePerRound`, `replacesTags: ['start']` | none |
| 7 | `tactician-7-3` | Seize the Initiative | `Text` | no | — | — | `text: VERIFY-AGAINST-PIN` | none |
| 7 | `tactician-7-4` | Skill | `SkillChoice` | **yes** | `1` | `build` | default **all 5 skill lists** | `string[]` |
| 8 | `tactician-8-1` | Perk | `Perk` | **yes** | `1` | — | default **all 6 perk lists** | `Perk[]` |
| 8 | `tactician-8-2` | 11pt Ability | `ClassAbility` | **yes** | `1` | — | `cost: 11`; default source mask; `minLevel: 1` | `selectedIDs: string[]` |
| 9 | `tactician-9-1` | Grandmaster of Arms | `Text` | no | — | — | `text: VERIFY-AGAINST-PIN` | none |
| 10 | `tactician-10-1a` | Might | `CharacteristicBonus` | no | — | — | `value: 1` | none |
| 10 | `tactician-10-1b` | Reason | `CharacteristicBonus` | no | — | — | `value: 1` | none |
| 10 | `tactician-10-2` | Command | `HeroicResource` | no | — | — | `type: 'epic'`, 1 gain (`tag: 'respite'`, `value: 'XP gained'`, `frequency: AtWill`), `canBeNegative: false` | none at build; second runtime counter |
| 10 | `tactician-10-3` | Perk | `Perk` | **yes** | `1` | — | explicit `name: 'Perk'`; `lists: [Exploration, Interpersonal, Intrigue]` | `Perk[]` |
| 10 | `tactician-10-4` | Skill | `SkillChoice` | **yes** | `1` | `build` | explicit `name: 'Skill'`; default **all 5 skill lists** | `string[]` |
| 10 | `tactician-10-5` | True Focus | `HeroicResourceGain` | no | — | — | `tag: 'start 3'`, `value: '4'`, `frequency: OncePerRound`, `replacesTags: ['start', 'start 2']` | none |
| 10 | `tactician-10-6` | Warmaster | `Text` | no | — | — | `text: VERIFY-AGAINST-PIN` | none |

**Class feature counts:** 40 top-level rows + 2 nested (`tactician-1-5a/b`) = 42.
Class-level choice-shaped features (`FeatureLogic.isChoice`): **16**.

### Focus (heroic resource) gain table

`tactician-resource` ships three `ResourceGain` entries; later
`HeroicResourceGain` features **replace** them by tag.

| Tag | Trigger | Value | Frequency | Replaced by |
|---|---|---|---|---|
| `start` | Start of your turn | `'2'` | `OncePerRound` | `start 2` (L7), then `start 3` (L10) |
| `deal-damage` | You or an ally damages a creature you have marked | `'1'` | `OncePerRound` | `deal-damage 2` (L4) |
| `ability` | An ally within 10 squares uses a heroic ability | `'1'` | `OncePerRound` | never replaced |

Replacement is by **string tag matching**, not by feature id. `True Focus`
(L10) lists `replacesTags: ['start', 'start 2']` — it must supersede both the
base gain and the L7 upgrade, because the L7 upgrade is still in the fold.

---

## Subclasses

`subclassName: 'Tactical Doctrine'`, `subclassCount: 1`. All three subclasses
carry `classID: ''` (empty — the parent link is by containment, not by id) and
`abilities: []` (**no subclass ability pool**; every `ClassAbility` choice
therefore draws only from the class's 20, despite
`source.fromSelectedSubclassAbilities` being `true`).

All three have **empty** `featuresByLevel` entries at levels 3, 4 and 10
(present but `features: []`).

### Insurgent — `tactician-sub-1`

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 1 | `tactician-sub-1-1-1` | Intrigue Skill | `SkillChoice` | **yes** | `1` | `build` | `listOptions: [Intrigue]`, `options: []` | `string[]` |
| 1 | `tactician-sub-1-1-2` | Covert Operations | `Text` | no | — | — | `text: VERIFY-AGAINST-PIN` | none |
| 1 | `tactician-sub-1-1-3` | Advanced Tactics | `Ability` | no | — | — | granted; triggered action (**not** free), `cost: 0`, Ranged 10; has a `Spend 1` section | none |
| 2 | `tactician-sub-1-2-1` | Infiltration Tactics | `Text` | no | — | — | `text: VERIFY-AGAINST-PIN` | none |
| 2 | `tactician-sub-1-2-2` | 2nd-Level Doctrine Ability | `Choice` | **yes** | `1` (factory default) | `build` (factory default) | 2 options, each `value: 1` — see below | `selected: Feature[]` (the chosen `Ability` feature) |
| 2 | ↳ `tactician-sub-1-2-2a` | Fog of War | `Ability` (option) | — | — | — | `cost: 5`, Maneuver, Ranged 10, target "Two creatures" | — |
| 2 | ↳ `tactician-sub-1-2-2b` | Try Me Instead | `Ability` (option) | — | — | — | `cost: 5`, Main action, Self distance, target "One creature" | — |
| 3 | — | — | — | — | — | — | **absent in source** (`features: []`) | — |
| 4 | — | — | — | — | — | — | **absent in source** (`features: []`) | — |
| 5 | `tactician-sub-1-5-1` | Distracted | `Text` | no | — | — | `text: VERIFY-AGAINST-PIN` | none |
| 5 | `tactician-sub-1-5-2` | Leave No Trace | `Text` | no | — | — | `text: VERIFY-AGAINST-PIN` | none |
| 6 | `tactician-sub-1-6-1` | 6th-Level Doctrine Ability | `Choice` | **yes** | `1` | `build` | 2 options, each `value: 1` | `selected: Feature[]` |
| 6 | ↳ `tactician-sub-1-6-1a` | Coordinated Execution | `Ability` (option) | — | — | — | `cost: 9`, **free** triggered action, Ranged 10 | — |
| 6 | ↳ `tactician-sub-1-6-1b` | Panic in Their Lines | `Ability` (option) | — | — | — | `cost: 9`, Main action, Melee 1 / Ranged 5 | — |
| 7 | `tactician-sub-1-7-1` | Asymmetric Warfare | `Text` | no | — | — | `text: VERIFY-AGAINST-PIN` | none |
| 8 | `tactician-sub-1-8-1` | Bait and Ambush | `PackageContent` | no | — | — | `tag: 'mark'` — injected into the Mark abilities' package section | none |
| 9 | `tactician-sub-1-9-1` | 9th-Level Doctrine Ability | `Choice` | **yes** | `1` | `build` | 2 options, each `value: 1` | `selected: Feature[]` |
| 9 | ↳ `tactician-sub-1-9-1a` | Squad! Hit and Run! | `Ability` (option) | — | — | — | `cost: 11`, Main action, Ranged 10 | — |
| 9 | ↳ `tactician-sub-1-9-1b` | Their Lack of Focus Is Their Undoing | `Ability` (option) | — | — | — | `cost: 11`, Main action, Ranged 10, keywords include **Magic** | — |
| 10 | — | — | — | — | — | — | **absent in source** (`features: []`) | — |

Insurgent: 11 top-level features, 6 nested `Choice` options, 4 choice points.

### Mastermind — `tactician-sub-2`

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 1 | `tactician-sub-2-1-1` | Lore Skill | `SkillChoice` | **yes** | `1` | `build` | `listOptions: [Lore]`, `options: []` | `string[]` |
| 1 | `tactician-sub-2-1-2` | Studied Commander | `Text` | no | — | — | `text: VERIFY-AGAINST-PIN` — description embeds **two markdown outcome tables** (encounter / negotiation) | none |
| 1 | `tactician-sub-2-1-3` | Overwatch | `Ability` | no | — | — | granted; triggered action (**not** free), `cost: 0`, Ranged 10; `Spend 1` section | none |
| 2 | `tactician-sub-2-2-1` | Goaded | `Ability` | no | — | — | granted; **free** triggered action, `cost: 0`, Self | none |
| 2 | `tactician-sub-2-2-2` | 2nd-Level Doctrine Ability | `Choice` | **yes** | `1` | `build` | 2 options, each `value: 1` | `selected: Feature[]` |
| 2 | ↳ `tactician-sub-2-2-2a` | I've Got Your Back | `Ability` (option) | — | — | — | `cost: 5`, Main action, Ranged 5 | — |
| 2 | ↳ `tactician-sub-2-2-2b` | Targets of Opportunity | `Ability` (option) | — | — | — | `cost: 5`, Maneuver, Ranged 5, target "Two creatures" | — |
| 3 | — | — | — | — | — | — | **absent in source** (`features: []`) | — |
| 4 | — | — | — | — | — | — | **absent in source** (`features: []`) | — |
| 5 | `tactician-sub-2-5-1` | Anticipation | `PackageContent` | no | — | — | `tag: 'mark'` | none |
| 5 | `tactician-sub-2-5-2` | I Predicted That | `Multiple` | no | — | — | 2 nested features | none — container |
| 5 | ↳ `tactician-sub-2-5-2a` | I Predicted That | `Text` | no | — | — | `text: VERIFY-AGAINST-PIN` (the ally-facing half) | none |
| 5 | ↳ `tactician-sub-2-5-2b` | I Predicted That | `RollModifier` | no | — | — | `modifier: Edge`, `characteristics: [Reason]`, `rollType: Test` (factory default), `condition: ''` | none |
| 6 | `tactician-sub-2-6-1` | 6th-Level Doctrine Ability | `Choice` | **yes** | `1` | `build` | 2 options, each `value: 1` | `selected: Feature[]` |
| 6 | ↳ `tactician-sub-2-6-1a` | Battle Plan | `Ability` (option) | — | — | — | `cost: 9`, Maneuver, Ranged 10, target "Three creatures" | — |
| 6 | ↳ `tactician-sub-2-6-1b` | Hustle! | `Ability` (option) | — | — | — | `cost: 9`, Maneuver, Burst 2 | — |
| 7 | `tactician-sub-2-7-1` | Grand Strategy | `Text` | no | — | — | `text: VERIFY-AGAINST-PIN` | none |
| 8 | `tactician-sub-1-8-1` | Pincer Movement | `PackageContent` | no | — | — | `tag: 'mark'` — **id collides with Insurgent L8**, see Anomalies §A2 | none |
| 9 | `tactician-sub-2-9-1` | 9th-Level Doctrine Ability | `Choice` | **yes** | `1` | `build` | 2 options, each `value: 1` | `selected: Feature[]` |
| 9 | ↳ `tactician-sub-2-9-1a` | Blot Out the Sun! | `Ability` (option) | — | — | — | `cost: 11`, Main action, Burst 3 | — |
| 9 | ↳ `tactician-sub-2-9-1b` | Counterstrategy | `Ability` (option) | — | — | — | `cost: 11`, Main action, Self | — |
| 10 | — | — | — | — | — | — | **absent in source** (`features: []`) | — |

Mastermind: 11 top-level features, 6 nested `Choice` options + 2 `Multiple`
children, 4 choice points.

### Vanguard — `tactician-sub-3`

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 1 | `tactician-sub-3-1-1` | Interpersonal Skill | `SkillChoice` | **yes** | `1` | `build` | `listOptions: [Interpersonal]`, `options: []` | `string[]` |
| 1 | `tactician-sub-3-1-2` | Commanding Presence | `Text` | no | — | — | `text: VERIFY-AGAINST-PIN` | none |
| 1 | `tactician-sub-3-1-3` | Parry | `Ability` | no | — | — | granted; triggered action (**not** free), `cost: 0`, Melee 2; `Spend 1` section | none |
| 2 | `tactician-sub-3-2-1` | Melee Superiority | `Text` | no | — | — | `text: VERIFY-AGAINST-PIN` | none |
| 2 | `tactician-sub-3-2-1a` | Mark Benefit | `PackageContent` | no | — | — | `tag: 'mark'` — **earliest** package content of the three doctrines | none |
| 2 | `tactician-sub-3-2-2` | 2nd-Level Doctrine Ability | `Choice` | **yes** | `1` | `build` | 2 options, each `value: 1` | `selected: Feature[]` |
| 2 | ↳ `tactician-sub-3-2-2a` | No Dying on My Watch | `Ability` (option) | — | — | — | `cost: 5`, triggered action (**not** free), Ranged 5 | — |
| 2 | ↳ `tactician-sub-3-2-2b` | Squad! On Me! | `Ability` (option) | — | — | — | `cost: 5`, Maneuver, Burst 1 | — |
| 3 | — | — | — | — | — | — | **absent in source** (`features: []`) | — |
| 4 | — | — | — | — | — | — | **absent in source** (`features: []`) | — |
| 5 | `tactician-sub-3-5-1` | Shake It Off | `Text` | no | — | — | `text: VERIFY-AGAINST-PIN` | none |
| 5 | `tactician-sub-3-5-2` | Tactical Offensive | `Text` | no | — | — | `text: VERIFY-AGAINST-PIN` | none |
| 6 | `tactician-sub-3-6-1` | 6th-Level Doctrine Ability | `Choice` | **yes** | `1` | `build` | 2 options, each `value: 1` | `selected: Feature[]` |
| 6 | ↳ `tactician-sub-3-6-1a` | Instant Retaliation | `Ability` (option) | — | — | — | `cost: 9`, **free** triggered action, Melee 1 | — |
| 6 | ↳ `tactician-sub-3-6-1b` | To Me Squad! | `Ability` (option) | — | — | — | `cost: 9`, Main action, Melee 1, keywords include **Charge** | — |
| 7 | `tactician-sub-3-7-1` | Shock and Awe | `Text` | no | — | — | `text: VERIFY-AGAINST-PIN` | none |
| 8 | `tactician-sub-1-8-1` | See Your Enemies Driven Before You | `PackageContent` | no | — | — | `tag: 'mark'` — **id collides with Insurgent + Mastermind L8**, see §A2 | none |
| 9 | `tactician-sub-3-9-1` | 9th-Level Doctrine Ability | `Choice` | **yes** | `1` | `build` | 2 options, each `value: 1` | `selected: Feature[]` |
| 9 | ↳ `tactician-sub-3-9-1a` | No Escape | `Ability` (option) | — | — | — | `cost: 11`, Main action, Melee 1, keywords include **Charge** | — |
| 9 | ↳ `tactician-sub-3-9-1b` | That One Is Mine! | `Ability` (option) | — | — | — | `cost: 11`, Main action, Melee 1 / Ranged 5 | — |
| 10 | — | — | — | — | — | — | **absent in source** (`features: []`) | — |

Vanguard: 12 top-level features, 6 nested `Choice` options, 4 choice points.

### `mark` package-content inventory

The class's `Mark` and `Mark: Trigger` abilities each end with an
`AbilitySectionPackage('mark')`. At render time that section is replaced by
**every `PackageContent` feature with `tag: 'mark'` the hero currently has**
(`sheet-formatter.ts` case `'package'` → filter `HeroLogic.getFeatures`).
There is **no** `FeatureType.Package` feature declaring the `mark` tag anywhere
in the Tactician data — only the ability section and the contents.

| Source | Level | Feature ID | Name |
|---|---|---|---|
| Vanguard | 2 | `tactician-sub-3-2-1a` | Mark Benefit |
| Mastermind | 5 | `tactician-sub-2-5-1` | Anticipation |
| Insurgent | 8 | `tactician-sub-1-8-1` | Bait and Ambush |
| Mastermind | 8 | `tactician-sub-1-8-1` | Pincer Movement |
| Vanguard | 8 | `tactician-sub-1-8-1` | See Your Enemies Driven Before You |

Distinct from these, three doctrine **abilities** carry an inline
`AbilitySectionField` literally named `Mark Benefit` (`value: 0`,
`repeatable: false`) — Fog of War, Targets of Opportunity, Battle Plan. Those
are ability sections, *not* `PackageContent`, and do not participate in the tag
aggregation.

---

## Abilities

### Class ability pool (`tactician.abilities`) — the `ClassAbility` draw pool

`createAbility` defaults applied where the data omits a field: `keywords: []`,
`distance: []`, `target: ''`, `cost: 0`, `repeatable: false`, `minLevel: 1`,
`type: NoAction`. Every entry below sets `minLevel: 1` by default and
`repeatable: false`.

| ID | Name | Cost | Action type | Keywords | Distance | Target | Sections |
|---|---|---|---|---|---|---|---|
| `tactician-ability-1` | Battle Cry | 3 | Maneuver | Ranged | Ranged 10 | Three allies | roll (Reason) |
| `tactician-ability-2` | Concussive Strike | 3 | Main action | Melee, Ranged, Strike, Weapon | Melee 1; Ranged 5 | One creature or object | roll (Might) |
| `tactician-ability-3` | Inspiring Strike | 3 | Main action | Melee, Ranged, Strike, Weapon | Melee 1; Ranged 5 | One creature or object | roll (Might) |
| `tactician-ability-4` | Squad! Forward! | 3 | Maneuver | Ranged | Ranged 10 | Self and two allies | text |
| `tactician-ability-5` | Hammer And Anvil | 5 | Main action | Melee, Ranged, Strike, Weapon | Melee 1; Ranged 5 | One creature or object | roll (Might), text |
| `tactician-ability-6` | Mind Game | 5 | Main action | Melee, Ranged, Strike, Weapon | Melee 1; Ranged 5 | One creature or object | text, roll (Might), text |
| `tactician-ability-7` | Now! | 5 | Maneuver | Ranged | Ranged 10 | Three allies | text |
| `tactician-ability-8` | This Is What We Planned For | 5 | Maneuver | Ranged | Ranged 10 | Two allies | text |
| `tactician-ability-9` | Frontal Assault | 7 | Maneuver | — | Self | Self | text |
| `tactician-ability-10` | Hit ’Em Hard! | 7 | Maneuver | — | Self | Self | text |
| `tactician-ability-11` | Rout | 7 | Maneuver | — | Self | Self | text |
| `tactician-ability-12` | Stay Strong and Focus! | 7 | Maneuver | — | Self | Self | text |
| `tactician-ability-13` | Squad! Gear Check! | 9 | Main action | Melee, Strike, Weapon | Melee 1 | One creature | roll (Might), text |
| `tactician-ability-14` | Squad! Remember Your Training! | 9 | Main action | Ranged | Ranged 10 | Self and two allies | text |
| `tactician-ability-15` | Win This Day! | 9 | Main action | Area | Burst 3 | Self and each ally in the area | text |
| `tactician-ability-16` | You’ve Still Got Something Left | 9 | Main action | Ranged | Ranged 10 | One ally | text |
| `tactician-ability-17` | Go Now and Speed Well | 11 | Main action | Ranged | Ranged 10 | Self or one ally | text |
| `tactician-ability-18` | Finish Them! | 11 | **Free triggered action** | Ranged | Ranged 10 | One creature | text |
| `tactician-ability-19` | Floodgates Open | 11 | Main action | Ranged | Ranged 10 | Three allies | text |
| `tactician-ability-20` | I’ll Open and You’ll Close | 11 | Main action | Melee, Ranged, Strike, Weapon | Melee 1; Ranged 5 | One creature | roll (Might), text |

**Pool shape: exactly 4 abilities at each of costs 3, 5, 7, 9, 11 = 20.**
Each `ClassAbility` choice picks 1 from the 4 at its cost tier.

**There is no `cost: 'signature'` ability anywhere in the Tactician.** The class
has no `ClassAbility` choice with `cost: 'signature'` either. Signature
abilities come from the two kits selected via `tactician-1-4` (Field Arsenal).

### Granted abilities (from features, not choices)

| ID | Name | Source | Cost | Action type | Keywords | Distance | Target |
|---|---|---|---|---|---|---|---|
| `tactician-1-5a` | Mark | class L1 (`Multiple`) | 0 | Maneuver | Ranged | Ranged 10 | One creature |
| `tactician-1-5b` | Mark: Trigger | class L1 (`Multiple`) | 1 | Free triggered action | — | Special | Special |
| `tactician-1-6` | “Strike Now!” | class L1 | 0 | Main action | Ranged | Ranged 10 | One ally |
| `tactician-sub-1-1-3` | Advanced Tactics | Insurgent L1 | 0 | Triggered action (not free) | Ranged | Ranged 10 | One ally |
| `tactician-sub-2-1-3` | Overwatch | Mastermind L1 | 0 | Triggered action (not free) | Ranged | Ranged 10 | One creature |
| `tactician-sub-2-2-1` | Goaded | Mastermind L2 | 0 | Free triggered action | — | Self | Self |
| `tactician-sub-3-1-3` | Parry | Vanguard L1 | 0 | Triggered action (not free) | Melee, Weapon | Melee 2 | Self or one ally |

### Doctrine-choice abilities (the option payloads)

| ID | Name | Doctrine / level | Cost | Action type | Keywords | Distance | Target |
|---|---|---|---|---|---|---|---|
| `tactician-sub-1-2-2a` | Fog of War | Insurgent 2 | 5 | Maneuver | Ranged | Ranged 10 | Two creatures |
| `tactician-sub-1-2-2b` | Try Me Instead | Insurgent 2 | 5 | Main action | Melee, Strike, Weapon | Self | One creature |
| `tactician-sub-1-6-1a` | Coordinated Execution | Insurgent 6 | 9 | Free triggered action | Ranged | Ranged 10 | One ally |
| `tactician-sub-1-6-1b` | Panic in Their Lines | Insurgent 6 | 9 | Main action | Melee, Ranged, Strike, Weapon | Melee 1; Ranged 5 | Two creatures |
| `tactician-sub-1-9-1a` | Squad! Hit and Run! | Insurgent 9 | 11 | Main action | Ranged | Ranged 10 | Self and two allies |
| `tactician-sub-1-9-1b` | Their Lack of Focus Is Their Undoing | Insurgent 9 | 11 | Main action | Magic, Ranged, Weapon | Ranged 10 | Three enemies |
| `tactician-sub-2-2-2a` | I've Got Your Back | Mastermind 2 | 5 | Main action | Ranged, Strike, Weapon | Ranged 5 | One creature |
| `tactician-sub-2-2-2b` | Targets of Opportunity | Mastermind 2 | 5 | Maneuver | Ranged | Ranged 5 | Two creatures |
| `tactician-sub-2-6-1a` | Battle Plan | Mastermind 6 | 9 | Maneuver | Ranged | Ranged 10 | Three creatures |
| `tactician-sub-2-6-1b` | Hustle! | Mastermind 6 | 9 | Maneuver | Area | Burst 2 | Self and each ally in the area |
| `tactician-sub-2-9-1a` | Blot Out the Sun! | Mastermind 9 | 11 | Main action | Area | Burst 3 | Self and each ally in the area |
| `tactician-sub-2-9-1b` | Counterstrategy | Mastermind 9 | 11 | Main action | — | Self | Self |
| `tactician-sub-3-2-2a` | No Dying on My Watch | Vanguard 2 | 5 | Triggered action (not free) | Ranged, Strike, Weapon | Ranged 5 | One enemy |
| `tactician-sub-3-2-2b` | Squad! On Me! | Vanguard 2 | 5 | Maneuver | Area | Burst 1 | Self and each ally in the area |
| `tactician-sub-3-6-1a` | Instant Retaliation | Vanguard 6 | 9 | Free triggered action | Melee, Weapon | Melee 1 | One ally |
| `tactician-sub-3-6-1b` | To Me Squad! | Vanguard 6 | 9 | Main action | Charge, Melee, Strike, Weapon | Melee 1 | One creature |
| `tactician-sub-3-9-1a` | No Escape | Vanguard 9 | 11 | Main action | Charge, Melee, Strike, Weapon | Melee 1 | One creature |
| `tactician-sub-3-9-1b` | That One Is Mine! | Vanguard 9 | 11 | Main action | Melee, Ranged, Strike, Weapon | Melee 1; Ranged 5 | One creature |

**Total abilities reachable by a Tactician hero:** 20 pool + 7 granted +
18 doctrine options (of which 3 are actually taken) = 45 distinct `Ability`
records in the definition.

### Ability section kinds used

| Section kind | Where |
|---|---|
| `text` | Everywhere. |
| `roll` (`PowerRoll`) | `characteristic: [Might]` mostly; `[Reason]` on Battle Cry and Try Me Instead. `bonus: 0` everywhere. `crit` never set (the factory silently drops the `crit` argument — it is not in the returned object). |
| `field` (via `createAbilitySectionField`) | `Mark Benefit` on Fog of War, Targets of Opportunity, Battle Plan. Resolves to `value: 0, repeatable: false`. |
| `field` (via `createAbilitySectionSpend`) | `Spend` on “Strike Now!” (`value: 5`), Advanced Tactics / Overwatch / Parry (no `value` → factory default **`value: 1`**). |
| `package` | `'mark'` on `tactician-1-5a` and `tactician-1-5b` only. |

---

## Choice-point inventory

In build order. "Cardinality" = picks × pool size.

| # | Step | Feature ID | Control | Cardinality | Notes |
|---|---|---|---|---|---|
| 1 | Class | — | (none) | 1 of 1 | `primaryCharacteristicsOptions` has length 1 → primaries auto-set to Might + Reason with **no prompt**. |
| 2 | Characteristics | — | array pick, then permutation pick | 1 of 3 arrays, then 1 of its distinct permutations | Non-primary values across Agility / Intuition / Presence. |
| 3 | Tactical Doctrine | — (`subclassCount`) | single-select | 1 of 3 | Insurgent / Mastermind / Vanguard. **Gates 4 further choice points.** |
| 4 | L1 skill | `tactician-1-1` | searchable single-select | 1 of *all skills* | Ships pre-selected `Lead`, but the control is fully open — see §A3. |
| 5 | L1 skills | `tactician-1-2` | searchable multi-select-2 | 2 of (11 named ∪ Exploration list) | |
| 6 | L1 Field Arsenal | `tactician-1-4` | searchable multi-select-2 | 2 of *all kits* | Two kits, both signature abilities. Unrestricted `types`. |
| 7 | L1 3pt ability | `tactician-1-7` | single-select | 1 of 4 | Pool filtered by `cost === 3`. |
| 8 | L1 5pt ability | `tactician-1-8` | single-select | 1 of 4 | Pool filtered by `cost === 5`. |
| 9 | L1 doctrine skill | `tactician-sub-{1,2,3}-1-1` | searchable single-select | 1 of (Intrigue \| Lore \| Interpersonal) list | Depends on #3. |
| 10 | L2 perk | `tactician-2-1` | searchable single-select | 1 of (Exploration ∪ Interpersonal ∪ Intrigue perks) | |
| 11 | L2 doctrine ability | `tactician-sub-{1,2,3}-2-2` | single-select | 1 of 2 | Depends on #3. |
| 12 | L3 7pt ability | `tactician-3-2` | single-select | 1 of 4 | |
| 13 | L4 perk | `tactician-4-4` | searchable single-select | 1 of *all 6 perk lists* | |
| 14 | L4 skill | `tactician-4-5` | searchable single-select | 1 of *all 5 skill lists* | |
| 15 | L5 9pt ability | `tactician-5-1` | single-select | 1 of 4 | |
| 16 | L6 perk | `tactician-6-2` | searchable single-select | 1 of (Exploration ∪ Interpersonal ∪ Intrigue perks) | |
| 17 | L6 doctrine ability | `tactician-sub-{1,2,3}-6-1` | single-select | 1 of 2 | Depends on #3. |
| 18 | L7 skill | `tactician-7-4` | searchable single-select | 1 of *all 5 skill lists* | |
| 19 | L8 perk | `tactician-8-1` | searchable single-select | 1 of *all 6 perk lists* | |
| 20 | L8 11pt ability | `tactician-8-2` | single-select | 1 of 4 | |
| 21 | L9 doctrine ability | `tactician-sub-{1,2,3}-9-1` | single-select | 1 of 2 | Depends on #3. |
| 22 | L10 perk | `tactician-10-3` | searchable single-select | 1 of (Exploration ∪ Interpersonal ∪ Intrigue perks) | |
| 23 | L10 skill | `tactician-10-4` | searchable single-select | 1 of *all 5 skill lists* | |

**23 choice points to level 10** (2 of which are the class-header
characteristics/doctrine controls, 16 class features, 4 doctrine features,
1 no-op primary-characteristics step).

At **level 1** the player answers 8 of these (#2–#9): characteristics array +
spread, doctrine, 3 skill controls, 2 kits, 2 abilities.

**No choice point on this class has `selectAt: 'respite'` or `'play'`.** Every
`SkillChoice` and `Choice` resolves to the factory default `'build'`. The
Tactician is therefore a **pure build-time class** for selection purposes — the
only runtime-writable state is the two heroic-resource counters (Focus, and
Command at L10) and the marked-creature set, none of which are builder
selections.

---

## UI surface

Ordered controls the builder renders for a Tactician, following the source's
`class-section.tsx` layout (a class-header panel, then one expander per level
containing only that level's choice-shaped features).

**Class header panel (level 0 / "Class Choices")**

1. **Level** — number spinner, 1..10, plus an "Advance to level N" button gated on XP.
2. **Primary characteristics** — *suppressed*. Only rendered when
   `primaryCharacteristicsOptions.length > 1`. Tactician shows a read-only
   "Might, Reason".
3. **Characteristic array** — 3 buttons (`2,-1,-1` / `1,0,0` / `1,1,-1`).
4. **Characteristic spread** — a list of concrete stat rows, one per distinct
   permutation of the chosen array across Agility / Intuition / Presence. Click
   to commit.
5. **Tactical Doctrine** — single-select drawer over 3 cards (name + description
   + full subclass panel on info). Removable.

**Level 1 expander**

6. `tactician-1-1` — **searchable single-select** over all skills; pre-populated with `Lead`.
7. `tactician-1-2` — **searchable multi-select-2** over 11 named skills + the Exploration list.
8. `tactician-1-4` "Field Arsenal" — **searchable multi-select-2** over all kits (kit cards, drawer).
9. `tactician-1-7` "3pt Ability" — **single-select** over the 4 cost-3 abilities (ability cards).
10. `tactician-1-8` "5pt Ability" — **single-select** over the 4 cost-5 abilities.
11. `tactician-sub-N-1-1` — **searchable single-select** over one skill list (Intrigue / Lore / Interpersonal), rendered under the same level-1 expander with `source = <doctrine name>`.

**Level 2 expander**

12. `tactician-2-1` — **searchable single-select** perk (3 lists).
13. `tactician-sub-N-2-2` — **nested sub-choice**: single-select over 2 full ability cards.

**Level 3 expander**

14. `tactician-3-2` — **single-select** over the 4 cost-7 abilities.

**Level 4 expander**

15. `tactician-4-4` — **searchable single-select** perk (all 6 lists).
16. `tactician-4-5` — **searchable single-select** skill (all 5 lists).

**Level 5 expander**

17. `tactician-5-1` — **single-select** over the 4 cost-9 abilities.

**Level 6 expander**

18. `tactician-6-2` — **searchable single-select** perk (3 lists).
19. `tactician-sub-N-6-1` — **nested sub-choice**: single-select over 2 ability cards.

**Level 7 expander**

20. `tactician-7-4` — **searchable single-select** skill (all 5 lists).

**Level 8 expander**

21. `tactician-8-1` — **searchable single-select** perk (all 6 lists).
22. `tactician-8-2` — **single-select** over the 4 cost-11 abilities.

**Level 9 expander**

23. `tactician-sub-N-9-1` — **nested sub-choice**: single-select over 2 ability cards.

**Level 10 expander**

24. `tactician-10-3` — **searchable single-select** perk (3 lists).
25. `tactician-10-4` — **searchable single-select** skill (all 5 lists).

**Non-control surfaces the class panel must still render** (no decision, but
they belong on the sheet): Stamina/Recoveries bonuses, the Focus resource with
its live gain table, the Mark + Mark: Trigger + “Strike Now!” abilities, the
`Text` features at L3/6/7/9/10, the `CharacteristicBonus` rows at L4/7/10, the
`RollModifier` at L4, and the epic resource **Command** at L10.

There is **no toggle, no free-text, and no point-buy control** anywhere in the
Tactician. Every control is single-select, multi-select-N, or a nested
sub-choice.

---

## Convex data model notes

> **Superseded keying note (2026-08-30):** the FS-id keys sketched in this
> section are illustrative only and are **superseded** by `00-foundation.md`
> §6b + ruling R-L: every persistent key joins on the pin's `scc` identity
> (with a discriminator where one pin record carries several choice points).
> FS ids are labels, never keys.


### Definition (seeded, shared, versioned by source)

```
classes/class-tactician
  identity fields (table in §Identity)
  featuresByLevel: [ { level, features[] } ]     // 40 top-level + 2 nested
  abilities: [ 20 Ability ]
  subclassIds: [ tactician-sub-1, tactician-sub-2, tactician-sub-3 ]

subclasses/tactician-sub-{1,2,3}
  featuresByLevel: [ { level, features[] } ]     // levels 3/4/10 empty
  abilities: []                                   // all three, deliberately
```

Everything above is static. **No definition record needs a `selected` field** —
that is Forge Steel's inline-mutation artefact.

### Selection (per hero, sparse)

The Tactician needs exactly these keys:

```ts
{
  classId: 'class-tactician',
  subclassId: 'tactician-sub-1' | 'tactician-sub-2' | 'tactician-sub-3',
  primaryCharacteristics: ['Might','Reason'],            // derived, not chosen
  characteristicArray: [{ characteristic, value } × 5],
  selections: {
    'tactician-1-1':          { skills: string[] },        // len 1
    'tactician-1-2':          { skills: string[] },        // len 2
    'tactician-1-4':          { kitIds: string[] },        // len 2
    'tactician-1-7':          { abilityIds: string[] },    // len 1
    'tactician-1-8':          { abilityIds: string[] },    // len 1
    'tactician-2-1':          { perkIds: string[] },
    'tactician-3-2':          { abilityIds: string[] },
    'tactician-4-4':          { perkIds: string[] },
    'tactician-4-5':          { skills: string[] },
    'tactician-5-1':          { abilityIds: string[] },
    'tactician-6-2':          { perkIds: string[] },
    'tactician-7-4':          { skills: string[] },
    'tactician-8-1':          { perkIds: string[] },
    'tactician-8-2':          { abilityIds: string[] },
    'tactician-10-3':         { perkIds: string[] },
    'tactician-10-4':         { skills: string[] },
    '<subclassId>-1-1':       { skills: string[] },
    '<subclassId>-2-2':       { optionFeatureIds: string[] },
    '<subclassId>-6-1':       { optionFeatureIds: string[] },
    '<subclassId>-9-1':       { optionFeatureIds: string[] },
  }
}
```

Note the **selection payload is a reference in every case** — skill name, kit
id, ability id, perk id, option-feature id. Nothing on this class requires
storing a copied object. Forge Steel stores whole `Kit` and `Perk` objects and
whole nested `Feature` objects; we should store ids only.

### Where the sparse map is hard on this class

1. **Doctrine-scoped keys collide across doctrines.** Insurgent, Mastermind and
   Vanguard all publish their L8 `PackageContent` under the **same id**
   `tactician-sub-1-8-1`. A hero can only have one doctrine, so the collision is
   not observable *for a single hero* — but any global "feature id → definition"
   index is non-injective, and any cross-hero analytics keyed on feature id
   silently merges three different features. **Our seeding must re-key these,
   and the re-keying must be recorded as a deliberate divergence from the
   source ids.** (Identity conservation — CONV-0006.)

2. **The subclass choice invalidates four downstream selections.** Changing
   doctrine must clear `<subclassId>-1-1`, `-2-2`, `-6-1`, `-9-1`. With a
   subclass-prefixed key convention this is a prefix sweep; with a flat map it
   requires a definition lookup per key.

3. **Nested option features need a path convention.** A `Choice`'s selection is
   itself a `Feature` (an `Ability` wrapper). The selected value is the *nested*
   feature id (`tactician-sub-1-2-2a`), which never appears as a top-level
   `featuresByLevel` entry. The resolver must be able to look up a nested id.
   Same for the two `Multiple` children (`tactician-1-5a/b`,
   `tactician-sub-2-5-2a/b`) — they are granted, not chosen, but they are
   feature ids that must resolve.

4. **The `mark` package is a cross-feature, tag-keyed aggregation.** Rendering
   the `Mark` ability requires folding **all** currently-held `PackageContent`
   features with `tag: 'mark'` into its body. That is a query over the derived
   feature list, not a property of the ability. The ability's rendered text is
   therefore **level- and doctrine-dependent** and must never be cached against
   the ability id alone.

5. **Heroic-resource gains are patched by string tag.** `start` → `start 2`
   (L7) → `start 3` (L10) and `deal-damage` → `deal-damage 2` (L4). The
   resolver must apply `replacesTags` as a fold *after* collecting all gains,
   and `True Focus` deliberately lists two superseded tags. A naive "last one
   wins" fold breaks if feature order changes.

6. **`ClassAbility.source` is a mask, not a list.** The legal pool for
   `tactician-1-7` is *computed*: `cost === 3` ∧ (from class abilities ∨ from
   selected subclass abilities). For the Tactician the subclass half is always
   empty, but the resolver must still implement the mask — it is shared with
   classes where it matters.

7. **Nothing here is respite- or play-time.** Good news: for this class the
   builder is the only writer of selection state. Do not generalise from that.

---

## Anomalies & open questions

**A1 — `primaryCharacteristics` is empty in the definition and back-filled by
the UI.** `tactician.ts` ships `primaryCharacteristicsOptions: [[Might,
Reason]]` and `primaryCharacteristics: []`. The class-selection handler
(`hero-edit-page.tsx`) special-cases `options.length === 1` and copies option 0
into `primaryCharacteristics`. The characteristics control would render an
empty array picker without that back-fill (`getCharacteristicArrays(0)`
returns `[]`). **For us: primaries should be derived from the definition, not
stored as an empty mutable field.**

**A2 — Three doctrines share one feature id.** Mastermind L8 (`Pincer
Movement`) and Vanguard L8 (`See Your Enemies Driven Before You`) are both
authored with `id: 'tactician-sub-1-8-1'` — Insurgent's id. This looks like
copy-paste. It is the single most dangerous fact in this file for a
feature-id-keyed selection map. Flagged for the seeding pass.

**A3 — A fixed skill grant is encoded as a fully-open choice.**
`tactician-1-1` is a `SkillChoice` with **no** `options` and **no**
`listOptions` (so the factory widens it to all five skill lists) that merely
ships `selected: ['Lead']`. The player can freely change it in the UI. If the
canon intent is "you get the Lead skill", this is a **structural divergence**
and we should model it as a flat skill grant, not a choice. Verify against the
pin. (The `high-elf-tactician` pregen confirms the runtime treats it as a
selection: it explicitly re-states `featureID: 'tactician-1-1', selections:
['Lead']`.)

**A4 — Typo in a feature id: `tatician-stamina`** (missing the first `c`). It
is a `Bonus`, so nothing keys off it today, but if we mirror source ids
verbatim we inherit the typo. Fix at seed, record the mapping.

**A5 — Feature id `tactician-1-3` does not exist.** Level 1 runs
`1-1, 1-2, 1-4, 1-5, 1-6, 1-7, 1-8`. A feature was presumably deleted. Do not
assume dense id sequences.

**A6 — The `mark` package has contents but no `Package` feature.** Forge Steel
has a `FeatureType.Package` variant intended to declare a tag; the Tactician
never uses it. The tag is declared only by the two abilities'
`AbilitySectionPackage('mark')` sections and consumed by five `PackageContent`
features. If our model wants a declared package registry, `mark` will have to
be synthesised.

**A7 — Every subclass has `abilities: []` and `classID: ''`.** The
`ClassAbility` source mask sets `fromSelectedSubclassAbilities: true`, which is
a no-op for this class. `classID: ''` means the subclass→class link exists only
by containment in `tactician.subclasses`. Our schema should make that link
explicit.

**A8 — Levels 3, 4 and 10 are empty for all three doctrines**, and are present
as `{ level: N, features: [] }` rather than omitted. The level-3/4/10 expanders
render "Nothing to choose for this level". Not a bug; just note that empty
levels are represented, not absent.

**A9 — `I Predicted That` (Mastermind L5) splits prose and mechanics
inconsistently.** The `Text` child describes an edge for *allies within 10
squares*; the sibling `RollModifier` (`characteristics: [Reason]`,
`rollType: Test`) applies the edge to **the tactician themselves**. Either the
mechanical half is modelling something the prose does not say, or the ally-side
effect is unmodelled. Both readings are possible from the source; **resolve
against the pin.**

**A10 — Power-roll characteristics disagree with their own tier text in three
places.** `Their Lack of Focus Is Their Undoing` (Insurgent 9) rolls
`Characteristic.Might` while its tiers read `R < [weak/average/strong]`;
`No Dying on My Watch` (Vanguard 2) rolls `Might` with `R <` tiers; the class
ability `Mind Game` rolls `Might` with `R <` tiers. In Draw Steel a potency
characteristic and the power-roll characteristic are different things, so this
may be correct — but it is exactly the shape of a transcription slip.
**Verify against the pin before implementing potency.**

**A11 — `createPowerRoll` silently drops `crit`.** The factory's parameter list
accepts `crit?: string` but the returned object omits it. No Tactician ability
passes `crit`, so nothing is lost here — but do not model `crit` as
round-trippable off this source.

**A12 — Three subclass level-1 abilities are triggered actions that are *not*
free** (`Advanced Tactics`, `Overwatch`, `Parry` — `free` defaults to `false`),
while `Goaded`, `Coordinated Execution`, `Instant Retaliation`,
`tactician-1-5b` and `Finish Them!` **are** free. The free/not-free split is a
real mechanical distinction (triggered-action economy) and is easy to lose in a
"triggered action" label. Keep `free` as a first-class field.

**A13 — `createAbilitySectionSpend` with no `value` defaults to `1`, not `0`.**
Advanced Tactics, Overwatch and Parry all rely on that default. Reading the data
file alone would suggest an unspecified spend.

**A14 — Perk and skill control *names* are factory-derived, not authored.**
`tactician-4-4` renders as "Perk" while `tactician-2-1` renders as
"Exploration / Interpersonal / Intrigue Perk", purely because of how
`createPerk` builds a prefix from `lists`. `tactician-10-3`/`10-4` pass
explicit `name` values that reproduce what the default would have produced
anyway. **Do not treat these display names as authored content**; derive them.

**A15 — Two heroic resources coexist from level 10.** `Focus` (`type:
'heroic'`) and `Command` (`type: 'epic'`, gained at respite, value `'XP
gained'` — a **string expression**, not a number, evaluated elsewhere). The
resource model must support (a) more than one resource per hero and (b) a
non-numeric gain expression.

**A16 — `RollModifier.condition` is prose.** `Improved Field Arsenal` (L4)
encodes its entire trigger condition as an English sentence in `condition`. It
is not machine-evaluable. Any engine that wants to auto-apply this edge needs a
structured predicate that does not exist in the source.

**A17 — Unresolved: what "kit signature abilities" do to the ability list.**
Field Arsenal grants **two** kits and explicitly both their signature abilities.
The Tactician has no signature ability of its own, so a Tactician's entire
signature-ability set comes from `tactician-1-4`. The kit-side structure is out
of scope for this file (see `kits-domains-items.md`), but the dependency is
load-bearing: **an empty kit selection leaves a Tactician with zero signature
abilities.**

**A18 — `Mark: Trigger` has `distance: [Special], target: 'Special'`.** It is
modelled as an ability with a literal "Special" distance string rather than a
structured distance. Anything that filters abilities by range must tolerate
`AbilityDistanceType.Special`.

**A19 — Terminology note carried from the foundation doc.** There is no
"background" in Draw Steel; `HeroOverview.background` in the source is a
display-only concatenation of ancestry/culture/career and has no bearing on
this class.
