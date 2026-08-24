import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { sha256 } from './bytes.js';
import { EFFECT_CANON_PIN } from './effect-canon-expectations.js';
import { loadCoreEffectFixtures } from './effect-corpus-fixtures.js';
import {
  NarrativeTriageRulingsSchema,
  buildNarrativeTriage,
  detectMechanicalSignals,
  renderNarrativeTriageHtml,
} from './narrative-triage.js';

const manifestPath = resolve(
  process.env.ENGARDE_CANON_MANIFEST ??
    '../../.artifacts/canon/campaign/accepted/final-campaign-manifest.json',
);

// Verbatim corpus payloads (accepted pin) — never edited, never paraphrased.
const BASILISK_LINE = 'The basilisk spits up a chunk of partly digested stone.'; // basilisk-malice #1
const PREMONITION_LINE = 'Each target receives a premonition of their imminent death.'; // omen-dragon #5
const PORTAL_LINE =
  'On a [critical hit](scc.v1:mcdm.heroes.v1/rule.combat/critical-hit), the target is [grabbed](scc.v1:mcdm.heroes.v1/condition/grabbed) by the demon and [pulled](scc.v1:mcdm.heroes.v1/movement/forced-movement) through the portal before it closes, never to be seen again.'; // demon-door #1

describe('narrative triage signal detection', () => {
  it('flags zero-signal narrative lines as candidates', () => {
    expect(detectMechanicalSignals(BASILISK_LINE)).toEqual([]);
    expect(detectMechanicalSignals(PREMONITION_LINE)).toEqual([]);
  });

  it('keeps mechanically-worded lines out of the zero-signal pass, even narrative ones', () => {
    // Known pass-1 limitation, documented on purpose: the demon-door line is
    // narratively terminal but carries condition + movement vocabulary, so it
    // is NOT a zero-signal candidate. Widening is the --max-signals knob.
    const signals = detectMechanicalSignals(PORTAL_LINE);
    expect(signals).toContain('condition');
    expect(signals).toContain('movement');
  });

  it('accepts a valid rulings blob and rejects an unknown status', () => {
    const blob = {
      schema: 'engarde-narrative-triage-rulings-v1',
      canonPin: EFFECT_CANON_PIN,
      exportedAt: '2026-08-24T00:00:00.000Z',
      rulings: [
        {
          artifactId: 'mcdm.monsters.v1/monster.basilisk/basilisk-malice',
          effectOrdinal: 1,
          payloadSha256: sha256(BASILISK_LINE),
          status: 'never',
          comment: 'pure fiction',
        },
      ],
    };
    expect(NarrativeTriageRulingsSchema.parse(blob).rulings).toHaveLength(1);
    expect(() =>
      NarrativeTriageRulingsSchema.parse({
        ...blob,
        rulings: [{ ...blob.rulings[0], status: 'maybe' }],
      }),
    ).toThrow();
  });
});

describe.skipIf(!existsSync(manifestPath))('narrative triage (accepted pin)', () => {
  it('freezes the zero-signal candidate set and keeps rulings drift-keyed', async () => {
    const fixtures = await loadCoreEffectFixtures(manifestPath);
    const report = buildNarrativeTriage(fixtures, EFFECT_CANON_PIN);

    expect(report.canonPin).toBe(EFFECT_CANON_PIN);
    expect(report.tablePrograms).toBe(1676);
    // Frozen at the accepted pin: a signal-table or corpus change must
    // surface here on purpose.
    expect(report.candidates).toHaveLength(24);

    for (const candidate of report.candidates) {
      expect(detectMechanicalSignals(candidate.sourceText)).toEqual([]);
      expect(candidate.signals).toEqual([]);
      expect(candidate.payloadSha256).toBe(sha256(candidate.sourceText));
      expect(candidate.artifactText).toContain(candidate.sourceText);
    }

    // Known zero-signal members stay members.
    const ids = report.candidates.map((c) => `${c.artifactId}#${c.effectOrdinal}`);
    expect(ids).toContain('mcdm.monsters.v1/monster.basilisk/basilisk-malice#1');
    expect(ids).toContain('mcdm.monsters.v1/monster.dragon.statblock/omen-dragon#5');

    // Widening the net is monotonic and frozen at max-signals = 1.
    const widened = buildNarrativeTriage(fixtures, EFFECT_CANON_PIN, 1);
    expect(widened.candidates).toHaveLength(335);
    for (const id of ids) {
      expect(widened.candidates.map((c) => `${c.artifactId}#${c.effectOrdinal}`)).toContain(id);
    }

    // The review page embeds every candidate card with its drift key.
    const html = renderNarrativeTriageHtml(report);
    for (const candidate of report.candidates) {
      expect(html).toContain(candidate.payloadSha256);
    }
    expect(html).toContain('engarde-narrative-triage-rulings-v1');
  });

  it('enforces the committed user rulings manifest (2026-08-24 review)', async () => {
    const rulingsPath = fileURLToPath(
      new URL('../config/narrative-triage-rulings.json', import.meta.url),
    );
    const rulings = NarrativeTriageRulingsSchema.parse(
      JSON.parse(await readFile(rulingsPath, 'utf8')),
    );
    expect(rulings.canonPin).toBe(EFFECT_CANON_PIN);

    const fixtures = await loadCoreEffectFixtures(manifestPath);
    const report = buildNarrativeTriage(fixtures, EFFECT_CANON_PIN);
    const candidateSha = new Map(
      report.candidates.map((c) => [`${c.artifactId}#${c.effectOrdinal}`, c.payloadSha256]),
    );

    // Complete, drift-keyed coverage: every zero-signal candidate has exactly
    // one decided ruling whose SHA matches the live payload bytes, and no
    // ruling points at a line that is no longer a candidate.
    const ruledKeys = rulings.rulings.map((r) => `${r.artifactId}#${r.effectOrdinal}`);
    expect(new Set(ruledKeys).size).toBe(ruledKeys.length);
    expect(new Set(ruledKeys)).toEqual(new Set(candidateSha.keys()));
    for (const ruling of rulings.rulings) {
      expect(ruling.status).not.toBe('unreviewed');
      expect(ruling.payloadSha256).toBe(
        candidateSha.get(`${ruling.artifactId}#${ruling.effectOrdinal}`),
      );
    }

    // Frozen outcome of the user's review: 12 never / 12 engine-plausible.
    const statuses = rulings.rulings.map((r) => r.status);
    expect(statuses.filter((s) => s === 'never')).toHaveLength(12);
    expect(statuses.filter((s) => s === 'engine-plausible')).toHaveLength(12);
  });
});
