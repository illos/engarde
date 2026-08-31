import { describe, expect, it } from 'vitest';
import { applyIntent } from './apply-intent.js';
import { createSeededRandomSource } from './determinism.js';
import { checkInvariants } from './invariants.js';
import { upgradeEncounterState } from './migrate.js';
import { hashPayload } from './payload-hash.js';
import {
  type EncounterState,
  type Intent,
  type ParticipantStats,
  type SquadAbilityData,
  SquadSignatureAttackPayloadSchema,
} from './schemas.js';

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
  resourceCost: null,
  resourceCostResidue: null,
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
  effectPrograms: [],
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
    expect(result.state.occurrences).toContainEqual(
      expect.objectContaining({
        kind: 'targeted',
        participantId: 'shadow',
        actorId: 'pitlings',
      }),
    );
    const opened = result.state.resolutionStack.find(
      (entry) => entry.resolutionId === CRIT_INTENT.intentId,
    );
    expect(opened?.phase === 'rolled' ? opened.rollTargets : null).toEqual(['shadow']);
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

  it('refuses an unclassified trailing Effect before debit or dice', () => {
    const sourceText =
      '**Effect:** If the snare started their turn hidden from the target, the target is automatically grabbed.';
    const withEffect: SquadAbilityData = {
      ...SPIT,
      effectLines: [sourceText],
    };
    let before = inCombat(stateWithBenefit());
    before = dispatch(before, {
      intentId: 'opaque-effect-turn',
      kind: 'start-turn',
      actor: { kind: 'director' },
      payload: { turnId: 'pitlings' },
    }).state;
    let draws = 0;
    const intent: Intent = {
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
      },
    };
    const result = applyIntent(before, intent, {
      random: {
        next: () => 0.5,
        roll: () => {
          draws += 1;
          return 5;
        },
      },
    });
    expect(checkInvariants(before, intent, result)).toEqual([]);
    expect(result.state).toBe(before);
    expect(draws).toBe(0);
    expect(result.log).toHaveLength(1);
    expect(result.log[0]?.kind).toBe('refusal');
    expect(result.log[0]?.message).toContain('without a one-to-one trusted causal phase');
    expect(result.log[0]?.message).toContain(sourceText);
  });

  it("applies Angulotl Dart's injured-target edge before resolving each target's tier", () => {
    const sourceText =
      '**Effect:** The dart gains an [edge](scc.v1:mcdm.heroes.v1/rule.dice/edge) on this ability against any target who has less than full [Stamina](scc.v1:mcdm.heroes.v1/rule.health/stamina).';
    const ability: SquadAbilityData = {
      ...SPIT,
      abilityArtifactId: 'mcdm.monsters.v1/monster.angulotl.statblock/angulotl-dart#poison-dart',
      effectLines: [sourceText],
      effectPrograms: [
        {
          kind: 'target-edge-if-stamina-below-max',
          phase: 'pre-roll',
          sourceText,
          canonRefs: ['mcdm.heroes.v1/rule.dice/edge', 'mcdm.heroes.v1/rule.health/stamina'],
        },
      ],
    };
    const before = stateWithBenefit();
    const shadow = before.participants.shadow;
    if (!shadow?.stamina) throw new Error('fixture');
    before.participants.shadow = {
      ...shadow,
      stamina: { ...shadow.stamina, current: shadow.stamina.current - 1 },
    };
    const result = dispatch(before, {
      intentId: 'angulotl-dart-edge',
      kind: 'squad-signature-attack',
      actor: { kind: 'director' },
      payload: {
        squadId: 'pitlings',
        ability,
        participation: [
          { targetId: 'shadow', instanceOwner: 'pit-1', memberIds: ['pit-1'] },
          { targetId: 'conduit', instanceOwner: 'pit-2', memberIds: ['pit-2'] },
        ],
        dice: [5, 5],
      },
    });
    expect(result.state.participants.shadow?.stamina?.current).toBe(15); // wounded + tier 2
    expect(result.state.participants.conduit?.stamina?.current).toBe(18); // full + tier 1
    expect(result.log.find((row) => row.data.powerRoll)?.data.powerRoll).toMatchObject({
      perTarget: {
        shadow: { edges: 1, resolution: { tier: 2 } },
        conduit: { edges: 0, resolution: { tier: 1 } },
      },
      perTargetDerivedModifiers: {
        shadow: [{ sourceText, edges: 1, banes: 0 }],
      },
    });
    expect(result.log.some((row) => row.data.squadAbilityEffectDirective !== undefined)).toBe(
      false,
    );
  });

  it('refuses before debit or dice when a pre-roll Effect predicate is untracked', () => {
    const sourceText =
      '**Effect:** The dart gains an [edge](scc.v1:mcdm.heroes.v1/rule.dice/edge) on this ability against any target who has less than full [Stamina](scc.v1:mcdm.heroes.v1/rule.health/stamina).';
    const ability: SquadAbilityData = {
      ...SPIT,
      abilityArtifactId: 'mcdm.monsters.v1/monster.angulotl.statblock/angulotl-dart#poison-dart',
      effectLines: [sourceText],
      effectPrograms: [
        {
          kind: 'target-edge-if-stamina-below-max',
          phase: 'pre-roll',
          sourceText,
          canonRefs: ['mcdm.heroes.v1/rule.dice/edge', 'mcdm.heroes.v1/rule.health/stamina'],
        },
      ],
    };
    let before = inCombat(stateWithBenefit());
    before = dispatch(before, {
      intentId: 'untracked-stamina-turn',
      kind: 'start-turn',
      actor: { kind: 'director' },
      payload: { turnId: 'pitlings' },
    }).state;
    const shadow = before.participants.shadow;
    if (!shadow) throw new Error('fixture');
    before.participants.shadow = { ...shadow, stats: null, stamina: null };
    let draws = 0;
    const intent: Intent = {
      intentId: 'untracked-stamina-edge',
      kind: 'squad-signature-attack',
      actor: { kind: 'director' },
      payload: {
        squadId: 'pitlings',
        ability,
        participation: [{ targetId: 'shadow', instanceOwner: 'pit-1', memberIds: ['pit-1'] }],
      },
    };
    const result = applyIntent(before, intent, {
      random: {
        next: () => 0.5,
        roll: () => {
          draws += 1;
          return 5;
        },
      },
    });
    expect(checkInvariants(before, intent, result)).toEqual([]);
    expect(result.state).toBe(before);
    expect(draws).toBe(0);
    expect(result.log).toHaveLength(1);
    expect(result.log[0]?.kind).toBe('refusal');
    expect(result.log[0]?.message).toContain('resolve this pre-roll modifier at the table');
    expect(result.log.some((row) => row.data.powerRoll !== undefined)).toBe(false);
    expect(result.state.participants['pit-1']?.actionBudget).toEqual(
      before.participants['pit-1']?.actionBudget,
    );
  });

  it('adds a condition-gated trailing Effect during damage, before tier riders', () => {
    const conditionId = 'mcdm.heroes.v1/condition/restrained';
    const sourceText =
      '**Effect:** If the target is [restrained](scc.v1:mcdm.heroes.v1/condition/restrained), they take an extra 2 damage.';
    const ability: SquadAbilityData = {
      ...SPIT,
      abilityArtifactId: 'mcdm.monsters.v1/monster.dwarf.statblock/dwarf-catchpole#catchpole',
      effectLines: [sourceText],
      effectPrograms: [
        {
          kind: 'extra-damage-if-target-has-condition',
          phase: 'damage',
          sourceText,
          canonRefs: [conditionId],
          conditionId,
          amount: 2,
        },
      ],
    };
    const before = stateWithBenefit();
    const shadow = before.participants.shadow;
    if (!shadow) throw new Error('fixture');
    before.participants.shadow = {
      ...shadow,
      conditions: [
        {
          instanceId: 'restrained#fixture',
          conditionId,
          ending: { kind: 'external' },
          source: { participantId: 'pit-3', effectArtifactId: 'fixture/restrain' },
        },
      ],
    };
    const result = dispatch(before, {
      intentId: 'catchpole-extra-damage',
      kind: 'squad-signature-attack',
      actor: { kind: 'director' },
      payload: {
        squadId: 'pitlings',
        ability,
        participation: [
          { targetId: 'shadow', instanceOwner: 'pit-1', memberIds: ['pit-1'] },
          { targetId: 'conduit', instanceOwner: 'pit-2', memberIds: ['pit-2'] },
        ],
        dice: [5, 5],
      },
    });
    expect(result.state.participants.shadow?.stamina?.current).toBe(16);
    expect(result.state.participants.conduit?.stamina?.current).toBe(18);
    expect(result.log).toContainEqual(
      expect.objectContaining({
        data: {
          squadAbilityEffectApplied: expect.objectContaining({
            phase: 'damage',
            targetId: 'shadow',
            extraDamage: 2,
          }),
        },
      }),
    );
  });

  function historicalHeldSquadResolution(): {
    state: EncounterState;
    payload: ReturnType<typeof SquadSignatureAttackPayloadSchema.parse>;
    historicalHash: string;
  } {
    let state = inCombat(stateWithBenefit());
    state = dispatch(state, {
      intentId: 'historical-turn',
      kind: 'start-turn',
      actor: { kind: 'director' },
      payload: { turnId: 'pitlings' },
    }).state;
    const payload = SquadSignatureAttackPayloadSchema.parse({
      squadId: 'pitlings',
      ability: SPIT,
      participation: [{ targetId: 'shadow', instanceOwner: 'pit-1', memberIds: ['pit-1'] }],
      dice: [5, 5],
    });
    const rolled = dispatch(state, {
      intentId: 'historical-held-squad',
      kind: 'squad-signature-attack',
      actor: { kind: 'director' },
      payload,
    }).state;
    const historicalAbility: Record<string, unknown> = { ...payload.ability };
    historicalAbility.effectLines = undefined;
    historicalAbility.effectPrograms = undefined;
    // The pre-f9075a1 wire form also predates the carry-only printed
    // resource-cost slot; reconstructing its exact bytes omits those
    // defaulted fields too. The pinned hash below is UNCHANGED.
    historicalAbility.resourceCost = undefined;
    historicalAbility.resourceCostResidue = undefined;
    const historicalWirePayload = { ...payload, ability: historicalAbility };
    const historicalHash = hashPayload(historicalWirePayload);
    expect(historicalHash).toBe('831abb93056c40caf1036df2841f82fac64232b64350f5e7992d93f92a2d412e');
    const resolutionStack = rolled.resolutionStack.map((entry) => {
      if (entry.resolutionId !== 'historical-held-squad') return entry;
      const historicalEntry: Record<string, unknown> = {
        ...entry,
        payloadHash: historicalHash,
      };
      historicalEntry.declarationHash = undefined;
      historicalEntry.rollTargets = undefined;
      return historicalEntry;
    });
    // Literal v6 wire shape: f9075a1 predates both occurrence-ledger v7 and
    // declared-resolution v8. Upgrade must preserve the open outcome.
    const historicalState = upgradeEncounterState({
      ...rolled,
      schemaVersion: 6,
      resolutionStack,
      occurrences: undefined,
    });
    return { state: historicalState, payload, historicalHash };
  }

  it('commits a pre-f9075a1 held squad payload whose hash omitted effectLines', () => {
    const fixture = historicalHeldSquadResolution();
    const committed = dispatch(fixture.state, {
      intentId: 'commit-historical-squad',
      kind: 'commit-resolution',
      actor: { kind: 'director' },
      payload: { resolutionId: 'historical-held-squad', payload: fixture.payload },
    });
    expect(committed.state.participants.shadow?.stamina?.current).toBe(18);
    expect(committed.state.resolutionStack[0]?.phase).toBe('committed');
    expect(committed.log).toContainEqual(
      expect.objectContaining({
        data: {
          historicalPayloadHashCompatibility: expect.objectContaining({
            storedHash: fixture.historicalHash,
            omitted: [
              'SquadAbilityData.effectLines',
              'SquadAbilityData.effectPrograms',
              'SquadAbilityData.resourceCost',
              'SquadAbilityData.resourceCostResidue',
            ],
          }),
        },
      }),
    );
  });

  it('force-commits the same pre-f9075a1 held payload at squad end-turn', () => {
    const fixture = historicalHeldSquadResolution();
    const ended = dispatch(fixture.state, {
      intentId: 'end-historical-squad-turn',
      kind: 'end-turn',
      actor: { kind: 'director' },
      payload: {
        participantId: 'pitlings',
        commitPayloads: { 'historical-held-squad': fixture.payload },
      },
    });
    expect(ended.state.participants.shadow?.stamina?.current).toBe(18);
    expect(ended.state.resolutionStack[0]?.phase).toBe('committed');
    expect(ended.log).toContainEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          resolutionCommitted: expect.objectContaining({
            resolutionId: 'historical-held-squad',
            forced: true,
          }),
        }),
      }),
    );
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
