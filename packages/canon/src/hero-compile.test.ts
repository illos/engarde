import { describe, expect, it } from 'vitest';
import { compileHero, echelonOfLevel } from './hero-compile.js';
import { type DecisionAction, appendDecision, emptyHeroBuild } from './hero-document.js';
import {
  ASPECT_BERSERKER,
  ASPECT_STORMWIGHT,
  FEROCITY_SCC,
  FURY_CLASS_SCC,
} from './hero-overlay-fury.js';

const CHARACTERISTICS = { might: 2, agility: 2, reason: 2, intuition: -1, presence: -1 };

function buildOf(actions: DecisionAction[]) {
  let build = emptyHeroBuild();
  for (const action of actions)
    build = appendDecision(build, action, { atLevel: 1, provenance: 'wizard', at: 0 });
  return build;
}

const pick = (key: string, selected: string[]): DecisionAction => ({
  kind: 'select',
  key,
  payload: { kind: 'pick', selected, origin: 'player' },
});

const BERSERKER_PANTHER: DecisionAction[] = [
  { kind: 'set-pillar', pillar: 'class', value: FURY_CLASS_SCC },
  { kind: 'set-characteristics', assignment: CHARACTERISTICS },
  { kind: 'set-pillar', pillar: 'subclass', value: ASPECT_BERSERKER },
  pick(`${FURY_CLASS_SCC}#skills-2`, [
    'mcdm.heroes.v1/skill.exploration/climb',
    'mcdm.heroes.v1/skill.intrigue/alertness',
  ]),
  pick('mcdm.heroes.v1/feature.fury.level-1/fury-abilities#signature-ability', [
    'mcdm.heroes.v1/feature.ability.fury.level-1/brutal-slam',
  ]),
  pick('mcdm.heroes.v1/feature.fury.level-1/fury-abilities#5pt-ability', [
    'mcdm.heroes.v1/feature.ability.fury.level-1/blood-for-blood',
  ]),
  pick('mcdm.heroes.v1/feature.fury.level-1/kit', ['mcdm.heroes.v1/kit/panther']),
];

describe('echelonOfLevel (printed bands, one home)', () => {
  it('maps the printed level bands', () => {
    // ❝1st Echelon (1st to 3rd Level)❞ … ❝4th Echelon (10th Level)❞
    // (rule.general/echelon).
    expect([1, 2, 3].map(echelonOfLevel)).toEqual([1, 1, 1]);
    expect([4, 5, 6].map(echelonOfLevel)).toEqual([2, 2, 2]);
    expect([7, 8, 9].map(echelonOfLevel)).toEqual([3, 3, 3]);
    expect(echelonOfLevel(10)).toBe(4);
    expect(() => echelonOfLevel(0)).toThrow();
    expect(() => echelonOfLevel(11)).toThrow();
  });
});

