> **Provenance — read before implementing.**
> Structure in this file is mapped from **Forge Steel**
> (github.com/andyaiken/forgesteel, GPL-3.0), commit `01672c1`, read 2026-08-29.
> Forge Steel is an independent third-party transcription of Draw Steel and is
> **not** our canon source. Every name, number, count and option list below is
> **UNVERIFIED** and must be confirmed against the pinned SteelCompendium
> corpus (DEC-0008) before it is implemented or shown to a user.
> This file is a **structural map for UI and data-model design**, not a rules source.

# Kits, Domains and Items — the three attachable option pools

## Scope and section adaptation

This file covers the three option pools that attach to a hero **without** being
part of the hero's own level ladder: `Kit`, `Domain`, `Item`. None of the three
has a level progression of its own in the sense the class/ancestry specs use, so
**§2 is adapted**: instead of "one row per feature per level 1–10" it is
"one table per pool, one row per entry", plus a per-domain feature inventory
(domains *do* carry a `featuresByLevel` array) and a grant-point table using the
standard column set for the places where classes/titles/complications hand out
one of these choices. §3 (`Subclasses`) is inapplicable in the class sense and is
repurposed for the one subclass-scoped slice of the kit pool (Stormwight).

Counts in this file: **25 kits** (21 untyped + 4 Stormwight), **12 domains**
(each with a 10-entry `featuresByLevel` array, 6 of which are populated),
**118 item definitions** (115 registered in a sourcebook + 3 unregistered
imbued-item containers), **86 imbuements**.

> The task brief said "kits/ (22 entries incl. the stormwight/ subdir)". The
> actual count is **25**: `src/data/kits/` holds 21 `.ts` files and
> `src/data/kits/stormwight/` holds 4. All 25 are exported by `KitData` and all
> 25 are registered in the `core` sourcebook.

---

## 1. Identity

### 1a. `Kit` (`src/models/kit.ts`)

`Kit extends Element` (`Element` = `{ id, name, description }`).

| Field | Type | Default from `FactoryLogic.createKit()` | Notes |
|---|---|---|---|
| `id` | `string` | `Utils.guid()` | data files hand-write `kit-<slug>` |
| `name` | `string` | `''` | |
| `description` | `string` | `''` | flavour prose — `text: VERIFY-AGAINST-PIN` |
| `type` | `string` | `''` | **free-form discriminator**, not an enum. `''` = the standard pool; `'Stormwight'` in core; third-party books add `'Kiln'`. See §5 for how it filters. |
| `armor` | `KitArmor[]` | `[]` | enum: `Light`/`Medium`/`Heavy`/`Shield` — grants armor **proficiency**, not an armor item |
| `weapon` | `KitWeapon[]` | `[]` | enum: `Bow`/`Ensnaring`/`Heavy`/`Light`/`Medium`/`Polearm`/`Unarmed`/`Whip` |
| `stamina` | `number` | `0` | **multiplied by echelon** when applied — see §1d |
| `speed` | `number` | `0` | |
| `stability` | `number` | `0` | |
| `disengage` | `number` | `0` | |
| `meleeDamage` | `KitDamageBonus \| null` | `null` | `{ tier1, tier2, tier3 }` |
| `rangedDamage` | `KitDamageBonus \| null` | `null` | `{ tier1, tier2, tier3 }` |
| `meleeDistance` | `number` | `0` | bonus to Melee+Weapon ability distance |
| `rangedDistance` | `number` | `0` | bonus to Ranged+Weapon ability distance |
| `features` | `Feature[]` | `[]` | flat, **not** level-keyed |

`KitDamageBonus` is `{ tier1: number; tier2: number; tier3: number }`, built by
`FactoryLogic.createKitDamageBonus(t1, t2, t3)`.

### 1b. `Domain` (`src/models/domain.ts`)

`Domain extends Element`.

| Field | Type | Default from `FactoryLogic.createDomain()` | Notes |
|---|---|---|---|
| `id` | `string` | `Utils.guid()` | data files use `domain-<slug>` |
| `name` | `string` | `''` | |
| `description` | `string` | `''` | all 12 core domains carry the stub `'The <Name> domain.'` |
| `featuresByLevel` | `{ level: number, features: Feature[] }[]` | 10 entries, levels 1–10, all empty | the factory also writes `optionalFeatures: []`, **a field the `Domain` interface does not declare** — dead weight, see §8 |
| `resourceGains` | `({ resource: string } & ResourceGain)[]` | `[]` | every core domain has exactly one, all `resource: 'Piety'` |
| `defaultFeatures` | `Feature[]` | `[]` | every core domain has exactly one `PackageContent` tagged `conduit-prayer` |

`ResourceGain` fields observed in domain data: `tag`, `trigger`, `value`,
`frequency` (`ResourceGainFrequency`), `used`.

### 1c. `Item` (`src/models/item.ts`)

`Item extends Element`.

| Field | Type | Default from `FactoryLogic.createItem()` | Notes |
|---|---|---|---|
| `id` | `string` | required arg | data files use `item-<slug>` |
| `name` | `string` | required arg | |
| `description` | `string` | required arg | |
| `type` | `ItemType` | required arg | 16-value enum, see below |
| `keywords` | `(AbilityKeyword \| KitArmor \| KitWeapon)[]` | `[]` | **union across three enums** — this is how `canUseItem` matches a leveled weapon/armor against kit proficiencies |
| `crafting` | `Project \| null` | `null` | `Project` = `{ id, name, description, itemPrerequisites, source, characteristic[], goal, isCustom, progress }` |
| `effect` | `string` | `''` | prose used when the item has no mechanical features |
| `featuresByLevel` | `{ level, features }[]` | `[{1,[]},{5,[]},{9,[]}]` | gated at read time by `lvl.level <= heroLevel` |
| `imbuements` | `Imbuement[]` | `[]` | populated at play time, not in the static item definitions |
| `count` | `number` | `1` | stack size; not settable through the factory |

`ItemType`: `Artifact`, `Consumable1st`, `Consumable2nd`, `Consumable3rd`,
`Consumable4th`, `ImbuedArmor`, `ImbuedImplement`, `ImbuedWeapon`,
`LeveledArmor`, `LeveledImplement`, `LeveledWeapon`, `Leveled`, `Trinket1st`,
`Trinket2nd`, `Trinket3rd`, `Trinket4th`.

`Imbuement extends Element` = `{ type: ItemType, crafting: Project | null, level: number, feature: Feature }`.

### 1d. The three choice-point `Feature` variants

| | `FeatureKit` | `FeatureDomain` | `FeatureDomainFeature` | `FeatureItemChoice` |
|---|---|---|---|---|
| `FeatureType` | `Kit` | `Domain` | `DomainFeature` | `ItemChoice` |
| builder | `createKitChoice` | `createDomainChoice` | `createDomainFeature` | `createItemChoice` |
| default `name` | `'Kit'` | `'Domain'` | `'Domain Feature Choice'` | the single `types[0]`, else `'Item'` |
| default `description` | `''` | `''` | ``` `Choose a level ${level} domain feature.` ``` | `''` |
| data fields | `types: string[]`, `count: number`, `selected: Kit[]` | `characteristic: Characteristic`, `levels: number[]`, `count: number`, `selected: Domain[]` | `level: number`, `count: number`, `selected: Feature[]` | `types: ItemType[]`, `count: number`, `selected: Item[]` |
| default `types` | `[ '' ]` | — | — | all 10 non-imbued types: `Artifact`, `Consumable1st–4th`, `Leveled`, `Trinket1st–4th` |
| default `characteristic` | — | `Characteristic.Intuition` | — | — |
| default `levels` | — | `[1..10]` | — | — |
| default `count` | `1` | `1` | `1` | `1` |
| default `level` | — | — | required arg | — |
| `selectAt` | **absent** | **absent** | **absent** | **absent** |
| `isChoice()` | true | true | true | true |
| `isChosen()` | `selected.length >= count` | `selected.length >= count` | `selected.length >= count` | `selected.length >= count` |

**Note the `types` default asymmetry.** `createKitChoice` defaults to `[ '' ]`
(length 1), not `[]`. The pool filter is `types.includes(kit.type)`, so the
default admits exactly the kits whose `type` is `''` — the 21 standard kits —
and excludes Stormwight. `HeroLogic` also has a `types.length === 0` escape
hatch that means "no filter", but no data file produces it.

### 1e. How kit numbers reach the hero (`src/logic/hero-logic.ts`)

Only kit stats have a bespoke aggregation path. This is the part most likely to
be re-derived wrongly if not written down once:

| Derived stat | Aggregation across the hero's kits | Extra |
|---|---|---|
| Stamina | `max(kit.stamina)` | then **`× echelon`** (`CreatureLogic.getEchelon(class.level)`); only applied if `hero.class` exists |
| Speed | `max(kit.speed)` | added to the base speed |
| Stability | `max(kit.stability)` | |
| Disengage | `max(kit.disengage)` | base value is `1` |
| Melee/ranged ability distance | `max` over the kits, gated on the ability carrying both the matching distance keyword and `Weapon` | |
| Damage bonus | **not** max — every kit's melee and ranged bonus is emitted as a separate row, functionally identical rows are collated by name-join, and a row strictly dominated on all three tiers is dropped | `getKitDamageBonuses` |
| Armor proficiency | union of `kit.armor` ∪ `FeatureProficiency.armor`, deduped | |
| Weapon proficiency | union of `kit.weapon` ∪ `FeatureProficiency.weapons`, deduped | |

Kit `features` are injected into the hero's feature list with
**`level: undefined`** and `source: kit.name` — they are deliberately not
attributed to a hero level.

Domains contribute in two ways: their `resourceGains` are merged into the
matching `FeatureHeroicResource` gain list (matched by `resource === resource
feature name`, subject to `replacesTags`), and their `defaultFeatures` /
selected `featuresByLevel` features enter through the `DomainFeature` selection.

Items contribute through `getFeaturesFromItem`: a synthetic `Text` feature named
`name` (or `` `${name} x${count}` `` when `count > 1`) carrying `effect ||
description`, into which every `Text` feature from an in-level `featuresByLevel`
entry is **concatenated as markdown**; non-`Text` features are emitted
separately, also with `level: undefined`.

---

## 2. Option pools

### 2a. Kit pool — 25 entries

`meleeDamage` / `rangedDamage` are written `t1/t2/t3`; `—` means `null`.

