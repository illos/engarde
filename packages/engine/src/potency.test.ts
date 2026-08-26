import { describe, expect, it } from 'vitest';
import { resolvePotency } from './potency.js';
import { type ParticipantState, ParticipantStateSchema, type ParticipantStats } from './schemas.js';

/**
 * Potency gate TDD (docs/power-roll-design.md §6). The golden fixture is the
 * book's own worked example in rule.character/potency: a 1st-level conduit
 * (Intuition 2 → potencies weak 0 / average 1 / strong 2) uses Judgment's
 * Hammer against a bandit with Agility 0.
 */

/** The worked example's conduit: potency values as the record derives them. */
const CONDUIT: ParticipantStats = {
  staminaMax: 21, // conduit class starting Stamina is not exercised here
  characteristics: { might: 0, agility: 0, reason: 0, intuition: 2, presence: 2 },
  immunities: [],
  weaknesses: [],
  potencies: { weak: 0, average: 1, strong: 2 },
  organization: null,
  recoveriesMax: null,
  withCaptain: null,
};

function actor(stats: ParticipantStats | null, id: string): ParticipantState {
  return ParticipantStateSchema.parse({
    id,
    conditions: [],
    sourceRecordId: null,
    grants: [],
    kind: 'hero',
    stats,
    stamina: stats ? { current: stats.staminaMax, temporary: 0, recoveries: null } : null,
  });
}

/** The worked example's bandit: Agility 0. */
const bandit = actor(
  {
    staminaMax: 15,
    characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 },
    immunities: [],
    weaknesses: [],
    potencies: null,
    organization: null,
    recoveriesMax: null,
    withCaptain: null,
  },
  'bandit',
);

const conduit = actor(CONDUIT, 'conduit');

describe("the Judgment's Hammer worked example [rule.character/potency]", () => {
  it('tier 1: A < WEAK (0) vs Agility 0 → resisted (strictly less)', () => {
    const gate = resolvePotency(
      { characteristic: 'A', threshold: { kind: 'named', name: 'weak' } },
      conduit,
      bandit,
      0,
    );
    expect(gate).toMatchObject({ resolved: true, potencyValue: 0, targetScore: 0, applies: false });
  });

  it('tier 2: A < AVERAGE (1) vs Agility 0 → applies', () => {
    const gate = resolvePotency(
      { characteristic: 'A', threshold: { kind: 'named', name: 'average' } },
      conduit,
      bandit,
      0,
    );
    expect(gate).toMatchObject({ resolved: true, potencyValue: 1, applies: true });
  });

  it('tier 3: A < STRONG (2) vs Agility 0 → applies', () => {
    const gate = resolvePotency(
      { characteristic: 'A', threshold: { kind: 'named', name: 'strong' } },
      conduit,
      bandit,
      0,
    );
    expect(gate).toMatchObject({ resolved: true, potencyValue: 2, applies: true });
  });
});

describe('numeric thresholds (monster notation, e.g. "M < 1")', () => {
  it('gates strictly-less against the target characteristic', () => {
    const gate = (might: number) =>
      resolvePotency(
        { characteristic: 'M', threshold: { kind: 'numeric', value: 1 } },
        actor(null, 'goblin'),
        actor(
          {
            staminaMax: 15,
            characteristics: { might, agility: 0, reason: 0, intuition: 0, presence: 0 },
            immunities: [],
            weaknesses: [],
            potencies: null,
            organization: null,
            recoveriesMax: null,
            withCaptain: null,
          },
          'target',
        ),
        0,
      );
    expect(gate(0)).toMatchObject({ resolved: true, applies: true });
    expect(gate(1)).toMatchObject({ resolved: true, applies: false });
  });
});

describe('adjustments (surge-shaped assertions [rule.resource/surge])', () => {
  it('raise the effective potency value', () => {
    const gate = resolvePotency(
      { characteristic: 'A', threshold: { kind: 'named', name: 'weak' } },
      conduit,
      bandit,
      1,
    );
    expect(gate).toMatchObject({ resolved: true, adjustedValue: 1, applies: true });
  });
});

describe('unresolvable gates route to receipts, never guesses', () => {
  it('named threshold with no stored potencies on the imposer', () => {
    const gate = resolvePotency(
      { characteristic: 'A', threshold: { kind: 'named', name: 'weak' } },
      actor(null, 'unknown-imposer'),
      bandit,
      0,
    );
    expect(gate.resolved).toBe(false);
  });

  it('target without tracked characteristics', () => {
    const gate = resolvePotency(
      { characteristic: 'M', threshold: { kind: 'numeric', value: 1 } },
      conduit,
      actor(null, 'table-mode-target'),
      0,
    );
    expect(gate.resolved).toBe(false);
  });
});
