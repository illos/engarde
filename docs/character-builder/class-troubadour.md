> **Provenance — read before implementing.**
> Structure in this file is mapped from **Forge Steel**
> (github.com/andyaiken/forgesteel, GPL-3.0), commit `01672c1`, read 2026-08-29.
> Forge Steel is an independent third-party transcription of Draw Steel and is
> **not** our canon source. Every name, number, count and option list below is
> **UNVERIFIED** and must be confirmed against the pinned SteelCompendium
> corpus (DEC-0008) before it is implemented or shown to a user.
> This file is a **structural map for UI and data-model design**, not a rules source.

# Class: Troubadour — structural map

Source files (read-only):
`.reference/forgesteel/src/data/classes/troubadour/troubadour.ts` (970 lines),
`auteur.ts` (304), `duelist.ts` (312), `virtuoso.ts` (396).

**Scale of this class:** 113 feature records (54 class incl. nested options,
18 Auteur, 18 Duelist, 23 Virtuoso), 62 distinct abilities, 27 player decisions
across levels 1–10 for one subclass path.

---

## Identity

| Field | Value | Notes |
|---|---|---|
| `id` | `class-troubadour` | Stable definition key. |
| `name` | `Troubadour` | |
| `description` | prose | `text: VERIFY-AGAINST-PIN` — flavor + an attributed in-world quotation. Not transcribed here. |
| `type` | `'standard'` | vs `'master'`. Only affects nothing in the data itself; consumed by UI/validation elsewhere. |
| `subclassName` | `Class Act` | The class's own word for its subclass axis. UI label, not an id. |
| `subclassCount` | `1` | Exactly one Class Act is selected. |
| `primaryCharacteristicsOptions` | `[[ Agility, Presence ]]` | **One** option array ⇒ no player choice; `hero-edit-page.tsx:268` auto-assigns `primaryCharacteristics` when `.length === 1`. |
| `primaryCharacteristics` | `[]` in the definition | Hero-state field living on the definition object; filled to `[Agility, Presence]` on class assignment. |
| `featuresByLevel` | 10 entries, levels 1–10 | See *Level progression*. |
| `abilities` | 24 `Ability` records | The class-ability **pool** (not granted; drawn from by `ClassAbility` choices). |
| `subclasses` | `[auteur, duelist, virtuoso]` | Each `SubClass.classID` is `''` — **not** back-populated to `class-troubadour`. |
| `level` | `1` | Hero-state field on the definition object. |
| `characteristics` | `[]` | Hero-state field on the definition object (the 5 characteristic values). |

**Derived stats granted at level 1 (as `Bonus` features, not identity fields):**
Stamina `18 + 6/level`, Recoveries `8`. Forge Steel's generic
`FactoryLogic.createClass()` default is `18 + 9/level` / `8` — Troubadour
overrides the per-level Stamina to 6.

**Characteristic array choice** (`HeroLogic.getCharacteristicArrays(2)`, because
Troubadour has 2 primaries): the player picks one of `[2,-1,-1]`, `[1,0,0]`,
`[1,1,-1]` and then an assignment permutation of it across the three
non-primary characteristics; the two primaries are fixed at `2`.

---

## Level progression

Legend for **Choice?** — `no` = granted automatically; `yes` = a persisted player
selection. `count`/`selectAt` are the **resolved** values after the
`FactoryLogic.feature.create*` defaults are applied (not what the call site
literally passes).

### Class features (all Class Acts)

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 1 | `troubadour-1` | Stamina | `Bonus` | no | — | — | — | none. `field: Stamina`, `value: 18`, `valuePerLevel: 6`, `valuePerEchelon: 0`, `valueCharacteristics: []`, `valueCharacteristicMultiplier: 1`, `valueFromController: null` |
| 1 | `troubadour-2` | Recoveries | `Bonus` | no | — | — | — | none. `field: Recoveries`, `value: 8`, all other modifier fields default |
| 1 | `troubadour-3` | Skill | `SkillChoice` | **yes** | 1 | build | `options: []`, `listOptions: [Crafting, Exploration, Interpersonal, Intrigue, Lore]` (defaulted because both were empty) | `string[]` of skill names. **Ships pre-seeded `selected: ['Read Person']`** and is fully re-choosable — see *Anomalies* §1 |
| 1 | `troubadour-4` | Interpersonal Skills | `SkillChoice` | **yes** | 2 | build | `listOptions: [Interpersonal]` | `string[]`, length 2 |
| 1 | `troubadour-5` | Intrigue / Lore Skill | `SkillChoice` | **yes** | 1 | build | `listOptions: [Intrigue, Lore]` | `string[]`, length 1 |
| 1 | `troubadour-6` | Drama | `HeroicResource` | no | — | — | — | none at build. `type: 'heroic'`, `canBeNegative: false`, `thresholds: []`, `value: 0`, `details: VERIFY-AGAINST-PIN` (a dead-troubadour drama/revival clause). 5 `gains` — table below |
| 1 | `troubadour-7` | Kit | `Kit` | **yes** | 1 | build (no `selectAt` on this type) | `types: ['']` (defaulted) ⇒ kits whose `Kit.type === ''`, i.e. the standard kit list; excludes kits the hero already has | `Kit[]` — Forge Steel stores the **whole deep-copied kit**; we store a kit id |
| 1 | `troubadour-8` | Scene Partner | `Text` | no | — | — | — | none. `text: VERIFY-AGAINST-PIN`. Introduces a runtime "bonds" counter capped at hero level — no data field models it |
| 1 | `troubadour-9` | Routines | `Text` | no | — | — | — | none. `text: VERIFY-AGAINST-PIN`. Defines the **Performance** keyword loop — see *Anomalies* §4 |
| 1 | `troubadour-10` | Choreography | `Ability` | no | — | — | — | none. Granted performance. Feature id **is** the ability id |
| 1 | `troubadour-11` | Revitalizing Limerick | `Ability` | no | — | — | — | none. Granted performance |
| 1 | `troubadour-12` | Signature Ability | `ClassAbility` | **yes** | 1 | build | `troubadour.abilities` filtered `cost === 'signature'` && `minLevel <= 1`, minus abilities already held | `selectedIDs: string[]` (ability ids) |
| 1 | `troubadour-13` | 3pt Ability | `ClassAbility` | **yes** | 1 | build | same pool filtered `cost === 3` | `selectedIDs: string[]` |
| 1 | `troubadour-14` | 5pt Ability | `ClassAbility` | **yes** | 1 | build | same pool filtered `cost === 5` | `selectedIDs: string[]` |
| 2 | `troubadour-15` | Appeal to the Muses | `Text` | no | — | — | — | none. `text: VERIFY-AGAINST-PIN`. Modifies the `start` drama gain at play time; not modeled as data |
| 2 | `troubadour-16` | Invocation | `Choice` | **yes** | 1 (points) | build | 3 inline options, each `value: 1` — see nested table | `selected: Feature[]` — Forge Steel stores deep copies of the chosen option features |
| 2 | `troubadour-20` | Interpersonal / Lore / Supernatural Perk | `Perk` | **yes** | 1 | — | perks whose `list ∈ [Interpersonal, Lore, Supernatural]`, minus perks already selected by any other `Perk` feature | `Perk[]` (we store perk ids) |
| 3 | `troubadour-21` | 7pt Ability | `ClassAbility` | **yes** | 1 | build | pool filtered `cost === 7` | `selectedIDs: string[]` |
| 4 | `troubadour-22` | Agility | `CharacteristicBonus` | no | — | — | — | none. `characteristic: Agility`, `value: 1` |
| 4 | `troubadour-23` | Presence | `CharacteristicBonus` | no | — | — | — | none. `characteristic: Presence`, `value: 1` |
| 4 | `troubadour-24` | Melodrama | `Choice` | **yes** | **2** (points) | build | 6 inline options, each `value: 1` — see nested table | `selected: Feature[]`, 2 entries |
| 4 | `troubadour-31` | Perk | `Perk` | **yes** | 1 | — | `lists` defaulted to all six: `[Crafting, Exploration, Interpersonal, Intrigue, Lore, Supernatural]` (`Special` excluded) | `Perk[]` |
| 4 | `troubadour-32` | Skill | `SkillChoice` | **yes** | 1 | build | `listOptions: [Crafting, Exploration, Interpersonal, Intrigue, Lore]` written explicitly | `string[]` |
| 4 | `troubadour-33` | Zeitgeist | `Text` | no | — | — | — | none. `text: VERIFY-AGAINST-PIN`. Body is markdown containing a **3-row tier-band table** and three `###` sub-headings — a respite-time choice of 3 effects that is **not** modeled as a `Choice`. See *Anomalies* §5 |
| 5 | `troubadour-34` | 9pt Ability | `ClassAbility` | **yes** | 1 | build | pool filtered `cost === 9` | `selectedIDs: string[]` |
| 6 | `troubadour-35` | Interpersonal / Lore / Supernatural Perk | `Perk` | **yes** | 1 | — | `[Interpersonal, Lore, Supernatural]` | `Perk[]` |
| 6 | `troubadour-36` | Spotlight | `Ability` | no | — | — | — | none. Granted performance |
| 7 | `troubadour-37` | Might | `CharacteristicBonus` | no | — | — | — | `value: 1` |
| 7 | `troubadour-38` | Agility | `CharacteristicBonus` | no | — | — | — | `value: 1` |
| 7 | `troubadour-39` | Reason | `CharacteristicBonus` | no | — | — | — | `value: 1` |
| 7 | `troubadour-40` | Intuition | `CharacteristicBonus` | no | — | — | — | `value: 1` |
| 7 | `troubadour-41` | Presence | `CharacteristicBonus` | no | — | — | — | `value: 1` |
| 7 | `troubadour-42` | Equal Billing | `Text` | no | — | — | — | none. `text: VERIFY-AGAINST-PIN`. Extends Scene Partner bonds to heroes |
| 7 | `troubadour-43` | A Muse’s Muse | `HeroicResourceGain` | no | — | — | — | none. `tag: 'start 2'`, `trigger: VERIFY-AGAINST-PIN`, `value: '1d3 + 1'`, `frequency: Per Round`, **`replacesTags: ['start']`** — supersedes the level-1 `start` gain |
| 7 | `troubadour-44` | Skill | `SkillChoice` | **yes** | 1 | build | all five lists, written explicitly | `string[]` |
| 8 | `troubadour-45` | Perk | `Perk` | **yes** | 1 | — | all six lists (defaulted) | `Perk[]` |
| 8 | `troubadour-46` | 11pt Ability | `ClassAbility` | **yes** | 1 | build | pool filtered `cost === 11` | `selectedIDs: string[]` |
| 9 | `troubadour-47` | Roar of the Crowd | `Text` | no | — | — | — | none. `text: VERIFY-AGAINST-PIN` |
| 10 | `troubadour-48` | Applause | `HeroicResource` | no | — | — | — | none. **`type: 'epic'`** — a *second* resource alongside Drama. One gain: `tag: 'respite'`, `value: 'XP gained'` (a **non-numeric string**), `frequency: At Will` |
| 10 | `troubadour-49` | Agility | `CharacteristicBonus` | no | — | — | — | `value: 1` |
| 10 | `troubadour-50` | Presence | `CharacteristicBonus` | no | — | — | — | `value: 1` |
| 10 | `troubadour-51` | Dramaturgy | `Text` | no | — | — | — | none. `text: VERIFY-AGAINST-PIN`. Removes the distance from every Performance ability — a **retroactive mutation of already-granted ability records**, expressed only as prose |
| 10 | `troubadour-52` | Greatest of All Time | `Text` | no | — | — | — | none. `text: VERIFY-AGAINST-PIN` |
| 10 | `troubadour-53` | Interpersonal / Lore / Supernatural Perk | `Perk` | **yes** | 1 | — | `[Interpersonal, Lore, Supernatural]` | `Perk[]` |
| 10 | `troubadour-54` | Skill | `SkillChoice` | **yes** | 1 | build | all five lists | `string[]` |

