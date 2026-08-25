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
    expect(tiers[0]?.data.damage?.characteristicOptions).toEqual(['M']);
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
    const powerRoll = parse.clauses.find((clause) => clause.kind === 'power-roll');
    expect(powerRoll?.bonus).toBe('Might');
    const header = parse.clauses.find((clause) => clause.kind === 'ability-header');
    expect(header?.keywords).toEqual(['Melee', 'Strike', 'Weapon']);
    expect(header?.actionType).toBe('Main action');
    expect(header?.distance).toBe('Melee 1');
    // The self-damage Effect line is fully retained but not guessed into an
    // automatic operation: it resolves as a verbatim table directive.
    const effect = parse.clauses.find((clause) => clause.kind === 'effect');
    expect(effect?.data.resolution).toEqual({ kind: 'table' });
    expect(parse.residue).toEqual([]);
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

  it('keeps Styrich alternative outcomes out of the flat tier schema', async () => {
    const styrich = parseEffectText(
      await ingestText('en/books/monsters/md/monster/demon/3rd-echelon/statblock/styrich.md'),
    );
    const tangledNest = styrich.residue.flatMap((item) => item.span.text.split('\n'));
    expect(tangledNest.some((line) => line.includes('Slowed') && line.includes('(EoT) or'))).toBe(
      true,
    );
    expect(
      tangledNest.some((line) => line.includes('Restrained') && line.includes('(EoT) or')),
    ).toBe(true);
    expect(
      auditGrammarConservation(
        await ingestText('en/books/monsters/md/monster/demon/3rd-echelon/statblock/styrich.md'),
        styrich,
      ),
    ).toEqual([]);
  });

  it('compiles only exact Effect forms and preserves bespoke prose verbatim', async () => {
    const directDamage = parseEffectText(
      await ingestText('en/books/heroes/md/project/imbue-treasure.md'),
    ).clauses.find((clause) => clause.kind === 'effect');
    expect(directDamage?.data).toEqual({
      sourceText: 'The target takes 5 damage.',
      canonRefs: [],
      resolution: { kind: 'damage', amount: 5, damageType: null },
    });
    if (!directDamage || directDamage.kind !== 'effect') throw new Error('missing direct Effect');
    const trailingSpaces = parseEffectText(`**Effect:** ${directDamage.data.sourceText}  \n`);
    const trailingEffect = trailingSpaces.clauses.find((clause) => clause.kind === 'effect');
    expect(trailingEffect?.data.sourceText).toBe(`${directDamage.data.sourceText}  `);
    expect(trailingEffect?.data.resolution).toEqual({
      kind: 'damage',
      amount: 5,
      damageType: null,
    });
    const indentedCode = parseEffectText(`    **Effect:** ${directDamage.data.sourceText}\n`);
    expect(indentedCode.clauses.some((clause) => clause.kind === 'effect')).toBe(false);
    expect(indentedCode.residue).toHaveLength(1);

    const bugbear = parseEffectText(
      await ingestText('en/books/monsters/md/monster/bugbear/statblock/bugbear-channeler.md'),
    ).clauses.filter((clause) => clause.kind === 'effect');
    const grabbed = bugbear.find((clause) => clause.data.sourceText.includes('by the channeler.'));
    expect(grabbed?.data.resolution).toEqual({
      kind: 'condition',
      conditionId: 'mcdm.heroes.v1/condition/grabbed',
      ending: 'external',
      replacesOnNewSource: false,
    });
    if (!grabbed) throw new Error('missing grabbed Effect');
    const grabbedWithTail = parseEffectText(
      `**Effect:** ${grabbed.data.sourceText.slice(0, -1)}, x.\n`,
    ).clauses.find((clause) => clause.kind === 'effect');
    expect(grabbedWithTail?.data.resolution).toEqual({ kind: 'table' });

    const bloodForBlood = parseEffectText(
      await ingestText('en/books/heroes/md/feature/ability/fury/level-1/blood-for-blood.md'),
    ).clauses.find((clause) => clause.kind === 'effect');
    expect(bloodForBlood?.data.resolution).toEqual({ kind: 'table' });
    expect(bloodForBlood?.data.sourceText).toBe(
      'You can deal 1d6 damage to yourself to deal an extra 1d6 damage to the target.',
    );
  });

  it('keeps choice branches as residue after routing their Effect introduction', async () => {
    const text = await ingestText('en/books/heroes/md/title/battlefield-commander.md');
    const parse = parseEffectText(text);
    const effect = parse.clauses.find((clause) => clause.kind === 'effect');
    expect(effect?.data).toEqual({
      sourceText: 'Choose one of the following benefits:',
      canonRefs: [],
      resolution: { kind: 'table' },
    });
    expect(parse.residue.some((item) => item.span.text.includes('- '))).toBe(true);
    expect(auditGrammarConservation(text, parse)).toEqual([]);
  });
});

