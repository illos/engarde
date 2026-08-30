# Class — Shadow

> **Provenance — read before implementing.**
> Structure in this file is mapped from **Forge Steel**
> (github.com/andyaiken/forgesteel, GPL-3.0), commit `01672c1`, read 2026-08-29.
> Forge Steel is an independent third-party transcription of Draw Steel and is
> **not** our canon source. Every name, number, count and option list below is
> **UNVERIFIED** and must be confirmed against the pinned SteelCompendium
> corpus (DEC-0008) before it is implemented or shown to a user.
> This file is a **structural map for UI and data-model design**, not a rules source.

Source files (read-only):
`src/data/classes/shadow/shadow.ts`, `black-ash.ts`, `caustic-alchemy.ts`,
`harlequin-mask.ts`.

Conforms to the vocabulary and definition/selection split in
[`00-foundation.md`](00-foundation.md).

---

## Identity

| Field | Value | Notes |
|---|---|---|
| `id` | `class-shadow` | |
| `name` | `Shadow` | |
| `description` | `text: VERIFY-AGAINST-PIN` | Two-paragraph blurb in source. |
| `type` | `'standard'` | Not `'master'`. |
| `subclassName` | `Shadow College` | UI label for the subclass control. |
| `subclassCount` | `1` | Pick exactly one college. |
| `primaryCharacteristicsOptions` | `[[Agility]]` | **One** option → no player choice; auto-assigned on class select (`hero-edit-page.tsx:268`). |
| `primaryCharacteristics` | `[]` | Empty in the definition; written per-hero. |
| `featuresByLevel` | levels 1–10, **44 features** | Table below. |
| `abilities` | **24** | Flat pool the `ClassAbility` picks draw from. |
| `subclasses` | 3 — `shadow-sub-1`, `shadow-sub-2`, `shadow-sub-3` | |
| `level` | `1` | Definition default; per-hero in our model. |
| `characteristics` | `[]` | Definition default; per-hero in our model. |

Derived stat contributions declared at level 1:
`Stamina = 18 + 6/level` (`FeatureField.Stamina`), `Recoveries = 8`
(`FeatureField.Recoveries`).

Heroic resource: **Insight** (`shadow-resource`, `type: 'heroic'`).
Epic resource added at level 10: **Subterfuge** (`shadow-10-7`, `type: 'epic'`).

---

## Level progression

Builder-default resolution notes used throughout (from
`factory-feature-logic.ts`):

- `createSkillChoice` with no `count` → `count: 1`; with no `options` **and** no
  `listOptions` → `listOptions` defaults to `[Crafting, Exploration,
  Interpersonal, Intrigue, Lore]`; `selectAt` defaults to `'build'`.
- `createPerk` with no `lists` → `lists: [Crafting, Exploration, Interpersonal,
  Intrigue, Lore, Supernatural]` (note: **not** `Special`); `count: 1`.
- `createChoice` with no `count` → `count: 1`; `selectAt: 'build'`.
- `createClassAbilityChoice` → `count: 1`, `minLevel: 1`,
  `source = { fromClassAbilities: true, fromSelectedSubclassAbilities: true,
  fromUnselectedSubclassAbilities: false, fromClassLevels: false,
  fromSelectedSubclassLevels: false, fromUnselectedSubclassLevels: false }`,
  `classID: undefined`, `selectedIDs: []`.
- `createKitChoice` with no `types` → `types: ['']` (the empty string is the
  **Standard** kit type), `count: 1`.
- `createBonus` name defaults to the `FeatureField` string;
  `createCharacteristicBonus` name defaults to the characteristic name.
- `createAbility` with no `cost` → `cost: 0`; no `keywords` → `[]`; no
  `distance` → `[]`; `minLevel: 1`; `repeatable: false`.

