import { z } from 'zod';

/**
 * Engine state, intent, and log shapes (engine-plan 3.1 + 3.2). Universal
 * substrate only: no per-condition semantics live here — rule behavior is
 * supplied by callers/mechanisms grounded in canon artifacts, and every entry
 * that applies a rule carries `canonRefs` pointing at the artifact ids it
 * traces to.
 *
 * The ending vocabulary is exactly what scoped verbatim texts ground:
 * "(save ends)" [rule.general/saving-throw], "until the end of the
 * encounter" / the end-of-encounter default [classes#ending-effects],
 * "until the end of their next turn" [feature.ability.tactician.level-1/
 * mark], and bespoke endings resolved by explicit removal
 * [condition/grabbed]. Nothing else ships until an artifact grounds it.
 *
 * schemaVersion 2 (power-roll cluster, docs/power-roll-design.md): adds
 * participant kind/stats/stamina and the use-ability / apply-damage intents.
 * schemaVersion 3 (next-roll grants, docs/next-roll-grant-design.md,
 * R-0012..R-0016): adds the participant `grants` slot — the first persistent
 * non-condition modifier state. `upgradeEncounterState` in migrate.ts lifts
 * stored v1/v2 states.
 * schemaVersion 4 (flat-resource family, docs/flat-resource-design.md,
 * R-0017..R-0022): adds stored `recoveriesMax` / tracked `recoveries`
 * (the potencies precedent — class-determined, never derived) and the
 * encounter-level `terrainFacts` slot with the clear-terrain-fact intent.
 * schemaVersion 5 (minion squad pools, docs/minion-pool-design.md,
 * R-0023..R-0028): adds the encounter-level `squads` slot — shared minion
 * Stamina pools [chapter/monster-basics §Shared Low Stamina] — plus the
 * resolve-pending-kills / attach-captain / detach-captain intents and the
 * apply-damage `area` / `minionKillVictims` fields.
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

/**
 * One-shot next-roll edge/bane grants (R-0012..R-0016,
 * docs/next-roll-grant-design.md). A grant pends on its holder until the
 * first roll matching its scope/direction consumes it [R-0013]; bare grants
 * (window null) persist until the encounter-end sweep [R-0012]; windowed
 * grants expire at the holder's next end-turn event [R-0016].
 */
export const GRANT_POLARITIES = ['edge', 'double-edge', 'bane', 'double-bane'] as const;
export const GrantPolaritySchema = z.enum(GRANT_POLARITIES);
export type GrantPolarity = z.infer<typeof GrantPolaritySchema>;

export const GrantScopeSchema = z.enum(['strike', 'power-roll']);
export type GrantScope = z.infer<typeof GrantScopeSchema>;

/** 'outbound' rides the holder's own roll; 'inbound' rides the next
 * qualifying strike made AGAINST the holder [R-0014]. */
export const GrantDirectionSchema = z.enum(['outbound', 'inbound']);
export type GrantDirection = z.infer<typeof GrantDirectionSchema>;

export const GrantWindowSchema = z.enum(['end-of-targets-next-turn']);
export type GrantWindow = z.infer<typeof GrantWindowSchema>;

export const NextRollGrantSchema = z.object({
  grantId: z.string().min(1),
  polarity: GrantPolaritySchema,
  /** Which roll consumes it [R-0013]: 'strike' = the next Strike-keyword
   * ability roll; 'power-roll' = the next ability roll or test. */
  scope: GrantScopeSchema,
  direction: GrantDirectionSchema,
  /** Same-ability duplicates on one holder collapse
   * [classes#stacking-unique-effects, R-0014]. */
  source: ConditionSourceSchema,
  /** null = the R-0012 default: until consumed, encounter-end sweep. */
  window: GrantWindowSchema.nullable(),
});

export type NextRollGrant = z.infer<typeof NextRollGrantSchema>;

/** The five characteristics, scores −5..+5 [rule.character/characteristic]. */
export const CHARACTERISTIC_LETTERS = ['M', 'A', 'R', 'I', 'P'] as const;
export const CharacteristicLetterSchema = z.enum(CHARACTERISTIC_LETTERS);
export type CharacteristicLetter = z.infer<typeof CharacteristicLetterSchema>;

