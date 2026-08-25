# Flat-resource family — slice report (2026-08-25)

Design: `flat-resource-design.md` (rev 1) · Rulings: `canon-rulings.md`
R-0017..R-0022, user-accepted 2026-08-25 via the :9510 card surface (all six
accepted; user notes on R-0019/R-0020 recorded verbatim in the rulings file).
Corpus pin `520553438a4e8d199bfaaf676b8aa9bd273f4d61` throughout.

## What shipped

The four remaining closed whole-payload Effect templates — 12 lines / 12
artifacts — now compile and execute:

| template | lines | resolution kind |
|---|---:|---|
| spend-recovery-exact | 6 | `spend-recovery` (declinable offer) |
| regains-stamina-flat | 2 | `regain-stamina` (automatic) |
| temporary-stamina-flat | 1 | `temporary-stamina` (max-not-sum) |
| area-difficult-terrain | 3 | `terrain-fact` (attributed record) |

**Accounting: automated 55 → 67 · table 1,633 → 1,621 (12 permanently-manual
+ 1,609 mechanism-pending).** Families: recovery 34→28, stamina-regain
35→33, temporary-stamina 22→21, terrain 30→27. The closed-template pool is
exhausted — every anchored template except the deliberately deferred
`choice-menu-intro` is implemented, count 0. Frozen in
`effect-shape-inventory.test.ts`, `effect-exhaustive.test.ts` (counts
re-frozen deliberately), `narrative-triage.test.ts` (widened pool 335→325).

## Engine (schemaVersion 3 → 4, lossless migration)

- **Recoveries slot** — `stats.recoveriesMax` STORED (the potencies
  precedent; class-determined, null for all Director creatures per §No
  Recoveries) + `stamina.recoveries` tracked exactly when the max is
  (schema-refined). Seeds full, mirroring Stamina-at-maximum.
- **One homes** (`health.ts` / `damage.ts`): `recoveryValue(staminaMax)` =
  floor(max/3) serving heroes AND the NPC conversion; `regainStamina`
  (signed addition, clamped at maximum, never touches temporary, logs
  no-longer-winded / no-longer-dying transitions — R-0017);
  `gainTemporaryStamina` (max-not-sum, no cap — R-0021); `spendRecovery`
  (hero decrement + regain; Director-creature one-third conversion with no
  pool — R-0019b; whole-call refusal at 0).
- **Executor**: spend offers need every bound target's accept/decline
  (`recoverySpends`); a 0-Recoveries binding is a per-binding
  non-application (informational + no state change) so sibling spenders
  proceed — the whole-dispatch `refusal` kind stays reserved for its
  invariant meaning; singular-subject over-binding warns and applies;
  minions route to table receipts on all regain paths (R-0019c).
- **Terrain facts** — encounter-level `terrainFacts` slot: attributed record
  (source artifact + ordinal, verbatim header area cell via the new
  `EffectProgramData.distanceText`, creating participant, intent id);
  `clear-terrain-fact` Director intent; facts end with the encounter;
  movement math stays table until spatial substrate (R-0022).
- **Sweeps**: temporary Stamina already cleared at end-encounter (shipped
  with the power-roll cluster, verbatim p.278 default); terrain facts now
  also swept with a claim.
- **Invariant oracle extended**: recoveries claim-walking + bounds,
  stamina-above-maximum, terrain add/remove reconciliation with phantom
  detection.

## Independent golden (channel 2)

`FLAT_RESOURCE_CANON_EXPECTATIONS` — 12 entries produced by an independent
raw scanner (own frontmatter stripping / marker counting / header-cell
extraction; production grammar never imported), calibrated byte-identically
against four pre-existing entries before computing the new spans. Zero
production mismatches: the exhaustive suite verifies path, span, source
text, targets header, and compiled resolution for all 12, then executes all
1,688 programs with zero refusals and zero invariant violations.

## Hosts