### Class features, levels 1–10

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 1 | `shadow-stamina` | Stamina | `Bonus` | no | — | — | — | none — `field: Stamina, value: 18, valuePerLevel: 6` |
| 1 | `shadow-recoveries` | Recoveries | `Bonus` | no | — | — | — | none — `field: Recoveries, value: 8` |
| 1 | `shadow-resource` | Insight | `HeroicResource` | no | — | — | — | none — `type: 'heroic'`, 2 gains (below), `thresholds: []`, `canBeNegative: false`, `details: VERIFY-AGAINST-PIN` |
| 1 | `shadow-1-1` | Skills | `SkillChoice` | **yes** | 2 | build | `listOptions` = all 5 skill lists (defaulted) | `string[]` skill names — **pre-seeded** `['Hide','Sneak']` |
| 1 | `shadow-1-3` | Skills | `SkillChoice` | **yes** | 5 | build | `options: ['Criminal Underworld']` + `listOptions: [Exploration, Interpersonal, Intrigue]` | `string[]` skill names |
| 1 | `shadow-1-5` | Hesitation Is Weakness | `Ability` | no | — | — | — | none — granted ability, `cost: 1` insight |
| 1 | `shadow-1-5a` | Kit | `Kit` | **yes** | 1 | — | `types: ['']` → Standard kits from enabled sources | kit id |
| 1 | `shadow-1-6` | Signature Ability | `ClassAbility` | **yes** | 1 | — | `class.abilities` filtered `cost === 'signature'` and `minLevel <= 1` | `selectedIDs: string[]` (ability ids) |
| 1 | `shadow-1-7` | 3pt Ability | `ClassAbility` | **yes** | 1 | — | `class.abilities` filtered `cost === 3` | `selectedIDs: string[]` |
| 1 | `shadow-1-8` | 5pt Ability | `ClassAbility` | **yes** | 1 | — | `class.abilities` filtered `cost === 5` | `selectedIDs: string[]` |
| 2 | `shadow-2-1` | Exploration / Interpersonal / Intrigue Perk | `Perk` | **yes** | 1 | — | `lists: [Exploration, Interpersonal, Intrigue]` | perk id |
| 3 | `shadow-3-1` | Careful Observation | `Ability` | no | — | — | — | none — granted maneuver, `cost: 0` |
| 3 | `shadow-3-2` | 7pt Ability | `ClassAbility` | **yes** | 1 | — | `class.abilities` filtered `cost === 7` | `selectedIDs: string[]` |
| 4 | `shadow-4-1a` | Characteristic Increase: Agility | `CharacteristicBonus` | no | — | — | — | none — `Agility +1` |
| 4 | `shadow-4-1b` | Characteristic Increase: Additional | `Choice` | **yes** | 1 | build | 4 inline options, each `value: 1` (below) | option feature id |
| 4 | `shadow-4-1b-1` | Might | `CharacteristicBonus` | — | — | — | *(option of `shadow-4-1b`)* | `Might +1` |
| 4 | `shadow-4-1b-2` | Reason | `CharacteristicBonus` | — | — | — | *(option of `shadow-4-1b`)* | `Reason +1` |
| 4 | `shadow-4-1b-3` | Intuition | `CharacteristicBonus` | — | — | — | *(option of `shadow-4-1b`)* | `Intuition +1` |
| 4 | `shadow-4-1b-4` | Presence | `CharacteristicBonus` | — | — | — | *(option of `shadow-4-1b`)* | `Presence +1` |
| 4 | `shadow-4-2` | Keep It Down | `Text` | no | — | — | — | none — `text: VERIFY-AGAINST-PIN` |
| 4 | `shadow-4-3a` | Night Watch | `Text` | no | — | — | — | none — `text: VERIFY-AGAINST-PIN` |
| 4 | `shadow-4-3b` | Night Watch | `Ability` | no | — | — | — | none — granted triggered action, `cost: 0` |
| 4 | `shadow-4-4` | Perk | `Perk` | **yes** | 1 | — | `lists` = all 6 defaulted lists | perk id |
| 4 | `shadow-4-5` | Skill | `SkillChoice` | **yes** | 1 | build | `listOptions` = all 5 lists (explicit) | `string[]` |
| 4 | `shadow-4-6` | Surge of Insight | `HeroicResourceGain` | no | — | — | — | none — `tag: 'deal-damage 2'`, `value: '2'`, `Per Round`, `replacesTags: ['deal-damage']` |
| 5 | `shadow-5-1` | 9pt Ability | `ClassAbility` | **yes** | 1 | — | `class.abilities` filtered `cost === 9` | `selectedIDs: string[]` |
| 6 | `shadow-6-1` | Perk | `Perk` | **yes** | 1 | — | all 6 defaulted lists | perk id |
| 6 | `shadow-6-2` | Umbral Form | `Ability` | no | — | — | — | none — granted maneuver, `cost: 0`, `distance: []` |
| 7 | `shadow-7-1a` | Might | `CharacteristicBonus` | no | — | — | — | `Might +1` |
| 7 | `shadow-7-1b` | Agility | `CharacteristicBonus` | no | — | — | — | `Agility +1` |
| 7 | `shadow-7-1c` | Reason | `CharacteristicBonus` | no | — | — | — | `Reason +1` |
| 7 | `shadow-7-1d` | Intuition | `CharacteristicBonus` | no | — | — | — | `Intuition +1` |
| 7 | `shadow-7-1e` | Presence | `CharacteristicBonus` | no | — | — | — | `Presence +1` |
| 7 | `shadow-7-2` | Keen Insight | `HeroicResourceGain` | no | — | — | — | `tag: 'start 2'`, `value: '1d3 + 1'`, `Per Round`, `replacesTags: ['start']` |
| 7 | `shadow-7-3` | Skill | `SkillChoice` | **yes** | 1 | build | `listOptions` = all 5 lists (explicit) | `string[]` |
| 7 | `shadow-7-4` | Careful Observation Improvement | `Text` | no | — | — | — | none — `text: VERIFY-AGAINST-PIN` |
| 7 | `shadow-7-5` | Ventriloquist | `Text` | no | — | — | — | none — `text: VERIFY-AGAINST-PIN` |
| 8 | `shadow-8-1` | Perk | `Perk` | **yes** | 1 | — | all 6 defaulted lists | perk id |
| 8 | `shadow-8-2` | 11pt Ability | `ClassAbility` | **yes** | 1 | — | `class.abilities` filtered `cost === 11` | `selectedIDs: string[]` |
| 9 | `shadow-9-1` | Gloom Squad | `Text` | no | — | — | — | none — `text: VERIFY-AGAINST-PIN` |
| 10 | `shadow-10-1a` | Characteristic Increase: Agility | `CharacteristicBonus` | no | — | — | — | `Agility +1` |
| 10 | `shadow-10-1b` | Characteristic Increase: Additional | `Choice` | **yes** | 1 | build | 4 inline options, each `value: 1` (below) | option feature id |
| 10 | `shadow-10-1b-1` | Might | `CharacteristicBonus` | — | — | — | *(option of `shadow-10-1b`)* | `Might +1` |
| 10 | `shadow-10-1b-2` | Reason | `CharacteristicBonus` | — | — | — | *(option of `shadow-10-1b`)* | `Reason +1` |
| 10 | `shadow-10-1b-3` | Intuition | `CharacteristicBonus` | — | — | — | *(option of `shadow-10-1b`)* | `Intuition +1` |
| 10 | `shadow-10-1b-4` | Presence | `CharacteristicBonus` | — | — | — | *(option of `shadow-10-1b`)* | `Presence +1` |
| 10 | `shadow-10-2` | Death Pool | `HeroicResourceGain` | no | — | — | — | `tag: 'deal-damage 3'`, `value: '3'`, `Per Round`, `replacesTags: ['deal-damage','deal-damage 2']` |
| 10 | `shadow-10-3` | Perk | `Perk` | **yes** | 1 | — | all 6 defaulted lists | perk id |
| 10 | `shadow-10-4` | Skill | `SkillChoice` | **yes** | 1 | build | `listOptions` = all 5 lists (explicit) | `string[]` |
| 10 | `shadow-10-5` | Careful Observation Improvement | `Text` | no | — | — | — | none — `text: VERIFY-AGAINST-PIN` |
| 10 | `shadow-10-6` | Improved Umbral Form | `Text` | no | — | — | — | none — `text: VERIFY-AGAINST-PIN` |
| 10 | `shadow-10-7` | Subterfuge | `HeroicResource` | no | — | — | — | `type: 'epic'`, 1 gain `{ tag: 'respite', value: 'XP gained', At Will }`, `description: VERIFY-AGAINST-PIN` |

**Feature count: 44** top-level class features (the 8 nested
`CharacteristicBonus` options at L4/L10 are listed above for id completeness and
are not counted as top-level features).

### Insight resource gains (definition, level 1)

| tag | trigger | value | frequency |
|---|---|---|---|
| `start` | `text: VERIFY-AGAINST-PIN` (start-of-turn) | `1d3` | `Per Round` |
| `deal-damage` | `text: VERIFY-AGAINST-PIN` (damage with surges) | `1` | `Per Round` |

Superseding chain across levels — **these replace, they do not stack**:

```
start        -(L7 shadow-7-2)->  start 2         value 1d3 -> 1d3 + 1
deal-damage  -(L4 shadow-4-6)->  deal-damage 2   value 1   -> 2
             -(L10 shadow-10-2)-> deal-damage 3  value 2   -> 3   (replaces both prior tags)
```

---

## Subclasses

`subclassName: 'Shadow College'`, `subclassCount: 1`. All three carry
`classID: ''` (empty — the parent link exists only via `shadow.subclasses`) and
`abilities: []` (their abilities live inside `featuresByLevel`, not the flat
pool). All three declare **empty `features: []` arrays at levels 3, 4, 7, 10**.

`selected: boolean` is stored on the subclass definition object in the source —
that is selection state living inside definition data, and must not be carried
over.

