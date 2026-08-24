/**
 * Power-roll resolution core — the ONE home for the roll math
 * (docs/power-roll-design.md §2). Pure: dice arrive as input; no state
 * access; the full breakdown is returned for logging (receipts) and for the
 * breakdown-recompute invariant (every dispatch re-derives this and fails on
 * mismatch).
 *
 * Every constant and step cites the canon record it traces to. No rule here
 * is from memory.
 */

/** Canon artifact ids this module's behavior traces to. */
export const POWER_ROLL_CANON = {
  powerRoll: 'mcdm.heroes.v1/rule.dice/power-roll',
  tierOutcome: 'mcdm.heroes.v1/rule.dice/tier-outcome',
  naturalRoll: 'mcdm.heroes.v1/rule.dice/natural-roll',
  natural1920: 'mcdm.heroes.v1/rule.dice/natural-19-20',
  edge: 'mcdm.heroes.v1/rule.dice/edge',
  bane: 'mcdm.heroes.v1/rule.dice/bane',
  bonusesAndPenalties: 'mcdm.heroes.v1/rule.dice/bonuses-and-penalties',
  criticalHit: 'mcdm.heroes.v1/rule.combat/critical-hit',
  abilityRoll: 'mcdm.heroes.v1/rule.dice/ability-roll',
} as const;

/** "roll two ten-sided dice" [rule.dice/power-roll §Making a Power Roll]. */
export const POWER_ROLL_DIE = 10 as const;

/** Tier bands [rule.dice/tier-outcome]: ≤11 / 12–16 / 17+. */
export const TIER_BANDS = { tier2Min: 12, tier3Min: 17 } as const;

/** Edge/bane numeric values and the cap [rule.dice/edge, rule.dice/bane,
 * rule.dice/power-roll §Rolling With Edges and Banes + "Why Cap?"]. */
export const EDGE_VALUE = 2 as const;
export const BANE_VALUE = -2 as const;
export const EDGE_BANE_CAP = 2 as const;

/** "a natural 19 or 20 … always a tier 3 result regardless of any
 * modifiers" [rule.dice/natural-roll]. */
export const NATURAL_TIER3_MIN = 19 as const;

export type Tier = 1 | 2 | 3;

export interface AttributedModifier {
  value: number;
  reason: string;
}

export interface PowerRollInput {
  dice: [number, number];
  /** The bound characteristic score, or the monster stat block's fixed
   * bonus — both simply add to the roll [rule.dice/power-roll,
   * monster stat block "Power Roll + 2" form]. */
  characteristicValue: number;
  bonuses: readonly AttributedModifier[];
  penalties: readonly AttributedModifier[];
  edges: number;
  banes: number;
  automaticOutcomes: readonly Tier[];
  downgradeToTier?: 1 | 2;
}

export interface PowerRollResolution {
  natural: number;
  /** Capped edge/bane counts and their net [power-roll §Rolling With Edges
   * and Banes: the enumerated cancellation cases are exactly
   * net-of-capped-counts]. */
  cappedEdges: number;
  cappedBanes: number;
  netEdgeBane: number;
  /** The ±2 applied when the net is a single edge/bane. */
  edgeBaneNumeric: number;
  bonusTotal: number;
  penaltyTotal: number;
  total: number;
  tierFromBand: Tier;
  /** After the double-edge/double-bane one-tier step, clamped 1..3. */
  tierAfterEdgeBaneStep: Tier;
  /** After the natural-19/20 floor. */
  tierAfterNaturalFloor: Tier;
  /** The automatic outcome that applied, if any (distinct autos cancel). */
  automaticOutcomeApplied: Tier | null;
  automaticOutcomesCancelled: boolean;
  /** After downgrade — the final tier. */
  tier: Tier;
  downgraded: boolean;
  /** natural ≥ 19: tier-3 floor + test critical success + (for main-action
   * ability rolls, decided by the caller) critical hit
   * [rule.dice/natural-roll, rule.dice/natural-19-20, rule.combat/critical-hit]. */
  naturalTopEnd: boolean;
}