describe('tier payload strict tail (whole-payload exactness)', () => {
  // Verbatim corpus bullets that the count-based tail check silently
  // mis-parsed before 2026-08-25 — each must now fail to residue whole.
  const LOSSY_LINES = [
    // dwarf-launcher: forced movement AND the M < 1 potency gate swallowed.
    '- **≤11:** 6 damage; [push](scc.v1:mcdm.heroes.v1/movement/forced-movement) 3; M < 1 [slowed](scc.v1:mcdm.heroes.v1/condition/slowed) (save ends)',
    // count-rhodar Sanguine Mist: explicit end-of-encounter duration dropped.
    '- **≤11:** 16 corruption damage; the target is [bleeding](scc.v1:mcdm.heroes.v1/condition/bleeding) until the end of the encounter',
    // werewolf: "the target gains 1 rage" swallowed.
    '- **≤11:** 11 damage; the target gains 1 rage; M < 2 [bleeding](scc.v1:mcdm.heroes.v1/condition/bleeding) (save ends)',
    // servok-miner: mid-payload "(save ends)" applies to restrained only —
    // mixed per-condition endings are not representable, so the line stays
    // verbatim rather than compiling with a silently dropped ending.
    '- **≤11:** 13 damage; M < 2 [restrained](scc.v1:mcdm.heroes.v1/condition/restrained) (save ends) and [prone](scc.v1:mcdm.heroes.v1/condition/prone)',
  ];

  it('fails payloads that say more than the grammar reads', () => {
    for (const line of LOSSY_LINES) {
      const parse = parseEffectText(`${line}\n`);
      expect(
        parse.clauses.find((clause) => clause.kind === 'tier-outcome'),
        line,
      ).toBeUndefined();
    }
  });

  it('still parses exact whole payloads', () => {
    // Verbatim devil-adjudicator bullet: damage + potency-gated condition
    // whose tail is exactly the linked label, ending as a whole-payload
    // suffix.
    const clean =
      '- **≤11:** 10 fire damage; I < 1 [frightened](scc.v1:mcdm.heroes.v1/condition/frightened) (save ends)';
    const parse = parseEffectText(`${clean}\n`);
    const tier = parse.clauses.find((clause) => clause.kind === 'tier-outcome');
    expect(tier?.kind).toBe('tier-outcome');
    if (tier?.kind === 'tier-outcome') {
      expect(tier.data.damage?.amount).toBe(10);
      expect(tier.data.damage?.typeOptions).toEqual(['fire']);
      expect(tier.data.potency).toEqual({ characteristic: 'I', threshold: '1' });
      expect(tier.data.conditionIds).toEqual(['mcdm.heroes.v1/condition/frightened']);
      expect(tier.data.ending).toBe('save-ends');
    }
  });
});

describe('characteristic-test effect form [R-0006, R-0007]', () => {
  it('recognizes the anchored test payload', () => {
    const parse = parseEffectText('**Effect:** The target makes a Presence test.\n');
    const effect = parse.clauses.find((clause) => clause.kind === 'effect');
    expect(effect?.kind === 'effect' && effect.data.resolution).toEqual({
      kind: 'test',
      characteristic: 'presence',
      subject: 'the-target',
    });
    const bold = parseEffectText('> **Effect:** Each target makes a **Might test**.\n');
    const boldEffect = bold.clauses.find((clause) => clause.kind === 'effect');
    expect(boldEffect?.kind === 'effect' && boldEffect.data.resolution).toEqual({
      kind: 'test',
      characteristic: 'might',
      subject: 'each-target',
    });
  });

  it('keeps verbatim corpus outliers with riders or extra sentences as table', () => {
    // Verbatim family outliers from the accepted pin — each says more than
    // the anchored form and must stay a table directive.
    const outliers = [
      '**Effect:** Dorzinuuth lets loose a powerful roar. Each target makes a **Reason test**.\n',
      '**Effect:** The target makes a **Might test**. A target with fire immunity automatically obtains a tier 3 outcome.\n',
      '**Effect:** Each target makes a test using their highest characteristic.\n',
    ];
    for (const line of outliers) {
      const parse = parseEffectText(line);
      const effect = parse.clauses.find((clause) => clause.kind === 'effect');
      expect(effect?.kind === 'effect' && effect.data.resolution, line).toEqual({ kind: 'table' });
    }
  });
});
