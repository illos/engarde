/**
 * VERBATIM corpus cut — do not edit by hand.
 *
 * The artifacts a common-action ELIGIBILITY GATE quotes when the printed
 * precondition lives somewhere other than the action's own prose. A gate
 * must be allowed to cite a rule that never names the action — `slowed`
 * prints its bar on shifting and never mentions Disengage; the Knockback
 * size sentence is printed on the companion ability, not on the prose
 * feature — so the registry carries a `sourceArtifactId` and its quotes are
 * proved against THESE bytes.
 *
 * Cut mechanically from the pinned SteelCompendium snapshot (models point,
 * code cuts). The corpus-gated drift guard
 * `common-actions.corpus.test.ts` re-cuts every one from the live corpus
 * and fails on any byte drift.
 */

export interface GateSourceFixture {
  readonly artifactId: string;
  readonly sourcePath: string;
  readonly textSha256: string;
  readonly text: string;
}

export const SLOWED: GateSourceFixture = {
  artifactId: 'mcdm.heroes.v1/condition/slowed',
  sourcePath: 'en/books/heroes/md/condition/slowed.md',
  textSha256: '86007a56b7ca9c3b13e45d03ba8de52ac3c37d59bde7b9f7ae891cfc7812957c',
  text: "\nA creature who is [slowed](scc.v1:mcdm.heroes.v1/condition/slowed) has [speed](scc.v1:mcdm.heroes.v1/rule.character/speed) 2 unless their [speed](scc.v1:mcdm.heroes.v1/rule.character/speed) is already lower, and they can't [shift](scc.v1:mcdm.heroes.v1/movement/shifting).\n",
};

export const KNOCKBACK_ABILITY: GateSourceFixture = {
  artifactId: 'mcdm.heroes.v1/feature.ability.common/knockback',
  sourcePath: 'en/books/heroes/md/feature/ability/common/knockback.md',
  textSha256: 'a80d74b780468e67faf1f6a906a413b747928a832ecbb1a72bf8c7b0a8c0c508',
  text: '\n\n| **[Melee](scc.v1:mcdm.heroes.v1/rule.combat/melee), Weapon** |        **[Maneuver](scc.v1:mcdm.heroes.v1/rule.combat/turn)** |\n|-------------------|--------------------:|\n| **📏 [Melee](scc.v1:mcdm.heroes.v1/rule.combat/melee) 1**    | **🎯 One creature** |\n\n**[Power Roll](scc.v1:mcdm.heroes.v1/rule.dice/power-roll) + [Might](scc.v1:mcdm.heroes.v1/rule.character/might):**\n\n- **≤11:** [Push](scc.v1:mcdm.heroes.v1/movement/forced-movement) 1\n- **12-16:** [Push](scc.v1:mcdm.heroes.v1/movement/forced-movement) 2\n- **17+:** [Push](scc.v1:mcdm.heroes.v1/movement/forced-movement) 3\n\n**Effect:** You can usually target only creatures of your [size](scc.v1:mcdm.heroes.v1/rule.character/size) or smaller. If your [Might](scc.v1:mcdm.heroes.v1/rule.character/might) score is 2 or higher, you can target any creature with a [size](scc.v1:mcdm.heroes.v1/rule.character/size) equal to or less than your [Might](scc.v1:mcdm.heroes.v1/rule.character/might) score.\n',
};

/** Every artifact a registered gate cites, by id. */
export const GATE_SOURCE_FIXTURES: readonly GateSourceFixture[] = [SLOWED, KNOCKBACK_ABILITY];
