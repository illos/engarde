import { z } from 'zod';

export const EffectPresentationRulingSchema = z.object({
  artifactId: z.string().min(1),
  effectOrdinal: z.number().int().positive(),
  payloadSha256: z.string().regex(/^[0-9a-f]{64}$/),
  hostOwnership: z.enum(['VTT', 'engine-mixed']),
  movementKind: z.string().min(1),
});

/**
 * Accepted dispositions for Effect instructions whose remaining runtime
 * responsibility is presentation to the VTT/table under DEC-0011. These
 * remain honest `table` programs; acceptance changes backlog accounting, not
 * the compiled execution kind.
 */
export const EffectPresentationRulingsSchema = z.object({
  schema: z.literal('engarde-effect-presentation-rulings-v1'),
  canonPin: z.string().min(1),
  acceptedAt: z.string().min(1),
  authority: z.literal('DEC-0011'),
  disposition: z.literal('presentation-complete'),
  rulings: z.array(EffectPresentationRulingSchema),
});

export type EffectPresentationRulings = z.infer<typeof EffectPresentationRulingsSchema>;
