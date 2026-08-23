import { describe, expect, it } from 'vitest';
import type { GrammarParse } from './effect-grammar.js';
import {
  type IndependentExpectations,
  compareChannels,
  validateLeafProvenance,
} from './independent-expectations.js';

const HASH = 'a'.repeat(64);

function expectations(assertions: IndependentExpectations['assertions']): IndependentExpectations {
  return {
    schemaVersion: 1,
    schema: 'engarde-independent-expectations-v1',
    artifactId: 'ns/feature/x',
    artifactVersion: HASH,
    assertions,
  };
}

function tierParse(): GrammarParse {
  const span = { byteStart: 0, byteEnd: 1, text: 'x' };
  return {
    clauses: [
      {
        kind: 'tier-outcome',
        span,
        data: {
          band: '17+',
          damage: { amount: 10, characteristic: 'M' },
          potency: { characteristic: 'M', threshold: 'STRONG' },
          conditionIds: ['ns/condition/a'],
          ending: 'save-ends',
        },
      },
    ],
    residue: [],
    stats: { totalBytes: 1, parsedBytes: 1, residueBytes: 0 },
  };
}

describe('validateLeafProvenance', () => {
  it('accepts quotes present in the text with values inside the quote', () => {
    const findings = validateLeafProvenance(
      'x has 10 + M damage here',
      expectations([
        { id: 'a1', onTier: '17+', kind: 'damage', value: '10 + M', quote: '10 + M damage' },
      ]),
    );
    expect(findings).toEqual([]);
  });

  it('rejects fabricated quotes and values outside their quote', () => {
    const findings = validateLeafProvenance(
      'x has 10 + M damage here',
      expectations([
        { id: 'a1', onTier: null, kind: 'damage', value: '10 + M', quote: 'not in the text' },
        { id: 'a2', onTier: null, kind: 'damage', value: '99', quote: '10 + M damage' },
      ]),
    );
    expect(findings).toEqual([
      { assertionId: 'a1', code: 'quote-not-in-text' },
      { assertionId: 'a2', code: 'value-not-in-quote' },
    ]);
  });
});

describe('compareChannels', () => {
  it('matches identical claims and reports none in disagreement', () => {
    const comparison = compareChannels(
      tierParse(),
      expectations([
        { id: 'a1', onTier: '17+', kind: 'damage', value: '10 + M', quote: 'x' },
        { id: 'a2', onTier: '17+', kind: 'potency', value: 'M < STRONG', quote: 'x' },
        { id: 'a3', onTier: '17+', kind: 'condition', value: 'a', quote: 'x' },
        { id: 'a4', onTier: '17+', kind: 'duration', value: 'save ends', quote: 'x' },
      ]),
    );
    expect(comparison.matches).toBe(4);
    expect(comparison.disagreements).toEqual([]);
  });

  it('routes value mismatches and one-sided claims to the queue', () => {
    const comparison = compareChannels(
      tierParse(),
      expectations([
        { id: 'a1', onTier: '17+', kind: 'damage', value: '12 + M', quote: 'x' },
        { id: 'a2', onTier: null, kind: 'other', value: 'x prose', quote: 'x' },
        { id: 'a3', onTier: '12-16', kind: 'condition', value: 'b', quote: 'x' },
      ]),
    );
    const sides = comparison.disagreements.map((item) => item.side).sort();
    expect(sides).toContain('value-mismatch');
    expect(sides).toContain('channel-2-only');
    expect(sides).toContain('channel-1-only');
    const mismatch = comparison.disagreements.find((item) => item.side === 'value-mismatch');
    expect(mismatch?.channel1).toBe('10 + m');
    expect(mismatch?.channel2).toBe('12 + m');
  });
});