### `shadow-sub-1` — College of Black Ash

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 1 | `shadow-sub-1-1-1` | Skill | `SkillChoice` | **yes** | 1 | build | `listOptions` = all 5 lists (defaulted) | `string[]` — **pre-seeded** `['Magic']` |
| 1 | `shadow-sub-1-1-2` | Black Ash Teleport | `Ability` | no | — | — | — | granted maneuver, `cost: 0` |
| 1 | `shadow-sub-1-1-3` | In All This Confusion | `Ability` | no | — | — | — | granted triggered action, `cost: 0` |
| 2 | `shadow-sub-1-2-1` | 2nd-Level College Ability | `Choice` | **yes** | 1 | build | 2 inline `Ability` options, each `value: 1` | option feature id → grants that ability |
| 2 | `shadow-sub-1-2-1a` | In a Puff of Ash | `Ability` | — | — | — | *(option)* | `cost: 5` |
| 2 | `shadow-sub-1-2-1b` | Too Slow | `Ability` | — | — | — | *(option)* | `cost: 5` |
| 2 | `shadow-sub-1-2-2` | Burning Ash | `Text` | no | — | — | — | `text: VERIFY-AGAINST-PIN` |
| 3 | — | — | — | — | — | — | — | **`features: []`** |
| 4 | — | — | — | — | — | — | — | **`features: []`** |
| 5 | `shadow-sub-1-5-1` | Trail of Cinders | `Text` | no | — | — | — | `text: VERIFY-AGAINST-PIN` |
| 6 | `shadow-sub-1-6-1` | 6th-Level College Ability | `Choice` | **yes** | 1 | build | 2 inline `Ability` options, each `value: 1` | option feature id |
| 6 | `shadow-sub-1-6-1a` | Black Ash Eruption | `Ability` | — | — | — | *(option)* | `cost: 9` |
| 6 | `shadow-sub-1-6-1b` | Cinderstorm | `Ability` | — | — | — | *(option)* | `cost: 9` |
| 7 | — | — | — | — | — | — | — | **`features: []`** |
| 8 | `shadow-sub-1-8-1` | Cinder Step | `Text` | no | — | — | — | `text: VERIFY-AGAINST-PIN` |
| 9 | `shadow-sub-1-9-1` | 9th-Level College Ability | `Choice` | **yes** | 1 | build | 2 inline `Ability` options, each `value: 1` | option feature id |
| 9 | `shadow-sub-1-9-1a` | Cacophony of Cinders | `Ability` | — | — | — | *(option)* | `cost: 11` |
| 9 | `shadow-sub-1-9-1b` | Demon Door | `Ability` | — | — | — | *(option)* | `cost: 11` |
| 10 | — | — | — | — | — | — | — | **`features: []`** |

**9 top-level features, 4 choice points, 6 nested ability options.**

### `shadow-sub-2` — College of Caustic Alchemy

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 1 | `shadow-sub-2-1-1` | Skill | `SkillChoice` | **yes** | 1 | build | `listOptions` = all 5 lists (defaulted) | `string[]` — **pre-seeded** `['Alchemy']` |
| 1 | `shadow-sub-2-1-2` | Coat The Blade | `Ability` | no | — | — | — | granted maneuver, `cost: 0` |
| 1 | `shadow-sub-2-1-3` | Smoke Bomb | `Text` | no | — | — | — | `text: VERIFY-AGAINST-PIN` |
| 1 | `shadow-sub-2-1-4` | Defensive Roll | `Ability` | no | — | — | — | granted triggered action, `cost: 0` |
| 2 | `shadow-sub-2-2-1` | 2nd-Level College Ability | `Choice` | **yes** | 1 | build | 2 inline `Ability` options, each `value: 1` | option feature id |
| 2 | `shadow-sub-2-2-1a` | Sticky Bomb | `Ability` | — | — | — | *(option)* | `cost: 5` |
| 2 | `shadow-sub-2-2-1b` | Stink Bomb | `Ability` | — | — | — | *(option)* | `cost: 5` |
| 2 | `shadow-sub-2-2-2` | Trained Assassin | `Text` | no | — | — | — | `text: VERIFY-AGAINST-PIN` |
| 3 | — | — | — | — | — | — | — | **`features: []`** |
| 4 | — | — | — | — | — | — | — | **`features: []`** |
| 5 | `shadow-sub-2-5-1` | Volatile Reagents | `Text` | no | — | — | — | `text: VERIFY-AGAINST-PIN` |
| 6 | `shadow-sub-2-6-1` | 6th-Level College Ability | `Choice` | **yes** | 1 | build | 2 inline `Ability` options, each `value: 1` | option feature id |
| 6 | `shadow-sub-2-6-1a` | One Vial Makes You Better | `Ability` | — | — | — | *(option)* | `cost: 9` |
| 6 | `shadow-sub-2-6-1b` | One Vial Makes You Faster | `Ability` | — | — | — | *(option)* | `cost: 9` |
| 7 | — | — | — | — | — | — | — | **`features: []`** |
| 8 | `shadow-sub-2-8-1` | Time Bomb | `Text` | no | — | — | — | `text: VERIFY-AGAINST-PIN` |
| 8 | `shadow-sub-2-8-2` | Time Bomb | `Ability` | no | — | — | — | granted **free** maneuver, `cost: 0` |
| 9 | `shadow-sub-2-9-1` | 9th-Level College Ability | `Choice` | **yes** | 1 | build | 2 inline `Ability` options, each `value: 1` | option feature id |
| 9 | `shadow-sub-2-9-1a` | Chain Reaction | `Ability` | — | — | — | *(option)* | `cost: 11` |
| 9 | `shadow-sub-2-9-1b` | To the Stars | `Ability` | — | — | — | *(option)* | `cost: 11` |
| 10 | — | — | — | — | — | — | — | **`features: []`** |

**11 top-level features, 4 choice points, 6 nested ability options.**

### `shadow-sub-3` — College of the Harlequin Mask

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 1 | `shadow-sub-3-1-1` | Skill | `SkillChoice` | **yes** | 1 | build | `listOptions` = all 5 lists (defaulted) | `string[]` — **pre-seeded** `['Lie']` |
| 1 | `shadow-sub-3-1-2` | I’m No Threat | `Ability` | no | — | — | — | granted maneuver, `cost: 0` |
| 1 | `shadow-sub-3-1-3` | Clever Trick | `Ability` | no | — | — | — | granted triggered action, `cost: 1` |
| 2 | `shadow-sub-3-2-1` | 2nd-Level College Ability | `Choice` | **yes** | 1 | build | 2 inline `Ability` options, each `value: 1` | option feature id |
| 2 | `shadow-sub-3-2-1a` | Machinations of Sound | `Ability` | — | — | — | *(option)* | `cost: 5` |
| 2 | `shadow-sub-3-2-1b` | So Gullible | `Ability` | — | — | — | *(option)* | `cost: 5` |
| 2 | `shadow-sub-3-2-2` | Friend! | `Text` | no | — | — | — | `text: VERIFY-AGAINST-PIN` |
| 3 | — | — | — | — | — | — | — | **`features: []`** |
| 4 | — | — | — | — | — | — | — | **`features: []`** |
| 5 | `shadow-sub-3-5-1` | Harlequin Gambit | `Text` | no | — | — | — | `text: VERIFY-AGAINST-PIN` |
| 6 | `shadow-sub-3-6-1` | 6th-Level College Ability | `Choice` | **yes** | 1 | build | 2 inline `Ability` options, each `value: 1` | option feature id |
| 6 | `shadow-sub-3-6-1a` | Look! | `Ability` | — | — | — | *(option)* | `cost: 9` |
| 6 | `shadow-sub-3-6-1b` | Puppet Strings | `Ability` | — | — | — | *(option)* | `cost: 9` |
| 7 | — | — | — | — | — | — | — | **`features: []`** |
| 8 | `shadow-sub-3-8-1` | Parkour | `Text` | no | — | — | — | `text: VERIFY-AGAINST-PIN` |
| 9 | `shadow-sub-3-9-1` | 9th-Level College Ability | `Choice` | **yes** | 1 | build | 2 inline `Ability` options, each `value: 1` | option feature id |
| 9 | `shadow-sub-3-9-1a` | I Am You | `Ability` | — | — | — | *(option)* | `cost: 11` |
| 9 | `shadow-sub-3-9-1b` | It Was Me All Along | `Ability` | — | — | — | *(option)* | `cost: 11` |
| 10 | — | — | — | — | — | — | — | **`features: []`** |

