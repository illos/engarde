import { describe, expect, it } from 'vitest';
import { applyDamage, damageAutomationBlocker, loseStamina } from './damage.js';
import {
  BLEEDING_CONDITION_ID,
  UNCONSCIOUS_CONDITION_ID,
  isDead,
  isDying,
  isWinded,
  windedValue,
} from './health.js';
import type { ParticipantState, ParticipantStats } from './schemas.js';

/**
 * Damage / Stamina core TDD (docs/power-roll-design.md §5/§8). Actor stats
 * are REAL corpus stat blocks (prime directive); damage amounts are test
 * vectors (inputs). Immunity/weakness semantics trace to
 * rule.damage/damage-immunity and rule.damage/damage-weakness; thresholds to
 * rule.health/{winded,dying,stamina,temporary-stamina}.
 */

/** Goblin Assassin — monsters/json/monster/goblin/statblock/goblin-assassin.json. */
const GOBLIN_ASSASSIN: ParticipantStats = {
  staminaMax: 15,
  characteristics: { might: -2, agility: 2, reason: 0, intuition: 0, presence: -2 },
  immunities: [],
  weaknesses: [],
  potencies: null,
  organization: 'Horde',
};

/** Count Rhodar von Glauer — corruption 10 / poison 10 immunities
 * (monsters/json/monster/count-rhodar-von-glauer/statblock/…). */
const RHODAR: ParticipantStats = {
  staminaMax: 650,
  characteristics: { might: 3, agility: 5, reason: 2, intuition: 2, presence: 3 },
  immunities: [
    { appliesTo: 'corruption', value: 10 },
    { appliesTo: 'poison', value: 10 },
  ],
  weaknesses: [],
  potencies: null,
  organization: 'Solo',
};

const context = { intentId: 'i1', actor: { kind: 'director' as const } };

function participant(
  stats: ParticipantStats,
  overrides: Partial<ParticipantState> = {},
): ParticipantState {
  return {
    id: 'target',
    conditions: [],
    sourceRecordId: null,
    kind: 'director-creature',
    stats,
    stamina: { current: stats.staminaMax, temporary: 0 },
    ...overrides,
  };
}

const options = { knockOut: false, reason: 'damage (test vector)' };

describe('damage pipeline [rule.damage/*]', () => {
  it('untyped damage reduces Stamina one for one [rule.damage/damage]', () => {
    const outcome = applyDamage(
      participant(GOBLIN_ASSASSIN),
      { amount: 6, type: null },
      options,
      context,
    );
    expect(outcome.participant.stamina).toEqual({ current: 9, temporary: 0 });
  });

  it('typed immunity reduces matching damage, minimum 0 [rule.damage/damage-immunity]', () => {
    const target = participant(RHODAR);
    expect(
      applyDamage(target, { amount: 12, type: 'corruption' }, options, context).participant.stamina
        ?.current,
    ).toBe(648);
    expect(
      applyDamage(target, { amount: 6, type: 'poison' }, options, context).participant.stamina
        ?.current,
    ).toBe(650);
    // Untyped damage is not reduced by typed immunities.
    expect(
      applyDamage(target, { amount: 12, type: null }, options, context).participant.stamina
        ?.current,
    ).toBe(638);
  });

  it('only the highest applicable immunity applies [rule.damage/damage-immunity]', () => {
    // "damage immunity 5 and fire immunity 10 who takes 12 fire damage
    // reduces the damage by 10" — the record's own worked example.
    const stats: ParticipantStats = {
      ...GOBLIN_ASSASSIN,
      immunities: [
        { appliesTo: 'any', value: 5 },
        { appliesTo: 'fire', value: 10 },
      ],
    };
    const outcome = applyDamage(participant(stats), { amount: 12, type: 'fire' }, options, context);
    expect(outcome.participant.stamina?.current).toBe(15 - 2);
  });

  it('an immunity value of "all" ignores all damage of that type', () => {
    const stats: ParticipantStats = {
      ...GOBLIN_ASSASSIN,
      immunities: [{ appliesTo: 'fire', value: 'all' }],
    };
    const outcome = applyDamage(participant(stats), { amount: 40, type: 'fire' }, options, context);
    expect(outcome.participant.stamina?.current).toBe(15);
  });

  it('weakness applies first, then immunity [rule.damage/damage-weakness]', () => {
    const stats: ParticipantStats = {
      ...GOBLIN_ASSASSIN,
      weaknesses: [{ appliesTo: 'fire', value: 5 }],
      immunities: [{ appliesTo: 'fire', value: 10 }],
    };
    // 10 fire → weakness first (15) → immunity last (5).
    const outcome = applyDamage(participant(stats), { amount: 10, type: 'fire' }, options, context);
    expect(outcome.participant.stamina?.current).toBe(10);
  });

  it('untyped weakness triggers on damage of any type; highest weakness only', () => {
    const stats: ParticipantStats = {
      ...GOBLIN_ASSASSIN,
      weaknesses: [
        { appliesTo: 'any', value: 3 },
        { appliesTo: 'acid', value: 5 },
      ],
    };
    expect(
      applyDamage(participant(stats), { amount: 4, type: 'acid' }, options, context).participant
        .stamina?.current,
    ).toBe(15 - 9);
    expect(
      applyDamage(participant(stats), { amount: 4, type: null }, options, context).participant
        .stamina?.current,
    ).toBe(15 - 7);
  });

  it('temporary Stamina decreases first [rule.health/temporary-stamina]', () => {
    // The record's worked example: 10 temporary, 16 damage → lose the
    // temporary, then 6 Stamina.
    const target = participant(GOBLIN_ASSASSIN, {
      stamina: { current: 15, temporary: 10 },
    });
    const outcome = applyDamage(target, { amount: 16, type: null }, options, context);
    expect(outcome.participant.stamina).toEqual({ current: 9, temporary: 0 });
  });
});

