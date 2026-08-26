import { describe, expect, it } from 'vitest';
import { applyIntent } from './apply-intent.js';
import { createSeededRandomSource } from './determinism.js';
import { checkInvariants } from './invariants.js';
import type { AbilityEffectData, EncounterState, Intent, ParticipantStats } from './schemas.js';

/**
 * use-ability executor TDD (docs/power-roll-design.md §4.1).
 *
 * GOLDEN FIXTURE: the book's own worked example in rule.character/potency —
 * the 1st-level conduit's Judgment's Hammer (Power Roll + Intuition; ≤11:
 * 3 + I holy damage; A < WEAK, prone; 12–16: 6 + I holy damage; A < AVERAGE,
 * prone; 17+: 9 + I holy damage; A < STRONG, prone and can't stand (save
 * ends)) against a bandit with Agility 0. The record works the numbers:
 * conduit Intuition 2 → potencies 0/1/2, damage 5/8/11; tier 1 resisted,
 * tiers 2–3 prone. This suite reproduces every one of them.
 *
 * Dice are asserted test vectors (dice-as-input); rule content is verbatim
 * from the record.
 */

function must<T>(value: T | undefined | null): T {
  if (value === undefined || value === null) throw new Error('expected a value');
  return value;
}

const PRONE = 'mcdm.heroes.v1/condition/prone';

const JUDGMENTS_HAMMER: AbilityEffectData = {
  abilityArtifactId: 'mcdm.heroes.v1/rule.character/potency#judgments-hammer-example',
  actionType: 'Main action',
  keywords: [],
  targetsText: 'One creature',
  powerRollBonus: { kind: 'characteristic', options: ['I'] },
  tiers: {
    tier1: {
      damage: { amount: 3, characteristicOptions: ['I'], typeOptions: ['holy'] },
      potency: { characteristic: 'A', threshold: { kind: 'named', name: 'weak' } },
      conditionIds: [PRONE],
      ending: null,
    },
    tier2: {
      damage: { amount: 6, characteristicOptions: ['I'], typeOptions: ['holy'] },
      potency: { characteristic: 'A', threshold: { kind: 'named', name: 'average' } },
      conditionIds: [PRONE],
      ending: null,
    },
    tier3: {
      damage: { amount: 9, characteristicOptions: ['I'], typeOptions: ['holy'] },
      potency: { characteristic: 'A', threshold: { kind: 'named', name: 'strong' } },
      conditionIds: [PRONE],
      ending: 'save-ends',
    },
  },
};

/** Goblin Warrior's strike lines (monsters/md/monster/goblin/statblock/
 * goblin-warrior.md): Power Roll + 2; ≤11: 5 damage; M < 0 bleeding (save
 * ends); 12–16: 6 damage; M < 1 …; 17+: 7 damage; M < 2 …. */
const BLEEDING = 'mcdm.heroes.v1/condition/bleeding';
const GOBLIN_STRIKE: AbilityEffectData = {
  abilityArtifactId: 'mcdm.monsters.v1/monster.goblin.statblock/goblin-warrior#strike',
  actionType: 'Main action',
  keywords: [],
  targetsText: 'One creature',
  powerRollBonus: { kind: 'fixed', value: 2 },
  tiers: {
    tier1: {
      damage: { amount: 5, characteristicOptions: [], typeOptions: [] },
      potency: { characteristic: 'M', threshold: { kind: 'numeric', value: 0 } },
      conditionIds: [BLEEDING],
      ending: 'save-ends',
    },
    tier2: {
      damage: { amount: 6, characteristicOptions: [], typeOptions: [] },
      potency: { characteristic: 'M', threshold: { kind: 'numeric', value: 1 } },
      conditionIds: [BLEEDING],
      ending: 'save-ends',
    },
    tier3: {
      damage: { amount: 7, characteristicOptions: [], typeOptions: [] },
      potency: { characteristic: 'M', threshold: { kind: 'numeric', value: 2 } },
      conditionIds: [BLEEDING],
      ending: 'save-ends',
    },
  },
};

const CONDUIT_STATS: ParticipantStats = {
  staminaMax: 21,
  characteristics: { might: 0, agility: 0, reason: 0, intuition: 2, presence: 2 },
  immunities: [],
  weaknesses: [],
  potencies: { weak: 0, average: 1, strong: 2 },
  organization: null,
  recoveriesMax: null,
};

const BANDIT_STATS: ParticipantStats = {
  staminaMax: 15,
  characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 },
  immunities: [],
  weaknesses: [],
  potencies: null,
  organization: null,
  recoveriesMax: null,
};

