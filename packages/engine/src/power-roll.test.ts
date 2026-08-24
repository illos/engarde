import { describe, expect, it } from 'vitest';
import {
  EDGE_BANE_CAP,
  EDGE_VALUE,
  NATURAL_TIER3_MIN,
  TIER_BANDS,
  resolvePowerRoll,
} from './power-roll.js';

/**
 * Resolution-core TDD (docs/power-roll-design.md §2/§8). Every asserted
 * outcome traces to a rule record quoted in the design doc; dice values are
 * test vectors (inputs), never rule content.
 */

const base = {
  characteristicValue: 0,
  bonuses: [],
  penalties: [],
  edges: 0,
  banes: 0,
  automaticOutcomes: [],
} as const;

describe('tier banding [rule.dice/tier-outcome]', () => {
  it('bands ≤11 / 12–16 / 17+ at the exact boundaries', () => {
    // 11 → tier 1; 12 → tier 2; 16 → tier 2; 17 → tier 3.
    expect(resolvePowerRoll({ ...base, dice: [5, 6] }).tier).toBe(1);
    expect(resolvePowerRoll({ ...base, dice: [6, 6] }).tier).toBe(2);
    expect(resolvePowerRoll({ ...base, dice: [8, 8] }).tier).toBe(2);
    expect(resolvePowerRoll({ ...base, dice: [8, 9] }).tier).toBe(3);
    expect(TIER_BANDS).toEqual({ tier2Min: 12, tier3Min: 17 });
  });

  it('adds the characteristic to the roll [rule.dice/power-roll]', () => {
    expect(resolvePowerRoll({ ...base, dice: [5, 5], characteristicValue: 2 }).total).toBe(12);
    expect(resolvePowerRoll({ ...base, dice: [5, 5], characteristicValue: -2 }).total).toBe(8);
  });

  it('rejects dice outside 1..10', () => {
    expect(() => resolvePowerRoll({ ...base, dice: [0, 5] })).toThrow(RangeError);
    expect(() => resolvePowerRoll({ ...base, dice: [5, 11] })).toThrow(RangeError);
  });
});

describe('edges and banes [rule.dice/edge, rule.dice/bane, power-roll cancellation]', () => {
  it('single edge = +2, single bane = −2', () => {
    expect(resolvePowerRoll({ ...base, dice: [5, 5], edges: 1 }).total).toBe(12);
    expect(resolvePowerRoll({ ...base, dice: [6, 6], banes: 1 }).total).toBe(10);
  });

  it('an edge and a bane cancel; a double edge and a double bane cancel', () => {
    expect(resolvePowerRoll({ ...base, dice: [5, 5], edges: 1, banes: 1 }).total).toBe(10);
    const both = resolvePowerRoll({ ...base, dice: [5, 5], edges: 2, banes: 2 });
    expect(both.total).toBe(10);
    expect(both.tier).toBe(1);
  });

  it('double edge + one bane rolls with one edge (and symmetrically)', () => {
    expect(resolvePowerRoll({ ...base, dice: [5, 5], edges: 2, banes: 1 }).total).toBe(12);
    expect(resolvePowerRoll({ ...base, dice: [6, 6], edges: 1, banes: 2 }).total).toBe(10);
  });

  it('counts beyond two cap at two ("Why Cap?" sidebar)', () => {
    // 3 banes + 1 edge = double bane + one edge → one bane (−2).
    const result = resolvePowerRoll({ ...base, dice: [6, 6], edges: 1, banes: 3 });
    expect(result.cappedBanes).toBe(EDGE_BANE_CAP);
    expect(result.total).toBe(10);
    // 5 edges alone are still just a double edge (tier step, no +N).
    const fiveEdges = resolvePowerRoll({ ...base, dice: [5, 5], edges: 5 });
    expect(fiveEdges.total).toBe(10);
    expect(fiveEdges.tier).toBe(2);
  });

  it('double edge adds nothing but improves the outcome one tier (max 3)', () => {
    const result = resolvePowerRoll({ ...base, dice: [5, 5], edges: 2 });
    expect(result.total).toBe(10);
    expect(result.tierFromBand).toBe(1);
    expect(result.tier).toBe(2);
    // Already tier 3 → stays tier 3.
    expect(resolvePowerRoll({ ...base, dice: [9, 9], edges: 2 }).tier).toBe(3);
  });

  it('double bane subtracts nothing but decreases the outcome one tier (min 1)', () => {
    const result = resolvePowerRoll({ ...base, dice: [9, 9], banes: 2 });
    expect(result.total).toBe(18);
    expect(result.tierFromBand).toBe(3);
    expect(result.tier).toBe(2);
    expect(resolvePowerRoll({ ...base, dice: [2, 3], banes: 2 }).tier).toBe(1);
  });
});

