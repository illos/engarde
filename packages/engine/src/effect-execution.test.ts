import { describe, expect, it } from 'vitest';
import { applyIntent } from './apply-intent.js';
import { createSeededRandomSource } from './determinism.js';
import { initialEncounterState } from './driver.js';
import { checkInvariants } from './invariants.js';
import {
  type EffectProgramDataInput,
  type Intent,
  ParticipantStateSchema,
  type ParticipantStats,
} from './schemas.js';

const STATS: ParticipantStats = {
  staminaMax: 20,
  characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 },
  immunities: [],
  weaknesses: [],
  potencies: null,
  organization: null,
  recoveriesMax: null,
  freeStrike: null,
  withCaptain: null,
  withCaptainBenefit: null,
};

function state() {
  return initialEncounterState([
    { id: 'actor', kind: 'hero', stats: STATS },
    { id: 'actor-2', kind: 'hero', stats: STATS },
    { id: 'target', kind: 'director-creature', stats: STATS },
  ]);
}

function intent(effect: EffectProgramDataInput): Intent {
  return {
    intentId: 'effect-i1',
    kind: 'use-effect',
    actor: { kind: 'participant', participantId: 'actor' },
    payload: { actorParticipantId: 'actor', effect, targets: ['target'] },
  };
}

function baseEffect(resolution: EffectProgramDataInput['resolution']): EffectProgramDataInput {
  return {
    effectArtifactId: 'canon/effect/example',
    effectOrdinal: 1,
    sourceSpan: { byteStart: 10, byteEnd: 40 },
    sourceText: 'x effect instruction',
    canonRefs: ['canon/rule/example'],
    actionType: 'Main action',
    targetsText: 'One creature',
    distanceText: null,
    keywords: [],
    resolution,
  };
}

