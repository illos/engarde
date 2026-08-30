# The normative hero document — one schema for wizard, play screen and engine boundary

> **DRAFT — pending validation against the scc-join artifact.** DEC-0014's build
> order is scc-join → **this document** → Fury vertical. The join (running as a
> sibling task in `tools/scripts` + `.artifacts`) is the per-row pass that binds
> every Forge-Steel-mapped choice point to a pin `scc` and performs the R-A
> grant-vs-default audit. Sections the join can invalidate and that must be
> re-checked when its artifact lands: **§2.2/§2.3** (overlay-key cardinality —
> the `(scc, discriminator)` assumption and the discriminator inventory), **§5**
> (choice-point taxonomy coverage — kinds observed only in FS structure may
> collapse or split against pin prose), and **§7** (whether any superseded
> sketch encoded a row the join reclassifies). Everything else — the region
> boundaries, the decision-log model, the write-authority split, the compile
> seam — is architecture, settled by rulings R-A..R-M plus the 2026-08-31 user
> constraints (§1), and does not depend on join output.

> **Provenance.** This document defines **our** storage and compile shapes. It
> contains no Draw Steel rule content. Where a real pin record is named it is
> cited by its `scc` or corpus path; structural examples that need a fake id use
> the `test.example/...` namespace. Cardinalities and choice-point kinds are
> carried over from the 15 structural specs in this directory, which map Forge
> Steel (unverified) — every such carry-over remains `VERIFY-AGAINST-PIN` until
> the join confirms it.

## What this document is

Per DEC-0014's build order, this is **the** normative schema for the hero
document: the one record the character wizard writes, the play screen updates
(R-D), and the engine boundary compiles from. It supersedes the per-spec data
sketches (the "Convex data model notes" sections) scattered across the 15
class/entity specs — §7 lists them; after this lands they are historical
context and anomaly evidence only, never a storage reference.

**The central commitment (agreed with the user, 2026-08-31): the stored
document is the CHOICE RECORD, not the compiled sheet — and the choice record
is an ordered, append-only DECISION LOG, not a bag of current values.** Every
permanent mutation of the core character is a recorded decision; the visible
sheet is a deterministic projection of a prefix of that log against the pinned
corpus; reverting a level-5 hero to level 3 is a rewind to a prior log
position that arrives at **exactly** the character that existed at level 3
(§2.2). Derived values are never stored; each derived value has exactly one
derivation home (the `heroStats` precedent,
`packages/canon/src/hero-stats.ts`). Forge Steel's model — deep-copy the
content into the hero, mutate it in place, persist the resolved state — is the
model every spec in this directory documents and none of them adopts;
`00-foundation.md` §6/§6b makes the case and R-L/R-F/R-G/R-H settle it.

Two boundaries are part of the schema, not implementation detail:

- **Core vs layered (user constraint, 2026-08-31).** The versioned core is the
  hero the rules build: ancestry, culture, career, complication, class, and
  everything the class pipeline derives. **Equipment and titles live OUTSIDE
  the core**, in separate stores that layer on top (§2.5) — which is where the
  accepted rulings already pointed (R-G: equipment is owned instances; R-E:
  titles are Director-awarded, no build-time picker). Layered stores reference
  the character; **the core record never references them**.
- **Builder vs runtime write authority (R-D).** The play screen writes to the
  character. One document, two writers, boundary drawn key-by-key in §2.6.

## 1. Constraints this schema is built under

Binding rulings (all RULED 2026-08-30, `01-rulings-needed.md`):

| Ruling | Constraint on this schema |
|---|---|
| **R-A** | Pre-filled values are **grants**, compiled from the definition — they never appear in the decision log. Genuine editable defaults carry an `origin` marker. |
| **R-B** | Resource-gain supersession (`replacesTags`-shaped) is **derivation logic**, resolved at compile time in one home — never stored per hero. |
| **R-C** | Resource state is a **keyed set**, not a scalar; heroic vs epic is a definition-side distinction. The 'XP gained' value has **no representation yet** — §2.7 is the explicit hole. |
| **R-D** | The play screen writes to the character. One document, two write authorities, boundary in §2.6. |
| **R-E** | Titles are Director-awarded, cumulative, **layered** — outside the core record. No build-time title picker. |
| **R-F** | Never store rewritten text. A characteristic override is a **fact on the decision**, resolved at display/compile time. |
| **R-G** | Equipment is an **owned instance** (own table, renameable, modifiable) — a layered store; kits, domains, perks are **pointers** (scc references) inside core decisions. |
| **R-H** | Nested entities (summons, companions) store a pointer + a list of player overrides, never a forked copy. |
| **R-I** | Subclass abilities are ordinary per-level embedded choices (`feature/shadow/level-2/2nd-level-college-ability.md`); no special ability-source machinery. |
| **R-L** | Every persistent key joins on the pin's `scc` (3,081 records, zero collisions). FS ids are labels, never keys. Cardinality is not 1:1 — the overlay key is `(scc, discriminator)`. |
| **R-M** | Potencies are **derived, never stored** — the class-printed characteristic, parsed in `heroStats`. |

User constraints (2026-08-31), binding:

| Constraint | Consequence |
|---|---|
| **Decision versioning is first-class.** Revert-to-level-3 must reproduce exactly the level-3 character by walking back decisions. | The core choice record is an append-only ordered log; the sheet is a deterministic projection of any log prefix; revert = rewind to a prior position; the document records the pin version it projects against (§2.2). |
| **Core vs layered separation.** Equipment and titles are separate data stores layering onto the character. | §2.5. Layer → core references only; never core → layer. Revert of the core never destroys layered records (§2.5 reconciliation). |
| **Forge Steel import/export is a later problem with seams designed now.** | §6: adapter-cheap choices, known non-1:1 gaps, a lossless residue slot, and a provenance field on decisions — no adapter design. |

Shipped seam code this schema must be a superset of (it extends, never
conflicts):

