import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizeActionCostValue } from '@engarde/engine';
import { describe, expect, it } from 'vitest';
import { annotateHeaderCosts, classifyReactionInterception } from './action-cost.js';
import { compileAbilities, compileEffectPrograms } from './effect-conformance.js';
import { parseEffectText } from './effect-grammar.js';
import { CampaignAuditManifestSchema, ExtractionBundleSchema } from './schemas.js';

/**
 * R-0029 action-cost normalization + byte-defect repair, and the R-0031
 * deterministic interception-point templates. Corpus-gated cases load the
 * pinned bundle artifacts (verbatim bytes); unit cases quote verbatim
 * corpus payloads inline — nothing here is invented rule content.
 */

const BUNDLE_ROOT = resolve(import.meta.dirname, '../../../.artifacts/canon/bundles/en');

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

describe('normalizeActionCostValue (R-0029 surface vocabulary)', () => {
  it('folds the observed case/spelling variants onto the closed enum', () => {
    // The survey's observed vocabulary (part1_actionTypes distribution).
    expect(normalizeActionCostValue('Main action')?.cost).toBe('main-action');
    expect(normalizeActionCostValue('Main Action')?.cost).toBe('main-action');
    expect(normalizeActionCostValue('Maneuver')?.cost).toBe('maneuver');
    expect(normalizeActionCostValue('Triggered action')?.cost).toBe('triggered-action');
    expect(normalizeActionCostValue('Triggered Action')?.cost).toBe('triggered-action');
    expect(normalizeActionCostValue('Triggered')?.cost).toBe('triggered-action');
    expect(normalizeActionCostValue('Free triggered action')?.cost).toBe('free-triggered-action');
    expect(normalizeActionCostValue('Free triggered')?.cost).toBe('free-triggered-action');
    expect(normalizeActionCostValue('Free maneuver')?.cost).toBe('free-maneuver');
    expect(normalizeActionCostValue('No action')?.cost).toBe('no-action');
    expect(normalizeActionCostValue('Move')?.cost).toBe('move-action');
    expect(normalizeActionCostValue('Move action')?.cost).toBe('move-action');
    expect(normalizeActionCostValue('Move Action')?.cost).toBe('move-action');
  });

  it('routes the operator-paid siege-engine form and keeps operatorPays', () => {
    const normalized = normalizeActionCostValue('Main action (Adjacent creature)');
    expect(normalized).toEqual({ cost: 'main-action', operatorPays: true });
    expect(normalizeActionCostValue('Main action')?.operatorPays).toBe(false);
  });

  it('refuses unknown values — residue, never a guess', () => {
    expect(normalizeActionCostValue('Standard action')).toBeNull();
    expect(normalizeActionCostValue('-')).toBeNull(); // context-dependent, not a value
    expect(normalizeActionCostValue(null)).toBeNull();
  });
});

describe('classifyReactionInterception (R-0031 closed templates)', () => {
  it('classifies the damage-halver template to pre-application', () => {
    // Verbatim: talent Repel Effect head (feature/ability/talent/level-1/repel.md).
    const classified = classifyReactionInterception(
      '**Trigger:** The target takes damage or is force moved.\n\n**Effect:** The target takes half the triggering damage, or the distance of the triggering forced movement is reduced by a number of squares equal to your Reason score.',
    );
    expect(classified).toEqual({ point: 'pre-application', classified: true, sourceText: null });
  });

  it('classifies the tier-cut template to rolled', () => {
    // Verbatim: angulotl-daybringer Tongue Slap (monster/angulotl/statblock/angulotl-daybringer.md).
    const classified = classifyReactionInterception(
      "**Trigger:** The target makes a strike against the daybringer or an ally that isn't a critical hit.\n\n**Effect:** The outcome of the strike's power roll is reduced by one tier.",
    );
    expect(classified).toEqual({ point: 'rolled', classified: true, sourceText: null });
  });

  it('defaults an unclassified reaction to applied with the verbatim text carried', () => {
    // Verbatim: fury Lines of Force Effect head (feature/ability/fury/level-1/lines-of-force.md
    // shape) — no closed template covers forced-movement redirection yet.
    const text =
      '**Trigger:** The triggering creature or object is force moved.\n\n**Effect:** You can select a new target of the same type (creature or object) to be force moved instead, including the triggering creature.';
    const classified = classifyReactionInterception(text);
    expect(classified.point).toBe('applied');
    expect(classified.classified).toBe(false);
    expect(classified.sourceText).toBe(text);
  });
});