describe('compiled Effect execution', () => {
  it('routes fixed damage through the one-home damage pipeline', () => {
    const before = state();
    const dispatched = intent(baseEffect({ kind: 'damage', amount: 5, damageType: 'lightning' }));
    const result = applyIntent(before, dispatched, { random: createSeededRandomSource(1) });

    expect(result.state.participants.target?.stamina?.current).toBe(15);
    expect(result.log.some((entry) => entry.data.effectResolution !== undefined)).toBe(true);
    expect(result.log.some((entry) => entry.data.staminaDeltas !== undefined)).toBe(true);
    expect(result.log.every((entry) => entry.canonRefs.includes('canon/effect/example'))).toBe(
      true,
    );
    expect(checkInvariants(before, dispatched, result)).toEqual([]);
  });

  it('warns and applies when several targets exceed a singular triggering-creature header', () => {
    const before = state();
    const effect = baseEffect({ kind: 'damage', amount: 5, damageType: 'lightning' });
    effect.effectArtifactId = 'mcdm.monsters.v1/monster.elemental.statblock/essence-of-storms';
    effect.targetsText = 'The triggering creature';
    effect.sourceText = 'The target takes 5 lightning damage.';
    const dispatched = {
      ...intent(effect),
      payload: { ...intent(effect).payload, targets: ['target', 'actor-2'] },
    } as Intent;
    const result = applyIntent(before, dispatched, { random: createSeededRandomSource(1) });

    expect(result.state.participants.target?.stamina?.current).toBe(15);
    expect(result.state.participants['actor-2']?.stamina?.current).toBe(15);
    expect(result.log.find((entry) => entry.kind === 'warning')).toMatchObject({
      data: { declaredTargets: 1, namedTargets: 2 },
    });
    expect(checkInvariants(before, dispatched, result)).toEqual([]);
  });

  it('applies a compiled condition with its exact ending and provenance', () => {
    const before = state();
    const dispatched = intent(
      baseEffect({
        kind: 'condition',
        conditionId: 'canon/condition/example',
        ending: { kind: 'end-of-targets-next-turn' },
        replacesOnNewSource: true,
      }),
    );
    const result = applyIntent(before, dispatched, { random: createSeededRandomSource(1) });

    expect(result.state.participants.target?.conditions).toEqual([
      {
        instanceId: 'canon/condition/example#effect-i1-target',
        conditionId: 'canon/condition/example',
        ending: { kind: 'end-of-targets-next-turn' },
        source: { participantId: 'actor', effectArtifactId: 'canon/effect/example' },
      },
    ]);
    expect(checkInvariants(before, dispatched, result)).toEqual([]);
  });

  it('refuses a replayed condition intent before duplicating its deterministic instance id', () => {
    const before = state();
    const dispatched = intent(
      baseEffect({
        kind: 'condition',
        conditionId: 'canon/condition/example',
        ending: { kind: 'external' },
        replacesOnNewSource: false,
      }),
    );
    const first = applyIntent(before, dispatched, { random: createSeededRandomSource(1) });
    const replay = applyIntent(first.state, dispatched, { random: createSeededRandomSource(1) });

    expect(replay.state).toEqual(first.state);
    expect(replay.log).toHaveLength(1);
    expect(replay.log[0]?.kind).toBe('refusal');
    expect(replay.log[0]?.data.effectResolution).toBeDefined();
    expect(checkInvariants(first.state, dispatched, replay)).toEqual([]);
  });

  it('replaces a taunt from a different source and expires the replacement at turn end', () => {
    const before = state();
    const effect = baseEffect({
      kind: 'condition',
      conditionId: 'mcdm.heroes.v1/condition/taunted',
      ending: { kind: 'end-of-targets-next-turn' },
      replacesOnNewSource: true,
    });
    effect.effectArtifactId = 'mcdm.heroes.v1/feature.ability.shining-armor/protective-attack';
    effect.sourceText =
      'The target is [taunted](scc.v1:mcdm.heroes.v1/condition/taunted) until the end of their next [turn](scc.v1:mcdm.heroes.v1/rule.combat/turn).';
    const firstIntent = intent(effect);
    const first = applyIntent(before, firstIntent, { random: createSeededRandomSource(1) });
    expect(checkInvariants(before, firstIntent, first)).toEqual([]);

    const secondIntent: Intent = {
      intentId: 'effect-i2',
      kind: 'use-effect',
      actor: { kind: 'participant', participantId: 'actor-2' },
      payload: {
        actorParticipantId: 'actor-2',
        effect,
        targets: ['target'],
      },
    };
    const second = applyIntent(first.state, secondIntent, {
      random: createSeededRandomSource(1),
    });

    expect(second.state.participants.target?.conditions).toEqual([
      expect.objectContaining({
        instanceId: 'mcdm.heroes.v1/condition/taunted#effect-i2-target',
        source: {
          participantId: 'actor-2',
          effectArtifactId: 'mcdm.heroes.v1/feature.ability.shining-armor/protective-attack',
        },
      }),
    ]);
    expect(checkInvariants(first.state, secondIntent, second)).toEqual([]);

    const endTurnIntent: Intent = {
      intentId: 'effect-i3',
      kind: 'end-turn',
      actor: { kind: 'participant', participantId: 'target' },
      payload: { participantId: 'target' },
    };
    const expired = applyIntent(second.state, endTurnIntent, {
      random: createSeededRandomSource(1),
    });
    expect(expired.state.participants.target?.conditions).toEqual([]);
    expect(checkInvariants(second.state, endTurnIntent, expired)).toEqual([]);
  });

  it('preserves unsupported prose verbatim as a table directive without domain-state mutation', () => {
    const before = state();
    const effect = baseEffect({ kind: 'table' });
    effect.sourceText = 'x bespoke instruction with every word retained';
    const dispatched = intent(effect);
    const result = applyIntent(before, dispatched, { random: createSeededRandomSource(1) });

    expect({ ...result.state, occurrences: [] }).toEqual(before);
    expect(result.state.occurrences.map((row) => row.kind)).toEqual(['ability-used', 'targeted']);
    const directive = result.log.find((entry) => entry.kind === 'table-directive');
    expect(directive?.message).toBe(effect.sourceText);
    expect(directive?.data.manualEffect).toEqual({
      effectArtifactId: effect.effectArtifactId,
      effectOrdinal: 1,
      sourceSpan: { byteStart: 10, byteEnd: 40 },
      sourceText: effect.sourceText,
      targets: ['target'],
    });
    expect(checkInvariants(before, dispatched, result)).toEqual([]);
  });

  it('allows a targetless manual area or world instruction', () => {
    const before = state();
    const effect = baseEffect({ kind: 'table' });
    const dispatched = {
      ...intent(effect),
      payload: { ...intent(effect).payload, targets: [] },
    } as Intent;
    const result = applyIntent(before, dispatched, { random: createSeededRandomSource(1) });

    expect({ ...result.state, occurrences: [] }).toEqual(before);
    expect(result.state.occurrences.map((row) => row.kind)).toEqual(['ability-used']);
    expect(result.log.find((entry) => entry.kind === 'table-directive')?.message).toBe(
      effect.sourceText,
    );
    expect(checkInvariants(before, dispatched, result)).toEqual([]);
  });

  it('refuses an unknown target before any mutation', () => {
    const before = state();
    const dispatched = {
      ...intent(baseEffect({ kind: 'damage', amount: 5, damageType: null })),
      payload: {
        ...intent(baseEffect({ kind: 'damage', amount: 5, damageType: null })).payload,
        targets: ['missing'],
      },
    } as Intent;
    const result = applyIntent(before, dispatched, { random: createSeededRandomSource(1) });

    expect(result.state).toEqual(before);
    expect(result.state.occurrences).toEqual([]);
    expect(result.log[0]?.kind).toBe('refusal');
    expect(checkInvariants(before, dispatched, result)).toEqual([]);
  });
});