| Shipped | Where | What it fixes in place |
|---|---|---|
| `characters` table: `name`, `concept`, `level`, `classScc?`, `characteristics?` | `packages/backend/convex/schema.ts` | The class pillar is an scc string column; characteristics mirror the engine's `CharacteristicsSchema` field names; derived stats deliberately not stored. |
| `heroStats(classRecord, level, characteristics) → ParticipantStats \| null` | `packages/canon/src/hero-stats.ts` | The one derivation home for class-contributed stamina/recoveries/potencies. Kit/feature bonuses compose **above** it, never inside. |
| `encounters.start` hero path | `packages/backend/convex/encounters.ts` | A hero participant seeds from Director-asserted stats lifted through the engine's one `ParticipantStatsSchema` home, or plays in table mode. This stays as the manual fallback; the compile seam (§4) becomes the automated path beside it. |
| `ParticipantStatsSchema` | `packages/engine/src/schemas.ts` | The compile **target**. The engine consumes stored stats and stays oblivious to classes, choices, and sccs (plugin-boundary rule). |
| `characters.ts` shape-only validation | `packages/backend/convex/characters.ts` | Substrate validates shape (non-empty scc string, integer characteristics); legal ranges/arrays are builder-track rule logic backed by canon. This document keeps that split. |

Engarde architecture: characters are canonical user-owned objects binding to at
most one campaign (DEC-0005) — the binding layer
(`characterCampaignBindings`) is untouched by this schema. The engine is pure
and data-over-code (DEC-0009): nothing in this document adds hero semantics to
the engine; everything compiles down to shapes the engine already speaks.

---

## 2. The document model

```
character
├── identity / meta                 §2.1 — shipped columns
├── CORE (versioned)
│   ├── decision log                §2.2 — append-only, ordered, replayable;
│   │                                      pin-stamped; the ONE authority for
│   │                                      the built character
│   ├── stored projections          §2.3 — pillar columns, characteristics,
│   │                                      current-selections map; maintained
│   │                                      atomically with the log, one
│   │                                      derivation home each
│   └── overrides / customizations  §2.4 — R-H/R-F facts riding on decisions
├── LAYERED stores (own tables)     §2.5 — equipment (R-G), titles (R-E);
│                                          reference the character, never
│                                          referenced by the core
├── runtime tracker region          §2.6 — R-D: resources, counters, form
│                                          state; keys projected from core,
│                                          values written by the table
└── derived                         §4   — never stored
```

### 2.1 Identity / meta

Exactly the shipped columns: `ownerUserId`, `name`, `concept`, `level`,
`createdAt`, `updatedAt`, plus the campaign binding in its own table. `level`
stays a top-level column (session roster snapshots and the compile read it) —
as a **stored projection** of the log's level-advance decisions (§2.3).
Nothing here changes shape.

### 2.2 The core decision log

**The log is the record; everything else in the core is a projection of it.**

One entry per permanent mutation of the core character. Scope of "core":
ancestry, culture, career, complication, class, subclass, characteristic
assignment, level advancement, and every class-pipeline choice — everything
the rules build. (Equipment acquisition and title awards are layered events,
§2.5; transient trackers are §2.6.)

**Entry shape** (Zod in §3.1). Each entry carries enough context to replay:

- `seq` — dense, monotonically increasing position. The log's order **is** the
  causal order of the character's construction.
- `action` — a discriminated union: `set-pillar` (which pillar, which scc),
  `advance-level` (to N), `set-characteristics` (the assignment), `select`
  (an `(scc, discriminator)` overlay key + selection payload), `clear`
  (an overlay key un-answered — an explicit event, so replay never guesses).
- `atLevel` — the hero level in effect when the decision was made (causality:
  which pipeline step produced it).
- `provenance` — `'wizard' | 'level-up' | 'respite' | 'play' | 'import'`
  (§2.6 write authority; §6 import seam).
- `at` — timestamp (audit only; never an input to projection).

**Projection is deterministic and prefix-closed.** `project(decisions[0..k],
pin)` is a pure fold producing the current pillar set, characteristic
assignment, and selections map — later entries for the same key supersede
earlier ones; a `clear` removes; the fold never reads anything but the log
prefix and the pinned corpus. Because the fold is pure and the pin is fixed,
**any prefix of the log is a complete, exact historical character**.

**Revert = rewind.** Reverting a level-5 hero to level 3 truncates the log to
the position immediately before its `advance-level: 4` entry and re-projects.
The result is exactly the character that existed at level 3 — not an
approximation reconstructed by subtracting bonuses. Truncation is itself
recorded (the mutation appends nothing; it removes a suffix — the *audit
trail* of removed suffixes, if wanted, is a separate concern and deliberately
out of scope here; the log itself stays clean and replayable). Downstream
consequences of a revert (orphaned layered rows, stale runtime keys) are
reconciliation events, not blockers — §2.5/§2.6.

**Pin stamping — "exact same character" is only meaningful against one
corpus.** Projection is deterministic against the **same** pinned corpus, so
the document records what it projects against:

- `build.pinVersion` — **document-level stamp** (the pin checkout version,
  e.g. the `v4.20260803143953` form cited in `00-foundation.md` §6b), set at
  creation and bumped only by an explicit pin-upgrade pass.
