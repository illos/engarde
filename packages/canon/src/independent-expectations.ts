import { z } from 'zod';
import type { GrammarParse } from './effect-grammar.js';
import { Sha256Schema } from './schemas.js';

/**
 * Channel 2 of the verification stack (engine-plan 4.3, pilot thin form):
 * an independent reader turns the verbatim artifact text into structured
 * assertions. Leaf provenance is mechanical — every assertion must carry an
 * exact quote from the artifact text, and its claimed value must appear
 * inside that quote — so a reader cannot smuggle in remembered or invented
 * rule content. Channel agreement is evidence; disagreement routes to the
 * human queue; nothing merges automatically.
 */

export const IndependentExpectationsSchema = z.object({
  schemaVersion: z.literal(1),
  schema: z.literal('engarde-independent-expectations-v1'),
  artifactId: z.string().min(1),
  artifactVersion: Sha256Schema,
  assertions: z
    .array(
      z.object({
        id: z.string().min(1),
        onTier: z.enum(['≤11', '12-16', '17+']).nullable(),
        kind: z.enum(['damage', 'condition', 'duration', 'potency', 'other']),
        value: z.string().min(1),
        quote: z.string().min(1),
      }),
    )
    .min(1),
});

export type IndependentExpectations = z.infer<typeof IndependentExpectationsSchema>;

export interface ProvenanceFinding {
  assertionId: string;
  code: 'quote-not-in-text' | 'value-not-in-quote';
}

export function validateLeafProvenance(
  text: string,
  expectations: IndependentExpectations,
): ProvenanceFinding[] {
  const findings: ProvenanceFinding[] = [];
  for (const assertion of expectations.assertions) {
    if (!text.includes(assertion.quote)) {
      findings.push({ assertionId: assertion.id, code: 'quote-not-in-text' });
      continue;
    }
    if (assertion.kind !== 'other' && !assertion.quote.includes(assertion.value)) {
      findings.push({ assertionId: assertion.id, code: 'value-not-in-quote' });
    }
  }
  return findings;
}

interface Claim {
  onTier: string | null;
  kind: string;
  value: string;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function channelOneClaims(parse: GrammarParse): Claim[] {
  const claims: Claim[] = [];
  for (const clause of parse.clauses) {
    if (clause.kind !== 'tier-outcome') continue;
    const tier = clause.data.band;
    if (clause.data.damage) {
      claims.push({
        onTier: tier,
        kind: 'damage',
        value: normalize(
          `${clause.data.damage.amount}${clause.data.damage.characteristic ? ` + ${clause.data.damage.characteristic}` : ''}`,
        ),
      });
    }
    if (clause.data.potency) {
      claims.push({
        onTier: tier,
        kind: 'potency',
        value: normalize(
          `${clause.data.potency.characteristic} < ${clause.data.potency.threshold}`,
        ),
      });
    }
    for (const conditionId of clause.data.conditionIds) {
      claims.push({
        onTier: tier,
        kind: 'condition',
        value: normalize(conditionId.split('/').pop() ?? conditionId),
      });
    }
    if (clause.data.ending === 'save-ends') {
      claims.push({ onTier: tier, kind: 'duration', value: 'save ends' });
    }
  }
  return claims;
}

export interface ChannelComparison {
  artifactId: string;
  matches: number;
  disagreements: Array<{
    side: 'channel-1-only' | 'channel-2-only' | 'value-mismatch';
    onTier: string | null;
    kind: string;
    channel1?: string;
    channel2?: string;
    assertionId?: string;
  }>;
}

export function compareChannels(
  parse: GrammarParse,
  expectations: IndependentExpectations,
): ChannelComparison {
  const one = channelOneClaims(parse);
  const disagreements: ChannelComparison['disagreements'] = [];
  let matches = 0;

  const key = (claim: Claim): string => `${claim.onTier ?? '-'}\0${claim.kind}\0${claim.value}`;
  const slot = (claim: Claim): string => `${claim.onTier ?? '-'}\0${claim.kind}`;

  const oneByKey = new Map(one.map((claim) => [key(claim), claim]));
  const matchedOneKeys = new Set<string>();

  const comparable = expectations.assertions.filter((assertion) => assertion.kind !== 'other');
  for (const assertion of comparable) {
    const claim: Claim = {
      onTier: assertion.onTier,
      kind: assertion.kind,
      value: normalize(assertion.value),
    };
    const exact = oneByKey.get(key(claim));
    if (exact) {
      matches += 1;
      matchedOneKeys.add(key(claim));
      continue;
    }
    const sameSlot = one.filter(
      (candidate) => slot(candidate) === slot(claim) && !matchedOneKeys.has(key(candidate)),
    );
    if (sameSlot.length > 0 && sameSlot[0]) {
      matchedOneKeys.add(key(sameSlot[0]));
      disagreements.push({
        side: 'value-mismatch',
        onTier: claim.onTier,
        kind: claim.kind,
        channel1: sameSlot[0].value,
        channel2: claim.value,
        assertionId: assertion.id,
      });
      continue;
    }
    // Channel 2 read something the grammar did not — often legitimate
    // residue coverage; always a queue item, never a silent merge.
    disagreements.push({
      side: 'channel-2-only',
      onTier: claim.onTier,
      kind: claim.kind,
      channel2: claim.value,
      assertionId: assertion.id,
    });
  }
  for (const claim of one) {
    if (!matchedOneKeys.has(key(claim))) {
      disagreements.push({
        side: 'channel-1-only',
        onTier: claim.onTier,
        kind: claim.kind,
        channel1: claim.value,
      });
    }
  }
  return { artifactId: expectations.artifactId, matches, disagreements };
}
