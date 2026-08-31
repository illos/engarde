import { describe, expect, it } from 'vitest';
import { hasKeyword, isAreaKeyworded, isStrikeKeyworded } from './keywords.js';

/**
 * The one printed-keyword membership test [common-actions design §2, S15].
 * Keyword cells below are verbatim compiled header text from the pinned
 * corpus: Spear Charge (goblin warrior) prints "Charge, Melee, Strike,
 * Weapon"; the common Knockback prints "Melee, Weapon".
 */

const SPEAR_CHARGE_KEYWORDS = ['Charge', 'Melee', 'Strike', 'Weapon'];
const KNOCKBACK_KEYWORDS = ['Melee', 'Weapon'];

describe('hasKeyword', () => {
  it('matches a printed keyword regardless of case or surrounding whitespace', () => {
    expect(hasKeyword(SPEAR_CHARGE_KEYWORDS, 'charge')).toBe(true);
    expect(hasKeyword(SPEAR_CHARGE_KEYWORDS, 'CHARGE')).toBe(true);
    expect(hasKeyword([' Strike '], 'strike')).toBe(true);
  });

  it('is an exact token match, never a substring test', () => {
    // "Strike" must not be found inside "Strikes" or "Free Strike" — the
    // keyword cell is a closed printed list, and a substring match would
    // silently widen which rolls consume strike-scoped grants [R-0013].
    expect(hasKeyword(['Strikes'], 'strike')).toBe(false);
    expect(hasKeyword(['Free Strike'], 'strike')).toBe(false);
    expect(hasKeyword(KNOCKBACK_KEYWORDS, 'strike')).toBe(false);
    expect(hasKeyword([], 'area')).toBe(false);
  });

  it('the two named predicates read the same test', () => {
    expect(isStrikeKeyworded(SPEAR_CHARGE_KEYWORDS)).toBe(true);
    // Knockback prints no Strike keyword: strike-scoped grants and inbound
    // marks are not consumed by its roll [R-0013/R-0014].
    expect(isStrikeKeyworded(KNOCKBACK_KEYWORDS)).toBe(false);
    expect(isAreaKeyworded(['Area', 'Magic'])).toBe(true);
    expect(isAreaKeyworded(SPEAR_CHARGE_KEYWORDS)).toBe(false);
  });
});
