import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { auditGrammarConservation, parseEffectText } from './effect-grammar.js';
import { ingestStructuredRecord } from './extract.js';

/**
 * Unit tests use content-neutral strings (no rule prose); the real grammar
 * behavior is proven against the actual corpus abilities in the corpus-gated
 * suite below (prime directive: fixtures are real records, never invented).
 */

describe('full-consumption accounting', () => {
  it('routes unrecognized text to residue and conserves every byte', () => {
    const text = 'x line one\nx line two\n';
    const parse = parseEffectText(text);
    expect(parse.clauses).toHaveLength(0);
    expect(parse.residue).toHaveLength(1);
    expect(parse.stats.residueBytes).toBe(parse.stats.totalBytes);
    expect(auditGrammarConservation(text, parse)).toEqual([]);
  });

  it('conserves mixed recognized and unrecognized lines, multi-byte safe', () => {
    const text = '*x*\n\nx unrecognized ✶ text\n';
    const parse = parseEffectText(text);
    expect(parse.clauses.map((clause) => clause.kind)).toEqual(['flavor', 'whitespace']);
    expect(parse.residue).toHaveLength(1);
    expect(auditGrammarConservation(text, parse)).toEqual([]);
  });

  it('handles empty text', () => {
    const parse = parseEffectText('');
    expect(auditGrammarConservation('', parse)).toEqual([]);
  });
});

const sourceRoot = process.env.ENGARDE_CORPUS_ROOT
  ? resolve(process.env.ENGARDE_CORPUS_ROOT)
  : undefined;

const PILOT_ABILITIES = [
  'en/books/heroes/md/feature/ability/fury/level-1/blood-for-blood.md',
  'en/books/heroes/md/feature/ability/censor/level-2/sentenced.md',
  'en/books/heroes/md/feature/ability/tactician/level-1/mark.md',
  'en/books/heroes/md/feature/common/maneuvers/grab.md',
  'en/books/monsters/md/dynamic-terrain/environmental-hazards/toxic-plants.md',
];

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

describe.skipIf(!sourceRoot)('effect grammar over the pilot abilities', () => {
  it('conserves every byte of all five ability texts', async () => {
    for (const path of PILOT_ABILITIES) {
      const text = await ingestText(path);
      const parse = parseEffectText(text);
      expect(auditGrammarConservation(text, parse), path).toEqual([]);
    }
  });

  it('reads blood-for-blood tier outcomes: damage, potency, linked conditions, save ends', async () => {
    const text = await ingestText(
      'en/books/heroes/md/feature/ability/fury/level-1/blood-for-blood.md',
    );
    const parse = parseEffectText(text);
    const tiers = parse.clauses.filter((clause) => clause.kind === 'tier-outcome');
    expect(tiers).toHaveLength(3);
    expect(tiers.map((clause) => clause.data.band)).toEqual(['≤11', '12-16', '17+']);
    expect(tiers.map((clause) => clause.data.damage?.amount)).toEqual([4, 6, 10]);
    expect(tiers[0]?.data.damage?.characteristic).toBe('M');
    expect(tiers.map((clause) => clause.data.potency?.threshold)).toEqual([
      'WEAK',
      'AVERAGE',
      'STRONG',
    ]);
    for (const clause of tiers) {
      expect(clause.data.conditionIds).toEqual([
        'mcdm.heroes.v1/condition/bleeding',
        'mcdm.heroes.v1/condition/weakened',
      ]);
      expect(clause.data.ending).toBe('save-ends');
    }
    const header = parse.clauses.find((clause) => clause.kind === 'ability-header');
    expect(header?.keywords).toEqual(['Melee', 'Strike', 'Weapon']);
    expect(header?.actionType).toBe('Main action');
    expect(header?.distance).toBe('Melee 1');
    // The self-damage Effect line is explicit residue, not silently dropped.
    expect(parse.residue.length).toBeGreaterThan(0);
  });

  it('reads toxic-plants nested tier outcomes with numeric potency and no damage part', async () => {
    const text = await ingestText(
      'en/books/monsters/md/dynamic-terrain/environmental-hazards/toxic-plants.md',
    );
    const parse = parseEffectText(text);
    const tiers = parse.clauses.filter((clause) => clause.kind === 'tier-outcome');
    expect(tiers).toHaveLength(3);
    for (const clause of tiers) {
      expect(clause.data.damage).toBeNull();
      expect(clause.data.conditionIds).toEqual(['mcdm.heroes.v1/condition/dazed']);
      expect(clause.data.ending).toBe('save-ends');
    }
    expect(tiers.map((clause) => clause.data.potency?.threshold)).toEqual(['0', '1', '2']);
  });

  it('routes the whole grab lead-in and mark effect prose to residue', async () => {
    const grab = parseEffectText(
      await ingestText('en/books/heroes/md/feature/common/maneuvers/grab.md'),
    );
    expect(grab.clauses.filter((clause) => clause.kind !== 'whitespace')).toHaveLength(0);
    expect(grab.residue).toHaveLength(1);

    const mark = parseEffectText(
      await ingestText('en/books/heroes/md/feature/ability/tactician/level-1/mark.md'),
    );
    expect(mark.clauses.some((clause) => clause.kind === 'ability-header')).toBe(true);
    expect(mark.residue.length).toBeGreaterThan(0);
  });
});
