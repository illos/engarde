import { type ResourceCost, parseResourceCostValue } from '@engarde/engine';
import { stripSccLinks } from './effect-grammar.js';

/**
 * Printed resource-cost carry — the CONTEXT half of the seam (ROAD-0005
 * generalizing seam #1; the engine's `parseResourceCostValue` is the value
 * half, the same split as R-0029 action costs). Two printed carriers exist
 * at the accepted pin:
 *
 * 1. Bold name-line parentheticals in artifact body text — malice features
 *    and statblock abilities ("**Net Trap (3 Malice)**", "**Malicious
 *    Strike (5+ Malice)**"). The action-cost header walkback already reads
 *    the name line; `resourceCostFromNameLine` gives it (and any future
 *    headerless-feature consumer) the cost carry.
 * 2. The adapter frontmatter `cost` field on hero/summoner records
 *    ("5 Ferocity", "1 essence per minion summoned"), with the printed
 *    name's parenthetical as fallback ("Call Forth (1+ Essence)" carries
 *    its cost only in the name). `resourceCostOfRecord` reads these.
 *
 * CARRY-ONLY: no debit semantics, no spend logic, no resource pools.
 *
 * NOT covered on purpose: the "1 Eidos" action-cost CELL on four summoner
 * champion stat blocks. That cell is frozen action-cost residue pending
 * ruling R-0046 (see action-cost.test.ts's I-4 sweep); routing it through
 * this parser before the ruling would silently reclassify the residue.
 */

export interface ResourceCostCarry {
  resourceCost: ResourceCost | null;
  resourceCostResidue: string | null;
}

const NO_CARRY: ResourceCostCarry = { resourceCost: null, resourceCostResidue: null };

/**
 * Cost-candidate gate: a parenthetical is cost-shaped when it starts with
 * a digit AND names a printed resource. "(Villain Action 3)" (no resource
 * word) and "(Level 4+ Malice Features)" (a section label, no leading
 * digit) are NOT candidates and carry nothing; "(3-7 Malice)" IS a
 * candidate that the closed value grammar refuses — honest residue with
 * the verbatim text, never a guess.
 */
const RESOURCE_WORD =
  /\b(clarity|discipline|drama|eidos|essence|ferocity|focus|insight|malice|piety|points?|wrath)\b/i;

function carryOfCandidate(text: string, where: string): ResourceCostCarry {
  const trimmed = text.trim();
  if (!/^\d/.test(trimmed) || !RESOURCE_WORD.test(trimmed)) return NO_CARRY;
  const resourceCost = parseResourceCostValue(trimmed);
  if (resourceCost !== null) return { resourceCost, resourceCostResidue: null };
  return {
    resourceCost: null,
    resourceCostResidue: `unrecognized printed resource cost ${JSON.stringify(trimmed)} in ${where}`,
  };
}

/** Trailing parenthetical of a printed name; tolerates the bold-colon
 * sub-ability suffix. */
const TRAILING_PARENTHETICAL = /\(([^)]*)\)\s*:?\s*$/;

/**
 * Carry a printed cost from a bold ability/feature name line
 * ("**Net Trap (3 Malice)**"). Accepts the same name-line shape as the
 * action-cost walkback (`lastContentLine` output); scc links are stripped
 * before matching (idempotent when the caller already stripped them).
 */
export function resourceCostFromNameLine(nameLine: string | null): ResourceCostCarry {
  if (nameLine === null) return NO_CARRY;
  const printedName = /\*\*([^*]+)\*\*/.exec(stripSccLinks(nameLine))?.[1];
  if (printedName === undefined) return NO_CARRY;
  const parenthetical = TRAILING_PARENTHETICAL.exec(printedName.trim());
  if (!parenthetical || parenthetical[1] === undefined) return NO_CARRY;
  return carryOfCandidate(parenthetical[1], 'name line');
}

/**
 * Carry a printed cost from a record's adapter metadata: the `cost` field
 * when present (a declared cost that refuses the closed grammar is always
 * residue), else a cost-candidate parenthetical on the printed `name`
 * (labels like "Undead Malice (Level 4+ Malice Features)" fail the
 * candidate gate and carry nothing).
 */
export function resourceCostOfRecord(record: {
  sourceMetadata: Record<string, unknown>;
  structuredData: Record<string, unknown>;
}): ResourceCostCarry {
  const costField = record.sourceMetadata.cost ?? record.structuredData.cost;
  if (typeof costField === 'string' && costField.trim().length > 0) {
    const trimmed = stripSccLinks(costField).trim();
    const resourceCost = parseResourceCostValue(trimmed);
    if (resourceCost !== null) return { resourceCost, resourceCostResidue: null };
    return {
      resourceCost: null,
      resourceCostResidue: `unrecognized printed resource cost ${JSON.stringify(trimmed)} in cost field`,
    };
  }
  const name = record.sourceMetadata.name ?? record.structuredData.name;
  if (typeof name === 'string') {
    const parenthetical = TRAILING_PARENTHETICAL.exec(stripSccLinks(name).trim());
    if (parenthetical?.[1] !== undefined) {
      return carryOfCandidate(parenthetical[1], `name ${JSON.stringify(name)}`);
    }
  }
  return NO_CARRY;
}