- Per-decision stamping was considered and **rejected as the default**: replay
  is always against exactly one pin (the document's), so a per-entry stamp
  buys nothing during normal operation and invites the incoherent question
  "project entry 7 against pin A but entry 9 against pin B". The one place a
  per-entry stamp earns its bytes is **divergence marking** (below), where an
  upgrade pass records which entries stopped projecting cleanly — so the entry
  schema carries an optional `divergence` slot, written only by upgrade
  passes, never by normal play.
- **Pin upgrade is re-projection — that is the point of storing choices, not
  compiled state** — but divergence must be *visible, never silent*. The
  upgrade pass re-runs `project` under the candidate pin and classifies every
  entry: clean (same key resolves, selection still legal), **diverged**
  (key vanished, cardinality changed, selected option no longer legal — the
  entry gets a `divergence` record naming old pin, new pin, and reason; the
  projection marks the answer invalidated, surfaces it for re-decision, and
  **keeps the original entry untouched**), or superseded-by-correction. The
  document's `pinVersion` bumps only when the pass completes; a document
  carrying unresolved divergences renders them as first-class gaps in the
  wizard, exactly like unanswered choice points.

### 2.3 Stored projections of the log

Convex read surfaces (roster snapshots, character lists, the compile) should
not re-fold the log per read, so three projections are **stored** — each with
the same discipline as the shipped denormalized `memberCount`: one write path
(the same mutation that appends to the log updates them atomically), one
derivation home, and a mechanical invariant `stored == project(log)` that a
validator can assert.

**(a) Pillar pointers — explicit columns.** The pillars are a small closed set
with fixed cardinality; they are not feature-keyed (the `Pregen` evidence in
`00-foundation.md` §6: subclass and inciting-incident selections "do not
correspond to a Feature, so a pure featureId → selection map cannot hold
them"). Like the shipped `classScc`, each is an scc string column,
shape-validated only:

- `ancestryScc`, `careerScc`, `complicationScc` — nullable pointers.
- `subclassSccs` — an **array** (`Pregen.selectedSubclassIDs` is plural;
  `subclassCount` is definition data, `VERIFY-AGAINST-PIN` per class).
- `incitingIncident` — a discriminator string scoped to `careerScc` (incident
  identity is table rows inside career records — no standalone pin records
  exist; the join mints the discriminators).
- Culture composite — explicit fields, never nullable embedded features
  (`careers-and-cultures.md` §8.3): `cultureScc` (preset, nullable),
  `cultureName` (bespoke only — `Pregen` loses it; we must not),
  `cultureEnvironmentScc`, `cultureOrganizationScc`, `cultureUpbringingScc`
  (the 13 axis records are real pin records).

**(b) `characteristics`** — the shipped column holds the **effective** scores
as a stored projection (base assignment from the log + increase decisions),
because increases at some levels involve a player choice (the floating +1 for
single-primary classes, per the R-M survey) and the seam's readers
(`heroStats`, roster snapshots) need effective values (§8-Q2 asks for
confirmation).

**(c) `build.selections`** — the current-selections map,
`Record<OverlayKey, SelectionPayload>`, i.e. the fold's output cached on the
document. Properties (all inherited from the log, restated here because every
read surface sees this map, not the log):

- **Absent = unmade.** A partially-built document is a first-class valid
  state (the ancestries spec establishes this for point-buy; it holds
  generally). Completeness is a *derived* judgment: the resolver walks the
  reachable choice-point set and reports unanswered keys; nothing blocks
  persistence.
- **Key = `(scc, discriminator)`, string-encoded.** Per R-L's cardinality
  finding, one pin record can carry several choice points (a career's
  skills/languages/perk/incident live in one record) and several FS rows can
  collapse to one pin record. Encoding:
  - `<scc>` when the record carries exactly one choice point —
    e.g. `mcdm.heroes.v1/feature.fury.level-4/skill`.
  - `<scc>#<disc>` when it carries several — discriminator slugs are minted by
    the join artifact and **frozen at first seed** (they are persistent keys;
    §8-Q7).
  - Nested reachability: a selection can make new choice points reachable (a
    chosen kit's internal choices, a chosen domain feature's embedded skill
    choice — `class-conduit.md` §"Selection" note 2). Nested keys are **path
    keys**: segments joined by `::`, each segment `<scc>` or `<scc>#<disc>`,
    e.g. `test.example/feature.kit-grant::test.example/kit.a#form`. Neither
    `::` nor `#` occurs in the scc grammar (`mcdm.<book>.v1/<category-path>/
    <slug>`), so parsing is unambiguous, and orphan detection is a prefix
    match: when a parent selection changes, every key prefixed by it is
    orphaned. Orphaned map entries simply stop being projected (their log
    entries remain — switching the parent back restores them for free,
    `class-elementalist.md` §"split is hard" 1); the resolver ignores
    unreachable keys, never counting them as satisfied.
- **Values are scc references (or join-minted option keys), never copied
  objects and never names.** Skills and languages included — id-keyed in the
  seed so every payload is uniformly ids (`careers-and-cultures.md` §7.2
  normalisation note; blocked for languages by the R-J content gap, §8-Q5).
- **Option legality is derived, never stored.** Legal option sets are queries
  over (definition overlay ∪ current projection) — ability pools filtered by
  what the hero already knows, domain-feature pools by chosen domains,
  axis-dependent skill lists. Changing an upstream decision **invalidates**
  downstream ones; the resolver reports them as invalidated (the UI shows what
  broke), it never silently drops them (`class-conduit.md` requirement 3).
  Resolution runs to fixpoint — selection → new reachable keys → selection —
  the discipline every spec's rehydration loop independently rediscovered.
- **De-duplication is derivation-time, never write-time.** Keep the raw
  decision; the resolver reports duplicates (e.g. a skill granted twice) as
  warnings. Write-time mutation of other selections is the FS bug class we are
  deliberately not porting (`careers-and-cultures.md` §7.3.3).

**What is NOT in the log or the map:** R-A grants (compiled from the overlay —
a grant row stores nothing per hero), prose-only R-K decisions (rendered as
text, the player tracks them; no storage until per-class structure lands),
equipment and titles (layered, §2.5), and runtime toggles (§2.6 — combat state
does not live in the build record, `class-fury.md` A-12).

### 2.4 Customizations and player overrides

Not a separate storage slot — override facts ride on the decision payload they
qualify (see the Zod union in §3). Two kinds, two rulings:

- **Reference facts (R-F).** A domain taken through a class that redirects its
  characteristic stores `characteristicOverride` on the decision. Display and
  compile resolve the reference; quoted rule text is never rewritten, and
  FS's `switchFeatureCharacteristic` string-`replaceAll` is not ported.
- **Entity overrides (R-H).** A nested creature (summon, companion) stores the
  chosen statblock's scc plus a sparse override list — `rename` and per-field
  overrides, each naming the field it replaces. Content corrections keep
  flowing to everything the player didn't touch. Whether the compiled nested
  creature reuses the engine's `ParticipantStats` representation is the
  standing R-H follow-up (§8-Q3). Beastheart's book is `exclude` in the pin
  config — **no beastheart substrate ships until admission** (DEC-0014).

### 2.5 Layered stores: equipment and titles

Per the user's 2026-08-31 constraint, equipment and titles are **separate data
stores that layer on top of the character** — and the accepted rulings already
shaped both exactly that way:

- **Equipment (R-G)** — items are owned **instances**: renameable, modifiable,
  stackable, arriving by two paths that must share one shape (grant vs
  treasure — `kits-domains-items.md` §"Two item paths"):

  ```
  heroItems: one row per owned item instance
    characterId, itemScc, origin: 'grant' | 'inventory',
    grantDecisionSeq (nullable — the core log entry that granted it),
    nameOverride (nullable), count, overrides (R-H sparse shape)
  ```

- **Titles (R-E)** — Director-awarded, cumulative, never picked at build:

  ```
  heroTitles: one row per award
    characterId, titleScc,
    selectedFeature (title-relative discriminator, nullable),
    awardedAt, awardedByUserId
  ```

  Order is display-only; a title's mutually-exclusive feature pick is stored
  on the award row, not in the core log.

**The reference direction rule:** layered rows carry `characterId` (and, for
grant-originated items, the `grantDecisionSeq` they trace to); **the core
record never stores a layer id.** A core decision that grants an item records
only *that the grant was made* (the item's scc and count live in the
definition/overlay); the layer mints its rows referencing that decision. This
inverts the draft-1 shape (selection payload holding instance ids) and repairs
the FS guid data-loss bug from the correct side: re-resolution always walks
layer → core, which cannot dangle when content updates.

**Revert reconciliation.** Rewinding the core log never deletes layered rows
(they are the player's property and the Director's awards — R-E's "you keep
what you earned" is the model). A layered row whose `grantDecisionSeq` no
longer exists after a truncation becomes **orphaned-but-present**: flagged on
the layer, surfaced to the Director, resolved by human decision (keep as
plain inventory / remove). Silent cascade deletion is exactly the class of
destructive write this schema exists to prevent.

**Why kits/domains/perks are NOT layers:** they are class-pipeline choices —
core decisions storing scc pointers (R-G's own split). The layer test is
"does it arrive from outside the rules pipeline (Director award, treasure,
purchase) and survive a core rewind?" Titles and equipment: yes. A kit: no —
it is part of what the class build *is*.

### 2.6 The runtime tracker region (R-D)

Campaign-lived tracker state the table writes: resource pools, canonical
counters, persistent form toggles. **Argued placement:** this region is
neither core nor layer, and forcing it into either slot breaks something.

- Not core: its values are not decisions — they are consequences of play, not
  of building. Versioning them in the decision log would make the log churn
  every session and would make revert semantics incoherent (rewinding a level
  should not un-spend last night's resource pool).
- Not a layer: unlike equipment and titles, its **keys are projections of the
  core** — a resource pool exists because a class decision granted the
  resource; a form toggle exists because a kit decision granted the form. A
  standalone store keyed by core-projected keys would just be a second
  document fragment with a synchronization problem. A core rewind therefore
  *reconciles* this region (keys whose grantor vanished are dropped with a
  receipt), which is the dependent-state behavior — layers, by contrast,
  survive rewind (§2.5).

So it lives on the character row as its own blob (`runtime`, §3.2), with the
layers' **write authority** (runtime mutations) but the core's **key
derivation**. Contents:

- **`resources`** — the R-C keyed set: `Record<resourceScc, { current }>`,
  keyed by the resource-defining feature's scc. Multiple entries per hero are
  normal (second epic resource at L10 — Censor Virtue, Shadow Subterfuge, Fury
  `fury-10-5` per the specs, all `VERIFY-AGAINST-PIN`). The heroic/epic tier
  is **definition data** on the overlay row, never stored per hero. Zeroing /
  refill boundaries are derivation-side rules, canon-gated.
- **`counters`** — the numeric campaign-lived counters the pin's advancement
  and reward rules define (the FS `HeroState` inventory names the candidates:
  xp, victories, hero tokens, renown, wealth, project points —
  `00-foundation.md` §1, and FS `src/models/hero-state.ts` confirms the full
  field list; every one is `VERIFY-AGAINST-PIN`). This schema reserves the
  slot as `Record<counterKey, number>`; **which counters exist and their
  semantics are canon work**, seeded per counter with its canon entry, never
  hardcoded here.
- **`formState`** — `Record<OverlayKey, boolean>` for persistent toggles
  (stormwight form toggles are combat state living in FS's build tree —
  `class-fury.md` A-12; they persist across sessions but are not build
  decisions). Encounter-scoped state (conditions, action budgets, grants)
  stays in the engine's `EncounterState` and never touches the character
  document — whether *anything* condition-shaped must survive an encounter
  onto the character is an open pin question (§8-Q4).

**The write-authority boundary, key-level and data-driven:**

| Slot | Writer | Notes |
|---|---|---|
| Identity/meta, core log + projections | Builder mutations | Owner-gated (existing `characters.ts` authz). |
| Core log entries whose overlay row says `changeableAt: 'respite' \| 'play'` | **Runtime mutations too** | Respite/play re-picks are still **core decisions** — they permanently change the built character (a kit swap changes the sheet), so they append to the log with `provenance: 'respite' \| 'play'`. The overlay (§3.4, `changeableAt`) is the authorization data, re-derived from **pin prose**, never from FS fields (import rule 2, `00-foundation.md` §6b — FS models respite-changeable choices as plain build choices, e.g. `feature/summoner/level-1/formation.md` "as a respite activity", and kit re-choice is a hardcoded UI special case with no data field). A respite flow that re-opens a parent must also descend into its build-timed nested children, or a re-pick strands a required sub-choice (`class-elementalist.md` §"split is hard" 2). |
| `runtime` blob | Runtime mutations | Builder may initialize (e.g. zeroed resources). |
| Layered stores | Runtime / Director mutations | §2.5; own authz per store. |

### 2.7 The explicit R-C hole: 'XP gained'

One pin-confirmed resource gain is valued by the phrase "gain [the resource]
equal to the XP you gain" (`feature/censor/level-10/virtue.md`, confirmed in
direction by the R-C pin check). Its trigger couples a resource gain to an
**XP-award event**, which is a campaign-plane occurrence this schema does not
yet model. **This document deliberately leaves the hole open:** the
`resources` map can store the pool, but no field here represents the
XP-gained hook, and nothing should be built for it until the ruling lands
(§8-Q1). Any interim implementation surfaces the printed text as a
table-directive receipt, never a guessed automation.

---

## 3. Proposed Zod schemas and Convex table changes

> Proposals — code blocks in this doc, not code files. The schema home is
> `packages/canon/src/hero-document.ts` (new): canon owns scc-aware shapes and
> the compile (the `heroStats` precedent); the backend stores blobs validated
> by the one Zod home — exactly the `encounters.state` pattern ("engine-owned
> shape, deliberately not mirrored as a Convex validator — one schema home, no
> drift"). The engine package stays untouched: it never learns about choices.

### 3.1 The core decision log

```ts
// packages/canon/src/hero-document.ts  (proposal)
import { z } from 'zod';

/** `<scc>` | `<scc>#<disc>` | path segments joined by `::` (§2.3c). */
export const OverlayKeySchema = z.string().min(1);

/** R-A: a materialised editable default vs a player's own pick. Grants
 * never reach the log at all. */
export const SelectionOriginSchema = z.enum(['default', 'player']);

/** R-H sparse override: only what the player changed. */
export const EntityOverrideSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('rename'), name: z.string().min(1) }),
  z.object({
    kind: z.literal('field'),
    /** Which definition field this replaces — a path into the record's
     * structured JSON, never rewritten prose (R-F). */
    field: z.string().min(1),
    value: z.unknown(),
  }),
]);

