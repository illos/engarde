> **Provenance — read before implementing.**
> Structure in this file is mapped from **Forge Steel**
> (github.com/andyaiken/forgesteel, GPL-3.0), commit `01672c1`, read 2026-08-29.
> Forge Steel is an independent third-party transcription of Draw Steel and is
> **not** our canon source. Every name, number, count and option list below is
> **UNVERIFIED** and must be confirmed against the pinned SteelCompendium
> corpus (DEC-0008) before it is implemented or shown to a user.
> This file is a **structural map for UI and data-model design**, not a rules source.

# Beastheart — structural map

## Source files read

| Path | What it holds |
|---|---|
| `src/data/classes/beastheart/beastheart.ts` (2378 lines) | 14 companion definitions (lines 18–1391), the `HeroClass` (1393–2378) |
| `src/data/classes/beastheart/guardian.ts` | `SubClass` `beastheart-sub-1` |
| `src/data/classes/beastheart/prowler.ts` | `SubClass` `beastheart-sub-2` |
| `src/data/classes/beastheart/punisher.ts` | `SubClass` `beastheart-sub-3` |
| `src/data/classes/beastheart/spark.ts` | `SubClass` `beastheart-sub-4` |
| `src/data/sourcebooks/official/beastheart.ts` | the sourcebook that gates the class |
| `src/logic/summon-logic.ts` | the **only** runtime that materialises a Beastheart companion |
| `src/logic/monster-logic.ts` (`getFeatures`, `getStamina`) | companion-scoped feature injection |
| `src/logic/hero-logic.ts` (`getFeatures`, `getSummons`, `getHeroicResources`, `setLevel`) | controller-scoped resolution |
| `src/logic/feature-logic.ts` (`simplifyFeatures`, `isChoice`, `isChosen`) | choice-point vocabulary |
| `src/components/features/feature-data/summon-choice.tsx` + `src/components/panels/controlled-monster-customize/controlled-monster-customize-panel.tsx` | the companion selection + nested-choice UI |

**Correction to the task premise, stated up front:** the Beastheart companion is
**not** built on `FeatureType.Companion` (`FeatureCompanion`) and **not** on
`FeatureType.AddOn` (`FeatureAddOn`). It is built on **`FeatureType.SummonChoice`**
(`FeatureSummonChoice`), whose options are `Summon` objects wrapping a full
`Monster`. Details and evidence are in *Anomalies & open questions* §A1/§A2.
`FeatureForController` **is** used, and is central — see §A3.

---

## Identity

`HeroClass` top-level fields, as written in `beastheart.ts` lines 1393–1406 and 2370–2378.

| Field | Value |
|---|---|
| `id` | `class-beastheart` |
| `name` | `Beastheart` |
| `description` | prose — `text: VERIFY-AGAINST-PIN` |
| `type` | `'master'` (the other value is `'standard'`; only `beastheart` and `summoner` are `'master'`. Renders as a "Master Class" tag in `class-panel.tsx`; carries **no** mechanical effect anywhere in the source) |
| `subclassName` | `Wild Nature` |
| `subclassCount` | `1` |
| `primaryCharacteristicsOptions` | `[ [ Might, Intuition ] ]` — a single option pair, i.e. no player choice |
| `primaryCharacteristics` | `[]` (per-hero selection slot, empty in the definition) |
| `featuresByLevel` | 10 entries, levels 1–10; **every** level has ≥1 feature |
| `abilities` | 24 purchasable heroic abilities (`beastheart-ability-1` … `-24`) |
| `subclasses` | `[ guardian, prowler, punisher, spark ]` |
| `level` | `1` (per-hero slot in the definition object) |
| `characteristics` | `[]` (per-hero slot) |

**Sourcebook gate.** `src/data/sourcebooks/official/beastheart.ts` →
`beastheartSourcebook`, `id: 'beastheart'`, `name: 'The Beastheart'`,
`type: SourcebookType.Official`. It is a **separate sourcebook from `core`**.
Its non-empty collections are:

| Collection | Contents |
|---|---|
| `classes` | `[ beastheart ]` |
| `items` | 14 items — `precious-collar` (Trinket1st), `ruby-ring-of-recall` (Trinket1st), `speaking-scarab` (Trinket1st), `werewolf-tooth-pendant` (Trinket2nd), `bandana-of-invisibility` (Trinket3rd), `battle-wings` (Trinket4th), `cavalry-armor` (LeveledArmor), `pack-harness` (LeveledArmor), `thorn-dragonscale` (LeveledArmor), `rampant-shield` (LeveledArmor), `glancing-bow` (LeveledWeapon), `horned-champion` (LeveledWeapon), `longclaw` (LeveledWeapon), `scorpion-tails` (LeveledWeapon) |
| `perks` | 8 — `perk-born-tracker` (Exploration, Text), `perk-people-sense` (Interpersonal, Text), `perk-ride-along` (Exploration, **Ability** — maneuver), `perk-trained-thief` (Intrigue, Text), `perk-wild-rumpus` (Exploration, **Ability** — free maneuver), `perk-wilds-explorer` (Exploration, Text), `perk-voice-of-the-wild` (Interpersonal, Text), `perk-you-can-pet-them` (Interpersonal, Text) |
| everything else | `[]` — `adventures`, `ancestries`, `careers`, `complications`, `cultures`, `domains`, `encounters`, `imbuements`, `kits`, `monsterGroups`, `montages`, `negotiations`, `projects`, `subclasses`, `tacticalMaps`, `terrain`, `titles`, `skills`, `languages` |

The Beastheart's **subclasses live inside the class object**, not in the
sourcebook's `subclasses` array. A hero opts into the book via
`Hero.sourcebookIDs`; enabling `'beastheart'` makes the class, its 14 items and
its 8 perks available in one gate.

---

## Level progression

One row per feature per level. `Choice?` = does `FeatureLogic.isChoice()` return
true. `count`/`selectAt` are **resolved through the factory defaults**, not read
off the call site. `—` = the field does not exist on that `FeatureType`.

Generated names are marked *(gen)* where the data file omitted `name` and the
factory supplied one.

### Level 1

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 1 | `beastheart-stamina` | `Stamina` *(gen, from `field`)* | `Bonus` | no | — | — | — | none — static modifier: `field: Stamina`, `value: 21`, `valuePerLevel: 12`, `valueCharacteristicMultiplier: 1` |
| 1 | `beastheart-recoveries` | `Recoveries` *(gen)* | `Bonus` | no | — | — | — | none — `field: Recoveries`, `value: 12` |
| 1 | `beastheart-resource` | `Ferocity` | `HeroicResource` | no | — | — | — | runtime counter only. `type: 'heroic'`, `canBeNegative: false`, `thresholds: []`, `value: 0`; two `gains`: `{tag:'start', trigger:'Start of your turn', value:'1d3', frequency: OncePerRound}`, `{tag:'deal-damage-adjacent-companion', trigger:'A creature adjacent to your companion takes damage', value:'2', frequency: OncePerRound}` |
| 1 | `beastheart-1-1a` | `Skill` *(gen)* | `SkillChoice` | **yes** | 1 | `build` | `options: []`, `listOptions:` all 5 lists (factory default fires because both were empty) | `string[]`, **pre-populated** `['Handle Animals']` — satisfied but user-removable |
| 1 | `beastheart-1-1b` | `Exploration / Intrigue Skills` *(gen)* | `SkillChoice` | **yes** | 2 | `build` | `listOptions: [Exploration, Intrigue]` | `string[]` |
| 1 | `beastheart-1-2a` | `Companion` | `SummonChoice` | **yes** | 1 | — (no `selectAt` on this type) | `options`: 14 `Summon` objects (see *Companion catalogue*) | `Summon[]` — a **deep copy** of the chosen `Summon`, including its whole `Monster`; `info.level` is stamped from the hero's class level on select |
| 1 | `beastheart-1-2b` | `Companions in Combat` | `Text` | no | — | — | — | none. Long rules block covering companion Stamina/Recoveries, death, action economy, ranged free strikes, shared maneuvers/abilities/senses/skills/space/perks/titles/complications, surges, changing companion at respite, and "One Hero" encounter budgeting. `text: VERIFY-AGAINST-PIN` |
| 1 | `beastheart-1-3a` | `Heart of the Beast` | `Ability` | no | — | — | — | none — granted, not chosen. See *Abilities* |
| 1 | `beastheart-1-3b` | `Feral Strike` | `Ability` | no | — | — | — | none — granted. Contains a `package` section with tag `feral-strike` |
| 1 | `beastheart-1-4` | `Rampage` | `HeroicResource` | no | — | — | — | runtime counter. `type: 'heroic'` (**not** `'epic'`), `gains: []`, `details` prose (`VERIFY-AGAINST-PIN`) |
| 1 | `beastheart-1-4a` | `Rampage Thresholds` | `Multiple` | no | — | — | — | container — expands to the two rows below via `simplifyFeatures` |
| 1 | `beastheart-1-4a-8` | `Rampage 8` *(gen, `${resource} ${value}`)* | `HeroicResourceThreshold` | no | — | — | — | `resource: 'Rampage'`, `value: 8`, `level: 1`; `feature` = Text `beastheart-1-4a-8a` |
| 1 | `beastheart-1-4a-12` | `Rampage 12` *(gen)* | `HeroicResourceThreshold` | no | — | — | — | `resource: 'Rampage'`, `value: 12`, `level: 1`; `feature` = Text `beastheart-1-4a-12a` |
| 1 | `beastheart-1-5` | `Kit` *(gen)* | `Kit` | **yes** | 1 | — | `types: ['']` (factory default → all kit types) | `Kit[]`. Description carries two companion-specific exceptions (`VERIFY-AGAINST-PIN`) |
| 1 | `beastheart-1-6` | `Beasthearts and Magic Treasure` | `Text` | no | — | — | — | none. Consumables / trinkets / leveled-items rules for the companion |
| 1 | `beastheart-1-7` | `Signature Ability` *(gen)* | `ClassAbility` | **yes** | 1 | — | `cost: 'signature'`; `source.fromClassAbilities: true`, `source.fromSelectedSubclassAbilities: true`, all four `…Levels` flags false; `minLevel: 1`; `classID: undefined` | `selectedIDs: string[]` |
| 1 | `beastheart-1-8` | `3pt Ability` *(gen)* | `ClassAbility` | **yes** | 1 | — | `cost: 3`, same source flags | `selectedIDs: string[]` |
| 1 | `beastheart-1-9` | `5pt Ability` *(gen)* | `ClassAbility` | **yes** | 1 | — | `cost: 5`, same source flags | `selectedIDs: string[]` |

