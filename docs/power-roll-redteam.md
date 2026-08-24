# Power-roll design — red-team findings ledger

> Working ledger for the adversarial review of `power-roll-design.md`
> (2026-08-24). Lenses: substrate engineering (inline, Lead), canon fidelity,
> adversarial play, grammar/measurement (agents). Findings feed the design
> revision; each is resolved (design edit) or explicitly rejected with a
> reason before implementation starts.

## Lens: substrate engineering (inline, complete)

- **SE-1 (MAJOR — damage vs Stamina-loss conflation).** Canon distinguishes
  "takes damage" (→ weakness/immunity pipeline, then Stamina reduction,
  `rule.health/stamina`) from effects that say "lose Stamina" directly (e.g.
  bleeding: ❝they lose Stamina equal to 1d6 + their level❞ — no damage event).
  A single `applyDamage` home would route future Stamina-loss implementers
  through immunity incorrectly, or push them to copy-paste the threshold
  logic. **Fix:** two entry points over one shared core — `applyDamage`
  (full pipeline) and `loseStamina` (direct) — both funneling into one
  threshold/ledger step (winded/dying/death + log claims).
- **SE-2 (MAJOR — persisted-state migration).** Live Convex encounters hold
  `schemaVersion: 1` states without `kind`/`stats`/`stamina`. Adding required
  fields breaks `EncounterStateSchema.parse` on every stored row. **Fix:**
  `schemaVersion: 2` + an engine-exported pure `upgradeEncounterState(v1) → v2`
  (one home; hosts call it on read). v1 participants upgrade to
  `stats: null`-mode actors. Alternatively note that encounters are
  session-scoped and pre-deploy actives can be ended — but the upgrade
  function is the substrate-correct answer and is trivial.
- **SE-3 (MAJOR — host drops LogEntry.data).** `appendLog` in
  `encounters.ts` persists only kind/message/canonRefs; the engine's
  machine-readable `data` (the breakdown, delta claims) is discarded. The
  design's receipts/replay/UI story depends on it. **Fix:** persist `data`
  (bounded, ~1KB) on `encounterLogEntries`; UI renders the breakdown from it.
- **SE-4 (MINOR — RNG draw discipline).** Specify: asserted `dice` → zero RNG
  draws; auto-roll → exactly two draws in d1,d2 order; no other draws in the
  executor. Replay stability depends on the draw count being a pure function
  of the intent.
- **SE-5 (MINOR — nullable coherence).** `stats: null` with `stamina` present
  is incoherent. Zod refinement: `stamina` ⇔ `stats`.
- **SE-6 (MINOR — participant kind provenance).** `kind` must be explicit in
  the start/seed payload: statblock-sourced → `director-creature`;
  asserted-stats participants declare it. No default.
- **SE-7 (specify — intent misuse table).** Zod refusals: duplicate/empty
  targets, dice outside 1..10, negative bonus/penalty/extraDamage values,
  `characteristicChoice` not offered by the ability text. Warn-and-apply:
  target count exceeding the ability's header line (rule-violation class).
  No-op + informational: `downgradeToTier` ≥ computed tier; `knockOut` on a
  non-killing blow. Encode `automaticOutcomes` set semantics exactly
  (same-tier duplicates → that tier; differing tiers → all ignored).
  Self-targeting allowed silently (corpus has self-damage effects).
- **SE-8 (suggestion — breakdown-recompute invariant).** Strongest oracle
  available: recompute `resolvePowerRoll` from the logged inputs (dice,
  characteristic, modifier lists) and fail on any mismatch with the logged
  total/tier — makes the whole roll path self-auditing on every dispatch.
  Add potency-gate consistency (a logged resisted gate for target T +
  condition C ⇒ no addedInstanceIds for C on T in the same intent) and
  stamina-claim completeness ({participantId, from, to, temporaryFrom,
  temporaryTo}).
- **SE-9 (MINOR — build order).** Invariant extensions land with the damage
  core (step 2), not with the executor (step 4): `apply-damage` is
  dispatchable standalone and must be born under the oracle.
- **SE-10 (note — grammar drift mid-encounter).** Ability text parses per
  dispatch; a grammar upgrade mid-encounter changes later dispatches.
  Acceptable (each dispatch logs what it did); note in design.
- **SE-11 (confirmed OK).** Trust model (any active member acts, receipts
  always) unchanged by this cluster; damage is not a new authority class.
  Per-dispatch seeded RNG replay model unchanged.

> Note: the three agent lenses were run **inline by the Lead** after a
> persistent API-overload storm killed every subagent launch (8+ failures).
> Independence was partially preserved by re-verifying against the corpus
> with fresh greps/scripts rather than trusting in-context memory.

## Lens: canon fidelity (inline, complete)

- **CF-1 (BLOCKER — minion squad Stamina pools).** ❝Each squad of minions
  shares a Stamina pool, with initial Stamina equal to each individual
  minion's Stamina multiplied by the number of minions in the squad. …
  minions can't be winded, can't regain Stamina, and can't gain temporary
  Stamina❞; one minion drops per multiple of individual Stamina; area
  effects kill only in-area minions; the damager chooses the victim on
  multi-minion damage; ❝When a minion is taken out of the fight, they count
  as being reduced to 0 Stamina for triggering effects❞
  (`monsters/md/chapter/monster-basics.md:121–135`; captain Stamina separate,
  `monsters/md/rule/monster/captain.md:13`). The per-participant Stamina
  model is WRONG for minion-organization statblocks. **Fix:** participants
  carry `organization` from the statblock; damage/potency against a
  `Minion`-organization participant routes to the `not-automated` receipt
  path (representational invariant — the engine cannot yet represent pool
  state); the **minion-squad mechanism is a named follow-up slice** in the
  known-unknowns table. Silent individual treatment is forbidden.
