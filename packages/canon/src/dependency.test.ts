import { describe, expect, it } from 'vitest';
import { computeReferenceClosure } from './dependency.js';
import type { ArtifactRecord } from './schemas.js';

function artifact(id: string, references: string[]): ArtifactRecord {
  const hash = 'a'.repeat(64);
  return {
    recordKind: 'artifact',
    id,
    version: hash,
    source: {
      path: `${id}.md`,
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

describe('reference closure', () => {
  it('walks cycles once and reports unresolved SCC references', () => {
    const result = computeReferenceClosure(
      [artifact('a', ['b']), artifact('b', ['a', 'missing'])],
      ['a'],
    );
    expect(result).toEqual({
      seeds: ['a'],
      maxDepth: null,
      artifactIds: ['a', 'b'],
      depths: [
        { id: 'a', depth: 0 },
        { id: 'b', depth: 1 },
      ],
      missing: [{ from: 'b', reference: 'missing' }],
    });
  });

  it('bounds an over-connected reference graph by depth', () => {
    const result = computeReferenceClosure(
      [artifact('a', ['b']), artifact('b', ['c']), artifact('c', [])],
      ['a'],
      { maxDepth: 1 },
    );
    expect(result.artifactIds).toEqual(['a', 'b']);
    expect(result.maxDepth).toBe(1);
  });

  it('rejects unknown seeds and duplicate artifact IDs', () => {
    expect(() => computeReferenceClosure([artifact('a', [])], ['missing'])).toThrow(
      'seed artifact is missing',
    );
    expect(() => computeReferenceClosure([artifact('a', []), artifact('a', [])], ['a'])).toThrow(
      'duplicate artifact ID',
    );
  });
});