describe('dash-cell context resolution (R-0029)', () => {
  it('normalizes a dash under a Villain Action name line to villain-action', () => {
    // Verbatim shape: vampire-lord Sacrifice (monster/undead/3rd-echelon/statblock/vampire-lord.md).
    const text =
      '> ☠️ **Sacrifice ([Villain Action](scc.v1:mcdm.monsters.v1/rule.monster/villain-action) 3)**\n>\n> | **Magic, Ranged** |                   **-** |\n> |-------------------|------------------------:|\n> | **📏 Ranged 20**  | **🎯 Each chosen ally** |\n';
    const parse = parseEffectText(text);
    const annotations = [
      ...annotateHeaderCosts(
        parse,
        'mcdm.monsters.v1/monster.undead.3rd-echelon.statblock/vampire-lord',
      ).values(),
    ];
    expect(annotations).toHaveLength(1);
    expect(annotations[0]?.actionCost).toBe('villain-action');
    expect(annotations[0]?.actionCostResidue).toBeNull();
  });

  it('normalizes Wave of Blood (exact name line on the vampire lord) to no-action, never villain-action', () => {
    const text =
      '> **Wave of Blood:**\n>\n> | **Area, Magic** |                         **-** |\n> |-----------------|------------------------------:|\n> | **📏 20 burst** | **🎯 Each enemy in the area** |\n';
    const parse = parseEffectText(text);
    const annotations = [
      ...annotateHeaderCosts(
        parse,
        'mcdm.monsters.v1/monster.undead.3rd-echelon.statblock/vampire-lord',
      ).values(),
    ];
    expect(annotations).toHaveLength(1);
    expect(annotations[0]?.actionCost).toBe('no-action');
  });

  it('refuses the Wave of Blood shape on any OTHER artifact — residue, never a generalized ruling', () => {
    // R-0029 names Wave of Blood specifically (one artifact, one dash cell);
    // the same bold-colon shape elsewhere is a FUTURE dash that must refuse.
    const text =
      '> **Wave of Blood:**\n>\n> | **Area, Magic** |                         **-** |\n> |-----------------|------------------------------:|\n> | **📏 20 burst** | **🎯 Each enemy in the area** |\n';
    const parse = parseEffectText(text);
    const annotations = [
      ...annotateHeaderCosts(
        parse,
        'synthetic.test/monster.statblock/not-the-vampire-lord',
      ).values(),
    ];
    expect(annotations).toHaveLength(1);
    expect(annotations[0]?.actionCost).toBeNull();
    expect(annotations[0]?.actionCostResidue).toContain('dash action cell');
  });

  it('refuses a different bold-colon name line even on the vampire lord — exact match only', () => {
    // Synthetic name (not rulebook content): the exact-match resolver must
    // not treat "any bold-colon line on the vampire lord" as Wave of Blood.
    const text =
      '> **Synthetic Test Name:**\n>\n> | **Area, Magic** |                         **-** |\n> |-----------------|------------------------------:|\n> | **📏 20 burst** | **🎯 Each enemy in the area** |\n';
    const parse = parseEffectText(text);
    const annotations = [
      ...annotateHeaderCosts(
        parse,
        'mcdm.monsters.v1/monster.undead.3rd-echelon.statblock/vampire-lord',
      ).values(),
    ];
    expect(annotations).toHaveLength(1);
    expect(annotations[0]?.actionCost).toBeNull();
    expect(annotations[0]?.actionCostResidue).toContain('dash action cell');
  });

  it('leaves an uncontextualized dash as residue', () => {
    const text =
      'Some unrelated line.\n\n| **Magic** | **-** |\n|-----------|------:|\n| **📏 Ranged 5** | **🎯 One creature** |\n';
    const parse = parseEffectText(text);
    const annotations = [...annotateHeaderCosts(parse, 'synthetic.test/fixture').values()];
    expect(annotations).toHaveLength(1);
    expect(annotations[0]?.actionCost).toBeNull();
    expect(annotations[0]?.actionCostResidue).toContain('dash action cell');
  });
});