- **Convex**: view vitals gain `recoveriesCurrent/Max`; top-level
  `terrainFacts` (slug-resolved attribution); `useEffect` passes
  `recoverySpends`; Director-gated `clearTerrainFact`. E2E on three NEW
  drift-guarded verbatim fixtures (kobold-signifer regain ×2 targets,
  conduit healing-grace spend pass-through incl. refusal + decline,
  war-dog-aerocite terrain add/clear + non-director rejection).
- **CLI** (`play.ts`): stat-tracked vitals line (stamina / +temp /
  recoveries), terrain-facts status section with copyable factIds,
  `decline:<id>` target prefix (bare id = accept) with pre-dispatch shell
  validation, `clearterrain <factId> [because …]` command; corpus-gated
  play-through green (My Turn! accept/decline, pillar terrain lifecycle).
- **Web Table**: recoveries in vitals, terrain-fact list with
  Director-only clear, spend-offer accept/decline in the effect dispatch
  flow (see the web slice commit).

## Verification

- Workspace: engine 178 · canon 106 (+31 corpus-gated) · backend 74 (+3
  drift) · control-center 5 · web green; `pnpm -r typecheck` and root
  `biome check` clean.
- `pnpm corpus:certify` stamp refreshed and committed (CONV-0003) — the
  corpus-enabled suite (137 tests) green at the pin.
- Verbatim fixture `statsJson` strings re-frozen consciously after
  `statblockStats` began emitting `recoveriesMax: null` (the drift guards
  fired exactly as designed).

## Deliberate scope cuts (tracked, not hidden)

- **Hero seeding path**: Convex `encounters.start` seeds participants from
  statblock stats only — a hero with tracked Recoveries is not yet seedable
  at the Table, so the Convex spend E2E proves the R-0019b conversion path;
  hero-decrement behavior is engine-tested. Lights up with character data
  (hero potencies share the same gap — R-0003).
- **CLI actor stats**: play-cli's default actors stay table-mode; the
  `PlayActor.stats` seam is ready but wiring `statblockStats` into actor
  seeding changes live automation behavior — a deliberate follow-up.
- Recovery "+ a little extra" variants, non-optional "spends a Recovery"
  wording, out-of-combat free spending, duration-overridden temporary
  Stamina, difficult-terrain movement math (spatial arc), retainers: all
  outside the closed templates; see design §5.

## Audit (2026-08-25, fresh read-only): verdict GO

No blockers. Three IMPORTANT findings, all fixed same-day:
- **I-1** — the design's promised receipt flag for an unconscious target
  accepting a spend was not emitted; the executor now warns-and-applies
  with an `unconsciousSpendTarget` receipt (tested).
- **I-2** — the flat-template subject alternations were a cross-template
  superset while the comment claimed observed-forms-only; each regex is
  now tightened to its own observed subjects (numerals still generalize)
  and the comment states the count-freeze interception precisely.
- **I-3** — the R-0017 ∩ R-0004 seam (bleeding survives the regain out of
  dying and becomes removable) had no test; pinned now (refuse-while-dying
  → regain → persists → removal succeeds).
Cheap hardening from LATENT L-4 also applied: terrain factIds include the
effect ordinal.

Latent notes recorded for future implementers (audit L-1..L-3): the
0-Recoveries predicate has a deliberate two-home split (core refusal vs
executor per-binding) that must be unified when the user-flagged
Recovery-donation class ruling lands; minion detection is inlined twice in
damage.ts — extract `isMinion` before the minion-pool arc; the executor's
per-target apply loop is duplicated between the spend and regain branches —
extract a shared applicator before the surge / heroic-resource / malice
families.

## Follow-ups / latent notes

- The user's R-0019 note flags a class that gives Recoveries away to
  allies as the future exception to the 0-Recoveries refusal — that
  donation form is its own ruling when it enters an automated family.
- Next selection: the closed-template pool is empty; candidates are the
  open-form families or the roadmap arcs (minion squad pools, action
  economy + two-phase commit).
