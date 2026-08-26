/**
 * VERBATIM corpus cut — do not edit by hand.
 *
 * Cut mechanically from the pinned SteelCompendium snapshot (models point,
 * code cuts): source en/books/heroes/md/feature/ability/talent/level-1/incinerate.md,
 * artifact mcdm.heroes.v1/feature.ability.talent.level-1/incinerate,
 * artifact version 5636b18f0329…. The corpus-gated canon test
 * `fixtures.corpus.test.ts` re-cuts this record from the live corpus and
 * fails on any byte drift, so this fixture can never silently diverge from
 * the books. The talent's Area ability behind the printed 15-not-18 minion
 * pool worked example ("a tier 3 outcome for the talent's Incinerate
 * ability deals 6 fire damage to each target in its area", Monsters p.8) —
 * the R-0025 golden channel [docs/minion-pool-design.md].
 */

export const INCINERATE = {
  artifactId: 'mcdm.heroes.v1/feature.ability.talent.level-1/incinerate',
  slug: 'incinerate',
  textSha256: '5636b18f0329a48da94eac55894f4be140ca30b6918098f16b2bda39ec8fe871',
  text: '\n\n*The air erupts into a column of smokeless flame.*\n\n| **Area, Fire, Psionic, Pyrokinesis, [Ranged](scc.v1:mcdm.heroes.v1/rule.combat/ranged)** |               **[Main action](scc.v1:mcdm.heroes.v1/rule.combat/turn)** |\n|----------------------------------------------|------------------------------:|\n| **📏 3 [cube](scc.v1:mcdm.heroes.v1/rule.combat/cube) within 10**                      | **🎯 Each enemy in the area** |\n\n**[Power Roll](scc.v1:mcdm.heroes.v1/rule.dice/power-roll) + [Reason](scc.v1:mcdm.heroes.v1/rule.character/reason):**\n\n- **≤11:** 2 fire damage\n- **12-16:** 4 fire damage\n- **17+:** 6 fire damage\n\n**Effect:** A column of fire remains in the area until the start of your next [turn](scc.v1:mcdm.heroes.v1/rule.combat/turn). Each enemy who enters the area for the first time in a [combat round](scc.v1:mcdm.heroes.v1/rule.combat/combat-round) or starts their turn there takes 2 fire damage.\n\n**Strained:** The size of the [cube](scc.v1:mcdm.heroes.v1/rule.combat/cube) increases by 2, but the fire disappears at the end of your [turn](scc.v1:mcdm.heroes.v1/rule.combat/turn).\n',
} as const;
