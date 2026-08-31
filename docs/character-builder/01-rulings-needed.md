# Character builder — rulings needed before implementation

> **Provenance.** Synthesised from the 15 structural specs in this directory,
> which map **Forge Steel** (github.com/andyaiken/forgesteel, GPL-3.0, commit
> `01672c1`, read 2026-08-29). Forge Steel is a third-party transcription and is
> **not** canon. Everything below is a **question for the pin**, not an answer.

Each item below appeared **independently in multiple specs**. They are ordered
by how much implementation they block. R-numbers are local to this document.

---

## RULED — 2026-08-30

All twelve accepted as recommended (user: *"Yes, to all"*). **Four carry a
verification obligation** against the pinned rulebook data before import — they
set direction; they are not yet canon-confirmed. Those are R-A, R-B, R-C, R-E
(plus a light check on R-I).

> **Pin check 2026-08-30 (independent review bot, sampled against the pin —
> not a Gate-3 sign-off):** all five confirmed **in direction**.
>
> - **R-A** — every sampled pre-fill is a grant in canon (Fury "You gain the
>   Nature skill" `class/fury.md`; Berserker "You have the Lift skill"
>   `feature/fury/level-1/primordial-aspect.md`; Agent skills, Fey Friend
>   language `title/fey-friend.md`). Caveat: canon has **1-of-2 grants** FS
>   cannot express (Performer: "The Music or Perform skill…"
>   `career/performer.md`), so the per-row pass over the ~90 pre-seeded rows
>   remains mandatory — R-L's join performs it.
> - **R-B** — Conduit L7 `feature/conduit/level-7/faithfuls-reward.md` is
>   whole-roll replacement ("you gain 1d3 + 1 piety"), same "instead of" shape
>   as Fury/Censor; FS's missing replace flag is an upstream bug. Threshold
>   precedence is stated per feature in canon
>   (`feature/fury/level-1/primordial-strength.md`: "cumulative except where
>   an improved benefit replaces a lesser benefit").
> - **R-C** — Censor virtue is epic ("gain virtue equal to the XP you gain",
>   `feature/censor/level-10/virtue.md`; the XP-gained hook still needs a
>   representation decision). Beastheart rampage is a **companion-side**
>   accumulator (`feature/beastheart/level-1/rampage.md`), not a hero heroic
>   resource — FS's dual-heroic typing is definitively wrong.
> - **R-E** — titles are Director-awarded and cumulative; echelon is "most
>   likely to be earned", early grants sanctioned (Heroes rewards chapter).
>   No build-time picker.
> - **R-I** — subclass abilities are per-level embedded 1-of-2 choices
>   (`feature/shadow/level-2/2nd-level-college-ability.md`); FS's
>   `fromSelectedSubclassAbilities` mask is a no-op; drop it.

| # | Ruling | Verify against the pin first? |
|---|---|---|
| **R-A** | Fixed grant — the rulebook wins | **yes** |
| **R-B** | Replace, and treat Conduit as an upstream bug | **yes** |
| **R-C** | Multiple resources, heroic and epic distinguished | **yes** |
| **R-D** | Yes — the play screen writes to the character | no |
| **R-E** | Cumulative — you keep what you earned | **yes** |
| **R-F** | Never store rewritten text — swap the reference at display time | no |
| **R-G** | Split them: equipment is owned, kits and domains are pointers | no |
| **R-H** | Pointer plus a list of player overrides | no |
| **R-I** | Upstream bug — ignore the flag, read from the level list | **yes** |
| **R-J** | Extract it ourselves as a small corrections source | no |
| **R-K** | Show the text in V1, add structure per class later | no |
| **R-L** | Yes — key on the official stable IDs | no |

### What each ruling sets in motion

**R-A · Fixed grant — the rulebook wins**

Pre-filled values are GRANTS. Forge Steel's open pool is a transcription artefact. Each remaining choice takes its option list from the rulebook wording, not Forge Steel's widened default.

*Follow-up:* Per-feature pin check across all ~90 affected rows during import.

**R-B · Replace, and treat Conduit as an upstream bug**

Later resource gains supersede earlier ones. Conduit's missing level-7 replacement is corrected to match the other six classes.

*Follow-up:* Confirm Conduit level 7 against the books; define precedence when two features replace the same tag (Censor/Shadow level 10).

**R-C · Multiple resources, heroic and epic distinguished**

Resource state is a keyed set, not a scalar. The heroic/epic distinction is modelled.

*Follow-up:* Beastheart's two 'heroic' resources are a suspected error — verify before import. Censor's 'XP gained' string value needs a representation.

**R-D · Yes — the play screen writes to the character**

One character record, written from both the builder and the table. Respite and play-time selections persist to the same document.

*Follow-up:* None — architectural decision, settled.

**R-E · Cumulative — you keep what you earned**

A title stays in effect once awarded. Do NOT port `FeatureTitleChoice` (dead code, zero call sites); titles arrive by Director award.

*Follow-up:* Confirm cumulative-vs-current-rank against the books before import.

**R-F · Never store rewritten text — swap the reference at display time**

The characteristic override is a fact attached to the player's selection, resolved at render time. Quoted rules text is never modified. `switchFeatureCharacteristic` is NOT ported.

*Follow-up:* None — the prime directive applied.

**R-G · Split them: equipment is owned, kits and domains are pointers**

Equipment is an owned instance the player may rename and modify. Kits, domains, perks and titles store a pointer to shared definition data only.

*Follow-up:* None.

**R-H · Pointer plus a list of player overrides**

Summons and companions store which creature was chosen plus only what the player changed. Content corrections keep flowing; renaming is supported.

*Follow-up:* Decide whether nested creatures reuse the engine's creature representation or a builder-local one.

**R-I · Upstream bug — ignore the flag, read from the level list**

Subclass abilities are read from `featuresByLevel`, where they actually live. The `fromSelectedSubclassAbilities` mask is dropped.

*Follow-up:* Light pin check that subclass abilities are chosen rather than granted.

**R-J · Extract it ourselves as a small corrections source**

The two language tables are transcribed VERBATIM from the Heroes book into our own clearly-labelled corrections source under a non-`sc-official` source id, carrying Creator-License attribution.

*Follow-up:* Quoted, never paraphrased. Unblocks the career and culture build steps.

**R-K · Show the text in V1, add structure per class later**

Prose-only decisions (Psi Boost, strain, Persist, Judgment, Melodrama, Zeitgeist, shapeshift forms) render as rules text the player tracks themselves. Structure comes later, per class.

*Follow-up:* Summoner is exempt — our corpus already structures its minions.

**R-L · Yes — key on the official stable IDs**

Everything keys on the corpus `scc` id. Forge Steel ids are cross-reference labels only. Every mapped row joins to an `scc` on import; anything that will not join is a discrepancy resolved against the books.

*Follow-up:* The join itself is the first build task.

---


---

## R-A · Are pre-filled choices grants or defaults? *(highest volume)*

**The pattern.** A feature ships `selected: ['Nature']` but passes no `options`
and no `listOptions`. The factory default then widens the pool to *every skill
in the game*, so the player may delete the pre-fill and pick anything.

**Where it appears:** Fury, Shadow, Talent, Troubadour, Tactician, Summoner,
Censor · **11 of 18 careers** · 4 complications · 3 `title-fey-friend` language
choices. Easily the highest-volume ambiguity in the corpus.

**Why it can't be resolved from the source.** `isChosen` tests
`selected.length >= count`, so both readings render as "already satisfied".
Worse, `clearRedundantSelections` strips the pre-fill when the hero already
knows that skill — silently converting an intended grant into a free choice.
Forge Steel's own Troubadour pregen *overrides* two of them, which hints at
"default", but that is inference, not evidence.

**Ruling needed.** Per affected feature: fixed grant, or editable default?
**Implementation consequence:** if both exist, our selection records need an
explicit `origin: 'grant' | 'default' | 'player'` marker. Forge Steel has no
such field, so this is structure we must add.

---

## R-B · `replacesTags` supersession — what is the precedence rule?

Heroic-resource gains at L4/L7/L10 **replace** earlier gains rather than
stacking (`start` → `start 2` → `start 3`). A naive additive fold gives the
wrong resource economy for **every class**.

Two unresolved sub-questions:

1. **Precedence is implicit.** Nothing in the data says what happens when two
   features replace the same tag. Censor's L10 replaces `start` *and* `start 2`
   simultaneously; Shadow's L10 replaces two tags at once.
2. **Conduit is missing `replacesTags: ['start']`** on its L7 gain, where all
   six other classes have it — so a level-7+ Conduit shows both start-of-turn
   piety gains as separately claimable. Almost certainly an upstream bug, but
   it needs the pin to confirm.

Related: Elementalist's tag namespace only works *by accident* — `SurgeGain`
and `HeroicResourceGain` are folded by two separate functions, so a shared
`take-damage` tag doesn't collide. A unified `resourceGains` table keyed by tag
would silently delete a feature. **If we unify, we must namespace.**

---

## R-C · Two resources, and the epic/heroic split

Several classes gain a **second** resource at L10 (Censor's Virtue, Shadow's
Subterfuge — both `type: 'epic'`). So hero resource state **cannot be a
scalar**. Beastheart is worse: Ferocity and Rampage are **both** typed
`'heroic'`, so all three L4/L7/L10 upgrades attach to Rampage as well, and
`takeRespite` zeroes both. Probably wrong; needs the pin.

Censor's Virtue gain value is the non-numeric string `'XP gained'`.

---

## R-D · Does the runtime write hero selections?

`selectAt` is `'build' | 'respite' | 'play'`. This is **not** an edge case:

- **Talent** — two respite choices drive maximum Stamina, Speed, Stability,
  Disengage, proficiencies, ability distance and damage; one option *grants a
  triggered ability*.
- **Null** — `null-1-7` Psionic Augmentation, respite-mutable.
- **Elementalist** — a respite choice whose *option* is itself a build-time
  choice (the only conditional-existence choice point).
- **Kits** — no `selectAt` field at all, yet the respite modal hardcodes
  `case FeatureType.Kit: return true`.

**Ruling needed.** Either the hero document is writable from the encounter
runtime, or respite/play selections move to a runtime-side overlay. This is an
architecture decision, not a data question, and Talent forces it.

---

## R-E · Title echelon semantics — and the vestigial choice type

Two contradictory predicates in one codebase: the checklist filters
`echelon <= heroEchelon` (cumulative); the picker filters
`echelon === spinnerEchelon`, where the spinner merely *defaults* to the hero's
echelon and is freely overridable 1–4. `HeroLogic.getFeatures` then applies
every held title's features **unconditionally** — no gate at all.

Separately: **`FeatureTitleChoice` is dead.** `createTitleChoice` has a full
factory, model, UI and `isChosen` wiring, and is called **zero times** anywhere
in the repo (verified: the only occurrence is the factory definition itself).
`hero-update-logic.ts` actively migrates surviving instances out of
`hero.features` into `hero.state.titles`. The live model is: Director awards →
`state.titles` → player picks one of the title's mutually-exclusive features.

**Do not port the `echelon`/`count` fields on `TitleChoice`.** Spec the live path.

---

## R-F · Do not port string-rewrite mutation *(recommendation, not a question)*

Three independent sightings of the same anti-pattern:

- **Censor domain** — deep-copies the domain, drops 7 of its 10 levels, then
  `replaceAll('Intuition','Presence')` across descriptions, field sections and
  power-roll tier strings (including `+ I` → `+ P`).
- **Conduit** — `switchFeatureCharacteristic`, same mechanism.
- **Kits/domains** — same, via `ConfigDomain`.

A Censor's Life domain is *textually different data* from a Conduit's. This is
**generated rule prose** and it is exactly what the prime directive forbids.
The characteristic override belongs on the **selection**, as a *reference*
resolved at read time — never persisted as rewritten text.

---

## R-G · Instances vs references — a live data-loss bug

`ConfigItemChoice` stamps `itemCopy.id = Utils.guid()`, but `HeroUpdateLogic`
re-resolves selections by matching ids against the sourcebook list. A guid never
matches, so **every complication and title item choice is silently dropped on
re-sync**. Kits and domains keep their source id and survive.

This is the structural distinction to adopt deliberately:

| Kind | Semantics | Storage |
|---|---|---|
| Kits, domains, perks, titles | **Reference** to shared definition | `scc` pointer |
| Items | **Instance** the hero owns and may modify | Owned record + sparse override |

---

## R-H · Nested entities: summons and companions

The two hardest cases, and they are **not** the same shape:

- **Summoner** — `SummonChoice` deep-clones a whole stat block into the hero,
  then permits renaming and overwriting *any* feature's `data` payload by id.
  Forge Steel's own `PregenLogic` serializes ids only and **silently drops the
  customization**. Needs an explicit scope decision + a sparse override doc.
- **Beastheart** — also `SummonChoice` (**not** `FeatureCompanion`; there is no
  add-on point-buy in the class — `FeatureAddOn` lives only in
  `data/monsters/{animal,rival}.ts` as Director-facing authoring). Scope is
  one-directional: features are companion-scoped by default and opt into hero
  scope via `FeatureForController`. **Recommend a `scope: 'companion' |
  'controller'` field rather than a wrapper node.**
- **Summon formations** are undeclared cross-feature mutators: one L1 pick
  injects bonuses into every Minion-organization summon, including ones chosen
  at L2 and L5. Only 1 of 4 options carries `minionFeatures`; the rest are inert.

**Duplicated-rule instance:** companion level scaling is implemented twice —
`SummonLogic.getSummonedMonster` (live) and `MonsterLogic.getFeatures` (gated on
a level that evaluates to 0, so dead). Collapse to one derivation on port.

---

## R-I · The subclass ability source mask is a no-op

`createClassAbilityChoice` defaults `fromSelectedSubclassAbilities: true`, but
**every subclass in every class ships `abilities: []`**, and
`fromSelectedSubclassLevels` is `false`. Confirmed independently in Shadow,
Troubadour, Null and Tactician. Subclass abilities live in `featuresByLevel` and
are therefore unreachable from the picker — e.g. Shadow's *In a Puff of Ash*
can never be selected.

**Ruling needed.** Is this an upstream bug or intended? Do not replicate the
mask without deciding.

---

## R-J · Content gap: the pin has no languages

**Verified.** There is no `language` category anywhere in the pinned corpus —
not in `books/heroes/md/` (18 categories), not in `unified/md/` (21). The only
hit is `project/learn-new-language.md`.

`LanguageChoice` appears on **16 of 18 careers and on every culture**. Those
controls would render an empty drawer.

The content *does* exist in canon — both language tables are in the Heroes PDF
extract (`heroes-flat.txt`, ~line 4666: living languages by ancestry, plus Dead
Languages). So this is a **structured-record gap in SteelCompendium, not a gap
in Draw Steel.**

**Options:** get it upstream · extract into an `ironyard-corrections`-style
source of our own · ship language selection deferred in V1.

> **Same-class gap found 2026-08-30: imbuements.** The pin has no structured
> imbuement records either — only `rule/treasure/enhancement.md` prose and
> tables — while `kits-domains-items.md` §7 sketches an `imbuements` table of
> 86 rows. Whatever disposition R-J gets (upstream / own corrections source /
> defer) should cover imbuements too.

---

## R-K · Real decisions with no data model

Player-facing choices that exist only as inert `Text`, with no structure to
store a selection against:

| Class | Decision |
|---|---|
| Null | Psi Boost — 7-option spend menu, individual Discipline costs |
| Talent | Psi Boost; **strain** — the class's defining mechanic, marked only by `canBeNegative: true` and an ability section *named* `'Strained'` |
| Censor | Judgment wrath-spend menu; Implement of Wrath's per-respite weapon; Templar's conduit-effect pick; Oracle's Prophecy roll list |
| Troubadour | Melodrama Alternative; Duelist *Masterwork*; *Zeitgeist* (respite 1-of-3, body is a markdown table) |
| Elementalist | **Persist** — 16 of 40 abilities carry one, encoded as a section whose `name` is the string `'Persist'`; Green hides 20 shapeshift forms in a markdown table inside a `description` |
| Summoner | Minion Stamina scaling ships as prose tables inside `PackageContent` |

**We would have to invent this structure.** Forge Steel's shape will not give it
to us. Note the Summoner row is **already solved by our pin** — its minions are
full structured statblocks (see `00-foundation.md` §6b).

---

## R-L · Cross-cutting: ids are labels, not keys *(decided — see §6b/§8.3)*

Not a ruling, but the constraint every item above inherits. Upstream Forge Steel
ids have 61 duplicates including **cross-class collisions**
(`shadow-10-1b-1..4` appear verbatim in both `shadow.ts:363` and
`conduit.ts:605`), id gaps, and duplicate feature *names* within one class.

**Key on the pin's `scc`** — 3,081 records, 3,081 distinct, zero collisions.
Every spec row must be joined to an `scc` id during seeding; any row that will
not join is a discrepancy to resolve against the pin.

> **Join pre-load (2026-08-30 pin review) — known deltas to seed into the
> join's discrepancy list rather than rediscover:**
>
> - **Cardinality is not 1:1.** One pin record can hide several choice points
>   (a career's skills/languages/perk/incident live in one record; the
>   culture-axis skill choice lives inside one `culture/*` record) — the
>   overlay key is `(scc, discriminator)`, not bare `scc`. Conversely several
>   FS rows collapse to one pin record (Fury's kit is one class-level
>   `feature.fury.level-1/kit`, not per-subclass), and nested FS sub-features
>   have no individual pin records.
> - **Name drift:** FS "Tactic Call" = pin **"Quick Command"**
>   (`feature/summoner/level-1/quick-command.md`); FS "Professional cultures"
>   = pin **"Archetypical Cultures Table"** (16 rows,
>   `chapter/background.md`).
> - **No pin records exist for:** languages (R-J), **imbuements** (R-J-class
>   gap — the pin has only `rule/treasure/enhancement.md` prose), FS's preset
>   cultures (pin has exactly the 13 axis records), domain-level records
>   (membership is `subclass:` frontmatter on conduit features), and
>   inciting-incident identity (table rows inside career records).
> - **Count deltas:** core titles FS 62 vs pin 60 (2 unreconciled); pin has
>   8 beastheart perks FS lacks; **Beastheart's book is `exclude` in the pin
>   config** — every beastheart row joins as `excluded-book` until admission.

> **Join BUILT 2026-08-31** (`pnpm character-builder:extract` →
> `character-builder:join`; artifacts regenerate under
> `.artifacts/canon/character-builder/`, gitignored like all canon
> artifacts — the committed scripts are the source of truth). Numbers:
> 2,918 FS rows, 2,387 joined (96.7% of joinable), every row accounted
> exactly once; R-A worklist emitted at 40 rows (the "~90" estimate
> counted affected features more loosely). Pre-load corrections from the
> mechanical pass:
>
> - **WRONG — "pin has 8 beastheart perks FS lacks":** FS carries all 8,
>   names matching 1:1 (`summary.json → beastheartPerkCrossCheck`).
> - **Titles reconciliation is 4 names, not 2:** one delta was drift (FS
>   "Dwarf Legionnaire" = pin `title/dwarven-legionnaire.md`), leaving
>   FS-only Angler / Goldenrod / Master of Reels and pin-only Stronghold.
> - Domain features live as conduit `subclass:`-frontmatter records **and**
>   as conduit/censor ability records (Reap, Seance) — pre-load missed the
>   second home.
> - 12 additional observed name drifts beyond the seeded map are in the
>   join's documented `OBSERVED_DRIFT` dict (each with 1:1 leftover-pair
>   evidence) — review them in the R-L ruling pass, plus the parked
>   judgment calls in `discrepancies.json` (Summoner circle machinery,
>   subclass L1 skill grants, Vampire Sire↔Scion, etc.).

