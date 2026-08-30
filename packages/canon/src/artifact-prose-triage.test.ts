import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ArtifactProseRulingsSchema,
  isPlainProseResidue,
  loadArtifactProseTriage,
  renderArtifactProseTriageHtml,
  selectArtifactProseCandidates,
  validateArtifactProseRulings,
} from './artifact-prose-triage.js';
import { sha256 } from './bytes.js';
import { detectMechanicalSignals } from './narrative-triage.js';

const manifestPath = resolve(
  process.env.ENGARDE_CANON_MANIFEST ??
    '../../.artifacts/canon/campaign/accepted/final-campaign-manifest.json',
);
const sourceRoot = process.env.ENGARDE_CORPUS_ROOT
  ? resolve(process.env.ENGARDE_CORPUS_ROOT)
  : undefined;
const CANON_PIN = '520553438a4e8d199bfaaf676b8aa9bd273f4d61';

describe('whole-artifact prose candidate boundary', () => {
  it('accepts paragraphs/headings and rejects rule-shaped structures', () => {
    expect(isPlainProseResidue('## Setting\n\nOrdinary narrative prose.\n')).toBe(true);
    expect(isPlainProseResidue('- selectable option\n')).toBe(false);
    expect(isPlainProseResidue('| value | result |\n')).toBe(false);
    expect(isPlainProseResidue('> quoted rule\n')).toBe(false);
    expect(isPlainProseResidue('**Benefit:** something\n')).toBe(false);
  });

  it('validates drift-keyed review output', () => {
    expect(
      ArtifactProseRulingsSchema.parse({
        schema: 'engarde-artifact-prose-rulings-v1',
        canonPin: CANON_PIN,
        exportedAt: '2026-08-25T00:00:00.000Z',
        rulings: [
          {
            artifactId: 'mcdm.heroes.v1/chapter/example#lore',
            artifactVersion: 'a'.repeat(64),
            status: 'not-a-rule',
          },
        ],
      }).rulings,
    ).toHaveLength(1);
  });

  it('requires total, unique, version-current rulings', () => {
    const artifactVersion = 'a'.repeat(64);
    const report = {
      schema: 'engarde-artifact-prose-triage-v1' as const,
      canonPin: CANON_PIN,
      acceptedArtifacts: 1,
      candidates: [
        {
          artifactId: 'mcdm.heroes.v1/chapter/example#lore',
          artifactVersion,
          sourcePath: 'en/books/heroes/chapters/md/example.md',
          book: 'heroes' as const,
          sourceSpan: { byteStart: 0, byteEnd: 5, lineStart: 1, lineEnd: 1 },
          sourceText: 'Lore.',
          sourceSha256: artifactVersion,
          residueText: 'Lore.',
          residueSha256: 'b'.repeat(64),
          signals: [],
        },
      ],
    };
    const accepted = validateArtifactProseRulings(report, {
      schema: 'engarde-artifact-prose-rulings-v1',
      canonPin: CANON_PIN,
      exportedAt: '2026-08-25T00:00:00.000Z',
      rulings: [
        {
          artifactId: report.candidates[0]?.artifactId,
          artifactVersion,
          status: 'not-a-rule',
        },
      ],
    });
    expect(accepted).toMatchObject({
      ok: true,
      expected: 1,
      ruled: 1,
      counts: { 'not-a-rule': 1, 'engine-or-app': 0, unclear: 0 },
    });

    const stale = validateArtifactProseRulings(report, {
      schema: 'engarde-artifact-prose-rulings-v1',
      canonPin: CANON_PIN,
      exportedAt: '2026-08-25T00:00:00.000Z',
      rulings: [
        {
          artifactId: report.candidates[0]?.artifactId,
          artifactVersion: 'c'.repeat(64),
          status: 'not-a-rule',
        },
      ],
    });
    expect(stale.ok).toBe(false);
    expect(stale.findings.map((finding) => finding.code)).toEqual(['artifact-version-mismatch']);
  });
});

describe.skipIf(!existsSync(manifestPath))('whole-artifact prose triage (accepted pin)', () => {
  it('freezes and provenance-checks the conservative candidate inventory', async () => {
    const report = await loadArtifactProseTriage(manifestPath);
    expect(report.canonPin).toBe(CANON_PIN);
    // The triage funnel is deliberately scoped to the two core books; the
    // campaign manifest itself carries 3,785 artifacts since the Summoner
    // admission, of which the heroes/monsters core is this frozen 3,529.
    expect(report.acceptedArtifacts).toBe(3529);
    expect(report.candidates).toHaveLength(365);
    expect(new Set(report.candidates.map((candidate) => candidate.artifactId)).size).toBe(365);

    for (const candidate of report.candidates) {
      expect(candidate.signals, candidate.artifactId).toEqual([]);
      expect(detectMechanicalSignals(candidate.residueText), candidate.artifactId).toEqual([]);
      expect(candidate.sourceSha256, candidate.artifactId).toBe(candidate.artifactVersion);
      expect(candidate.sourceSha256, candidate.artifactId).toBe(sha256(candidate.sourceText));
      expect(candidate.residueSha256, candidate.artifactId).toBe(sha256(candidate.residueText));
      if (sourceRoot) {
        const source = await readFile(resolve(sourceRoot, candidate.sourcePath));
        const exact = source.subarray(candidate.sourceSpan.byteStart, candidate.sourceSpan.byteEnd);
        expect(exact.toString('utf8'), candidate.artifactId).toBe(candidate.sourceText);
        expect(sha256(exact), candidate.artifactId).toBe(candidate.artifactVersion);
      }
    }

    const inventoryDigest = sha256(
      report.candidates
        .map(
          (candidate) =>
            `${candidate.artifactId}\0${candidate.artifactVersion}\0${candidate.residueSha256}`,
        )
        .join('\n'),
    );
    expect(inventoryDigest).toBe(
      'cef679b5aa6a34a0dd3b2056e978bed8f262cf6da3367c711e10b19ab5694375',
    );

    const html = renderArtifactProseTriageHtml(report);
    expect(html).toContain('365 candidates');
    for (const candidate of report.candidates.slice(0, 5)) {
      expect(html).toContain(candidate.artifactVersion);
      expect(html).toContain(candidate.artifactId);
    }
  });

  it('enforces the committed user-approved not-a-rule batch', async () => {
    const rulingsPath = fileURLToPath(
      new URL('../config/artifact-prose-rulings.json', import.meta.url),
    );
    const rulings = ArtifactProseRulingsSchema.parse(
      JSON.parse(await readFile(rulingsPath, 'utf8')),
    );
    expect(rulings.canonPin).toBe(CANON_PIN);
    expect(rulings.rulings).toHaveLength(9);
    expect(new Set(rulings.rulings.map((ruling) => ruling.artifactId)).size).toBe(9);
    expect(rulings.rulings.every((ruling) => ruling.status === 'not-a-rule')).toBe(true);

    const full = await loadArtifactProseTriage(manifestPath);
    const accepted = selectArtifactProseCandidates(
      full,
      rulings.rulings.map((ruling) => ruling.artifactId),
    );
    const validation = validateArtifactProseRulings(accepted, rulings);
    expect(validation).toEqual({
      ok: true,
      expected: 9,
      ruled: 9,
      counts: { 'not-a-rule': 9, 'engine-or-app': 0, unclear: 0 },
      findings: [],
    });
  });
});