**Level totals (class only):** L1 14 · L2 3 · L3 1 · L4 6 · L5 1 · L6 2 · L7 8 ·
L8 2 · L9 1 · L10 7 = **45 top-level features**, plus 9 nested option features
= 54.

#### `troubadour-6` "Drama" — `gains` array (5 entries, `ResourceGain[]`)

| tag | trigger | value | frequency | `used` |
|---|---|---|---|---|
| `start` | `VERIFY-AGAINST-PIN` (start of your turn) | `1d3` | Per Round | `false` |
| `hero-ability` | `VERIFY-AGAINST-PIN` | `2` | Per Encounter | `false` |
| `hero-winded` | `VERIFY-AGAINST-PIN` | `2` | Per Encounter | `false` |
| `crit` | `VERIFY-AGAINST-PIN` | `3` | At Will | `false` |
| `die` | `VERIFY-AGAINST-PIN` | `10` | At Will | `false` |

`value` is a **dice/number expression string**, not an integer (`'1d3'`,
`'1d3 + 1'`, `'XP gained'`). `used` is per-hero runtime state stored inside the
definition object — see *Convex data model notes*.

#### `troubadour-16` "Invocation" — options (count 1, each `value: 1`)

| Option ID | Name | FeatureType | Notes |
|---|---|---|---|
| `troubadour-17` | Allow Me to Introduce Tonight’s Players | `Ability` | Main action, `keywords: []`, `distance: [Self]`, `target: 'Self'`, `cost: 0`, one text section |
| `troubadour-18` | Formal Introductions | `Text` | `text: VERIFY-AGAINST-PIN`. A **respite activity** with a "one notice active at a time" cap — no data field |
| `troubadour-19` | My Reputation Precedes Me | `Text` | `text: VERIFY-AGAINST-PIN`. Interacts with Scene Partner's bond cap |

#### `troubadour-24` "Melodrama" — options (count 2 points, each `value: 1`)

| Option ID | Name | FeatureType | tag | value | frequency |
|---|---|---|---|---|---|
| `troubadour-25` | Melodrama #1 | `HeroicResourceGain` | `crit-fail` | `2` | At Will |
| `troubadour-26` | Melodrama #2 | `HeroicResourceGain` | `villain-malice` | `2` | Per Encounter |
| `troubadour-27` | Melodrama #3 | `HeroicResourceGain` | `falls` | `2` | Per Encounter |
| `troubadour-28` | Melodrama #4 | `HeroicResourceGain` | `surges` | `2` | Per Encounter |
| `troubadour-29` | Melodrama #5 | `HeroicResourceGain` | `last-recovery` | `2` | At Will |
| `troubadour-30` | Melodrama Alternative | `Text` | — | — | — |

All six carry `replacesTags: []`. Each option's `trigger` string is
`VERIFY-AGAINST-PIN`. `troubadour-30` is a **choice-shaped option modeled as
inert text** — see *Anomalies* §2.

---

## Subclasses

`subclassName: 'Class Act'`, `subclassCount: 1`. All three subclasses have
`abilities: []` — every subclass ability is a `FeatureAbility` inside
`featuresByLevel`, which means **none of them is reachable from a `ClassAbility`
picker** (see *Anomalies* §3). All three have `classID: ''` and
`selected: false` in the definition.

