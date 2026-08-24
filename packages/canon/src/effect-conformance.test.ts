import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { type EncounterState, createSeededRandomSource } from '@engarde/engine';
import { describe, expect, it } from 'vitest';
import { executeIntents, tierOutcomeToIntents } from './effect-conformance.js';
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
  return {
    schemaVersion: 2,
    participants: {
      fury: { id: 'fury', conditions: [], kind: 'hero', stats: null, stamina: null },
      target: {
        id: 'target',
        conditions: [],
        kind: 'director-creature',
        stats: null,
        stamina: null,
      },
    },
  };
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
    expect(state).toEqual({
      schemaVersion: 2,
      participants: {
        fury: { id: 'fury', conditions: [], kind: 'hero', stats: null, stamina: null },
        target: {
          id: 'target',
          kind: 'director-creature',
          stats: null,
          stamina: null,
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
    });
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
});