describe('bonuses and penalties [rule.dice/bonuses-and-penalties]', () => {
  it('are unlimited, additive, and independent of edges/banes', () => {
    const result = resolvePowerRoll({
      ...base,
      dice: [5, 5],
      bonuses: [
        { value: 2, reason: 'skill' },
        { value: 1, reason: 'kit' },
      ],
      penalties: [{ value: 2, reason: 'circumstance' }],
      edges: 1,
    });
    // 10 + 2 + 1 − 2 + 2(edge) = 13.
    expect(result.total).toBe(13);
    expect(result.bonusTotal).toBe(3);
    expect(result.penaltyTotal).toBe(2);
    expect(EDGE_VALUE).toBe(2);
  });
});

describe('natural 19–20 [rule.dice/natural-roll]', () => {
  it('is always tier 3 regardless of modifiers — even a double bane (Gate-3 Q1 default)', () => {
    const result = resolvePowerRoll({
      ...base,
      dice: [10, 9],
      characteristicValue: -5,
      penalties: [{ value: 10, reason: 'vector' }],
      banes: 3,
    });
    expect(result.natural).toBe(NATURAL_TIER3_MIN);
    expect(result.naturalTopEnd).toBe(true);
    expect(result.tier).toBe(3);
  });

  it('a modified total of 19+ that is not a natural 19 gets no floor', () => {
    const result = resolvePowerRoll({ ...base, dice: [8, 8], characteristicValue: 3, banes: 2 });
    expect(result.naturalTopEnd).toBe(false);
    expect(result.tier).toBe(2); // 19 bands tier 3, double bane steps down
  });
});

describe('automatic outcomes [rule.dice/power-roll §Automatic Tier Outcomes]', () => {
  it('supersede edges, banes, bonuses, and penalties', () => {
    const result = resolvePowerRoll({
      ...base,
      dice: [9, 9],
      bonuses: [{ value: 5, reason: 'vector' }],
      automaticOutcomes: [1],
    });
    expect(result.tier).toBe(1);
    expect(result.automaticOutcomeApplied).toBe(1);
  });

  it('multiple different automatic outcomes cancel each other entirely', () => {
    const result = resolvePowerRoll({ ...base, dice: [5, 5], automaticOutcomes: [2, 3] });
    expect(result.automaticOutcomesCancelled).toBe(true);
    expect(result.automaticOutcomeApplied).toBeNull();
    expect(result.tier).toBe(1);
  });

  it('duplicates of the same automatic outcome obtain it', () => {
    const result = resolvePowerRoll({ ...base, dice: [5, 5], automaticOutcomes: [3, 3] });
    expect(result.tier).toBe(3);
  });

  it('the roll still resolves for roll-contingent extras (crit detection)', () => {
    const result = resolvePowerRoll({ ...base, dice: [10, 10], automaticOutcomes: [1] });
    expect(result.tier).toBe(1);
    expect(result.naturalTopEnd).toBe(true);
  });
});

describe('downgrade [rule.dice/power-roll §Downgrade]', () => {
  it("selects a lower tier at the roller's request", () => {
    const result = resolvePowerRoll({ ...base, dice: [9, 9], downgradeToTier: 2 });
    expect(result.tier).toBe(2);
    expect(result.downgraded).toBe(true);
  });

  it('requesting a tier at or above the result is a no-op', () => {
    const result = resolvePowerRoll({ ...base, dice: [5, 5], downgradeToTier: 2 });
    expect(result.tier).toBe(1);
    expect(result.downgraded).toBe(false);
  });

  it('applies after the natural-19/20 floor and after automatic outcomes', () => {
    expect(resolvePowerRoll({ ...base, dice: [10, 10], downgradeToTier: 1 }).tier).toBe(1);
    expect(
      resolvePowerRoll({ ...base, dice: [2, 2], automaticOutcomes: [3], downgradeToTier: 2 }).tier,
    ).toBe(2);
  });
});
