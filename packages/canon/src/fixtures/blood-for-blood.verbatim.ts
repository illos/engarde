/**
 * VERBATIM corpus cut — do not edit by hand.
 *
 * Cut mechanically from the pinned SteelCompendium snapshot (models point,
 * code cuts): source en/books/heroes/md/feature/ability/fury/level-1/blood-for-blood.md, artifact mcdm.heroes.v1/feature.ability.fury.level-1/blood-for-blood,
 * artifact version a60c10e07255…. The corpus-gated canon test
 * `fixtures.corpus.test.ts` re-cuts this record from the live corpus and
 * fails on any byte drift, so this fixture can never silently diverge from
 * the books. Exists because the backend test environment (edge-runtime)
 * cannot read the corpus from disk.
 */

export const BLOOD_FOR_BLOOD = {
  artifactId: 'mcdm.heroes.v1/feature.ability.fury.level-1/blood-for-blood',
  slug: 'blood-for-blood',
  textSha256: 'a60c10e07255408a027e936792b7dace3b8294d31f09e097ea8e02bd466fc37d',
  text: "\n\n*See how well they fight after you've bled them dry.*\n\n| **[Melee](scc.v1:mcdm.heroes.v1/rule.combat/melee), [Strike](scc.v1:mcdm.heroes.v1/rule.combat/strike), Weapon**   |               **[Main action](scc.v1:mcdm.heroes.v1/rule.combat/turn)** |\n|-----------------------------|------------------------------:|\n| **\ud83d\udccf [Melee](scc.v1:mcdm.heroes.v1/rule.combat/melee) 1**              | **\ud83c\udfaf One creature or object** |\n\n**[Power Roll](scc.v1:mcdm.heroes.v1/rule.dice/power-roll) + [Might](scc.v1:mcdm.heroes.v1/rule.character/might):**\n\n- **\u226411:** 4 + M damage; M < WEAK, [bleeding](scc.v1:mcdm.heroes.v1/condition/bleeding) and [weakened](scc.v1:mcdm.heroes.v1/condition/weakened) (save ends)\n- **12-16:** 6 + M damage; M < AVERAGE, [bleeding](scc.v1:mcdm.heroes.v1/condition/bleeding) and [weakened](scc.v1:mcdm.heroes.v1/condition/weakened) (save ends)\n- **17+:** 10 + M damage; M < STRONG, [bleeding](scc.v1:mcdm.heroes.v1/condition/bleeding) and [weakened](scc.v1:mcdm.heroes.v1/condition/weakened) (save ends)\n\n**Effect:** You can deal 1d6 damage to yourself to deal an extra 1d6 damage to the target.\n",
} as const;
