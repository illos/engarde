/**
 * VERBATIM corpus cut — do not edit by hand.
 *
 * The 17 printed common actions (`feature.common.main-actions` /
 * `.maneuvers` / `.move-actions`), cut mechanically from the pinned
 * SteelCompendium snapshot (models point, code cuts). These are the
 * headerless PROSE features the common-action program source compiles;
 * committing them lets the compiler's tests run without a corpus checkout,
 * exactly as the statblock fixtures do.
 *
 * The corpus-gated drift guard `common-actions.corpus.test.ts` re-cuts every
 * one of them from the live corpus and fails on any byte drift, so these
 * can never silently diverge from the books.
 */

export interface CommonActionFixture {
  readonly slug: string;
  readonly group: 'main-actions' | 'maneuvers' | 'move-actions';
  readonly artifactId: string;
  readonly textSha256: string;
  readonly text: string;
}

export const CHARGE: CommonActionFixture = {
  slug: 'charge',
  group: 'main-actions',
  artifactId: 'mcdm.heroes.v1/feature.common.main-actions/charge',
  textSha256: '93f9040566497bad62024cb14521662c1a1ae76754a2a847c5754400def9044f',
  text: "\nWhen a creature takes the [Charge](scc.v1:mcdm.heroes.v1/feature.common.main-actions/charge) main action, they move up to their [speed](scc.v1:mcdm.heroes.v1/rule.character/speed) in a straight line, then make a [melee](scc.v1:mcdm.heroes.v1/rule.combat/melee) [free strike](scc.v1:mcdm.heroes.v1/feature.common.main-actions/free-strike) (see [Free Strikes](scc.v1:mcdm.heroes.v1/feature.common.main-actions/free-strike) below) against a target when they end their move. If the creature has an ability with the Charge keyword, they can use that ability against the target instead of a [free strike](scc.v1:mcdm.heroes.v1/feature.common.main-actions/free-strike).\n\nA creature can't move through [difficult terrain](scc.v1:mcdm.heroes.v1/movement/difficult-terrain) or [shift](scc.v1:mcdm.heroes.v1/movement/shifting) when they charge. They can [fly](scc.v1:mcdm.heroes.v1/movement/fly) or [burrow](scc.v1:mcdm.heroes.v1/movement/burrow) as part of the [Charge](scc.v1:mcdm.heroes.v1/feature.common.main-actions/charge) main action if they have that movement available to them, but they can't climb or swim while charging unless they can automatically use that movement at full [speed](scc.v1:mcdm.heroes.v1/rule.character/speed).\n",
};

export const DEFEND: CommonActionFixture = {
  slug: 'defend',
  group: 'main-actions',
  artifactId: 'mcdm.heroes.v1/feature.common.main-actions/defend',
  textSha256: '5c0441e96e1a3f968ee564b58fccc593b7ff88f94d4d543dfaef410fe8f6be5d',
  text: "\nWhen a creature takes the [Defend](scc.v1:mcdm.heroes.v1/feature.common.main-actions/defend) main action, [ability rolls](scc.v1:mcdm.heroes.v1/rule.dice/ability-roll) made against them have a double [bane](scc.v1:mcdm.heroes.v1/rule.dice/bane) until the start of their next [turn](scc.v1:mcdm.heroes.v1/rule.combat/turn). Additionally, you have a double [edge](scc.v1:mcdm.heroes.v1/rule.dice/edge) on [tests](scc.v1:mcdm.heroes.v1/rule.test/test) when called for to resist environmental effects or a creature's traits or abilities. A creature gains no benefit from this action while another creature is [taunted](scc.v1:mcdm.heroes.v1/condition/taunted) by them (see [Conditions](scc.v1:mcdm.heroes.v1/rule.combat/condition) in Chapter 5: [Classes](scc.v1:mcdm.heroes.v1/chapter/classes)).\n",
};

