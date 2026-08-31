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

export const PRONE: GateSourceFixture = {
  artifactId: 'mcdm.heroes.v1/condition/prone',
  sourcePath: 'en/books/heroes/md/condition/prone.md',
  textSha256: '3c25874dd7c32d96ef9ee39b90c093d01eb4372cdae64ce8edc4dc032e72376e',
  text: "\nWhile a creature is [prone](scc.v1:mcdm.heroes.v1/condition/prone), they are flat on the ground, any strike they make takes a [bane](scc.v1:mcdm.heroes.v1/rule.dice/bane), and [melee](scc.v1:mcdm.heroes.v1/rule.combat/melee) abilities used against them gain an [edge](scc.v1:mcdm.heroes.v1/rule.dice/edge). A [prone](scc.v1:mcdm.heroes.v1/condition/prone) creature must [crawl](scc.v1:mcdm.heroes.v1/movement/crawl) to move along the ground, which costs 1 additional square of movement for every square crawled. A creature can't climb, [jump](scc.v1:mcdm.heroes.v1/movement/jump), swim, or [fly](scc.v1:mcdm.heroes.v1/movement/fly) while [prone](scc.v1:mcdm.heroes.v1/condition/prone). If they are climbing, [flying](scc.v1:mcdm.heroes.v1/movement/fly), or jumping when knocked [prone](scc.v1:mcdm.heroes.v1/condition/prone), they fall.\n\nUnless the ability or effect that imposed the [prone](scc.v1:mcdm.heroes.v1/condition/prone) [condition](scc.v1:mcdm.heroes.v1/rule.combat/condition) says otherwise, a [prone](scc.v1:mcdm.heroes.v1/condition/prone) creature can stand up using the [Stand Up](scc.v1:mcdm.heroes.v1/feature.common.maneuvers/stand-up) maneuver (see Maneuvers in Chapter 10: [Combat](scc.v1:mcdm.heroes.v1/chapter/combat)). A creature [adjacent](scc.v1:mcdm.heroes.v1/rule.combat/adjacent) to a willing [prone](scc.v1:mcdm.heroes.v1/condition/prone) creature can likewise use the [Stand Up](scc.v1:mcdm.heroes.v1/feature.common.maneuvers/stand-up) maneuver to make that creature stand up.\n",
};

export const RESTRAINED: GateSourceFixture = {
  artifactId: 'mcdm.heroes.v1/condition/restrained',
  sourcePath: 'en/books/heroes/md/condition/restrained.md',
  textSha256: '3ec8d1b750c5933099385b37a6e1c2be0677848a2c47793932469d6792467aad',
  text: "\nA creature who is [restrained](scc.v1:mcdm.heroes.v1/condition/restrained) has [speed](scc.v1:mcdm.heroes.v1/rule.character/speed) 0, can't use the [Stand Up](scc.v1:mcdm.heroes.v1/feature.common.maneuvers/stand-up) maneuver, and can't be [force moved](scc.v1:mcdm.heroes.v1/movement/forced-movement). A [restrained](scc.v1:mcdm.heroes.v1/condition/restrained) creature takes a [bane](scc.v1:mcdm.heroes.v1/rule.dice/bane) on [ability rolls](scc.v1:mcdm.heroes.v1/rule.dice/ability-roll) and on [Might](scc.v1:mcdm.heroes.v1/rule.character/might) and [Agility](scc.v1:mcdm.heroes.v1/rule.character/agility) [tests](scc.v1:mcdm.heroes.v1/rule.test/test), and abilities used against them gain an [edge](scc.v1:mcdm.heroes.v1/rule.dice/edge).\n\nIf a creature [teleports](scc.v1:mcdm.heroes.v1/movement/teleport) while [restrained](scc.v1:mcdm.heroes.v1/condition/restrained), that [condition](scc.v1:mcdm.heroes.v1/rule.combat/condition) ends.\n",
};

/** Every artifact a registered gate cites, by id. */
export const GATE_SOURCE_FIXTURES: readonly GateSourceFixture[] = [
  SLOWED,
  KNOCKBACK_ABILITY,
  PRONE,
  RESTRAINED,
];