const characteristicScore = z.number().int().min(-5).max(5);

export const CharacteristicsSchema = z.object({
  might: characteristicScore,
  agility: characteristicScore,
  reason: characteristicScore,
  intuition: characteristicScore,
  presence: characteristicScore,
});

export type Characteristics = z.infer<typeof CharacteristicsSchema>;

/** The nine typed damage kinds [rule.damage/damage-type]; untyped is the
 * default and is represented by the ABSENCE of a type, never a tenth kind. */
export const DAMAGE_TYPES = [
  'acid',
  'cold',
  'corruption',
  'fire',
  'holy',
  'lightning',
  'poison',
  'psychic',
  'sonic',
] as const;
export const DamageTypeSchema = z.enum(DAMAGE_TYPES);
export type DamageType = z.infer<typeof DamageTypeSchema>;

/**
 * One damage immunity/weakness row from a stat block ("fire immunity 10",
 * "damage immunity 5"). `appliesTo: 'any'` is the untyped row — immunity to
 * all damage / weakness triggered by damage of any type
 * [rule.damage/damage-immunity, rule.damage/damage-weakness].
 */
export const DamageImmunitySchema = z.object({
  appliesTo: z.union([z.literal('any'), DamageTypeSchema]),
  value: z.union([z.number().int().positive(), z.literal('all')]),
});
export const DamageWeaknessSchema = z.object({
  appliesTo: z.union([z.literal('any'), DamageTypeSchema]),
  value: z.number().int().positive(),
});

/**
 * Hero potency values are STORED, never derived by the engine — the corpus
 * carries an unresolved tension between "highest characteristic" and
 * "determined by your class" (power-roll-design.md Gate-3 Q2).
 */
export const PotencyValuesSchema = z.object({
  weak: z.number().int(),
  average: z.number().int(),
  strong: z.number().int(),
});

export const ParticipantStatsSchema = z.object({
  staminaMax: z.number().int().positive(),
  characteristics: CharacteristicsSchema,
  immunities: z.array(DamageImmunitySchema),
  weaknesses: z.array(DamageWeaknessSchema),
  potencies: PotencyValuesSchema.nullable(),
  /** Stat-block organization (e.g. 'Minion'). Minions seeded into a squad
   * damage their squad's shared Stamina pool (v5, R-0023..R-0025); a minion
   * outside any seeded squad routes to a not-automated receipt — seeding is
   * the automation boundary [monsters chapter/monster-basics §Minions]. */
  organization: z.string().nullable(),
  /** "Each hero has a number of Recoveries determined by their class"
   * [rule.health/recoveries] — STORED like potencies, never derived. Null =
   * untracked (all Director-controlled creatures: "Director-controlled
   * creatures don't have Recoveries or a recovery value" [Combat §No
   * Recoveries]; heroes without character data). */
  recoveriesMax: z.number().int().min(0).nullable().default(null),
  /** The stat block's VERBATIM "With Captain" entry, carried through so
   * hosts can display it while a captain is attached — display only, never
   * automated (benefit automation is a named follow-up family) [R-0028].
   * Null = the stat block carries none. Default keeps pre-v5 stats literals
   * valid. */
  withCaptain: z.string().nullable().default(null),
});

export type ParticipantStats = z.infer<typeof ParticipantStatsSchema>;

export const StaminaStateSchema = z.object({
  /** MAY be negative while dying [rule.health/dying]. */
  current: z.number().int(),
  /** Separate pool, absorbs damage first [rule.health/temporary-stamina]. */
  temporary: z.number().int().min(0),
  /** Remaining Recoveries (v4, R-0018/R-0019). Tracked exactly when
   * stats.recoveriesMax is tracked; null otherwise. */
  recoveries: z.number().int().min(0).nullable().default(null),
});

export type StaminaState = z.infer<typeof StaminaStateSchema>;

