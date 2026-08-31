import type { BenefitPhrase } from '@engarde/engine';
import { parseWithCaptain } from './benefit-phrase.js';

/**
 * Deterministic participant stats from a stat block's paired structured JSON
 * (DEC-0008: Markdown bytes are canonical; the paired JSON is checksummed
 * structured input — models point, code cuts).
 *
 * PARTIAL PARSE (never all-or-nothing): every cell that reads cleanly is
 * carried; a cell the deterministic parser cannot fold is FROZEN as exact
 * residue — verbatim printed bytes in `staminaResidue` / `unparsedRows` —
 * instead of poisoning the whole record. Measured at the accepted pin
 * (512 statblock artifacts): the five characteristics and Free Strike are
 * always numeric; 462 Stamina cells are plain numbers and 50 are frozen —
 * 46 Summoner-minion multi-column cells (`"4 | 4 | 4"`) and 4 Summoner-
 * champion `"SPECIAL"` cells. The pin prints those cells exactly as frozen
 * and nowhere defines a column→value mapping, so folding either class to a
 * number is a ruling, not a parse — residue is a receipt, never a guess.
 */

const DAMAGE_TYPES = [
  'acid',
  'cold',
  'corruption',
  'fire',
  'holy',
  'lightning',
  'poison',
  'psychic',
  'sonic',
] as const;

const ROW = new RegExp(`^(damage|${DAMAGE_TYPES.join('|')})\\s+(\\d+|all)$`, 'i');

export interface StatblockDamageRow {
  appliesTo: 'any' | (typeof DAMAGE_TYPES)[number];
  value: number | 'all';
}

export interface StatblockStats {
  /** Parsed printed Stamina. Null exactly when the printed cell is frozen
   * verbatim in `staminaResidue` — the record still carries every other
   * readable cell, and stamina automation stays off until a ruling folds
   * the frozen cell. */
  staminaMax: number | null;
  /** The VERBATIM printed Stamina cell when it is not one plain positive
   * number (Summoner-minion multi-column `"N | N"` / `"N | N | N"` cells,
   * Summoner-champion `"SPECIAL"`). The pin does not print what the
   * columns or SPECIAL mean, so any fold to a number needs a ruling —
   * until then the exact bytes are the receipt. Null exactly when
   * `staminaMax` parsed. */
  staminaResidue: string | null;
  /** All five printed characteristics, or null when any cell is unreadable
   * (each unreadable cell is frozen verbatim in `unparsedRows`; the four
   * readable ones are never worth carrying without the fifth — engine
   * characteristic automation is all-or-nothing per record). */
  characteristics: {
    might: number;
    agility: number;
    reason: number;
    intuition: number;
    presence: number;
  } | null;
  immunities: StatblockDamageRow[];
  weaknesses: StatblockDamageRow[];
  potencies: null;
  organization: string | null;
  /** Stat blocks never carry Recoveries — "Director-controlled creatures
   * don't have Recoveries or a recovery value" [rule.health/stamina
   * §No Recoveries]; hero values arrive via character data, never here. */
  recoveriesMax: null;
  /** Printed Free Strike stat; null when absent or frozen in
   * `unparsedRows`. */
  freeStrike: number | null;
  /** The stat block's VERBATIM "With Captain" entry (structured
   * `with_captain`) — every in-pin Minion-organization statblock carries
   * one; null otherwise. Surfaces verbatim while a captain is attached,
   * never automated [R-0028]. */
  withCaptain: string | null;
  /** Deterministic closed-template compilation of `withCaptain`. */
  withCaptainBenefit: BenefitPhrase | null;
  /** Upstream cells/rows the deterministic parser cannot read, frozen
   * verbatim with a field label — shown at the table, never silently
   * dropped or guessed. */
  unparsedRows: string[];
}

/** Verbatim receipt text for an unreadable cell — the printed string as-is,
 * or a JSON echo of the non-string value (parser diagnostic, not prose). */
function verbatimCell(raw: unknown): string {
  if (typeof raw === 'string') return raw;
  return JSON.stringify(raw) ?? '(missing)';
}

function parsePositiveInt(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isInteger(raw) && raw > 0) return raw;
  if (typeof raw === 'string' && /^\d+$/.test(raw.trim()) && Number(raw.trim()) > 0) {
    return Number(raw.trim());
  }
  return null;
}

function parseRows(rows: unknown, unparsed: string[], label: string): StatblockDamageRow[] {
  if (!Array.isArray(rows)) return [];
  const parsed: StatblockDamageRow[] = [];
  for (const row of rows) {
    if (typeof row !== 'string') continue;
    const match = ROW.exec(row.trim());
    if (!match) {
      unparsed.push(`${label}: ${row}`);
      continue;
    }
    const kind = (match[1] ?? '').toLowerCase();
    const value = match[2] === 'all' ? ('all' as const) : Number(match[2]);
    parsed.push({
      appliesTo: kind === 'damage' ? 'any' : (kind as StatblockDamageRow['appliesTo']),
      value,
    });
  }
  return parsed;
}

/** Null only when the structured record is not a stat block; every stat
 * block yields a (possibly partial) record. */
export function statblockStats(structuredData: Record<string, unknown>): StatblockStats | null {
  if (structuredData.type !== 'statblock') return null;
  const unparsedRows: string[] = [];

  const staminaRaw = structuredData.stamina;
  const staminaMax = parsePositiveInt(staminaRaw);
  let staminaResidue: string | null = null;
  if (staminaMax === null) {
    staminaResidue = verbatimCell(staminaRaw);
    unparsedRows.push(`stamina: ${staminaResidue}`);
  }

  const partial: Partial<NonNullable<StatblockStats['characteristics']>> = {};
  let characteristicsComplete = true;
  for (const key of ['might', 'agility', 'reason', 'intuition', 'presence'] as const) {
    const value = structuredData[key];
    if (typeof value === 'number' && Number.isInteger(value)) {
      partial[key] = value;
    } else {
      characteristicsComplete = false;
      unparsedRows.push(`${key}: ${verbatimCell(value)}`);
    }
  }
  const characteristics = characteristicsComplete
    ? (partial as NonNullable<StatblockStats['characteristics']>)
    : null;

  const immunities = parseRows(structuredData.immunities, unparsedRows, 'immunity');
  const weaknesses = parseRows(structuredData.weaknesses, unparsedRows, 'weakness');

  const freeStrikeRaw = structuredData.free_strike;
  const freeStrike =
    typeof freeStrikeRaw === 'number' && Number.isInteger(freeStrikeRaw) && freeStrikeRaw >= 0
      ? freeStrikeRaw
      : typeof freeStrikeRaw === 'string' && /^\d+$/.test(freeStrikeRaw)
        ? Number(freeStrikeRaw)
        : null;
  if (
    freeStrike === null &&
    freeStrikeRaw !== undefined &&
    freeStrikeRaw !== null &&
    freeStrikeRaw !== ''
  ) {
    // Present but unreadable — a receipt, never a silent null.
    unparsedRows.push(`free strike: ${verbatimCell(freeStrikeRaw)}`);
  }

  const withCaptain =
    typeof structuredData.with_captain === 'string' && structuredData.with_captain !== ''
      ? structuredData.with_captain
      : null;
  return {
    staminaMax,
    staminaResidue,
    characteristics,
    immunities,
    weaknesses,
    potencies: null,
    recoveriesMax: null,
    freeStrike,
    organization:
      typeof structuredData.organization === 'string' && structuredData.organization !== ''
        ? structuredData.organization
        : null,
    withCaptain,
    withCaptainBenefit: parseWithCaptain(structuredData),
    unparsedRows,
  };
}
