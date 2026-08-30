> **Provenance — read before implementing.**
> Structure in this file is mapped from **Forge Steel**
> (github.com/andyaiken/forgesteel, GPL-3.0), commit `01672c1`, read 2026-08-29.
> Forge Steel is an independent third-party transcription of Draw Steel and is
> **not** our canon source. Every name, number, count and option list below is
> **UNVERIFIED** and must be confirmed against the pinned SteelCompendium
> corpus (DEC-0008) before it is implemented or shown to a user.
> This file is a **structural map for UI and data-model design**, not a rules source.

# Complications, Titles & Perks — structural map

Three player-facing selection pools. They are grouped in one document because they
share a shape — a flat, unversioned pool of `Element`-derived records, each carrying
`features: Feature[]` — but they differ in **who owns the selection**, **what gates
availability**, and **where the selection lands on the hero**.

| | Complications | Titles | Perks |
|---|---|---|---|
| Pool size (source files read) | **100** (`complication-data.ts`) | **68** (`title-data.ts`) | **47** (`data/perks/*.ts`) |
| In the core sourcebook | 100 | 62 (+6 in the Summoner sourcebook) | 47 |
| Model file | `src/models/complication.ts` | `src/models/title.ts` | `src/models/perk.ts` |
| Granted by | a single optional slot on the hero | **not granted by any feature in the data** — Director-awarded, echelon-listed | `FeaturePerk` features on careers + class levels |
| Lands on the hero at | `hero.complication` | `hero.state.titles[]` | `feature.data.selected[]`, inline |
| Feature semantics | **all** `features[]` apply | **exactly one** of `features[]` applies (`selectedFeatureID`) | the perk **is** a `Feature` (single) |
| Level/echelon interaction | none | `echelon: 1–4`, derived from class level | none on the perk; the *grant* is level-placed |
| Repeatable | one per hero (+ customization escape hatch) | many; deduped by id | many; deduped by id across all `FeaturePerk` features |

---

## Identity

### `Complication` (`src/models/complication.ts`)

```ts
interface Complication extends Element {   // Element = { id, name, description }
	features: Feature[];
}
```

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | Stable slug. Prefix convention `comp-…`; see anomaly A-11 for the four id-casing families. |
| `name` | `string` | Display name. |
| `description` | `string` | Flavour prose. `text: VERIFY-AGAINST-PIN`. |
| `features` | `Feature[]` | 1–5 entries. **All** apply simultaneously. No level field, no echelon field, no prerequisites field. |

The **hero-side** slot:

| Field | Type | Notes |
|---|---|---|
| `Hero.complication` | `Complication \| null` | A deep copy of the pool record, with the player's selections written into its features. Optional — the builder page reports `PageState.Optional` when it is `null`. |
| `HeroOverview.complication` | `string \| null` | Display-only projection of the name. (Note: `HeroOverview.background` in the same interface is a *display concatenation* of ancestry/culture/career — there is no "background" mechanic in Draw Steel.) |

A **second** channel exists: `FeatureType.Complication` / `FeatureComplicationData = { selected: Complication \| null }`. No data file ever emits one; it is created only by the hero **Customize** modal (`hero-customize-modal.tsx` → `FactoryLogic.feature.createComplication`). `HeroLogic.getComplications` unions `hero.complication` with every such feature's `selected`.

### `Title` (`src/models/title.ts`)

```ts
interface Title extends Element {
	echelon: number;
	prerequisites: string;
	features: Feature[];
	selectedFeatureID: string;
}
```

| Field | Type | Notes |
|---|---|---|
| `id` / `name` / `description` | `string` | `description` is flavour. `text: VERIFY-AGAINST-PIN`. |
| `echelon` | `number` | 1–4 in the data. The availability gate — see *Echelon gating* below. |
| `prerequisites` | `string` | **Free prose, never parsed.** Rendered in a checklist table for the Director/player to adjudicate. Non-empty on all 68 titles. |
| `features` | `Feature[]` | 1–6 entries. These are **mutually exclusive options**, not a bundle. |
| `selectedFeatureID` | `string` | Which one option is active. `''` in every pool record; set on the hero's copy. Reset to `''` by `sharing-logic` on export and by `hero-titles-modal.importTitle`. |

Hero side: `Hero.state.titles: Title[]` — **on `HeroState`, not on `Hero`**, i.e. titles are modelled as *play state*, alongside inventory, projects, conditions and hero tokens; not as build state.

`FeatureType.TitleChoice` / `FeatureTitleChoiceData = { echelon, count, selected: Title[] }` exists but is **deprecated in practice**: no data file constructs one, and `hero-update-logic.ts` migrates any surviving instance out of `hero.features` into `hero.state.titles` and then deletes the feature. Treat it as legacy.

### `Perk` (`src/models/perk.ts`)

```ts
type Perk<TFeature extends Feature = Feature> = TFeature & { list: PerkList };
```

A perk **is a `Feature`** with one extra discriminator field. It has no wrapper object, no echelon, no prerequisites.

| Field | Type | Notes |
|---|---|---|
| `id` / `name` / `description` | `string` | From `Element`. |
| `type` | `FeatureType` | 5 distinct types across the 47 perks — see the pool table. |
| `data` | `FeatureData` | Whatever that `FeatureType` carries. `null` for `Text`. |
| `list` | `PerkList` | `Crafting \| Exploration \| Interpersonal \| Intrigue \| Lore \| Supernatural \| Special`. |

The **grant**: `FeatureType.Perk` / `FeaturePerkData = { lists: PerkList[], count: number, selected: Perk[] }`.

`PerkList.Special` is a **7th enum member with zero members in the core pool** — see anomaly A-6.

### Factory defaults you must resolve (from `factory-feature-logic.ts`)

| Builder | Produces | Defaults applied when the field is omitted |
|---|---|---|
| `createComplication` | `FeatureType.Complication` | `name: 'Complication'`, `description: 'Choose a complication.'`, `data.selected: null` |
| `createTitleChoice` | `FeatureType.TitleChoice` | `echelon: 1`, `count: 1`, `selected: []`; `name: 'Title'`; description derived from `count` |
| `createPerk` | `FeatureType.Perk` | **`count: 1`**; **`lists: [Crafting, Exploration, Interpersonal, Intrigue, Lore, Supernatural]` — all six, `Special` excluded**; `selected: []`; `name` derived as `"<lists joined by ' / '> Perk"` when `1 ≤ lists.length < 6`, else `'Perk'` / `'Perks'` |
| `createSkillChoice` | `FeatureType.SkillChoice` | `count: 1`, `selectAt: 'build'`, `options: []`; **if both `options` and `listOptions` are empty, `listOptions` becomes all five `SkillList` values** |
| `createLanguageChoice` | `FeatureType.LanguageChoice` | `count: 1`, `selectAt: 'build'`, `allowedTypes: [Common, Regional, Cultural, Dead]` (`Custom` excluded), `options: []`, `selected: []` |
| `createItemChoice` | `FeatureType.ItemChoice` | `count: 1`, `types:` all 10 `ItemType` values |
| `createChoice` | `FeatureType.Choice` | `count: 1`, `selectAt: 'build'`, `selected: []` |
| `createSkillCancelChoice` | `FeatureType.SkillCancelChoice` | `count: 1`, `knownSkillsOnly: true` (only `=== false` disables) |
| `createToggle` | `FeatureType.Toggle` | `checked: true`, `featureUnchecked: null` |
| `createRetainer` | `FeatureType.Retainer` | `selected: null` |
| `createDomainChoice` | `FeatureType.Domain` | `characteristic: Intuition`, `levels: [1..10]`, `count: 1` |
| `createDomainFeature` | `FeatureType.DomainFeature` | `count: 1` |
| `FactoryLogic.createAbility` | — | `cost: 0`, `type: createNoAction()`, `keywords: []`, `distance: []`, `target: ''`, `minLevel: 1`, `repeatable: false` |

---

## Level progression

**Adapted, per the brief.** None of the three pools carries a level axis: `Complication` has
no level or echelon field, `Perk` has none, and `Title.echelon` is a *tier band*, not a level.
The only genuine level progression in this subject is **where perk picks are granted**, which
is captured in *Perk grant sites* below. So this section is **one table per pool**, one row per
entry, with the brief's columns minus `Level`.

Column notes for all three tables:

- **Feature IDs → FeatureType** enumerates *every* feature the entry carries, in source order.
  `↳` marks a feature nested inside a `Multiple`, `Toggle` or `Choice` parent.
- **Choice?**, **count**, **selectAt**, **Option source**, **Selection shape** describe only the
  entry's choice-bearing features (the ones `FeatureLogic.isChoice` returns `true` for).
  `selectAt` is `'build'` for *every* choice in all three pools except `perk-eidetic-memory`
  (`'respite'`) — no source record sets it explicitly; the value is the factory default.

### Complications — all 100

