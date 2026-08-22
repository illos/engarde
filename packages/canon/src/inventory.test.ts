import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildCorpusInventory } from './inventory.js';
import type { SourceLock } from './schemas.js';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true })));
});

async function fixtureRoot(category = 'rule', includeJson = true): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'engarde-canon-inventory-'));
  temporaryRoots.push(root);
  const markdownDirectory = join(root, 'en/books/heroes/md', category);
  const jsonDirectory = join(root, 'en/books/heroes/json', category);
  await mkdir(markdownDirectory, { recursive: true });
  await mkdir(jsonDirectory, { recursive: true });
  await writeFile(
    join(markdownDirectory, 'example.md'),
    '---\nname: Example\nscc: example/rule\ntype: rule\n---\n\nText.\n',
  );
  if (includeJson) {
    await writeFile(
      join(jsonDirectory, 'example.json'),
      JSON.stringify({ name: 'Example', scc: 'example/rule', type: 'rule' }),
    );
  }
  return root;
}

function lock(categories: SourceLock['books'][number]['categories']): SourceLock {
  return {
    schemaVersion: 1,
    source: 'steelcompendium-data-unified',
    remote: 'https://example.com/source.git',
    commit: 'a'.repeat(40),
    tag: 'fixture',
    commitDate: '2026-08-03T10:39:51-04:00',
    books: [
      {
        id: 'heroes',
        disposition: 'include',
        reason: 'fixture',
        categories,
      },
    ],
  };
}

describe('corpus inventory', () => {
  it('pairs Markdown and JSON and applies an explicit category disposition', async () => {
    const root = await fixtureRoot();
    const inventory = await buildCorpusInventory(root, lock({ rule: 'structured' }));

    expect(inventory.entries).toHaveLength(1);
    expect(inventory.entries[0]).toMatchObject({
      category: 'rule',
      disposition: 'structured',
      findings: [],
    });
  });

  it('fails closed for unknown categories and missing pairs', async () => {
    const root = await fixtureRoot('new-category', false);
    const inventory = await buildCorpusInventory(root, lock({ rule: 'structured' }));

    expect(inventory.entries[0]?.findings.map((finding) => finding.code)).toEqual([
      'unknown-category',
      'missing-json-pair',
    ]);
  });
});