function state(): EncounterState {
  return {
    schemaVersion: 5,
    terrainFacts: [],
    squads: [],
    participants: {
      conduit: {
        id: 'conduit',
        conditions: [],
        sourceRecordId: null,
        kind: 'hero',
        stats: CONDUIT_STATS,
        stamina: { current: 21, temporary: 0, recoveries: null },
        grants: [],
      },
      bandit: {
        id: 'bandit',
        conditions: [],
        sourceRecordId: null,
        kind: 'director-creature',
        stats: BANDIT_STATS,
        stamina: { current: 15, temporary: 0, recoveries: null },
        grants: [],
      },
      'bandit-2': {
        id: 'bandit-2',
        conditions: [],
        sourceRecordId: null,
        kind: 'director-creature',
        stats: BANDIT_STATS,
        stamina: { current: 15, temporary: 0, recoveries: null },
        grants: [],
      },
    },
  };
}

function hammer(overrides: Record<string, unknown> = {}): Intent {
  return {
    intentId: 'i1',
    actor: { kind: 'participant', participantId: 'conduit' },
    kind: 'use-ability',
    payload: {
      actorParticipantId: 'conduit',
      ability: JUDGMENTS_HAMMER,
      targets: ['bandit'],
      ...overrides,
    },
  } as Intent;
}

function dispatchChecked(current: EncounterState, intent: Intent, seed = 1) {
  const result = applyIntent(current, intent, { random: createSeededRandomSource(seed) });
  const violations = checkInvariants(current, intent, result);
  expect(violations).toEqual([]);
  return result;
}

describe('the worked example, tier by tier [rule.character/potency]', () => {
  it('tier 1 (dice 4+5, I 2 → 11): 5 holy damage, potency A < 0 resisted', () => {
    const result = dispatchChecked(state(), hammer({ dice: [4, 5] }));
    const bandit = must(result.state.participants.bandit);
    expect(bandit.stamina).toEqual({ current: 10, temporary: 0, recoveries: null });
    expect(bandit.conditions).toEqual([]);
    expect(
      result.log.some(
        (entry) => (entry.data.potency as { applies?: boolean } | undefined)?.applies === false,
      ),
    ).toBe(true);
  });

  it('tier 2 (dice 6+5, I 2 → 13): 8 holy damage and prone', () => {
    const result = dispatchChecked(state(), hammer({ dice: [6, 5] }));
    const bandit = must(result.state.participants.bandit);
    expect(bandit.stamina).toEqual({ current: 7, temporary: 0, recoveries: null });
    expect(bandit.conditions.map((instance) => instance.conditionId)).toEqual([PRONE]);
    expect(must(bandit.conditions[0]).ending).toEqual({ kind: 'external' });
  });

  it('tier 3 (dice 10+7, I 2 → 19): 11 holy damage and prone (save ends)', () => {
    const result = dispatchChecked(state(), hammer({ dice: [10, 7] }));
    const bandit = must(result.state.participants.bandit);
    expect(bandit.stamina).toEqual({ current: 4, temporary: 0, recoveries: null });
    expect(must(bandit.conditions[0]).ending).toEqual({ kind: 'save-ends' });
  });
});

describe('the roll [rule.dice/power-roll, rule.dice/ability-roll]', () => {
  it('auto-rolls exactly two dice from the injected source when none are asserted', () => {
    const seedRun = (seed: number) => dispatchChecked(state(), hammer(), seed);
    const first = seedRun(7);
    const again = seedRun(7);
    expect(again).toEqual(first); // byte-identical replay from the seed
    const rollData = must(first.log.find((entry) => entry.data.powerRoll)).data.powerRoll as {
      dice: [number, number];
      diceAsserted: boolean;
    };
    expect(rollData.diceAsserted).toBe(false);
    const reference = createSeededRandomSource(7);
    expect(rollData.dice).toEqual([reference.roll(10), reference.roll(10)]);
  });

  it('one roll covers every target; damage lands on all targets first', () => {
    const result = dispatchChecked(
      state(),
      hammer({ dice: [6, 5], targets: ['bandit', 'bandit-2'] }),
    );
    expect(must(result.state.participants.bandit).stamina?.current).toBe(7);
    expect(must(result.state.participants['bandit-2']).stamina?.current).toBe(7);
    const rolls = result.log.filter((entry) => entry.data.powerRoll);
    expect(rolls).toHaveLength(1);
  });

  it('a fixed-bonus monster roll needs no actor stats', () => {
    const withGoblin = state();
    withGoblin.participants.goblin = {
      id: 'goblin',
      conditions: [],
      sourceRecordId: null,
      kind: 'director-creature',
      stats: null,
      stamina: null,
      grants: [],
    };
    const result = dispatchChecked(withGoblin, {
      intentId: 'i2',
      actor: { kind: 'director' },
      kind: 'use-ability',
      payload: {
        actorParticipantId: 'goblin',
        ability: GOBLIN_STRIKE,
        targets: ['bandit'],
        dice: [6, 5], // 11 + 2 → 13, tier 2
      },
    });
    const bandit = must(result.state.participants.bandit);
    expect(bandit.stamina?.current).toBe(9); // 6 damage
    // M < 1 vs Might 0 → bleeding applies.
    expect(bandit.conditions.map((instance) => instance.conditionId)).toEqual([BLEEDING]);
  });

  it('a natural 19–20 on a main action logs the critical-hit table directive', () => {
    const result = dispatchChecked(state(), hammer({ dice: [10, 10] }));
    const crit = result.log.find((entry) => entry.kind === 'table-directive');
    expect(crit?.message).toMatch(/critical hit/);
  });
});

