> **Provenance — read before implementing.**
> Structure in this file is mapped from **Forge Steel**
> (github.com/andyaiken/forgesteel, GPL-3.0), commit `01672c1`, read 2026-08-29.
> Forge Steel is an independent third-party transcription of Draw Steel and is
> **not** our canon source. Every name, number, count and option list below is
> **UNVERIFIED** and must be confirmed against the pinned SteelCompendium
> corpus (DEC-0008) before it is implemented or shown to a user.
> This file is a **structural map for UI and data-model design**, not a rules source.

# Summoner — structural map

Source files (read-only reference):

- `src/data/classes/summoner/summoner.ts` (1269 lines) — class
- `src/data/classes/summoner/blight.ts` (902) — Circle of Blight
- `src/data/classes/summoner/storms.ts` (964) — Circle of Storms
- `src/data/classes/summoner/spring.ts` (870) — Circle of Spring
- `src/data/classes/summoner/graves.ts` (968) — Circle of Graves
- `src/data/sourcebooks/official/summoner.ts` — sourcebook gate
- `src/models/summon.ts`, `src/logic/summon-logic.ts` — the summon mechanism

Every feature body's prose is deliberately **not** transcribed. Where the rules
text carries load, the row is marked `text: VERIFY-AGAINST-PIN`.

---

## Identity

| Field | Value | Notes |
|---|---|---|
| `id` | `class-summoner` | |
| `name` | `Summoner` | |
| `description` | `text: VERIFY-AGAINST-PIN` | multi-paragraph prose |
| `type` | `'master'` | `HeroClass.type: 'standard' \| 'master'`. Consumed only in `class-panel.tsx:177`, which pushes a `Master Class` display tag. No mechanical branch anywhere else in the source. |
| `subclassName` | `Circle` | UI label for the subclass slot |
| `subclassCount` | `1` | pick exactly one Circle |
| `primaryCharacteristicsOptions` | `[[Reason]]` | single option group, single characteristic — no player choice |
| `primaryCharacteristics` | `[]` | per-hero selection state, empty in the definition |
| `featuresByLevel` | 10 entries, levels 1–10 | level 5 is `features: []` |
| `abilities` | 18 | the class ability pool (see §Abilities) |
| `subclasses` | 4 | `circleOfBlight`, `circleOfGraves`, `circleOfSpring`, `circleofStorms` |
| `level` | `1` | per-hero state carried on the definition object |
| `characteristics` | `[]` | per-hero state carried on the definition object |

### Sourcebook gate

The Summoner is **not** in the core sourcebook. It ships in its own sourcebook,
lazily imported at `src/data/sourcebook-data.ts:25`:

| Field | Value |
|---|---|
| `id` | `summoner` |
| `name` | `The Summoner` |
| `description` | "Contains the Summoner class, items, and titles." |
| `type` | `SourcebookType.Official` |
| `classes` | `[ summoner ]` |
| `subclasses` | `[]` — the four Circles are nested inside the class, not registered at sourcebook level |
| `items` | 4 trinkets by echelon + 4 leveled implements (`snakerattleBangle`; `abyssalMapInk`, `graspOfTheChainedHand`, `thunderChariot`; `crossOfTheScornedPuppeteer`, `crystallizedEssence`, `warbannerOfPride`; `hagbasket`, `warbannerOfWrath`; `fieldCommandersBaton`, `rexScepter`, `sanctuaryHorn`, `wandOfTheUnheardOrchestra`) |
| `titles` | `safeguarded`, `sigilwright`, `summonerSuccessor`, `ringleader`, `delegator`, `highSummoner` |
| everything else | empty arrays |

Note the enum value is `Official`, **not** a distinct "Patreon" or "supplemental"
tier — Forge Steel has `Official / ThirdParty / Community / Homebrew` only
(`src/enums/sourcebook-type.ts`). There is a sibling `patreon.ts` sourcebook and
a sibling `beastheart.ts` sourcebook; both are also typed `Official`. **The
gating mechanism is sourcebook membership, not a flag on the class**: a hero
carries `sourcebookIDs: string[]`, and the class only appears if `summoner` is
among them. Our model must reproduce *that* seam — a per-hero (or per-campaign)
enabled-source set — not a boolean "is supplemental".

---

## Level progression

One row per top-level feature. `Choice?` means Forge Steel's
`FeatureLogic.isChoice()` returns true for that `FeatureType`. Defaults resolved
from `FactoryFeatureLogic` (`src/logic/factory-feature-logic.ts`); a blank
`count`/`selectAt` in the data file still produces a concrete value.

`Selection shape` describes what would live in **our** sparse per-hero selection
map, not what Forge Steel writes inline.

### Level 1 — 13 features

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 1 | `summoner-stamina` | `Stamina` (defaulted from `field`) | `Bonus` | no | — | — | — | none. `field: Stamina, value: 15, valuePerLevel: 6`, other modifier fields defaulted (`valueCharacteristicMultiplier: 1`) |
| 1 | `summoner-recoveries` | `Recoveries` (defaulted) | `Bonus` | no | — | — | — | none. `field: Recoveries, value: 8` |
| 1 | `summoner-resource` | `Essence` | `HeroicResource` | no | — | — | — | none at build. `type: 'heroic'`, `canBeNegative: false`, `value: 0`, `thresholds: []`, `gains: [ {tag:'start', value:'2', OncePerRound}, {tag:'minion-death', value:'1', OncePerRound} ]`, `details: VERIFY-AGAINST-PIN` |
| 1 | `summoner-1-1` | `Skills` (defaulted, count>1) | `SkillChoice` | **yes, but pre-seeded** | 2 | build | `options: []`, `listOptions: []` → factory substitutes **all five** skill lists | `string[]` of 2. **Definition ships `selected: ['Magic','Strategy']`** — see Anomalies |
| 1 | `summoner-1-1c` | `Intrigue / Lore Skills` (defaulted) | `SkillChoice` | yes | 2 | build | `listOptions: [Intrigue, Lore]` | `string[]` of 2 |
| 1 | `summoner-1-2` | `Minions` | `Package` | no | — | — | — | none. `tag: 'minions'`. Body is the whole minion/squad subsystem: `text: VERIFY-AGAINST-PIN` |
| 1 | `summoner-1-3` | `Summoner Strike` | `Ability` | no | — | — | — | none. Granted ability; carries an `AbilitySectionPackage` with tag `summoner-strike` |
| 1 | `summoner-1-4` | `Strike For Me` | `Ability` | no | — | — | — | none |
| 1 | `summoner-1-5` | `Call Forth` | `Ability` | no | — | — | — | none. `cost: 1, repeatable: true` |
| 1 | `summoner-1-6` | `Minion Bridge` | `Ability` | no | — | — | — | none |
| 1 | `summoner-1-7` | `Formation` | `Choice` | yes | 1 | build | 4 inline options, each `value: 1` | one option id |
| 1 | `summoner-1-8` | `Tactic Call` | `Choice` | yes | 1 | build | 4 inline options, each `value: 1`, each wrapping an `Ability` feature | one option id |
| 1 | `summoner-1-9` | `5pt Ability` (defaulted) | `ClassAbility` | yes | 1 | — | `cost: 5`; `fromClassAbilities: true`, `fromSelectedSubclassAbilities: true`, all four `…Levels` sources false; `minLevel: 1` | `selectedIDs: string[]` of 1 |

`summoner-1-7` **Formation** option list (all `SummonFormation` except the last):

| Option ID | Name | FeatureType | Payload |
|---|---|---|---|
| `summoner-1-7a` | Horde Formation | `SummonFormation` | `minionFeatures: []` (defaulted); effect is prose-only |
| `summoner-1-7b` | Platoon Formation | `SummonFormation` | `minionFeatures: []` |
| `summoner-1-7c` | Elite Formation | `SummonFormation` | `minionFeatures: [ summoner-1-7c-1 Bonus Stamina +3, summoner-1-7c-2 Bonus Stability +1 ]` |
| `summoner-1-7d` | (name defaulted → `Leader Formation, Proficiency`) | `Multiple` | `[ summoner-1-7da SummonFormation "Leader Formation" (minionFeatures: []), summoner-1-7db Proficiency (weapons: [Light], armor: [Light]) ]` |

`summoner-1-8` **Tactic Call** option list (all `Ability`, all triggered actions):

| Option ID | Name | Action type | Distance | Target |
|---|---|---|---|---|
| `summoner-1-8a` | Focus Fire! | Trigger (not free) | Summoner Range | Self or one ally |
| `summoner-1-8b` | Halt! | Trigger (not free) | Summoner Range | One creature |
| `summoner-1-8c` | Not Yet! | Trigger (not free) | Summoner Range | One ally |
| `summoner-1-8d` | Shield! | Trigger (not free) | Summoner Range | Self or one ally |

### Level 2 — 2 features

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 2 | `summoner-2-1` | `Perk` | `Perk` | yes | 1 | — | `lists: [Intrigue, Lore, Supernatural]` | one perk id |
| 2 | `summoner-2-2` | `Dominion` | `Text` | no | — | — | — | none. `text: VERIFY-AGAINST-PIN` — grants the Circle's Fixture and forward-refs level 5 / level 9 fixture features |

### Level 3 — 3 features

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 3 | `summoner-3-1` | `Summoner's Kit` | `PackageContent` | no | — | — | — | none. `tag: 'summoner-strike'` |
| 3 | `summoner-3-2` | `Ward` | `Choice` | yes | 1 | **`respite`** | 4 inline options, each `value: 1` | one option id, **re-selectable at respite** |
| 3 | `summoner-3-3` | `7pt Ability` (defaulted) | `ClassAbility` | yes | 1 | — | `cost: 7` | one ability id |

`summoner-3-2` **Ward** option list — this exact list recurs verbatim at levels 6 and 9:

| Option ID | Name | FeatureType | Payload |
|---|---|---|---|
| `summoner-3-2a` | Conjured Ward | `Bonus` | `field: Stamina, valuePerEchelon: 3` |
| `summoner-3-2b` | Emergency Ward | `Text` | `text: VERIFY-AGAINST-PIN` |
| `summoner-3-2c` | Howling Ward | `Text` | `text: VERIFY-AGAINST-PIN` |
| `summoner-3-2d` | Snare Ward | `Text` | `text: VERIFY-AGAINST-PIN` |

### Level 4 — 7 features

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 4 | `summoner-4-1` | `Reason` (defaulted) | `CharacteristicBonus` | no | — | — | — | none. `Reason +1` |
| 4 | `summoner-4-2` | `Choice` (defaulted — no name given) | `Choice` | yes | 1 | build | 4 `CharacteristicBonus` options, each `value: 1` | one option id |
| 4 | `summoner-4-3` | `Minion Improvement` | `PackageContent` | no | — | — | — | none. `tag: 'minions'`. Body contains a Stamina-increase table: `text: VERIFY-AGAINST-PIN` |
| 4 | `summoner-4-4` | `Essence Salvage` | `HeroicResourceGain` | no | — | — | — | none. `tag: 'minion-death 2'`, `value: '2'`, `OncePerRound`, `replacesTags: ['minion-death']` |
| 4 | `summoner-4-5` | `Minion Chain` | `Text` | no | — | — | — | `text: VERIFY-AGAINST-PIN` |
| 4 | `summoner-4-6` | `Perk` (defaulted) | `Perk` | yes | 1 | — | no `lists` given → factory substitutes **all six** perk lists | one perk id |
| 4 | `summoner-4-7` | `Skill` (defaulted) | `SkillChoice` | yes | 1 | build | no options → all five skill lists | one skill string |

