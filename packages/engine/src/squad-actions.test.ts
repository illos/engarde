import { describe, expect, it } from 'vitest';
import { applyIntent } from './apply-intent.js';
import { createSeededRandomSource } from './determinism.js';
import { checkInvariants } from './invariants.js';
import { upgradeEncounterState } from './migrate.js';
import type { EncounterState, Intent, ParticipantStats, SquadAbilityData } from './schemas.js';

const BASE_STATS: ParticipantStats = {
  staminaMax: 3,
  characteristics: { might: 0, agility: 1, reason: 0, intuition: 0, presence: 0 },
  immunities: [],
  weaknesses: [],
  potencies: null,
  organization: 'Minion',
  recoveriesMax: null,
  freeStrike: 2,
  withCaptain: null,
  withCaptainBenefit: null,
};

const SPIT: SquadAbilityData = {
  abilityArtifactId: 'mcdm.monsters.v1/monster.demon.1st-echelon.statblock/pitling#spit',
  actionType: 'Main action',
  actionCost: 'main-action',
  actionCostResidue: null,
  keywords: ['Ranged', 'Strike'],
  targetsText: 'One creature or object',
  powerRollBonus: { kind: 'fixed', value: 0 },
  tiers: {
    tier1: {
      kind: 'automatic',
      sourceText: '- **≤11:** 2 poison damage',
      data: {
        damage: { amount: 2, characteristicOptions: [], typeOptions: ['poison'] },
        potency: null,
        conditionIds: [],
        ending: null,
      },
    },
    tier2: {
      kind: 'automatic',
      sourceText: '- **12-16:** 4 poison damage',
      data: {
        damage: { amount: 4, characteristicOptions: [], typeOptions: ['poison'] },
        potency: null,
        conditionIds: [],
        ending: null,
      },
    },
    tier3: {
      kind: 'automatic',
      sourceText: '- **17+:** 6 poison damage',
      data: {
        damage: { amount: 6, characteristicOptions: [], typeOptions: ['poison'] },
        potency: null,
        conditionIds: [],
        ending: null,
      },
    },
  },
};

function stateWithBenefit(benefit: ParticipantStats['withCaptainBenefit'] = null): EncounterState {
  const memberStats = {
    ...BASE_STATS,
    withCaptainBenefit: benefit,
    withCaptain: benefit?.sourceText ?? null,
  };
  return upgradeEncounterState({
    schemaVersion: 5,
    terrainFacts: [],
    squads: [
      {
        squadId: 'pitlings',
        name: 'Pitlings',
        perMinionStamina: 3,
        pool: { current: 9, max: 9 },
        memberIds: ['pit-1', 'pit-2', 'pit-3'],
        deadMemberIds: [],
        pendingKills: 0,
        captainId: benefit ? 'captain' : null,
      },
    ],
    participants: {
      'pit-1': {
        id: 'pit-1',
        kind: 'director-creature',
        sourceRecordId: 'pitling',
        stats: memberStats,
        stamina: null,
        conditions: [],
        grants: [],
      },
      'pit-2': {
        id: 'pit-2',
        kind: 'director-creature',
        sourceRecordId: 'pitling',
        stats: memberStats,
        stamina: null,
        conditions: [],
        grants: [],
      },
      'pit-3': {
        id: 'pit-3',
        kind: 'director-creature',
        sourceRecordId: 'pitling',
        stats: memberStats,
        stamina: null,
        conditions: [],
        grants: [],
      },
      captain: {
        id: 'captain',
        kind: 'director-creature',
        sourceRecordId: 'captain',
        stats: { ...BASE_STATS, organization: 'Leader', staminaMax: 10 },
        stamina: { current: 10, temporary: 0, recoveries: null },
        conditions: [],
        grants: [],
      },
      shadow: {
        id: 'shadow',
        kind: 'hero',
        sourceRecordId: 'shadow',
        stats: { ...BASE_STATS, organization: null, staminaMax: 20 },
        stamina: { current: 20, temporary: 0, recoveries: null },
        conditions: [],
        grants: [],
      },
      conduit: {
        id: 'conduit',
        kind: 'hero',
        sourceRecordId: 'conduit',
        stats: { ...BASE_STATS, organization: null, staminaMax: 20 },
        stamina: { current: 20, temporary: 0, recoveries: null },
        conditions: [],
        grants: [],
      },
    },
  });
}

function dispatch(before: EncounterState, intent: Intent) {
  const result = applyIntent(before, intent, { random: createSeededRandomSource(39) });
  expect(checkInvariants(before, intent, result)).toEqual([]);
  return result;
}

