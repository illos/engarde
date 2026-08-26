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
  /** v6 generalized-grant discriminator. The default keeps v3–v5 stored
   * grants (and pre-v6 literals) valid — migration wraps them as
   * `next-roll` by parse [design §3]. */
  kind: z.literal('next-roll').default('next-roll'),
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

/**
 * The closed action-cost vocabulary [R-0029]: every surveyed ability header
 * action cell normalizes onto exactly these members (1,878 headers at the
 * accepted pin; case/spelling surface variants fold; `-` cells resolve by
 * context — Villain Action name lines vs the Wave of Blood no-cost
 * sub-ability form). A future cost category is a new enum member, not a
 * schema migration; unknown FUTURE surface values refuse to normalize and
 * surface as residue, never guessed.
 */
export const ACTION_COSTS = [
  'main-action',
  'maneuver',
  'move-action',
  'triggered-action',
  'free-triggered-action',
  'free-maneuver',
  'no-action',
  'villain-action',
] as const;
export const ActionCostSchema = z.enum(ACTION_COSTS);
export type ActionCost = z.infer<typeof ActionCostSchema>;

/**
 * Printed escapes ride grants, never warnings [R-0030]: critical hit's
 * "additional main action … whether or not it's your turn and even if you
 * are dazed" [rule.combat/critical-hit], the Solo Action malice sheets
 * ("They can use this feature even if they are dazed"), tactician Out of
 * Position ("even if you are surprised"). A grant consumed with the
 * matching escape flag suppresses that violation warning — escapes are a
 * general grant property, not a crit special case.
 */
export const GrantEscapesSchema = z.object({
  ignoresDazed: z.boolean().default(false),
  ignoresSurprised: z.boolean().default(false),
  offTurn: z.boolean().default(false),
});
export type GrantEscapes = z.infer<typeof GrantEscapesSchema>;

/** Grant expiry vocabulary: null = the R-0012 default (until consumed,
 * encounter-end sweep); 'end-of-round' rides the start-of-round sweep. */
export const GrantExpirySchema = z.enum(['end-of-round']).nullable();

/**
 * An `action` grant [design §3, R-0030]: an extra action of a given cost
 * beyond the printed turn budget. Critical hit compiles to one; the
 * Director's manual grant intent covers malice Solo Actions until the
 * malice family lands. Consumption is SILENT — printed escapes never warn.
 */
export const ActionGrantSchema = z.object({
  kind: z.literal('action'),
  grantId: z.string().min(1),
  cost: ActionCostSchema,
  magnitude: z.number().int().positive().default(1),
  escapes: GrantEscapesSchema.default({
    ignoresDazed: false,
    ignoresSurprised: false,
    offTurn: false,
  }),
  expiry: GrantExpirySchema.default(null),
  source: ConditionSourceSchema,
});
export type ActionGrant = z.infer<typeof ActionGrantSchema>;

/**
 * A `turn` grant [design §3]: whole-turn scheduling — an extra turn
 * allowance this round ('allowance') or an out-of-order turn insertion
 * ('insertion'). The scheduling ability family (Hesitation Is Weakness,
 * Patter Song, …) plugs in later; this arc ships the shape plus
 * Director-asserted scheduling. `no-consecutive` mirrors the printed solo
 * constraint ("They can't take turns consecutively").
 */
export const TurnGrantSchema = z.object({
  kind: z.literal('turn'),
  grantId: z.string().min(1),
  mode: z.enum(['allowance', 'insertion']),
  magnitude: z.number().int().positive().default(1),
  constraint: z.enum(['no-consecutive']).nullable().default(null),
  expiry: GrantExpirySchema.default(null),
  source: ConditionSourceSchema,
});
export type TurnGrant = z.infer<typeof TurnGrantSchema>;

/**
 * The generalized grant union (v6, design §3; red-team B6/F4). A plain
 * union — not a discriminated union — so the `next-roll` member's defaulted
 * discriminator keeps v3–v5 stored grants parseable; per-kind
 * consumption/expiry config lives in the grant registry
 * (grant-lifecycle.ts), not call sites.
 */