`summoner-4-2` options: `summoner-4-2a` Might +1, `summoner-4-2b` Agility +1,
`summoner-4-2c` Intuition +1, `summoner-4-2d` Presence +1. (Reason is excluded —
it is granted unconditionally by `summoner-4-1`.)

### Level 5 — 0 class features

`featuresByLevel[4] = { level: 5, features: [] }`. The class grants nothing at
level 5. **The Circle does** (3 features each), and each Circle's Fixture gains
a level-5 feature. Do not render an empty level-5 step as "nothing happens".

### Level 6 — 6 features

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 6 | `summoner-6-1` | `Perk` | `Perk` | yes | 1 | — | `lists: [Intrigue, Lore, Supernatural]` | one perk id |
| 6 | `summoner-6-2` | `Return to the Source` | `Text` | no | — | — | — | `text: VERIFY-AGAINST-PIN` (contains a per-Circle manifold table) |
| 6 | `summoner-6-3` | (name defaulted → `Minion Machinations, Follower, Follower`) | `Multiple` | no | — | — | — | none; wraps 3 sub-features |
| 6 | `summoner-6-4a` | `Kit Improvement` | `Choice` | yes | 1 | build | **the same four Ward options, reusing ids `summoner-3-2a`–`3-2d`** | one option id |
| 6 | `summoner-6-4b` | `Kit Improvement` | `PackageContent` | no | — | — | — | `tag: 'summoner-strike'` |
| 6 | `summoner-6-5` | `9pt Ability` (defaulted) | `ClassAbility` | yes | 1 | — | `cost: 9` | one ability id |

`summoner-6-3` sub-features:

| Sub ID | Name | FeatureType | Payload |
|---|---|---|---|
| `summoner-6-3a` | Minion Machinations | `PackageContent` | `tag: 'minions'` |
| `summoner-6-3b` | `Follower` (defaulted) | `Follower` | `FollowerType.Artisan` |
| `summoner-6-3c` | `Follower` (defaulted) | `Follower` | `FollowerType.Sage` |

### Level 7 — 9 features

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 7 | `summoner-7-1a` | `Might` | `CharacteristicBonus` | no | — | — | — | `Might +1` |
| 7 | `summoner-7-1b` | `Agility` | `CharacteristicBonus` | no | — | — | — | `Agility +1` |
| 7 | `summoner-7-1c` | `Reason` | `CharacteristicBonus` | no | — | — | — | `Reason +1` |
| 7 | `summoner-7-1d` | `Intuition` | `CharacteristicBonus` | no | — | — | — | `Intuition +1` |
| 7 | `summoner-7-1e` | `Presence` | `CharacteristicBonus` | no | — | — | — | `Presence +1` |
| 7 | `summoner-7-2` | `Minion Improvement` | `PackageContent` | no | — | — | — | `tag: 'minions'`; body table `text: VERIFY-AGAINST-PIN` |
| 7 | `summoner-7-3` | `Font of Creation` | `HeroicResourceGain` | no | — | — | — | `tag: 'start 2'`, `value: '3'`, `OncePerRound`, `replacesTags: ['start']` |
| 7 | `summoner-7-4` | `Their Life for Mine` | `Text` | no | — | — | — | `text: VERIFY-AGAINST-PIN`; references eidos, which is not granted until level 10 |
| 7 | `summoner-7-5` | `Skill` (defaulted) | `SkillChoice` | yes | 1 | build | all five skill lists | one skill string |

Level 7 is five separate flat `CharacteristicBonus` features (+1 to all five),
**not** a choice — contrast levels 4 and 10, which are `Reason +1` plus a
one-of-four `Choice`.

### Level 8 — 2 features

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 8 | `summoner-8-1` | `Perk` (defaulted) | `Perk` | yes | 1 | — | no `lists` → all six perk lists | one perk id |
| 8 | `summoner-8-2` | `Portfolio Champion` | `Text` | no | — | — | — | `text: VERIFY-AGAINST-PIN`. Prose-only rules envelope; the **actual champion stat block arrives from the Circle** as `FeatureType.Summon` at subclass level 8 |

### Level 9 — 5 features

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 9 | `summoner-9-1a` | `Kit Improvement` | `PackageContent` | no | — | — | — | `tag: 'summoner-strike'` |
| 9 | **`summoner-10-1b`** | `Kit Improvement` | `Choice` | yes | 1 | build | the four Ward options again, ids `summoner-3-2a`–`3-2d` | one option id. **The id says 10; the feature sits at level 9** |
| 9 | `summoner-9-1c` | `Kit Improvement` | `RollModifier` | no | — | — | — | `modifier: DoubleEdge`, `rollType: Test` (defaulted), `skills: []`, `skillLists: []`, `characteristics: []`, `condition: <string>` |
| 9 | `summoner-9-2` | `Steward of Two Worlds` | `Text` | no | — | — | — | `text: VERIFY-AGAINST-PIN` |
| 9 | `summoner-9-3` | `11pt Ability` (defaulted) | `ClassAbility` | yes | 1 | — | `cost: 11` | one ability id |

### Level 10 — 8 features

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 10 | `summoner-10-1` | `Reason` | `CharacteristicBonus` | no | — | — | — | `Reason +1` |
| 10 | `summoner-10-2` | `Choice` (defaulted) | `Choice` | yes | 1 | build | 4 `CharacteristicBonus` options `summoner-10-2a`–`10-2d` (Might / Agility / Intuition / Presence) | one option id |
| 10 | `summoner-10-3` | `Minion Improvement` | `PackageContent` | no | — | — | — | `tag: 'minions'`; body table `text: VERIFY-AGAINST-PIN` |
| 10 | `summoner-10-4` | `Eidos` | `HeroicResource` | no | — | — | — | `type: 'epic'`; `gains: [ {tag:'respite', trigger:'Finish a respite', value:'XP gained', AtWill} ]`; `thresholds: []`; `details: ''` (prose was passed as `description`, not `details` — see Anomalies) |
| 10 | `summoner-10-5` | `No Matter the Cost` | `Text` | no | — | — | — | `text: VERIFY-AGAINST-PIN` |
| 10 | `summoner-10-6` | `Among our Ranks` | `Text` | no | — | — | — | `text: VERIFY-AGAINST-PIN` |
| 10 | `summoner-10-7` | `Perk` | `Perk` | yes | 1 | — | `lists: [Intrigue, Interpersonal, Supernatural]` | one perk id |
| 10 | `summoner-10-8` | `Skill` | `SkillChoice` | yes | 1 | build | all five skill lists | one skill string |

**Class totals:** 55 top-level features across levels 1–10; 21 class-level
choice points (see §Choice-point inventory).

---

## Subclasses

Four Circles. All share the same skeleton:

- `classID: ''` — **never backfilled** to `class-summoner` in the data
- `abilities: []` — no Circle contributes to the class ability pool
- `selected: false` — per-hero selection state carried on the definition
- `featuresByLevel` covers **all ten levels**, but levels 3, 4, 6, 7, 9 and 10
  are `features: []` in **every** Circle. Content lands at levels 1, 2, 5 and 8 only.

| Export | `id` | `name` |
|---|---|---|
| `circleOfBlight` | `summoner-sub-1` | Circle of Blight |
| `circleofStorms` | `summoner-sub-2` | Circle of Storms |
| `circleOfSpring` | `summoner-sub-3` | Circle of Spring |
| `circleOfGraves` | `summoner-sub-4` | Circle of Graves |

The `subclasses` array order in `summoner.ts` is Blight, Graves, Spring, Storms —
i.e. **id order and array order disagree**.

Each Circle's level-2 `Fixture` feature takes its **feature id from the fixture's
own id** (`FactoryFeatureLogic.createFixture` sets `id: data.fixture.id`) and its
name from `Fixture: ${fixture.name}`.

### Circle of Blight — `summoner-sub-1`

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 1 | `summoner-1-1-1` | Communication | `Text` | no | — | — | — | `text: VERIFY-AGAINST-PIN` |
| 1 | `summoner-1-1-2` | Soulsense | `Text` | no | — | — | — | `text: VERIFY-AGAINST-PIN` |
| 1 | `summoner-1-1-3` | Death Snap | `Text` | no | — | — | — | `text: VERIFY-AGAINST-PIN` |
| 1 | `summoner-1-1-4` | Signature Minion | `SummonChoice` | yes | **2** | — (no `selectAt` on this type) | 3 inline `Summon` options | array of 2 **deep-copied `Summon` objects** |
| 1 | `summoner-1-1-5` | 3-Essence Minion | `SummonChoice` | yes | **2** | — | 3 inline `Summon` options | array of 2 `Summon` |
| 2 | `summoner-1-fixture` | `Fixture: The Boil` | `Fixture` | no | — | — | — | none |
| 2 | `summoner-1-2-2` | 5-Essence Minion | `SummonChoice` | yes | **1 (defaulted)** | — | 3 inline `Summon` options | array of 1 `Summon` |
| 5 | `summoner-1-5-1` | Soul Flense | `Text` | no | — | — | — | `text: VERIFY-AGAINST-PIN` |
| 5 | `summoner-1-5-2` | Shaping | `Text` | no | — | — | — | `text: VERIFY-AGAINST-PIN` |
| 5 | `summoner-1-5-3` | 7-Essence Minion | `SummonChoice` | yes | **1 (defaulted)** | — | 3 inline `Summon` options | array of 1 `Summon` |
| 8 | `summoner-1-8-1` | Abyssal Evolution | `Text` | no | — | — | — | `text: VERIFY-AGAINST-PIN` |
| 8 | `summoner-1-8-2` | Portfolio Champion | **`Summon`** | **no** | — | — | fixed, 1 `Summon` | none — granted, not chosen |

Fixture **The Boil** (`summoner-1-fixture`): `role: TerrainRole(Support, Hazard)`,
`baseStamina: 20`, `size: 2`, `featuresByLevel` 1–10 with content at
**1** (`summoner-1-fixture-1-1` Hunger Thrush, `-1-2` Oh, It Pops),
**5** (`-5-1` Soul Rancor) and **9** (`-9-1` Size Increase → size 3, `-9-2` Fester Field).
Levels 2,3,4,6,7,8,10 empty. All fixture features are `Text`.

