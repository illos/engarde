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
  effectLines: [],
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

/** Combat begun — the crit grant's disposition depends on it [R-0029/R-0035]. */
function inCombat(state: EncounterState): EncounterState {
  return {
    ...state,
    turnState: {
      round: 1,
      firstSide: 'director',
      sideToChoose: 'director',
      activeTurnId: null,
      lastTurnId: null,
      turnsTaken: {},
    },
  };
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

  it("narrows each member outbound grant to only that member's target", () => {
    const before = stateWithBenefit();
    const pit1 = before.participants['pit-1'];
    const pit2 = before.participants['pit-2'];
    if (!pit1 || !pit2) throw new Error('fixture');
    before.participants['pit-1'] = {
      ...pit1,
      grants: [
        {
          kind: 'next-roll',
          grantId: 'edge-pit-1',
          polarity: 'edge',
          scope: 'strike',
          direction: 'outbound',
          window: null,
          source: { participantId: 'captain', effectArtifactId: 'test/edge' },
        },
      ],
    };
    before.participants['pit-2'] = {
      ...pit2,
      grants: [
        {
          kind: 'next-roll',
          grantId: 'bane-pit-2',
          polarity: 'bane',
          scope: 'strike',
          direction: 'outbound',
          window: null,
          source: { participantId: 'captain', effectArtifactId: 'test/bane' },
        },
      ],
    };
    const result = dispatch(before, {
      intentId: 'member-grants',
      kind: 'squad-signature-attack',
      actor: { kind: 'director' },
      payload: {
        squadId: 'pitlings',
        ability: SPIT,
        dice: [6, 5],
        participation: [
          { targetId: 'shadow', instanceOwner: 'pit-1', memberIds: ['pit-1'] },
          { targetId: 'conduit', instanceOwner: 'pit-2', memberIds: ['pit-2'] },
        ],
      },
    });
    expect(result.state.participants.shadow?.stamina?.current).toBe(16); // edge: tier 2
    expect(result.state.participants.conduit?.stamina?.current).toBe(18); // bane: tier 1
    const roll = result.log.find((row) => row.data.powerRoll)?.data.powerRoll as
      | { grantsConsumed?: Array<{ holderId: string }>; perTarget?: unknown }
      | undefined;
    expect(roll?.grantsConsumed?.map((row) => row.holderId)).toEqual(['pit-1', 'pit-2']);
    expect(roll?.perTarget).toMatchObject({
      shadow: { resolution: { tier: 2 } },
      conduit: { resolution: { tier: 1 } },
    });
  });

  it('keeps a bespoke tier and its helper stacking as explicit residue', () => {
    const before = stateWithBenefit();
    const residueAbility: SquadAbilityData = {
      ...SPIT,
      tiers: {
        ...SPIT.tiers,
        tier2: { kind: 'residue', sourceText: '- **12-16:** 4 poison damage; bespoke rider' },
      },
    };
    const result = dispatch(before, {
      intentId: 'residue-tier',
      kind: 'squad-signature-attack',
      actor: { kind: 'director' },
      payload: {
        squadId: 'pitlings',
        ability: residueAbility,
        dice: [6, 6],
        participation: [
          { targetId: 'shadow', instanceOwner: 'pit-1', memberIds: ['pit-1', 'pit-2'] },
        ],
      },
    });
    expect(result.state.participants.shadow?.stamina?.current).toBe(20);
    expect(result.log.some((row) => row.data.squadTierResidue !== undefined)).toBe(true);
    expect(result.log.some((row) => row.data.squadStackingResidue !== undefined)).toBe(true);
  });

  it('refuses an unbound later instance owner before any member debit', () => {
    let before = stateWithBenefit();
    const pit2 = before.participants['pit-2'];
    const tier2 = SPIT.tiers.tier2;
    if (!pit2 || tier2.kind !== 'automatic' || tier2.data.damage === null) {
      throw new Error('fixture');
    }
    before = dispatch(before, {
      intentId: 'begin-binding-test',
      kind: 'begin-combat',
      actor: { kind: 'director' },
      payload: { firstSide: 'director', roll: 7 },
    }).state;
    before = dispatch(before, {
      intentId: 'turn-binding-test',
      kind: 'start-turn',
      actor: { kind: 'director' },
      payload: { turnId: 'pitlings' },
    }).state;
    const livePit2 = before.participants['pit-2'];
    if (!livePit2) throw new Error('fixture');
    before.participants['pit-2'] = { ...livePit2, stats: null };
    const ability: SquadAbilityData = {
      ...SPIT,
      tiers: {
        ...SPIT.tiers,
        tier2: {
          ...tier2,
          data: {
            ...tier2.data,
            damage: { ...tier2.data.damage, characteristicOptions: ['I'] },
          },
        },
      },
    };
    const result = applyIntent(
      before,
      {
        intentId: 'binding-refusal',
        kind: 'squad-signature-attack',
        actor: { kind: 'director' },
        payload: {
          squadId: 'pitlings',
          ability,
          dice: [6, 6],
          participation: [
            { targetId: 'shadow', instanceOwner: 'pit-1', memberIds: ['pit-1'] },
            { targetId: 'conduit', instanceOwner: 'pit-2', memberIds: ['pit-2'] },
          ],
        },
      },
      { random: createSeededRandomSource(39) },
    );
    expect(result.log).toHaveLength(1);
    expect(result.log[0]?.kind).toBe('refusal');
    expect(result.log[0]?.message).toContain('pit-2 has no tracked characteristics');
    expect(result.state).toBe(before);
  });

  const CRIT_INTENT: Intent = {
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
  };

  it('applies captain edge once per roll and grants every participant a crit action', () => {
    const before = inCombat(
      stateWithBenefit({ kind: 'strike-edge', magnitude: 1, sourceText: 'an edge on strikes' }),
    );
    const result = dispatch(before, CRIT_INTENT);
    expect(result.state.participants['pit-1']?.grants).toHaveLength(1);
    expect(result.state.participants['pit-2']?.grants).toHaveLength(1);
    // Non-participants earn nothing — R-0035 is per PARTICIPATING member,
    // even though R-0033 debits every living member's main action.
    expect(result.state.participants['pit-3']?.grants).toHaveLength(0);
    expect(result.state.participants['pit-1']?.grants[0]?.source.effectArtifactId).toBe(
      'mcdm.heroes.v1/rule.combat/critical-hit',
    );
    expect(result.log.find((row) => row.data.powerRoll)?.data.powerRoll).toMatchObject({
      derivedModifiers: [{ edges: 1, banes: 0 }],
    });
  });

  it('leaves a crit rolled out of combat as a directive, never a persistent grant', () => {
    // Regression: the squad path used to mint an `expiry: null` main-action
    // grant with combat not begun. It survived begin-combat and handed every
    // participant a free extra action in round 1.
    const result = dispatch(stateWithBenefit(), CRIT_INTENT);
    expect(result.state.participants['pit-1']?.grants).toEqual([]);
    expect(result.state.participants['pit-2']?.grants).toEqual([]);
    const directives = result.log.filter(
      (row) => row.kind === 'table-directive' && row.data.criticalHit === true,
    );
    expect(directives).toHaveLength(2);
    expect(directives[0]?.message).toContain('additional main action');
    expect(directives[0]?.canonRefs).toContain('mcdm.heroes.v1/rule.combat/critical-hit');
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

  it('debits every participant even when a together maneuver stays directive', () => {
    let before = stateWithBenefit();
    before = dispatch(before, {
      intentId: 'begin',
      kind: 'begin-combat',
      actor: { kind: 'director' },
      payload: { firstSide: 'director', roll: 7 },
    }).state;
    before = dispatch(before, {
      intentId: 'turn',
      kind: 'start-turn',
      actor: { kind: 'director' },
      payload: { turnId: 'pitlings' },
    }).state;
    const result = dispatch(before, {
      intentId: 'grab-together',
      kind: 'squad-maneuver',
      actor: { kind: 'director' },
      payload: {
        squadId: 'pitlings',
        maneuver: 'grab',
        participation: [
          { targetId: 'shadow', instanceOwner: 'pit-1', memberIds: ['pit-1', 'pit-2'] },
        ],
        ability: null,
        sourceText: 'Grab together; the interleaved free strike remains table-resolved.',
      },
    });
    expect(result.state.participants['pit-1']?.actionBudget.maneuver?.used).toBe(1);
    expect(result.state.participants['pit-2']?.actionBudget.maneuver?.used).toBe(1);
    expect(result.log.some((row) => row.data.squadManeuverDirective !== undefined)).toBe(true);
  });

  it('never drops a squad tier potency without a receipt', () => {
    // Regression: the squad path `continue`d silently on BOTH the
    // unresolvable and the resisted branch, so a gated condition vanished
    // with no line in the log at all.
    const potentWithThreshold = (value: number): SquadAbilityData => ({
      ...SPIT,
      tiers: {
        ...SPIT.tiers,
        tier2: {
          kind: 'automatic',
          sourceText: `- **12-16:** 4 poison damage; A < ${value} slowed (save ends)`,
          data: {
            damage: { amount: 4, characteristicOptions: [], typeOptions: ['poison'] },
            potency: { characteristic: 'A', threshold: { kind: 'numeric', value } },
            conditionIds: ['mcdm.heroes.v1/condition/slowed'],
            ending: 'save-ends',
          },
        },
      },
    });
    const POTENT = potentWithThreshold(3);
    // shadow has Agility 1, so 1 < 3 → affected.
    const affected = dispatch(stateWithBenefit(), {
      intentId: 'potent-hit',
      kind: 'squad-signature-attack',
      actor: { kind: 'director' },
      payload: {
        squadId: 'pitlings',
        ability: POTENT,
        participation: [{ targetId: 'shadow', instanceOwner: 'pit-1', memberIds: ['pit-1'] }],
        dice: [6, 6],
      },
    });
    expect(affected.log.find((row) => row.data.potency)?.data.potency).toMatchObject({
      targetId: 'shadow',
      applies: true,
    });
    expect(affected.state.participants.shadow?.conditions).toHaveLength(1);

    // Drop the threshold out of reach: resisted, and it must still speak.
    const resistedAbility = potentWithThreshold(0);
    const resisted = dispatch(stateWithBenefit(), {
      intentId: 'potent-resist',
      kind: 'squad-signature-attack',
      actor: { kind: 'director' },
      payload: {
        squadId: 'pitlings',
        ability: resistedAbility,
        participation: [{ targetId: 'shadow', instanceOwner: 'pit-1', memberIds: ['pit-1'] }],
        dice: [6, 6],
      },
    });
    expect(resisted.state.participants.shadow?.conditions).toEqual([]);
    expect(resisted.log.find((row) => row.data.potency)?.data.potency).toMatchObject({
      targetId: 'shadow',
      applies: false,
    });
    expect(resisted.log.find((row) => row.data.potency)?.message).toContain('resisted');
  });

  it("surfaces the ability's printed Effect line as a directive, once per resolution", () => {
    // Regression: compileSquadAbilities lifts only power-roll tiers, so an
    // ability's `**Effect:**` clause parsed, passed grammar conservation,
    // and then vanished — Bugbear Snare's automatic grab among them.
    const withEffect: SquadAbilityData = {
      ...SPIT,
      effectLines: [
        '**Effect:** If the snare started their turn hidden from the target, the target is automatically grabbed.',
      ],
    };
    const result = dispatch(stateWithBenefit(), {
      intentId: 'effect-line',
      kind: 'squad-signature-attack',
      actor: { kind: 'director' },
      payload: {
        squadId: 'pitlings',
        ability: withEffect,
        participation: [
          { targetId: 'shadow', instanceOwner: 'pit-1', memberIds: ['pit-1'] },
          { targetId: 'conduit', instanceOwner: 'pit-2', memberIds: ['pit-2'] },
        ],
        dice: [6, 6],
      },
    });
    const directives = result.log.filter(
      (row) => row.data.squadAbilityEffectDirective !== undefined,
    );
    expect(directives).toHaveLength(1);
    expect(directives[0]?.kind).toBe('table-directive');
    expect(directives[0]?.message).toContain('automatically grabbed');
    expect(directives[0]?.data.squadAbilityEffectDirective).toMatchObject({
      targetIds: ['shadow', 'conduit'],
    });
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
