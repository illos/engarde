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
  HEAL,
  MAKE_OR_ASSIST_A_TEST,
  RIDE,
  STAND_UP,
} from './fixtures/common-actions.verbatim.js';
import { GATE_SOURCE_FIXTURES } from './fixtures/gate-sources.verbatim.js';
import { ASSIST_A_TEST, TEST_RULE_CHUNK_FIXTURES } from './fixtures/test-rules.verbatim.js';

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

  it('keys the printed branches, in both printed forms, and only those', () => {
    // Form one: a whole "Alternatively, …" SENTENCE, extracted by marker.
    expect(byId.get(RIDE.artifactId)?.alternatives).toEqual([
      {
        key: 'mount-disengages',
        sourceText:
          'Alternatively, a creature can use the Ride move action to have their mount use the Disengage move action as a free triggered action.',
        // The printed phrase overrides Disengage's own header cost for
        // this use, and charges the MOUNT, not the rider.
        targetAction: {
          artifactId: 'mcdm.heroes.v1/feature.common.move-actions/disengage',
          actionCost: 'free-triggered-action',
        },
        // The branch moves WHO acts, not WHAT resolves.
        resolution: null,
      },
    ]);
    expect(byId.get(STAND_UP.artifactId)?.alternatives).toEqual([
      {
        key: 'ally-stands-up',
        sourceText:
          'Alternatively, they can use this maneuver to make a willing adjacent prone creature stand up.',
        // One maneuver, the actor's; nothing is charged to the ally.
        targetAction: null,
        resolution: null,
      },
    ]);
    // Form two: a CLAUSE inside a longer sentence, declared verbatim and
    // proved as a printed substring. Heal prints both of its halves in one
    // sentence joined by ", or", so there is no marker to extract.
    expect(byId.get(HEAL.artifactId)?.alternatives).toEqual([
      {
        key: 'saving-throw',
        sourceText:
          'or can make a saving throw against one effect they are suffering that is ended by a saving throw.',
        targetAction: null,
        // The one branch in the 17 that resolves differently from its
        // action's primary half.
        resolution: { kind: 'saving-throw' },
      },
    ]);
    // Make or Assist prints its branch as a clause too — "Assisting a test
    // is also a maneuver in combat" — and the branch's mechanics are
    // printed on the chapter section that clause points to.
    expect(byId.get(MAKE_OR_ASSIST_A_TEST.artifactId)?.alternatives.map((a) => a.key)).toEqual([
      'assist',
    ]);
    const withAlternatives = programs.filter((program) => program.alternatives.length > 0);
    expect(withAlternatives.map((program) => program.featureArtifactId).sort()).toEqual(
      [
        HEAL.artifactId,
        MAKE_OR_ASSIST_A_TEST.artifactId,
        RIDE.artifactId,
        STAND_UP.artifactId,
      ].sort(),
    );
  });

  it("reads the assist branch's tier map from the chapter section, verbatim", () => {
    // The action's own text prints no bullets; §Assist a Test does. Each
    // declared bullet is proved here against the committed cut of that
    // section (a foreign artifact — the gate registry's `sourceArtifactId`
    // shape), and the compiler has already proved the action LINKS the
    // section's parent and that each bullet names its polarity.
    const assist = byId
      .get(MAKE_OR_ASSIST_A_TEST.artifactId)
      ?.alternatives.find((alternative) => alternative.key === 'assist');
    expect(assist?.sourceText).toBe('Assisting a test is also a maneuver in combat');
    expect(assist?.resolution?.kind).toBe('ordinary-test');
    const map =
      assist?.resolution?.kind === 'ordinary-test' ? assist.resolution.tierPolarities : null;
    expect(map?.sourceArtifactId).toBe(ASSIST_A_TEST.artifactId);
    const section = stripSccLinks(ASSIST_A_TEST.text);
    for (const tier of ['tier1', 'tier2', 'tier3'] as const) {
      expect(section.includes(map?.[tier].sourceText ?? '∅'), tier).toBe(true);
    }
    expect([map?.tier1.polarity, map?.tier2.polarity, map?.tier3.polarity]).toEqual([
      'bane',
      'edge',
      'double-edge',
    ]);
    // The bullets are printed in tier order: ≤11, 12-16, 17+.
    const positions = (['tier1', 'tier2', 'tier3'] as const).map((tier) =>
      section.indexOf(map?.[tier].sourceText ?? '∅'),
    );
    expect(positions[0]).toBeLessThan(positions[1] ?? -1);
    expect(positions[1]).toBeLessThan(positions[2] ?? -1);
    expect(section.indexOf('**≤11:**')).toBeLessThan(positions[0] ?? -1);
    expect(section.indexOf('**12-16:**')).toBeLessThan(positions[1] ?? -1);
    expect(section.indexOf('**17+:**')).toBeLessThan(positions[2] ?? -1);
    // The primary half compiles the MADE test: no printed tier map, so the
    // outcome is the Test Difficulty Outcomes Table.
    expect(byId.get(MAKE_OR_ASSIST_A_TEST.artifactId)?.resolution).toEqual({
      kind: 'ordinary-test',
      tierPolarities: null,
    });
  });

  it("proves a declared clause against the artifact's own bytes", () => {
    // Declaring a clause is not a loophole around the marker: it is the
    // same declare-and-prove shape the per-round caps use, and a pin bump
    // that rewords the clause breaks just as loudly.
    expect(() =>
      compileCommonAction({ artifactId: HEAL.artifactId, text: CATCH_BREATH.text }),
    ).toThrow(CommonActionCompileError);
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

  it('compiles the four executable resolutions in the 17 and leaves the rest verbatim', () => {
    expect(byId.get(CATCH_BREATH.artifactId)?.resolution).toEqual({
      kind: 'spend-recovery',
      subjectText: 'A creature who uses the Catch Breath maneuver',
      singular: true,
    });
    // "…to stand up if they are prone, ENDING THAT CONDITION." The printed
    // clause names the condition; which instance ends is dispatch-supplied
    // [S12], so nothing about selection is compiled here.
    expect(byId.get(STAND_UP.artifactId)?.resolution).toEqual({
      kind: 'end-condition',
      conditionId: 'mcdm.heroes.v1/condition/prone',
    });
    // Heal's primary half is the SAME shipped Recovery offer Catch Breath
    // uses — nothing about the amount is compiled here; `spendRecovery`
    // owns recovery value.
    expect(byId.get(HEAL.artifactId)?.resolution).toEqual({
      kind: 'spend-recovery',
      subjectText: 'The target creature',
      singular: true,
    });
    const executable = programs.filter((program) => program.resolution.kind !== 'table');
    expect(executable.map((program) => program.featureArtifactId).sort()).toEqual(
      [
        CATCH_BREATH.artifactId,
        HEAL.artifactId,
        MAKE_OR_ASSIST_A_TEST.artifactId,
        STAND_UP.artifactId,
      ].sort(),
    );
  });

  it("proves a condition-ending resolution against the artifact's own links", () => {
    // The condition an `end-condition` resolution names is not a
    // classification — Stand Up LINKS prone — so the compiler proves it
    // through the one scc-link scanner rather than trusting the row.
    expect(byId.get(STAND_UP.artifactId)?.canonRefs).toContain('mcdm.heroes.v1/condition/prone');
    // Catch Breath's bytes under Stand Up's id: the row ends prone, and
    // that artifact links no such condition.
    expect(() =>
      compileCommonAction({ artifactId: STAND_UP.artifactId, text: CATCH_BREATH.text }),
    ).toThrow(CommonActionCompileError);
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
    // A gate may cite a rule that never names the action it gates —
    // `slowed` prints its bar on shifting and never mentions Disengage —
    // so the quote is proved against the artifact the gate SAYS it came
    // from, which is either one of the 17 or a committed gate-source cut.
    const sources = new Map<string, string>([
      ...programs.map((program): [string, string] => [
        program.featureArtifactId,
        program.sourceText,
      ]),
      ...GATE_SOURCE_FIXTURES.map((fixture): [string, string] => [
        fixture.artifactId,
        fixture.text,
      ]),
      ...TEST_RULE_CHUNK_FIXTURES.map((fixture): [string, string] => [
        fixture.artifactId,
        fixture.text,
      ]),
    ]);
    for (const gate of COMMON_ACTION_ELIGIBILITY_GATES) {
      expect(byId.get(gate.featureArtifactId), gate.featureArtifactId).toBeDefined();
      const source = sources.get(gate.sourceArtifactId);
      expect(source, `${gate.featureArtifactId} cites ${gate.sourceArtifactId}`).toBeDefined();
      expect(
        stripSccLinks(source ?? '').includes(gate.verbatim),
        `${gate.sourceArtifactId}: ${gate.verbatim}`,
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
    // Every action whose availability is not plainly true has a registered
    // gate behind it. Two registered gates deliberately do NOT appear:
    // Disengage's `slowed` gate reads TRUE on a creature who is not slowed
    // (an engine-known precondition that holds is silent, which is the
    // point of a tri-state), and Heal's precondition is entirely about a
    // target this bare read has not named — no target, no reading.
    expect(
      menu.filter((offer) => offer.available !== true).map((offer) => offer.featureArtifactId),
    ).toEqual([
      'mcdm.heroes.v1/feature.common.maneuvers/catch-breath',
      'mcdm.heroes.v1/feature.common.maneuvers/knockback',
      // Stand Up's restrained bar reads TRUE here (this hero is not
      // restrained) — what is unknown is the prone precondition, which is
      // about the creature who stands up, and a bare menu read has not
      // named one.
      'mcdm.heroes.v1/feature.common.maneuvers/stand-up',
      'mcdm.heroes.v1/feature.common.move-actions/ride',
    ]);
  });
});
