import type { ActionCost } from './schemas.js';

/**
 * R-0029 action-cost surface-vocabulary normalization — the ONE home for
 * folding the printed header-cell variants onto the closed enum. The corpus
 * survey (.artifacts/canon/action-economy/survey.json, accepted pin) observed
 * exactly these surface values across 1,878 header tables; case/spelling
 * variants fold; anything else refuses to normalize (residue, never a
 * guess).
 *
 * Context-dependent cells (`-` under a `Villain Action N` name line vs the
 * Wave of Blood no-cost sub-ability form) are resolved by the canon
 * package's compiler, which sees the surrounding artifact text — this
 * module handles VALUES only.
 */
const ACTION_COST_SURFACE: Readonly<Record<string, ActionCost>> = {
  'main action': 'main-action',
  maneuver: 'maneuver',
  move: 'move-action',
  'move action': 'move-action',
  triggered: 'triggered-action',
  'triggered action': 'triggered-action',
  'free triggered': 'free-triggered-action',
  'free triggered action': 'free-triggered-action',
  'free maneuver': 'free-maneuver',
  'no action': 'no-action',
};

export interface NormalizedActionCost {
  cost: ActionCost;
  /** `Main action (Adjacent creature)` [R-0029]: the debit lands on the
   * dispatching adjacent operator; the parenthetical stays verbatim on the
   * raw string. */
  operatorPays: boolean;
}

/** Normalize one raw header action-cost cell. Null = unknown value
 * (residue) — unknown FUTURE values refuse to normalize, never guessed
 * [R-0029]. The `-` cell is context-dependent and is NOT resolved here. */
export function normalizeActionCostValue(raw: string | null): NormalizedActionCost | null {
  if (raw === null) return null;
  const trimmed = raw.trim();
  const operatorMatch = /^(.*?)\s*\(adjacent creature\)$/i.exec(trimmed);
  const base = (operatorMatch?.[1] ?? trimmed).trim().toLowerCase();
  const cost = ACTION_COST_SURFACE[base];
  if (cost === undefined) return null;
  return { cost, operatorPays: operatorMatch !== null };
}
