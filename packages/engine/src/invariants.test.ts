import { describe, expect, it } from 'vitest';
import { applyIntent } from './apply-intent.js';
import { createSeededRandomSource } from './determinism.js';
import { checkInvariants } from './invariants.js';
import type { EncounterState, Intent, LogEntry } from './schemas.js';

/** Real corpus condition ids (prime directive: no invented fixtures). */
const WEAKENED = 'mcdm.heroes.v1/condition/weakened';
const FRIGHTENED = 'mcdm.heroes.v1/condition/frightened';
const GRABBED = 'mcdm.heroes.v1/condition/grabbed';

function freshState(): EncounterState {
  return {
    schemaVersion: 1,
    participants: {
      hero: { id: 'hero', conditions: [] },
      cultist: { id: 'cultist', conditions: [] },
    },
  };
}

function dispatchChecked(state: EncounterState, intent: Intent, seed = 1) {
  const result = applyIntent(state, intent, { random: createSeededRandomSource(seed) });
  return { result, violations: checkInvariants(state, intent, result) };
}

const applyWeakened: Intent = {
  intentId: 'i1',
  kind: 'apply-condition',
  actor: { kind: 'director' },
  payload: {
    target: 'hero',
    conditionId: WEAKENED,
    ending: { kind: 'save-ends' },
    source: { participantId: 'cultist' },
  },
};

