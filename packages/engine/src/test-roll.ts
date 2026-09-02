import type { LifecycleContext } from './condition-lifecycle.js';
import { withParticipant } from './damage.js';
import type { RandomSource } from './determinism.js';
import {
  GRANT_CANON,
  grantConsumedByRoll,
  grantContribution,
  splitGrants,
} from './grant-lifecycle.js';
import {
  type AttributedModifier,
  POWER_ROLL_CANON,
  POWER_ROLL_DIE,
  type PowerRollResolution,
  resolvePowerRoll,
} from './power-roll.js';
import type { EncounterState, LogEntry, NextRollGrant, TestCharacteristic } from './schemas.js';
import { TEST_OUTCOME_LABEL } from './test-outcome.js';

/**
 * The ONE test-roll body [S9] — a roller, a named characteristic, the
 * dispatch's roll inputs, through the power-roll core.
 *
 * Extracted from `executeTest`'s per-target loop so the reactive
 * (statblock-forced) path and the ordinary (actor-initiated) path share one
 * implementation of: asserted-or-rolled dice → the roller's characteristic
 * score → R-0013 consumption of pending outbound power-roll-scoped grants
 * → `resolvePowerRoll` → the `testRoll` receipt → the natural-19/20
 * critical-success receipt. Had the ordinary path written its own
 * `resolvePowerRoll` call, the grant-consumption rule, the asserted-dice-win
 * rule and the critical-success receipt would each have shipped twice.
 *
 * What is deliberately NOT here: the canon refs that distinguish the two
 * callers. A statblock-forced test cites `rule.test/reactive-test` (skills
 * prohibited, assist unavailable [R-0009, R-0010]); an ordinary test is
 * the opposite case on both counts and must not carry those refs. The
 * caller supplies the roll entry's refs.
 */

/** Canon grounding for the shared roll body (pointers only). */
export const TEST_ROLL_CANON = {
  test: 'mcdm.heroes.v1/rule.test/test',
} as const;

export interface TestRollInput {
  dice?: [number, number];
  edges: number;
  banes: number;
  bonuses: readonly AttributedModifier[];
  penalties: readonly AttributedModifier[];
}

export interface RollTestArgs {
  rollerId: string;
  characteristic: TestCharacteristic;
  /** The dispatch's roll inputs for this roller; absent = no assertions,
   * two draws from the injected source. */
  input: TestRollInput | undefined;
  /** Refs the caller's binding contributes to every entry (artifact id +
   * its canon refs). */
  baseRefs: readonly string[];
  /** Refs on the roll entry itself — the caller's reading of WHICH kind of
   * test this is (`rule.test/test` for both; `reactive-test` only for a
   * statblock-forced one). */
  rollRefs: readonly string[];
}

export interface RollTestOutcome {
  state: EncounterState;
  resolution: PowerRollResolution;
  dice: [number, number];
  diceAsserted: boolean;
  log: LogEntry[];
}

const CHARACTERISTIC_LABEL: Record<TestCharacteristic, string> = {
  might: 'Might',
  agility: 'Agility',
  reason: 'Reason',
  intuition: 'Intuition',
  presence: 'Presence',
};

function entry(
  context: LifecycleContext,
  kind: LogEntry['kind'],
  message: string,
  canonRefs: string[],
  data: Record<string, unknown>,
): LogEntry {
  return { kind, intentId: context.intentId, actor: context.actor, canonRefs, message, data };
}

function refs(base: readonly string[], extra: readonly string[]): string[] {
  return [...new Set([...base, ...extra])];
}

/**
 * Roll one characteristic test for one roller. The roller's presence and
 * stats are proven by the caller's refusal gates; this throws on neither
 * and returns the state unchanged with no entries if either is missing.
 */