| Kit ID | Name | `type` | `armor[]` | `weapon[]` | Sta | Spd | Stab | Dis | melee dmg | ranged dmg | mDist | rDist | `features[]` |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `kit-arcane-archer` | Arcane Archer | `''` | — | Bow | 0 | 1 | 0 | 1 | — | 2/2/2 | 0 | 10 | 1 × `Ability` |
| `kit-battlemind` | Battlemind | `''` | Light | Medium | 3 | 2 | 1 | 0 | 2/2/2 | — | 0 | 0 | 1 × `Ability` |
| `kit-cloak-and-dagger` | Cloak and Dagger | `''` | Light | Light | 3 | 2 | 0 | 1 | 1/1/1 | 1/1/1 | 0 | 5 | 1 × `Ability` |
| `kit-dual-wielder` | Dual Wielder | `''` | Medium | Light, Medium | 6 | 2 | 0 | 1 | 2/2/2 | — | 0 | 0 | 1 × `Ability` |
| `kit-guisarmier` | Guisarmier | `''` | Medium | Polearm | 6 | 0 | 1 | 0 | 2/2/2 | — | 1 | 0 | 1 × `Ability` |
| `kit-martial-artist` | Martial Artist | `''` | — | Unarmed | 3 | 3 | 0 | 1 | 2/2/2 | — | 0 | 0 | 1 × `Ability` |
| `kit-mountain` | Mountain | `''` | Heavy | Heavy | 9 | 0 | 2 | 0 | 0/0/4 | — | 0 | 0 | 1 × `Ability` |
| `kit-panther` | Panther | `''` | — | Heavy | 6 | 1 | 1 | 0 | 0/0/4 | — | 0 | 0 | 1 × `Ability` |
| `kit-pugilist` | Pugilist | `''` | — | Unarmed | 6 | 2 | 1 | 0 | 1/1/1 | — | 0 | 0 | 1 × `Ability` |
| `kit-raider` | Raider | `''` | Light, Shield | Light | 6 | 1 | 0 | 1 | 1/1/1 | 1/1/1 | 0 | 5 | 1 × `Ability` |
| `kit-ranger` | Ranger | `''` | Medium | Medium, Bow | 6 | 1 | 0 | 1 | 1/1/1 | 1/1/1 | 0 | 5 | 1 × `Ability` |
| `kit-rapid-fire` | Rapid Fire | `''` | Light | Bow | 3 | 1 | 0 | 1 | — | 2/2/2 | 0 | 7 | 1 × `Ability` |
| `kit-retiarius` | Retiarius | `''` | Light | Polearm, Ensnaring | 3 | 1 | 0 | 1 | 2/2/2 | — | 1 | 0 | 1 × `Ability` |
| `kit-shining-armor` | Shining Armor | `''` | Heavy, Shield | Medium | 12 | 0 | 1 | 0 | 2/2/2 | — | 0 | 0 | 1 × `Ability` |
| `kit-sniper` | Sniper | `''` | — | Bow | 0 | 1 | 0 | 1 | — | 0/0/4 | 0 | 10 | 1 × `Ability` |
| `kit-spellsword` | Spellsword | `''` | Light, Shield | Medium | 6 | 1 | 1 | 0 | 2/2/2 | — | 0 | 0 | 1 × `Ability` |
| `kit-stick-and-robe` | Stick And Robe | `''` | Light | Polearm | 3 | 2 | 0 | 1 | 1/1/1 | — | 1 | 0 | 1 × `Ability` |
| `kit-swashbuckler` | Swashbuckler | `''` | Light | Medium | 3 | 3 | 0 | 1 | 2/2/2 | — | 0 | 0 | 1 × `Ability` |
| `kit-sword-and-board` | Sword and Board | `''` | Medium, Shield | Medium | 9 | 0 | 1 | 1 | 2/2/2 | — | 0 | 0 | 1 × `Ability` |
| `kit-warrior-priest` | Warrior Priest | `''` | Heavy | Light | 9 | 1 | 1 | 0 | 1/1/1 | — | 0 | 0 | 1 × `Ability` |
| `kit-whirlwind` | Whirlwind | `''` | — | Whip | 0 | 3 | 0 | 1 | 1/1/1 | — | 1 | 0 | 1 × `Ability` |
| `kit-boren` | Boren | `'Stormwight'` | — | Unarmed | 9 | 0 | 2 | 0 | 0/0/4 | — | 0 | 0 | 6 (see §3) |
| `kit-corven` | Corven | `'Stormwight'` | — | Unarmed | 3 | 3 | 0 | 1 | 2/2/2 | — | 0 | 0 | 6 (see §3) |
| `kit-raden` | Raden | `'Stormwight'` | — | Unarmed | 3 | 3 | 0 | 1 | 2/2/2 | — | 0 | 0 | 6 (see §3) |
| `kit-vuken` | Vuken | `'Stormwight'` | — | Unarmed | 9 | 2 | 0 | 1 | 2/2/2 | — | 0 | 0 | 6 (see §3) |

Every one of the 21 standard kits carries **exactly one** feature: a
`FeatureAbility` wrapping a `cost: 'signature'` ability whose id is
`<kit-id>-signature`. No standard kit carries a choice-typed feature, so the
"configure the kit's own sub-choices" branch of the kit config UI is dead for
the core pool — it lights up only for Stormwight (whose `Toggle` features count
as choices).

### 2b. Domain pool — 12 entries

| Domain ID | Name | populated levels | `resourceGains[0]` | `defaultFeatures[0]` |
|---|---|---|---|---|
| `domain-creation` | Creation | 1, 2, 4, 6, 7, 9 | Piety, `+2`, `OncePerEncounter` | `creation-default-1` — Creation Prayer Effect, tag `conduit-prayer` |
| `domain-death` | Death | 1, 2, 4, 6, 7, 9 | Piety, `+2`, `OncePerEncounter` | `death-default-1` — Death Prayer Effect |
| `domain-fate` | Fate | 1, 2, 4, 6, 7, 9 | Piety, `+2`, `OncePerEncounter` | `fate-default-1` — Fate Prayer Effect |
| `domain-knowledge` | Knowledge | 1, 2, 4, 6, 7, 9 | Piety, `+2`, `OncePerEncounter` | `knowledge-default-1` — Knowledge Prayer Effect |
| `domain-life` | Life | 1, 2, 4, 6, 7, 9 | Piety, `+2`, `OncePerEncounter` | `life-default-1` — Life Prayer Effect |
| `domain-love` | Love | 1, 2, 4, 6, 7, 9 | Piety, `+2`, `OncePerEncounter` | `love-default-1` — Love Prayer Effect |
| `domain-nature` | Nature | 1, 2, 4, 6, 7, 9 | Piety, `+2`, `OncePerEncounter` | `nature-default-1` — Nature Prayer Effect |
| `domain-protection` | Protection | 1, 2, 4, 6, 7, 9 | Piety, `+2`, `OncePerEncounter` | `protection-default-1` — Protection Prayer Effect |
| `domain-storm` | Storm | 1, 2, 4, 6, 7, 9 | Piety, `+2`, `OncePerEncounter` | `storm-default-1` — Storm Prayer Effect |
| `domain-sun` | Sun | 1, 2, 4, 6, 7, 9 | Piety, `+2`, `OncePerEncounter` | `sun-default-1` — Sun Prayer Effect |
| `domain-trickery` | Trickery | 1, 2, 4, 6, 7, 9 | Piety, `+2`, `OncePerEncounter` | `trickery-default-1` — Trickery Prayer Effect |
| `domain-war` | War | 1, 2, 4, 6, 7, 9 | Piety, `+2`, `OncePerEncounter` | `war-default-1` — War Prayer Effect |

Levels **3, 5, 8, 10 are present but empty in all twelve domains.** Every
`resourceGains` entry has `tag: ''`, `value: '2'`,
`frequency: ResourceGainFrequency.OncePerEncounter`, `used: false`, and a
`trigger` string (`text: VERIFY-AGAINST-PIN`). Every `defaultFeatures` entry is
a single `FeaturePackageContent` with `tag: 'conduit-prayer'` — i.e. the domain
does not grant it directly; it feeds the Conduit's `Prayer` `FeaturePackage`.

#### 2b-i. Per-domain feature inventory

One row per feature per populated level. `Choice?` = whether
`FeatureLogic.isChoice()` is true for that node.

**Creation**

| Level | Feature ID | Name | `FeatureType` | Choice? | count |
|---|---|---|---|---|---|
| 1 | `domain-creation-1` | *(unnamed → derived from children)* | `Multiple` | no | — |
| 1 | └ `domain-creation-1-1` | Hands Of The Maker | `Ability` | no | — |
| 1 | └ `domain-creation-1-2` | Crafting Skill | `SkillChoice` | **yes** | 1, `listOptions: [Crafting]`, `selectAt: 'build'` |
| 2 | `domain-creation-2` | Statue of Power | `Ability` | no | — |
| 4 | `domain-creation-4` | Improved Hands of the Maker | `Text` | no | — |
| 6 | `domain-creation-6` | Gods’ Machine | `Ability` | no | — |
| 7 | `domain-creation-7` | Divine Quartermaster | `Text` | no | — |
| 9 | `domain-creation-9` | Divine Dragon | `Ability` | no | — |

**Death**

| Level | Feature ID | Name | `FeatureType` | Choice? | count |
|---|---|---|---|---|---|
| 1 | `domain-death-1` | *(derived)* | `Multiple` | no | — |
| 1 | └ `domain-death-1-1` | Grave Speech | `Ability` | no | — |
| 1 | └ `domain-death-1-2` | Lore Skill | `SkillChoice` | **yes** | 1, `listOptions: [Lore]` |
| 2 | `domain-death-2` | Reap | `Ability` | no | — |
| 4 | `domain-death-4` | Seance | `Text` | no | — |
| 6 | `domain-death-6` | Aura of Souls | `Ability` | no | — |
| 7 | `domain-death-7` | Word of Death Deferred | `Text` | no | — |
| 9 | `domain-death-9` | Word of Final Redemption | `Ability` | no | — |

**Fate**

| Level | Feature ID | Name | `FeatureType` | Choice? | count |
|---|---|---|---|---|---|
| 1 | `domain-fate-1` | *(derived)* | `Multiple` | no | — |
| 1 | └ `domain-fate-1-1` | Oracular Visions | `Text` | no | — |
| 1 | └ `domain-fate-1-2` | Lore Skill | `SkillChoice` | **yes** | 1, `listOptions: [Lore]` |
| 2 | `domain-fate-2` | Blessing of Fate and Destiny | `Ability` | no | — |
| 4 | `domain-fate-4` | Oracular Warning | `Text` | no | — |
| 6 | `domain-fate-6` | Your Story Ends Here | `Ability` | no | — |
| 7 | `domain-fate-7` | Word of Fate Denied | `Text` | no | — |
| 9 | `domain-fate-9` | Bend Fate | `Ability` | no | — |

**Knowledge**

| Level | Feature ID | Name | `FeatureType` | Choice? | count |
|---|---|---|---|---|---|
| 1 | `domain-knowledge-1` | *(derived)* | `Multiple` | no | — |
| 1 | └ `domain-knowledge-1-1` | Blessing of Comprehension | `Text` | no | — |
| 1 | └ `domain-knowledge-1-2` | Lore Skill | `SkillChoice` | **yes** | 1, `listOptions: [Lore]` |
| 2 | `domain-knowledge-2` | The Gods Command, You Obey | `Ability` | no | — |
| 4 | `domain-knowledge-4` | Saint’s Epiphany | `Text` | no | — |
| 6 | `domain-knowledge-6` | Invocation of Undoing | `Ability` | no | — |
| 7 | `domain-knowledge-7` | Gods’ Library | `Text` | no | — |
| 9 | `domain-knowledge-9` | Word of Weakening | `Ability` | no | — |

**Life**