**9 top-level features, 4 choice points, 6 nested ability options.**

---

## Abilities

Action-type column reads `AbilityUsage` + the `free` flag. `distance` uses
`AbilityDistanceType` with its numeric fields. Sections column is a shape
summary (`text` / `roll` / `field(Spend)`), never prose. Every power roll in
Shadow uses `characteristic: [Agility]`, `bonus: 0`, and no `crit` field
(`createPowerRoll` drops `crit` — see Anomalies).

### Class ability pool (`shadow.abilities`, 24 entries)

All have `minLevel: 1` (default) and `repeatable: false` (default).

| ID | Name | Cost | Keywords | Action type | Distance | Target | Sections |
|---|---|---|---|---|---|---|---|
| `shadow-ability-1` | Gasping in Pain | signature | Melee, Strike, Weapon | Main Action | Melee 1 | One creature | roll, text |
| `shadow-ability-2` | I Work Better Alone | signature | Melee, Ranged, Strike, Weapon | Main Action | Melee 1; Ranged 5 | One creature | roll, text |
| `shadow-ability-3` | Teamwork Has Its Place | signature | Melee, Ranged, Strike, Weapon | Main Action | Melee 1; Ranged 5 | One creature or object | roll, text |
| `shadow-ability-4` | You Were Watching The Wrong One | signature | Melee, Strike, Weapon | Main Action | Melee 1 | One creature | roll, text |
| `shadow-ability-5` | Disorienting Strike | 3 | Melee, Strike, Weapon | Main Action | Melee 1 | One creature | roll, text |
| `shadow-ability-6` | Eviscerate | 3 | Melee, Ranged, Strike, Weapon | Main Action | Melee 1; Ranged 5 | One creature | roll |
| `shadow-ability-7` | Get In Get Out | 3 | Melee, Strike, Weapon | Main Action | Melee 1 | One creature | roll, text |
| `shadow-ability-8` | Two Throats At Once | 3 | Melee, Ranged, Strike, Weapon | Main Action | Melee 1; Ranged 5 | Two creatures or objects | roll |
| `shadow-ability-9` | Coup de Grâce | 5 | Melee, Ranged, Strike, Weapon | Main Action | Melee 1; Ranged 5 | One creature | roll |
| `shadow-ability-10` | One Hundred Throats | 5 | Melee, Weapon | Main Action | Self | Self | text, roll |
| `shadow-ability-11` | Setup | 5 | Ranged, Strike, Weapon | Main Action | Ranged 5 | One creature | roll |
| `shadow-ability-12` | Shadowstrike | 5 | Magic, Melee, Ranged | Main Action | Self | Self | text |
| `shadow-ability-13` | Dancer | 7 | *(none)* | Maneuver | Self | Self | text |
| `shadow-ability-14` | Misdirecting Strike | 7 | Melee, Ranged, Strike, Weapon | Main Action | Melee 1; Ranged 5 | One creature | roll, text |
| `shadow-ability-15` | Pinning Shot | 7 | Ranged, Strike, Weapon | Main Action | Ranged 5 | One creature | roll |
| `shadow-ability-16` | Staggering Blow | 7 | Melee, Ranged, Strike, Weapon | Main Action | Melee 1; Ranged 5 | One creature | roll |
| `shadow-ability-17` | Blackout | 9 | Area, Magic | Maneuver | Burst 3 | Self | text |
| `shadow-ability-18` | Into the Shadows | 9 | Magic, Melee, Strike, Weapon | Main Action | Melee 1 | One creature or object | text, roll |
| `shadow-ability-19` | Shadowfall | 9 | Area, Melee, Weapon | Main Action | Line 10×1 within 1 | Each enemy in the area | roll, text |
| `shadow-ability-20` | You Talk Too Much | 9 | Melee, Ranged, Strike, Weapon | Main Action | Melee 1; Ranged 5 | One creature | roll, text |
| `shadow-ability-21` | Assassinate | 11 | Melee, Strike, Weapon | Main Action | Melee 1 | One creature or object | roll, text |
| `shadow-ability-22` | Shadowgrasp | 11 | Area, Magic | Main Action | Burst 2 | Each enemy in the area | roll |
| `shadow-ability-23` | Speed of Shadows | 11 | Magic | Main Action | Self | Self | text |
| `shadow-ability-24` | They Always Line Up | 11 | Area, Ranged, Weapon | Main Action | Line 5×1 within 5 | Each enemy in the area | roll |

Pool cardinality by cost: **4 signature, 4×3pt, 4×5pt, 4×7pt, 4×9pt, 4×11pt.**
Picks available by level 10: 1 signature, 1×3, 1×5, 1×7, 1×9, 1×11 — i.e. the
player selects **6 of 24**.

### Abilities granted as features (not selectable from the pool)

| ID | Name | Cost | Keywords | Action type | Distance | Target | Sections | Granted at |
|---|---|---|---|---|---|---|---|---|
| `shadow-1-5` | Hesitation Is Weakness | 1 | *(none)* | Triggered Action, `free: true` | Self | Self | text | class L1 |
| `shadow-3-1` | Careful Observation | 0 | *(none)* | Maneuver | Special `'20 squares'` | One creature | text | class L3 |
| `shadow-4-3b` | Night Watch | 0 | Ranged, Weapon | Triggered Action, `free: false` | Ranged 5 | One ally | text | class L4 |
| `shadow-6-2` | Umbral Form | 0 | *(none)* | Maneuver | **`[]` (absent in source)** | Self | 8 × text | class L6 |

### Subclass abilities — College of Black Ash

