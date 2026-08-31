import type { Characteristics, ParticipantStats } from '@engarde/engine';
import { FURY_CLASS } from './fixtures/fury-class.verbatim.js';
import { KIT_RECORDS, STORMWIGHT_KIT_BONUS_RECORDS } from './fixtures/kits.verbatim.js';
import { type HeroBuild, projectDecisions } from './hero-document.js';
import {
  type ChoicePointRow,
  FEROCITY_SCC,
  FURY_L1_OVERLAY,
  chosenOptionKeys,
  isRowReachable,
} from './hero-overlay-fury.js';
import { HERO_LEVEL_MAX, HERO_LEVEL_MIN, heroStats } from './hero-stats.js';

/**
 * The hero compile seam (02-normative-schema.md §4): decision-log
 * projection → engine actor. Runs at the engine boundary (the backend
 * host, at encounter-seed time) — never inside the engine and never
 * persisted. One derivation home beside `heroStats`; kit and feature
 * contributions compose ABOVE `heroStats` (its documented NOT-included
 * contract), never inside it.
 *
 * Everything that does not deterministically map onto a shape the engine
 * already speaks becomes a RECEIPT (verbatim, resolve at the table) —
 * exactly the statblock partial-parse discipline. Automation never
 * guesses.
 *
 * DEC-0019 boundary (docs/character-builder/03-cross-encounter-state.md):
 * the compile snapshots STATIC derivations only — maxima,
 * characteristics, potencies, class identity. Current Stamina and
 * Recoveries remaining are SHEET-OWNED (`HeroRuntimeSchema.vitals`); the
 * encounter host reads them at seed time and writes changes back to the
 * character as they happen — never a compile output, never an
 * encounter-end write-back.
 */

type VerbatimRecord = {
  artifactId: string;
  slug: string;
  sourcePath: string;
  textSha256: string;
  text: string;
  structuredJson: string;
};

/**
 * Class records the compile can automate, keyed by scc. The Fury vertical
 * seeds exactly one; other classes compile to table mode (receipts) until
 * their verticals land.
 */
export const HERO_CLASS_RECORDS: Record<string, VerbatimRecord> = {
  [FURY_CLASS.artifactId]: FURY_CLASS,
};

const KIT_BY_SCC = new Map<string, VerbatimRecord>(
  KIT_RECORDS.map((record) => [record.artifactId, record]),
);

/** kit scc → its stormwight kit-bonuses feature record (the stormwight
 * kits print their bonuses in feature/fury/<kit>/kit-bonuses.md, not in
 * the kit record's frontmatter). */
const STORMWIGHT_BONUSES_BY_KIT = new Map<string, VerbatimRecord>(
  STORMWIGHT_KIT_BONUS_RECORDS.map((record) => [
    `mcdm.heroes.v1/kit/${record.artifactId.split('/')[1]?.split('.').pop() ?? ''}`,
    record,
  ]),
);

/**
 * Printed echelon bands (rule.general/echelon: ❝1st Echelon (1st to 3rd
 * Level)❞ / ❝2nd Echelon (4th to 6th Level)❞ / ❝3rd Echelon (7th to 9th
 * Level)❞ / ❝4th Echelon (10th Level)❞). ONE home — never re-derived.
 */
export function echelonOfLevel(level: number): number {
  if (!Number.isInteger(level) || level < HERO_LEVEL_MIN || level > HERO_LEVEL_MAX) {
    throw new Error(`No printed echelon for level ${level}`);
  }
  if (level <= 3) return 1;
  if (level <= 6) return 2;
  if (level <= 9) return 3;
  return 4;
}

/**
 * A kit Stamina bonus as printed: ❝+N per [echelon](…)❞ (kit frontmatter,
 * e.g. panther `stamina_bonus`) — folded per the chapter rule ❝Your kit's
 * Stamina bonus is added to your Stamina maximum and scales with your
 * echelon❞ (chapter/kits.md §Stamina Bonus). Anything else is residue.
 */
const STAMINA_PER_ECHELON = /^\+(\d+) per \[echelon\]/;

/** A stormwight kit-bonuses bullet, e.g.
 * `- **[Stamina](…) [Bonus](…):** +9 per [echelon](…)`. The Stamina line
 * folds; every other bullet stays a verbatim receipt. */
const STORMWIGHT_STAMINA_BULLET =
  /^- \*\*\[Stamina\]\([^)]*\) \[Bonus\]\([^)]*\):\*\* (\+\d+ per \[echelon\]\([^)]*\))\s*$/m;

