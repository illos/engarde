> **Provenance — read before implementing.**
> Structure in this file is mapped from **Forge Steel**
> (github.com/andyaiken/forgesteel, GPL-3.0), commit `01672c1`, read 2026-08-29.
> Forge Steel is an independent third-party transcription of Draw Steel and is
> **not** our canon source. Every name, number, count and option list below is
> **UNVERIFIED** and must be confirmed against the pinned SteelCompendium
> corpus (DEC-0008) before it is implemented or shown to a user.
> This file is a **structural map for UI and data-model design**, not a rules source.

# Ancestries — structural map

Subject: all 12 ancestries in `src/data/ancestries/`, registered by
`src/data/ancestry-data.ts` as the static class `AncestryData`.

Source files read in full:
`src/models/ancestry.ts`, `src/models/culture.ts`, `src/models/element.ts`,
`src/models/feature.ts`, `src/enums/feature-type.ts`,
`src/logic/factory-feature-logic.ts`, `src/logic/factory-logic.ts`,
`src/logic/ancestry-logic.ts`, `src/logic/feature-logic.ts`,
`src/logic/hero-logic.ts`, `src/logic/pregen-logic.ts`,
`src/logic/update/update-logic.ts`, `src/logic/update/hero-update-logic.ts`,
`src/components/features/feature-data/choice.tsx`,
`src/components/features/feature-data/ancestry-feature-choice.tsx`,
`src/components/pages/heroes/hero-edit/ancestry-section/ancestry-section.tsx`,
`src/components/panels/elements/ancestry-panel/ancestry-panel.tsx`,
and the 12 files in `src/data/ancestries/`.

---

## Identity

`Ancestry extends Element`. `Element` is `{ id, name, description }`.

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | `string` | yes | Stable slug in official data (`ancestry-devil`, `ancestry-high-elf`, …). Homebrew gets `Utils.guid()`. |
| `name` | `string` | yes | Display name. Two ancestries carry a parenthetical discriminator: `Elf (high)`, `Elf (wode)`. |
| `description` | `string` | yes | Flavour prose. `text: VERIFY-AGAINST-PIN` — do not transcribe. |
| `features` | `Feature[]` | yes | Flat, **unlevelled** list. Mixes always-on "signature" features and the point-buy `FeatureChoice`. |
| `ancestryPoints` | `number` | yes | The point-buy budget. See §Ancestry points economy. |
| `culture` | `Culture \| undefined` | **optional** | The ancestry's default ("ancestral") culture. Present on 11 of 12; **absent on Revenant**. |

There is **no** level field, no `featuresByLevel`, and no subclass concept on
`Ancestry`. An ancestry contributes its whole feature list at build time.

Per-ancestry identity values:

| id | name | `ancestryPoints` | `culture` | signature features | purchasable options |
|---|---|---|---|---|---|
| `ancestry-devil` | Devil | 3 | `culture-devil` | 1 | 7 |
| `ancestry-dragon-knight` | Dragon Knight | 3 | `culture-dragon-knight` | 1 (a non-point-buy Choice) | 11 |
| `ancestry-dwarf` | Dwarf | 3 | `culture-dwarf` | 1 (a non-point-buy Choice) | 5 |
| `ancestry-high-elf` | Elf (high) | 3 | `culture-high-elf` | 1 | 6 |
| `ancestry-wode-elf` | Elf (wode) | 3 | `culture-wode-elf` | 1 | 6 |
| `ancestry-hakaan` | Hakaan | 3 | `culture-hakaan` | 1 | 5 |
| `ancestry-human` | Human | 3 | `culture-human` | 1 | 5 |
| `ancestry-memonek` | Memonek | **4** | `culture-memonek` | 2 | 7 |
| `ancestry-orc` | Orc | 3 | `culture-orc` | 1 | 5 |
| `ancestry-polder` | Polder | **4** | `culture-polder` | 2 | 6 |
| `ancestry-revenant` | Revenant | **2** | **absent in source** | 3 | 5 |
| `ancestry-time-raider` | Time Raider | 3 | `culture-time-raider` | 1 | 6 |

Totals: **12 ancestries, 16 signature features, 74 purchasable options.**

Culture ids are derived, not literal: `FactoryLogic.createCulture` computes
`culture-${name.replace(' ', '-').toLowerCase()}`. Note `String.replace` with a
string pattern replaces only the **first** space, so `'Dragon Knight'` →
`culture-dragon-knight` but a three-word culture name would keep its second
space. Ancestral cultures are surfaced as selectable cultures by
`SourcebookLogic.getCultures(sourcebooks, /* includeFromAncestries */ true)`.

### Vocabulary: signature vs purchased

`src/logic/ancestry-logic.ts` defines the only structural split:

- `isPurchasedFeature(f)` ⇔ `f.type === FeatureType.Choice && f.data.count === 'ancestry'`.
- `isSignatureFeature(f)` ⇔ **not** purchased. Everything else, including
  `FeatureChoice`s with a numeric `count`.

So "signature" is a negative definition. A `FeatureChoice` with `count: 1`
(Dragon Knight's Wyrmplate, Dwarf's Runic Carving) is classified **signature**
even though it is a live player choice. Our model should not inherit that
conflation — see §Anomalies.

---

## Level progression

**Adapted — ancestries have no level progression.** There is no `level` field
on `Ancestry`, no `featuresByLevel`, and no ancestry feature anywhere in the 12
files that is gated on hero level. `FeatureLogic.getFeaturesFromAncestry` pushes
every `ancestry.features` entry with `level: undefined`.

What follows is therefore **one feature table per ancestry**, using the required
columns. `Level` is `n/a` in every row (kept for column parity). Rows are given
in **source order**, and nested children of `Multiple` / `Choice` options are
listed as indented sub-rows because they are separately addressable by id.

Column semantics:

- **Choice?** — `yes` if `FeatureLogic.isChoice(feature)` returns true (the
  builder renders a config control), `no` otherwise.
- **count** — the resolved value after factory defaults, not the literal in the
  data file. `createChoice` defaults `count` to `1`; `createSkillChoice` defaults
  `count` to `1`.
- **selectAt** — resolved; `createChoice` and `createSkillChoice` default to `build`.
- **Option source** — where the option list comes from.
- **Selection shape** — what a sparse per-hero selection map would store.

Notation for option sub-rows: `value N` is the point cost inside the enclosing
`FeatureChoice.data.options[].value`.

### Devil — `ancestry-devil`

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| n/a | `devil-feature-1` | Silver Tongue | `Multiple` | no | — | — | — | none |
| n/a | ↳ `devil-feature-1a` | Silver Tongue | `RollModifier` | no | — | — | — | none (`modifier: Edge`, `rollType: Test`, `condition` non-empty, `skills: []`, `characteristics: []`) |
| n/a | ↳ `devil-feature-1b` | Interpersonal Skill | `SkillChoice` | **yes** | 1 | build | `listOptions: [Interpersonal]`, `options: []` | `string[]` of skill names, length ≤ 1 |
| n/a | `devil-feature-2` | Devil Traits | `Choice` | **yes** | `'ancestry'` | build | inline `options[]`, 7 entries | `string[]` of option feature ids |
| n/a | ↳ `devil-feature-2-1` | Barbed Tail | `Text` | no | — | — | value 1 | — |
| n/a | ↳ `devil-feature-2-2` | Beast Legs | `Speed` | no | — | — | value 1 (`speed: 6`) | — |
| n/a | ↳ `devil-feature-2-3` | Glowing Eyes | `Ability` | no | — | — | value 1 | — |
| n/a | ↳ `devil-feature-2-4` | Hellsight | `Text` | no | — | — | value 1 | — |
| n/a | ↳ `devil-feature-2-5` | Impressive Horns | `SaveThreshold` | no | — | — | value 2 (`value: 5`) | — |
| n/a | ↳ `devil-feature-2-6` | Prehensile Tail | `Text` | no | — | — | value 2 | — |
| n/a | ↳ `devil-feature-2-7` | Wings | `Multiple` | no | — | — | value 2 | — |
| n/a | ↳↳ `devil-feature-2-7a` | Wings | `Text` | no | — | — | — | — |
| n/a | ↳↳ `devil-feature-2-7b` | Movement Mode | `MovementMode` | no | — | — | `mode: 'Fly'` | — |

Cost distribution: 4 × 1pt, 3 × 2pt.

