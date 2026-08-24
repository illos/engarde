# Provenance at the Table — the inline-receipt failsafe

*Recorded 2026-08-24 from a user design ruling. This is a product commitment,
not yet a shipped surface.*

## The commitment

Every game-log entry the engine produces should carry an unobtrusive
affordance (an info icon or equivalent) that reveals, inline, the verbatim
MCDM rule text the entry was executed from. The Director reads the original
book text right at the moment it fired — and if they disagree with how we
encoded a rule, they have everything needed to correct it in real time at the
table. The corpus-chunking + classification work is therefore double-duty:
it feeds the engine AND builds the app's failsafe from day one.

## Why this is cheap: the substrate already carries it

- Every engine log entry carries `canonRefs` — the artifact ids its behavior
  traces to (engine schema invariant since the pilot).
- Effect receipts additionally carry artifact id + occurrence ordinal + UTF-8
  byte span + the exact source payload; table directives ARE the verbatim
  text already.
- Convex stores the accepted canon records SHA-256-verified, so the exact
  bytes are servable to the client by artifact id — no second source of
  truth, no paraphrase channel anywhere.
- Gate-3 rulings (`docs/canon-rulings.md`, R-####) are keyed entries;
  mechanisms that encode a ruling cite it, so the popover can also say "we
  ruled X on this ambiguity, here's the evidence" for the cases where the
  book alone underdetermines behavior.

## What the future UI slice adds (and only this)

1. Log-entry → info-icon → popover/panel rendering the referenced artifact's
   verbatim text, with the specific byte span highlighted when the receipt
   carries one.
2. A ruling badge when the mechanism cites an R-#### entry, linking the
   ruling's question + evidence.
3. Nothing else. The correction loop already exists by architecture: the
   permissive engine warns-and-applies rather than blocking, every mutation
   is attributed and undoable/editable, so "Director disagrees → fixes state
   in real time" is current behavior. The popover just puts the evidence
   next to the override affordance.

## Constraint

The popover renders stored canon bytes verbatim — never a summary, never a
reflow that could drift. If a chunk is long, scroll it; don't excerpt beyond
the span highlight.