export const GrantSchema = z.union([NextRollGrantSchema, ActionGrantSchema, TurnGrantSchema]);
export type Grant = z.infer<typeof GrantSchema>;

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

/**
 * Seeded trait data (v6, design §3): printed per-creature turn/trigger
 * structure asserted at seed time from the stat block — never derived.
 * "The dragon can take two turns each round. They can't take turns
 * consecutively." (21 solo statblocks); Ajax's three turns + three
 * triggered actions; declared sub-actors (Xorannox's eyestalks,
 * gloom-dragon's illusion, blackcap ash clones) spend budgets within
 * their owner's turn without entering turnsTaken.
 */
export const ParticipantTraitsSchema = z.object({
  turnAllowance: z.number().int().positive().default(1),
  noConsecutiveTurns: z.boolean().default(false),
  /** "You can use one triggered action per round" [rule.combat/
   * triggered-action]; Ajax's 3 is seeded trait data (its not-dazed
   * condition rides an escape-flagged grant, not this number). */
  triggeredActionLimit: z.number().int().min(0).default(1),
  /** Declared sub-actor: acts within this owner's turn slot. */
  subActorOf: ParticipantIdSchema.nullable().default(null),
});
export type ParticipantTraits = z.infer<typeof ParticipantTraitsSchema>;

/** One per-cost consumed/granted counter pair (v6). `granted` counts
 * capacity added beyond the printed budget (action-conversion targets,
 * consumed action grants), so capacity = base + granted always and only a
 * true violation exceeds it. */
export const ActionBudgetCellSchema = z.object({
  used: z.number().int().min(0).default(0),
  granted: z.number().int().min(0).default(0),
});
export type ActionBudgetCell = z.infer<typeof ActionBudgetCellSchema>;

/** Per-ability usage counters (v6): the printed once-per-round cap family
 * (Ride's two counters, Keeper of Order's capped free trigger, siege
 * actions) warns correctly through these [R-0029 scope, R-0030]. */
export const AbilityUseCountersSchema = z.object({
  round: z.number().int().min(0).default(0),
  turn: z.number().int().min(0).default(0),
  encounter: z.number().int().min(0).default(0),
});
export type AbilityUseCounters = z.infer<typeof AbilityUseCountersSchema>;

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
  /** Pending grants (v3 next-roll, R-0012..R-0016; v6 generalized union,
   * design §3). The default keeps pre-v3 literals valid while migration
   * stamps the version. */
  grants: z.array(GrantSchema).default([]),
  /** v6 additions — defaults keep v5 stored bodies and literals valid. */
  traits: ParticipantTraitsSchema.default({
    turnAllowance: 1,
    noConsecutiveTurns: false,
    triggeredActionLimit: 1,
    subActorOf: null,
  }),
  /** Per-turn action budget, keyed by the actionCost enum (a Record, not a
   * closed struct — a future cost category is an enum member, not a schema
   * migration) [design §3]. Reset by the start-of-turn/start-of-round
   * sweeps. */
  actionBudget: z
    .record(z.string(), ActionBudgetCellSchema)
    .refine(
      (budget) =>
        Object.keys(budget).every((key) => (ACTION_COSTS as readonly string[]).includes(key)),
      { message: 'actionBudget keys must be action-cost enum members' },
    )
    .default({}),
  /** "You can use one triggered action per round" [rule.combat/
   * triggered-action]; free triggered actions bypass this counter. */
  triggeredThisRound: z.number().int().min(0).default(0),
  /** Per-ability usage counters keyed by ability artifact id. */
  abilityUses: z.record(z.string().min(1), AbilityUseCountersSchema).default({}),
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

/**
 * Combat sides [rule.combat/combat-round §Determine Who Goes First: "the
 * heroes' side or the other side"]. Participants map by kind: hero →
 * 'heroes', director-creature → 'director'.
 */
export const SIDES = ['heroes', 'director'] as const;
export const SideSchema = z.enum(SIDES);
export type Side = z.infer<typeof SideSchema>;

