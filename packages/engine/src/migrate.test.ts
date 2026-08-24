import { describe, expect, it } from 'vitest';
import { upgradeEncounterState } from './migrate.js';

describe('upgradeEncounterState (design SE-2)', () => {
  it('lifts a stored v1 state losslessly into v2 table-mode participants', () => {
    const v1 = {
      schemaVersion: 1,
      participants: {
        fury: {
          id: 'fury',
          conditions: [
            {
              instanceId: 'mcdm.heroes.v1/condition/dazed#i4',
              conditionId: 'mcdm.heroes.v1/condition/dazed',
              ending: { kind: 'save-ends' },
              source: { participantId: 'censor' },
            },
          ],
          sourceRecordId: 'mcdm.heroes.v1/class/fury',
        },
      },
    };
    const v2 = upgradeEncounterState(v1);
    expect(v2.schemaVersion).toBe(2);
    const fury = v2.participants.fury;
    if (!fury) throw new Error('fury missing after upgrade');
    expect(fury.kind).toBe('director-creature');
    expect(fury.stats).toBeNull();
    expect(fury.stamina).toBeNull();
    expect(fury.conditions).toEqual(v1.participants.fury.conditions);
    expect(fury.sourceRecordId).toBe('mcdm.heroes.v1/class/fury');
  });

  it('passes a v2 state through unchanged', () => {
    const v2 = {
      schemaVersion: 2,
      participants: {
        goblin: {
          id: 'goblin',
          conditions: [],
          sourceRecordId: null,
          kind: 'director-creature',
          stats: null,
          stamina: null,
        },
      },
    };
    expect(upgradeEncounterState(v2)).toEqual(v2);
  });

  it('rejects garbage', () => {
    expect(() => upgradeEncounterState({ schemaVersion: 3 })).toThrow();
  });
});