// ── characteristic tests [R-0006..R-0011] ─────────────────────────────────
// Verbatim devil-adjudicator Interdiction fixture: "**Effect:** The target
// makes a Presence test." with its three tier bullets. The 17+ payload
// parses in the certified tier grammar (automatic); ≤11 and 12-16 say more
// than the grammar reads and stay verbatim.
const INTERDICTION_TIER1 =
  "- **≤11:** The target is [slowed](scc.v1:mcdm.heroes.v1/condition/slowed), takes a [bane](scc.v1:mcdm.heroes.v1/rule.dice/bane) on power rolls, and can't regain [Stamina](scc.v1:mcdm.heroes.v1/rule.health/stamina) (save ends).";
const INTERDICTION_TIER2 =
  '- **12-16:** The target is [slowed](scc.v1:mcdm.heroes.v1/condition/slowed) and takes a [bane](scc.v1:mcdm.heroes.v1/rule.dice/bane) on power rolls (save ends).';
const INTERDICTION_TIER3 =
  '- **17+:** [Slowed](scc.v1:mcdm.heroes.v1/condition/slowed) (save ends)';

function testEffect(): EffectProgramDataInput {
  return {
    effectArtifactId: 'mcdm.monsters.v1/monster.devil.statblock/devil-adjudicator',
    effectOrdinal: 2,
    sourceSpan: { byteStart: 10, byteEnd: 60 },
    sourceText: 'The target makes a Presence test.',
    canonRefs: [],
    actionType: 'Main action',
    targetsText: 'One creature',
    distanceText: null,
    keywords: [],
    resolution: {
      kind: 'test',
      characteristic: 'presence',
      subject: 'the-target',
      tiers: {
        tier1: { kind: 'verbatim', sourceText: INTERDICTION_TIER1 },
        tier2: { kind: 'verbatim', sourceText: INTERDICTION_TIER2 },
        tier3: {
          kind: 'automatic',
          sourceText: INTERDICTION_TIER3,
          data: {
            damage: null,
            potency: null,
            conditionIds: ['mcdm.heroes.v1/condition/slowed'],
            ending: 'save-ends',
          },
        },
      },
    },
  };
}

function testIntent(
  effect: EffectProgramDataInput,
  overrides: Partial<Extract<Intent, { kind: 'use-effect' }>['payload']> = {},
): Intent {
  return {
    intentId: 'effect-test-i1',
    kind: 'use-effect',
    actor: { kind: 'participant', participantId: 'actor' },
    payload: { actorParticipantId: 'actor', effect, targets: ['target'], ...overrides },
  };
}