### Auteur — `troubadour-auteur`

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 1 | `troubadour-auteur-1` | Skill | `SkillChoice` | **yes** | 1 | build | all five lists (defaulted) | `string[]`; pre-seeded `selected: ['Brag']` |
| 1 | `troubadour-auteur-2` | Blocking | `Ability` | no | — | — | — | Granted performance. No action, Aura 2, `target: 'Each creature in the area'` |
| 1 | `troubadour-auteur-3` | Dramatic Monologue | `Ability` | no | — | — | — | Maneuver, Ranged 10, `target: 'Special'`, `cost: 0`; body is a **3-way in-play pick** written as prose bullets + a `Spend 1` field |
| 1 | `troubadour-auteur-4` | Turnabout Is Fair Play | `Ability` | no | — | — | — | Triggered action; `trigger: VERIFY-AGAINST-PIN`; Ranged 10; `cost: 0`; `Spend 3` field |
| 2 | `troubadour-auteur-5` | 2nd-Level Class Act Ability | `Choice` | **yes** | 1 | build | 2 inline `Ability` options, `value: 1` each | `Feature[]` |
| 2 | ↳ `troubadour-auteur-6` | Guest Star | `Ability` (option) | — | — | — | — | Main, `keywords: [Magic, Ranged]` but `distance: [Melee 1]` — see *Anomalies* §7. `target: 'Special'`, `cost: 5` |
| 2 | ↳ `troubadour-auteur-7` | Twist at the End | `Ability` (option) | — | — | — | — | Main, Magic/Ranged, Ranged 10, `target: 'One dead enemy'`, `cost: 5` |
| 3 | `troubadour-auteur-8` | Missed Cue | `Text` | no | — | — | — | `text: VERIFY-AGAINST-PIN`. Carries a **3-Victories recharge** with no data field |
| 4 | — | — | — | — | — | — | — | **No features at level 4** (`features: []`) |
| 5 | `troubadour-auteur-9` | 5th-Level Class Act Feature | `Choice` | **yes** | 1 | build | 2 inline options | `Feature[]` |
| 5 | ↳ `troubadour-auteur-10` | Fix It in Post | `Text` (option) | — | — | — | — | References `Dramatic Monologue`'s distance by **ability name in prose** |
| 5 | ↳ `troubadour-auteur-11` | Take Two! | `Ability` (option) | — | — | — | — | No action, Area/Magic/Performance, Aura 5, `cost: 0` — an additional **performance** |
| 6 | `troubadour-auteur-12` | 6th-Level Class Act Ability | `Choice` | **yes** | 1 | build | 2 inline options | `Feature[]` |
| 6 | ↳ `troubadour-auteur-13` | Here’s How Your Story Ends | `Ability` (option) | — | — | — | — | Main, Area/Magic, Burst 5, `cost: 9` |
| 6 | ↳ `troubadour-auteur-14` | You’re All My Understudies | `Ability` (option) | — | — | — | — | Maneuver, Area/Magic, Burst 5, `target: 'Each ally in the area'`, `cost: 9`. Reads the hero's **equipped kit** bonuses |
| 7 | — | — | — | — | — | — | — | **No features at level 7** |
| 8 | `troubadour-auteur-15` | Deleted Scene | `Text` | no | — | — | — | `text: VERIFY-AGAINST-PIN`; spends 1 drama, references `Dramatic Monologue` by name |
| 9 | `troubadour-auteur-16` | 9th-Level Class Act Ability | `Choice` | **yes** | 1 | build | 2 inline options | `Feature[]` |
| 9 | ↳ `troubadour-auteur-17` | Epic | `Ability` (option) | — | — | — | — | Maneuver, Magic/Melee/Ranged, Melee 1 **+** Ranged 10, `cost: 11` |
| 9 | ↳ `troubadour-auteur-18` | Rising Tension | `Ability` (option) | — | — | — | — | Maneuver, Magic/Ranged, Ranged 10, `target: 'One ally'`, `cost: 11` |
| 10 | — | — | — | — | — | — | — | **No features at level 10** |

Auteur totals: 10 top-level features + 8 nested options = 18. Choice points: 5.

### Duelist — `troubadour-duelist`

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 1 | `troubadour-duelist-1` | Skill | `SkillChoice` | **yes** | 1 | build | all five lists (defaulted) | `string[]`; pre-seeded `selected: ['Gymnastics']` |
| 1 | `troubadour-duelist-2` | Acrobatics | `Ability` | no | — | — | — | Granted performance. No action, Aura 5 |
| 1 | `troubadour-duelist-3` | Star Power | `Ability` | no | — | — | — | Maneuver, **`keywords: []`** (omitted at the call site), `distance: [Melee 1]` but `target: 'Self'`, **`cost: 1`** — a drama-costing ability granted directly, not via the pool. `Spend 1` field |
| 1 | `troubadour-duelist-4` | Riposte | `Ability` | no | — | — | — | Triggered action; `trigger: VERIFY-AGAINST-PIN`; Melee 1; `target: 'Self or one ally'`; `cost: 0` |
| 2 | `troubadour-duelist-5` | 2nd-Level Class Act Ability | `Choice` | **yes** | 1 | build | 2 inline options | `Feature[]` |
| 2 | ↳ `troubadour-duelist-6` | Classic Chandelier Stunt | `Ability` (option) | — | — | — | — | Main, Melee/Strike/Weapon, Melee 1, `target: 'Self and one willing ally'`, `cost: 5` |
| 2 | ↳ `troubadour-duelist-7` | En Garde! | `Ability` (option) | — | — | — | — | Main, Melee/Strike/Weapon, Melee 1, `cost: 5` |
| 3 | `troubadour-duelist-8` | Foil | `Text` | no | — | — | — | `text: VERIFY-AGAINST-PIN`. A per-encounter **target designation** with no data field |
| 4 | — | — | — | — | — | — | — | **No features at level 4** |
| 5 | `troubadour-duelist-9` | 5th-Level Class Act Feature | `Choice` | **yes** | 1 | build | 2 inline options | `Feature[]` |
| 5 | ↳ `troubadour-duelist-10` | Verbal Duel | `Text` (option) | — | — | — | — | References the `Foil` feature by name in prose |
| 5 | ↳ `troubadour-duelist-11` | We Can’t Be Upstaged! | `Ability` (option) | — | — | — | — | No action, Area/Magic/Performance, Aura 5, `cost: 0` — additional **performance** |
| 6 | `troubadour-duelist-12` | 6th-Level Class Act Ability | `Choice` | **yes** | 1 | build | 2 inline options | `Feature[]` |
| 6 | ↳ `troubadour-duelist-13` | Blood on the Stage | `Ability` (option) | — | — | — | — | Main, Melee/Strike/Weapon, Melee 1, `cost: 9` |
| 6 | ↳ `troubadour-duelist-14` | Fight Choreography | `Ability` (option) | — | — | — | — | Main, Melee/Strike/Weapon, Melee 1, `cost: 9` |
| 7 | — | — | — | — | — | — | — | **No features at level 7** |
| 8 | `troubadour-duelist-15` | Masterwork | `Text` | no | — | — | — | `text: VERIFY-AGAINST-PIN`. **Names one of your signature abilities** — a real player choice modeled as inert text (see *Anomalies* §2). Also cross-references `Zeitgeist` (`troubadour-33`) by name |
| 9 | `troubadour-duelist-16` | 9th-Level Class Act Ability | `Choice` | **yes** | 1 | build | 2 inline options | `Feature[]` |
| 9 | ↳ `troubadour-duelist-17` | Expert Fencer | `Ability` (option) | — | — | — | — | Main, **Charge**/Melee/Strike/Weapon, **Melee 3**, `cost: 11` |
| 9 | ↳ `troubadour-duelist-18` | Renegotiated Contract | `Ability` (option) | — | — | — | — | Main, Melee/Strike/Weapon, Melee 1, `cost: 11`; text section **precedes** the roll section |
| 10 | — | — | — | — | — | — | — | **No features at level 10** |

Duelist totals: 10 top-level features + 8 nested options = 18. Choice points: 5.