| Level | Feature ID | Name | `FeatureType` | Choice? | count |
|---|---|---|---|---|---|
| 1 | `domain-life-1` | *(derived)* | `Multiple` | no | — |
| 1 | └ `domain-life-1-1` | Revitalizing Ritual | `Text` | no | — |
| 1 | └ `domain-life-1-2` | Exploration Skill | `SkillChoice` | **yes** | 1, `listOptions: [Exploration]` |
| 2 | `domain-life-2` | Wellspring of Grace | `Ability` | no | — |
| 4 | `domain-life-4` | Blessing of Life | `Text` | no | — |
| 6 | `domain-life-6` | Revitalizing Grace | `Ability` | no | — |
| 7 | `domain-life-7` | Font of Grace | `Text` | no | — |
| 9 | `domain-life-9` | Radiance of Grace | `Ability` | no | — |

**Love**

| Level | Feature ID | Name | `FeatureType` | Choice? | count |
|---|---|---|---|---|---|
| 1 | `domain-love-1` | *(derived)* | `Multiple` | no | — |
| 1 | └ `domain-love-1-1` | Blessing of Compassion | `Text` | no | — |
| 1 | └ `domain-love-1-2` | Interpersonal Skill | `SkillChoice` | **yes** | 1, `listOptions: [Interpersonal]` |
| 2 | `domain-love-2` | Our Hearts Your Strength | `Ability` | no | — |
| 4 | `domain-love-4` | Invocation of the Heart | `Text` | no | — |
| 6 | `domain-love-6` | Lauded by God | `Ability` | no | — |
| 7 | `domain-love-7-1` | Covenant of the Heart | `Text` | no | — |
| 7 | `domain-love-7-2` | Guided to Your Side | `Ability` | no | — |
| 9 | `domain-love-9` | Alacrity of the Heart | `Ability` | no | — |

> **Love is the only domain with two features at one level.** Every
> `DomainFeature` pool is "one option per selected domain" except level 7, where
> Love contributes two. Do not hard-code "options.length === number of domains".

**Nature**

| Level | Feature ID | Name | `FeatureType` | Choice? | count |
|---|---|---|---|---|---|
| 1 | `domain-nature-1` | *(derived)* | `Multiple` | no | — |
| 1 | └ `domain-nature-1-1` | Faithful Friend | `Ability` | no | — |
| 1 | └ `domain-nature-1-2` | Exploration Skill | `SkillChoice` | **yes** | 1, `listOptions: [Exploration]` |
| 2 | `domain-nature-2` | Nature Judges Thee | `Ability` | no | — |
| 4 | `domain-nature-4` | Wode Road | `Text` | no | — |
| 6 | `domain-nature-6` | Spirit Stampede | `Ability` | no | — |
| 7 | `domain-nature-7` | Nature’s Bounty | `Text` | no | — |
| 9 | `domain-nature-9` | Thorn Cage | `Ability` | no | — |

**Protection**

| Level | Feature ID | Name | `FeatureType` | Choice? | count |
|---|---|---|---|---|---|
| 1 | `domain-protection-1` | *(derived)* | `Multiple` | no | — |
| 1 | └ `domain-protection-1-1` | Protective Circle | `Text` | no | — |
| 1 | └ `domain-protection-1-2` | Exploration Skill | `SkillChoice` | **yes** | 1, `listOptions: [Exploration]` |
| 2 | `domain-protection-2` | Sacred Bond | `Ability` | no | — |
| 4 | `domain-protection-4` | Impervious Touch | `Text` | no | — |
| 6 | `domain-protection-6` | Cuirass of the Gods | `Ability` | no | — |
| 7 | `domain-protection-7` | Blessing of Iron | `Text` | no | — |
| 9 | `domain-protection-9` | Blessing of the Fortress | `Ability` | no | — |

**Storm**

| Level | Feature ID | Name | `FeatureType` | Choice? | count |
|---|---|---|---|---|---|
| 1 | `domain-storm-1` | *(derived)* | `Multiple` | no | — |
| 1 | └ `domain-storm-1-1` | Blessing of Fortunate Weather | `Text` | no | — |
| 1 | └ `domain-storm-1-2` | Exploration Skill | `SkillChoice` | **yes** | 1, `listOptions: [Exploration]` |
| 2 | `domain-storm-2` | Saint’s Tempest | `Ability` | no | — |
| 4 | `domain-storm-4` | Windwalk | `Toggle` | **yes** | `checked: false`, `condition` string; `featureChecked` = `domain-storm-4a` |
| 4 | └ `domain-storm-4a` | Windwalk | `MovementMode` (`mode: 'Fly'`) | no | — |
| 6 | `domain-storm-6` | Lightning Lord | `Ability` | no | — |
| 7 | `domain-storm-7` | Ride the Lightning / Thunderstruck | `Text` | no | — |
| 9 | `domain-storm-9` | Godstorm | `Ability` | no | — |

> Storm level 4 is the **only** non-`Text`, non-`Ability` domain feature in the
> core pool and the only domain feature that is itself a choice (a toggle).
> `Blessing of Fortunate Weather` (L1) is a `Text` feature whose prose contains a
> four-way player choice made at respite — modelled as prose, not as structure.

**Sun**

| Level | Feature ID | Name | `FeatureType` | Choice? | count |
|---|---|---|---|---|---|
| 1 | `domain-sun-1` | *(derived)* | `Multiple` | no | — |
| 1 | └ `domain-sun-1-1` | Inner Light | `Text` | no | — |
| 1 | └ `domain-sun-1-2` | Lore Skill | `SkillChoice` | **yes** | 1, `listOptions: [Lore]` |
| 2 | `domain-sun-2` | Morning Light | `Ability` | no | — |
| 4 | `domain-sun-4` | Light of Revelation | `Text` | no | — |
| 6 | `domain-sun-6` | Blessing of the Midday Sun | `Ability` | no | — |
| 7 | `domain-sun-7` | Light of the Burning Sun | `Text` | no | — |
| 9 | `domain-sun-9` | Solar Flare | `Ability` | no | — |

**Trickery**

| Level | Feature ID | Name | `FeatureType` | Choice? | count |
|---|---|---|---|---|---|
| 1 | `domain-trickery-1` | *(derived)* | `Multiple` | no | — |
| 1 | └ `domain-trickery-1-1` | Inspired Deception | `Text` | no | — |
| 1 | └ `domain-trickery-1-2` | Intrigue Skill | `SkillChoice` | **yes** | 1, `listOptions: [Intrigue]` |
| 2 | `domain-trickery-2` | Divine Comedy | `Ability` | no | — |
| 4 | `domain-trickery-4` | Blessing of Secrets | `Ability` | no | — |
| 6 | `domain-trickery-6` | Invocation of Mystery | `Ability` | no | — |
| 7 | `domain-trickery-7` | Trinity of Trickery | `Ability` | no | — |
| 9 | `domain-trickery-9` | Night Falls | `Ability` | no | — |

> Trickery is the only domain whose level-4 and level-7 features are `Ability`
> rather than `Text`; both are cost-free (`cost` defaults to `0`).

**War**

| Level | Feature ID | Name | `FeatureType` | Choice? | count |
|---|---|---|---|---|---|
| 1 | `domain-war-1` | *(derived)* | `Multiple` | no | — |
| 1 | └ `domain-war-1-1` | Sanctified Weapon | `Text` | no | — |
| 1 | └ `domain-war-1-2` | Exploration Skill | `SkillChoice` | **yes** | 1, `listOptions: [Exploration]` |
| 2 | `domain-war-2` | Blessing of Insight | `Ability` | no | — |
| 4 | `domain-war-4` | Improved Sanctified Weapon | `Text` | no | — |
| 6 | `domain-war-6` | Blade of the Heavens | `Ability` | no | — |
| 7 | `domain-war-7` | Your Triumphs Are Remembered | `Text` | no | — |
| 9 | `domain-war-9` | Righteous Phalanx | `Ability` | no | — |

### 2c. Item pool — 118 entries

`crafting / goal` = whether the item carries a `Project` and that project's
`goal`. `featuresByLevel levels` = the levels actually present; "default 1/5/9
(empty)" means the definition omitted the argument, so the factory supplied
three empty level buckets and all the item's behaviour lives in `effect`.
`Sourcebook` = which official sourcebook registers it.