---

## R-M · Hero potency derivation: class characteristic or highest? *(not an FS question — pin-internal; rulebot evidence 2026-08-30, Gates 1+2 run)*

> **RULED 2026-08-30 — recommendation accepted (user: "Let's go with your
> recommendation"): the class-printed characteristic is definitional.**
> Implemented same day in `packages/canon/src/hero-stats.ts`: the
> characteristic AND offset are parsed from each class record's printed
> potency line (never hardcoded); an unparseable line yields a null triple.
> The engine continues to consume stored values only.

**Decision needed (resolved above):** which derivation is *definitional* for a hero's
weak/average/strong potency values — the class-printed characteristic, or
"your highest characteristic score"? This is the decision **R-0003**
(`docs/power-roll-design.md` §10 Q2) deferred to the character-build
pipeline; `heroStats` (packages/canon/src/hero-stats.ts) has now arrived and
ships `potencies: null` until ruled.

**Headline finding: the two readings are extensionally equal for every RAW
hero.** Verified across all 9 classes: every class starts its potency
characteristic at 2 (starting-array max), the level 4/10 features set class
primaries to 3/5 (single-primary classes add a floating +1 under the same
caps), and level 7 raises all characteristics by 1 capped at 4 — so the
class potency characteristic is always at least tied for highest, and the
two formulas always produce the same number. The choice only matters for
homebrew or out-of-band characteristic changes. No text calls either
formulation a restatement of the other.

Both formulations coexist in the same passage (Heroes book §Potencies,
p.74): prose — ❝the value of the potency for your hero's abilities is based
on one of your characteristics and **determined by your class**❞ —
immediately followed by bullets — ❝Your weak potency value is equal to
**your highest characteristic score** − 2❞ (average −1, strong −0). Class
Basics print the fixed form (Fury p.131: ❝Weak Potency: Might − 2❞;
Tactician p.175: Reason). The only passage addressing recomputation, the
conduit worked example (p.74), keys it to the *class* characteristic:
❝knowing that those values won't change until the character hits 2nd
echelon and **their Intuition score** becomes 3❞.

Side findings, both settled: the M/A/R/I/P letter in ability notation
(❝M < WEAK❞) is the **target's resisting** characteristic (per-ability),
not the source of the attacker's value (per-hero) — the per-ability reading
of the question is dead. Monsters are explicitly highest-characteristic
(❝bases those potencies on their highest characteristic❞, Monster Basics).

**Recommendation: class-printed characteristic is definitional.** The
conduit example is the only text with recomputation semantics and it keys
to the class characteristic; the class records' structured
`weak/average/strong_potency` fields make it deterministic data the
pipeline already holds; and it stays correct if a homebrew source ever
raises a non-class characteristic past the primary (the highest-score
reading would silently shift the potency source). Ruling accepted ⇒
`heroStats` derives the triple from the class-printed characteristic and
drops `potencies: null`.

---

## Suggested order

1. **R-L** (the join) — nothing else can be keyed until it exists.
2. **R-A** — highest volume; blocks seeding levels 1 of every class.
3. **R-D** — architecture; blocks the hero document shape.
4. **R-B / R-C** — blocks the resource resolver.
5. **R-G / R-H** — blocks the schema for items and nested entities.
6. **R-E / R-I / R-F** — blocks specific surfaces.
7. **R-J / R-K** — content and scope decisions; can run in parallel.

## RULED — 2026-08-31 (normative-schema Q-pass, user decisions via approvals surface)

The §8 open questions of `02-normative-schema.md` were put to the user on the
approvals review surface; verbatim decision blob archived in the session
record. Dispositions:

- **Q1 — XP-gained hook (the R-C hole): (a) accepted.** The "gain [resource]
  equal to the XP you gain" hook is represented as an **XP-award campaign
  event** the runtime region subscribes to. Unblocks the Censor L10 slice
  when its turn comes; nothing else waits on it.
- **Q2 — characteristics column: stored projection CONFIRMED.** The shipped
  `characteristics` column is a stored projection of the decision log with
  one derivation home, as drafted.
- **Q3 — nested creatures: REUSE confirmed.** Compiled summons/companions
  reuse the engine's `ParticipantStats` + `statblockStats` path (pointer +
  overrides), not a builder-local representation.
