import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DecisionActionSchema,
  type DecisionEntry,
  HeroBuildSchema,
  HeroRuntimeSchema,
  PIN_VERSION,
  appendDecision,
  emptyHeroBuild,
  emptyHeroRuntime,
  projectDecisions,
  truncateDecisions,
} from './hero-document.js';

const FURY = 'mcdm.heroes.v1/class/fury';
const ASPECT = 'mcdm.heroes.v1/feature.fury.level-1/primordial-aspect#berserker';
const SKILLS_2 = 'mcdm.heroes.v1/class/fury#skills-2';

function entry(seq: number, action: DecisionEntry['action']): DecisionEntry {
  return { seq, action, atLevel: 1, provenance: 'wizard', at: 0, divergence: null };
}

describe('hero decision log', () => {
  it('pin stamp matches the tracked source lock (never silently drifts)', () => {
    const lock = JSON.parse(
      readFileSync(
        fileURLToPath(new URL('../config/steelcompendium-source.json', import.meta.url)),
        'utf8',
      ),
    ) as { tag: string };
    expect(PIN_VERSION).toBe(lock.tag);
  });

  it('projects an ordered log into pillars, characteristics and selections', () => {
    const projection = projectDecisions([
      entry(0, { kind: 'set-pillar', pillar: 'class', value: FURY }),
      entry(1, {
        kind: 'set-characteristics',
        assignment: { might: 2, agility: 2, reason: 2, intuition: -1, presence: -1 },
      }),
      entry(2, { kind: 'set-pillar', pillar: 'subclass', value: ASPECT }),
      entry(3, {
        kind: 'select',
        key: SKILLS_2,
        payload: {
          kind: 'pick',
          selected: ['mcdm.heroes.v1/skill.exploration/climb'],
          origin: 'player',
        },
      }),
    ]);
    expect(projection.level).toBe(1);
    expect(projection.pillars).toEqual({ class: FURY, subclass: ASPECT });
    expect(projection.characteristics).toEqual({
      might: 2,
      agility: 2,
      reason: 2,
      intuition: -1,
      presence: -1,
    });
    expect(projection.selections[SKILLS_2]).toMatchObject({
      selected: ['mcdm.heroes.v1/skill.exploration/climb'],
    });
  });

  it('later entries supersede; clear removes explicitly (replay never guesses)', () => {
    const pick = (selected: string[]) =>
      ({
        kind: 'select',
        key: SKILLS_2,
        payload: { kind: 'pick', selected, origin: 'player' },
      }) as const;
    const log = [
      entry(0, pick(['mcdm.heroes.v1/skill.exploration/climb'])),
      entry(1, pick(['mcdm.heroes.v1/skill.intrigue/hide'])),
    ];
    expect(projectDecisions(log).selections[SKILLS_2]).toMatchObject({
      selected: ['mcdm.heroes.v1/skill.intrigue/hide'],
    });
    const cleared = [...log, entry(2, { kind: 'clear', key: SKILLS_2 })];
    expect(projectDecisions(cleared).selections[SKILLS_2]).toBeUndefined();
  });

  it('is prefix-closed: revert = truncate + re-project reproduces the exact prior character', () => {
    let build = emptyHeroBuild();
    const context = { atLevel: 1, provenance: 'wizard' as const, at: 0 };
    build = appendDecision(build, { kind: 'set-pillar', pillar: 'class', value: FURY }, context);
    const atClassOnly = projectDecisions(build.decisions);
    build = appendDecision(
      build,
      { kind: 'set-pillar', pillar: 'subclass', value: ASPECT },
      context,
    );
    build = appendDecision(
      build,
      {
        kind: 'select',
        key: SKILLS_2,
        payload: {
          kind: 'pick',
          selected: ['mcdm.heroes.v1/skill.intrigue/sneak'],
          origin: 'player',
        },
      },
      context,
    );
    // Rewind to position 1 (keep only the class decision).
    const rewound = truncateDecisions(build.decisions, 1);
    expect(projectDecisions(rewound)).toEqual(atClassOnly);
    // The truncated log's entries are byte-identical to the original prefix.
    expect(rewound).toEqual(build.decisions.slice(0, 1));
  });

  it('appendDecision mints dense seqs and keeps the stored selections projection in sync', () => {
    let build = emptyHeroBuild();
    const context = { atLevel: 1, provenance: 'wizard' as const, at: 42 };
    build = appendDecision(
      build,
      {
        kind: 'select',
        key: SKILLS_2,
        payload: {
          kind: 'pick',
          selected: ['mcdm.heroes.v1/skill.exploration/jump'],
          origin: 'player',
        },
      },
      context,
    );
    build = appendDecision(build, { kind: 'clear', key: SKILLS_2 }, context);
    expect(build.decisions.map((decision) => decision.seq)).toEqual([0, 1]);
    // Invariant (§2.3c): selections == project(decisions).selections.
    expect(build.selections).toEqual(projectDecisions(build.decisions).selections);
    expect(build.selections[SKILLS_2]).toBeUndefined();
    expect(HeroBuildSchema.parse(build)).toEqual(build);
  });

  it('truncation outside the log bounds is an error, never a guess', () => {
    expect(() => truncateDecisions([], 1)).toThrow();
    expect(() => truncateDecisions([], -1)).toThrow();
  });

  it('rejects malformed actions at the one Zod home', () => {
    expect(
      DecisionActionSchema.safeParse({ kind: 'set-pillar', pillar: 'class', value: '' }).success,
    ).toBe(false);
    expect(DecisionActionSchema.safeParse({ kind: 'select', key: SKILLS_2 }).success).toBe(false);
    expect(DecisionActionSchema.safeParse({ kind: 'advance-level', to: 2 }).success).toBe(true);
  });

  it('advance-level supersedes into the projected level', () => {
    const projection = projectDecisions([entry(0, { kind: 'advance-level', to: 3 })]);
    expect(projection.level).toBe(3);
  });

  it('runtime blob: sheet-owned vitals default to uninitialized (DEC-0019)', () => {
    const runtime = emptyHeroRuntime();
    expect(runtime.vitals).toEqual({ staminaCurrent: null, recoveriesCurrent: null });
    expect(HeroRuntimeSchema.parse(runtime)).toEqual(runtime);
    // Encounter-scoped resources never gain a slot by default.
    expect(runtime.resources).toEqual({});
  });
});
