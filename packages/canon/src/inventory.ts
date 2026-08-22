import { readFile, readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { sha256 } from './bytes.js';
import { parseFrontmatter } from './frontmatter.js';
import type { CorpusInventory, InventoryEntry, SourceLock } from './schemas.js';

async function listFiles(root: string, extension: string): Promise<string[]> {
  const output: string[] = [];

  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    await Promise.all(
      entries.map(async (entry) => {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) await visit(path);
        else if (entry.isFile() && entry.name.endsWith(extension)) output.push(path);
      }),
    );
  }

  await visit(root);
  return output.sort();
}

function toSourcePath(root: string, path: string): string {
  return relative(root, path).split(sep).join('/');
}

function identityFromJson(value: unknown): { name?: unknown; scc?: unknown; type?: unknown } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  const metadata =
    typeof record.metadata === 'object' &&
    record.metadata !== null &&
    !Array.isArray(record.metadata)
      ? (record.metadata as Record<string, unknown>)
      : {};
  return {
    name: record.name ?? metadata.item_name,
    scc: metadata.scc ?? record.scc,
    type: metadata.type ?? record.type,
  };
}

function normalizeIdentity(value: unknown): unknown {
  return Array.isArray(value) && value.length === 1 ? value[0] : value;
}

export async function buildCorpusInventory(
  sourceRoot: string,
  lock: SourceLock,
): Promise<CorpusInventory> {
  const entries: InventoryEntry[] = [];

  for (const book of lock.books) {
    const markdownRoot = join(sourceRoot, 'en', 'books', book.id, 'md');
    const jsonRoot = join(sourceRoot, 'en', 'books', book.id, 'json');
    const markdownFiles = await listFiles(markdownRoot, '.md');
    const jsonFiles = await listFiles(jsonRoot, '.json');
    const jsonRelatives = new Set(jsonFiles.map((path) => toSourcePath(jsonRoot, path)));

    for (const markdownFile of markdownFiles) {
      const relativeMarkdown = toSourcePath(markdownRoot, markdownFile);
      const category = relativeMarkdown.split('/')[0] ?? '';
      const relativeJson = relativeMarkdown.replace(/\.md$/, '.json');
      const jsonFile = join(jsonRoot, relativeJson);
      const markdownPath = toSourcePath(sourceRoot, markdownFile);
      const jsonPath = toSourcePath(sourceRoot, jsonFile);
      const findings: InventoryEntry['findings'] = [];
      const configuredDisposition = book.categories[category];

      if (!configuredDisposition) {
        findings.push({
          severity: 'error',
          code: 'unknown-category',
          message: `${book.id}/${category} has no explicit disposition`,
        });
      }

      if (!jsonRelatives.delete(relativeJson)) {
        findings.push({
          severity: 'error',
          code: 'missing-json-pair',
          message: `${markdownPath} has no matching JSON record`,
        });
      }

      const markdown = await readFile(markdownFile);
      let metadata: Record<string, unknown> = {};
      try {
        metadata = parseFrontmatter(markdown).metadata;
      } catch (error) {
        findings.push({
          severity: 'error',
          code: 'invalid-frontmatter',
          message: error instanceof Error ? error.message : String(error),
        });
      }

      let json = Buffer.alloc(0);
      if (!findings.some((finding) => finding.code === 'missing-json-pair')) {
        json = await readFile(jsonFile);
        try {
          const identity = identityFromJson(JSON.parse(json.toString('utf8')));
          for (const field of ['name', 'scc'] as const) {
            const markdownValue = metadata[field];
            const jsonValue = identity[field];
            if (
              markdownValue !== undefined &&
              jsonValue !== undefined &&
              JSON.stringify(normalizeIdentity(markdownValue)) !==
                JSON.stringify(normalizeIdentity(jsonValue))
            ) {
              findings.push({
                severity: 'error',
                code: `identity-mismatch-${field}`,
                message: `${field} differs between ${markdownPath} and ${jsonPath}`,
              });
            }
          }
        } catch (error) {
          findings.push({
            severity: 'error',
            code: 'invalid-json',
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }

      entries.push({
        book: book.id,
        category,
        markdownPath,
        jsonPath,
        markdownSha256: sha256(markdown),
        jsonSha256: sha256(json),
        disposition:
          book.disposition === 'exclude' ? 'exclude' : (configuredDisposition ?? 'exclude'),
        findings,
      });
    }

    for (const unpairedJson of [...jsonRelatives].sort()) {
      const jsonFile = join(jsonRoot, unpairedJson);
      const json = await readFile(jsonFile);
      entries.push({
        book: book.id,
        category: unpairedJson.split('/')[0] ?? '',
        markdownPath: toSourcePath(
          sourceRoot,
          join(markdownRoot, unpairedJson.replace(/\.json$/, '.md')),
        ),
        jsonPath: toSourcePath(sourceRoot, jsonFile),
        markdownSha256: sha256(Buffer.alloc(0)),
        jsonSha256: sha256(json),
        disposition: 'exclude',
        findings: [
          {
            severity: 'error',
            code: 'missing-markdown-pair',
            message: `${unpairedJson} has no matching Markdown record`,
          },
        ],
      });
    }
  }

  entries.sort((left, right) => left.markdownPath.localeCompare(right.markdownPath));
  const snapshotMaterial = entries
    .map(
      (entry) =>
        `${entry.markdownPath}\0${entry.markdownSha256}\0${entry.jsonPath}\0${entry.jsonSha256}`,
    )
    .join('\n');

  return {
    schemaVersion: 1,
    sourceCommit: lock.commit,
    snapshotSha256: sha256(snapshotMaterial),
    entries,
  };
}