const participantShape = {
  id: ParticipantIdSchema,
  conditions: z.array(ConditionInstanceSchema),
  /** The real corpus record this actor embodies (actors are never invented). */
  sourceRecordId: z.string().min(1).nullable().optional(),
  /** Heroes and Director-controlled creatures split on death rules
   * [rule.health/stamina, rule.health/dying]. Explicit at seed time. */
  kind: z.enum(['hero', 'director-creature']),
  /** null = table-mode actor: no stat automation, receipts only. */
  stats: ParticipantStatsSchema.nullable(),
  stamina: StaminaStateSchema.nullable(),
  /** Pending next-roll edge/bane grants (v3, R-0012..R-0016). The default
   * keeps v2-shaped literals valid while migration stamps the version. */
  grants: z.array(NextRollGrantSchema).default([]),
};

export const ParticipantStateSchema = z
  .object(participantShape)
  // v5 relaxation (R-0023): a SQUAD MEMBER carries stats (characteristics,
  // weakness/immunity feed the squad pipeline) with `stamina: null` — the
  // squad pool is the ONE home for its vitality. Tracked stamina still
  // requires stats; the invariant oracle enforces that every stats-tracked,
  // stamina-null participant is a seeded squad member.
  .refine((participant) => participant.stamina === null || participant.stats !== null, {
    message: 'tracked stamina requires tracked stats',
  })
  .refine(
    (participant) =>
      participant.stats === null ||
      participant.stamina === null ||
      (participant.stats.recoveriesMax === null) === (participant.stamina.recoveries === null),
    { message: 'recoveries are tracked exactly when recoveriesMax is known' },
  );

export type ParticipantState = z.infer<typeof ParticipantStateSchema>;

/**
 * One recorded terrain alteration (v4, R-0022): "The area is difficult
 * terrain." becomes a typed, attributed fact — the +1-square entry cost
 * [rule.combat/difficult-terrain via movement/difficult-terrain] stays
 * table-adjudicated until spatial substrate lands. Persists until the
 * Director clears it; does not survive the encounter.
 */
export const TerrainFactSchema = z.object({
  factId: z.string().min(1),
  terrain: z.literal('difficult'),
  /** Provenance: the Effect instruction that created it. */
  effectArtifactId: z.string().min(1),
  effectOrdinal: z.number().int().positive(),
  /** The ability header's verbatim area/distance cell ("3 burst",
   * "4 x 1 line within 1"), when the artifact carries one. */
  areaText: z.string().nullable(),
  /** The participant whose ability created it, when known. */
  createdBy: ParticipantIdSchema.nullable(),
  intentId: z.string().min(1),
});

export type TerrainFact = z.infer<typeof TerrainFactSchema>;

/**
 * One minion squad's shared Stamina pool (v5, R-0023..R-0028,
 * docs/minion-pool-design.md). Members stay individual participants (they
 * occupy space, are targeted, take conditions per-member); the squad is
 * encounter-level state — the terrainFacts precedent. The pool is the ONE
 * home for squad vitality: every member's `stamina` is null.
 * `pool.max == perMinionStamina × memberCount` is the printed init formula
 * ("initial Stamina equal to each individual minion's Stamina multiplied by
 * the number of minions in the squad" [chapter/monster-basics §Shared Low
 * Stamina]); `kills == floor((pool.max − pool.current) / perMinionStamina)`
 * is the standing R-0024 invariant.
 */
export const SquadStateSchema = z
  .object({
    squadId: z.string().min(1),
    /** Display label; statblock identity is the members' sourceRecordId. */
    name: z.string().min(1),
    /** The one per-minion Stamina the printed pool formula requires — a
     * mixed-statblock squad is refused at seeding [R-0023]. */
    perMinionStamina: z.number().int().positive(),
    pool: z.object({
      current: z.number().int().min(0),
      max: z.number().int().positive(),
    }),
    /** Living members, in seeded order. */
    memberIds: z.array(ParticipantIdSchema),
    /** Members taken out of the fight (dead for this encounter, R-0027). */
    deadMemberIds: z.array(ParticipantIdSchema),
    /** Kills counted by the pool whose victim identity awaits the table's
     * "nearest" adjudication [R-0024]; resolved by resolve-pending-kills. */
    pendingKills: z.number().int().min(0),
    /** Attached captain (R-0028); Stamina stays individual, never pooled. */
    captainId: ParticipantIdSchema.nullable(),
  })
  .refine((squad) => squad.pool.current <= squad.pool.max, {
    message: 'squad pool current may not exceed its maximum',
  });