### Circle of Storms — `summoner-sub-2`

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 1 | `summoner-1-1-1` | Communication | `Text` | no | — | — | — | **id collides with Blight/Spring/Graves** |
| 1 | `summoner-2-1-2` | Heart of Nature | `Text` | no | — | — | — | `text: VERIFY-AGAINST-PIN` |
| 1 | `summoner-2-1-3` | Elemental Affinity | `Text` | no | — | — | — | `text: VERIFY-AGAINST-PIN` |
| 1 | `summoner-2-1-4` | Signature Minion: Elemental Mote | **`Summon`** | **no** | — | — | fixed, 1 `Summon` | none — granted |
| 1 | `summoner-2-1-5` | Signature Minion | `SummonChoice` | yes | **1 (defaulted)** | — | 3 inline `Summon` options | array of 1 `Summon` |
| 1 | `summoner-2-1-6` | 3-Essence Minion | `SummonChoice` | yes | **2** | — | 3 inline options | array of 2 |
| 2 | `summoner-2-fixture` | `Fixture: Primordial Crystal` | `Fixture` | no | — | — | — | none |
| 2 | `summoner-2-2-2` | 5-Essence Minion | `SummonChoice` | yes | 1 (defaulted) | — | 3 inline options | array of 1 |
| 5 | `summoner-2-5-1` | Nature Watch | `Text` | no | — | — | — | `text: VERIFY-AGAINST-PIN` |
| 5 | `summoner-2-5-2` | Split | `Text` | no | — | — | — | `text: VERIFY-AGAINST-PIN` |
| 5 | `summoner-2-5-3` | 7-Essence Minion | `SummonChoice` | yes | 1 (defaulted) | — | 3 inline options | array of 1 |
| 8 | `summoner-2-8-1` | Control the Elements | `Text` | no | — | — | — | `text: VERIFY-AGAINST-PIN` |
| 8 | `summoner-2-8-2` | Portfolio Champion | `Summon` | no | — | — | fixed, 1 `Summon` | none |

Storms is the **only** Circle that splits its signature tier into a fixed grant
plus a 1-of-3 choice; the other three offer a straight 2-of-3.

Fixture **Primordial Crystal** (`summoner-2-fixture`): `role: TerrainRole(Artillery, Relic)`,
`baseStamina: 20`, `size: 2`. Content at level **1** (`-1-1` Magnetic Pull, `-1-2` Elemental Boost),
**5** (`-5-1` Terra Resonance), **9** (`-9-1` Size Increase, `-9-2` Magnified Strike).

### Circle of Spring — `summoner-sub-3`

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 1 | `summoner-1-1-1` | Communication | `Text` | no | — | — | — | id collision |
| 1 | `summoner-3-1-2` | Fairy Whispers | `Text` | no | — | — | — | `text: VERIFY-AGAINST-PIN` |
| 1 | `summoner-3-1-3` | Pixie Dust | `Multiple` | no | — | — | — | wraps `summoner-3-1-3a` (`Bonus`, Recoveries +2) and `summoner-3-1-3b` (`Text`, "Pixie Dust") |
| 1 | `summoner-3-1-4` | Signature Minion | `SummonChoice` | yes | **2** | — | 3 inline options | array of 2 |
| 1 | `summoner-3-1-5` | 3-Essence Minion | `SummonChoice` | yes | **2** | — | 3 inline options | array of 2 |
| 2 | `summoner-3-fixture` | `Fixture: Glade Pond` | `Fixture` | no | — | — | — | none |
| 2 | `summoner-3-2-2` | 5-Essence Minion | `SummonChoice` | yes | 1 (defaulted) | — | 3 inline options | array of 1 |
| 5 | `summoner-3-5-1` | Flash Powder | `Text` | no | — | — | — | `text: VERIFY-AGAINST-PIN` |
| 5 | `summoner-3-5-2` | Pixie Lift | `Text` | no | — | — | — | `text: VERIFY-AGAINST-PIN` |
| 5 | `summoner-3-5-3` | 7-Essence Minion | `SummonChoice` | yes | 1 (defaulted) | — | 3 inline options | array of 1 |
| 8 | `summoner-3-8-1a` | `Recoveries` (defaulted) | `Bonus` | no | — | — | — | `field: Recoveries, value: 2` |
| 8 | `summoner-3-8-1b` | Celestial Grace | `Text` | no | — | — | — | `text: VERIFY-AGAINST-PIN` |
| 8 | `summoner-3-8-2` | Portfolio Champion | `Summon` | no | — | — | fixed, 1 `Summon` | none |

Spring is the only Circle whose level-8 package includes a numeric `Bonus`
outside a `Multiple`.

Fixture **Glade Pond** (`summoner-3-fixture`): `role: TerrainRole(Ambusher, Hazard)`,
`baseStamina: 20`, `size: 2`. Content at level **1** (`-1-1` Bubbling Boost, `-1-2` Overgrowth),
**5** (`-5-1` Garden of Jest), **9** (`-9-1` Size Increase, `-9-2` Folly Field).

### Circle of Graves — `summoner-sub-4`

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 1 | `summoner-1-1-1` | Communication | `Text` | no | — | — | — | id collision |
| 1 | `summoner-4-1-2` | Dead Men Tell All Tales | `Text` | no | — | — | — | `text: VERIFY-AGAINST-PIN` |
| 1 | `summoner-4-1-3` | Rise! | `Text` | no | — | — | — | `text: VERIFY-AGAINST-PIN` |
| 1 | `summoner-4-1-4` | Signature Minion | `SummonChoice` | yes | **2** | — | 3 inline options | array of 2 |
| 1 | `summoner-4-1-5` | 3-Essence Minion | `SummonChoice` | yes | **2** | — | 3 inline options | array of 2 |
| 2 | `summoner-4-fixture` | `Fixture: Barrow Gates` | `Fixture` | no | — | — | — | none |
| 2 | `summoner-4-2-2` | 5-Essence Minion | `SummonChoice` | yes | 1 (defaulted) | — | 3 inline options | array of 1 |
| 5 | `summoner-4-5-1` | Channel | `Text` | no | — | — | — | `text: VERIFY-AGAINST-PIN` |
| 5 | `summoner-4-5-2` | Dread March | `Text` | no | — | — | — | `text: VERIFY-AGAINST-PIN` |
| 5 | `summoner-4-5-3` | 7-Essence Minion | `SummonChoice` | yes | 1 (defaulted) | — | 3 inline options | array of 1 |
| 8 | `summoner-4-8-1` | Kill the Pain | `Text` | no | — | — | — | `text: VERIFY-AGAINST-PIN` |
| 8 | `summoner-4-8-2` | Portfolio Champion | `Summon` | no | — | — | fixed, 1 `Summon` | none |

Fixture **Barrow Gates** (`summoner-4-fixture`): `role: TerrainRole(Defender, Fortification)`,
`baseStamina: 20`, `size: 2`. Content at level **1** (`-1-1` The Bell Tolls, `-1-2` Undead Dominion),
**5** (`-5-1` Memento Mori), **9** (`-9-1` Size Increase, `-9-2` Open the Gates).

---

## The summon mechanism

This is the reason the Summoner is the largest class in the source, and the part
that will shape our schema. Three feature types plus two models.

### The three feature types

```
FeatureSummonData          { summons: Summon[] }                 // fixed grant
FeatureSummonChoiceData    { options: Summon[]; count: number;
                             selected: Summon[] }                // pick N of options
FeatureSummonFormationData { minionFeatures: Feature[] }         // global minion modifier
```

Factory defaults (`src/logic/factory-feature-logic.ts:708–744`):

| Builder | Default `name` | Default fields |
|---|---|---|
| `createSummon` | `'Summon Choice'` (**yes, "Choice" — mislabelled default for a non-choice**) | `summons` required |
| `createSummonChoice` | `'Summon Choice'` | `count: data.count ?? 1`, `selected: []` |
| `createSummonFormation` | `'Summon Formation'` | `minionFeatures: data.minionFeatures ?? []` |

`FeatureLogic.isChoice()` returns **true** for `SummonChoice` only.
`FeatureLogic.isChosen()` for `SummonChoice` is `selected.length >= count`.
`Summon` and `SummonFormation` are non-choices; a `SummonFormation` is only ever
reached as an *option inside* a `Choice` (the level-1 Formation feature).

### The `Summon` element

```
interface SummoningInfo {
  isSignature: boolean;
  cost: number;
  count: number;      // how many bodies one purchase puts on the map
  level: number;      // mirrored from the controlling hero's class level
  level3:  Feature[]; // features appended when info.level >= 3
  level6:  Feature[]; // appended when info.level >= 6
  level10: Feature[]; // appended when info.level >= 10
}
interface Summon extends Element {   // Element = { id, name, description }
  monster: Monster;                  // a full stat block
  info: SummoningInfo;
}
```

`FactoryLogic.createSummon` (`factory-logic.ts:588`) derives `id`, `name` and
`description` **from the monster**, defaults `isSignature: false`, `level: 1`,
and all three level arrays to `[]`.

**Across the entire Summoner tree, `level3` and `level6` are never populated and
`level10` is populated only on the four Portfolio Champions.** (The Beastheart
class is the heavy user of `level3`/`level6`/`level10`; the Summoner uses the
same substrate almost degenerately.) Do not design the tiered-upgrade slot away
— but do note the Summoner's minion scaling is delivered as *prose* in
`PackageContent` features tagged `minions` at levels 4, 7 and 10, not as
`level3/6/10` feature arrays.

### `SummonLogic.getSummonedMonster(summon, controller)` — the resolution pipeline

`src/logic/summon-logic.ts`. Given a `Summon` and the controlling hero, it
returns a **fully resolved copy** of the monster:

1. Deep-copy `summon.monster`.
2. Append `info.level3` / `level6` / `level10` features when `info.level` clears 3 / 6 / 10.
3. **If the monster's `role.organization === Minion`**, walk *every* feature on
   the controller with `type === SummonFormation` and append copies of its
   `minionFeatures`. This is how "Elite Formation" pushes Stamina +3 / Stability +1
   onto every minion the hero owns.
4. Walk the resolved monster's features and *bake in* controller-derived values:
   - `Ability` → run `AbilityLogic.getTextEffect(...)` over every section
     (`field.effect`, `roll.tier1/2/3`, `text.text`) — this is the substitution
     that turns `R` / `2 + R` / `M < [weak]` in minion ability text into the
     controller's numbers.
   - `Bonus` → if the modifier is controller-dependent
     (`valueFromController || valueCharacteristics.length > 0 || valuePerEchelon > 0 || valuePerLevel > 0`),
     compute a flat `value` and **null out** the dynamic fields.
   - `DamageModifier` → same collapse, per entry in `modifiers`.
   - `Text` → `getTextEffect` over `description`.
5. A Beastheart-only branch bumps `Companion`-organization characteristics at
   controller levels 4/7/10. Irrelevant to the Summoner (no Companion-org
   summons here) but it lives in the shared function.

**Consequence for us:** the summon stat block a player sees is a *projection*,
not stored data. It is a pure function of `(summon definition, controller
state)`. That is exactly the shape our engine wants — but Forge Steel also
persists a mutated copy (below), which is what we must not copy.

### `HeroLogic.getSummons(hero)` (`hero-logic.ts:1513`)

Flat-maps `FeatureType.Summon → data.summons` and
`FeatureType.SummonChoice → data.selected`, then for each: copies, forces
`info.level = hero.class?.level ?? 1`, and replaces `monster` with
`SummonLogic.getSummonedMonster(copy, hero)`.

Note it reads `data.selected` for choices — **unselected options never
materialise**. And it re-forces `info.level` even though `HeroLogic.setLevel`
already wrote `info.level` into both `options` and `selected` of every
`SummonChoice` (`hero-logic.ts:1513–1525`). The stored level is redundant.

### Selection semantics — what actually happens on pick

`ConfigSummonChoice` (`src/components/features/feature-data/summon-choice.tsx`):

- Renders one `SelectionBox` per already-selected summon, plus a
  "Choose a monster" button while `selected.length < count`.
- On pick: `Utils.copy(summon)` from `options`, set
  `summonCopy.info.level = hero.class?.level ?? 1`, push into `selected`.
  **The whole stat block is cloned into the hero.**