describe('loseStamina bypasses the damage pipeline (design SE-1)', () => {
  it('ignores immunities entirely', () => {
    const outcome = loseStamina(
      participant(RHODAR),
      10,
      { knockOut: false, reason: 'Stamina loss (test vector)' },
      context,
    );
    expect(outcome.participant.stamina?.current).toBe(640);
  });
});

describe('thresholds [rule.health/winded, rule.health/dying, rule.health/stamina]', () => {
  it('winded at half Stamina maximum, rounded down, equal-or-less', () => {
    expect(windedValue(15)).toBe(7); // always-round-down
    expect(isWinded(8, 15)).toBe(false);
    expect(isWinded(7, 15)).toBe(true);
  });

  it('a hero crossing into dying gains the mandated bleeding instance', () => {
    const hero = participant(GOBLIN_ASSASSIN, {
      kind: 'hero',
      stamina: { current: 3, temporary: 0 },
    });
    const outcome = applyDamage(hero, { amount: 5, type: null }, options, context);
    expect(isDying(outcome.participant.stamina?.current ?? Number.NaN)).toBe(true);
    expect(
      outcome.participant.conditions.some(
        (instance) => instance.conditionId === BLEEDING_CONDITION_ID,
      ),
    ).toBe(true);
    expect(isDead(outcome.participant)).toBe(false);
  });

  it('a hero dies at the negative of their winded value', () => {
    const hero = participant(GOBLIN_ASSASSIN, {
      kind: 'hero',
      stamina: { current: 1, temporary: 0 },
    });
    // winded value 7 → death at −7.
    const outcome = applyDamage(hero, { amount: 8, type: null }, options, context);
    expect(outcome.participant.stamina?.current).toBe(-7);
    expect(isDead(outcome.participant)).toBe(true);
    expect(outcome.log.some((entry) => entry.message.includes('dies'))).toBe(true);
  });

  it('a director-controlled creature dies at 0 Stamina', () => {
    const outcome = applyDamage(
      participant(GOBLIN_ASSASSIN, { stamina: { current: 5, temporary: 0 } }),
      { amount: 5, type: null },
      options,
      context,
    );
    expect(isDead(outcome.participant)).toBe(true);
  });

  it('knock-out replaces death with a tracked unconscious instance', () => {
    const outcome = applyDamage(
      participant(GOBLIN_ASSASSIN, { stamina: { current: 5, temporary: 0 } }),
      { amount: 9, type: null },
      { knockOut: true, reason: 'damage (test vector)' },
      context,
    );
    expect(isDead(outcome.participant)).toBe(false);
    expect(
      outcome.participant.conditions.some(
        (instance) => instance.conditionId === UNCONSCIOUS_CONDITION_ID,
      ),
    ).toBe(true);
  });

  it('damage while unconscious from a knock-out kills [rule.health/stamina]', () => {
    const knockedOut = applyDamage(
      participant(GOBLIN_ASSASSIN, { stamina: { current: 5, temporary: 0 } }),
      { amount: 9, type: null },
      { knockOut: true, reason: 'damage (test vector)' },
      context,
    ).participant;
    const outcome = applyDamage(knockedOut, { amount: 1, type: null }, options, context);
    expect(isDead(outcome.participant)).toBe(true);
    expect(
      outcome.participant.conditions.some(
        (instance) => instance.conditionId === UNCONSCIOUS_CONDITION_ID,
      ),
    ).toBe(false);
  });
});

describe('automation blockers', () => {
  it('refuses to automate a minion-organization target (shared Stamina pool)', () => {
    /** Goblin Sniper — a real Minion stat block (stamina 3). */
    const sniper: ParticipantStats = {
      staminaMax: 3,
      characteristics: { might: -2, agility: 2, reason: 0, intuition: 0, presence: -1 },
      immunities: [],
      weaknesses: [],
      potencies: null,
      organization: 'Minion',
    };
    expect(damageAutomationBlocker(participant(sniper))).toMatch(/minion/i);
    expect(damageAutomationBlocker(participant(GOBLIN_ASSASSIN))).toBeNull();
  });

  it('refuses to automate a stats-null participant', () => {
    const tableMode: ParticipantState = {
      id: 'target',
      conditions: [],
      sourceRecordId: null,
      kind: 'hero',
      stats: null,
      stamina: null,
    };
    expect(damageAutomationBlocker(tableMode)).toMatch(/table/);
  });
});

describe('stamina claims (state↔log reconciliation feed)', () => {
  it('every application logs a machine-readable staminaDeltas claim', () => {
    const outcome = applyDamage(
      participant(GOBLIN_ASSASSIN, { stamina: { current: 15, temporary: 4 } }),
      { amount: 6, type: null },
      options,
      context,
    );
    const claim = outcome.log
      .flatMap((entry) => (Array.isArray(entry.data.staminaDeltas) ? entry.data.staminaDeltas : []))
      .at(0);
    expect(claim).toEqual({
      participantId: 'target',
      from: 15,
      to: 13,
      temporaryFrom: 4,
      temporaryTo: 0,
    });
  });
});
