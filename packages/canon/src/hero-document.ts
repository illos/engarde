import type { Characteristics } from '@engarde/engine';
import { z } from 'zod';

/**
 * The normative hero document (docs/character-builder/02-normative-schema.md,
 * DEC-0015): the stored document is the CHOICE RECORD — an ordered,
 * append-only decision log — and the visible sheet is a deterministic
 * projection of a prefix of that log against the pinned corpus. Reverting a
 * hero is a rewind to a prior log position, never a reconstruction by
 * subtracting bonuses.
 *
 * This module is the ONE schema home (the `encounters.state` precedent:
 * engine/canon-owned Zod shape, deliberately not mirrored as a Convex
 * validator). The backend stores the blobs and validates them here; the
 * engine package never learns about choices.
 */

/**
 * The pin the projection is valid against (§2.2 pin stamping). Must match
 * `packages/canon/config/steelcompendium-source.json` — asserted by
 * hero-document.test.ts so the constant can never silently drift from the
 * tracked source lock.
 */
export const PIN_VERSION = 'v4.20260803143953';

/** `<scc>` | `<scc>#<disc>` | path segments joined by `::` (§2.3c). Neither
 * `::` nor `#` occurs in the scc grammar, so parsing is unambiguous. */
export const OverlayKeySchema = z.string().min(1);
export type OverlayKey = z.infer<typeof OverlayKeySchema>;

/** R-A: a materialised editable default vs the player's own pick. Fixed
 * grants never reach the log at all — they compile from the overlay. */
export const SelectionOriginSchema = z.enum(['default', 'player']);

/** R-H sparse override: only what the player changed, each naming the
 * definition field it replaces — never rewritten prose (R-F). */
export const EntityOverrideSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('rename'), name: z.string().min(1) }),
  z.object({
    kind: z.literal('field'),
    field: z.string().min(1),
    value: z.unknown(),
  }),
]);
export type EntityOverride = z.infer<typeof EntityOverrideSchema>;

export const SelectionPayloadSchema = z.discriminatedUnion('kind', [
  /** 1-of-N and N-of-list picks (values are sccs or join-minted option
   * keys). Covers skills, abilities, perks, kits, domains (§5 kinds 2–3). */
  z.object({
    kind: z.literal('pick'),
    selected: z.array(z.string().min(1)),
    origin: SelectionOriginSchema.default('player'),
    /** R-F reference fact (e.g. a domain characteristic redirect); resolved
     * at display/compile time, never persisted as rewritten text. */
    characteristicOverride: z
      .enum(['might', 'agility', 'reason', 'intuition', 'presence'])
      .optional(),
  }),
  /** Ancestry-points spend (§5 kind 4): purchased option keys; budget and
   * costs are definition-side; a partial spend is a valid persisted state. */
  z.object({
    kind: z.literal('point-buy'),
    purchased: z.array(z.string().min(1)),
  }),
  /** R-H nested entity (§5 kind 8): pointer + sparse overrides, never a
   * forked copy. */
  z.object({
    kind: z.literal('entity'),
    entityScc: z.string().min(1),
    overrides: z.array(EntityOverrideSchema).default([]),
  }),
]);
export type SelectionPayload = z.infer<typeof SelectionPayloadSchema>;

/** Divergence record written ONLY by a pin-upgrade pass (§2.2) — never by
 * normal play. */
export const DecisionDivergenceSchema = z.object({
  fromPinVersion: z.string().min(1),
  toPinVersion: z.string().min(1),
  reason: z.string().min(1),
});

export const PILLARS = [
  'ancestry',
  'culture',
  'career',
  'class',
  'subclass',
  'complication',
  'inciting-incident',
] as const;
export const PillarSchema = z.enum(PILLARS);
export type Pillar = z.infer<typeof PillarSchema>;

export const DecisionActionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('set-pillar'),
    pillar: PillarSchema,
    /** An scc (class, ancestry, …) or a join-minted option key (subclass —
     * the Fury aspects have no standalone pin records; §5 kind 3). The
     * culture composite extends this to an object when the culture vertical
     * lands (§2.3a); until then every shipped pillar value is a string. */
    value: z.string().min(1),
  }),
  z.object({ kind: z.literal('advance-level'), to: z.number().int() }),
  z.object({
    kind: z.literal('set-characteristics'),
    assignment: z.record(z.string(), z.number().int()),
  }),
  z.object({
    kind: z.literal('select'),
    key: OverlayKeySchema,
    payload: SelectionPayloadSchema,
  }),
  /** Explicit un-answer, so replay never guesses (§2.2). */
  z.object({ kind: z.literal('clear'), key: OverlayKeySchema }),
]);
export type DecisionAction = z.infer<typeof DecisionActionSchema>;