/**
 * Encounter-level turn structure (v6, design §3). `turnsTaken` is a COUNT
 * map, not a set — solos take two turns, Ajax three [21 statblocks +
 * Ajax]; `lastTurnId` serves the no-consecutive-turns warn. Turn ids are
 * participant ids or squad ids (a squad occupies one turn slot — "All
 * members of a minion squad act together on the same initiative",
 * Monsters p.7 [R-0033]). Global scalar slots walk the invariant claim
 * machinery under the documented singleton-key convention (the field name
 * is the key).
 */
export const TurnStateSchema = z.object({
  round: z.number().int().positive(),
  /** "The side whose members acted first during the initial combat round
   * goes first in all subsequent rounds." [Heroes p.267]. */
  firstSide: SideSchema,
  /** Alternation pointer: whose side the next turn choice belongs to. */
  sideToChoose: SideSchema,
  activeTurnId: z.string().min(1).nullable(),
  lastTurnId: z.string().min(1).nullable(),
  turnsTaken: z.record(z.string().min(1), z.number().int().min(0)),
});
export type TurnState = z.infer<typeof TurnStateSchema>;

/**
 * Encounter-level villain-action economy (v6): "A creature with villain
 * actions always has three. Each villain action can be used only once per
 * encounter, and no more than one villain action can be used per round."
 * — even across creatures [rule.monster/villain-action, Monsters p.4].
 */
export const VillainActionStateSchema = z.object({
  usedThisRound: z.boolean().default(false),
  /** Ability artifact ids spent this encounter (once each). */
  usedByAbility: z.array(z.string().min(1)).default([]),
});
export type VillainActionState = z.infer<typeof VillainActionStateSchema>;

/**
 * One recorded roll — the COMPLETE recompute inputs [R-0032, red-team
 * F12], including per-target edge/bane pools [R-0014]. The invariant
 * suite re-derives total/tier from these on every dispatch.
 */
export const RollReceiptSchema = z.object({
  dice: z.tuple([z.number().int().min(1).max(10), z.number().int().min(1).max(10)]),
  characteristicValue: z.number().int(),
  characteristicLabel: z.string().min(1),
  bonuses: z.array(z.object({ value: z.number().int().positive(), reason: z.string().min(1) })),
  penalties: z.array(z.object({ value: z.number().int().positive(), reason: z.string().min(1) })),
  edges: z.number().int().min(0),
  banes: z.number().int().min(0),
  automaticOutcomes: z.array(z.union([z.literal(1), z.literal(2), z.literal(3)])),
  downgradeToTier: z.union([z.literal(1), z.literal(2)]).nullable(),
  natural: z.number().int(),
  total: z.number().int(),
  tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  naturalTopEnd: z.boolean(),
  /** Per-target pools/tiers where inbound marks applied [R-0014]. */
  perTarget: z
    .record(
      ParticipantIdSchema,
      z.object({
        edges: z.number().int().min(0),
        banes: z.number().int().min(0),
        tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
      }),
    )
    .default({}),
});
export type RollReceipt = z.infer<typeof RollReceiptSchema>;

/**
 * The modification vocabulary [R-0032, red-team F5]: a discriminated union
 * with a declared apply contract per kind, so a future family adds a
 * member instead of shotgun-editing the commit handler. Modifications
 * apply in dispatch order; retro-incoherent combinations warn-and-apply
 * with the full history on the receipt.
 */
