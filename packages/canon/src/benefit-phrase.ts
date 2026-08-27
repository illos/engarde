import type { BenefitPhrase } from '@engarde/engine';

/**
 * Closed, ordered benefit templates measured over the accepted corpus pin
 * [R-0038]. Every matcher is whole-string anchored; unknown future text is
 * returned verbatim as residue, never inferred.
 */
export const BENEFIT_PHRASE_TEMPLATES = [
  'edge-on-strikes',
  'double-edge-on-strikes',
  'strike-damage-bonus',
  'strikes-bonus',
  'stamina-bonus',
  'speed-bonus',
  'ranged-distance-bonus',
  'melee-distance-bonus',
  'forced-movement-distance-bonus',
] as const;

const amount = (match: RegExpExecArray): number => Number(match[1]);

export function parseBenefitPhrase(sourceText: string): BenefitPhrase {
  if (/^Gain an edge on strikes$/.test(sourceText)) {
    return { kind: 'strike-edge', magnitude: 1, sourceText };
  }
  if (/^Have a double edge on strikes$/.test(sourceText)) {
    return { kind: 'strike-edge', magnitude: 2, sourceText };
  }
  let match = /^\+(\d+) damage bonus to strikes$/.exec(sourceText);
  if (match) return { kind: 'strike-damage', amount: amount(match), sourceText };
  // R-0038's accepted sub-question: lizardfolk tonguer's unique shortened
  // phrase is the same damage-bonus bucket.
  match = /^\+(\d+) bonus to strikes$/.exec(sourceText);
  if (match) return { kind: 'strike-damage', amount: amount(match), sourceText };
  match = /^\+(\d+) bonus to Stamina$/.exec(sourceText);
  if (match) return { kind: 'stamina', amount: amount(match), sourceText };
  for (const [template, pattern] of [
    ['speed', /^\+(\d+) bonus to speed$/],
    ['ranged-distance', /^\+(\d+) bonus to ranged distance$/],
    ['melee-distance', /^\+(\d+) bonus to melee distance$/],
    ['forced-movement-distance', /^\+(\d+) bonus to forced movement distance$/],
  ] as const) {
    match = pattern.exec(sourceText);
    if (match) return { kind: 'directive', template, amount: amount(match), sourceText };
  }
  return { kind: 'residue', sourceText };
}

/** Thin structured-data caller over the canonical `with_captain` field. */
export function parseWithCaptain(structuredData: Record<string, unknown>): BenefitPhrase | null {
  const phrase = structuredData.with_captain;
  return typeof phrase === 'string' && phrase.length > 0 ? parseBenefitPhrase(phrase) : null;
}
