import { describe, expect, it } from 'vitest';
import { auditExtractionBundle } from './audit.js';
import { sha256 } from './bytes.js';
import {
  type PairedSource,
  createChapterWorkPacket,
  cutChapterProposal,
  ingestStructuredRecord,
} from './extract.js';

function pair(markdown: string, json: Record<string, unknown>): PairedSource {
  return {
    markdownPath: 'en/books/heroes/md/rule/test/example.md',
    markdown: Buffer.from(markdown, 'utf8'),
    jsonPath: 'en/books/heroes/json/rule/test/example.json',
    json: Buffer.from(JSON.stringify(json), 'utf8'),
  };
}

describe('structured ingest', () => {
  it('cuts source bytes rather than accepting model-produced text', () => {
    const paired = pair(
      '---\nname: Example\nscc: example/rule\ntype: rule\n---\n\nA linked [term](scc.v1:book/rule/term).\n',
      { name: 'Example', scc: 'example/rule', type: 'rule' },
    );
    const bundle = ingestStructuredRecord(paired);
    const artifact = bundle.records.find((record) => record.recordKind === 'artifact');

    expect(artifact).toMatchObject({
      id: 'example/rule',
      references: ['book/rule/term'],
      lifecycle: {
        ingest: 'extracted',
        classification: 'unclassified',
        parsing: 'unparsed',
        conformance: 'none',
      },
    });
    expect(artifact?.recordKind === 'artifact' ? artifact.text : '').toBe(
      '\nA linked [term](scc.v1:book/rule/term).\n',
    );
    expect(auditExtractionBundle(paired.markdown, bundle)).toMatchObject({ ok: true });
  });
});

describe('chapter proposal cutter', () => {
  const paired = pair(
    '---\nname: Chapter\nscc: example/chapter\ntype: chapter\n---\n\n# Chapter\n\nOpening.\n\n## First Rule\n\nExact text.\n\n## Second Rule\n\nMore text.\n\n## Outside\n\nDeferred.\n',
    { name: 'Chapter', scc: 'example/chapter', type: 'chapter' },
  );

  it('builds scoped, line-numbered packets without asking a model to copy prose', () => {
    const packet = createChapterWorkPacket(paired, {
      startLine: 7,
      endLine: 17,
      reason: 'pilot scope',
    });
    expect(packet.lines[0]).toEqual({ number: 7, text: '# Chapter' });
    expect(packet.lines.at(-1)).toEqual({ number: 17, text: 'More text.' });
    expect(packet.source.sha256).toBe(sha256(paired.markdown));
  });

  it('turns ordered coordinates into a complete byte partition', () => {
    const bundle = cutChapterProposal(paired, {
      schemaVersion: 1,
      schema: 'engarde-chapter-chunk-proposal-v1',
      source: {
        path: paired.markdownPath,
        sha256: sha256(paired.markdown),
        stableId: 'example/chapter',
        scope: { startLine: 7, endLine: 17, reason: 'pilot scope' },
      },
      chunks: [
        {
          key: 'chapter-introduction',
          startLine: 7,
          anchor: '# Chapter',
          title: 'Chapter introduction',
          parentKey: null,
          tags: ['introduction'],
        },
        {
          key: 'first-rule',
          startLine: 11,
          anchor: '## First Rule',
          title: 'First Rule',
          parentKey: 'chapter-introduction',
          tags: ['rule'],
        },
        {
          key: 'second-rule',
          startLine: 15,
          anchor: '## Second Rule',
          title: 'Second Rule',
          parentKey: 'chapter-introduction',
          tags: ['rule'],
        },
      ],
    });

    expect(bundle.records.map((record) => record.recordKind)).toEqual([
      'exclusion',
      'exclusion',
      'artifact',
      'artifact',
      'artifact',
      'exclusion',
    ]);
    expect(auditExtractionBundle(paired.markdown, bundle)).toMatchObject({
      ok: true,
      artifactCount: 3,
      exclusionCount: 3,
    });
  });

  it('rejects stale checksums and changed anchors', () => {
    const onlyChunk = {
      key: 'chapter',
      startLine: 7,
      anchor: '# Changed by model',
      title: 'Chapter',
      parentKey: null,
      tags: [],
    };
    const base = {
      schemaVersion: 1 as const,
      schema: 'engarde-chapter-chunk-proposal-v1' as const,
      source: {
        path: paired.markdownPath,
        sha256: sha256(paired.markdown),
        stableId: 'example/chapter',
        scope: { startLine: 7, endLine: 17, reason: 'pilot scope' },
      },
      chunks: [onlyChunk],
    };
    expect(() => cutChapterProposal(paired, base)).toThrow('anchor mismatch');
    expect(() =>
      cutChapterProposal(paired, {
        ...base,
        source: { ...base.source, sha256: '0'.repeat(64) },
        chunks: [{ ...onlyChunk, anchor: '# Chapter' }],
      }),
    ).toThrow('checksum mismatch');
  });
});