| Item ID | Name | `ItemType` | `keywords[]` | crafting / goal | `featuresByLevel` levels | `effect` prose? | Sourcebook |
|---|---|---|---|---|---|---|---|
| `item-blade-of-a-thousand-years` | Blade of a Thousand Years | `Artifact` | Magic, Light, Medium, Heavy | no / — | 1 | yes | core |
| `item-encepter` | Encepter | `Artifact` | Magic | no / — | 1 | yes | core |
| `item-mortal-coil` | Mortal Coil | `Artifact` | Psionic | no / — | 1 | yes | core |
| `item-black-ash-dart` | Black Ash Dart | `Consumable1st` | Magic | yes / 45 | default 1/5/9 (empty) | yes | core |
| `item-blood-essence-vial` | Blood Essence Vial | `Consumable1st` | Potion, Psionic | yes / 45 | default 1/5/9 (empty) | yes | core |
| `item-buzz-balm` | Buzz Balm | `Consumable1st` | Magic, Oil | yes / 45 | default 1/5/9 (empty) | yes | core |
| `item-catapult-dust` | Catapult Dust | `Consumable1st` | Magic | yes / 45 | default 1/5/9 (empty) | yes | core |
| `item-giants-blood-flame` | Giant's Blood Flame | `Consumable1st` | Magic, Oil | yes / 45 | default 1/5/9 (empty) | yes | core |
| `item-growth-potion` | Growth Potion | `Consumable1st` | Magic, Potion | yes / 45 | default 1/5/9 (empty) | yes | core |
| `item-healing-potion` | Healing Potion | `Consumable1st` | Magic, Potion | yes / 45 | default 1/5/9 (empty) | yes | core |
| `item-imps-tongue` | Imp's Tongue | `Consumable1st` | Magic | yes / 45 | default 1/5/9 (empty) | yes | core |
| `item-lachomp-tooth` | Lachomp Tooth | `Consumable1st` | Psionic | yes / — | default 1/5/9 (empty) | yes | core |
| `item-mirror-token` | Mirror Token | `Consumable1st` | Psionic | yes / 45 | default 1/5/9 (empty) | yes | core |
| `item-pocket-homunculus` | Pocket Homunculus | `Consumable1st` | Psionic | yes / 45 | default 1/5/9 (empty) | yes | core |
| `item-portable-cloud` | Portable Cloud | `Consumable1st` | Magic | yes / 30 | default 1/5/9 (empty) | yes | core |
| `item-noxious-cloud` | Noxious Cloud | `Consumable1st` | Magic | yes / 45 | default 1/5/9 (empty) | yes | core |
| `item-thunderhead-cloud` | Thunderhead Cloud | `Consumable1st` | Magic | yes / 45 | default 1/5/9 (empty) | yes | core |
| `item-veratismo` | Professor Veratismo's Quaff'n'Huff Snuff | `Consumable1st` | Potion, Psionic | yes / 45 | default 1/5/9 (empty) | yes | core |
| `item-snapdragon` | Snapdragon | `Consumable1st` | Magic | yes / 45 | default 1/5/9 (empty) | yes | core |
| `item-breath-of-dawn` | Breath of Dawn | `Consumable2nd` | Psionic | yes / 90 | default 1/5/9 (empty) | yes | core |
| `item-bull-shot` | Bull Shot | `Consumable2nd` | Magic, Potion | yes / 90 | default 1/5/9 (empty) | yes | core |
| `item-chocolate-of-immovability` | Chocolate of Immovability | `Consumable2nd` | Magic | yes / 90 | default 1/5/9 (empty) | yes | core |
| `item-concealment-potion` | Concealment Potion | `Consumable2nd` | Potion, Psionic | yes / 90 | default 1/5/9 (empty) | yes | core |
| `item-float-powder` | Float Powder | `Consumable2nd` | Magic | yes / 90 | default 1/5/9 (empty) | yes | core |
| `item-purified-jelly` | Purified Jelly | `Consumable2nd` | Potion, Psionic | yes / 90 | default 1/5/9 (empty) | yes | core |
| `item-scroll-of-resurrection` | Scroll of Resurrection | `Consumable2nd` | Magic, Scroll | yes / 90 | default 1/5/9 (empty) | yes | core |
| `item-telemagnet` | Telemagnet | `Consumable2nd` | Psionic | yes / 90 | default 1/5/9 (empty) | yes | core |
| `item-vial-of-ethereal-attack` | Vial of Ethereal Attack | `Consumable2nd` | Psionic | yes / 90 | default 1/5/9 (empty) | yes | core |
| `item-anamorphic-larva` | Anamorphic Larva | `Consumable3rd` | Psionic | yes / 180 | default 1/5/9 (empty) | yes | core |
| `item-bottled-paradox` | Bottled Paradox | `Consumable3rd` | Magic, Potion | yes / 180 | default 1/5/9 (empty) | yes | core |
| `item-gallios-visiting-card` | G’Allios Visiting Card | `Consumable3rd` | Magic | yes / 180 | default 1/5/9 (empty) | yes | core |
| `item-personal-effigy` | Personal Effigy | `Consumable3rd` | Magic | yes / 120 | default 1/5/9 (empty) | yes | core |
| `item-stygian-liquor` | Stygian Liquor | `Consumable3rd` | Magic, Potion | yes / 180 | default 1/5/9 (empty) | yes | core |
| `item-timesplitter` | Timesplitter | `Consumable3rd` | Psionic | yes / 180 | default 1/5/9 (empty) | yes | core |
| `item-ward-token` | Ward Token | `Consumable3rd` | Psionic | yes / 180 | default 1/5/9 (empty) | yes | core |
| `item-wellness-tonic` | Wellness Tonic | `Consumable3rd` | Potion, Psionic | yes / 180 | default 1/5/9 (empty) | yes | core |
| `item-breath-of-creation` | Breath of Creation | `Consumable4th` | Psionic | yes / 360 | default 1/5/9 (empty) | yes | core |
| `item-elixir-of-saint-elspeth` | Elixir of Saint Elspeth | `Consumable4th` | Magic, Potion | yes / 360 | default 1/5/9 (empty) | yes | core |
| `item-solaris` | Page From the Infinite Library: Solaris | `Consumable4th` | Magic | yes / 360 | default 1/5/9 (empty) | yes | core |
| `item-bright-court` | Restorative of the Bright Court | `Consumable4th` | Magic | yes / 360 | default 1/5/9 (empty) | yes | core |
| `item-color-cloak-blue` | Color Cloak (blue) | `Trinket1st` | Magic, Neck | yes / 150 | 1 | no | core |
| `item-color-cloak-red` | Color Cloak (red) | `Trinket1st` | Magic, Neck | yes / 150 | 1 | no | core |
| `item-color-cloak-yellow` | Color Cloak (yellow) | `Trinket1st` | Magic, Neck | yes / 150 | 1 | no | core |
| `item-deadweight` | Deadweight | `Trinket1st` | Magic | yes / 150 | 1 | yes | core |
| `item-displacing-replacement-bracer` | Displacing Replacement Bracer | `Trinket1st` | Arms, Psionic | yes / 150 | 1 | no | core |
| `item-divine-vine` | Divine Vine | `Trinket1st` | Magic | yes / 100 | 1 | no | core |
| `item-flameshade-gloves` | Flameshade Gloves | `Trinket1st` | Hands, Psionic | yes / 150 | default 1/5/9 (empty) | yes | core |
| `item-gecko-gloves` | Gecko Gloves | `Trinket1st` | Hands, Magic | yes / 100 | default 1/5/9 (empty) | yes | core |
| `item-hellcharger-helm` | Hellcharger Helm | `Trinket1st` | Head, Magic | yes / 150 | 1 | yes | core |
| `item-mask-of-the-many` | Mask of the Many | `Trinket1st` | Head, Magic | yes / 150 | 1 | no | core |
| `item-quantum-satchel` | Quantum Satchel | `Trinket1st` | Magic | yes / 150 | default 1/5/9 (empty) | yes | core |
| `item-snakerattle-bangle` | Snakerattle Bangle | `Trinket1st` | Arms, Magic | yes / 150 | default 1/5/9 (empty) | yes | summoner |
| `item-unbinder-boots` | Unbinder Boots | `Trinket1st` | Feet, Magic | yes / 150 | default 1/5/9 (empty) | yes | core |
| `item-abyssal-map-ink` | Abyssal Map Ink | `Trinket2nd` | Magic | yes / 300 | default 1/5/9 (empty) | yes | summoner |
| `item-bastion-belt` | Bastion Belt | `Trinket2nd` | Waist, Magic | yes / 300 | 1 | no | core |
| `item-evilest-eye` | Evilest Eye | `Trinket2nd` | Neck, Psionic | yes / 300 | 1 | no | core |
| `item-grasp-of-the-chained-hand` | Grasp of the Chained Hand | `Trinket2nd` | Arms, Magic | yes / 300 | default 1/5/9 (empty) | yes | summoner |
| `item-insightful-crown` | Insightful Crown | `Trinket2nd` | Head, Psionic | yes / 300 | default 1/5/9 (empty) | yes | core |
| `item-key-of-inquiry` | Key of Inquiry | `Trinket2nd` | Psionic | yes / 300 | 1 | no | core |
| `item-mediators-charm` | Mediator's Charm | `Trinket2nd` | Head, Psionic | yes / 300 | default 1/5/9 (empty) | yes | core |
| `item-necklack-of-the-bayou` | Necklace of the Bayou | `Trinket2nd` | Neck, Magic | yes / 300 | default 1/5/9 (empty) | yes | core |
| `item-scannerstone` | Scannerstone | `Trinket2nd` | Psionic | yes / 300 | default 1/5/9 (empty) | yes | core |
| `item-stop-n-go-coin` | Stop-’n-Go Coin | `Trinket2nd` | Magic | yes / 300 | 1 | no | core |
| `item-thunder-chariot` | Thunder Chariot | `Trinket2nd` | Magic | yes / 300 | default 1/5/9 (empty) | yes | summoner |
| `item-bracers-of-strife` | Bracers of Strife | `Trinket3rd` | Arms, Magic | yes / 450 | 1 | yes | core |
| `item-cross-of-the-scorned-puppeteer` | Cross of the Scorned Puppeteer | `Trinket3rd` | Magic, Psionic | yes / 450 | default 1/5/9 (empty) | yes | summoner |
| `item-crystallized-essence` | Crystallized Essence | `Trinket3rd` | Magic | yes / 450 | default 1/5/9 (empty) | yes | summoner |
| `item-mask-of-oversight` | Mask of Oversight | `Trinket3rd` | Head, Magic | yes / 450 | 1 | no | core |
| `item-mirage-band` | Mirage Band | `Trinket3rd` | Head, Psionic | yes / 450 | 1 | yes | core |
| `item-nullfield-resonator-ring` | Nullfield Resonator Ring | `Trinket3rd` | Ring, Psionic | yes / 450 | 1 | yes | core |
| `item-shifting-ring` | Shifting Ring | `Trinket3rd` | Ring, Psionic | yes / 450 | 1 | yes | core |
| `item-warbanner-of-pride` | Warbanner of Pride | `Trinket3rd` | Magic | yes / 450 | default 1/5/9 (empty) | yes | summoner |
| `item-gravekeepers-lantern` | Gravekeeper’s Lantern | `Trinket4th` | Magic | yes / 600 | default 1/5/9 (empty) | yes | core |
| `item-hagbasket` | Hagbasket | `Trinket4th` | Magic | yes / 600 | default 1/5/9 (empty) | yes | summoner |
| `item-psi-blade` | Psi Blade | `Trinket4th` | Arms, Psionic | yes / 600 | 1 | yes | core |
| `item-warbanner-of-wrath` | Warbanner of Wrath | `Trinket4th` | Magic | yes / 600 | default 1/5/9 (empty) | yes | summoner |
| `item-adaptive-second-skin` | Adaptive Second Skin of Toxins | `LeveledArmor` | Light, Magic | yes / 450 | 1/5/9 | no | core |
| `item-chain-of-the-sea-and-sky` | Chain of the Sea and Sky | `LeveledArmor` | Heavy, Magic | yes / 450 | 1/5/9 | no | core |
| `item-grand-scarab` | Grand Scarab | `LeveledArmor` | Magic, Medium | yes / 450 | 1/5/9 | no | core |
| `item-kings-roar` | King’s Roar | `LeveledArmor` | Magic, Shield | yes / 450 | 1/5/9 | no | core |
| `item-kuranzoi-prismscale` | Kuran’zoi Prismscale | `LeveledArmor` | Medium, Psionic | yes / 450 | 1/5/9 | no | core |
| `item-paper-trappings` | Paper Trappings | `LeveledArmor` | Light, Magic | yes / 450 | 1/5/9 | no | core |
| `item-shrouded-memory` | Shrouded Memory | `LeveledArmor` | Light, Psionic | yes / 450 | 1/5/9 | no | core |
| `item-spiny-turtle` | Spiny Turtle | `LeveledArmor` | Heavy, Magic | yes / 450 | 1/5/9 | no | core |
| `item-star-hunter` | Star-Hunter | `LeveledArmor` | Heavy, Psionic | yes / 450 | 1/5/9 | no | core |
| `item-telekinetic-bulwark` | Telekinetic Bulwark | `LeveledArmor` | Psionic, Shield | yes / 450 | 1/5/9 | no | core |
| `item-abjurers-bastion` | Abjurer’s Bastion | `LeveledImplement` | Implement, Magic | yes / 450 | 1/5/9 | no | core |
| `item-brittlebreaker` | Brittlebreaker | `LeveledImplement` | Psionic, Wand | yes / 450 | 1/5/9 | no | core |
| `item-chaldorb` | Chaldorb | `LeveledImplement` | Implement, Magic | yes / 450 | 1/5/9 | no | core |
| `item-ether-fueled-vessel` | Ether-Fueled Vessel | `LeveledImplement` | Implement, Psionic | yes / 450 | 1/5/9 | no | core |
| `item-field-commanders-baton` | 33 Field Commanders Baton | `LeveledImplement` | Implement, Magic | yes / 450 | 1/5/9 | no | summoner |
| `item-foesense-lenses` | Foesense Lenses | `LeveledImplement` | Implement, Psionic | yes / 450 | 1/5/9 | no | core |
| `item-rex-scepter` | Rex Scepter | `LeveledImplement` | Implement, Magic | yes / 450 | 1/5/9 | no | summoner |
| `item-sanctuary-horn` | Sanctuary Horn | `LeveledImplement` | Implement, Magic | yes / 450 | 1/5/9 | no | summoner |
| `item-wand-of-the-unheard-orchestra` | Wand of the Unheard Orchestra | `LeveledImplement` | Implement, Magic | yes / 450 | 1/5/9 | no | summoner |
| `item-words-become-wonders` | Words Become Wonders at Next Breath | `LeveledImplement` | Implement, Magic | yes / 450 | 1/5/9 | no | core |
| `item-bloodbound-band` | Bloodbound Band | `Leveled` | Magic, Ring | yes / 450 | 1/5/9 | no | core |
| `item-bloody-hand-wraps` | Bloody Hand Wraps | `Leveled` | Hands, Psionic | yes / 450 | 1/5/9 | no | core |
| `item-lightning-treads` | Lightning Treads | `Leveled` | Feet, Magic | yes / 450 | 1/5/9 | no | core |
| `item-revengers-wrap` | Revenger's Wrap | `Leveled` | Neck, Magic | yes / 450 | 1/5/9 | no | core |
| `item-thief-of-joy` | Thief of Joy | `Leveled` | Neck, Psionic | yes / 450 | 1/5/9 | no | core |
| `item-authoritys-end` | Authority’s End | `LeveledWeapon` | Psionic, Whip | yes / 450 | 1/5/9 | no | core |
| `item-blade-of-quintessence` | Blade of Quintessence | `LeveledWeapon` | Medium, Magic | yes / 450 | 1/5/9 | no | core |
| `item-blade-of-the-luxurious-fop` | Blade of the Luxurious Fop | `LeveledWeapon` | Light, Magic | yes / 450 | 1/5/9 | no | core |
| `item-displacer` | Displacer | `LeveledWeapon` | Medium, Psionic | yes / 450 | 1/5/9 | no | core |
| `item-executioners-blade` | Executioner's Blade | `LeveledWeapon` | Heavy, Psionic | yes / 450 | 1/5/9 | no | core |
| `item-icemaker-maul` | Icemaker Maul | `LeveledWeapon` | Heavy, Magic | yes / 450 | 1/5/9 | no | core |
| `item-knife-of-nine` | Knife of Nine | `LeveledWeapon` | Light, Psionic | yes / 450 | 1/5/9 | no | core |
| `item-lance-of-the-sundered-star` | Lance of the Sundered Star | `LeveledWeapon` | Magic, Polearm | yes / 450 | 1/5/9 | no | core |
| `item-molten-constrictor` | Molten Constrictor | `LeveledWeapon` | Magic, Ensnaring | yes / 450 | 1/5/9 | no | core |
| `item-onerous-bow` | Onerous Bow | `LeveledWeapon` | Bow, Magic | yes / 450 | 1/5/9 | no | core |
| `item-steeltongue` | Steeltongue | `LeveledWeapon` | Magic, Whip | yes / 450 | 1/5/9 | no | core |
| `item-third-eye-seeker` | Third Eye Seeker | `LeveledWeapon` | Bow, Psionic | yes / 450 | 1/5/9 | no | core |
| `item-thunderhead-bident` | Thunderhead Bident | `LeveledWeapon` | Magic, Medium | yes / 450 | 1/5/9 | no | core |
| `item-wetwork` | Wetwork | `LeveledWeapon` | Polearm, Psionic | yes / 450 | 1/5/9 | no | core |
| `imbued-armor` | Imbued Armor | `ImbuedArmor` | — | no / — | default 1/5/9 (empty) | no | NONE |
| `imbued-implement` | Imbued Implement | `ImbuedImplement` | — | no / — | default 1/5/9 (empty) | no | NONE |
| `imbued-weapon` | Imbued Weapon | `ImbuedWeapon` | — | no / — | default 1/5/9 (empty) | no | NONE |


