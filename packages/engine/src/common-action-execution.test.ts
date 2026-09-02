import { describe, expect, it } from 'vitest';
import { type ApplyResult, applyIntent } from './apply-intent.js';
import { targetCapAbilityKey } from './common-action-execution.js';
import {
  COMMON_ACTION_ELIGIBILITY_GATES,
  foldAssertedFacts,
  readAssertedFact,
  readEligibility,
} from './common-action-gates.js';
import { commonActionMenu, hasCommonActionAccess } from './common-action-menu.js';
import {
  ADVANCE,
  CATCH_BREATH,
  CHARGE,
  DISENGAGE,
  FREE_STRIKE,
  HEAL,
  KNOCKBACK,
  KNOCKBACK_ABILITY,
  KNOCKBACK_COMPOSES,
  MAKE_OR_ASSIST_A_TEST,
  MELEE_WEAPON_FREE_STRIKE,
  RIDE,
  SPEAR_CHARGE_COMPOSES,
  STAND_UP,
} from './common-action.fixtures.js';
import { SAVING_THROW } from './condition-lifecycle.js';
import { createSeededRandomSource } from './determinism.js';
import { initialEncounterState } from './driver.js';
import { forcedMovementDirective } from './forced-movement.js';
import { checkInvariants } from './invariants.js';
import { deriveOccurrences } from './occurrences.js';
import type {
  CommonActionProgramData,
  EncounterState,
  Intent,
  ParticipantStats,
} from './schemas.js';
import { TEST_OUTCOME_CANON, TEST_OUTCOME_LABEL } from './test-outcome.js';