export type SquadState = z.infer<typeof SquadStateSchema>;

export const EncounterStateSchema = z.object({
  schemaVersion: z.literal(5),
  participants: z.record(ParticipantIdSchema, ParticipantStateSchema),
  /** Attributed terrain alterations (v4, R-0022). Default keeps v3-shaped
   * literals valid while migration stamps the version. */
  terrainFacts: z.array(TerrainFactSchema).default([]),
  /** Minion squad Stamina pools (v5, R-0023..R-0028). Default keeps
   * v4-shaped literals valid while migration stamps the version. */
  squads: z.array(SquadStateSchema).default([]),
});

export type EncounterState = z.infer<typeof EncounterStateSchema>;

/** The flat-resource stored shape, retained for migration (migrate.ts).
 * Participant bodies parse through the current schema — `squads` defaults to
 * [] — so only the version literal distinguishes the wrapper. */
export const EncounterStateV4Schema = z.object({
  schemaVersion: z.literal(4),
  participants: z.record(ParticipantIdSchema, ParticipantStateSchema),
  terrainFacts: z.array(TerrainFactSchema).default([]),
});

export type EncounterStateV4 = z.infer<typeof EncounterStateV4Schema>;

/** The next-roll-grant stored shape, retained for migration (migrate.ts).
 * Participant bodies parse through the current schema — `recoveries` /
 * `recoveriesMax` default to null — so only the version literal
 * distinguishes the wrapper. */
export const EncounterStateV3Schema = z.object({
  schemaVersion: z.literal(3),
  participants: z.record(ParticipantIdSchema, ParticipantStateSchema),
});

export type EncounterStateV3 = z.infer<typeof EncounterStateV3Schema>;

/** The power-roll-cluster stored shape, retained for migration (migrate.ts). */
export const EncounterStateV2Schema = z.object({
  schemaVersion: z.literal(2),
  participants: z.record(ParticipantIdSchema, ParticipantStateSchema),
});

export type EncounterStateV2 = z.infer<typeof EncounterStateV2Schema>;

/** The pre-cluster stored shape, retained for migration (migrate.ts). */
export const EncounterStateV1Schema = z.object({
  schemaVersion: z.literal(1),
  participants: z.record(
    ParticipantIdSchema,
    z.object({
      id: ParticipantIdSchema,
      conditions: z.array(ConditionInstanceSchema),
      sourceRecordId: z.string().min(1).nullable().optional(),
    }),
  ),
});

export type EncounterStateV1 = z.infer<typeof EncounterStateV1Schema>;

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

/**
 * Compiled ability effect data — the OUTPUT of the canon package's
 * deterministic channel-1 compiler over verbatim ability text. The engine is
 * an interpreter over this data (engine-plan: data over code); it never
 * parses rulebook prose itself. Provenance rides on `abilityArtifactId`.
 */
export const PowerRollBonusSchema = z.discriminatedUnion('kind', [
  /** Monster form: "Power Roll + 2" — a fixed number, no characteristic. */
  z.object({ kind: z.literal('fixed'), value: z.number().int() }),
  /** "Power Roll + Might" (one option) or "… + Might or Agility" (choice). */
  z.object({
    kind: z.literal('characteristic'),
    options: z.array(CharacteristicLetterSchema).min(1),
  }),
  /** "Power Roll + your highest characteristic". */
  z.object({ kind: z.literal('highest') }),
]);

export type PowerRollBonus = z.infer<typeof PowerRollBonusSchema>;

export const PotencyThresholdSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('numeric'), value: z.number().int() }),
  z.object({ kind: z.literal('named'), name: z.enum(['weak', 'average', 'strong']) }),
]);