### 2d. Grant points — where the builder hands out one of these choices

Standard column set. `Level` is the **class/subclass/title level block** the
choice sits in, not any level inside the feature's own data.

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| 1 (Censor) | `censor-1-5` | Kit | `Kit` | yes | 1 | absent (respite-mutable, see §8) | kits where `type ∈ ['']` | `Kit[]` (deep copy) |
| 1 (Shadow) | `shadow-1-5a` | Kit | `Kit` | yes | 1 | absent | kits where `type ∈ ['']` | `Kit[]` |
| 1 (Tactician) | `tactician-1-4` | Field Arsenal | `Kit` | yes | **2** | absent | kits where `type ∈ ['']` | `Kit[]` |
| 1 (Troubadour) | `troubadour-7` | Kit | `Kit` | yes | 1 | absent | kits where `type ∈ ['']` | `Kit[]` |
| 1 (Beastheart) | `beastheart-1-5` | Kit | `Kit` | yes | 1 | absent | kits where `type ∈ ['']` | `Kit[]` |
| 1 (Fury › Berserker) | `fury-sub-1-1-2` | Kit | `Kit` | yes | 1 | absent | kits where `type ∈ ['']` | `Kit[]` |
| 1 (Fury › Reaver) | `fury-sub-2-1-2` | Kit | `Kit` | yes | 1 | absent | kits where `type ∈ ['']` | `Kit[]` |
| 1 (Fury › Stormwight) | `fury-sub-3-1-2` | Beast Shape | `Kit` | yes | 1 | absent | `types: ['Stormwight']` → the 4 Stormwight kits **only** | `Kit[]` |
| 1 (Censor) | `censor-1-2` | Domain | `Domain` | yes | 1 | absent | all domains in enabled sourcebooks | `Domain[]`, **mutated on select**: `featuresByLevel` filtered to `levels: [1,4,7]`, all `Intuition` → `Presence` |
| 1 (Conduit) | `conduit-1-2` | Domain | `Domain` | yes | **2** | absent | all domains | `Domain[]`, `levels: [1..10]`, `characteristic: Intuition` (no rewrite) |
| — (Title "Godsworn") | `title-godsworn-3a` | Domain | `Domain` | yes | 1 | absent | all domains | `Domain[]`; nested inside `Multiple` `title-godsworn-3` |
| 1 (Censor) | `censor-1-7` | 1st-Level Domain Feature | `DomainFeature` | yes | 1 | absent | `level: 1` features of the hero's selected domains | `Feature[]` (deep copy of the option) |
| 4 (Censor) | `censor-4-5` | 4th-Level Domain Feature | `DomainFeature` | yes | 1 | absent | `level: 4` pool | `Feature[]` |
| 7 (Censor) | `censor-7-2` | 7th-Level Domain Feature | `DomainFeature` | yes | 1 | absent | `level: 7` pool | `Feature[]` |
| 1 (Conduit) | `conduit-1-4` | 1st-Level Domain Feature | `DomainFeature` | yes | 1 | absent | `level: 1` pool (2 domains → 2 options) | `Feature[]` |
| 2 (Conduit) | `conduit-2-3` | 2nd-Level Domain Feature | `DomainFeature` | yes | 1 | absent | `level: 1` pool **again** — intent is "the domain you didn't take at L1" | `Feature[]` |
| 2 (Conduit) | `conduit-2-4` | 2nd-Level Domain Ability | `DomainFeature` | yes | 1 | absent | `level: 2` pool | `Feature[]` |
| 4 (Conduit) | `conduit-4-4` | 4th-Level Domain Feature | `DomainFeature` | yes | 1 | absent | `level: 4` pool | `Feature[]` |
| 5 (Conduit) | `conduit-5-1` | 5th-Level Domain Feature | `DomainFeature` | yes | 1 | absent | `level: 4` pool **again** | `Feature[]` |
| 6 (Conduit) | `conduit-6-3` | 6th-Level Domain Ability | `DomainFeature` | yes | 1 | absent | `level: 6` pool | `Feature[]` |
| 7 (Conduit) | `conduit-7-4` | 7th-Level Domain Feature | `DomainFeature` | yes | 1 | absent | `level: 7` pool (Love contributes 2 options) | `Feature[]` |
| 8 (Conduit) | `conduit-8-2` | 8th-Level Domain Feature | `DomainFeature` | yes | 1 | absent | `level: 7` pool **again** | `Feature[]` |
| 9 (Conduit) | `conduit-9-3` | 9th-Level Domain Ability | `DomainFeature` | yes | 1 | absent | `level: 9` pool | `Feature[]` |
| — (Title "Godsworn") | `title-godsworn-3b` | 1st-Level Domain Feature | `DomainFeature` | yes | 1 | absent | `level: 1` pool | `Feature[]` |
| — (Complication Amnesia) | `comp-amnesia-b` | Amnesia Benefit | `ItemChoice` | yes | 1 | absent | `types: [Trinket1st]` | `Item[]`, **new `guid` per copy** |
| — (Complication Artifact Bonded) | `comp-artifactBonded-ba` | Artifact | `ItemChoice` | yes | 1 | absent | `types: [Artifact]` | `Item[]`; nested inside `Toggle` `comp-artifactBonded-b` (`checked: false`) |
| — (Complication Betrothed) | `comp-betrothed-b` | Betrothed Benefit | `ItemChoice` | yes | 1 | absent | `types: [Trinket1st]` | `Item[]` |
| — (Complication Cursed Weapon) | `comp-cursedWeapon-b` | Leveled Weapon | `ItemChoice` | yes | 1 | absent | `types: [LeveledWeapon]` | `Item[]` |
| — (Complication Secret Twin) | `comp-secretTwin-b` | Secret Twin Benefit | `ItemChoice` | yes | 1 | absent | `types: [Trinket1st]` | `Item[]` |
| — (Complication Shattered Legacy) | `comp-shatteredLegacy-b1` | Shattered Legacy Benefit | `ItemChoice` | yes | 1 | absent | `types: [LeveledArmor, LeveledImplement, LeveledWeapon, Leveled]` | `Item[]`; nested inside `Toggle` `comp-shatteredLegacy-b` |
| — (Title "Reborn") | `title-reborn-2a` | Holy Weapon | `ItemChoice` | yes | 1 | absent | `types: [Leveled, LeveledArmor, LeveledImplement, LeveledWeapon]` | `Item[]`; nested inside `Choice` `title-reborn-2` (one of three options) |

**No class grants an `ItemChoice` anywhere in the core data.** Item selection in
the builder is entirely a complication/title affair; ordinary treasure lives in
`hero.state.inventory`, which is a separate `Item[]` outside the feature tree.

Non-core books (kept out of the tables above, listed for the shape they prove):
`look-out.ts` gives the Kiln class two kit choices at level 1 —
`kiln-inner-flame-1` (default pool) and `kiln-inner-flame-2` "Tinderbox"
(`types: ['Kiln']`) — so **`Kit.type` is an open extension point, not a closed
two-value enum**. `steel-echoes.ts` (`scion-kit-choice`), `triglav.ts`
(`vampire-class-1-9`) and `community.ts`
(`magewright-magewright-recoveries-2`) each add one default-pool kit choice.

