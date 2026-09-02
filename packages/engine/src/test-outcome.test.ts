import { describe, expect, it } from 'vitest';
import type { Tier } from './power-roll.js';
import { TEST_DIFFICULTIES, TEST_OUTCOMES, type TestDifficulty } from './schemas.js';
import {
  TEST_DIFFICULTY_OUTCOMES,
  TEST_OUTCOME_FAMILIES,
  TEST_OUTCOME_LABEL,
  isFailure,
  isSuccess,
  outcomeForTest,
} from './test-outcome.js';

/**
 * S20 — the Test Difficulty Outcomes Table [rule.test/test-difficulty].
 * The canon-side test proves every label against the committed verbatim
 * cut; this proves the map's shape and the two printed definitions.
 */

describe('the Test Difficulty Outcomes Table', () => {
  it('has exactly one outcome per printed cell (three difficulties × three tiers)', () => {
    for (const difficulty of TEST_DIFFICULTIES) {
      for (const tier of [1, 2, 3] as const) {
        expect(TEST_OUTCOMES).toContain(TEST_DIFFICULTY_OUTCOMES[difficulty][tier]);
      }
    }
    expect(Object.keys(TEST_DIFFICULTY_OUTCOMES).sort()).toEqual([...TEST_DIFFICULTIES].sort());
  });

  it('reads the printed cells: easy never fails, hard succeeds only at 17+', () => {
    // ≤11 row: Success with a consequence / Failure / Failure with a consequence.
    expect(outcomeForTest('easy', 1, false)).toBe('success-with-consequence');
    expect(outcomeForTest('medium', 1, false)).toBe('failure');
    expect(outcomeForTest('hard', 1, false)).toBe('failure-with-consequence');
    // 12-16 row: Success / Success with a consequence / Failure.
    expect(outcomeForTest('easy', 2, false)).toBe('success');
    expect(outcomeForTest('medium', 2, false)).toBe('success-with-consequence');
    expect(outcomeForTest('hard', 2, false)).toBe('failure');
    // 17+ row: Success with a reward / Success / Success.
    expect(outcomeForTest('easy', 3, false)).toBe('success-with-reward');
    expect(outcomeForTest('medium', 3, false)).toBe('success');
    expect(outcomeForTest('hard', 3, false)).toBe('success');
  });

  it('floors a natural 19 or 20 at "Success with a reward" for every difficulty', () => {
    // "even if the test has a medium or hard difficulty" [rule.dice/natural-19-20]
    for (const difficulty of TEST_DIFFICULTIES) {
      for (const tier of [1, 2, 3] as Tier[]) {
        expect(outcomeForTest(difficulty as TestDifficulty, tier, true)).toBe(
          'success-with-reward',
        );
      }
    }
  });

  it('partitions the five outcomes into the two printed families', () => {
    // "obtaining a success on a test … includes a straight success, a
    // success with a consequence, or a success with a reward" / "a failure
    // … includes a straight failure or a failure with a consequence".
    expect(TEST_OUTCOMES.filter(isSuccess)).toEqual([
      'success-with-consequence',
      'success',
      'success-with-reward',
    ]);
    expect(TEST_OUTCOMES.filter(isFailure)).toEqual(['failure-with-consequence', 'failure']);
    for (const outcome of TEST_OUTCOMES) {
      expect(isSuccess(outcome)).toBe(!isFailure(outcome));
    }
    expect(TEST_OUTCOME_FAMILIES.map((row) => row.family)).toEqual([
      'failure',
      'failure',
      'success',
      'success',
      'success',
    ]);
  });

  it('carries the printed cell text for every outcome', () => {
    for (const outcome of TEST_OUTCOMES) {
      expect(TEST_OUTCOME_LABEL[outcome].length).toBeGreaterThan(0);
    }
  });
});
