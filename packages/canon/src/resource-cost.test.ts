import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseResourceCostValue } from '@engarde/engine';
import { describe, expect, it } from 'vitest';
import { annotateHeaderCosts } from './action-cost.js';
import { compileAbilities, compileEffectPrograms } from './effect-conformance.js';
import { parseEffectText } from './effect-grammar.js';
import { resourceCostFromNameLine, resourceCostOfRecord } from './resource-cost.js';
import { CampaignAuditManifestSchema, ExtractionBundleSchema } from './schemas.js';

/**
 * Printed resource-cost carry slot (ROAD-0005 generalizing seam #1) —
 * CARRY-ONLY: the slot records what the book prints; no debit semantics
 * are implied or tested here. Unit cases quote verbatim corpus payloads
 * inline; corpus-gated cases sweep the pinned bundle artifacts — nothing
 * here is invented rule content.
 */

const BUNDLE_ROOT = resolve(import.meta.dirname, '../../../.artifacts/canon/bundles/en');

describe('parseResourceCostValue (closed measured vocabulary)', () => {
  it('parses the flat printed forms across the resource vocabulary', () => {
    // Verbatim frontmatter cost fields: fury blood-for-blood, conduit /
    // talent / null ability costs, polder trait purchase costs.
    expect(parseResourceCostValue('5 Ferocity')).toEqual({
      amount: 5,
      resource: 'ferocity',
      openEnded: false,
      per: null,
      forQuantity: null,
      sourceText: '5 Ferocity',
    });
    expect(parseResourceCostValue('9 Piety')?.resource).toBe('piety');
    expect(parseResourceCostValue('5 Clarity')?.resource).toBe('clarity');
    expect(parseResourceCostValue('5 Discipline')?.resource).toBe('discipline');
    expect(parseResourceCostValue('3 Malice')?.amount).toBe(3);
    // Ancestry trait purchase costs print "1 Point" / "2 Points"; the
    // plural folds onto the same enum member.
    expect(parseResourceCostValue('1 Point')?.resource).toBe('point');
    expect(parseResourceCostValue('2 Points')).toMatchObject({ amount: 2, resource: 'point' });
    // Summoner frontmatter prints lowercase "essence"; case folds.
    expect(parseResourceCostValue('5 Essence')?.resource).toBe('essence');
  });

  it('parses the open-ended N+ form with the printed minimum', () => {
    // Verbatim: summoner Call Forth name parenthetical.
    expect(parseResourceCostValue('1+ Essence')).toMatchObject({
      amount: 1,
      resource: 'essence',
      openEnded: true,
    });
    // Verbatim: goblin Malicious Strike name parenthetical.
    expect(parseResourceCostValue('5+ Malice')).toMatchObject({
      amount: 5,
      resource: 'malice',
      openEnded: true,
    });
  });

  it('parses the per-unit pricing forms from the closed measured set', () => {
    // Verbatim summoner frontmatter cost fields.
    expect(parseResourceCostValue('1 essence per minion summoned')).toMatchObject({
      amount: 1,
      resource: 'essence',
      per: 'minion summoned',
    });
    expect(parseResourceCostValue('1 Malice per minion summoned')?.per).toBe('minion summoned');
    // Verbatim monster-book name parentheticals.
    expect(parseResourceCostValue('1 Malice per target')?.per).toBe('target');
    expect(parseResourceCostValue('1 Malice per minion')?.per).toBe('minion');
  });

  it('parses the bulk "for <count> <unit>" pricing forms', () => {
    // Verbatim summoner frontmatter cost fields.
    expect(parseResourceCostValue('3 essence for two minions')).toMatchObject({
      amount: 3,
      resource: 'essence',
      forQuantity: { count: 2, unit: 'minion' },
    });
    expect(parseResourceCostValue('9 essence for one champion')?.forQuantity).toEqual({
      count: 1,
      unit: 'champion',
    });
    expect(parseResourceCostValue('6 Malice for one minion')?.forQuantity).toEqual({
      count: 1,
      unit: 'minion',
    });
  });

  it('parses "1 Eidos" as a VALUE while the action-cost cell stays frozen residue', () => {
    // "1 Eidos" is printed as the action-cost cell of four summoner
    // champion stat blocks. The cell is frozen action-cost residue pending
    // ruling R-0046 (action-cost.test.ts I-4 sweep) and is deliberately
    // NOT routed through this parser anywhere — this case documents that
    // resolving R-0046 is a wiring change, not a vocabulary change.
    expect(parseResourceCostValue('1 Eidos')).toMatchObject({ amount: 1, resource: 'eidos' });
  });

  it('refuses range labels and unmeasured forms — residue, never a guess', () => {
    // Verbatim: "Prior Malice Features (3-7 Malice)" section labels — a
    // range names a feature-list span, not one ability's cost.
    expect(parseResourceCostValue('3-7 Malice')).toBeNull();
    expect(parseResourceCostValue('2-7+ Malice')).toBeNull();
    expect(parseResourceCostValue('5 Stamina')).toBeNull(); // not a cost resource
    expect(parseResourceCostValue('Main action')).toBeNull();
    expect(parseResourceCostValue('4 Malice for four minions')).toBeNull(); // unmeasured count word
    expect(parseResourceCostValue(null)).toBeNull();
  });
});