---

## 3. Subclass scoping — the Stormwight slice

Section 3 as specified (a level-progression subtable per subclass) does not
apply: kits, domains and items have no subclasses. What *does* apply is the one
place where a shared pool is narrowed to a single subclass.

The **Fury › Stormwight** subclass is the only consumer of `types:
['Stormwight']`. The four Stormwight kits are registered in the same `core`
sourcebook `kits` array as the other 21 — **there is no separate table, no
`subclassID` field on `Kit`, and no back-pointer from kit to subclass.** The
scoping is *entirely* the `types[]` string filter on the granting feature.
Conversely, the 21 standard kits are unreachable from the Stormwight grant,
because a Stormwight fury's only kit feature is `types: ['Stormwight']`.

Structural profile of the four Stormwight kits (each has 6 top-level features):

| Slot | Boren | Corven | Raden | Vuken |
|---|---|---|---|---|
| signature | `Ability` `kit-boren-signature` Bear Claws | `Ability` `kit-corven-signature` Wing Buffet | `Ability` `kit-raden-signature` Driving Pounce | `Ability` `kit-vuken-signature` Unbalancing Attack |
| Aspect Benefits | `Text` `kit-boren-feature-1` | `Multiple` `kit-corven-feature-1` → `Text` `-1a` + `RollModifier` `-1b` (Edge, `skills: ['Hide','Sneak']`, `rollType` defaults to `Test`) | `Multiple` `kit-raden-feature-1` → `Text` `-1a` + `RollModifier` `-1b` (Edge, `skills: ['Hide','Sneak']`) | `Text` `kit-vuken-feature-1` |
| Animal Form | `Toggle` `-2a` (`checked:false`) → `Multiple` → `Size` (`sizeValue: 2`) + `AbilityDistance` (+1, keywords Melee+Weapon) | `Toggle` `-2a` → `Multiple` → `Size` (`1T`) + `MovementMode` (`'Fly'`) + `Text` | `Toggle` `-2a` → `Multiple` → `Size` (`1T`) + `MovementMode` (`'Climb'`) + `Text` | `Toggle` `-2a` → `Multiple` → `Size` (`1L`) + `Bonus` (`field: Speed`, `value: 2`) + `Text` |
| Hybrid Form | `Toggle` `-2b` → `Multiple` → `Size` (`2`) + `AbilityDistance` (+1) + `Text` | `Text` `-2b` (**not** a toggle) | `Text` `-2b` (**not** a toggle) | `Toggle` `-2b` → `Multiple` → `Size` (`1L`) + `Bonus` (`field: Speed`, `value: 2`) + `Text` |
| Primordial Storm | `Text` `-3` Blizzard | `Text` `-3` Anabatic Wind | `Text` `-3` Rat Flood | `Text` `-3` Lightning Storm |
| Growing Ferocity | `Multiple` `-4` → 6 × `HeroicResourceThreshold` | same shape | same shape | same shape |

Growing Ferocity thresholds — all keyed `resource: 'Ferocity'`, values 2/4/6/8/10/12,
with a `level` gate on the last three (`level` defaults to `1`):

| Ferocity | `level` gate | Boren | Corven | Raden | Vuken |
|---|---|---|---|---|---|
| 2 | 1 | `Multiple` → `Text` + `SurgeGain` (tag `strike-grabbed`, value `1`, `AtWill`) | `Text` | `Text` | `Text` |
| 4 | 1 | `SurgeGain` (tag `grab`, `1`, `OncePerRound`) | `SurgeGain` (tag `shift`, `1`, `OncePerRound`) | `SurgeGain` (tag `shift`, `1`, `OncePerRound`) | `SurgeGain` (tag `push-or-prone`, `1`, `OncePerRound`) |
| 6 | 1 | `Multiple` → 2 × `RollModifier` Edge (`Grab`, `Knockback`) | `Multiple` → 3 × `RollModifier` Edge (`Test`+`characteristics:[Agility]`, `EscapeGrab`, `Knockback`) | same 3 as Corven | `Multiple` → 2 × `RollModifier` Edge (`Test`+`[Agility]`, `Knockback`) |
| 8 | **4** | `SurgeGain` (tag `grab 2`, `2`, `OncePerRound`, `replacesTags: ['grab']`) | `SurgeGain` (`shift 2`, `2`, replaces `shift`) | `SurgeGain` (`shift 2`, `2`, replaces `shift`) | `SurgeGain` (`push-or-prone 2`, `2`, replaces `push-or-prone`) |
| 10 | **7** | `Multiple` → 2 × `RollModifier` DoubleEdge (`Grab`, `Knockback`) | `Multiple` → 3 × `RollModifier` DoubleEdge | same 3 as Corven | `Multiple` → 2 × `RollModifier` DoubleEdge |
| 12 | **10** | `Text` | `Text` | `Text` | `Text` |

Thresholds unlock only when `heroLevel >= threshold.data.level` **and** the
named resource's current value `>= threshold.data.value` — i.e. they are
*runtime* feature grants evaluated every time the feature list is rebuilt, not
build-time selections.

---

## 4. Abilities

Structural only. `cost` is `'signature'` or a number; `0` means the field was
omitted and `FactoryLogic.createAbility` defaulted it. Action type comes from
`FactoryLogic.type.create*`.

### 4a. Kit signature abilities (one per kit, 25 total)

| Ability ID | Name | cost | Keywords | Action type | Distance | Target |
|---|---|---|---|---|---|---|
| `kit-arcane-archer-signature` | Exploding Arrow | signature | Magic, Ranged, Strike, Weapon | Main | Ranged 5 | One creature or object |
| `kit-battlemind-signature` | Unmooring | signature | Melee, Psionic, Strike, Weapon | Main | Melee | One creature |
| `kit-cloak-and-dagger-signature` | Fade | signature | Melee, Ranged, Strike, Weapon | Main | Melee + Ranged 5 | One creature |
| `kit-dual-wielder-signature` | Double Strike | signature | Melee, Strike, Weapon | Main | Melee | Two creatures or objects |
| `kit-guisarmier-signature` | Forward Thrust, Backward Smash | signature | Melee, Strike, Weapon | Main | Melee | Two creatures or objects |
| `kit-martial-artist-signature` | Battle Grace | signature | Melee, Strike, Weapon | Main | Melee | One creature |
| `kit-mountain-signature` | Pain For Pain | signature | Melee, Strike, Weapon | Main | Melee | One creature |
| `kit-panther-signature` | Devastating Rush | signature | Melee, Strike, Weapon | Main | Melee | One creature or object |
| `kit-pugilist-signature` | Let’s Dance | signature | Melee, Strike, Weapon | Main | Melee | One creature |
| `kit-raider-signature` | Raider’s Awe | signature | Melee, Ranged, Strike, Weapon | Main | Melee + Ranged 5 | One creature |
| `kit-ranger-signature` | Hamstring Shot | signature | Ranged, Strike, Weapon | Main | Ranged 5 | One creature |
| `kit-rapid-fire-signature` | Two Shot | signature | Ranged, Strike, Weapon | Main | Ranged 5 | Two creatures or objects |
| `kit-retiarius-signature` | Net And Stab | signature | Melee, Strike, Weapon | Main | Melee | One creature |
| `kit-shining-armor-signature` | Protective Attack | signature | Melee, Strike, Weapon | Main | Melee | One creature |
| `kit-sniper-signature` | Patient Shot | signature | Ranged, Strike, Weapon | Main | Ranged 5 | One creature |
| `kit-spellsword-signature` | Leaping Lightning | signature | Magic, Melee, Strike, Weapon | Main | Melee | One creature or object |
| `kit-stick-and-robe-signature` | Where I Want You | signature | Melee, Strike, Weapon | Main | Melee | One creature |
| `kit-swashbuckler-signature` | Fancy Footwork | signature | Melee, Strike, Weapon | Main | Melee | One creature |
| `kit-sword-and-board-signature` | Shield Bash | signature | Melee, Strike, Weapon | Main | Melee | One creature |
| `kit-warrior-priest-signature` | Weakening Brand | signature | Magic, Melee, Strike, Weapon | Main | Melee | One creature or object |
| `kit-whirlwind-signature` | Extension Of My Arm | signature | Melee, Strike, Weapon | Main | Melee 2 | One creature |
| `kit-boren-signature` | Bear Claws | signature | Melee, Strike, Weapon | Main | Melee | One creature or object |
| `kit-corven-signature` | Wing Buffet | signature | Area, Melee, Weapon | Main | Burst 1 | Each enemy in the area |
| `kit-raden-signature` | Driving Pounce | signature | Melee, Strike, Weapon | Main | Melee | One creature or objects *(sic)* |
| `kit-vuken-signature` | Unbalancing Attack | signature | Melee, Strike, Weapon | Main | Melee | One creature or object |

