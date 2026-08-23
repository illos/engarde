import { describe, expect, it } from 'vitest';
import { type AttributionConfig, attributeArtifacts, attributionKeyOf } from './attribution.js';

function config(overrides: Partial<AttributionConfig> = {}): AttributionConfig {
  return {
    schemaVersion: 1,
    schema: 'engarde-category-attribution-v1',
    status: 'proposed',
    description: 'x',
    buckets: ['alpha', 'beta'],
    rules: [
      { match: 'bookx/chapter/one', bucket: 'alpha' },
      { match: 'bookx/thing', bucket: 'alpha' },
      { match: 'bookx/thing.special', bucket: 'beta' },
    ],
    ...overrides,
  };
}

describe('attributionKeyOf', () => {
  it('derives book/category for structured ids and book/chapter/name for chunks', () => {
    expect(attributionKeyOf('mcdm.bookx.v1/thing.special.deep/slug')).toBe(
      'bookx/thing.special.deep',
    );
    expect(attributionKeyOf('mcdm.bookx.v1/chapter/one#part')).toBe('bookx/chapter/one');
  });

  it('rejects underivable ids', () => {
    expect(() => attributionKeyOf('bare')).toThrow(/cannot derive/);
  });
});

describe('attributeArtifacts', () => {
  it('attributes by longest dotted-prefix and counts buckets', () => {
    const result = attributeArtifacts(
      [
        'mcdm.bookx.v1/thing/a',
        'mcdm.bookx.v1/thing.special.deep/b',
        'mcdm.bookx.v1/chapter/one#c',
      ],
      config(),
    );
    expect(result.ok).toBe(true);
    expect(result.byBucket).toEqual({ alpha: 2, beta: 1 });
    const special = result.attributed.find((entry) => entry.artifactId.includes('special'));
    expect(special?.bucket).toBe('beta');
    expect(special?.rule).toBe('bookx/thing.special');
  });

  it('reports unmatched artifacts as findings, never silently', () => {
    const result = attributeArtifacts(['mcdm.bookx.v1/unknown/a'], config());
    expect(result.ok).toBe(false);
    expect(result.unmatched).toEqual([
      { artifactId: 'mcdm.bookx.v1/unknown/a', key: 'bookx/unknown' },
    ]);
  });

  it('does not let a category prefix match across a partial token', () => {
    const result = attributeArtifacts(['mcdm.bookx.v1/thingy/a'], config());
    expect(result.ok).toBe(false);
  });

  it('rejects rules naming undeclared buckets', () => {
    expect(() =>
      attributeArtifacts([], config({ rules: [{ match: 'x/y', bucket: 'ghost' }] })),
    ).toThrow(/undeclared bucket/);
  });
});