| ID | Name | Cost | Keywords | Action type | Distance | Target | Sections | How obtained |
|---|---|---|---|---|---|---|---|---|
| `shadow-sub-1-1-2` | Black Ash Teleport | 0 | Magic | Maneuver | Self | Self | text, field(Spend 1, repeatable) | granted L1 |
| `shadow-sub-1-1-3` | In All This Confusion | 0 | Magic | Triggered Action, `free: false` | Self | Self | text, field(Spend 1, repeatable) | granted L1 |
| `shadow-sub-1-2-1a` | In a Puff of Ash | 5 | Magic, Melee, Ranged, Strike, Weapon | Main Action | Melee 1; Ranged 5 | One creature | roll | L2 choice option |
| `shadow-sub-1-2-1b` | Too Slow | 5 | Melee, Ranged, Strike, Weapon | Triggered Action, `free: true` | Self | Self | text | L2 choice option |
| `shadow-sub-1-6-1a` | Black Ash Eruption | 9 | Magic, Melee, Strike, Weapon | Main Action | Melee 1 | One creature | roll, text | L6 choice option |
| `shadow-sub-1-6-1b` | Cinderstorm | 9 | Magic | Maneuver | Burst 4 | Self and each ally in the area | text | L6 choice option |
| `shadow-sub-1-9-1a` | Cacophony of Cinders | 11 | Magic, Melee, Weapon | Main Action | Self | Self | text, roll | L9 choice option |
| `shadow-sub-1-9-1b` | Demon Door | 11 | Magic, Melee, Strike, Weapon | Main Action | Melee **3** | One creature | roll, text | L9 choice option |

### Subclass abilities — College of Caustic Alchemy

| ID | Name | Cost | Keywords | Action type | Distance | Target | Sections | How obtained |
|---|---|---|---|---|---|---|---|---|
| `shadow-sub-2-1-2` | Coat The Blade | 0 | *(none)* | Maneuver | Self | Self | text, field(Spend 1, repeatable) | granted L1 |
| `shadow-sub-2-1-4` | Defensive Roll | 0 | *(none)* | Triggered Action, `free: false` | Self | Self | text, field(Spend 1, not repeatable) | granted L1 |
| `shadow-sub-2-2-1a` | Sticky Bomb | 5 | Ranged | Main Action | Ranged 10 | One creature | text, roll | L2 choice option |
| `shadow-sub-2-2-1b` | Stink Bomb | 5 | Area, Ranged | Main Action | Cube 3 within 10 | Each creature in the area | roll, text | L2 choice option |
| `shadow-sub-2-6-1a` | One Vial Makes You Better | 9 | Ranged | Maneuver | Ranged 10 | Three creatures | text | L6 choice option |
| `shadow-sub-2-6-1b` | One Vial Makes You Faster | 9 | Ranged | Main Action | Ranged 10 | Three creatures | text, roll | L6 choice option |
| `shadow-sub-2-8-2` | Time Bomb | 0 | Area, Ranged | Maneuver, `free: true` | Cube 2 within 10 | Each enemy in the area | text, field(Spend **2**, repeatable) | granted L8 |
| `shadow-sub-2-9-1a` | Chain Reaction | 11 | Ranged | Main Action | Ranged 10 | One creature or object | text, roll | L9 choice option |
| `shadow-sub-2-9-1b` | To the Stars | 11 | Melee, Ranged, Strike | Main Action | Melee 1; Ranged 10 | One creature or object | roll, text | L9 choice option |

### Subclass abilities — College of the Harlequin Mask

| ID | Name | Cost | Keywords | Action type | Distance | Target | Sections | How obtained |
|---|---|---|---|---|---|---|---|---|
| `shadow-sub-3-1-2` | I’m No Threat | 0 | Magic | Maneuver | Self | Self | text, field(Spend 1, not repeatable) | granted L1 |
| `shadow-sub-3-1-3` | Clever Trick | 1 | Magic | Triggered Action, `free: false` | Self | Self | text | granted L1 |
| `shadow-sub-3-2-1a` | Machinations of Sound | 5 | Area, Magic, Ranged | Maneuver | Cube 3 within 10 | Each enemy in the area | roll, text | L2 choice option |
| `shadow-sub-3-2-1b` | So Gullible | 5 | Magic | Triggered Action, `free: true` | Self | Self | text | L2 choice option |
| `shadow-sub-3-6-1a` | Look! | 9 | Area, Magic | Maneuver | Burst 5 | Each enemy in the area | text | L6 choice option |
| `shadow-sub-3-6-1b` | Puppet Strings | 9 | Magic, Melee, Strike, Weapon | Main Action | Melee 1 | Two enemies | roll, text | L6 choice option |
| `shadow-sub-3-9-1a` | I Am You | 11 | Magic, Ranged | Maneuver | Ranged 10 | One creature | text | L9 choice option |
| `shadow-sub-3-9-1b` | It Was Me All Along | 11 | Melee, Strike, Weapon | Main Action | Melee 1 | One creature or object | roll, text | L9 choice option |

**Ability totals:** 24 class pool + 4 granted by class features + 8 Black Ash +
9 Caustic Alchemy + 8 Harlequin Mask = **53 distinct ability records**.

What one level-10 hero actually holds:

| Bucket | Count | Source |
|---|---|---|
| Pool picks | 6 | `shadow-1-6`, `-1-7`, `-1-8`, `-3-2`, `-5-1`, `-8-2` |
| Class grants | 4 | `shadow-1-5`, `-3-1`, `-4-3b`, `-6-2` |
| College L1 grants | 2 (Black Ash) / 2 (Caustic Alchemy) / 2 (Harlequin Mask) | see subclass tables |
| College L8 grant | 0 / **1** / 0 | `shadow-sub-2-8-2` — Caustic Alchemy only |
| College picks | 3 | L2 / L6 / L9 choices |
| **Total** | **15** (16 for Caustic Alchemy) | |

---

## Choice-point inventory

In build order. "Card." = cardinality.

### Class-level (not attached to a `featuresByLevel` entry)

| # | Decision | Card. | Source field | Notes |
|---|---|---|---|---|
| C1 | Class = Shadow | 1 of N | `hero.class` | The pillar selection itself. |
| C2 | Level | 1–10 | `HeroClass.level` | Spinner + "Advance to level N" when xp allows. |
| C3 | Primary characteristic | **1 of 1** | `primaryCharacteristicsOptions = [[Agility]]` | Auto-assigned; **no control is rendered** because `options.length === 1`. |
| C4 | Characteristic array | 1 of 4 | `getCharacteristicArrays(1)` → `[2,2,-1,-1]`, `[2,1,1,-1]`, `[2,1,0,0]`, `[1,1,1,0]` | Values for the four non-primary characteristics. |
| C5 | Characteristic assignment | 1 of the distinct permutations of C4 | `calculateCharacteristicArrays` | Presented as concrete fully-assigned spreads, not a drag allocator. |
| C6 | Shadow College | 1 of 3 | `subclassCount: 1` over `subclasses[]` | Gates every subclass choice point below. |

### Level 1

| # | Decision | Card. | Feature | Notes |
|---|---|---|---|---|
| 1 | Two skills | 2 | `shadow-1-1` | **Pre-seeded** `Hide`, `Sneak`; both removable, and the replacement pool is *any* skill from all 5 lists. |
| 2 | Five skills | 5 | `shadow-1-3` | From `Criminal Underworld` ∪ Exploration ∪ Interpersonal ∪ Intrigue. Largest single skill choice in the class. |
| 3 | Kit | 1 | `shadow-1-5a` | Standard kits (`types: ['']`). |
| 4 | Signature ability | 1 of 4 | `shadow-1-6` | |
| 5 | 3pt ability | 1 of 4 | `shadow-1-7` | |
| 6 | 5pt ability | 1 of 4 | `shadow-1-8` | |
| 7 | College skill | 1 | `shadow-sub-{1,2,3}-1-1` | **Pre-seeded** `Magic` / `Alchemy` / `Lie` per college; removable, replacement pool is any skill. |