### Dragon Knight — `ancestry-dragon-knight`

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| n/a | `dragon-knight-feature-1` | Wyrmplate | `Choice` | **yes** | **1** | **respite** | inline `options[]`, 6 entries, all value 1 | `string[]`, length ≤ 1 |
| n/a | ↳ `dragon-knight-feature-1-1` | Damage Modifier | `DamageModifier` | no | — | — | acid immunity, `createPerLevel(1)` | — |
| n/a | ↳ `dragon-knight-feature-1-2` | Damage Modifier | `DamageModifier` | no | — | — | cold immunity, `createPerLevel(1)` | — |
| n/a | ↳ `dragon-knight-feature-1-3` | Damage Modifier | `DamageModifier` | no | — | — | corruption immunity, `createPerLevel(1)` | — |
| n/a | ↳ `dragon-knight-feature-1-4` | Damage Modifier | `DamageModifier` | no | — | — | fire immunity, `createPerLevel(1)` | — |
| n/a | ↳ `dragon-knight-feature-1-5` | Damage Modifier | `DamageModifier` | no | — | — | lightning immunity, `createPerLevel(1)` | — |
| n/a | ↳ `dragon-knight-feature-1-6` | Damage Modifier | `DamageModifier` | no | — | — | poison immunity, `createPerLevel(1)` | — |
| n/a | `dragon-knight-feature-2` | Dragon Knight Traits | `Choice` | **yes** | `'ancestry'` | build | inline `options[]`, 11 entries | `string[]` of option feature ids |
| n/a | ↳ `dragon-knight-feature-2-1` | Draconian Guard | `Ability` | no | — | — | value 1 | — |
| n/a | ↳ `dragon-knight-feature-2-2` | Prismatic Scales (acid) | `DamageModifier` | no | — | — | value 1 | — |
| n/a | ↳ `dragon-knight-feature-2-3` | Prismatic Scales (cold) | `DamageModifier` | no | — | — | value 1 | — |
| n/a | ↳ `dragon-knight-feature-2-4` | Prismatic Scales (corruption) | `DamageModifier` | no | — | — | value 1 | — |
| n/a | ↳ `dragon-knight-feature-2-5` | Prismatic Scales (fire) | `DamageModifier` | no | — | — | value 1 | — |
| n/a | ↳ `dragon-knight-feature-2-6` | Prismatic Scales (lightning) | `DamageModifier` | no | — | — | value 1 | — |
| n/a | ↳ `dragon-knight-feature-2-7` | Prismatic Scales (poison) | `DamageModifier` | no | — | — | value 1 | — |
| n/a | ↳ `dragon-knight-feature-2-8` | Remember your Oath | `Ability` | no | — | — | value 1 | — |
| n/a | ↳ `dragon-knight-feature-2-9` | Draconic Pride | `Ability` | no | — | — | value 2 | — |
| n/a | ↳ `dragon-knight-feature-2-10` | Dragon Breath | `Ability` | no | — | — | value 2 | — |
| n/a | ↳ `dragon-knight-feature-2-11` | Wings | `Multiple` | no | — | — | value 2 | — |
| n/a | ↳↳ `dragon-knight-feature-2-11a` | Wings | `Text` | no | — | — | — | — |
| n/a | ↳↳ `dragon-knight-feature-2-11b` | Movement Mode | `MovementMode` | no | — | — | `mode: 'Fly'` | — |

Cost distribution: 8 × 1pt, 3 × 2pt. Wyrmplate's 6 options are *unnamed* in the
data (`createDamageModifier` defaults `name` to `'Damage Modifier'`) — the UI
would render six identically-labelled options. See §Anomalies.

### Dwarf — `ancestry-dwarf`

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| n/a | `dwarf-feature-1` | Runic Carving | `Choice` | **yes** | **1** | **play** | inline `options[]`, 3 entries, all value 1 | `string[]`, length ≤ 1 |
| n/a | ↳ `dwarf-feature-1a` | Detection | `Text` | no | — | — | value 1 | — |
| n/a | ↳ `dwarf-feature-1b` | Light | `Text` | no | — | — | value 1 | — |
| n/a | ↳ `dwarf-feature-1c` | Voice | `Text` | no | — | — | value 1 | — |
| n/a | `dwarf-feature-2` | Dwarf Traits | `Choice` | **yes** | `'ancestry'` | build | inline `options[]`, 5 entries | `string[]` of option feature ids |
| n/a | ↳ `dwarf-feature-2-1` | Grounded | `Bonus` | no | — | — | value 1 (`field: Stability`, `value: 1`) | — |
| n/a | ↳ `dwarf-feature-2-2` | Stand Tough | `Multiple` | no | — | — | value 1 | — |
| n/a | ↳↳ `dwarf-feature-2-2a` | Stand Tough | `PotencyResistance` | no | — | — | `characteristics: [Might]`, `value: 1` (default) | — |
| n/a | ↳↳ `dwarf-feature-2-2b` | Stand Tough | `RollModifier` | no | — | — | `Edge`, `characteristics: [Might]`, `condition` non-empty | — |
| n/a | ↳ `dwarf-feature-2-3` | Stone Singer | `Text` | no | — | — | value 1 | — |
| n/a | ↳ `dwarf-feature-2-4` | Great Fortitude | `ConditionImmunity` | no | — | — | value 2 (`conditions: [Weakened]`) | — |
| n/a | ↳ `dwarf-feature-2-5` | Spark Off Your Skin | `Bonus` | no | — | — | value 2 (`field: Stamina`, `valuePerEchelon: 6`, `value: 0`) | — |

Cost distribution: 3 × 1pt, 2 × 2pt.

### Elf (high) — `ancestry-high-elf`

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| n/a | `high-elf-feature-1` | High Elf Glamor | `Multiple` | no | — | — | — | none |
| n/a | ↳ `high-elf-feature-1a` | High Elf Glamor | `Text` | no | — | — | — | — |
| n/a | ↳ `high-elf-feature-1b` | High Elf Glamor | `RollModifier` | no | — | — | `Edge`, `characteristics: [Presence]`, `skills: ['Flirt','Persuade']`, `condition: ''` | — |
| n/a | `high-elf-feature-2` | High Elf Features | `Choice` | **yes** | `'ancestry'` | build | inline `options[]`, 6 entries | `string[]` of option feature ids |
| n/a | ↳ `high-elf-feature-2-0` | Glamor of Terror | `Ability` | no | — | — | value 2 | — |
| n/a | ↳ `high-elf-feature-2-1` | Graceful Retreat | `Bonus` | no | — | — | value 1 (`field: Disengage`, `value: 1`) | — |
| n/a | ↳ `high-elf-feature-2-2` | High Senses | `RollModifier` | no | — | — | value 1 (`Edge`, condition-only) | — |
| n/a | ↳ `high-elf-feature-2-4` | Otherworldly Grace | `SaveThreshold` | no | — | — | value 2 (`value: 5`) | — |
| n/a | ↳ `high-elf-feature-2-3` | Revisit Memory | `RollModifier` | no | — | — | value 1 (`Edge`, condition-only) | — |
| n/a | ↳ `high-elf-feature-2-5` | Unstoppable Mind | `ConditionImmunity` | no | — | — | value 2 (`conditions: [Dazed]`) | — |

Cost distribution: 3 × 1pt, 3 × 2pt. Note the option list is sorted by **name**,
so ids run `2-0, 2-1, 2-2, 2-4, 2-3, 2-5` — id order ≠ array order. Also note
this ancestry's choice is named "High Elf **Features**" where every other
ancestry uses "… **Traits**".

### Elf (wode) — `ancestry-wode-elf`

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| n/a | `wode-elf-feature-1` | Wode Elf Glamor | `Multiple` | no | — | — | — | none |
| n/a | ↳ `wode-elf-feature-1a` | Wode Elf Glamor | `Text` | no | — | — | — | — |
| n/a | ↳ `wode-elf-feature-1b` | Wode Elf Glamor | `RollModifier` | no | — | — | `Edge`, `skills: ['Hide','Sneak']` | — |
| n/a | `wode-elf-feature-2` | Wode Elf Traits | `Choice` | **yes** | `'ancestry'` | build | inline `options[]`, 6 entries | `string[]` of option feature ids |
| n/a | ↳ `wode-elf-feature-2-1` | Forest Walk | `Text` | no | — | — | value 1 | — |
| n/a | ↳ `wode-elf-feature-2-2` | Revisit Memory | `RollModifier` | no | — | — | value 1 | — |
| n/a | ↳ `wode-elf-feature-2-3` | Swift | `Speed` | no | — | — | value 1 (`speed: 6`) | — |
| n/a | ↳ `wode-elf-feature-2-4` | Otherworldly Grace | `SaveThreshold` | no | — | — | value 2 (`value: 5`) | — |
| n/a | ↳ `wode-elf-feature-2-5` | The Wode Defends | `Ability` | no | — | — | value 2 | — |
| n/a | ↳ `wode-elf-feature-2-6` | Quick and Brutal | `Text` | no | — | — | value 1 | — |