Every kit signature ability's power roll uses a `characteristic[]` array (some
list four alternatives, e.g. Arcane Archer's `[Agility, Reason, Intuition,
Presence]`), and its tier strings are prose (`text: VERIFY-AGAINST-PIN`).

### 4b. Domain abilities (42 total)

| Domain | Level | Ability ID | Name | cost | Keywords | Action type | Distance | Target |
|---|---|---|---|---|---|---|---|---|
| Creation | 1 | `domain-creation-1-1` | Hands Of The Maker | 0 | Magic | Maneuver | Self | Self |
| Creation | 2 | `domain-creation-2` | Statue of Power | 5 | Magic, Ranged | Maneuver | Ranged 10 | Special |
| Creation | 6 | `domain-creation-6` | Gods’ Machine | 9 | Magic, Ranged | Main | Ranged 10 | Special |
| Creation | 9 | `domain-creation-9` | Divine Dragon | 11 | Magic, Ranged | Main | Ranged 10 | Special |
| Death | 1 | `domain-death-1-1` | Grave Speech | 0 | Magic | Maneuver | Melee | One dead creature |
| Death | 2 | `domain-death-2` | Reap | 5 | Magic, Ranged | Maneuver | Ranged 10 | Each ally |
| Death | 6 | `domain-death-6` | Aura of Souls | 9 | Area, Magic | Maneuver | Aura 3 | Each creature in the area |
| Death | 9 | `domain-death-9` | Word of Final Redemption | 11 | Magic, Ranged | **Free triggered** (`'The target dies.'`) | Ranged 10 | One creature |
| Fate | 2 | `domain-fate-2` | Blessing of Fate and Destiny | 5 | Magic, Ranged | Main | Ranged 10 | Three creatures |
| Fate | 6 | `domain-fate-6` | Your Story Ends Here | 9 | Magic, Ranged, Strike | Main | Ranged 10 | One creature |
| Fate | 9 | `domain-fate-9` | Bend Fate | 11 | Magic, Ranged | Main | Ranged 10 | Self or one ally |
| Knowledge | 2 | `domain-knowledge-2` | The Gods Command, You Obey | 5 | Magic, Ranged, Strike | Main | Ranged 10 | One creature |
| Knowledge | 6 | `domain-knowledge-6` | Invocation of Undoing | 9 | Area, Magic | Main | Burst 4 | Each enemy in the area |
| Knowledge | 9 | `domain-knowledge-9` | Word of Weakening | 11 | Magic, Ranged, Strike | Main | Ranged 10 | One creature or object |
| Life | 2 | `domain-life-2` | Wellspring of Grace | 5 | Area, Magic | Main | Aura 3 | Each ally in the area |
| Life | 6 | `domain-life-6` | Revitalizing Grace | 9 | Area, Magic | Main | Burst 4 | Self and each ally in the area |
| Life | 9 | `domain-life-9` | Radiance of Grace | 11 | Magic, Ranged | Main | Ranged 10 | Four Allies |
| Love | 2 | `domain-love-2` | Our Hearts Your Strength | 5 | Magic, Ranged | Maneuver | Ranged 10 | Self and one ally |
| Love | 6 | `domain-love-6` | Lauded by God | 9 | Magic, Ranged | Maneuver | Ranged 10 | Two allies |
| Love | 7 | `domain-love-7-2` | Guided to Your Side | **0 (omitted)** | Magic, Ranged | Main | Ranged 10 | Self and each ally |
| Love | 9 | `domain-love-9` | Alacrity of the Heart | 11 | Magic, Ranged | Maneuver | Ranged 10 | one allies *(sic)* |
| Nature | 1 | `domain-nature-1-1` | Faithful Friend | 0 | Magic | Main | Self | Self |
| Nature | 2 | `domain-nature-2` | Nature Judges Thee | 5 | Area, Magic, Ranged | Main | Cube 3 within 10 | Each enemy in the area |
| Nature | 6 | `domain-nature-6` | Spirit Stampede | 9 | Area, Magic, Ranged | Main | Line 10 × 2 within 5 | Each enemy in the area |
| Nature | 9 | `domain-nature-9` | Thorn Cage | 11 | Magic, Ranged, Strike | Main | Ranged 10 | One creature |
| Protection | 2 | `domain-protection-2` | Sacred Bond | 5 | Magic, Ranged | Maneuver | Ranged 10 | Self and one ally |
| Protection | 6 | `domain-protection-6` | Cuirass of the Gods | 9 | Area, Magic, Ranged | Maneuver | Ranged 10 | Three creatures |
| Protection | 9 | `domain-protection-9` | Blessing of the Fortress | 11 | Area, Magic | Maneuver | Self | Self |
| Storm | 2 | `domain-storm-2` | Saint’s Tempest | 5 | Area, Magic, Ranged | Main | Cube 3 within 10 | Each enemy in the area |
| Storm | 6 | `domain-storm-6` | Lightning Lord | 9 | Area, Magic | Main | Line 4 × 1 within 1 | Each enemy in the area |
| Storm | 9 | `domain-storm-9` | Godstorm | 11 | Area, Magic, Ranged | Main | Cube 5 within 5 | Each enemy in the area |
| Sun | 2 | `domain-sun-2` | Morning Light | 5 | Area, Magic | Main | Burst 3 | Each enemy in the area |
| Sun | 6 | `domain-sun-6` | Blessing of the Midday Sun | 9 | Area, Magic | Maneuver | Aura 4 | Self and each creature in the area |
| Sun | 9 | `domain-sun-9` | Solar Flare | 11 | Area, Magic, Ranged | Maneuver | Cube 5 within 10 | Each enemy in the area |
| Trickery | 2 | `domain-trickery-2` | Divine Comedy | 5 | Area, Magic | Maneuver | Burst 5 | Self and each ally in the area |
| Trickery | 4 | `domain-trickery-4` | Blessing of Secrets | **0 (omitted)** | Magic | Maneuver | Aura 3 | Self and each ally in the area |
| Trickery | 6 | `domain-trickery-6` | Invocation of Mystery | 9 | Area, Magic | Maneuver | Burst 4 | Self and each ally in the area |
| Trickery | 7 | `domain-trickery-7` | Trinity of Trickery | **0 (omitted)** | Magic, Ranged | Maneuver | Ranged 10 | Self or one ally |
| Trickery | 9 | `domain-trickery-9` | Night Falls | 11 | Area, Magic, Ranged | Main | Cube 5 within 10 | Special |
| War | 2 | `domain-war-2` | Blessing of Insight | 5 | Magic, Ranged | Maneuver | Ranged 10 | Self and each ally |
| War | 6 | `domain-war-6` | Blade of the Heavens | 9 | Magic, Ranged, Strike | Main | Ranged 5 | One creature |
| War | 9 | `domain-war-9` | Righteous Phalanx | 11 | Area, Magic, Ranged | Main | Wall 15 within 10 | Special |

The **cost ladder is uniform across domains**: L2 = 5, L6 = 9, L9 = 11.
Level-1 abilities and the three Trickery/Love off-ladder abilities are free.
Every domain power roll uses `characteristic: [Intuition]` in the definition —
which is precisely what the Censor's `characteristic: Presence` rewrite targets.

### 4c. Item abilities

Item abilities are not a separate pool: they are `FeatureAbility` nodes inside
an item's `featuresByLevel[].features`. Enumerating all of them is out of scope
for this file — see the `Ability` column implied by "`featuresByLevel` levels"
in §2c. The load-bearing structural facts are:

- item features are level-gated at read time (`lvl.level <= heroLevel`), so a
  leveled treasure's 1/5/9 tiers are **cumulative**, not replacing;
- `Text` features inside an item are **concatenated into the item's single
  synthetic feature description** rather than emitted separately;
- everything else (`Ability`, `AbilityDamage`, `DamageModifier`, `Bonus`, …) is
  emitted as an independent feature with `level: undefined`.

---

## 5. Choice-point inventory

In build order, for a hero who takes every pool-granting option:

| # | Decision | Cardinality | Depends on | Notes |
|---|---|---|---|---|
| 1 | **Domain** (Conduit) | choose **2** of 12 | class = Conduit | selection is *transformed*: `featuresByLevel` filtered to `levels`, characteristic rewritten |
| 1′ | **Domain** (Censor) | choose **1** of 12 | class = Censor | `levels: [1,4,7]`, `Intuition → Presence` rewrite |
| 1″ | **Domain** (Title "Godsworn") | choose **1** of 12 | title held | independent of class |
| 2 | **Domain feature** at each grant point | choose **1** each, 9 grants (Conduit) / 3 (Censor) / 1 (Title) | ≥1 domain already selected | option list is *derived from decision 1*; empty until a domain exists |
| 2a | └ nested **skill choice** inside the level-1 domain feature | choose **1** from one skill list | decision 2 picked the L1 `Multiple` | `SkillChoice`, `selectAt: 'build'` |
| 2b | └ nested **toggle** (Storm L4 Windwalk) | on/off | decision 2 picked Storm L4 | not a build-time choice; a play-state flag |
| 3 | **Kit** | choose **1** (Censor, Shadow, Troubadour, Beastheart, Fury/Berserker, Fury/Reaver) or **2** (Tactician) of the 21 standard kits | class / subclass | changeable at respite |
| 3′ | **Kit** (Fury › Stormwight) | choose **1** of the 4 Stormwight kits | subclass = Stormwight | same feature type, different `types[]` |
| 3a | └ nested **toggles** on a Stormwight kit | 1–2 on/off flags (Animal Form, Hybrid Form) | decision 3′ | Boren/Vuken have 2, Corven/Raden have 1 |
| 4 | **Item** | choose **1** per granting complication/title feature | complication or title, and for two of them a `Toggle` being on | pools are 1–4 `ItemType`s wide |

Cardinality summary: the maximum number of pool decisions a single hero faces is
a Conduit (2 domains + 9 domain features + 9 nested skill choices) — no kit — or
a Tactician (2 kits), plus at most 1 item choice from a complication and 1 from a
title.

---

## 6. UI surface

Ordered list of controls, with the control kind Forge Steel actually renders.
Ours need not match, but the *inputs each control needs* do.

| Order | Control | Kind | Options come from | Notes |
|---|---|---|---|---|
| 1 | Domain picker | **single-select** (`count === 1`) or **multi-select-N** with `maxCount` (`count > 1`), sorted by name, `allowClear` | all domains across enabled sourcebooks — **no filter by `types`, no dedupe against already-selected** | on change the whole `selected` array is rebuilt; each selected domain is deep-copied and transformed |
| 2 | Domain detail drawer | read-only panel | the selected `Domain` | opened from a selection box row |
| 3 | Domain-feature picker (one per grant point) | **single-select** / multi-select-N | the hero's selected domains' `featuresByLevel` where `level === data.level` | renders an **info alert "Choose a domain to enable this feature."** when the option list is empty |
| 4 | └ nested feature config panel | whatever the chosen feature needs (here: a skill single-select, or a toggle) | chosen feature's own data | |
| 5 | Kit picker | **searchable list in a drawer** (`KitSelectModal`, free-text over name + description), one full `KitPanel` per row, plus a "Choose a kit" button that only appears while `selected.length < count`; each chosen kit gets a removable selection box | kits filtered by `types.includes(kit.type)` **and** excluding kits already held anywhere on the hero | `Empty` state when the filtered list is empty |
| 6 | └ kit "Configure" expander | nested sub-choice panel | the kit's own choice-typed features | only non-empty for Stormwight kits (their toggles) |
| 7 | Kit detail drawer | read-only `KitPanel` | selected kit | |
| 8 | Item picker | **searchable list in a drawer** (`ItemSelectModal`) with a **per-`ItemType` toggle filter panel**, a "Show everything" toggle, and an **"Only show items you can use" toggle** (`canUseItem`: leveled armor/weapon must match a kit-granted proficiency) | all sourcebook items **plus the three `ImbuedItem` containers**, filtered to `data.types` | search matches name, description, keywords, and nested feature names |
| 9 | Item detail drawer | read-only `ItemPanel` | selected item | |
| 10 | Respite modal | list of re-selectable features | **every `Kit` feature unconditionally**, plus `Choice`/`LanguageChoice`/`SkillChoice` whose `selectAt === 'respite'` | domains and item choices are **not** offered at respite |

Control kinds not used anywhere in these three pools: free text, ordered
drag-and-drop, numeric spinner (the spinners in the `Edit*` panels are the
homebrew *authoring* UI, not the hero builder).

---

## 7. Convex data model notes

### Definition data (seeded, versioned by source, shared)

| Table | Rows | Key | Notes |
|---|---|---|---|
| `kits` | 25 core | `sourceId + slug` | flat scalar stat block + an embedded `features` array. The stat block (`stamina`/`speed`/`stability`/`disengage`/`meleeDamage`/`rangedDamage`/`meleeDistance`/`rangedDistance`) is small, fixed and always read together — **embed, don't normalise**. `type` is a plain indexed string, not an enum, because third-party sources mint new values. |
| `domains` | 12 core | `sourceId + slug` | `featuresByLevel` is a 10-slot sparse array; store as `{ level, features[] }[]` embedded. `resourceGains` and `defaultFeatures` are 1-element arrays in practice but must stay arrays. |
| `items` | 118 | `sourceId + slug` | embed `keywords`, `crafting` (a `Project`), `featuresByLevel`, `effect`. `imbuements` on the *definition* is always empty in core data — it is a per-instance field (see below). |
| `imbuements` | 86 | `sourceId + slug` | 32 armor / 27 implement / 27 weapon. Referenced by `ItemType` + `level`. |

All three pools are **shared across classes, not class-scoped** — the sole
scoping mechanism is the `types[]`/`levels[]` filter carried on the *granting
feature*, which lives in the class definition. So: **separate tables, not
embedded in the class**, and the class's feature node stores a filter, not a
copy of the pool.

The one caveat is Stormwight. It *looks* class-scoped but is not modelled that
way; it is a tag on the kit. Keep it that way — a `subclassId` on `kits` would
be wrong the moment a second source ships a `'Kiln'`-style pool.

### Selection state (per hero, sparse, keyed by feature id)

The natural Convex shape is a single sparse map on the hero document:

```
heroSelections: {
  [featureId: string]: Selection
}
```

with one `Selection` variant per pool:

| Granting feature | Selection payload | Why not the whole object |
|---|---|---|
| `Kit` | `{ kitIds: Id<'kits'>[] }` (length ≤ `count`) | the kit is used unmodified; nothing about it is per-hero except the nested toggle states |
| `Domain` | `{ domainIds: Id<'domains'>[] }` | see the transform problem below |
| `DomainFeature` | `{ featureIds: string[] }` — the *domain feature's* stable id (`domain-storm-4`), not a Convex id | the option pool is derived, so the id is enough to re-resolve |
| `ItemChoice` | `{ items: { itemId, instanceId, count }[] }` | items are **instances**, not references — see below |

Nested selections inside a selected element (the skill choice inside a level-1
domain feature; a Stormwight kit's toggles) key off the **inner feature's own
id** (`domain-storm-1-2`, `kit-boren-feature-2a`) in the same flat map. Those
ids are globally unique in the source data, so the map stays flat.

### Where the definition/selection split is hard

1. **Domain selection mutates the domain.** `ConfigDomain` (and, identically,
   `HeroUpdateLogic`) deep-copies the `Domain`, drops every `featuresByLevel`
   entry not in `feature.data.levels`, then walks the copy running
   `switchFeatureCharacteristic(f, Intuition, data.characteristic)` — a
   **string `replaceAll` over feature descriptions, ability section text, and
   power-roll tier strings**, plus a hard overwrite of
   `roll.characteristic = [toCharacteristic]`. A Censor's Life domain is
   therefore *textually different data* from a Conduit's Life domain.
   **Do not port this.** Store the characteristic override on the *selection*
   (`{ domainId, characteristicOverride: 'Presence', levelFilter: [1,4,7] }`)
   and resolve it at render/engine time from a characteristic *reference* in the
   definition. This is the single biggest structural divergence in this file.
2. **`DomainFeature` option lists depend on an earlier selection.** The pool is
   `selectedDomains.flatMap(featuresByLevel).filter(level === N)`. Clearing or
   changing a domain must invalidate every dependent `DomainFeature` selection.
   Forge Steel handles this by re-resolving selected ids against the recomputed
   pool and silently dropping non-matches (`HeroUpdateLogic`); a sparse map
   needs the same reconciliation pass, and it must be explicit, not implicit.
3. **The same pool is drawn from twice at different hero levels.**
   `conduit-1-4` and `conduit-2-3` both draw the `level: 1` pool; `conduit-4-4`
   / `conduit-5-1` both draw `level: 4`; `conduit-7-4` / `conduit-8-2` both draw
   `level: 7`. The intended rule ("take the other domain's") is **only in the
   description prose** — nothing enforces it, and the UI does not exclude an
   already-chosen option. Our model needs an explicit `excludeSelectedFrom:
   [featureId]` on the grant, or the equivalent, if we want to enforce it.
4. **Items are instances, not references.** `ConfigItemChoice` assigns
   `itemCopy.id = Utils.guid()` on select. Everything else in this file selects
   by stable id. A sparse selection map must therefore carry an instance id
   *and* a definition id for items, plus `count` (stack size). This also breaks
   Forge Steel's own reconciliation — see §8.
5. **Kits are re-chosen at respite.** `FeatureKit` has no `selectAt`, but the
   respite modal returns `true` for every `Kit` feature unconditionally. So kit
   selection is a *mutable-during-play* choice with no field to say so. Model it
   explicitly: give the grant a `changeableAt: 'respite'` marker rather than
   special-casing the type in the UI.
6. **Kit stat aggregation is `max`, not `sum`.** With Tactician's `count: 2` the
   distinction is live. Stamina additionally multiplies by echelon. Damage
   bonuses use a third rule again (collate-identical, drop-dominated). These are
   three different reducers over the same selected set; put them in one place.
7. **Stormwight toggle + threshold features are runtime, not build-time.**
   `Toggle.checked` and `HeroicResourceThreshold` unlocks are evaluated on every
   feature-list rebuild against current Ferocity and hero level. They belong in
   encounter/runtime state, not in the builder's selection map — but the
   *toggle's* checked flag is persisted per hero, so it straddles both.
8. **Item features are level-gated; kit and domain features are not.** Only
   `Item.featuresByLevel` is filtered by `heroLevel`. Kit features carry
   `level: undefined` deliberately. Do not unify these three into one
   "featuresByLevel" abstraction without keeping the gating rule per-kind.

### Two item paths, one shape

`Item[]` appears twice on a hero: as `FeatureItemChoice.data.selected` (builder,
granted by a complication/title) and as `hero.state.inventory` (play, arbitrary
treasure). Both feed `getFeaturesFromItem` identically. Keep one `heroItems`
table with an `origin: 'grant' | 'inventory'` discriminator and a nullable
`grantFeatureId` rather than two shapes.

---

## 8. Anomalies & open questions

**Data / model inconsistencies**

1. **`createDomain()` writes `optionalFeatures: []` into every
   `featuresByLevel` entry, but `Domain.featuresByLevel` does not declare that
   field.** Same in `createSubclass()`. Nothing in the codebase reads
   `optionalFeatures`. Dead field — do not port.
2. **`createKitChoice` defaults `types` to `[ '' ]`, not `[]`.** The filter is
   `types.includes(kit.type)`, and standard kits carry `type: ''`, so the
   default happens to mean "standard kits only". The `types.length === 0`
   "no filter" branch exists in `HeroLogic` but is unreachable from the data.
   This is load-bearing-by-accident and must be made explicit in our model.
3. **`'Standard'` is a migrated-away kit type.** `UpdateLogic.updateFeature`
   rewrites `types: ['Standard'] → ['']` and `updateKit` / `HeroUpdateLogic`
   rewrite `kit.type === 'Standard' → ''`. Legacy hero documents may still
   carry it. Deprecated value; our seed should use one canonical spelling.
4. **`ItemChoice` selections cannot survive a hero data refresh.**
   `ConfigItemChoice` stamps a fresh `Utils.guid()` on the selected copy, but
   `HeroUpdateLogic.updateHeroFeatureData` re-resolves
   `feature.data.selected` as
   `SourcebookLogic.getItems(sourcebooks).filter(i => selectedIDs.includes(i.id))`.
   A guid is never a sourcebook item id, so the filter returns `[]` — every
   complication/title item choice is silently dropped whenever hero data is
   re-synced. `Kit` and `Domain` do not have this problem because they keep
   their source id. **Treat this as a bug in the source, not a pattern to copy.**
5. **`ConfigDomainFeature` does not exclude already-selected options; the
   randomiser (`HeroLogic`, `PregenLogic`) does.** Two different definitions of
   the same pool. The prose ("the domain whose feature you didn't select at that
   level") is the real rule and lives nowhere machine-readable.
6. **The three `ImbuedItemData` container items are not registered in any
   sourcebook.** `ItemSelectModal` and `ProjectPanel` import them directly and
   splice them into the list. So `SourcebookLogic.getItems()` returns 115 while
   the item picker shows 118. Any port needs to decide whether imbued containers
   are items or a distinct kind.
7. **Item registration is split across two official books.** `core` registers
   102 items; `summoner` registers 13 (4 leveled implements —
   `item-field-commanders-baton`, `item-rex-scepter`, `item-sanctuary-horn`,
   `item-wand-of-the-unheard-orchestra` — and 9 trinkets). No item is registered
   twice. Sourcebook membership is therefore a real field, not a formality.
8. **Transcription typos in the source data** (do not reproduce; flag for the
   pin check): `domain-raden` signature target reads `'One creature or objects'`;
   `domain-love-9` target reads `'one allies'`; `item-field-commanders-baton`
   has `name: '33 Field Commanders Baton'` (the "33" appears to belong to the
   description, and the possessive apostrophe is missing).
9. **Five domain features are `Text` nodes containing a real player choice.**
   Storm L1 `Blessing of Fortunate Weather` (four weather options chosen each
   respite), Creation L7 `Divine Quartermaster` (choose a treasure each
   respite), Nature L7 `Nature's Bounty`, Storm L7
   `Ride the Lightning / Thunderstruck`, Love L7 `Covenant of the Heart`. Forge
   Steel models none of them structurally. If we want them as choice points, the
   structure has to be invented — which means it needs the pin first.