export type PotencyThreshold = z.infer<typeof PotencyThresholdSchema>;

export const TierDamageSchema = z.object({
  amount: z.number().int().min(0),
  /** "3 + M damage" → ['M']; "7 + M or A damage" → ['M','A']; plain → []. */
  characteristicOptions: z.array(CharacteristicLetterSchema),
  /** [] = untyped; one = typed; several = the rare "corruption or fire" choice. */
  typeOptions: z.array(DamageTypeSchema),
});

export type TierDamage = z.infer<typeof TierDamageSchema>;

export const TierEffectDataSchema = z.object({
  damage: TierDamageSchema.nullable(),
  potency: z
    .object({
      characteristic: CharacteristicLetterSchema,
      threshold: PotencyThresholdSchema,
    })
    .nullable(),
  /** Condition artifact ids from the explicit scc links in the tier line. */
  conditionIds: z.array(z.string().min(1)),
  ending: z.enum(['save-ends']).nullable(),
});

export type TierEffectData = z.infer<typeof TierEffectDataSchema>;

export const AbilityEffectDataSchema = z.object({
  abilityArtifactId: z.string().min(1),
  /** Header action type ("Main action", "Maneuver", …) — critical hits exist
   * only on main-action ability rolls [rule.combat/critical-hit]. */
  actionType: z.string().nullable(),
  /** Verbatim header keywords ("Melee, Strike, Weapon"). The Strike keyword
   * decides which rolls consume strike-scoped grants [rule.combat/strike,
   * R-0013]; the compiler passes the header cell through untouched. */
  keywords: z.array(z.string().min(1)).default([]),
  /** Verbatim targets line from the header ("One creature or object") —
   * exceeding it is a warn-and-apply rule violation. */
  targetsText: z.string().nullable(),
  powerRollBonus: PowerRollBonusSchema,
  tiers: z.object({
    tier1: TierEffectDataSchema,
    tier2: TierEffectDataSchema,
    tier3: TierEffectDataSchema,
  }),
});

export type AbilityEffectData = z.infer<typeof AbilityEffectDataSchema>;

/**
 * A compiled `**Effect:**` instruction. The canon package owns prose parsing;
 * the engine receives only validated data and either executes a known core
 * operation or emits the untouched instruction for table adjudication.
 * Unsupported prose is never rephrased into state.
 */
/** The five characteristic names as printed in test payloads. */
export const TEST_CHARACTERISTICS = [
  'might',
  'agility',
  'reason',
  'intuition',
  'presence',
] as const;
export const TestCharacteristicSchema = z.enum(TEST_CHARACTERISTICS);
export type TestCharacteristic = z.infer<typeof TestCharacteristicSchema>;

/**
 * One attached tier bullet of a characteristic test (R-0011): automatic when
 * the certified tier grammar reads the whole payload, verbatim otherwise.
 * Both retain the exact bullet line for receipts; nothing is paraphrased.
 */
export const TestTierSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('automatic'),
    data: TierEffectDataSchema,
    sourceText: z.string().min(1),
  }),
  z.object({ kind: z.literal('verbatim'), sourceText: z.string().min(1) }),
]);

export type TestTier = z.infer<typeof TestTierSchema>;

