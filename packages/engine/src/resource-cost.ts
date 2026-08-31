import { RESOURCE_COST_RESOURCES, type ResourceCost } from './schemas.js';

/**
 * Printed resource-cost value parser — the ONE home for folding the
 * measured printed cost vocabulary onto the structured carry slot
 * (ROAD-0005 generalizing seam #1). Malice, heroic-resource, essence, and
 * eidos costs all print in ability / malice-feature / frontmatter text;
 * every downstream mechanism shares this representation instead of growing
 * its own cost parser.
 *
 * CARRY-ONLY: no debit semantics, no spend logic, no resource pools. The
 * parser records exactly what is printed; whether/how a mechanism debits
 * the cost is that mechanism's (future, separately ruled) concern.
 *
 * The grammar is closed over the corpus survey at the accepted pin
 * (frontmatter `cost` fields + bold name-line parentheticals — see the
 * ResourceCostSchema doc for the measured forms). Anything else refuses to
 * parse: residue with the verbatim text, never a guess. In particular the
 * printed range labels ("3-7 Malice", "2-7+ Malice") refuse — a range
 * names a feature-list span, not one ability's cost.
 *
 * Context (which line of an artifact is a cost, and whether a
 * parenthetical is cost-shaped at all) is resolved by the canon package,
 * which sees the surrounding artifact text — this module handles VALUES
 * only (the same split as `normalizeActionCostValue` [R-0029]).
 */

/** `Points` folds to `point`; every other printed resource name is its own
 * lowercase enum member. */
const RESOURCE_SURFACE: Readonly<Record<string, ResourceCost['resource']>> = {
  ...Object.fromEntries(RESOURCE_COST_RESOURCES.map((resource) => [resource, resource])),
  points: 'point',
};

const NUMBER_WORDS: Readonly<Record<string, number>> = { one: 1, two: 2, three: 3 };

/**
 * `N[+] <resource>[ per <unit> | for <count-word> <unit>[s]]` — the closed
 * measured grammar. Single-space separators exactly as printed; the
 * resource word matches case-insensitively ("Malice" / "essence").
 */
const COST_VALUE =
  /^(\d+)(\+)? ([A-Za-z]+)(?: per (minion summoned|minion|target)| for (one|two|three) (minions?|champion))?$/;

/** Parse one printed resource-cost value. Null = not a measured printed
 * cost form (residue at the call site) — unknown FUTURE forms refuse to
 * parse, never guessed. */
export function parseResourceCostValue(raw: string | null): ResourceCost | null {
  if (raw === null) return null;
  const trimmed = raw.trim();
  const match = COST_VALUE.exec(trimmed);
  if (!match) return null;
  const resource = RESOURCE_SURFACE[(match[3] ?? '').toLowerCase()];
  if (resource === undefined) return null;
  const countWord = match[5];
  const unitWord = match[6];
  let forQuantity: ResourceCost['forQuantity'] = null;
  if (countWord !== undefined && unitWord !== undefined) {
    const count = NUMBER_WORDS[countWord];
    if (count === undefined) return null;
    forQuantity = { count, unit: unitWord === 'champion' ? 'champion' : 'minion' };
  }
  return {
    amount: Number(match[1]),
    resource,
    openEnded: match[2] !== undefined,
    per: (match[4] as ResourceCost['per'] | undefined) ?? null,
    forQuantity,
    sourceText: trimmed,
  };
}