describe('characteristic-test execution [R-0006..R-0011]', () => {
  it('rolls the TARGET’s named characteristic and applies an automatic tier through the condition core', () => {
    const before = state();
    // dice 9+9 = natural 18 (< 19, no crit), presence 0 → total 18 → tier 3.
    const dispatched = testIntent(testEffect(), {
      testRolls: { target: { dice: [9, 9] } },
    });
    const result = applyIntent(before, dispatched, { random: createSeededRandomSource(1) });

    const roll = result.log.find((entry) => entry.data.testRoll !== undefined)?.data.testRoll as {
      targetId: string;
      characteristic: string;
      characteristicValue: number;
      testCriticalSuccess: boolean;
      resolution: { tier: number };
    };
    expect(roll.targetId).toBe('target');
    expect(roll.characteristic).toBe('presence');
    expect(roll.characteristicValue).toBe(0);
    expect(roll.resolution.tier).toBe(3);
    expect(roll.testCriticalSuccess).toBe(false);
    expect(
      result.state.participants.target?.conditions.map((instance) => instance.conditionId),
    ).toEqual(['mcdm.heroes.v1/condition/slowed']);
    expect(result.state.participants.target?.conditions[0]?.ending).toEqual({
      kind: 'save-ends',
    });
    expect(checkInvariants(before, dispatched, result)).toEqual([]);
  });

  it('emits the verbatim tier bullet as a table directive on a low roll, mutating nothing', () => {
    const before = state();
    // dice 1+2 = 3, presence 0 → tier 1 → verbatim directive.
    const dispatched = testIntent(testEffect(), {
      testRolls: { target: { dice: [1, 2] } },
    });
    const result = applyIntent(before, dispatched, { random: createSeededRandomSource(1) });

    expect(result.state.participants).toEqual(before.participants);
    expect(result.state.occurrences).toContainEqual(
      expect.objectContaining({ kind: 'roll-made', actorId: 'target', resolutionId: null }),
    );
    const directive = result.log.find((entry) => entry.data.testTierDirective !== undefined);
    expect(directive?.kind).toBe('table-directive');
    expect(directive?.message).toBe(INTERDICTION_TIER1);
    expect(checkInvariants(before, dispatched, result)).toEqual([]);
  });

  it('floors natural 19–20 to tier 3 and records the test critical success [R-0006]', () => {
    const before = state();
    const dispatched = testIntent(testEffect(), {
      testRolls: { target: { dice: [10, 9], banes: 2 } },
    });
    const result = applyIntent(before, dispatched, { random: createSeededRandomSource(1) });

    const roll = result.log.find((entry) => entry.data.testRoll !== undefined)?.data.testRoll as {
      resolution: { tier: number };
      testCriticalSuccess: boolean;
    };
    expect(roll.resolution.tier).toBe(3);
    expect(roll.testCriticalSuccess).toBe(true);
    expect(result.log.some((entry) => entry.data.testCriticalSuccess !== undefined)).toBe(true);
    expect(checkInvariants(before, dispatched, result)).toEqual([]);
  });

  it('rolls each target independently with their own dice [R-0007]', () => {
    const before = state();
    const dispatched = testIntent(testEffect(), {
      targets: ['target', 'actor-2'],
      testRolls: { target: { dice: [9, 9] }, 'actor-2': { dice: [1, 2] } },
    });
    const result = applyIntent(before, dispatched, { random: createSeededRandomSource(1) });

    const rolls = result.log
      .filter((entry) => entry.data.testRoll !== undefined)
      .map((entry) => entry.data.testRoll as { targetId: string; resolution: { tier: number } });
    expect(rolls.map((roll) => [roll.targetId, roll.resolution.tier])).toEqual([
      ['target', 3],
      ['actor-2', 1],
    ]);
    // tier 3 target gains slowed; tier 1 target untouched.
    expect(result.state.participants.target?.conditions).toHaveLength(1);
    expect(result.state.participants['actor-2']?.conditions).toEqual([]);
    expect(checkInvariants(before, dispatched, result)).toEqual([]);
  });

  it('object targets do not roll and automatically obtain tier 1 [R-0007]', () => {
    const before = state();
    const dispatched = testIntent(testEffect(), {
      targets: [],
      objectTargets: ['portcullis'],
    });
    const result = applyIntent(before, dispatched, { random: createSeededRandomSource(1) });

    expect({ ...result.state, occurrences: [] }).toEqual(before);
    expect(result.state.occurrences.map((row) => row.kind)).toEqual(['ability-used']);
    const auto = result.log.find((entry) => entry.data.objectTestTier1 !== undefined);
    expect(auto?.canonRefs).toContain('mcdm.heroes.v1/rule.combat/target');
    const directive = result.log.find((entry) => entry.data.testTierDirective !== undefined);
    expect(directive?.message).toBe(INTERDICTION_TIER1);
    expect(checkInvariants(before, dispatched, result)).toEqual([]);
  });

  it('draws per-target dice from the injected source when none are asserted', () => {
    const before = state();
    const dispatched = testIntent(testEffect(), { targets: ['target', 'actor-2'] });
    const result = applyIntent(before, dispatched, { random: createSeededRandomSource(7) });
    const rolls = result.log.filter((entry) => entry.data.testRoll !== undefined);
    expect(rolls).toHaveLength(2);
    for (const entry of rolls) {
      const roll = entry.data.testRoll as { diceAsserted: boolean };
      expect(roll.diceAsserted).toBe(false);
    }
    expect(checkInvariants(before, dispatched, result)).toEqual([]);
  });

  it('refuses before mutation when a creature target has no stats', () => {
    const seeded = initialEncounterState([{ id: 'actor', kind: 'hero', stats: STATS }]);
    const before = {
      ...seeded,
      participants: {
        ...seeded.participants,
        target: ParticipantStateSchema.parse({
          id: 'target',
          kind: 'director-creature' as const,
          sourceRecordId: null,
          conditions: [],
          stats: null,
          stamina: null,
          grants: [],
        }),
      },
    };
    const dispatched = testIntent(testEffect(), { testRolls: { target: { dice: [9, 9] } } });
    const result = applyIntent(before, dispatched, { random: createSeededRandomSource(1) });
    expect(result.state).toEqual(before);
    expect(result.log[0]?.kind).toBe('refusal');
    expect(checkInvariants(before, dispatched, result)).toEqual([]);
  });
});

