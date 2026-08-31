/**
 * VERBATIM compiled common-action programs, for engine tests.
 *
 * These are the CANON COMPILER'S OUTPUT for the pinned artifacts, emitted
 * mechanically from `packages/canon/src/fixtures/common-actions.verbatim.ts`
 * and inlined here because the engine package cannot import canon (canon
 * depends on the engine). They are shared by every engine test that
 * dispatches a common action, so the verbatim prose has ONE home on this
 * side of the dependency edge. Deliberately not exported from the package
 * index: canon owns the bytes, and hosts compile their own.
 *
 * The canon-side compiler tests and the corpus drift guard are what keep
 * these honest.
 */

import type { CommonActionProgramData } from './schemas.js';

export const ADVANCE: CommonActionProgramData = {
  featureArtifactId: 'mcdm.heroes.v1/feature.common.move-actions/advance',
  provenance: 'prose-feature',
  group: 'move-actions',
  sourceSpan: {
    byteStart: 0,
    byteEnd: 291,
  },
  sourceText:
    '\nWhen a creature takes the [Advance](scc.v1:mcdm.heroes.v1/feature.common.move-actions/advance) move action, they move a number of squares up to their [speed](scc.v1:mcdm.heroes.v1/rule.character/speed). They can break up this movement with their maneuver and main action however they wish.\n',
  canonRefs: [
    'mcdm.heroes.v1/feature.common.move-actions/advance',
    'mcdm.heroes.v1/rule.character/speed',
  ],
  defaultActionCost: 'move-action',
  perRoundCaps: [],
  alternatives: [],
  debitContract: 'self',
  companionArtifactIds: [],
  movesActor: true,
  composition: null,
  resolution: {
    kind: 'table',
  },
};

export const RIDE: CommonActionProgramData = {
  featureArtifactId: 'mcdm.heroes.v1/feature.common.move-actions/ride',
  provenance: 'prose-feature',
  group: 'move-actions',
  sourceSpan: {
    byteStart: 0,
    byteEnd: 1052,
  },
  sourceText:
    "\nA creature can take the [Ride](scc.v1:mcdm.heroes.v1/feature.common.move-actions/ride) move action only while mounted on another creature (see [Mounted Combat](scc.v1:mcdm.heroes.v1/rule.combat/mounted-combat) below). When a creature takes the [Ride](scc.v1:mcdm.heroes.v1/feature.common.move-actions/ride) move action, they cause their mount to move up to the mount's [speed](scc.v1:mcdm.heroes.v1/rule.character/speed), taking the rider with them. Alternatively, a creature can use the [Ride](scc.v1:mcdm.heroes.v1/feature.common.move-actions/ride) move action to have their mount use the [Disengage](scc.v1:mcdm.heroes.v1/feature.common.move-actions/disengage) move action as a free [triggered action](scc.v1:mcdm.heroes.v1/rule.combat/triggered-action). A creature can use the [Ride](scc.v1:mcdm.heroes.v1/feature.common.move-actions/ride) move action only once per round. A mounted creature can only have this move action applied to them once per round. This movement can be broken up with the rider's maneuver and main action however they wish.\n",
  canonRefs: [
    'mcdm.heroes.v1/feature.common.move-actions/ride',
    'mcdm.heroes.v1/rule.combat/mounted-combat',
    'mcdm.heroes.v1/rule.character/speed',
    'mcdm.heroes.v1/feature.common.move-actions/disengage',
    'mcdm.heroes.v1/rule.combat/triggered-action',
  ],
  defaultActionCost: 'move-action',
  perRoundCaps: [
    {
      subject: 'actor',
      uses: 1,
      sourceText: 'A creature can use the Ride move action only once per round.',
    },
    {
      subject: 'target',
      uses: 1,
      sourceText:
        'A mounted creature can only have this move action applied to them once per round.',
    },
  ],
  alternatives: [
    {
      key: 'mount-disengages',
      sourceText:
        'Alternatively, a creature can use the Ride move action to have their mount use the Disengage move action as a free triggered action.',
      targetAction: {
        artifactId: 'mcdm.heroes.v1/feature.common.move-actions/disengage',
        actionCost: 'free-triggered-action',
      },
    },
  ],
  debitContract: 'self',
  companionArtifactIds: [],
  movesActor: true,
  composition: null,
  resolution: {
    kind: 'table',
  },
};