Cost distribution: 4 × 1pt, 2 × 2pt.

`wode-elf-feature-2-2` (Revisit Memory) and `high-elf-feature-2-3` (Revisit
Memory) are the **same feature name with different ids** — cross-ancestry
identity is by id, not name. Same for Otherworldly Grace
(`wode-elf-feature-2-4` vs `high-elf-feature-2-4`) — note these two share a
**suffix** but not a full id.

### Hakaan — `ancestry-hakaan`

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| n/a | `hakaan-feature-1` | Big! | `Size` | no | — | — | `size: { value: 1, mod: 'L' }` | none |
| n/a | `hakaan-feature-2` | Hakaan Traits | `Choice` | **yes** | `'ancestry'` | build | inline `options[]`, 5 entries | `string[]` of option feature ids |
| n/a | ↳ `hakaan-feature-2-1` | All Is A Feather | `RollModifier` | no | — | — | value 1 (`Edge`, condition-only) | — |
| n/a | ↳ `hakaan-feature-2-2` | Forceful | `Multiple` | no | — | — | value 1 | — |
| n/a | ↳↳ `hakaan-feature-2-2a` | Forced Movement: Push | `Bonus` | no | — | — | `field: ForcedMovementPush`, `value: 1` | — |
| n/a | ↳↳ `hakaan-feature-2-2b` | Forced Movement: Pull | `Bonus` | no | — | — | `field: ForcedMovementPull`, `value: 1` | — |
| n/a | ↳↳ `hakaan-feature-2-2c` | Forced Movement: Slide | `Bonus` | no | — | — | `field: ForcedMovementSlide`, `value: 1` | — |
| n/a | ↳ `hakaan-feature-2-3` | Stand Tough | `Multiple` | no | — | — | value 1 | — |
| n/a | ↳↳ `hakaan-feature-2-3a` | Stand Tough | `PotencyResistance` | no | — | — | `characteristics: [Might]`, `value: 1` (default) | — |
| n/a | ↳↳ `hakaan-feature-2-3b` | Stand Tough | `RollModifier` | no | — | — | `Edge`, `characteristics: [Might]` | — |
| n/a | ↳ `hakaan-feature-2-4` | Great Fortitude | `ConditionImmunity` | no | — | — | value 2 (`conditions: [Weakened]`) | — |
| n/a | ↳ `hakaan-feature-2-5` | Doomsight | `Text` | no | — | — | value 2 | — |

Cost distribution: 3 × 1pt, 2 × 2pt. The three `Bonus` children of Forceful are
**unnamed** in the data — `createBonus` defaults `name` to
`data.field.toString()`, giving the three names shown.

Hakaan Stand Tough (`hakaan-feature-2-3`) and Dwarf Stand Tough
(`dwarf-feature-2-2`) are structurally identical, differently-id'd features.
This matters for Revenant's cross-ancestry picker (duplicate names in one list).

### Human — `ancestry-human`

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| n/a | `human-feature-1` | Detect the Supernatural | `Ability` | no | — | — | — | none |
| n/a | `human-feature-2` | Human Traits | `Choice` | **yes** | `'ancestry'` | build | inline `options[]`, 5 entries | `string[]` of option feature ids |
| n/a | ↳ `human-feature-2-1` | Can't Take Hold | `Text` | no | — | — | value 1 | — |
| n/a | ↳ `human-feature-2-2` | Perseverence | `Multiple` | no | — | — | value 1 | — |
| n/a | ↳↳ `human-feature-2-2a` | Perseverence | `Text` | no | — | — | — | — |
| n/a | ↳↳ `human-feature-2-2b` | Perseverence | `RollModifier` | no | — | — | `Edge`, `skills: ['Endurance']` | — |
| n/a | ↳ `human-feature-2-3` | Resist the Unnatural | `Ability` | no | — | — | value 1 | — |
| n/a | ↳ `human-feature-2-4` | Determination | `Ability` | no | — | — | value 2 | — |
| n/a | ↳ `human-feature-2-5` | Staying Power | `Bonus` | no | — | — | value 2 (`field: Recoveries`, `value: 2`) | — |

Cost distribution: 3 × 1pt, 2 × 2pt. "Perseverence" is spelled that way in the
source; flag against the pin.

### Memonek — `ancestry-memonek`

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| n/a | `memonek-feature-1` | Fall Lightly | `Text` | no | — | — | — | none |
| n/a | `memonek-feature-2` | Lightweight | `Text` | no | — | — | — | none |
| n/a | `memonek-feature-3` | Memonek Traits | `Choice` | **yes** | `'ancestry'` | build | inline `options[]`, 7 entries | `string[]` of option feature ids |
| n/a | ↳ `memonek-feature-3-1` | I Am Law | `Text` | no | — | — | value 1 | — |
| n/a | ↳ `memonek-feature-3-2` | Systematic Mind | `Multiple` | no | — | — | value 1 | — |
| n/a | ↳↳ `memonek-feature-3-2a` | Systematic Mind | `Text` | no | — | — | — | — |
| n/a | ↳↳ `memonek-feature-3-2b` | Systematic Mind | `RollModifier` | no | — | — | `Edge`, condition-only | — |
| n/a | ↳ `memonek-feature-3-3` | Unphased | `Text` | no | — | — | value 1 | — |
| n/a | ↳ `memonek-feature-3-4` | Useful Emotion | `SurgeGain` | no | — | — | value 1 (`tag: 'start-combat'`, `frequency: OncePerEncounter`, `value: '1'`, `used: false`, `replacesTags: []`, `condition: ''`) | — |
| n/a | ↳ `memonek-feature-3-5` | Keeper of Order | `Ability` | no | — | — | value 2 | — |
| n/a | ↳ `memonek-feature-3-6` | Lightning Nimbleness | `Speed` | no | — | — | value 2 (`speed: 7`) | — |
| n/a | ↳ `memonek-feature-3-7` | Nonstop | `ConditionImmunity` | no | — | — | value 2 (`conditions: [Slowed]`) | — |

Cost distribution: 4 × 1pt, 3 × 2pt. Budget is **4**, not 3.

`SurgeGain` is the only ancestry feature in the corpus that carries mutable
runtime state (`used: boolean`) inside a *definition* record — a
definition/selection-split hazard.

### Orc — `ancestry-orc`

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| n/a | `orc-feature-1` | Relentless | `Text` | no | — | — | — | none |
| n/a | `orc-feature-2` | Orc Traits | `Choice` | **yes** | `'ancestry'` | build | inline `options[]`, 5 entries | `string[]` of option feature ids |
| n/a | ↳ `orc-feature-2-1` | Bloodfire Rush | `Text` | no | — | — | value 1 | — |
| n/a | ↳ `orc-feature-2-2` | Grounded | `Bonus` | no | — | — | value 1 (`field: Stability`, `value: 1`) | — |
| n/a | ↳ `orc-feature-2-3` | Passionate Artisan | `Text` | no | — | — | value 1 | — |
| n/a | ↳ `orc-feature-2-4` | Glowing Recovery | `Text` | no | — | — | value 2 | — |
| n/a | ↳ `orc-feature-2-5` | Nonstop | `ConditionImmunity` | no | — | — | value 2 (`conditions: [Slowed]`) | — |

Cost distribution: 3 × 1pt, 2 × 2pt.

`orc-feature-2-3` (Passionate Artisan) is modelled as pure `Text` but its
`text: VERIFY-AGAINST-PIN` describes picking two crafting skills — i.e. a real
choice-point that Forge Steel declines to model. Ours must decide: model it, or
render it as Director-adjudicated text.

`orc-feature-2-5` Nonstop and `memonek-feature-3-7` Nonstop are duplicate names
at different ids and different point costs (2 and 2 — same here, but the general
hazard stands).

