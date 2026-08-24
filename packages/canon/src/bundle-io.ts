import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { type ArtifactRecord, ExtractionBundleSchema } from './schemas.js';

/** Shared bundle-store reading for the corpus and play CLIs. */

export async function listBundleFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile() && entry.name.endsWith('.bundle.json')) files.push(path);
    }
  }
  await visit(root);
  return files.sort();
}

export async function loadArtifactRecords(roots: readonly string[]): Promise<ArtifactRecord[]> {
  const artifacts: ArtifactRecord[] = [];
  for (const root of roots) {
    for (const file of await listBundleFiles(root)) {
      const parsed = ExtractionBundleSchema.parse(JSON.parse(await readFile(file, 'utf8')));
      for (const record of parsed.records) {
        if (record.recordKind === 'artifact') artifacts.push(record);
      }
    }
  }
  return artifacts;
}