export const DecisionEntrySchema = z.object({
  /** Dense, monotonically increasing position — the causal order of the
   * character's construction. */
  seq: z.number().int().nonnegative(),
  action: DecisionActionSchema,
  /** Hero level in effect when the decision was made (causal context). */
  atLevel: z.number().int(),
  provenance: z.enum(['wizard', 'level-up', 'respite', 'play', 'import']),
  /** Timestamp — audit only, never a projection input. */
  at: z.number(),
  /** Written only by pin-upgrade passes; absent in normal operation. */
  divergence: DecisionDivergenceSchema.nullable().default(null),
});
export type DecisionEntry = z.infer<typeof DecisionEntrySchema>;

export const HeroBuildSchema = z.object({
  schemaVersion: z.literal(1),
  /** The pin the projection is valid against (§2.2). */
  pinVersion: z.string().min(1),
  /** The record. Append-only; revert = truncate; seq dense from 0. */
  decisions: z.array(DecisionEntrySchema).default([]),
  /** STORED PROJECTION of `decisions` (§2.3c). Invariant:
   * selections == projectDecisions(decisions).selections — maintained by
   * the same mutation that appends, assertable by a validator. */
  selections: z.record(OverlayKeySchema, SelectionPayloadSchema).default({}),
});
export type HeroBuild = z.infer<typeof HeroBuildSchema>;

/**
 * The runtime tracker region (§2.6, R-D) under the DEC-0019 boundary
 * ruling (docs/character-builder/03-cross-encounter-state.md): **the
 * character sheet OWNS persistent stats; the encounter is a modification
 * layer.** Persistent per-hero values — current Stamina, Recoveries
 * remaining, Victories — live HERE as the single source of truth. There is
 * no encounter-end write-back: encounter events that touch them (damage,
 * Catch Breath, Victory award) apply to this blob as they happen.
 * Encounter-scoped values (heroic resource, surges, temporary Stamina,
 * combat conditions) are grants into the encounter layer and never touch
 * this document. The R-C 'XP gained' hook is deliberately NOT
 * representable here (§2.7).
 */
export const HeroRuntimeSchema = z.object({
  schemaVersion: z.literal(1),
  /** Sheet-owned vitals (DEC-0019). null = never initialized — the first
   * encounter seed initializes to the compiled maxima and writes back
   * here. Persistence across encounters is the printed model: no
   * encounter-end restore rule exists; the respite is the refill event
   * (❝When you finish a respite, you regain all your Recoveries and
   * Stamina❞ — The Basics §Respite, docket §a/§b). */
  vitals: z
    .object({
      staminaCurrent: z.number().int().nullable().default(null),
      recoveriesCurrent: z.number().int().min(0).nullable().default(null),
    })
    .default({ staminaCurrent: null, recoveriesCurrent: null }),
  /** R-C keyed set for resources whose PRINTED lifetime crosses the
   * encounter boundary (e.g. respite-scoped fate points, docket §d
   * exception). Encounter-scoped heroic resources (Ferocity: ❝You lose
   * any remaining ferocity at the end of the encounter❞) are grants into
   * the encounter layer and never stored here. Key = the
   * resource-defining feature's scc. */
  resources: z.record(z.string().min(1), z.object({ current: z.number().int() })).default({}),
  /** Campaign-lived counters; which keys exist is canon work (§2.6).
   * 'victories' lands here with the award flow (docket §f) — reserved,
   * never hardcoded. */
  counters: z.record(z.string().min(1), z.number().int()).default({}),
  /** Persistent form toggles keyed by the granting choice point (§5 kind
   * 10) — play state, never a build decision. */
  formState: z.record(OverlayKeySchema, z.boolean()).default({}),
});
export type HeroRuntime = z.infer<typeof HeroRuntimeSchema>;