- Each selected summon then exposes a `ControlledMonsterCustomizePanel` allowing
  the player to (a) **rename** it — writing both `summon.name` and
  `summon.monster.name` — and (b) **overwrite arbitrary feature `data`** on the
  cloned monster, matched by feature id.
- Removal filters `selected` by `summon.id`.

`PregenLogic` (`pregen-logic.ts:180, 273`) is the only place a summon selection
is expressed **by id**: it serialises `selected.map(o => o.id)` and rehydrates
via `options.find(o => o.id === selectionID)` + `Utils.copy`. That round-trip
proves an id-keyed selection map is sufficient **as long as nobody customizes**.

`HeroUpdateLogic` (`hero-update-logic.ts:721–737`), when re-applying a class
definition to an existing hero, copies `data.summons` / `data.selected` across
**by reference, wholesale** — it does not re-derive them from the new option
list. A definition change therefore does not propagate into an existing hero's
already-picked summons.

`UpdateLogic` (`update-logic.ts:520–544`) is the migration shim: backfills
`info.level = 1` on every option and selection, and `minionFeatures = []` on
formations. Evidence that these fields were added after the fact.

### Full summon roster — structural inventory

53 distinct `Summon` records. Columns: `sig` = `info.isSignature`,
`cost`/`count` = `info.cost`/`info.count`, `org` = `monster.role.organization`,
`role` = `monster.role.type`, characteristics in M/A/R/I/P order
(`FactoryLogic.createCharacteristics(might, agility, reason, intuition, presence)`).
All monsters carry `level: 0`, `encounterValue: 0`, `withCaptain: ''`,
`retainer: null`, `picture: null`; `freeStrikeType` defaults to
`DamageType.Damage` (untyped) when not listed.

#### Circle of Blight

| Summon ID | Name | Tier / parent feature | sig | cost | count | org / role | keywords | size | speed | Stam | Stab | FS dmg / type | M/A/R/I/P | Monster features |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `summoner-1-1-4a` | Ensnarer | signature · `1-1-4` | ✔ | 1 | 1 | Minion / Brute | Abyssal, Demon | 1M | 5 | 2 | 0 | 2 / — | 2/0/−1/−1/−1 | `DamageModifier` (holy weakness 1); `Text` Extended Barbed Strike; `Text` Soulsight |
| `summoner-1-1-4b` | Rasquine | signature · `1-1-4` | ✔ | 1 | 1 | Minion / Ambusher | Abyssal, Demon | 1S | 4 teleport | 2 | 0 | 2 / — | −1/0/−1/−1/2 | `DamageModifier`; `Text` Skulker; `Text` Soulsight |
| `summoner-1-1-4c` | Razor | signature · `1-1-4` | ✔ | 1 | 1 | Minion / Harrier | Abyssal, Demon | 1M | 6 | 2 | 0 | 1 / — | 0/2/−1/−1/−1 | `DamageModifier`; `Text` Teeth!; `Text` Soulsight |
| `summoner-1-1-5a` | Archer Spittlich | 3-essence · `1-1-5` | — | 3 | 2 | Minion / Artillery | Abyssal, Demon | 1S | 5 | 5 | 2 | 5 / poison | 0/2/−1/−1/0 | `DamageModifier`; `Text` Splash Strike; `Text` Soulsight |
| `summoner-1-1-5b` | Fanged Musilex | 3-essence · `1-1-5` | — | 3 | 2 | Minion / Brute | Abyssal, Demon | 1L | 6 | 6 | 1 | 5 / — | 2/1/−1/−1/0 | `DamageModifier`; `Text` Mawful Strike; `Text` Soulsight |
| `summoner-1-1-5c` | Twisted Bengrul | 3-essence · `1-1-5` | — | 3 | 2 | Minion / Hexer | Abyssal, Demon | 1L | 5 | 5 | 1 | 4 / psychic | 2/1/−1/−1/0 | `DamageModifier`; **`Ability` Mind Twist** (Main; Magic/Ranged/Strike; Ranged 5; "One creature or object per minion"; cost `signature`); `Text` Soulsight |
| `summoner-1-2-2a` | Gushing Spewler | 5-essence · `1-2-2` | — | 5 | 3 | Minion / Controller | Abyssal, Demon | 1M | 5 | 4 | 0 | 3 / acid | −2/0/−1/3/3 | `DamageModifier`; 3× `Text` (Gushing Strike, Spew Slide, Soulsight) |
| `summoner-1-2-2b` | Hulking Chimor | 5-essence · `1-2-2` | — | 5 | 3 | Minion / Defender | Abyssal, Demon | 2 | 5 | 7 | 3 | 3 / — | 3/0/2/1/1 | `DamageModifier`; 3× `Text` (Mercurial Strike, Evershifting, Soulsight) |
| `summoner-1-2-2c` | Violent | 5-essence · `1-2-2` | — | 5 | 3 | Minion / Ambusher | Abyssal, Demon | 1M | 7 climb | 5 | 1 | 4 / corruption | 2/3/0/−1/−1 | `DamageModifier`; 3× `Text` (Transforming Strike, Mimicry, Soulsight) |
| `summoner-1-5-3a` | Faded Blightling | 7-essence · `1-5-3` | — | 7 | 2 | Minion / Support | Abyssal, Demon | 1L | 5 fly | 17 | 0 | 7 / corruption | 0/0/−1/4/3 | `DamageModifier`; **`Ability` Blighted Strike** (Main; Magic/Ranged/Strike; Ranged 5; per-minion target; `signature`); `Text` Wilted Wings; `Text` Soulsight |
| `summoner-1-5-3b` | Gorrre | 7-essence · `1-5-3` | — | 7 | 2 | Minion / Brute | Abyssal, Demon | 2 | 5 | 17 | 2 | 8 / — | 4/3/0/−1/0 | `DamageModifier`; 3× `Text` (Goring Strike, Devastating Charge, Soulsight) |
| `summoner-1-5-3c` | Vicisittante | 7-essence · `1-5-3` | — | 7 | 2 | Minion / Harrier | Abyssal, Demon | 2 | 10 | 17 | 0 | 7 / psychic | 3/4/0/0/−1 | `DamageModifier`; **`Ability` Cerebral Flay** (Main; Melee/Psionic/Strike; Melee 1; per-minion target; `signature`); `Text` Soulsight |
| `summoner-1-8-2a` | Demon Lord's Aspect | **champion** · `1-8-2` (`Summon`) | — | 9 | 1 | **Champion** / NoRole | Abyssal, Demon | 2 | 5 teleport | **0** | 2 | 9 / corruption | 2/5/5/2/2 | `Bonus` Stamina `valueFromController: Stamina`; `DamageModifier` corruption immunity 5; **`Ability` Grasping Appendages** (Main; Melee/Strike/Weapon; Melee 5; "Two creatures or objects"; `signature`; power roll `bonus: 5`); `Text` Warping Strike; `Text` Champion's Ire; **`Ability` I Like Your Taste** (free triggered; Self; **cost defaulted to 0**); `Text` Frenzy. **`level10`:** `Size` → 3; **`Ability` Flensing Reality** (`ChampionAction`; Burst 20; "Self and each non-minion ally in the area"; cost 1) |

#### Circle of Storms

| Summon ID | Name | Tier / parent feature | sig | cost | count | org / role | keywords | size | speed | Stam | Stab | FS dmg / type | M/A/R/I/P | Monster features |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `summoner-2-1-4a` | Elemental Mote | signature, **fixed** · `2-1-4` (`Summon`) | ✔ | 1 | 1 | Minion / Hexer | Elemental | 1T | 5 fly | 1 | 0 | 1 / — | 0/0/0/0/2 | `Text` Dweomer Burst; `Text` Catalyst |
| `summoner-2-1-5a` | Brisk Gale | signature · `2-1-5` | ✔ | 1 | 1 | Minion / Harrier | Elemental (air) | 1S | 5 fly | 2 | 0 | 1 / sonic | −2/2/0/0/1 | `Text` Cutting the Air; `Text` Whirlwind |
| `summoner-2-1-5b` | Fire Plume | signature · `2-1-5` | ✔ | 1 | 1 | Minion / Artillery | Elemental (fire) | 1T | 5 | 1 | 0 | 2 / fire | −2/2/0/0/2 | `Text` Spitfire Strike; `Text` Pyre |
| `summoner-2-1-5c` | Walking Boulder | signature · `2-1-5` | ✔ | 1 | 1 | Minion / Defender | Elemental (earth) | 2 | 4 climb | 3 | 0 | 1 / — | 2/−2/0/0/2 | `Bonus` Stability `valueCharacteristics: [Reason]`; `Text` Obstruct; `Text` Pile Up |
| `summoner-2-1-6a` | Crux of Ash | 3-essence · `2-1-6` | — | 3 | 2 | Minion / Ambusher | Elemental (fire, air) | 1M | 6 fly | 6 | 0 | 5 / — | −2/−2/0/0/1 | `DamageModifier` (sonic + fire immunity, `valueCharacteristics: [Reason]`); `Text` Soot Strike; **`Ability` Ashen Cloud** (cost 1; **no `type`** → `NoAction`; no keywords, no distance) |
| `summoner-2-1-6b` | Flow of Magma | 3-essence · `2-1-6` | — | 3 | 2 | Minion / Harrier | Elemental (fire, earth) | 1L | 5 climb | 6 | 2 | 4 / fire | 2/−2/0/0/1 | `DamageModifier` (fire imm.); **`Ability` Molten Strike** (Main; Magic/Melee/Strike; Melee 2; per-minion target; **cost defaulted to 0 — every sibling minion strike is `signature`**); **`Ability` Eruption** (cost 1; `NoAction`) |
| `summoner-2-1-6c` | Desolation of Sand | 3-essence · `2-1-6` | — | 3 | 2 | Minion / Hexer | Elemental (air, earth) | 1M | 5 burrow | 5 | 1 | 4 / — | 1/2/0/0/−2 | `DamageModifier` (sonic imm.); `Text` Burying Strike; `Text` Sand Through Your Fingers; **`Ability` Shifting Sand Pit** (cost 1; `NoAction`) |
| `summoner-2-2-2a` | Dancing Silk | 5-essence · `2-2-2` | — | 5 | 3 | Minion / Controller | Elemental (earth, air, green) | 1T | 5 fly | 4 | 0 | 3 / — | −1/2/3/0/−1 | `DamageModifier` (poison imm.); `Text` Entangling Strike; **`Ability` Web** (cost 1; `NoAction`) |
| `summoner-2-2-2b` | Principle of the Swamp | 5-essence · `2-2-2` | — | 5 | 3 | Minion / Brute | Elemental (green, water, rot) | 2 | 4 swim | 5 | 0 | 4 / — | 3/−2/0/2/−2 | `Bonus` Stability from Reason; `DamageModifier` (corruption + poison imm.); `Text` Encroaching Strike; **`Ability` Sludgefoot** (cost 1; `NoAction`) |
| `summoner-2-2-2c` | Quiet of Snow | 5-essence · `2-2-2` | — | 5 | 3 | Minion / Artillery | Elemental (air, rot, water) | 1S | 5 fly, hover | 4 | 1 | 4 / cold | −1/2/0/0/3 | `DamageModifier` (sonic + cold imm.); **`Ability` Freezing Strike** (Main; Magic/Ranged/Strike; Ranged 5; per-minion; `signature`); `Text` Cold Surge |
| `summoner-2-5-3a` | Iron Reaver | 7-essence · `2-5-3` | — | 7 | **3** | Minion / Harrier | Elemental (earth, fire, void) | 1L | 6 burrow | 10 | 0 | 6 / — | 3/4/0/0/−1 | `DamageModifier` (poison imm.); `Bonus` Stability from Reason; 2× `Text`; **`Ability` Iron Barricade** (cost 1; `NoAction`) |
| `summoner-2-5-3b` | Knight of Blood | 7-essence · `2-5-3` | — | 7 | 2 | Minion / Controller | Elemental (earth, fire, rot, water) | 1L | 6 | 16 | 0 | 7 / corruption | 4/2/0/0/3 | `DamageModifier` (corruption imm.); `Bonus` Stability from Reason; `Text` Scarlet Death; **`Ability` Red River** (**cost 2**; `NoAction`) |
| `summoner-2-5-3c` | Light of the Sun | 7-essence · `2-5-3` | — | 7 | 2 | Minion / Support | Elemental (air, green, fire, void) | 2 | 6 fly | 17 | 0 | 7 / fire | 0/2/4/0/3 | `DamageModifier` (corruption + fire imm.); **`Ability` Solar Blade** (Main; Magic/Melee/Strike; Melee 1; per-minion; `signature`); **`Ability` Radiant Field** (cost 2; `NoAction`) |
| `summoner-2-8-2a` | Dragon's Portent | **champion** · `2-8-2` (`Summon`) | — | 9 | 1 | **Champion** / NoRole | Dragon, Elemental | 2 | 6 fly | **0** | 4 | 9 / — | 2/2/5/5/2 | `Bonus` Stamina from controller Stamina; `Text` Affinity; **`Ability` Elemental Tail Swing** (Main; Charge/Melee/Strike/Weapon; Melee 2; "Two creatures or objects"; `signature`; `bonus: 5`); `Text` Sealing Strike; `Text` Champion's Ire; `Text` Searing Wyrmscale; `Text` Dragon Heart — **the last five all share id `summoner-2-8-2a-2`**. **`level10`:** `Size` → 3; **`Ability` A Breath Felt in a Hurricane ** (`ChampionAction`; Area/Magic/Ranged; Cube 10 within 4; cost 1) |