export const ResolutionModificationSchema = z.discriminatedUnion('kind', [
  /** "you can downgrade it to select the outcome of a lower tier"
   * [rule.dice/power-roll]. Applies: effective tier = min(current, toTier). */
  z.object({ kind: z.literal('downgrade'), toTier: z.union([z.literal(1), z.literal(2)]) }),
  /** Tier-outcome mutation (angulotl Tongue Slap [R-0031 'rolled']).
   * Applies: effective tier = clamp(current + delta, 1..3). */
  z.object({
    kind: z.literal('tier-adjust'),
    delta: z.number().int(),
    reason: z.string().min(1),
  }),
  /** Potency manipulation mid-resolution. Applies: adds to the commit-time
   * potency adjustment pool (optionally per target). */
  z.object({
    kind: z.literal('potency-adjust'),
    delta: z.number().int(),
    target: ParticipantIdSchema.optional(),
    reason: z.string().min(1),
  }),
  /** Target replacement (goblin monarch "The ally is the target of the
   * triggering strike instead"). Applies: swaps `from` for `to` in the
   * committed target list; a `from` not in the list warns-and-skips. */
  z.object({
    kind: z.literal('retarget'),
    from: ParticipantIdSchema,
    to: ParticipantIdSchema,
    reason: z.string().min(1),
  }),
  /** Damage halving (Repel, In All This Confusion, ghost Shriek). The
   * books at the pin state no general halving-rounding rule, so the
   * rounding direction is a dispatch-asserted table fact (the spatial-fact
   * precedent), never invented. Applies: amount → halved, rounded as
   * asserted, per target when named. */
  z.object({
    kind: z.literal('damage-halve'),
    target: ParticipantIdSchema.optional(),
    rounding: z.enum(['down', 'up']),
    reason: z.string().min(1),
  }),
]);
export type ResolutionModification = z.infer<typeof ResolutionModificationSchema>;

/**
 * One entry on the keyed resolution STACK (v6, R-0032; red-team B1/B2):
 * a rolling ability in combat opens an entry storing the payload HASH
 * (commit re-supplies the payload and the engine verifies — the
 * Convex-boundary integrity precedent) plus the complete roll receipt.
 * Entries nest (a reaction that itself rolls; Breaking Point's inserted
 * turn); LIFO discipline is a warn, never corruption. Committed entries
 * stay on the stack (phase 'committed') so post-commit modifications are
 * distinguishable from unknown ids and bleeding's once-per-action dedup
 * can key on `actionKey` across a composed Charge [rule: "only happens
 * once per action", condition/bleeding].
 */
export const ResolutionEntrySchema = z.object({
  resolutionId: z.string().min(1),
  /** The owning actor: a participant id OR a squad id — widened exactly
   * like `turnState.activeTurnId`, because a squad signature attack (the
   * squad-attack follow-up family) opens ONE entry owned by the squad,
   * and end-turn force-commit already treats squad turns as ending
   * actors [R-0033, design §3]. */
  actorId: z.string().min(1),
  abilityArtifactId: z.string().min(1),
  /** The compiled action cost the dispatch carried (bleeding fires on main
   * actions, triggered actions, and M/A power rolls). */
  actionCost: ActionCostSchema.nullable(),
  /** SHA-256 hex of the canonical use-ability payload [R-0032]. */
  payloadHash: z.string().regex(/^[0-9a-f]{64}$/),
  /** partOf composition root: the parent reference for a composed inner
   * ability (Charge), else this entry's own resolutionId. */
  actionKey: z.string().min(1),
  phase: z.enum(['rolled', 'committed']),
  rollReceipt: RollReceiptSchema,
  modifications: z.array(ResolutionModificationSchema).default([]),
});
export type ResolutionEntry = z.infer<typeof ResolutionEntrySchema>;

export const EncounterStateSchema = z.object({
  schemaVersion: z.literal(6),
  participants: z.record(ParticipantIdSchema, ParticipantStateSchema),
  /** Attributed terrain alterations (v4, R-0022). Default keeps v3-shaped
   * literals valid while migration stamps the version. */
  terrainFacts: z.array(TerrainFactSchema).default([]),
  /** Minion squad Stamina pools (v5, R-0023..R-0028). Default keeps
   * v4-shaped literals valid while migration stamps the version. */
  squads: z.array(SquadStateSchema).default([]),
  /** Combat turn structure (v6, design §3). Null = combat not begun — the
   * economy machinery (debits, warns, two-phase resolution) activates with
   * `begin-combat` and stands down at encounter end. */
  turnState: TurnStateSchema.nullable().default(null),
  /** Encounter-level villain-action economy (v6). */
  villainActions: VillainActionStateSchema.default({ usedThisRound: false, usedByAbility: [] }),
  /** The keyed resolution stack (v6, R-0032). */
  resolutionStack: z.array(ResolutionEntrySchema).default([]),
});

