import { requireLine, scanSourceLines, sha256 } from './bytes.js';
import { parseFrontmatter } from './frontmatter.js';
import { INITIAL_LIFECYCLE } from './lifecycle.js';
import {
  type ChapterChunkProposal,
  ChapterChunkProposalSchema,
  type ChapterWorkPacket,
  type ExtractionBundle,
  type LeafRecord,
} from './schemas.js';

interface PairedSource {
  markdownPath: string;
  markdown: Buffer;
  jsonPath: string;
  json: Buffer;
}

function parseStructuredData(json: Buffer): Record<string, unknown> {
  const parsed: unknown = JSON.parse(json.toString('utf8'));
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('paired JSON source must contain an object');
  }
  return parsed as Record<string, unknown>;
}

function stableIdFrom(
  metadata: Record<string, unknown>,
  structuredData: Record<string, unknown>,
): string {
  const direct = metadata.scc;
  if (typeof direct === 'string' && direct.length > 0) return direct;

  const structured = structuredData.scc;
  if (typeof structured === 'string' && structured.length > 0) return structured;

  const nested = structuredData.metadata;
  if (typeof nested === 'object' && nested !== null && !Array.isArray(nested)) {
    const nestedScc = (nested as Record<string, unknown>).scc;
    if (typeof nestedScc === 'string' && nestedScc.length > 0) return nestedScc;
    if (Array.isArray(nestedScc) && typeof nestedScc[0] === 'string') return nestedScc[0];
  }

  throw new Error('source record has no stable SCC identifier');
}

function extractSccReferences(text: string): string[] {
  const references = new Set<string>();
  for (const match of text.matchAll(/scc\.v1:([^\s)]+)/g)) {
    const reference = match[1];
    if (reference) references.add(reference);
  }
  return [...references].sort();
}

function sourceReference(path: string, source: Buffer, byteStart: number, byteEnd: number) {
  const lines = scanSourceLines(source);
  const start = requireLine(lines, lines.findIndex((line) => byteStart < line.byteEnd) + 1);
  const endByte = byteEnd - 1;
  const end = requireLine(lines, lines.findIndex((line) => endByte < line.byteEnd) + 1);
  const spanBytes = source.subarray(byteStart, byteEnd);
  return {
    path,
    fileSha256: sha256(source),
    spanSha256: sha256(spanBytes),
    span: {
      byteStart,
      byteEnd,
      lineStart: start.number,
      lineEnd: end.number,
    },
  };
}

function exclusion(
  id: string,
  paired: PairedSource,
  byteStart: number,
  byteEnd: number,
  reasonCode: 'source-metadata' | 'outside-declared-scope',
  reason: string,
): LeafRecord {
  const source = sourceReference(paired.markdownPath, paired.markdown, byteStart, byteEnd);
  return {
    recordKind: 'exclusion',
    id,
    version: source.spanSha256,
    source,
    reasonCode,
    reason,
  };
}

function artifact(
  id: string,
  paired: PairedSource,
  byteStart: number,
  byteEnd: number,
  sourceMetadata: Record<string, unknown>,
  structuredData: Record<string, unknown>,
  proposedTags: string[],
): LeafRecord {
  const source = sourceReference(paired.markdownPath, paired.markdown, byteStart, byteEnd);
  const text = paired.markdown.subarray(byteStart, byteEnd).toString('utf8');
  return {
    recordKind: 'artifact',
    id,
    version: source.spanSha256,
    source,
    auxiliarySources: [{ path: paired.jsonPath, sha256: sha256(paired.json) }],
    text,
    sourceMetadata,
    structuredData,
    references: extractSccReferences(text),
    proposedTags,
    lifecycle: INITIAL_LIFECYCLE,
  };
}

function bundle(paired: PairedSource, records: LeafRecord[]): ExtractionBundle {
  return {
    schemaVersion: 1,
    source: {
      path: paired.markdownPath,
      sha256: sha256(paired.markdown),
      bytes: paired.markdown.length,
      auxiliarySources: [{ path: paired.jsonPath, sha256: sha256(paired.json) }],
    },
    records,
  };
}

export function ingestStructuredRecord(paired: PairedSource): ExtractionBundle {
  const frontmatter = parseFrontmatter(paired.markdown);
  if (frontmatter.byteEnd >= paired.markdown.length) throw new Error('source record has no body');
  const structuredData = parseStructuredData(paired.json);
  const stableId = stableIdFrom(frontmatter.metadata, structuredData);
  const records: LeafRecord[] = [
    exclusion(
      `exclude:${stableId}:source-metadata`,
      paired,
      0,
      frontmatter.byteEnd,
      'source-metadata',
      'YAML adapter metadata is retained as fields, not canonical rule text.',
    ),
    artifact(
      stableId,
      paired,
      frontmatter.byteEnd,
      paired.markdown.length,
      frontmatter.metadata,
      structuredData,
      [],
    ),
  ];
  return bundle(paired, records);
}