### Polder — `ancestry-polder`

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| n/a | `polder-feature-1` | Shadowmeld | `Ability` | no | — | — | — | none |
| n/a | `polder-feature-2` | Small! | `Size` | no | — | — | `size: { value: 1, mod: 'S' }` | none |
| n/a | `polder-feature-3` | Polder Traits | `Choice` | **yes** | `'ancestry'` | build | inline `options[]`, 6 entries | `string[]` of option feature ids |
| n/a | ↳ `polder-feature-3-1` | Corruption Immunity | `DamageModifier` | no | — | — | value 1 (`createValuePlusPerLevel`: `value: 3`, `valuePerLevel: 1`) | — |
| n/a | ↳ `polder-feature-3-2` | Graceful Retreat | `Bonus` | no | — | — | value 1 (`field: Disengage`, `value: 1`) | — |
| n/a | ↳ `polder-feature-3-3` | Polder Geist | `Text` | no | — | — | value 1 | — |
| n/a | ↳ `polder-feature-3-4` | Reactive Tumble | `Ability` | no | — | — | value 1 | — |
| n/a | ↳ `polder-feature-3-5` | Fearless | `ConditionImmunity` | no | — | — | value 2 (`conditions: [Frightened]`) | — |
| n/a | ↳ `polder-feature-3-6` | Nimblestep | `Text` | no | — | — | value 2 | — |

Cost distribution: 4 × 1pt, 2 × 2pt. Budget is **4**.

`polder-feature-3-2` Graceful Retreat and `high-elf-feature-2-1` Graceful
Retreat are duplicate names / distinct ids, both 1pt `Bonus(Disengage, 1)`.

`createValuePlusPerLevel({ value: 2, perLevel: 1 })` stores `value: value + perLevel = 3`
and `valuePerLevel: 1` — the stored `value` is **not** the literal written in the
data file. Any importer that reads `value` naively will be off by `perLevel`.