describe('test rolls bind the TARGET’s characteristic, never the actor’s (R-0007)', () => {
  it('bands by the target’s score when actor and target scores differ', () => {
    // Actor presence +4, target presence -2: dice 7+7 = 14; with the
    // TARGET's score the total is 12 (tier 2); with the actor's it would be
    // 18 (tier 3). The receipt and the outcome must reflect the target.
    const seeded = initialEncounterState([
      {
        id: 'actor',
        kind: 'hero',
        stats: {
          ...STATS,
          characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 4 },
        },
      },
      {
        id: 'target',
        kind: 'director-creature',
        stats: {
          ...STATS,
          characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: -2 },
        },
      },
    ]);
    const dispatched = testIntent(testEffect(), {
      testRolls: { target: { dice: [7, 7] } },
    });
    const result = applyIntent(seeded, dispatched, { random: createSeededRandomSource(1) });
    const roll = result.log.find((entry) => entry.data.testRoll !== undefined)?.data.testRoll as {
      characteristicValue: number;
      resolution: { total: number; tier: number };
    };
    expect(roll.characteristicValue).toBe(-2);
    expect(roll.resolution.total).toBe(12);
    expect(roll.resolution.tier).toBe(2);
    // Tier 2 is a verbatim bullet — no state change, exact directive.
    expect(result.state.participants).toEqual(seeded.participants);
    expect(result.state.occurrences).toContainEqual(
      expect.objectContaining({ kind: 'roll-made', actorId: 'target', resolutionId: null }),
    );
    expect(checkInvariants(seeded, dispatched, result)).toEqual([]);
  });
});
