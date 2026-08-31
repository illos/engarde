import { describe, expect, it } from 'vitest';
import { type ApplyResult, applyIntent } from './apply-intent.js';
import { targetCapAbilityKey } from './common-action-execution.js';
import { createSeededRandomSource } from './determinism.js';
import { initialEncounterState } from './driver.js';
import { checkInvariants } from './invariants.js';
import { deriveOccurrences } from './occurrences.js';
import type {
  CommonActionProgramDataInput,
  EncounterState,
  Intent,
  ParticipantStats,
} from './schemas.js';

/**
 * `use-common-action` — the one dispatch path for the 17 printed common
 * actions [common-actions design §2]. Fires-in-anger dispatch tests: every
 * case goes through `applyIntent` and asserts observable state change, with
 * the invariant oracle on every dispatch.
 *
 * Program literals below are the CANON COMPILER'S OUTPUT for the pinned
 * artifacts, emitted mechanically from
 * `packages/canon/src/fixtures/common-actions.verbatim.ts` — the engine
 * package cannot import canon (canon depends on the engine), so they are
 * inlined verbatim rather than paraphrased. The canon-side compiler tests
 * and the corpus drift guard are what keep them honest.
 */

/** Goblin warrior (committed verbatim fixture): staminaMax 15; M −2, A +2,
 * R 0, I 0, P −1; organization Horde. */
const GOBLIN_WARRIOR_STATS: ParticipantStats = {
  staminaMax: 15,
  characteristics: { might: -2, agility: 2, reason: 0, intuition: 0, presence: -1 },
  immunities: [],
  weaknesses: [],
  potencies: null,
  organization: 'Horde',
  recoveriesMax: null,
  freeStrike: null,
  withCaptain: null,
  withCaptainBenefit: null,
};

const ADVANCE: CommonActionProgramDataInput = {
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
  resolution: {
    kind: 'table',
  },
};

const RIDE: CommonActionProgramDataInput = {
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
    },
  ],
  debitContract: 'self',
  companionArtifactIds: [],
  movesActor: true,
  resolution: {
    kind: 'table',
  },
};

const FREE_STRIKE: CommonActionProgramDataInput = {
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
  resolution: {
    kind: 'table',
  },
};

const CATCH_BREATH: CommonActionProgramDataInput = {
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
  resolution: {
    kind: 'spend-recovery',
    subjectText: 'A creature who uses the Catch Breath maneuver',
    singular: true,
  },
};

const STAND_UP: CommonActionProgramDataInput = {
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
    },
  ],
  debitContract: 'self',
  companionArtifactIds: [],
  movesActor: false,
  resolution: {
    kind: 'table',
  },
};

let intentCounter = 0;
function nextId(prefix: string): string {
  intentCounter += 1;
  return `${prefix}-${intentCounter}`;
}

function dispatchChecked(state: EncounterState, intent: Intent, seed = 1): ApplyResult {
  const result = applyIntent(state, intent, { random: createSeededRandomSource(seed) });
  expect(checkInvariants(state, intent, result)).toEqual([]);
  return result;
}

function baseEncounter(): EncounterState {
  return initialEncounterState([
    { id: 'hero', kind: 'hero', stats: { ...GOBLIN_WARRIOR_STATS, recoveriesMax: 8 } },
    { id: 'ally', kind: 'hero', stats: { ...GOBLIN_WARRIOR_STATS, recoveriesMax: 8 } },
    {
      id: 'warrior',
      kind: 'director-creature',
      stats: GOBLIN_WARRIOR_STATS,
      sourceRecordId: 'mcdm.monsters.v1/monster.goblin.statblock/goblin-warrior',
    },
  ]);
}

function onHeroTurn(): EncounterState {
  const begun = dispatchChecked(baseEncounter(), {
    intentId: nextId('begin'),
    kind: 'begin-combat',
    actor: { kind: 'director' },
    payload: { firstSide: 'heroes', roll: 7 },
  }).state;
  return dispatchChecked(begun, {
    intentId: nextId('start'),
    kind: 'start-turn',
    actor: { kind: 'director' },
    payload: { turnId: 'hero' },
  }).state;
}

function useCommonAction(
  actorId: string,
  feature: CommonActionProgramDataInput,
  overrides: Record<string, unknown> = {},
): Intent {
  return {
    intentId: nextId('common'),
    kind: 'use-common-action',
    actor: { kind: 'participant', participantId: actorId },
    payload: { actorParticipantId: actorId, feature, ...overrides },
  } as Intent;
}

