import { describe, expect, it } from 'vitest';
import { applyIntent } from './apply-intent.js';
import { createSeededRandomSource } from './determinism.js';
import { initialEncounterState } from './driver.js';
import { checkInvariants } from './invariants.js';
import type { EffectProgramData, Intent, ParticipantStats } from './schemas.js';

const STATS: ParticipantStats = {
  staminaMax: 20,
  characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 },
  immunities: [],
  weaknesses: [],
  potencies: null,
  organization: null,
};

function state() {
  return initialEncounterState([
    { id: 'actor', kind: 'hero', stats: STATS },
    { id: 'actor-2', kind: 'hero', stats: STATS },
    { id: 'target', kind: 'director-creature', stats: STATS },
  ]);
}

function intent(effect: EffectProgramData): Intent {
  return {
    intentId: 'effect-i1',
    kind: 'use-effect',
    actor: { kind: 'participant', participantId: 'actor' },
    payload: { actorParticipantId: 'actor', effect, targets: ['target'] },
  };
}

function baseEffect(resolution: EffectProgramData['resolution']): EffectProgramData {
  return {
    effectArtifactId: 'canon/effect/example',
    effectOrdinal: 1,
    sourceSpan: { byteStart: 10, byteEnd: 40 },
    sourceText: 'x effect instruction',
    canonRefs: ['canon/rule/example'],
    actionType: 'Main action',
    targetsText: 'One creature',
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

  it('preserves unsupported prose verbatim as a table directive without mutation', () => {
    const before = state();
    const effect = baseEffect({ kind: 'table' });
    effect.sourceText = 'x bespoke instruction with every word retained';
    const dispatched = intent(effect);
    const result = applyIntent(before, dispatched, { random: createSeededRandomSource(1) });

    expect(result.state).toEqual(before);
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

    expect(result.state).toEqual(before);
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
    expect(result.log[0]?.kind).toBe('refusal');
    expect(checkInvariants(before, dispatched, result)).toEqual([]);
  });
});