| # | ID | Name | Feats | Feature IDs → FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `comp-advanced-studies` | Advanced Studies | 1 | `comp-advanced-studies-1` — Ability | no | — | — | — | — |
| 2 | `comp-amnesia` | Amnesia | 2 | `comp-amnesia-b` — ItemChoice<br>`comp-amnesia-d` — RollModifier | **yes** (1) | `comp-amnesia-b`: 1 *(default)* | `comp-amnesia-b`: build *(default)* | `comp-amnesia-b`: [ ItemType.Trinket1st ] | `comp-amnesia-b`: `Item[]` |
| 3 | `comp-animal-form` | Animal Form | 2 | `comp-animal-form-b` — Text<br>`comp-animal-form-d` — Text | no | — | — | — | — |
| 4 | `comp-antihero` | Antihero | 3 | `comp-antihero-b` — Text<br>`comp-antihero-da` — Text<br>`comp-antihero-db` — RollModifier | no | — | — | — | — |
| 5 | `comp-artifactBonded` | Artifact Bonded | 3 | `comp-artifactBonded-b` — Toggle<br>&nbsp;&nbsp;↳ `comp-artifactBonded-ba` — ItemChoice<br>`comp-artifactBonded-d` — Text | **yes** (2) | `comp-artifactBonded-b`: n/a<br>`comp-artifactBonded-ba`: 1 *(default)* | `comp-artifactBonded-b`: n/a<br>`comp-artifactBonded-ba`: build *(default)* | `comp-artifactBonded-b`: — (boolean)<br>`comp-artifactBonded-ba`: [ ItemType.Artifact ] | `comp-artifactBonded-b`: `boolean` (`data.checked`)<br>`comp-artifactBonded-ba`: `Item[]` |
| 6 | `comp-bereaved` | Bereaved | 2 | `comp-bereaved-b` — Text<br>`comp-bereaved-d` — DamageModifier | no | — | — | — | — |
| 7 | `comp-betrothed` | Betrothed | 2 | `comp-betrothed-b` — ItemChoice<br>`comp-betrothed-d` — Text | **yes** (1) | `comp-betrothed-b`: 1 *(default)* | `comp-betrothed-b`: build *(default)* | `comp-betrothed-b`: [ ItemType.Trinket1st ] | `comp-betrothed-b`: `Item[]` |
| 8 | `comp-chaosTouched` | Chaos Touched | 5 | `comp-chaosTouched-ba-escape` — RollModifier<br>`comp-chaosTouched-ba-grab` — RollModifier<br>`comp-chaosTouched-ba-knockback` — RollModifier<br>`comp-chaosTouched-bb` — Text<br>`comp-chaosTouched-d` — RollModifier | no | — | — | — | — |
| 9 | `comp-chosenOne` | Chosen One | 2 | `comp-chosenOne-b` — Text<br>`comp-chosenOne-d` — Text | no | — | — | — | — |
| 10 | `comp-consumingInterest` | Consuming Interest | 3 | `comp-consumingInterest-skill` — SkillChoice<br>`comp-consumingInterest-b` — Text<br>`comp-consumingInterest-d` — Text | **yes** (1) | `comp-consumingInterest-skill`: 1 *(default)* | `comp-consumingInterest-skill`: build *(default)* | `comp-consumingInterest-skill`: [ SkillList.Lore ] | `comp-consumingInterest-skill`: `string[]` |
| 11 | `comp-corruptedMentor` | Corrupted Mentor | 3 | `comp-corruptedMentor-b-text` — Text<br>`comp-corruptedMentor-b-ability` — Ability<br>`comp-corruptedMentor-d` — Text | no | — | — | — | — |
| 12 | `comp-coward` | Coward | 2 | `comp-coward-b` — Text<br>`comp-coward-d` — Text | no | — | — | — | — |
| 13 | `comp-crashLanded` | Crash Landed | 3 | `comp-crashLanded-skill` — SkillChoice<br>`comp-crashLanded-b` — Text<br>`comp-crashLanded-d` — RollModifier | **yes** (1) | `comp-crashLanded-skill`: 1 *(default)* | `comp-crashLanded-skill`: build *(default)* | `comp-crashLanded-skill`: *default* — all 5 skill lists | `comp-crashLanded-skill`: `string[]` |
| 14 | `comp-cult-victim` | Cult Victim | 2 | `comp-cult-victim-b` — Text<br>`comp-cult-victim-d` — DamageModifier | no | — | — | — | — |
| 15 | `comp-carefulCurse` | Curse of Caution | 2 | `comp-carefulCurse-b` — Text<br>`comp-carefulCurse-d` — Bonus | no | — | — | — | — |
| 16 | `comp-curseOfImmortality` | Curse of Immortality | 2 | `comp-curseOfImmortality-b` — Text<br>`comp-curseOfImmortality-d` — RollModifier | no | — | — | — | — |
| 17 | `comp-curseOfMisfortune` | Curse of Misfortune | 1 | `comp-curseOfMisfortune-b` — Text | no | — | — | — | — |
| 18 | `comp-curseOfPoverty` | Curse of Poverty | 1 | `comp-curseOfPoverty-b` — Text | no | — | — | — | — |
| 19 | `comp-punishment-curse` | Curse of Punishment | 2 | `comp-punishment-curse-b` — Bonus<br>`comp-punishment-curse-d` — Text | no | — | — | — | — |
| 20 | `comp-stoneCursed` | Curse of Stone | 4 | `comp-stoneCursed-b` — Text<br>`comp-stoneCursed-mod1` — Bonus<br>`comp-stoneCursed-d` — Text<br>`comp-stoneCursed-mod2` — DamageModifier | no | — | — | — | — |
| 21 | `comp-cursedWeapon` | Cursed Weapon | 2 | `comp-cursedWeapon-b` — ItemChoice<br>`comp-cursedWeapon-d` — DamageModifier | **yes** (1) | `comp-cursedWeapon-b`: 1 *(default)* | `comp-cursedWeapon-b`: build *(default)* | `comp-cursedWeapon-b`: [ ItemType.LeveledWeapon ] | `comp-cursedWeapon-b`: `Item[]` |
| 22 | `comp-disgraced` | Disgraced | 3 | `comp-disgraced-bonus` — Bonus<br>`comp-disgraced-skill` — SkillChoice<br>`comp-disgraced-d` — Text | **yes** (1) | `comp-disgraced-skill`: 1 *(default)* | `comp-disgraced-skill`: build *(default)* | `comp-disgraced-skill`: [ SkillList.Interpersonal, SkillList.Intrigue ] | `comp-disgraced-skill`: `string[]` |
| 23 | `comp-dragonDreams` | Dragon Dreams | 2 | `comp-dragonDreams-b` — Text<br>`comp-dragonDreams-d` — Text | no | — | — | — | — |
| 24 | `comp-elemental-inside` | Elemental Inside | 2 | `comp-elemental-inside-b` — Bonus<br>`comp-elemental-inside-d` — Text | no | — | — | — | — |
| 25 | `comp-evanesceria` | Evanesceria | 2 | `comp-evanesceria-b` — Text<br>`comp-evanesceria-d` — Text | no | — | — | — | — |
| 26 | `comp-exile` | Exile | 2 | `comp-exile-lang` — LanguageChoice<br>`comp-exile-d` — Text | **yes** (1) | `comp-exile-lang`: 1 *(default)* | `comp-exile-lang`: build *(default)* | `comp-exile-lang`: *default* `allowedTypes` = Common, Regional, Cultural, Dead · `options: [ LanguageType.Common ]` (ignored by config UI) | `comp-exile-lang`: `string[]` |
| 27 | `comp-fallenImmortal` | Fallen Immortal | 3 | `comp-fallenImmortal-skill` — SkillChoice<br>`comp-fallenImmortal-b` — Text<br>`comp-fallenImmortal-d` — Text | **yes** (1) | `comp-fallenImmortal-skill`: 1 *(default)* | `comp-fallenImmortal-skill`: build *(default)* | `comp-fallenImmortal-skill`: *default* — all 5 skill lists | `comp-fallenImmortal-skill`: `string[]` |
| 28 | `comp-famousRelative` | Famous Relative | 2 | `comp-famousRelative-b` — Text<br>`comp-famousRelative-d` — Text | no | — | — | — | — |
| 29 | `comp-feytouched` | Feytouched | 1 | `comp-feytouched-b` — Text | no | — | — | — | — |
| 30 | `comp-fieryIdeal` | Fiery Ideal | 2 | `comp-fieryIdeal-b` — Text<br>`comp-fieryIdeal-d` — Text | no | — | — | — | — |
| 31 | `comp-fire-and-chaos` | Fire And Chaos | 1 | `comp-fire-and-chaos-b` — DamageModifier | no | — | — | — | — |
| 32 | `comp-followingInTheFootsteps` | Following in the Footsteps | 2 | `comp-followingInTheFootsteps-b` — Text<br>`comp-followingInTheFootsteps-d` — Text | no | — | — | — | — |
| 33 | `comp-forbiddenRomance` | Forbidden Romance | 2 | `comp-forbiddenRomance-b` — Text<br>`comp-forbiddenRomance-d` — Text | no | — | — | — | — |
| 34 | `comp-frostheart` | Frostheart | 2 | `comp-frostheart-b` — Text<br>`comp-frostheart-mods` — DamageModifier | no | — | — | — | — |
| 35 | `comp-gettingTooOldForThis` | Getting Too Old For This | 2 | `comp-gettingTooOldForThis-b` — Text<br>`comp-gettingTooOldForThis-d` — Text | no | — | — | — | — |
| 36 | `comp-gnollMauled` | Gnoll-Mauled | 2 | `comp-gnollBit-b` — Text<br>`comp-gnollBit-d` — Text | no | — | — | — | — |
| 37 | `comp-greening` | Greening | 1 | `comp-greening-mods` — DamageModifier | no | — | — | — | — |
| 38 | `comp-grifter` | Grifter | 2 | `comp-grifter-b` — SkillChoice<br>`comp-grifter-d` — Text | **yes** (1) | `comp-grifter-b`: 1 *(default)* | `comp-grifter-b`: build *(default)* | `comp-grifter-b`: [ SkillList.Intrigue ] | `comp-grifter-b`: `string[]` |
| 39 | `comp-grounded` | Grounded | 2 | `comp-grounded-b` — Text<br>`comp-grounded-d` — Text | no | — | — | — | — |
| 40 | `comp-guiltyConscience` | Guilty Conscience | 3 | `comp-guiltyConscience-b` — Text<br>`comp-guiltyConscience-db` — RollModifier<br>`comp-guiltyConscience-dc` — RollModifier | no | — | — | — | — |
| 41 | `comp-hawkRider` | Hawk Rider | 3 | `comp-hawkRider-b` — Text<br>`comp-hawkRider-da` — Text<br>`comp-hawkRider-db` — RollModifier | no | — | — | — | — |
| 42 | `comp-hostBody` | Host Body | 3 | `comp-hostBody-b` — Text<br>`comp-hostBody-d` — RollModifier<br>`comp-hostBody-mods` — DamageModifier | no | — | — | — | — |
| 43 | `comp-hunted` | Hunted | 3 | `comp-hunted-skill` — SkillChoice<br>`comp-hunted-b` — Text<br>`comp-hunted-d` — Text | **yes** (1) | `comp-hunted-skill`: 1 *(default)* | `comp-hunted-skill`: build *(default)* | `comp-hunted-skill`: [ SkillList.Intrigue ] | `comp-hunted-skill`: `string[]` |
| 44 | `comp-hunter` | Hunter | 3 | `comp-hunter-b1` — SkillChoice<br>`comp-hunter-b2` — RollModifier<br>`comp-hunter-d` — RollModifier | **yes** (1) | `comp-hunter-b1`: 1 *(default)* | `comp-hunter-b1`: build *(default)* | `comp-hunter-b1`: explicit: [ 'Alertness', 'Criminal Underworld', 'Eavesdrop', 'Interrogate', 'Rumors', 'Search', 'Track', 'Society' ] | `comp-hunter-b1`: `string[]` |
| 45 | `comp-indebted` | Indebted | 2 | `comp-indebted-b` — Text<br>`comp-indebted-d` — Text | no | — | — | — | — |
| 46 | `comp-infernalContract` | Infernal Contract | 2 | `comp-infernalContract-b` — Text<br>`comp-infernalContract-d` — Text | no | — | — | — | — |
| 47 | `comp-infernalContractButLikeBad` | Infernal Contract … But, Like, Bad | 6 | `comp-infernalContractButLikeBad-b` — Choice<br>&nbsp;&nbsp;↳ `comp-infernalContractButLikeBad-ba` — Bonus *(option)*<br>&nbsp;&nbsp;↳ `comp-infernalContractButLikeBad-bb` — Bonus *(option)*<br>&nbsp;&nbsp;↳ `comp-infernalContractButLikeBad-bc` — Bonus *(option)*<br>`comp-infernalContractButLikeBad-da` — Text<br>`comp-infernalContractButLikeBad-db` — RollModifier | **yes** (1) | `comp-infernalContractButLikeBad-b`: 1 *(default)* | `comp-infernalContractButLikeBad-b`: build *(default)* | `comp-infernalContractButLikeBad-b`: inline `options[]` | `comp-infernalContractButLikeBad-b`: `Feature[]` |
| 48 | `comp-ivoryTower` | Ivory Tower | 3 | `comp-ivoryTower-skills` — SkillChoice<br>`comp-ivoryTower-lang` — LanguageChoice<br>`comp-ivoryTower-d` — SkillCancelChoice | **yes** (3) | `comp-ivoryTower-skills`: 3<br>`comp-ivoryTower-lang`: 1 *(default)*<br>`comp-ivoryTower-d`: 1 *(default)* | `comp-ivoryTower-skills`: build *(default)*<br>`comp-ivoryTower-lang`: build *(default)*<br>`comp-ivoryTower-d`: build *(default)* | `comp-ivoryTower-skills`: [ SkillList.Crafting, SkillList.Exploration, SkillList.Interpersonal, SkillList.Intrigue, SkillList.Lore ]<br>`comp-ivoryTower-lang`: *default* `allowedTypes` = Common, Regional, Cultural, Dead · `options: [ LanguageType.Dead ]` (ignored by config UI)<br>`comp-ivoryTower-d`: skills the hero knows (`knownSkillsOnly: true`) | `comp-ivoryTower-skills`: `string[]`<br>`comp-ivoryTower-lang`: `string[]`<br>`comp-ivoryTower-d`: `string[]` |
| 49 | `comp-lifebonded` | Lifebonded | 2 | `comp-lifebonded-b` — Text<br>`comp-lifebonded-d` — Text | no | — | — | — | — |
| 50 | `comp-lightningSoul` | Lightning Soul | 4 | `comp-lightningSoul-b` — Multiple<br>&nbsp;&nbsp;↳ `comp-lightningSoul-b1` — SurgeGain<br>&nbsp;&nbsp;↳ `comp-lightningSoul-b2` — Text<br>`comp-lightningSoul-d` — Text | no | — | — | — | — |
| 51 | `comp-loner` | Loner | 2 | `comp-loner-b` — SkillChoice<br>`comp-loner-d` — Text | **yes** (1) | `comp-loner-b`: 1 *(default)* | `comp-loner-b`: build *(default)* | `comp-loner-b`: *default* — all 5 skill lists | `comp-loner-b`: `string[]` |
| 52 | `comp-lostInTime` | Lost in Time | 2 | `comp-lostInTime-b` — Text<br>`comp-lostInTime-d` — Text | no | — | — | — | — |
| 53 | `comp-lostYourHead` | Lost Your Head | 2 | `comp-lostYourHead-b` — Ability<br>`comp-lostYourHead-d` — Text | no | — | — | — | — |
| 54 | `comp-lucky` | Lucky | 2 | `comp-lucky-b` — Text<br>`comp-lucky-d` — RollModifier | no | — | — | — | — |
| 55 | `comp-masterChef` | Master Chef | 3 | `comp-masterChef-skill` — SkillChoice<br>`comp-masterChef-b` — Text<br>`comp-masterChef-d` — Text | **yes** (1) | `comp-masterChef-skill`: 1 *(default)* | `comp-masterChef-skill`: build *(default)* | `comp-masterChef-skill`: *default* — all 5 skill lists | `comp-masterChef-skill`: `string[]` |
| 56 | `comp-meddlingButler` | Meddling Butler | 2 | `comp-meddlingButler-b` — Retainer<br>`comp-meddlingButler-d` — Text | **yes** (1) | `comp-meddlingButler-b`: 1 *(default)* | `comp-meddlingButler-b`: build *(default)* | `comp-meddlingButler-b`: monsters from enabled sourcebooks | `comp-meddlingButler-b`: `Monster \| null` |
| 57 | `comp-medium` | Medium | 2 | `comp-medium-b` — Text<br>`comp-medium-b-ability` — Ability | no | — | — | — | — |
| 58 | `comp-medusaBlood` | Medusa Blood | 2 | `comp-medusaBlood-b` — Ability<br>`comp-medusaBlood-d` — Text | no | — | — | — | — |
| 59 | `comp-misunderstood` | Misunderstood | 2 | `comp-misunderstood-ba` — RollModifier<br>`comp-misunderstood-bb` — RollModifier | no | — | — | — | — |
| 60 | `comp-mundane` | Mundane | 2 | `comp-mundane-b` — DamageModifier<br>`comp-mundane-d` — RollModifier | no | — | — | — | — |
| 61 | `comp-outlaw` | Outlaw | 2 | `comp-outlaw-b` — Bonus<br>`comp-outlaw-d` — Text | no | — | — | — | — |
| 62 | `comp-pirate` | Pirate | 2 | `comp-pirate-b` — Text<br>`comp-pirate-d` — Text | no | — | — | — | — |
| 63 | `comp-preacher` | Preacher | 2 | `comp-preacher-b` — Text<br>`comp-preacher-d` — Text | no | — | — | — | — |
| 64 | `comp-primordial-sickness` | Primordial Sickness | 2 | `comp-primordial-sickness-b` — DamageModifier<br>`comp-primordial-sickness-d` — Bonus | no | — | — | — | — |
| 65 | `comp-prisonerOfTheSynlirii` | Prisoner of the Synlirii | 2 | `comp-prisonerOfTheSynlirii-b` — Text<br>`comp-prisonerOfTheSynlirii-d` — Text | no | — | — | — | — |
| 66 | `comp-promisingApprentice` | Promising Apprentice | 3 | `comp-promisingApprentice-skill` — SkillChoice<br>`comp-promisingApprentice-b` — RollModifier<br>`comp-promisingApprentice-d` — RollModifier | **yes** (1) | `comp-promisingApprentice-skill`: 1 *(default)* | `comp-promisingApprentice-skill`: build *(default)* | `comp-promisingApprentice-skill`: [ SkillList.Crafting ] | `comp-promisingApprentice-skill`: `string[]` |
| 67 | `comp-psychicEruption` | Psychic Eruption | 2 | `comp-psychicEruption-b` — Ability<br>`comp-psychicEruption-d` — Text | no | — | — | — | — |
| 68 | `comp-raisedByBeasts` | Raised by Beasts | 4 | `comp-raisedByBeasts-skill` — SkillChoice<br>`comp-raisedByBeasts-ba` — Text<br>`comp-raisedByBeasts-bb` — RollModifier<br>`comp-raisedByBeasts-d` — Text | **yes** (1) | `comp-raisedByBeasts-skill`: 1 *(default)* | `comp-raisedByBeasts-skill`: build *(default)* | `comp-raisedByBeasts-skill`: *default* — all 5 skill lists | `comp-raisedByBeasts-skill`: `string[]` |
| 69 | `comp-refugee` | Refugee | 2 | `comp-refugee-b` — Text<br>`comp-refugee-d` — Text | no | — | — | — | — |
| 70 | `comp-rival` | Rival | 3 | `comp-rival-b` — Text<br>`comp-rival-da` — Text<br>`comp-rival-db` — RollModifier | no | — | — | — | — |
| 71 | `comp-rogueTalent` | Rogue Talent | 2 | `comp-rogueTalent-b` — Ability<br>`comp-rogueTalent-d` — DamageModifier | no | — | — | — | — |
| 72 | `comp-runaway` | Runaway | 2 | `comp-runaway-b` — SkillChoice<br>`comp-runaway-d` — Text | **yes** (1) | `comp-runaway-b`: 1 *(default)* | `comp-runaway-b`: build *(default)* | `comp-runaway-b`: [ SkillList.Crafting ] | `comp-runaway-b`: `string[]` |
| 73 | `comp-searchingForACure` | Searching for a Cure | 2 | `comp-searchingForACure-b` — Text<br>`comp-searchingForACure-d` — Text | no | — | — | — | — |
| 74 | `comp-secretIdentity` | Secret Identity | 3 | `comp-secretIdentity-skill` — SkillChoice<br>`comp-secretIdentity-b` — Text<br>`comp-secretIdentity-d` — Text | **yes** (1) | `comp-secretIdentity-skill`: 1 *(default)* | `comp-secretIdentity-skill`: build *(default)* | `comp-secretIdentity-skill`: [ SkillList.Intrigue ] | `comp-secretIdentity-skill`: `string[]` |
| 75 | `comp-secretTwin` | Secret Twin | 2 | `comp-secretTwin-b` — ItemChoice<br>`comp-secretTwin-d` — Text | **yes** (1) | `comp-secretTwin-b`: 1 *(default)* | `comp-secretTwin-b`: build *(default)* | `comp-secretTwin-b`: [ ItemType.Trinket1st ] | `comp-secretTwin-b`: `Item[]` |
| 76 | `comp-selfTaught` | Self Taught | 1 | `comp-selfTaught-b` — Text | no | — | — | — | — |
| 77 | `comp-sewerFolk` | Sewer Folk | 2 | `comp-sewerFolk-b` — Text<br>`comp-sewerFolk-d` — DamageModifier | no | — | — | — | — |
| 78 | `comp-shadowBorn` | Shadow Born | 2 | `comp-shadowBorn-b` — SurgeGain<br>`comp-shadowBorn-d` — DamageModifier | no | — | — | — | — |
| 79 | `comp-sharedSpirit` | Shared Spirit | 1 | `comp-sharedSpirit-b` — Text | no | — | — | — | — |
| 80 | `comp-shatteredLegacy` | Shattered Legacy | 4 | `comp-shatteredLegacy-lang` — LanguageChoice<br>`comp-shatteredLegacy-b` — Toggle<br>&nbsp;&nbsp;↳ `comp-shatteredLegacy-b1` — ItemChoice<br>`comp-shatteredLegacy-d` — Text | **yes** (3) | `comp-shatteredLegacy-lang`: 1 *(default)*<br>`comp-shatteredLegacy-b`: n/a<br>`comp-shatteredLegacy-b1`: 1 *(default)* | `comp-shatteredLegacy-lang`: build *(default)*<br>`comp-shatteredLegacy-b`: n/a<br>`comp-shatteredLegacy-b1`: build *(default)* | `comp-shatteredLegacy-lang`: *default* `allowedTypes` = Common, Regional, Cultural, Dead<br>`comp-shatteredLegacy-b`: — (boolean)<br>`comp-shatteredLegacy-b1`: [ ItemType.LeveledArmor, ItemType.LeveledImplement, ItemType.LeveledWeapon, ItemType.Leveled ] | `comp-shatteredLegacy-lang`: `string[]`<br>`comp-shatteredLegacy-b`: `boolean` (`data.checked`)<br>`comp-shatteredLegacy-b1`: `Item[]` |
| 81 | `comp-shipwrecked` | Shipwrecked | 2 | `comp-shipwrecked-b` — SkillChoice<br>`comp-shipwrecked-d` — Text | **yes** (1) | `comp-shipwrecked-b`: 2 | `comp-shipwrecked-b`: build *(default)* | `comp-shipwrecked-b`: [ SkillList.Exploration ] | `comp-shipwrecked-b`: `string[]` |
| 82 | `comp-siblingsShield` | Sibling\'s Shield | 2 | `comp-siblingsShield-b` — Text<br>`comp-siblingsShield-d` — Text | no | — | — | — | — |
| 83 | `comp-silentSentinel` | Silent Sentinel | 5 | `comp-silentSentinel-skill1` — SkillChoice<br>`comp-silentSentinel-skill3` — SkillChoice<br>`comp-silentSentinel-b` — Text<br>`comp-silentSentinel-d` — Text<br>`comp-silentSentinel-mod` — DamageModifier | **yes** (2) | `comp-silentSentinel-skill1`: 2<br>`comp-silentSentinel-skill3`: 1 *(default)* | `comp-silentSentinel-skill1`: build *(default)*<br>`comp-silentSentinel-skill3`: build *(default)* | `comp-silentSentinel-skill1`: *default* — all 5 skill lists<br>`comp-silentSentinel-skill3`: [ SkillList.Lore ] | `comp-silentSentinel-skill1`: `string[]`<br>`comp-silentSentinel-skill3`: `string[]` |
| 84 | `comp-slightCaseOfLycanthropy` | Slight Case of Lycanthropy | 3 | `comp-slightCaseOfLycanthropy-b` — SurgeGain<br>`comp-slightCaseOfLycanthropy-d` — Text<br>`comp-slightCaseOfLycanthropy-s` — Text | no | — | — | — | — |
| 85 | `comp-stolenFace` | Stolen Face | 3 | `comp-stolenFace-ba` — Text<br>`comp-stolenFace-bb` — RollModifier<br>`comp-stolenFace-d` — Text | no | — | — | — | — |
| 86 | `comp-strangeInheritance` | Strange Inheritance | 2 | `comp-strangeInheritance-b` — Text<br>`comp-strangeInheritance-d` — Text | no | — | — | — | — |
| 87 | `comp-strippedOfRank` | Stripped of Rank | 2 | `comp-strippedOfRank-b` — Ability<br>`comp-strippedOfRank-d` — Text | no | — | — | — | — |
| 88 | `comp-thrillSeeker` | Thrill Seeker | 2 | `comp-thrillSeeker-b` — Text<br>`comp-thrillSeeker-d` — Text | no | — | — | — | — |
| 89 | `comp-vampireSire` | Vampire Sire | 3 | `comp-vampireSire-b` — Text<br>`comp-vampireSire-da` — Text<br>`comp-vampireSire-db` — RollModifier | no | — | — | — | — |
| 90 | `comp-hearsVoices` | Voice in your Head | 2 | `comp-hearsVoices-b` — Text<br>`comp-hearsVoices-d` — Text | no | — | — | — | — |
| 91 | `comp-vowOfDuty` | Vow of Duty | 2 | `comp-vowOfDuty-b` — Bonus<br>`comp-vowOfDuty-d` — Text | no | — | — | — | — |
| 92 | `comp-vowOfHonesty` | Vow of Honesty | 4 | `comp-vowOfHonesty-ba` — Text<br>`comp-vowOfHonesty-bb` — RollModifier<br>`comp-vowOfHonesty-da` — Text<br>`comp-vowOfHonesty-db` — RollModifier | no | — | — | — | — |
| 93 | `comp-waking-dreams` | Waking Dreams | 1 | `comp-waking-dreams-ability` — Ability | no | — | — | — | — |
| 94 | `comp-warDogCollar` | War Dog Collar | 3 | `comp-warDogCollar-b` — Text<br>`comp-warDogCollar-ability` — Ability<br>`comp-warDogCollar-d` — Text | no | — | — | — | — |
| 95 | `comp-war-of-assassins` | War Of Assassins | 2 | `comp-war-of-assassins-b` — Text<br>`comp-war-of-assassins-d` — Text | no | — | — | — | — |
| 96 | `comp-ward` | Ward | 2 | `comp-ward-b` — Text<br>`comp-ward-d` — Text | no | — | — | — | — |
| 97 | `comp-waterborn` | Waterborn | 5 | `comp-waterborn-ba` — Text<br>`comp-waterborn-bb` — MovementMode<br>`comp-waterborn-ability` — Ability<br>`comp-waterborn-d` — Text<br>`comp-waterborn-mod` — DamageModifier | no | — | — | — | — |
| 98 | `comp-wodewalker` | Wodewalker | 2 | `comp-wodewalker-b` — Bonus<br>`comp-wodewalker-d` — DamageModifier | no | — | — | — | — |
| 99 | `comp-wrathfulSpirit` | Wrathful Spirit | 3 | `comp-wrathfulSpirit-ba` — RollModifier<br>`comp-wrathfulSpirit-bb` — Text<br>`comp-wrathfulSpirit-d` — Text | no | — | — | — | — |
| 100 | `comp-wronglyImprisoned` | Wrongly Imprisoned | 2 | `comp-wronglyImprisoned-b` — SkillChoice<br>`comp-wronglyImprisoned-d` — Text | **yes** (1) | `comp-wronglyImprisoned-b`: 2 | `comp-wronglyImprisoned-b`: build *(default)* | `comp-wronglyImprisoned-b`: [ SkillList.Crafting, SkillList.Exploration, SkillList.Intrigue, SkillList.Lore ] | `comp-wronglyImprisoned-b`: `string[]` |
**Benefit / drawback modelling — the source models it as *naming convention*, not structure.**
There is no `benefit` / `drawback` field anywhere on `Complication` or `Feature`. The pairing is
carried two redundant, non-enforced ways:

- **Feature `name` suffix** — `"<Complication Name> Benefit"` / `"<Complication Name> Drawback"`.
  79 features are suffixed `Benefit`, 87 `Drawback`, 57 carry no name at all (the factory
  supplies a generic default), 6 are named something else entirely.
- **Feature `id` suffix** — `-b` (79) / `-d` (80), with variants `-ba`/`-bb`/`-b1`/`-b2`,
  `-da`/`-db`/`-dc`, plus semantic suffixes (`-skill`, `-lang`, `-mods`, `-bonus`) on 20 features
  and 11 features with no suffix pattern at all.

Distribution over the 100 complications: **90** have at least one benefit-tagged **and** at
least one drawback-tagged feature; **6** have only benefit-tagged features; **2** only
drawback-tagged; **2** neither. **9 complications carry exactly one feature**, of which three
(`comp-advanced-studies-1`, `comp-curseOfMisfortune-b`, `comp-curseOfPoverty-b`) are explicitly
named `"… Benefit and Drawback"` — a single feature holding both halves. Six single-feature
complications carry only a benefit-shaped feature with the drawback presumably living in the
`description` prose (`comp-feytouched`, `comp-fire-and-chaos`, `comp-greening`,
`comp-selfTaught`, `comp-sharedSpirit`, `comp-waking-dreams`), plus `comp-frostheart` and
`comp-misunderstood` at two features each.

**Design consequence:** if our UI wants to render benefit and drawback in separate panes, the
split has to be *authored* against our pin, not derived from Forge Steel's structure. Deriving
it from the name suffix will mis-file at least 10 of the 100.

### Titles — all 68

`echelon` values in the pool: **24 × 1, 19 × 2, 13 × 3, 12 × 4**. All 68 have non-empty
`prerequisites` prose and `selectedFeatureID: ''`.

The **Feature IDs** column is the option list the player picks *one* of (top-level entries only
are options; `↳` rows are contents of an option). Counts: 16 titles offer 1 option (auto-selected
by the UI), 4 offer 2, 32 offer 3, 14 offer 4, 1 offers 5, 1 offers 6.