### Revenant — `ancestry-revenant`

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| n/a | `revenant-feature-1` | Former Life | `AncestryChoice` | **yes** | 1 | build | all ancestries in enabled sourcebooks | single ancestry id |
| n/a | `revenant-feature-2` | Damage Modifier | `DamageModifier` | no | — | — | 5 modifiers: cold/corruption/lightning/poison immunity `createPerLevel(1)`; fire weakness `create(5)` | none |
| n/a | `revenant-feature-3` | Tough But Withered | `Text` | no | — | — | — | none |
| n/a | `revenant-feature-4` | Revenant Traits | `Choice` | **yes** | `'ancestry'` | build | inline `options[]`, 5 entries | `string[]` of option feature ids |
| n/a | ↳ `revenant-feature-4-1` | Ancestry Feature | `AncestryFeatureChoice` | **yes** | — | — | value 1; `source: { current: false, former: true, customID: '' }`, `value: 1` | single feature id (nested under the parent's selection) |
| n/a | ↳ `revenant-feature-4-2` | Undead Influence | `RollModifier` | no | — | — | value 1 (`Edge`, `characteristics: [Reason, Intuition, Presence]`, condition non-empty) | — |
| n/a | ↳ `revenant-feature-4-3` | Bloodless | `ConditionImmunity` | no | — | — | value 2 (`conditions: [Bleeding]`) | — |
| n/a | ↳ `revenant-feature-4-4` | Ancestry Feature | `AncestryFeatureChoice` | **yes** | — | — | value 2; `source: { current: false, former: true, customID: '' }`, `value: 2` | single feature id |
| n/a | ↳ `revenant-feature-4-5` | Vengeance Mark | `Multiple` | no | — | — | value 2 | — |
| n/a | ↳↳ `revenant-feature-4-5-1` | Vengeance Mark | `Text` | no | — | — | — | — |
| n/a | ↳↳ `revenant-feature-4-5-2` | Detonate Sigil | `Ability` | no | — | — | — | — |

Cost distribution: 2 × 1pt, 3 × 2pt. Budget is **2** (plus a conditional +1 —
see §Ancestry points economy).

`revenant-feature-2` is **unnamed** in the data → `createDamageModifier` default
name `'Damage Modifier'`. Both `AncestryFeatureChoice` options are unnamed →
`createAncestryFeature` default name `'Ancestry Feature'`, so the picker shows
two rows labelled identically, distinguished only by the "A 1pt/2pt ancestry
feature" sub-line rendered by `InfoAncestryFeatureChoice`.

Revenant is the **only** ancestry with no `culture` field.

### Time Raider — `ancestry-time-raider`

| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |
|---|---|---|---|---|---|---|---|---|
| n/a | `time-raider-feature-1` | Psychic Scar | `DamageModifier` | no | — | — | psychic immunity `createPerLevel(1)` | none |
| n/a | `time-raider-feature-2` | Time Raider Traits | `Choice` | **yes** | `'ancestry'` | build | inline `options[]`, 6 entries | `string[]` of option feature ids |
| n/a | ↳ `time-raider-feature-2-1` | Beyondsight | `Ability` | no | — | — | value 1 | — |
| n/a | ↳ `time-raider-feature-2-2` | Foresight | `Multiple` | no | — | — | value 1 | — |
| n/a | ↳↳ `time-raider-feature-2-2a` | Foresight | `Text` | no | — | — | — | — |
| n/a | ↳↳ `time-raider-feature-2-2b` | Foresight | `Ability` | no | — | — | — | — |
| n/a | ↳ `time-raider-feature-2-3b` | Four-Armed Athletics | `RollModifier` | no | — | — | value 1 (`Edge`, `skills: ['Climb','Gymnastics','Swim']`, condition non-empty) | — |
| n/a | ↳ `time-raider-feature-2-4` | Four-Armed Martial Arts | `Text` | no | — | — | value 2 | — |
| n/a | ↳ `time-raider-feature-2-5` | Psionic Gift | **`Choice` (nested)** | **yes** | **1** | build | value 2; inline `options[]`, 3 entries, all value 1 | `string[]`, length ≤ 1, nested under the parent's selection |
| n/a | ↳↳ `time-raider-feature-2-5-1` | Concussive Slam | `Ability` | no | — | — | value 1 | — |
| n/a | ↳↳ `time-raider-feature-2-5-2` | Psionic Bolt | `Ability` | no | — | — | value 1 | — |
| n/a | ↳↳ `time-raider-feature-2-5-3` | Minor Acceleration | `Ability` | no | — | — | value 1 | — |
| n/a | ↳ `time-raider-feature-2-6` | Unstoppable Mind | `ConditionImmunity` | no | — | — | value 2 (`conditions: [Dazed]`) | — |

Cost distribution: 3 × 1pt, 3 × 2pt.

Id `time-raider-feature-2-3b` has **no `-2-3a` sibling** — a leftover from an
earlier `Multiple` shape. Do not assume id suffix continuity.

`time-raider-feature-2-5` is the corpus's only **choice-inside-a-purchased-option**
(a `Choice` nested as an option of a point-buy `Choice`). It is the single
strongest argument for a recursive selection model.

---

## Subclasses

**Not applicable.** `Ancestry` has no subclass concept — no `subclasses`,
`subclassName`, or `subclassCount` field, and nothing in the 12 data files plays
that role. `SubClass` is class-only (`src/models/class.ts`).

The nearest structural analogue is Revenant's `Former Life`
(`FeatureType.AncestryChoice`), which nests an entire *other* `Ancestry` inside
the hero, but it is a feature, not a subclass tier, and it grants no features by
itself — only Revenant's two `AncestryFeatureChoice` options reach into it.

---

## Ancestry points economy

This is the core of the ancestry builder. Three model elements interlock:
`Ancestry.ancestryPoints`, `FeatureChoiceData.count === 'ancestry'`, and
`FeatureChoiceData.options[].value`.

### How the budget is set

`HeroLogic.getAncestryPoints(hero)` (`src/logic/hero-logic.ts`) is the single
source of truth. It sums three terms:

1. **Base.** `hero.ancestry.ancestryPoints` — `3` for nine ancestries, `4` for
   Memonek and Polder, `2` for Revenant. `FactoryLogic.createAncestry()` defaults
   new homebrew ancestries to `3`.
2. **Revenant size rider.** Hard-coded, id-matched:
   `if (hero.ancestry.id === AncestryData.revenant.id)` and
   `HeroLogic.getSize(hero)` is exactly `{ value: 1, mod: 'S' }`, then `+1`.
   `getSize` reads `FeatureType.Size` features on the hero first, then falls back
   to `Size` features on **former ancestries** (`getFormerAncestries`, which
   collects the `selected` ancestry of every `AncestryChoice` feature). In
   practice: picking Polder as your Former Life pushes a Revenant's budget from
   2 to 3.
3. **`Bonus` features targeting `FeatureField.AncestryPoints`.** Every feature on
   the hero of type `Bonus` whose `data.field === FeatureField.AncestryPoints`
   adds `ModifierLogic.calculateModifierValue(f.data, hero)`. **No shipped
   ancestry, class, career, culture or complication uses this field** — it exists
   only for homebrew and the hero-customize modal. It is nonetheless a real
   budget input and our model must support it.

The budget is therefore **derived, dynamic, and dependent on other selections** —
never a stored scalar.

### How option costs work

Each entry of `FeatureChoiceData.options` is `{ feature: Feature, value: number }`.
`value` is the **point cost**, authored per option. Across all 12 ancestries only
two costs occur: **1** and **2**. `FactoryFeatureLogic.createChoice` does not
default `value` — the data must supply it; the homebrew editor's `NumberSpin` for
option value has `min={1}`.

Spend accounting (`ConfigChoice` in
`src/components/features/feature-data/choice.tsx`):

```
pointsUsed = sum over selected ids of (matching option's value, else 0)
pointsMax  = count === 'ancestry' ? HeroLogic.getAncestryPoints(hero) : count
pointsLeft = pointsMax - pointsUsed
```

There is **no explicit maximum on the number of options**, only the budget.
There is no partial spend of a single option, no repeat purchase (an already
selected id is filtered out of the available list), and no refund mechanic beyond
removing a selection.

### Affordability gating

`unavailableIDs` — options too expensive to afford — is computed **only when**
`props.data.options.some(opt => opt.value > 1)`, i.e. only when the *authored*
list contains at least one 2pt option. It filters
`!selectedIDs.includes(id) && opt.value > pointsLeft`.

Every shipped ancestry has at least one 2pt option, so gating is always active in
practice. But this is a latent defect: an ancestry whose options were all 1pt
would allow unlimited overspend, and the check reads `props.data.options` rather
than the merged `allOptions` used everywhere else. Our implementation must gate
on the merged list unconditionally.

### Completion

`FeatureLogic.isChosen` for `count === 'ancestry'`:

```
sum(value of selected options) >= getAncestryPoints(hero)
```

Note `>=`, not `===`. Because all costs are 1 or 2 and budgets are 2–4, exact
spend is always reachable, but the predicate tolerates overspend. A hero with
points left is **not** "chosen" and the ancestry section shows an outstanding
choice.

Also note `isChosen` recomputes `availableOptions` from **every ancestry in every
enabled sourcebook** when `count === 'ancestry'` — not from the hero's own
ancestry. That is how a cross-ancestry selection (Revenant, or the "extended"
toggle) still scores its points.

### How remaining points must be shown in the UI

Forge Steel's behaviour, which we should match structurally:

- A `showCosts` flag = "any authored option costs more than 1". When true the
  builder renders a running "**You have N point(s) to spend.**" line; when false
  it renders "Choose N option(s)." — i.e. the same control degrades to a plain
  multi-select-N when all costs are equal.
- The line is **hidden entirely when `pointsLeft === 0`** in config mode (the
  ternary yields `null`). Read-only info mode instead always renders
  "You have {count} points to spend…" using the raw `count`, which for
  `'ancestry'` prints the literal string `ancestry`. Both are bugs to avoid: our
  control should always show `spent / total` and should never print the sentinel.
- Each option row renders with its cost badge (`FeaturePanel cost={value}`) only
  when `showCosts`.
- The "Choose an option" button is rendered **only while `pointsLeft > 0`**.
- Selected options render as removable chips (`SelectionBox` with `onRemove`).
- Options priced above `pointsLeft` are filtered **out of the list** rather than
  shown disabled. Showing them disabled-with-cost is the better touch-first
  behaviour and is what we should do.

Requirements for our control:

1. Always display `pointsUsed / pointsMax` and `pointsLeft`, including at 0 left.
2. Never render the sentinel `'ancestry'` as a number.
3. Render unaffordable options disabled with their cost visible, not hidden.
4. Recompute `pointsMax` reactively — the Revenant/Former Life dependency means
   the budget can change while the panel is open.
5. Removing a selection must re-enable previously unaffordable options in the
   same render pass.

### How a partially-spent budget is persisted

Forge Steel persists the selection **inline**: `hero.ancestry` is a deep copy of
the whole `Ancestry`, and the purchase list lives at
`hero.ancestry.features[i].data.selected: Feature[]` — full deep-copied feature
objects, not ids. A partially spent budget is simply a shorter array; there is no
"budget remaining" field anywhere. Remaining points are always recomputed.

The important consequence: **a partially-spent budget is a first-class, valid,
persisted state.** Nothing blocks saving a hero mid-spend; `isChosen` merely
returns false and the section is flagged as incomplete.

Forge Steel's *other* representation is the one we want. `Pregen`
(`src/models/pregen.ts`) stores exactly:

```ts
featureSelections: { featureID: string; selections: string[] }[]
```

— a sparse map from feature id to selected ids. `PregenLogic.getFeatureSelections`
projects a live hero down to it; `PregenLogic.setFeatureSelections` rehydrates.
For `FeatureType.Choice` the projection is `feature.data.selected.map(o => o.id)`
and the rehydration resolves ids against
`AncestryLogic.getPurchasedFeatures(a)` across **all** ancestries when
`count === 'ancestry'`.

`PregenLogic.createHero` rehydrates in a **fixpoint loop** — it repeatedly finds
features that are choices, are not yet chosen, and have a stored selection, and
applies them, until no more appear. That loop exists because Revenant's
`Former Life` must resolve before `Revenant Traits`' `AncestryFeatureChoice`
options have any option list at all. Our rehydration needs the same
dependency-ordered (or iterate-to-fixpoint) pass.

### Cross-ancestry purchasing ("extended" mode)

`ConfigChoice` offers a toggle, **only when `count === 'ancestry'`**, labelled
"Choose a feature from any ancestry". When on, `allOptions` is replaced by every
purchased option of every ancestry in every enabled sourcebook, and an
`Alert type='warning'` reading "This is typically against the rules." is shown.
This is a deliberate homebrew escape hatch, not a rule. Our builder should keep
it behind a Director/homebrew flag or drop it; it must not be the default.

---

## Abilities

19 abilities across the 12 ancestries. All are produced by
`FactoryLogic.createAbility`, whose defaults are:
`description: ''`, `type: createNoAction()`, `keywords: []`, `distance: []`,
`target: ''`, `cost: 0`, `repeatable: false`, `minLevel: 1`.
Every ancestry ability leaves `repeatable` and `minLevel` at default.

`cost` values seen: `0` (default, i.e. free/no-resource) and `'signature'`.
**No ancestry ability has a numeric resource cost.**

| Ability ID | Name | Ancestry | Cost | Keywords | Action type | Distance | Target | Pt cost |
|---|---|---|---|---|---|---|---|---|
| `devil-feature-2-3` | Glowing Eyes | Devil | 0 | — | Trigger (`trigger` non-empty, `free: false`) | — | — | 1 |
| `dragon-knight-feature-2-1` | Draconian Guard | Dragon Knight | 0 | — | Trigger (`free: false`) | Self | `Self` | 1 |
| `dragon-knight-feature-2-8` | Remember your Oath | Dragon Knight | 0 | — | Maneuver | — | — | 1 |
| `dragon-knight-feature-2-9` | Draconic Pride | Dragon Knight | `signature` | Area, Magic | Main action | Burst 1 | `Each enemy in the area` | 2 |
| `dragon-knight-feature-2-10` | Dragon Breath | Dragon Knight | `signature` | Area, Magic | Main action | Cube 3 within 1 | `Each enemy in the area` | 2 |
| `high-elf-feature-2-0` | Glamor of Terror | Elf (high) | 0 | — | Trigger (`free: false`) | — | — | 2 |
| `wode-elf-feature-2-5` | The Wode Defends | Elf (wode) | `signature` | Magic, Ranged, Strike | Main action | Ranged 10 | `One creature` | 2 |
| `human-feature-1` | Detect the Supernatural | Human | 0 | — | Maneuver | — | — | signature feature |
| `human-feature-2-3` | Resist the Unnatural | Human | 0 | — | Trigger (`free: false`) | — | — | 1 |
| `human-feature-2-4` | Determination | Human | 0 | — | Maneuver | — | — | 2 |
| `memonek-feature-3-5` | Keeper of Order | Memonek | 0 | — | Trigger, **`free: true`** | — | — | 2 |
| `polder-feature-1` | Shadowmeld | Polder | 0 | Magic | Maneuver | Self | `Self` | signature feature |
| `polder-feature-3-4` | Reactive Tumble | Polder | 0 | — | Trigger, **`free: true`** | — | — | 1 |
| `revenant-feature-4-5-2` | Detonate Sigil | Revenant | `signature` | Magic, Ranged, Strike | Main action | Ranged 10 | `One creature bearing your sigil` | 2 (via `Multiple`) |
| `time-raider-feature-2-1` | Beyondsight | Time Raider | 0 | — | Maneuver | Self | `Self` | 1 |
| `time-raider-feature-2-2b` | Foresight | Time Raider | 0 | — | Trigger (`free: false`) | Self | `Self` | 1 (via `Multiple`) |
| `time-raider-feature-2-5-1` | Concussive Slam | Time Raider | `signature` | Psionic, Ranged, Strike | Main action | Ranged 10 | `One creature or object` | 2 (via nested `Choice`) |
| `time-raider-feature-2-5-2` | Psionic Bolt | Time Raider | `signature` | Psionic, Ranged, Strike | Main action | Ranged 10 | `One creature or object` | 2 (via nested `Choice`) |
| `time-raider-feature-2-5-3` | Minor Acceleration | Time Raider | `signature` | Psionic, Melee | Maneuver | Self **and** Melee 1 | `Self or one ally` | 2 (via nested `Choice`) |

Section structure (`AbilitySection` discriminated union — `text` / `field` /
`roll` / `package`). Only two kinds appear:

| Ability | Sections |
|---|---|
| Draconic Pride | 1 × `roll` |
| Dragon Breath | 1 × `roll`, 1 × `text` |
| The Wode Defends | 1 × `roll` |
| Detonate Sigil | 1 × `roll`, 1 × `text` |
| Concussive Slam | 1 × `roll` |
| Psionic Bolt | 1 × `roll` |
| all other 13 | 1 × `text` |

Power-roll structure (`FactoryLogic.createPowerRoll`; `bonus` defaults `0`, `crit`
is accepted by the signature but **never written to the returned object** — a
source bug):

| Ability | `characteristic` | tier1 / tier2 / tier3 |
|---|---|---|
| Draconic Pride | `[Might, Presence]` | `text: VERIFY-AGAINST-PIN` |
| Dragon Breath | `[Might, Presence]` | `text: VERIFY-AGAINST-PIN` |
| The Wode Defends | `[Might, Agility]` | `text: VERIFY-AGAINST-PIN` |
| Detonate Sigil | `[Reason, Intuition, Presence]` | `text: VERIFY-AGAINST-PIN` |
| Concussive Slam | `[Reason, Intuition, Presence]` | `text: VERIFY-AGAINST-PIN` |
| Psionic Bolt | `[Reason, Intuition, Presence]` | `text: VERIFY-AGAINST-PIN` |
| Minor Acceleration | — (no roll section) | — |

Tier strings are freeform prose containing embedded mechanics (`[weak]`,
`[average]`, `[strong]` potency placeholders; `M or A` characteristic
placeholders). They are **parsed at render time, not structured**. Our engine
already has a grammar/Effect pipeline (ROAD-0005); these strings are input to it,
not a new format.

---

## Choice-point inventory

Build-order list of every decision the player makes inside the ancestry step.
Cardinality is stated as (min…max selections).

**Step A — pick the ancestry.** 1 of 12 (plus homebrew). Single-select.
Cardinality (1…1). Not itself a `Feature`; it's the `hero.ancestry` assignment.
Downstream: it sets the point budget and the entire option list, and it makes
`hero.ancestry.culture` the "your ancestry" shortcut in the culture step.

**Step B — non-point-buy choices on the chosen ancestry** (only three ancestries
have one):

| # | Ancestry | Feature ID | Kind | Cardinality | selectAt | Notes |
|---|---|---|---|---|---|---|
| B1 | Dragon Knight | `dragon-knight-feature-1` | `Choice`, 6 options | (0…1) | **respite** | Re-made every respite. Options are unnamed → must be labelled from damage type. |
| B2 | Dwarf | `dwarf-feature-1` | `Choice`, 3 options | (0…1) | **play** | Re-made during play. Surfaces in the conditional-features list, not the builder. |
| B3 | Devil | `devil-feature-1b` | `SkillChoice`, Interpersonal list | (0…1) | build | Nested inside `Multiple` `devil-feature-1`. Deduped against already-known skills on ancestry swap. |

**Step C — Revenant only: Former Life.** `revenant-feature-1`,
`FeatureType.AncestryChoice`, cardinality (0…1), single-select over **all**
ancestries. Must resolve **before** step D for Revenant, because it feeds both
the size rider (budget 2 → 3 if the former ancestry is Small) and the option list
of the two `AncestryFeatureChoice` entries.

**Step D — the point-buy purchase.** One `FeatureChoice` with `count: 'ancestry'`
per ancestry, always present, always `selectAt: 'build'`.
Cardinality: variable — (0…N) where N is bounded by budget ÷ cheapest option.
Concretely, with all-1pt purchases: up to 3 (most), 4 (Memonek/Polder), 2–3
(Revenant). Complete when `sum(values) >= getAncestryPoints(hero)`.

Per-ancestry option cardinality and cost mix:

| Ancestry | Budget | Options | 1pt | 2pt | Max simultaneous picks |
|---|---|---|---|---|---|
| Devil | 3 | 7 | 4 | 3 | 3 |
| Dragon Knight | 3 | 11 | 8 | 3 | 3 |
| Dwarf | 3 | 5 | 3 | 2 | 3 |
| Elf (high) | 3 | 6 | 3 | 3 | 3 |
| Elf (wode) | 3 | 6 | 4 | 2 | 3 |
| Hakaan | 3 | 5 | 3 | 2 | 3 |
| Human | 3 | 5 | 3 | 2 | 3 |
| Memonek | 4 | 7 | 4 | 3 | 4 |
| Orc | 3 | 5 | 3 | 2 | 3 |
| Polder | 4 | 6 | 4 | 2 | 4 |
| Revenant | 2 (3 if former ancestry is Small) | 5 | 2 | 3 | 2 (3) |
| Time Raider | 3 | 6 | 3 | 3 | 3 |

**Step E — sub-choices unlocked by a step-D purchase.** These only exist if the
enabling option was purchased:

| # | Enabling purchase | Sub-choice | Kind | Cardinality | Option source |
|---|---|---|---|---|---|
| E1 | `revenant-feature-4-1` (1pt) | itself | `AncestryFeatureChoice` | (0…1) | 1pt purchased options of the **former** ancestry |
| E2 | `revenant-feature-4-4` (2pt) | itself | `AncestryFeatureChoice` | (0…1) | 2pt purchased options of the **former** ancestry |
| E3 | `time-raider-feature-2-5` (2pt) | Psionic Gift | nested `Choice`, `count: 1` | (0…1) | 3 inline `Ability` options |

E1/E2 are the hard case. `ConfigChoice` **removes** any option whose feature type
is `AncestryFeatureChoice` from the visible list and **splices in** the former
ancestry's options in their place:

```
if (allOptions.some(opt => opt.feature.type === AncestryFeatureChoice)) {
  allOptions = allOptions.filter(opt => opt.feature.type !== AncestryFeatureChoice)
  allOptions.push(...getFormerAncestries(hero)
    .flatMap(a => a.features)
    .filter(f => f.type === Choice)
    .flatMap(f => f.data.options)
    .filter(opt => opt.feature.type !== AncestryFeatureChoice))
}
```

So in the shipped builder the Revenant player never sees "Ancestry Feature" as an
option at all — they see the former ancestry's traits merged directly into the
Revenant list at their native costs. The standalone
`ConfigAncestryFeatureChoice` control (a `Select`, filtered to
`opt.value === data.value`, excluding recursive `AncestryFeatureChoice` options,
disabling features the hero already has) is only reachable via the generic
feature-config path.

Note the splice does **not** filter by `value` — it merges the former ancestry's
1pt *and* 2pt options, ignoring the 1pt/2pt distinction that
`revenant-feature-4-1` vs `-4-4` was supposed to encode. Confirm against the pin
which behaviour is correct before implementing either.

**Step F — culture (adjacent, not part of the ancestry step).** `hero.culture` is
a separate top-level field. The culture picker groups options and puts
`hero.ancestry?.culture` first under a "your ancestry" heading. Selecting the
ancestry does **not** auto-assign the culture; it only promotes it in the list.
Revenant, having no `culture`, gets an empty "your ancestry" group.

Total ancestry-step choice points: **1** (ancestry) + **0–1** (step B) +
**0–1** (Former Life) + **1** (point-buy, multi) + **0–2** (sub-choices).
Worst case is Revenant: ancestry → Former Life → point-buy → up to two nested
ancestry-feature picks.

---

## UI surface

Ordered controls the ancestry step renders. Kinds:
single-select / multi-select-N / **point-buy multi-select** / searchable list /
nested sub-choice / toggle / free text.

| # | Control | Kind | Source | Notes |
|---|---|---|---|---|
| 1 | Ancestry list | **searchable list → single-select** | all ancestries in enabled sourcebooks | Forge Steel filters by name+description substring, any-token match, and renders a grid of full panels. Collapses to a single selected panel once chosen, with an "unselect" control. |
| 2 | Ancestry summary panel | read-only, tabbed | selected ancestry | Tabs: Overview / Signature / Purchased / Culture (Culture tab only when `ancestry.culture` exists). "Purchased" tab shows the `Ancestry Points` field plus every option with its cost badge, sorted by name. |
| 3 | Former Life picker | **single-select** (Revenant only) | all ancestries | `AncestryChoice`. Must render before control 5 and re-drive it. |
| 4 | Non-point-buy choice | **single-select** | Dragon Knight (respite) / Dwarf (play) / Devil skill | Only one of these exists per ancestry, and only for 3 of 12. Should be visually marked with its `selectAt` ("re-chosen each respite" / "changed during play"). |
| 5 | Ancestry points purchase | **point-buy multi-select** | the `count: 'ancestry'` `Choice` | The main control. Requirements in §Ancestry points economy. Renders: budget meter (`used / total`), selected chips with remove, an "add option" affordance opening a searchable option list sorted by name, each row showing name + cost + description. |
| 5a | ↳ Nested sub-choice | **nested sub-choice, single-select** | Psionic Gift; Revenant's spliced former-ancestry options | Must render inline under its parent chip, not as a sibling. |
| 6 | "Choose a feature from any ancestry" | **toggle** | homebrew escape hatch | Rendered only for `count: 'ancestry'` and only while `pointsLeft > 0`, with a warning banner. Recommend: gate behind a homebrew/Director flag or omit from V1. |
| 7 | Bespoke-ancestry name field | **free text** | homebrew only | Not part of the 12; noted for parity with the culture step's bespoke path. |

Touch-first notes for our build: the whole surface is list-and-chip; there are no
hover-only affordances to port. The two things Forge Steel does that we should
change are (a) hiding unaffordable options instead of disabling them, and
(b) hiding the points line at zero remaining.

Terminology: `HeroOverview.background` in the source is a **display
concatenation** used in hero list rows, not a Draw Steel concept. Draw Steel has
ancestry / culture / career; there is no "background" mechanic. Do not carry the field
name across.

---

## Convex data model notes

> **Superseded keying note (2026-08-30):** the FS-id keys sketched in this
> section are illustrative only and are **superseded** by `00-foundation.md`
> §6b + ruling R-L: every persistent key joins on the pin's `scc` identity
> (with a discriminator where one pin record carries several choice points).
> FS ids are labels, never keys.


### Definition data (seeded, versioned by source, shared)

```
ancestries: {
  sourceId, slug,            // e.g. 'sc-official' + 'ancestry-devil'
  name, description,
  ancestryPoints: number,
  cultureRef: Id<'cultures'> | null,   // Revenant: null
}
ancestryFeatures: {
  ancestryId, featureId,     // stable string id from the corpus
  parentFeatureId | null,    // Multiple / Choice-option nesting
  ordinal,                   // preserve source array order
  kind: 'signature' | 'purchasable' | 'choice',
  pointCost: number | null,  // the options[].value; null for signature
  featureType: FeatureType,  // one of the 54
  data: <per-type payload>,
}
```

Key deltas from Forge Steel:

- **Do not deep-copy the ancestry into the hero.** Store an `ancestryId` (or
  source-qualified slug) reference.
- **Flatten the nesting into rows** with `parentFeatureId`, so a feature is
  addressable by a single id regardless of depth. All ids in the Forge Steel
  source tree are unique and stable (never call FS "the corpus" — that word is
  reserved for the pin; FS ids are labels, never keys, per §6b + R-L),
  including nested ones (`devil-feature-2-7b`,
  `time-raider-feature-2-5-3`).
- **Do not store `selected` in the definition.** The 54-variant `Feature` union
  interleaves definition and selection in the same object (`FeatureChoiceData`
  has `options` *and* `selected`); split them.
- **Do not store `used: boolean`** (from `ResourceGain` on Memonek's Useful
  Emotion) in the definition. That is per-encounter runtime state and belongs
  with the hero's encounter state, not the ancestry record.
- `culture` is a nested `Culture` object in the source. Normalize it to its own
  table and reference it, because `SourcebookLogic.getCultures(sb, true)` already
  treats ancestral cultures as first-class selectable cultures.

### Selection state (per-hero, sparse, keyed by feature id)

Adopt the `Pregen` shape, not the `Hero` shape:

```
heroFeatureSelections: {
  heroId,
  featureId: string,      // the ancestry feature id
  selections: string[],   // ids: option feature ids / skill names / ancestry ids
}
```

Sparse: absent row = nothing selected. Partial spend = a shorter `selections`
array; **never** store remaining points.

Derived, never stored:
`ancestryPointsMax = base + revenantSizeRider + sum(AncestryPoints Bonus features)`;
`ancestryPointsUsed = sum(pointCost of resolved selections)`.

### Where the split is hard — call-outs

1. **The budget is not a constant.** `getAncestryPoints` depends on
   `getSize(hero)`, which depends on the Former Life selection, which is itself a
   selection. Budget must be a computed query over (ancestry, selections,
   hero features), re-evaluated on every write. A cached scalar will go stale.

2. **`FeatureField.AncestryPoints` lets any feature anywhere edit the budget.**
   Nothing ships using it, but the field exists in the enum and the customize
   modal exposes it. If we support homebrew, the budget query must scan the
   hero's whole feature set, not just the ancestry.

3. **Option lists that depend on an earlier selection.** Revenant's
   `AncestryFeatureChoice` has *no* options until Former Life is chosen. This
   breaks a naive "validate all selections in one pass" model —
   `PregenLogic.createHero` handles it with a fixpoint loop. Our validation and
   rehydration need topological ordering (or the same loop).

4. **A feature that mutates another feature's option list.** `ConfigChoice`
   *rewrites* the purchase list at render time: it filters out
   `AncestryFeatureChoice` options and splices in the former ancestry's options.
   The persisted `selections` for Revenant Traits can therefore legitimately
   contain ids that belong to a **different ancestry's** feature rows. Foreign
   keys must be to the global feature table, not scoped to `ancestryId`.

5. **`selectAt` breaks "build-time selection" as a category.** Three values:
   `build`, `respite`, `play`. Dragon Knight's Wyrmplate is `respite` and Dwarf's
   Runic Carving is `play`. These are re-made repeatedly during a campaign, so
   their selection rows are mutable outside character creation and want an audit
   trail / effective-as-of semantics — the builder is not their only writer. In
   Forge Steel they surface via `HeroRespiteModal` (filters `selectAt === 'respite'`)
   and `HeroLogic.getConditionalFeatures` (filters `selectAt === 'play'`).
   A build-time-only selection store would silently lose them.

6. **Nested selections need a compound key.** Psionic Gift
   (`time-raider-feature-2-5`) is a `Choice` reachable only *through* a purchase.
   Because its `featureId` is globally unique, a flat
   `featureId → selections` map still works — but the **validity** of that row is
   conditional on `time-raider-feature-2-5` being present in
   `time-raider-feature-2`'s selections. Orphan rows must be pruned (or ignored)
   when the parent purchase is removed. Forge Steel's inline model gets this free
   by deletion; ours does not.

7. **Ancestry swap must clear dependent selections.** `setAncestry` in
   `hero-edit-page.tsx` calls `clearRedundantSelections`, which only dedupes
   `LanguageChoice` and `SkillChoice` against already-known languages/skills —
   it does **not** clear stale purchases, because the whole ancestry object is
   replaced wholesale. In a reference model, changing `ancestryId` must
   explicitly delete every `heroFeatureSelections` row whose `featureId` belongs
   to the old ancestry, plus any orphaned nested rows.

8. **Migration/versioning.** `HeroUpdateLogic` back-fills `ancestryPoints` by
   hard-coded ancestry id (Memonek/Polder → 4, Revenant → 2, else 3) for heroes
   saved before the field existed, and `FeatureChoiceData.respiteChange` is a
   `@deprecated` boolean migrated to `selectAt: 'respite'`. Neither should be
   imported; both are evidence that budget and `selectAt` are the fields most
   likely to move. Version the definition rows by source so a corpus re-pin
   doesn't silently rewrite live heroes' costs.

9. **Selection resolution must tolerate missing ids.** `updateHeroFeatureData`
   drops any stored selection whose id no longer resolves, silently. We should
   surface it instead — a purchased option that vanished on a corpus re-pin is a
   hero the player must be told about, not a silently refunded point.

---

## Anomalies & open questions

Ordered roughly by impact on our build.

1. **`count: 'ancestry'` is a sentinel inside a numeric field.**
   `FeatureChoiceData.count: number | 'ancestry'` overloads a cardinality field
   with "this is a point-buy". Every consumer branches on the string, and at
   least one (`InfoChoice`) forgets to, printing "You have ancestry points to
   spend on the following options:". In our model these should be two fields
   (`mode: 'count' | 'points'` + a value) or two feature kinds.

2. **Affordability gating is conditional and reads the wrong list.**
   `unavailableIDs` is computed only when `props.data.options.some(v > 1)`, and
   from `props.data.options` rather than the merged `allOptions`. An all-1pt
   homebrew ancestry allows unlimited overspend; a Revenant whose spliced-in
   former options include the only 2pt entries can be mis-gated. Fix: gate
   unconditionally on the merged list.

3. **Points can be silently lost when the "extended" toggle is turned off.**
   `pointsUsed` sums `allOptions.find(o => o.feature.id === id)?.value ?? 0`, and
   `allOptions` shrinks when `comprehensive` goes false. A cross-ancestry
   purchase made while the toggle was on scores **0 points** once it is off,
   restoring "points remaining" while the feature stays selected. Our
   implementation must resolve cost from the definition table by id, never from
   the currently-visible option list.

4. **Revenant's 1pt/2pt distinction is not enforced by the splice path.**
   `revenant-feature-4-1` (`value: 1`) and `-4-4` (`value: 2`) exist to let a
   Revenant buy a 1pt or a 2pt former-ancestry trait. The standalone
   `ConfigAncestryFeatureChoice` control honours it
   (`.filter(opt => data.value === opt.value)`), but the path the builder
   actually takes — `ConfigChoice`'s splice — merges **all** former options
   regardless of value and prices each at its own native cost. Two different
   answers in one codebase. **Open question: which is canon?** Must be resolved
   against the pin before implementing.

5. **Only Revenant's budget has an id-hard-coded rider.**
   `getAncestryPoints` contains `if (hero.ancestry.id === AncestryData.revenant.id)`
   with an inline size check. This is a rule expressed as an `if` on a specific
   id — exactly the pattern our engine forbids (data over code). Our model needs
   a declarative representation: a conditional budget modifier on the ancestry
   record, or a `Bonus(AncestryPoints)` feature emitted by the Former Life
   selection. **Open question: what does the pin actually say about Revenant's
   points, and is the rider size-conditioned or former-ancestry-conditioned?**

6. **`FeatureField.AncestryPoints` exists but is unused by all shipped content.**
   Zero data files reference it. It is reachable only via the homebrew bonus
   editor and the customize modal. Confirm whether any real rule grants ancestry
   points before we build support; do not invent one.

7. **Choice-inside-a-purchase (`time-raider-feature-2-5`) is a singleton.**
   One occurrence in 74 options. It is enough to force a recursive selection
   model, but it is also easy to miss when testing. Any flattening we do must
   handle it, and it should be an explicit fixture.

8. **Unnamed features fall back to type-derived names.** Six Dragon Knight
   Wyrmplate options, Revenant's damage-modifier feature, and both Revenant
   `AncestryFeatureChoice` options are authored without `name`, so the factory
   defaults fire: `'Damage Modifier'` ×7 and `'Ancestry Feature'` ×2. Hakaan's
   three Forceful bonuses default to `'Forced Movement: Push' / 'Pull' / 'Slide'`
   (the `FeatureField` string). Our importer must synthesize meaningful labels
   from the payload (damage type, point value) or the UI will show duplicate rows.

9. **Duplicate feature *names* across ancestries, distinct ids.** Confirmed
   pairs: Otherworldly Grace (high elf `2-4` / wode elf `2-4`), Revisit Memory
   (high elf `2-3` / wode elf `2-2`), Stand Tough (dwarf `2-2` / hakaan `2-3`),
   Great Fortitude (dwarf `2-4` / hakaan `2-4`), Grounded (dwarf `2-1` / orc
   `2-2`), Nonstop (orc `2-5` / memonek `3-7`), Unstoppable Mind (high elf `2-5`
   / time raider `2-6`), Graceful Retreat (high elf `2-1` / polder `3-2`), Wings
   (devil `2-7` / dragon knight `2-11`), Prismatic Scales ×6 within Dragon Knight
   (disambiguated by parenthetical), Foresight (parent `Multiple` and its child
   `Ability` share the name). Identity is by id everywhere. This matters most for
   Revenant's merged picker and for the "extended" mode, where the list can show
   the same name twice at different costs (Wings is 2pt in both; Otherworldly
   Grace is 2pt in both — but nothing structurally guarantees that).

10. **Id-order is not array-order, and id suffixes have gaps.** High Elf runs
    `2-0, 2-1, 2-2, 2-4, 2-3, 2-5` (sorted by name). Time Raider has
    `2-3b` with no `2-3a`. Never derive ordering or existence from id strings;
    persist `ordinal`.

11. **`createValuePlusPerLevel` stores a pre-summed `value`.**
    `{ value: 2, perLevel: 1 }` is stored as `{ value: 3, valuePerLevel: 1 }`.
    Polder's Corruption Immunity is the only user. An importer reading `value`
    as "the flat part" will be wrong by `perLevel`. Similarly
    `createPerLevel({ value: 1 })` stores `value: 1` **and** `valuePerLevel: 1`.

12. **`createPowerRoll` accepts a `crit` argument and discards it.** The returned
    object has no `crit` key. No ancestry ability passes `crit`, so no data is
    lost here — but any port that assumes the signature reflects the shape is
    wrong.

13. **"Signature feature" is a negative definition that captures real choices.**
    `AncestryLogic.isSignatureFeature` = "not a `count: 'ancestry'` Choice", so
    Dragon Knight's Wyrmplate (respite choice) and Dwarf's Runic Carving (in-play
    choice) are classified as signature and appear on the "Signature" tab
    alongside static traits. Our model should classify by
    `kind: 'signature' | 'purchasable' | 'choice'` explicitly.

14. **`respiteChange` is a `@deprecated` boolean still in the type.**
    `FeatureChoiceData.respiteChange?: boolean`, migrated by `UpdateLogic` into
    `selectAt: 'respite'`. Do not carry it.

15. **Culture is not auto-assigned from ancestry.** `setAncestry` does not touch
    `hero.culture`; the culture step merely lists `hero.ancestry?.culture` first.
    **Open question:** does the pin say the ancestral culture is a default, a
    suggestion, or just one option? Forge Steel's UI treatment ("your ancestry"
    group, still requiring an explicit pick) is a UI decision, not evidence.