### Level 2

| # | Decision | Card. | Feature |
|---|---|---|---|
| 8 | Perk (Exploration / Interpersonal / Intrigue) | 1 | `shadow-2-1` |
| 9 | 2nd-Level College Ability | 1 of 2 | `shadow-sub-{1,2,3}-2-1` |

### Level 3

| # | Decision | Card. | Feature |
|---|---|---|---|
| 10 | 7pt ability | 1 of 4 | `shadow-3-2` |

### Level 4

| # | Decision | Card. | Feature |
|---|---|---|---|
| 11 | Additional characteristic increase | 1 of 4 (Might / Reason / Intuition / Presence) | `shadow-4-1b` |
| 12 | Perk (any of 6 lists) | 1 | `shadow-4-4` |
| 13 | Skill (any of 5 lists) | 1 | `shadow-4-5` |

### Level 5

| # | Decision | Card. | Feature |
|---|---|---|---|
| 14 | 9pt ability | 1 of 4 | `shadow-5-1` |

### Level 6

| # | Decision | Card. | Feature |
|---|---|---|---|
| 15 | Perk (any of 6 lists) | 1 | `shadow-6-1` |
| 16 | 6th-Level College Ability | 1 of 2 | `shadow-sub-{1,2,3}-6-1` |

### Level 7

| # | Decision | Card. | Feature |
|---|---|---|---|
| 17 | Skill (any of 5 lists) | 1 | `shadow-7-3` |

### Level 8

| # | Decision | Card. | Feature |
|---|---|---|---|
| 18 | Perk (any of 6 lists) | 1 | `shadow-8-1` |
| 19 | 11pt ability | 1 of 4 | `shadow-8-2` |

### Level 9

| # | Decision | Card. | Feature |
|---|---|---|---|
| 20 | 9th-Level College Ability | 1 of 2 | `shadow-sub-{1,2,3}-9-1` |

### Level 10

| # | Decision | Card. | Feature |
|---|---|---|---|
| 21 | Additional characteristic increase | 1 of 4 | `shadow-10-1b` |
| 22 | Perk (any of 6 lists) | 1 | `shadow-10-3` |
| 23 | Skill (any of 5 lists) | 1 | `shadow-10-4` |

**Totals:** 6 class-level decisions (C1–C6, of which C3 renders no control) +
**23 feature-bound decisions** across levels 1–10 (19 from the class, 4 from
whichever college is selected). Level 9 has **no class-side** choice at all.

Skill picks accumulate to **10** by level 10 (2 seeded + 5 + 1 college seeded +
1 + 1 + 1). Perk picks accumulate to **5** (L2, L4, L6, L8, L10).

---

## UI surface

Ordered controls, matching Forge Steel's `class-section.tsx` panel order. The
"Class Choices" group renders first, then one collapsible group per level 1–10,
each auto-expanded while incomplete and check-marked when complete.

**Group 0 — Class Choices**

| Order | Control | Kind | Bound to |
|---|---|---|---|
| 0.1 | Class picker | searchable list of class cards | `hero.class` |
| 0.2 | Level | number spinner, min 1 max 10, + "Advance to level N" button | `HeroClass.level` |
| 0.3 | Primary characteristics | **suppressed for Shadow** (single option auto-applied) | `primaryCharacteristics` |
| 0.4 | Characteristic array | single-select, 4 buttons | intermediate state |
| 0.5 | Characteristic spread | single-select over permutation rows | `characteristics[]` |
| 0.6 | Shadow College | single-select via modal + info drawer + remove button | `subclasses[].selected` |

**Group L1**

| Order | Control | Kind | Bound to |
|---|---|---|---|
| 1.1 | Skills | multi-select-2, searchable skill modal; arrives pre-filled with 2 removable chips | `shadow-1-1` |
| 1.2 | Skills | multi-select-5, searchable skill modal | `shadow-1-3` |
| 1.3 | Kit | single-select, searchable kit modal | `shadow-1-5a` |
| 1.4 | Signature Ability | single-select, searchable ability modal | `shadow-1-6` |
| 1.5 | 3pt Ability | single-select, searchable ability modal | `shadow-1-7` |
| 1.6 | 5pt Ability | single-select, searchable ability modal | `shadow-1-8` |
| 1.7 | Skill (college) | multi-select-1; pre-filled with 1 removable chip | `shadow-sub-*-1-1` |

**Group L2** — Perk (single-select, searchable perk modal filtered to 3 lists,
`shadow-2-1`); 2nd-Level College Ability (single-select over 2 nested
sub-choices rendered as ability cards, `shadow-sub-*-2-1`).

**Group L3** — 7pt Ability (single-select, searchable ability modal,
`shadow-3-2`).

**Group L4** — Characteristic Increase: Additional (single-select, 4 nested
sub-choices, `shadow-4-1b`); Perk (single-select, all 6 lists, `shadow-4-4`);
Skill (multi-select-1, all 5 lists, `shadow-4-5`).

**Group L5** — 9pt Ability (single-select, `shadow-5-1`).

**Group L6** — Perk (single-select, `shadow-6-1`); 6th-Level College Ability
(single-select over 2 nested sub-choices, `shadow-sub-*-6-1`).

**Group L7** — Skill (multi-select-1, `shadow-7-3`).

**Group L8** — Perk (single-select, `shadow-8-1`); 11pt Ability (single-select,
`shadow-8-2`).

**Group L9** — 9th-Level College Ability (single-select over 2 nested
sub-choices, `shadow-sub-*-9-1`). *No class-side control.*

**Group L10** — Characteristic Increase: Additional (single-select, 4 nested
sub-choices, `shadow-10-1b`); Perk (single-select, `shadow-10-3`); Skill
(multi-select-1, `shadow-10-4`).

**Read-only surfaces the builder must still render** (features that are not
choices but change the sheet): the two `Bonus` rows, the Insight
`HeroicResource` panel with its live gain list, all `CharacteristicBonus` rows
(L4a, L7a–e, L10a), all `Text` features, all granted `Ability` cards, the three
`HeroicResourceGain` supersessions, and the L10 Subterfuge epic-resource panel.

**Control kinds used by this class:** single-select, multi-select-N, searchable
list (skills, perks, kits, abilities), nested sub-choice (`Choice` whose options
are themselves features), number spinner. **Not used by Shadow:** toggle, free
text, point-buy.

---

## Convex data model notes

> **Superseded keying note (2026-08-30):** the FS-id keys sketched in this
> section are illustrative only and are **superseded** by `00-foundation.md`
> §6b + ruling R-L: every persistent key joins on the pin's `scc` identity
> (with a discriminator where one pin record carries several choice points).
> FS ids are labels, never keys.


### Definition (seeded, shared, versioned by source)