| # | ID | Name | Echelon | Options | Feature IDs → FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `title-ancient-loremaster` | Ancient Loremaster | 1 | 3 | `title-ancient-loremaster-1` — Text<br>`title-ancient-loremaster-2` — Text<br>`title-ancient-loremaster-3` — Multiple<br>&nbsp;&nbsp;↳ `title-ancient-loremaster-3a` — Text<br>&nbsp;&nbsp;↳ `title-ancient-loremaster-3b` — RollModifier<br>&nbsp;&nbsp;↳ `title-ancient-loremaster-3c` — RollModifier | no | — | — | — | — |
| 2 | `title-angler` | Angler | 1 | 1 | `title-angler-1` — RollModifier | no | — | — | — | — |
| 3 | `title-battleaxe-diplomat` | Battleaxe Diplomat | 1 | 3 | `title-battleaxe-diplomat-1` — Text<br>`title-battleaxe-diplomat-2` — RollModifier<br>`title-battleaxe-diplomat-3` — RollModifier | no | — | — | — | — |
| 4 | `title-brawler` | Brawler | 1 | 4 | `title-brawler-1` — Ability<br>`title-brawler-2` — Text<br>`title-brawler-3` — Text<br>`title-brawler-4` — RollModifier | no | — | — | — | — |
| 5 | `title-city-rat` | City Rat | 1 | 3 | `title-city-rat-1` — Text<br>`title-city-rat-2` — RollModifier<br>`title-city-rat-3` — Text | no | — | — | — | — |
| 6 | `title-doomed` | Doomed | 1 | 1 | `title-doomed-1` — Text | no | — | — | — | — |
| 7 | `title-dwarf-legionnaire` | Dwarf Legionnaire | 1 | 3 | `title-dwarf-legionnaire-1` — Toggle<br>&nbsp;&nbsp;↳ `title-dwarf-legionnaire-1a` — Bonus<br>`title-dwarf-legionnaire-2` — Text<br>`title-dwarf-legionnaire-3` — Ability | **yes** (1) | `title-dwarf-legionnaire-1`: n/a | `title-dwarf-legionnaire-1`: n/a | `title-dwarf-legionnaire-1`: — (boolean) | `title-dwarf-legionnaire-1`: `boolean` (`data.checked`) |
| 8 | `title-elemental-dabbler` | Elemental Dabbler | 1 | 3 | `title-elemental-dabbler-1` — Text<br>`title-elemental-dabbler-2` — Text<br>`title-elemental-dabbler-3` — Text | no | — | — | — | — |
| 9 | `title-faction-member` | Faction Member | 1 | 4 | `title-faction-member-1` — Text<br>`title-faction-member-2` — Text<br>`title-faction-member-3` — Text<br>`title-faction-member-4` — Text | no | — | — | — | — |
| 10 | `title-goldenrod` | Goldenrod | 1 | 1 | `title-goldenrod-1` — Text | no | — | — | — | — |
| 11 | `title-local-hero` | Local Hero | 1 | 3 | `title-local-hero-1` — Text<br>`title-local-hero-2` — RollModifier<br>`title-local-hero-3` — Bonus | no | — | — | — | — |
| 12 | `title-mage-hunter` | Mage Hunter | 1 | 3 | `title-mage-hunter-1` — Text<br>`title-mage-hunter-2` — Ability<br>`title-mage-hunter-3` — Multiple<br>&nbsp;&nbsp;↳ `title-mage-hunter-3-1` — Ability<br>&nbsp;&nbsp;↳ `title-mage-hunter-3-2` — Text | no | — | — | — | — |
| 13 | `title-marshal` | Marshal | 1 | 4 | `title-marshal-1` — Text<br>`title-marshal-2` — Ability<br>`title-marshal-3` — Text<br>`title-marshal-4` — RollModifier | no | — | — | — | — |
| 14 | `title-master-of-reels` | Master of Reels | 1 | 1 | `title-master-of-reels-1` — Text | no | — | — | — | — |
| 15 | `title-monster-bane` | Monster Bane | 1 | 3 | `title-monster-bane-1` — Text<br>`title-monster-bane-2` — RollModifier<br>`title-monster-bane-3` — RollModifier | no | — | — | — | — |
| 16 | `title-owed-a-favor` | Owed a Favor | 1 | 1 | `title-owed-a-favor-1` — Text | no | — | — | — | — |
| 17 | `title-presumed-dead` | Presumed Dead | 1 | 1 | `title-presumed-dead-1` — Text | no | — | — | — | — |
| 18 | `title-ratcatcher` | Ratcatcher | 1 | 3 | `title-ratcatcher-1` — Text<br>`title-ratcatcher-2` — Text<br>`title-ratcatcher-3` — Ability | no | — | — | — | — |
| 19 | `title-saved-for-a-worse-fate` | Saved for a Worse Fate | 1 | 4 | `title-saved-for-a-worse-fate-1` — Text<br>`title-saved-for-a-worse-fate-2` — Text<br>`title-saved-for-a-worse-fate-3` — Text<br>`title-saved-for-a-worse-fate-4` — Text | no | — | — | — | — |
| 20 | `title-ship-captain` | Ship Captain | 1 | 4 | `title-ship-captain-1` — Multiple<br>&nbsp;&nbsp;↳ `title-ship-captain-1a` — Text<br>&nbsp;&nbsp;↳ `title-ship-captain-1b` — MovementMode<br>`title-ship-captain-2` — Text<br>`title-ship-captain-3` — Multiple<br>&nbsp;&nbsp;↳ `title-ship-captain-3a` — Text<br>&nbsp;&nbsp;↳ `title-ship-captain-3b` — RollModifier<br>`title-ship-captain-4` — RollModifier | no | — | — | — | — |
| 21 | `title-troupe-tactics` | Troupe Leading Player | 1 | 4 | `title-troupe-tactics-1` — Ability<br>`title-troupe-tactics-2` — Text<br>`title-troupe-tactics-3` — RollModifier<br>`title-troupe-tactics-4` — RollModifier | no | — | — | — | — |
| 22 | `title-wanted-dead-or-alive` | Wanted Dead or Alive | 1 | 3 | `title-wanted-dead-or-alive-1` — Text<br>`title-wanted-dead-or-alive-2` — Text<br>`title-wanted-dead-or-alive-3` — Multiple<br>&nbsp;&nbsp;↳ `title-wanted-dead-or-alive-3a` — RollModifier<br>&nbsp;&nbsp;↳ `title-wanted-dead-or-alive-3b` — Text | no | — | — | — | — |
| 23 | `title-zombie-slayer` | Zombie Slayer | 1 | 3 | `title-zombie-slayer-1` — Text<br>`title-zombie-slayer-2` — Multiple<br>&nbsp;&nbsp;↳ `title-zombie-slayer-2-1` — Text<br>&nbsp;&nbsp;↳ `title-zombie-slayer-2-2` — DamageModifier<br>`title-zombie-slayer-3` — Ability | no | — | — | — | — |
| 24 | `title-arena-fighter` | Arena Fighter | 2 | 4 | `title-arena-fighter-1` — Text<br>`title-arena-fighter-2` — Text<br>`title-arena-fighter-3` — Bonus<br>`title-arena-fighter-4` — Ability | no | — | — | — | — |
| 25 | `title-awakened` | Awakened | 2 | 3 | `title-awakened-1` — Text<br>`title-awakened-2` — Text<br>`title-awakened-3` — Ability | no | — | — | — | — |
| 26 | `title-battlefield-commander` | Battlefield Commander | 2 | 3 | `title-battlefield-commander-1` — Ability<br>`title-battlefield-commander-2` — Bonus<br>`title-battlefield-commander-3` — Text | no | — | — | — | — |
| 27 | `title-blood-bagic` | Blood Magic | 2 | 3 | `title-blood-magic-1` — Text<br>`title-blood-magic-2` — Text<br>`title-blood-magic-3` — DamageModifier | no | — | — | — | — |
| 28 | `title-corsair` | Corsair | 2 | 4 | `title-corsair-1` — Text<br>`title-corsair-2` — Text<br>`title-corsair-3` — Bonus<br>`title-corsair-4` — Multiple<br>&nbsp;&nbsp;↳ `title-corsair-4a` — Text<br>&nbsp;&nbsp;↳ `title-corsair-4b` — RollModifier | no | — | — | — | — |
| 29 | `title-faction-officer` | Faction Officer | 2 | 2 | `title-faction-officer-1` — Text<br>`title-faction-officer-2` — Multiple<br>&nbsp;&nbsp;↳ `title-faction-officer-2a` — Text<br>&nbsp;&nbsp;↳ `title-faction-officer-2b` — RollModifier | no | — | — | — | — |
| 30 | `title-fey-friend` | Fey Friend | 2 | 3 | `title-fey-friend-1` — Multiple<br>&nbsp;&nbsp;↳ `title-fey-friend-1-1` — LanguageChoice<br>&nbsp;&nbsp;↳ `title-fey-friend-1-2` — SkillChoice<br>`title-fey-friend-2` — Multiple<br>&nbsp;&nbsp;↳ `title-fey-friend-2-1` — LanguageChoice<br>&nbsp;&nbsp;↳ `title-fey-friend-2-2` — PotencyResistance<br>`title-fey-friend-3` — Multiple<br>&nbsp;&nbsp;↳ `title-fey-friend-3-1` — LanguageChoice<br>&nbsp;&nbsp;↳ `title-fey-friend-3-2` — RollModifier | **yes** (4) | `title-fey-friend-1-1`: 1 *(default)*<br>`title-fey-friend-1-2`: 1 *(default)*<br>`title-fey-friend-2-1`: 1 *(default)*<br>`title-fey-friend-3-1`: 1 *(default)* | `title-fey-friend-1-1`: build *(default)*<br>`title-fey-friend-1-2`: build *(default)*<br>`title-fey-friend-2-1`: build *(default)*<br>`title-fey-friend-3-1`: build *(default)* | `title-fey-friend-1-1`: *default* `allowedTypes` = Common, Regional, Cultural, Dead<br>`title-fey-friend-1-2`: [ SkillList.Interpersonal ]<br>`title-fey-friend-2-1`: *default* `allowedTypes` = Common, Regional, Cultural, Dead<br>`title-fey-friend-3-1`: *default* `allowedTypes` = Common, Regional, Cultural, Dead | `title-fey-friend-1-1`: `string[]`<br>`title-fey-friend-1-2`: `string[]`<br>`title-fey-friend-2-1`: `string[]`<br>`title-fey-friend-3-1`: `string[]` |
| 31 | `title-giant-slayer` | Giant Slayer | 2 | 3 | `title-giant-slayer-1` — Text<br>`title-giant-slayer-2` — Ability<br>`title-giant-slayer-3` — Text | no | — | — | — | — |
| 32 | `title-godsworn` | Godsworn | 2 | 3 | `title-godsworn-1` — Text<br>`title-godsworn-2` — Ability<br>`title-godsworn-3` — Multiple<br>&nbsp;&nbsp;↳ `title-godsworn-3a` — Domain<br>&nbsp;&nbsp;↳ `title-godsworn-3b` — DomainFeature | **yes** (2) | `title-godsworn-3a`: 1 *(default)*<br>`title-godsworn-3b`: 1 *(default)* | `title-godsworn-3a`: build *(default)*<br>`title-godsworn-3b`: build *(default)* | `title-godsworn-3a`: domains from enabled sourcebooks<br>`title-godsworn-3b`: level-1 domain features | `title-godsworn-3a`: `Domain[]`<br>`title-godsworn-3b`: `Feature[]` |
| 33 | `title-heist-hero` | Heist Hero | 2 | 3 | `title-heist-hero-1` — Text<br>`title-heist-hero-2` — Text<br>`title-heist-hero-3` — Ability | no | — | — | — | — |
| 34 | `title-knight` | Knight | 2 | 3 | `title-knight-1` — Bonus<br>`title-knight-2` — Bonus<br>`title-knight-3` — Ability | no | — | — | — | — |
| 35 | `title-master-librarian` | Master Librarian | 2 | 4 | `title-master-librarian-1` — Text<br>`title-master-librarian-2` — Text<br>`title-master-librarian-3` — SkillChoice<br>`title-master-librarian-4` — LanguageChoice | **yes** (2) | `title-master-librarian-3`: 1 *(default)*<br>`title-master-librarian-4`: 2 | `title-master-librarian-3`: build *(default)*<br>`title-master-librarian-4`: build *(default)* | `title-master-librarian-3`: [ SkillList.Lore ]<br>`title-master-librarian-4`: *default* `allowedTypes` = Common, Regional, Cultural, Dead | `title-master-librarian-3`: `string[]`<br>`title-master-librarian-4`: `string[]` |
| 36 | `title-special-agent` | Special Agent | 2 | 3 | `title-special-agent-1` — Text<br>`title-special-agent-2` — Text<br>`title-special-agent-3` — Text | no | — | — | — | — |
| 37 | `title-sworn-hunter` | Sworn Hunter | 2 | 3 | `title-sworn-hunter-1` — Ability<br>`title-sworn-hunter-2` — SkillChoice<br>`title-sworn-hunter-3` — Text | **yes** (1) | `title-sworn-hunter-2`: 1 *(default)* | `title-sworn-hunter-2`: build *(default)* | `title-sworn-hunter-2`: [ SkillList.Intrigue ] | `title-sworn-hunter-2`: `string[]` |
| 38 | `title-undead-slain` | Undead Slain | 2 | 3 | `title-undead-slain-1` — Text<br>`title-undead-slain-2` — Text<br>`title-undead-slain-3` — Text | no | — | — | — | — |
| 39 | `title-unstoppable` | Unstoppable | 2 | 3 | `title-unstoppable-1` — Text<br>`title-unstoppable-2` — Text<br>`title-unstoppable-3` — Text | no | — | — | — | — |
| 40 | `title-armed-and-dangerous` | Armed and Dangerous | 3 | 1 | `title-armed-and-dangerous-1` — Text | no | — | — | — | — |
| 41 | `title-back-from-the-grave` | Back from the Grave | 3 | 1 | `title-back-from-the-grave-1` — Text | no | — | — | — | — |
| 42 | `title-demon-slayer` | Demon Slayer | 3 | 6 | `title-demon-slayer-1a` — Language<br>`title-demon-slayer-1` — Text<br>`title-demon-slayer-2` — Text<br>`title-demon-slayer-3` — Text<br>`title-demon-slayer-4` — Text<br>`title-demon-slayer-5` — Text | no | — | — | — | — |
| 43 | `title-diabolist` | Diabolist | 3 | 5 | `title-diabolist-1a` — Language<br>`title-diabolist-1` — Text<br>`title-diabolist-2` — Text<br>`title-diabolist-3` — Text<br>`title-diabolist-4` — Text | no | — | — | — | — |
| 44 | `title-dragon-blooded` | Dragon Blooded | 3 | 2 | `title-dragon-blooded-1` — Text<br>`title-dragon-blooded-2` — Text | no | — | — | — | — |
| 45 | `title-fleet-admiral` | Fleet Admiral | 3 | 4 | `title-fleet-admiral-1` — Text<br>`title-fleet-admiral-2` — Multiple<br>&nbsp;&nbsp;↳ `title-fleet-admiral-2a` — Text<br>&nbsp;&nbsp;↳ `title-fleet-admiral-2b` — MovementMode<br>`title-fleet-admiral-3` — Bonus<br>`title-fleet-admiral-4` — Text | no | — | — | — | — |
| 46 | `title-maestro` | Maestro | 2 | 3 | `title-maestro-1` — Text<br>`title-maestro-2` — Ability<br>`title-maestro-3` — Text | no | — | — | — | — |
| 47 | `title-master-crafter` | Master Crafter | 3 | 4 | `title-master-crafter-1` — Text<br>`title-master-crafter-2` — Text<br>`title-master-crafter-3` — Text<br>`title-master-crafter-4` — Text | no | — | — | — | — |
| 48 | `title-noble` | Noble | 3 | 4 | `title-noble-1` — RollModifier<br>`title-noble-2` — Multiple<br>&nbsp;&nbsp;↳ `title-noble-2a` — Bonus<br>&nbsp;&nbsp;↳ `title-noble-2b` — Bonus<br>`title-noble-3` — Text<br>`title-noble-4` — Text | no | — | — | — | — |
| 49 | `title-planar-voyager` | Planar Voyager | 3 | 3 | `title-planar-voyager-1` — Text<br>`title-planar-voyager-2` — Text<br>`title-planar-voyager-3` — Text | no | — | — | — | — |
| 50 | `title-scarred` | Scarred | 3 | 2 | `title-scarred-1` — Multiple<br>&nbsp;&nbsp;↳ `title-scarred-1a` — Text<br>&nbsp;&nbsp;↳ `title-scarred-1b` — Bonus<br>`title-scarred-2` — Text | no | — | — | — | — |
| 51 | `title-siege-breaker` | Siege Breaker | 3 | 3 | `title-siege-breaker-1` — Text<br>`title-siege-breaker-2` — Toggle<br>&nbsp;&nbsp;↳ `title-siege-breaker-2a` — Bonus<br>`title-siege-breaker-3` — Text | **yes** (1) | `title-siege-breaker-2`: n/a | `title-siege-breaker-2`: n/a | `title-siege-breaker-2`: — (boolean) | `title-siege-breaker-2`: `boolean` (`data.checked`) |
| 52 | `title-teacher` | Teacher | 3 | 1 | `title-teacher-1` — Text | no | — | — | — | — |
| 53 | `title-champion-competitor` | Champion Competitor | 4 | 3 | `title-champion-competitor-1` — Text<br>`title-champion-competitor-2` — Multiple<br>&nbsp;&nbsp;↳ `title-champion-competitor-2a` — Text<br>&nbsp;&nbsp;↳ `title-champion-competitor-2b` — Bonus<br>&nbsp;&nbsp;↳ `title-champion-competitor-2c` — Bonus<br>`title-champion-competitor-3` — Text | no | — | — | — | — |
| 54 | `title-demigod` | Demigod | 4 | 1 | `title-demigod-1` — Multiple<br>&nbsp;&nbsp;↳ `title-demigod-1a` — Text<br>&nbsp;&nbsp;↳ `title-demigod-1b` — Text<br>&nbsp;&nbsp;↳ `title-demigod-1c` — Text<br>&nbsp;&nbsp;↳ `title-demigod-1d` — Choice<br>&nbsp;&nbsp;↳ &nbsp;&nbsp;↳ `title-demigod-1da` — Text *(option)*<br>&nbsp;&nbsp;↳ &nbsp;&nbsp;↳ `title-demigod-1db` — Text *(option)*<br>&nbsp;&nbsp;↳ &nbsp;&nbsp;↳ `title-demigod-1dc` — Bonus *(option)* | **yes** (1) | `title-demigod-1d`: 1 *(default)* | `title-demigod-1d`: build *(default)* | `title-demigod-1d`: inline `options[]` | `title-demigod-1d`: `Feature[]` |
| 55 | `title-enlightened` | Enlightened | 4 | 3 | `title-enlightened-1` — Text<br>`title-enlightened-2` — Text<br>`title-enlightened-3` — Text | no | — | — | — | — |
| 56 | `title-forsaken` | Forsaken | 4 | 3 | `title-forsaken-1` — Text<br>`title-forsaken-2` — Text<br>`title-forsaken-3` — Text | no | — | — | — | — |
| 57 | `title-monarch` | Monarch | 4 | 4 | `title-monarch-1` — Text<br>`title-monarch-2` — Multiple<br>&nbsp;&nbsp;↳ `title-monarch-2a` — Text<br>&nbsp;&nbsp;↳ `title-monarch-2b` — Bonus<br>`title-monarch-3` — Text<br>`title-monarch-4` — Multiple<br>&nbsp;&nbsp;↳ `title-monarch-4a` — Text<br>&nbsp;&nbsp;↳ `title-monarch-4b` — Bonus | no | — | — | — | — |
| 58 | `title-peace-bringer` | Peace Bringer | 4 | 4 | `title-peace-bringer-1` — Text<br>`title-peace-bringer-2` — Text<br>`title-peace-bringer-3` — Text<br>`title-peace-bringer-4` — Text | no | — | — | — | — |
| 59 | `title-reborn` | Reborn | 4 | 2 | `title-reborn-1` — Text<br>`title-reborn-2` — Choice<br>&nbsp;&nbsp;↳ `title-reborn-2a` — ItemChoice *(option)*<br>&nbsp;&nbsp;↳ `title-reborn-2b` — Text *(option)*<br>&nbsp;&nbsp;↳ `title-reborn-2c` — SkillChoice *(option)* | **yes** (3) | `title-reborn-2`: 1 *(default)*<br>`title-reborn-2a`: 1 *(default)*<br>`title-reborn-2c`: 2 | `title-reborn-2`: build *(default)*<br>`title-reborn-2a`: build *(default)*<br>`title-reborn-2c`: build *(default)* | `title-reborn-2`: inline `options[]`<br>`title-reborn-2a`: [ ItemType.Leveled, ItemType.LeveledArmor, ItemType.LeveledImplement, ItemType.LeveledWeapon ]<br>`title-reborn-2c`: *default* — all 5 skill lists | `title-reborn-2`: `Feature[]`<br>`title-reborn-2a`: `Item[]`<br>`title-reborn-2c`: `string[]` |
| 60 | `title-theoretical-warrior` | Theoretical Warrior | 4 | 1 | `title-theoretical-warrior-1` — Text | no | — | — | — | — |
| 61 | `title-tireless` | Tireless | 4 | 3 | `title-tireless-1` — Text<br>`title-tireless-2` — Text<br>`title-tireless-3` — Text | no | — | — | — | — |
| 62 | `title-unchained` | Unchained | 4 | 3 | `title-unchained-1` — Text<br>`title-unchained-2` — Text<br>`title-unchained-3` — Text | no | — | — | — | — |
| 63 | `title-safeguarded` | Safeguarded | 1 | 1 | `title-safeguarded-1` — Text | no | — | — | — | — |
| 64 | `title-sigilwright` | Sigilwright | 2 | 3 | `title-sigilwright-1` — Text<br>`title-sigilwright-2` — Text<br>`title-sigilwright-3` — Multiple<br>&nbsp;&nbsp;↳ `title-sigilwright-3a` — RollModifier<br>&nbsp;&nbsp;↳ `title-sigilwright-3b` — RollModifier | no | — | — | — | — |
| 65 | `title-summoner-successor` | Summoner Successor | 2 | 1 | `title-summoner-successor-1` — Text | no | — | — | — | — |
| 66 | `title-ringleader` | Ringleader | 3 | 1 | `title-ringleader-1` — Multiple<br>&nbsp;&nbsp;↳ `title-ringleader-1a` — Text<br>&nbsp;&nbsp;↳ `title-ringleader-1b` — Choice<br>&nbsp;&nbsp;↳ &nbsp;&nbsp;↳ `title-ringleader-1b-1` — Text *(option)*<br>&nbsp;&nbsp;↳ &nbsp;&nbsp;↳ `title-ringleader-1b-2` — Text *(option)*<br>&nbsp;&nbsp;↳ &nbsp;&nbsp;↳ `title-ringleader-1b-3` — Text *(option)* | **yes** (1) | `title-ringleader-1b`: 1 *(default)* | `title-ringleader-1b`: build *(default)* | `title-ringleader-1b`: inline `options[]` | `title-ringleader-1b`: `Feature[]` |
| 67 | `title-delegator` | Delegator | 4 | 1 | `title-delegator-1` — Text | no | — | — | — | — |
| 68 | `title-high-summoner` | High Summoner of the Circle | 4 | 1 | `title-high-summoner-1` — Multiple<br>&nbsp;&nbsp;↳ `title-high-summoner-1a` — Text<br>&nbsp;&nbsp;↳ `title-high-summoner-1b` — Choice<br>&nbsp;&nbsp;↳ &nbsp;&nbsp;↳ `title-high-summoner-1b-1` — Text *(option)*<br>&nbsp;&nbsp;↳ &nbsp;&nbsp;↳ `title-high-summoner-1b-2` — Text *(option)*<br>&nbsp;&nbsp;↳ &nbsp;&nbsp;↳ `title-high-summoner-1b-3` — Text *(option)* | **yes** (1) | `title-high-summoner-1b`: 1 *(default)* | `title-high-summoner-1b`: build *(default)* | `title-high-summoner-1b`: inline `options[]` | `title-high-summoner-1b`: `Feature[]` |
#### Echelon gating — the part that matters for the builder UI