describe('one-roll squad attacks [R-0034..R-0039]', () => {
  it('matches the printed pitling tier-2 split/stacking example exactly', () => {
    const before = stateWithBenefit();
    const result = dispatch(before, {
      intentId: 'pitling-spit',
      kind: 'squad-signature-attack',
      actor: { kind: 'director' },
      payload: {
        squadId: 'pitlings',
        ability: SPIT,
        participation: [
          { targetId: 'shadow', instanceOwner: 'pit-1', memberIds: ['pit-1'] },
          { targetId: 'conduit', instanceOwner: 'pit-2', memberIds: ['pit-2', 'pit-3'] },
        ],
        dice: [6, 6],
      },
    });
    expect(result.state.participants.shadow?.stamina?.current).toBe(16);
    expect(result.state.participants.conduit?.stamina?.current).toBe(14);
    const receipt = result.log.find((row) => row.data.squadBreakdown !== undefined);
    expect(receipt?.data.squadBreakdown).toMatchObject([
      { targetId: 'shadow', tier: 2, stacking: { kind: 'none' } },
      {
        targetId: 'conduit',
        tier: 2,
        stacking: { kind: 'applied', total: 2, damageType: 'poison' },
      },
    ]);
  });

  it('applies captain edge once per roll and grants every participant a crit action', () => {
    const before = stateWithBenefit({
      kind: 'strike-edge',
      magnitude: 1,
      sourceText: 'an edge on strikes',
    });
    const result = dispatch(before, {
      intentId: 'pitling-crit',
      kind: 'squad-signature-attack',
      actor: { kind: 'director' },
      payload: {
        squadId: 'pitlings',
        ability: SPIT,
        participation: [
          { targetId: 'shadow', instanceOwner: 'pit-1', memberIds: ['pit-1', 'pit-2'] },
        ],
        dice: [10, 9],
      },
    });
    expect(result.state.participants['pit-1']?.grants).toHaveLength(1);
    expect(result.state.participants['pit-2']?.grants).toHaveLength(1);
    expect(result.log.find((row) => row.data.powerRoll)?.data.powerRoll).toMatchObject({
      derivedModifiers: [{ edges: 1, banes: 0 }],
    });
  });

  it('combines Free Strike Together into one weakness/immunity instance', () => {
    const before = stateWithBenefit();
    const shadow = before.participants.shadow;
    if (!shadow?.stats) throw new Error('fixture');
    before.participants.shadow = {
      ...shadow,
      stats: { ...shadow.stats, weaknesses: [{ appliesTo: 'any', value: 2 }] },
    };
    const result = dispatch(before, {
      intentId: 'free-strike-together',
      kind: 'squad-free-strike',
      actor: { kind: 'director' },
      payload: {
        squadId: 'pitlings',
        targetId: 'shadow',
        contributions: [{ memberId: 'pit-1' }, { memberId: 'pit-2' }, { memberId: 'pit-3' }],
      },
    });
    expect(result.state.participants.shadow?.stamina?.current).toBe(12); // 2+2+2, then weakness 2 once
  });

  it('moves Stamina benefits with the pool and auto-detaches a dead captain', () => {
    const before = stateWithBenefit();
    const initialSquad = before.squads[0];
    if (!initialSquad) throw new Error('fixture');
    before.squads[0] = { ...initialSquad, captainId: null };
    const member = before.participants['pit-1'];
    if (!member?.stats) throw new Error('fixture');
    const staminaBenefit = {
      kind: 'stamina' as const,
      amount: 2,
      sourceText: '+2 bonus to Stamina',
    };
    for (const id of ['pit-1', 'pit-2', 'pit-3']) {
      const current = before.participants[id];
      if (!current?.stats) throw new Error('fixture');
      before.participants[id] = {
        ...current,
        stats: {
          ...current.stats,
          withCaptain: staminaBenefit.sourceText,
          withCaptainBenefit: staminaBenefit,
        },
      };
    }
    const attached = dispatch(before, {
      intentId: 'attach',
      kind: 'attach-captain',
      actor: { kind: 'director' },
      payload: { squadId: 'pitlings', captainId: 'captain' },
    });
    expect(attached.state.squads[0]).toMatchObject({
      perMinionStamina: 5,
      pool: { current: 15, max: 15 },
      captainId: 'captain',
    });
    const killed = dispatch(attached.state, {
      intentId: 'kill-captain',
      kind: 'apply-damage',
      actor: { kind: 'director' },
      payload: { target: 'captain', amount: 10, reason: 'test lethal strike' },
    });
    expect(killed.state.squads[0]).toMatchObject({
      perMinionStamina: 3,
      pool: { current: 9, max: 9 },
      captainId: null,
    });
    expect(killed.log.some((row) => row.data.automaticCaptainDetach !== undefined)).toBe(true);
  });
});
