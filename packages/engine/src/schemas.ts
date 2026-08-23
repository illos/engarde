import { z } from 'zod';

/**
 * Engine state, intent, and log shapes (engine-plan 3.1 + 3.2, pilot thin
 * form). Universal substrate only: no per-condition semantics live here —
 * rule behavior is supplied by callers/mechanisms grounded in canon
 * artifacts, and every entry that applies a rule carries `canonRefs`
 * pointing at the artifact ids it traces to.
 *
 * The ending vocabulary is exactly what the pilot scope's verbatim texts
 * ground: "(save ends)" [rule.general/saving-throw], "until the end of the
 * encounter" / the end-of-encounter default [classes#ending-effects],
 * "until the end of their next turn" [feature.ability.tactician.level-1/
 * mark], and bespoke endings resolved by explicit removal
 * [condition/grabbed]. Nothing else ships until an artifact grounds it.
 */

export const ParticipantIdSchema = z.string().min(1);

export const EndingSpecSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('save-ends') }),
  z.object({ kind: z.literal('end-of-encounter') }),
  z.object({ kind: z.literal('end-of-targets-next-turn') }),
  z.object({ kind: z.literal('external') }),
]);

export type EndingSpec = z.infer<typeof EndingSpecSchema>;

export const ConditionSourceSchema = z.object({
  participantId: ParticipantIdSchema.optional(),
  effectArtifactId: z.string().min(1).optional(),
});

export const ConditionInstanceSchema = z.object({
  instanceId: z.string().min(1),
  conditionId: z.string().min(1),
  ending: EndingSpecSchema,
  source: ConditionSourceSchema,
});

export type ConditionInstance = z.infer<typeof ConditionInstanceSchema>;

export const ParticipantStateSchema = z.object({
  id: ParticipantIdSchema,
  conditions: z.array(ConditionInstanceSchema),
});

export type ParticipantState = z.infer<typeof ParticipantStateSchema>;

export const EncounterStateSchema = z.object({
  schemaVersion: z.literal(1),
  participants: z.record(ParticipantIdSchema, ParticipantStateSchema),
});

export type EncounterState = z.infer<typeof EncounterStateSchema>;

/** Attribution: every intent names who acts (trust gates live in the host). */
export const ActorSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('director') }),
  z.object({ kind: z.literal('participant'), participantId: ParticipantIdSchema }),
]);

export type Actor = z.infer<typeof ActorSchema>;

/**
 * Asserted spatial facts (engine-plan 3.3 seam, present on the envelope from
 * day one). The fact vocabulary ships only what scoped condition texts need:
 * adjacency [condition/grabbed] and line of effect [condition/taunted].
 */
export const SpatialFactSchema = z.object({
  fact: z.enum(['adjacent', 'line-of-effect']),
  a: ParticipantIdSchema,
  b: ParticipantIdSchema,
  holds: z.boolean(),
});

const intentBase = {
  intentId: z.string().min(1),
  actor: ActorSchema,
  spatialFacts: z.array(SpatialFactSchema).optional(),
};

export const IntentSchema = z.discriminatedUnion('kind', [
  z.object({
    ...intentBase,
    kind: z.literal('apply-condition'),
    payload: z.object({
      target: ParticipantIdSchema,
      conditionId: z.string().min(1),
      ending: EndingSpecSchema,
      source: ConditionSourceSchema,
      // Per-condition canon supplied by the caller (e.g. frightened/taunted:
      // "the new condition replaces the old one"), never hard-coded here.
      replacesOnNewSource: z.boolean().default(false),
    }),
  }),
  z.object({
    ...intentBase,
    kind: z.literal('remove-condition'),
    payload: z.object({
      target: ParticipantIdSchema,
      instanceId: z.string().min(1),
      reason: z.string().min(1).optional(),
    }),
  }),
  z.object({
    ...intentBase,
    kind: z.literal('end-turn'),
    payload: z.object({
      participantId: ParticipantIdSchema,
      /** Manual saving-throw rolls by instance id; absent = auto-roll. */
      rolls: z.record(z.string(), z.number().int()).optional(),
    }),
  }),
  z.object({
    ...intentBase,
    kind: z.literal('end-encounter'),
    payload: z.object({
      /** classes#ending-effects: ending is the default; keeping is opt-in. */
      keepInstanceIds: z.array(z.string().min(1)).default([]),
    }),
  }),
]);

/** What callers construct (defaults optional) vs. what the reducer sees. */
export type Intent = z.input<typeof IntentSchema>;
export type ParsedIntent = z.output<typeof IntentSchema>;

/**
 * Structured log (engine-plan 3.2): data first, narrative later. `refusal`
 * covers the substrate-invariant rejections (unknown participant/instance,
 * invalid payload); rule violations warn and apply, never block.
 */
export const LogEntrySchema = z.object({
  kind: z.enum(['mutation', 'warning', 'informational', 'table-directive', 'refusal']),
  intentId: z.string().min(1),
  actor: ActorSchema,
  canonRefs: z.array(z.string().min(1)),
  message: z.string().min(1),
  data: z.record(z.string(), z.unknown()),
});

export type LogEntry = z.infer<typeof LogEntrySchema>;