describe('refusals leave the world untouched (permissive-engine boundary)', () => {
  it('unknown target', () => {
    const before = state();
    const result = applyIntent(before, hammer({ targets: ['nobody'] }), {
      random: createSeededRandomSource(1),
    });
    expect(must(result.log[0]).kind).toBe('refusal');
    expect(result.state).toEqual(before);
    expect(checkInvariants(before, hammer({ targets: ['nobody'] }), result)).toEqual([]);
  });

  it('a roll-characteristic choice must be named and offered', () => {
    const choiceAbility: AbilityEffectData = {
      ...JUDGMENTS_HAMMER,
      powerRollBonus: { kind: 'characteristic', options: ['M', 'A'] },
    };
    const missing = applyIntent(state(), hammer({ ability: choiceAbility, dice: [5, 5] }), {
      random: createSeededRandomSource(1),
    });
    expect(must(missing.log[0]).kind).toBe('refusal');
    const wrong = applyIntent(
      state(),
      hammer({ ability: choiceAbility, dice: [5, 5], characteristicChoice: 'P' }),
      { random: createSeededRandomSource(1) },
    );
    expect(must(wrong.log[0]).kind).toBe('refusal');
  });

  it('a stats-null actor cannot bind a characteristic roll', () => {
    const withGoblin = state();
    withGoblin.participants.goblin = {
      id: 'goblin',
      conditions: [],
      sourceRecordId: null,
      kind: 'director-creature',
      stats: null,
      stamina: null,
      grants: [],
    };
    const result = applyIntent(
      withGoblin,
      {
        intentId: 'i3',
        actor: { kind: 'director' },
        kind: 'use-ability',
        payload: {
          actorParticipantId: 'goblin',
          ability: JUDGMENTS_HAMMER,
          targets: ['bandit'],
          dice: [5, 5],
        },
      },
      { random: createSeededRandomSource(1) },
    );
    expect(must(result.log[0]).kind).toBe('refusal');
  });
});

describe('warn-and-apply rule violations', () => {
  it('naming more targets than the verbatim targets line warns and applies', () => {
    const result = dispatchChecked(
      state(),
      hammer({ dice: [6, 5], targets: ['bandit', 'bandit-2'] }),
    );
    const warning = result.log.find((entry) => entry.kind === 'warning');
    expect(warning?.message).toMatch(/One creature/);
    expect(must(result.state.participants['bandit-2']).stamina?.current).toBe(7);
  });
});

describe('assertion seams (surge-shaped, attributed)', () => {
  it('extraDamage adds to the named target only', () => {
    const result = dispatchChecked(
      state(),
      hammer({
        dice: [6, 5],
        targets: ['bandit', 'bandit-2'],
        extraDamage: [{ value: 2, reason: '1 surge (highest characteristic)', target: 'bandit' }],
      }),
    );
    expect(must(result.state.participants.bandit).stamina?.current).toBe(5);
    expect(must(result.state.participants['bandit-2']).stamina?.current).toBe(7);
  });

  it('potencyAdjustments swing the gate', () => {
    // Tier 1 gate A < 0 is resisted; +1 (2 surges) makes it A < 1 → applies.
    const result = dispatchChecked(
      state(),
      hammer({
        dice: [4, 5],
        potencyAdjustments: [{ delta: 1, reason: '2 surges', target: 'bandit' }],
      }),
    );
    expect(
      must(result.state.participants.bandit).conditions.map((instance) => instance.conditionId),
    ).toEqual([PRONE]);
  });
});
