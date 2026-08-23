import { describe, expect, it } from 'vitest';
import {
  type ClassificationBatch,
  type ClassificationProposal,
  buildClassificationPackets,
  compareClassificationRuns,
  contentTypeOf,
  renderClassificationReview,
  renderClassificationReviewHtml,
  renderComparisonHtml,
  validateClassificationCoverage,
} from './taxonomy.js';

const HASH = 'a'.repeat(64);

function proposal(overrides: Partial<ClassificationProposal> = {}): ClassificationProposal {
  return {
    artifactId: 'ns/condition/a',
    artifactVersion: HASH,
    contentType: 'condition',
    playCategory: 'combat',
    tier: '1',
    implementability: 'engine-mechanism',
    spatialProfile: [],
    rationale: 'x',
    uncertain: false,
    ...overrides,
  };
}

function batch(proposals: ClassificationProposal[], laneId = 'lane-1'): ClassificationBatch {
  return {
    schemaVersion: 1,
    schema: 'engarde-classification-proposal-v1',
    laneId,
    manifestSha256: HASH,
    proposals,
  };
}

describe('contentTypeOf', () => {
  it('derives the mechanical category head from the artifact id', () => {
    expect(contentTypeOf('ns/condition/a')).toBe('condition');
    expect(contentTypeOf('ns/rule.combat/b')).toBe('rule');
    expect(contentTypeOf('ns/feature.common.maneuvers/c')).toBe('feature');
    expect(contentTypeOf('ns/chapter/x#chunk')).toBe('chapter');
  });

  it('rejects ids it cannot derive from', () => {
    expect(() => contentTypeOf('bare')).toThrow(/cannot derive/);
  });
});

describe('buildClassificationPackets', () => {
  it('splits sorted artifacts into deterministic contiguous lanes', () => {
    const artifacts = ['ns/x/c', 'ns/x/a', 'ns/x/b'].map((artifactId) => ({
      artifactId,
      artifactVersion: HASH,
      references: [],
      text: 'x',
    }));
    const packets = buildClassificationPackets(artifacts, HASH, 2);
    expect(packets.map((packet) => packet.laneId)).toEqual(['lane-1', 'lane-2']);
    expect(packets[0]?.artifacts.map((artifact) => artifact.artifactId)).toEqual([
      'ns/x/a',
      'ns/x/b',
    ]);
    expect(packets[1]?.artifacts.map((artifact) => artifact.artifactId)).toEqual(['ns/x/c']);
  });

  it('rejects a non-positive lane count', () => {
    expect(() => buildClassificationPackets([], HASH, 0)).toThrow(/positive integer/);
  });
});

describe('validateClassificationCoverage', () => {
  const expected = new Map([
    ['ns/condition/a', HASH],
    ['ns/condition/b', HASH],
  ]);

  it('passes exact coverage at matching versions', () => {
    const report = validateClassificationCoverage(
      expected,
      [batch([proposal(), proposal({ artifactId: 'ns/condition/b' })])],
      HASH,
    );
    expect(report.ok).toBe(true);
    expect(report.classified).toBe(2);
    expect(report.counts.byTier).toEqual({ '1': 2 });
  });

  it('flags missing, duplicate, unexpected, stale, and version-drifted proposals', () => {
    const report = validateClassificationCoverage(
      expected,
      [
        batch(
          [
            proposal({ artifactVersion: 'b'.repeat(64) }),
            proposal(),
            proposal({ artifactId: 'ns/condition/elsewhere' }),
          ],
          'lane-1',
        ),
      ],
      'c'.repeat(64),
    );
    const codes = report.findings.map((finding) => finding.code);
    expect(codes).toContain('version-mismatch');
    expect(codes).toContain('duplicate-classification');
    expect(codes).toContain('unexpected-artifact');
    expect(codes).toContain('stale-manifest');
    expect(codes).toContain('unclassified-artifact');
    expect(report.ok).toBe(false);
  });

  it('flags drifted content types and uncertainty without a note', () => {
    const report = validateClassificationCoverage(
      expected,
      [
        batch([
          proposal({ contentType: 'rule' }),
          proposal({ artifactId: 'ns/condition/b', uncertain: true }),
        ]),
      ],
      HASH,
    );
    const codes = report.findings.map((finding) => finding.code);
    expect(codes).toContain('content-type-drift');
    expect(codes).toContain('uncertain-without-note');
    expect(report.uncertain).toEqual(['ns/condition/b']);
  });
});

