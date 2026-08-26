import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  type EncounterState,
  type Intent,
  createSeededRandomSource,
  upgradeEncounterState,
} from '@engarde/engine';
import { describe, expect, it } from 'vitest';
import { compileAbilities, executeIntents, tierOutcomeToIntents } from './effect-conformance.js';
import { parseEffectText } from './effect-grammar.js';
import { ingestStructuredRecord } from './extract.js';

const sourceRoot = process.env.ENGARDE_CORPUS_ROOT
  ? resolve(process.env.ENGARDE_CORPUS_ROOT)
  : undefined;

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

function freshState(): EncounterState {
  return upgradeEncounterState({
    schemaVersion: 5,
    terrainFacts: [],
    squads: [],
    participants: {
      fury: { id: 'fury', conditions: [], kind: 'hero', stats: null, stamina: null, grants: [] },
      target: {
        id: 'target',
        conditions: [],
        kind: 'director-creature',
        stats: null,
        stamina: null,
        grants: [],
      },
    },
  });
}

describe.skipIf(!sourceRoot)('channel-1 conformance: grammar → engine (blood-for-blood)', () => {
  it('applies exactly the linked conditions with save-ends — exhaustive delta', async () => {
    const text = await ingestText(
      'en/books/heroes/md/feature/ability/fury/level-1/blood-for-blood.md',
    );
    const tier17 = parseEffectText(text)
      .clauses.filter((clause) => clause.kind === 'tier-outcome')
      .find((clause) => clause.data.band === '17+');
    expect(tier17).toBeDefined();
    if (!tier17) return;

    const { intents, unexecuted } = tierOutcomeToIntents(tier17.data, {
      intentIdPrefix: 'bfb-17',
      actorParticipantId: 'fury',
      targetParticipantId: 'target',
      effectArtifactId: 'mcdm.heroes.v1/feature.ability.fury.level-1/blood-for-blood',
    });
    // Damage (10 + M) and the potency gate are explicit backlog items, not drops.
    expect(unexecuted.map((item) => item.part).sort()).toEqual(['damage', 'potency']);

    const before = freshState();
    const { state } = executeIntents(before, intents, createSeededRandomSource(1));

    // EXHAUSTIVE delta: the target gains exactly these two instances, in this
    // order, with these endings and provenance — and nothing else changes.
    expect(state).toEqual(
      upgradeEncounterState({
        schemaVersion: 5,
        terrainFacts: [],
        squads: [],
        participants: {
          fury: {
            id: 'fury',
            conditions: [],
            kind: 'hero',
            stats: null,
            stamina: null,
            grants: [],
          },
          target: {
            id: 'target',
            kind: 'director-creature',
            stats: null,
            stamina: null,
            grants: [],
            conditions: [
              {
                instanceId: 'mcdm.heroes.v1/condition/bleeding#bfb-17-0',
                conditionId: 'mcdm.heroes.v1/condition/bleeding',
                ending: { kind: 'save-ends' },
                source: {
                  participantId: 'fury',
                  effectArtifactId: 'mcdm.heroes.v1/feature.ability.fury.level-1/blood-for-blood',
                },
              },
              {
                instanceId: 'mcdm.heroes.v1/condition/weakened#bfb-17-1',
                conditionId: 'mcdm.heroes.v1/condition/weakened',
                ending: { kind: 'save-ends' },
                source: {
                  participantId: 'fury',
                  effectArtifactId: 'mcdm.heroes.v1/feature.ability.fury.level-1/blood-for-blood',
                },
              },
            ],
          },
        },
      }),
    );
  });

  it('round-trips: both conditions can then be saved off at end of turn', async () => {
    const text = await ingestText(
      'en/books/heroes/md/feature/ability/fury/level-1/blood-for-blood.md',
    );
    const tier = parseEffectText(text)
      .clauses.filter((clause) => clause.kind === 'tier-outcome')
      .find((clause) => clause.data.band === '≤11');
    if (!tier) throw new Error('missing tier');
    const { intents } = tierOutcomeToIntents(tier.data, {
      intentIdPrefix: 'bfb-low',
      actorParticipantId: 'fury',
      targetParticipantId: 'target',
      effectArtifactId: 'mcdm.heroes.v1/feature.ability.fury.level-1/blood-for-blood',
    });
    const applied = executeIntents(freshState(), intents, createSeededRandomSource(1));
    const withRolls = executeIntents(
      applied.state,
      [
        {
          intentId: 'turn-1',
          kind: 'end-turn',
          actor: { kind: 'participant', participantId: 'target' },
          payload: {
            participantId: 'target',
            rolls: {
              'mcdm.heroes.v1/condition/bleeding#bfb-low-0': 6,
              'mcdm.heroes.v1/condition/weakened#bfb-low-1': 6,
            },
          },
        },
      ],
      createSeededRandomSource(1),
    );
    expect(withRolls.state.participants.target?.conditions).toEqual([]);
  });

  it('threads assertedAbilityUse through the binding seam (B-2): the first intent carries the debit, the rest share via partOf', async () => {
    // Binding-shaped seam [R-0029/R-0030]: the host supplies the ability-use
    // assertion per dispatch from the tier clause's owning compiled header;
    // the adapter threads it so asserted-band condition application debits
    // the economy exactly once (the squad-attack family's asserted paths
    // reuse this same seam).
    const abilityArtifactId = 'mcdm.heroes.v1/feature.ability.fury.level-1/blood-for-blood';
    const text = await ingestText(
      'en/books/heroes/md/feature/ability/fury/level-1/blood-for-blood.md',
    );
    const parse = parseEffectText(text);
    const { abilities } = compileAbilities(parse, abilityArtifactId);
    const compiled = abilities[0];
    expect(compiled?.actionCost).toBe('main-action');
    if (!compiled || compiled.actionCost === null) return;

    const tier17 = parse.clauses
      .filter((clause) => clause.kind === 'tier-outcome')
      .find((clause) => clause.data.band === '17+');
    if (!tier17) throw new Error('missing tier');
    const { intents } = tierOutcomeToIntents(tier17.data, {
      intentIdPrefix: 'bfb-asserted',
      actorParticipantId: 'fury',
      targetParticipantId: 'target',
      effectArtifactId: abilityArtifactId,
      assertedAbilityUse: {
        actorParticipantId: 'fury',
        abilityArtifactId: compiled.abilityArtifactId,
        actionCost: compiled.actionCost,
        usesPerRound: compiled.usesPerRound,
      },
    });
    // blood-for-blood 17+ applies two conditions → two intents.
    expect(intents).toHaveLength(2);
    type ApplyCondition = Extract<Intent, { kind: 'apply-condition' }>;
    const first = intents[0] as ApplyCondition;
    const second = intents[1] as ApplyCondition;
    expect(first.payload.assertedAbilityUse).toEqual({
      actorParticipantId: 'fury',
      abilityArtifactId,
      actionCost: 'main-action',
      usesPerRound: null,
    });
    expect(second.payload.assertedAbilityUse).toEqual({
      actorParticipantId: 'fury',
      abilityArtifactId,
      actionCost: 'main-action',
      usesPerRound: null,
      partOf: 'bfb-asserted-0',
    });

    // Fires in anger: in combat the seam produces exactly ONE main-action
    // debit for the whole tier, and both conditions still land.
    const combatIntents: Intent[] = [
      {
        intentId: 'bfb-bc',
        kind: 'begin-combat',
        actor: { kind: 'director' },
        payload: { firstSide: 'heroes', roll: 7 },
      },
      {
        intentId: 'bfb-st',
        kind: 'start-turn',
        actor: { kind: 'director' },
        payload: { turnId: 'fury' },
      },
    ];
    const combat = executeIntents(freshState(), combatIntents, createSeededRandomSource(1));
    const { state } = executeIntents(combat.state, intents, createSeededRandomSource(1));
    expect(state.participants.fury?.actionBudget['main-action']?.used).toBe(1);
    expect(state.participants.target?.conditions.map((instance) => instance.conditionId)).toEqual([
      'mcdm.heroes.v1/condition/bleeding',
      'mcdm.heroes.v1/condition/weakened',
    ]);
  });
});

