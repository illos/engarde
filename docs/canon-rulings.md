# Canon rulings — Gate-3-approved answers to rules ambiguities

Each entry: a question the corpus underdetermined, researched with verbatim
evidence (markdown + print PDF), ruled on by the user. Engine mechanisms cite
these entries when they encode the ruled behavior.

## R-0001 — Free maneuvers are turn-only (approved 2026-08-23)

**Question:** May a free maneuver be used outside the acting creature's own
turn? Motivating case: the Ending Effects rule ("A creature who imposes an
effect on another creature using an ability can end that effect as a free
maneuver unless the ability says otherwise" — Classes, book p.76).

**Ruling: turn-only.** Evidence (verbatim, markdown + PDF confirmed):

- Glossary, Heroes p.13 (pointer to p.267): "Free Maneuver: A maneuver that
  doesn't count against the one maneuver per turn a creature can take. A
  free maneuver can only be used by a creature on their turn."
- Body rule, Combat book p.267: "you can undertake such straightforward
  activities as free maneuvers on your turn."
- Off-turn activity is a separate category (same page): "When it isn't your
  turn, you can typically undertake even simpler activities requiring no
  action with the Director's approval."
- Design-pattern corroboration: eight abilities grant anytime ending via
  explicit "(no action required)" text (tactician Mark, censor Judgment and
  Faithful Friend, null Null Field, talent Strained, fury To Stone, conduit
  Blessing of Secrets, shadow I'm No Threat) — the "unless the ability says
  otherwise" escape hatch, which would be pointless if free maneuvers
  already worked off-turn.

**Gate 3:** the explicit "only" sentence appears in the glossary alone; the
body rule implies it. User reviewed and approved relying on it, 2026-08-23.

**Engine consequence:** an imposer ending an ability effect off-turn without
an ability-text override is a rule violation → warn-and-apply (permissive
engine). First concrete test case: the pilot mini-encounter's step 7. Lands
with the action-economy mechanism.

**Open per-ability edges (not blockers, queued):** Harlequin Gambit, Trail
of Cinders, Bait and Ambush, Shake It Off grant free maneuvers in
trigger-adjacent contexts where off-turn use is conceivable and the books
are silent; resolve individually when those abilities are implemented.