10. **Domain descriptions are placeholders.** All twelve read
    `'The <Name> domain.'`. There is no real domain description text to port.

**Cross-cutting**

11. **Nothing in these three pools carries `selectAt`.** `Choice`,
    `LanguageChoice` and `SkillChoice` have it; `Kit`, `Domain`,
    `DomainFeature` and `ItemChoice` do not. Kit re-selection at respite is
    hardcoded in the respite modal; domain and item re-selection are simply not
    offered, even though the respite modal's own copy mentions changing
    "your kit / prayer / enchantment / augmentation / ward".
12. **Kit features are attributed to the kit's *name*, not its id**
    (`source: kit.name`), and with `level: undefined`. Two kits with the same
    name from different sources would collapse in the sheet's "modifier" block,
    which joins kit names with `' & '` and takes `kit.weapon[0]` /
    `kit.armor[0]` — **only the first entry of each array**. Dual-Wielder
    (`[Light, Medium]`) and Ranger (`[Medium, Bow]`) therefore under-report on
    the classic sheet.
13. **`HeroLogic.getClassSpecialization` falls back to domains when no subclass
    is selected**, joining domain names with `'/'` and labelling the field with
    `class.subclassName || 'Domains'`. So "subclass" and "domain" are the same
    UI slot for Conduit/Censor. Worth deciding deliberately in our IA.

**Open questions for the pin (DEC-0008)**

- Is the kit Stamina bonus really multiplied by echelon, and is the multi-kit
  rule really `max` for stamina/speed/stability/disengage? Forge Steel's
  aggregation is the only evidence here and it is unverified.
- Is the Conduit's "the domain whose feature you didn't select" a hard
  restriction or advice? It determines whether we ship an exclusion constraint.
- Does the Censor's domain characteristic substitution apply to *all* domain
  text or only to power rolls? The string-replace implementation cannot tell us.
- Are the three imbued-item containers treasures, projects, or neither?
- Is `Kit.type` genuinely open-ended in canon, or is Stormwight the only
  sanctioned typed pool (with `'Kiln'` purely a third-party extension)?