#### Circle of Spring

| Summon ID | Name | Tier / parent feature | sig | cost | count | org / role | keywords | size | speed | Stam | Stab | FS dmg / type | M/A/R/I/P | Monster features |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `summoner-3-1-4a` | Nixie Soakreed | signature · `3-1-4` | ✔ | 1 | 1 | Minion / Controller | Fey | 1T | 5 swim | 1 | 0 | 1 / — | −2/−2/0/2/1 | 3× `Text` (Water Weird, Soaking Bog, Minuscule) |
| `summoner-3-1-4b` | Pixie Bellringer | signature · `3-1-4` | ✔ | 1 | 1 | Minion / Support | **`[]` — no keywords** | 1T | 5 fly, hover | 2 | 0 | 1 / — | −3/1/0/0/2 | 3× `Text` (Ringing Strike, Fairy Chime, Minuscule) |
| `summoner-3-1-4c` | Sprite Dandeknight | signature · `3-1-4` | ✔ | 1 | 1 | Minion / Harrier | **`[]` — no keywords** | 1T | 5 | 1 | 0 | 1 / — | 2/0/−1/−1/−1 | 3× `Text` (Magic Strike, Staccato Swings, Minuscule) |
| `summoner-3-1-5a` | Pixie Hydrain | 3-essence · `3-1-5` | — | 3 | 2 | Minion / Artillery | Fey | 1T | 5 | 5 | 0 | 5 / acid | −3/0/1/0/2 | `DamageModifier` (acid imm. from Reason); **`Ability` Burning / Healing Rain** (Main; Magic/Ranged/Strike; Ranged 5; per-minion; `signature`); `Text` Minuscule |
| `summoner-3-1-5b` | Pixie Loftlilly | 3-essence · `3-1-5` | — | 3 | 2 | Minion / Controller | Fey | 1T | 5 fly, hover | 5 | 0 | 4 / poison | −2/1/0/0/2 | `DamageModifier` (poison imm.); `Text` Floating Toxins; `Text` Minuscule |
| `summoner-3-1-5c` | Sprite Orchiguard | 3-essence · `3-1-5` | — | 3 | 2 | Minion / Defender | Fey | 1S | 6 fly | 8 | 2 | 4 / — | 2/0/−1/1/1 | `Text` Fairy Guard; `Text` Minuscule |
| `summoner-3-2-2a` | Nixie Hemloche | 5-essence · `3-2-2` | — | 5 | 3 | Minion / Hexer | Fey | 1T | 6 swim | 4 | 0 | 3 / lightning | −2/0/1/3/2 | 3× `Text` (Water Weird, Whirling Waves, Minuscule) |
| `summoner-3-2-2b` | Sprite Foxglow | 5-essence · `3-2-2` | — | 5 | 3 | Minion / Ambusher | Fey | 1T | 8 fly | 5 | 0 | 4 / fire | −1/3/0/1/2 | `DamageModifier` (fire imm.); 3× `Text` (Flash Strike, Quiet Flight, Minuscule) |
| `summoner-3-2-2c` | Pixie Rosenthall | 5-essence · `3-2-2` | — | 5 | 3 | Minion / Harrier | Fey | **2** | 6 fly, hover | 5 | 1 | 3 / — | 0/2/4/0/3 | **`Ability` Stickerbush Symphony** (Main; Melee/Strike/Weapon; Melee 2; per-minion; `signature`); `Text` Swarm |
| `summoner-3-5-3a` | Nixie Corallia | 7-essence · `3-5-3` | — | 7 | 2 | Minion / Support | Fey | 1T | 6 swim | 17 | 0 | 7 / lightning | −2/3/3/4/1 | `DamageModifier` (lightning imm.); 3× `Text` (Water Weird, Seafoam Pool, Minuscule) |
| `summoner-3-5-3b` | Pixie Belladonix | 7-essence · `3-5-3` | — | 7 | 2 | Minion / Artillery | Fey | 1T | 6 fly, hover | 16 | 0 | 8 / poison | −2/2/4/0/4 | `DamageModifier` (poison imm.); **`Ability` A Thorn, Woe to the Pricked ** (Main; Magic/Ranged/Strike; **Ranged 15**; per-minion; `signature`); `Text` Minuscule |
| `summoner-3-5-3c` | Sprite Olyender | 7-essence · `3-5-3` | — | 7 | 2 | Minion / Brute | Fey | 1T | 6 fly | 17 | 0 | 8 / — | 4/3/0/1/2 | `Bonus` Stability from Reason; 3× `Text` (Warrior's Toss, Use Their Might, Minuscule) |
| `summoner-3-8-2a` | Celestial Attendant | **champion** · `3-8-2` (`Summon`) | — | 9 | 1 | **Champion** / NoRole | Fey | 2 | 7 fly, hover | **0** | 0 | 9 / poison | 2/2/5/2/5 | `Bonus` Stamina from controller Stamina; `DamageModifier` untyped immunity 2; **`Ability` Pixie Swarm** (Main; Magic/Ranged/Strike; Ranged 10; "Two creatures or objects"; `signature`; `bonus: 5`); `Text` Neurotoxic Strike; `Text` Champion's Ire; **`Ability` Celestial Bell** (free triggered; Self; cost 0); `Text` Pixie Bouquet. **`level10`:** `Size` → 3; **`Ability` A Shower of Dust ** (`ChampionAction`; Burst 20; cost 1) |

#### Circle of Graves

| Summon ID | Name | Tier / parent feature | sig | cost | count | org / role | keywords | size | speed | Stam | Stab | FS dmg / type | M/A/R/I/P | Monster features |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `summoner-4-1-4a` | Husk | signature · `4-1-4` | ✔ | 1 | 1 | Minion / Defender | Undead | 1M | 5 | 3 | 1 | 1 / corruption | 2/−2/0/0/−2 | `DamageModifier` (**flat untyped immunity 2** + corruption & poison immunity from Reason); `Text` Rotting Strike |
| `summoner-4-1-4b` | Shrieker | signature · `4-1-4` | ✔ | 1 | 1 | Minion / Artillery | Undead | 1M | 4 | 1 | 0 | 2 / sonic | −2/−2/0/0/2 | `DamageModifier`; `Text` Howling Strike; `Text` Shrill Alarm |
| `summoner-4-1-4c` | Skeleton | signature · `4-1-4` | ✔ | 1 | 1 | Minion / Harrier | Undead | 1M | 6 | 2 | 0 | 1 / — | −2/2/0/0/−2 | `DamageModifier`; `Text` Bonetrops |
| `summoner-4-1-5a` | Grave Knight | 3-essence · `4-1-5` | — | 3 | 2 | Minion / Brute | Undead | 1M | 6 | 6 | 1 | 5 / — | 2/1/0/0/1 | `DamageModifier`; **`Ability` Knight Strike** (Main; Melee/Strike/Weapon; Melee 1; per-minion; `signature`); `Text` To the Grave |
| `summoner-4-1-5b` | Stalker Shade | 3-essence · `4-1-5` | — | 3 | 2 | Minion / Ambusher | Undead | 1M | 5 fly, hover | 6 | 1 | 5 / corruption | −2/1/0/0/2 | `DamageModifier`; `Text` Shadow Strike; `Text` Shadow Phasing |
| `summoner-4-1-5c` | Zombie Lumberer | 3-essence · `4-1-5` | — | 3 | 2 | Minion / Defender | Undead | 2 | 5 | 8 | 0 | 1 / — | 2/−2/0/0/1 | `Bonus` Stability from Reason; `DamageModifier`; `Text` Zombie Clutch; `Text` Death Grasp |
| `summoner-4-2-2a` | Assursed Mummy | 5-essence · `4-2-2` | — | 5 | 3 | Minion / Hexer | Mummy, Undead | 1M | 5 | 4 | 2 | 3 / poison | 2/−1/1/3/−1 | `DamageModifier`; **`Ability` Fetid Bindings** (Main; Melee/Strike/Weapon; distance `Special('Melee R')`; **`target` omitted → `''`**; `signature`); `Text` Mummy Dust |
| `summoner-4-2-2b` | Ceaseless Mournling | 5-essence · `4-2-2` | — | 5 | 3 | Minion / Controller | Undead | 2 | 5 burrow | 4 | 0 | 3 / sonic | 3/2/−1/1/−2 | `DamageModifier`; `Bonus` Stability from Reason; 3× `Text` (Always Crying, Immutable Form, Rupture) |
| `summoner-4-2-2c` | Phase Ghoul | 5-essence · `4-2-2` | — | 5 | 3 | Minion / Harrier | Undead | 1M | 5 teleport | 5 | 0 | 3 / — | 2/3/−2/0/1 | `DamageModifier`; `Text` Leaping Strike; `Text` Nerveless |
| `summoner-4-5-3a` | False Vampire | 7-essence · `4-5-3` | — | 7 | 2 | Minion / Brute | Undead | 1L | 6 climb | 17 | 2 | 8 / acid | 4/1/3/0/0 | `DamageModifier`; `Text` Proboscis Strike; `Text` Bloodthirsty |
| `summoner-4-5-3b` | Phantom of the Ripper | 7-essence · `4-5-3` | — | 7 | 2 | Minion / Ambusher | Undead | 1M | 6 fly, hover | 17 | 1 | 8 / — | 0/4/0/0/3 | `DamageModifier`; **`Ability` Plunge of the Knife** (Main; Melee/Strike/Weapon; Melee 1; per-minion; `signature`); `Text` Ripping Phase |
| `summoner-4-5-3c` | Zombie Titan | 7-essence · `4-5-3` | — | 7 | **1** | Minion / Defender | Undead | **4** | 4 | **40** | 0 | 7 / — | 4/3/0/2/3 | `Bonus` Stability from Reason; `DamageModifier`; 3× `Text` (Big Stomp, Overwhelming Size, Flesh to Mountains) |
| `summoner-4-8-2a` | Avatar of Death | **champion** · `4-8-2` (`Summon`) | — | 9 | 1 | **Champion** / NoRole | Undead | 2 | 6 fly | **0** | 3 | 9 / holy | 5/2/5/2/2 | `Bonus` Stamina from controller Stamina; `DamageModifier` corruption imm. 5 + poison imm. 5; **`Ability` Culling Scythe** (Main; Melee/Strike/Weapon; Melee 2; "Two creatures or objects"; `signature`; `bonus: 5`); `Text` Revelation Strike; `Text` Champion's Ire; **`Ability` Dust and Rot** (free triggered; Area; Burst 1; **cost `signature` on a triggered action**); **`Text` with `name: ''`** (id `summoner-4-8-2a-7`). **`level10`:** `Size` → 3; **`Ability` Gravemaker** (`ChampionAction`; Area/Magic/Ranged; Line 5 × 3 within 1; cost 1) |

#### Roster shape summary

| Circle | signature pool | 3-essence pool | 5-essence pool | 7-essence pool | champion | total |
|---|---|---|---|---|---|---|
| Blight | 3 (pick 2) | 3 (pick 2) | 3 (pick 1) | 3 (pick 1) | 1 (fixed) | 13 |
| Storms | 1 fixed + 3 (pick 1) | 3 (pick 2) | 3 (pick 1) | 3 (pick 1) | 1 (fixed) | 14 |
| Spring | 3 (pick 2) | 3 (pick 2) | 3 (pick 1) | 3 (pick 1) | 1 (fixed) | 13 |
| Graves | 3 (pick 2) | 3 (pick 2) | 3 (pick 1) | 3 (pick 1) | 1 (fixed) | 13 |
| **Total** | | | | | | **53** |

`info.count` per tier is uniform per Circle with three exceptions:
`summoner-4-5-3c` Zombie Titan (7-essence, count **1**),
`summoner-2-5-3a` Iron Reaver (7-essence, count **3**),
and the champions (count 1).

---

## Abilities

The class ability pool (`summoner.abilities`, 18 entries). Structural only.
`Distance` uses the `AbilityDistance` shape; `Summoner Range` is
`AbilityDistanceType.Summoner` with all numeric fields 0 — a **symbolic**
distance the engine must resolve, not a literal.

| ID | Name | Cost | Keywords | Action type | Distance | Target |
|---|---|---|---|---|---|---|
| `summoner-ability-1` | Essence Transfer | 5 | Magic, Melee, Strike | Main | Melee 1 | One creature |
| `summoner-ability-2` | Explosive Parade | 5 | Magic, Ranged | Main | Summoner Range | Special |
| `summoner-ability-3` | Distraction Tactics | 5 | Magic | Maneuver (`free: true`) | Self | Special |
| `summoner-ability-4` | Rally Cry | 5 | Magic, Ranged | Maneuver | Burst 3 | All allies |
| `summoner-ability-5` | Summoner's Cradle | 5 | Magic, Ranged | Maneuver | Summoner Range | Special |
| `summoner-ability-6` | Summoner's Sword | 5 | Magic, Melee, Strike | Main | Melee 3 | One creature or object |
| `summoner-ability-7` | Blitz Tactics | 7 | Magic | Maneuver (`free: true`) | Self | Special |
| `summoner-ability-8` | Cavalry Call | 7 | Magic | Main | Summoner Range | Special |
| `summoner-ability-9` | Essence Funnel | 7 | Area, Magic | Main | Line 10 × 1 within 1 | All enemies and objects |
| `summoner-ability-10` | Lead by Example | 7 | Magic, Melee, Ranged, Strike | Main | Melee 1 **+** Summoner Range (two entries) | One enemy or object |
| `summoner-ability-11` | A Champion's Cry | 9 | Area, **Champion**, Magic | Main | Burst 3 | All enemies |
| `summoner-ability-12` | Army's Idol | 9 | Area, **Champion**, Magic | Maneuver | Burst 3 | Self and all allies |
| `summoner-ability-13` | The Champion Slams the Earth | 9 | Area, **Champion**, Magic, Weapon | Main | Cube 4 within 1 | All enemies and objects |
| `summoner-ability-14` | Their Pall Shrouds All | 9 | Area, **Champion**, Magic | Maneuver | Burst 4 | All enemies |
| `summoner-ability-15` | 1,000,000 Minions | 11 | Magic | Main | `Special('Special')` | Special |
| `summoner-ability-16` | Bodyguard Tactics | 11 | Area, Magic | Main | Burst 5 | Self and each non-minion ally |
| `summoner-ability-17` | I Unsummon Thee | 11 | Area, Magic | Main | Burst 3 | All enemies |
| `summoner-ability-18` | Wrath of a Champion | 11 | Area, **Champion**, Magic, Weapon | Main | Burst 4 | All enemies |

Cost distribution: 6 × 5-cost, 4 × 7-cost, 4 × 9-cost, 4 × 11-cost.
Selection budget: exactly **one** per band (`summoner-1-9` cost 5,
`summoner-3-3` cost 7, `summoner-6-5` cost 9, `summoner-9-3` cost 11) — four
picks total, each `count: 1`.

**No `ClassAbility` choice with `cost: 'signature'` exists.** The Summoner's
signature ability, `Summoner Strike` (`summoner-1-3`), is a flat `Ability`
feature granted at level 1. This differs from most classes and must not be
modelled as an empty signature slot.

Granted (non-pool) abilities, all `FeatureType.Ability`:

| ID | Name | Cost | Keywords | Action type | Distance | Target |
|---|---|---|---|---|---|---|
| `summoner-1-3` | Summoner Strike | 0 | Magic, Melee, Ranged, Strike | Main (`freeStrike: true`, qualifier "can be used as a free strike") | Melee 1 + Ranged 5 | One creature or object |
| `summoner-1-4` | Strike For Me | 0 | Magic, Ranged | Trigger (`free: true`) | Summoner Range | Each of your minions |
| `summoner-1-5` | Call Forth | 1 (`repeatable: true`) | Magic, Ranged | Main | Summoner Range | Self |
| `summoner-1-6` | Minion Bridge | 0 | Magic | Maneuver | Melee 1 | One of your minions |
| `summoner-1-8a` | Focus Fire! | 0 | — | Trigger | Summoner Range | Self or one ally |
| `summoner-1-8b` | Halt! | 0 | — | Trigger | Summoner Range | One creature |
| `summoner-1-8c` | Not Yet! | 0 | — | Trigger | Summoner Range | One ally |
| `summoner-1-8d` | Shield! | 0 | — | Trigger | Summoner Range | Self or one ally |

`summoner-1-3` also carries an `AbilitySectionPackage { tag: 'summoner-strike' }`
— the render-time join point for the three `PackageContent` features tagged
`summoner-strike` (levels 3, 6, 9) that upgrade its damage, potency and distance.
Same mechanism, different tag: `summoner-1-2` is a `Package` with tag `minions`,
joined by `PackageContent` at levels 4, 6, 7 and 10.

---

## Choice-point inventory

In build order. "Cardinality" = how many distinct selections the player commits.

### Prerequisite (outside the class)

| # | Decision | Cardinality | Notes |
|---|---|---|---|
| 0 | Enable the `summoner` sourcebook | 1 toggle | gates the class from the class list |

### Level 1 — 8 decisions

| # | Feature ID | Decision | Cardinality | Options | Notes |
|---|---|---|---|---|---|
| 1 | `class.subclasses` | Choose a **Circle** | 1 of 4 | Blight / Storms / Spring / Graves | `subclassCount: 1`. **Must resolve before the summon choices exist** |
| 2 | `summoner-1-1` | Skills | 2 | any skill (all 5 lists) | ships pre-filled with `Magic`, `Strategy` |
| 3 | `summoner-1-1c` | Skills | 2 | Intrigue + Lore lists | |
| 4 | `summoner-1-7` | Formation | 1 of 4 | Horde / Platoon / Elite / Leader | Leader option also grants Light weapon + Light armor proficiency. **Elite mutates every summon** |
| 5 | `summoner-1-8` | Tactic Call | 1 of 4 | Focus Fire! / Halt! / Not Yet! / Shield! | each grants a triggered ability |
| 6 | `summoner-1-9` | 5-cost class ability | 1 of 6 | the 6 five-cost pool abilities | |
| 7 | *(subclass)* signature minions | **2 of 3** (Storms: **1 of 3**, plus a fixed grant) | Circle-specific | see roster |
| 8 | *(subclass)* 3-essence minions | 2 of 3 | Circle-specific | |

### Level 2 — 2 decisions

| # | Feature ID | Decision | Cardinality | Options |
|---|---|---|---|---|
| 9 | `summoner-2-1` | Perk | 1 | Intrigue / Lore / Supernatural lists |
| 10 | *(subclass)* 5-essence minions | 1 of 3 | Circle-specific |

### Level 3 — 2 decisions

| # | Feature ID | Decision | Cardinality | Options | Notes |
|---|---|---|---|---|---|
| 11 | `summoner-3-2` | Ward | 1 of 4 | Conjured / Emergency / Howling / Snare | **`selectAt: 'respite'`** — re-decidable in play |
| 12 | `summoner-3-3` | 7-cost class ability | 1 of 4 | | |

### Level 4 — 3 decisions

| # | Feature ID | Decision | Cardinality | Options |
|---|---|---|---|---|
| 13 | `summoner-4-2` | Characteristic +1 | 1 of 4 | Might / Agility / Intuition / Presence |
| 14 | `summoner-4-6` | Perk | 1 | all six lists |
| 15 | `summoner-4-7` | Skill | 1 | all five lists |

### Level 5 — 1 decision

| # | Feature ID | Decision | Cardinality | Options |
|---|---|---|---|---|
| 16 | *(subclass)* 7-essence minions | 1 of 3 | Circle-specific |

(Zero class-level decisions at level 5.)

### Level 6 — 3 decisions

| # | Feature ID | Decision | Cardinality | Notes |
|---|---|---|---|---|
| 17 | `summoner-6-4a` | Second Ward | 1 of 4 | **same option ids as level 3** — must be constrained "not already taken", but the source carries no such constraint |
| 18 | `summoner-6-5` | 9-cost class ability | 1 of 4 | four of these carry the `Champion` keyword and reference a champion the hero does not have until level 8 |
| 19 | `summoner-6-1` | Perk | 1 | Intrigue / Lore / Supernatural |

### Level 7 — 1 decision

| # | Feature ID | Decision | Cardinality |
|---|---|---|---|
| 20 | `summoner-7-5` | Skill | 1 |

### Level 8 — 1 decision

| # | Feature ID | Decision | Cardinality | Notes |
|---|---|---|---|---|
| 21 | `summoner-8-1` | Perk | 1 | all six lists. The Portfolio Champion itself is **granted, not chosen** |

### Level 9 — 2 decisions

| # | Feature ID | Decision | Cardinality | Notes |
|---|---|---|---|---|
| 22 | `summoner-10-1b` | Third Ward | 1 of 4 | id says 10, feature sits at level 9; same four option ids again |
| 23 | `summoner-9-3` | 11-cost class ability | 1 of 4 | |

### Level 10 — 3 decisions

| # | Feature ID | Decision | Cardinality |
|---|---|---|---|
| 24 | `summoner-10-2` | Characteristic +1 | 1 of 4 |
| 25 | `summoner-10-7` | Perk | 1 (Intrigue / Interpersonal / Supernatural) |
| 26 | `summoner-10-8` | Skill | 1 |

**Totals:** 26 decision points from level 1 to 10 (1 subclass, 6 summon
selections, 4 class-ability picks, 5 perks, 5 skill choices, 3 Wards, 2
characteristic choices, 1 Formation, 1 Tactic Call, minus overlap — recount by
row: 26 rows above, of which 6 are summon selections and 1 is the Circle).
Of these, exactly **one** (`summoner-3-2`, Ward) is `selectAt: 'respite'`; every
other `selectAt`-bearing feature is `'build'`. No Summoner feature uses
`selectAt: 'play'`.

Plus per-summon **customization** (rename + arbitrary feature-data overwrite) on
each of the 6–7 selected summons — an unbounded free-text/nested-edit surface,
not a choice point in the enumerable sense. See Convex notes.

---

## UI surface

Ordered list of controls the builder renders for this class. Control kinds:
single-select, multi-select-N, searchable list, nested sub-choice, toggle, free text.

| Order | Control | Kind | Bound to | Notes |
|---|---|---|---|---|
| 1 | Sourcebook toggles | toggle (multi) | `hero.sourcebookIDs` | must include `summoner` |
| 2 | Class picker | searchable list | `hero.class` | Summoner shows a `Master Class` tag |
| 3 | Primary characteristic | **suppressed** | `primaryCharacteristics` | `primaryCharacteristicsOptions` has one group of one → auto-assign Reason, render read-only |
| 4 | **Circle** picker | single-select (4 cards) | `subclasses[].selected` | must be first; everything below depends on it |
| 5 | Skills (`summoner-1-1`) | multi-select-2, searchable | `SkillChoice.selected` | pre-populated with Magic + Strategy; UI must show them as *changeable* or as *fixed* — the source is ambiguous |
| 6 | Intrigue / Lore skills (`summoner-1-1c`) | multi-select-2, searchable | `SkillChoice.selected` | filtered to two lists |
| 7 | Minions (`summoner-1-2`) | read-only expander | `Package` | large rules body; renders joined with its `PackageContent` at 4/6/7/10 |
| 8 | Summoner Strike / Strike For Me / Call Forth / Minion Bridge | read-only ability cards | `Ability` features | Summoner Strike renders its `summoner-strike` package join |
| 9 | **Formation** (`summoner-1-7`) | single-select, 4 cards | `Choice.selected` | one option is a `Multiple`; card must render both sub-features |
| 10 | **Tactic Call** (`summoner-1-8`) | single-select, 4 ability cards | `Choice.selected` | |
| 11 | **5-cost ability** (`summoner-1-9`) | single-select, filtered list | `ClassAbility.selectedIDs` | filter = pool where `cost === 5`, honouring `source.*` flags |
| 12 | **Signature Minions** | multi-select-N over **stat-block cards** + per-pick drawer | `SummonChoice.selected` | N = 2 (Storms: 1). Each option card = a full `MonsterPanel`. See below |
| 13 | **3-Essence Minions** | multi-select-2, same control | `SummonChoice.selected` | |
| 14 | Perk (L2) | single-select, searchable, list-filtered | `Perk.selected` | |
| 15 | Dominion (L2) | read-only text | `Text` | |
| 16 | **Fixture** (L2, subclass) | read-only expander with level-banded features | `Fixture` | show fixture features gated at fixture-levels 1/5/9 |
| 17 | **5-Essence Minions** (L2) | single-select over stat-block cards | `SummonChoice.selected` | |
| 18 | Summoner's Kit (L3) | read-only | `PackageContent` | |
| 19 | **Ward** (L3) | single-select, 4 cards | `Choice.selected` | **must also be reachable from a respite screen**, not only the builder |
| 20 | 7-cost ability (L3) | single-select, filtered | `ClassAbility.selectedIDs` | |
| 21 | Reason +1 (L4) | read-only | `CharacteristicBonus` | |
| 22 | Characteristic +1 (L4) | single-select, 4 chips | `Choice.selected` | |
| 23 | Minion Improvement (L4) | read-only | `PackageContent` | contains a table |
| 24 | Perk (L4) | single-select, searchable | `Perk.selected` | all six lists |
| 25 | Skill (L4) | single-select, searchable | `SkillChoice.selected` | all five lists |
| 26 | **7-Essence Minions** (L5, subclass) | single-select over stat-block cards | `SummonChoice.selected` | the only level-5 control |
| 27 | Perk (L6) | single-select | `Perk.selected` | |
| 28 | Kit Improvement / second Ward (L6) | single-select, 4 cards | `Choice.selected` | duplicate option ids — needs a disambiguating key |
| 29 | 9-cost ability (L6) | single-select, filtered | `ClassAbility.selectedIDs` | |
| 30 | Skill (L7) | single-select, searchable | `SkillChoice.selected` | |
| 31 | Perk (L8) | single-select, searchable | `Perk.selected` | |
| 32 | **Portfolio Champion** (L8) | read-only stat-block card | `Summon` | granted; card must show the `level10` upgrade as a preview/gated section |
| 33 | Kit Improvement / third Ward (L9) | single-select, 4 cards | `Choice.selected` | |
| 34 | 11-cost ability (L9) | single-select, filtered | `ClassAbility.selectedIDs` | |
| 35 | Characteristic +1 (L10) | single-select, 4 chips | `Choice.selected` | |
| 36 | Eidos (L10) | read-only resource card | `HeroicResource` (`type: 'epic'`) | second resource track alongside Essence |
| 37 | Perk (L10) | single-select | `Perk.selected` | |
| 38 | Skill (L10) | single-select, searchable | `SkillChoice.selected` | |

### The summon-picker control (the hard one)

Forge Steel's `ConfigSummonChoice` is:

- a list of `SelectionBox`es for current picks, each with a **remove** action and
  a **customize** drawer;
- a `Choose a monster` button, visible while `selected.length < count`, opening a
  drawer (`SummonSelectModal`) listing `options` as full stat blocks;
- a second drawer showing the **resolved** monster
  (`SummonLogic.getSummonedMonster(selected, hero)`) — i.e. the preview is the
  projection, not the stored copy.

The customize drawer (`ControlledMonsterCustomizePanel`) exposes:

- `onChangeName` → writes **both** `summon.name` and `summon.monster.name`;
- `onChangeFeature(featureID, data)` → replaces the `data` payload of any feature
  on the cloned monster, matched by feature id.

For our builder the equivalent is: **searchable list of stat-block cards →
multi-select-N → per-selection nested sub-choice (customization)**. The
customization layer is the piece to scope explicitly; it is the only place in
this class where the player can produce data that is not expressible as an id.

---

## Convex data model notes

### Definition data (seeded, versioned by source)

- `classes` — one row: `class-summoner`. Fields per §Identity. Source id `summoner`.
- `classFeatures` — 55 rows for the class + 4 × 12–13 rows for the Circles,
  keyed `(sourceId, classId, subclassId|null, level, featureId)`.
  Feature payloads are a discriminated union over `FeatureType`.
- `featureOptions` — the option lists for `Choice` / `SummonChoice`. **Must be a
  separate table**, because the Ward list is referenced by three different
  `Choice` features and Forge Steel expresses that by literal duplication.
- `summons` — **53 rows**, one per `Summon`. Shape:
  `{ summonId, sourceId, circleId, tier, isSignature, cost, count,
     monster: <stat block>, level3: Feature[], level6: Feature[], level10: Feature[] }`.
  The `monster` sub-document is itself a nested tree (`Monster.features: Feature[]`,
  each feature possibly an `Ability` with `sections[]`). This is the deepest
  nesting in the whole builder: **class → subclass → feature → summon → monster →
  feature → ability → section → power roll**. Eight levels.
- `summonChoiceMembership` — join rows `(featureId → summonId)`, replacing
  Forge Steel's inline `options: Summon[]`.
- `fixtures` — 4 rows, each with `featuresByLevel` (levels 1–10, content at 1/5/9).

### Selection state (per hero, sparse, id-keyed)

Target shape:

```
heroSelections: {
  heroId,
  featureId,          // e.g. 'summoner-1-1-4'
  kind,               // mirrors FeatureType
  selectedIds: string[],   // option ids / skill strings / ability ids / summon ids
  selectedAt: 'build' | 'respite',
  revision: number    // for respite-rechosen features
}
```

`PregenLogic` proves this is sufficient for **every** Summoner choice type:
`SkillChoice` → strings, `Choice` → option ids, `ClassAbility` → ability ids,
`Perk` → perk ids, `SummonChoice` → `selected.map(o => o.id)`.

### Where the split is hard

1. **Summon selection stores a mutated clone, not an id.**
   `ConfigSummonChoice` deep-copies the whole `Summon` (stat block included) into
   `selected`, and then lets the player rename it and overwrite arbitrary feature
   `data` on the clone. An id-only selection map **cannot** round-trip that.
   Resolution: keep `selectedIds: string[]` as the primary selection, and add a
   sibling **sparse override document** keyed `(heroId, summonId, path)` holding
   only the deltas the player actually made (`name`, and per-`featureId` data
   patches). Absent an override, the summon resolves purely from the definition.
   Forge Steel has no such separation and consequently cannot ever re-derive a
   customized summon from an updated definition (`HeroUpdateLogic` copies
   `selected` across wholesale).

2. **`SummonFormation` mutates other features.**
   `summoner-1-7c` (Elite Formation) carries `minionFeatures: [Bonus Stamina +3,
   Bonus Stability +1]`, and `SummonLogic` applies those to **every** minion the
   hero controls — including summons chosen from a *different* feature at a
   *different* level and from a *different* Circle. A selection at level 1
   silently rewrites the resolved stat block of a summon chosen at level 5.
   This is a cross-feature effect, not a self-contained choice.
   Resolution: resolve summons through a pure function
   `resolveSummon(summonDef, heroSelections, heroDerivedState)` and never persist
   the resolved block. Formation participation is a *query over the hero's
   selections*, exactly as `SummonLogic` does — but ours must be deterministic and
   memoised, not a mutation of a copy.

3. **Controller-derived numbers are baked in at resolve time.**
   `Bonus`/`DamageModifier` on a summon may carry `valueFromController`,
   `valueCharacteristics`, `valuePerEchelon`, `valuePerLevel`. Champions use
   `Bonus { field: Stamina, valueFromController: Stamina }` with a base
   `stamina: 0` — **the champion's Stamina is entirely the controller's Stamina**.
   Resolution must therefore take the hero's *fully derived* stats as input, and
   the resolved summon must be recomputed whenever those change. Do not denormalise
   a summon's Stamina into a stored field.

4. **Ability prose carries unresolved variables.**
   Minion ability tiers read `R`, `2 + R`, `M < [weak]`, and
   `AbilityLogic.getTextEffect(text, controller)` substitutes against the
   controller. Our engine already has a text-effect substitution seam; note that
   for summons it is parameterised by the **controller**, not by the acting
   creature. `Fetid Bindings` even puts a variable in the *distance*
   (`Special('Melee R')`) rather than in a numeric field — that one cannot be
   resolved structurally at all.

5. **`selectAt: 'respite'` on the Ward (`summoner-3-2`).**
   One feature in the class is re-decided between encounters. A sparse selection
   map keyed by `featureId` alone will overwrite history. Add `revision` (or an
   `effectiveFrom` respite counter) so the current value is queryable and the
   change is auditable. Note also that the level-6 and level-9 Ward re-picks are
   `selectAt: 'build'` while the level-3 one is `'respite'` — a hero ends up with
   one mutable Ward and two fixed ones, all drawn from the same four options.

6. **Duplicate option ids across three features.**
   `summoner-3-2a`–`3-2d` appear as options under `summoner-3-2` (L3),
   `summoner-6-4a` (L6) and `summoner-10-1b` (L9). A selection map keyed on
   *option id* alone is ambiguous; key on `(featureId, optionId)`. And the
   three features must exclude each other's picks — a constraint the source does
   not encode.

7. **Duplicate feature ids across subclasses.**
   All four Circles define a level-1 `Text` feature with id `summoner-1-1-1`
   ("Communication"). Since only one Circle is ever selected the collision is
   latent in Forge Steel, but a global `classFeatures` table keyed on `featureId`
   will collide on seed. Key on `(sourceId, classId, subclassId, featureId)`.

8. **Duplicate feature ids *within* one monster.**
   `summoner-2-8-2a` (Dragon's Portent) has **five** features sharing id
   `summoner-2-8-2a-2`. `ConfigSummonChoice.onChangeFeature` matches by id and
   uses `forEach` — a single customization would write to all five. Any
   id-addressed override system must therefore either de-duplicate on seed or
   address by array index.

9. **Selection state living on definition objects.**
   `HeroClass.level`, `HeroClass.characteristics`, `SubClass.selected`,
   `FeatureSkillChoice.selected` (pre-seeded with Magic/Strategy),
   `Summon.info.level`, and `Monster.state` are all per-hero state that Forge
   Steel stores on the shared definition because it deep-copies the class into
   the hero. Every one of these must be stripped from our seeded definitions.
   `Summon.info.level` in particular is written by `HeroLogic.setLevel` into both
   `options` **and** `selected`, then overwritten again by `getSummons` — pure
   redundancy; ours should read the hero's class level at resolve time.

10. **The Package/PackageContent join.**
    `summoner-1-2` (`Package`, tag `minions`) is joined at render time by
    `PackageContent` features at levels 4, 6, 7 and 10; `summoner-1-3`'s
    `AbilitySectionPackage` (tag `summoner-strike`) is joined by `PackageContent`
    at levels 3, 6 and 9. This is a **tag-based, level-accumulating** composition,
    not a choice. Model tags as first-class so a level-up recomposes the rendered
    body without touching selection state.

11. **`HeroOverview.background`** is a display concatenation in the source; there
    is no "background" in Draw Steel. It does not appear anywhere in the Summoner
    tree — noted only so it is not mistaken for a Summoner field.

---

## Anomalies & open questions

Ordered roughly by risk to our implementation.

1. **Summon selection is a deep clone with an open customization surface.**
   The single largest divergence from an id-keyed selection model. Forge Steel
   clones the entire monster stat block into the hero on pick and then lets the
   player rewrite its name and any feature's `data`. Anything we build must
   decide, explicitly, whether to support customization at all; if yes, it needs
   a sparse override document (see Convex notes #1). Forge Steel's own
   `PregenLogic` uses id-only round-tripping, which silently drops customization.

2. **`SummonFormation` is a cross-feature mutator with no declared scope.**
   A level-1 choice rewrites the stat block of summons chosen at levels 1, 2 and
   5. `SummonLogic` gathers **all** `SummonFormation` features on the controller
   — including ones nested inside a `Multiple` inside a `Choice` option — and
   appends their `minionFeatures` to any `Minion`-organization summon. Only one
   of the four Formation options actually carries `minionFeatures`; the other
   three are prose-only, so three of four Formation picks have *zero* mechanical
   effect in the data model and would need engine work.

3. **Feature id `summoner-10-1b` sits at level 9.** Almost certainly a
   copy-paste slip in the source. A seeder that trusts ids to encode level will
   place this Ward choice at level 10.

4. **Four Circles, one shared level-1 feature id (`summoner-1-1-1`).**
   Blight, Storms, Spring and Graves each define a different "Communication"
   `Text` feature under the same id. Latent in Forge Steel (one Circle at a
   time); a hard collision for a global seed table.

5. **Five features share id `summoner-2-8-2a-2`** inside the Dragon's Portent
   stat block (Affinity, Sealing Strike, Champion's Ire, Searing Wyrmscale,
   Dragon Heart). Also `summoner-4-8-2a-7` (Avatar of Death) has `name: ''`.

6. **The `summoner-1-1` skill choice ships pre-selected.**
   `createSkillChoice({ id: 'summoner-1-1', count: 2, selected: ['Magic','Strategy'] })`
   with no `options`/`listOptions`, so the factory opens it to **all five skill
   lists**. Open question: is this "you get Magic and Strategy" (fixed grant,
   modelled as a choice) or "here are suggested defaults, change them"? The data
   cannot distinguish. `FeatureLogic.isChosen` returns true immediately either
   way, so the builder would never flag it. **Must be resolved against the pin
   before we render it as editable.**

7. **Class abilities with the `Champion` keyword are selectable two levels
   before the champion exists.** `summoner-6-5` picks a 9-cost ability at level 6;
   four of the four 9-cost abilities are `Champion`-keyworded (`summoner-ability-11`
   … `-14`), and `summoner-8-2` Portfolio Champion arrives at level 8. Every
   9-cost option is therefore inert for two levels. Likely intentional in the
   rulebook, but the builder should surface it rather than let a player pick
   blind. Same again at level 9 (`summoner-9-3`, cost 11) where
   `summoner-ability-18` is Champion-keyworded.

8. **`Molten Strike` (`summoner-2-1-6b-2`) omits `cost`, defaulting to 0.**
   Every other minion signature strike in the corpus passes `cost: 'signature'`.
   Likely a transcription slip. Similarly `Dust and Rot` (`summoner-4-8-2a-6`)
   carries `cost: 'signature'` on a **free triggered action**, and
   `I Like Your Taste` / `Celestial Bell` (the Blight and Spring champion
   triggered actions) carry no cost at all → 0.

9. **`Fetid Bindings` (`summoner-4-2-2a-2`) omits `target`** (→ `''`) and encodes
   its distance as `Special('Melee R')` — a variable inside a free-text distance
   field. Structurally unresolvable; needs the pin.

10. **Two Spring signature minions have empty `keywords`.**
    `Pixie Bellringer` (`summoner-3-1-4b`) and `Sprite Dandeknight`
    (`summoner-3-1-4c`) have `keywords: []` while every other Spring summon has
    `['Fey']`. Several Spring features key off "fey minions". Almost certainly a
    transcription omission; verify against the pin before implementing any
    keyword-gated Spring feature.

11. **Champions are structurally orphaned in Forge Steel's own sheet builder.**
    `CreatureLogic.isSummon` requires `role.organization === Minion`; champions
    are `Champion`. `buildFollowerCompanionSheet` handles `Follower`, `Retainer`,
    `Companion` and `SummonChoice`-of-`Companion` — but **not** `FeatureType.Summon`.
    Result: a champion (a `Summon` feature holding a `Champion`-organization
    monster) appears in neither `sheet.summons` nor `sheet.followers`. Whether
    this is a live bug or handled elsewhere in the UI was not resolved from the
    source. Our sheet must handle the Champion organization explicitly.

12. **Champion base `stamina: 0` is not a typo** — it is intentional, paired with
    `Bonus { field: Stamina, valueFromController: Stamina }`. Any validation that
    rejects a 0-Stamina creature will reject all four champions.

13. **`FactoryFeatureLogic.createSummon`'s default name is `'Summon Choice'`** —
    the same default as `createSummonChoice`, on a feature type that is *not* a
    choice. Harmless here (every Summoner `Summon` feature passes an explicit
    name) but a trap when authoring.

14. **`level3` and `level6` are dead in this class.** Only `level10` is used, and
    only on the four champions (`Size` → 3 plus one `ChampionAction` ability
    costing 1 of the epic resource). The Summoner's minion scaling arrives instead
    as prose tables inside `PackageContent` features at levels 4, 7 and 10 — i.e.
    **the numbers that scale a minion's Stamina are not in the data model at all**.
    This is the single biggest gap for an engine that wants to compute a summon's
    current Stamina. Flagged as needing the pin plus a modelling decision.

15. **`summoner-10-4` (Eidos) passes its prose as `description`, not `details`**,
    the opposite of `summoner-resource` (Essence), which passes `details` and no
    `description`. Two resource features in the same class populate different
    fields with the same kind of content. Renderers that read only one will drop
    half.

16. **`SubClass.classID` is `''` for all four Circles** — never backfilled to
    `class-summoner`. A join on `classID` finds nothing.

17. **Subclass id order and array order disagree.** Array order in `summoner.ts`
    is Blight (`sub-1`), Graves (`sub-4`), Spring (`sub-3`), Storms (`sub-2`).
    Whichever we pick for display, pick deliberately.

18. **The class has no `FeatureType.Kit` anywhere.** "Summoner's Kit" is a
    `PackageContent` (`summoner-3-1`) that upgrades the Summoner Strike ability
    via the `summoner-strike` tag — it is not a Kit in the mechanical sense. Any
    builder step that assumes "every class picks a kit" must skip the Summoner.
    Whether `type: 'master'` is *supposed* to mean "no kit" is not encoded
    anywhere in the source — `'master'` drives only a display tag.

19. **Three Ward choices, four options, no exclusion constraint.** Levels 3, 6
    and 9 each pick 1 of the same 4. Nothing in the data prevents picking
    Conjured Ward three times. Needs the pin.

20. **`AbilityDistanceType.Summoner` ("Summoner Range") is a symbolic distance**
    with `value: 0`. It appears on 8 class-level abilities and on all four Tactic
    Call options. Our distance model needs a symbolic variant, not just numbers.

21. **Storms' signature tier is shaped differently from the other three Circles**
    (1 fixed grant + 1-of-3, vs. 2-of-3). Any UI that assumes "signature minions =
    multi-select-2" will render Storms wrong.

22. **`info.count` outliers.** `summoner-4-5-3c` Zombie Titan is a 7-essence
    summon with `count: 1`, size 4 and Stamina 40 — the only size-4 summon and by
    far the largest single stat block. `summoner-2-5-3a` Iron Reaver is the only
    7-essence summon with `count: 3`. Verify both against the pin; they read like
    deliberate design, but they break the otherwise-uniform per-tier count.