16. **Revenant has no `culture` and the source says nothing about why.** All 11
    others carry one. Whether Revenant genuinely has no ancestral culture (it
    keeps its Former Life's?) or this is a transcription gap is **absent in
    source** — resolve against the pin.

17. **Orc's Passionate Artisan is a choice modelled as `Text`.** Its
    `text: VERIFY-AGAINST-PIN` describes selecting two crafting skills, but the
    feature is `FeatureType.Text` with no `data`. Forge Steel simply doesn't
    model it. **Open question:** does the pin's wording constitute a real
    selection our builder must offer (a `SkillChoice`-shaped thing), or a
    Director-adjudicated note? Do not guess.

18. **Cultures with more than two words in the name get a malformed id.**
    `name.replace(' ', '-')` replaces only the first space. None of the 11
    shipped ancestral cultures has a three-word name, so no id is currently
    broken — but homebrew will break it.

19. **`isChosen` uses `>=`, and never validates that spend is exact.** With costs
    of 1 and 2 and budgets of 2–4, exact spend is always achievable, so the
    tolerance is invisible today. **Open question:** is overspend legal, or should
    the control hard-cap at the budget? The permissive-engine default argues for
    warn-not-block, but the *builder* is a build-time surface, not a runtime
    dispatch — decide deliberately.

20. **Distances are structured, targets are freeform strings.**
    `AbilityDistance` is `{ type, value, value2, within, special, qualifier }`,
    but `target` is prose (`'Each enemy in the area'`, `'One creature bearing
    your sigil'`). Tier strings are likewise freeform with embedded `[weak]` /
    `[average]` / `[strong]` and `M or A` placeholders. Ancestry abilities feed
    the same parse path as everything else; they add no new format, but Detonate
    Sigil's target references state ("your sigil") created by a sibling `Text`
    feature — an asserted-fact dependency in DEC-0011's sense.
