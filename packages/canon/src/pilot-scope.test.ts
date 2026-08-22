import { describe, expect, it } from 'vitest';
import { type PilotConfig, assemblePilotScope } from './pilot-scope.js';
import type { ArtifactRecord } from './schemas.js';

function artifact(id: string, references: string[]): ArtifactRecord {
  const hash = 'a'.repeat(64);
  return {
    recordKind: 'artifact',
    id,
    version: hash,
    source: {
      path: 'x/md/y.md',
      fileSha256: hash,
      spanSha256: hash,
      span: { byteStart: 0, byteEnd: 1, lineStart: 1, lineEnd: 1 },
    },
    auxiliarySources: [],
    text: 'x',
    sourceMetadata: {},
    structuredData: {},
    references,
    proposedTags: [],
    lifecycle: {
      ingest: 'extracted',
      classification: 'unclassified',
      parsing: 'unparsed',
      conformance: 'none',
    },
  };
}

function config(overrides: Partial<PilotConfig> = {}): PilotConfig {
  return {
    schemaVersion: 1,
    schema: 'engarde-conditions-pilot-config-v1',
    description: 'x',
    seeds: { conditions: ['ns/condition/a'], abilities: [] },
    chapterResolutions: [],
    supplements: [],
    maxDepth: 2,
    ...overrides,
  };
}

describe('assemblePilotScope', () => {
  it('walks the forward closure with provenance and depth bound', () => {
    const scope = assemblePilotScope(
      [
        artifact('ns/condition/a', ['ns/rule/b']),
        artifact('ns/rule/b', ['ns/rule/c']),
        artifact('ns/rule/c', ['ns/rule/d']),
        artifact('ns/rule/d', []),
      ],
      config(),
    );
    expect(scope.entries.map((entry) => [entry.id, entry.inclusion, entry.depth])).toEqual([
      ['ns/condition/a', 'seed', 0],
      ['ns/rule/b', 'dependency', 1],
      ['ns/rule/c', 'dependency', 2],
    ]);
    expect(scope.findings).toEqual([]);
  });

  it('resolves chapter-base references through the accepted map and records context-only edges', () => {
    const scope = assemblePilotScope(
      [
        artifact('ns/condition/a', ['ns/chapter/x', 'ns/chapter/y']),
        artifact('ns/rule/selected', []),
      ],
      config({
        chapterResolutions: [
          {
            from: 'ns/condition/a',
            reference: 'ns/chapter/x',
            disposition: 'covered-by-structured-artifact',
            selectedArtifactIds: ['ns/rule/selected'],
          },
          {
            from: 'ns/condition/a',
            reference: 'ns/chapter/y',
            disposition: 'context-only',
            selectedArtifactIds: [],
          },
        ],
      }),
    );
    const selected = scope.entries.find((entry) => entry.id === 'ns/rule/selected');
    expect(selected?.inclusion).toBe('resolution');
    expect(selected?.via).toBe('ns/condition/a -> ns/chapter/x');
    expect(scope.contextOnly).toEqual([{ from: 'ns/condition/a', reference: 'ns/chapter/y' }]);
    expect(scope.findings).toEqual([]);
  });

  it('flags unresolved references, missing seeds, and missing resolved artifacts', () => {
    const scope = assemblePilotScope(
      [artifact('ns/condition/a', ['ns/chapter/x', 'ns/gone'])],
      config({
        seeds: { conditions: ['ns/condition/a', 'ns/condition/absent'], abilities: [] },
        chapterResolutions: [
          {
            from: 'ns/condition/a',
            reference: 'ns/chapter/x',
            disposition: 'covered-by-structured-artifact',
            selectedArtifactIds: ['ns/also-gone'],
          },
        ],
      }),
    );
    expect(scope.findings).toEqual([
      { code: 'missing-resolved-artifact', from: 'ns/condition/a', reference: 'ns/also-gone' },
      { code: 'missing-seed', from: 'ns/condition/absent', reference: 'ns/condition/absent' },
      { code: 'unresolved-reference', from: 'ns/condition/a', reference: 'ns/gone' },
    ]);
  });

  it('locates chapter-chunk machinery by inbound edge and walks its direct dependencies', () => {
    const scope = assemblePilotScope(
      [
        artifact('ns/condition/a', []),
        artifact('ns/chapter/c#machinery', ['ns/condition/a', 'ns/rule/support']),
        artifact('ns/rule/support', ['ns/rule/beyond']),
        artifact('ns/rule/beyond', []),
        artifact('ns/feature/applier', ['ns/condition/a']),
      ],
      config(),
    );
    const machinery = scope.entries.find((entry) => entry.id === 'ns/chapter/c#machinery');
    expect(machinery?.inclusion).toBe('inbound-machinery');
    expect(machinery?.via).toBe('ns/condition/a');
    expect(scope.entries.some((entry) => entry.id === 'ns/rule/support')).toBe(true);
    // Machinery enters at the depth ceiling minus one: grand-dependencies stay out.
    expect(scope.entries.some((entry) => entry.id === 'ns/rule/beyond')).toBe(false);
    // Structured inbound hits are enumerated, not silently included.
    expect(scope.inboundCandidates).toEqual(['ns/feature/applier']);
    expect(scope.entries.some((entry) => entry.id === 'ns/feature/applier')).toBe(false);
  });

  it('includes reviewed supplements with their reasons and flags missing ones', () => {
    const scope = assemblePilotScope(
      [artifact('ns/condition/a', []), artifact('ns/chapter/c#extra', [])],
      config({
        supplements: [
          { id: 'ns/chapter/c#extra', reason: 'reviewed addition' },
          { id: 'ns/gone', reason: 'reviewed addition' },
        ],
      }),
    );
    const supplement = scope.entries.find((entry) => entry.id === 'ns/chapter/c#extra');
    expect(supplement?.inclusion).toBe('semantic-supplement');
    expect(supplement?.reason).toBe('reviewed addition');
    expect(scope.findings).toEqual([
      { code: 'missing-supplement', from: 'ns/gone', reference: 'ns/gone' },
    ]);
  });

  it('keeps the first inclusion when an artifact is reachable multiple ways', () => {
    const scope = assemblePilotScope(
      [
        artifact('ns/condition/a', ['ns/rule/shared']),
        artifact('ns/condition/b', ['ns/rule/shared']),
        artifact('ns/rule/shared', []),
      ],
      config({ seeds: { conditions: ['ns/condition/a', 'ns/condition/b'], abilities: [] } }),
    );
    const shared = scope.entries.filter((entry) => entry.id === 'ns/rule/shared');
    expect(shared).toHaveLength(1);
    expect(scope.counts.included).toBe(3);
  });

  it('rejects duplicate artifact IDs', () => {
    expect(() =>
      assemblePilotScope([artifact('ns/a', []), artifact('ns/a', [])], config()),
    ).toThrow(/duplicate artifact ID/);
  });
});
