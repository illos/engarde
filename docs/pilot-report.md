# Conditions pilot — what I need from you

We test-drove the whole books-to-engine pipeline on one small slice: the nine
conditions and the 196 rulebook excerpts they depend on. It worked end to
end. Before I scale it to the full books, I need four things from you.

## 1. Check the AI's labels (~20 min)

Open **https://presidium-iv.tail41404c.ts.net:9500/**

Each card shows a rulebook excerpt with the AI's labels above it — which tier
it plays at, whether it needs engine code, and so on. I need you to look at
the cards and tell me if the labels sound right based on the rule text shown
on the card. Specifically:

- The **35 cards at the top** are ones the AI wasn't sure about. Read those.
- Then pick **any 10 other cards** at random and check them too.

Tell me which cards are wrong and what they should say. If you correct only
one or two out of your ten random ones, the cheap AI is good enough for the
full books. Lots of corrections means I use a stronger model.

## 2. Break the tie between the two AIs (~15 min)

Open **https://presidium-iv.tail41404c.ts.net:9500/compare.html**

I ran the same labeling job twice, with a cheap AI (Sonnet) and an expensive
one (Opus). They disagreed on 97 excerpts. Each card shows both answers over
the rule text, differences highlighted in yellow.

Pick about **10 cards where the "tier" row is yellow** and tell me who read
the rule right. Most of these are Sonnet saying "the player has to tell the
software what happened" where Opus says "the software can resolve this
itself" — I suspect my instructions were vague there, but your read decides
it. (You've also asked Sol to run this same job — feel free to wait for that
before answering.)

## 3. Answer one rules question

In the test fight, a character ended an effect they'd put on someone else.
The book says doing that costs a "free maneuver" — but they did it when it
**wasn't their turn**, and nothing in the rules slice we pulled says whether
free maneuvers are turn-only. Two ways to settle it:

- You rule it ("only on your own turn" or "any time"), or
- I run a search of the full books for a timing rule outside our slice.

Which do you want?

## 4. Tell me: scale it or not?

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
| Label them | Both AIs labeled all 196 with none skipped; disagreements are your item 2 |
| Parse abilities | 5 real abilities parsed into engine data; every sentence the parser could NOT handle is listed, not dropped |
| Run the engine | Conditions actually apply, get saved against, expire, and end with the encounter — in a simulated 3-actor fight, with an automatic checker verifying every step's bookkeeping (zero errors) |
| Audit the fight | A separate AI read the fight log against the quoted rules and filed 14 findings — 2 real protocol gaps, 7 things we knew were missing but had described too narrowly (now fixed), 4 confirmations, and the rules question in item 3 |
