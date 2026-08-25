import { describe, expect, it } from 'vitest';
import { upgradeEncounterState } from './migrate.js';

describe('upgradeEncounterState (design SE-2)', () => {
  it('lifts a stored v1 state losslessly into v3 table-mode participants', () => {
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
    const lifted = upgradeEncounterState(v1);
    expect(lifted.schemaVersion).toBe(4);
    const fury = lifted.participants.fury;
    if (!fury) throw new Error('fury missing after upgrade');
    expect(fury.kind).toBe('director-creature');
    expect(fury.stats).toBeNull();
    expect(fury.stamina).toBeNull();
    expect(fury.grants).toEqual([]);
    expect(fury.conditions).toEqual(v1.participants.fury.conditions);
    expect(fury.sourceRecordId).toBe('mcdm.heroes.v1/class/fury');
  });

  it('lifts a stored v2 state by adding the empty grants slot (R-0012..R-0016 substrate)', () => {
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
    const lifted = upgradeEncounterState(v2);
    expect(lifted).toEqual({
      schemaVersion: 4,
      terrainFacts: [],
      participants: {
        goblin: { ...v2.participants.goblin, grants: [] },
      },
    });
  });

  it('passes a v3 state through unchanged', () => {
    const v3 = {
      schemaVersion: 4,
      terrainFacts: [],
      participants: {
        goblin: {
          id: 'goblin',
          conditions: [],
          sourceRecordId: null,
          kind: 'director-creature',
          stats: null,
          stamina: null,
          grants: [
            {
              grantId: 'mcdm.monsters.v1/monster.goblin.statblock/skitterling#i1-goblin',
              polarity: 'bane',
              scope: 'strike',
              direction: 'outbound',
              source: { participantId: 'skitterling' },
              window: null,
            },
          ],
        },
      },
    };
    expect(upgradeEncounterState(v3)).toEqual(v3);
  });

  it('rejects garbage', () => {
    expect(() => upgradeEncounterState({ schemaVersion: 4 })).toThrow();
  });
});
