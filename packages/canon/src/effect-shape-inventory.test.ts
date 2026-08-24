import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCoreEffectFixtures } from './effect-corpus-fixtures.js';
import {
  EFFECT_SHAPE_FAMILIES,
  buildEffectShapeInventory,
  classifyEffectShape,
  normalizeTemplate,
  sentenceCount,
  stripCanonLinks,
  toEffectShapeRows,
} from './effect-shape-inventory.js';

const manifestPath = resolve(
  process.env.ENGARDE_CANON_MANIFEST ??
    '../../.artifacts/canon/campaign/accepted/final-campaign-manifest.json',
);

// Verbatim corpus payloads (accepted pin) — never edited, never paraphrased.
const TEST_LINE = 'The target makes a Presence test.'; // devil-adjudicator #2
const BOLD_TEST_LINE = 'Each target makes a **Might test**.'; // crucible-dragon #6
const CHOICE_LINE = 'Choose one of the following benefits:'; // ancient-loremaster #1
const BANE_LINE = 'The target takes a bane on their next strike.'; // shadow-elf-noctis-mage #1
const RECOVERY_LINE =
  'The target can spend a [Recovery](scc.v1:mcdm.heroes.v1/rule.health/recoveries).'; // healing-grace #1
const TERRAIN_LINE =
  'The area is [difficult terrain](scc.v1:mcdm.heroes.v1/movement/difficult-terrain).'; // pillar #2
const REGAIN_LINE = 'Each target regains 5 [Stamina](scc.v1:mcdm.heroes.v1/rule.health/stamina).'; // kobold-signifer #2
const MOVEMENT_CONDITION_LINE =
  'Each enemy [frightened](scc.v1:mcdm.heroes.v1/condition/frightened) this way is [pushed](scc.v1:mcdm.heroes.v1/movement/forced-movement) up to 2 squares away from the target and takes psychic damage equal to your [Presence](scc.v1:mcdm.heroes.v1/rule.character/presence) score.'; // behold-the-face-of-justice #1

describe('effect shape classification', () => {
  it('strips canon links to their labels for comparison only', () => {
    expect(stripCanonLinks(TERRAIN_LINE)).toBe('The area is difficult terrain.');
    expect(stripCanonLinks(TEST_LINE)).toBe(TEST_LINE);
  });

  it('normalizes numbers and bold for template grouping', () => {
    expect(normalizeTemplate(REGAIN_LINE)).toBe('Each target regains <N> Stamina.');
    expect(normalizeTemplate(BOLD_TEST_LINE)).toBe('Each target makes a Might test.');
  });

  it('counts terminal-punctuation sentences', () => {
    expect(sentenceCount(TEST_LINE)).toBe(1);
    expect(sentenceCount(CHOICE_LINE)).toBe(0);
  });

  it('recognizes the exact characteristic-test closed form, bold included', () => {
    for (const line of [TEST_LINE, BOLD_TEST_LINE]) {
      const shape = classifyEffectShape(line);
      expect(shape.family).toBe('characteristic-test');
      expect(shape.closedTemplateId).toBe('characteristic-test-exact');
    }
  });

  it('recognizes the remaining closed forms', () => {
    expect(classifyEffectShape(CHOICE_LINE).closedTemplateId).toBe('choice-menu-intro');
    expect(classifyEffectShape(BANE_LINE).closedTemplateId).toBe('edge-bane-next-roll');
    expect(classifyEffectShape(RECOVERY_LINE).closedTemplateId).toBe('spend-recovery-exact');
    expect(classifyEffectShape(TERRAIN_LINE).closedTemplateId).toBe('area-difficult-terrain');
    expect(classifyEffectShape(REGAIN_LINE).closedTemplateId).toBe('regains-stamina-flat');
  });

  it('assigns exactly one primary family by documented precedence', () => {
    const shape = classifyEffectShape(MOVEMENT_CONDITION_LINE);
    expect(shape.matchedFamilies).toContain('movement');
    expect(shape.matchedFamilies).toContain('condition');
    expect(shape.matchedFamilies).toContain('damage');
    expect(shape.family).toBe('movement');
    expect(shape.closedTemplateId).toBeNull();
  });

  it('leaves a payload with a rider outside every closed form', () => {
    // Verbatim: web-of-all-thats-come-before #1 — difficult terrain WITH a duration
    // rider plus a second sentence must not match the flat terrain form.
    const rider =
      'The area is [difficult terrain](scc.v1:mcdm.heroes.v1/movement/difficult-terrain) until the start of your next [turn](scc.v1:mcdm.heroes.v1/rule.combat/turn). Each enemy who ends their [turn](scc.v1:mcdm.heroes.v1/rule.combat/turn) in the area is [restrained](scc.v1:mcdm.heroes.v1/condition/restrained) (save ends).';
    expect(classifyEffectShape(rider).closedTemplateId).toBeNull();
  });
});

describe.skipIf(!existsSync(manifestPath))('effect shape inventory (accepted pin)', () => {
  it('conserves and freezes the table-directive shape counts', async () => {
    const fixtures = await loadCoreEffectFixtures(manifestPath);
    const { totalPrograms, rows } = toEffectShapeRows(fixtures);
    const inventory = buildEffectShapeInventory(totalPrograms, rows);

    expect(inventory.totalPrograms).toBe(1688);
    expect(inventory.tablePrograms).toBe(1676);

    // Every table program lands in exactly one primary family.
    const familySum = inventory.families.reduce((sum, family) => sum + family.lineCount, 0);
    expect(familySum).toBe(1676);
    for (const family of inventory.families) {
      expect(EFFECT_SHAPE_FAMILIES).toContain(family.family);
    }

    // Frozen at canon pin 520553438a4e8d199bfaaf676b8aa9bd273f4d61. A corpus
    // drift, precedence change, or pattern edit must surface here on purpose.
    const familyCounts = Object.fromEntries(
      inventory.families.map((family) => [family.family, family.lineCount]),
    );
    expect(familyCounts).toEqual({
      other: 410,
      movement: 355,
      condition: 238,
      damage: 157,
      'edge-bane': 152,
      'free-strike': 76,
      'characteristic-test': 54,
      surge: 45,
      'choice-menu': 40,
      'stamina-regain': 35,
      recovery: 34,
      terrain: 30,
      'temporary-stamina': 22,
      malice: 17,
      'heroic-resource': 11,
    });

    const closedCounts = Object.fromEntries(
      inventory.closedTemplates.map((closed) => [closed.id, closed.lineCount]),
    );
    expect(closedCounts).toEqual({
      'choice-menu-intro': 40,
      'characteristic-test-exact': 29,
      'edge-bane-next-roll': 12,
      'spend-recovery-exact': 6,
      'area-difficult-terrain': 3,
      'next-strike-against-target': 2,
      'regains-stamina-flat': 2,
      'temporary-stamina-flat': 1,
    });

    // Closed matches stay inside their families and never exceed them.
    for (const closed of inventory.closedTemplates) {
      const family = inventory.families.find((entry) => entry.family === closed.family);
      expect(family).toBeDefined();
      expect(closed.lineCount).toBeLessThanOrEqual(family?.closedMatchCount ?? 0);
    }

    // The characteristic-test closed form is monsters-only at this pin.
    const test = inventory.closedTemplates.find(
      (closed) => closed.id === 'characteristic-test-exact',
    );
    expect(test?.heroes).toBe(0);
    expect(test?.monsters).toBe(29);
    expect(test?.artifactCount).toBe(24);
  });
});
