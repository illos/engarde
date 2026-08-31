import {
  COMMON_ACTION_ELIGIBILITY_GATES,
  actorPerRoundCap,
  commonActionMenu,
  initialEncounterState,
  targetPerRoundCap,
} from '@engarde/engine';
import { describe, expect, it } from 'vitest';
import {
  COMMON_ACTION_DIRECTORY,
  CommonActionCompileError,
  compileCommonAction,
  compileCommonActions,
  printedSentences,
} from './common-actions.js';
import { stripSccLinks } from './effect-grammar.js';
import {
  ADVANCE,
  CATCH_BREATH,
  COMMON_ACTION_FIXTURES,
  FREE_STRIKE,
  RIDE,
  STAND_UP,
} from './fixtures/common-actions.verbatim.js';

/**
 * Prose-feature program source [common-actions design §2, S2]. The 17
 * artifacts compile from committed verbatim cuts, so this runs everywhere;
 * the corpus-gated drift guard proves the cuts still match the books.
 */

const programs = compileCommonActions(
  COMMON_ACTION_FIXTURES.map((fixture) => ({
    artifactId: fixture.artifactId,
    text: fixture.text,
  })),
);
const byId = new Map(programs.map((program) => [program.featureArtifactId, program]));

describe('common-action program source', () => {
  it('compiles all 17 printed common actions, and the directory covers exactly them', () => {
    expect(programs).toHaveLength(17);
    expect(COMMON_ACTION_DIRECTORY.map((entry) => entry.featureArtifactId).sort()).toEqual(
      COMMON_ACTION_FIXTURES.map((fixture) => fixture.artifactId).sort(),
    );
  });

  it('carries the prose-feature provenance discriminator, never an Effect-program label', () => {
    for (const program of programs) {
      expect(program.provenance, program.featureArtifactId).toBe('prose-feature');
    }
  });

  it('takes its default cost from the printed group directory', () => {
    const byGroup = new Map(programs.map((p) => [p.featureArtifactId, p]));
    expect(byGroup.get(ADVANCE.artifactId)?.defaultActionCost).toBe('move-action');
    expect(byGroup.get(CATCH_BREATH.artifactId)?.defaultActionCost).toBe('maneuver');
    expect(byGroup.get(FREE_STRIKE.artifactId)?.defaultActionCost).toBe('main-action');
    // Frozen accounting: 4 main actions, 10 maneuvers, 3 move actions.
    const counts = programs.reduce<Record<string, number>>((acc, program) => {
      acc[program.group] = (acc[program.group] ?? 0) + 1;
      return acc;
    }, {});
    expect(counts).toEqual({ 'main-actions': 4, maneuvers: 10, 'move-actions': 3 });
  });

  it('carries the whole artifact verbatim, with its byte span and canon refs', () => {
    const advance = byId.get(ADVANCE.artifactId);
    expect(advance?.sourceText).toBe(ADVANCE.text);
    expect(advance?.sourceSpan).toEqual({
      byteStart: 0,
      byteEnd: Buffer.byteLength(ADVANCE.text, 'utf8'),
    });
    expect(advance?.canonRefs).toEqual([
      'mcdm.heroes.v1/feature.common.move-actions/advance',
      'mcdm.heroes.v1/rule.character/speed',
    ]);
  });

  it("reads Ride's TWO printed once-per-round caps with their different subjects", () => {
    const ride = byId.get(RIDE.artifactId);
    expect(ride?.perRoundCaps).toEqual([
      {
        subject: 'actor',
        uses: 1,
        sourceText: 'A creature can use the Ride move action only once per round.',
      },
      {
        subject: 'target',
        uses: 1,
        sourceText:
          'A mounted creature can only have this move action applied to them once per round.',
      },
    ]);
    if (ride === undefined) throw new Error('Ride did not compile');
    expect(actorPerRoundCap(ride)?.subject).toBe('actor');
    expect(targetPerRoundCap(ride)?.subject).toBe('target');
    // Every other action prints no cap — a boolean would have been enough
    // for 16 of 17 and wrong for the one that matters.
    for (const program of programs) {
      if (program.featureArtifactId === RIDE.artifactId) continue;
      expect(program.perRoundCaps, program.featureArtifactId).toEqual([]);
    }
  });

  it('keys the two printed alternatives, and only those two', () => {
    expect(byId.get(RIDE.artifactId)?.alternatives).toEqual([
      {
        key: 'mount-disengages',
        sourceText:
          'Alternatively, a creature can use the Ride move action to have their mount use the Disengage move action as a free triggered action.',
      },
    ]);
    expect(byId.get(STAND_UP.artifactId)?.alternatives).toEqual([
      {
        key: 'ally-stands-up',
        sourceText:
          'Alternatively, they can use this maneuver to make a willing adjacent prone creature stand up.',
      },
    ]);
    const withAlternatives = programs.filter((program) => program.alternatives.length > 0);
    expect(withAlternatives.map((program) => program.featureArtifactId).sort()).toEqual(
      [RIDE.artifactId, STAND_UP.artifactId].sort(),
    );
  });

  it('records the debit contract on the envelope — the four companion-paid actions', () => {
    const companionPaid = programs
      .filter((program) => program.debitContract === 'companion')
      .map((program) => [program.featureArtifactId, program.companionArtifactIds]);
    expect(Object.fromEntries(companionPaid)).toEqual({
      'mcdm.heroes.v1/feature.common.main-actions/free-strike': [
        'mcdm.heroes.v1/feature.ability.common/melee-weapon-free-strike',
        'mcdm.heroes.v1/feature.ability.common/ranged-weapon-free-strike',
      ],
      'mcdm.heroes.v1/feature.common.maneuvers/escape-grab': [
        'mcdm.heroes.v1/feature.ability.common/escape-grab',
      ],
      'mcdm.heroes.v1/feature.common.maneuvers/grab': [
        'mcdm.heroes.v1/feature.ability.common/grab',
      ],
      'mcdm.heroes.v1/feature.common.maneuvers/knockback': [
        'mcdm.heroes.v1/feature.ability.common/knockback',
      ],
    });
  });

  it('is corroborated by the printed prose: only companion-paid actions print no cost', () => {
    // 14 of the 17 print their own group's cost words in running text.
    // The three that do not are exactly the three whose prose hands the
    // action to a compiled companion ability ("using the following
    // ability"), which is where the printed cost cell lives.
    const silent = programs
      .filter((program) => {
        const phrase = {
          'main-actions': 'main action',
          maneuvers: 'maneuver',
          'move-actions': 'move action',
        }[program.group];
        return !stripSccLinks(program.sourceText).toLowerCase().includes(phrase);
      })
      .map((program) => program.featureArtifactId)
      .sort();
    expect(silent).toEqual([
      'mcdm.heroes.v1/feature.common.maneuvers/escape-grab',
      'mcdm.heroes.v1/feature.common.maneuvers/grab',
      'mcdm.heroes.v1/feature.common.maneuvers/knockback',
    ]);
    for (const id of silent) expect(byId.get(id)?.debitContract, id).toBe('companion');
  });

  it('compiles the one executable resolution in the 17 and leaves the rest verbatim', () => {
    expect(byId.get(CATCH_BREATH.artifactId)?.resolution).toEqual({
      kind: 'spend-recovery',
      subjectText: 'A creature who uses the Catch Breath maneuver',
      singular: true,
    });
    const executable = programs.filter((program) => program.resolution.kind !== 'table');
    expect(executable.map((program) => program.featureArtifactId)).toEqual([
      CATCH_BREATH.artifactId,
    ]);
  });

  it('breaks loudly when the pinned bytes and the directory disagree', () => {
    // Advance's bytes under Ride's id: the directory expects two printed
    // cap sentences and one alternative; Advance prints none.
    expect(() => compileCommonAction({ artifactId: RIDE.artifactId, text: ADVANCE.text })).toThrow(
      CommonActionCompileError,
    );
    // An artifact that is not one of the printed 17 has no entry at all.
    expect(() =>
      compileCommonAction({ artifactId: 'mcdm.heroes.v1/rule.combat/turn', text: ADVANCE.text }),
    ).toThrow(CommonActionCompileError);
  });

  it('splits printed sentences without normalizing them', () => {
    expect(printedSentences('One two. Three four.\n\nFive.')).toEqual([
      'One two.',
      'Three four.',
      'Five.',
    ]);
  });
});