describe('invariants hold across every intent path', () => {
  it('apply-condition reconciles', () => {
    const { violations } = dispatchChecked(freshState(), applyWeakened);
    expect(violations).toEqual([]);
  });

  it('replacement (frightened new source) reconciles adds and removes', () => {
    const first = applyIntent(
      freshState(),
      {
        intentId: 'i1',
        kind: 'apply-condition',
        actor: { kind: 'director' },
        payload: {
          target: 'hero',
          conditionId: FRIGHTENED,
          ending: { kind: 'external' },
          source: { participantId: 'cultist' },
          replacesOnNewSource: true,
        },
      },
      { random: createSeededRandomSource(1) },
    );
    const { violations } = dispatchChecked(first.state, {
      intentId: 'i2',
      kind: 'apply-condition',
      actor: { kind: 'director' },
      payload: {
        target: 'hero',
        conditionId: FRIGHTENED,
        ending: { kind: 'external' },
        source: { participantId: 'hero' },
        replacesOnNewSource: true,
      },
    });
    expect(violations).toEqual([]);
  });

  it('end-turn saves, removal, end-encounter, and refusal all reconcile', () => {
    const applied = applyIntent(freshState(), applyWeakened, {
      random: createSeededRandomSource(1),
    });
    const endTurn = dispatchChecked(applied.state, {
      intentId: 'i2',
      kind: 'end-turn',
      actor: { kind: 'participant', participantId: 'hero' },
      payload: { participantId: 'hero', rolls: { [`${WEAKENED}#i1`]: 6 } },
    });
    expect(endTurn.violations).toEqual([]);

    const grabApplied = applyIntent(
      freshState(),
      {
        intentId: 'g1',
        kind: 'apply-condition',
        actor: { kind: 'director' },
        payload: {
          target: 'hero',
          conditionId: GRABBED,
          ending: { kind: 'external' },
          source: { participantId: 'cultist' },
        },
      },
      { random: createSeededRandomSource(1) },
    );
    const removal = dispatchChecked(grabApplied.state, {
      intentId: 'g2',
      kind: 'remove-condition',
      actor: { kind: 'participant', participantId: 'cultist' },
      payload: { target: 'hero', instanceId: `${GRABBED}#g1` },
    });
    expect(removal.violations).toEqual([]);

    const endEncounter = dispatchChecked(applied.state, {
      intentId: 'e1',
      kind: 'end-encounter',
      actor: { kind: 'director' },
      payload: { keepInstanceIds: [] },
    });
    expect(endEncounter.violations).toEqual([]);

    const refusal = dispatchChecked(freshState(), {
      intentId: 'r1',
      kind: 'remove-condition',
      actor: { kind: 'director' },
      payload: { target: 'hero', instanceId: 'missing' },
    });
    expect(refusal.violations).toEqual([]);
  });

  it('identical inputs produce byte-identical outputs (determinism)', () => {
    const a = applyIntent(freshState(), applyWeakened, { random: createSeededRandomSource(7) });
    const b = applyIntent(freshState(), applyWeakened, { random: createSeededRandomSource(7) });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('invariants catch broken results', () => {
  it('flags a silent mutation (state changed, no claiming entry)', () => {
    const before = freshState();
    const good = applyIntent(before, applyWeakened, { random: createSeededRandomSource(1) });
    const tampered = { state: good.state, log: [] };
    const codes = checkInvariants(before, applyWeakened, tampered).map((entry) => entry.code);
    expect(codes).toContain('unattributed-add');
  });

  it('flags an unattributed removal', () => {
    const applied = applyIntent(freshState(), applyWeakened, {
      random: createSeededRandomSource(1),
    });
    const intent: Intent = {
      intentId: 'i2',
      kind: 'end-encounter',
      actor: { kind: 'director' },
      payload: { keepInstanceIds: [] },
    };
    const good = applyIntent(applied.state, intent, { random: createSeededRandomSource(1) });
    const tampered = { state: good.state, log: [] };
    const codes = checkInvariants(applied.state, intent, tampered).map((entry) => entry.code);
    expect(codes).toContain('unattributed-remove');
  });

  it('flags a phantom mutation claim', () => {
    const before = freshState();
    const phantom: LogEntry = {
      kind: 'mutation',
      intentId: 'i1',
      actor: { kind: 'director' },
      canonRefs: [WEAKENED],
      message: 'x',
      data: { addedInstanceIds: ['never-created'] },
    };
    const codes = checkInvariants(before, applyWeakened, { state: before, log: [phantom] }).map(
      (entry) => entry.code,
    );
    expect(codes).toContain('phantom-claim');
  });

  it('flags a refusal that nevertheless changed state', () => {
    const before = freshState();
    const good = applyIntent(before, applyWeakened, { random: createSeededRandomSource(1) });
    const refusal: LogEntry = {
      kind: 'refusal',
      intentId: 'i1',
      actor: { kind: 'director' },
      canonRefs: [],
      message: 'x',
      data: {},
    };
    const codes = checkInvariants(before, applyWeakened, {
      state: good.state,
      log: [...good.log, refusal],
    }).map((entry) => entry.code);
    expect(codes).toContain('refusal-with-change');
  });

  it('flags misattribution, participant drift, and duplicate instance ids', () => {
    const before = freshState();
    const good = applyIntent(before, applyWeakened, { random: createSeededRandomSource(1) });
    const wrongIntent: Intent = { ...applyWeakened, intentId: 'other' };
    expect(checkInvariants(before, wrongIntent, good).map((entry) => entry.code)).toContain(
      'misattributed-entry',
    );

    const dropped = {
      state: { ...good.state, participants: { hero: good.state.participants.hero } },
      log: good.log,
    };
    expect(
      // biome-ignore lint/suspicious/noExplicitAny: deliberately malformed fixture
      checkInvariants(before, applyWeakened, dropped as any).map((entry) => entry.code),
    ).toContain('participant-set-changed');

    const hero = good.state.participants.hero;
    if (!hero) throw new Error('missing hero');
    const duplicated = {
      state: {
        ...good.state,
        participants: {
          ...good.state.participants,
          hero: { ...hero, conditions: [...hero.conditions, ...hero.conditions] },
        },
      },
      log: good.log,
    };
    expect(checkInvariants(before, applyWeakened, duplicated).map((entry) => entry.code)).toContain(
      'duplicate-instance-id',
    );
  });
});