export const FREE_STRIKE: CommonActionFixture = {
  slug: 'free-strike',
  group: 'main-actions',
  artifactId: 'mcdm.heroes.v1/feature.common.main-actions/free-strike',
  textSha256: '232cff4b19a9ccf6a71a2dff5dc2dcbd6dc6ad0e206e4caf8519a81219378c59',
  text: "\nA creature can use this main action to make a [free strike](scc.v1:mcdm.heroes.v1/feature.common.main-actions/free-strike) (see Free  Strikes below). Most of the time, you'll want to use the more impactful main actions granted by your class, kit, or other feature, just as the Director will use the main actions in a creature's stat block, but [free strikes](scc.v1:mcdm.heroes.v1/feature.common.main-actions/free-strike) are available for when all else fails. For instance, a [fury](scc.v1:mcdm.heroes.v1/class/fury) who has no other options for [ranged](scc.v1:mcdm.heroes.v1/rule.combat/ranged) [strikes](scc.v1:mcdm.heroes.v1/rule.combat/strike) might use the [Ranged Weapon Free Strike](scc.v1:mcdm.heroes.v1/feature.ability.common/ranged-weapon-free-strike) ability with an improvised weapon when battling a [flying](scc.v1:mcdm.heroes.v1/movement/fly) foe.\n",
};

export const HEAL: CommonActionFixture = {
  slug: 'heal',
  group: 'main-actions',
  artifactId: 'mcdm.heroes.v1/feature.common.main-actions/heal',
  textSha256: 'd334a1cd950cbd8d0c50ba8f3fbbcda3246ec2da1f0cb970f08520cf2172c920',
  text: '\nA creature who uses the [Heal](scc.v1:mcdm.heroes.v1/feature.common.main-actions/heal) main action employs medicine or inspiring words to make an [adjacent](scc.v1:mcdm.heroes.v1/rule.combat/adjacent) creature feel better and stay in the fight. The target creature can spend a [Recovery](scc.v1:mcdm.heroes.v1/rule.health/recoveries) to regain [Stamina](scc.v1:mcdm.heroes.v1/rule.health/stamina), or can make a [saving throw](scc.v1:mcdm.heroes.v1/rule.general/saving-throw) against one effect they are suffering that is ended by a [saving throw](scc.v1:mcdm.heroes.v1/rule.general/saving-throw).\n',
};

export const AID_ATTACK: CommonActionFixture = {
  slug: 'aid-attack',
  group: 'maneuvers',
  artifactId: 'mcdm.heroes.v1/feature.common.maneuvers/aid-attack',
  textSha256: 'b5ed6d429c9aa43be7f221b9b21fe2c683359d4a791570763780036304591e35',
  text: "\nA creature who uses the [Aid Attack](scc.v1:mcdm.heroes.v1/feature.common.maneuvers/aid-attack) maneuver chooses an enemy [adjacent](scc.v1:mcdm.heroes.v1/rule.combat/adjacent) to them. The next [ability roll](scc.v1:mcdm.heroes.v1/rule.dice/ability-roll) an ally makes against that enemy before the start of the aiding creature's next [turn](scc.v1:mcdm.heroes.v1/rule.combat/turn) gains an [edge](scc.v1:mcdm.heroes.v1/rule.dice/edge).\n",
};

