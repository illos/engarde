import { describe, expect, it } from 'vitest';
import { upgradeEncounterState } from './migrate.js';

/** The lossless v6 participant additions every lift supplies by default. */
const V6_PARTICIPANT_DEFAULTS = {
  traits: {
    turnAllowance: 1,
    noConsecutiveTurns: false,
    triggeredActionLimit: 1,
    subActorOf: null,
  },
  actionBudget: {},
  triggeredThisRound: 0,
  abilityUses: {},
};

/** The lossless v6 encounter-level additions. */
const V6_ENCOUNTER_DEFAULTS = {
  turnState: null,
  villainActions: { usedThisRound: false, usedByAbility: [] },
  resolutionStack: [],
};

describe('upgradeEncounterState (design SE-2)', () => {
  it('lifts a stored v1 state losslessly into v6 table-mode participants', () => {
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
    expect(lifted.schemaVersion).toBe(6);
    const fury = lifted.participants.fury;
    if (!fury) throw new Error('fury missing after upgrade');
    expect(fury.kind).toBe('director-creature');
    expect(fury.stats).toBeNull();
    expect(fury.stamina).toBeNull();
    expect(fury.grants).toEqual([]);
    expect(fury.conditions).toEqual(v1.participants.fury.conditions);
    expect(fury.sourceRecordId).toBe('mcdm.heroes.v1/class/fury');
    expect(fury.traits).toEqual(V6_PARTICIPANT_DEFAULTS.traits);
    expect(lifted.turnState).toBeNull();
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
      schemaVersion: 6,
      terrainFacts: [],
      squads: [],
      ...V6_ENCOUNTER_DEFAULTS,
      participants: {
        goblin: { ...v2.participants.goblin, grants: [], ...V6_PARTICIPANT_DEFAULTS },
      },
    });
  });

  it('lifts a v5 state: existing grants wrap as kind next-roll, v6 slots default (R-0029..R-0033)', () => {
    const v5 = {
      schemaVersion: 5,
      terrainFacts: [],
      squads: [],
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
    const lifted = upgradeEncounterState(v5);
    expect(lifted).toEqual({
      ...v5,
      schemaVersion: 6,
      ...V6_ENCOUNTER_DEFAULTS,
      participants: {
        goblin: {
          ...v5.participants.goblin,
          // Migration wraps every stored grant as the next-roll kind
          // (design §3) — no field is dropped.
          grants: [{ kind: 'next-roll', ...(v5.participants.goblin.grants[0] ?? {}) }],
          ...V6_PARTICIPANT_DEFAULTS,
        },
      },
    });
  });

  it('round-trips a v6 state unchanged', () => {
    const v5 = {
      schemaVersion: 5,
      terrainFacts: [],
      squads: [],
      participants: {
        goblin: {
          id: 'goblin',
          conditions: [],
          sourceRecordId: null,
          kind: 'director-creature',
          stats: null,
          stamina: null,
          grants: [],
        },
      },
    };
    const lifted = upgradeEncounterState(v5);
    expect(upgradeEncounterState(lifted)).toEqual(lifted);
  });

  it('lifts a stored v4 state by adding the empty squads slot (R-0023..R-0028 substrate)', () => {
    const v4 = {
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
          grants: [],
        },
      },
    };
    const lifted = upgradeEncounterState(v4);
    expect(lifted).toEqual({
      schemaVersion: 6,
      terrainFacts: [],
      squads: [],
      ...V6_ENCOUNTER_DEFAULTS,
      participants: {
        goblin: { ...v4.participants.goblin, ...V6_PARTICIPANT_DEFAULTS },
      },
    });
  });

  it('rejects garbage', () => {
    expect(() => upgradeEncounterState({ schemaVersion: 5 })).toThrow();
  });
});
