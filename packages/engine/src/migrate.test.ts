import { describe, expect, it } from 'vitest';
import { upgradeEncounterState } from './migrate.js';

/** The lossless v6 participant additions every lift supplies by default. */
const V8_PARTICIPANT_DEFAULTS = {
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
const V8_ENCOUNTER_DEFAULTS = {
  turnState: null,
  villainActions: { usedThisRound: false, usedByAbility: [] },
  resolutionStack: [],
  /** v7 (R-0040): a stored encounter has no recorded past, so the honest
   * upgrade is an empty occurrence ledger — never invented history. */
  occurrences: [],
};

describe('upgradeEncounterState (design SE-2)', () => {
  it('lifts a stored v1 state losslessly into v8 table-mode participants', () => {
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
    expect(lifted.schemaVersion).toBe(8);
    const fury = lifted.participants.fury;
    if (!fury) throw new Error('fury missing after upgrade');
    expect(fury.kind).toBe('director-creature');
    expect(fury.stats).toBeNull();
    expect(fury.stamina).toBeNull();
    expect(fury.grants).toEqual([]);
    expect(fury.conditions).toEqual(v1.participants.fury.conditions);
    expect(fury.sourceRecordId).toBe('mcdm.heroes.v1/class/fury');
    expect(fury.traits).toEqual(V8_PARTICIPANT_DEFAULTS.traits);
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
      schemaVersion: 8,
      terrainFacts: [],
      squads: [],
      ...V8_ENCOUNTER_DEFAULTS,
      participants: {
        goblin: { ...v2.participants.goblin, grants: [], ...V8_PARTICIPANT_DEFAULTS },
      },
    });
  });

  it('lifts a v5 state: existing grants wrap as kind next-roll, v6/v7 slots default (R-0029..R-0033, R-0040)', () => {
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
      schemaVersion: 8,
      ...V8_ENCOUNTER_DEFAULTS,
      participants: {
        goblin: {
          ...v5.participants.goblin,
          // Migration wraps every stored grant as the next-roll kind
          // (design §3) — no field is dropped.
          grants: [{ kind: 'next-roll', ...(v5.participants.goblin.grants[0] ?? {}) }],
          ...V8_PARTICIPANT_DEFAULTS,
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
      schemaVersion: 8,
      terrainFacts: [],
      squads: [],
      ...V8_ENCOUNTER_DEFAULTS,
      participants: {
        goblin: { ...v4.participants.goblin, ...V8_PARTICIPANT_DEFAULTS },
      },
    });
  });

  it('lifts a v6 state by adding the empty occurrence ledger (R-0040 substrate)', () => {
    const v6 = {
      schemaVersion: 6,
      terrainFacts: [],
      squads: [],
      turnState: null,
      villainActions: { usedThisRound: false, usedByAbility: [] },
      resolutionStack: [],
      participants: {
        goblin: {
          id: 'goblin',
          conditions: [],
          sourceRecordId: null,
          kind: 'director-creature',
          stats: null,
          stamina: null,
          grants: [],
          ...V8_PARTICIPANT_DEFAULTS,
        },
      },
    };
    const lifted = upgradeEncounterState(v6);
    expect(lifted).toEqual({ ...v6, schemaVersion: 8, occurrences: [] });
  });

  it('lifts a v7 state by reconstructing each entry declaration hash (R-0041)', () => {
    // A stored v7 entry was rolled with no declaration phase, so its
    // declaration is exactly what it rolled — reconstructed from the
    // entry's own actor and ability, never invented.
    const receipt = {
      dice: [5, 5],
      characteristicValue: 0,
      characteristicLabel: 'M',
      bonuses: [],
      penalties: [],
      edges: 0,
      banes: 0,
      automaticOutcomes: [],
      downgradeToTier: null,
      natural: 10,
      total: 10,
      tier: 1,
      naturalTopEnd: false,
    };
    const v7 = {
      schemaVersion: 7,
      terrainFacts: [],
      squads: [],
      turnState: {
        round: 1,
        firstSide: 'director',
        sideToChoose: 'director',
        activeTurnId: 'goblin',
        lastTurnId: null,
        turnsTaken: {},
      },
      villainActions: { usedThisRound: false, usedByAbility: [] },
      occurrences: [],
      resolutionStack: [
        {
          kind: 'ability',
          resolutionId: 'r1',
          actorId: 'goblin',
          abilityArtifactId:
            'mcdm.monsters.v1/monster.goblin.statblock/goblin-warrior#spear-charge',
          actionCost: 'main-action',
          payloadHash: 'a'.repeat(64),
          actionKey: 'r1',
          phase: 'rolled',
          rollReceipt: receipt,
          modifications: [],
          squadBreakdown: null,
        },
      ],
      participants: {
        goblin: {
          id: 'goblin',
          conditions: [],
          sourceRecordId: null,
          kind: 'director-creature',
          stats: null,
          stamina: null,
          grants: [],
          ...V8_PARTICIPANT_DEFAULTS,
        },
      },
    };
    const lifted = upgradeEncounterState(v7);
    expect(lifted.schemaVersion).toBe(8);
    const entry = lifted.resolutionStack[0];
    expect(entry?.phase).toBe('rolled');
    expect(entry?.declarationHash).toMatch(/^[0-9a-f]{64}$/);
    // Re-upgrading is a no-op: the reconstructed hash is stable.
    expect(upgradeEncounterState(lifted)).toEqual(lifted);
  });

  it('rejects garbage', () => {
    expect(() => upgradeEncounterState({ schemaVersion: 5 })).toThrow();
  });
});