- **Q4 — per-hero state across the encounter boundary: rulebot dispatched.**
  User direction: verify in the books rather than decide by fiat; user's
  table understanding is that Stamina and Recoveries are tracked **per
  respite, not per encounter** (i.e. they persist across encounters and
  refill at a respite). Awaiting Gate-1/Gate-2 evidence before any schema
  slot is added.
- **Q5 — languages/imbuements gap: PENDING, question unclear.** The user
  did not understand the ask as phrased; re-asked in plain terms (which
  source should supply the missing language/imbuement lists: upstream fix,
  our own supplement source, or leave the wizard step visibly incomplete).
- **Q6 — kit stat aggregation: pin check runs WITH the Fury vertical.**
  Confirmed; already wired into the in-flight `feat/fury-vertical` brief
  (verify printed math or surface receipts, never trust FS-observed math).
- **Q7 — join key stability: SCHEDULED.** The join must declare its
  discriminator slugs stable across re-runs at the same pin, and a pin
  upgrade that changes record cardinality is a migration event for
  `build.decisions` (stale keys re-resolved or surfaced as invalidated,
  never silently dropped). Filed as an engineering task, in flight.
- **Q8 — revert scope: CONFIRMED on both halves.** Rewind truncates the log
  with no separate removed-suffix audit trail in V1 (the campaign log's
  attribution of the revert mutation suffices), and orphaned
  equipment/title layers are flagged for the Director, never
  cascade-deleted.

Separately ruled the same day (recorded in `docs/canon-rulings.md`): the
**R-0031 retarget extension** — "becomes the new target of the
strike/ability" joins the triggered-action template set (5 core statblocks:
vampire, vampire-lord, hulking-brain, castellan-hoplon,
war-dog-mischievite).