/**
 * `use-common-action` — the one dispatch path for the 17 printed common
 * actions [common-actions design §2]. Fires-in-anger dispatch tests: every
 * case goes through `applyIntent` and asserts observable state change, with
 * the invariant oracle on every dispatch.
 *
 * Compiled program literals come from `common-action.fixtures.ts` — the
 * canon compiler's output for the pinned artifacts, with one home on this
 * side of the dependency edge.
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
  feature: CommonActionProgramData,
  overrides: Record<string, unknown> = {},
): Intent {
  // `spatialFacts` rides the intent ENVELOPE (every intent may carry
  // table assertions); everything else is payload. Accepting it in the
  // same overrides bag keeps each test's dispatch readable.
  const { spatialFacts, ...payload } = overrides;
  return {
    intentId: nextId('common'),
    kind: 'use-common-action',
    actor: { kind: 'participant', participantId: actorId },
    ...(spatialFacts === undefined ? {} : { spatialFacts }),
    payload: { actorParticipantId: actorId, feature, ...payload },
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

describe('printed eligibility gates + the asserted-fact reader (S4 + S5)', () => {
  it('reads an asserted fact three ways: asserted true, asserted false, absent', () => {
    const facts = [
      { fact: 'adjacent' as const, a: 'hero', b: 'warrior', holds: true },
      { fact: 'line-of-effect' as const, a: 'hero', b: 'ally', holds: false },
    ];
    expect(readAssertedFact(facts, { fact: 'adjacent', a: 'hero', b: 'warrior' })).toBe(true);
    expect(readAssertedFact(facts, { fact: 'line-of-effect', a: 'hero', b: 'ally' })).toBe(false);
    // Absent is UNKNOWN, never false: the table has not spoken.
    expect(readAssertedFact(facts, { fact: 'adjacent', a: 'hero', b: 'ally' })).toBe('unknown');
    // The pair is directed — `a is adjacent to b` is not stored symmetric.
    expect(readAssertedFact(facts, { fact: 'adjacent', a: 'warrior', b: 'hero' })).toBe('unknown');
  });

  it('folds declared facts across every named target', () => {
    const state = onHeroTurn();
    const input = {
      state,
      actorId: 'hero',
      targets: ['warrior', 'ally'],
      spatialFacts: [{ fact: 'adjacent' as const, a: 'hero', b: 'warrior', holds: true }],
      alternative: null,
      willing: {},
    };
    expect(
      foldAssertedFacts([{ fact: 'adjacent', a: 'actor', b: 'target', holds: true }], input),
    ).toEqual([true, 'unknown']);
    expect(
      foldAssertedFacts([{ fact: 'adjacent', a: 'actor', b: 'target', holds: false }], input),
    ).toEqual([false, 'unknown']);
    // No targets, no readings — the gate's engine-known half stands alone.
    expect(
      foldAssertedFacts([{ fact: 'adjacent', a: 'actor', b: 'target', holds: true }], {
        ...input,
        targets: [],
      }),
    ).toEqual([]);
  });

  it('registers exactly the printed preconditions built so far', () => {
    expect(
      COMMON_ACTION_ELIGIBILITY_GATES.map((gate) => [
        gate.featureArtifactId,
        gate.sourceArtifactId,
      ]),
    ).toEqual([
      [
        'mcdm.heroes.v1/feature.common.maneuvers/catch-breath',
        'mcdm.heroes.v1/feature.common.maneuvers/catch-breath',
      ],
      [
        'mcdm.heroes.v1/feature.common.move-actions/ride',
        'mcdm.heroes.v1/feature.common.move-actions/ride',
      ],
      // The two registrations that cite an artifact other than the
      // action's own prose: slowed prints its bar on shifting and never
      // names Disengage; Knockback's targeting rule is printed on the
      // companion ability's Effect line.
      ['mcdm.heroes.v1/feature.common.move-actions/disengage', 'mcdm.heroes.v1/condition/slowed'],
      [
        'mcdm.heroes.v1/feature.common.maneuvers/knockback',
        'mcdm.heroes.v1/feature.ability.common/knockback',
      ],
      // Heal's one printed precondition is purely spatial, so its gate is
      // entirely asserted-fact: the engine-known half is vacuously true.
      [
        'mcdm.heroes.v1/feature.common.main-actions/heal',
        'mcdm.heroes.v1/feature.common.main-actions/heal',
      ],
      // Stand Up registers three: the restrained bar (a third citation of
      // someone else's artifact, and the ROLE proof — it reads the actor,
      // never the standee), then one per printed branch, because the two
      // branches quote different sentences and require different things.
      ['mcdm.heroes.v1/feature.common.maneuvers/stand-up', 'mcdm.heroes.v1/condition/restrained'],
      [
        'mcdm.heroes.v1/feature.common.maneuvers/stand-up',
        'mcdm.heroes.v1/feature.common.maneuvers/stand-up',
      ],
      [
        'mcdm.heroes.v1/feature.common.maneuvers/stand-up',
        'mcdm.heroes.v1/feature.common.maneuvers/stand-up',
      ],
      // Make or Assist's assist branch: the three printed provisos are on
      // the chapter section the action's own text points to, not on the
      // action — a fourth citation of a foreign artifact.
      [
        'mcdm.heroes.v1/feature.common.maneuvers/make-or-assist-a-test',
        'mcdm.heroes.v1/chapter/tests#assist-a-test',
      ],
    ]);
  });

  it("Catch Breath's dying gate reads the engine's one dying home, tri-state", () => {
    const state = onHeroTurn();
    const read = (actorId: string, from = state) =>
      readEligibility('mcdm.heroes.v1/feature.common.maneuvers/catch-breath', {
        state: from,
        actorId,
        targets: [actorId],
        spatialFacts: [],
        alternative: null,
        willing: {},
      })[0]?.verdict;
    expect(read('hero')).toBe(true);

    const dying = dispatchChecked(state, {
      intentId: nextId('damage'),
      kind: 'apply-damage',
      actor: { kind: 'director' },
      payload: {
        target: 'hero',
        amount: 15,
        reason: 'seeded damage to reach the dying band',
        rolled: false,
        sourceId: 'warrior',
      },
    } as Intent).state;
    expect(read('hero', dying)).toBe(false);

    // Untracked Stamina is not "not dying" — it is unknown.
    const untracked = {
      ...state,
      participants: {
        ...state.participants,
        hero: { ...state.participants.hero, stamina: null },
      },
    } as EncounterState;
    expect(read('hero', untracked)).toBe('unknown');
  });

  it("Ride's mount precondition is unknown, not false, when a mount is named", () => {
    const state = onHeroTurn();
    const read = (targets: string[]) =>
      readEligibility('mcdm.heroes.v1/feature.common.move-actions/ride', {
        state,
        actorId: 'hero',
        targets,
        spatialFacts: [],
        alternative: null,
        willing: {},
      })[0]?.verdict;
    // The engine models no mount relation, so it knows exactly one thing:
    // whether a mount was named at all.
    expect(read([])).toBe(false);
    expect(read(['warrior'])).toBe('unknown');
  });

  it('warns and applies a Catch Breath the printed text bars, quoting the sentence', () => {
    let state = onHeroTurn();
    state = dispatchChecked(state, {
      intentId: nextId('damage'),
      kind: 'apply-damage',
      actor: { kind: 'director' },
      payload: {
        target: 'hero',
        amount: 15,
        reason: 'seeded damage to reach the dying band',
        rolled: false,
        sourceId: 'warrior',
      },
    } as Intent).state;

    const result = dispatchChecked(
      state,
      useCommonAction('hero', CATCH_BREATH, {
        targets: ['hero'],
        recoverySpends: { hero: true },
      }),
    );
    const warning = result.log.find(
      (entry) => entry.kind === 'warning' && entry.data.commonActionEligibility !== undefined,
    );
    expect(warning?.message).toContain(
      "A creature who is dying (see Dying and Death in Stamina below) can't use the Catch Breath maneuver",
    );
    // Permissive engine: the precondition warns, the Recovery is still
    // spent, and the Director adjudicates.
    expect(result.state.participants.hero?.stamina?.recoveries).toBe(7);
    expect(result.state.participants.hero?.stamina?.current).toBeGreaterThan(0);
  });

  it('surfaces an unevaluable precondition as a table directive, not a violation', () => {
    const state = onHeroTurn();
    const result = dispatchChecked(state, useCommonAction('hero', RIDE, { targets: ['warrior'] }));
    const directive = result.log.find((entry) => entry.data.commonActionEligibility !== undefined);
    expect(directive?.kind).toBe('table-directive');
    expect(directive?.message).toContain('only while mounted on another creature');
  });
});

describe('the common-action offer surface (S14)', () => {
  const ALL = [ADVANCE, RIDE, FREE_STRIKE, CATCH_BREATH, STAND_UP];

  it('offers every action with its group cost, marking printed availability', () => {
    const state = onHeroTurn();
    const menu = commonActionMenu(state, 'hero', ALL);
    expect(
      menu.map((offer) => [offer.featureArtifactId, offer.actionCost, offer.available]),
    ).toEqual([
      ['mcdm.heroes.v1/feature.common.move-actions/advance', 'move-action', true],
      // No mount named on a bare menu read: the printed precondition
      // cannot be met by an unnamed mount.
      ['mcdm.heroes.v1/feature.common.move-actions/ride', 'move-action', false],
      ['mcdm.heroes.v1/feature.common.main-actions/free-strike', 'main-action', true],
      ['mcdm.heroes.v1/feature.common.maneuvers/catch-breath', 'maneuver', true],
      // Stand Up with no standee named: the restrained bar on the ACTOR
      // reads true (the hero is not restrained), but the prone
      // precondition is about the creature who stands up, and a bare menu
      // read has not said who that is. Unknown, not false — the surface
      // reports what it cannot know rather than guessing.
      ['mcdm.heroes.v1/feature.common.maneuvers/stand-up', 'maneuver', 'unknown'],
    ]);
    const ride = menu.find((offer) => offer.featureArtifactId.endsWith('/ride'));
    expect(ride?.reasons[0]?.verbatim).toBe(
      'A creature can take the Ride move action only while mounted on another creature (see Mounted Combat below).',
    );
    // Naming the mount moves it to unknown — the table decides.
    expect(
      commonActionMenu(state, 'hero', ALL, { targets: ['warrior'] }).find((offer) =>
        offer.featureArtifactId.endsWith('/ride'),
      )?.available,
    ).toBe('unknown');
  });

  it('offers the compiled companion for a companion-paid action', () => {
    const state = onHeroTurn();
    const freeStrike = commonActionMenu(state, 'hero', ALL).find((offer) =>
      offer.featureArtifactId.endsWith('/free-strike'),
    );
    expect(freeStrike?.offersCompanion).toBe(true);
    expect(freeStrike?.companionArtifactIds).toEqual([
      'mcdm.heroes.v1/feature.ability.common/melee-weapon-free-strike',
      'mcdm.heroes.v1/feature.ability.common/ranged-weapon-free-strike',
    ]);
    // Every other entry dispatches the prose action itself.
    for (const offer of commonActionMenu(state, 'hero', [ADVANCE, RIDE, CATCH_BREATH])) {
      expect(offer.offersCompanion, offer.featureArtifactId).toBe(false);
    }
  });

  it('honours the printed access slot, with include overriding exclude', () => {
    // ROAD-0005 seam #3. The CORE corpus prints no exclusions, so the slot
    // is empty on every core participant; this exercises the substrate.
    const base = onHeroTurn();
    const advanceId = 'mcdm.heroes.v1/feature.common.move-actions/advance';
    expect(hasCommonActionAccess(base, 'hero', advanceId)).toBe(true);

    const withAccess = (access: { exclude: string[]; include: string[] }): EncounterState =>
      ({
        ...base,
        participants: {
          ...base.participants,
          hero: {
            ...base.participants.hero,
            traits: { ...base.participants.hero?.traits, commonActionAccess: access },
          },
        },
      }) as EncounterState;

    const excluded = withAccess({ exclude: [advanceId], include: [] });
    expect(hasCommonActionAccess(excluded, 'hero', advanceId)).toBe(false);
    expect(
      commonActionMenu(excluded, 'hero', ALL).some(
        (offer) => offer.featureArtifactId === advanceId,
      ),
    ).toBe(false);
    expect(
      commonActionMenu(excluded, 'hero', ALL, { includeExcluded: true }).find(
        (offer) => offer.featureArtifactId === advanceId,
      )?.accessExcluded,
    ).toBe(true);

    const reincluded = withAccess({ exclude: [advanceId], include: [advanceId] });
    expect(hasCommonActionAccess(reincluded, 'hero', advanceId)).toBe(true);
  });

  it('offers an action whose printed precondition fails — it reports, it never gates', () => {
    let state = onHeroTurn();
    state = dispatchChecked(state, {
      intentId: nextId('damage'),
      kind: 'apply-damage',
      actor: { kind: 'director' },
      payload: {
        target: 'hero',
        amount: 15,
        reason: 'seeded damage to reach the dying band',
        rolled: false,
        sourceId: 'warrior',
      },
    } as Intent).state;
    const catchBreath = commonActionMenu(state, 'hero', ALL, { targets: ['hero'] }).find((offer) =>
      offer.featureArtifactId.endsWith('/catch-breath'),
    );
    expect(catchBreath).toBeDefined();
    expect(catchBreath?.available).toBe(false);
    expect(catchBreath?.reasons[0]?.verdict).toBe(false);
  });
});

describe('wave 4 — the four shipped arms', () => {
  it("Ride's printed alternative charges the MOUNT its own free triggered action", () => {
    // "Alternatively, a creature can use the Ride move action to have their
    // mount use the Disengage move action as a free triggered action."
    const state = onHeroTurn();
    const result = dispatchChecked(
      state,
      useCommonAction('hero', RIDE, { targets: ['warrior'], alternative: 'mount-disengages' }),
    );
    // The rider pays one move action, once.
    expect(result.state.participants.hero?.actionBudget['move-action']).toEqual({
      used: 1,
      granted: 0,
    });
    // The mount pays the printed free triggered action — which consumes no
    // budget and does NOT count against "one triggered action per round".
    expect(result.state.participants.warrior?.triggeredThisRound).toBe(0);
    expect(
      result.state.participants.warrior?.abilityUses[
        'mcdm.heroes.v1/feature.common.move-actions/disengage'
      ]?.round,
    ).toBe(1);
    // …and it is NOT charged as the rider's composed child: the mount pays
    // its own printed cost, so nothing routes through `partOf`.
    expect(result.state.participants.hero?.abilityUses).toEqual({
      'mcdm.heroes.v1/feature.common.move-actions/ride': { round: 1, turn: 1, encounter: 1 },
    });
  });

  it('the primary Ride branch charges the mount nothing beyond its printed cap', () => {
    const state = onHeroTurn();
    const result = dispatchChecked(state, useCommonAction('hero', RIDE, { targets: ['warrior'] }));
    expect(
      result.state.participants.warrior?.abilityUses[
        'mcdm.heroes.v1/feature.common.move-actions/disengage'
      ],
    ).toBeUndefined();
  });

  it('Free Strike costs ONE main action across the prose arm and its companion', () => {
    // The critical-path gap: both compiled weapon free strikes already ride
    // the whole existing pipeline, and nothing surfaced or sequenced them.
    let state = onHeroTurn();
    const prose = dispatchChecked(state, useCommonAction('hero', FREE_STRIKE));
    state = prose.state;
    expect(state.participants.hero?.actionBudget['main-action']?.used ?? 0).toBe(0);

    const payload = {
      actorParticipantId: 'hero',
      ability: MELEE_WEAPON_FREE_STRIKE,
      targets: ['warrior'],
      dice: [5, 5] as [number, number],
      characteristicChoice: 'A' as const,
      damageCharacteristicChoice: 'A' as const,
    };
    const struck = dispatchChecked(state, {
      intentId: nextId('free-strike'),
      kind: 'use-ability',
      actor: { kind: 'participant', participantId: 'hero' },
      payload,
    } as Intent);
    // Exactly one main action, paid by the companion that prints it.
    expect(struck.state.participants.hero?.actionBudget['main-action']).toEqual({
      used: 1,
      granted: 0,
    });
    expect(struck.log.some((entry) => entry.kind === 'warning')).toBe(false);

    // …and it resolves through the ordinary two-phase path, unchanged:
    // dice [5,5] + A 2 = 12 → tier 2 → 5 + A damage = 7 [verbatim Melee
    // Weapon Free Strike].
    const commit = dispatchChecked(struck.state, {
      intentId: nextId('commit'),
      kind: 'commit-resolution',
      actor: { kind: 'director' },
      payload: { resolutionId: struck.state.resolutionStack[0]?.resolutionId, payload },
    } as Intent);
    expect(commit.state.participants.warrior?.stamina?.current).toBe(8);
  });
});

describe('wave 5 — Disengage and Charge', () => {
  const SLOWED = 'mcdm.heroes.v1/condition/slowed';

  function applyCondition(
    state: EncounterState,
    target: string,
    conditionId: string,
  ): EncounterState {
    return dispatchChecked(state, {
      intentId: nextId('condition'),
      kind: 'apply-condition',
      actor: { kind: 'director' },
      payload: {
        target,
        conditionId,
        ending: { kind: 'external' },
        source: { participantId: 'warrior', effectArtifactId: conditionId },
      },
    } as Intent).state;
  }

  it('Disengage debits one move action and carries the printed shift verbatim', () => {
    const result = dispatchChecked(onHeroTurn(), useCommonAction('hero', DISENGAGE));
    expect(result.state.participants.hero?.actionBudget['move-action']).toEqual({
      used: 1,
      granted: 0,
    });
    const directive = result.log.find((entry) => entry.data.manualCommonAction !== undefined);
    expect(directive?.message).toBe(DISENGAGE.sourceText);
    expect(directive?.canonRefs).toContain('mcdm.heroes.v1/movement/shifting');
    expect(result.log.some((entry) => entry.kind === 'warning')).toBe(false);
  });

  it("a slowed creature's Disengage warns with slowed's own sentence, and still happens", () => {
    // The gate cites a rule that never names Disengage: slowed prints its
    // bar on SHIFTING, and Disengage is a shift.
    const slowed = applyCondition(onHeroTurn(), 'hero', SLOWED);
    const result = dispatchChecked(slowed, useCommonAction('hero', DISENGAGE));
    const warning = result.log.find(
      (entry) => entry.kind === 'warning' && entry.data.commonActionEligibility !== undefined,
    );
    expect(warning?.message).toContain("they can't shift");
    expect(warning?.canonRefs).toContain(SLOWED);
    // Permissive engine: warned, applied, Director adjudicates.
    expect(result.state.participants.hero?.actionBudget['move-action']?.used).toBe(1);
  });

  it('Disengage is the free-triggered-action dispatch its callers print', () => {
    // "the same artifact id legitimately dispatches at two different costs
    // depending on which printed rule invoked it" — Ride and Dancer print
    // Disengage as a free triggered action.
    const result = dispatchChecked(
      onHeroTurn(),
      useCommonAction('warrior', DISENGAGE, { actionCost: 'free-triggered-action' }),
    );
    // No budget consumed, and it does not count against the one triggered
    // action per round.
    expect(result.state.participants.warrior?.actionBudget['move-action']).toBeUndefined();
    expect(result.state.participants.warrior?.triggeredThisRound).toBe(0);
    const receipt = result.log[0]?.data.commonActionResolution as Record<string, unknown>;
    expect((receipt.commonAction as Record<string, unknown>).actionCostSource).toBe('dispatch');
  });

  it('Charge debits one main action and records the composed child it declares', () => {
    const result = dispatchChecked(
      onHeroTurn(),
      useCommonAction('hero', CHARGE, {
        targets: ['warrior'],
        composes: {
          abilityArtifactId: 'mcdm.heroes.v1/feature.ability.common/melee-weapon-free-strike',
          keywords: MELEE_WEAPON_FREE_STRIKE.keywords,
        },
      }),
    );
    expect(result.state.participants.hero?.actionBudget['main-action']).toEqual({
      used: 1,
      granted: 0,
    });
    const composes = result.log.find((entry) => entry.data.commonActionComposes !== undefined);
    expect(composes?.kind).toBe('table-directive');
    expect(composes?.data.commonActionComposes).toEqual({
      featureArtifactId: 'mcdm.heroes.v1/feature.common.main-actions/charge',
      abilityArtifactId: 'mcdm.heroes.v1/feature.ability.common/melee-weapon-free-strike',
      viaSubstituteKeyword: null,
    });
    expect(result.log.some((entry) => entry.kind === 'warning')).toBe(false);
  });

  it('admits a substitute by the printed Charge keyword', () => {
    // "If the creature has an ability with the Charge keyword, they can use
    // that ability against the target instead of a free strike."
    const result = dispatchChecked(
      onHeroTurn(),
      useCommonAction('warrior', CHARGE, {
        targets: ['hero'],
        composes: SPEAR_CHARGE_COMPOSES,
      }),
    );
    expect(
      (
        result.log.find((entry) => entry.data.commonActionComposes !== undefined)?.data
          .commonActionComposes as Record<string, unknown>
      ).viaSubstituteKeyword,
    ).toBe('Charge');
    // No COMPOSITION warning. (The goblin warrior is acting off the hero's
    // turn here, so the ordinary off-turn economy warn is expected and is
    // not what this case is about.)
    expect(
      result.log.some(
        (entry) => entry.kind === 'warning' && entry.data.commonActionComposes !== undefined,
      ),
    ).toBe(false);
  });

  it('warns — and applies — when the composed child satisfies neither printed arm', () => {
    const result = dispatchChecked(
      onHeroTurn(),
      useCommonAction('hero', CHARGE, { targets: ['warrior'], composes: KNOCKBACK_COMPOSES }),
    );
    const warning = result.log.find(
      (entry) => entry.kind === 'warning' && entry.data.commonActionComposes !== undefined,
    );
    expect(warning?.message).toContain('an ability with the Charge keyword');
    expect(result.state.participants.hero?.actionBudget['main-action']?.used).toBe(1);
  });

  it('Charge and its child strike cost ONE main action across both dispatches', () => {
    let state = onHeroTurn();
    const charge = dispatchChecked(
      state,
      useCommonAction('hero', CHARGE, {
        targets: ['warrior'],
        composes: {
          abilityArtifactId: 'mcdm.heroes.v1/feature.ability.common/melee-weapon-free-strike',
          keywords: MELEE_WEAPON_FREE_STRIKE.keywords,
        },
      }),
    );
    state = charge.state;
    expect(state.participants.hero?.actionBudget['main-action']?.used).toBe(1);

    const strike = dispatchChecked(state, {
      intentId: nextId('charge-strike'),
      kind: 'use-ability',
      actor: { kind: 'participant', participantId: 'hero' },
      payload: {
        actorParticipantId: 'hero',
        ability: MELEE_WEAPON_FREE_STRIKE,
        targets: ['warrior'],
        dice: [5, 5],
        characteristicChoice: 'A',
        damageCharacteristicChoice: 'A',
        partOf: charge.log[0]?.intentId,
      },
    } as Intent);
    // The child consumes the parent's already-debited main action…
    expect(strike.state.participants.hero?.actionBudget['main-action']).toEqual({
      used: 1,
      granted: 0,
    });
    // …and still records its own use of the strike ability.
    expect(
      strike.state.participants.hero?.abilityUses[
        'mcdm.heroes.v1/feature.ability.common/melee-weapon-free-strike'
      ]?.round,
    ).toBe(1);
  });

  it('declaring no composed child adds no receipt', () => {
    const result = dispatchChecked(
      onHeroTurn(),
      useCommonAction('hero', CHARGE, { targets: ['warrior'] }),
    );
    expect(result.log.some((entry) => entry.data.commonActionComposes !== undefined)).toBe(false);
    // The printed sentence still rides verbatim in the action's directive.
    const directive = result.log.find((entry) => entry.data.manualCommonAction !== undefined);
    expect(directive?.message).toContain('Charge keyword');
  });
});

describe('wave 5 — Knockback and the one forced-movement receipt', () => {
  it('the prose arm surfaces the printed targeting rule and takes no debit', () => {
    const result = dispatchChecked(
      onHeroTurn(),
      useCommonAction('hero', KNOCKBACK, { targets: ['warrior'] }),
    );
    // Companion-paid: the maneuver is on the companion's header cell.
    expect(result.state.participants.hero?.actionBudget.maneuver).toBeUndefined();
    const directive = result.log.find((entry) => entry.data.commonActionEligibility !== undefined);
    expect(directive?.kind).toBe('table-directive');
    // Quoted from the COMPANION ability, which is where the rule is printed.
    expect(directive?.message).toContain(
      'You can usually target only creatures of your size or smaller',
    );
    expect(directive?.canonRefs).toContain('mcdm.heroes.v1/rule.character/size');
  });

  it('the companion pays the one maneuver and its outcome is a corrected receipt', () => {
    let state = onHeroTurn();
    const prose = dispatchChecked(
      state,
      useCommonAction('hero', KNOCKBACK, { targets: ['warrior'] }),
    );
    state = prose.state;

    const payload = {
      actorParticipantId: 'hero',
      ability: KNOCKBACK_ABILITY,
      targets: ['warrior'],
      dice: [5, 5] as [number, number],
    };
    const rolled = dispatchChecked(state, {
      intentId: nextId('knockback'),
      kind: 'use-ability',
      actor: { kind: 'participant', participantId: 'hero' },
      payload,
    } as Intent);
    expect(rolled.state.participants.hero?.actionBudget.maneuver).toEqual({
      used: 1,
      granted: 0,
    });

    // dice [5,5] + Might -2 = 8 → tier 1 → Push 1 [verbatim Knockback].
    const commit = dispatchChecked(rolled.state, {
      intentId: nextId('commit'),
      kind: 'commit-resolution',
      actor: { kind: 'director' },
      payload: { resolutionId: rolled.state.resolutionStack[0]?.resolutionId, payload },
    } as Intent);
    const push = commit.log.find((entry) => entry.data.forcedMovement !== undefined);
    expect(push?.kind).toBe('table-directive');
    expect(push?.data.forcedMovement).toEqual({
      targetId: 'warrior',
      kind: 'push',
      distance: 1,
      printedDistance: 1,
      unappliedModifiers: ['stability', 'big-versus-little', 'ability-specific'],
    });
    // The number is never presented as final.
    expect(push?.message).toContain('is the printed tier distance, unmodified');
    expect(push?.canonRefs).toContain('mcdm.heroes.v1/rule.character/stability');
    // Nothing moved: forced movement is a receipt, not a position.
    expect(commit.state.participants.warrior?.stamina?.current).toBe(15);
  });

  it('the squad path emits the identical receipt from the same builder', () => {
    const context = { intentId: 'i-1', actor: { kind: 'director' as const } };
    const fromAbilityPath = forcedMovementDirective(context, {
      moverId: 'hero',
      targetId: 'warrior',
      movement: { kind: 'push', distance: 2 },
      abilityArtifactId: KNOCKBACK_ABILITY.abilityArtifactId,
    });
    // One builder, so the two call sites cannot drift on the very sentence
    // added to stop a bare number reading as authoritative.
    expect(fromAbilityPath.message).toContain('2 is the printed tier distance, unmodified');
    expect(fromAbilityPath.canonRefs).toEqual([
      KNOCKBACK_ABILITY.abilityArtifactId,
      'mcdm.heroes.v1/movement/forced-movement',
      'mcdm.heroes.v1/rule.character/stability',
      'mcdm.heroes.v1/rule.character/size',
    ]);
  });
});

describe('Stand Up — wave 6 (S12 + S11)', () => {
  const PRONE = 'mcdm.heroes.v1/condition/prone';
  const RESTRAINED = 'mcdm.heroes.v1/condition/restrained';
  const BLEEDING = 'mcdm.heroes.v1/condition/bleeding';
  const DYING = 'mcdm.heroes.v1/rule.health/dying';

  /** Impose a condition with no imposing ability named — a bare Director
   * assertion, which keeps the R-0001 imposer free maneuver out of the
   * picture so the maneuver under test is Stand Up's own. */
  function impose(
    state: EncounterState,
    targetId: string,
    conditionId = PRONE,
  ): { state: EncounterState; instanceId: string } {
    const applied = dispatchChecked(state, {
      intentId: nextId('impose'),
      kind: 'apply-condition',
      actor: { kind: 'director' },
      payload: {
        target: targetId,
        conditionId,
        ending: { kind: 'external' },
        source: { participantId: 'warrior' },
      },
    } as Intent);
    const instance = applied.state.participants[targetId]?.conditions.find(
      (candidate) => candidate.conditionId === conditionId,
    );
    expect(instance).toBeDefined();
    return { state: applied.state, instanceId: instance?.instanceId ?? '' };
  }

  it('branch A: a prone creature stands up, ending the instance the dispatch named', () => {
    const { state, instanceId } = impose(onHeroTurn(), 'hero');
    const result = dispatchChecked(
      state,
      useCommonAction('hero', STAND_UP, {
        targets: ['hero'],
        endedInstances: { hero: [instanceId] },
      }),
    );
    expect(result.state.participants.hero?.conditions).toHaveLength(0);
    expect(result.state.participants.hero?.actionBudget.maneuver).toEqual({ used: 1, granted: 0 });
    const removal = result.log.find((entry) => entry.data.removedInstanceIds !== undefined);
    expect(removal?.kind).toBe('mutation');
    expect(removal?.canonRefs).toContain(PRONE);
    // Every printed precondition of the branch taken holds, so nothing warns
    // and nothing is routed to the table.
    expect(result.log.some((entry) => entry.kind === 'warning')).toBe(false);
    expect(result.log.some((entry) => entry.data.commonActionEligibility !== undefined)).toBe(
      false,
    );
  });

  it('branch B: the actor pays the one printed maneuver; the standee pays nothing', () => {
    // "Alternatively, they can use this maneuver to make a willing adjacent
    // prone creature stand up." — one maneuver, and the artifact attributes
    // it to the user.
    const { state, instanceId } = impose(onHeroTurn(), 'ally');
    const result = dispatchChecked(
      state,
      useCommonAction('hero', STAND_UP, {
        targets: ['ally'],
        alternative: 'ally-stands-up',
        endedInstances: { ally: [instanceId] },
        spatialFacts: [{ fact: 'adjacent', a: 'hero', b: 'ally', holds: true }],
        willing: { ally: true },
      }),
    );
    expect(result.state.participants.ally?.conditions).toHaveLength(0);
    expect(result.state.participants.hero?.actionBudget.maneuver).toEqual({ used: 1, granted: 0 });
    expect(result.state.participants.ally?.actionBudget.maneuver).toBeUndefined();
    expect(result.log.some((entry) => entry.kind === 'warning')).toBe(false);
    // With adjacency and consent both asserted, the branch's precondition is
    // plainly met — no table directive.
    expect(result.log.some((entry) => entry.data.commonActionEligibility !== undefined)).toBe(
      false,
    );
  });

  it('the printed branch selects which preconditions are read at all', () => {
    // Branch A must not be told the standee is not adjacent to themself,
    // and must not be asked for their own consent: the alternative's
    // sentence is not the sentence being taken.
    const { state, instanceId } = impose(onHeroTurn(), 'hero');
    const primary = dispatchChecked(
      state,
      useCommonAction('hero', STAND_UP, {
        targets: ['hero'],
        endedInstances: { hero: [instanceId] },
      }),
    );
    expect(primary.log.some((entry) => entry.data.commonActionEligibility !== undefined)).toBe(
      false,
    );

    // The same dispatch declared as the alternative reads the alternative's
    // sentence instead, and now asks for two things the table has not said.
    const alternative = dispatchChecked(
      state,
      useCommonAction('hero', STAND_UP, {
        targets: ['hero'],
        alternative: 'ally-stands-up',
        endedInstances: { hero: [instanceId] },
      }),
    );
    const reading = alternative.log.find(
      (entry) => entry.data.commonActionEligibility !== undefined,
    );
    expect(reading?.kind).toBe('table-directive');
    expect(reading?.message).toContain('willing adjacent prone creature');
  });

  it('"willing" is read from the ONE consent field, tri-state', () => {
    const { state, instanceId } = impose(onHeroTurn(), 'ally');
    const dispatchWith = (willing: Record<string, boolean>) =>
      dispatchChecked(
        state,
        useCommonAction('hero', STAND_UP, {
          targets: ['ally'],
          alternative: 'ally-stands-up',
          endedInstances: { ally: [instanceId] },
          spatialFacts: [{ fact: 'adjacent', a: 'hero', b: 'ally', holds: true }],
          willing,
        }),
      );

    // Not asserted is UNKNOWN, not refused — the subject's controller has
    // simply not spoken, and the engine does not answer for them.
    const unasserted = dispatchWith({});
    const unknown = unasserted.log.find(
      (entry) => entry.data.commonActionEligibility !== undefined,
    );
    expect(unknown?.kind).toBe('table-directive');
    expect(
      (unknown?.data.commonActionEligibility as { verdict: unknown } | undefined)?.verdict,
    ).toBe('unknown');

    // Asserted-false is a violated printed precondition: a warning, and the
    // action still happens [R-0030].
    const refused = dispatchWith({ ally: false });
    const violated = refused.log.find((entry) => entry.data.commonActionEligibility !== undefined);
    expect(violated?.kind).toBe('warning');
    expect(refused.state.participants.ally?.conditions).toHaveLength(0);
  });

  it('restrained bars the ACTOR from using Stand Up, and says nothing about the standee', () => {
    // The role proof: `restrained` prints its bar on USING the maneuver.
    const proned = impose(onHeroTurn(), 'ally');
    const restrainedActor = impose(proned.state, 'hero', RESTRAINED).state;
    const barred = dispatchChecked(
      restrainedActor,
      useCommonAction('hero', STAND_UP, {
        targets: ['ally'],
        alternative: 'ally-stands-up',
        endedInstances: { ally: [proned.instanceId] },
        spatialFacts: [{ fact: 'adjacent', a: 'hero', b: 'ally', holds: true }],
        willing: { ally: true },
      }),
    );
    const warning = barred.log.find((entry) => entry.kind === 'warning');
    expect(warning?.message).toContain("can't use the Stand Up maneuver");
    // Permissive: warned, and applied anyway.
    expect(barred.state.participants.ally?.conditions).toHaveLength(0);

    // A restrained STANDEE draws no such warning — the printed sentence is
    // about using the maneuver, and whether it reaches the target role is
    // an open ruling, not something the gate decides quietly.
    const restrainedStandee = impose(proned.state, 'ally', RESTRAINED).state;
    const allowed = dispatchChecked(
      restrainedStandee,
      useCommonAction('hero', STAND_UP, {
        targets: ['ally'],
        alternative: 'ally-stands-up',
        endedInstances: { ally: [proned.instanceId] },
        spatialFacts: [{ fact: 'adjacent', a: 'hero', b: 'ally', holds: true }],
        willing: { ally: true },
      }),
    );
    expect(allowed.log.some((entry) => entry.kind === 'warning')).toBe(false);
  });

  it('refuses when the dispatch names no instance — the engine never picks', () => {
    // The printed clause names a CONDITION; the engine's unit of removal is
    // an INSTANCE. Which one ends when a creature carries several is an open
    // ruling, so an unanswered dispatch has nothing coherent to apply.
    const { state } = impose(onHeroTurn(), 'hero');
    const result = dispatchChecked(state, useCommonAction('hero', STAND_UP, { targets: ['hero'] }));
    expect(result.log).toHaveLength(1);
    expect(result.log[0]?.kind).toBe('refusal');
    expect(result.log[0]?.message).toContain('which instance(s) end is dispatch-supplied');
    expect(result.state).toEqual(state);
  });

  it('refuses an unknown instance BEFORE the debit', () => {
    const { state } = impose(onHeroTurn(), 'hero');
    const result = dispatchChecked(
      state,
      useCommonAction('hero', STAND_UP, {
        targets: ['hero'],
        endedInstances: { hero: ['no-such-instance'] },
      }),
    );
    expect(result.log).toHaveLength(1);
    expect(result.log[0]?.kind).toBe('refusal');
    // Byte-identical: no maneuver was spent for a removal that never happened.
    expect(result.state).toEqual(state);
  });

  it('warns, and applies, when the named instance is a different condition', () => {
    // A Director override, not an incoherent payload — but the receipt must
    // never read as though the printed clause licensed it.
    const proned = impose(onHeroTurn(), 'hero');
    const restrained = impose(proned.state, 'hero', RESTRAINED);
    const result = dispatchChecked(
      restrained.state,
      useCommonAction('hero', STAND_UP, {
        targets: ['hero'],
        endedInstances: { hero: [restrained.instanceId] },
      }),
    );
    const warning = result.log.find((entry) => entry.data.endedConditionMismatch !== undefined);
    expect(warning?.kind).toBe('warning');
    expect(warning?.data.endedConditionMismatch).toEqual({
      targetId: 'hero',
      instanceId: restrained.instanceId,
      printedConditionId: PRONE,
      endedConditionId: RESTRAINED,
    });
    const remaining = result.state.participants.hero?.conditions ?? [];
    expect(remaining.map((instance) => instance.conditionId)).toEqual([PRONE]);
  });

  it('asks the ONE removal blocker: R-0004 bleeding survives, and siblings proceed', () => {
    // The dying-mandated bleeding "can't be negated or removed in any way
    // until you are no longer dying". The resolution executor is removal's
    // second dispatch surface and it must not re-derive that predicate.
    const start = onHeroTurn();
    const dying = dispatchChecked(start, {
      intentId: nextId('damage'),
      kind: 'apply-damage',
      actor: { kind: 'director' },
      payload: {
        target: 'hero',
        amount: 15,
        reason: 'seeded damage to reach the dying band',
        rolled: false,
        sourceId: 'warrior',
      },
    } as Intent).state;
    const bleeding = dying.participants.hero?.conditions.find(
      (instance) => instance.conditionId === BLEEDING,
    );
    expect(bleeding?.source.effectArtifactId).toBe(DYING);

    const allyProne = impose(dying, 'ally');
    const result = dispatchChecked(
      allyProne.state,
      useCommonAction('hero', STAND_UP, {
        targets: ['hero', 'ally'],
        alternative: 'ally-stands-up',
        endedInstances: {
          hero: [bleeding?.instanceId ?? ''],
          ally: [allyProne.instanceId],
        },
        spatialFacts: [
          { fact: 'adjacent', a: 'hero', b: 'hero', holds: true },
          { fact: 'adjacent', a: 'hero', b: 'ally', holds: true },
        ],
        willing: { hero: true, ally: true },
      }),
    );
    const refused = result.log.find((entry) => entry.kind === 'refusal');
    expect(refused?.message).toContain('still dying');
    expect(refused?.data.perBinding).toBe(true);
    // Per-binding: the sibling target's removal still happened.
    expect(
      result.state.participants.hero?.conditions.some(
        (instance) => instance.instanceId === bleeding?.instanceId,
      ),
    ).toBe(true);
    expect(result.state.participants.ally?.conditions).toHaveLength(0);
  });

  it('rejects an endedInstances payload that names an undeclared target', () => {
    const { state, instanceId } = impose(onHeroTurn(), 'hero');
    expect(() =>
      applyIntent(
        state,
        useCommonAction('hero', STAND_UP, {
          targets: ['hero'],
          endedInstances: { hero: [instanceId], ally: [instanceId] },
        }),
        { random: createSeededRandomSource(1) },
      ),
    ).toThrow();

    // And an action whose printed clause ends nothing may not carry one.
    expect(() =>
      applyIntent(
        state,
        useCommonAction('hero', ADVANCE, { endedInstances: { hero: [instanceId] } }),
        { random: createSeededRandomSource(1) },
      ),
    ).toThrow();
  });
});