describe('use-common-action — the shared dispatch path', () => {
  it('Advance debits one move action and carries the printed text verbatim', () => {
    const state = onHeroTurn();
    const result = dispatchChecked(state, useCommonAction('hero', ADVANCE));
    expect(result.state.participants.hero?.actionBudget['move-action']).toEqual({
      used: 1,
      granted: 0,
    });
    const directive = result.log.find((entry) => entry.data.manualCommonAction !== undefined);
    expect(directive?.kind).toBe('table-directive');
    expect(directive?.message).toBe(ADVANCE.sourceText);
    expect(result.log.some((entry) => entry.kind === 'warning')).toBe(false);
    // A prose feature is never labelled as an Effect line.
    expect(result.log.some((entry) => entry.data.manualEffect !== undefined)).toBe(false);
  });

  it('records where the cost came from — group directory by default, dispatch on override', () => {
    const state = onHeroTurn();
    const byDefault = dispatchChecked(state, useCommonAction('hero', ADVANCE));
    const receipt = byDefault.log[0]?.data.commonActionResolution as Record<string, unknown>;
    expect(receipt.commonAction).toEqual({
      group: 'move-actions',
      actionCost: 'move-action',
      actionCostSource: 'group-directory',
      actionCostGroupDefault: 'move-action',
      debitContract: 'self',
    });

    // The printed exceptions are real: one class feature prints Hide at a
    // free maneuver, two print Disengage at a free triggered action. An
    // override debits what the dispatch says, and says so.
    const overridden = dispatchChecked(
      state,
      useCommonAction('hero', ADVANCE, { actionCost: 'free-maneuver' }),
    );
    const overriddenReceipt = overridden.log[0]?.data.commonActionResolution as Record<
      string,
      unknown
    >;
    expect((overriddenReceipt.commonAction as Record<string, unknown>).actionCostSource).toBe(
      'dispatch',
    );
    expect(overridden.state.participants.hero?.actionBudget['move-action']?.used ?? 0).toBe(0);
  });

  it('a companion-paid action takes NO debit and names who pays', () => {
    const state = onHeroTurn();
    const result = dispatchChecked(state, useCommonAction('hero', FREE_STRIKE));
    expect(result.state.participants.hero?.actionBudget['main-action']?.used ?? 0).toBe(0);
    const receipt = result.log.find((entry) => entry.data.commonActionCompanionPays !== undefined);
    expect(receipt?.data.commonActionCompanionPays).toEqual({
      featureArtifactId: 'mcdm.heroes.v1/feature.common.main-actions/free-strike',
      companionArtifactIds: [
        'mcdm.heroes.v1/feature.ability.common/melee-weapon-free-strike',
        'mcdm.heroes.v1/feature.ability.common/ranged-weapon-free-strike',
      ],
    });
    // The companion's own dispatch still records the actor's use of it —
    // this arm suppresses only the double debit, never the receipt.
    expect(result.state.participants.hero?.abilityUses).toEqual({});
  });

  it('a broken-up segment consumes the parent debit and does not re-tick the use counter', () => {
    // "They can break up this movement with their maneuver and main action
    // however they wish." — one move action, however many segments.
    let state = onHeroTurn();
    const first = dispatchChecked(state, useCommonAction('hero', RIDE, { targets: ['warrior'] }));
    state = first.state;
    const second = dispatchChecked(
      state,
      useCommonAction('hero', RIDE, {
        targets: ['warrior'],
        partOf: first.log[0]?.intentId ?? 'missing',
      }),
    );
    expect(second.state.participants.hero?.actionBudget['move-action']).toEqual({
      used: 1,
      granted: 0,
    });
    const rideKey = 'mcdm.heroes.v1/feature.common.move-actions/ride';
    expect(second.state.participants.hero?.abilityUses[rideKey]?.round).toBe(1);
    expect(second.log.some((entry) => entry.kind === 'warning')).toBe(false);
  });

  it("Ride's two printed caps warn independently, on their own subjects", () => {
    // "A creature can use the Ride move action only once per round." and
    // "A mounted creature can only have this move action applied to them
    // once per round." — two sentences, two subjects, two counters.
    let state = onHeroTurn();
    state = dispatchChecked(state, useCommonAction('hero', RIDE, { targets: ['warrior'] })).state;
    const rideKey = 'mcdm.heroes.v1/feature.common.move-actions/ride';
    expect(state.participants.hero?.abilityUses[rideKey]?.round).toBe(1);
    expect(state.participants.warrior?.abilityUses[targetCapAbilityKey(rideKey)]?.round).toBe(1);
    // The mount's counter rode a no-action debit: no budget was consumed
    // and no off-turn warning fired on a creature whose turn it isn't.
    expect(state.participants.warrior?.actionBudget).toEqual({});

    const again = dispatchChecked(state, useCommonAction('hero', RIDE, { targets: ['warrior'] }));
    const capWarnings = again.log.filter(
      (entry) => entry.kind === 'warning' && entry.message.includes('once per round'),
    );
    expect(capWarnings).toHaveLength(2);
    expect(capWarnings.some((entry) => entry.message.startsWith('hero'))).toBe(true);
    expect(capWarnings.some((entry) => entry.message.startsWith('warrior'))).toBe(true);
  });

  it('carries a selected printed alternative verbatim', () => {
    const state = onHeroTurn();
    const result = dispatchChecked(
      state,
      useCommonAction('hero', RIDE, { targets: ['warrior'], alternative: 'mount-disengages' }),
    );
    const directive = result.log.find((entry) => entry.data.commonActionAlternative !== undefined);
    expect(directive?.message).toBe(
      'Alternatively, a creature can use the Ride move action to have their mount use the Disengage move action as a free triggered action.',
    );
  });

  it('refuses an alternative the printed text does not carry', () => {
    const state = onHeroTurn();
    expect(() =>
      applyIntent(state, useCommonAction('hero', RIDE, { alternative: 'teleport' }), {
        random: createSeededRandomSource(1),
      }),
    ).toThrow();
  });

  it('executes the one common action with printed executable behaviour', () => {
    // "A creature who uses the Catch Breath maneuver spends a Recovery and
    // regains Stamina equal to their recovery value."
    let state = onHeroTurn();
    state = dispatchChecked(state, {
      intentId: nextId('damage'),
      kind: 'apply-damage',
      actor: { kind: 'director' },
      payload: {
        target: 'hero',
        amount: 9,
        reason: 'seeded damage for the Catch Breath case',
        rolled: false,
        sourceId: 'warrior',
      },
    } as Intent).state;
    expect(state.participants.hero?.stamina?.current).toBe(6);

    const result = dispatchChecked(
      state,
      useCommonAction('hero', CATCH_BREATH, {
        targets: ['hero'],
        recoverySpends: { hero: true },
      }),
    );
    expect(result.state.participants.hero?.actionBudget.maneuver).toEqual({ used: 1, granted: 0 });
    expect(result.state.participants.hero?.stamina?.recoveries).toBe(7);
    expect(result.state.participants.hero?.stamina?.current).toBe(11);
  });

  it('does NOT record a common action as an ability use for printed triggers', () => {
    // The printed trigger word is "ability". Advance is not an ability, so
    // no `ability-used` occurrence may fire for it — otherwise a creature
    // is un-hidden for walking [design S17 + W0-c].
    const state = onHeroTurn();
    const result = dispatchChecked(state, useCommonAction('hero', ADVANCE));
    expect(result.log.some((entry) => entry.data.nonrollingAbilityApplication !== undefined)).toBe(
      false,
    );
    expect(
      deriveOccurrences(result.log, { intentId: 'common-action', round: 1 }).some(
        (occurrence) => occurrence.kind === 'ability-used',
      ),
    ).toBe(false);
  });

  it('surfaces recorded terrain when the printed action moves the actor, and never evaluates it', () => {
    let state = onHeroTurn();
    state = {
      ...state,
      terrainFacts: [
        {
          factId: 'fact-1',
          terrain: 'difficult',
          effectArtifactId: 'mcdm.heroes.v1/movement/difficult-terrain',
          effectOrdinal: 1,
          areaText: '3 burst',
          createdBy: 'warrior',
          intentId: 'seed',
        },
      ],
    };
    const moving = dispatchChecked(state, useCommonAction('hero', ADVANCE));
    expect(moving.log.some((entry) => entry.data.recordedTerrainAtMovement !== undefined)).toBe(
      true,
    );
    // Catch Breath prints no movement: the same recorded terrain is not
    // surfaced on it.
    const still = dispatchChecked(
      state,
      useCommonAction('hero', CATCH_BREATH, {
        targets: ['hero'],
        recoverySpends: { hero: true },
      }),
    );
    expect(still.log.some((entry) => entry.data.recordedTerrainAtMovement !== undefined)).toBe(
      false,
    );
  });

  it('refuses an unknown participant before any mutation', () => {
    const state = onHeroTurn();
    const result = dispatchChecked(state, useCommonAction('ghost', ADVANCE));
    expect(result.log).toHaveLength(1);
    expect(result.log[0]?.kind).toBe('refusal');
    expect(result.state).toBe(state);
  });

  it('warns and applies an off-turn common action, never blocks it', () => {
    const state = onHeroTurn();
    const result = dispatchChecked(state, useCommonAction('warrior', ADVANCE));
    expect(result.state.participants.warrior?.actionBudget['move-action']?.used).toBe(1);
    expect(result.log.some((entry) => entry.kind === 'warning')).toBe(true);
  });
});