/** Strip scc link markup for human-readable receipt text. */
function plainText(markdown: string): string {
  return markdown.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\*\*/g, '');
}

export type HeroCompileReceipt = {
  reason: string;
  canonRef: string | null;
};

export type HeroCompileResult = {
  /** null = table mode: no stat automation for this hero (receipts say why). */
  stats: ParticipantStats | null;
  /** Granted + chosen ability records — each flows through the existing
   * per-ability dispatch path (`useAbility` / `compileAbility`). */
  abilityArtifactIds: string[];
  /** Granted + chosen skills (display data — no engine representation). */
  skillSccs: string[];
  /** Heroic-resource pools the build grants (runtime region keys, §2.6). */
  resourceSccs: string[];
  /** NOT-automated parts: verbatim, resolve at the table. */
  receipts: HeroCompileReceipt[];
};

/** Kit frontmatter bonus fields with NO engine representation (speed,
 * stability, damage/distance/disengage bonuses live nowhere in
 * ParticipantStats) — surfaced verbatim, never silently dropped. Printed
 * semantics: chapter/kits.md §Kit Bonuses and Traits. */
const KIT_RECEIPT_FIELDS = [
  ['speed_bonus', 'Speed Bonus'],
  ['stability_bonus', 'Stability Bonus'],
  ['melee_damage_bonus', 'Melee Damage Bonus'],
  ['ranged_damage_bonus', 'Ranged Damage Bonus'],
  ['melee_distance_bonus', 'Melee Distance Bonus'],
  ['ranged_distance_bonus', 'Ranged Distance Bonus'],
  ['disengage_bonus', 'Disengage Bonus'],
] as const;