### Level 2

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 2 | `beastheart-2-1` | `Perk` | `Perk` | **yes** | 1 | — | `lists: [Exploration, Interpersonal, Intrigue]` | `Perk[]` |
| 2 | `beastheart-2-2` | `Everyone’s Best Friend` | `Text` | no | — | — | — | none |

### Level 3

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 3 | `beastheart-3-1` | `7pt Ability` *(gen)* | `ClassAbility` | **yes** | 1 | — | `cost: 7`, default source flags | `selectedIDs: string[]` |

### Level 4

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 4 | `beastheart-4-1a` | `Might` *(gen)* | `CharacteristicBonus` | no | — | — | — | `characteristic: Might`, `value: 1` |
| 4 | `beastheart-4-1b` | `Intuition` *(gen)* | `CharacteristicBonus` | no | — | — | — | `characteristic: Intuition`, `value: 1` |
| 4 | `beastheart-4-2` | `Perk` *(gen)* | `Perk` | **yes** | 1 | — | `lists`: factory default = all 6 (`Crafting, Exploration, Interpersonal, Intrigue, Lore, Supernatural`) | `Perk[]` |
| 4 | `beastheart-4-3` | `Skill` *(gen)* | `SkillChoice` | **yes** | 1 | `build` | all 5 skill lists (factory default) | `string[]` |
| 4 | `beastheart-4-4b` | `Unchained Ferocity` | `HeroicResourceGain` | no | — | — | — | `tag: 'deal-damage-companion 2'`, `trigger: 'The first time in a round that a creature adjacent to your companion takes damage'`, `value: '3'`, `frequency: OncePerRound`, `replacesTags: ['deal-damage-adjacent-companion']`, `used: false` |
| 4 | `beastheart-4-5` | `Rampage 16` *(gen)* | `HeroicResourceThreshold` | no | — | — | — | `resource: 'Rampage'`, `value: 16`, `level: 1` (**not** 4 — see §A9); `feature` = Text `beastheart-4-5a` |

### Level 5

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 5 | `beastheart-5-1` | `9pt Ability` *(gen)* | `ClassAbility` | **yes** | 1 | — | `cost: 9` | `selectedIDs: string[]` |

### Level 6

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 6 | `beastheart-6-1` | `Perk` | `Perk` | **yes** | 1 | — | `lists: [Exploration, Interpersonal, Intrigue]` | `Perk[]` |

### Level 7

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 7 | `beastheart-7-1a` | `Might` *(gen)* | `CharacteristicBonus` | no | — | — | — | `value: 1` |
| 7 | `beastheart-7-1b` | `Agility` *(gen)* | `CharacteristicBonus` | no | — | — | — | `value: 1` |
| 7 | `beastheart-7-1c` | `Reason` *(gen)* | `CharacteristicBonus` | no | — | — | — | `value: 1` |
| 7 | `beastheart-7-1d` | `Intuition` *(gen)* | `CharacteristicBonus` | no | — | — | — | `value: 1` |
| 7 | `beastheart-7-1e` | `Presence` *(gen)* | `CharacteristicBonus` | no | — | — | — | `value: 1` |
| 7 | `beastheart-7-2` | `Greater Ferocity` | `HeroicResourceGain` | no | — | — | — | `tag: 'start 2'`, `trigger: 'Start of your turn'`, `value: '1d3 +1'`, `frequency: OncePerRound`, `replacesTags: ['start']` |
| 7 | `beastheart-7-3` | `Skill` *(gen)* | `SkillChoice` | **yes** | 1 | `build` | all 5 lists | `string[]` |
| 7 | `beastheart-7-4` | `Rampage 20` *(gen)* | `HeroicResourceThreshold` | no | — | — | — | `resource: 'Rampage'`, `value: 20`, `level: 1`; `feature` = Text `beastheart-7-4a` |

### Level 8

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 8 | `beastheart-8-1` | `Perk` *(gen)* | `Perk` | **yes** | 1 | — | all 6 lists (default) | `Perk[]` |
| 8 | `beastheart-8-2` | `11pt Ability` *(gen)* | `ClassAbility` | **yes** | 1 | — | `cost: 11` | `selectedIDs: string[]` |

### Level 9

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 9 | `beastheart-9-1a` | `Avatar of the Green` | `Text` | no | — | — | — | none. Prose asserts a companion Reason increase and language/telepathy grants that are **not** modelled as features — see §A10 |
| 9 | `beastheart-9-1b` | `Skill` *(gen)* | `SkillChoice` | **yes** | 1 | `build` | all 5 lists | `string[]`, pre-populated `['Nature']` |
| 9 | `beastheart-9-1c` | `Lore Skill` *(gen)* | `SkillChoice` | **yes** | 1 | `build` | `listOptions: [Lore]` | `string[]` |

### Level 10

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 10 | `beastheart-10-1a` | `Might` *(gen)* | `CharacteristicBonus` | no | — | — | — | `value: 1` |
| 10 | `beastheart-10-1b` | `Intuition` *(gen)* | `CharacteristicBonus` | no | — | — | — | `value: 1` |
| 10 | `beastheart-10-2` | `Final Evolution` | `HeroicResourceGain` | no | — | — | — | `tag: 'start 3'`, `trigger: 'Start of your turn'`, `value: '2d3 +1'`, `frequency: OncePerRound`, `replacesTags: ['start', 'start 2']` |
| 10 | `beastheart-10-3` | `Perk` | `Perk` | **yes** | 1 | — | `lists: [Exploration, Interpersonal, Intrigue]` | `Perk[]` |
| 10 | `beastheart-10-4` | `Ferox` | `HeroicResource` | no | — | — | — | `type: 'epic'`; one gain `{tag:'respite', trigger:'Finish a respite', value:'XP gained', frequency: AtWill}`; `thresholds: []` |
| 10 | `beastheart-10-5` | `Skill` | `SkillChoice` | **yes** | 1 | `build` | all 5 lists (default) | `string[]` |
| 10 | `beastheart-10-6` | `Rampage 24` *(gen)* | `HeroicResourceThreshold` | no | — | — | — | `resource: 'Rampage'`, `value: 24`, `level: 1`; `feature` = Text `beastheart-10-6a` |

**Level totals (class only, top-level rows):** L1 = 18, L2 = 2, L3 = 1, L4 = 6,
L5 = 1, L6 = 1, L7 = 8, L8 = 2, L9 = 3, L10 = 7. **49 class-level features.**
(The L1 count includes the two threshold rows that `Multiple` `beastheart-1-4a`
expands into; as literal array entries L1 has 16.)

**Not present anywhere in the class:** `TitleChoice`, `LanguageChoice`, `Domain`,
`DomainFeature`, `ItemChoice`, `Proficiency`, `Size`, `Speed`, `MovementMode`,
`ConditionImmunity`, `DamageModifier`, `SaveThreshold`, `PotencyResistance`,
`SurgeGain`, `Toggle`, `SwitchOptions`/`SwitchValue`, `Follower`, `Retainer`,
`Fixture`, `TaggedFeature`/`TaggedFeatureChoice`. There is also **no feature
representing the subclass choice** — see §A8.

### Companion catalogue — option source for `beastheart-1-2a`

All 14 options are `Summon` objects built with `FactoryLogic.createSummon`.
Uniform `SummoningInfo`: `isSignature: false`, `cost: 0`, `count: 1`,
`level: 1` at definition time (overwritten per hero — see §A5).
`Summon.id === Summon.monster.id` and `Summon.name === Summon.monster.name`
(the factory copies them), so **the summon id and the monster id are the same
string**.

Uniform `Monster` fields on every companion: `level: 0`,
`role: { organization: Companion, type: NoRole }`, `encounterValue: 0`,
`stamina: 0`, `freeStrikeDamage: 1`, `freeStrikeType: Damage` (default),
`retainer: null`, `picture: null`, `withCaptain: ''`.

Every companion carries these two `Bonus` features (ids `-1` and `-2`):
* `field: Stamina`, `valueFromController: Stamina` — companion Stamina is **derived from the hero's**, resolved by `ModifierLogic.calculateModifierValue` against the controller.
* `field: FreeStrikeDamage`, `valueCharacteristics: [Might]` — resolved against the controller too (`SummonLogic` passes the hero as the modifier context).

