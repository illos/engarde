/**
 * Printed ability KEYWORDS — the one membership test [common-actions
 * design §2, S15].
 *
 * A header keyword cell is verbatim printed text the compiler passes
 * through untouched ("Charge, Melee, Strike, Weapon", "**[Melee], Weapon**"
 * with its scc links stripped), so every reader has to normalize it the
 * same way: trim, case-fold, exact match. Measured before this module
 * existed, that test was inlined at SEVEN sites across three modules — and
 * the keywords it discriminates carry real canon consequences, so a single
 * site normalizing differently is a silent rule divergence, not a style
 * problem:
 *
 * - **Area** is the printed discriminator for the squad-pool per-minion cap
 *   ("any source except an area effect (including abilities with the Area
 *   keyword)" [chapter/monster-basics §Dropping Multiple Minions, R-0025]),
 *   and it also decides squad participation validation.
 * - **Strike** decides which rolls consume strike-scoped next-roll grants
 *   and inbound marks [rule.combat/strike, R-0013/R-0014].
 * - **Charge** admits a substitute ability into the Charge main action
 *   ("If the creature has an ability with the Charge keyword, they can use
 *   that ability against the target instead of a free strike").
 *
 * Named predicates for the first two exist because their call sites read
 * better and because the canon pointer belongs next to the test; both call
 * into `hasKeyword` rather than repeating the normalization.
 */

/** Does this printed keyword cell carry `keyword`? Case- and
 * whitespace-insensitive, exact-token match — never a substring test. */
export function hasKeyword(keywords: readonly string[], keyword: string): boolean {
  const wanted = keyword.trim().toLowerCase();
  return keywords.some((candidate) => candidate.trim().toLowerCase() === wanted);
}

/** The printed Area keyword [R-0025]. */
export function isAreaKeyworded(keywords: readonly string[]): boolean {
  return hasKeyword(keywords, 'area');
}

/** The printed Strike keyword [rule.combat/strike, R-0013/R-0014]. */
export function isStrikeKeyworded(keywords: readonly string[]): boolean {
  return hasKeyword(keywords, 'strike');
}