- **CF-2 (MAJOR — end-encounter exceptions).** ❝all effects and conditions
  that are imposed on heroes during a combat encounter end when the
  encounter is over if the hero wants them to, **except for being winded,
  unconscious, or dying**❞ (`heroes/md/chapter/classes.md:102`). Winded/dying
  are stamina-derived (unaffected by the sweep) — but the knock-out
  `unconscious` instance and the dying-sourced `bleeding` instance must be
  **exempt from `endEncounterSweep`'s end-by-default**. Fix: health-sourced
  instances (source rule refs `rule.health/*`) are swept only when their
  stamina precondition has lapsed.
- **CF-3 (CONFIRMED-OK).** No "resistance roll" concept exists in the rule
  records; stability is forced-movement-only (`rule/character/stability.md`);
  rerolls are hero-token/test-scoped (`rule/test/test-difficulty.md:24`) —
  already-declared known-unknowns. Cover/concealment/flanking/high-ground
  grant edges/banes → covered by the asserted-modifier channel until the
  derived-modifier mechanism lands.
- **CF-4 (CONFIRMED-OK).** The always-tier-3 rule correctly cites
  `rule.dice/natural-roll`; `rule.dice/natural-19-20` is test-scoped
  ("critical success"), as the design has it.

## Lens: adversarial play (inline, complete)

- **PL-1 (MAJOR — downgrade interactivity).** Canon downgrade is a
  post-roll choice (the restrained→slowed example presumes seeing tier 3
  first); a pre-declared `downgradeToTier` cannot express it. **v0
  decision:** stay single-phase; pre-declared downgrade supported; the
  result log emits an informational "downgrade available to tiers < N";
  the faithful **two-phase roll→commit flow is filed as a follow-up**
  bundled with action economy, where roll-window triggered actions (❝when
  an ally makes a power roll❞ class) force the same two-phase shape anyway.
  `resolvePowerRoll` is already pure/separable — the seam costs nothing now.
- **PL-2 (MAJOR — unconscious-from-knockout is state).** ❝If a creature
  takes damage while unconscious in this way, they die❞
  (`rule.health/stamina` §Knocking Creatures Out). Knock-out must apply a
  tracked `unconscious` condition instance (sourced to the rule), and the
  damage core must check it: damage → death, with the claim logged.
- **PL-3 (CONFIRMED-OK).** Judgment's Hammer golden example reproduces
  exactly under the strictly-less gate (conduit I=2 → potencies 0/1/2 vs
  bandit A=0: tier 1 resisted, tiers 2–3 applied).
- **PL-4 (CONFIRMED-OK).** Edge/bane lattice: all enumerated cancellation
  cases match the capped-counts-net encoding (2e+1b→+2; 3b+1e→−2; e+b→0;
  2e+2b→0).
- **PL-5 (MINOR — damage characteristic choice).** ❝7 + M or A damage❞ is a
  damage-time choice independent of the roll characteristic. Add optional
  `damageCharacteristicChoice`; default = the actor's highest among the
  offered options (deterministic, logged as a defaulted choice).
- **PL-6 (accepted v0).** With no healing mechanism, dying is sticky until
  the recoveries cluster; coherent, visible in state/log, already declared.
- **PL-7/8 (CONFIRMED-OK).** Winded ≤-boundary; automatic-outcome set
  semantics (same→obtain, different→all ignored) as specified.

## Lens: grammar/measurement (inline, script-verified)

- **GR-1 (CONFIRMED, better than claimed).** Proposed damage sub-grammar
  full-matches **98.0%** of the 3,369 damage-carrying tier heads (3,936 tier
  lines total). Fully anchored → zero mis-parse vectors found; all 66
  rejects fall to residue intact (dual damage parts, dice `2d6 + 7 + A`,
  halving prose, `vertical push`, narrative sentences).
- **GR-2 (take).** `N + **C** damage` bold-wrapped characteristic (6 lines):
  strip `**` inside the head before matching.
- **GR-3 (note).** `(EoT)` ending marker exists in tier lines (e.g.
  frightened …(EoT)) — not in the ending vocabulary; such lines stay residue
  today; queue as the next ending-vocab item.
- **GR-4 (CONFIRMED-OK).** Potency notation is uniform corpus-wide (always
  spaced, never negative, single capital letter); ~190 mid-segment potencies
  live inside forced-movement riders and correctly remain residue under
  line-atomic all-or-none parsing. Conservation semantics unchanged.

## Disposition

All BLOCKER/MAJOR findings are folded into `power-roll-design.md` rev 2
(same date): CF-1 → §3/§5/§9 minion routing + follow-up slice; CF-2 → §4.3
sweep exemption; PL-1 → §4.1 downgrade v0 + two-phase follow-up; PL-2 →
§5 knock-out instance + death-on-damage; SE-1 → §5 dual entry points;
SE-2 → §3 schemaVersion 2 + upgrade function; SE-3 → §11 host persists
LogEntry.data; SE-4..10, PL-5, GR-2 → respective sections.