`CreatureLogic.getEchelon(level) = max(1, min(4, floor((level - 1) / 3) + 1))`

| Class level | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Echelon | 1 | 1 | 1 | 2 | 2 | 2 | 3 | 3 | 3 | 4 |

Hero level is read as `hero.class?.level ?? 1` — a hero **without a class has echelon 1**.

Forge Steel then applies **two different and mutually inconsistent echelon predicates**:

| Surface | Predicate | Effect |
|---|---|---|
| `hero-titles-modal.tsx` — "Checklist" expander | `title.echelon <= heroEchelon` | **Cumulative.** Shows every title the hero has reached, with its prerequisites prose, as a to-earn checklist. |
| `title-select-modal.tsx` — the actual picker | `title.echelon === selectedEchelon` | **Exact band only.** `selectedEchelon` is a `NumberSpin` (min 1, max 4) *initialised* to the hero's echelon but freely overridable by the user, so it is a **default, not a gate**. A level-1 hero can spin to echelon 4 and take a demigod title. |

There is **no gate at all on effect application**: `HeroLogic.getFeatures` walks
`hero.state.titles` unconditionally and adds the selected feature of every title, whatever its
echelon and whatever the hero's level.

Additional picker rules:

- Already-held titles are excluded by id (`currentTitleIDs` from `HeroLogic.getTitles`, which
  unions `hero.state.titles` with any legacy `TitleChoice` selections).
- A synthetic **"Custom Title"** is prepended to every result list, stamped with the currently
  selected echelon and one blank `Text` feature.
- Selecting a title with exactly **one** feature auto-sets `selectedFeatureID` and commits
  immediately; with **2+** features the modal switches to a second step showing an
  `Alert: "This title has multiple options; choose one of them."` and a `SelectablePanel` per
  option. **The commit fires on the title selection in the 1-option case and on the feature
  selection otherwise — a title with 2+ options is never committed un-chosen.**
- Search matches `name` + `description` only, not `prerequisites`.

**Our builder should treat echelon as a derived, cumulative availability band** (`title.echelon <= getEchelon(level)`), keep the exact-band spinner only as a *filter* affordance, and decide
explicitly whether awarding a title above the hero's echelon is refused or warned. Per our
permissive-engine principle the answer is almost certainly **warn, never block** — the Director
awards titles, and Draw Steel's title prerequisites are narrative, not mechanical.

### Perks — all 47

`selectAt` is `'build'` (factory default) everywhere except `perk-eidetic-memory`, which sets
`'respite'` explicitly — the single respite-rechosen selection in this whole subject.

| # | ID | Name | List | FeatureType | `data` shape | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `perk-area-of-expertise` | Area of Expertise | Crafting | Text | `null` | no | — | — | — | — |
| 2 | `perk-expert-artisan` | Expert Artisan | Crafting | Text | `null` | no | — | — | — | — |
| 3 | `perk-handy` | Handy | Crafting | Text | `null` | no | — | — | — | — |
| 4 | `perk-improvisation-creation` | Improvisation Creation | Crafting | Text | `null` | no | — | — | — | — |
| 5 | `perk-inspired-artisan` | Inspired Artisan | Crafting | Text | `null` | no | — | — | — | — |
| 6 | `perk-travelling-artisan` | Travelling Artisan | Crafting | Text | `null` | no | — | — | — | — |
| 7 | `perk-brawny` | Brawny | Exploration | Text | `null` | no | — | — | — | — |
| 8 | `perk-camouflage-hunter` | Camouflage Hunter | Exploration | Text | `null` | no | — | — | — | — |
| 9 | `perk-danger-sense` | Danger Sense | Exploration | Text | `null` | no | — | — | — | — |
| 10 | `perk-friend-catapult` | Friend Catapult | Exploration | Ability | `{ ability: Ability }` | no | — | — | — | — |
| 11 | `perk-ive-got-you` | I\'ve Got You | Exploration | Ability | `{ ability: Ability }` | no | — | — | — | — |
| 12 | `perk-monster-whisperer` | Monster Whisperer | Exploration | Text | `null` | no | — | — | — | — |
| 13 | `perk-put-your-back-into-it` | Put Your Back Into It | Exploration | Text | `null` | no | — | — | — | — |
| 14 | `perk-team-leader` | Team Leader | Exploration | Text | `null` | no | — | — | — | — |
| 15 | `perk-teamwork` | Teamwork | Exploration | Text | `null` | no | — | — | — | — |
| 16 | `perk-wood-wise` | Wood Wise | Exploration | Text | `null` | no | — | — | — | — |
| 17 | `perk-charming-liar` | Charming Liar | Interpersonal | Text | `null` | no | — | — | — | — |
| 18 | `perk-dazzler` | Dazzler | Interpersonal | Text | `null` | no | — | — | — | — |
| 19 | `perk-engrossing-monologue` | Engrossing Monologue | Interpersonal | Text | `null` | no | — | — | — | — |
| 20 | `perk-harmonizer` | Harmonizer | Interpersonal | Text | `null` | no | — | — | — | — |
| 21 | `perk-lie-detector` | Lie Detector | Interpersonal | Text | `null` | no | — | — | — | — |
| 22 | `perk-open-book` | Open Book | Interpersonal | Text | `null` | no | — | — | — | — |
| 23 | `perk-pardon-my-friend` | Pardon My Friend | Interpersonal | Text | `null` | no | — | — | — | — |
| 24 | `perk-power-player` | Power Player | Interpersonal | Text | `null` | no | — | — | — | — |
| 25 | `perk-so-tell-me` | So, Tell Me ... | Interpersonal | Text | `null` | no | — | — | — | — |
| 26 | `perk-spot-the-tell` | Spot The Tell | Interpersonal | Text | `null` | no | — | — | — | — |
| 27 | `perk-criminal-contacts` | Criminal Contacts | Intrigue | Text | `null` | no | — | — | — | — |
| 28 | `perk-forgettable-face` | Forgettable Face | Intrigue | Text | `null` | no | — | — | — | — |
| 29 | `perk-gum-up-the-works` | Gum Up The Works | Intrigue | Ability | `{ ability: Ability }` | no | — | — | — | — |
| 30 | `perk-lucky-dog` | Lucky Dog | Intrigue | Text | `null` | no | — | — | — | — |
| 31 | `perk-master-of-disguise` | Master of Disguise | Intrigue | Text | `null` | no | — | — | — | — |
| 32 | `perk-slipped-lead` | Slipped Lead | Intrigue | Text | `null` | no | — | — | — | — |
| 33 | `perk-but-i-know-who-does` | But I Know Who Does | Lore | Text | `null` | no | — | — | — | — |
| 34 | `perk-eidetic-memory` | Eidetic Memory | Lore | SkillChoice | `FeatureSkillChoiceData` | **yes** | 1 | **respite** | `[ SkillList.Lore ]` | `string[]` |
| 35 | `perk-expert-sage` | Expert Sage | Lore | Text | `null` | no | — | — | — | — |
| 36 | `perk-ive-read-about-this-place` | I\'ve Read About This Place | Lore | Text | `null` | no | — | — | — | — |
| 37 | `perk-linguist` | Linguist | Lore | Multiple | `{ features: Feature[] }` | **yes** (nested `perk-linguist-2` LanguageChoice) | 2 | build *(default)* | *default* `allowedTypes` = Common, Regional, Cultural, Dead | `string[]` |
| 38 | `perk-polymath` | Polymath | Lore | Text | `null` | no | — | — | — | — |
| 39 | `perk-specialist` | Specialist | Lore | Text | `null` | no | — | — | — | — |
| 40 | `perk-travelling-sage` | Travelling Sage | Lore | Text | `null` | no | — | — | — | — |
| 41 | `perk-arcane-trick` | Arcane Trick | Supernatural | Ability | `{ ability: Ability }` | no | — | — | — | — |
| 42 | `perk-creature-sense` | Creature Sense | Supernatural | Ability | `{ ability: Ability }` | no | — | — | — | — |
| 43 | `perk-familiar` | Familiar | Supernatural | Summon | `{ summons: Summon[] }` | no | — | — | — | — |
| 44 | `perk-invisible-force` | Invisible Force | Supernatural | Ability | `{ ability: Ability }` | no | — | — | — | — |
| 45 | `perk-psychic-whisper` | Psychic Whisper | Supernatural | Ability | `{ ability: Ability }` | no | — | — | — | — |
| 46 | `perk-ritualist` | Ritualist | Supernatural | Text | `null` | no | — | — | — | — |
| 47 | `perk-thingspeaker` | Thingspeaker | Supernatural | Text | `null` | no | — | — | — | — |
Per-list counts: **Crafting 6, Exploration 10, Interpersonal 10, Intrigue 6, Lore 8,
Supernatural 7 = 47. Special 0.**

`perk-linguist` is the only perk whose `data` nests another choice
(`perk-linguist-2`, a `LanguageChoice` with `count: 2`). `perk-familiar` is the only perk that
nests a whole `Summon` (a level-0, size 1T monster with `cost: 0, count: 1`, whose own
`features[]` include a `Bonus` on Stamina with `value: 2, valuePerLevel: 2` — i.e. a perk that
scales with hero level).

#### Perk grant sites — where the level progression actually lives

`FeaturePerk` appears **89 times** across `src/data`. Core sourcebook grants (18 careers × 1 +
9 classes × 5 = **63**):

| Granting element | Kind | Level | Feature ID | `lists` | `count` |
|---|---|---|---|---|---|
| Agent | Career | — | `career-agent-feature-5` | `[ PerkList.Intrigue ]` | 1 (default) |
| Aristocrat | Career | — | `career-aristocrat-feature-6` | `[ PerkList.Lore ]` | 1 (default) |
| Artisan | Career | — | `career-artisan-feature-4` | `[ PerkList.Crafting ]` | 1 (default) |
| Beggar | Career | — | `career-beggar-feature-5` | `[ PerkList.Interpersonal ]` | 1 (default) |
| Criminal | Career | — | `career-criminal-feature-5` | `[ PerkList.Intrigue ]` | 1 (default) |
| Disciple | Career | — | `career-disciple-feature-4` | `[ PerkList.Supernatural ]` | 1 (default) |
| Explorer | Career | — | `career-explorer-feature-4` | `[ PerkList.Exploration ]` | 1 (default) |
| Farmer | Career | — | `career-farmer-feature-5` | `[ PerkList.Exploration ]` | 1 (default) |
| Gladiator | Career | — | `gladiator-feature-4` | `[ PerkList.Exploration ]` | 1 (default) |
| Laborer | Career | — | `laborer-feature-5` | `[ PerkList.Exploration ]` | 1 (default) |
| Mage's Apprentice | Career | — | `mages-apprentice-feature-5` | `[ PerkList.Supernatural ]` | 1 (default) |
| Performer | Career | — | `performer-feature-4` | `[ PerkList.Interpersonal ]` | 1 (default) |
| Politician | Career | — | `career-politician-feature-5` | `[ PerkList.Interpersonal ]` | 1 (default) |
| Sage | Career | — | `career-sage-feature-4` | `[ PerkList.Lore ]` | 1 (default) |
| Sailor | Career | — | `career-sailor-feature-4` | `[ PerkList.Exploration ]` | 1 (default) |
| Soldier | Career | — | `career-soldier-feature-5` | `[ PerkList.Exploration ]` | 1 (default) |
| Warden | Career | — | `career-warden-feature-6` | `[ PerkList.Exploration ]` | 1 (default) |
| Watch Officer | Career | — | `career-watch-officer-feature-4` | `[ PerkList.Exploration ]` | 1 (default) |
| Censor | Class | 2 | `censor-2-1` | `[ PerkList.Interpersonal, PerkList.Lore, PerkList.Supernatural ]` | 1 (default) |
| Censor | Class | 4 | `censor-4-2` | `[ PerkList.Crafting, PerkList.Exploration, PerkList.Interpersonal, PerkList.Intrigue, PerkList.Lore, PerkList.Supernatural ]` | 1 (default) |
| Censor | Class | 6 | `censor-6-2` | `[ PerkList.Interpersonal, PerkList.Lore, PerkList.Supernatural ]` | 1 (default) |
| Censor | Class | 8 | `censor-8-1` | `[ PerkList.Crafting, PerkList.Exploration, PerkList.Interpersonal, PerkList.Intrigue, PerkList.Lore, PerkList.Supernatural ]` | 1 (default) |
| Censor | Class | 10 | `censor-10-2` | `[ PerkList.Crafting, PerkList.Lore, PerkList.Supernatural ]` | 1 (default) |
| Conduit | Class | 2 | `conduit-2-2` | `[ PerkList.Crafting, PerkList.Lore, PerkList.Supernatural ]` | 1 (default) |
| Conduit | Class | 4 | `conduit-4-2` | *omitted* → factory default: Crafting, Exploration, Interpersonal, Intrigue, Lore, Supernatural (all 6; **Special excluded**) | 1 (default) |
| Conduit | Class | 6 | `conduit-6-2` | `[ PerkList.Crafting, PerkList.Lore, PerkList.Supernatural ]` | 1 (default) |
| Conduit | Class | 8 | `conduit-8-1` | *omitted* → factory default: Crafting, Exploration, Interpersonal, Intrigue, Lore, Supernatural (all 6; **Special excluded**) | 1 (default) |
| Conduit | Class | 10 | `conduit-10-5` | `[ PerkList.Crafting, PerkList.Lore, PerkList.Supernatural ]` | 1 (default) |
| Elementalist | Class | 2 | `elementalist-2-1` | `[ PerkList.Crafting, PerkList.Lore, PerkList.Supernatural ]` | 1 (default) |
| Elementalist | Class | 4 | `elementalist-4-3` | `[ PerkList.Interpersonal, PerkList.Crafting, PerkList.Lore, PerkList.Supernatural, PerkList.Intrigue, PerkList.Exploration ]` | 1 (default) |
| Elementalist | Class | 6 | `elementalist-6-1` | `[ PerkList.Crafting, PerkList.Lore, PerkList.Supernatural ]` | 1 (default) |
| Elementalist | Class | 8 | `elementalist-8-1` | `[ PerkList.Exploration, PerkList.Interpersonal, PerkList.Intrigue, PerkList.Crafting, PerkList.Lore, PerkList.Supernatural ]` | 1 (default) |
| Elementalist | Class | 10 | `elementalist-10-5` | `[ PerkList.Crafting, PerkList.Lore, PerkList.Supernatural ]` | 1 (default) |
| Fury | Class | 2 | `fury-2-1` | `[ PerkList.Crafting, PerkList.Exploration, PerkList.Intrigue ]` | 1 (default) |
| Fury | Class | 4 | `fury-4-3` | *omitted* → factory default: Crafting, Exploration, Interpersonal, Intrigue, Lore, Supernatural (all 6; **Special excluded**) | 1 (default) |
| Fury | Class | 6 | `fury-6-3` | `[ PerkList.Crafting, PerkList.Exploration, PerkList.Intrigue ]` | 1 (default) |
| Fury | Class | 8 | `fury-8-1` | *omitted* → factory default: Crafting, Exploration, Interpersonal, Intrigue, Lore, Supernatural (all 6; **Special excluded**) | 1 (default) |
| Fury | Class | 10 | `fury-10-3` | *omitted* → factory default: Crafting, Exploration, Interpersonal, Intrigue, Lore, Supernatural (all 6; **Special excluded**) | 1 (default) |
| Null | Class | 2 | `null-2-1` | `[ PerkList.Exploration, PerkList.Interpersonal, PerkList.Intrigue ]` | 1 (default) |
| Null | Class | 4 | `null-4-3` | *omitted* → factory default: Crafting, Exploration, Interpersonal, Intrigue, Lore, Supernatural (all 6; **Special excluded**) | 1 (default) |
| Null | Class | 6 | `null-6-3` | `[ PerkList.Exploration, PerkList.Interpersonal, PerkList.Intrigue ]` | 1 (default) |
| Null | Class | 8 | `null-8-1` | *omitted* → factory default: Crafting, Exploration, Interpersonal, Intrigue, Lore, Supernatural (all 6; **Special excluded**) | 1 (default) |
| Null | Class | 10 | `null-10-5` | *omitted* → factory default: Crafting, Exploration, Interpersonal, Intrigue, Lore, Supernatural (all 6; **Special excluded**) | 1 (default) |
| Shadow | Class | 2 | `shadow-2-1` | `[ PerkList.Exploration, PerkList.Interpersonal, PerkList.Intrigue ]` | 1 (default) |
| Shadow | Class | 4 | `shadow-4-4` | *omitted* → factory default: Crafting, Exploration, Interpersonal, Intrigue, Lore, Supernatural (all 6; **Special excluded**) | 1 (default) |
| Shadow | Class | 6 | `shadow-6-1` | *omitted* → factory default: Crafting, Exploration, Interpersonal, Intrigue, Lore, Supernatural (all 6; **Special excluded**) | 1 (default) |
| Shadow | Class | 8 | `shadow-8-1` | *omitted* → factory default: Crafting, Exploration, Interpersonal, Intrigue, Lore, Supernatural (all 6; **Special excluded**) | 1 (default) |
| Shadow | Class | 10 | `shadow-10-3` | *omitted* → factory default: Crafting, Exploration, Interpersonal, Intrigue, Lore, Supernatural (all 6; **Special excluded**) | 1 (default) |
| Tactician | Class | 2 | `tactician-2-1` | `[ PerkList.Exploration, PerkList.Interpersonal, PerkList.Intrigue ]` | 1 (default) |
| Tactician | Class | 4 | `tactician-4-4` | *omitted* → factory default: Crafting, Exploration, Interpersonal, Intrigue, Lore, Supernatural (all 6; **Special excluded**) | 1 (default) |
| Tactician | Class | 6 | `tactician-6-2` | `[ PerkList.Exploration, PerkList.Interpersonal, PerkList.Intrigue ]` | 1 (default) |
| Tactician | Class | 8 | `tactician-8-1` | *omitted* → factory default: Crafting, Exploration, Interpersonal, Intrigue, Lore, Supernatural (all 6; **Special excluded**) | 1 (default) |
| Tactician | Class | 10 | `tactician-10-3` | `[ PerkList.Exploration, PerkList.Interpersonal, PerkList.Intrigue ]` | 1 (default) |
| Talent | Class | 2 | `talent-2-1` | `[ PerkList.Interpersonal, PerkList.Lore, PerkList.Supernatural ]` | 1 (default) |
| Talent | Class | 4 | `talent-4-4` | *omitted* → factory default: Crafting, Exploration, Interpersonal, Intrigue, Lore, Supernatural (all 6; **Special excluded**) | 1 (default) |
| Talent | Class | 6 | `talent-6-1` | `[ PerkList.Interpersonal, PerkList.Lore, PerkList.Supernatural ]` | 1 (default) |
| Talent | Class | 8 | `talent-8-1` | *omitted* → factory default: Crafting, Exploration, Interpersonal, Intrigue, Lore, Supernatural (all 6; **Special excluded**) | 1 (default) |
| Talent | Class | 10 | `talent-10-4` | `[ PerkList.Interpersonal, PerkList.Lore, PerkList.Supernatural ]` | 1 (default) |
| Troubadour | Class | 2 | `troubadour-20` | `[ PerkList.Interpersonal, PerkList.Lore, PerkList.Supernatural ]` | 1 (default) |
| Troubadour | Class | 4 | `troubadour-31` | *omitted* → factory default: Crafting, Exploration, Interpersonal, Intrigue, Lore, Supernatural (all 6; **Special excluded**) | 1 (default) |
| Troubadour | Class | 6 | `troubadour-35` | `[ PerkList.Interpersonal, PerkList.Lore, PerkList.Supernatural ]` | 1 (default) |
| Troubadour | Class | 8 | `troubadour-45` | *omitted* → factory default: Crafting, Exploration, Interpersonal, Intrigue, Lore, Supernatural (all 6; **Special excluded**) | 1 (default) |
| Troubadour | Class | 10 | `troubadour-53` | `[ PerkList.Interpersonal, PerkList.Lore, PerkList.Supernatural ]` | 1 (default) |
Non-core grants (present in the repo, out of scope for a core-only V1 but listed so the shape is
not surprising later). *The `Level` column for the community/third-party **careers** is a
best-effort read of the enclosing object and should be treated as unreliable for those five rows;
careers have no level axis.*

