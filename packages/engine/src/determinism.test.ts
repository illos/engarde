import { describe, expect, it } from 'vitest';
import { createFixedClock, createSeededRandomSource } from './determinism.js';

describe('createSeededRandomSource', () => {
  it('yields an identical sequence for an identical seed', () => {
    const a = createSeededRandomSource(0xdecafbad);
    const b = createSeededRandomSource(0xdecafbad);
    for (let i = 0; i < 1000; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  it('yields different sequences for different seeds', () => {
    const a = createSeededRandomSource(1);
    const b = createSeededRandomSource(2);
    const aSeq = Array.from({ length: 8 }, () => a.next());
    const bSeq = Array.from({ length: 8 }, () => b.next());
    expect(aSeq).not.toEqual(bSeq);
  });

  it('stays within [0, 1)', () => {
    const source = createSeededRandomSource(42);
    for (let i = 0; i < 10_000; i++) {
      const value = source.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('roll(faces) covers the full 1..faces range and nothing outside it', () => {
    const source = createSeededRandomSource(7);
    const seen = new Set<number>();
    for (let i = 0; i < 10_000; i++) {
      const value = source.roll(10);
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(10);
      seen.add(value);
    }
    expect(seen.size).toBe(10);
  });

  it('roll rejects non-positive or fractional face counts', () => {
    const source = createSeededRandomSource(7);
    expect(() => source.roll(0)).toThrow(RangeError);
    expect(() => source.roll(-1)).toThrow(RangeError);
    expect(() => source.roll(2.5)).toThrow(RangeError);
  });
});

describe('createFixedClock', () => {
  it('always reports the asserted instant', () => {
    const clock = createFixedClock(1_755_820_800_000);
    expect(clock.now()).toBe(1_755_820_800_000);
    expect(clock.now()).toBe(1_755_820_800_000);
  });
});