describe('the printed gates and the offer surface read the pinned bytes', () => {
  it('every registered eligibility gate quotes its artifact verbatim', () => {
    // The gate registry lives in the engine (it reads engine state), so its
    // quotes cannot be proved there. They are proved HERE, against the same
    // pinned bytes the compiler reads — a pin bump that rewords a printed
    // precondition breaks loudly instead of leaving a stale quote in a
    // warning the Director is meant to trust.
    expect(COMMON_ACTION_ELIGIBILITY_GATES.length).toBeGreaterThan(0);
    for (const gate of COMMON_ACTION_ELIGIBILITY_GATES) {
      const program = byId.get(gate.featureArtifactId);
      expect(program, gate.featureArtifactId).toBeDefined();
      expect(
        stripSccLinks(program?.sourceText ?? '').includes(gate.verbatim),
        `${gate.featureArtifactId}: ${gate.verbatim}`,
      ).toBe(true);
    }
  });

  it('offers all 17 to a participant with no printed access restriction', () => {
    const state = initialEncounterState([{ id: 'hero', kind: 'hero' }]);
    const menu = commonActionMenu(state, 'hero', programs);
    expect(menu).toHaveLength(17);
    expect(
      menu.filter((offer) => offer.offersCompanion).map((offer) => offer.featureArtifactId),
    ).toEqual([
      'mcdm.heroes.v1/feature.common.main-actions/free-strike',
      'mcdm.heroes.v1/feature.common.maneuvers/escape-grab',
      'mcdm.heroes.v1/feature.common.maneuvers/grab',
      'mcdm.heroes.v1/feature.common.maneuvers/knockback',
    ]);
    // Fifteen of the 17 print no precondition the engine can read at all;
    // the two that do are the two registered gates.
    expect(
      menu.filter((offer) => offer.available !== true).map((offer) => offer.featureArtifactId),
    ).toEqual([
      'mcdm.heroes.v1/feature.common.maneuvers/catch-breath',
      'mcdm.heroes.v1/feature.common.move-actions/ride',
    ]);
  });
});
