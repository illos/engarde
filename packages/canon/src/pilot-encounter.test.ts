import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runPilotEncounter } from './pilot-encounter.js';

const sourceRoot = process.env.ENGARDE_CORPUS_ROOT
  ? resolve(process.env.ENGARDE_CORPUS_ROOT)
  : undefined;

async function loadPaired(markdownPath: string) {
  const jsonPath = markdownPath.replace('/md/', '/json/').replace(/\.md$/, '.json');
  return {
    markdownPath,
    markdown: await readFile(resolve(sourceRoot ?? '', markdownPath)),
    jsonPath,
    json: await readFile(resolve(sourceRoot ?? '', jsonPath)),
  };
}

describe.skipIf(!sourceRoot)('scripted pilot mini-encounter', () => {
  it('runs violation-free and ends in the expected final state', async () => {
    const { transcript, summary } = await runPilotEncounter(loadPaired);

    expect(transcript.violationCount).toBe(0);
    // 4 grammar-compiled condition applications + 4 play intents.
    expect(transcript.steps).toHaveLength(8);

    // Final state: everything swept at encounter end except the fury's
    // explicitly kept dazed instance.
    const fury = transcript.finalState.participants.fury;
    const censor = transcript.finalState.participants.censor;
    expect(censor?.conditions).toEqual([]);
    expect(fury?.conditions.map((instance) => instance.conditionId)).toEqual([
      'mcdm.heroes.v1/condition/dazed',
    ]);

    // The abilities really are the corpus records.
    expect(summary.abilitiesUsed.map((a) => a.artifactId)).toEqual([
      'mcdm.heroes.v1/feature.ability.fury.level-1/blood-for-blood',
      'mcdm.heroes.v1/feature.ability.censor.level-2/sentenced',
      'mcdm.monsters.v1/dynamic-terrain.environmental-hazards/toxic-plants',
    ]);
    // Damage and potency stay explicit backlog, never silently dropped.
    expect(summary.unexecuted.filter((u) => u.part === 'damage')).toHaveLength(2);
    expect(summary.unexecuted.filter((u) => u.part === 'potency')).toHaveLength(3);
    expect(summary.knownUnknowns.length).toBeGreaterThan(0);

    // Deterministic transcript for a fixed script.
    const again = await runPilotEncounter(loadPaired);
    expect(JSON.stringify(again.transcript)).toBe(JSON.stringify(transcript));
  });
});