describe('resourceCostFromNameLine (cost-candidate gate)', () => {
  it('carries the cost from a linked malice-feature name line', () => {
    // Verbatim: lizardfolk-malice Net Trap name line.
    const carry = resourceCostFromNameLine(
      '> 🔳 **Net Trap (3 [Malice](scc.v1:mcdm.monsters.v1/rule.monster/malice))**',
    );
    expect(carry.resourceCost).toMatchObject({ amount: 3, resource: 'malice' });
    expect(carry.resourceCostResidue).toBeNull();
  });

  it('carries nothing from a non-cost parenthetical (no resource word)', () => {
    // Verbatim: vampire-lord Sacrifice name line — "(Villain Action 3)" is
    // action economy, not a resource cost.
    const carry = resourceCostFromNameLine(
      '> ☠️ **Sacrifice ([Villain Action](scc.v1:mcdm.monsters.v1/rule.monster/villain-action) 3)**',
    );
    expect(carry).toEqual({ resourceCost: null, resourceCostResidue: null });
  });

  it('refuses a cost-shaped range parenthetical as residue with the verbatim text', () => {
    // Verbatim shape: the monster-book "Prior Malice Features" section labels.
    const carry = resourceCostFromNameLine(
      '**Prior Malice Features (3-7 [Malice](scc.v1:mcdm.monsters.v1/rule.monster/malice))**',
    );
    expect(carry.resourceCost).toBeNull();
    expect(carry.resourceCostResidue).toContain('"3-7 Malice"');
  });

  it('carries nothing from a name line without a parenthetical', () => {
    expect(resourceCostFromNameLine('**Wave of Blood:**')).toEqual({
      resourceCost: null,
      resourceCostResidue: null,
    });
    expect(resourceCostFromNameLine(null)).toEqual({
      resourceCost: null,
      resourceCostResidue: null,
    });
  });
});

describe('resourceCostOfRecord (adapter metadata carriers)', () => {
  it('carries the frontmatter cost field', () => {
    // Verbatim: fury blood-for-blood frontmatter.
    const carry = resourceCostOfRecord({
      sourceMetadata: { cost: '5 Ferocity' },
      structuredData: {},
    });
    expect(carry.resourceCost).toMatchObject({ amount: 5, resource: 'ferocity' });
  });

  it('falls back to the printed name parenthetical when no cost field exists', () => {
    // Verbatim: summoner Call Forth carries its cost only in the name.
    const carry = resourceCostOfRecord({
      sourceMetadata: { name: 'Call Forth (1+ Essence)' },
      structuredData: {},
    });
    expect(carry.resourceCost).toMatchObject({
      amount: 1,
      resource: 'essence',
      openEnded: true,
    });
  });

  it('carries nothing from a section-label name that fails the candidate gate', () => {
    // Verbatim: the malice chapter labels are organization, not costs —
    // no leading digit, so they are not cost candidates.
    const carry = resourceCostOfRecord({
      sourceMetadata: { name: 'Undead Malice (Level 4+ Malice Features)' },
      structuredData: {},
    });
    expect(carry).toEqual({ resourceCost: null, resourceCostResidue: null });
  });

  it('reports a declared cost field the closed grammar refuses as residue', () => {
    // A cost FIELD is always a declared cost: refusal is residue even
    // without the candidate gate. (Synthetic value — no such field exists
    // at the accepted pin; the corpus sweep below freezes that fact.)
    const carry = resourceCostOfRecord({
      sourceMetadata: { cost: 'one Malice' },
      structuredData: {},
    });
    expect(carry.resourceCost).toBeNull();
    expect(carry.resourceCostResidue).toContain('"one Malice"');
  });
});