export const SelectionPayloadSchema = z.discriminatedUnion('kind', [
  /** 1-of-N and N-of-list picks, incl. embedded-option choices (values are
   * sccs or join-minted option keys). Covers skills, abilities, perks,
   * kits, domains, aspect abilities (R-I), and item grants (the layer
   * mints its own rows against this decision — §2.5). */
  z.object({
    kind: z.literal('pick'),
    selected: z.array(z.string().min(1)),
    origin: SelectionOriginSchema.default('player'),
    /** R-F reference fact (e.g. domain characteristic redirect); resolved
     * at display/compile time, never persisted as rewritten text. */
    characteristicOverride: z
      .enum(['might', 'agility', 'reason', 'intuition', 'presence'])
      .optional(),
  }),
  /** Ancestry-points spend: purchased option keys; budget + costs live in
   * the overlay/definition and remaining points are always derived. A
   * partial spend is a valid persisted state. */
  z.object({
    kind: z.literal('point-buy'),
    purchased: z.array(z.string().min(1)),
  }),
  /** R-H nested entity: pointer + sparse overrides. */
  z.object({
    kind: z.literal('entity'),
    entityScc: z.string().min(1),
    overrides: z.array(EntityOverrideSchema).default([]),
  }),
]);

/** Divergence record written ONLY by a pin-upgrade pass (§2.2). */
export const DecisionDivergenceSchema = z.object({
  fromPinVersion: z.string().min(1),
  toPinVersion: z.string().min(1),
  reason: z.string().min(1), // e.g. 'key-vanished' | 'option-illegal' — closed
                             // enum once the upgrade pass is designed
});

