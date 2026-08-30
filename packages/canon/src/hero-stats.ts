import {
  type Characteristics,
  CharacteristicsSchema,
  type ParticipantStats,
} from '@engarde/engine';

/**
 * Deterministic hero participant stats from a class record's paired
 * structured JSON (DEC-0008: Markdown bytes are canonical; the paired JSON is
 * checksummed structured input — models point, code cuts). Measured over all
 * 9 heroes-book class records: `starting_stamina`, `stamina_per_level`, and
 * `recoveries` are always positive integers, and no class record carries
 * `free_strike`, `with_captain`, `organization`, immunities, or weaknesses.
 *
 * Verbatim grounding (heroes/md/class/fury.md Basics; every class prints the
 * same three lines with its own values):
 * - ❝Starting Stamina at 1st Level: 21❞
 * - ❝Stamina Gained at 2nd and Higher Levels: 9❞
 * - ❝Recoveries: 10❞
 * plus the general advancement rule: ❝Each time you gain a new level in your
 * class, your Stamina increases❞ (chapter/making-a-hero §Heroic Advancement).
 * So staminaMax = starting + perLevel × (level − 1): the per-level amount is
 * gained once at each of levels 2..level, and Recoveries are a flat
 * class-determined number — ❝Each hero has a number of Recoveries determined
 * by their class❞ (rule.health/recoveries) — with no printed level scaling.
 *
 * Characteristics are an INPUT — the player's assignment (starting array +
 * any increases), never derived here.
 *
 * NOT included (compose above this function, never inside it):
 * - Kit / feature Stamina bonuses — this is the CLASS contribution only.
 * - Potencies: stays null per R-0003 (power-roll-design.md §10 Q2). The
 *   corpus prints two mappings that can diverge — `rule.character/potency`
 *   says ❝your highest characteristic score❞ while the same record says the
 *   value is ❝determined by your class❞ and each class record prints a fixed
 *   characteristic (fury: ❝Weak Potency: Might − 2❞). After a level-4/7/10
 *   characteristic increase another score can pass the class-printed one, so
 *   the readings disagree; deriving here would pick a side R-0003 deferred.
 *   The structured `weak_potency`/`average_potency`/`strong_potency` fields
 *   are ready input once ruled.
 */

/** Printed hero level range: the Heroic Advancement Table and every class
 * advancement table run 1st–10th (chapter/making-a-hero §Heroic
 * Advancement; class Basics tables). */
export const HERO_LEVEL_MIN = 1;
export const HERO_LEVEL_MAX = 10;

function positiveInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

/**
 * null when the structured record is not a class record with the printed
 * stamina/recoveries lines, the level is outside the printed 1..10 range,
 * or the characteristic assignment is out of the engine's −5..+5 range.
 */
export function heroStats(
  classRecord: Record<string, unknown>,
  level: number,
  characteristics: Characteristics,
): ParticipantStats | null {
  if (classRecord.type !== 'class') return null;
  if (!Number.isInteger(level) || level < HERO_LEVEL_MIN || level > HERO_LEVEL_MAX) return null;
  const startingStamina = positiveInt(classRecord.starting_stamina);
  const staminaPerLevel = positiveInt(classRecord.stamina_per_level);
  const recoveriesMax = positiveInt(classRecord.recoveries);
  if (startingStamina === null || staminaPerLevel === null || recoveriesMax === null) return null;
  // One home for the −5..+5 characteristic range: the engine schema.
  const parsedCharacteristics = CharacteristicsSchema.safeParse(characteristics);
  if (!parsedCharacteristics.success) return null;
  return {
    // ❝Starting Stamina at 1st Level❞ + ❝Stamina Gained at 2nd and Higher
    // Levels❞ (class Basics): the per-level gain lands at each of levels
    // 2..level — (level − 1) gains.
    staminaMax: startingStamina + staminaPerLevel * (level - 1),
    characteristics: parsedCharacteristics.data,
    /** Class records print no immunity/weakness rows (measured, all 9). */
    immunities: [],
    weaknesses: [],
    /** Deferred per R-0003 — see the module doc comment. */
    potencies: null,
    /** Organization is a stat-block field; class records carry none. */
    organization: null,
    /** ❝Recoveries: 10❞ (class Basics) — flat, no printed level scaling. */
    recoveriesMax,
    /** Class records print no free-strike stat (measured, all 9). */
    freeStrike: null,
    /** With-Captain is a Minion stat-block field; class records carry none. */
    withCaptain: null,
    withCaptainBenefit: null,
  };
}
