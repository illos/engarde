import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { sha256 } from './bytes.js';
import { EFFECT_CANON_PIN } from './effect-canon-expectations.js';
import { loadCoreEffectFixtures } from './effect-corpus-fixtures.js';
import { EffectPresentationRulingsSchema } from './effect-presentation-rulings.js';
import { NarrativeTriageRulingsSchema } from './narrative-triage.js';

const manifestPath = resolve(
  process.env.ENGARDE_CANON_MANIFEST ??
    '../../.artifacts/canon/campaign/accepted/final-campaign-manifest.json',
);

const presentationPath = fileURLToPath(
  new URL('../config/effect-presentation-rulings.json', import.meta.url),
);
const narrativePath = fileURLToPath(
  new URL('../config/narrative-triage-rulings.json', import.meta.url),
);

function effectKey(artifactId: string, effectOrdinal: number): string {
  return `${artifactId}#${effectOrdinal}`;
}

describe('Effect presentation rulings', () => {
  it('freezes the accepted DEC-0011 census', async () => {
    const manifest = EffectPresentationRulingsSchema.parse(
      JSON.parse(await readFile(presentationPath, 'utf8')),
    );
    expect(manifest.canonPin).toBe(EFFECT_CANON_PIN);
    expect(manifest.rulings).toHaveLength(119);
    expect(manifest.rulings.filter((ruling) => ruling.hostOwnership === 'VTT')).toHaveLength(107);
    expect(
      manifest.rulings.filter((ruling) => ruling.hostOwnership === 'engine-mixed'),
    ).toHaveLength(12);

    const keys = manifest.rulings.map((ruling) =>
      effectKey(ruling.artifactId, ruling.effectOrdinal),
    );
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual([...keys].sort());
  });
});

describe.skipIf(!existsSync(manifestPath))('Effect presentation rulings (accepted pin)', () => {
  it('drift-checks all accepted rows and enforces the 1,490-line pending count', async () => {
    const presentation = EffectPresentationRulingsSchema.parse(
      JSON.parse(await readFile(presentationPath, 'utf8')),
    );
    const narrative = NarrativeTriageRulingsSchema.parse(
      JSON.parse(await readFile(narrativePath, 'utf8')),
    );
    const fixtures = await loadCoreEffectFixtures(manifestPath);
    const tableFixtures = fixtures.filter((fixture) => fixture.program.resolution.kind === 'table');
    expect(tableFixtures).toHaveLength(1621);

    const tableByKey = new Map(
      tableFixtures.map((fixture) => [
        effectKey(fixture.artifactId, fixture.clauseOrdinal),
        fixture,
      ]),
    );
    const presentationKeys = new Set<string>();
    for (const ruling of presentation.rulings) {
      const key = effectKey(ruling.artifactId, ruling.effectOrdinal);
      const fixture = tableByKey.get(key);
      expect(fixture, `${key} must remain a table-directed Effect instruction`).toBeDefined();
      expect(ruling.payloadSha256, `${key} payload drift`).toBe(
        sha256(fixture?.program.sourceText ?? ''),
      );
      presentationKeys.add(key);
    }

    const permanentlyManualKeys = new Set(
      narrative.rulings
        .filter((ruling) => ruling.status === 'never')
        .map((ruling) => effectKey(ruling.artifactId, ruling.effectOrdinal)),
    );
    expect(permanentlyManualKeys.size).toBe(12);
    for (const key of presentationKeys) expect(permanentlyManualKeys.has(key)).toBe(false);

    const pending = tableFixtures.filter((fixture) => {
      const key = effectKey(fixture.artifactId, fixture.clauseOrdinal);
      return !presentationKeys.has(key) && !permanentlyManualKeys.has(key);
    });
    expect(pending).toHaveLength(1490);
  });
});
