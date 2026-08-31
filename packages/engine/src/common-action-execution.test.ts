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
  FREE_STRIKE,
  MELEE_WEAPON_FREE_STRIKE,
  RIDE,
  STAND_UP,
} from './common-action.fixtures.js';
import { createSeededRandomSource } from './determinism.js';
import { initialEncounterState } from './driver.js';
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

  it('registers exactly the printed preconditions of waves 1-4', () => {
    expect(COMMON_ACTION_ELIGIBILITY_GATES.map((gate) => gate.featureArtifactId)).toEqual([
      'mcdm.heroes.v1/feature.common.maneuvers/catch-breath',
      'mcdm.heroes.v1/feature.common.move-actions/ride',
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
