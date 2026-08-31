/**
 * @engarde/engine — pure Draw Steel rules interpreter (scaffold).
 *
 * Constitution (docs/engine-plan.md, ratified as DEC-0009):
 * - Pure: state + intent (dice as input) → new state + structured log.
 * - No I/O, no framework imports, no ambient time or randomness — the
 *   boundary test (`boundary.test.ts`) enforces the import and API surface.
 * - No rule content lives here yet: mechanisms arrive in Phase 3, built from
 *   canon artifacts, never from memory.
 */

export type { Clock, RandomSource } from './determinism.js';
export { createFixedClock, createSeededRandomSource } from './determinism.js';
export * from './schemas.js';
export * from './action-cost.js';
export * from './resource-cost.js';
export * from './action-economy.js';
export * from './payload-hash.js';
export * from './resolution.js';
export * from './occurrences.js';
export * from './condition-lifecycle.js';
export * from './grant-lifecycle.js';
export * from './health.js';
export * from './power-roll.js';
export * from './damage.js';
export * from './potency.js';
export * from './ability-execution.js';
export * from './squad-actions.js';
export * from './captain-benefits.js';
export * from './effect-execution.js';
export * from './common-action-execution.js';
export * from './boundary-sweeps.js';
export * from './apply-intent.js';
export * from './invariants.js';
export * from './driver.js';
export * from './migrate.js';