export function createChapterWorkPacket(
  paired: PairedSource,
  requestedScope?: { startLine: number; endLine: number; reason: string },
): ChapterWorkPacket {
  const frontmatter = parseFrontmatter(paired.markdown);
  const structuredData = parseStructuredData(paired.json);
  const stableId = stableIdFrom(frontmatter.metadata, structuredData);
  const lines = scanSourceLines(paired.markdown);
  const firstBodyLine = lines.find((line) => line.byteStart >= frontmatter.byteEnd);
  if (!firstBodyLine) throw new Error('chapter has no body');
  const scope =
    requestedScope ??
    ({
      startLine: firstBodyLine.number,
      endLine: lines.at(-1)?.number ?? firstBodyLine.number,
      reason: 'entire chapter body',
    } as const);

  if (scope.startLine > scope.endLine) throw new Error('scope starts after it ends');
  const start = requireLine(lines, scope.startLine);
  const end = requireLine(lines, scope.endLine);
  if (start.byteStart < frontmatter.byteEnd) throw new Error('scope overlaps source frontmatter');

  return {
    schemaVersion: 1,
    task: 'propose-chapter-chunks',
    source: {
      path: paired.markdownPath,
      sha256: sha256(paired.markdown),
      bytes: paired.markdown.length,
      lineCount: lines.length,
      stableId,
      scope,
    },
    outputContract: {
      format: 'json',
      schema: 'engarde-chapter-chunk-proposal-v1',
      instructions: [
        'Return only JSON matching the requested proposal schema; never reproduce source prose.',
        'Copy the packet source object exactly into proposal.source.',
        'Return top-level schemaVersion, schema, source, and chunks. Each chunk must contain key, startLine, anchor, title, parentKey, and tags.',
        'Create one chunk start for each smallest independently useful semantic rule section.',
        'The first chunk must start exactly at the scope start line and chunks must be source ordered.',
        'Copy each start line exactly into anchor; a full-body packet can begin with a blank body line, whose exact anchor is an empty string. The cutter rejects a changed anchor or checksum.',
        'Use stable kebab-case keys and refer only to an earlier chunk as parentKey.',
        'Tags are proposals only; do not invent, paraphrase, or normalize rule text.',
      ],
    },
    lines: lines.slice(scope.startLine - 1, scope.endLine).map((line) => ({
      number: line.number,
      text: line.text,
    })),
  };
}

function validateProposal(
  proposalInput: ChapterChunkProposal,
  paired: PairedSource,
): ChapterChunkProposal {
  const proposal = ChapterChunkProposalSchema.parse(proposalInput);
  const lines = scanSourceLines(paired.markdown);
  const frontmatter = parseFrontmatter(paired.markdown);
  const structuredData = parseStructuredData(paired.json);
  const stableId = stableIdFrom(frontmatter.metadata, structuredData);

  if (proposal.source.path !== paired.markdownPath)
    throw new Error('proposal source path mismatch');
  if (proposal.source.sha256 !== sha256(paired.markdown))
    throw new Error('proposal source checksum mismatch');
  if (proposal.source.stableId !== stableId) throw new Error('proposal stable ID mismatch');
  if (proposal.chunks[0]?.startLine !== proposal.source.scope.startLine) {
    throw new Error('the first chunk must begin at the declared scope start');
  }
  requireLine(lines, proposal.source.scope.endLine);

  const keys = new Set<string>();
  let previousLine = 0;
  for (const chunk of proposal.chunks) {
    if (keys.has(chunk.key)) throw new Error(`duplicate chunk key: ${chunk.key}`);
    if (chunk.startLine <= previousLine)
      throw new Error('chunk starts must be strictly source ordered');
    if (
      chunk.startLine < proposal.source.scope.startLine ||
      chunk.startLine > proposal.source.scope.endLine
    ) {
      throw new Error(`chunk ${chunk.key} starts outside the declared scope`);
    }
    const line = requireLine(lines, chunk.startLine);
    if (line.text !== chunk.anchor) throw new Error(`anchor mismatch for chunk ${chunk.key}`);
    if (chunk.parentKey !== null && !keys.has(chunk.parentKey)) {
      throw new Error(`chunk ${chunk.key} must refer to an earlier parentKey`);
    }
    keys.add(chunk.key);
    previousLine = chunk.startLine;
  }

  return proposal;
}

export function cutChapterProposal(
  paired: PairedSource,
  proposalInput: ChapterChunkProposal,
): ExtractionBundle {
  const proposal = validateProposal(proposalInput, paired);
  const lines = scanSourceLines(paired.markdown);
  const frontmatter = parseFrontmatter(paired.markdown);
  const structuredData = parseStructuredData(paired.json);
  const scopeStart = requireLine(lines, proposal.source.scope.startLine).byteStart;
  const scopeEnd = requireLine(lines, proposal.source.scope.endLine).byteEnd;
  const records: LeafRecord[] = [];

  records.push(
    exclusion(
      `exclude:${proposal.source.stableId}:source-metadata`,
      paired,
      0,
      frontmatter.byteEnd,
      'source-metadata',
      'YAML adapter metadata is retained as fields, not canonical rule text.',
    ),
  );
  if (frontmatter.byteEnd < scopeStart) {
    records.push(
      exclusion(
        `exclude:${proposal.source.stableId}:before-scope`,
        paired,
        frontmatter.byteEnd,
        scopeStart,
        'outside-declared-scope',
        `Excluded because it is before the declared scope: ${proposal.source.scope.reason}`,
      ),
    );
  }

  for (const [index, chunk] of proposal.chunks.entries()) {
    const next = proposal.chunks[index + 1];
    const byteStart = requireLine(lines, chunk.startLine).byteStart;
    const byteEnd = next ? requireLine(lines, next.startLine).byteStart : scopeEnd;
    records.push(
      artifact(
        `${proposal.source.stableId}#${chunk.key}`,
        paired,
        byteStart,
        byteEnd,
        {
          ...frontmatter.metadata,
          chunkTitle: chunk.title,
          parentKey: chunk.parentKey,
        },
        structuredData,
        chunk.tags,
      ),
    );
  }

  if (scopeEnd < paired.markdown.length) {
    records.push(
      exclusion(
        `exclude:${proposal.source.stableId}:after-scope`,
        paired,
        scopeEnd,
        paired.markdown.length,
        'outside-declared-scope',
        `Excluded because it is after the declared scope: ${proposal.source.scope.reason}`,
      ),
    );
  }

  return bundle(paired, records);
}

export type { PairedSource };