| # | const | Monster id | Name | Keywords | Size | Speed | Stability | Chars (M/A/R/I/P) | Feature ids and types beyond the two `Bonus` rows | Level-3 / 6 / 10 feature names |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `basilisk` | `beastheart-companion-1` | Basilisk | `Beast`, `Companion` | 1L | 5 | 2 | 2/1/−1/2/2 | `-3` `DamageModifier` (Poison, Immunity 3); `-4` `Ability` **Petrify**; `-5` `Text` "Stoned" | Foes Forever Frozen / Rock Smasher / Heart of Stone |
| 2 | `bear` | `beastheart-companion-2` | Bear | `Animal`, `Companion` | 1L | 5, `climb` | 2 | 2/1/−1/2/2 | `-3` `SkillChoice` (count 1, all 5 lists, `selected: ['Intimidate']`); `-4` `Ability` **Backhand**; `-5` `Text` "Strong Like Bear" | Foe Thresher / Ursine Form / Twin Colossi |
| 3 | `boar` | `beastheart-companion-3` | Boar | `Animal`, `Companion` | 1M | 5 | 2 | 2/1/−1/2/2 | `-3` `SkillChoice` (`selected: ['Search']`); `-4` `Ability` **Gore**; `-5` `Text` "Spiteful Endurance" | Greased Pig / Wild Rush / Immortal Rage |
| 4 | `condor` | `beastheart-companion-4` | Condor | `Animal`, `Companion` | 1M | 7, `fly` | 0 | 2/2/−1/2/1 | `-3` `SkillChoice` (`selected: ['Alertness']`); `-4` `Ability` **Flurry of Wings**; `-5` `Text` "Moving Target" | Dive Bomb / Borne Aloft / Flight of the Condor |
| 5 | `deinonychus` | `beastheart-companion-5` | Deinonychus | `Animal`, `Companion` | 1M | 7 | 1 | 2/2/−1/2/1 | `-3` `SkillChoice` (`selected: ['Track']`); `-4` `Ability` **Terrible Claws**; `-5` `Text` "Blood Frenzy" | Tear You to Ribbons / Slake my Thirst in Blood / Reaping Scythe |
| 6 | `drake` | `beastheart-companion-6` | Drake | `Companion`, `Dragon` | 1M | 5, `fly` | 1 | 2/1/−1/2/2 | `-3` `Ability` **Drake Breath**; `-4` **`Choice`** "Elementally Attuned" (see below). *No skill choice.* | Endless Breath / A Burning Inside Me / Elemental Avatar |
| 7 | `elementalSpark` | `beastheart-companion-6b` | Elemental Spark | `Companion`, `Elemental` | 1M | 7 | 1 | 2/2/−1/2/1 | `-3` `DamageModifier` (Lightning, Immunity 3); `-4` `SkillChoice` (`selected: ['Magic']`); `-5` `Ability` **Static Shock**; `-6` `Text` "Electric Surge" | Electroshock / Conductive / Lightning Speed |
| 8 | `gummyBall` | `beastheart-companion-7` | Gummy Ball | `Companion`, `Ooze` | 1L | 5 | 2 | 2/2/−1/2/1 | `-2a` `SkillChoice` (`selected: ['Sneak']`); `-3` `DamageModifier` (Acid, Immunity 3); `-4` `Ability` **Absorb**; `-5` `Text` "Gelatinous" | Suck it Up / A Burning Inside Me / Runaway Expansion |
| 9 | `hellhound` | `beastheart-companion-8` | Hellhound | `Companion`, `Infernal` | 1M | 7 | 1 | 2/2/−1/2/1 | `-3` `DamageModifier` (Fire, Immunity 3); `-4` `SkillChoice` (`selected: ['Intimidate']`); `-5` `Ability` **Fire Breath**; `-6` `Text` "Hellish Pact" | Infernal Apparition / Mad Dog / Wreathed in Flames |
| 10 | `lightbender` | `beastheart-companion-9` | Lightbender | `Beast`, `Companion` | 1L | 7 | 2 | 2/1/−1/2/2 | `-3` `SkillChoice` (`selected: ['Hide']`); `-4` `Ability` **Sparkling Tail Whip**; `-5` `Text` "Avoidance" | Hit and Run / Lightbearer / Everywhere and Nowhere |
| 11 | `panther` | `beastheart-companion-10` | Panther | `Animal`, `Companion` | 1M | 7, `climb` | 1 | 2/2/−1/2/1 | `-3` `SkillChoice` (`selected: ['Sneak']`); `-4` `Ability` **Pounce**; `-5` `Text` "Mighty Spring" | Cat and Mouse / Single Bound / Panther Spirit |
| 12 | `spider` | `beastheart-companion-11` | Spider | `Animal`, `Companion` | 1M | 5, `climb` | 1 | 2/2/−1/2/1 | `-3` `SkillChoice` (`selected: ['Sneak']`); `-4` `Ability` **Web Shot**; `-5` `Text` "Come Into My Parlor" | Dripping Fangs / Web Slinger / Life Drinker |
| 13 | `sporeling` | `beastheart-companion-12` | Sporeling | `Beast`, `Companion` | 1S | 5 | 0 | 2/2/−1/2/1 | `-3` `DamageModifier` (Poison, Immunity 3); `-4` `SkillChoice` (`selected: ['Track']`); `-5` `Ability` **Spore Puff**; `-6` `Text` "Skulker" | Slowing Spores / Plant Walk / Trailing Mycelia |
| 14 | `wolf` | `beastheart-companion-13` | Wolf | `Animal`, `Companion` | 1M | 7 | 1 | 2/2/−1/2/1 | `-3` `SkillChoice` (`selected: ['Track']`); `-4` `Ability` **Clamping Jaws**; `-5` `Text` "Retriever" | My, What Big Teeth You Have / Call of the Wild / Dire Wolf |

Level-3 / 6 / 10 features are all plain `Text` features held in
`Summon.info.level3` / `level6` / `level10` and appended to the monster's
feature list by `SummonLogic.getSummonedMonster` when `info.level` clears the
threshold. Their ids follow `beastheart-companion-<n>-<3|6|10>-1`.

#### The one nested choice: `beastheart-companion-6-4` "Elementally Attuned" (Drake)

This is the only choice-point that lives **inside** a companion, and it is the
structural case the rest of the model has to survive.

* `FeatureType.Choice`, `count: 1` (factory default), `selectAt: 'build'` (factory default), `selected: []`.
* 7 options, each `{ feature, value: 1 }`, each feature a `FeatureMultiple`
  (`beastheart-companion-6-4-1` … `-7`) named `Shared Immunity (<type>)` for
  `acid, cold, corruption, fire, lightning, poison, sonic`.
* Each `Multiple` contains exactly two children:
  1. `FeatureDamageModifier` (`…-N a`) — Immunity 3 of that damage type, **applies to the companion**.
  2. `FeatureForController` (`…-N b`, id auto-suffixed `-controller` by the factory) wrapping an identical `FeatureDamageModifier` — **applies to the hero**.

So one player click writes a modifier onto two different creatures. The
selection is stored inside the hero's deep copy of the drake's `Monster`, not
in the hero's own feature list.

---

## Subclasses

`subclassName: 'Wild Nature'`, `subclassCount: 1` → the hero picks exactly one.
All four have `classID: ''` (the project-wide convention — the back-pointer is
never populated in data), `abilities: []`, `selected: false`, and a
`featuresByLevel` array covering all 10 levels with **levels 3, 4, 7 and 10
empty in all four**.

All four share an identical level-1 shape:

1. a `SkillChoice` with a preset `selected` skill,
2. a `PackageContent` named `Wild Nature Benefit` with `tag: 'feral-strike'`,
3. a cost-0 `Ability` (the "signature" subclass ability),
4. a cost-0 triggered `Ability`.

`PackageContent`/`Package` is the mechanism by which the subclass injects text
into the class's `Feral Strike` ability: `Feral Strike` ends with an
`AbilitySectionPackage` whose `tag` is `feral-strike`, and the renderer
(`sheet-formatter.ts` case `'package'`) resolves it by scanning **all** hero
features for `PackageContent` with a matching tag. It is a late-bound
composition edge from subclass → class ability.

