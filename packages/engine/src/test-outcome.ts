import type { Tier } from './power-roll.js';
import { TEST_OUTCOMES, type TestDifficulty, type TestOutcome } from './schemas.js';

/**
 * Test difficulty → outcome mapping [S20; rule.test/test-difficulty] — the
 * ONE home for the Test Difficulty Outcomes Table.
 *
 * Difficulty supplies no DC and no roll modifier; it is outcome mapping
 * only [R-0008]. The tier bands stay where they are (`TIER_BANDS` in
 * `power-roll.ts`) — this table maps a banded tier to a printed LABEL and
 * nothing else. R-0008 closed with "A future ordinary-test feature must not
 * inherit 'difficulty is nothing'"; that feature is Make or Assist a Test,
 * and its second implementers are every ordinary test in the game (montage
 * tests, group tests, downtime projects, negotiation), which is why the map
 * lives here and not in that action's arm.
 *
 * Every cell below is transcribed from the printed table; the canon-side
 * test proves each label against the committed verbatim cut of the
 * artifact, so a pin bump that rewords a cell breaks loudly.
 */

/** Canon artifact ids this module traces to (pointers only). */
export const TEST_OUTCOME_CANON = {
  testDifficulty: 'mcdm.heroes.v1/rule.test/test-difficulty',
  /** "This critical success automatically lets you succeed on the task
   * with a reward, even if the test has a medium or hard difficulty." */
  natural1920: 'mcdm.heroes.v1/rule.dice/natural-19-20',
} as const;

/** The printed cell text for each outcome, verbatim. */
export const TEST_OUTCOME_LABEL: Readonly<Record<TestOutcome, string>> = {
  'failure-with-consequence': 'Failure with a consequence',
  failure: 'Failure',
  'success-with-consequence': 'Success with a consequence',
  success: 'Success',
  'success-with-reward': 'Success with a reward',
};

/**
 * The Test Difficulty Outcomes Table, one entry per printed cell, keyed by
 * difficulty column then tier row (≤11 / 12-16 / 17+). The table's fourth
 * row — Natural 19 or 20 — is not a tier; it is the floor `outcomeForTest`
 * applies from the roll's `naturalTopEnd` flag.
 */
export const TEST_DIFFICULTY_OUTCOMES: Readonly<
  Record<TestDifficulty, Readonly<Record<Tier, TestOutcome>>>
> = {
  easy: { 1: 'success-with-consequence', 2: 'success', 3: 'success-with-reward' },
  medium: { 1: 'failure', 2: 'success-with-consequence', 3: 'success' },
  hard: { 1: 'failure-with-consequence', 2: 'failure', 3: 'success' },
};

/**
 * The printed outcome of a test at a given difficulty. A natural 19 or 20
 * short-circuits to "Success with a reward" for every difficulty — the
 * table's own fourth row, and rule.dice/natural-19-20's "even if the test
 * has a medium or hard difficulty".
 */
export function outcomeForTest(
  difficulty: TestDifficulty,
  tier: Tier,
  naturalTopEnd: boolean,
): TestOutcome {
  if (naturalTopEnd) return 'success-with-reward';
  return TEST_DIFFICULTY_OUTCOMES[difficulty][tier];
}

/** "Whenever the rules talk about obtaining a success on a test, that
 * includes a straight success, a success with a consequence, or a success
 * with a reward." */
export function isSuccess(outcome: TestOutcome): boolean {
  return (
    outcome === 'success' ||
    outcome === 'success-with-consequence' ||
    outcome === 'success-with-reward'
  );
}

/** "Whenever the rules talk about a failure on a test, that includes a
 * straight failure or a failure with a consequence." */
export function isFailure(outcome: TestOutcome): boolean {
  return outcome === 'failure' || outcome === 'failure-with-consequence';
}

/** Every outcome is exactly one of the two printed families. */
export const TEST_OUTCOME_FAMILIES: ReadonlyArray<{
  outcome: TestOutcome;
  family: 'success' | 'failure';
}> = TEST_OUTCOMES.map((outcome) => ({
  outcome,
  family: isSuccess(outcome) ? 'success' : 'failure',
}));
