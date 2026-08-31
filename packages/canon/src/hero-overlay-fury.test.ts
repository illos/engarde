import { describe, expect, it } from 'vitest';
import { type DecisionEntry, projectDecisions } from './hero-document.js';
import {
  ASPECT_BERSERKER,
  ASPECT_STORMWIGHT,
  FURY_CLASS_SCC,
  FURY_L1_OVERLAY,
  STANDARD_KITS,
  STORMWIGHT_KITS,
  isRowReachable,
  unansweredKeys,
} from './hero-overlay-fury.js';

function entry(seq: number, action: DecisionEntry['action']): DecisionEntry {
  return { seq, action, atLevel: 1, provenance: 'wizard', at: 0, divergence: null };
}

const withClass = [entry(0, { kind: 'set-pillar', pillar: 'class', value: FURY_CLASS_SCC })];

describe('fury L1 overlay', () => {
  it('kit pools: 21 standard kits, 4 stormwight kits, disjoint', () => {
    expect(STANDARD_KITS).toHaveLength(21);
    expect(STORMWIGHT_KITS).toHaveLength(4);
    const standard = new Set(STANDARD_KITS.map((option) => option.key));
    for (const option of STORMWIGHT_KITS) expect(standard.has(option.key)).toBe(false);
  });

  it('ability pools carry 4 options each, all L1 fury ability records', () => {
    for (const disc of ['#signature-ability', '#3pt-ability', '#5pt-ability']) {
      const row = FURY_L1_OVERLAY.find((candidate) => candidate.key.endsWith(disc));
      if (!row || row.optionSource.kind !== 'options') throw new Error(`missing row ${disc}`);
      expect(row.optionSource.options).toHaveLength(4);
      for (const option of row.optionSource.options) {
        expect(option.key.startsWith('mcdm.heroes.v1/feature.ability.fury.level-1/')).toBe(true);
      }
    }
  });

  it('kit rows are respite-changeable from pin prose, never build-locked', () => {
    for (const key of [
      'mcdm.heroes.v1/feature.fury.level-1/kit',
      'mcdm.heroes.v1/feature.fury.level-1/beast-shape',
    ]) {
      const row = FURY_L1_OVERLAY.find((candidate) => candidate.key === key);
      expect(row?.changeableAt).toBe('respite');
    }
  });

  it('aspect-gated rows are unreachable until the aspect pillar is set', () => {
    const kitRow = FURY_L1_OVERLAY.find(
      (row) => row.key === 'mcdm.heroes.v1/feature.fury.level-1/kit',
    );
    const beastRow = FURY_L1_OVERLAY.find(
      (row) => row.key === 'mcdm.heroes.v1/feature.fury.level-1/beast-shape',
    );
    if (!kitRow || !beastRow) throw new Error('missing kit rows');
    const noAspect = projectDecisions(withClass);
    expect(isRowReachable(kitRow, noAspect)).toBe(false);
    expect(isRowReachable(beastRow, noAspect)).toBe(false);
    const berserker = projectDecisions([
      ...withClass,
      entry(1, { kind: 'set-pillar', pillar: 'subclass', value: ASPECT_BERSERKER }),
    ]);
    expect(isRowReachable(kitRow, berserker)).toBe(true);
    expect(isRowReachable(beastRow, berserker)).toBe(false);
    const stormwight = projectDecisions([
      ...withClass,
      entry(1, { kind: 'set-pillar', pillar: 'subclass', value: ASPECT_STORMWIGHT }),
    ]);
    expect(isRowReachable(kitRow, stormwight)).toBe(false);
    expect(isRowReachable(beastRow, stormwight)).toBe(true);
  });

  it('completeness is derived: unanswered keys shrink as decisions land; gaps stay explicit', () => {
    const empty = projectDecisions([]);
    const atStart = unansweredKeys(empty);
    // Before any decision, exactly the class pillar plus the four
    // explicitly-unresolvable pillar gaps are on the board.
    expect(atStart.map((unanswered) => unanswered.key)).toEqual([
      FURY_CLASS_SCC,
      'gap:ancestry',
      'gap:culture',
      'gap:career',
      'gap:complication',
    ]);
    expect(atStart.filter((unanswered) => unanswered.status === 'gap')).toHaveLength(4);

    const built = projectDecisions([
      ...withClass,
      entry(1, {
        kind: 'set-characteristics',
        assignment: { might: 2, agility: 2, reason: 2, intuition: -1, presence: -1 },
      }),
      entry(2, { kind: 'set-pillar', pillar: 'subclass', value: ASPECT_BERSERKER }),
      entry(3, {
        kind: 'select',
        key: `${FURY_CLASS_SCC}#skills-2`,
        payload: {
          kind: 'pick',
          selected: [
            'mcdm.heroes.v1/skill.exploration/climb',
            'mcdm.heroes.v1/skill.intrigue/alertness',
          ],
          origin: 'player',
        },
      }),
      entry(4, {
        kind: 'select',
        key: 'mcdm.heroes.v1/feature.fury.level-1/fury-abilities#signature-ability',
        payload: {
          kind: 'pick',
          selected: ['mcdm.heroes.v1/feature.ability.fury.level-1/brutal-slam'],
          origin: 'player',
        },
      }),
      entry(5, {
        kind: 'select',
        key: 'mcdm.heroes.v1/feature.fury.level-1/fury-abilities#3pt-ability',
        payload: {
          kind: 'pick',
          selected: ['mcdm.heroes.v1/feature.ability.fury.level-1/back'],
          origin: 'player',
        },
      }),
      entry(6, {
        kind: 'select',
        key: 'mcdm.heroes.v1/feature.fury.level-1/fury-abilities#5pt-ability',
        payload: {
          kind: 'pick',
          selected: ['mcdm.heroes.v1/feature.ability.fury.level-1/blood-for-blood'],
          origin: 'player',
        },
      }),
      entry(7, {
        kind: 'select',
        key: 'mcdm.heroes.v1/feature.fury.level-1/kit',
        payload: { kind: 'pick', selected: ['mcdm.heroes.v1/kit/panther'], origin: 'player' },
      }),
    ]);
    const remaining = unansweredKeys(built);
    // Every class-track choice point is answered; only the explicit pillar
    // gaps remain — and they remain VISIBLE, never silently complete.
    expect(remaining.every((unanswered) => unanswered.status === 'gap')).toBe(true);
    expect(remaining).toHaveLength(4);
  });

  it('a partial pick counts as unanswered (cardinality not yet met)', () => {
    const partial = projectDecisions([
      ...withClass,
      entry(1, {
        kind: 'select',
        key: `${FURY_CLASS_SCC}#skills-2`,
        payload: {
          kind: 'pick',
          selected: ['mcdm.heroes.v1/skill.exploration/climb'],
          origin: 'player',
        },
      }),
    ]);
    const keys = unansweredKeys(partial).map((unanswered) => unanswered.key);
    expect(keys).toContain(`${FURY_CLASS_SCC}#skills-2`);
  });

  it('every resolvable row cites pin evidence; fixed grants store nothing', () => {
    for (const row of FURY_L1_OVERLAY) {
      expect(row.evidence.length).toBeGreaterThan(0);
      if (row.kind === 'fixed-grant') expect(row.cardinality).toBe(0);
    }
  });
});
