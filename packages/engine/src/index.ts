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
export * from './condition-lifecycle.js';
export * from './apply-intent.js';
export * from './invariants.js';
export * from './driver.js';