export type EncounterState = z.infer<typeof EncounterStateSchema>;

/** The minion-squad-pool stored shape, retained for migration (migrate.ts).
 * Participant bodies parse through the current schema — every v6 slot
 * defaults — so only the version literal distinguishes the wrapper. */
export const EncounterStateV5Schema = z.object({
  schemaVersion: z.literal(5),
  participants: z.record(ParticipantIdSchema, ParticipantStateSchema),
  terrainFacts: z.array(TerrainFactSchema).default([]),
  squads: z.array(SquadStateSchema).default([]),
});

export type EncounterStateV5 = z.infer<typeof EncounterStateV5Schema>;

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
 * The five named reaction interception points [R-0031]. The books define
 * WHEN a triggered action may be used, never how it sequences against its
 * trigger (bundle + PDF confirmed silence), so these points are ruled
 * engine structure, not printed rule text. This arc ships the points and
 * the classification residue accounting; reaction-EFFECT automation is a
 * named follow-up family.
 */
export const INTERCEPTION_POINTS = [
  'targeting',
  'rolled',
  'pre-application',
  'applied',
  'replacement',
] as const;
export const InterceptionPointSchema = z.enum(INTERCEPTION_POINTS);
export type InterceptionPoint = z.infer<typeof InterceptionPointSchema>;

/**
 * A triggered/free-triggered ability's classification onto an interception
 * point [R-0031]. `classified: false` = no deterministic closed template
 * matched — the honest residue default: the point is `applied` and the
 * verbatim printed text rides along for table adjudication, never a silent
 * misresolution.
 */
export const ReactionInterceptionSchema = z.object({
  point: InterceptionPointSchema,
  classified: z.boolean(),
  /** Verbatim section text, carried exactly when unclassified. */
  sourceText: z.string().nullable(),
});
export type ReactionInterception = z.infer<typeof ReactionInterceptionSchema>;

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

/**
 * Compiled action-economy fields shared by the ability and Effect-program
 * shapes [R-0029, R-0031]. Defaults keep pre-v6 compiled literals valid.
 */
const compiledEconomyShape = {
  /** R-0029 normalization of the raw header cell. Null = headerless, or a
   * value the closed vocabulary refuses (see `actionCostResidue`) — never a
   * guess. */
  actionCost: ActionCostSchema.nullable().default(null),
  /** Why normalization refused, when it did (honest residue accounting). */
  actionCostResidue: z.string().nullable().default(null),
  /** `Main action (Adjacent creature)` [R-0029]: the budget debit lands on
   * the DISPATCHING ADJACENT OPERATOR — the fixture takes no turns. The
   * parenthetical stays verbatim on the raw actionType string. */
  operatorPays: z.boolean().default(false),
  /** Per-ability once-per-round cap compiled from the closed printed
   * phrases "only once per round" / "once per round" where present
   * (Ride's counters, siege-engine actions, Keeper of Order's capped free
   * trigger). Null = no printed cap read. */
  usesPerRound: z.number().int().positive().nullable().default(null),
  /** R-0031 interception-point classification, present exactly on compiled
   * triggered/free-triggered abilities. */
  reactionInterception: ReactionInterceptionSchema.nullable().default(null),
};

