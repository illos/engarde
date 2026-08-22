import { describe, expect, it } from 'vitest';
import { INITIAL_LIFECYCLE, LIFECYCLE_AXES, isLegalTransition } from './lifecycle.js';

describe('lifecycle execution contract', () => {
  it('every axis initial state is a member of its state list', () => {
    for (const axis of Object.values(LIFECYCLE_AXES)) {
      expect(axis.states).toContain(axis.initial);
    }
  });

  it('INITIAL_LIFECYCLE covers every axis with its initial state', () => {
    for (const [name, axis] of Object.entries(LIFECYCLE_AXES)) {
      expect(INITIAL_LIFECYCLE[name as keyof typeof INITIAL_LIFECYCLE]).toBe(axis.initial);
    }
  });

  it('transition tables are total and closed over declared states', () => {
    for (const axis of Object.values(LIFECYCLE_AXES)) {
      const states: readonly string[] = axis.states;
      expect(Object.keys(axis.transitions).sort()).toEqual([...states].sort());
      for (const targets of Object.values(axis.transitions)) {
        for (const target of targets as readonly string[]) {
          expect(states).toContain(target);
        }
      }
    }
  });

  it('permits the documented forward paths', () => {
    expect(isLegalTransition('ingest', 'extracted', 'superseded')).toBe(true);
    expect(isLegalTransition('classification', 'unclassified', 'proposed')).toBe(true);
    expect(isLegalTransition('classification', 'proposed', 'approved')).toBe(true);
    expect(isLegalTransition('parsing', 'unparsed', 'parsed-with-residue')).toBe(true);
    expect(isLegalTransition('parsing', 'parsed-with-residue', 'parsed-full')).toBe(true);
    expect(isLegalTransition('conformance', 'none', 'derived-only')).toBe(true);
    expect(isLegalTransition('conformance', 'derived-only', 'independently-verified')).toBe(true);
  });

  it('rejects skipped or reversed progressions', () => {
    expect(isLegalTransition('classification', 'unclassified', 'approved')).toBe(false);
    expect(isLegalTransition('classification', 'approved', 'unclassified')).toBe(false);
    expect(isLegalTransition('conformance', 'none', 'independently-verified')).toBe(false);
    expect(isLegalTransition('conformance', 'independently-verified', 'derived-only')).toBe(false);
    expect(isLegalTransition('ingest', 'superseded', 'extracted')).toBe(false);
  });

  it('every post-ingest axis has an explicit exception state with a way back', () => {
    for (const [name, axis] of Object.entries(LIFECYCLE_AXES)) {
      if (name === 'ingest') continue;
      const states: readonly string[] = axis.states;
      expect(states).toContain('exception');
      const outbound = (axis.transitions as Record<string, readonly string[]>).exception ?? [];
      expect(outbound.length).toBeGreaterThan(0);
    }
  });
});
