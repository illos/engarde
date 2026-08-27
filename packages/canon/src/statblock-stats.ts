import type { BenefitPhrase } from '@engarde/engine';
import { parseWithCaptain } from './benefit-phrase.js';

/**
 * Deterministic participant stats from a stat block's paired structured JSON
 * (DEC-0008: Markdown bytes are canonical; the paired JSON is checksummed
 * structured input — models point, code cuts). Measured over all 734
 * statblock records: stamina and the five characteristics are always
 * numeric; immunity/weakness rows are `<Type> N` with a handful of
 * malformed upstream rows (`"fire"`, `"or lightning"`) that are surfaced in
 * `unparsedRows` — a receipt, never a guess.
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
  staminaMax: number;
  characteristics: {
    might: number;
    agility: number;
    reason: number;
    intuition: number;
    presence: number;
  };
  immunities: StatblockDamageRow[];
  weaknesses: StatblockDamageRow[];
  potencies: null;
  organization: string | null;
  /** Stat blocks never carry Recoveries — "Director-controlled creatures
   * don't have Recoveries or a recovery value" [rule.health/stamina
   * §No Recoveries]; hero values arrive via character data, never here. */
  recoveriesMax: null;
  /** Printed Free Strike stat; null only for legacy/unreadable input. */
  freeStrike: number | null;
  /** The stat block's VERBATIM "With Captain" entry (structured
   * `with_captain`) — every in-pin Minion-organization statblock carries
   * one; null otherwise. Surfaces verbatim while a captain is attached,
   * never automated [R-0028]. */
  withCaptain: string | null;
  /** Deterministic closed-template compilation of `withCaptain`. */
  withCaptainBenefit: BenefitPhrase | null;
  /** Upstream rows the deterministic parser cannot read — shown at the
   * table, never silently dropped or guessed. */
  unparsedRows: string[];
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

/** null when the structured record is not a stat block with full stats. */
export function statblockStats(structuredData: Record<string, unknown>): StatblockStats | null {
  if (structuredData.type !== 'statblock') return null;
  const staminaRaw = structuredData.stamina;
  const staminaMax =
    typeof staminaRaw === 'number'
      ? staminaRaw
      : typeof staminaRaw === 'string' && /^\d+$/.test(staminaRaw)
        ? Number(staminaRaw)
        : null;
  if (staminaMax === null || staminaMax <= 0) return null;
  const characteristics: Partial<StatblockStats['characteristics']> = {};
  for (const key of ['might', 'agility', 'reason', 'intuition', 'presence'] as const) {
    const value = structuredData[key];
    if (typeof value !== 'number' || !Number.isInteger(value)) return null;
    characteristics[key] = value;
  }
  const unparsedRows: string[] = [];
  const freeStrikeRaw = structuredData.free_strike;
  const freeStrike =
    typeof freeStrikeRaw === 'number' && Number.isInteger(freeStrikeRaw) && freeStrikeRaw >= 0
      ? freeStrikeRaw
      : typeof freeStrikeRaw === 'string' && /^\d+$/.test(freeStrikeRaw)
        ? Number(freeStrikeRaw)
        : null;
  const withCaptain =
    typeof structuredData.with_captain === 'string' && structuredData.with_captain !== ''
      ? structuredData.with_captain
      : null;
  return {
    staminaMax,
    characteristics: characteristics as StatblockStats['characteristics'],
    immunities: parseRows(structuredData.immunities, unparsedRows, 'immunity'),
    weaknesses: parseRows(structuredData.weaknesses, unparsedRows, 'weakness'),
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
