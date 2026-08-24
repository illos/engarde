import { describe, expect, it } from 'vitest';
import { applyIntent } from './apply-intent.js';
import { CANON, SAVING_THROW } from './condition-lifecycle.js';
import { createSeededRandomSource } from './determinism.js';
import type { EncounterState, Intent } from './schemas.js';

/**
 * Fixtures use REAL corpus records only (prime directive): the condition and
 * machinery artifact ids below are the pilot scope's actual artifacts, and
 * every asserted behavior traces to their verbatim text (canon ref in CANON).
 * Participant ids are host identifiers, not rule content.
 */
const WEAKENED = 'mcdm.heroes.v1/condition/weakened';
const FRIGHTENED = 'mcdm.heroes.v1/condition/frightened';
const GRABBED = 'mcdm.heroes.v1/condition/grabbed';
const RESTRAINED = 'mcdm.heroes.v1/condition/restrained';

function freshState(): EncounterState {
  return {
    schemaVersion: 2,
    participants: {
      hero: { id: 'hero', conditions: [], kind: 'hero', stats: null, stamina: null },
      cultist: {
        id: 'cultist',
        conditions: [],
        kind: 'director-creature',
        stats: null,
        stamina: null,
      },
    },
  };
}

function dispatch(state: EncounterState, intent: Intent, seed = 1): ReturnType<typeof applyIntent> {
  return applyIntent(state, intent, { random: createSeededRandomSource(seed) });
}

function apply(
  state: EncounterState,
  overrides: Partial<Extract<Intent, { kind: 'apply-condition' }>['payload']> = {},
  intentId = 'i1',
): ReturnType<typeof applyIntent> {
  return dispatch(state, {
    intentId,
    kind: 'apply-condition',
    actor: { kind: 'director' },
    payload: {
      target: 'hero',
      conditionId: WEAKENED,
      ending: { kind: 'save-ends' },
      source: { participantId: 'cultist' },
      ...overrides,
    },
  });
}

describe('apply-condition', () => {
  it('records an instance and logs an attributed mutation with canon refs', () => {
    const { state, log } = apply(freshState());
    const conditions = state.participants.hero?.conditions ?? [];
    expect(conditions).toHaveLength(1);
    expect(conditions[0]?.conditionId).toBe(WEAKENED);
    expect(conditions[0]?.ending).toEqual({ kind: 'save-ends' });
    const mutation = log.find((entry) => entry.kind === 'mutation');
    expect(mutation?.intentId).toBe('i1');
    expect(mutation?.actor).toEqual({ kind: 'director' });
    expect(mutation?.canonRefs).toContain(WEAKENED);
  });

  it('derives a deterministic instance id from the intent id', () => {
    const first = apply(freshState());
    const second = apply(freshState());
    expect(first.state.participants.hero?.conditions[0]?.instanceId).toBe(
      second.state.participants.hero?.conditions[0]?.instanceId,
    );
  });

  it('keeps duplicate applications as separate non-compounding instances and says so', () => {
    // classes#condition-stacking: same condition from different effects does
    // not impose the condition twice — presence is boolean, but each imposing
    // effect keeps its own ending, so both instances are tracked.
    const first = apply(freshState());
    const { state, log } = apply(first.state, { ending: { kind: 'end-of-encounter' } }, 'i2');
    expect(state.participants.hero?.conditions).toHaveLength(2);
    const info = log.find((entry) => entry.kind === 'informational');
    expect(info?.canonRefs).toContain(CANON.conditionStacking);
  });

  it('replaces the prior instance when the condition replaces on a new source', () => {
    // condition/frightened: gaining it from a new source replaces the old one.
    const first = apply(freshState(), {
      conditionId: FRIGHTENED,
      replacesOnNewSource: true,
      source: { participantId: 'cultist' },
    });
    const { state, log } = apply(
      first.state,
      {
        conditionId: FRIGHTENED,
        replacesOnNewSource: true,
        source: { participantId: 'hero' },
      },
      'i2',
    );
    const conditions = state.participants.hero?.conditions ?? [];
    expect(conditions).toHaveLength(1);
    expect(conditions[0]?.source.participantId).toBe('hero');
    expect(log.filter((entry) => entry.kind === 'mutation')).toHaveLength(2);
  });

  it('refuses an unknown participant without touching state', () => {
    const before = freshState();
    const { state, log } = apply(before, { target: 'nobody' });
    expect(state).toEqual(before);
    expect(log[0]?.kind).toBe('refusal');
  });
});

