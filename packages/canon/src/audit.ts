import { scanSourceLines, sha256 } from './bytes.js';
import { type ExtractionBundle, ExtractionBundleSchema } from './schemas.js';

export interface AuditResult {
  ok: boolean;
  errors: string[];
  artifactCount: number;
  exclusionCount: number;
}

export function auditExtractionBundle(
  source: Buffer,
  input: ExtractionBundle,
  auxiliarySourceBytes?: ReadonlyMap<string, Buffer>,
): AuditResult {
  const bundle = ExtractionBundleSchema.parse(input);
  const errors: string[] = [];
  const records = [...bundle.records].sort(
    (left, right) => left.source.span.byteStart - right.source.span.byteStart,
  );

  if (bundle.source.bytes !== source.length) errors.push('source byte length changed');
  if (bundle.source.sha256 !== sha256(source)) errors.push('source checksum changed');
  const auxiliaryPaths = new Set<string>();
  for (const auxiliary of bundle.source.auxiliarySources) {
    if (auxiliaryPaths.has(auxiliary.path))
      errors.push(`duplicate auxiliary source: ${auxiliary.path}`);
    auxiliaryPaths.add(auxiliary.path);
    const bytes = auxiliarySourceBytes?.get(auxiliary.path);
    if (auxiliarySourceBytes && !bytes) {
      errors.push(`${auxiliary.path}: auxiliary source was not supplied to the audit`);
    }
    if (bytes && sha256(bytes) !== auxiliary.sha256) {
      errors.push(`${auxiliary.path}: auxiliary source checksum changed`);
    }
  }

  let expectedStart = 0;
  const ids = new Set<string>();
  const lines = scanSourceLines(source);
  for (const record of records) {
    const { span } = record.source;
    if (ids.has(record.id)) errors.push(`duplicate record id: ${record.id}`);
    ids.add(record.id);
    if (record.source.path !== bundle.source.path)
      errors.push(`${record.id}: source path mismatch`);
    if (record.source.fileSha256 !== bundle.source.sha256) {
      errors.push(`${record.id}: file checksum mismatch`);
    }
    if (span.byteStart !== expectedStart) {
      errors.push(
        `${record.id}: expected byte ${expectedStart}, found ${span.byteStart} (gap or overlap)`,
      );
    }
    const spanBytes = source.subarray(span.byteStart, span.byteEnd);
    if (record.source.spanSha256 !== sha256(spanBytes)) {
      errors.push(`${record.id}: span checksum mismatch`);
    }
    if (record.version !== record.source.spanSha256) {
      errors.push(`${record.id}: version is not the span checksum`);
    }
    if (record.recordKind === 'artifact' && !spanBytes.equals(Buffer.from(record.text, 'utf8'))) {
      errors.push(`${record.id}: artifact text is not byte-equal to its source span`);
    }
    if (record.recordKind === 'artifact') {
      if (
        JSON.stringify(record.auxiliarySources) !== JSON.stringify(bundle.source.auxiliarySources)
      ) {
        errors.push(`${record.id}: auxiliary provenance differs from its bundle`);
      }
      const structuredSource = record.auxiliarySources[0];
      const structuredBytes = structuredSource
        ? auxiliarySourceBytes?.get(structuredSource.path)
        : undefined;
      if (structuredBytes) {
        try {
          const decoded: unknown = JSON.parse(structuredBytes.toString('utf8'));
          if (JSON.stringify(decoded) !== JSON.stringify(record.structuredData)) {
            errors.push(`${record.id}: structured data differs from its auxiliary source`);
          }
        } catch {
          errors.push(`${record.id}: auxiliary structured source is not valid JSON`);
        }
      }
    }
    const firstLine = lines.find((line) => span.byteStart < line.byteEnd);
    const lastLine = lines.find((line) => span.byteEnd - 1 < line.byteEnd);
    if (firstLine?.number !== span.lineStart || lastLine?.number !== span.lineEnd) {
      errors.push(`${record.id}: human line coordinates do not match byte coordinates`);
    }
    expectedStart = span.byteEnd;
  }

  if (expectedStart !== source.length) {
    errors.push(`partition ends at byte ${expectedStart}, source ends at ${source.length}`);
  }

  return {
    ok: errors.length === 0,
    errors,
    artifactCount: records.filter((record) => record.recordKind === 'artifact').length,
    exclusionCount: records.filter((record) => record.recordKind === 'exclusion').length,
  };
}