export function emptyHeroBuild(): HeroBuild {
  return { schemaVersion: 1, pinVersion: PIN_VERSION, decisions: [], selections: {} };
}

export function emptyHeroRuntime(): HeroRuntime {
  return {
    schemaVersion: 1,
    vitals: { staminaCurrent: null, recoveriesCurrent: null },
    resources: {},
    counters: {},
    formState: {},
  };
}

/**
 * The projected core character: pillar pointers, level, the characteristic
 * assignment, and the current-selections map. Derived, never authored.
 */
export type HeroProjection = {
  level: number;
  pillars: Partial<Record<Pillar, string>>;
  /**
   * EFFECTIVE characteristic scores (§2.3b, Q2 disposition: characteristics
   * are a stored projection of the log with ONE derivation home — this
   * fold). At level 1 the effective scores equal the base assignment; the
   * level 4/7/10 increase decisions (per-level `select` entries on the
   * characteristic-increase keys) fold in here when the level-up vertical
   * lands — never at a second site.
   */
  characteristics: Characteristics | null;
  selections: Record<OverlayKey, SelectionPayload>;
};

const CHARACTERISTIC_KEYS = ['might', 'agility', 'reason', 'intuition', 'presence'] as const;

function characteristicsFromAssignment(assignment: Record<string, number>): Characteristics | null {
  const result: Partial<Record<(typeof CHARACTERISTIC_KEYS)[number], number>> = {};
  for (const key of CHARACTERISTIC_KEYS) {
    const value = assignment[key];
    if (value === undefined) return null;
    result[key] = value;
  }
  return result as Characteristics;
}

/**
 * `project(decisions[0..k], pin)` — the pure, prefix-closed fold (§2.2).
 * Later entries for the same key supersede earlier ones; a `clear` removes;
 * the fold reads nothing but the log prefix. Because it is pure and the pin
 * is fixed, ANY prefix of the log is a complete, exact historical character
 * — revert = truncate + re-project.
 *
 * Orphaned selections (keys whose parent pillar/selection changed) are NOT
 * removed here: their log entries remain and their map entries simply stop
 * being *reachable* (reachability is overlay-side derivation — see
 * hero-overlay-fury.ts). Switching the parent back restores them for free.
 */
export function projectDecisions(decisions: readonly DecisionEntry[]): HeroProjection {
  let level = 1;
  const pillars: Partial<Record<Pillar, string>> = {};
  let assignment: Record<string, number> | null = null;
  const selections: Record<OverlayKey, SelectionPayload> = {};
  for (const entry of decisions) {
    const action = entry.action;
    switch (action.kind) {
      case 'set-pillar':
        pillars[action.pillar] = action.value;
        break;
      case 'advance-level':
        level = action.to;
        break;
      case 'set-characteristics':
        assignment = action.assignment;
        break;
      case 'select':
        selections[action.key] = action.payload;
        break;
      case 'clear':
        delete selections[action.key];
        break;
    }
  }
  return {
    level,
    pillars,
    characteristics: assignment === null ? null : characteristicsFromAssignment(assignment),
    selections,
  };
}

/**
 * Revert = rewind (§2.2): keep the first `length` entries (seq densely
 * 0..length-1) and drop the suffix. The result re-projects to exactly the
 * character that existed at that log position.
 */
export function truncateDecisions(
  decisions: readonly DecisionEntry[],
  length: number,
): DecisionEntry[] {
  if (!Number.isInteger(length) || length < 0 || length > decisions.length) {
    throw new Error(`Cannot truncate a ${decisions.length}-entry log to length ${length}`);
  }
  return decisions.slice(0, length);
}

/**
 * Append helper: mints the next entry with a dense seq. The caller supplies
 * causal context (atLevel = the level in effect BEFORE this decision).
 */
export function appendDecision(
  build: HeroBuild,
  action: DecisionAction,
  context: { atLevel: number; provenance: DecisionEntry['provenance']; at: number },
): HeroBuild {
  const entry: DecisionEntry = {
    seq: build.decisions.length,
    action,
    atLevel: context.atLevel,
    provenance: context.provenance,
    at: context.at,
    divergence: null,
  };
  const decisions = [...build.decisions, entry];
  return {
    ...build,
    decisions,
    selections: projectDecisions(decisions).selections,
  };
}