describe('Heal — wave 7 (S10)', () => {
  const WEAKENED = 'mcdm.heroes.v1/condition/weakened';
  const SAVING_THROW_RULE = 'mcdm.heroes.v1/rule.general/saving-throw';
  const BLEEDING = 'mcdm.heroes.v1/condition/bleeding';
  const DYING = 'mcdm.heroes.v1/rule.health/dying';

  function impose(
    state: EncounterState,
    targetId: string,
    ending: { kind: 'save-ends' } | { kind: 'external' } = { kind: 'save-ends' },
    conditionId = WEAKENED,
  ): { state: EncounterState; instanceId: string } {
    const applied = dispatchChecked(state, {
      intentId: nextId('impose'),
      kind: 'apply-condition',
      actor: { kind: 'director' },
      payload: {
        target: targetId,
        conditionId,
        ending,
        source: { participantId: 'warrior' },
      },
    } as Intent);
    const instance = applied.state.participants[targetId]?.conditions.find(
      (candidate) => candidate.conditionId === conditionId,
    );
    expect(instance).toBeDefined();
    return { state: applied.state, instanceId: instance?.instanceId ?? '' };
  }

  it('the Recovery branch is the SAME shipped offer Catch Breath uses', () => {
    // "The target creature can spend a Recovery to regain Stamina" — no
    // amount is printed and none is compiled; `spendRecovery` owns recovery
    // value [rule.health/recoveries]. Goblin warrior staminaMax 15 → 5.
    const start = onHeroTurn();
    const hurt = dispatchChecked(start, {
      intentId: nextId('damage'),
      kind: 'apply-damage',
      actor: { kind: 'director' },
      payload: {
        target: 'ally',
        amount: 9,
        reason: 'seeded damage',
        rolled: false,
        sourceId: 'warrior',
      },
    } as Intent).state;
    expect(hurt.participants.ally?.stamina?.current).toBe(6);

    const result = dispatchChecked(
      hurt,
      useCommonAction('hero', HEAL, {
        targets: ['ally'],
        recoverySpends: { ally: true },
        spatialFacts: [{ fact: 'adjacent', a: 'hero', b: 'ally', holds: true }],
      }),
    );
    expect(result.state.participants.ally?.stamina?.current).toBe(11);
    expect(result.state.participants.ally?.stamina?.recoveries).toBe(7);
    // One printed main action, the healer's. The target pays nothing —
    // whether the target's half costs them anything is an open ruling
    // (design §6.6 Heal S10), and the artifact prints one main action.
    expect(result.state.participants.hero?.actionBudget['main-action']).toEqual({
      used: 1,
      granted: 0,
    });
    expect(result.state.participants.ally?.actionBudget['main-action']).toBeUndefined();
    expect(result.log.some((entry) => entry.kind === 'warning')).toBe(false);
  });

  it('the saving-throw branch resolves through the one saving-throw home', () => {
    const { state, instanceId } = impose(onHeroTurn(), 'ally');
    const result = dispatchChecked(
      state,
      useCommonAction('hero', HEAL, {
        targets: ['ally'],
        alternative: 'saving-throw',
        savingThrows: { ally: { instanceId, roll: SAVING_THROW.success } },
        spatialFacts: [{ fact: 'adjacent', a: 'hero', b: 'ally', holds: true }],
      }),
    );
    expect(result.state.participants.ally?.conditions).toHaveLength(0);
    const save = result.log.find((entry) => entry.data.removedInstanceIds !== undefined);
    expect(save?.canonRefs).toContain(SAVING_THROW_RULE);
    // Still one printed main action, whichever branch was taken.
    expect(result.state.participants.hero?.actionBudget['main-action']).toEqual({
      used: 1,
      granted: 0,
    });

    // Below the printed threshold the effect continues, and nothing is
    // removed.
    const failed = dispatchChecked(
      state,
      useCommonAction('hero', HEAL, {
        targets: ['ally'],
        alternative: 'saving-throw',
        savingThrows: { ally: { instanceId, roll: SAVING_THROW.success - 1 } },
        spatialFacts: [{ fact: 'adjacent', a: 'hero', b: 'ally', holds: true }],
      }),
    );
    expect(failed.state.participants.ally?.conditions).toHaveLength(1);
    expect(failed.log.some((entry) => entry.message.includes('fails the saving throw'))).toBe(true);
  });

  it('the branch selects the resolution, and its inputs are validated against THAT branch', () => {
    // The defect this guards: if the payload's well-formedness rules read
    // the action's primary resolution while the arm ran the branch's, each
    // branch's inputs would be checked against the other branch's kind.
    const { state, instanceId } = impose(onHeroTurn(), 'ally');

    // Recovery inputs on the saving-throw branch: rejected FOR BEING
    // Recovery inputs. Asserting the message is what makes this
    // discriminating — reading the primary resolution would reject this
    // dispatch too, but for the other field.
    expect(() =>
      applyIntent(
        state,
        useCommonAction('hero', HEAL, {
          targets: ['ally'],
          alternative: 'saving-throw',
          savingThrows: { ally: { instanceId } },
          recoverySpends: { ally: true },
        }),
        { random: createSeededRandomSource(1) },
      ),
    ).toThrow(/recoverySpends applies only to spend-recovery resolutions/);

    // Saving-throw inputs on the primary branch: rejected for being
    // saving-throw inputs.
    expect(() =>
      applyIntent(
        state,
        useCommonAction('hero', HEAL, {
          targets: ['ally'],
          recoverySpends: { ally: false },
          savingThrows: { ally: { instanceId } },
        }),
        { random: createSeededRandomSource(1) },
      ),
    ).toThrow(/savingThrows applies only to saving-throw resolutions/);
  });

  it('auto-rolls from the injected source when the table asserts no roll', () => {
    const { state, instanceId } = impose(onHeroTurn(), 'ally');
    const result = dispatchChecked(
      state,
      useCommonAction('hero', HEAL, {
        targets: ['ally'],
        alternative: 'saving-throw',
        savingThrows: { ally: { instanceId } },
        spatialFacts: [{ fact: 'adjacent', a: 'hero', b: 'ally', holds: true }],
      }),
      7,
    );
    const expected = createSeededRandomSource(7).roll(SAVING_THROW.die);
    expect(result.state.participants.ally?.conditions).toHaveLength(
      expected >= SAVING_THROW.success ? 0 : 1,
    );
  });

  it('refuses when no effect is named — the engine never picks which one', () => {
    // "against ONE effect they are suffering": which one is the table's,
    // and who chooses is itself an open ruling (design §6.6 Heal S2).
    const { state } = impose(onHeroTurn(), 'ally');
    const result = dispatchChecked(
      state,
      useCommonAction('hero', HEAL, { targets: ['ally'], alternative: 'saving-throw' }),
    );
    expect(result.log).toHaveLength(1);
    expect(result.log[0]?.kind).toBe('refusal');
    expect(result.log[0]?.message).toContain('the selection is dispatch-supplied');
    expect(result.state).toEqual(state);
  });

  it('refuses an unknown instance BEFORE the debit', () => {
    const { state } = impose(onHeroTurn(), 'ally');
    const result = dispatchChecked(
      state,
      useCommonAction('hero', HEAL, {
        targets: ['ally'],
        alternative: 'saving-throw',
        savingThrows: { ally: { instanceId: 'no-such-instance' } },
      }),
    );
    expect(result.log).toHaveLength(1);
    expect(result.log[0]?.kind).toBe('refusal');
    expect(result.state).toEqual(state);
  });

  it('warns, and rolls anyway, against an effect no saving throw ends', () => {
    // A Director override, not an incoherent payload: the d10 and its
    // threshold are defined either way. The receipt records the ending the
    // instance actually carries.
    const { state, instanceId } = impose(onHeroTurn(), 'ally', { kind: 'external' });
    const result = dispatchChecked(
      state,
      useCommonAction('hero', HEAL, {
        targets: ['ally'],
        alternative: 'saving-throw',
        savingThrows: { ally: { instanceId, roll: SAVING_THROW.success } },
        spatialFacts: [{ fact: 'adjacent', a: 'hero', b: 'ally', holds: true }],
      }),
    );
    const warning = result.log.find((entry) => entry.data.savingThrowEndingMismatch !== undefined);
    expect(warning?.kind).toBe('warning');
    expect(warning?.data.savingThrowEndingMismatch).toEqual({
      targetId: 'ally',
      instanceId,
      ending: 'external',
    });
    expect(result.state.participants.ally?.conditions).toHaveLength(0);
  });

  it('asks the ONE removal blocker on a successful save', () => {
    // R-0004: the dying-mandated bleeding "can't be negated or removed in
    // any way until you are no longer dying". A save that succeeds still
    // routes its removal through the one home, so the third surface cannot
    // bypass it.
    const dying = dispatchChecked(onHeroTurn(), {
      intentId: nextId('damage'),
      kind: 'apply-damage',
      actor: { kind: 'director' },
      payload: {
        target: 'ally',
        amount: 15,
        reason: 'seeded damage to reach the dying band',
        rolled: false,
        sourceId: 'warrior',
      },
    } as Intent).state;
    const bleeding = dying.participants.ally?.conditions.find(
      (instance) => instance.conditionId === BLEEDING,
    );
    expect(bleeding?.source.effectArtifactId).toBe(DYING);

    const result = dispatchChecked(
      dying,
      useCommonAction('hero', HEAL, {
        targets: ['ally'],
        alternative: 'saving-throw',
        savingThrows: {
          ally: { instanceId: bleeding?.instanceId ?? '', roll: SAVING_THROW.success },
        },
        spatialFacts: [{ fact: 'adjacent', a: 'hero', b: 'ally', holds: true }],
      }),
    );
    const refused = result.log.find((entry) => entry.kind === 'refusal');
    expect(refused?.message).toContain('still dying');
    expect(refused?.data.perBinding).toBe(true);
    expect(
      result.state.participants.ally?.conditions.some(
        (instance) => instance.instanceId === bleeding?.instanceId,
      ),
    ).toBe(true);
  });

  it('surfaces the printed adjacency precondition when the table has not asserted it', () => {
    const { state } = impose(onHeroTurn(), 'ally');
    const result = dispatchChecked(
      state,
      useCommonAction('hero', HEAL, { targets: ['ally'], recoverySpends: { ally: false } }),
    );
    const reading = result.log.find((entry) => entry.data.commonActionEligibility !== undefined);
    expect(reading?.kind).toBe('table-directive');
    expect(reading?.message).toContain('adjacent creature feel better');
  });
});