export function rollTest(
  state: EncounterState,
  args: RollTestArgs,
  context: LifecycleContext,
  random: RandomSource,
): RollTestOutcome | null {
  const { rollerId, characteristic, input, baseRefs, rollRefs } = args;
  const roller = state.participants[rollerId];
  if (!roller?.stats) return null;
  const log: LogEntry[] = [];
  let nextState = state;

  const dice: [number, number] = input?.dice ?? [
    random.roll(POWER_ROLL_DIE),
    random.roll(POWER_ROLL_DIE),
  ];
  const score = roller.stats.characteristics[characteristic];

  // A test is a power roll: the roller's pending outbound power-roll-scoped
  // grants are consumed by it and contribute to its modifier pool; strike-
  // scoped grants sit dormant across tests [R-0013, R-0015].
  const split = splitGrants(
    roller,
    (grant) =>
      grant.kind === 'next-roll' &&
      grantConsumedByRoll(
        grant,
        { kind: 'test', isStrike: false },
        { attackerId: rollerId, targetId: null },
      ) &&
      grant.direction === 'outbound',
  );
  const remaining = split.remaining;
  const consumed = split.consumed.filter(
    (grant): grant is NextRollGrant => grant.kind === 'next-roll',
  );
  let grantEdges = 0;
  let grantBanes = 0;
  for (const grant of consumed) {
    const contribution = grantContribution(grant.polarity);
    grantEdges += contribution.edges;
    grantBanes += contribution.banes;
  }
  if (consumed.length > 0) {
    nextState = withParticipant(nextState, { ...roller, grants: remaining });
    log.push(
      entry(
        context,
        'mutation',
        `${rollerId}'s pending next-roll modifiers apply to this test and are spent (${consumed.map((grant) => grant.polarity).join(', ')})`,
        refs(baseRefs, [GRANT_CANON.powerRoll]),
        {
          removedGrantIds: consumed.map((grant) => grant.grantId),
          grantsConsumed: consumed.map((grant) => ({
            grantId: grant.grantId,
            holderId: rollerId,
            direction: grant.direction,
            polarity: grant.polarity,
            contribution: grantContribution(grant.polarity),
          })),
        },
      ),
    );
  }
  const effectiveEdges = (input?.edges ?? 0) + grantEdges;
  const effectiveBanes = (input?.banes ?? 0) + grantBanes;
  const rolled = resolvePowerRoll({
    dice,
    characteristicValue: score,
    bonuses: input?.bonuses ?? [],
    penalties: input?.penalties ?? [],
    edges: effectiveEdges,
    banes: effectiveBanes,
    automaticOutcomes: [],
  });
  log.push(
    entry(
      context,
      'informational',
      `${rollerId} makes a ${CHARACTERISTIC_LABEL[characteristic]} test: ${dice[0]}+${dice[1]}${score >= 0 ? '+' : ''}${score} → total ${rolled.total}, tier ${rolled.tier}`,
      refs(baseRefs, rollRefs),
      {
        testRoll: {
          rollerId,
          characteristic,
          dice,
          diceAsserted: input?.dice !== undefined,
          characteristicValue: score,
          edges: effectiveEdges,
          banes: effectiveBanes,
          resolution: rolled,
          testCriticalSuccess: rolled.naturalTopEnd,
        },
      },
    ),
  );
  if (rolled.naturalTopEnd) {
    // "you score a critical success. This critical success automatically
    // lets you succeed on the task with a reward" [rule.dice/natural-19-20].
    // The label is the outcome table's own cell, not a second copy of it.
    log.push(
      entry(
        context,
        'informational',
        `${rollerId} scores a critical success on the test (natural ${rolled.natural}) — ${TEST_OUTCOME_LABEL['success-with-reward'].toLowerCase()}`,
        refs(baseRefs, [POWER_ROLL_CANON.natural1920, POWER_ROLL_CANON.naturalRoll]),
        { testCriticalSuccess: { rollerId, natural: rolled.natural } },
      ),
    );
  }
  return {
    state: nextState,
    resolution: rolled,
    dice,
    diceAsserted: input?.dice !== undefined,
    log,
  };
}