describe('compileHero — the Fury L1 compile seam', () => {
  it('berserker + panther: class stats plus the printed kit Stamina fold', () => {
    const result = compileHero({
      classScc: FURY_CLASS_SCC,
      level: 1,
      characteristics: CHARACTERISTICS,
      build: buildOf(BERSERKER_PANTHER),
    });
    if (result.stats === null) throw new Error('expected automated stats');
    // ❝Starting Stamina at 1st Level: 21❞ (class Basics) + panther
    // ❝Stamina Bonus: +6 per echelon❞ × echelon 1 (chapter/kits.md
    // §Stamina Bonus) = 27.
    expect(result.stats.staminaMax).toBe(27);
    // ❝Recoveries: 10❞ (class Basics).
    expect(result.stats.recoveriesMax).toBe(10);
    // R-M: class-printed characteristic (Might 2) − printed offsets.
    expect(result.stats.potencies).toEqual({ weak: 0, average: 1, strong: 2 });
    expect(result.stats.characteristics).toEqual(CHARACTERISTICS);
    // Chosen abilities + the aspect-granted triggered action.
    expect(result.abilityArtifactIds).toContain(
      'mcdm.heroes.v1/feature.ability.fury.level-1/brutal-slam',
    );
    expect(result.abilityArtifactIds).toContain(
      'mcdm.heroes.v1/feature.ability.fury.level-1/blood-for-blood',
    );
    expect(result.abilityArtifactIds).toContain(
      'mcdm.heroes.v1/feature.ability.fury.level-1/lines-of-force',
    );
    // Granted (Nature, Lift) + chosen skills.
    expect(result.skillSccs).toEqual(
      expect.arrayContaining([
        'mcdm.heroes.v1/skill.lore/nature',
        'mcdm.heroes.v1/skill.exploration/lift',
        'mcdm.heroes.v1/skill.exploration/climb',
        'mcdm.heroes.v1/skill.intrigue/alertness',
      ]),
    );
    // Ferocity is an encounter-scoped resource — surfaced, never stored.
    expect(result.resourceSccs).toEqual([FEROCITY_SCC]);
    // Unrepresentable printed kit bonuses become verbatim receipts.
    const receiptText = result.receipts.map((receipt) => receipt.reason).join('\n');
    expect(receiptText).toContain('panther: Speed Bonus +1');
    expect(receiptText).toContain('panther: Stability Bonus +1');
    expect(receiptText).toContain('panther: Melee Damage Bonus +0/+0/+4');
    expect(receiptText).toContain('kit signature ability');
    expect(receiptText).toContain('Ferocity');
  });

  it('stormwight + boren: bonuses parse from the kit-bonuses feature record', () => {
    const result = compileHero({
      classScc: FURY_CLASS_SCC,
      level: 1,
      characteristics: CHARACTERISTICS,
      build: buildOf([
        { kind: 'set-pillar', pillar: 'class', value: FURY_CLASS_SCC },
        { kind: 'set-characteristics', assignment: CHARACTERISTICS },
        { kind: 'set-pillar', pillar: 'subclass', value: ASPECT_STORMWIGHT },
        pick('mcdm.heroes.v1/feature.fury.level-1/beast-shape', ['mcdm.heroes.v1/kit/boren']),
      ]),
    });
    if (result.stats === null) throw new Error('expected automated stats');
    // 21 + boren ❝Stamina Bonus: +9 per echelon❞ × echelon 1
    // (feature/fury/boren/kit-bonuses.md) = 30.
    expect(result.stats.staminaMax).toBe(30);
    const receiptText = result.receipts.map((receipt) => receipt.reason).join('\n');
    // The non-Stamina bullets stay verbatim receipts.
    expect(receiptText).toContain('Stability Bonus: +2');
    expect(receiptText).toContain('Melee Damage Bonus: +0/+0/+4');
    // Stormwight grants: Furious Change + Aspect of the Wild.
    expect(result.abilityArtifactIds).toContain(
      'mcdm.heroes.v1/feature.ability.fury.level-1/furious-change',
    );
    expect(result.abilityArtifactIds).toContain(
      'mcdm.heroes.v1/feature.fury.stormwight-kits/aspect-of-the-wild',
    );
  });

  it('no kit chosen: class stats only, no kit fold', () => {
    const result = compileHero({
      classScc: FURY_CLASS_SCC,
      level: 1,
      characteristics: CHARACTERISTICS,
      build: buildOf([
        { kind: 'set-pillar', pillar: 'class', value: FURY_CLASS_SCC },
        { kind: 'set-characteristics', assignment: CHARACTERISTICS },
      ]),
    });
    expect(result.stats?.staminaMax).toBe(21);
  });

  it('unknown class: table mode with an explicit receipt, never a guess', () => {
    const result = compileHero({
      classScc: 'mcdm.heroes.v1/class/censor',
      level: 1,
      characteristics: CHARACTERISTICS,
      build: buildOf([]),
    });
    expect(result.stats).toBeNull();
    expect(
      result.receipts.some((receipt) => receipt.reason.includes('not in the compile registry')),
    ).toBe(true);
  });

  it('missing characteristics: table mode with an explicit receipt', () => {
    const result = compileHero({
      classScc: FURY_CLASS_SCC,
      level: 1,
      characteristics: null,
      build: buildOf([{ kind: 'set-pillar', pillar: 'class', value: FURY_CLASS_SCC }]),
    });
    expect(result.stats).toBeNull();
    expect(
      result.receipts.some((receipt) => receipt.reason.includes('no characteristic assignment')),
    ).toBe(true);
  });
});
