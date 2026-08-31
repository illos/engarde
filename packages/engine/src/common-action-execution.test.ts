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
  KNOCKBACK,
  KNOCKBACK_ABILITY,
  KNOCKBACK_COMPOSES,
  MELEE_WEAPON_FREE_STRIKE,
  RIDE,
  SPEAR_CHARGE_COMPOSES,
  STAND_UP,
} from './common-action.fixtures.js';
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
      ['mcdm.heroes.v1/feature.common.maneuvers/stand-up', 'maneuver', true],
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