export const EffectResolutionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('damage'),
    amount: z.number().int().nonnegative(),
    damageType: DamageTypeSchema.nullable(),
  }),
  z.object({
    kind: z.literal('condition'),
    conditionId: z.string().min(1),
    ending: EndingSpecSchema,
    /** Canon-owned per-condition identity behavior (taunted replaces when
     * the source changes; grabbed does not). */
    replacesOnNewSource: z.boolean(),
  }),
  /** "(The|Each) target makes a[n] X test." — each creature target rolls
   * independently with their own named characteristic through the power-roll
   * core; objects auto-obtain tier 1 [R-0006, R-0007]. Skills cannot modify
   * these tests, so no skill input exists [R-0009]. */
  z.object({
    kind: z.literal('test'),
    characteristic: TestCharacteristicSchema,
    subject: z.enum(['the-target', 'each-target']),
    tiers: z.object({
      tier1: TestTierSchema,
      tier2: TestTierSchema,
      tier3: TestTierSchema,
    }),
  }),
  /** "(The|Each) target (takes a bane|takes a double bane|gains an edge|has
   * a double edge) on their next (strike|power roll)[ made before the end of
   * their next turn]." and "The next strike made against the target (gains
   * an edge|takes a bane)." — a one-shot attributed modifier grant stored on
   * each target [R-0012..R-0016, docs/next-roll-grant-design.md]. */
  z.object({
    kind: z.literal('next-roll-grant'),
    polarity: GrantPolaritySchema,
    scope: GrantScopeSchema,
    direction: GrantDirectionSchema,
    subject: z.enum(['the-target', 'each-target']),
    window: GrantWindowSchema.nullable(),
  }),
  /** "<subject> can spend a Recovery." — a declinable offer to each bound
   * participant [R-0018]; spending = −1 Recovery, +recoveryValue Stamina
   * through the one home; 0 Recoveries refuses the binding [R-0019a];
   * Director creatures convert to floor(staminaMax/3) with no pool
   * [R-0019b]; minions route to table [R-0019c]. */
  z.object({
    kind: z.literal('spend-recovery'),
    /** Links-stripped subject phrase, verbatim ("You or one ally within
     * distance") — eligibility is table-asserted at dispatch. */
    subjectText: z.string().min(1),
    /** True when the phrase names exactly one spender; over-binding warns
     * and applies (the established permissive receipt). */
    singular: z.boolean(),
  }),
  /** "<subject> regains N Stamina." — automatic, no recipient choice or
   * action [R-0020]; signed addition clamped at Stamina maximum [R-0017]. */
  z.object({
    kind: z.literal('regain-stamina'),
    amount: z.number().int().nonnegative(),
    subjectText: z.string().min(1),
    singular: z.boolean(),
  }),
  /** "<subject> gains N temporary Stamina." — pool becomes max(current,
   * granted), never the sum; cleared by the end-encounter sweep [R-0021]. */
  z.object({
    kind: z.literal('temporary-stamina'),
    amount: z.number().int().nonnegative(),
    subjectText: z.string().min(1),
    singular: z.boolean(),
  }),
  /** "The area is difficult terrain." — records an attributed terrain fact;
   * movement math stays table until spatial substrate lands [R-0022]. */
  z.object({
    kind: z.literal('terrain-fact'),
    terrain: z.literal('difficult'),
  }),
  z.object({ kind: z.literal('table') }),
]);

export type EffectResolution = z.infer<typeof EffectResolutionSchema>;

export const EffectProgramDataSchema = z.object({
  effectArtifactId: z.string().min(1),
  /** One-based occurrence within the artifact; repeated text remains distinct. */
  effectOrdinal: z.number().int().positive(),
  /** Byte span of the complete `**Effect:**` source line within artifact text. */
  sourceSpan: z
    .object({ byteStart: z.number().int().nonnegative(), byteEnd: z.number().int().positive() })
    .refine((span) => span.byteEnd > span.byteStart, { message: 'source span must be non-empty' }),
  /** Exact Markdown payload after `**Effect:**`, retained for receipts. */
  sourceText: z.string().min(1),
  /** Every explicit scc.v1 reference in source order, de-duplicated. */
  canonRefs: z.array(z.string().min(1)),
  actionType: z.string().nullable(),
  targetsText: z.string().nullable(),
  /** Verbatim area/distance header cell ("3 burst") — terrain facts record
   * it as the area's only available description [R-0022]. Default keeps
   * pre-v4 program literals valid. */
  distanceText: z.string().nullable().default(null),
  /** Verbatim header keywords, passed through like the ability form's — the
   * Area keyword is the printed discriminator for the squad-pool area cap
   * ("any source except an area effect (including abilities with the Area
   * keyword)" [chapter/monster-basics §Dropping Multiple Minions, R-0025]).
   * Default keeps pre-v5 program literals valid. */
  keywords: z.array(z.string().min(1)).default([]),
  resolution: EffectResolutionSchema,
});

