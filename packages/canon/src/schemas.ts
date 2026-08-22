import { z } from 'zod';
import { LIFECYCLE_AXES } from './lifecycle.js';

export const RelativeSourcePathSchema = z
  .string()
  .min(1)
  .refine((value) => !value.startsWith('/'), 'source paths must be relative')
  .refine((value) => !value.includes('\\'), 'source paths must use forward slashes')
  .refine(
    (value) => !value.split('/').some((part) => part === '' || part === '.' || part === '..'),
    'source paths must be normalized',
  );

export const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const SourceLockSchema = z.object({
  schemaVersion: z.literal(1),
  source: z.literal('steelcompendium-data-unified'),
  remote: z.url(),
  commit: z.string().regex(/^[a-f0-9]{40}$/),
  tag: z.string().min(1),
  commitDate: z.iso.datetime({ offset: true }),
  books: z.array(
    z.object({
      id: z.string().regex(/^[a-z0-9-]+$/),
      disposition: z.enum(['include', 'exclude']),
      reason: z.string().min(1),
      categories: z.record(z.string().regex(/^[a-z0-9-]+$/), z.enum(['structured', 'chunk'])),
    }),
  ),
});

export type SourceLock = z.infer<typeof SourceLockSchema>;

export const SourceSpanSchema = z
  .object({
    byteStart: z.number().int().nonnegative(),
    byteEnd: z.number().int().positive(),
    lineStart: z.number().int().positive(),
    lineEnd: z.number().int().positive(),
  })
  .refine((span) => span.byteStart < span.byteEnd, 'byte span must be non-empty')
  .refine((span) => span.lineStart <= span.lineEnd, 'line span must be ordered');

export const SourceReferenceSchema = z.object({
  path: RelativeSourcePathSchema,
  fileSha256: Sha256Schema,
  spanSha256: Sha256Schema,
  span: SourceSpanSchema,
});

export const AuxiliarySourceSchema = z.object({
  path: RelativeSourcePathSchema,
  sha256: Sha256Schema,
});

// Fail-closed against the total execution contract: any state outside
// LIFECYCLE_AXES is a schema error, never an "unknown state" at rest.
const LifecycleSchema = z.object({
  ingest: z.enum(LIFECYCLE_AXES.ingest.states),
  classification: z.enum(LIFECYCLE_AXES.classification.states),
  parsing: z.enum(LIFECYCLE_AXES.parsing.states),
  conformance: z.enum(LIFECYCLE_AXES.conformance.states),
});

export const ArtifactRecordSchema = z.object({
  recordKind: z.literal('artifact'),
  id: z.string().min(1),
  version: Sha256Schema,
  source: SourceReferenceSchema,
  auxiliarySources: z.array(AuxiliarySourceSchema),
  text: z.string(),
  sourceMetadata: z.record(z.string(), z.unknown()),
  structuredData: z.record(z.string(), z.unknown()),
  references: z.array(z.string()).default([]),
  proposedTags: z.array(z.string()).default([]),
  lifecycle: LifecycleSchema,
});

export const ExclusionRecordSchema = z.object({
  recordKind: z.literal('exclusion'),
  id: z.string().min(1),
  version: Sha256Schema,
  source: SourceReferenceSchema,
  reasonCode: z.enum(['source-metadata', 'outside-declared-scope', 'excluded-source']),
  reason: z.string().min(1),
});

export const LeafRecordSchema = z.discriminatedUnion('recordKind', [
  ArtifactRecordSchema,
  ExclusionRecordSchema,
]);

export const ExtractionBundleSchema = z.object({
  schemaVersion: z.literal(1),
  source: z.object({
    path: RelativeSourcePathSchema,
    sha256: Sha256Schema,
    bytes: z.number().int().nonnegative(),
    auxiliarySources: z.array(AuxiliarySourceSchema),
  }),
  records: z.array(LeafRecordSchema),
});

export type ArtifactRecord = z.infer<typeof ArtifactRecordSchema>;
export type ExtractionBundle = z.infer<typeof ExtractionBundleSchema>;
export type LeafRecord = z.infer<typeof LeafRecordSchema>;

export const ChunkScopeSchema = z.object({
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  reason: z.string().min(1),
});