export const DISENGAGE: CommonActionProgramData = {
  featureArtifactId: 'mcdm.heroes.v1/feature.common.move-actions/disengage',
  provenance: 'prose-feature',
  group: 'move-actions',
  sourceSpan: {
    byteStart: 0,
    byteEnd: 482,
  },
  sourceText:
    '\nWhen a creature takes the [Disengage](scc.v1:mcdm.heroes.v1/feature.common.move-actions/disengage) move action, they can [shift](scc.v1:mcdm.heroes.v1/movement/shifting) 1 square. Certain class features, kits, and other rules allow a creature to [shift](scc.v1:mcdm.heroes.v1/movement/shifting) more than 1 square when they disengage. A creature who does so can break up their [shift](scc.v1:mcdm.heroes.v1/movement/shifting) with their maneuver and main action however they wish.\n',
  canonRefs: [
    'mcdm.heroes.v1/feature.common.move-actions/disengage',
    'mcdm.heroes.v1/movement/shifting',
  ],
  defaultActionCost: 'move-action',
  perRoundCaps: [],
  alternatives: [],
  debitContract: 'self',
  companionArtifactIds: [],
  movesActor: true,
  composition: null,
  resolution: {
    kind: 'table',
  },
};

export const CHARGE: CommonActionProgramData = {
  featureArtifactId: 'mcdm.heroes.v1/feature.common.main-actions/charge',
  provenance: 'prose-feature',
  group: 'main-actions',
  sourceSpan: {
    byteStart: 0,
    byteEnd: 1230,
  },
  sourceText:
    "\nWhen a creature takes the [Charge](scc.v1:mcdm.heroes.v1/feature.common.main-actions/charge) main action, they move up to their [speed](scc.v1:mcdm.heroes.v1/rule.character/speed) in a straight line, then make a [melee](scc.v1:mcdm.heroes.v1/rule.combat/melee) [free strike](scc.v1:mcdm.heroes.v1/feature.common.main-actions/free-strike) (see [Free Strikes](scc.v1:mcdm.heroes.v1/feature.common.main-actions/free-strike) below) against a target when they end their move. If the creature has an ability with the Charge keyword, they can use that ability against the target instead of a [free strike](scc.v1:mcdm.heroes.v1/feature.common.main-actions/free-strike).\n\nA creature can't move through [difficult terrain](scc.v1:mcdm.heroes.v1/movement/difficult-terrain) or [shift](scc.v1:mcdm.heroes.v1/movement/shifting) when they charge. They can [fly](scc.v1:mcdm.heroes.v1/movement/fly) or [burrow](scc.v1:mcdm.heroes.v1/movement/burrow) as part of the [Charge](scc.v1:mcdm.heroes.v1/feature.common.main-actions/charge) main action if they have that movement available to them, but they can't climb or swim while charging unless they can automatically use that movement at full [speed](scc.v1:mcdm.heroes.v1/rule.character/speed).\n",
  canonRefs: [
    'mcdm.heroes.v1/feature.common.main-actions/charge',
    'mcdm.heroes.v1/rule.character/speed',
    'mcdm.heroes.v1/rule.combat/melee',
    'mcdm.heroes.v1/feature.common.main-actions/free-strike',
    'mcdm.heroes.v1/movement/difficult-terrain',
    'mcdm.heroes.v1/movement/shifting',
    'mcdm.heroes.v1/movement/fly',
    'mcdm.heroes.v1/movement/burrow',
  ],
  defaultActionCost: 'main-action',
  perRoundCaps: [],
  alternatives: [],
  debitContract: 'self',
  companionArtifactIds: [],
  movesActor: true,
  composition: {
    namedArtifactId: 'mcdm.heroes.v1/feature.ability.common/melee-weapon-free-strike',
    namedPhrase: 'make a melee free strike',
    substitute: {
      keyword: 'Charge',
      sourceText:
        'If the creature has an ability with the Charge keyword, they can use that ability against the target instead of a free strike.',
    },
  },
  resolution: {
    kind: 'table',
  },
};

export const FREE_STRIKE: CommonActionProgramData = {
  featureArtifactId: 'mcdm.heroes.v1/feature.common.main-actions/free-strike',
  provenance: 'prose-feature',
  group: 'main-actions',
  sourceSpan: {
    byteStart: 0,
    byteEnd: 865,
  },
  sourceText:
    "\nA creature can use this main action to make a [free strike](scc.v1:mcdm.heroes.v1/feature.common.main-actions/free-strike) (see Free  Strikes below). Most of the time, you'll want to use the more impactful main actions granted by your class, kit, or other feature, just as the Director will use the main actions in a creature's stat block, but [free strikes](scc.v1:mcdm.heroes.v1/feature.common.main-actions/free-strike) are available for when all else fails. For instance, a [fury](scc.v1:mcdm.heroes.v1/class/fury) who has no other options for [ranged](scc.v1:mcdm.heroes.v1/rule.combat/ranged) [strikes](scc.v1:mcdm.heroes.v1/rule.combat/strike) might use the [Ranged Weapon Free Strike](scc.v1:mcdm.heroes.v1/feature.ability.common/ranged-weapon-free-strike) ability with an improvised weapon when battling a [flying](scc.v1:mcdm.heroes.v1/movement/fly) foe.\n",
  canonRefs: [
    'mcdm.heroes.v1/feature.common.main-actions/free-strike',
    'mcdm.heroes.v1/class/fury',
    'mcdm.heroes.v1/rule.combat/ranged',
    'mcdm.heroes.v1/rule.combat/strike',
    'mcdm.heroes.v1/feature.ability.common/ranged-weapon-free-strike',
    'mcdm.heroes.v1/movement/fly',
  ],
  defaultActionCost: 'main-action',
  perRoundCaps: [],
  alternatives: [],
  debitContract: 'companion',
  companionArtifactIds: [
    'mcdm.heroes.v1/feature.ability.common/melee-weapon-free-strike',
    'mcdm.heroes.v1/feature.ability.common/ranged-weapon-free-strike',
  ],
  movesActor: false,
  composition: null,
  resolution: {
    kind: 'table',
  },
};