export const AbilityEffectDataSchema = z.object({
  abilityArtifactId: z.string().min(1),
  /** Header action type ("Main action", "Maneuver", …) — critical hits exist
   * only on main-action ability rolls [rule.combat/critical-hit]. */
  actionType: z.string().nullable(),
  ...compiledEconomyShape,
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
/** What callers construct (economy fields optional — pre-v6 literals stay
 * valid); the reducer parses to the full output shape. */
export type AbilityEffectDataInput = z.input<typeof AbilityEffectDataSchema>;

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
  ...compiledEconomyShape,
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
/** What callers construct (economy fields optional — pre-v6 literals stay
 * valid); the reducer parses to the full output shape. */
export type EffectProgramDataInput = z.input<typeof EffectProgramDataSchema>;

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

/**
 * The use-ability payload, named so `commit-resolution` and `end-turn`
 * force-commit can RE-SUPPLY it (R-0032, red-team B1: the pure reducer
 * dereferences nothing — the payload travels again and the stored hash
 * verifies it byte-for-byte in canonical form).
 */
export const UseAbilityPayloadSchema = z
  .object({
    actorParticipantId: ParticipantIdSchema,
    ability: AbilityEffectDataSchema,
    targets: z.array(ParticipantIdSchema).min(1),
    /** Composition reference [R-0032, design §3]: the parent dispatch's
     * intent id. The inner Charge-keyword ability consumes the parent's
     * already-debited main action — never a second one — and bleeding
     * keys once on the shared actionKey. */
    partOf: z.string().min(1).optional(),
    /** `Main action (Adjacent creature)` [R-0029]: the dispatching
     * adjacent operator who pays the budget debit. Absent on an
     * operator-paid ability → the debit routes to a table directive,
     * never a guess. */
    operatorId: ParticipantIdSchema.optional(),
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
    /** v0 pre-declared (design PL-1); the post-roll downgrade rides the
     * resolution stack's modification list in combat [R-0032]. */
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
  });

export type UseAbilityPayload = z.infer<typeof UseAbilityPayloadSchema>;
export type UseAbilityPayloadInput = z.input<typeof UseAbilityPayloadSchema>;

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
      /** R-0001 escape hatch, asserted at dispatch: the imposing ability's
       * own text grants anytime ending ("(no action required)" — eight
       * printed abilities). Suppresses the off-turn free-maneuver warn. */
      noActionRequired: z.boolean().default(false),
    }),
  }),
  z.object({
    ...intentBase,
    kind: z.literal('use-ability'),
    payload: UseAbilityPayloadSchema,
  }),
  z.object({
    ...intentBase,
    kind: z.literal('use-effect'),
    payload: z
      .object({
        actorParticipantId: ParticipantIdSchema,
        effect: EffectProgramDataSchema,
        /** Composition reference [design §3]: the parent dispatch's intent
         * id — the parent's debit covers this instruction (a multi-Effect
         * ability is one printed cost). */
        partOf: z.string().min(1).optional(),
        /** Operator-paid fixture instruction [R-0029]. */
        operatorId: ParticipantIdSchema.optional(),
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
       * assigns IDENTITY only; the 0-Stamina trigger receipt fired
       * anonymously at count time (the pending-kills mutation entry carries
       * `zeroStaminaTrigger: { pending: true, … }`), never again here
       * [R-0027]. */
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
      /** The ending turn's id — a participant id, or a squad id (a squad
       * occupies one turn slot [R-0033]). */
      participantId: ParticipantIdSchema,
      /** Manual saving-throw rolls by instance id; absent = auto-roll. */
      rolls: z.record(z.string(), z.number().int()).optional(),
      /** Re-supplied payloads for the ending actor's OPEN resolution
       * entries, keyed by resolutionId [design §3]: end-turn force-commits
       * them FIRST (printed damage is never discarded), then sweeps; a
       * missing payload is a structural refusal — the pure reducer cannot
       * execute an entry it cannot re-verify (red-team B1/F8). */
      commitPayloads: z.record(z.string().min(1), UseAbilityPayloadSchema).default({}),
    }),
  }),
  z.object({
    ...intentBase,
    kind: z.literal('begin-combat'),
    payload: z.object({
      /** The side taking the first turn — the table's outcome of the
       * printed procedure [rule.combat/combat-round §Determine Who Goes
       * First]. */
      firstSide: SideSchema,
      /** "If all the creatures on one side are surprised, then a creature
       * on the other side gets to act first." — the automatic case. */
      surprisedSide: SideSchema.nullable().default(null),
      /** Asserted d10 wins; absent → one draw from the injected source
       * ("the Director or a player they choose rolls a d10"). */
      roll: dieRoll.optional(),
      /** Who made the 1–5/6+ choice, when asserted: the roll assigns it
       * ("On a 6 or higher, the players determine … Otherwise, the
       * Director decides"); a deviation is warn-and-apply (project
       * permissive policy, NOT printed authority — red-team ledger). */
      chosenBy: z.enum(['players', 'director']).optional(),
    }),
  }),
  z.object({
    ...intentBase,
    kind: z.literal('start-turn'),
    payload: z.object({
      /** A participant id or squad id. R-0030 violations (already acted,
       * out of alternation, consecutive solo turns) warn-and-apply; round
       * advance is NEVER computed here [design §3]. */
      turnId: z.string().min(1),
    }),
  }),
  z.object({
    ...intentBase,
    kind: z.literal('advance-round'),
    payload: z.object({
      /** Director-asserted [design §3, red-team F6]: the printed round
       * definition is advisory; the engine warns listing living unspent
       * turns, then runs the start-of-round sweeps. */
      reason: z.string().min(1).optional(),
    }),
  }),
  z.object({
    ...intentBase,
    kind: z.literal('convert-action'),
    payload: z.object({
      participantId: ParticipantIdSchema,
      /** "You can also turn your main action into a move action or a
       * maneuver" [rule.combat/turn] — always FROM the main action. */
      to: z.enum(['maneuver', 'move-action']),
    }),
  }),
  z.object({
    ...intentBase,
    kind: z.literal('use-triggered-action'),
    payload: z.object({
      participantId: ParticipantIdSchema,
      /** The printed triggered ability this dispatch exercises. */
      abilityArtifactId: z.string().min(1),
      /** Free triggered action: "doesn't count against your limit of one
       * triggered action per round" [rule.combat/triggered-action] — but
       * honors per-ability caps and BOTH prevention couplings. */
      free: z.boolean().default(false),
      /** A receipt-visible trigger occurrence, or a table assertion
       * (Ride's triggerless free-trigger dispatches without one). */
      trigger: z
        .discriminatedUnion('kind', [
          z.object({ kind: z.literal('occurrence'), intentId: z.string().min(1) }),
          z.object({ kind: z.literal('asserted'), text: z.string().min(1) }),
        ])
        .nullable()
        .default(null),
      /** The compiled per-ability once-per-round cap, supplied from the
       * compiled shape (Keeper of Order = 1); null = no printed cap. */
      perRoundCap: z.number().int().positive().nullable().default(null),
    }),
  }),
  z.object({
    ...intentBase,
    kind: z.literal('use-villain-action'),
    payload: z.object({
      participantId: ParticipantIdSchema,
      abilityArtifactId: z.string().min(1),
    }),
  }),
  z.object({
    ...intentBase,
    kind: z.literal('add-grant'),
    payload: z.object({
      /** Director grant intent [design §3, R-0030]: escape-flagged action
       * grants cover the Solo Action malice spends until the malice family
       * lands; turn grants cover Director-asserted scheduling. Grant
       * identity derives from the intent id (deterministic, like condition
       * instances). */
      target: ParticipantIdSchema,
      grant: z.union([
        NextRollGrantSchema.omit({ grantId: true }),
        ActionGrantSchema.omit({ grantId: true }),
        TurnGrantSchema.omit({ grantId: true }),
      ]),
    }),
  }),
  z.object({
    ...intentBase,
    kind: z.literal('commit-resolution'),
    payload: z.object({
      resolutionId: z.string().min(1),
      /** The re-supplied payload; the engine verifies its canonical hash
       * against the entry and executes against COMMIT-TIME state
       * [R-0032]. */
      payload: UseAbilityPayloadSchema,
    }),
  }),
  z.object({
    ...intentBase,
    kind: z.literal('modify-resolution'),
    payload: z.object({
      resolutionId: z.string().min(1),
      modification: ResolutionModificationSchema,
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