export const ChapterWorkPacketSchema = z.object({
  schemaVersion: z.literal(1),
  task: z.literal('propose-chapter-chunks'),
  source: z.object({
    path: RelativeSourcePathSchema,
    sha256: Sha256Schema,
    bytes: z.number().int().positive(),
    lineCount: z.number().int().positive(),
    stableId: z.string().min(1),
    scope: ChunkScopeSchema,
  }),
  outputContract: z.object({
    format: z.literal('json'),
    schema: z.literal('engarde-chapter-chunk-proposal-v1'),
    instructions: z.array(z.string().min(1)),
  }),
  lines: z.array(
    z.object({
      number: z.number().int().positive(),
      text: z.string(),
    }),
  ),
});

export const ChapterChunkProposalSchema = z.object({
  schemaVersion: z.literal(1),
  schema: z.literal('engarde-chapter-chunk-proposal-v1'),
  source: z.object({
    path: RelativeSourcePathSchema,
    sha256: Sha256Schema,
    stableId: z.string().min(1),
    scope: ChunkScopeSchema,
  }),
  chunks: z
    .array(
      z.object({
        key: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
        startLine: z.number().int().positive(),
        anchor: z.string(),
        title: z.string().min(1),
        parentKey: z
          .string()
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
          .nullable(),
        tags: z.array(z.string().min(1)),
      }),
    )
    .min(1),
});

export type ChapterChunkProposal = z.infer<typeof ChapterChunkProposalSchema>;
export type ChapterWorkPacket = z.infer<typeof ChapterWorkPacketSchema>;

export const InventoryEntrySchema = z.object({
  book: z.string().min(1),
  category: z.string().min(1),
  markdownPath: RelativeSourcePathSchema,
  jsonPath: RelativeSourcePathSchema,
  markdownSha256: Sha256Schema,
  jsonSha256: Sha256Schema,
  disposition: z.enum(['structured', 'chunk', 'exclude']),
  findings: z.array(
    z.object({
      severity: z.enum(['warning', 'error']),
      code: z.string().min(1),
      message: z.string().min(1),
    }),
  ),
});

export const CorpusInventorySchema = z.object({
  schemaVersion: z.literal(1),
  sourceCommit: z.string().regex(/^[a-f0-9]{40}$/),
  snapshotSha256: Sha256Schema,
  entries: z.array(InventoryEntrySchema),
});

export type CorpusInventory = z.infer<typeof CorpusInventorySchema>;
export type InventoryEntry = z.infer<typeof InventoryEntrySchema>;

export const CampaignFindingSchema = z.object({
  severity: z.enum(['error', 'warning']),
  code: z.string().min(1),
  message: z.string().min(1),
  sourcePath: RelativeSourcePathSchema.optional(),
  bundlePath: z.string().min(1).optional(),
});

export const CampaignBundleManifestEntrySchema = z.object({
  sourcePath: RelativeSourcePathSchema,
  disposition: z.enum(['structured', 'chunk']),
  bundlePath: z.string().min(1),
  bundleSha256: Sha256Schema,
  artifactCount: z.number().int().nonnegative(),
  exclusionCount: z.number().int().nonnegative(),
});

export const CampaignAuditManifestSchema = z.object({
  schemaVersion: z.literal(1),
  toolVersion: z.string().min(1),
  source: z.object({
    pin: z.string().regex(/^[a-f0-9]{40}$/),
    checkout: z
      .string()
      .regex(/^[a-f0-9]{40}$/)
      .optional(),
    clean: z.boolean().optional(),
  }),
  inventory: z.object({
    checksum: Sha256Schema,
    snapshotChecksum: Sha256Schema.optional(),
    sourceCommit: z
      .string()
      .regex(/^[a-f0-9]{40}$/)
      .optional(),
  }),
  bundles: z.array(CampaignBundleManifestEntrySchema),
  counts: z.object({
    inventoryEntries: z.number().int().nonnegative(),
    includedSources: z.number().int().nonnegative(),
    structuredSources: z.number().int().nonnegative(),
    chapterSources: z.number().int().nonnegative(),
    excludedSources: z.number().int().nonnegative(),
    definitiveBundles: z.number().int().nonnegative(),
    artifactRecords: z.number().int().nonnegative(),
    exclusionRecords: z.number().int().nonnegative(),
  }),
  findings: z.array(CampaignFindingSchema),
});

export type CampaignAuditManifest = z.infer<typeof CampaignAuditManifestSchema>;
export type CampaignFinding = z.infer<typeof CampaignFindingSchema>;
