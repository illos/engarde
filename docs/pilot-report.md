# Conditions pilot — what I need from you

We test-drove the whole books-to-engine pipeline on one small slice: the nine
conditions and the 196 rulebook excerpts they depend on. It worked end to
end. Before I scale it to the full books, One decision left (two others settled below).

## Settled since the last version

- **Categories:** AI labeling is dropped (you called it — measured as
  irreproducible). Every piece now inherits its category mechanically from
  its chapter in the books; all 3,529 attributed, zero unmatched, identical
  on every re-run. You waived the map review — it has no engine-blocking
  importance and any bucket can be fixed in one line later.
- **Free maneuvers are turn-only:** researched across both books + the print
  PDF, signed off by you 2026-08-23, recorded as ruling R-0001
  (`docs/canon-rulings.md`). One consequence: the test fight's step 7 is now
  a known rule violation the engine should warn about — it becomes the first
  test case for the action-economy work.

## The one remaining decision: scale it or not?

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