| Sourcebook / file | Feature ID | Level | `lists` | `count` |
|---|---|---|---|---|
| Patreon sourcebook | `beastheart-10-3` | 10 | `[ PerkList.Exploration, PerkList.Interpersonal, PerkList.Intrigue ]` | 1 (default) |
| Patreon sourcebook | `beastheart-2-1` | 2 | `[ PerkList.Exploration, PerkList.Interpersonal, PerkList.Intrigue ]` | 1 (default) |
| Patreon sourcebook | `beastheart-4-2` | 4 | *omitted* → factory default: Crafting, Exploration, Interpersonal, Intrigue, Lore, Supernatural (all 6; **Special excluded**) | 1 (default) |
| Patreon sourcebook | `beastheart-6-1` | 6 | `[ PerkList.Exploration, PerkList.Interpersonal, PerkList.Intrigue ]` | 1 (default) |
| Patreon sourcebook | `beastheart-8-1` | 8 | *omitted* → factory default: Crafting, Exploration, Interpersonal, Intrigue, Lore, Supernatural (all 6; **Special excluded**) | 1 (default) |
| Summoner sourcebook | `summoner-10-7` | 10 | `[ PerkList.Intrigue, PerkList.Interpersonal, PerkList.Supernatural ]` | 1 (default) |
| Summoner sourcebook | `summoner-2-1` | 2 | `[ PerkList.Intrigue, PerkList.Lore, PerkList.Supernatural ]` | 1 (default) |
| Summoner sourcebook | `summoner-4-6` | 4 | *omitted* → factory default: Crafting, Exploration, Interpersonal, Intrigue, Lore, Supernatural (all 6; **Special excluded**) | 1 (default) |
| Summoner sourcebook | `summoner-6-1` | 6 | `[ PerkList.Intrigue, PerkList.Lore, PerkList.Supernatural ]` | 1 (default) |
| Summoner sourcebook | `summoner-8-1` | 8 | *omitted* → factory default: Crafting, Exploration, Interpersonal, Intrigue, Lore, Supernatural (all 6; **Special excluded**) | 1 (default) |
| non-core: sourcebooks/community/age-of-secrets.ts | `career-age-of-secrets-archaeologist-feature-4` | 2 | `[ PerkList.Lore ]` | 1 (default) |
| non-core: sourcebooks/community/age-of-secrets.ts | `career-age-of-secrets-crew-feature-4` | 2 | `[ PerkList.Exploration ]` | 1 (default) |
| non-core: sourcebooks/community/age-of-secrets.ts | `career-age-of-secrets-diplomat-feature-4` | 2 | `[ PerkList.Interpersonal ]` | 1 (default) |
| non-core: sourcebooks/community/age-of-secrets.ts | `career-age-of-secrets-journalist-feature-5` | 2 | `[ PerkList.Intrigue ]` | 1 (default) |
| non-core: sourcebooks/community/age-of-secrets.ts | `career-age-of-secrets-salvager-feature-4` | 2 | `[ PerkList.Exploration ]` | 1 (default) |
| non-core: sourcebooks/community/age-of-secrets.ts | `thaumaturge-2-perk` | 2 | `[ PerkList.Crafting, PerkList.Lore, PerkList.Supernatural ]` | 1 (default) |
| non-core: sourcebooks/community/age-of-secrets.ts | `thaumaturge-4-perk` | 4 | *omitted* → factory default: Crafting, Exploration, Interpersonal, Intrigue, Lore, Supernatural (all 6; **Special excluded**) | 1 |
| non-core: sourcebooks/community/age-of-secrets.ts | `thaumaturge-6-perk` | 6 | `[ PerkList.Crafting, PerkList.Lore, PerkList.Supernatural ]` | 1 (default) |
| non-core: sourcebooks/community/age-of-secrets.ts | `thaumaturge-8-perk` | 8 | *omitted* → factory default: Crafting, Exploration, Interpersonal, Intrigue, Lore, Supernatural (all 6; **Special excluded**) | 1 |
| non-core: sourcebooks/community/community.ts | `magewright-2-1` | 2 | `[ PerkList.Crafting, PerkList.Lore, PerkList.Supernatural ]` | 1 (default) |
| non-core: sourcebooks/community/community.ts | `vessel-2-1` | 2 | `[ PerkList.Interpersonal, PerkList.Intrigue, PerkList.Special ]` | 1 (default) |
| non-core: sourcebooks/community/community.ts | `vessel-4-5` | 4 | *omitted* → factory default: Crafting, Exploration, Interpersonal, Intrigue, Lore, Supernatural (all 6; **Special excluded**) | 1 (default) |
| non-core: sourcebooks/third-party/look-out.ts | `kiln-perk` | 2 | `[ PerkList.Crafting, PerkList.Lore, PerkList.Supernatural, PerkList.Special ]` | 1 (default) |
| non-core: sourcebooks/third-party/steel-echoes.ts | `scion-perk` | 2 | `[ PerkList.Exploration, PerkList.Lore, PerkList.Supernatural ]` | 1 (default) |
| non-core: sourcebooks/third-party/triglav.ts | `vampire-ancestry-5j` | None | `[ PerkList.Special ]` | 1 (default) |
| non-core: sourcebooks/third-party/triglav.ts | `vampire-class-2-1` | 2 | `[ PerkList.Special ]` | 1 (default) |
**Reading of the grant pattern (core only, and it is a pattern, not a rule the source states):**

- Every career grants exactly **one** perk, from exactly **one** list, chosen to match the
  career's flavour. Never more than one list, never `count > 1`.
- Every class grants exactly **one** perk at each of levels **2, 4, 6, 8, 10** — five per class,
  none at levels 1, 3, 5, 7, 9.
- The class grants alternate between a **narrowed** 3-list pick and an **unrestricted** all-six
  pick. The narrowed lists are stable per class (e.g. Fury = Crafting/Exploration/Intrigue at
  2 and 6; Talent = Interpersonal/Lore/Supernatural at 2, 6 and 10). Three classes
  (Censor at 10, Conduit, Elementalist) deviate from the "even levels are open" reading —
  see anomaly A-4.
- `count` is **never** set explicitly on any core grant; all 63 use the factory default `1`.
- An **unrestricted** pick is expressed three different ways in the data: omitting `lists`
  (factory default, 25 sites), spelling out all six in canonical order (Censor 4 and 8), and
  spelling out all six in a scrambled order (Elementalist 4 and 8). All three are equivalent;
  all three exclude `Special`.

**How the list filter constrains the option set at pick time** (`ConfigPerk` + `PerkSelectModal`):

1. `SourcebookLogic.getPerks(enabledSourcebooks)` → the full pool.
2. `.filter(p => feature.data.lists.includes(p.list))` → the allowed subset.
3. Sorted by name, then `.filter(p => !currentPerkIDs.includes(p.id))` where `currentPerkIDs` is
   **every perk already selected in any `FeaturePerk` feature on the hero** — dedupe is global,
   not per-feature.
4. The modal groups the allowed subset under a header per `PerkList`, in fixed enum order
   (Crafting, Exploration, Interpersonal, Intrigue, Lore, Supernatural, Special), hiding empty
   groups.
5. Below a `Divider`, an **"Other Perks"** expander lists every perk *not* in the allowed subset,
   behind `Alert type='warning': "Selecting a perk from outside the listed groups is typically
   against the rules."` — a warn-not-block escape hatch. See anomaly A-7 for the dedupe hole in
   this path.
6. `ConfigPerk` renders the "Choose a perk" button only while
   `data.selected.length < data.count`; when the allowed subset is empty it renders
   `Empty: "There are no options to choose for this feature."` instead.

---

## Subclasses

**Not applicable.** None of the three pools has a subclass axis. `Complication`, `Title` and
`Perk` are all flat `Element` records with no `subclasses`, no `featuresByLevel`, and no
class/subclass attribution field. The only class-adjacent relationship is the **direction**
class → perk (a class level grants a `FeaturePerk`), which is tabulated under *Perk grant sites*
above; a perk carries no back-reference to the class that granted it.

One title, `title-godsworn`, reaches *into* the class system: its third option
(`title-godsworn-3`, a `Multiple`) nests a `Domain` choice (`title-godsworn-3a`) and a level-1
`DomainFeature` choice (`title-godsworn-3b`) — a Conduit-shaped sub-build attached to a title.
That is the only cross-system feature in the three pools.

---

## Abilities

Every ability carried by a complication, title or perk. Structural fields only; no rules text.
`cost` is `0` unless stated — **no ability in any of the three pools is a `signature`**, and no
`minLevel` or `repeatable` is ever set (both take their factory defaults, `1` and `false`).
`createTrigger(...)` maps to `AbilityUsage.Trigger`; its single string argument is the trigger
condition — rules text, so it is elided here as `text: VERIFY-AGAINST-PIN`. `{ free: true }` is a
free triggered action; `{ freeStrike: true }` marks a free-strike-usable ability;
`qualifiers: [...]` are short usage conditions rendered next to the action type and are likewise
rules text. 6 of the 35 abilities are triggered actions (1 of them free); 2 more are free
maneuvers (`title-marshal-2`, `title-godsworn-2`); 2 carry `qualifiers` (`comp-rogueTalent-b`,
which is also `freeStrike: true`, and `title-dwarf-legionnaire-3`).

