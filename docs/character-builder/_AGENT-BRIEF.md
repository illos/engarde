# Agent brief — character-builder structural mapping

You are producing a **data-structure-level spec** for our Draw Steel character
builder. You write exactly **one** markdown file. You change no other file.

## Why

Our V1 character builder targets **1:1 structural parity with Forge Steel** —
specifically its *layout*, its *attribution of features to classes*, and its
*level progression*. We are NOT adopting its code or its data structures: our
backend is **Convex**, with our own frontend. This spec is the map from their
structure to our data model and our UI.

Their implementations of individual features are only sometimes useful as a
guide. Their **shape** is the valuable part. Capture shape.

## Source (read-only — never modify it)

`/srv/presidium/projects/ironyard-v2/code/.reference/forgesteel`
— github.com/andyaiken/forgesteel, GPL-3.0, commit `01672c1`, pulled 2026-08-29.

## Read these first — they define the vocabulary you must use

- `src/enums/feature-type.ts` — the `FeatureType` enum.
- `src/models/feature.ts` — the `Feature` discriminated union (55 variants).
  **This is the entire vocabulary of choice-points.** Every row you write must
  name one of these types.
- `src/models/class.ts`, `subclass.ts`, `ancestry.ts`, `career.ts`,
  `culture.ts`, `complication.ts`, `hero.ts`
- `src/logic/factory-logic.ts` and `src/logic/factory-feature-logic.ts` — the
  `FactoryLogic.feature.create*` builders used throughout the data files.
  **You must resolve each builder call to the FeatureType and the default field
  values it produces**, or your tables will be wrong. A `createSkillChoice`
  with no `count` does not mean "no count" — go read the default.

## Hard constraints — violating these is the one unrecoverable failure

1. **Forge Steel is a third-party transcription of the rulebook, not our canon
   source.** Our canon is a pinned SteelCompendium corpus (DEC-0008). Never
   present Forge Steel's rule text as canonical.
2. **Do not copy rulebook prose.** Capture structure: ids, `FeatureType`,
   counts, `selectAt`, option lists, numeric fields, level placement. Feature
   and ability **names are fine**. Where a feature's rules text actually
   matters, write the field as `text: VERIFY-AGAINST-PIN` — do not transcribe
   the description.
3. **Never invent.** If something is absent in the source, write
   "absent in source". Do not fill a gap from memory of Draw Steel or any
   other TTRPG. Plausible is not permitted.
4. **Be exhaustive.** Levels 1–10, every feature, every row. Do not summarize,
   elide, or write "...and similar". Truncation is the main way this task fails.
5. Every file **begins with the provenance header** below, verbatim.

## Terminology

Draw Steel terms only: **Director** (not GM/DM), **Stamina** (not HP),
**power roll** (not attack roll/to-hit), **characteristic** (not ability
score), **ancestry / culture / career**. There is no "background" in Draw
Steel — `HeroOverview.background` in the source is a display concatenation;
note that if it comes up.

## Provenance header (paste verbatim at the top of your file)

```
> **Provenance — read before implementing.**
> Structure in this file is mapped from **Forge Steel**
> (github.com/andyaiken/forgesteel, GPL-3.0), commit `01672c1`, read 2026-08-29.
> Forge Steel is an independent third-party transcription of Draw Steel and is
> **not** our canon source. Every name, number, count and option list below is
> **UNVERIFIED** and must be confirmed against the pinned SteelCompendium
> corpus (DEC-0008) before it is implemented or shown to a user.
> This file is a **structural map for UI and data-model design**, not a rules source.
```

## The definition-vs-selection split (the point of the whole exercise)

Forge Steel stores the player's choices **inline**, by deep-copying the entire
class/ancestry/career object into the `Hero` and then writing into each
feature's `selected` field. Our Convex model will almost certainly **not** do
this. So every spec must separate:

- **Definition data** — static, seeded once, shared by all heroes, versioned by
  source. (The class, its features, its option lists.)
- **Selection state** — per-hero, persisted, sparse. Ideally a map keyed by
  feature id.

Call out explicitly anywhere that split is **hard**: features whose option list
depends on an earlier selection, features that mutate other features, choices
that are re-made at respite or during play (`selectAt`), and anything that
would break a sparse selection map.

## Required sections

Use exactly these headings, in this order. Adapt only where a section is
genuinely inapplicable (say so rather than dropping it).

1. `## Identity` — the top-level fields, as a table.
2. `## Level progression` — one row per feature per level, 1–10:
   `| Level | Feature ID | Name | FeatureType | Choice? | count | selectAt | Option source | Selection shape |`
3. `## Subclasses` — one level-progression subtable per subclass (classes only).
4. `## Abilities` — id, name, cost (`signature` or N), keywords, action type.
   Structural only, no prose.
5. `## Choice-point inventory` — every decision the player makes, in build
   order, with cardinality. This is the actual UI spec.
6. `## UI surface` — the ordered list of controls the builder renders, and the
   control kind for each (single-select, multi-select-N, searchable list,
   nested sub-choice, toggle, free text).
7. `## Convex data model notes` — definition vs selection, per above.
8. `## Anomalies & open questions` — irregularities, cross-level dependencies,
   deprecated fields, per-element special cases, and anything you could not
   resolve from the source. Be specific; this section is high-value.

Write the file, then reply with a short summary: what you covered, the counts
(levels, features, choice points), and the top 3 anomalies you found.