describe('end-turn saving throws', () => {
  it('ends a save-ends instance on a supplied roll at or above the threshold', () => {
    // rule.general/saving-throw: d10, on 6 or higher the effect ends.
    const applied = apply(freshState());
    const { state, log } = dispatch(applied.state, {
      intentId: 'i2',
      kind: 'end-turn',
      actor: { kind: 'participant', participantId: 'hero' },
      payload: { participantId: 'hero', rolls: { [`${WEAKENED}#i1`]: 6 } },
    });
    expect(state.participants.hero?.conditions).toHaveLength(0);
    const mutation = log.find((entry) => entry.kind === 'mutation');
    expect(mutation?.canonRefs).toContain(CANON.savingThrow);
  });

  it('keeps the instance on a failed save and logs the roll', () => {
    const applied = apply(freshState());
    const { state, log } = dispatch(applied.state, {
      intentId: 'i2',
      kind: 'end-turn',
      actor: { kind: 'participant', participantId: 'hero' },
      payload: { participantId: 'hero', rolls: { [`${WEAKENED}#i1`]: SAVING_THROW.success - 1 } },
    });
    expect(state.participants.hero?.conditions).toHaveLength(1);
    expect(log.find((entry) => entry.kind === 'informational')).toBeDefined();
  });

  it('auto-rolls from the injected random source when no roll is asserted', () => {
    const applied = apply(freshState());
    const auto = dispatch(applied.state, {
      intentId: 'i2',
      kind: 'end-turn',
      actor: { kind: 'participant', participantId: 'hero' },
      payload: { participantId: 'hero' },
    });
    const expected = createSeededRandomSource(1).roll(SAVING_THROW.die);
    const remaining = auto.state.participants.hero?.conditions.length;
    expect(remaining).toBe(expected >= SAVING_THROW.success ? 0 : 1);
  });

  it("expires an end-of-targets-next-turn instance at the bearer's end of turn", () => {
    // feature.ability.tactician.level-1/mark: "taunted by you until the end
    // of their next turn".
    const applied = apply(freshState(), {
      conditionId: 'mcdm.heroes.v1/condition/taunted',
      ending: { kind: 'end-of-targets-next-turn' },
    });
    const { state } = dispatch(applied.state, {
      intentId: 'i2',
      kind: 'end-turn',
      actor: { kind: 'participant', participantId: 'hero' },
      payload: { participantId: 'hero' },
    });
    expect(state.participants.hero?.conditions).toHaveLength(0);
  });

  it('leaves external-ending instances alone at end of turn', () => {
    const applied = apply(freshState(), {
      conditionId: GRABBED,
      ending: { kind: 'external' },
    });
    const { state } = dispatch(applied.state, {
      intentId: 'i2',
      kind: 'end-turn',
      actor: { kind: 'participant', participantId: 'hero' },
      payload: { participantId: 'hero' },
    });
    expect(state.participants.hero?.conditions).toHaveLength(1);
  });
});

describe('remove-condition', () => {
  it('removes a named instance and logs the removal', () => {
    // condition/grabbed: release at any time; classes#creature-ends-an-
    // ability-effect: the imposer can end their effect.
    const applied = apply(freshState(), { conditionId: GRABBED, ending: { kind: 'external' } });
    const instanceId = applied.state.participants.hero?.conditions[0]?.instanceId ?? '';
    const { state, log } = dispatch(applied.state, {
      intentId: 'i2',
      kind: 'remove-condition',
      actor: { kind: 'participant', participantId: 'cultist' },
      payload: { target: 'hero', instanceId },
    });
    expect(state.participants.hero?.conditions).toHaveLength(0);
    expect(log.find((entry) => entry.kind === 'mutation')?.canonRefs).toContain(
      CANON.creatureEndsAbilityEffect,
    );
  });

  it('refuses removing a nonexistent instance', () => {
    const before = freshState();
    const { state, log } = dispatch(before, {
      intentId: 'i2',
      kind: 'remove-condition',
      actor: { kind: 'director' },
      payload: { target: 'hero', instanceId: 'missing' },
    });
    expect(state).toEqual(before);
    expect(log[0]?.kind).toBe('refusal');
  });
});

describe('end-encounter', () => {
  it('ends all remaining instances by default, honoring explicit keeps', () => {
    // classes#ending-effects: conditions imposed during the encounter end
    // when it is over if the hero wants them to — ending is the default,
    // keeping is the player-asserted exception.
    let current = apply(freshState()).state;
    current = apply(current, { conditionId: RESTRAINED, ending: { kind: 'external' } }, 'i2').state;
    const keep = current.participants.hero?.conditions[1]?.instanceId ?? '';
    const { state, log } = dispatch(current, {
      intentId: 'i3',
      kind: 'end-encounter',
      actor: { kind: 'director' },
      payload: { keepInstanceIds: [keep] },
    });
    const conditions = state.participants.hero?.conditions ?? [];
    expect(conditions).toHaveLength(1);
    expect(conditions[0]?.instanceId).toBe(keep);
    const sweep = log.filter((entry) => entry.kind === 'mutation');
    expect(sweep).toHaveLength(1);
    expect(sweep[0]?.canonRefs).toContain(CANON.endingEffects);
    expect(log.find((entry) => entry.kind === 'informational')).toBeDefined();
  });
});
