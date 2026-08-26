import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compileAbilities, compileEffectPrograms } from './effect-conformance.js';
import { parseEffectText } from './effect-grammar.js';
import { ingestStructuredRecord } from './extract.js';
import type { ArtifactRecord } from './schemas.js';

/**
 * Common-actions accounting (design §3: "Counts on the accounting card: 17
 * features + 5 companions"), shipped as a count-frozen corpus test so a pin
 * bump breaks loudly instead of silently growing or shrinking the surface.
 *
 * The 17 `feature.common.*` records are PROSE features — no `**Effect:**`
 * line, no power roll — carried verbatim by the stitched model as accounted
 * table directives (never dropped, never paraphrased). The roll-bearing
 * halves live in the 5 `feature.ability.common` companion artifacts named
 * by the design, which compile through the ordinary ability pipeline.
 */

const sourceRoot = process.env.ENGARDE_CORPUS_ROOT
  ? resolve(process.env.ENGARDE_CORPUS_ROOT)
  : undefined;

const COMMON_ROOT = 'en/books/heroes/md/feature/common';
const COMPANION_ROOT = 'en/books/heroes/md/feature/ability/common';

/** The design-named companions (docs/action-economy-design.md §1: "the
 * roll-bearing halves live in 5 companion ability artifacts"). */
const COMPANION_FILES = [
  'escape-grab.md',
  'grab.md',
  'knockback.md',
  'melee-weapon-free-strike.md',
  'ranged-weapon-free-strike.md',
] as const;

async function ingestArtifact(markdownPath: string): Promise<ArtifactRecord> {
  const jsonPath = markdownPath.replace('/md/', '/json/').replace(/\.md$/, '.json');
  const bundle = ingestStructuredRecord({
    markdownPath,
    markdown: await readFile(resolve(sourceRoot ?? '', markdownPath)),
    jsonPath,
    json: await readFile(resolve(sourceRoot ?? '', jsonPath)),
  });
  const artifact = bundle.records.find(
    (record): record is ArtifactRecord => record.recordKind === 'artifact',
  );
  if (!artifact) throw new Error(`no artifact in ${markdownPath}`);
  return artifact;
}

/** Losslessness = accounted: every byte of the artifact text is owned by a
 * parse span (clause or residue) — the stitched model carries the prose
 * verbatim; nothing is dropped. */
function reconstructedText(text: string): string {
  const parse = parseEffectText(text);
  const spans = [
    ...parse.clauses.map((clause) => clause.span),
    ...parse.residue.map((item) => item.span),
  ].sort((left, right) => left.byteStart - right.byteStart);
  return spans.map((span) => span.text).join('');
}

describe.skipIf(!sourceRoot)(
  'common-actions accounting (design §3, count-frozen at the pin)',
  () => {
    it('enumerates exactly 17 feature.common.* prose artifacts (4 main-actions, 10 maneuvers, 3 move-actions), each carried losslessly', async () => {
      const groups: Array<{ dir: string; idPrefix: string; count: number }> = [
        { dir: 'main-actions', idPrefix: 'mcdm.heroes.v1/feature.common.main-actions/', count: 4 },
        { dir: 'maneuvers', idPrefix: 'mcdm.heroes.v1/feature.common.maneuvers/', count: 10 },
        { dir: 'move-actions', idPrefix: 'mcdm.heroes.v1/feature.common.move-actions/', count: 3 },
      ];
      let total = 0;
      for (const group of groups) {
        const files = (await readdir(resolve(sourceRoot ?? '', COMMON_ROOT, group.dir)))
          .filter((name) => name.endsWith('.md'))
          .sort();
        expect(files, group.dir).toHaveLength(group.count);
        total += files.length;
        for (const file of files) {
          const artifact = await ingestArtifact(`${COMMON_ROOT}/${group.dir}/${file}`);
          expect(artifact.id.startsWith(group.idPrefix), `${file}: ${artifact.id}`).toBe(true);
          // Accounted, never dropped: the parse owns every byte of the prose
          // (the stitched model dispatches it as verbatim table directives).
          expect(reconstructedText(artifact.text), artifact.id).toBe(artifact.text);
        }
      }
      // The frozen accounting-card count [design §3]. A pin bump that adds or
      // removes a common action breaks here loudly.
      expect(total).toBe(17);
    });

    it('accounts for the 5 design-named feature.ability.common companions: compiled or honestly incomplete, never guessed', async () => {
      // The directory at the accepted pin holds 7 ability artifacts; the
      // design's common-actions surface names exactly these 5 as the
      // roll-bearing companions of the prose features. Frozen so a pin bump
      // that changes the directory breaks loudly.
      const files = (await readdir(resolve(sourceRoot ?? '', COMPANION_ROOT)))
        .filter((name) => name.endsWith('.md'))
        .sort();
      expect(files).toHaveLength(7);
      const dispositions: Record<string, string> = {};
      for (const companion of COMPANION_FILES) {
        expect(files).toContain(companion);
        const artifact = await ingestArtifact(`${COMPANION_ROOT}/${companion}`);
        const parse = parseEffectText(artifact.text);
        const { abilities, incomplete } = compileAbilities(parse, artifact.id);
        const programs = compileEffectPrograms(parse, artifact.id);
        // The compiled economy half never carries residue at the pin: every
        // printed header cost normalizes [R-0029].
        for (const shape of [...abilities, ...programs]) {
          expect(shape.actionCostResidue, artifact.id).toBeNull();
        }
        if (abilities.length > 0 && incomplete.length === 0) {
          dispositions[companion] = `compiled:${abilities[0]?.actionCost}`;
        } else {
          // Honestly incomplete: the power-roll cluster is reported with
          // its missing tier lines (prose the closed tier grammar refuses
          // — never guessed), while the printed cost still annotates onto
          // the artifact's accounted Effect directive(s).
          expect(incomplete.length, artifact.id).toBeGreaterThanOrEqual(1);
          expect(programs.length, artifact.id).toBeGreaterThanOrEqual(1);
          dispositions[companion] = `accounted:${programs[0]?.actionCost}`;
        }
      }
      // The frozen per-companion split at the accepted pin: the two free
      // strikes compile end-to-end; Grab / Escape Grab / Knockback carry
      // prose tier outcomes outside the closed tier grammar and ride as
      // accounted maneuver-cost directives (stitched model, design §3).
      expect(dispositions).toEqual({
        'escape-grab.md': 'accounted:maneuver',
        'grab.md': 'accounted:maneuver',
        'knockback.md': 'accounted:maneuver',
        'melee-weapon-free-strike.md': 'compiled:main-action',
        'ranged-weapon-free-strike.md': 'compiled:main-action',
      });
    });
  },
);