export const CATCH_BREATH: CommonActionFixture = {
  slug: 'catch-breath',
  group: 'maneuvers',
  artifactId: 'mcdm.heroes.v1/feature.common.maneuvers/catch-breath',
  textSha256: 'ae406cda384311b5a9b8a10271a65d33c1e1271c2009e70715b1e703cece6907',
  text: "\nA creature who uses the [Catch Breath](scc.v1:mcdm.heroes.v1/feature.common.maneuvers/catch-breath) maneuver spends a [Recovery](scc.v1:mcdm.heroes.v1/rule.health/recoveries) and regains [Stamina](scc.v1:mcdm.heroes.v1/rule.health/stamina) equal to their [recovery value](scc.v1:mcdm.heroes.v1/rule.health/recoveries). (See below for [Stamina](scc.v1:mcdm.heroes.v1/rule.health/stamina). See [Recoveries](scc.v1:mcdm.heroes.v1/rule.health/recoveries) in Chapter 1: [The Basics](scc.v1:mcdm.heroes.v1/chapter/the-basics).)\n\nA creature who is [dying](scc.v1:mcdm.heroes.v1/rule.health/dying) (see [Dying](scc.v1:mcdm.heroes.v1/rule.health/dying) and Death in [Stamina](scc.v1:mcdm.heroes.v1/rule.health/stamina) below) can't use the [Catch Breath](scc.v1:mcdm.heroes.v1/feature.common.maneuvers/catch-breath) maneuver, but other creatures can help them spend [Recoveries](scc.v1:mcdm.heroes.v1/rule.health/recoveries) in other ways.\n",
};

export const ESCAPE_GRAB: CommonActionFixture = {
  slug: 'escape-grab',
  group: 'maneuvers',
  artifactId: 'mcdm.heroes.v1/feature.common.maneuvers/escape-grab',
  textSha256: '0e1ed82572cbe01fb3a19983674a443c4c1db65bf9f2c0844b80bf09bb431294',
  text: '\nA creature who is [grabbed](scc.v1:mcdm.heroes.v1/condition/grabbed) by another creature, an object, or an effect (see [Grab](scc.v1:mcdm.heroes.v1/feature.common.maneuvers/grab) below) can attempt to escape by using the following ability.\n',
};

export const GRAB: CommonActionFixture = {
  slug: 'grab',
  group: 'maneuvers',
  artifactId: 'mcdm.heroes.v1/feature.common.maneuvers/grab',
  textSha256: '6ec9b029b875e5119fd6384d3e148b8a6b4764ebdbb160498cd97fe326738a09',
  text: '\nA creature seeking to keep a foe close and locked down can attempt to grab a creature using the following ability.\n',
};

export const HIDE: CommonActionFixture = {
  slug: 'hide',
  group: 'maneuvers',
  artifactId: 'mcdm.heroes.v1/feature.common.maneuvers/hide',
  textSha256: '6db1251ddec20747a44949caa296e7f00b52d2be3f7370aced5ab5a057ba1aff',
  text: "\nUsing the [Hide](scc.v1:mcdm.heroes.v1/feature.common.maneuvers/hide) maneuver, a creature attempts to hide from other creatures who aren't observing them while they have [cover](scc.v1:mcdm.heroes.v1/rule.combat/cover) or [concealment](scc.v1:mcdm.heroes.v1/rule.combat/concealment). See Hide and Sneak in Chapter 9: [Tests](scc.v1:mcdm.heroes.v1/chapter/tests) for full details.\n",
};

export const KNOCKBACK: CommonActionFixture = {
  slug: 'knockback',
  group: 'maneuvers',
  artifactId: 'mcdm.heroes.v1/feature.common.maneuvers/knockback',
  textSha256: 'ebb46fda0918552b0b1c03b98ba6513cdd0dda40448b146cd824ae1f55a8b3d9',
  text: '\nA creature wanting to [push](scc.v1:mcdm.heroes.v1/movement/forced-movement) an [adjacent](scc.v1:mcdm.heroes.v1/rule.combat/adjacent) creature away from them can attempt to shove that creature using the following ability.\n',
};

