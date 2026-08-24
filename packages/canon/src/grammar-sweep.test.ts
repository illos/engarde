import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ingestStructuredRecord } from './extract.js';
import { buildGrammarSweep, residueLineSignature } from './grammar-sweep.js';

/**
 * Unit tests use content-neutral strings (no rule prose); real sweep behavior
 * is proven against actual corpus abilities in the corpus-gated suite below
 * (prime directive: fixtures are real records, never invented).
 */

describe('residue line signatures', () => {
  it('normalizes digits inside bold labels and keeps the label verbatim', () => {
    expect(residueLineSignature('- **12-16:** x y z')).toBe('- **N-N:**');
    expect(residueLineSignature('**Xlabel:** some payload')).toBe('**Xlabel:**');
  });

  it('collapses bold names, keeping only a trailing parenthetical', () => {
    expect(residueLineSignature('> ⭐️ **Xname Yname (3 Zword)**')).toBe('⭐️ **… (N Zword)**');
    expect(residueLineSignature('**Xname Yname**')).toBe('**(name)**');
  });

  it('classifies structural shapes: tables, headings, lists, prose', () => {
    expect(residueLineSignature('| a | b |')).toBe('| table row |');
    expect(residueLineSignature('## Xheading')).toBe('## (heading)');
    expect(residueLineSignature('- plain item text')).toBe('- (list item prose)');
    expect(residueLineSignature('Xword: trailing prose')).toBe('Xword: (prose)');
    expect(residueLineSignature('plain prose line')).toBe('(prose)');
    expect(residueLineSignature('>')).toBe('(blank inside blockquote)');
  });

  it('strips scc links before matching', () => {
    expect(residueLineSignature('[x](scc.v1:a.b.v1/c/d): trailing')).toBe('(prose)');
  });
});

describe('sweep aggregation', () => {
  it('classifies artifact status and conserves counts across buckets', () => {
    const report = buildGrammarSweep([
      // fully residue → grammar-blocked
      { artifactId: 'a/x/one', bucket: 'alpha', text: 'x unrecognized line\n' },
      // flavor + whitespace only → automatic-now (nothing mechanical, nothing unread)
      { artifactId: 'a/x/two', bucket: 'alpha', text: '*x*\n\n' },
      // empty text → automatic-now
      { artifactId: 'a/y/three', bucket: 'beta', text: '' },
    ]);
    expect(report.headline.artifacts).toBe(3);
    expect(report.headline.byStatus['grammar-blocked']).toBe(1);
    expect(report.headline.byStatus['automatic-now']).toBe(2);
    expect(report.headline.conservationViolations).toBe(0);
    expect(report.buckets.map((bucket) => bucket.bucket)).toEqual(['alpha', 'beta']);
    expect(report.residuePatterns.totalLines).toBe(1);
    expect(report.residuePatterns.patterns[0]?.example.artifactId).toBe('a/x/one');
    // status counts always sum to the artifact count
    const sum = Object.values(report.headline.byStatus).reduce((a, b) => a + b, 0);
    expect(sum).toBe(report.headline.artifacts);
  });
});

const sourceRoot = process.env.ENGARDE_CORPUS_ROOT
  ? resolve(process.env.ENGARDE_CORPUS_ROOT)
  : undefined;

async function ingestText(markdownPath: string): Promise<string> {
  const jsonPath = markdownPath.replace('/md/', '/json/').replace(/\.md$/, '.json');
  const bundle = ingestStructuredRecord({
    markdownPath,
    markdown: await readFile(resolve(sourceRoot ?? '', markdownPath)),
    jsonPath,
    json: await readFile(resolve(sourceRoot ?? '', jsonPath)),
  });
  const artifact = bundle.records.find((record) => record.recordKind === 'artifact');
  if (!artifact || artifact.recordKind !== 'artifact') throw new Error('no artifact');
  return artifact.text;
}

describe.skipIf(!sourceRoot)('sweep over real corpus abilities', () => {
  it('blood-for-blood: the power-roll cluster mechanisms are shipped; Effect prose stays grammar-blocked', async () => {
    const text = await ingestText(
      'en/books/heroes/md/feature/ability/fury/level-1/blood-for-blood.md',
    );
    const report = buildGrammarSweep([
      {
        artifactId: 'mcdm.heroes.v1/feature.ability.fury.level-1/blood-for-blood',
        bucket: 'classes',
        text,
      },
    ]);
    expect(report.headline.conservationViolations).toBe(0);
    // The whole power-roll cluster is SHIPPED — nothing here is
    // mechanism-blocked any more; the Effect residue line still leaves the
    // ability grammar-blocked.
    const shipped = report.mechanisms.filter((entry) => entry.shipped).map((m) => m.mechanism);
    expect(shipped).toContain('potency resolution (SHIPPED: power-roll cluster)');
    expect(shipped).toContain('damage / Stamina application (SHIPPED: power-roll cluster)');
    expect(shipped).toContain('power roll resolution (SHIPPED: power-roll cluster)');
    expect(report.mechanisms.filter((entry) => !entry.shipped)).toEqual([]);
    expect(report.headline.byStatus['grammar-blocked']).toBe(1);
  });
});