| Pool | Ability ID | Name | Cost | Action type | Keywords | Distance | Target |
|---|---|---|---|---|---|---|---|
| Complication | `comp-advanced-studies-1` | Advanced Study Benefit and Drawback | `0` *(default)* | `createNoAction()` *(default)* | *(none — default `[]`)* | *(default `[]`)* | *(default `''`)* |
| Complication | `comp-corruptedMentor-b-ability` | Corrupted Spirit | `0` *(default)* | `createManeuver()` | `[ Magic ]` | `[ createSelf() ]` | `'Self'` |
| Complication | `comp-lostYourHead-b` | Share Head | `0` *(default)* | `createManeuver()` | `[ Psionic, Ranged ]` | `[ createRanged(10) ]` | `'One willing creature'` |
| Complication | `comp-medium-b-ability` | Contact Spirits | `0` *(default)* | `createMain()` | `[ Magic ]` | `[ createSelf() ]` | `'Self'` |
| Complication | `comp-medusaBlood-b` | Stone Eyes | `0` *(default)* | `createMain()` | `[ Magic, Ranged, Strike ]` | `[ createRanged(10) ]` | `'One creature'` |
| Complication | `comp-psychicEruption-b` | Psychic Blast | `0` *(default)* | `createMain()` | `[ Area, Psionic ]` | `[ create({ type: Burst, value: 3 }) ]` | `'Each creature in the area'` |
| Complication | `comp-rogueTalent-b` | Telekinetic Grasp | `0` *(default)* | `createManeuver({ qualifiers: […], freeStrike: true })` — qualifier `text: VERIFY-AGAINST-PIN` | `[ Psionic, Ranged, Strike ]` | `[ createRanged(10) ]` | `'One creature or object'` |
| Complication | `comp-strippedOfRank-b` | Issue Order | `0` *(default)* | `createMain()` | `[ Ranged ]` | `[ createRanged(10) ]` | `'One ally'` |
| Complication | `comp-waking-dreams-ability` | Waking Dreams | `0` *(default)* | `createNoAction()` *(default)* | *(none — default `[]`)* | *(default `[]`)* | *(default `''`)* |
| Complication | `comp-warDogCollar-ability` | Posthumous Retirement | `0` *(default)* | `createManeuver()` | `[ Area, Magic ]` | `[ create({ type: Burst, value: 1 }) ]` | `'Each enemy in the area'` |
| Complication | `comp-waterborn-ability` | Rogue Wave | `0` *(default)* | `createMain()` | `[ Magic, Ranged, Strike ]` | `[ createRanged(10) ]` | `'One creature or object'` |
| Title | `title-brawler-1` | Duck! | `0` *(default)* | `createTrigger(…)` — trigger `text: VERIFY-AGAINST-PIN` | *(none — default `[]`)* | `[ createSpecial('Adjacent') ]` | `'One enemy'` |
| Title | `title-dwarf-legionnaire-3` | Stonemeld | `0` *(default)* | `createManeuver({ qualifiers: […] })` — qualifier `text: VERIFY-AGAINST-PIN` | *(none — default `[]`)* | `[ createSelf() ]` | `'Self'` |
| Title | `title-mage-hunter-2` | Oh No You Don’t! | `0` *(default)* | `createTrigger(…)` — trigger `text: VERIFY-AGAINST-PIN` | *(none — default `[]`)* | `[ createSpecial('Adjacent') ]` | `'One creature'` |
| Title | `title-mage-hunter-3-1` | Stink of Magic | `0` *(default)* | `createManeuver()` | *(none — default `[]`)* | `[ create({ type: Burst, value: 5 }) ]` | `'Each creature in the area'` |
| Title | `title-marshal-2` | Heedless Pursuer | `0` *(default)* | `createManeuver({ free: true })` | *(none — default `[]`)* | `[ createSelf() ]` | `'Self'` |
| Title | `title-ratcatcher-3` | Come Out to Play | 1 | `createManeuver()` | `[ Area, Magic ]` | `[ create({ type: Burst, value: 5 }) ]` | `'Each enemy in the area hidden to you'` |
| Title | `title-troupe-tactics-1` | Flying Circus | `0` *(default)* | `createTrigger(…)` — trigger `text: VERIFY-AGAINST-PIN` | *(none — default `[]`)* | `[ createSpecial('Adjacent') ]` | `'One ally'` |
| Title | `title-zombie-slayer-3` | Holy Terror | 3 | `createManeuver()` | `[ Area, Magic ]` | `[ create({ type: Burst, value: 3 }) ]` | `'Each undead enemy in the area'` |
| Title | `title-arena-fighter-4` | Showstopper | 5 | `createMain()` | `[ Melee, Strike, Weapon ]` | `[ createMelee() ]` | `'One creature'` |
| Title | `title-awakened-3` | Telepathy | `0` *(default)* | `createManeuver()` | *(none — default `[]`)* | `[ createRanged(10) ]` | `'One creature who understands a language you know'` |
| Title | `title-battlefield-commander-1` | Charge! | 9 | `createMain()` | `[ Area ]` | `[ create({ type: Burst, value: 3 }) ]` | `'Self and each ally in the area'` |
| Title | `title-giant-slayer-2` | The Harder They Fall | 7 | `createMain()` | `[ Melee, Strike, Weapon ]` | `[ createMelee() ]` | `'One creature'` |
| Title | `title-godsworn-2` | Last-Ditch Prayer | `0` *(default)* | `createManeuver({ free: true })` | *(none — default `[]`)* | `[ createSelf() ]` | `'Self'` |
| Title | `title-heist-hero-3` | Timely Distraction | `0` *(default)* | `createTrigger(…)` — trigger `text: VERIFY-AGAINST-PIN` | `[ Ranged ]` | `[ createRanged(10) ]` | `'One creature'` |
| Title | `title-knight-3` | Knightly Challenge | 5 | `createMain()` | `[ Melee, Strike, Weapon ]` | `[ createMelee() ]` | `'One creature'` |
| Title | `title-sworn-hunter-1` | Hunter's Oath | `0` *(default)* | `createMain()` | *(none — default `[]`)* | `[ createRanged(10) ]` | `'One creature'` |
| Title | `title-maestro-2` | The Devil’s Chord | 9 | `createMain()` | `[ Area, Magic ]` | `[ create({ type: Burst, value: 5 }) ]` | `'Each creature in the area'` |
| Perk | `perk-friend-catapult-1` | Friend Catapult | `0` *(default)* | `createManeuver()` | *(none — default `[]`)* | `[ createSelf() ]` | `'Self'` |
| Perk | `perk-ive-got-you-1` | I've Got You | `0` *(default)* | `createTrigger(…)` `{ free: true }` — trigger `text: VERIFY-AGAINST-PIN` | *(none — default `[]`)* | `[ createSelf() ]` | `'Self'` |
| Perk | `perk-gum-up-the-works-1` | Gum Up The Works | `0` *(default)* | `createTrigger(…)` — trigger `text: VERIFY-AGAINST-PIN` | *(none — default `[]`)* | `[ createSelf() ]` | `'Self'` |
| Perk | `perk-arcane-trick-1` | Arcane Trick | `0` *(default)* | `createMain()` | `[ Magic ]` | `[ createSelf() ]` | `'Self'` |
| Perk | `perk-creature-sense-1` | Creature Sense | `0` *(default)* | `createManeuver()` | *(none — default `[]`)* | `[ createSelf() ]` | `'Self'` |
| Perk | `perk-invisible-force-1` | Invisible Force | `0` *(default)* | `createManeuver()` | `[ Psionic, Ranged ]` | `[ createRanged(10) ]` | `'1 size 1T unattended object'` |
| Perk | `perk-psychic-whisper-1` | Psychic Whisper | `0` *(default)* | `createManeuver()` | `[ Psionic, Ranged ]` | `[ createRanged(10) ]` | `'1 ally who understands at least one language'` |
Two complication "abilities" (`comp-advanced-studies-1`, `comp-waking-dreams-ability`) take the
`createNoAction()` default with empty distance and target — they are respite/narrative
activities modelled as abilities purely to get a power-roll section rendered.
`comp-advanced-studies-1` is the only one in the three pools whose power roll lists **all five
characteristics** as alternatives.

---

## Choice-point inventory

Every decision the player makes in these three pools, in build order, with cardinality.

| # | Step | Where it appears | Cardinality | Optional? | Depends on |
|---|---|---|---|---|---|
| 1 | **Pick a career** (out of scope here) — grants one `FeaturePerk` | Career section | 1 | no | — |
| 2 | **Career perk** — pick 1 perk from that career's single list | Career section, choice column | 1 of ~6–10 | no (blocks career completion) | step 1 (the career fixes the list); global perk dedupe |
| 3 | **Pick a class + level** (out of scope) — grants `FeaturePerk` at 2/4/6/8/10 | Class section | — | no | — |
| 4 | **Class perk × up to 5** — one per reached even level | Class section, per-level | 1 each, from 3 lists or all 6 | no (blocks class completion) | class + level; global perk dedupe |
| 5 | **Complication** — pick 0 or 1 from the 100-record pool | Complication tab | 0 or 1 | **yes** (`PageState.Optional`) | nothing |
| 6 | **Complication sub-choices** — 0–3 per complication | Complication tab, choice column | see below | no, once step 5 is made | the chosen complication |
| 6a | ↳ `SkillChoice` (18 complications) | | 1, except `comp-ivoryTower-skills` = 3, `comp-shipwrecked-b` = 2, `comp-silentSentinel-skill1` = 2, `comp-wronglyImprisoned-b` = 2 | | skills the hero already knows are excluded |
| 6b | ↳ `ItemChoice` (6, incl. 2 inside `Toggle`s) | | 1 | | enabled sourcebooks' item pool, filtered by `ItemType` |
| 6c | ↳ `LanguageChoice` (3) | | 1 | | languages the hero already knows are excluded |
| 6d | ↳ `Choice` (1: `comp-infernalContractButLikeBad-b`) | | 1 of 3 inline `Bonus` options (Renown +2 / Wealth +2 / Stamina +3), each `value: 1` | | — |
| 6e | ↳ `SkillCancelChoice` (1: `comp-ivoryTower-d`) | | 1, `knownSkillsOnly: true` | | **the hero's known skills — including ones chosen at 6a in the same complication** |
| 6f | ↳ `Retainer` (1: `comp-meddlingButler-b`) | | 1 | | monsters from enabled sourcebooks |
| 6g | ↳ `Toggle` (2: `comp-artifactBonded-b`, `comp-shatteredLegacy-b`) | | boolean, in-play | | `isChosen` always returns `true` for a Toggle — never blocks completion |
| 7 | **Titles** — Director-awarded, added post-build | Titles modal (hero view, not the build wizard) | 0..n | **yes**, entirely | `getEchelon(class.level)` as a *default filter*, not a gate |
| 8 | **Title option** — pick 1 of the title's `features[]` | Title select modal, step 2 | exactly 1 | no (auto-committed when the title has 1 option) | the chosen title |
| 9 | **Title sub-choices** — on **10 of 68** titles (8 excluding the two `Toggle`s) | Title panel | | | |
| 9a | ↳ `title-fey-friend` — each of its 3 options nests a pre-filled `LanguageChoice` (`selected: ['Khelt']`) plus, on option 1, an Interpersonal `SkillChoice` | | 1 | | |
| 9b | ↳ `title-godsworn-3` — `Domain` (count 1) + level-1 `DomainFeature` (count 1) | | 1 + 1 | | enabled sourcebooks' domains |
| 9c | ↳ `title-master-librarian` — Lore `SkillChoice` + `LanguageChoice` `count: 2` | | 1 + 2 | | |
| 9d | ↳ `title-reborn-2` — a `Choice` of 3, two of whose options are themselves choices (`ItemChoice` over leveled treasure; `SkillChoice` `count: 2`) | | 1, then 1-or-2 | | **nested choice — see A-9** |
| 9e | ↳ `title-sworn-hunter-2` — Intrigue `SkillChoice` | | 1 | | |
| 9f | ↳ `title-demigod-1d`, `title-ringleader-1b`, `title-high-summoner-1b` — `Choice` of inline `Text` options | | 1 | | |
| 10 | **Customization escape hatches** (Customize modal, any time) | | | yes | |
| 10a | ↳ add a `FeatureType.Complication` feature → a **second** complication | | 0..n | yes | — |
| 10b | ↳ add a `FeatureType.Perk` feature with **all seven** lists incl. `Special` | | 0..n | yes | — |
| 10c | ↳ import a title by share code → id regenerated, `selectedFeatureID` reset to `''` | | 0..n | yes | — |

**Totals.** Core-only, a level-10 hero makes **6 mandatory perk picks** (1 career + 5 class),
**0 or 1** complication pick plus **0–3** sub-choices inside it, and **0..n** Director-awarded
titles each costing **1** option pick plus **0–3** sub-choices.

---

## UI surface

Ordered list of controls, with control kind. Forge Steel's placement is given first; where our
builder should diverge, that is called out.

### A. Complication tab (in the build wizard, between Class and Details)

| # | Control | Kind | Notes |
|---|---|---|---|
| A1 | Section tabs `start / ancestry / culture / career / class / complication / details` | segmented (desktop) / single-select dropdown (narrow) | Each tab renders a state badge: `Not Started` / `In Progress` / `Completed` / **`Optional`**. Complication is the only tab that can read `Optional`. |
| A2 | Search box | free text | Enabled only while `!hero.complication`. Matches `name` + `description`, token-wise (`some`, i.e. **OR** across whitespace-split tokens). |
| A3 | **Random** button | action | Enabled only while nothing is selected and no search term is active. |
| A4 | **Unselect** button | action | Enabled only while a complication is selected. Clears `hero.complication` to `null`. |
| A5 | Complication grid | searchable list of single-select cards | 100 cards. Scroll position is preserved across a select→unselect round trip. |
| A6 | Selected complication panel | read-only detail | Replaces the grid once a selection is made. |
| A7 | "Choices" column | nested sub-choices, one `FeatureConfigPanel` per choice-bearing feature | Rendered only when the selected complication has ≥1 choice feature (**26 of 100** do). On narrow viewports the selected panel is hidden while choices are pending. |
| A7a | ↳ skill picker | multi-select-N searchable list | |
| A7b | ↳ item picker | single-select searchable list | |
| A7c | ↳ language picker | multi-select-N searchable list | |
| A7d | ↳ inline option picker | single-select | `comp-infernalContractButLikeBad` only |
| A7e | ↳ lost-skill picker | single-select over known skills | `comp-ivoryTower` only |
| A7f | ↳ retainer picker | single-select searchable list | `comp-meddlingButler` only |
| A7g | ↳ condition toggle | toggle | 2 complications; **belongs on the play sheet, not the builder** — see A-8 |

### B. Perk pickers (inline in the Career and Class sections)

| # | Control | Kind | Notes |
|---|---|---|---|
| B1 | "Choose a perk" button | action, `status-warning` styling while unfilled | Rendered while `selected.length < count`. Replaced by `Empty` text when the filtered pool is empty. |
| B2 | Perk select drawer | searchable list, grouped | Search over `name` + `description`. Groups headed by `PerkList` in fixed enum order; empty groups hidden. |
| B3 | "Other Perks" expander | searchable list behind a warning | Out-of-list perks. Warn-not-block. |
| B4 | Selected perk box | removable chip + detail drawer | `onRemove` splices by id. |

### C. Titles modal (hero view, **not** the build wizard)

| # | Control | Kind | Notes |
|---|---|---|---|
| C1 | "Add a title" button | action | Opens the title select drawer. |
| C2 | "Import a code" button | action | Import by share code; regenerates ids and clears `selectedFeatureID`. |
| C3 | **Checklist** expander | read-only table `Title \| Prerequisites` | Filter `echelon <= heroEchelon`. This is where `prerequisites` prose surfaces. |
| C4 | Per-title expander | list with reorder + delete | `Move Up` / `Move Down` / `Delete` (danger-confirm). Order in `state.titles` is user-controlled and meaningful only for display. |
| C5 | Echelon spinner | number spinner, min 1 max 4 | In the *select* drawer. Defaults to the hero's echelon; user-overridable. |
| C6 | Title search box | free text | `name` + `description`. |
| C7 | Title list | single-select cards | `echelon === spinner` and not already held. **"Custom Title" is always the first card.** |
| C8 | Title option list | single-select cards + info alert | Step 2, shown only when the title has 2+ features. |

### What our builder should change

1. **Titles do not belong in the level-progression wizard**, and Forge Steel agrees — they live
   in a hero-view modal against `state.titles`. Keep that split; a title is an award, not a
   build step.
2. **Reconcile the two echelon predicates** into one cumulative `echelon <= getEchelon(level)`
   and demote the spinner to a filter chip.
3. **Complication is optional and must stay visibly optional** — the `Optional` page state is the
   right affordance and is easy to lose when a wizard enforces linear completion.
4. The two complication `Toggle`s and the `Toggle` on `title-dwarf-legionnaire` /
   `title-siege-breaker` are **in-play state**, not build state. They should render on the combat
   sheet, not in the builder.

---

## Convex data model notes

> **Superseded keying note (2026-08-30):** the FS-id keys sketched in this
> section are illustrative only and are **superseded** by `00-foundation.md`
> §6b + ruling R-L: every persistent key joins on the pin's `scc` identity
> (with a discriminator where one pin record carries several choice points).
> FS ids are labels, never keys.


### Definition data (seeded once, shared, versioned by source)

