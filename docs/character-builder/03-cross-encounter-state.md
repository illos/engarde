# Cross-encounter hero state — canon cluster (Q4 docket)

> Rulebot research 2026-08-31, dispatched on the user's Q4 direction.
> Gates 1 (markdown source) + 2 (PDF page confirmation) run and ✅.
> **Gate 3: the user reviewed the findings and ruled the boundary model
> below (2026-08-31)** — the architecture question Q4 asked is settled;
> the quoted rules stand as cited evidence.
> All quotes verbatim, attributed per the Draw Steel Creator License.

## Ruled boundary (user, 2026-08-31 — DEC-0019)

> "The stats are always owned by the character sheet, and the encounter
> simply makes the modifications that are needed — granting and clearing
> where needed."

The sheet is the single owner of persistent values (**current Stamina,
Recoveries remaining, Victories**, persisting conditions/states). There
is NO encounter-end write-back: encounter events that touch sheet-owned
values (damage, Catch Breath, Victory award) apply to the sheet as they
happen. Encounter-scoped values (**heroic resource, surges, temporary
Stamina, combat conditions**) are grants into the encounter layer with a
per-grant lifetime (`encounter` | `respite` | effect-specified);
end-of-encounter clearing is expiry-by-lifetime, with the hero-conditions
sweep per-hero opt-in (p.76). Respite refills sheet-owned
Stamina/Recoveries, converts Victories to XP, and expires
respite-lifetime grants (fate points, p.81).

## a. Stamina — persists across encounters; respite refills

- The Basics §Respite (Heroes PDF p.7): "When you finish a respite, you
  regain all your Recoveries and Stamina, and your Victories convert to
  Experience."
- Combat §Stamina (p.277): "After any damage you take is reduced by
  damage immunity or other effects, your Stamina is reduced by an amount
  equal to the remaining damage. Some effects can also reduce your
  Stamina maximum, limiting the amount of Stamina you can regain."
- **Explicit gap:** no sentence states "current Stamina persists between
  encounters"; persistence is the corollary of (a) no encounter-end
  restore rule existing anywhere in Combat/Basics and (b) respite being
  the stated refill event. G3 confirms this reading.
- Stamina-maximum reductions have effect-specified durations — tracked
  per-effect, outside this entry.

## b. Recoveries — persist; respite restores all

- The Basics §Regaining Recoveries (p.7): "You regain all lost
  Recoveries when you finish a respite (see below)."
- §Spending Recoveries (p.7): "During combat encounters and similarly
  dangerous situations when time is tracked in rounds, you can use the
  Catch Breath maneuver to regain Stamina. […] Outside of combat and
  other dangerous situations, you can spend Recoveries freely."
- Combat (p.277): "When you use the Catch Breath maneuver in combat, you
  spend a Recovery and regain Stamina equal to your recovery value.
  Outside of combat, you can spend as many Recoveries as you have
  remaining."
- Recovery value = one-third Stamina maximum, rounded down (p.277) —
  derived, not stored.

## c. Conditions & lasting effects at encounter end

- Classes §Ending Effects (p.76): "Unless otherwise noted, all effects
  and conditions that are imposed on heroes during a combat encounter
  end when the encounter is over **if the hero wants them to**, except
  for being winded, unconscious, or dying. After combat, effects and
  conditions imposed on other creatures end when it's convenient for the
  heroes, allowing characters to easily bind or slip away from
  unconscious foes. However, the Director is free to decide that an
  unconscious dragon doesn't stay that way long enough to be tied up."
- §End of Encounter (p.76): "Some effects last until the end of the
  encounter. If such an effect is used outside of combat, it lasts 5
  minutes."
- Combat §Knocking Creatures Out (p.278): "If the hero has no Recoveries
  left, they can't wake up until they finish a respite."
- Engine note: the sweep is per-hero opt-in (a choice, not automatic);
  winded/unconscious/dying ride the persistent Stamina value.

## d. Heroic resources — encounter-scoped (uniform per-class rule)

- No single general rule; the Basics defers to class descriptions. The
  reset clause is verbatim-uniform across all nine classes ("You lose
  any remaining X at the end of the encounter" — wrath Classes.md:589,
  piety :1943, essence :3675, ferocity :5125, discipline :6602, insight
  :7819, focus :9037, drama :11593; Talent clarity variant :10140 adds
  negative-clarity reset). PDF-confirmed: Censor p.79, Talent p.187.
- Censor (p.79): "At the start of a combat encounter or some other
  stressful situation tracked in combat rounds (as determined by the
  Director), you gain wrath equal to your Victories. At the start of
  each of your turns during combat, you gain 2 wrath." / "You lose any
  remaining wrath at the end of the encounter."
- **Exception class:** Censor/Conduit domain feature "Oracular Visions"
  fate points are RESPITE-scoped — "You lose any remaining fate points
  when you finish a respite." (Classes.md:756/:2117; p.81). Substrate
  needs a per-resource lifetime, not a hardcoded encounter reset.

## e. Surges & temporary Stamina — lost at encounter end

- Classes §Surges (p.75): "You lose surges as you spend them. At the end
  of combat, you lose any surges you have remaining."
- Combat §Temporary Stamina (p.278): "Unless otherwise indicated,
  temporary Stamina disappears at the end of an encounter."

## f. Victories — accumulate across encounters; respite converts to XP

- The Basics §Victories (p.7): "Each time your hero survives a combat
  encounter in which the party's objectives are achieved, you earn
  1 Victory. The Director can decide that a trivially easy encounter
  doesn't earn the heroes a Victory, and can award additional Victories
  for particularly challenging encounters."
- §Victories Reset (p.7): "Whenever you finish a respite, your
  Victories are converted into Experience."
- Victories feed the next encounter's heroic-resource start (see d) —
  the third value that must survive the boundary.

Sources: `.reference/data-md/Rules/Chapters/{The Basics,Combat,Classes}.md`;
Draw_Steel_Heroes_v1.01 pp.7, 75–76, 79, 81, 187, 277–278.
