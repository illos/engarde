/**
 * Determinism seams — the ONLY way non-determinism enters the engine.
 *
 * The engine core is a pure function: identical inputs produce byte-identical
 * outputs in every host. Anything time- or chance-shaped is therefore an
 * INPUT: dice results arrive already-rolled on the intent, or the host hands
 * the engine a seeded random source it fully controls. The engine never calls
 * `Math.random()`, `Date.now()`, or `new Date()` — the boundary test enforces
 * this mechanically.
 */

/**
 * A deterministic source of randomness injected by the host. Two sources
 * created from the same seed yield the same sequence forever.
 */
export interface RandomSource {
  /** Next value in [0, 1), advancing the internal state. */
  next(): number;
  /** Next integer in [1, faces], advancing the internal state. */
  roll(faces: number): number;
}

/**
 * A clock injected by the host. The engine only ever reads it to stamp log
 * entries with host-supplied time; no scheduling, no elapsed-time logic.
 */
export interface Clock {
  /** Milliseconds since the Unix epoch, as the host asserts it. */
  now(): number;
}

/**
 * splitmix32 — a small, well-distributed 32-bit PRNG. Chosen for portability
 * and reproducibility (pure integer math, identical across JS engines), not
 * cryptographic strength; server-side dice only need determinism + fairness.
 */
export function createSeededRandomSource(seed: number): RandomSource {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x9e3779b9) >>> 0;
    let z = state;
    z ^= z >>> 16;
    z = Math.imul(z, 0x21f0aaad);
    z ^= z >>> 15;
    z = Math.imul(z, 0x735a2d97);
    z ^= z >>> 15;
    return (z >>> 0) / 0x100000000;
  };
  return {
    next,
    roll(faces: number): number {
      if (!Number.isInteger(faces) || faces < 1) {
        throw new RangeError(`roll(faces) requires a positive integer, got ${faces}`);
      }
      return 1 + Math.floor(next() * faces);
    },
  };
}

/** A clock frozen at a host-asserted instant — the default for tests. */
export function createFixedClock(epochMs: number): Clock {
  return { now: () => epochMs };
}