| Table | Key | Payload | Rows (core) |
|---|---|---|---|
| `complications` | `sourceId` + `slug` (`comp-…`) | `{ name, description, features: Feature[] }` | 100 |
| `titles` | `sourceId` + `slug` (`title-…`) | `{ name, description, echelon, prerequisites, features: Feature[] }` | 62 core (+6 Summoner) |
| `perks` | `sourceId` + `slug` (`perk-…`) | `{ name, description, list, featureType, featureData }` | 47 |

All three are **pure definition** — no per-hero state belongs in them. Note that Forge Steel's
records carry mutable-looking fields (`Title.selectedFeatureID`, `FeaturePerkData.selected`,
`FeatureChoiceData.selected`) *inside the definition record*; those are artefacts of its
deep-copy-into-the-hero model and **must not be seeded**. Seed `selectedFeatureID: ''` as absent.

Perk grants are definition data on the granting element, not a separate table: a career or a
class level owns a `{ kind: 'perk', lists: PerkList[], count: number }` feature.

### Selection state (per-hero, sparse, keyed by feature id)

```
heroSelections: {
  heroId,
  featureId,          // e.g. 'fury-2-1', 'comp-ivoryTower-skills'
  value               // discriminated by the feature's type
}
```

| Selection | Key | Value shape | Cardinality |
|---|---|---|---|
| Complication | a fixed sentinel key (`'complication'`) — **not** a feature id, because the slot lives on the hero, not on a feature | `complicationSlug \| null` | 0..1 |
| Extra complications (customization) | the customization feature's generated id | `complicationSlug \| null` | 0..n |
| Complication sub-choice | the nested feature id (`comp-ivoryTower-skills`, …) | `string[]` / `itemSlug[]` / `featureId[]` / `monsterId` / `boolean` | per-feature `count` |
| Perk | the granting feature id (`career-agent-feature-5`, `fury-4-3`, …) | `perkSlug[]` | `count` (always 1 in core) |
| Perk sub-choice | `perk-linguist-2`, `perk-eidetic-memory` | `string[]` | 2 / 1 |
| Title held | title slug (titles are *awards*, so a separate `heroTitles` table with an explicit order column is cleaner than the sparse map) | `{ titleSlug, selectedFeatureId, order }` | 0..n |
| Title sub-choice | the nested feature id | as per type | per-feature `count` |

### Where the definition/selection split is hard

**H1 — The complication slot is not a feature.** Forge Steel stores it as
`Hero.complication: Complication \| null` at the top level *and* also supports
`FeatureType.Complication` features. Two channels, one concept. Our sparse map is keyed by
feature id; the primary slot has no feature id. Either mint a synthetic stable id for the
primary slot, or model the complication as a first-class hero column and reserve the
feature-keyed path for the customization case. **Recommend the latter** — it matches how the
build page is structured (a top-level tab, not a feature inside another element).

**H2 — Titles are state, not build.** `hero.state.titles` sits with inventory and conditions.
They mutate mid-campaign, they have a user-controlled display order, and each one carries its own
sub-selections. A sparse `featureId → value` map cannot express "held title #3 of 5, whose
option is X, whose nested language choice is Y". Titles need their own table with a stable
per-hero row id, and title sub-choices need to key off *that* row id, not the pool slug —
otherwise the same title held twice (which Forge Steel prevents by id, but which a Director
could reasonably award) collides.

**H3 — `Title.selectedFeatureID` is a selection stored inside the definition object.** In
Forge Steel the hero's copy of the title *is* the record, mutated. Split it: definition keeps
`features[]`, selection keeps `selectedFeatureId`. Watch the auto-commit rule — a 1-option title
must persist `selectedFeatureId = features[0].id`, not `''`, or downstream
`features.find(f => f.id === selectedFeatureID)` silently yields nothing on the sheet
(`titles-card.tsx`, `sheet-formatter.ts` and `title-panel.tsx` all do exactly that lookup).

**H4 — Option lists that depend on an earlier selection.**
- `comp-ivoryTower`: `-skills` grants 3 skills, then `-d` (`SkillCancelChoice`,
  `knownSkillsOnly: true`) removes one **from the hero's known skills, which now include the
  three just granted**. Ordering matters within a single complication, and the cancel choice's
  option set is a *derived* set, not a static list. A naive sparse map plus an unordered
  "apply all features" pass will produce a different result depending on evaluation order.
- Every `SkillChoice` / `LanguageChoice` filters out what the hero already knows
  (`ConfigSkillChoice` / `ConfigLanguageChoice` both do this), so **every skill and language
  choice in these pools has an option list that depends on every other skill/language source on
  the hero** — ancestry, culture, career, class, other complications, other titles.
- Perk dedupe is global across every `FeaturePerk` on the hero.
- `title-godsworn-3b` (`DomainFeature`, level 1) depends on `title-godsworn-3a` (`Domain`).

**H5 — Features that mutate other features.** `SkillCancelChoice` is a *negative* grant: it
removes a skill and marks it unlearnable. That is not expressible as "feature X contributes
value Y"; it needs an explicit removal pass ordered after all grants. It appears exactly once in
this subject (`comp-ivoryTower-d`) and is easy to miss.

**H6 — `selectAt` and re-selection during play.** All choices in this subject default to
`'build'` except `perk-eidetic-memory` (`'respite'`). But `selectAt` is a *per-feature* field on
`SkillChoice` / `LanguageChoice` / `Choice`, with values `'build' | 'respite' | 'play'`, and
the deprecated `FeatureChoiceData.respiteChange?: boolean` is still migrated to
`selectAt: 'respite'` by `update-logic.ts`. Our selection rows need a *when* dimension —
a respite-rechosen selection is not the same row as a build-time one, and the play surface has
to be able to rewrite it without touching build state. **Do not model selections as immutable
build output.**

**H7 — `Toggle` is runtime state wearing a build-time costume.** `FeatureLogic.isChoice` counts
`Toggle` as a choice (so it renders in the builder's choice column) while `isChosen` always
returns `true` (so it never blocks completion). `data.checked` is a live combat flag whose
`condition` field is rules text (`text: VERIFY-AGAINST-PIN`). It must persist to the
encounter/play scope, not to build selections, or a hero will boot into combat with a stale
conditional bonus applied.

**H8 — Deep-copied nested objects.** `ItemChoice.selected` is `Item[]`, `Retainer.selected` is
a whole `Monster`, `Choice.selected` is `Feature[]`, `Domain.selected` is `Domain[]`. Forge
Steel stores the full object. We should store **slugs** and resolve at read time, except where
the selected object is itself mutable per-hero (a retainer levels up; a leveled treasure has
per-hero state) — those need their own rows.

**H9 — Sourcebook scoping.** Every option list is computed over
`sourcebooks.filter(sb => hero.sourcebookIDs.includes(sb.id))`. A selection can therefore become
*unresolvable* when a source is disabled after the fact. Forge Steel has no repair path; ours
needs one (retain the slug, surface an "unavailable — from a disabled source" state, never
silently drop).

---

## Anomalies & open questions

**A-1 — Titles are never granted by a feature in the shipped data.** `createTitleChoice` is
defined in the factory, has a full UI (`title-choice.tsx` with Info/Edit/Config renderers), is
listed in `isChoice`/`isChosen`/`getFeatureData`, and is called **zero times** anywhere under
`src/data`. `hero-update-logic.ts` actively migrates any existing instance into
`hero.state.titles` and deletes the feature. So the entire `FeatureTitleChoice` path — including
its `echelon` and `count` fields, which the brief asks us to spec — is **vestigial**. The live
model is: Director awards a title → it lands in `state.titles` → the player picks one of its
options. *Spec the live model; keep `FeatureTitleChoice` only if we need a class/ancestry that
grants a title pick, and if so define our own echelon semantics because the source's are
inconsistent (A-2).*

**A-2 — Two contradictory echelon predicates in the same modal stack.** The checklist uses
`echelon <= heroEchelon` (cumulative); the picker uses `echelon === spinnerEchelon` (exact band,
user-overridable). Nothing gates effect application at all. Which one is canon is
**unresolved from the source** and must be answered against our pin before we implement either.

**A-3 — `Title.prerequisites` is unparsed free prose on all 68 titles.** It is shown to the user
in a checklist and never evaluated. Its content ranges from numerically concrete (project-point
thresholds against a named table) to purely narrative (a story beat the Director adjudicates) —
`text: VERIFY-AGAINST-PIN` in every case. Any attempt to make it machine-checkable is new design
work, not a port.

**A-4 — The class perk-list pattern has three deviations.** The dominant shape is
"narrowed 3-list pick at levels 2, 6, 10; unrestricted at 4 and 8". Deviations:
`censor-10-2` narrows to Crafting/Lore/Supernatural (a *different* triple from Censor's own
2/6 triple of Interpersonal/Lore/Supernatural); `shadow-6-1` is unrestricted where 6 is normally
narrowed; `fury-10-3`, `null-10-5`, `shadow-10-3` are unrestricted at 10. Whether these are
transcription errors or genuine class variation is **unresolved** and must be checked against the
pin per class before we seed.

**A-5 — Three different encodings of "all six perk lists".** Omitted (25 sites), spelled out in
canonical order (`censor-4-2`, `censor-8-1`), spelled out scrambled (`elementalist-4-3`,
`elementalist-8-1`). Semantically identical. Our seeder should normalise; our diff tooling should
not treat the three as distinct.

**A-6 — `PerkList.Special` has zero members in the core pool and is excluded from every default.**
It exists in the enum, appears in the `EditPerk` list-picker and in the `PerkSelectModal` group
order, and is included in the Customize modal's ad-hoc perk feature — but `createPerk`'s default
`lists` deliberately omits it, and no core perk carries it. Only third-party sourcebooks
(`triglav`, `look-out`) and one community class use it. **Open question:** is `Special` a real
Draw Steel concept or a Forge Steel affordance for homebrew? Do not assume it is canon.

**A-7 — The "Other Perks" escape hatch skips the dedupe.** The allowed subset is filtered by
`currentPerkIDs` (perks already selected anywhere on the hero); `otherPerks` is filtered only by
`!props.perks.map(p => p.name).includes(os.name)` — by **name**, against the *allowed* list, not
against what the hero already has. A hero can therefore take the same perk twice by taking it
from "Other Perks" the second time. Also note `props.onSelect` is called directly there,
bypassing the `Analytics.logElementSelected` wrapper used on the main path — a second, smaller
inconsistency in the same block.

**A-8 — `Toggle` is classified as a build-time choice.** `isChoice(Toggle) === true` puts
`comp-artifactBonded-b`, `comp-shatteredLegacy-b`, `title-dwarf-legionnaire-1` and
`title-siege-breaker-2` in the builder's choice column, where they render as a checkbox for a
*combat* condition (the `condition` field is rules text — `text: VERIFY-AGAINST-PIN`).
`isChosen(Toggle) === true`
unconditionally, so they never block completion. This is a category error we should not port.

**A-9 — Nested choices inside choices.** `title-reborn-2` is a `Choice` whose option `2a` is an
`ItemChoice` and whose option `2c` is a `SkillChoice` with `count: 2`. Selecting the outer choice
*creates* an inner choice. A flat `featureId → value` map handles this only because the inner
feature ids are stable and pre-declared in the definition — but the inner selection must be
**invalidated when the outer selection changes**, and Forge Steel has no such invalidation
(`clearRedundantSelections`, invoked from `setComplication`, only strips already-known languages and skills — including skills cancelled by a `SkillCancelChoice`, which count as permanently known). Same shape on
`comp-artifactBonded-b` and `comp-shatteredLegacy-b` (a `Toggle` wrapping an `ItemChoice`).

**A-10 — `LanguageChoice.options` is dead data on two complications.**
`comp-exile-lang` passes `options: [ LanguageType.Common ]` and `comp-ivoryTower-lang` passes
`options: [ LanguageType.Dead ]`. But `options` is typed `string[]` (language *names*), the
values passed are `LanguageType` *enum* members, and `ConfigLanguageChoice` **ignores
`data.options` entirely** — it filters by `allowedTypes`, which neither feature sets, so both
default to all four types. The authored intent (an extant language / a dead language) is
**not enforced**. Both descriptions state the restriction in prose. Our implementation should
use `allowedTypes` and treat `options` as an explicit-name allowlist, and should flag both
records for re-authoring against the pin.

**A-11 — Id conventions are inconsistent across the complication pool.** Four families coexist:
kebab-case (`comp-advanced-studies`, `comp-cult-victim`, `comp-fire-and-chaos`), camelCase
(`comp-artifactBonded`, `comp-curseOfImmortality`, `comp-infernalContractButLikeBad`), and two
where the id does not match the display name at all (`comp-carefulCurse` = "Curse of Caution",
`comp-punishment-curse` = "Curse of Punishment"). One title id is a **typo**:
`title-blood-bagic` for "Blood Magic" (its child features are correctly `title-blood-magic-1..3`).
Ids are the join key for selection state — **normalise once at seed time and never again**, and
record the Forge Steel id only as a provenance breadcrumb, never as our key.

**A-12 — `createSkillChoice` used as a *grant*, not a choice.** Four complications pass a
pre-filled `selected` array with the default `count: 1`:
`comp-crashLanded-skill` (`['Timescape']`), `comp-fallenImmortal-skill` (`['Religion']`),
`comp-masterChef-skill` (`['Cooking']`), `comp-raisedByBeasts-skill` (`['Handle Animals']`),
plus `comp-silentSentinel-skill1` (`count: 2`, `selected: ['Eavesdrop', 'Sneak']`) and the three
`title-fey-friend-*-1` language choices (`selected: ['Khelt']`). Because
`isChosen` tests `selected.length >= count`, these are already satisfied and render as
pre-filled-but-removable. **A fixed grant modelled as a satisfied choice is a trap** in two ways:
the player can delete the "selection" and re-pick something else entirely, and
`clearRedundantSelections` will *silently strip* the pre-fill when the hero already knows that
skill or language from another source — converting the intended grant into an unfilled free
choice. Our model should have a distinct "granted skill/language" feature kind.

**A-13 — Perk sub-features are suppressed outside `TutorialMode.Complete`.**
`simplifyFeatures` adds a selected perk's nested features **only** when
`tutorialMode === TutorialMode.Complete`. `Perk` is the only feature type in the whole switch
with a tutorial-mode guard. So in `Stage1`/`Stage2`/`Stage3`, `perk-familiar`'s summon,
`perk-linguist`'s two languages and every perk ability silently do not apply. Whether this is
intentional pedagogy or a bug is **unresolved**; either way it is a behaviour we should not
inherit implicitly.

**A-14 — `comp-antihero` names two different features identically.** `comp-antihero-da` and
`comp-antihero-db` are both named `'Antihero Drawback'`. Rendering keyed on name will collide;
57 complication features carry no name at all and fall back to the factory's generic default
(`'Ability damage modifier'`, `'Roll Modifier'`, `'Skill'`, …), which collide across
complications. **Key every UI list on feature id, never on name.**

**A-15 — Six titles are not in the core sourcebook.** `TitleData` defines 68; the core
sourcebook lists 62. The other six (`safeguarded`, `sigilwright`, `summonerSuccessor`,
`ringleader`, `delegator`, `highSummoner`) belong to the Summoner sourcebook. Core also groups
its list under comments `// Echelon 1/2/3/4` **plus a `// Special` group** containing
`angler`, `goldenrod`, `masterOfReels` — all three of which nonetheless carry `echelon: 1`.
What "Special" means for a title, and whether those three should be echelon-filtered at all,
is **unresolved from the source**.

**A-16 — `Perk.list` vs `FeaturePerkData.lists` are the same enum used for two different jobs.**
On a perk it is a taxonomy tag; on a grant it is a filter set. They cannot diverge in Forge Steel
because both read `PerkList`. Keep them the same enum in our schema, but do not conflate the two
fields in the UI: a perk belongs to exactly one list, a grant allows several.

**A-17 — `HeroOverview.background`.** Present in `src/models/hero.ts` next to `complication`.
There is **no "background" mechanic in Draw Steel** — the FS field is a display concatenation of ancestry / culture /
career for list views. Do not carry the field name into our schema.
