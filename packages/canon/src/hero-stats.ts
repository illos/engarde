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
 * Potencies derive from the CLASS-PRINTED characteristic — **RULED R-M,
 * accepted 2026-08-30** (docs/character-builder/01-rulings-needed.md §R-M;
 * resolves the tension R-0003 deferred). Each class prints its own three
 * lines (fury Basics: ❝Weak Potency: Might − 2❞ / ❝Average Potency:
 * Might − 1❞ / ❝Strong Potency: Might❞); the structured
 * `weak_potency`/`average_potency`/`strong_potency` fields carry them as
 * characteristic links with a printed offset, and both the characteristic
 * and the offset are PARSED from each line, never hardcoded. The two corpus
 * formulations are extensionally equal for every RAW hero (verified all 9
 * classes × printed advancement — see §R-M); the class-printed reading is
 * definitional. A line that fails the permissive parse yields
 * `potencies: null` (lossless residue — automation never guesses), which
 * the engine surfaces as a not-automated receipt at resolution time.
 *
 * NOT included (compose above this function, never inside it):
 * - Kit / feature Stamina bonuses — this is the CLASS contribution only.
 */

/** Printed hero level range: the Heroic Advancement Table and every class
 * advancement table run 1st–10th (chapter/making-a-hero §Heroic
 * Advancement; class Basics tables). */
export const HERO_LEVEL_MIN = 1;
export const HERO_LEVEL_MAX = 10;

function positiveInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

/** A printed class potency line as structured in the paired JSON:
 * `[Might](scc.v1:…/rule.character/might) − 2` — a characteristic link plus
 * an optional printed offset (strong prints none). Permissive over the
 * pin's two minus glyphs (U+2212 and ASCII hyphen — conduit.json uses the
 * latter). The characteristic is read from the scc slug, not the display
 * label. */
const POTENCY_LINE =
  /^\[[A-Za-z]+\]\(scc\.v1:[^)]*\/rule\.character\/(might|agility|reason|intuition|presence)\)(?:\s*[−-]\s*(\d+))?\s*$/;

function potencyValue(line: unknown, characteristics: Characteristics): number | null {
  if (typeof line !== 'string') return null;
  const match = POTENCY_LINE.exec(line.trim());
  if (!match) return null;
  const key = match[1] as keyof Characteristics;
  const offset = match[2] === undefined ? 0 : Number.parseInt(match[2], 10);
  return characteristics[key] - offset;
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
  // R-M: each value = the class-printed characteristic's score minus the
  // printed offset, all three parsed from the record's own lines. Any
  // unparseable line → null triple (residue, never a guess).
  const weak = potencyValue(classRecord.weak_potency, parsedCharacteristics.data);
  const average = potencyValue(classRecord.average_potency, parsedCharacteristics.data);
  const strong = potencyValue(classRecord.strong_potency, parsedCharacteristics.data);
  const potencies =
    weak !== null && average !== null && strong !== null ? { weak, average, strong } : null;
  return {
    // ❝Starting Stamina at 1st Level❞ + ❝Stamina Gained at 2nd and Higher
    // Levels❞ (class Basics): the per-level gain lands at each of levels
    // 2..level — (level − 1) gains.
    staminaMax: startingStamina + staminaPerLevel * (level - 1),
    characteristics: parsedCharacteristics.data,
    /** Class records print no immunity/weakness rows (measured, all 9). */
    immunities: [],
    weaknesses: [],
    /** Class-printed characteristic minus printed offset (R-M ruled). */
    potencies,
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