export type EffectProgramData = z.infer<typeof EffectProgramDataSchema>;

const attributedValue = z.object({
  value: z.number().int().positive(),
  reason: z.string().min(1),
});

const intentBase = {
  intentId: z.string().min(1),
  actor: ActorSchema,
  spatialFacts: z.array(SpatialFactSchema).optional(),
};

const dieRoll = z.number().int().min(1).max(10);

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
    kind: z.literal('use-ability'),
    payload: z
      .object({
        actorParticipantId: ParticipantIdSchema,
        ability: AbilityEffectDataSchema,
        targets: z.array(ParticipantIdSchema).min(1),
        /** Asserted dice win; absent → exactly two draws from the injected
         * source, d1 then d2 (replay discipline, design SE-4). */
        dice: z.tuple([dieRoll, dieRoll]).optional(),
        characteristicChoice: CharacteristicLetterSchema.optional(),
        damageCharacteristicChoice: CharacteristicLetterSchema.optional(),
        damageTypeChoice: DamageTypeSchema.optional(),
        edges: z.number().int().min(0).default(0),
        banes: z.number().int().min(0).default(0),
        bonuses: z.array(attributedValue).default([]),
        penalties: z.array(attributedValue).default([]),
        automaticOutcomes: z.array(z.union([z.literal(1), z.literal(2), z.literal(3)])).default([]),
        /** v0 pre-declared (design PL-1); the post-roll two-phase flow is a
         * named follow-up with action economy. */
        downgradeToTier: z.union([z.literal(1), z.literal(2)]).optional(),
        /** Surge-shaped assertion seam: attributed extra damage / potency
         * bumps [rule.resource/surge], verified pools arrive later. */
        extraDamage: z
          .array(attributedValue.extend({ target: ParticipantIdSchema.optional() }))
          .default([]),
        potencyAdjustments: z
          .array(
            z.object({
              delta: z.number().int(),
              reason: z.string().min(1),
              target: ParticipantIdSchema.optional(),
            }),
          )
          .default([]),
        /** rule.health/stamina §Knocking Creatures Out. */
        knockOut: z.boolean().default(false),
      })
      .refine((payload) => new Set(payload.targets).size === payload.targets.length, {
        message: 'targets must be distinct',
      }),
  }),
  z.object({
    ...intentBase,
    kind: z.literal('use-effect'),
    payload: z
      .object({
        actorParticipantId: ParticipantIdSchema,
        effect: EffectProgramDataSchema,
        /** Manual area/world instructions may have no participant target;
         * automatic damage/condition programs require at least one. */
        targets: z.array(ParticipantIdSchema),
        /** Per-creature-target roll inputs for a test resolution. Asserted
         * dice win; absent → two draws per target from the injected source.
         * Sourced edges/banes and rule-specified numeric modifiers are the
         * ONLY modifier inputs — skills cannot modify creature/DTO reactive
         * tests, so no skill field exists [R-0009]; Assist is likewise
         * unavailable [R-0010]. */
        testRolls: z
          .record(
            ParticipantIdSchema,
            z.object({
              dice: z.tuple([dieRoll, dieRoll]).optional(),
              edges: z.number().int().min(0).default(0),
              banes: z.number().int().min(0).default(0),
              bonuses: z.array(attributedValue).default([]),
              penalties: z.array(attributedValue).default([]),
            }),
          )
          .default({}),
        /** Non-participant object targets of a test: they do not roll and
         * automatically obtain a tier 1 result [R-0007, rule.combat/target].
         * Labels are Director-asserted names, not participant ids. */
        objectTargets: z.array(z.string().min(1)).default([]),
        /** rule.health/stamina §Knocking Creatures Out. */
        knockOut: z.boolean().default(false),
        /** Per-offered-participant accept/decline for a spend-recovery
         * resolution [R-0018]: true = spends, false = declines. Every bound
         * target must answer; the receipt records who did what. */
        recoverySpends: z.record(ParticipantIdSchema, z.boolean()).default({}),
      })
      .refine((payload) => new Set(payload.targets).size === payload.targets.length, {
        message: 'targets must be distinct',
      })
      .refine((payload) => new Set(payload.objectTargets).size === payload.objectTargets.length, {
        message: 'object targets must be distinct',
      })
      .refine(
        (payload) =>
          payload.effect.resolution.kind === 'spend-recovery'
            ? Object.keys(payload.recoverySpends).every((id) => payload.targets.includes(id))
            : Object.keys(payload.recoverySpends).length === 0,
        {
          message:
            'recoverySpends applies only to spend-recovery resolutions, over declared targets',
        },
      )
      .refine(
        (payload) =>
          payload.effect.resolution.kind !== 'test' ||
          payload.targets.length + payload.objectTargets.length > 0,
        { message: 'a test requires at least one creature or object target' },
      )
      .refine(
        (payload) => Object.keys(payload.testRolls).every((id) => payload.targets.includes(id)),
        { message: 'testRolls may only name declared targets' },
      )
      .refine(
        (payload) =>
          payload.effect.resolution.kind === 'test' ||
          (Object.keys(payload.testRolls).length === 0 && payload.objectTargets.length === 0),
        { message: 'testRolls/objectTargets apply only to test resolutions' },
      )
      .refine(
        (payload) =>
          payload.effect.resolution.kind === 'table' ||
          payload.effect.resolution.kind === 'test' ||
          payload.effect.resolution.kind === 'terrain-fact' ||
          payload.targets.length > 0,
        { message: 'automatic Effect programs require at least one target' },
      ),
  }),
  z.object({
    ...intentBase,
    kind: z.literal('clear-terrain-fact'),
    payload: z.object({
      /** Director adjudication: rubble cleared, paste scraped away [R-0022]. */
      factId: z.string().min(1),
      reason: z.string().min(1).optional(),
    }),
  }),
  z.object({
    ...intentBase,
    kind: z.literal('apply-damage'),
    payload: z.object({
      target: ParticipantIdSchema,
      amount: z.number().int().min(0),
      damageType: DamageTypeSchema.optional(),
      reason: z.string().min(1),
      knockOut: z.boolean().default(false),
      /** Dispatch-asserted area effect — the manual-damage half of the
       * R-0025 discriminator (hazards and other non-ability area sources
       * carry no Area keyword). */
      area: z.boolean().default(false),
      /** Named extra victims when one instance kills beyond the damaged
       * target — the damager's printed choice; unnamed remainder becomes
       * pendingKills with a table directive [R-0024]. */
      minionKillVictims: z.array(ParticipantIdSchema).default([]),
    }),
  }),
  z.object({
    ...intentBase,
    kind: z.literal('resolve-pending-kills'),
    payload: z.object({
      /** Director-or-damager adjudication of "the minions nearest to those
       * taken out suffer the same fate" [chapter/monster-basics §Dropping
       * Multiple Minions, R-0024] — trust gates live in the host. Naming
       * assigns IDENTITY only; the 0-Stamina trigger receipt fired when the
       * kill was counted, never again here [R-0027]. */
      squadId: z.string().min(1),
      victimMemberIds: z.array(ParticipantIdSchema).min(1),
      reason: z.string().min(1).optional(),
    }),
  }),
  z.object({
    ...intentBase,
    kind: z.literal('attach-captain'),
    payload: z.object({
      /** Director authority (trust gates live in the host). Attaching over
       * an existing captain, or a captain already attached elsewhere, warns
       * and replaces/moves — the Director exercising the printed one-captain
       * rule [rule.monster/captain, R-0028]. */
      squadId: z.string().min(1),
      captainId: ParticipantIdSchema,
    }),
  }),
  z.object({
    ...intentBase,
    kind: z.literal('detach-captain'),
    payload: z.object({
      squadId: z.string().min(1),
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
      /** classes#ending-effects: ending is the default; keeping is opt-in.
       * Health-sourced instances (unconscious/dying-bleeding) are exempt —
       * "except for being winded, unconscious, or dying". */
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
