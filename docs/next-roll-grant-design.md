# Next-roll grant mechanism — design (edge-bane-next-roll family)

Slice: the `edge-bane-next-roll` (12 lines) + `next-strike-against-target`
(2 lines) closed templates — 14 effect lines across 14 artifacts (inventory:
`docs/effect-shape-inventory.md`, candidate #2). Gate-3 rulings:
**R-0012–R-0016** (`docs/canon-rulings.md`, approved 2026-08-25). This is the
engine's first persistent non-condition per-participant state slot; the
substrate is designed for the broader 152-line edge-bane family, not just
these 14 lines (Prime directive #2).

## State slot

`ParticipantState.grants: NextRollGrant[]` (new; schemaVersion 2 → 3):

```
NextRollGrant {
  grantId        string            // `${effectArtifactId}#${intentId}-${holderId}`
  polarity       'edge' | 'double-edge' | 'bane' | 'double-bane'
  scope          'strike' | 'power-roll'   // R-0013 consumption predicate
  direction      'outbound' | 'inbound'    // R-0014: inbound rides strikes AGAINST holder
  source         { participantId?, effectArtifactId? }  // same-ability collapse
  window         'end-of-targets-next-turn' | null      // R-0016 | R-0012 default
}
```

- **Add + collapse:** adding a grant whose `source.effectArtifactId`,
  `polarity`, `scope`, and `direction` all match an existing grant on the
  holder **replaces** it (Stacking Unique Effects: same-ability uses don't
  stack; the most recent applies for duration). Different abilities coexist.
- **Migration:** v2 states gain `grants: []` per participant (lossless);
  `upgradeEncounterState` grows the v2 → v3 branch and retains the v2 schema.

## Consumption (R-0013, R-0014, R-0015)

At `use-ability` roll time the engine derives `isStrike` from the compiled
ability's **keywords** (newly plumbed through `compileAbilities` — grammar
already parses them; the engine currently never sees them):

- **Outbound pool (uniform):** the actor's grants with `direction: 'outbound'`
  whose scope matches (strike-scoped need `isStrike`; power-roll-scoped match
  any ability roll) are consumed and contribute counts — edge +1e,
  double-edge +2e, bane +1b, double-bane +2b.
- **Inbound pools (target-local, R-0014):** when `isStrike`, each target's
  `direction: 'inbound'` strike-scoped grants are consumed and contribute to
  **that target's pool only**. Marks on different targets never combine.
- **Per-target resolution (Roll Against Multiple Creatures):** one dice draw;
  per target, `resolvePowerRoll` runs with
  `edges = payload.edges + outbound + inbound(target)` (same for banes) —
  the one cap-then-cancel home, never re-derived. Tier outcomes may differ
  per target; damage and effect phases consume the per-target tier.
- **Spend-on-cancel (R-0015):** consumption happens before net evaluation;
  a grant whose numeric effect cancellation zeroes is still spent and still
  appears in the receipt counts (the breakdown-recompute invariant sees the
  effective per-target counts).
- Characteristic tests (`use-effect` test resolutions) consume the rolling
  target's outbound `power-roll`-scoped grants the same way (a test is a
  power roll); strike-scoped grants ignore tests (R-0013).

**Receipt:** the dispatch-level `powerRoll` entry keeps its base resolution
(payload counts + outbound grants — uniform) and gains
`grantsConsumed: [{grantId, holderId, polarity, contribution}]` plus
`perTarget: { [targetId]: { edges, banes, resolution } }` entries whenever any
target's pool differs from the base. Invariants recompute base AND per-target
resolutions.

## Granting (`use-effect` resolution kind `next-roll-grant`)

```
{ kind: 'next-roll-grant', polarity, scope, direction,
  subject: 'the-target' | 'each-target', window }
```

Execution: refusal gates first (unknown participants); then per declared
target, add-with-collapse the grant instance to that participant (both
directions store on the *target* — an outbound grant modifies the target's
own next roll; an inbound grant modifies the next qualifying strike against
them), one attributed mutation entry per target
(`grantsAdded: [instance]`). Targetless dispatch refuses (grants need a
holder). Grammar (canon package):

- `(The|Each) target (takes a bane|takes a double bane|gains an edge|has a
  double edge) on their next (strike|power roll)( made before the end of
  their next turn)?.` → outbound; window from the optional tail.
- `The next strike made against the target (gains an edge|takes a bane).`
  → inbound, scope strike, window null.

Link-stripped, anchored whole-payload — exactly the closed templates the
shape inventory froze; grammar supports all four polarities. (No bold
tolerance: all 14 pinned lines are bold-free; a future bolded line fails
closed to table.)

## Expiry

- **Windowed grants (R-0016):** `endOfTurnSweep` grows a grants loop —
  `window: 'end-of-targets-next-turn'` grants on the participant whose turn
  ends expire there. This machinery is *already* the current-turn clause:
  the sweep fires at the holder's next end-turn event whether the grant
  landed on their own turn or off-turn.
- **Bare grants (R-0012):** persist across turns until consumed;
  `endEncounterSweep` gains a grants pass clearing every remaining grant
  (adjudicated boundary; hero out-of-encounter retention is Director/table
  state — documented, not modeled; `keepInstanceIds` does not apply to
  grants).

## Invariants

- New reconciliation branch: per dispatch, every grant added / removed on any
  participant must be attributed in log data (`grantsAdded` /
  `grantsConsumed` / `grantsExpired` / `grantsCleared`) — mirror of the
  condition-instance reconciliation.
- `breakdown-mismatch` extends over `perTarget` resolutions.
- `refusal-with-change` unchanged (refusals stay pre-mutation).

## Second-implementer test (Prime directive #2)

Next implementers from the corpus: the bounded monster variants ("until the
start of their next turn" — Hobgoblin Bloodlord; "before the end of the
encounter" — Orc Warleader), the conditional Wobalas double-bane, and the
inbound damage rider ("next strike made against the target deals an extra 5
damage"). The slot's `window` is an extensible union (start-of-turn and
end-of-encounter windows are new enum members + sweep cases, no reshape);
polarity/scope/direction cover the modifier variants; the damage rider will
want a `contribution` generalization (modifier vs extra damage) — kept in
mind, not speculatively built (no corpus-certified payload shape yet).

## Accounting (re-frozen at ship)

Automatic 41 → 55 (+14 `next-roll-grant`); table 1,647 → 1,633; family
`edge-bane` 152 → 138; closed templates `edge-bane-next-roll` 12 → 0,
`next-strike-against-target` 2 → 0. Independent golden channel: a raw
scanner (mirror of the test family's) produces 14 expectations cross-checked
field-for-field against production compilation — zero mismatches required.
Corpus re-certification (`pnpm corpus:certify`) ships with the change
(CONV-0003).