export const CATCH_BREATH: CommonActionProgramData = {
  featureArtifactId: 'mcdm.heroes.v1/feature.common.maneuvers/catch-breath',
  provenance: 'prose-feature',
  group: 'maneuvers',
  sourceSpan: {
    byteStart: 0,
    byteEnd: 932,
  },
  sourceText:
    "\nA creature who uses the [Catch Breath](scc.v1:mcdm.heroes.v1/feature.common.maneuvers/catch-breath) maneuver spends a [Recovery](scc.v1:mcdm.heroes.v1/rule.health/recoveries) and regains [Stamina](scc.v1:mcdm.heroes.v1/rule.health/stamina) equal to their [recovery value](scc.v1:mcdm.heroes.v1/rule.health/recoveries). (See below for [Stamina](scc.v1:mcdm.heroes.v1/rule.health/stamina). See [Recoveries](scc.v1:mcdm.heroes.v1/rule.health/recoveries) in Chapter 1: [The Basics](scc.v1:mcdm.heroes.v1/chapter/the-basics).)\n\nA creature who is [dying](scc.v1:mcdm.heroes.v1/rule.health/dying) (see [Dying](scc.v1:mcdm.heroes.v1/rule.health/dying) and Death in [Stamina](scc.v1:mcdm.heroes.v1/rule.health/stamina) below) can't use the [Catch Breath](scc.v1:mcdm.heroes.v1/feature.common.maneuvers/catch-breath) maneuver, but other creatures can help them spend [Recoveries](scc.v1:mcdm.heroes.v1/rule.health/recoveries) in other ways.\n",
  canonRefs: [
    'mcdm.heroes.v1/feature.common.maneuvers/catch-breath',
    'mcdm.heroes.v1/rule.health/recoveries',
    'mcdm.heroes.v1/rule.health/stamina',
    'mcdm.heroes.v1/chapter/the-basics',
    'mcdm.heroes.v1/rule.health/dying',
  ],
  defaultActionCost: 'maneuver',
  perRoundCaps: [],
  alternatives: [],
  debitContract: 'self',
  companionArtifactIds: [],
  movesActor: false,
  composition: null,
  resolution: {
    kind: 'spend-recovery',
    subjectText: 'A creature who uses the Catch Breath maneuver',
    singular: true,
  },
};

export const STAND_UP: CommonActionProgramData = {
  featureArtifactId: 'mcdm.heroes.v1/feature.common.maneuvers/stand-up',
  provenance: 'prose-feature',
  group: 'maneuvers',
  sourceSpan: {
    byteStart: 0,
    byteEnd: 383,
  },
  sourceText:
    '\nA creature can use the [Stand Up](scc.v1:mcdm.heroes.v1/feature.common.maneuvers/stand-up) maneuver to stand up if they [are prone](scc.v1:mcdm.heroes.v1/condition/prone), ending that [condition](scc.v1:mcdm.heroes.v1/rule.combat/condition). Alternatively, they can use this maneuver to make a willing [adjacent](scc.v1:mcdm.heroes.v1/rule.combat/adjacent) prone creature stand up.\n',
  canonRefs: [
    'mcdm.heroes.v1/feature.common.maneuvers/stand-up',
    'mcdm.heroes.v1/condition/prone',
    'mcdm.heroes.v1/rule.combat/condition',
    'mcdm.heroes.v1/rule.combat/adjacent',
  ],
  defaultActionCost: 'maneuver',
  perRoundCaps: [],
  alternatives: [
    {
      key: 'ally-stands-up',
      sourceText:
        'Alternatively, they can use this maneuver to make a willing adjacent prone creature stand up.',
      targetAction: null,
    },
  ],
  debitContract: 'self',
  companionArtifactIds: [],
  movesActor: false,
  composition: null,
  resolution: {
    kind: 'table',
  },
};

