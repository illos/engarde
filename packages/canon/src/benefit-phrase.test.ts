import { describe, expect, it } from 'vitest';
import { parseBenefitPhrase } from './benefit-phrase.js';

describe('parseBenefitPhrase closed templates [R-0038]', () => {
  it('classifies the automated roll/damage/Stamina buckets', () => {
    expect(parseBenefitPhrase('Gain an edge on strikes')).toMatchObject({
      kind: 'strike-edge',
      magnitude: 1,
    });
    expect(parseBenefitPhrase('Have a double edge on strikes')).toMatchObject({
      kind: 'strike-edge',
      magnitude: 2,
    });
    expect(parseBenefitPhrase('+4 damage bonus to strikes')).toMatchObject({
      kind: 'strike-damage',
      amount: 4,
    });
    expect(parseBenefitPhrase('+1 bonus to strikes')).toMatchObject({
      kind: 'strike-damage',
      amount: 1,
    });
    expect(parseBenefitPhrase('+6 bonus to Stamina')).toMatchObject({
      kind: 'stamina',
      amount: 6,
    });
  });

  it('template-tags movement-plane benefits and preserves bespoke/future residue verbatim', () => {
    expect(parseBenefitPhrase('+5 bonus to ranged distance')).toMatchObject({
      kind: 'directive',
      template: 'ranged-distance',
      amount: 5,
    });
    const bespoke = 'Lightning spread increases by 1 square';
    expect(parseBenefitPhrase(bespoke)).toEqual({ kind: 'residue', sourceText: bespoke });
    const future = '+7 bonus to an unmeasured field';
    expect(parseBenefitPhrase(future)).toEqual({ kind: 'residue', sourceText: future });
  });
});