describe('renderClassificationReview', () => {
  it('renders coverage, the uncertainty queue, and one row per proposal', () => {
    const batches = [
      batch([
        proposal(),
        proposal({
          artifactId: 'ns/condition/b',
          uncertain: true,
          uncertaintyNote: 'needs a closer look',
        }),
      ]),
    ];
    const expected = new Map([
      ['ns/condition/a', HASH],
      ['ns/condition/b', HASH],
    ]);
    const review = renderClassificationReview(
      batches,
      validateClassificationCoverage(expected, batches, HASH),
    );
    expect(review).toContain('2/2 classified');
    expect(review).toContain('## Uncertainty queue');
    expect(review).toContain('needs a closer look');
    expect(review.match(/^\| `ns\//gm)).toHaveLength(2);
  });
});

describe('renderClassificationReviewHtml', () => {
  it('embeds the verbatim source text beside each classification', () => {
    const batches = [
      batch([
        proposal(),
        proposal({
          artifactId: 'ns/condition/b',
          uncertain: true,
          uncertaintyNote: 'needs a closer look',
        }),
      ]),
    ];
    const expected = new Map([
      ['ns/condition/a', HASH],
      ['ns/condition/b', HASH],
    ]);
    const texts = new Map([
      ['ns/condition/a', 'alpha <text> with [link](scc.v1:ns/condition/b)'],
      ['ns/condition/b', 'beta body'],
    ]);
    const html = renderClassificationReviewHtml(
      batches,
      validateClassificationCoverage(expected, batches, HASH),
      texts,
    );
    expect(html).toContain('alpha &lt;text&gt;');
    expect(html).toContain('<span class="scc" title="scc.v1:ns/condition/b">link</span>');
    expect(html).toContain('beta body');
    expect(html).toContain('Uncertainty queue (1)');
    expect(html).toContain('needs a closer look');
  });
});

describe('compareClassificationRuns', () => {
  it('measures per-field agreement and routes disagreements with both proposals', () => {
    const runA = [batch([proposal(), proposal({ artifactId: 'ns/condition/b', tier: '2' })])];
    const runB = [
      batch([
        proposal(),
        proposal({ artifactId: 'ns/condition/b', tier: '1', spatialProfile: ['movement'] }),
        proposal({ artifactId: 'ns/condition/extra' }),
      ]),
    ];
    const comparison = compareClassificationRuns(runA, runB, { a: 'left', b: 'right' });
    expect(comparison.compared).toBe(2);
    expect(comparison.fullAgreement).toBe(1);
    expect(comparison.fields.tier).toEqual({ agree: 1, disagree: 1, rate: 0.5 });
    expect(comparison.fields.spatialProfile?.disagree).toBe(1);
    expect(comparison.disagreements).toHaveLength(1);
    expect(comparison.disagreements[0]?.fields.sort()).toEqual(['spatialProfile', 'tier']);
    expect(comparison.onlyInB).toEqual(['ns/condition/extra']);
  });

  it('treats spatial profiles as order-insensitive sets', () => {
    const runA = [batch([proposal({ spatialProfile: ['movement', 'distance'] })])];
    const runB = [batch([proposal({ spatialProfile: ['distance', 'movement'] })])];
    const comparison = compareClassificationRuns(runA, runB, { a: 'a', b: 'b' });
    expect(comparison.fullAgreement).toBe(1);
  });

  it('renders an adjudication card per disagreement with the verbatim text', () => {
    const runA = [batch([proposal({ tier: '1' })])];
    const runB = [batch([proposal({ tier: '2' })])];
    const comparison = compareClassificationRuns(runA, runB, { a: 'left', b: 'right' });
    const html = renderComparisonHtml(comparison, new Map([['ns/condition/a', 'body <x>']]));
    expect(html).toContain('Disagreements (1)');
    expect(html).toContain('body &lt;x&gt;');
    expect(html).toContain('left');
    expect(html).toContain('right');
  });
});