export function compileHero(input: {
  classScc: string;
  level: number;
  /** The stored EFFECTIVE characteristic projection (§2.3b). */
  characteristics: Characteristics | null;
  build: HeroBuild;
  overlay?: readonly ChoicePointRow[];
}): HeroCompileResult {
  const overlay = input.overlay ?? FURY_L1_OVERLAY;
  const receipts: HeroCompileReceipt[] = [];
  const abilityArtifactIds: string[] = [];
  const skillSccs: string[] = [];
  const resourceSccs: string[] = [];

  const projection = projectDecisions(input.build.decisions);

  // ── class stats (the shipped heroStats home) ─────────────────────────
  let stats: ParticipantStats | null = null;
  const classRecord = HERO_CLASS_RECORDS[input.classScc];
  if (classRecord === undefined) {
    receipts.push({
      reason: `class ${input.classScc} is not in the compile registry — table mode`,
      canonRef: input.classScc,
    });
  } else if (input.characteristics === null) {
    receipts.push({
      reason: 'no characteristic assignment recorded — table mode',
      canonRef: null,
    });
  } else {
    stats = heroStats(
      JSON.parse(classRecord.structuredJson) as Record<string, unknown>,
      input.level,
      input.characteristics,
    );
    if (stats === null) {
      receipts.push({
        reason: `class record ${input.classScc} did not yield stats (unparseable line or out-of-range input) — table mode`,
        canonRef: input.classScc,
      });
    }
  }

  // ── overlay fold: grants + selections on reachable rows ──────────────
  let kitScc: string | null = null;
  for (const row of overlay) {
    if (!isRowReachable(row, projection)) continue;
    if (row.optionSource.kind === 'unresolvable') continue;
    const chosen = chosenOptionKeys(row, projection);
    const grants = [
      ...row.grants,
      ...row.optionSource.options
        .filter((option) => chosen.includes(option.key))
        .flatMap((option) => option.grants ?? []),
    ];
    for (const grant of grants) {
      switch (grant.kind) {
        case 'ability':
          abilityArtifactIds.push(grant.scc);
          break;
        case 'skill':
          skillSccs.push(grant.scc);
          break;
        case 'resource':
          // Encounter-scoped by printed rule (Ferocity: ❝You lose any
          // remaining ferocity at the end of the encounter❞) — a grant
          // into the encounter layer (DEC-0019), never sheet state.
          resourceSccs.push(grant.scc);
          receipts.push({
            reason: `heroic resource ${grant.label} (encounter-scoped) — gains and spends resolve at the table (no resource automation yet)`,
            canonRef: grant.scc,
          });
          break;
        case 'feature':
          receipts.push({
            reason: `granted feature ${grant.label} — rendered verbatim at the table`,
            canonRef: grant.scc,
          });
          break;
      }
    }
    // Chosen options that ARE records: abilities and kits and skills.
    if (
      row.key.endsWith('#signature-ability') ||
      row.key.endsWith('#3pt-ability') ||
      row.key.endsWith('#5pt-ability')
    ) {
      abilityArtifactIds.push(...chosen);
    } else if (
      row.key === 'mcdm.heroes.v1/feature.fury.level-1/kit' ||
      row.key === 'mcdm.heroes.v1/feature.fury.level-1/beast-shape'
    ) {
      kitScc = chosen[0] ?? null;
    } else if (row.key.endsWith('#skills-2')) {
      skillSccs.push(...chosen);
    }
  }

  // ── kit contribution (composes ABOVE heroStats; Q6 discipline) ───────
  if (kitScc !== null) {
    const kit = KIT_BY_SCC.get(kitScc);
    if (kit === undefined) {
      receipts.push({
        reason: `chosen kit ${kitScc} is not in the compile registry — apply its benefits at the table`,
        canonRef: kitScc,
      });
    } else {
      const structured = JSON.parse(kit.structuredJson) as Record<string, unknown>;
      const staminaBonus =
        typeof structured.stamina_bonus === 'string'
          ? STAMINA_PER_ECHELON.exec(structured.stamina_bonus)
          : null;
      if (staminaBonus !== null && stats !== null) {
        // ❝Your kit's Stamina bonus is added to your Stamina maximum and
        // scales with your echelon❞ (chapter/kits.md §Stamina Bonus);
        // printed as ❝+N per echelon❞ → N × echelon(level).
        stats = {
          ...stats,
          staminaMax:
            stats.staminaMax +
            Number.parseInt(staminaBonus[1] ?? '', 10) * echelonOfLevel(input.level),
        };
      } else if (typeof structured.stamina_bonus === 'string') {
        // Printed but not in the one parseable form, or no stats to fold
        // into — verbatim residue, never a guess.
        receipts.push({
          reason: `${kit.slug}: Stamina Bonus "${plainText(structured.stamina_bonus)}" — apply at the table`,
          canonRef: kitScc,
        });
      }
      for (const [field, label] of KIT_RECEIPT_FIELDS) {
        const value = structured[field];
        if (typeof value === 'string' && value.length > 0) {
          // Printed semantics exist (chapter/kits.md) but the engine has no
          // representation for them — verbatim receipt, never dropped.
          receipts.push({
            reason: `${kit.slug}: ${label} ${plainText(value)} — apply at the table`,
            canonRef: kitScc,
          });
        }
      }
      if (structured.signature_ability !== undefined) {
        // ❝Each kit grants a signature ability, whose distance and damage
        // already includes the kit's bonuses❞ (chapter/kits.md §Kit
        // Signature Ability). Embedded in the kit record, not a standalone
        // artifact — use the kit card at the table.
        receipts.push({
          reason: `${kit.slug}: kit signature ability (bonuses already included) — use the kit card`,
          canonRef: kitScc,
        });
      }
      const stormwightBonuses = STORMWIGHT_BONUSES_BY_KIT.get(kitScc);
      if (stormwightBonuses !== undefined) {
        // Stormwight kits print their bonuses in a kit-bonuses feature
        // record. The Stamina bullet folds through the SAME printed rule;
        // every other bullet is a verbatim receipt.
        const staminaLine = STORMWIGHT_STAMINA_BULLET.exec(stormwightBonuses.text);
        for (const line of stormwightBonuses.text.split('\n')) {
          if (!line.startsWith('- ')) continue;
          if (staminaLine !== null && line === staminaLine[0].trimEnd()) {
            const bonus = STAMINA_PER_ECHELON.exec(staminaLine[1] ?? '');
            if (bonus !== null && stats !== null) {
              stats = {
                ...stats,
                staminaMax:
                  stats.staminaMax +
                  Number.parseInt(bonus[1] ?? '', 10) * echelonOfLevel(input.level),
              };
              continue;
            }
          }
          receipts.push({
            reason: `${kit.slug}: ${plainText(line.slice(2))} — apply at the table`,
            canonRef: stormwightBonuses.artifactId,
          });
        }
      }
    }
  }

  return { stats, abilityArtifactIds, skillSccs, resourceSccs, receipts };
}

export { FEROCITY_SCC };