// Verbatim slice of the pinned devil-adjudicator statblock: the Infernal
// Injunction power-roll cluster, then Adjudicator's Interdiction whose test
// Effect is followed by tier bullets. Interdiction's `17+` bullet parses in
// the supported tier grammar; before the R-0011 ownership hardening it leaked
// into Infernal Injunction's cluster as a duplicate tier-3 line and
// suppressed the entire certifiable ability.
const ADJUDICATOR_LEAK_SLICE = `> 🏹 **Infernal Injunction (Signature Ability)**
>
> | **Magic, Ranged, Strike** |                 **[Main action](scc.v1:mcdm.heroes.v1/rule.combat/turn)** |
> |---------------------------|--------------------------------:|
> | **📏 Ranged 10**          | **🎯 Two creatures or objects** |
>
> **Power Roll + 3:**
>
> - **≤11:** 10 fire damage; I < 1 [frightened](scc.v1:mcdm.heroes.v1/condition/frightened) (save ends)
> - **12-16:** 15 fire damage; I < 1 [frightened](scc.v1:mcdm.heroes.v1/condition/frightened) (save ends)
> - **17+:** 18 fire damage; I < 1 [frightened](scc.v1:mcdm.heroes.v1/condition/frightened) (save ends)
>
> **Effect:** The adjudicator can slide a target [frightened](scc.v1:mcdm.heroes.v1/condition/frightened) by this ability up to 2 squares.

> 🏹 **Adjudicator's Interdiction**
>
> | **Magic, Ranged** |     **[Main action](scc.v1:mcdm.heroes.v1/rule.combat/turn)** |
> |-------------------|--------------------:|
> | **📏 Ranged 10**  | **🎯 One creature** |
>
> **Effect:** The target makes a Presence test.
>
> - **≤11:** The target is [slowed](scc.v1:mcdm.heroes.v1/condition/slowed), takes a [bane](scc.v1:mcdm.heroes.v1/rule.dice/bane) on power rolls, and can't regain [Stamina](scc.v1:mcdm.heroes.v1/rule.health/stamina) (save ends).
> - **12-16:** The target is [slowed](scc.v1:mcdm.heroes.v1/condition/slowed) and takes a [bane](scc.v1:mcdm.heroes.v1/rule.dice/bane) on power rolls (save ends).
> - **17+:** [Slowed](scc.v1:mcdm.heroes.v1/condition/slowed) (save ends)

`;