export const MAKE_OR_ASSIST_A_TEST: CommonActionFixture = {
  slug: 'make-or-assist-a-test',
  group: 'maneuvers',
  artifactId: 'mcdm.heroes.v1/feature.common.maneuvers/make-or-assist-a-test',
  textSha256: 'b34846c2968a422031e60bc0095ca94ac220571146cb9f1cfa3c25cac0a29683',
  text: "\nMany [tests](scc.v1:mcdm.heroes.v1/rule.test/test) are maneuvers if made in combat. Searching a chest with a [Reason](scc.v1:mcdm.heroes.v1/rule.character/reason) [test](scc.v1:mcdm.heroes.v1/rule.test/test), picking a door's lock with an [Agility](scc.v1:mcdm.heroes.v1/rule.character/agility) [test](scc.v1:mcdm.heroes.v1/rule.test/test), or lifting a portcullis with a [Might](scc.v1:mcdm.heroes.v1/rule.character/might) [test](scc.v1:mcdm.heroes.v1/rule.test/test) would all be maneuvers. Assisting a [test](scc.v1:mcdm.heroes.v1/rule.test/test) is also a maneuver in combat (see Assist a [Test](scc.v1:mcdm.heroes.v1/rule.test/test) in Chapter 9: [Tests](scc.v1:mcdm.heroes.v1/chapter/tests)).\n\nComplex or time-consuming [tests](scc.v1:mcdm.heroes.v1/rule.test/test) might require a main action if made in combat—or could take so long that they can't be made during combat at all. Other [tests](scc.v1:mcdm.heroes.v1/rule.test/test) that take no time at all, such as a [Reason](scc.v1:mcdm.heroes.v1/rule.character/reason) [test](scc.v1:mcdm.heroes.v1/rule.test/test) to recall lore about mummies, are usually [free maneuvers](scc.v1:mcdm.heroes.v1/rule.combat/free-maneuver) in combat. The Director has the final say regarding which [tests](scc.v1:mcdm.heroes.v1/rule.test/test) can be made as maneuvers.\n",
};

export const SEARCH_FOR_HIDDEN_CREATURES: CommonActionFixture = {
  slug: 'search-for-hidden-creatures',
  group: 'maneuvers',
  artifactId: 'mcdm.heroes.v1/feature.common.maneuvers/search-for-hidden-creatures',
  textSha256: 'bec23d5fa5df332873257c9e8361dc36041698b2b00e9bb5bff370baf7f84d2f',
  text: '\nThe [Search for Hidden Creatures](scc.v1:mcdm.heroes.v1/feature.common.maneuvers/search-for-hidden-creatures) maneuver allows a creature to attempt to locate creatures hidden from them (see Hide and Sneak in Chapter 9: [Tests](scc.v1:mcdm.heroes.v1/chapter/tests)).\n',
};

export const STAND_UP: CommonActionFixture = {
  slug: 'stand-up',
  group: 'maneuvers',
  artifactId: 'mcdm.heroes.v1/feature.common.maneuvers/stand-up',
  textSha256: 'a803411006b4d7a25911b2ab682f305b161bac3bfa2fb313c400b9b2fbc79f90',
  text: '\nA creature can use the [Stand Up](scc.v1:mcdm.heroes.v1/feature.common.maneuvers/stand-up) maneuver to stand up if they [are prone](scc.v1:mcdm.heroes.v1/condition/prone), ending that [condition](scc.v1:mcdm.heroes.v1/rule.combat/condition). Alternatively, they can use this maneuver to make a willing [adjacent](scc.v1:mcdm.heroes.v1/rule.combat/adjacent) prone creature stand up.\n',
};

export const USE_CONSUMABLE: CommonActionFixture = {
  slug: 'use-consumable',
  group: 'maneuvers',
  artifactId: 'mcdm.heroes.v1/feature.common.maneuvers/use-consumable',
  textSha256: '9720a1ecff738a8047f60232afa6eb47c8641047b37c581301d823d09cd5d138',
  text: '\nUnless otherwise noted in its description, a creature can activate a [consumable](scc.v1:mcdm.heroes.v1/rule.treasure/consumable) treasure such as a potion with the [Use Consumable](scc.v1:mcdm.heroes.v1/feature.common.maneuvers/use-consumable) maneuver. A creature can use this maneuver to administer a [consumable](scc.v1:mcdm.heroes.v1/rule.treasure/consumable) treasure that benefits the user either to themself or to a willing [adjacent](scc.v1:mcdm.heroes.v1/rule.combat/adjacent) creature. See [Consumables](scc.v1:mcdm.heroes.v1/rule.treasure/consumable) in Chapter 13: [Rewards](scc.v1:mcdm.heroes.v1/chapter/rewards).\n',
};