```ts
// one row
classes: {
  sourceId, classId: 'class-shadow', name: 'Shadow', type: 'standard',
  subclassName: 'Shadow College', subclassCount: 1,
  primaryCharacteristicsOptions: [['Agility']],
  featuresByLevel: Feature[][],        // 44 features, levels 1..10
  abilityIds: string[]                 // 24 pool entries
}

// three rows
subclasses: { sourceId, subclassId, classId: 'class-shadow', name,
              featuresByLevel: Feature[][] }   // classID is '' in source — repair on ingest

// 53 rows
abilities: { sourceId, abilityId, name, cost, keywords, type, distance[],
             target, minLevel, repeatable, sections[] }
```

Everything above is static. **No `selected`, no `level`, no `characteristics`,
no `subclass.selected` on definition rows** — all four exist in the source's
definition objects and are selection state that must be stripped on ingest.

### Selection (per hero, sparse)

```ts
heroes: {
  classId: 'class-shadow',
  subclassId: 'shadow-sub-1' | 'shadow-sub-2' | 'shadow-sub-3' | null,
  level: 1..10,
  primaryCharacteristics: ['Agility'],           // derived, but store for stability
  characteristicArray: { characteristic, value }[],
  selections: {
    'shadow-1-1':    { kind: 'skills', value: ['Hide','Sneak'] },
    'shadow-1-3':    { kind: 'skills', value: [...5] },
    'shadow-1-5a':   { kind: 'kit',    value: kitId },
    'shadow-1-6':    { kind: 'abilityIds', value: [abilityId] },
    'shadow-1-7':    { kind: 'abilityIds', value: [abilityId] },
    'shadow-1-8':    { kind: 'abilityIds', value: [abilityId] },
    'shadow-2-1':    { kind: 'perk',   value: perkId },
    'shadow-3-2':    { kind: 'abilityIds', value: [abilityId] },
    'shadow-4-1b':   { kind: 'optionFeatureId', value: 'shadow-4-1b-3' },
    'shadow-4-4':    { kind: 'perk',   value: perkId },
    'shadow-4-5':    { kind: 'skills', value: [skill] },
    'shadow-5-1':    { kind: 'abilityIds', value: [abilityId] },
    'shadow-6-1':    { kind: 'perk',   value: perkId },
    'shadow-7-3':    { kind: 'skills', value: [skill] },
    'shadow-8-1':    { kind: 'perk',   value: perkId },
    'shadow-8-2':    { kind: 'abilityIds', value: [abilityId] },
    'shadow-10-1b':  { kind: 'optionFeatureId', value: 'shadow-10-1b-2' },
    'shadow-10-3':   { kind: 'perk',   value: perkId },
    'shadow-10-4':   { kind: 'skills', value: [skill] },
    'shadow-sub-1-1-1': { kind: 'skills', value: ['Magic'] },
    'shadow-sub-1-2-1': { kind: 'optionFeatureId', value: 'shadow-sub-1-2-1a' },
    'shadow-sub-1-6-1': { kind: 'optionFeatureId', value: 'shadow-sub-1-6-1b' },
    'shadow-sub-1-9-1': { kind: 'optionFeatureId', value: 'shadow-sub-1-9-1a' }
  }
}
```

**Max 23 keys** for a level-10 Shadow. Every value is an id or a list of ids /
skill-name strings. Shadow is a *good* fit for the sparse map — no nested
entities, no point-buy, no `selectAt` other than `'build'`.

### Where the split is hard for this class

1. **Pre-seeded `selected` arrays are definition data carrying selection
   state.** `shadow-1-1` ships `selected: ['Hide','Sneak']` and each college's
   L1 skill ships one seeded skill. In our model these belong in a
   `defaultSelection` field on the *definition* feature, materialised into the
   hero's selection map when the class/subclass is attached. If we drop them we
   silently remove two granted skills; if we treat them as grants we wrongly
   forbid the player from swapping them (the source lets them be removed and
   replaced with **any** skill from any list).

2. **`HeroicResourceGain.replacesTags` is cross-level mutation of an
   earlier feature.** `shadow-4-6` / `shadow-7-2` / `shadow-10-2` each supersede
   a gain defined on `shadow-resource` at level 1, and `shadow-10-2` supersedes
   *two* tags at once. The resolver must fold the whole feature list before
   computing gains and apply supersession by tag — a naive "concatenate all
   HeroicResourceGain features" fold produces double-counting. This is not
   selection state, but it does break the "features are purely additive"
   assumption a simple derivation spine would make.

3. **A second heroic resource appears at level 10.** `shadow-10-7` (Subterfuge,
   `type: 'epic'`) coexists with Insight. Resource state on the hero cannot be a
   single scalar; it must be keyed by resource id.

4. **`ClassAbility` option pools are computed, not enumerated.** The legal set
   is `getAbilitiesFromClass(...)` filtered by `cost === data.cost` and
   `minLevel <= data.minLevel`, then de-duplicated against
   *abilities the hero already has*. So the six ability picks are mutually
   exclusive with each other by cross-feature validation, not by any field on
   the feature. Our resolver needs the same exclusion rule, and the UI must
   invalidate a pick if an upstream pick later takes the same ability.

5. **Subclass swap orphans four selection keys.** `shadow-sub-1-*` keys are
   meaningless once the hero switches to `shadow-sub-2`. The resolver must
   ignore selections whose feature id is not reachable from the current
   `(classId, subclassId, level)`, and a garbage-collect pass should prune them
   on subclass change rather than leaving silent junk.

6. **Nested option features carry real ids and grant real abilities.**
   `shadow-sub-1-2-1a` is an `Ability` feature nested inside a `Choice`. Storing
   the *option feature id* (not the ability id) is the right key, because the
   granted ability is derived from the option feature. But it means a feature id
   can be a non-leaf path — exactly the id-path convention flagged in
   `00-foundation.md` §6.5.

7. **Level-down must be non-destructive.** Since Shadow's L4/L7/L10 features
   include automatic characteristic bonuses and superseding resource gains,
   dropping the hero's level should hide, not delete, the L5–L10 selection keys.

---

## Anomalies & open questions

1. **Feature id gaps and a suffix id at level 1.** The class defines
   `shadow-1-1`, `shadow-1-3`, `shadow-1-5`, `shadow-1-5a`, `shadow-1-6`,
   `shadow-1-7`, `shadow-1-8`. `shadow-1-2` and `shadow-1-4` are **absent in
   source**, and `shadow-1-5a` (the Kit choice) collides in naming with
   `shadow-1-5` (Hesitation Is Weakness). Ids are hand-authored strings with no
   invariant; treat the numbering as opaque, never as an ordering key.

2. **Three duplicate feature *names* within one class.** `Night Watch` appears
   twice at level 4 (`shadow-4-3a` `Text` + `shadow-4-3b` `Ability`),
   `Careful Observation Improvement` appears at both L7 (`shadow-7-4`) and L10
   (`shadow-10-5`), and Caustic Alchemy has two `Time Bomb` features at L8
   (`shadow-sub-2-8-1` `Text` + `shadow-sub-2-8-2` `Ability`). **No UI or data
   key may be derived from a feature name.**

3. **`shadow-1-1` is a choice masquerading as a grant.** `count: 2` with
   `selected: ['Hide','Sneak']` already filled means the control renders as
   complete (no "Choose a Skill" button) but each chip is removable — and the
   replacement pool, because neither `options` nor `listOptions` was passed, is
   *every skill in all five lists*. Whether Hide/Sneak are canonically fixed
   grants or genuinely re-selectable is the single highest-value canon question
   in this file.