export const DecisionActionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('set-pillar'),
    pillar: z.enum([
      'ancestry', 'culture', 'career', 'class', 'subclass', 'complication',
      'inciting-incident',
    ]),
    /** scc (or composite value for culture — bespoke name + axis sccs). */
    value: z.unknown(), // per-pillar refinement in the implementation
  }),
  z.object({ kind: z.literal('advance-level'), to: z.number().int() }),
  z.object({
    kind: z.literal('set-characteristics'),
    assignment: z.record(z.string(), z.number().int()),
  }),
  z.object({
    kind: z.literal('select'),
    key: OverlayKeySchema,
    payload: SelectionPayloadSchema,
  }),
  /** Explicit un-answer, so replay never guesses. */
  z.object({ kind: z.literal('clear'), key: OverlayKeySchema }),
]);

export const DecisionEntrySchema = z.object({
  seq: z.number().int().nonnegative(),
  action: DecisionActionSchema,
  /** Hero level in effect when the decision was made (causal context). */
  atLevel: z.number().int(),
  provenance: z.enum(['wizard', 'level-up', 'respite', 'play', 'import']),
  at: z.number(), // timestamp — audit only, never a projection input
  /** Written only by pin-upgrade passes; absent in normal operation. */
  divergence: DecisionDivergenceSchema.nullable().default(null),
});

export const HeroBuildSchema = z.object({
  schemaVersion: z.literal(1),
  /** The pin the projection is valid against (§2.2). */
  pinVersion: z.string().min(1),
  /** The record. Append-only; revert = truncate; seq dense from 0. */
  decisions: z.array(DecisionEntrySchema).default([]),
  /** STORED PROJECTION of `decisions` (§2.3c). Invariant:
   * selections == project(decisions, pin).selections — maintained by the
   * same mutation, assertable by a validator. */
  selections: z.record(OverlayKeySchema, SelectionPayloadSchema).default({}),
});
export type HeroBuild = z.infer<typeof HeroBuildSchema>;
```

### 3.2 The runtime tracker blob

```ts
export const HeroRuntimeSchema = z.object({
  schemaVersion: z.literal(1),
  /** R-C keyed set. Key = the resource-defining feature's scc. Tier
   * (heroic/epic), gain rules and refill boundaries are definition-side.
   * The 'XP gained' hook is NOT representable here — §2.7, deliberately. */
  resources: z.record(z.string().min(1), z.object({ current: z.number().int() })).default({}),
  /** Campaign-lived counters; which keys exist is canon work (§2.6). */
  counters: z.record(z.string().min(1), z.number().int()).default({}),
  /** Persistent form toggles keyed by the granting choice point. */
  formState: z.record(OverlayKeySchema, z.boolean()).default({}),
});
export type HeroRuntime = z.infer<typeof HeroRuntimeSchema>;
```

(Titles moved out of this blob to the layered `heroTitles` table — §2.5.)

### 3.3 Convex table changes

Extends the shipped row; nothing shipped moves or changes meaning:

```ts
// packages/backend/convex/schema.ts — characters (proposal; additions only)
characters: defineTable({
  // …shipped fields unchanged: ownerUserId, name, concept, level,
  // classScc?, characteristics?, createdAt, updatedAt…
  // level, classScc, characteristics are henceforth STORED PROJECTIONS of
  // build.decisions (§2.3) — same read shape, one write path.

  // Pillar pointers — same shape discipline as classScc (scc string,
  // shape-validated in characters.ts, rule legality is builder-track).
  ancestryScc: v.optional(v.string()),
  careerScc: v.optional(v.string()),
  complicationScc: v.optional(v.string()),
  subclassSccs: v.optional(v.array(v.string())),
  incitingIncident: v.optional(v.string()),
  cultureScc: v.optional(v.string()),
  cultureName: v.optional(v.string()),
  cultureEnvironmentScc: v.optional(v.string()),
  cultureOrganizationScc: v.optional(v.string()),
  cultureUpbringingScc: v.optional(v.string()),

  // The two blobs — validated by HeroBuildSchema / HeroRuntimeSchema in the
  // mutation (the encounters.state one-schema-home precedent).
  build: v.optional(v.any()),
  runtime: v.optional(v.any()),

  // Lossless import residue (§6b) — verbatim unmappable fields from an
  // external import (e.g. a Forge Steel .hero file), never projected.
  importResidue: v.optional(v.any()),
}).index('by_ownerUserId', ['ownerUserId']),
```

```ts
// packages/backend/convex/schema.ts — layered stores (proposal; new tables)
heroItems: defineTable({
  characterId: v.id('characters'),
  itemScc: v.string(),
  origin: v.union(v.literal('grant'), v.literal('inventory')),
  grantDecisionSeq: v.optional(v.number()), // → build.decisions[seq] (§2.5)
  nameOverride: v.optional(v.string()),
  count: v.number(),
  overrides: v.optional(v.any()), // EntityOverrideSchema[], one Zod home
  createdAt: v.number(),
  updatedAt: v.number(),
}).index('by_characterId', ['characterId']),