### Guardian — `beastheart-sub-1`

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 1 | `beastheart-sub-1-1-1` | `Skill` *(gen)* | `SkillChoice` | **yes** | 1 | `build` | all 5 lists | `string[]`, preset `['Read Person']` |
| 1 | `beastheart-sub-1-1-2` | `Wild Nature Benefit` | `PackageContent` | no | — | — | — | `tag: 'feral-strike'` |
| 1 | `beastheart-sub-1-1-3` | `Living Arrow` | `Ability` | no | — | — | — | granted. Maneuver; `[Beastheart, Magic, Ranged]`; Ranged 10; target `One unoccupied space`; `cost: 0`; sections: text + Spend 1 |
| 1 | `beastheart-sub-1-1-4` | `The Pack Defends` | `Ability` | no | — | — | — | granted. Trigger `"The target takes damage."`; `[Magic]`; Melee 1; target `One ally`; `cost: 0`; sections: text + Spend 1 |
| 2 | `beastheart-sub-1-2-1b` | `Watchdog` | `Text` | no | — | — | — | none |
| 2 | `beastheart-sub-1-2-2` | `Guardian Ability` | `Choice` | **yes** | 1 | `build` | 2 options, each `value: 1`, each a wrapped `Ability`: `…-2-2a` **Omnomnom** (Main; `[Companion, Melee, Strike, Weapon]`; Melee 1; `One creature`; cost 5; field "Special" + Might roll + text), `…-2-2b` **Fetch!** (Main; `[Companion, Magic, Melee, Strike, Weapon]`; Melee 1; `One creature or object`; cost 5; text + Might roll + text) | `Feature[]` (the chosen option's whole feature) |
| 3 | — | — | — | — | — | — | — | `features: []` |
| 4 | — | — | — | — | — | — | — | `features: []` |
| 5 | `beastheart-sub-1-5-1` | `There For Each Other` | `Text` | no | — | — | — | none |
| 6 | `beastheart-sub-1-6-1` | `Guardian Ability` | `Choice` | **yes** | 1 | `build` | `…-6-1a` **Sic 'Em!** (Main; `[Charge, Companion, Melee, Strike, Weapon]`; Melee 1; `One creature`; cost 9; Might roll + Spend 2), `…-6-1b` **Stare Down** (Maneuver; `[Companion, Magic, Ranged]`; Ranged 5; `One creature`; cost 9; text + Intuition roll) | `Feature[]` |
| 7 | — | — | — | — | — | — | — | `features: []` |
| 8 | `beastheart-sub-1-8-1` | `Reflexes Perfected` | `Text` | no | — | — | — | none |
| 9 | `beastheart-sub-1-9-1` | `Guardian Ability` | `Choice` | **yes** | 1 | `build` | `…-9-1a` **Banshee Howl** (Main; `[Area, Companion, Magic]`; Burst 3; `Each enemy in the area`; cost 11; Intuition roll + text + Spend 1), `…-9-1b` **Relentless** (Main; `[Charge, Companion, Melee, Strike, Weapon]`; Melee 1; `One enemy`; cost 11; Intuition roll + text) | `Feature[]` |
| 10 | — | — | — | — | — | — | — | `features: []` |

### Prowler — `beastheart-sub-2`

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 1 | `beastheart-sub-2-1-1` | `Skill` *(gen)* | `SkillChoice` | **yes** | 1 | `build` | all 5 lists | `string[]`, preset `['Hide']` |
| 1 | `beastheart-sub-2-1-2` | `Wild Nature Benefit` | `PackageContent` | no | — | — | — | `tag: 'feral-strike'` |
| 1 | `beastheart-sub-2-1-3` | `Lightning Leap` | `Ability` | no | — | — | — | Maneuver; `[Beastheart, Melee, Weapon]`; Melee 1; `One creature`; cost 0; text + Spend 1 |
| 1 | `beastheart-sub-2-1-4` | `Shadow in the Mist` | `Ability` | no | — | — | — | Trigger `"An enemy within 10 squares deals damage to a creature other than you."`; `[Magic]`; Self; `Self`; cost 0; text + Spend 1 |
| 2 | `beastheart-sub-2-2-1b` | `Supersniffer` | `Text` | no | — | — | — | none |
| 2 | `beastheart-sub-2-2-2` | `Prowler Ability` | `Choice` | **yes** | 1 | `build` | `…-2-2a` **Jump Scare** (Main; `[Area, Companion, Magic]`; Burst 2; `Each enemy in the area`; cost 5; field "Special" + Intuition roll), `…-2-2b` **On You Like Your Shadow** (Main; `[Charge, Companion, Melee, Strike, Weapon]`; Melee 1; `One creature or object`; cost 5; Might roll + text) | `Feature[]` |
| 3 | — | — | — | — | — | — | — | `features: []` |
| 4 | — | — | — | — | — | — | — | `features: []` |
| 5 | `beastheart-sub-2-5-1` | `Melt Away` | `Text` | no | — | — | — | none |
| 6 | `beastheart-sub-2-6-1` | `Prowler Ability` | `Choice` | **yes** | 1 | `build` | **array order is `b` then `a`**: `…-6-1b` **Soft Underbelly** (Main; `[Companion, Melee, Strike, Weapon]`; Melee 2; `One creature`; cost 9; Might roll + text), `…-6-1a` **Wraith Heart** (Move; `[Magic]`; Self; `Self`; cost 9; text only) | `Feature[]` |
| 7 | — | — | — | — | — | — | — | `features: []` |
| 8 | `beastheart-sub-2-8-1` | `Born to Run` | `Text` | no | — | — | — | none |
| 9 | `beastheart-sub-2-9-1` | `Prowler Ability` | `Choice` | **yes** | 1 | `build` | **array order is `b` then `a`**: `…-9-1b` **Behold the Face of Chaos** (Main; `[Companion, Magic, Melee, Strike, Weapon]`; Melee 1; `One creature`; cost 11; Intuition roll), `…-9-1a` **Let’s Take This Outside** (Main; `[Companion, Magic]`; Melee 1; `One creature`; cost 11; text only) | `Feature[]` |
| 10 | — | — | — | — | — | — | — | `features: []` |

### Punisher — `beastheart-sub-3`

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 1 | `beastheart-sub-3-1-1` | `Skill` *(gen)* | `SkillChoice` | **yes** | 1 | `build` | all 5 lists | `string[]`, preset `['Endurance']` |
| 1 | `beastheart-sub-3-1-2` | `Wild Nature Benefit` | `PackageContent` | no | — | — | — | `tag: 'feral-strike'` |
| 1 | `beastheart-sub-3-1-3` | `Avalanche Rush` | `Ability` | no | — | — | — | Maneuver; `[Beastheart, Melee, Weapon]`; Melee 1; `One creature`; cost 0; text + Spend 1 |
| 1 | `beastheart-sub-3-1-4` | `Thunderclap` | `Ability` | no | — | — | — | Trigger `"The target deals damage to a creature."`; `[Melee, Weapon]`; Melee 1; `One enemy`; cost 0; text + Spend 1 |
| 2 | `beastheart-sub-3-2-1b` | `This One's Yours` | **`Ability`** | no | — | — | — | **Structural outlier** — the other three subclasses put a `Text` at `…-2-1b`. Trigger `"A creature force moved by another creature enters a space adjacent to you."` with `{ free: true }`; **`keywords` omitted → `[]`**; Self; `Self`; cost 0; text + Spend 1 |
| 2 | `beastheart-sub-3-2-2` | `Punisher Ability` | `Choice` | **yes** | 1 | `build` | `…-2-2a` **Foe Bowling** (Main; `[Charge, Companion, Melee, Strike, Weapon]`; Melee 1; `One creature`; cost 5; Might roll + text), `…-2-2b` **One Roar and We’re Back In the Fight** (Maneuver; `[Companion]`; Ranged 5; `One ally`; cost 5; text only) | `Feature[]` |
| 3 | — | — | — | — | — | — | — | `features: []` |
| 4 | — | — | — | — | — | — | — | `features: []` |
| 5 | `beastheart-sub-3-5-1` | `I Can Take It` | `Text` | no | — | — | — | none |
| 6 | `beastheart-sub-3-6-1` | `Punisher Ability` | `Choice` | **yes** | 1 | `build` | `…-6-1a` **Lead the Pack** (Maneuver; `[Companion]`; Self; `Self`; cost 9; text only), `…-6-1b` **Rolling Thunder** (Main; `[Companion, Magic, Melee, Strike]`; Self; `Self`; cost 9; Might roll + Spend 2) | `Feature[]` |
| 7 | — | — | — | — | — | — | — | `features: []` |
| 8 | `beastheart-sub-3-8-1` | `Built for Violence` | `Text` | no | — | — | — | none |
| 9 | `beastheart-sub-3-9-1` | `Punisher Ability` | `Choice` | **yes** | 1 | `build` | `…-9-1a` **Battle Frenzy** (Main; `[Area, Companion, Magic]`; Burst 5; target string `Special`; cost 11; field "Special" + Might roll), `…-9-1b` **Juggernaut** (Main; `[Area, Charge, Companion]`; Burst 2; `Each creature`; cost 11; Intuition roll + text) | `Feature[]` |
| 10 | — | — | — | — | — | — | — | `features: []` |

### Spark — `beastheart-sub-4`

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 1 | `beastheart-sub-4-1-1` | `Skill` *(gen)* | `SkillChoice` | **yes** | 1 | `build` | all 5 lists | `string[]`, preset `['Magic']` |
| 1 | `beastheart-sub-4-1-2` | `Wild Nature Benefit` | `PackageContent` | no | — | — | — | `tag: 'feral-strike'` |
| 1 | `beastheart-sub-4-1-3` | `Jaws of the Storm` | `Ability` | no | — | — | — | Maneuver; `[Area, Beastheart, Magic]`; Cube 2 within 5; `Each enemy in the area`; cost 0; text + Spend 1 |
| 1 | `beastheart-sub-4-1-4` | `Pyre` | `Ability` | no | — | — | — | Trigger `"You take damage."`; `[Magic]`; Self; `Self`; cost 0; text + Spend 1 |
| 2 | `beastheart-sub-4-2-1b` | `Stormheart` | `Text` | no | — | — | — | none |
| 2 | `beastheart-sub-4-2-2` | `Spark Ability` | `Choice` | **yes** | 1 | `build` | `…-2-2a` **Burning Lash** (Main; `[Companion, Magic, Melee, Strike, Weapon]`; Melee 2; `One creature`; cost 5; Might roll + Spend 1), `…-2-2b` **Howling Gale** (Main; `[Area, Companion, Magic]`; Cube 3 within 5; `Each enemy in the area`; cost 5; Might roll + text) | `Feature[]` |
| 3 | — | — | — | — | — | — | — | `features: []` |
| 4 | — | — | — | — | — | — | — | `features: []` |
| 5 | `beastheart-sub-4-5-1` | `Wildfire Pyre` | `Text` | no | — | — | — | none |
| 6 | `beastheart-sub-4-6-1` | `Spark Ability` | `Choice` | **yes** | 1 | `build` | `…-6-1a` **Elements Unleashed** (Maneuver; `[Companion, Magic]`; Self; `Self`; cost 9; text + Spend 2 — the text contains a further in-play damage-type choice, see §A11), `…-6-1b` **Killing Frost** (Main; `[Area, Companion, Magic]`; Cube 5 within 1; `Each enemy in the area`; cost 9; Might roll + text) | `Feature[]` |
| 7 | — | — | — | — | — | — | — | `features: []` |
| 8 | `beastheart-sub-4-8-1` | `Nature Will Not Harm Us` | `Text` | no | — | — | — | none |
| 9 | `beastheart-sub-4-9-1` | `Spark Ability` | `Choice` | **yes** | 1 | `build` | `…-9-1a` **For the Pack!** (Trigger `"After taking damage, your companion is dead or dying."` with `{ free: true }`; `[Area, Companion, Magic]`; Self; `Self`; cost 11; text + Might roll), `…-9-1b` **Wild Hunt** (Main; `[Area, Companion, Magic]`; Cube 5 within 20; `Each enemy in the area`; cost 11; text + Might roll) | `Feature[]` |
| 10 | — | — | — | — | — | — | — | `features: []` |

---

## Abilities

### A. Purchasable heroic abilities — `beastheart.abilities` (24)

These populate the `ClassAbility` pickers. `cost` is the ferocity cost.
Every one has `repeatable: false` and `minLevel: 1` (factory defaults).
`PR` = the power roll's characteristic; `—` = no roll section.

| id | Name | cost | Keywords | Action type | Distance | Target | PR |
|---|---|---|---|---|---|---|---|
| `beastheart-ability-1` | Bodyswap | `signature` | Beastheart, Magic, Melee, Strike, Weapon | Main action | Melee 1 | One creature or object | Intuition |
| `beastheart-ability-2` | Come On! | `signature` | Beastheart, Melee, Ranged, Strike, Weapon | Main action | Melee 1; Ranged 5 | One creature or object | Might |
| `beastheart-ability-3` | Covering Fire | `signature` | Beastheart, Ranged, Strike, Weapon | Main action | Ranged 5 | One creature | Intuition |
| `beastheart-ability-4` | Stormrage | `signature` | Beastheart, Magic, Melee, Ranged, Strike, Weapon | Main action | Melee 1; Ranged 5 | One creature or object | Might |
| `beastheart-ability-5` | Bring the Thunder | 3 | Area, Companion, Magic | Main action | Burst 2 | Each enemy in the area | Intuition |
| `beastheart-ability-6` | Herd the Sheep | 3 | Companion, Melee, Strike, Weapon | Main action | Melee 1 | One creature | Might |
| `beastheart-ability-7` | Hungry like the Wolf | 3 | Companion, Magic, Melee, Strike, Weapon | Main action | Melee 1 | One creature | Might |
| `beastheart-ability-8` | Pushover | 3 | Companion, Melee, Strike, Weapon | Main action | Melee 1 | One creature or object | Might |
| `beastheart-ability-9` | All of You Versus All of Me | 5 | Area, Beastheart | Maneuver | Burst 3 | Each enemy in the area | — |
| `beastheart-ability-10` | I Feed on your Pain! | 5 | Beastheart, Melee, Ranged, Strike, Weapon | Main action | Melee 1; Ranged 5 | One creature | Might |
| `beastheart-ability-11` | Rain of Fire | 5 | Area, Beastheart, Weapon | Main action | Cube 3 within 5 | Each enemy in the area | Might |
| `beastheart-ability-12` | You Let Me Get Too Close | 5 | Beastheart, Charge, Melee, Strike, Weapon | Main action | Melee 1 | One creature | Might |
| `beastheart-ability-13` | Death and Violence | 7 | Beastheart, Magic, Ranged | Triggered — `"Your companion uses an ability that reduces the target to 0 Stamina."` | Ranged 10 | One creature | Might |
| `beastheart-ability-14` | Head to Head | 7 | Beastheart, Melee, Strike | Main action | Melee 1 | One creature | Intuition |
| `beastheart-ability-15` | Jaws of Death | 7 | Beastheart, Magic, Melee, Ranged | Main action | Melee 1; Ranged 5 | One creature | Might |
| `beastheart-ability-16` | Shieldbreaker | 7 | Beastheart, Melee, Ranged, Strike, Weapon | Main action | Melee 1; Ranged 5 | One creature | Might |
| `beastheart-ability-17` | Deadshot | 9 | Beastheart, Ranged, Strike, Weapon | Main action | Ranged 15 | One creature or object | Intuition |
| `beastheart-ability-18` | Dogpile | 9 | Beastheart, Melee, Strike, Weapon | Main action | Melee 1 | One creature | Might |
| `beastheart-ability-19` | One, Two, Three, Heave | 9 | Beastheart, Melee, Strike, Weapon | Main action | Melee 1 | One creature | Might |
| `beastheart-ability-20` | Rip Them Apart! | 9 | Melee, Strike, Weapon *(no Beastheart / Companion keyword — see §A12)* | Main action | Melee 1 | One creature | Might |
| `beastheart-ability-21` | Life-Drinking Wound | 11 | Beastheart, Magic, Melee, Ranged, Strike, Weapon | Main action | Melee 1; Ranged 5 | One creature | Might |
| `beastheart-ability-22` | On the Razor’s Edge | 11 | Beastheart, Melee, Ranged, Strike, Weapon | Main action | Melee 1; Ranged 5 | One creature or object | Intuition |
| `beastheart-ability-23` | Ride or Die | 11 | Beastheart | Main action | Self | Self | — |
| `beastheart-ability-24` | Turn the World to Ash | 11 | Area, Beastheart, Magic | Main action | Burst 2 | Each enemy in the area | Intuition |

Cost distribution: 4 × `signature`, 4 × 3, 4 × 5, 4 × 7, 4 × 9, 4 × 11.
Spend sections present on `-5` (Spend 1), `-9` (Spend 1), `-24` (Spend 2,
`repeatable: true`). All other spend-bearing abilities are on features, not here.

### B. Abilities granted as class features (not purchasable)

| id | Name | cost | Keywords | Action type | Distance | Target | PR |
|---|---|---|---|---|---|---|---|
| `beastheart-1-3a` | Heart of the Beast | 0 | Magic, Ranged | Maneuver | Self | Self | — (text + Spend 1 + Spend 1 `repeatable` + Spend 5) |
| `beastheart-1-3b` | Feral Strike | 0 | Area, Companion, Melee, Strike, Weapon | Main action | Burst 1 | Each creature in the area | Might. Sections: text → roll → **`package` section, tag `feral-strike`** |

### C. Abilities granted as subclass features

| id | Name | cost | Keywords | Action type | Distance | Target |
|---|---|---|---|---|---|---|
| `beastheart-sub-1-1-3` | Living Arrow | 0 | Beastheart, Magic, Ranged | Maneuver | Ranged 10 | One unoccupied space |
| `beastheart-sub-1-1-4` | The Pack Defends | 0 | Magic | Triggered | Melee 1 | One ally |
| `beastheart-sub-2-1-3` | Lightning Leap | 0 | Beastheart, Melee, Weapon | Maneuver | Melee 1 | One creature |
| `beastheart-sub-2-1-4` | Shadow in the Mist | 0 | Magic | Triggered | Self | Self |
| `beastheart-sub-3-1-3` | Avalanche Rush | 0 | Beastheart, Melee, Weapon | Maneuver | Melee 1 | One creature |
| `beastheart-sub-3-1-4` | Thunderclap | 0 | Melee, Weapon | Triggered | Melee 1 | One enemy |
| `beastheart-sub-3-2-1b` | This One's Yours | 0 | *(none)* | Free triggered | Self | Self |
| `beastheart-sub-4-1-3` | Jaws of the Storm | 0 | Area, Beastheart, Magic | Maneuver | Cube 2 within 5 | Each enemy in the area |
| `beastheart-sub-4-1-4` | Pyre | 0 | Magic | Triggered | Self | Self |

### D. Abilities reachable only through a subclass `Choice`

24 abilities, 2 per `Choice`, 3 `Choice`s per subclass, 4 subclasses — all
tabulated in *Subclasses* above. Costs: level-2 choices = 5, level-6 = 9,
level-9 = 11, uniformly across all four subclasses.

### E. Companion abilities

One `Ability` per companion, all **Maneuver**, all carrying the `Companion`
keyword, all `cost: 0` with a Spend 1 section (Drake Breath's is
`repeatable: true`).

| Companion | Ability id | Name | Keywords | Distance | Target |
|---|---|---|---|---|---|
| Basilisk | `beastheart-companion-1-4` | Petrify | Companion, Magic, Melee, Ranged, Weapon | Melee 1; Ranged 5 | One enemy |
| Bear | `beastheart-companion-2-4` | Backhand | Companion, Melee, Weapon | Melee 1 | One creature or object |
| Boar | `beastheart-companion-3-4` | Gore | Companion, Melee, Weapon | Melee 1 | One creature or object |
| Condor | `beastheart-companion-4-4` | Flurry of Wings | Companion, Melee, Weapon | Melee 1 | One enemy |
| Deinonychus | `beastheart-companion-5-4` | Terrible Claws | Companion, Melee, Weapon | Melee 1 | One enemy |
| Drake | `beastheart-companion-6-3` | Drake Breath | Companion, Area | Cube 1 within 1 | Each creature in the area |
| Elemental Spark | `beastheart-companion-6b-5` | Static Shock | Companion, Magic, Melee | Melee 1 | One creature or object |
| Gummy Ball | `beastheart-companion-7-4` | Absorb | Companion, Melee, Weapon | Melee 1 | One enemy |
| Hellhound | `beastheart-companion-8-5` | Fire Breath | Companion, Melee | Melee 2 | One creature or object |
| Lightbender | `beastheart-companion-9-4` | Sparkling Tail Whip | Companion, Melee, Weapon | Melee 1 | One enemy |
| Panther | `beastheart-companion-10-4` | Pounce | Companion, Melee, Weapon | Melee 1 | One enemy |
| Spider | `beastheart-companion-11-4` | Web Shot | Companion, Ranged, Weapon | Ranged 5 | One enemy |
| Sporeling | `beastheart-companion-12-5` | Spore Puff | Companion, Melee, Weapon | Melee 1 | One enemy |
| Wolf | `beastheart-companion-13-4` | Clamping Jaws | Companion, Melee, Weapon | Melee 1 | One enemy |

**Keyword partition.** `AbilityKeyword.Beastheart` and `AbilityKeyword.Companion`
are the data-level marker of *who may use an ability*. Across the five files
there are **73 abilities**: 24 purchasable + 2 class-feature + 14 companion (in
`beastheart.ts`), 8 Guardian, 8 Prowler, 9 Punisher, 8 Spark.

* `Beastheart` keyword: **23**
* `Companion` keyword: **42**
* **neither: 8** — `beastheart-1-3a` (Heart of the Beast), `beastheart-ability-20` (Rip Them Apart!), `beastheart-sub-1-1-4` (The Pack Defends), `beastheart-sub-2-1-4` (Shadow in the Mist), `beastheart-sub-2-6-1a` (Wraith Heart), `beastheart-sub-3-1-4` (Thunderclap), `beastheart-sub-3-2-1b` (This One's Yours), `beastheart-sub-4-1-4` (Pyre)
* **both: 0** — the two keywords are mutually exclusive in this dataset.

Six of the eight unkeyworded abilities are the four subclasses' level-1
triggered abilities plus Wraith Heart and This One's Yours, all of which read as
"either partner" abilities per `beastheart-1-2b`. There is no positive keyword
for "either" — it is expressed as absence, which is not a safe thing to encode
as `null`.

---

## Choice-point inventory

In build order, for a level-10 Beastheart. "Cardinality" is how many
selections the player makes at that point.

| # | When | Choice point | Feature id(s) | FeatureType | Cardinality | Option set size |
|---|---|---|---|---|---|---|
| 1 | class pick | Beastheart selected | — | — | 1 | (class list) |
| 2 | L1 | Primary characteristics | — (`primaryCharacteristicsOptions`) | — | **0 — forced** | 1 pair (`Might, Intuition`) |
| 3 | L1 | Subclass ("Wild Nature") | — (`subclassCount: 1`, no feature) | — | 1 | 4 |
| 4 | L1 | Fixed skill | `beastheart-1-1a` | `SkillChoice` | 1 (pre-filled `Handle Animals`) | all skills |
| 5 | L1 | Skills | `beastheart-1-1b` | `SkillChoice` | 2 | Exploration + Intrigue lists |
| 6 | L1 | **Companion** | `beastheart-1-2a` | `SummonChoice` | 1 | **14** |
| 6a | L1, conditional | Companion's own preset skill | e.g. `beastheart-companion-13-3` | `SkillChoice` nested in the chosen monster | 1 (pre-filled) | all skills. Present on 12 of 14 companions (**absent** on Basilisk and Drake) |
| 6b | L1, conditional | **Drake only:** Elementally Attuned | `beastheart-companion-6-4` | `Choice` nested in the chosen monster | 1 | 7 |
| 7 | L1 | Kit | `beastheart-1-5` | `Kit` | 1 | all kits |
| 8 | L1 | Signature ability | `beastheart-1-7` | `ClassAbility` | 1 | 4 (class `signature`) + subclass abilities of that cost (none exist) |
| 9 | L1 | 3-cost ability | `beastheart-1-8` | `ClassAbility` | 1 | 4 |
| 10 | L1 | 5-cost ability | `beastheart-1-9` | `ClassAbility` | 1 | 4 |
| 11 | L2 | Perk | `beastheart-2-1` | `Perk` | 1 | Exploration + Interpersonal + Intrigue lists |
| 12 | L2 | Subclass ability | `beastheart-sub-<n>-2-2` | `Choice` | 1 | 2 |
| 13 | L3 | 7-cost ability | `beastheart-3-1` | `ClassAbility` | 1 | 4 |
| 14 | L4 | Perk (any list) | `beastheart-4-2` | `Perk` | 1 | all 6 lists |
| 15 | L4 | Skill | `beastheart-4-3` | `SkillChoice` | 1 | all 5 lists |
| 16 | L5 | 9-cost ability | `beastheart-5-1` | `ClassAbility` | 1 | 4 |
| 17 | L6 | Perk | `beastheart-6-1` | `Perk` | 1 | Exploration + Interpersonal + Intrigue |
| 18 | L6 | Subclass ability | `beastheart-sub-<n>-6-1` | `Choice` | 1 | 2 |
| 19 | L7 | Skill | `beastheart-7-3` | `SkillChoice` | 1 | all 5 lists |
| 20 | L8 | Perk (any list) | `beastheart-8-1` | `Perk` | 1 | all 6 lists |
| 21 | L8 | 11-cost ability | `beastheart-8-2` | `ClassAbility` | 1 | 4 |
| 22 | L9 | Fixed skill | `beastheart-9-1b` | `SkillChoice` | 1 (pre-filled `Nature`) | all skills |
| 23 | L9 | Lore skill | `beastheart-9-1c` | `SkillChoice` | 1 | Lore list |
| 24 | L9 | Subclass ability | `beastheart-sub-<n>-9-1` | `Choice` | 1 | 2 |
| 25 | L10 | Perk | `beastheart-10-3` | `Perk` | 1 | Exploration + Interpersonal + Intrigue |
| 26 | L10 | Skill | `beastheart-10-5` | `SkillChoice` | 1 | all 5 lists |
| 27 | L1 subclass | Subclass preset skill | `beastheart-sub-<n>-1-1` | `SkillChoice` | 1 (pre-filled) | all skills |

**Totals.** Rows #3–#27 are 25 unconditional build-time decision points for a
level-10 Beastheart. Row #2 is a forced non-choice (cardinality 0) and row #1 is
the class pick itself. Companion-dependent additions: **+1** if the chosen
companion has its own preset skill (12 of 14 — row #6a), **+1** if the companion
is the Drake (row #6b). So: **26** decision points for 12 of the 14 companions,
**26** for the Drake (which has #6b but not #6a), **25** for the Basilisk (which
has neither).

Of those, **4 are pre-filled** and technically re-openable —
`beastheart-1-1a` (Handle Animals), `beastheart-9-1b` (Nature), the subclass
`beastheart-sub-<n>-1-1`, and the companion's own skill choice. **Zero** choices
anywhere in the class use `selectAt: 'respite'` or `'play'`; every `selectAt`
present resolves to `'build'`, and `SummonChoice` has no `selectAt` field at all.

Notably absent relative to other classes: no ancestry/culture/career choices
(those are hero-level, not class-level), no `TitleChoice`, no `LanguageChoice`,
no `Domain`, no `ItemChoice`.

---

## UI surface

Ordered list of controls the builder renders for a Beastheart, with the control
kind we should build. (Forge Steel's own control kinds are noted where they
differ from what we'd want.)

| Order | Control | Kind | Notes |
|---|---|---|---|
| 1 | Class = Beastheart | single-select (searchable list) | gated on sourcebook `beastheart` being enabled |
| 2 | Primary characteristics | **read-only display** | one option only; render as a locked pair, not a picker |
| 3 | Wild Nature (subclass) | single-select, 4 cards | label the group with `subclassName`, not the literal word "subclass" |
| 4 | Skill: Handle Animals | **locked chip with an "unlock/change" affordance** | Forge Steel renders a removable selection box; we should render a granted chip and require an explicit override |
| 5 | Skills ×2 (Exploration / Intrigue) | multi-select-2, searchable | dedupe against already-known skills |
| 6 | **Companion** | single-select from a 14-card gallery, each card opening a full stat block preview | Forge Steel: a drawer + `SummonSelectModal`. Each card must show size, speed, stability, characteristics, the companion's ability, and its L3/L6/L10 unlocks |
| 6a | Companion → name | free text (+ name suggester) | writes to **both** `Summon.name` and `Summon.monster.name` in the source |
| 6b | Companion → nested sub-choices | **nested sub-choice panel**, rendered only if the chosen companion has choice-bearing features | Forge Steel: `ControlledMonsterCustomizePanel` filters the monster's features by `FeatureLogic.isChoice`. In practice this surfaces (i) the companion's preset skill (12 of 14) and (ii) the Drake's 7-way *Elementally Attuned* single-select |
| 7 | Kit | single-select, searchable | one kit; the companion inherits it with two exceptions (display-only) |
| 8 | Signature ability | single-select from 4 | show ferocity cost + keywords + who can use it (Beastheart / Companion badge) |
| 9 | 3-cost ability | single-select from 4 | |
| 10 | 5-cost ability | single-select from 4 | |
| 11 | *(L2)* Perk | single-select, searchable, filtered to 3 lists | |
| 12 | *(L2)* Subclass ability | single-select from 2 | the option cards are full ability blocks |
| 13 | *(L3)* 7-cost ability | single-select from 4 | |
| 14 | *(L4)* Perk (any list) | single-select, searchable, all 6 lists | |
| 15 | *(L4)* Skill | single-select, searchable, all 5 lists | |
| 16 | *(L5)* 9-cost ability | single-select from 4 | |
| 17 | *(L6)* Perk | single-select, 3 lists | |
| 18 | *(L6)* Subclass ability | single-select from 2 | |
| 19 | *(L7)* Skill | single-select, all 5 lists | |
| 20 | *(L8)* Perk (any list) | single-select, all 6 lists | |
| 21 | *(L8)* 11-cost ability | single-select from 4 | |
| 22 | *(L9)* Skill: Nature | locked chip with override | |
| 23 | *(L9)* Lore skill | single-select, Lore list | |
| 24 | *(L9)* Subclass ability | single-select from 2 | |
| 25 | *(L10)* Perk | single-select, 3 lists | |
| 26 | *(L10)* Skill | single-select, all 5 lists | |

**Non-interactive surfaces the sheet must render:**

* Two heroic-resource trackers — **Ferocity** (hero) and **Rampage** (companion) — plus **Ferox** (epic) at L10. Rampage needs a threshold ladder at 8 / 12 / 16 / 20 / 24 with the threshold's benefit text shown as it unlocks.
* A **companion stat block panel** in the "retinue" region, showing the materialised monster (Stamina resolved from the hero, free-strike damage resolved from Might, plus the L3/L6/L10 features once unlocked).
* The `Feral Strike` ability card must **splice in** the subclass's `Wild Nature Benefit` text at the position of its `package` section.
* Two long rules blocks (`Companions in Combat`, `Beasthearts and Magic Treasure`) that are reference text with no interaction.

**A control we should add that Forge Steel does not have:** an explicit
"change your companion" action. The rules text names it as a respite activity,
but the data models the companion as a plain build-time `SummonChoice`
(`selectAt` does not exist on that feature type). See §A6.

---

## Convex data model notes

### Definition data (seeded once, versioned by source)

| Collection | Key | Contents |
|---|---|---|
| `sources` | `beastheart` | the sourcebook record; gates class + 14 items + 8 perks |
| `classes` | `class-beastheart` | identity fields, `subclassName`, `subclassCount`, `primaryCharacteristicOptions` |
| `classFeatures` | `(classId, level, featureId)` | the 49 rows in *Level progression* |
| `subclasses` | `beastheart-sub-1..4` | + their `subclassFeatures` rows |
| `classAbilities` | `beastheart-ability-1..24` | with `cost` as the index for the `ClassAbility` pickers |
| `companionTemplates` | `beastheart-companion-1..13`, `-6b` | 14 full nested creature definitions |
| `companionProgression` | `(companionId, level ∈ {3,6,10})` | the unlock features |

**The companion templates must be their own definition collection, not blobs
inside the class feature row.** They are ~1400 of the file's 2378 lines, they
have their own internal feature lists, their own nested choice points, and their
own level progression. Modelling them as a `v.any()` payload on the feature row
would put a second entity's schema inside an opaque column.

Proposed shape (illustrative, not final):

```
companionTemplates: {
  _id, sourceId: 'beastheart', classId: 'class-beastheart',
  key: 'beastheart-companion-6',          // stable, from Forge Steel
  name, keywords: string[],
  size: { value, mod },
  speed: { value, modes: string[] },
  stability, freeStrikeDamage, baseStamina,
  characteristics: { might, agility, reason, intuition, presence },
  // derived-stat rules, kept declarative:
  derivations: [
    { field: 'stamina',          from: 'controller.stamina' },
    { field: 'freeStrikeDamage', from: 'controller.characteristic.might' }
  ]
}

companionFeatures: {
  _id, companionKey, featureKey,          // 'beastheart-companion-6-4'
  unlockLevel: 1 | 3 | 6 | 10,
  scope: 'companion' | 'controller',      // <-- the ForController flag
  kind: 'text' | 'ability' | 'damageModifier' | 'skill' | 'choice' | 'group',
  payload
}
```

### Selection state (per hero, sparse, keyed by feature id)

```
heroSelections: {
  heroId, featureKey, value
}
```

`value` shape by `FeatureType`:

| FeatureType | Stored value |
|---|---|
| `SkillChoice` | `string[]` (skill names) |
| `Kit` | `string[]` (kit ids) |
| `Perk` | `string[]` (perk ids) |
| `ClassAbility` | `string[]` (ability ids) |
| `Choice` (subclass ability) | `string[]` (option feature ids) |
| `SummonChoice` (the companion) | `{ companionKey: string, name?: string }` — **an id reference, never a copy** |
| nested companion choices | see below |

**The definition-vs-selection split is hard in exactly three places.**

**(1) The companion is a nested entity with its own selection namespace.**
Forge Steel writes the player's companion choice by deep-copying the whole
`Summon` (monster, features, everything) into
`FeatureSummonChoice.data.selected`, then writing further selections *into that
copy* — e.g. the Drake's attunement lands on
`hero.class.featuresByLevel[0].features[5].data.selected[0].monster.features[3].data.selected`.
A flat `heroSelections` map keyed by feature id cannot address that without a
path. Two options, and I'd take the second:

* Namespace the key: `featureKey = 'beastheart-1-2a/beastheart-companion-6-4'`. Cheap, but reintroduces path-encoding into a string.
* Give the companion its **own document**: `heroCompanions { heroId, slotFeatureKey: 'beastheart-1-2a', companionKey, displayName, selections: { [featureKey]: value } }`. Selections inside a companion live in the companion's own map. This keeps the hero's map flat, makes "change your companion" a document replace, and generalises to the Summoner's summons (which are the same `Summon` type).

**(2) Feature scope is bidirectional.** A feature written on the companion can
apply to the hero. `FeatureForController` is the marker: `createForController`
wraps any `Feature` and suffixes its id with `-controller`.
`HeroLogic.getFeatures` runs a second pass over every controlled monster
(`Companion`, `Retainer`, `Summon`, `SummonChoice`), pulls out its
`ForController` children, unwraps `data.feature`, and appends the inner feature
to the **hero's** feature list with `source = monster.name`. Everything else on
the monster stays on the monster. So our resolver needs a two-direction fold:

```
heroEffective  = classFeatures ⊕ subclassFeatures ⊕ selections
               ⊕ unwrap(companionFeatures where scope = 'controller')
companionEffective = companionFeatures where scope = 'companion'
               ⊕ derivations resolved against heroEffective
```

Crucially, the reverse does **not** happen implicitly:
`FeatureLogic.simplifyFeatures` has no `SummonChoice` case, so a companion's
ordinary features are *never* folded into the hero. The only hero→companion
channel is `valueFromController` / `valueCharacteristics` on `Modifier`, plus
the ad-hoc special-cases described in §A4.

**(3) The companion's level is derived, not stored.**
`HeroLogic.getSummons` recomputes `info.level = hero.class.level` on every read
before calling `SummonLogic.getSummonedMonster`. Store the companion's level
**nowhere**; derive it. (Forge Steel *also* writes it in `setLevel` and again on
selection — three writes for a derived value. Don't copy that.)

### Other model notes

* **`Summon.id === Summon.monster.id`.** If we keep a `companionKey`, use one key, not two.
* **Two `'heroic'`-typed resources.** Ferocity and Rampage are both `type: 'heroic'`. Our resource model must key thresholds and gains by **resource name**, not by "the hero's heroic resource" — see §A7.
* **`replacesTags` is a resource-gain override chain**, not an additive one: `getHeroicResources` collects every `HeroicResourceGain`, unions the `replacesTags` of all of them, and filters out any gain whose `tag` appears in that union. Model gains as `{ tag, replacesTags[] }` and resolve by the same subtraction, so L4/L7/L10 upgrades supersede rather than stack.
* **`HeroOverview.background`** is a display concatenation in Forge Steel, not a Draw Steel concept. Do not carry it into our schema.
* **`SubClass.classID` is always `''`** in every class in the source. Our schema should carry a real `classId` foreign key and populate it at seed time.
* **`Element` (`{id, name, description}`) is the universal base.** Our seed can flatten it, but the `description` field is prose we must treat as `VERIFY-AGAINST-PIN` throughout — including on the companion `Text` features, which are the largest block of unverified rules prose in this class.

---

## Anomalies & open questions

**§A1 — The Beastheart companion is not `FeatureType.Companion`.**
`FeatureCompanion` (`{ selected: Monster | null }`) exists and is used, but only
by `hero-customize-modal.tsx` (a user-added arbitrary feature) and by
`pregen-logic`. The Beastheart uses `FeatureType.SummonChoice`. Consequences
worth knowing: `HeroLogic.getCompanions()` filters on `FeatureType.Companion`
and therefore **returns nothing for a Beastheart**; the companion reaches the
retinue panel through `HeroLogic.getSummons()` instead. The two paths render
differently (`buildRetainerSheet` vs `buildCompanionSheet`). If we adopt one
"controlled creature" concept we avoid this fork entirely.

**§A2 — The point-buy add-on system is not the Beastheart's.**
`FeatureAddOn` (`{ category: FeatureAddOnType, cost: number, repeatable: boolean }`)
and `FeatureAddOnType` (`Mobility | Defensive | Offensive | Supernatural | Ancestry`)
appear in exactly one data file: `src/data/monsters/animal.ts`, as the
`MonsterGroup.addOns` array (35 entries, costs 1–2, categories Mobility /
Defensive / Offensive / Supernatural). That is the Director-facing "Animal
Traits" customiser for building generic animal stat blocks — a monster-authoring
tool with its own point budget, described in the group's own information text.
**No Beastheart file references `createAddOn`, `FeatureAddOn` or
`FeatureAddOnType`.** There is no add-on point-buy anywhere in the Beastheart's
companion. If our design brief assumed one, it needs re-scoping against the pin
before we build a budget UI. `repeatable: true` add-ons exist in `animal.ts`
(the notation table shows `Swiftness x2`, `Reach x2`), so the concept is real —
it just isn't wired to this class.

**§A3 — `FeatureForController` is the companion→hero scope escape hatch, and it
is used exactly 7 times in this class.** All 7 are inside the Drake's
*Elementally Attuned* options. Semantics, from `factory-feature-logic.ts:332`
and `hero-logic.ts:217-250`: `createForController({ feature })` produces
`{ id: '<inner>-controller', name: '<inner> (for controller)', type: ForController, data: { feature } }`.
The hero's feature resolution walks every controlled monster, simplifies its
features, keeps only `ForController` ones, and pushes `data.feature` (the
*unwrapped* inner feature) into the hero's list. There is no reciprocal
`ForCompanion` wrapper — a hero feature never crosses to the companion through
the feature system. **This is the "for-companion features" distinction the
upstream commits refer to:** features are companion-scoped by default (they sit
in `Monster.features`) and opt into hero scope by wrapping. Our schema should
make this a first-class enum field (`scope: 'companion' | 'controller'`) rather
than a wrapper node, because a wrapper forces every consumer to unwrap.

**§A4 — Companion level scaling is implemented twice, and one copy is dead.**
* `SummonLogic.getSummonedMonster` (lines ~95–115) special-cases
  `role.organization === Companion && controller.class.id === beastheart.id` and
  bumps characteristics at controller levels 4 / 7 / 10 (M+I, then all five,
  then M+I). This is the live path — it is reached from `HeroLogic.getSummons`.
* `MonsterLogic.getFeatures` (lines ~225–290) *also* injects `CharacteristicBonus`
  features for `organization === Companion` at levels 4 / 7 / 10, with the same
  values, but gated on `MonsterLogic.getMonsterLevel(monster)`, which returns
  `monster.retainer?.level ?? monster.level`. Beastheart companions have
  `level: 0` and `retainer: null`, so this branch **never fires** for them.
  It also injects a duplicate "Kit" text feature that restates
  `beastheart-1-5`'s description.

Two implementations of one rule, one of them unreachable, is precisely the
duplicated-rule bug class. When we port, this must be **one** derivation, keyed
off the controller's level. It also means the L4/L7/L10 class-level
`CharacteristicBonus` features (`beastheart-4-1a/b`, `7-1a..e`, `10-1a/b`) are
mirrored by a hard-coded companion rule rather than expressed as data — a
candidate for a shared `appliesTo: ['hero','companion']` flag in our schema.

**§A5 — `Summon.info.level` is written in three places and derived in a fourth.**
Definition sets `1`; `ConfigSummonChoice.onSelect` stamps
`hero.class.level`; `HeroLogic.setLevel` re-stamps every option *and* every
selection; `HeroLogic.getSummons` overwrites it again at read time. The last one
wins, so the field is effectively derived — but a stale value is observable in
any code path that reads `feature.data.selected[0].info.level` directly (e.g.
`hero-sheet-builder.buildFollowerCompanionSheet`, which passes
`hero.class?.level` separately for retainers but not for companions). **Derive
it; do not store it.**

**§A6 — "Changing Your Companion" is a respite activity in the text and a
build-time choice in the data.** `beastheart-1-2b` states the companion can be
released and replaced as a respite activity. `FeatureSummonChoiceData` has **no
`selectAt` field at all** (unlike `Choice`, `SkillChoice`, `LanguageChoice`), so
there is no way to mark it as respite-editable, and `HeroLogic.takeRespite`
does nothing to it. If our builder locks build-time choices after character
creation, the companion must be explicitly exempted. Also unanswered by the
source: whether a re-chosen companion keeps or loses the sub-choices made on the
previous one (Forge Steel just replaces the array element, discarding them).

**§A7 — Ferocity and Rampage are both `type: 'heroic'`, and this leaks.**
`HeroLogic.getHeroicResources` builds, for **each** `'heroic'` resource, a gains
list of `f.data.gains ++ every HeroicResourceGain feature on the hero ++ domain
gains`. Because Rampage is `'heroic'`, the L4 *Unchained Ferocity*, L7 *Greater
Ferocity* and L10 *Final Evolution* gain features are attached to **Rampage as
well as Ferocity**. Separately, `defaultResourceName` (used to resolve a
threshold that names no resource) is `resourceFeatures.find(f => f.data.type === 'heroic')?.name`
— the *first* heroic resource in feature order, i.e. Ferocity. The Rampage
thresholds are safe only because they all name `'Rampage'` explicitly. Finally,
`HeroLogic.takeRespite` zeroes **all** `'heroic'` resources, which includes
Rampage, whose own text says it resets at end of encounter. Our model should
either give Rampage a distinct resource kind (companion-scoped) or scope gains
by resource name, and should key encounter-vs-respite reset per resource.

**§A8 — The subclass choice is not a feature.** Unlike skills, kits, perks and
abilities, picking the "Wild Nature" is driven by `HeroClass.subclassCount` +
`SubClass.selected`, with no `Feature` row and therefore no entry in a
feature-keyed selection map. Our schema needs a dedicated
`heroSubclassSelections` edge (or a synthetic feature id) or the subclass choice
falls outside whatever mechanism validates "all choices made".

**§A9 — Every `HeroicResourceThreshold` has `level: 1`.** `beastheart-4-5`,
`-7-4` and `-10-6` sit in the level 4 / 7 / 10 feature arrays but their
`data.level` is the factory default `1` (the call sites omit `level`). Nothing
in `getHeroicResources` reads `data.level`, so it is currently inert — but if we
port the field we must populate it from the containing level, not from the data.

**§A10 — Three level-9/level-1 effects are prose-only and mechanically invisible.**
`beastheart-9-1a` (*Avatar of the Green*) asserts a companion Reason increase,
language acquisition and telepathy; it is a bare `Text` feature, so nothing in
the engine applies it. `beastheart-1-2b`'s "Shared Skills" (companion has every
skill the hero has, and vice versa) is likewise `Text` only — the companion's
own `SkillChoice` features are not unioned with the hero's, and
`HeroLogic.getSkills` does not consult the companion. Same for "Shared Perks,
Titles, and Complications". These are gaps to raise against the pin, not bugs to
copy: our three-tier model would have to place each one deliberately.

**§A11 — In-play choices with no data representation.** *Elements Unleashed*
(`beastheart-sub-4-6-1a`) asks the player to choose a damage type each time it
is used, and to re-choose on extension. *Rampage 20* / *Rampage 24*
(`beastheart-7-4a`, `beastheart-10-6a`) describe a free-maneuver size change.
*Ride or Die* (`beastheart-ability-23`) asks the player to pick two other
abilities at use time. None of these are modelled — they are prose inside `Text`
features. They are runtime state, not build state, and belong to the tracker,
not the builder; flagging them so they don't get silently dropped at the seam.

**§A12 — Small data inconsistencies.**
* `beastheart-ability-20` (*Rip Them Apart!*) is the only one of the 24 purchasable abilities with neither the `Beastheart` nor the `Companion` keyword; the other 23 each carry exactly one. Its text uses "your partner", which per `beastheart-1-2b` is the marker of an either-may-use ability — so the omission is plausibly deliberate, but "either" is expressed as *absence of a keyword*, which is not something we should encode as a null.
* Companion ids are `beastheart-companion-1` … `-13` **plus `-6b`** for the Elemental Spark, i.e. 14 companions over a 13-slot numbering. `elementalSpark` was clearly inserted after `drake` without renumbering. Do not derive ordering or count from these ids.
* Level-4 has `beastheart-4-4b` with no `beastheart-4-4a`. Level-2 subclass features are all `…-2-1b` with no `…-2-1a`. Id suffixes are not dense.
* Prowler's level-6 and level-9 `Choice` option arrays list option `b` before option `a`. If we key display order off the id we will render Prowler's options in a different order than Forge Steel does.
* Punisher's `beastheart-sub-3-2-1b` is an `Ability` where all three sibling subclasses have a `Text` at the same slot, and it omits `keywords` entirely (`[]`).
* The Basilisk and the Drake are the only companions with **no** `SkillChoice` feature; every other companion has one with a preset skill. Whether that is canon or an omission is a question for the pin.
* `beastheart-1-1a` / `beastheart-9-1b` / the four subclass `…-1-1` skills / all 12 companion skills are modelled as **satisfied choices with a preset `selected`**, not as grants. `ConfigSkillChoice` renders a remove button on every selected entry, so a player can drop the "fixed" skill and re-pick from all five lists. If canon says these are fixed, our model should express them as grants (`SkillGrant`) and not as `SkillChoice`.

**§A13 — Open questions we could not resolve from the source.**
1. Does canon give the Beastheart **one** signature ability at level 1, or two? The data has a single `ClassAbility` picker with `count: 1`.
2. Is the companion's Stamina a live derivation from the hero's current maximum, or a snapshot at selection? The data expresses it as `valueFromController`, i.e. live — but `SummonLogic` bakes the value into `f.data.value` on the copy it returns.
3. What happens to the Drake's *Elementally Attuned* choice, and to a companion's preset skill, when the companion is swapped at respite and swapped back?
4. Is Rampage a hero resource or a companion resource? The text says the companion has it; the data files it as a hero-level `HeroicResource` of type `'heroic'`.
5. `beastheart-1-2b` says the companion "counts as one hero" for encounter difficulty. The companion's `Monster.encounterValue` is `0`, which is consistent — but our encounter-budget model needs to know whether a Beastheart contributes 1 or 2 bodies.
