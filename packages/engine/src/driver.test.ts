import { describe, expect, it } from 'vitest';
import { createSeededRandomSource } from './determinism.js';
import { createDriver } from './driver.js';

/** Real corpus ids only (prime directive). */
const WEAKENED = 'mcdm.heroes.v1/condition/weakened';
const FURY = 'mcdm.heroes.v1/class/fury';
const CENSOR = 'mcdm.heroes.v1/class/censor';

function driver(seed = 1) {
  return createDriver(
    [
      { id: 'fury', sourceRecordId: FURY, kind: 'hero' as const },
      { id: 'censor', sourceRecordId: CENSOR, kind: 'hero' as const },
    ],
    { random: createSeededRandomSource(seed) },
  );
}

describe('driver harness', () => {
  it('creates an encounter with corpus-sourced participants', () => {
    const harness = driver();
    expect(harness.state().participants.fury?.sourceRecordId).toBe(FURY);
    expect(harness.state().participants.censor?.conditions).toEqual([]);
  });

  it('dispatches, accumulates the log, and runs invariants per step', () => {
    const harness = driver();
    const result = harness.dispatch({
      intentId: 's1',
      kind: 'apply-condition',
      actor: { kind: 'participant', participantId: 'fury' },
      payload: {
        target: 'censor',
        conditionId: WEAKENED,
        ending: { kind: 'save-ends' },
        source: { participantId: 'fury' },
      },
    });
    expect(result.violations).toEqual([]);
    expect(harness.state().participants.censor?.conditions).toHaveLength(1);
    expect(harness.log().some((entry) => entry.kind === 'mutation')).toBe(true);
  });

  it('records but does not adopt an invariant-violating candidate state', () => {
    const harness = driver();
    const intent = {
      intentId: 'replayed',
      kind: 'apply-condition' as const,
      actor: { kind: 'participant' as const, participantId: 'fury' },
      payload: {
        target: 'censor',
        conditionId: WEAKENED,
        ending: { kind: 'save-ends' as const },
        source: { participantId: 'fury' },
      },
    };
    expect(harness.dispatch(intent).violations).toEqual([]);
    const logLength = harness.log().length;
    const replay = harness.dispatch(intent);

    expect(replay.violations.map((violation) => violation.code)).toContain('duplicate-instance-id');
    expect(harness.state().participants.censor?.conditions).toHaveLength(1);
    expect(harness.log()).toHaveLength(logLength);
    expect(harness.transcript().violationCount).toBeGreaterThan(0);
  });

  it('produces a transcript with steps, final state, and a violation count', () => {
    const harness = driver();
    harness.dispatch({
      intentId: 's1',
      kind: 'apply-condition',
      actor: { kind: 'director' },
      payload: {
        target: 'fury',
        conditionId: WEAKENED,
        ending: { kind: 'save-ends' },
        source: { participantId: 'censor' },
      },
    });
    harness.dispatch({
      intentId: 's2',
      kind: 'end-turn',
      actor: { kind: 'participant', participantId: 'fury' },
      payload: { participantId: 'fury', rolls: { [`${WEAKENED}#s1`]: 6 } },
    });
    const transcript = harness.transcript();
    expect(transcript.schema).toBe('engarde-encounter-transcript-v1');
    expect(transcript.steps).toHaveLength(2);
    expect(transcript.violationCount).toBe(0);
    expect(transcript.finalState.participants.fury?.conditions).toEqual([]);
    expect(transcript.participants.map((participant) => participant.sourceRecordId)).toEqual([
      FURY,
      CENSOR,
    ]);
  });

  it('rejects empty rosters and duplicate participant ids', () => {
    expect(() => createDriver([], { random: createSeededRandomSource(1) })).toThrow(
      /needs participants/,
    );
    expect(() =>
      createDriver(
        [
          { id: 'x', kind: 'hero' as const },
          { id: 'x', kind: 'hero' as const },
        ],
        { random: createSeededRandomSource(1) },
      ),
    ).toThrow(/duplicate participant/);
  });

  it('is deterministic end to end for a fixed seed', () => {
    const run = () => {
      const harness = driver(9);
      harness.dispatch({
        intentId: 's1',
        kind: 'apply-condition',
        actor: { kind: 'director' },
        payload: {
          target: 'fury',
          conditionId: WEAKENED,
          ending: { kind: 'save-ends' },
          source: { participantId: 'censor' },
        },
      });
      harness.dispatch({
        intentId: 's2',
        kind: 'end-turn',
        actor: { kind: 'participant', participantId: 'fury' },
        payload: { participantId: 'fury' },
      });
      return JSON.stringify(harness.transcript());
    };
    expect(run()).toBe(run());
  });
});