describe('Make or Assist a Test — wave 9 (S9 + S20)', () => {
  const MOA = MAKE_OR_ASSIST_A_TEST;
  const ASSIST_A_TEST = 'mcdm.heroes.v1/chapter/tests#assist-a-test';
  const REACTIVE_TEST = 'mcdm.heroes.v1/rule.test/reactive-test';
  const TEST_RULE = 'mcdm.heroes.v1/rule.test/test';

  /** The goblin-warrior fixture's Reason is 0, so the dice ARE the total. */
  function madeTest(
    overrides: Record<string, unknown> = {},
    test: Record<string, unknown> = {},
  ): Intent {
    return useCommonAction('hero', MOA, {
      ordinaryTest: { characteristic: 'reason', difficulty: 'medium', dice: [6, 6], ...test },
      ...overrides,
    });
  }

  function rollReceipt(result: ApplyResult): {
    entry: (typeof result.log)[number] | undefined;
    roll: { rollerId: string; resolution: { tier: number; total: number; bonusTotal: number } };
  } {
    const entry = result.log.find((item) => item.data.testRoll !== undefined);
    return {
      entry,
      roll: entry?.data.testRoll as {
        rollerId: string;
        resolution: { tier: number; total: number; bonusTotal: number };
      },
    };
  }

  function outcomeReceipt(result: ApplyResult): {
    entry: (typeof result.log)[number] | undefined;
    outcome: Record<string, unknown>;
  } {
    const entry = result.log.find((item) => item.data.testOutcome !== undefined);
    return { entry, outcome: entry?.data.testOutcome as Record<string, unknown> };
  }

  it('a made test debits the printed maneuver, rolls the ACTOR, and reads the outcome table', () => {
    const result = dispatchChecked(onHeroTurn(), madeTest());
    expect(result.state.participants.hero?.actionBudget.maneuver).toEqual({ used: 1, granted: 0 });

    // The roller is the actor — not a target (a made test names none).
    const { entry, roll } = rollReceipt(result);
    expect(roll.rollerId).toBe('hero');
    expect(roll.resolution.tier).toBe(2);
    // An ordinary test is NOT a reactive test [R-0009, R-0010]: the roll
    // cites rule.test/test and never the reactive-test rule.
    expect(entry?.canonRefs).toContain(TEST_RULE);
    expect(entry?.canonRefs).not.toContain(REACTIVE_TEST);

    // 12-16 on a medium test: "Success with a consequence" — a directive,
    // never a state change. The engine narrates nothing.
    const { entry: directive, outcome } = outcomeReceipt(result);
    expect(directive?.kind).toBe('table-directive');
    expect(directive?.canonRefs).toContain(TEST_OUTCOME_CANON.testDifficulty);
    expect(outcome).toMatchObject({
      rollerId: 'hero',
      difficulty: 'medium',
      tier: 2,
      outcome: 'success-with-consequence',
      label: TEST_OUTCOME_LABEL['success-with-consequence'],
      success: true,
    });
    expect(result.state.participants.hero?.stamina).toEqual(
      onHeroTurn().participants.hero?.stamina,
    );
    expect(result.log.some((item) => item.kind === 'warning')).toBe(false);

    // A test is a power roll [R-0006]: the roll occurrence derives with no
    // resolution-stack entry, from the SAME claim key the reactive path emits.
    const occurrences = deriveOccurrences(result.log, { intentId: 'x', round: 1 });
    expect(occurrences).toContainEqual(
      expect.objectContaining({ kind: 'roll-made', actorId: 'hero', resolutionId: null, tier: 2 }),
    );
  });

  it("the printed cost is the DISPATCH's — a main action or a free maneuver, by the Director's call", () => {
    // "Complex or time-consuming tests might require a main action if made
    // in combat" — the group directory's default is overridden, and the
    // receipt records where the effective cost came from.
    const main = dispatchChecked(onHeroTurn(), madeTest({ actionCost: 'main-action' }));
    expect(main.state.participants.hero?.actionBudget['main-action']).toEqual({
      used: 1,
      granted: 0,
    });
    expect(main.state.participants.hero?.actionBudget.maneuver).toBeUndefined();
    const receipt = main.log.find((item) => item.data.commonActionResolution !== undefined)?.data
      .commonActionResolution as { commonAction: Record<string, unknown> };
    expect(receipt.commonAction).toMatchObject({
      actionCost: 'main-action',
      actionCostSource: 'dispatch',
      actionCostGroupDefault: 'maneuver',
    });
    // "Other tests that take no time at all … are usually free maneuvers
    // in combat" — no budget counter moves.
    const free = dispatchChecked(onHeroTurn(), madeTest({ actionCost: 'free-maneuver' }));
    expect(free.state.participants.hero?.actionBudget.maneuver).toBeUndefined();
    expect(free.state.participants.hero?.actionBudget['main-action']).toBeUndefined();
    expect(free.log.some((item) => item.kind === 'warning')).toBe(false);
  });

  it('a secret difficulty reports the tier and leaves the outcome to the Director', () => {
    // "The Director can also keep a test's difficulty secret until after the
    // player rolls the test" — the engine reads no table cell.
    const result = dispatchChecked(onHeroTurn(), madeTest({}, { difficulty: null }));
    const { entry, outcome } = outcomeReceipt(result);
    expect(entry?.kind).toBe('table-directive');
    expect(entry?.message).toContain('Test Difficulty Outcomes Table');
    expect(outcome).toMatchObject({ difficulty: null, tier: 2, outcome: null, label: null });
  });

  it('a natural 19 or 20 floors the outcome at "Success with a reward" even on a hard test', () => {
    const result = dispatchChecked(
      onHeroTurn(),
      madeTest({}, { difficulty: 'hard', dice: [10, 9] }),
    );
    const { entry, outcome } = outcomeReceipt(result);
    expect(outcome).toMatchObject({
      difficulty: 'hard',
      naturalTopEnd: true,
      outcome: 'success-with-reward',
      success: true,
    });
    expect(entry?.canonRefs).toContain(TEST_OUTCOME_CANON.natural1920);
    // …and the roll's own critical-success receipt still fires, from the
    // one home, with the table's own label.
    const crit = result.log.find(
      (item) => (item.data.testCriticalSuccess as { rollerId?: string })?.rollerId === 'hero',
    );
    expect(crit?.message).toContain(TEST_OUTCOME_LABEL['success-with-reward'].toLowerCase());
    // Hard at 12-16 without the natural: "Failure".
    const plain = dispatchChecked(onHeroTurn(), madeTest({}, { difficulty: 'hard', dice: [8, 6] }));
    expect(outcomeReceipt(plain).outcome).toMatchObject({ outcome: 'failure', success: false });
  });

  it('the +2 skill bonus is an asserted attributed modifier, never an engine constant', () => {
    // "If the Director agrees the skill applies, the hero gains a +2 bonus
    // to the roll" — the engine has no skill model; the Director asserts it.
    const without = dispatchChecked(onHeroTurn(), madeTest({}, { dice: [5, 5] }));
    expect(rollReceipt(without).roll.resolution.tier).toBe(1);
    const withSkill = dispatchChecked(
      onHeroTurn(),
      madeTest(
        {},
        { dice: [5, 5], bonuses: [{ value: 2, reason: 'Director: the Alchemy skill applies' }] },
      ),
    );
    const { roll } = rollReceipt(withSkill);
    expect(roll.resolution.bonusTotal).toBe(2);
    expect(roll.resolution.total).toBe(12);
    expect(roll.resolution.tier).toBe(2);
  });

  it('consumes a pending "next power roll" grant and leaves a "next strike" grant dormant [R-0013]', () => {
    const state = onHeroTurn();
    const granted = dispatchChecked(
      dispatchChecked(state, {
        intentId: nextId('grant'),
        kind: 'add-grant',
        actor: { kind: 'director' },
        payload: {
          target: 'hero',
          grant: {
            kind: 'next-roll',
            polarity: 'edge',
            scope: 'power-roll',
            direction: 'outbound',
            source: { participantId: 'ally' },
            window: null,
          },
        },
      } as Intent).state,
      {
        intentId: nextId('grant'),
        kind: 'add-grant',
        actor: { kind: 'director' },
        payload: {
          target: 'hero',
          grant: {
            kind: 'next-roll',
            polarity: 'bane',
            scope: 'strike',
            direction: 'outbound',
            source: { participantId: 'warrior' },
            window: null,
          },
        },
      } as Intent,
    ).state;
    expect(granted.participants.hero?.grants).toHaveLength(2);
    // 5+5 = 10 → tier 1 bare; one edge → 12 → tier 2. The strike-scoped
    // bane neither modifies nor is spent.
    const result = dispatchChecked(granted, madeTest({}, { dice: [5, 5] }));
    const { roll } = rollReceipt(result);
    expect(roll.resolution.tier).toBe(2);
    expect(
      result.state.participants.hero?.grants.map(
        (grant) => grant.kind === 'next-roll' && grant.scope,
      ),
    ).toEqual(['strike']);
  });

  it('refuses when no test is named — the engine never chooses the characteristic', () => {
    // "asks the hero's player to make a power roll using an appropriate
    // characteristic" — the Director's, and a dispatch without one has not
    // said what to roll. Refused BEFORE the debit.
    const state = onHeroTurn();
    const result = dispatchChecked(state, useCommonAction('hero', MOA));
    expect(result.log.map((item) => item.kind)).toEqual(['refusal']);
    expect(result.log[0]?.canonRefs).toContain(TEST_RULE);
    expect(result.state).toEqual(state);
  });

  it('refuses an actor with no recorded stats — there is no score to roll against', () => {
    const state = initialEncounterState([
      { id: 'ghost', kind: 'hero' },
      { id: 'hero', kind: 'hero', stats: GOBLIN_WARRIOR_STATS },
    ]);
    const result = dispatchChecked(
      state,
      useCommonAction('ghost', MOA, {
        ordinaryTest: { characteristic: 'might', difficulty: 'easy', dice: [3, 3] },
      }),
    );
    expect(result.log.map((item) => item.kind)).toEqual(['refusal']);
    expect(result.state).toEqual(state);
  });

  it("rejects test inputs on a resolution that is not an ordinary test — and a made test's targets", () => {
    const state = onHeroTurn();
    expect(() =>
      applyIntent(
        state,
        useCommonAction('hero', HEAL, {
          targets: ['ally'],
          recoverySpends: { ally: true },
          ordinaryTest: { characteristic: 'reason', difficulty: 'easy' },
        }),
        { random: createSeededRandomSource(1) },
      ),
    ).toThrow(/ordinaryTest applies only to ordinary-test resolutions/);
    // The roller of a made test is the actor; it names no target.
    expect(() =>
      applyIntent(state, madeTest({ targets: ['ally'] }), { random: createSeededRandomSource(1) }),
    ).toThrow(/an ordinary test names no target/);
  });

  it('assist: the assister rolls their OWN test and the printed bullet is quoted for the assisted creature', () => {
    // "When you attempt to assist another creature, make a test using the
    // skill you choose, and using a characteristic chosen by the Director"
    // — the assister's roll, through the same one home. 12-16: "Your help
    // grants the other creature an edge on their test."
    const state = onHeroTurn();
    const result = dispatchChecked(
      state,
      useCommonAction('hero', MOA, {
        alternative: 'assist',
        targets: ['ally'],
        ordinaryTest: { characteristic: 'presence', difficulty: null, dice: [7, 6] },
      }),
    );
    // "Assisting a test is also a maneuver in combat" — the assister's.
    expect(result.state.participants.hero?.actionBudget.maneuver).toEqual({ used: 1, granted: 0 });
    expect(result.state.participants.ally?.actionBudget).toEqual({});
    const { roll } = rollReceipt(result);
    expect(roll.rollerId).toBe('hero');
    expect(roll.resolution.tier).toBe(2); // 7+6−1 = 12

    const assist = result.log.find((item) => item.data.assistOutcome !== undefined);
    expect(assist?.kind).toBe('table-directive');
    expect(assist?.canonRefs).toContain(ASSIST_A_TEST);
    expect(assist?.data.assistOutcome).toMatchObject({
      rollerId: 'hero',
      assistedId: 'ally',
      tier: 2,
      polarity: 'edge',
      sourceText: 'Your help grants the other creature an edge on their test.',
      grantPlaced: false,
    });
    // REPORTED, not placed: the printed binding is "the test you're
    // assisting" and no grant scope expresses a named test yet (S7, after
    // W0-d). The assisted creature's grants are untouched.
    expect(result.state.participants.ally?.grants).toEqual([]);
    // The three printed provisos are surfaced on this branch, unknowable to
    // the engine (no skill model), never read as false.
    const proviso = result.log.find((item) => item.data.commonActionEligibility !== undefined);
    expect(proviso?.kind).toBe('table-directive');
    expect(proviso?.message).toContain('provided you have a skill that applies to the test');
    expect(result.log.some((item) => item.kind === 'warning')).toBe(false);
  });

  it('assist maps every printed tier to its polarity', () => {
    const at = (dice: [number, number]) =>
      dispatchChecked(
        onHeroTurn(),
        useCommonAction('hero', MOA, {
          alternative: 'assist',
          targets: ['ally'],
          ordinaryTest: { characteristic: 'reason', difficulty: null, dice },
        }),
      ).log.find((item) => item.data.assistOutcome !== undefined)?.data.assistOutcome as {
        tier: number;
        polarity: string;
      };
    // ≤11: "The creature takes a bane on their test."
    expect(at([2, 3])).toMatchObject({ tier: 1, polarity: 'bane' });
    // 17+: "Your help gives the other creature a double edge on their test."
    expect(at([9, 9])).toMatchObject({ tier: 3, polarity: 'double-edge' });
  });

  it('assist with a difficulty supplied reports both readings and names the open ruling', () => {
    // §Assist a Test prints a bare tier table with no difficulty column;
    // whether difficulty ALSO applies is design §6.11 S4. The engine does
    // not decide it: both readings reach the table, flagged.
    const result = dispatchChecked(
      onHeroTurn(),
      useCommonAction('hero', MOA, {
        alternative: 'assist',
        targets: ['ally'],
        ordinaryTest: { characteristic: 'reason', difficulty: 'hard', dice: [6, 6] },
      }),
    );
    expect(result.log.find((item) => item.data.assistOutcome !== undefined)).toBeDefined();
    const { entry, outcome } = outcomeReceipt(result);
    expect(entry?.message).toContain('open ruling');
    expect(outcome).toMatchObject({
      difficulty: 'hard',
      outcome: 'failure',
      openRuling: expect.any(String),
    });
  });

  it('assist names exactly one OTHER creature, and the provisos gate binds that branch only', () => {
    const state = onHeroTurn();
    const assist = (targets: string[]) =>
      useCommonAction('hero', MOA, {
        alternative: 'assist',
        targets,
        ordinaryTest: { characteristic: 'reason', difficulty: null, dice: [6, 6] },
      });
    expect(() => applyIntent(state, assist([]), { random: createSeededRandomSource(1) })).toThrow(
      /names exactly one other creature/,
    );
    // "assist ANOTHER creature" — self-assist is incoherent, not a warning.
    expect(() =>
      applyIntent(state, assist(['hero']), { random: createSeededRandomSource(1) }),
    ).toThrow(/names exactly one other creature/);
    // A made test on the primary branch surfaces no assist proviso.
    const made = dispatchChecked(state, madeTest());
    expect(made.log.some((item) => item.data.commonActionEligibility !== undefined)).toBe(false);
  });
});