export const KNOCKBACK: CommonActionProgramData = {
  featureArtifactId: 'mcdm.heroes.v1/feature.common.maneuvers/knockback',
  provenance: 'prose-feature',
  group: 'maneuvers',
  sourceSpan: {
    byteStart: 0,
    byteEnd: 224,
  },
  sourceText:
    '\nA creature wanting to [push](scc.v1:mcdm.heroes.v1/movement/forced-movement) an [adjacent](scc.v1:mcdm.heroes.v1/rule.combat/adjacent) creature away from them can attempt to shove that creature using the following ability.\n',
  canonRefs: ['mcdm.heroes.v1/movement/forced-movement', 'mcdm.heroes.v1/rule.combat/adjacent'],
  defaultActionCost: 'maneuver',
  perRoundCaps: [],
  alternatives: [],
  debitContract: 'companion',
  companionArtifactIds: ['mcdm.heroes.v1/feature.ability.common/knockback'],
  movesActor: false,
  composition: null,
  resolution: {
    kind: 'table',
  },
};

/**
 * The compiled MELEE WEAPON FREE STRIKE companion
 * (`feature.ability.common/melee-weapon-free-strike`) — the roll-bearing
 * half Free Strike's prose hands off to, compiled end-to-end by the
 * ordinary ability pipeline. Its header prints the SAME `Main action` the
 * prose does, which is exactly why the prose arm must not debit.
 */
export const MELEE_WEAPON_FREE_STRIKE = {
  abilityArtifactId: 'mcdm.heroes.v1/feature.ability.common/melee-weapon-free-strike',
  actionType: 'Main action',
  actionCost: 'main-action' as const,
  keywords: ['Charge', 'Melee', 'Strike', 'Weapon'],
  targetsText: 'One creature or object',
  powerRollBonus: { kind: 'characteristic' as const, options: ['M' as const, 'A' as const] },
  tiers: {
    tier1: {
      damage: { amount: 2, characteristicOptions: ['M' as const, 'A' as const], typeOptions: [] },
      potency: null,
      conditionIds: [],
      ending: null,
    },
    tier2: {
      damage: { amount: 5, characteristicOptions: ['M' as const, 'A' as const], typeOptions: [] },
      potency: null,
      conditionIds: [],
      ending: null,
    },
    tier3: {
      damage: { amount: 7, characteristicOptions: ['M' as const, 'A' as const], typeOptions: [] },
      potency: null,
      conditionIds: [],
      ending: null,
    },
  },
};

/**
 * Composition declarations for Charge's child half — the two-field shape a
 * dispatch carries so the arm can check the printed constraint. Ids and
 * keyword cells are verbatim from the pinned corpus.
 */
/** Spear Charge (goblin warrior stat block): "Charge, Melee, Strike,
 * Weapon" — a Charge-keyword ability, so the printed substitution admits
 * it in place of the free strike. */
export const SPEAR_CHARGE_COMPOSES = {
  abilityArtifactId: 'mcdm.monsters.v1/monster.goblin.statblock/goblin-warrior#spear-charge',
  keywords: ['Charge', 'Melee', 'Strike', 'Weapon'],
};
/** The common Knockback ability: "Melee, Weapon" — neither the named child
 * nor Charge-keyworded. */
export const KNOCKBACK_COMPOSES = {
  abilityArtifactId: 'mcdm.heroes.v1/feature.ability.common/knockback',
  keywords: ['Melee', 'Weapon'],
};

/**
 * The compiled KNOCKBACK companion (`feature.ability.common/knockback`) —
 * the roll-bearing half Knockback's prose hands off to. Push 1/2/3 with no
 * damage, no condition and no potency: its entire printed outcome is
 * forced movement, which under DEC-0011 is a receipt rather than a state
 * change. No Strike keyword, so strike-scoped grants are not consumed.
 */
export const KNOCKBACK_ABILITY = {
  abilityArtifactId: 'mcdm.heroes.v1/feature.ability.common/knockback',
  actionType: 'Maneuver',
  actionCost: 'maneuver' as const,
  keywords: ['Melee', 'Weapon'],
  targetsText: 'One creature',
  powerRollBonus: { kind: 'characteristic' as const, options: ['M' as const] },
  tiers: {
    tier1: {
      damage: null,
      potency: null,
      conditionIds: [],
      ending: null,
      forcedMovement: { kind: 'push' as const, distance: 1 },
    },
    tier2: {
      damage: null,
      potency: null,
      conditionIds: [],
      ending: null,
      forcedMovement: { kind: 'push' as const, distance: 2 },
    },
    tier3: {
      damage: null,
      potency: null,
      conditionIds: [],
      ending: null,
      forcedMovement: { kind: 'push' as const, distance: 3 },
    },
  },
};