4. **`primaryCharacteristicsOptions: [[Agility]]` renders no control.** With one
   option the picker is suppressed and `primaryCharacteristics` is auto-set on
   class selection. Structurally it is still a 1-of-1 choice point; if our
   builder renders it as a control it will differ from Forge Steel's layout.

5. **`Umbral Form` (`shadow-6-2`) has no `distance` at all.** `createAbility`
   defaults `distance` to `[]` while `target` is `'Self'`. Every other
   self-targeted Shadow ability passes `createSelf()`. Likely a source omission;
   our schema should decide whether an empty distance array is legal or whether
   ingest normalises it to `Self`.

6. **`Careful Observation` uses `AbilityDistanceType.Special` with the string
   `'20 squares'`.** The only untyped distance in the class — a number encoded
   as prose. It cannot be range-checked by an engine without parsing.

7. **The subclass ability pools are unreachable from the `ClassAbility`
   picks.** `createClassAbilityChoice` defaults `fromSubclass: true`, which sets
   `fromSelectedSubclassAbilities: true` — but all three colleges have
   `abilities: []`, and `fromSelectedSubclassLevels` is `false`. So the flag is
   a **no-op for Shadow**: no college ability (e.g. `In a Puff of Ash`, cost 5)
   can ever be picked by `shadow-1-8`. Whether that is intended or a data bug
   needs a ruling before we replicate the mask.

8. **`replacesTags` supersession has no explicit ordering.** `shadow-10-2`
   replaces `['deal-damage','deal-damage 2']` and `shadow-7-2` replaces
   `['start']`, but nothing in the data says a later-level gain wins if two
   features replace the same tag. It happens to be unambiguous for Shadow;
   the rule is implicit and must be specified in our resolver.

9. **Non-numeric `ResourceGain.value` strings.** Insight's start gain is
   `'1d3'`, becoming `'1d3 + 1'` at L7; Subterfuge's is the literal
   `'XP gained'`. `ResourceGain.value` is typed `string`. Any engine
   consumption needs an expression parser plus a special case for `'XP gained'`.

10. **The Insight cost-reduction rule lives in prose, not in a feature.** The
    heroic resource's `details` field encodes a discount conditioned on having
    an edge or double edge (`text: VERIFY-AGAINST-PIN`). Forge Steel has a
    `FeatureAbilityCost { keywords, modifier }` variant that could express a
    cost modifier, but it is not used here — so the rule is unreadable by any
    engine and would surface to the player as text only.

11. **`Gloom Squad` (`shadow-9-1`) is a `Text` feature describing a creature
    mechanic.** It creates `1d6` clones with derived statistics. Forge Steel has
    `Companion`, `Summon` and `SummonChoice` variants and uses none of them
    here. If our runtime needs clone tokens, this feature carries no structure
    to build them from.

12. **Level 9 has exactly one class feature and it is a `Text`.** The only level
    9 decision is the college ability, so a hero who has not selected a college
    gets an empty level-9 step.

13. **All three colleges declare empty `features: []` at levels 3, 4, 7 and
    10.** Placeholders, not omissions — the arrays exist. Our seeder should
    preserve level rows even when empty so level-completeness checks behave
    identically.

14. **All three colleges have `classID: ''`.** The parent link exists only
    through `shadow.subclasses`. If we normalise subclasses into their own
    table, that foreign key must be synthesised at ingest.

15. **`subclass.selected: boolean` is selection state stored on definition
    data**, mirroring the whole deep-copy problem described in
    `00-foundation.md` §6. Strip it.

16. **Level 7's characteristic increase is five separate features, not a
    choice.** `shadow-7-1a`–`e` each grant +1, with names defaulting to the bare
    characteristic name (`Might`, `Agility`, …) — whereas L4/L10 name theirs
    `Characteristic Increase: Agility`. Inconsistent naming for structurally
    similar rows; the L7 rows will read poorly in a features list.

17. **`shadow-4-1a` / `shadow-10-1a` descriptions state absolute targets**
    ("increases to 3", "increases to 5") while the data is a relative `+1`.
    If a hero's Agility diverges from the assumed baseline, description and
    effect disagree. Prefer rendering the computed value, not the string.

18. **`createPowerRoll` silently drops `crit`.** The factory accepts a `crit`
    parameter and never writes it to the returned `PowerRoll`. No Shadow ability
    passes one, so nothing is lost here — but our schema should not assume the
    source's power rolls can carry crit text.

19. **`shadow-4-3b` (Night Watch) is a triggered action that is *not* free**
    and costs 0 insight — so it consumes the hero's triggered action.
    `shadow-1-5` (Hesitation Is Weakness) is the inverse: free triggered action
    that costs 1 insight. Both cost dimensions are independent and both must be
    modelled.

20. **`FeatureChoiceData.respiteChange?: boolean` is marked `@deprecated` in the
    model and is unused by every Shadow feature.** Do not carry it into our
    schema.

21. **No `selectAt` other than `'build'` anywhere in Shadow.** No respite or
    play-time re-selection. Shadow therefore does *not* exercise the
    runtime-writes-selections problem from `00-foundation.md` §6.2 — useful as a
    first implementation target.

22. **Feature types Shadow never uses:** `Domain`, `DomainFeature`,
    `TitleChoice`, `LanguageChoice`, `Language`, `ItemChoice`, `Companion`,
    `Retainer`, `Follower`, `Summon`, `SummonChoice`, `SummonFormation`,
    `Toggle`, `SwitchOptions`, `SwitchValue`, `Package`, `PackageContent`,
    `Multiple`, `TaggedFeature`, `TaggedFeatureChoice`, `AddOn`, `Proficiency`,
    `Speed`, `Size`, `SaveThreshold`, `PotencyResistance`, `ConditionImmunity`,
    `DamageModifier`, `MovementMode`, `RollModifier`, `SurgeGain`,
    `HeroicResourceThreshold`, `AbilityCost`, `AbilityDamage`,
    `AbilityDistance`, `AbilityKeyword`, `SkillCancelChoice`.

    Shadow exercises **11 `FeatureType` variants in total**: `Ability`,
    `Bonus`, `CharacteristicBonus`, `Choice`, `ClassAbility`, `HeroicResource`,
    `HeroicResourceGain`, `Kit`, `Perk`, `SkillChoice`, `Text`. A builder that
    implements only these eleven renders the whole class.

23. **Terminology note carried from the brief.** `HeroOverview.background` in
    the source is a display concatenation of ancestry/culture/career; Draw Steel
    has no "background" mechanic. It is not referenced by any Shadow data and must not
    become a field in our model.

24. **Nothing in this file is canon.** Every skill name (`Hide`, `Sneak`,
    `Magic`, `Alchemy`, `Lie`, `Criminal Underworld`), every cost, every
    distance, every count, the 24-ability pool composition, the level placement
    of each feature, and the entire Insight gain schedule are Forge Steel's
    transcription and require a verification pass against the pinned
    SteelCompendium corpus before implementation.