heroTitles: defineTable({
  characterId: v.id('characters'),
  titleScc: v.string(),
  selectedFeature: v.optional(v.string()), // title-relative discriminator
  awardedAt: v.number(),
  awardedByUserId: v.id('users'),
}).index('by_characterId', ['characterId']),
```

### 3.4 The choice-point overlay (definition side)

The overlay is **definition data, not hero data** — one row per choice point,
keyed to the corpus, seeded from the join artifact
(`00-foundation.md` §6b revised sketch, now normative):

```ts
// Definition store (seeding target — table or generated artifact; the
// storage venue can follow canonRecords' import pattern).
choicePoints: {
  key: OverlayKey,                  // scc or scc#disc; nested keys are NOT
                                    // overlay rows — reachability is derived
  kind: ChoicePointKind,            // §5 closed set
  cardinality: number,              // or the point-buy budget reference
  optionSource: OptionSource,       // filter over corpus categories / pools —
                                    // resolved at query time, never a
                                    // denormalized option list
  changeableAt: 'build' | 'respite' | 'play',  // from PIN prose (import rule 2)
  grants: SccRef[],                 // R-A fixed grants attached to this record
                                    // (compiled, never stored per hero)
  fsIds: string[],                  // Forge Steel labels this row joined from —
                                    // never keys (R-L); the import seam's
                                    // lookup table (§6a)
}
```

The overlay doubles as the **write-authority table** (§2.6): a runtime
mutation may append a `select` decision only if its overlay row's
`changeableAt` is `'respite'` or `'play'`.

---

## 4. The compile seam

Compilation happens **at the engine boundary** — the backend host, at
encounter-seed time (and for sheet display in the web app) — never inside the
engine and never persisted. The compile consumes the stored projection
(§2.3), which by invariant equals the log's fold. Signature (one home, beside
`heroStats`):

```ts
// packages/canon/src/hero-document.ts (proposal)
compileHero(input: {
  classRecord: Record<string, unknown>;   // pinned paired JSON via classScc
  level: number;
  characteristics: Characteristics;       // the stored effective projection
  build: HeroBuild;
  overlay: ChoicePointOverlay;            // seeded definition rows
  records: (scc: string) => Record<string, unknown> | null;  // pin access
}): {
  stats: ParticipantStats;                // the engine compile TARGET
  abilityArtifactIds: string[];           // granted + chosen
  residue: { key: string; reason: string }[];  // unresolvable → receipts
}
```

**What exists today** (the seam this extends, all shipped):

1. `characters.classScc` + `characteristics` → `heroStats(classRecord, level,
   characteristics)` → `ParticipantStats` with staminaMax, recoveriesMax, and
   R-M potencies parsed from the class record's own printed lines. Unparseable
   lines yield null members — residue, never a guess.
2. `encounters.start` seeds a hero participant from Director-asserted stats
   through the engine's one `ParticipantStatsSchema` home, or table mode with
   receipts. This path **remains** as the manual fallback and the escape hatch
   for heroes without build data.

**What the Fury vertical adds** (the first full compile):

- **Ability resolution.** Fold granted abilities (R-A grants on reached
  records) + chosen abilities (`pick` payloads) into `abilityArtifactIds`;
  each id then flows through the existing per-ability path
  (`compileAbility` / `annotateHeaderCosts` — already how Director creatures'
  abilities execute). Subclass abilities arrive via ordinary level-list picks
  (R-I) — no new machinery.
- **Kit contribution.** Kit stat bonuses compose **above** `heroStats` (its
  documented NOT-included contract). The aggregation rules the FS map observed
  (max-not-sum across multiple kits, echelon-scaled stamina,
  collate-identical damage bonuses — `kits-domains-items.md` §"split is hard"
  6) are rule math: **canon-gated, one derivation home, pin check before any
  of it ships** (§8-Q6).
- **Feature grants → engine vocabulary.** Compiled feature effects reach the
  engine only as shapes it already speaks (stats deltas at seed time; the
  grant/trait vocabulary of `packages/engine/src/schemas.ts` where a printed
  feature maps onto it). Anything that doesn't deterministically map is
  **residue** → not-automated receipts at seeding, exactly like today's
  unreadable stat-block rows. No new engine state ships from this document.
- **Resource config.** The R-B supersession fold (later gains replace earlier
  by the pin's own "instead of" phrasing) runs at compile; the runtime stores
  only `current` per resource key.

**Derivation homes, restated:** `heroStats` (class stats + potencies),
`project` (log → core projection, §2.2), `compileHero` (projection → engine
actor), effective-characteristics fold (§8-Q2), resource-gain fold. Never two
homes for one rule — the duplicated-canon-rule bug class is the project's most
recurring; a cap or band re-derived in a second function is the failure mode
this section exists to prevent.

---

## 5. Choice-point taxonomy

The closed set of choice-point kinds the wizard must render, with each kind's
storage shape. Derived from the 15 specs' choice-point inventories; **draft
until the join confirms coverage** — FS's 55-variant `Feature` union collapses
onto this set, and the collapse is exactly what the join's per-row pass
verifies. Kinds 1–8 are storage-bearing; 9–10 deliberately store nothing in
the core.

| # | Kind | Renders as | Storage shape | Notes / evidence |
|---|---|---|---|---|
| 1 | **fixed-grant** | Display only (R-A) | **none** — compiled from `choicePoints.grants` | Highest-volume kind (~90 rows). Not a choice point at all; listed so nobody re-invents storage for it. Canon's 1-of-2 grants (Performer's "Music or Perform", `career/performer.md`) are kind 2 with cardinality 1, per the R-A pin check. |
| 2 | **pick-n-of-pool** | Searchable drawer, N chips | `select` decision, `pick` payload — `selected: scc[]`, length ≤ cardinality | Skills, perks, class abilities, kits, domains, languages (blocked by R-J). Option pool is a derived query, never denormalized. |
| 3 | **pick-1-embedded** | 1-of-M inline option cards | `select` decision, `pick` — `selected: [optionKey]` | Aspect/subclass abilities (R-I; `feature/shadow/level-2/2nd-level-college-ability.md`), domain-feature picks. Option keys are join-minted when options lack own pin records. |
| 4 | **point-buy** | Budgeted multi-select with cost badges | `select` decision, `point-buy` — `purchased: key[]` | Ancestry purchased features. Budget is derived and reactive (cross-selection dependencies — the Revenant size case); partial spend persists. |
| 5 | **characteristic-assignment** | Array pick + permutation pick | `set-characteristics` decision → stored projection (§2.3b) | Scaffolding, not feature-keyed. Arrays are rules content — `VERIFY-AGAINST-PIN`. |
| 6 | **composite-axes** | Three axis pickers + optional preset | `set-pillar` (culture) decision → culture columns (§2.3a) | Never nullable embedded features (`careers-and-cultures.md` §8.3). Axis-dependent skill picks are kind 2 entries under the axis record's key. |
| 7 | **instance-acquisition** | Item pick that mints owned rows | `select` decision (the grant) + **layered** `heroItems` rows referencing it | R-G / §2.5. The core never stores instance ids; the layer points at the decision. |
| 8 | **entity-binding** | Creature pick + customization surface | `select` decision, `entity` payload — scc + sparse overrides | R-H. Summoner minions are structured by the pin already; Beastheart excluded until admission. |
| 9 | **prose-decision** | Rendered rule text (R-K) | **none** in V1 | Psi Boost, strain, Persist, Judgment, Melodrama, Zeitgeist, shapeshift-form tables. Structure lands per class, later, with canon entries. |
| 10 | **runtime-toggle** | Play-screen toggle | `runtime.formState` — never the core log | Form toggles (`class-fury.md` A-12). Persisted, but not a build decision. |

**Known uncertainty, stated rather than resolved:** FS's structural
combinators (`SwitchOptions`/`SwitchValue`, `Package`/`PackageContent`,
`Multiple`, `Toggle`-as-build-choice) do not appear above as kinds because the
working hypothesis is that they are *representation artifacts* that flatten
into kinds 1–3 + nested path keys against pin records — but this is exactly
the hypothesis the join tests, and Summoner's `PackageContent` usage and the
subclass-conditional prose branches (`class-fury.md` A-8) are the likeliest
counterexamples. If the join surfaces a choice point that genuinely fits no
kind above, that is a **new taxonomy row + schema-version bump**, not a
payload contortion.

---

## 6. The Forge Steel import/export seam

**Later problem; seams designed now.** Long-term we want to import — and
possibly export — heroes from Forge Steel. What follows identifies the seams;
it deliberately does **not** design the adapter.

FS's hero persistence, examined at the pinned checkout
(`.reference/forgesteel`, commit `01672c1`):

- The saved hero **is the resolved object graph**: `src/models/hero.ts` —
  full deep copies of ancestry/culture/career/class/complication with every
  `selected` written in place, plus `features[]` (hero-level customisations),
  `state` (`src/models/hero-state.ts`: staminaDamage, staminaTemp,
  recoveriesUsed, surges, victories, xp, heroTokens, renown, wealth,
  projectPoints, conditions, inventory, projects, titles, controlledSlots,
  notes, and UI flags), and `abilityCustomizations[]` (per-ability
  name/description/notes/costModifier/distanceBonus/damageBonus/
  characteristic overrides).
- Storage is localforage (`src/services/storage/local-service.ts`,
  key `forgesteel-heroes`), and **export is the same JSON verbatim** — a
  `.hero` file via `Utils.exportData(name, hero, 'hero')`
  (`src/components/main/main.tsx`, backup page). Import runs
  `HeroUpdateLogic.updateHero` to migrate old shapes against current
  sourcebooks.
- FS's own flat projection exists: `Pregen` (`src/models/pregen.ts`) — pillar
  ids + `featureSelections: { featureID, selections: string[] }[]` — the
  shape `00-foundation.md` §6 already identified as evidence the
  definition/selection split is lossless.

### 6a. Schema choices that make a future adapter cheap

- **The scc-join's FS-id ↔ scc mapping IS the adapter's core lookup table.**
  DEC-0014 keeps FS ids as labels; the overlay row carries them (`fsIds`,
  §3.4). An importer resolves each FS `featureID` → overlay key through data
  we already maintain — no new mapping work.
- **Selection payloads are id-arrays, exactly `Pregen`'s shape.** FS's own
  serializer proves the resolved graph collapses to `{ pillar ids +
  featureId → string[] }`; our `pick`/`point-buy` payloads are the same shape
  keyed by scc. The natural import path is FS `.hero` → FS's own
  Pregen-style flattening → key translation → decisions.
- **Pillars as explicit columns** mirror FS's explicit `ancestry/culture/
  career/class/complication` slots and `Pregen`'s `*ID` fields 1:1.
- **`EntityOverrideSchema` can host `abilityCustomizations`** — FS's
  per-ability override record is a per-field sparse override, the R-H shape.

### 6b. Where FS's save shape and our decision log will NOT map 1:1

- **FS stores resolved state, not decisions.** A `.hero` file has no ordering,
  no causality, no level history — an import reconstructs a **partial,
  unordered decision set**. Design consequence (a seam, in now): imported
  entries are appended in *canonical projection order* (pillar → level 1..N
  pipeline order from the overlay), each with `provenance: 'import'`, and the
  log makes no claim that this order is the player's history. Revert-by-rewind
  on an imported hero rewinds canonical order — correct for level rollback,
  honest about not being a session-by-session history.
- **Unmappable fields need a lossless home, not a silent drop.** Known
  residents: `picture`, `folder`, `notes`, `inventoryText`, `tutorialMode`,
  `controlledSlots`, homebrew-sourcebook-dependent selections, any
  `abilityCustomizations` field with no override target, and every FS state
  field whose counter/semantics we have not canon-gated yet. These land
  verbatim in **`characters.importResidue`** (§3.3) — stored, displayed on
  demand, never projected. The lossless-residue discipline is the same one
  the compile pipeline already uses for unreadable stat-block rows.
- **FS state splits across our regions.** `state.titles` → `heroTitles`
  layer; `state.inventory` → `heroItems` (`origin: 'inventory'`);
  counters → `runtime.counters` (only those with canon entries; the rest to
  residue); conditions → nowhere (encounter state; residue).
- **Export** (us → FS) is the harder direction — FS expects deep-copied
  content objects from *its* data modules, which we do not ship. If it ever
  lands it targets the `Pregen` shape, not `Hero`. Not designed here.

### 6c. Cheap seams included in this schema now

1. `provenance: 'import'` on `DecisionEntrySchema` (§3.1).
2. `characters.importResidue` (§3.3) — the lossless slot.
3. `choicePoints.fsIds` (§3.4) — the label column the join already produces.
4. **Order-independence where canon forces none:** projection folds by key
   supersession, so two decision entries for unrelated keys commute — an
   importer need not fabricate a fake interleaving; only the canonical
   pipeline order (which the overlay defines) matters.

**Licensing note.** An adapter reads a *user's own* FS export file at runtime.
No GPL-3.0 Forge Steel code or content enters our tree beyond the id labels
the join already carries (DEC-0014: labels, never keys).

---

## 7. Supersession list

This document supersedes the following sketch sections. They remain in place
as structural evidence (anomaly inventories, FS-shape documentation) but are
**not storage references**; where they conflict with this document, this
document wins.

| Spec | Superseded sections |
|---|---|
| `00-foundation.md` | §6 sketch code block ("definition/selection" `heroes:` sketch); §6b "Revised sketch" code block. The surrounding analysis (identity findings, import rules) remains binding context. |
| `class-fury.md` | "Convex data model notes" (definition tables, `heroClassState` / `featureSelections` sketch, "Where the definition/selection split is genuinely hard" — the *problems* remain real; the *shapes* are replaced) |
| `class-conduit.md` | "Convex data model notes" ("Definition", "Selection (per hero, sparse)", "Derived (never stored)") |
| `class-elementalist.md` | "Convex data model notes" |
| `class-censor.md`, `class-null.md`, `class-shadow.md`, `class-summoner.md`, `class-tactician.md`, `class-talent.md`, `class-troubadour.md`, `class-beastheart.md` | each file's "Convex data model notes" |
| `ancestries.md` | "Convex data model notes" (the ancestry-points *economy* section remains the behavioral spec for kind 4) |
| `careers-and-cultures.md` | §7.1–7.3 |
| `kits-domains-items.md` | §7 |
| `complications-titles-perks.md` | "Convex data model notes" |

Every one of those sections already carries the 2026-08-30 "superseded keying
note"; this document completes the supersession from keys to whole shapes.

---

## 8. Open questions — concrete ruling requests

- **Q1 (R-C hole, user ruling).** How is the "gain [resource] equal to the XP
  you gain" hook (`feature/censor/level-10/virtue.md`) represented? Candidate
  shapes: (a) an XP-award campaign event the runtime region subscribes to;
  (b) a table-directive receipt at award time, no automation; (c) defer
  entirely until the reward flow exists. This schema blocks nothing on it —
  the hole is drawn in §2.7 — but the Censor L10 slice cannot ship without
  the ruling.
- **Q2 (design confirmation, user ruling).** The shipped `characteristics`
  column becomes a **stored projection** of the log (base assignment +
  increase decisions) with one derivation home — justified because some
  increases involve a player choice (single-primary floating +1) and the
  seam's readers (`heroStats`, roster snapshots) need effective values.
  Confirm, or direct storing the base assignment only and deriving effective
  values at every read site.
- **Q3 (R-H follow-up, user ruling).** Do compiled nested creatures
  (summons/companions) reuse the engine's `ParticipantStats` +
  `statblockStats` path, or get a builder-local representation? This document
  assumes reuse (pointer + overrides compile through the existing statblock
  pipeline) but the assumption is unforced until Summoner-as-FEATURE lands.
- **Q4 (pin check).** Does any per-hero state need to survive the encounter
  boundary onto the character document (condition-shaped or otherwise)?
  `EncounterState` clears at encounter end; the runtime region currently
  models none. Needs pin evidence, not invention, before any slot is added.
- **Q5 (R-J disposition, user ruling — already queued).** Languages and
  imbuements have no pin records. Until the R-J disposition (upstream / own
  corrections source / defer), every language choice point seeds as
  `optionSource: unresolvable` and the wizard renders the gap explicitly —
  never an empty drawer presented as a completed step.
- **Q6 (pin check before Fury compile).** Kit stat aggregation (max-not-sum,
  echelon-scaled stamina, damage-bonus collation) is rule math observed only
  in FS code. Pin-verify before `compileHero` composes kit contributions;
  until then a chosen kit's stats surface as receipts.
- **Q7 (join contract, sibling task).** Discriminator slugs minted by the
  join are persistent key components. The join artifact must declare them
  stable (a re-run against the same pin yields identical keys), and a pin
  upgrade that changes record cardinality is a **migration event** for
  `build.decisions`, handled through the §2.2 divergence pass — stale keys
  re-resolved or surfaced as invalidated, never silently dropped.
- **Q8 (design confirmation, user ruling).** Revert scope and audit: rewind
  truncates the log (§2.2) — the removed suffix is gone from the document.
  Confirm that no separate removed-suffix audit trail is required for V1
  (the campaign log already attributes the revert mutation itself), and
  confirm the §2.5 orphaned-layer reconciliation (flag-for-Director, never
  cascade-delete) as the intended revert × equipment/titles behavior.