function bandOf(total: number): Tier {
  if (total >= TIER_BANDS.tier3Min) return 3;
  if (total >= TIER_BANDS.tier2Min) return 2;
  return 1;
}

const clampTier = (tier: number): Tier => Math.max(1, Math.min(3, tier)) as Tier;

export function resolvePowerRoll(input: PowerRollInput): PowerRollResolution {
  const [d1, d2] = input.dice;
  for (const die of [d1, d2]) {
    if (!Number.isInteger(die) || die < 1 || die > POWER_ROLL_DIE) {
      throw new RangeError(`power roll die out of range: ${die}`);
    }
  }
  // Step 1 — natural roll [rule.dice/natural-roll].
  const natural = d1 + d2;
  const naturalTopEnd = natural >= NATURAL_TIER3_MIN;

  // Step 2 — cap and cancel edges/banes [power-roll §Rolling With Edges and Banes].
  const cappedEdges = Math.min(input.edges, EDGE_BANE_CAP);
  const cappedBanes = Math.min(input.banes, EDGE_BANE_CAP);
  const netEdgeBane = cappedEdges - cappedBanes;
  const edgeBaneNumeric = netEdgeBane === 1 ? EDGE_VALUE : netEdgeBane === -1 ? BANE_VALUE : 0;

  // Step 3 — total: characteristic + unlimited additive bonuses/penalties
  // (independent of, and before, edges/banes [rule.dice/bonuses-and-penalties])
  // + the single-edge/bane ±2.
  const bonusTotal = input.bonuses.reduce((sum, modifier) => sum + modifier.value, 0);
  const penaltyTotal = input.penalties.reduce((sum, modifier) => sum + modifier.value, 0);
  const total = natural + input.characteristicValue + bonusTotal - penaltyTotal + edgeBaneNumeric;

  // Step 4 — band [rule.dice/tier-outcome].
  const tierFromBand = bandOf(total);

  // Step 5 — double edge/bane tier step [rule.dice/edge, rule.dice/bane].
  const tierAfterEdgeBaneStep =
    netEdgeBane >= 2
      ? clampTier(tierFromBand + 1)
      : netEdgeBane <= -2
        ? clampTier(tierFromBand - 1)
        : tierFromBand;

  // Step 6 — natural 19–20 floor, applied after the tier step (the step is a
  // modifier the floor overrides — Gate-3 Q1 default) [rule.dice/natural-roll].
  const tierAfterNaturalFloor: Tier = naturalTopEnd ? 3 : tierAfterEdgeBaneStep;

  // Step 7 — automatic outcomes supersede edges/banes/bonuses/penalties;
  // distinct autos cancel entirely, duplicates of one tier obtain it
  // [rule.dice/power-roll §Automatic Tier Outcomes].
  const distinctAutos = [...new Set(input.automaticOutcomes)];
  const automaticOutcomesCancelled = distinctAutos.length > 1;
  const [soleAuto] = distinctAutos;
  const automaticOutcomeApplied =
    distinctAutos.length === 1 && soleAuto !== undefined ? soleAuto : null;
  const tierBeforeDowngrade =
    automaticOutcomeApplied !== null ? automaticOutcomeApplied : tierAfterNaturalFloor;

  // Step 8 — downgrade: the roller may select a lower tier's outcome
  // [rule.dice/power-roll §Downgrade]. Requesting ≥ the result is a no-op.
  const downgraded =
    input.downgradeToTier !== undefined && input.downgradeToTier < tierBeforeDowngrade;
  const tier = downgraded ? (input.downgradeToTier as Tier) : tierBeforeDowngrade;

  return {
    natural,
    cappedEdges,
    cappedBanes,
    netEdgeBane,
    edgeBaneNumeric,
    bonusTotal,
    penaltyTotal,
    total,
    tierFromBand,
    tierAfterEdgeBaneStep,
    tierAfterNaturalFloor,
    automaticOutcomeApplied,
    automaticOutcomesCancelled,
    tier,
    downgraded,
    naturalTopEnd,
  };
}