describe.skipIf(!existsSync(BUNDLE_ROOT))('carry against the pinned bundle', () => {
  function artifactText(relativeBundlePath: string, artifactId: string): string {
    const bundle = JSON.parse(readFileSync(resolve(BUNDLE_ROOT, relativeBundlePath), 'utf8')) as {
      records: Array<{ recordKind: string; id: string; text?: string }>;
    };
    const record = bundle.records.find(
      (candidate) => candidate.recordKind === 'artifact' && candidate.id === artifactId,
    );
    if (!record?.text) throw new Error(`artifact ${artifactId} not found in ${relativeBundlePath}`);
    return record.text;
  }

  it('compiles lizardfolk Net Trap with its printed 3-Malice cost carried', () => {
    const text = artifactText(
      'books/monsters/md/monster/lizardfolk/lizardfolk-malice.bundle.json',
      'mcdm.monsters.v1/monster.lizardfolk/lizardfolk-malice',
    );
    const parse = parseEffectText(text);
    const programs = compileEffectPrograms(
      parse,
      'mcdm.monsters.v1/monster.lizardfolk/lizardfolk-malice',
    );
    const netTrap = programs.find((program) =>
      program.sourceText.startsWith('A lizardfolk acting this turn sets up a net trap'),
    );
    expect(netTrap).toBeDefined();
    expect(netTrap?.resourceCost).toMatchObject({
      amount: 3,
      resource: 'malice',
      openEnded: false,
      per: null,
      forQuantity: null,
    });
    expect(netTrap?.resourceCostResidue).toBeNull();
    // The carry slot changes NOTHING about the action economy: Net Trap's
    // printed Maneuver cost still compiles exactly as before.
    expect(netTrap?.actionCost).toBe('maneuver');
  });

  it('freezes printed resource-cost carry coverage across the whole accepted pin', () => {
    // The seam-wide honest baseline, measured 2026-08-30 at the accepted
    // pin (the same 3,785-artifact sweep as the action-cost I-4 freeze,
    // whose 588/1,765 compiled-shape counts and four frozen "1 Eidos"
    // action-cost residues are asserted in action-cost.test.ts and are
    // untouched by this seam):
    // - name-line carriers annotate 305 header-backed shapes, all malice
    //   (5 open-ended `N+`, 2 per-unit — "per target" / "per minion");
    // - those annotations flow onto 71 compiled abilities + 266 compiled
    //   Effect programs (programs under one header each carry its cost);
    // - record metadata carries 511 costs across eleven printed resources;
    // - ZERO carry residue anywhere: every cost-shaped printed parenthetical
    //   and every declared cost field at this pin parses onto the closed
    //   grammar. A pin bump that prints a new cost form breaks this loudly
    //   instead of silently dropping a printed cost.
    const manifestPath = resolve(
      import.meta.dirname,
      '../../../.artifacts/canon/campaign/accepted/final-campaign-manifest.json',
    );
    const manifest = CampaignAuditManifestSchema.parse(
      JSON.parse(readFileSync(manifestPath, 'utf8')),
    );
    const annotatedByResource: Record<string, number> = {};
    let annotatedOpenEnded = 0;
    let annotatedPerUnit = 0;
    const compiledByResource: Record<string, number> = {};
    let abilitiesWithCost = 0;
    let programsWithCost = 0;
    const recordByResource: Record<string, number> = {};
    const residues: string[] = [];
    for (const entry of manifest.bundles) {
      const bundle = ExtractionBundleSchema.parse(
        JSON.parse(readFileSync(resolve(entry.bundlePath), 'utf8')),
      );
      for (const record of bundle.records) {
        if (record.recordKind !== 'artifact') continue;
        const recordCarry = resourceCostOfRecord(record);
        if (recordCarry.resourceCost) {
          const key = recordCarry.resourceCost.resource;
          recordByResource[key] = (recordByResource[key] ?? 0) + 1;
        }
        if (recordCarry.resourceCostResidue) {
          residues.push(`${record.id}: ${recordCarry.resourceCostResidue}`);
        }
        const parse = parseEffectText(record.text);
        for (const annotation of annotateHeaderCosts(parse, record.id).values()) {
          if (annotation.resourceCost) {
            const key = annotation.resourceCost.resource;
            annotatedByResource[key] = (annotatedByResource[key] ?? 0) + 1;
            if (annotation.resourceCost.openEnded) annotatedOpenEnded += 1;
            if (annotation.resourceCost.per !== null) annotatedPerUnit += 1;
          }
          if (annotation.resourceCostResidue) {
            residues.push(`${record.id}: ${annotation.resourceCostResidue}`);
          }
        }
        const { abilities } = compileAbilities(parse, record.id);
        for (const ability of abilities) {
          if (ability.resourceCost) {
            const key = ability.resourceCost.resource;
            compiledByResource[key] = (compiledByResource[key] ?? 0) + 1;
            abilitiesWithCost += 1;
          }
          if (ability.resourceCostResidue) {
            residues.push(`${record.id}: ${ability.resourceCostResidue}`);
          }
        }
        for (const program of compileEffectPrograms(parse, record.id)) {
          if (program.resourceCost) {
            const key = program.resourceCost.resource;
            compiledByResource[key] = (compiledByResource[key] ?? 0) + 1;
            programsWithCost += 1;
          }
          if (program.resourceCostResidue) {
            residues.push(`${record.id}#${program.effectOrdinal}: ${program.resourceCostResidue}`);
          }
        }
      }
    }
    expect(annotatedByResource).toEqual({ malice: 305 });
    expect(annotatedOpenEnded).toBe(5);
    expect(annotatedPerUnit).toBe(2);
    expect(abilitiesWithCost).toBe(71);
    expect(programsWithCost).toBe(266);
    expect(compiledByResource).toEqual({ malice: 337 });
    expect(recordByResource).toEqual({
      clarity: 46,
      discipline: 45,
      drama: 40,
      essence: 86,
      ferocity: 38,
      focus: 38,
      insight: 40,
      malice: 14,
      piety: 57,
      point: 68,
      wrath: 39,
    });
    expect(residues).toEqual([]);
  });
});
