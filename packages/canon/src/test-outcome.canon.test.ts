import {
  TEST_DIFFICULTIES,
  TEST_DIFFICULTY_OUTCOMES,
  TEST_OUTCOME_CANON,
  TEST_OUTCOME_LABEL,
} from '@engarde/engine';
import { describe, expect, it } from 'vitest';
import { stripSccLinks } from './effect-grammar.js';
import { TEST_DIFFICULTY } from './fixtures/test-rules.verbatim.js';

/**
 * S20 proof: the engine's transcription of the Test Difficulty Outcomes
 * Table is read back, cell by cell, from the committed verbatim cut of
 * `rule.test/test-difficulty`. The engine cannot import canon, so the
 * table lives there as data and is PROVED here — a pin bump that rewords a
 * cell breaks loudly instead of silently keeping a stale label.
 */

/** Parse the printed markdown table: `| row label | easy | medium | hard |`. */
function printedTableRows(text: string): Map<string, [string, string, string]> {
  const stripped = stripSccLinks(text);
  const rows = new Map<string, [string, string, string]>();
  for (const line of stripped.split('\n')) {
    if (!line.startsWith('|') || line.startsWith('|--')) continue;
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells.length !== 4) continue;
    const [label, easy, medium, hard] = cells as [string, string, string, string];
    rows.set(label, [easy, medium, hard]);
  }
  return rows;
}

describe('the Test Difficulty Outcomes Table is transcribed from the pinned bytes', () => {
  const rows = printedTableRows(TEST_DIFFICULTY.text);

  it('cites the artifact it transcribes', () => {
    expect(TEST_OUTCOME_CANON.testDifficulty).toBe(TEST_DIFFICULTY.artifactId);
    expect(TEST_DIFFICULTY.text).toContain('###### Test Difficulty Outcomes Table');
  });

  it('reads the header as Power Roll × Easy / Medium / Hard, in that column order', () => {
    expect(rows.get('Power Roll')).toEqual([
      'Easy Test Outcomes',
      'Medium Test Outcomes',
      'Hard Test Outcomes',
    ]);
    expect(TEST_DIFFICULTIES).toEqual(['easy', 'medium', 'hard']);
  });

  it('matches every tier cell to the printed label', () => {
    const tierRows: ReadonlyArray<[1 | 2 | 3, string]> = [
      [1, '≤11'],
      [2, '12-16'],
      [3, '17+'],
    ];
    for (const [tier, rowLabel] of tierRows) {
      const printed = rows.get(rowLabel);
      expect(printed, rowLabel).toBeDefined();
      TEST_DIFFICULTIES.forEach((difficulty, column) => {
        expect(
          TEST_OUTCOME_LABEL[TEST_DIFFICULTY_OUTCOMES[difficulty][tier]],
          `${difficulty} × ${rowLabel}`,
        ).toBe(printed?.[column]);
      });
    }
  });

  it('reads the Natural 19 or 20 row as "Success with a reward" in every column', () => {
    expect(rows.get('Natural 19 or 20')).toEqual([
      TEST_OUTCOME_LABEL['success-with-reward'],
      TEST_OUTCOME_LABEL['success-with-reward'],
      TEST_OUTCOME_LABEL['success-with-reward'],
    ]);
  });

  it('prints exactly the five labels the engine names', () => {
    const printedLabels = new Set(
      [...rows.entries()].filter(([label]) => label !== 'Power Roll').flatMap(([, cells]) => cells),
    );
    expect([...printedLabels].sort()).toEqual(Object.values(TEST_OUTCOME_LABEL).sort());
  });
});