### Virtuoso — `troubadour-virtuoso`

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 1 | `troubadour-virtuoso-1` | Skill | `SkillChoice` | **yes** | 1 | build | all five lists (defaulted) | `string[]`; pre-seeded `selected: ['Music']` |
| 1 | `troubadour-virtuoso-2` | Power Chord | `Ability` | no | — | — | — | Maneuver, Area/Magic, Burst 2, `cost: 0` |
| — | *(`troubadour-virtuoso-3`)* | — | — | — | — | — | — | **ID skipped — no such record.** See *Anomalies* §8 |
| 1 | `troubadour-virtuoso-4` | “Thunder Mother” | `Ability` | no | — | — | — | Granted performance. No action, Magic/Performance/Ranged/**Strike**, Ranged 10, `target: 'One creature'` — the only single-target performance |
| 1 | `troubadour-virtuoso-5` | “Ballad of the Beast” | `Ability` | no | — | — | — | Granted performance. No action, Aura 5 |
| 1 | `troubadour-virtuoso-6` | Harmonize | `Ability` | no | — | — | — | Triggered action; `trigger: VERIFY-AGAINST-PIN`; Ranged 5; `target: 'One ally'`; **`cost: 3`**; `Spend 1, repeatable: true` field |
| 2 | `troubadour-virtuoso-7` | 2nd-Level Class Act Ability | `Choice` | **yes** | 1 | build | 2 inline options | `Feature[]` |
| 2 | ↳ `troubadour-virtuoso-8` | Encore | `Ability` (option) | — | — | — | — | Main, Magic/Strike, `distance: [Special('')]` — **an empty special distance string**, `target: 'Special'`, `cost: 5` |
| 2 | ↳ `troubadour-virtuoso-9` | Tough Crowd | `Ability` (option) | — | — | — | — | Main, Area/Magic/Ranged, Cube 3 within 10, `target: 'Special'`, `cost: 5` |
| 3 | `troubadour-virtuoso-10` | Second Album | **`Multiple`** | no | — | — | — | Container granting 2 features unconditionally |
| 3 | ↳ `troubadour-virtuoso-11` | “Fire Up the Night” | `Ability` | no | — | — | — | Granted performance. No action, Aura 5 |
| 3 | ↳ `troubadour-virtuoso-12` | “Never-Ending Hero” | `Ability` | no | — | — | — | Granted performance. No action, Aura 5 |
| 4 | — | — | — | — | — | — | — | **No features at level 4** |
| 5 | `troubadour-virtuoso-13` | 5th-Level Class Act Feature | `Choice` | **yes** | 1 | build | 2 inline options | `Feature[]` |
| 5 | ↳ `troubadour-virtuoso-14` | Bolstering Banter | `Text` (option) | — | — | — | — | `text: VERIFY-AGAINST-PIN` |
| 5 | ↳ `troubadour-virtuoso-15` | Medley | `Text` (option) | — | — | — | — | **Changes the Routines cap from 1 to 2 concurrent performances** — a mechanical mutation of `troubadour-9`, expressed only as prose |
| 6 | `troubadour-virtuoso-16` | 6th-Level Class Act Ability | `Choice` | **yes** | 1 | build | 2 inline options | `Feature[]` |
| 6 | ↳ `troubadour-virtuoso-17` | Feedback | `Ability` (option) | — | — | — | — | Main, Area/Magic, `distance: [Special('Three 3 cubes within 1')]` — **geometry as a free-text string**, `cost: 9` |
| 6 | ↳ `troubadour-virtuoso-18` | Legendary Drum Fill | `Ability` (option) | — | — | — | — | Maneuver, Area/Magic, Burst 4, `cost: 9` |
| 7 | — | — | — | — | — | — | — | **No features at level 7** |
| 8 | `troubadour-virtuoso-19` | Crowd Favorites | **`Multiple`** | no | — | — | — | Container granting 2 features unconditionally |
| 8 | ↳ `troubadour-virtuoso-20` | Moonlight Sonata | `Ability` | no | — | — | — | Granted performance. No action, Aura 5, `target: 'Each ally in the area'` (**excludes self**, unlike its sibling) |
| 8 | ↳ `troubadour-virtuoso-21` | Radical Fantasia | `Ability` | no | — | — | — | Granted performance. No action, Aura 5, `target: 'Self and each ally in the area'` |
| 9 | `troubadour-virtuoso-22` | 9th-Level Class Act Ability | `Choice` | **yes** | 1 | build | 2 inline options | `Feature[]` |
| 9 | ↳ `troubadour-virtuoso-23` | Jam Session | `Ability` (option) | — | — | — | — | Main, Area/Magic, Burst 5, `cost: 11` |
| 9 | ↳ `troubadour-virtuoso-24` | Melt Their Faces | `Ability` (option) | — | — | — | — | Main, Melee/Magic/Ranged/Strike, Melee 1 **+** Ranged 10, `cost: 11` |
| 10 | — | — | — | — | — | — | — | **No features at level 10** |

Virtuoso totals: 11 top-level features + 12 nested = 23. Choice points: 5.
Virtuoso is the only Class Act that uses `FeatureType.Multiple`, and the only
one that grants additional performances **without** spending a choice (L3, L8).

---

## Abilities

`cost` is `'signature' | number` (drama). `cost: 0` means "granted, free".
Action type is `AbilityType.usage`. `minLevel` is `1` and `repeatable` is
`false` on **every** Troubadour ability. All `description` strings are short
flavor lines and all `sections` are `VERIFY-AGAINST-PIN`.

### Class ability pool — `troubadour.abilities` (24, drawn from by `ClassAbility` choices)

| ID | Name | Cost | Keywords | Action type | Distance | Target |
|---|---|---|---|---|---|---|
| `troubadour-55` | Artful Flourish | signature | Melee, Strike, Weapon | Main Action | Melee 1 | Two creatures or objects |
| `troubadour-56` | Cutting Sarcasm | signature | Magic, Ranged, Strike, Weapon | Main Action | Ranged 10 | One creature |
| `troubadour-57` | Instigator | signature | Melee, Strike, Weapon | Main Action | Melee 1 | One creature |
| `troubadour-58` | Witty Banter | signature | Magic, Melee, Ranged, Strike | Main Action | Melee 1 + Ranged 5 | One creature |
| `troubadour-59` | Harsh Critic | 3 | Magic, Melee, Ranged, Strike | Main Action | Melee 1 + Ranged 10 | One creature or object |
| `troubadour-60` | Hypnotic Overtones | 3 | Area, Magic | Main Action | Burst 2 | Each enemy in the area |
| `troubadour-61` | Quick Rewrite | 3 | Area, Magic, Ranged | Main Action | Cube 3 within 10 | Each enemy in the area |
| `troubadour-62` | Upstage | 3 | Melee, Strike, Weapon | Maneuver | Self | Self |
| `troubadour-63` | Dramatic Reversal | 5 | Area, Magic | Main Action | Burst 3 | Self and each ally in the area |
| `troubadour-64` | Fake Your Death | 5 | Magic | Maneuver | Self | Self |
| `troubadour-65` | Flip the Script | 5 | Area, Magic | Main Action | Burst 3 | Self and each ally in the area |
| `troubadour-66` | Method Acting | 5 | Melee, Strike, Weapon | Main Action | Melee 1 | One creature |
| `troubadour-67` | Extensive Rewrites | 7 | Area, Magic | Maneuver | Burst 4 | Each enemy in the area |
| `troubadour-68` | Infernal Gavotte | 7 | Area, Magic, Melee, Weapon | Main Action | Burst 3 | Each enemy in the area |
| `troubadour-69` | Star Solo | 7 | Magic, Melee, Ranged, Strike, Weapon | Main Action | Melee 1 + Ranged 10 | One creature or object |
| `troubadour-70` | We Meet at Last | 7 | Magic, Ranged | Maneuver | Ranged 10 | One creature |
| `troubadour-71` | Action Hero | 9 | Area, Melee, Weapon | Main Action | Burst 3 | Each enemy in the area |
| `troubadour-72` | Continuity Error | 9 | Magic, Ranged | Maneuver | Ranged 10 | One enemy or object |
| `troubadour-73` | Love Song | 9 | Magic, Ranged | Maneuver | Ranged 10 | One creature or object |
| `troubadour-74` | Patter Song | 9 | Magic, Ranged | Maneuver | Ranged 10 | Special |
| `troubadour-75` | Dramatic Reveal | 11 | Magic | Maneuver | Self | Self |
| `troubadour-76` | Power Ballad | 11 | Magic, Ranged | Maneuver | Ranged 10 | Self or one ally |
| `troubadour-77` | Saved in the Edit | 11 | Magic | Maneuver | Self | Self |
| `troubadour-78` | The Show Must Go On | 11 | Area, Magic, Ranged | Maneuver | Cube 5 within 10 | Each enemy in the area |

**Pool shape:** exactly 4 abilities at each of the 6 cost tiers
(signature / 3 / 5 / 7 / 9 / 11), and exactly one `ClassAbility` choice per tier
(levels 1, 1, 1, 3, 5, 8). Every pick is 1-of-4.

### Class-granted abilities (not in the pool)

| ID | Name | Cost | Keywords | Action type | Distance | Target | Source |
|---|---|---|---|---|---|---|---|
| `troubadour-10` | Choreography | 0 | Area, Magic, **Performance** | No Action | Aura 5 | Self and each ally in the area | L1 granted |
| `troubadour-11` | Revitalizing Limerick | 0 | Area, Magic, **Performance** | No Action | Aura 5 | Self and each ally in the area | L1 granted |
| `troubadour-17` | Allow Me to Introduce Tonight’s Players | 0 | *(none)* | Main Action | Self | Self | L2 `Invocation` option |
| `troubadour-36` | Spotlight | 0 | Area, Magic, **Performance** | No Action | Aura 5 | Self and each ally in the area | L6 granted |

### Auteur abilities (10; `subclass.abilities` is empty — all are `FeatureAbility`)

| ID | Name | Cost | Keywords | Action type | Distance | Target | Gained |
|---|---|---|---|---|---|---|---|
| `troubadour-auteur-2` | Blocking | 0 | Area, Magic, **Performance** | No Action | Aura 2 | Each creature in the area | L1 granted |
| `troubadour-auteur-3` | Dramatic Monologue | 0 | Magic, Ranged | Maneuver | Ranged 10 | Special | L1 granted |
| `troubadour-auteur-4` | Turnabout Is Fair Play | 0 | Ranged | **Triggered Action** | Ranged 10 | One creature | L1 granted |
| `troubadour-auteur-6` | Guest Star | 5 | Magic, Ranged | Main Action | Melee 1 | Special | L2 option |
| `troubadour-auteur-7` | Twist at the End | 5 | Magic, Ranged | Main Action | Ranged 10 | One dead enemy | L2 option |
| `troubadour-auteur-11` | Take Two! | 0 | Area, Magic, **Performance** | No Action | Aura 5 | Self and each ally in the area | L5 option |
| `troubadour-auteur-13` | Here’s How Your Story Ends | 9 | Area, Magic | Main Action | Burst 5 | Each enemy in the area | L6 option |
| `troubadour-auteur-14` | You’re All My Understudies | 9 | Area, Magic | Maneuver | Burst 5 | Each ally in the area | L6 option |
| `troubadour-auteur-17` | Epic | 11 | Magic, Melee, Ranged | Maneuver | Melee 1 + Ranged 10 | One creature | L9 option |
| `troubadour-auteur-18` | Rising Tension | 11 | Magic, Ranged | Maneuver | Ranged 10 | One ally | L9 option |

### Duelist abilities (10)

| ID | Name | Cost | Keywords | Action type | Distance | Target | Gained |
|---|---|---|---|---|---|---|---|
| `troubadour-duelist-2` | Acrobatics | 0 | Area, Magic, **Performance** | No Action | Aura 5 | Self and each ally in the area | L1 granted |
| `troubadour-duelist-3` | Star Power | **1** | *(none)* | Maneuver | Melee 1 | Self | L1 granted |
| `troubadour-duelist-4` | Riposte | 0 | Melee | **Triggered Action** | Melee 1 | Self or one ally | L1 granted |
| `troubadour-duelist-6` | Classic Chandelier Stunt | 5 | Melee, Strike, Weapon | Main Action | Melee 1 | Self and one willing ally | L2 option |
| `troubadour-duelist-7` | En Garde! | 5 | Melee, Strike, Weapon | Main Action | Melee 1 | One creature | L2 option |
| `troubadour-duelist-11` | We Can’t Be Upstaged! | 0 | Area, Magic, **Performance** | No Action | Aura 5 | Self and each ally in the area | L5 option |
| `troubadour-duelist-13` | Blood on the Stage | 9 | Melee, Strike, Weapon | Main Action | Melee 1 | One creature or object | L6 option |
| `troubadour-duelist-14` | Fight Choreography | 9 | Melee, Strike, Weapon | Main Action | Melee 1 | One creature | L6 option |
| `troubadour-duelist-17` | Expert Fencer | 11 | **Charge**, Melee, Strike, Weapon | Main Action | Melee **3** | One creature or object | L9 option |
| `troubadour-duelist-18` | Renegotiated Contract | 11 | Melee, Strike, Weapon | Main Action | Melee 1 | One creature | L9 option |

### Virtuoso abilities (14)

| ID | Name | Cost | Keywords | Action type | Distance | Target | Gained |
|---|---|---|---|---|---|---|---|
| `troubadour-virtuoso-2` | Power Chord | 0 | Area, Magic | Maneuver | Burst 2 | Each enemy in the area | L1 granted |
| `troubadour-virtuoso-4` | “Thunder Mother” | 0 | Magic, **Performance**, Ranged, Strike | No Action | Ranged 10 | One creature | L1 granted |
| `troubadour-virtuoso-5` | “Ballad of the Beast” | 0 | Area, Magic, **Performance** | No Action | Aura 5 | Self and each ally in the area | L1 granted |
| `troubadour-virtuoso-6` | Harmonize | **3** | Ranged | **Triggered Action** | Ranged 5 | One ally | L1 granted |
| `troubadour-virtuoso-8` | Encore | 5 | Magic, Strike | Main Action | Special (`''`) | Special | L2 option |
| `troubadour-virtuoso-9` | Tough Crowd | 5 | Area, Magic, Ranged | Main Action | Cube 3 within 10 | Special | L2 option |
| `troubadour-virtuoso-11` | “Fire Up the Night” | 0 | Area, Magic, **Performance** | No Action | Aura 5 | Self and each ally in the area | L3 granted (via `Multiple`) |
| `troubadour-virtuoso-12` | “Never-Ending Hero” | 0 | Area, Magic, **Performance** | No Action | Aura 5 | Self and each ally in the area | L3 granted (via `Multiple`) |
| `troubadour-virtuoso-17` | Feedback | 9 | Area, Magic | Main Action | Special (`'Three 3 cubes within 1'`) | Each enemy in the area | L6 option |
| `troubadour-virtuoso-18` | Legendary Drum Fill | 9 | Area, Magic | Maneuver | Burst 4 | Self and each ally in the area | L6 option |
| `troubadour-virtuoso-20` | Moonlight Sonata | 0 | Area, Magic, **Performance** | No Action | Aura 5 | Each ally in the area | L8 granted (via `Multiple`) |
| `troubadour-virtuoso-21` | Radical Fantasia | 0 | Area, Magic, **Performance** | No Action | Aura 5 | Self and each ally in the area | L8 granted (via `Multiple`) |
| `troubadour-virtuoso-23` | Jam Session | 11 | Area, Magic | Main Action | Burst 5 | Each enemy in the area | L9 option |
| `troubadour-virtuoso-24` | Melt Their Faces | 11 | Melee, Magic, Ranged, Strike | Main Action | Melee 1 + Ranged 10 | One creature or object | L9 option |

### Ability section shapes present in this class

Every ability body is an ordered `sections[]` array. Troubadour uses four kinds:

| Section kind | Where it appears | Structural fields |
|---|---|---|
| `text` | everywhere | `{ type: 'text', text }` |
| `roll` | 28 of the 62 abilities (one roll section each; never two) | `{ type: 'roll', roll: { characteristic: Characteristic[], bonus: 0, tier1, tier2, tier3 } }`. Tier strings are **prose**, not structured effects |
| `field` (from `createAbilitySectionSpend`) | `troubadour-55` (2, repeatable), `-58` (1), `-60` (2, repeatable), `auteur-3` (1), `auteur-4` (3), `duelist-3` (1), `virtuoso-6` (1, repeatable) | `{ type: 'field', name: 'Spend', value, repeatable, effect }` |
| `package` | **absent in source** for Troubadour | — |

`PowerRoll.characteristic` is an **array**: `troubadour-62` (Upstage) is the one
Troubadour ability with two — `[Agility, Presence]` — meaning "roll the better
of". `PowerRoll.crit` is accepted by the factory signature but **is dropped and
never written** — no Troubadour ability has a crit line.

---

## Choice-point inventory

Ordered as the builder walks the hero. Cardinality is `n of m`.

### Class-scope, level-independent

| # | Decision | Cardinality | Notes |
|---|---|---|---|
| C1 | Primary characteristics | **not a choice** | Auto-set to `[Agility, Presence]` because `primaryCharacteristicsOptions.length === 1` |
| C2 | Characteristic array | 1 of 3 (`[2,-1,-1]`, `[1,0,0]`, `[1,1,-1]`) then 1 of its distinct permutations across the 3 non-primaries | Persisted as 5 `{ characteristic, value }` pairs, not as "which array" |
| C3 | Class Act (subclass) | 1 of 3 (Auteur / Duelist / Virtuoso) | `subclassCount: 1`. Gates every subclass row below |

### Level 1 — 8 decisions

| # | Feature | Decision | Cardinality |
|---|---|---|---|
| 1 | `troubadour-3` | Skill (any list) | 1 of ~all skills; **pre-seeded** `Read Person` |
| 2 | `troubadour-4` | Interpersonal skills | 2 of the Interpersonal list |
| 3 | `troubadour-5` | Intrigue/Lore skill | 1 of (Intrigue ∪ Lore) |
| 4 | `troubadour-7` | Kit | 1 of the standard kit list |
| 5 | `troubadour-12` | Signature ability | 1 of 4 |
| 6 | `troubadour-13` | 3pt ability | 1 of 4 |
| 7 | `troubadour-14` | 5pt ability | 1 of 4 |
| 8 | subclass L1 skill (`auteur-1` / `duelist-1` / `virtuoso-1`) | Skill (any list) | 1; **pre-seeded** `Brag` / `Gymnastics` / `Music` |

### Level 2 — 3 decisions
| # | Feature | Decision | Cardinality |
|---|---|---|---|
| 9 | `troubadour-16` | Invocation | 1 of 3 |
| 10 | `troubadour-20` | Perk (Interpersonal/Lore/Supernatural) | 1 of that pool |
| 11 | subclass L2 `Choice` | 2nd-Level Class Act Ability | 1 of 2 |

### Level 3 — 1 decision
| # | Feature | Decision | Cardinality |
|---|---|---|---|
| 12 | `troubadour-21` | 7pt ability | 1 of 4 |

*(Auteur/Duelist grant a `Text` feature at L3; Virtuoso grants a `Multiple` of
two performances. Neither is a decision.)*

### Level 4 — 3 decisions
| # | Feature | Decision | Cardinality |
|---|---|---|---|
| 13 | `troubadour-24` | Melodrama | **2 of 6**, distinct (re-selecting the same option is filtered out) |
| 14 | `troubadour-31` | Perk (any of 6 lists) | 1 |
| 15 | `troubadour-32` | Skill (any list) | 1 |

*(Subclasses have no level-4 features.)*

### Level 5 — 2 decisions
| # | Feature | Decision | Cardinality |
|---|---|---|---|
| 16 | `troubadour-34` | 9pt ability | 1 of 4 |
| 17 | subclass L5 `Choice` | 5th-Level Class Act Feature | 1 of 2 |

### Level 6 — 2 decisions
| # | Feature | Decision | Cardinality |
|---|---|---|---|
| 18 | `troubadour-35` | Perk (Interpersonal/Lore/Supernatural) | 1 |
| 19 | subclass L6 `Choice` | 6th-Level Class Act Ability | 1 of 2 |

### Level 7 — 1 decision
| # | Feature | Decision | Cardinality |
|---|---|---|---|
| 20 | `troubadour-44` | Skill (any list) | 1 |

### Level 8 — 2 decisions
| # | Feature | Decision | Cardinality |
|---|---|---|---|
| 21 | `troubadour-45` | Perk (any of 6 lists) | 1 |
| 22 | `troubadour-46` | 11pt ability | 1 of 4 |

*(Duelist L8 `Masterwork` asks the player to **name a signature ability** — a
real decision with **no data field**. Virtuoso L8 is a `Multiple`, no decision.)*

### Level 9 — 1 decision
| # | Feature | Decision | Cardinality |
|---|---|---|---|
| 23 | subclass L9 `Choice` | 9th-Level Class Act Ability | 1 of 2 |

*(Auteur/Duelist/Virtuoso all place a `Choice` here; the class places a `Text`.)*

### Level 10 — 2 decisions
| # | Feature | Decision | Cardinality |
|---|---|---|---|
| 24 | `troubadour-53` | Perk (Interpersonal/Lore/Supernatural) | 1 |
| 25 | `troubadour-54` | Skill (any list) | 1 |

**Total for a level-10 Troubadour: 25 feature-scoped decisions + characteristic
array + subclass = 27.** Skill picks: 8 (2 pre-seeded). Perk picks: 5.
Ability picks from the pool: 6. Subclass `Choice` picks: 4.

**Recurring-per-level shape:** the class contributes a `SkillChoice` at 1, 4, 7,
10; a `Perk` at 2, 4, 6, 8, 10; a `ClassAbility` at 1(×3), 3, 5, 8. Each
subclass contributes exactly one `Choice` at 2, 5, 6, 9. Levels 4/7/10 also
carry `CharacteristicBonus` grants (2 / 5 / 2 respectively).

---

## UI surface

Ordered list of controls. Forge Steel's own builder tabs are
`ancestry → culture → career → class → complication → details`; everything below
lives inside the **class** tab except where noted.

| Order | Control | Kind | Bound to | Notes |
|---|---|---|---|---|
| 1 | Level | number spinner, 1–10 | `HeroClass.level` | Min 1, max `featuresByLevel.length`. Also exposes an XP readout and an "Advance to level N" button |
| 2 | Primary characteristics | **suppressed** | — | Single-option classes skip the control entirely; render as static text `Agility, Presence` |
| 3 | Characteristic array | single-select (3 cards) → single-select (permutation cards) | `HeroClass.characteristics` | Two-stage. Stage 2's option list is derived from stage 1 — a genuine dependent control |
| 4 | Class Act | single-select from 3, in a drawer, with an info sub-drawer per option | `subclasses[].selected` | Removable. Removing clears any ability selections sourced from that subclass |
| 5 | `troubadour-3` Skill | searchable list in a drawer; renders as a removable chip once chosen | `SkillChoice.selected` | Ships with a chip already present (`Read Person`) |
| 6 | `troubadour-4` Interpersonal Skills | multi-select-2 (repeat the searchable-list drawer until 2 chips) | `SkillChoice.selected` | |
| 7 | `troubadour-5` Intrigue / Lore Skill | searchable list | `SkillChoice.selected` | |
| 8 | `troubadour-7` Kit | searchable list of kits, with a kit-detail sub-drawer | `Kit.selected` | A chosen kit may itself expose nested choice features (`FeatureLogic.getFeaturesFromKit`) — **nested sub-choice** |
| 9 | `troubadour-12/13/14` ability pickers | searchable list of 4, with an ability-detail sub-drawer | `ClassAbility.selectedIDs` | Header copy is generated: "Choose a signature ability" / "Choose a 3pt ability" |
| 10 | subclass L1 skill | searchable list | `SkillChoice.selected` | Pre-seeded chip |
| 11 | `troubadour-16` Invocation | single-select from 3 option cards, in a drawer | `Choice.selected` | Mixed option kinds (1 ability + 2 text) — the card renderer must handle both |
| 12 | Perk pickers (`-20/-31/-35/-45/-53`) | searchable list of perks, filtered by `lists`, with a perk-detail sub-drawer | `Perk.selected` | |
| 13 | `troubadour-24` Melodrama | **multi-select-2** from 6 option cards | `Choice.selected` | Points model: `count` is a budget and each option has a `value`. With all values 1 it degenerates to "pick 2" |
| 14 | Subclass `Choice` at L2/L5/L6/L9 | single-select from 2 option cards | `Choice.selected` | |
| 15 | Granted features (`Text`, `Bonus`, `CharacteristicBonus`, `Ability`, `HeroicResource`, `HeroicResourceGain`, `Multiple`) | **read-only** panels | — | No control. `Multiple` renders as a titled group containing its children |
| 16 | Free text | — | — | **absent in source** for this class — no Troubadour feature takes free text. (Hero-level free text exists: name, notes.) |
| 17 | Toggle | — | — | **absent in source** — Troubadour uses no `FeatureType.Toggle` |

**Completion / validation surface.** Forge Steel marks the class step complete
when: level is set, `primaryCharacteristics.length > 0`, at least one
characteristic value is non-zero, and `selected` subclass count ≥
`subclassCount`. Per-feature completeness is `FeatureLogic.isChosen`, which for
every Troubadour choice type is `selected.length >= count` (and for `Choice`,
`sum(selected.value) >= count`). Our builder should surface the same per-feature
"unresolved" badge.

**Control kinds actually needed for Troubadour:** single-select, multi-select-N,
searchable list, nested sub-choice (kit → kit features), number spinner,
read-only panel. **Not needed:** toggle, free text, dependent-option-list
(beyond the characteristic array).

---

## Convex data model notes

### Definition data (seeded once, versioned by source)

Immutable, shared, keyed by the Forge Steel-shaped ids above:

- `class` — `class-troubadour`: identity fields, `subclassName`, `subclassCount`,
  `primaryCharacteristicsOptions`, plus the L1 derived-stat formulas
  (Stamina `18 + 6·level`, Recoveries `8`).
- `classFeature` — 45 class rows + 9 nested option rows, each with
  `{ id, name, featureType, level, data }`. Nested options need a
  `parentFeatureId` (`troubadour-16`, `troubadour-24`) so the option list is
  queryable without walking the parent's blob.
- `subclass` — 3 rows; `subclassFeature` — 10 / 10 / 11 top-level +
  8 / 8 / 12 nested = 59 rows.
- `ability` — 62 rows. `costTier` (`'signature' | 3 | 5 | 7 | 9 | 11 | 0 | 1`)
  and `sourceKind` (`pool` | `granted` | `optionOf:<featureId>`) should be
  **indexed columns**, because the `ClassAbility` picker is literally
  "`WHERE classId = … AND sourceKind = 'pool' AND cost = <n>`".
- `abilitySection` — ordered child rows, or an ordered JSON array on the ability.
  Keep the order; Duelist `Renegotiated Contract` puts text *before* its roll.

Every `description` / `text` / `details` / `trigger` / tier string is
`VERIFY-AGAINST-PIN` and must be sourced from the pinned corpus, **not** copied
from Forge Steel.

### Selection state (per hero, sparse)

Forge Steel's own export format already validates the target shape. `Pregen`
(`src/models/pregen.ts`) stores exactly:

```
{ ancestryID, cultureID, careerID, classID, complicationID,
  incitingIncidentID, level,
  characteristics: { characteristic, value }[],
  selectedSubclassIDs: string[],
  featureSelections: { featureID: string, selections: string[] }[] }
```

That is a **flat, sparse, feature-id-keyed map of string arrays** — precisely
what our Convex `heroSelections` should be. Adopt it:

- `heroes` — one doc: `classId`, `level`, `characteristics`, `subclassIds`.
- `heroSelections` — `{ heroId, featureId, selections: string[] }`, indexed by
  `["heroId", "featureId"]`. Sparse: absent ⇒ unresolved.

`selections` semantics per Troubadour feature type (from
`PregenLogic.getFeatureSelections` / `setFeatureSelections`):

| FeatureType | `selections[]` contains |
|---|---|
| `SkillChoice` | skill **names** (strings, not ids) |
| `Kit` | kit ids |
| `Perk` | perk ids |
| `ClassAbility` | ability ids |
| `Choice` | option **feature** ids |

Forge Steel's runtime model — deep-copying the whole class into the hero and
writing into `feature.data.selected` — is what we are **not** adopting. Note
that its own serializer already collapses that back to the flat map, so the
flat map is lossless for Troubadour.

### Where the definition/selection split is hard

1. **Hero state stored on the definition object.** `HeroClass.level`,
   `HeroClass.characteristics`, `HeroClass.primaryCharacteristics`,
   `SubClass.selected`, `FeatureHeroicResourceData.value`, and
   `ResourceGain.used` all live on what is otherwise definition data. These are
   the fields to hoist into hero state; `value` and `used` further belong to
   **encounter runtime**, not the character record.
2. **A choice whose result mutates another feature's rules.**
   Virtuoso `Medley` (`troubadour-virtuoso-15`) changes the concurrent-performance
   cap declared by `Routines` (`troubadour-9`). Class `Dramaturgy`
   (`troubadour-51`) removes the distance from every Performance ability the
   hero holds. Both are prose-only; nothing in the data model represents the
   mutation. If we want an engine to enforce them we must add explicit
   modifier records — that is **new modeling**, not a transcription.
3. **A gain that supersedes an earlier gain.** `A Muse’s Muse`
   (`troubadour-43`, `replacesTags: ['start']`) removes the level-1 `start`
   drama gain. `HeroLogic.getHeroicResources` implements this by collecting
   `replacesTags` across **all** `HeroicResourceGain` features and filtering the
   union. Our resolver needs the same two-pass shape; a naive "union of gains"
   double-counts turn-start drama at level 7+.
4. **`HeroicResourceGain` is not resource-scoped.** All such features are
   attached to whichever resource has `type: 'heroic'` (Drama). At level 10 the
   hero also has `Applause` (`type: 'epic'`), whose gains are taken **only**
   from its own `gains` array. So the Melodrama picks silently attach to Drama.
   If we key gains by resource id we diverge from Forge Steel; if we don't, we
   inherit the ambiguity.
5. **Option lists that depend on earlier selections.** Skill pickers exclude
   skills the hero already knows *from any source* (ancestry, culture, career,
   another class feature) and skills that were cancelled. Perk pickers exclude
   perks already taken by any other `Perk` feature. Kit and ability pickers
   exclude what's already held. So an option list is a **query over the whole
   hero**, not a static list on the feature. Additionally, `clearRedundantSelections`
   *silently drops* a stored skill selection when the hero later acquires that
   skill elsewhere — a write triggered by an unrelated edit. Our equivalent must
   be an explicit, surfaced revalidation, not a silent mutation.
6. **Nested selections.** A `Kit` selection can itself carry choice features;
   `PregenLogic.pregenToHero` loops (`while (features.length > 0)`) because
   resolving one selection can reveal another. A flat map handles this fine as
   long as the **resolver** iterates to a fixpoint.
7. **Pre-seeded selections are indistinguishable from player choices.**
   `troubadour-3` ships `selected: ['Read Person']` in the definition. In a flat
   selection map there is no way to tell "the class granted this" from "the
   player picked this" — and the shipped Troubadour pregen proves it matters:
   it *overrides* `troubadour-3` to `Brag` and `troubadour-virtuoso-1` to
   `Read Person`. Recommend an explicit `defaultSelections` field on the
   definition plus an `origin: 'default' | 'player'` marker on the selection.
8. **`selectAt`.** Every Troubadour choice resolves to `selectAt: 'build'`.
   No `'respite'` and no `'play'` value appears anywhere in this class — so
   Troubadour does **not** exercise the re-choose-at-respite path. But
   `Zeitgeist` (L4) and `Formal Introductions` (L2 option) are *described* as
   respite-time choices and are simply not modeled; if we model them, they are
   our first `selectAt: 'respite'` records and they break the "one selection per
   featureId" assumption (a respite choice needs a history or at least a
   last-set timestamp).
9. **Level-down does not clear selections.** `HeroLogic.setLevel` only sets
   `class.level`; features above the level stop being *returned* but their
   `selected` payload persists. In a sparse map the same latency is fine and
   arguably desirable, but the resolver must filter by level on read, and
   completeness checks must ignore above-level features.

### FeatureSwitchOptions / FeatureSwitchValue

**Absent in source for Troubadour** — no `createSwitchOptions` or
`createSwitchValue` call appears in `troubadour.ts`, `auteur.ts`, `duelist.ts`
or `virtuoso.ts`. Repo-wide, the only data file using them is
`src/data/sourcebooks/community/andy.ts`.

Mechanism, for completeness (`HeroLogic.getFeatures`, lines 141–171): a
`SwitchOptions` feature declares `{ switch: <key>, options: [{value, feature}],
defaultOption }`. Resolution runs in a `while` loop over the hero's flattened
feature list: all `SwitchOptions` features are removed, the current
`SwitchValue` features are collapsed into a `{ switchKey: value }` map, and each
removed feature contributes either the option whose `value` matches, or its
`defaultOption`. The loop repeats because an injected option may itself be or
contain another `SwitchOptions`. `SwitchValue` features come from anywhere in
the hero (kit, ancestry, another class feature), so a switch is a
**cross-source, late-bound conditional grant**, not a player choice — it takes
no `selected` field and `PregenLogic` does not serialize it. If we implement it,
it belongs in the *resolver*, alongside `Multiple` and `Choice` expansion, and
it must be fixpoint-iterated. Troubadour needs none of it.

---

## Anomalies & open questions

1. **Fixed skill grants are encoded as pre-filled free choices.**
   `troubadour-3`, `auteur-1`, `duelist-1`, `virtuoso-1` each call
   `createSkillChoice({ id, selected: ['<name>'] })` with **no** `options` and
   **no** `listOptions`. The factory therefore defaults `listOptions` to all
   five lists. Result: the UI shows a removable chip, and if the player removes
   it they may pick **any skill in the game**. Whether the rulebook intends a
   fixed grant or a seeded default is unresolvable from Forge Steel —
   **VERIFY-AGAINST-PIN**. The shipped Troubadour pregen (`pregen-data.ts:1116`)
   *does* override both, which suggests Forge Steel treats them as defaults.

2. **Three real decisions are modeled as inert `Text` and are unrepresentable
   in a selection map:**
   - `troubadour-30` "Melodrama Alternative" — a Melodrama option that says
     "instead of a new event, double one you already have". *Which* event is a
     sub-choice with no field. It is also selectable **twice**? No — the
     `Choice` picker filters already-selected option ids, so it can be taken at
     most once, meaning its self-referential "including an event gained with
     this feature" clause is unreachable through the UI.
   - `troubadour-duelist-15` "Masterwork" — "choose one of your signature
     abilities and name it after yourself". A dependent single-select over the
     hero's own signature ability, with a free-text rename. No field.
   - `troubadour-33` "Zeitgeist" — a respite-time 1-of-3 (Foreshadowing /
     Hear Ye, Hear Ye! / Latest Goss). Modeled as one markdown blob including a
     tier-outcome table. No field.

3. **Subclass abilities are unreachable from the ability picker, by
   construction.** All three subclasses have `abilities: []`; every subclass
   ability lives in `featuresByLevel` as a `FeatureAbility`. The
   `ClassAbility` picker reads `getAbilitiesFromClass(..., fromSelectedSubclassAbilities,
   ..., fromSelectedSubclassLevels)` and `createClassAbilityChoice` defaults
   `fromSelectedSubclassLevels: false`. So the `fromSubclass: true` default is a
   **no-op for Troubadour**, and each cost-tier pick is exactly 1-of-4 from the
   class pool. Confirm against the pin that subclass abilities are indeed
   *granted*, not *pooled*.

4. **The Performance / Routines system has no data representation.** Thirteen
   abilities carry `AbilityKeyword.Performance` (3 class, 2 Auteur, 2 Duelist,
   6 Virtuoso; at most 9 reachable by one hero), and `troubadour-9` "Routines"
   says (in prose)
   that exactly one is active at a time, chosen at the start of each combat
   round. Nothing encodes: the active-performance slot, the cap, the cap's
   modification by Virtuoso `Medley`, or `Dramaturgy`'s level-10 removal of the
   distance. Performance count by level for a Virtuoso: 4 at L1
   (Choreography, Revitalizing Limerick, Ballad of the Beast, Thunder Mother),
   6 at L3, 7 at L6, 9 at L8. This is a **runtime/tracker** concern, but the
   builder must at minimum surface the performance list as a distinct group.

5. **`troubadour-33` "Zeitgeist" embeds a rules table in a `description`
   string.** The markdown contains a `| Roll | Effect |` table with the three
   tier bands and three `###` sub-headings. Any renderer must handle markdown
   tables in feature descriptions; any *parser* that hopes to extract mechanics
   will have to deal with prose-embedded tier bands. Our pipeline should treat
   this as a structured record (a test with three tier outcomes), not a blob.

6. **The class pool exclusion filter is a no-op here.** `ConfigClassAbility`
   removes abilities the hero already holds. Since Troubadour has exactly one
   pick per cost tier and four abilities per tier, no exclusion ever fires.
   Don't infer from Troubadour that the filter is unnecessary.

7. **Keyword/distance mismatches in the source data:**
   - `troubadour-auteur-6` "Guest Star" — `keywords: [Magic, Ranged]` but
     `distance: [Melee 1]`.
   - `troubadour-duelist-3` "Star Power" — `keywords: []` (omitted), but
     `distance: [Melee 1]` on an ability whose `target` is `'Self'`.
   - `troubadour-virtuoso-8` "Encore" — `distance: [Special('')]`, an empty
     special string, which renders as a blank distance.
   All three are **VERIFY-AGAINST-PIN**; do not propagate them.

8. **`troubadour-virtuoso-3` does not exist.** Virtuoso's L1 features are
   numbered 1, 2, 4, 5, 6. Either a feature was deleted or the id was reserved.
   Ids in this class are otherwise a dense sequence per file
   (`troubadour-1`..`-78`, `troubadour-auteur-1`..`-18`,
   `troubadour-duelist-1`..`-18`, `troubadour-virtuoso-1`..`-24` minus 3). Our
   ids should not be positional, precisely because this happens.

9. **Feature ids and ability ids share one namespace and collide by design.**
   `createAbility` (the *feature* builder) sets `feature.id = ability.id`. So
   `troubadour-10` is simultaneously a feature id and an ability id. Our schema
   must either keep them in one table or accept that a `FeatureAbility` row is
   a pure alias.

10. **Empty level entries.** All three subclasses have literally `features: []`
    at levels 4, 7 and 10 — no Class Act contributes anything at those levels.
    The class itself has at least one feature at every level 1–10. The builder
    must render an explicit "nothing from your Class Act at this level" state
    rather than a blank panel.

11. **`SubClass.classID` is `''`, not `'class-troubadour'`.** The parent link is
    implicit (the subclass objects are imported into
    `troubadour.subclasses`). Our seed must populate the FK explicitly.

12. **Non-numeric resource values.** Drama's `start` gain is `'1d3'`,
    `A Muse’s Muse` is `'1d3 + 1'`, and Applause's respite gain is
    `'XP gained'`. `ResourceGain.value` is typed `string`. A Convex schema that
    types this as a number is wrong; treat it as an expression string with a
    small grammar, and note that `'XP gained'` is not even an expression.

13. **`Applause` is a second, `'epic'`-typed heroic resource at level 10.** It
    is the only `type: 'epic'` record in this class. Whether our runtime models
    one resource per hero or many is a decision this class forces.

14. **`PowerRoll.crit` is silently dropped by the factory.**
    `FactoryLogic.createPowerRoll` accepts a `crit` parameter and never writes
    it (`src/logic/factory-logic.ts:940`). No Troubadour ability passes one, so
    nothing is lost here — but do not treat the absence of crit lines as
    evidence that Draw Steel abilities lack them.

15. **`Choice.respiteChange` is marked `@deprecated`** in `models/feature.ts`
    and is unused by Troubadour. Do not carry it forward.

16. **`HeroOverview.background` does not apply.** There is no "background" in
    Draw Steel; the Forge Steel field of that name is a display concatenation
    of ancestry / culture / career. Not relevant to this class file, noted per
    the brief.

17. **Unresolved from the source — needs the pin:** the trigger text of every
    `ResourceGain` and triggered ability; Drama's `details` clause; whether
    Scene Partner's bond cap (`= level`) and Auteur's `Missed Cue` 3-Victory
    recharge should be engine-tracked; and whether `Routines` permits changing
    performance at the start of *each* round or only on your turn.
