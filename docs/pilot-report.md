# Conditions pilot — what I need from you

We test-drove the whole books-to-engine pipeline on one small slice: the nine
conditions and the 196 rulebook excerpts they depend on. It worked end to
end. Before I scale it to the full books, I need three things from you.

## 1. Review the category map (~10 min) — replaces the old items 1 and 2

You called it: four AI runs plus a same-model repeat showed the labels were
judgment calls, not facts (the same model disagreed with itself on 36% of
cards). So we dropped AI classification entirely. Instead, per your design:
MCDM already organized the books — their 20 chapters are the categories, and
every extracted piece now inherits its category mechanically from where it
lives in the book. All 3,529 pieces categorized, zero unmatched, same result
every run.

The one human judgment left is the map itself: 57 rows, each saying "pieces
from this part of the book go in this bucket." The full map is right below —
each row shows how many pieces it captures and real examples, so you can
judge it here. The four amber rows at the top are the ones I flagged for
you: rules terms the book itself spreads across two chapters. One default
worth knowing: signature abilities named after kits or ancestries currently
land in the classes bucket with the rest of the abilities.

MAP-TABLE-HERE

Tell me "map approved" or list row changes, and I flip it to accepted.

## 2. Sign off one rules ruling: free maneuvers are turn-only

You sent this to a rulebot division. It swept every "free maneuver" in both
core books and checked the print PDF. Verdict: **turn-only.** The evidence,
verbatim:

- The book's glossary says it outright (Heroes p.13, pointing at p.267):
  "Free Maneuver: A maneuver that doesn't count against the one maneuver per
  turn a creature can take. **A free maneuver can only be used by a creature
  on their turn.**"
- The body rule (Combat, book p.267) frames them the same way: "you can
  undertake such straightforward activities as free maneuvers **on your
  turn**."
- Off-turn simple activities are a *separate* category (same page): "When it
  isn't your turn, you can typically undertake even simpler activities
  requiring no action with the Director's approval."
- And the design pattern confirms it: eight abilities that want anytime
  ending say "**(no action required)**" explicitly — that's the "unless the
  ability says otherwise" escape hatch in the Ending Effects rule. If free
  maneuvers worked off-turn, that phrasing would be pointless.

One honest caveat for your sign-off: the word "only" appears just in the
glossary; the body rule implies it without stating it. Our own canon
standards treat glossaries as pointers, not authorities — so this needs your
blessing rather than mine.

**If you sign off:** the ruling is recorded, and our test fight's step 7
(the fury ending an effect during someone else's turn) becomes a real rule
violation the engine should have warned about — which goes into the
action-economy work as its first concrete test case. Say "ruling approved"
(or overrule it) and I'll record it.

## 3. Tell me: scale it or not?

My case for yes: every rule the engine now applies traces to an exact quoted
sentence from the books; two independent AI readings of the same abilities
agreed on everything both could read; and when our own progress notes claimed
slightly more than was true, the review step caught it — that's the v1
disease, caught by machinery instead of by you finding a bug months later.
Everything not built yet sits in a list of 24 items, each with a reason.

If you say go, I run this same pipeline over the full books and build the
engine features in the order that unlocks the most content: potency checks
first, then damage, then power rolls, then the conditions' side effects.
If anything above made you trust a layer less, say which one and I'll deepen
the test there instead.

---

## Appendix: what "worked end to end" means, layer by layer

| Step | Plain result |
|---|---|
| Find the slice | Followed the books' own cross-references outward from the 9 conditions: 196 excerpts, each with a recorded reason for inclusion |
| Copy fidelity | All 196 are byte-identical to the books — checksummed, re-verified during the pilot, zero deviations |
| Categorize | AI labeling dropped (measured as irreproducible); all 3,529 pieces now inherit their category mechanically from their book chapter — deterministic, zero unmatched |
| Parse abilities | 5 real abilities parsed into engine data; every sentence the parser could NOT handle is listed, not dropped |
| Run the engine | Conditions actually apply, get saved against, expire, and end with the encounter — in a simulated 3-actor fight, with an automatic checker verifying every step's bookkeeping (zero errors) |
| Audit the fight | A separate AI read the fight log against the quoted rules and filed 14 findings — 2 real protocol gaps, 7 things we knew were missing but had described too narrowly (now fixed), 4 confirmations, and the rules question in item 3 |