export const ADVANCE: CommonActionFixture = {
  slug: 'advance',
  group: 'move-actions',
  artifactId: 'mcdm.heroes.v1/feature.common.move-actions/advance',
  textSha256: '1e9a1fe08212b12f93c917c617f9f859645ab0e3b44665bc03924ff7e6432d8e',
  text: '\nWhen a creature takes the [Advance](scc.v1:mcdm.heroes.v1/feature.common.move-actions/advance) move action, they move a number of squares up to their [speed](scc.v1:mcdm.heroes.v1/rule.character/speed). They can break up this movement with their maneuver and main action however they wish.\n',
};

export const DISENGAGE: CommonActionFixture = {
  slug: 'disengage',
  group: 'move-actions',
  artifactId: 'mcdm.heroes.v1/feature.common.move-actions/disengage',
  textSha256: '2f25f500fee6c995e9c1810daaecc2e15b85860651e0b77d856ec1521987ec00',
  text: '\nWhen a creature takes the [Disengage](scc.v1:mcdm.heroes.v1/feature.common.move-actions/disengage) move action, they can [shift](scc.v1:mcdm.heroes.v1/movement/shifting) 1 square. Certain class features, kits, and other rules allow a creature to [shift](scc.v1:mcdm.heroes.v1/movement/shifting) more than 1 square when they disengage. A creature who does so can break up their [shift](scc.v1:mcdm.heroes.v1/movement/shifting) with their maneuver and main action however they wish.\n',
};

export const RIDE: CommonActionFixture = {
  slug: 'ride',
  group: 'move-actions',
  artifactId: 'mcdm.heroes.v1/feature.common.move-actions/ride',
  textSha256: 'e87a6887976003de89d45cb06fcf167d309af4840ec907f04d763b70956729cd',
  text: "\nA creature can take the [Ride](scc.v1:mcdm.heroes.v1/feature.common.move-actions/ride) move action only while mounted on another creature (see [Mounted Combat](scc.v1:mcdm.heroes.v1/rule.combat/mounted-combat) below). When a creature takes the [Ride](scc.v1:mcdm.heroes.v1/feature.common.move-actions/ride) move action, they cause their mount to move up to the mount's [speed](scc.v1:mcdm.heroes.v1/rule.character/speed), taking the rider with them. Alternatively, a creature can use the [Ride](scc.v1:mcdm.heroes.v1/feature.common.move-actions/ride) move action to have their mount use the [Disengage](scc.v1:mcdm.heroes.v1/feature.common.move-actions/disengage) move action as a free [triggered action](scc.v1:mcdm.heroes.v1/rule.combat/triggered-action). A creature can use the [Ride](scc.v1:mcdm.heroes.v1/feature.common.move-actions/ride) move action only once per round. A mounted creature can only have this move action applied to them once per round. This movement can be broken up with the rider's maneuver and main action however they wish.\n",
};

/** All 17, in book order within each printed group. */
export const COMMON_ACTION_FIXTURES: readonly CommonActionFixture[] = [
  CHARGE,
  DEFEND,
  FREE_STRIKE,
  HEAL,
  AID_ATTACK,
  CATCH_BREATH,
  ESCAPE_GRAB,
  GRAB,
  HIDE,
  KNOCKBACK,
  MAKE_OR_ASSIST_A_TEST,
  SEARCH_FOR_HIDDEN_CREATURES,
  STAND_UP,
  USE_CONSUMABLE,
  ADVANCE,
  DISENGAGE,
  RIDE,
];