describe('compileAbilities cluster ownership (R-0011 hardening)', () => {
  it('does not leak tier bullets across an intervening Effect line or ability header', () => {
    const parse = parseEffectText(ADJUDICATOR_LEAK_SLICE);
    const { abilities, incomplete } = compileAbilities(parse, 'fixture');
    // Infernal Injunction compiles as a complete ability; Interdiction's
    // parsed 17+ bullet must NOT join it (no duplicate-tier suppression).
    expect(incomplete).toEqual([]);
    expect(abilities).toHaveLength(1);
    expect(abilities[0]?.powerRollBonus).toEqual({ kind: 'fixed', value: 3 });
    expect(abilities[0]?.targetsText).toBe('Two creatures or objects');
    // Header keywords flow into the compiled ability — the Strike keyword
    // decides strike-scoped grant consumption [rule.combat/strike, R-0013].
    expect(abilities[0]?.keywords).toEqual(['Magic', 'Ranged', 'Strike']);
  });

  it('closes an open cluster at intervening residue prose', () => {
    // Verbatim Infernal Injunction cluster with the verbatim Vexatious
    // Litigation trait line (residue prose) spliced between the power roll
    // heading's tier lines and a stray verbatim tier bullet from
    // Interdiction — the bullet must not attach across the residue.
    const spliced = `> **Power Roll + 3:**
>
> - **≤11:** 10 fire damage; I < 1 [frightened](scc.v1:mcdm.heroes.v1/condition/frightened) (save ends)
> - **12-16:** 15 fire damage; I < 1 [frightened](scc.v1:mcdm.heroes.v1/condition/frightened) (save ends)
> - **17+:** 18 fire damage; I < 1 [frightened](scc.v1:mcdm.heroes.v1/condition/frightened) (save ends)
>
> Any creature within 10 squares of the adjudicator who has P < 3 takes a −2 penalty to saving throws.
>
> - **17+:** [Slowed](scc.v1:mcdm.heroes.v1/condition/slowed) (save ends)
`;
    const parse = parseEffectText(spliced);
    const { abilities, incomplete } = compileAbilities(parse, 'fixture');
    expect(incomplete).toEqual([]);
    expect(abilities).toHaveLength(1);
  });
});

describe.skipIf(!sourceRoot)('hero-format keyword compilation (R-0013)', () => {
  it('the free strike compiles with its linked Strike keyword recognized', async () => {
    // R-0013: free strikes carry the Strike keyword and consume strike-scoped
    // grants. Hero-format records link their keywords
    // ("[Strike](scc.v1:…)") — the header parser must strip the links so
    // the compiled ability carries the plain keyword.
    const text = await ingestText(
      'en/books/heroes/md/feature/ability/common/melee-weapon-free-strike.md',
    );
    const { abilities, incomplete } = compileAbilities(parseEffectText(text), 'free-strike');
    expect(incomplete).toEqual([]);
    expect(abilities).toHaveLength(1);
    expect(abilities[0]?.keywords).toContain('Strike');
  });
});