describe.skipIf(!existsSync(BUNDLE_ROOT))('byte-defect repair against the pinned bundle', () => {
  it('compiles gloom-dragon Absence of All Light with its printed villain-action cost', () => {
    const text = artifactText(
      'books/monsters/md/monster/dragon/statblock/gloom-dragon.bundle.json',
      'mcdm.monsters.v1/monster.dragon.statblock/gloom-dragon',
    );
    const parse = parseEffectText(text);
    const programs = compileEffectPrograms(
      parse,
      'mcdm.monsters.v1/monster.dragon.statblock/gloom-dragon',
    );
    const absence = programs.find((program) =>
      program.sourceText.startsWith('The dragon disappears from the encounter map.'),
    );
    expect(absence).toBeDefined();
    expect(absence?.actionCost).toBe('villain-action');
    expect(absence?.actionType).toBe('-');
  });

  it('compiles lizardfolk Net Trap with its printed Maneuver cost and keywords', () => {
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
    expect(netTrap?.actionCost).toBe('maneuver');
    expect(netTrap?.keywords).toEqual(['Area', 'Ranged', 'Weapon']);
  });

  it('keeps Wave of Blood free of the villain-action economy on the real vampire-lord', () => {
    const text = artifactText(
      'books/monsters/md/monster/undead/3rd-echelon/statblock/vampire-lord.bundle.json',
      'mcdm.monsters.v1/monster.undead.3rd-echelon.statblock/vampire-lord',
    );
    const parse = parseEffectText(text);
    const annotations = [
      ...annotateHeaderCosts(
        parse,
        'mcdm.monsters.v1/monster.undead.3rd-echelon.statblock/vampire-lord',
      ).values(),
    ];
    const villainCosts = annotations.filter(
      (annotation) => annotation.actionCost === 'villain-action',
    );
    const noCost = annotations.filter((annotation) => annotation.actionCost === 'no-action');
    // Three villain actions, once each; Wave of Blood rides as the one
    // no-cost sub-ability [R-0029]. No dash residue remains.
    expect(villainCosts).toHaveLength(3);
    expect(noCost.length).toBeGreaterThanOrEqual(1);
    // Every printed dash cell resolves by context — none is left as residue.
    // (The statblock's top stat table also parses as a header shape; its
    // "EV 36" cell correctly refuses to normalize and is not a dash cell.)
    const dashResidue = annotations.filter(
      (annotation) => annotation.actionCostResidue?.includes('dash action cell') ?? false,
    );
    expect(dashResidue).toEqual([]);
  });

  it('compiles the operator-paid siege-engine form with usesPerRound where printed', () => {
    const text = artifactText(
      'books/monsters/md/dynamic-terrain/siege-engines/boiling-oil-cauldron.bundle.json',
      'mcdm.monsters.v1/dynamic-terrain.siege-engines/boiling-oil-cauldron',
    );
    const parse = parseEffectText(text);
    const compiled = compileAbilities(
      parse,
      'mcdm.monsters.v1/dynamic-terrain.siege-engines/boiling-oil-cauldron',
    );
    const programs = compileEffectPrograms(
      parse,
      'mcdm.monsters.v1/dynamic-terrain.siege-engines/boiling-oil-cauldron',
    );
    const operatorPaid = [
      ...compiled.abilities.map((ability) => ({
        actionCost: ability.actionCost,
        operatorPays: ability.operatorPays,
        actionType: ability.actionType,
      })),
      ...programs.map((program) => ({
        actionCost: program.actionCost,
        operatorPays: program.operatorPays,
        actionType: program.actionType,
      })),
    ].filter((shape) => shape.operatorPays);
    expect(operatorPaid.length).toBeGreaterThanOrEqual(1);
    for (const shape of operatorPaid) {
      expect(shape.actionCost).toBe('main-action');
      // The parenthetical is retained verbatim on the raw string.
      expect(shape.actionType).toContain('(Adjacent creature)');
    }
    // "This action can be used only once per round." (Reload) compiles to a cap.
    const capped = programs.filter((program) => program.usesPerRound === 1);
    expect(capped.length).toBeGreaterThanOrEqual(1);
  });

  it('freezes compiled action-cost residue at ZERO across the whole accepted pin (I-4 sweep)', () => {
    // R-0029: every printed header cell at the accepted pin resolves onto
    // the closed vocabulary (156 villain-action dashes + the Wave of Blood
    // exact match). Residue on a COMPILED shape means the runtime path
    // would surface a table directive instead of a debit — legal, but at
    // this pin there must be exactly none. A pin bump that introduces a new
    // surface value breaks this loudly instead of silently skipping debits.
    const manifestPath = resolve(
      import.meta.dirname,
      '../../../.artifacts/canon/campaign/accepted/final-campaign-manifest.json',
    );
    const manifest = CampaignAuditManifestSchema.parse(
      JSON.parse(readFileSync(manifestPath, 'utf8')),
    );
    let abilityCount = 0;
    let programCount = 0;
    const residues: string[] = [];
    for (const entry of manifest.bundles) {
      const bundle = ExtractionBundleSchema.parse(
        JSON.parse(readFileSync(resolve(entry.bundlePath), 'utf8')),
      );
      for (const record of bundle.records) {
        if (record.recordKind !== 'artifact') continue;
        const parse = parseEffectText(record.text);
        const compiled = compileAbilities(parse, record.id);
        abilityCount += compiled.abilities.length;
        for (const ability of compiled.abilities) {
          if (ability.actionCostResidue !== null) {
            residues.push(`${record.id}: ${ability.actionCostResidue}`);
          }
        }
        const programs = compileEffectPrograms(parse, record.id);
        programCount += programs.length;
        for (const program of programs) {
          if (program.actionCostResidue !== null) {
            residues.push(`${record.id}#${program.effectOrdinal}: ${program.actionCostResidue}`);
          }
        }
      }
    }
    // Frozen at the accepted pin: the honest baseline counts. The Summoner
    // admission adds 1 compiled ability and 77 programs on top of the core
    // 587/1,688, and introduces exactly one new printed surface value:
    // "1 Eidos" on four summoner champion stat blocks. Eidos is NOT in
    // R-0029's closed vocabulary and no ruling covers it yet — the runtime
    // path correctly surfaces a table directive instead of a debit for
    // these four. Ruling needed before they can compile to debits; until
    // then this freeze pins the residue set exactly so any FIFTH residue
    // still breaks loudly.
    expect(abilityCount).toBe(588);
    expect(programCount).toBe(1765);
    expect([...residues].sort()).toEqual([
      'mcdm.summoner.v1/monster.champion.summoner.demon.statblock/demon-lords-aspect#3: unrecognized action-cost value "1 Eidos"',
      'mcdm.summoner.v1/monster.champion.summoner.elemental.statblock/dragons-portent#1: unrecognized action-cost value "1 Eidos"',
      'mcdm.summoner.v1/monster.champion.summoner.fey.statblock/celestial-attendant#3: unrecognized action-cost value "1 Eidos"',
      'mcdm.summoner.v1/monster.champion.summoner.undead.statblock/avatar-of-death#3: unrecognized action-cost value "1 Eidos"',
    ]);
  });

  it('classifies the real Tongue Slap onto the rolled point', () => {
    const text = artifactText(
      'books/monsters/md/monster/angulotl/statblock/angulotl-daybringer.bundle.json',
      'mcdm.monsters.v1/monster.angulotl.statblock/angulotl-daybringer',
    );
    const parse = parseEffectText(text);
    const annotations = [
      ...annotateHeaderCosts(
        parse,
        'mcdm.monsters.v1/monster.angulotl.statblock/angulotl-daybringer',
      ).values(),
    ];
    const rolled = annotations.filter(
      (annotation) => annotation.reactionInterception?.point === 'rolled',
    );
    expect(rolled.length).toBeGreaterThanOrEqual(1);
    expect(rolled[0]?.reactionInterception?.classified).toBe(true);
  });
});
