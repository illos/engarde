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
 * schemaVersion 7 (reaction effects, docs/reaction-effect-design.md,
 * R-0040): adds the encounter-level `occurrences` ledger — the derived
 * record of the events printed triggers condition on. Occurrences are
 * DERIVED from the log claim stream in one home (occurrences.ts), never
 * emitted per call site, and clear with the encounter like the
 * resolution stack.
 * schemaVersion 8 (reaction effects, R-0041): the resolution entry becomes
 * phase-DISCRIMINATED and gains a pre-roll `declared` arm, so reactions
 * triggered by being targeted have a lifecycle home. A declared entry has
 * no roll receipt and the union makes that unrepresentable; it carries
 * `declaredTargets` and a `declarationHash` (what was declared) alongside
 * the rolled arms' `payloadHash` (what was rolled).
 * schemaVersion 9 (side/kind decoupling, ROAD-0005 generalizing seam 4):
 * participants gain an explicit `side` slot, independent of `kind`. null =
 * kind-derived (hero → 'heroes', director-creature → 'director' — exactly
 * the pre-v9 behavior), supplied by the schema default; the one derivation
 * home is `sideOfParticipant` (action-economy.ts).
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
 * The three per-turn budget counters [rule.combat/turn] — the only costs an
 * `action` grant can extend, because grant consumption matches exactly the
 * personal-budget debits. Constraining the grant schema here makes a dead
 * grant (a cost the consumption filter could never match) unrepresentable;
 * the malice family widens this with semantics when it needs to.
 */
export const BUDGET_ACTION_COSTS = ['main-action', 'maneuver', 'move-action'] as const;
export const BudgetActionCostSchema = z.enum(BUDGET_ACTION_COSTS);
export type BudgetActionCost = z.infer<typeof BudgetActionCostSchema>;

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
  /** Budget costs only — a dead grant (a cost the consumption filter could
   * never match) is unrepresentable in parsed state. Plain narrow enum:
   * the host batch (backend addGrant validator + web addGrant form) now
   * carries the same BUDGET_ACTION_COSTS vocabulary end to end, so the
   * transitional wide-input pipe is gone [M-2]. */
  cost: BudgetActionCostSchema,
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
 * Hero potency values are STORED, never derived by the engine. The corpus's
 * "highest characteristic" vs "determined by your class" tension is RULED —
 * R-M, accepted 2026-08-30 (character-builder/01-rulings-needed.md §R-M):
 * the class-printed characteristic is definitional, and the derivation's one
 * home is canon's `heroStats` (extensionally equal readings for every RAW
 * hero). The engine's contract is unchanged: consume the stored triple.
 */
export const PotencyValuesSchema = z.object({
  weak: z.number().int(),
  average: z.number().int(),
  strong: z.number().int(),
});

/**
 * A deterministically classified persistent benefit phrase. Canon owns the
 * closed-template parser; the engine receives this compiled data beside the
 * verbatim source text and never parses rules prose itself [R-0038].
 */
export const BenefitPhraseSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('strike-edge'),
    magnitude: z.union([z.literal(1), z.literal(2)]),
    sourceText: z.string().min(1),
  }),
  z.object({
    kind: z.literal('strike-damage'),
    amount: z.number().int().positive(),
    sourceText: z.string().min(1),
  }),
  z.object({
    kind: z.literal('stamina'),
    amount: z.number().int().positive(),
    sourceText: z.string().min(1),
  }),
  z.object({
    kind: z.literal('directive'),
    template: z.enum(['speed', 'ranged-distance', 'melee-distance', 'forced-movement-distance']),
    amount: z.number().int().positive(),
    sourceText: z.string().min(1),
  }),
  /** Unknown future strings and the one bespoke in-pin string remain
   * lossless residue — automation never guesses from them. */
  z.object({ kind: z.literal('residue'), sourceText: z.string().min(1) }),
]);
export type BenefitPhrase = z.infer<typeof BenefitPhraseSchema>;

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
  /** Printed free-strike value. Nullable because hero character data and
   * pre-family stored stats can legitimately predate this field. */
  freeStrike: z.number().int().nonnegative().nullable().default(null),
  /** The stat block's VERBATIM "With Captain" entry, carried through so
   * hosts can display it while a captain is attached — display only, never
   * automated (benefit automation is a named follow-up family) [R-0028].
   * Null = the stat block carries none. Default keeps pre-v5 stats literals
   * valid. */
  withCaptain: z.string().nullable().default(null),
  /** Closed-template compilation of `withCaptain`, produced by canon.
   * Null when no phrase exists or old statsJson predates the lift. */
  withCaptainBenefit: BenefitPhraseSchema.nullable().default(null),
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
  /**
   * Per-actor access to the 17 printed common actions — the offer
   * surface's allow/exclude slot [ROAD-0005 seam #3]. Printed access is
   * ASYMMETRIC where it is printed at all: a stat block may bar specific
   * common actions from a creature, and another may re-include one that
   * was barred. `include` therefore overrides `exclude`.
   *
   * This is a substrate SLOT, not a rule: the core corpus prints no
   * exclusions, so it ships empty everywhere and nothing derives it. It
   * exists now because the alternative is retrofitting the offer surface
   * after it has callers, and because access is not derivable from any
   * other field. Entries are `feature.common.*` artifact ids.
   */
  commonActionAccess: z
    .object({
      exclude: z.array(z.string().min(1)).default([]),
      include: z.array(z.string().min(1)).default([]),
    })
    .default({ exclude: [], include: [] }),
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

/**
 * Combat sides [rule.combat/combat-round §Determine Who Goes First: "the
 * heroes' side or the other side"]. Side is INDEPENDENT of participant
 * `kind` (v9): kind says what a participant IS (the death-rules split),
 * side says who it fights FOR. Core content includes hero-side statblock
 * creatures (retainers; Summoner minions), so nothing may re-derive side
 * from kind — `sideOfParticipant` (action-economy.ts) is the one
 * derivation home.
 */
export const SIDES = ['heroes', 'director'] as const;
export const SideSchema = z.enum(SIDES);
export type Side = z.infer<typeof SideSchema>;

const participantShape = {
  id: ParticipantIdSchema,
  conditions: z.array(ConditionInstanceSchema),
  /** The real corpus record this actor embodies (actors are never invented). */
  sourceRecordId: z.string().min(1).nullable().optional(),
  /** Heroes and Director-controlled creatures split on death rules
   * [rule.health/stamina, rule.health/dying]. Explicit at seed time.
   * What the participant IS, never which side it fights on — see `side`. */
  kind: z.enum(['hero', 'director-creature']),
  /** Which side this participant fights on (v9) — explicit and independent
   * of `kind`. null = derive from kind through `sideOfParticipant` (hero →
   * 'heroes', director-creature → 'director'), the default every pre-v9
   * caller relies on. Seed it explicitly for a hero-side statblock
   * creature (the retainer / Summoner-minion shape). */
  side: SideSchema.nullable().default(null),
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
    commonActionAccess: { exclude: [], include: [] },
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
  /** Persistent data-derived modifiers, separate from asserted counts and
   * consumed grants on the roll receipt [R-0038]. */
  derivedModifiers: z
    .array(
      z.object({
        sourceText: z.string().min(1),
        edges: z.number().int().min(0),
        banes: z.number().int().min(0),
      }),
    )
    .default([]),
  /** Persistent per-target data-derived modifiers (for example, Angulotl
   * Dart's edge against a target below maximum Stamina). */
  perTargetDerivedModifiers: z
    .record(
      ParticipantIdSchema,
      z.array(
        z.object({
          sourceText: z.string().min(1),
          edges: z.number().int().min(0),
          banes: z.number().int().min(0),
        }),
      ),
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
/** Fields every phase of a resolution entry carries. */
const resolutionEntryBase = {
  kind: z.enum(['ability', 'squad-signature', 'squad-maneuver']).default('ability'),
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
  /** partOf composition root: the parent reference for a composed inner
   * ability (Charge), else this entry's own resolutionId. */
  actionKey: z.string().min(1),
  modifications: z.array(ResolutionModificationSchema).default([]),
  /** Roll-time packet/stacking data for squad-owned resolutions. Commit
   * consumes this stored breakdown instead of recomputing against mutable
   * state [R-0034]. */
  squadBreakdown: z
    .array(
      z.object({
        targetId: ParticipantIdSchema,
        instanceOwner: ParticipantIdSchema,
        memberIds: z.array(ParticipantIdSchema).min(1),
        tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
        packet: z.union([
          z.object({
            kind: z.literal('automatic'),
            data: z.lazy(() => TierEffectDataSchema),
            sourceText: z.string(),
          }),
          z.object({ kind: z.literal('residue'), sourceText: z.string().min(1) }),
        ]),
        stacking: z.discriminatedUnion('kind', [
          z.object({
            kind: z.literal('applied'),
            contributions: z.array(
              z.object({ memberId: ParticipantIdSchema, value: z.number().int().nonnegative() }),
            ),
            total: z.number().int().nonnegative(),
            damageType: DamageTypeSchema.nullable(),
          }),
          z.object({ kind: z.literal('none') }),
          z.object({
            kind: z.literal('residue'),
            reason: z.string().min(1),
            sourceText: z.string().min(1),
          }),
        ]),
        strikeDamageBonus: z.number().int().nonnegative().default(0),
      }),
    )
    .nullable()
    .default(null),
};

/** Fields that only exist once dice have been thrown. */
const rolledEntryFields = {
  /** SHA-256 hex of the canonical use-ability payload [R-0032]. */
  payloadHash: z.string().regex(/^[0-9a-f]{64}$/),
  /** Targets the dice were actually thrown against, after pre-roll edits. */
  rollTargets: z.array(ParticipantIdSchema).default([]),
  /** Legacy v6/v7 entries did not retain enough declaration data for an
   * honest reconstruction. New entries always carry a hash; null is the
   * explicit legacy sentinel. */
  declarationHash: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .nullable()
    .default(null),
  rollReceipt: RollReceiptSchema,
};

/**
 * DECLARED (v8, R-0041): targets named, dice not yet thrown. This phase
 * exists so reactions triggered by being TARGETED have a real moment to
 * act — "A creature targets the monarch with a strike" [Monsters p.164,
 * Goblin Monarch, Meat Shield] fires before any roll exists, and under a
 * roll-first stack there was nowhere for it to cut in. There is no roll
 * receipt here, and the union makes that unrepresentable rather than a
 * null check every reader has to remember.
 */
export const DeclaredResolutionEntrySchema = z.object({
  ...resolutionEntryBase,
  /** SHA-256 of actor, executable ability, payer context, and first-named
   * targets. Required for every declaration created by v8. */
  declarationHash: z.string().regex(/^[0-9a-f]{64}$/),
  phase: z.literal('declared'),
  /** The targets as they currently stand: as declared, plus any recorded
   * target edits. The roll is made against these. */
  declaredTargets: z.array(ParticipantIdSchema),
});

/** ROLLED: dice thrown, awaiting the explicit commit [R-0032]. */
export const RolledResolutionEntrySchema = z.object({
  ...resolutionEntryBase,
  ...rolledEntryFields,
  phase: z.literal('rolled'),
});

/** COMMITTED: applied. Stays on the stack so a post-commit modification is
 * distinguishable from an unknown id [R-0032]. */
export const CommittedResolutionEntrySchema = z.object({
  ...resolutionEntryBase,
  ...rolledEntryFields,
  phase: z.literal('committed'),
});

export const ResolutionEntrySchema = z.discriminatedUnion('phase', [
  DeclaredResolutionEntrySchema,
  RolledResolutionEntrySchema,
  CommittedResolutionEntrySchema,
]);

/** A resolution entry that has been rolled (rolled or committed) — the
 * shape every consumer of a roll receipt actually wants. */
export type RolledResolutionEntry =
  | z.infer<typeof RolledResolutionEntrySchema>
  | z.infer<typeof CommittedResolutionEntrySchema>;

/** A resolution entry awaiting its dice [R-0041]. */
export type DeclaredResolutionEntry = z.infer<typeof DeclaredResolutionEntrySchema>;

export type ResolutionEntry = z.infer<typeof ResolutionEntrySchema>;

/**
 * The ONE shape of the "a resolution opened" claim, built FROM the entry
 * so the claim and the entry can never disagree. Occurrence derivation
 * reads it for the `ability-used` and `roll-made` arms [R-0040]; three
 * sites open entries (ability, squad signature, squad maneuver) and all
 * three build the claim here. It lives beside the entry schema rather
 * than in resolution.ts so the emitters do not import the executor.
 */
export function resolutionOpenedClaim(entry: ResolutionEntry): Record<string, unknown> {
  return {
    resolutionId: entry.resolutionId,
    actorId: entry.actorId,
    abilityArtifactId: entry.abilityArtifactId,
    phase: entry.phase,
    declarationHash: entry.declarationHash,
    declaredTargets:
      entry.phase === 'declared' ? [...entry.declaredTargets] : [...entry.rollTargets],
    ...(entry.phase === 'declared' ? {} : { rollReceipt: entry.rollReceipt }),
  };
}

/**
 * The ONE claim for an ability application that does not open a resolution
 * entry. `use-effect` and the asserted-band apply intents emit this only for
 * the primary dispatch of a composed use; child dispatches carrying `partOf`
 * are effects of the same use, not additional uses [R-0040].
 */
export function nonrollingAbilityApplicationClaim(input: {
  actorId: string;
  abilityArtifactId: string;
  targetIds: readonly string[];
}): Record<string, unknown> {
  return {
    actorId: input.actorId,
    abilityArtifactId: input.abilityArtifactId,
    targetIds: [...input.targetIds],
    resolutionId: null,
  };
}

/**
 * The events a printed Trigger can condition on [R-0040]. Every arm is
 * derived from a machine-readable claim the engine already emits — see
 * `deriveOccurrences` in occurrences.ts, which is the ONE home. Nothing
 * emits an occurrence directly; adding a kind here means teaching that
 * one function to read the claim that already proves it happened.
 *
 * `takes damage` and `loses Stamina` are DISTINCT, non-exclusive arms, per
 * the ruling: the books print both phrasings as separate triggers on the
 * same page [Heroes p.132]. A hit that lowers current Stamina produces
 * both; damage absorbed by temporary Stamina produces only the first.
 */
export const OccurrenceSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('damage-taken'),
    occurrenceId: z.string().min(1),
    intentId: z.string().min(1),
    round: z.number().int().positive().nullable(),
    participantId: ParticipantIdSchema,
    /** The dealer, when the engine knows one. */
    sourceId: z.string().min(1).nullable(),
    amount: z.number().int().nonnegative(),
    damageType: DamageTypeSchema.nullable(),
    /** Heroes p.74 §Rolled Damage — a printed trigger sub-class. */
    rolled: z.boolean(),
    resolutionId: z.string().min(1).nullable(),
  }),
  z.object({
    kind: z.literal('stamina-lost'),
    occurrenceId: z.string().min(1),
    intentId: z.string().min(1),
    round: z.number().int().positive().nullable(),
    participantId: ParticipantIdSchema,
    amount: z.number().int().nonnegative(),
    sourceId: z.string().min(1).nullable(),
    resolutionId: z.string().min(1).nullable(),
  }),
  z.object({
    kind: z.literal('stamina-regained'),
    occurrenceId: z.string().min(1),
    intentId: z.string().min(1),
    round: z.number().int().positive().nullable(),
    participantId: ParticipantIdSchema,
    amount: z.number().int().nonnegative(),
  }),
  z.object({
    kind: z.literal('stamina-reduced-to-zero'),
    occurrenceId: z.string().min(1),
    intentId: z.string().min(1),
    round: z.number().int().positive().nullable(),
    /** A squad kill can count before the table supplies the victim's
     * identity [R-0027]. Null records that exact anonymous event. */
    participantId: ParticipantIdSchema.nullable(),
    squadId: z.string().min(1).nullable(),
    pendingIdentity: z.boolean(),
  }),
  z.object({
    kind: z.literal('health-transition'),
    occurrenceId: z.string().min(1),
    intentId: z.string().min(1),
    round: z.number().int().positive().nullable(),
    /** Pending squad deaths are real before the table supplies the nearest
     * victim's identity [R-0024/R-0040]. */
    participantId: ParticipantIdSchema.nullable(),
    squadId: z.string().min(1).nullable().default(null),
    pendingIdentity: z.boolean().default(false),
    transition: z.enum([
      'winded',
      'no-longer-winded',
      'dying',
      'no-longer-dying',
      'knocked-out',
      'died',
    ]),
  }),
  z.object({
    kind: z.literal('ability-used'),
    occurrenceId: z.string().min(1),
    intentId: z.string().min(1),
    round: z.number().int().positive().nullable(),
    actorId: z.string().min(1),
    abilityArtifactId: z.string().min(1),
    /** Null for a nonrolling application, which opens no stack entry. */
    resolutionId: z.string().min(1).nullable(),
  }),
  z.object({
    kind: z.literal('targeted'),
    occurrenceId: z.string().min(1),
    intentId: z.string().min(1),
    round: z.number().int().positive().nullable(),
    /** The creature that was named as a target. */
    participantId: ParticipantIdSchema,
    /** Who is targeting them, and with what. */
    actorId: z.string().min(1),
    abilityArtifactId: z.string().min(1),
    /** Null for a nonrolling application, which opens no stack entry. */
    resolutionId: z.string().min(1).nullable(),
  }),
  z.object({
    kind: z.literal('roll-made'),
    occurrenceId: z.string().min(1),
    intentId: z.string().min(1),
    round: z.number().int().positive().nullable(),
    actorId: z.string().min(1),
    /** Characteristic tests are power rolls without stack entries. */
    resolutionId: z.string().min(1).nullable(),
    tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    natural: z.number().int(),
    /** Net edges/banes as the one edge/bane home resolved them
     * [R-0014/R-0015] — printed triggers condition on "an ability that
     * gains an edge". */
    edges: z.number().int().nonnegative(),
    banes: z.number().int().nonnegative(),
  }),
  z.object({
    kind: z.literal('turn-started'),
    occurrenceId: z.string().min(1),
    intentId: z.string().min(1),
    round: z.number().int().positive().nullable(),
    participantId: z.string().min(1),
  }),
  z.object({
    kind: z.literal('turn-ended'),
    occurrenceId: z.string().min(1),
    intentId: z.string().min(1),
    round: z.number().int().positive().nullable(),
    participantId: z.string().min(1),
  }),
]);
export type Occurrence = z.infer<typeof OccurrenceSchema>;

export const EncounterStateSchema = z.object({
  schemaVersion: z.literal(9),
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
  /** The derived occurrence ledger (v7, R-0040): what happened, in the
   * vocabulary printed Triggers use. Derived in one home from claims the
   * engine already emits; cleared by the end-of-encounter sweep alongside
   * the resolution stack. Default keeps v6-shaped literals valid while
   * migration stamps the version. */
  occurrences: z.array(OccurrenceSchema).default([]),
});

export type EncounterState = z.infer<typeof EncounterStateSchema>;

/** The declaration-hash stored shape, retained for migration (migrate.ts).
 * Participant bodies parse through the current schema — the v9 `side` slot
 * defaults to null (kind-derived, the pre-v9 behavior) — so only the
 * version literal distinguishes the wrapper. */
export const EncounterStateV8Schema = z.object({
  schemaVersion: z.literal(8),
  participants: z.record(ParticipantIdSchema, ParticipantStateSchema),
  terrainFacts: z.array(TerrainFactSchema).default([]),
  squads: z.array(SquadStateSchema).default([]),
  turnState: TurnStateSchema.nullable().default(null),
  villainActions: VillainActionStateSchema.default({ usedThisRound: false, usedByAbility: [] }),
  resolutionStack: z.array(ResolutionEntrySchema).default([]),
  occurrences: z.array(OccurrenceSchema).default([]),
});

export type EncounterStateV8 = z.infer<typeof EncounterStateV8Schema>;

/** The occurrence-ledger stored shape, retained for migration (migrate.ts).
 * Its resolution entries are all `rolled`/`committed` — the v8 `declared`
 * arm did not exist — and remain loose until migration marks their
 * unreconstructable declaration hash explicitly as null. */
export const EncounterStateV7Schema = z.object({
  schemaVersion: z.literal(7),
  participants: z.record(ParticipantIdSchema, ParticipantStateSchema),
  terrainFacts: z.array(TerrainFactSchema).default([]),
  squads: z.array(SquadStateSchema).default([]),
  turnState: TurnStateSchema.nullable().default(null),
  villainActions: VillainActionStateSchema.default({ usedThisRound: false, usedByAbility: [] }),
  resolutionStack: z.array(z.record(z.string(), z.unknown())).default([]),
  occurrences: z.array(OccurrenceSchema).default([]),
});

export type EncounterStateV7 = z.infer<typeof EncounterStateV7Schema>;

/** The action-economy stored shape, retained for migration (migrate.ts).
 * Participant bodies parse through the current schema — the v7
 * `occurrences` slot defaults — so only the version literal distinguishes
 * the wrapper. */
export const EncounterStateV6Schema = z.object({
  schemaVersion: z.literal(6),
  participants: z.record(ParticipantIdSchema, ParticipantStateSchema),
  terrainFacts: z.array(TerrainFactSchema).default([]),
  squads: z.array(SquadStateSchema).default([]),
  turnState: TurnStateSchema.nullable().default(null),
  villainActions: VillainActionStateSchema.default({ usedThisRound: false, usedByAbility: [] }),
  // These bodies predate declarationHash and the declared phase.
  resolutionStack: z.array(z.record(z.string(), z.unknown())).default([]),
});

export type EncounterStateV6 = z.infer<typeof EncounterStateV6Schema>;

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
export type SpatialFact = z.infer<typeof SpatialFactSchema>;

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
  /** Bounded R-0036 grammar lift: the common Knockback tiers are exactly
   * Push 1/2/3. Geometry is not engine state, so execution emits this as a
   * compiled, receipt-visible movement directive. */
  forcedMovement: z
    .object({ kind: z.literal('push'), distance: z.number().int().positive() })
    .nullable()
    .optional(),
});

export type TierEffectData = z.infer<typeof TierEffectDataSchema>;

/**
 * The printed resource names observed in cost position at the accepted pin
 * (frontmatter `cost` fields in the heroes/summoner books; bold name-line
 * parentheticals in the monsters/summoner books). Closed and measured — a
 * FUTURE resource name refuses to parse and surfaces as residue, never a
 * guess. `point` is the ancestry-trait purchase cost exactly as printed
 * ("1 Point" / "2 Points"); no build-time semantics are implied here.
 * `eidos` is printed only as the "1 Eidos" action-cost cell of four
 * summoner champion stat blocks — that cell is FROZEN action-cost residue
 * pending ruling R-0046 and is deliberately not routed through the
 * resource-cost parser anywhere; the member exists so resolving R-0046 is
 * a wiring change, not a vocabulary change.
 */
export const RESOURCE_COST_RESOURCES = [
  'clarity',
  'discipline',
  'drama',
  'eidos',
  'essence',
  'ferocity',
  'focus',
  'insight',
  'malice',
  'piety',
  'point',
  'wrath',
] as const;
export const ResourceCostResourceSchema = z.enum(RESOURCE_COST_RESOURCES);
export type ResourceCostResource = z.infer<typeof ResourceCostResourceSchema>;

/**
 * Structured carry slot for one printed resource cost (ROAD-0005
 * generalizing seam #1). CARRY-ONLY: this records exactly what the book
 * prints — no debit semantics, no spend logic, no resource pools. Any
 * mechanism that actually spends a resource is future, separately ruled
 * work that consumes this one representation instead of growing its own
 * cost parser.
 *
 * The measured printed forms at the accepted pin:
 * - `N <Resource>` — flat ("5 Ferocity", "3 Malice", "2 Points");
 * - `N+ <Resource>` — open-ended minimum ("1+ Essence", "5+ Malice");
 * - `N <resource> per <unit>` — per-unit pricing ("1 essence per minion
 *   summoned", "1 Malice per target");
 * - `N <resource> for <count> <unit>` — bulk pricing ("3 essence for two
 *   minions", "9 essence for one champion").
 * Range labels ("3-7 Malice") and any unmeasured form refuse to parse.
 */
export const ResourceCostSchema = z.object({
  /** Printed leading integer. For the `N+` form this is the printed
   * minimum; for the `for <count>` form it is the whole printed price. */
  amount: z.number().int().nonnegative(),
  resource: ResourceCostResourceSchema,
  /** True exactly when the book prints the open-ended `N+` marker. */
  openEnded: z.boolean(),
  /** Verbatim per-unit qualifier, lowercased, from the closed measured set
   * ("N <resource> per <unit>"). Null = not a per-unit price. */
  per: z.enum(['minion summoned', 'minion', 'target']).nullable(),
  /** The printed bulk qualifier "for <count> <unit>" ("3 essence for two
   * minions"), count folded from the printed number word. Null = not a
   * bulk price. */
  forQuantity: z
    .object({
      count: z.number().int().positive(),
      unit: z.enum(['minion', 'champion']),
    })
    .nullable(),
  /** The exact printed cost text this slot was parsed from (scc links
   * stripped where it came from a linked name line). */
  sourceText: z.string().min(1),
});
export type ResourceCost = z.infer<typeof ResourceCostSchema>;

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
  /** Printed resource-cost carry slot (ROAD-0005 seam #1), parsed from the
   * cost-shaped bold name-line parenthetical the header walkback reads
   * ("Net Trap (3 Malice)"). CARRY-ONLY — no debit is implied or taken.
   * Null = the name line prints no cost-shaped parenthetical. Defaults
   * keep pre-existing compiled literals valid. */
  resourceCost: ResourceCostSchema.nullable().default(null),
  /** Why a cost-shaped parenthetical refused to parse, when it did (honest
   * residue accounting; the verbatim printed text rides in the message). */
  resourceCostResidue: z.string().nullable().default(null),
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
  /**
   * A printed clause that ENDS a condition rather than imposing one [S12] —
   * Stand Up's "ending that condition", and the corpus family of "you are
   * no longer X" clauses behind it.
   *
   * `conditionId` is the condition the printed clause NAMES. It is not the
   * selection: the printed phrase names a condition, while the engine's
   * unit of removal is an INSTANCE, and which instance(s) end when a
   * creature carries more than one is an open ruling. So selection stays
   * DISPATCH-SUPPLIED (`endedInstances`) and the engine never chooses —
   * it only checks the dispatch's choice against the printed name and says
   * so on the record.
   */
  z.object({
    kind: z.literal('end-condition'),
    conditionId: z.string().min(1),
  }),
  /**
   * A printed clause that has a creature MAKE a saving throw against one
   * named effect — Heal's "or can make a saving throw against one effect
   * they are suffering that is ended by a saving throw" [S10].
   *
   * It carries no instance and no roll, deliberately. The printed clause
   * says "one effect they are suffering"; WHICH one is a choice the table
   * makes (and who makes it is an open ruling — design §6.6 Heal S2), so
   * the selection rides the dispatch (`savingThrows`), the exact sibling of
   * `recoverySpends`. The d10 and the 6+ threshold are
   * `rule.general/saving-throw`'s and live in `SAVING_THROW`; nothing about
   * them is re-stated here.
   */
  z.object({
    kind: z.literal('saving-throw'),
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

/**
 * Every resolution kind the vocabulary speaks, derived from the schema
 * rather than re-listed. Boundary validators (the Convex play-panel query)
 * build their own unions FROM this — a second hand-written list is how a
 * new member ships invisible to a surface that was meant to show it.
 */
export const EFFECT_RESOLUTION_KINDS = EffectResolutionSchema.options.map(
  (option) => option.shape.kind.value,
) as readonly EffectResolution['kind'][];

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
 * The 17 printed common actions, grouped by the book's own directory
 * headings [feature.common.main-actions / .maneuvers / .move-actions].
 * The grouping is the ONE source of a common action's default cost — the
 * artifacts are headerless prose, so there is no `| … | **Maneuver** |`
 * cell for `normalizeActionCostValue` to read.
 */
export const COMMON_ACTION_GROUPS = ['main-actions', 'maneuvers', 'move-actions'] as const;
export const CommonActionGroupSchema = z.enum(COMMON_ACTION_GROUPS);
export type CommonActionGroup = z.infer<typeof CommonActionGroupSchema>;

/**
 * One printed once-per-round cap, WITH ITS SUBJECT. Ride prints two cap
 * sentences with different subjects — "A creature can use the Ride move
 * action only once per round" (the actor) and "A mounted creature can only
 * have this move action applied to them once per round" (the target) — so a
 * boolean would lose the mount-side counter's provenance and key both
 * limits to one counter.
 */
export const CommonActionPerRoundCapSchema = z.object({
  subject: z.enum(['actor', 'target']),
  uses: z.number().int().positive(),
  /** The printed sentence, verbatim (scc links stripped). */
  sourceText: z.string().min(1),
});
export type CommonActionPerRoundCap = z.infer<typeof CommonActionPerRoundCapSchema>;

/** A printed alternative branch ("Alternatively, a creature can use the
 * Ride move action to have their mount use the Disengage move action…").
 * The dispatch names one by key; the compiled text stays verbatim. */
export const CommonActionAlternativeSchema = z.object({
  key: z.string().min(1),
  sourceText: z.string().min(1),
  /**
   * A printed alternative that has a NAMED TARGET take a named action at a
   * named cost — "Alternatively, a creature can use the Ride move action to
   * have their mount use the Disengage move action as a free triggered
   * action." The printed phrase OVERRIDES the named action's own header
   * cost for this use, and the cost is the target's, not the actor's.
   *
   * Data, not an arm: without it the branch is a per-action `switch` on the
   * feature id inside the shared executor, and the second alternative of
   * this shape grows a second one. Null when the alternative does not name
   * an action for its target (Stand Up's ally case: one maneuver, the
   * actor's, and nothing is charged to the ally).
   */
  targetAction: z
    .object({ artifactId: z.string().min(1), actionCost: ActionCostSchema })
    .nullable()
    .default(null),
  /**
   * The resolution this branch executes, when it differs from the action's
   * primary one — Heal's two branches resolve differently ("can spend a
   * Recovery to regain Stamina, OR can make a saving throw against one
   * effect they are suffering"), and there is one printed main action
   * behind both.
   *
   * Null when the branch changes WHO, not WHAT: Stand Up's ally branch and
   * Ride's mount branch both keep their action's own resolution and only
   * move the roles around.
   *
   * Data, for the same reason `targetAction` is: the alternative is a
   * `switch` on the feature id inside the shared executor otherwise, and
   * the next two-branch action grows a second one.
   */
  resolution: EffectResolutionSchema.nullable().default(null),
});
export type CommonActionAlternative = z.infer<typeof CommonActionAlternativeSchema>;

/**
 * A printed COMPOSITION: an action whose text has the actor make a child
 * ABILITY dispatch as part of it — "then make a melee free strike … If the
 * creature has an ability with the Charge keyword, they can use that
 * ability against the target instead of a free strike."
 *
 * Data, not an arm. The child is dispatched separately (an ordinary
 * `use-ability` carrying `partOf`, so the one printed cost is paid once);
 * what the common-action dispatch carries is the printed CONSTRAINT on
 * which child is legal, so the arm's check is a generic predicate over
 * compiled data rather than a `switch` on the feature id.
 */
export const CommonActionCompositionSchema = z.object({
  /** The compiled ability the printed text names by default. */
  namedArtifactId: z.string().min(1),
  /** The printed phrase that names it, verbatim — proved against the
   * artifact's own bytes at compile time. */
  namedPhrase: z.string().min(1),
  /** A printed keyword that admits a SUBSTITUTE ability in place of the
   * named one, with the sentence granting the substitution. Null when the
   * printed text offers no substitute. */
  substitute: z
    .object({ keyword: z.string().min(1), sourceText: z.string().min(1) })
    .nullable()
    .default(null),
});
export type CommonActionComposition = z.infer<typeof CommonActionCompositionSchema>;

/**
 * A compiled common-action program — the dispatchable envelope for one of
 * the 17 headerless `feature.common.*` prose artifacts.
 *
 * `provenance` is a REQUIRED discriminator, not decoration: these artifacts
 * carry no `**Effect:**` line, and a receipt that labelled one as an Effect
 * program would misattribute the printed text. `debitContract` is likewise
 * required on the envelope rather than a per-arm convention — Free Strike's
 * companion ability prints the same `Main action` the prose does, so an arm
 * that assumed "self" would charge the striker twice.
 */
export const CommonActionProgramDataSchema = z
  .object({
    featureArtifactId: z.string().min(1),
    provenance: z.literal('prose-feature'),
    group: CommonActionGroupSchema,
    /** Byte span of the compiled text within the artifact (the whole
     * artifact: a prose feature has no sub-line to point at). */
    sourceSpan: z
      .object({ byteStart: z.number().int().nonnegative(), byteEnd: z.number().int().positive() })
      .refine((span) => span.byteEnd > span.byteStart, {
        message: 'source span must be non-empty',
      }),
    /** The artifact text, verbatim and untrimmed. */
    sourceText: z.string().min(1),
    /** Every explicit scc.v1 reference in source order, de-duplicated. */
    canonRefs: z.array(z.string().min(1)),
    /** The group directory's cost. A dispatch may override it (the printed
     * exceptions: two class features print Disengage at a free triggered
     * action, one prints Hide at a free maneuver, Make or Assist prints
     * three costs) — the override rides the intent, never this default. */
    defaultActionCost: ActionCostSchema,
    perRoundCaps: z.array(CommonActionPerRoundCapSchema).default([]),
    alternatives: z.array(CommonActionAlternativeSchema).default([]),
    /** `self` = this action's own dispatch pays the printed cost.
     * `companion` = the printed cost is carried by the compiled companion
     * ability this action buys, so the prose arm must NOT debit. */
    debitContract: z.enum(['self', 'companion']),
    companionArtifactIds: z.array(z.string().min(1)).default([]),
    /** The printed action moves the actor ("they move a number of squares
     * up to their speed") — recorded terrain facts are named in the
     * directive so the Director sees them at adjudication. The engine
     * never evaluates whether a path crossed one [DEC-0011, R-0022]. */
    movesActor: z.boolean().default(false),
    /** The printed child-ability composition, when the text names one. */
    composition: CommonActionCompositionSchema.nullable().default(null),
    /** Executable behaviour, when the printed text has some. `table` (the
     * default) is the verbatim-directive disposition. */
    resolution: EffectResolutionSchema.default({ kind: 'table' }),
  })
  .refine(
    (program) => program.debitContract === 'self' || program.companionArtifactIds.length > 0,
    { message: 'a companion-paid common action must name the companion that carries its cost' },
  );

export type CommonActionProgramData = z.infer<typeof CommonActionProgramDataSchema>;
/** What callers construct (defaults optional); the reducer parses to the
 * full output shape. */
export type CommonActionProgramDataInput = z.input<typeof CommonActionProgramDataSchema>;

/**
 * The resolution a common-action dispatch actually executes: the action's
 * own, unless the declared printed branch carries its own.
 *
 * ONE home, because two callers must agree byte-for-byte — the payload's
 * well-formedness refinements and the arm that executes. If the refinements
 * checked `feature.resolution` while the arm ran the branch's, a Heal
 * dispatching the saving-throw branch would have its inputs validated
 * against the Recovery branch's kind and vice versa: both directions
 * silently wrong.
 */
export function effectiveCommonActionResolution(dispatch: {
  feature: {
    resolution: EffectResolution;
    alternatives: ReadonlyArray<{ key: string; resolution: EffectResolution | null }>;
  };
  alternative: string | null;
}): EffectResolution {
  if (dispatch.alternative === null) return dispatch.feature.resolution;
  const branch = dispatch.feature.alternatives.find(
    (candidate) => candidate.key === dispatch.alternative,
  );
  return branch?.resolution ?? dispatch.feature.resolution;
}

/**
 * Payload inputs a compiled `EffectResolution` consumes, shared by the two
 * dispatch surfaces that carry one — `use-effect` (a compiled `**Effect:**`
 * program) and `use-common-action` (a compiled prose feature). ONE home:
 * the two surfaces execute through the same resolution applicator, so their
 * inputs and their well-formedness rules must not drift apart.
 */
const resolutionInputShape = {
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
  /** Per-target instance selection for an `end-condition` resolution [S12]:
   * the instance ids that end on each named target. Dispatch-supplied
   * because the printed clause names a CONDITION and the engine's unit of
   * removal is an INSTANCE — which instance(s) a "no longer X" clause ends
   * when a creature carries several is an open ruling, and picking one
   * here would be the engine answering it. Every bound target must be
   * answered; the receipt records what was chosen. */
  endedInstances: z.record(ParticipantIdSchema, z.array(z.string().min(1))).default({}),
  /** Per-target saving-throw selection for a `saving-throw` resolution
   * [S10] — the exact sibling of `recoverySpends`. The printed clause names
   * "one effect they are suffering", so the dispatch names the instance;
   * `roll` is the table's asserted d10 and wins over the injected source,
   * exactly as on the end-of-turn path. Every bound target must answer. */
  savingThrows: z
    .record(
      ParticipantIdSchema,
      z.object({ instanceId: z.string().min(1), roll: dieRoll.optional() }),
    )
    .default({}),
};

/** The shape both resolution-carrying payloads satisfy, for the shared
 * well-formedness predicates below. */
interface ResolutionInputPayload {
  targets: string[];
  objectTargets: string[];
  testRolls: Record<string, unknown>;
  recoverySpends: Record<string, boolean>;
  endedInstances: Record<string, string[]>;
  savingThrows: Record<string, { instanceId: string; roll?: number }>;
}

/** Shared payload predicates + their messages — one home for both dispatch
 * surfaces (a second copy is how the two drift). */
export const RESOLUTION_INPUT_RULES = {
  distinctTargets: {
    holds: (payload: { targets: string[] }): boolean =>
      new Set(payload.targets).size === payload.targets.length,
    message: 'targets must be distinct',
  },
  distinctObjectTargets: {
    holds: (payload: { objectTargets: string[] }): boolean =>
      new Set(payload.objectTargets).size === payload.objectTargets.length,
    message: 'object targets must be distinct',
  },
  recoverySpendsScoped: {
    holds: (payload: ResolutionInputPayload, resolutionKind: string): boolean =>
      resolutionKind === 'spend-recovery'
        ? Object.keys(payload.recoverySpends).every((id) => payload.targets.includes(id))
        : Object.keys(payload.recoverySpends).length === 0,
    message: 'recoverySpends applies only to spend-recovery resolutions, over declared targets',
  },
  endedInstancesScoped: {
    holds: (payload: ResolutionInputPayload, resolutionKind: string): boolean =>
      resolutionKind === 'end-condition'
        ? Object.keys(payload.endedInstances).every((id) => payload.targets.includes(id))
        : Object.keys(payload.endedInstances).length === 0,
    message: 'endedInstances applies only to end-condition resolutions, over declared targets',
  },
  savingThrowsScoped: {
    holds: (payload: ResolutionInputPayload, resolutionKind: string): boolean =>
      resolutionKind === 'saving-throw'
        ? Object.keys(payload.savingThrows).every((id) => payload.targets.includes(id))
        : Object.keys(payload.savingThrows).length === 0,
    message: 'savingThrows applies only to saving-throw resolutions, over declared targets',
  },
  distinctEndedInstances: {
    holds: (payload: ResolutionInputPayload): boolean =>
      Object.values(payload.endedInstances).every(
        (instanceIds) => instanceIds.length > 0 && new Set(instanceIds).size === instanceIds.length,
      ),
    message: 'each named target must end at least one instance, and each instance at most once',
  },
  testHasSubject: {
    holds: (payload: ResolutionInputPayload, resolutionKind: string): boolean =>
      resolutionKind !== 'test' || payload.targets.length + payload.objectTargets.length > 0,
    message: 'a test requires at least one creature or object target',
  },
  testRollsScoped: {
    holds: (payload: ResolutionInputPayload): boolean =>
      Object.keys(payload.testRolls).every((id) => payload.targets.includes(id)),
    message: 'testRolls may only name declared targets',
  },
  testInputsScoped: {
    holds: (payload: ResolutionInputPayload, resolutionKind: string): boolean =>
      resolutionKind === 'test' ||
      (Object.keys(payload.testRolls).length === 0 && payload.objectTargets.length === 0),
    message: 'testRolls/objectTargets apply only to test resolutions',
  },
  automaticNeedsTarget: {
    holds: (payload: ResolutionInputPayload, resolutionKind: string): boolean =>
      resolutionKind === 'table' ||
      resolutionKind === 'test' ||
      resolutionKind === 'terrain-fact' ||
      payload.targets.length > 0,
    message: 'automatic programs require at least one target',
  },
} as const;

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
    /** Hold at DECLARATION instead of rolling in the same dispatch
     * (v8, R-0041). Default false keeps the one-tap declare-roll-commit
     * the table actually uses; a host sets it when a reaction wants in
     * before the dice — "the app still does declare-roll-commit in one
     * tap unless a reaction wants in". The engine never decides this: it
     * cannot know who is holding a triggered action. */
    holdAtDeclaration: z.boolean().default(false),
  })
  .refine((payload) => new Set(payload.targets).size === payload.targets.length, {
    message: 'targets must be distinct',
  });

export type UseAbilityPayload = z.infer<typeof UseAbilityPayloadSchema>;
export type UseAbilityPayloadInput = z.input<typeof UseAbilityPayloadSchema>;

export const SquadTierPacketSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('automatic'), data: TierEffectDataSchema, sourceText: z.string() }),
  z.object({ kind: z.literal('residue'), sourceText: z.string().min(1) }),
]);
export type SquadTierPacket = z.infer<typeof SquadTierPacketSchema>;

/** Closed, compiler-produced semantics for trailing squad `Effect:` lines.
 * The phase is data because execution order is rules content: a modifier to
 * the current roll must exist before dice resolution, while extra damage is
 * part of the damage phase (before tier riders). Unrecognized prose never
 * enters this union and remains a verbatim table directive. */
export const SquadAbilityEffectProgramSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('target-edge-if-stamina-below-max'),
    phase: z.literal('pre-roll'),
    sourceText: z.string().min(1),
    canonRefs: z.array(z.string().min(1)),
  }),
  z.object({
    kind: z.literal('extra-damage-if-target-has-condition'),
    phase: z.literal('damage'),
    sourceText: z.string().min(1),
    canonRefs: z.array(z.string().min(1)),
    conditionId: z.string().min(1),
    amount: z.number().int().positive(),
  }),
]);
export type SquadAbilityEffectProgram = z.infer<typeof SquadAbilityEffectProgramSchema>;

/** Lossless signature/common-maneuver cluster: individual tiers can remain
 * residue without erasing the shared roll [R-0034(b/c), R-0036]. */
export const SquadAbilityDataSchema = z.object({
  abilityArtifactId: z.string().min(1),
  actionType: z.string().nullable(),
  actionCost: ActionCostSchema.nullable().default(null),
  actionCostResidue: z.string().nullable().default(null),
  /** Printed resource-cost carry slot (ROAD-0005 seam #1) — same
   * carry-only semantics as the ability/Effect-program shapes. Defaults
   * keep payloads serialized before this field valid. */
  resourceCost: ResourceCostSchema.nullable().default(null),
  resourceCostResidue: z.string().nullable().default(null),
  keywords: z.array(z.string().min(1)).default([]),
  targetsText: z.string().nullable(),
  powerRollBonus: PowerRollBonusSchema,
  tiers: z.object({
    tier1: SquadTierPacketSchema,
    tier2: SquadTierPacketSchema,
    tier3: SquadTierPacketSchema,
  }),
  /**
   * Verbatim `**Effect:**` line(s) printed with this ability, carried so the
   * squad path can never silently drop them. The squad compiler lifts only
   * power-roll tiers; before this field existed an ability's Effect clause
   * was parsed, passed grammar conservation, and then discarded — losing,
   * for instance, Bugbear Snare's "the target is automatically grabbed".
   * The exact line remains provenance whether a closed `effectPrograms`
   * member executes it or the engine surfaces it as a table directive.
   * Defaults `[]` so payloads serialized before this field still parse.
   */
  effectLines: z.array(z.string().min(1)).default([]),
  /** Machine semantics for the closed trailing-Effect subset. Defaults to
   * empty for payloads compiled before phase-aware squad Effects existed. */
  effectPrograms: z.array(SquadAbilityEffectProgramSchema).default([]),
});
export type SquadAbilityData = z.infer<typeof SquadAbilityDataSchema>;
export type SquadAbilityDataInput = z.input<typeof SquadAbilityDataSchema>;

export const SquadParticipationSchema = z.object({
  targetId: ParticipantIdSchema,
  instanceOwner: ParticipantIdSchema,
  memberIds: z
    .array(ParticipantIdSchema)
    .min(1)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: 'memberIds must be distinct per target',
    }),
});
export type SquadParticipation = z.infer<typeof SquadParticipationSchema>;

const squadRollFields = {
  dice: z.tuple([dieRoll, dieRoll]).optional(),
  characteristicChoice: CharacteristicLetterSchema.optional(),
  damageCharacteristicChoice: CharacteristicLetterSchema.optional(),
  damageTypeChoice: DamageTypeSchema.optional(),
  edges: z.number().int().min(0).default(0),
  banes: z.number().int().min(0).default(0),
  bonuses: z.array(attributedValue).default([]),
  penalties: z.array(attributedValue).default([]),
  automaticOutcomes: z.array(z.union([z.literal(1), z.literal(2), z.literal(3)])).default([]),
  downgradeToTier: z.union([z.literal(1), z.literal(2)]).optional(),
  knockOut: z.boolean().default(false),
};

export const SquadSignatureAttackPayloadSchema = z.object({
  squadId: z.string().min(1),
  ability: SquadAbilityDataSchema,
  participation: z.array(SquadParticipationSchema).min(1),
  partOfByMember: z.record(ParticipantIdSchema, z.string().min(1)).default({}),
  ...squadRollFields,
});
export type SquadSignatureAttackPayload = z.infer<typeof SquadSignatureAttackPayloadSchema>;
export type SquadSignatureAttackPayloadInput = z.input<typeof SquadSignatureAttackPayloadSchema>;

export const SquadFreeStrikePayloadSchema = z.object({
  squadId: z.string().min(1),
  targetId: ParticipantIdSchema,
  contributions: z
    .array(
      z.object({
        memberId: ParticipantIdSchema,
        count: z.number().int().positive().default(1),
      }),
    )
    .min(1)
    .refine((rows) => new Set(rows.map((row) => row.memberId)).size === rows.length, {
      message: 'free-strike contributors must be distinct',
    }),
  knockOut: z.boolean().default(false),
});
export type SquadFreeStrikePayload = z.infer<typeof SquadFreeStrikePayloadSchema>;

export const SquadManeuverPayloadSchema = z.object({
  squadId: z.string().min(1),
  maneuver: z.enum(['grab', 'hide', 'knockback', 'search-for-hidden-creatures']),
  participation: z.array(SquadParticipationSchema).min(1),
  ability: SquadAbilityDataSchema.nullable(),
  sourceText: z.string().min(1),
  ...squadRollFields,
});
export type SquadManeuverPayload = z.infer<typeof SquadManeuverPayloadSchema>;

export const ResolutionPayloadSchema = z.union([
  UseAbilityPayloadSchema,
  SquadSignatureAttackPayloadSchema,
  SquadManeuverPayloadSchema,
]);
export type ResolutionPayload = z.infer<typeof ResolutionPayloadSchema>;
export type ResolutionPayloadInput = z.input<typeof ResolutionPayloadSchema>;

/**
 * The asserted-band ability reference (design §3, R-0029/R-0030 parity):
 * a manual tier assertion — the path Directors use for
 * grammar-incompilable abilities, dispatching apply-damage /
 * apply-condition directly — is still a USE of the ability, so it debits
 * through the one ACTION_COST_DEBITS home exactly like the rolled path:
 * same silent grant consumption, same warn-and-apply on violations. It
 * opens NO resolution entry — nothing rolled, single-dispatch stays
 * correct. The cost comes from the compiled header where one exists;
 * for headerless prose (the common-actions gap) it stays
 * dispatch-asserted.
 */
export const AssertedAbilityUseSchema = z.object({
  /** The ability user, who pays the debit (the pure reducer dereferences
   * nothing — payer identity travels on the dispatch, the B1 precedent). */
  actorParticipantId: ParticipantIdSchema,
  abilityArtifactId: z.string().min(1),
  actionCost: ActionCostSchema,
  /** Compiled printed once-per-round cap, where present. */
  usesPerRound: z.number().int().positive().nullable().default(null),
  /** Composition: several asserted dispatches realizing ONE ability use
   * (a tier's damage + its condition) share the first dispatch's debit —
   * the same partOf semantics as the rolled path. */
  partOf: z.string().min(1).optional(),
});
export type AssertedAbilityUse = z.infer<typeof AssertedAbilityUseSchema>;

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
      /** Asserted-band economy parity (R-0029/R-0030): a manual tier
       * assertion for a grammar-incompilable ability is still a USE of
       * that ability, so it debits through the one ACTION_COST_DEBITS
       * home exactly like the rolled path. Null = a bare Director edit,
       * no ability behind it. */
      assertedAbilityUse: AssertedAbilityUseSchema.nullable().default(null),
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
      /** Asserted-band economy parity [S11] — the third member of the
       * family `apply-condition` and `apply-damage` already carry. Ending a
       * condition is as much a USE of the ability that prints the ending as
       * imposing one is, so it debits through the same one home.
       *
       * MUTUALLY EXCLUSIVE with the R-0001 imposer free maneuver above: an
       * imposer whose own ability prints the removal satisfies both
       * predicates, and one printed removal must not be charged twice at two
       * different costs. A non-null band wins — it names the printed cost;
       * the free maneuver is the default for a removal no ability claimed.
       * Null = a bare Director edit or the plain imposer case. */
      assertedAbilityUse: AssertedAbilityUseSchema.nullable().default(null),
    }),
  }),
  z.object({
    ...intentBase,
    kind: z.literal('use-ability'),
    payload: UseAbilityPayloadSchema,
  }),
  z.object({
    ...intentBase,
    kind: z.literal('squad-signature-attack'),
    payload: SquadSignatureAttackPayloadSchema,
  }),
  z.object({
    ...intentBase,
    kind: z.literal('squad-free-strike'),
    payload: SquadFreeStrikePayloadSchema,
  }),
  z.object({
    ...intentBase,
    kind: z.literal('squad-maneuver'),
    payload: SquadManeuverPayloadSchema,
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
        ...resolutionInputShape,
      })
      .refine(RESOLUTION_INPUT_RULES.distinctTargets.holds, {
        message: RESOLUTION_INPUT_RULES.distinctTargets.message,
      })
      .refine(RESOLUTION_INPUT_RULES.distinctObjectTargets.holds, {
        message: RESOLUTION_INPUT_RULES.distinctObjectTargets.message,
      })
      .refine(
        (payload) =>
          RESOLUTION_INPUT_RULES.recoverySpendsScoped.holds(
            payload,
            payload.effect.resolution.kind,
          ),
        { message: RESOLUTION_INPUT_RULES.recoverySpendsScoped.message },
      )
      .refine(
        (payload) =>
          RESOLUTION_INPUT_RULES.endedInstancesScoped.holds(
            payload,
            payload.effect.resolution.kind,
          ),
        { message: RESOLUTION_INPUT_RULES.endedInstancesScoped.message },
      )
      .refine(RESOLUTION_INPUT_RULES.distinctEndedInstances.holds, {
        message: RESOLUTION_INPUT_RULES.distinctEndedInstances.message,
      })
      .refine(
        (payload) =>
          RESOLUTION_INPUT_RULES.testHasSubject.holds(payload, payload.effect.resolution.kind),
        { message: RESOLUTION_INPUT_RULES.testHasSubject.message },
      )
      .refine(RESOLUTION_INPUT_RULES.testRollsScoped.holds, {
        message: RESOLUTION_INPUT_RULES.testRollsScoped.message,
      })
      .refine(
        (payload) =>
          RESOLUTION_INPUT_RULES.testInputsScoped.holds(payload, payload.effect.resolution.kind),
        { message: RESOLUTION_INPUT_RULES.testInputsScoped.message },
      )
      .refine(
        (payload) =>
          RESOLUTION_INPUT_RULES.automaticNeedsTarget.holds(
            payload,
            payload.effect.resolution.kind,
          ),
        { message: 'automatic Effect programs require at least one target' },
      ),
  }),
  /**
   * One dispatch path for all 17 printed common actions [common-actions
   * design §2 S1]. Deliberately NOT `use-effect` with a synthesized program
   * (a prose feature has no `**Effect:**` line to synthesize) and NOT
   * `use-ability` (no power roll, no tiers — synthesizing them would be
   * fabricated rule data).
   */
  z.object({
    ...intentBase,
    kind: z.literal('use-common-action'),
    payload: z
      .object({
        actorParticipantId: ParticipantIdSchema,
        feature: CommonActionProgramDataSchema,
        /** S3: the dispatch-supplied cost. Null = the compiled group
         * directory's default. The printed exceptions are real — two class
         * features print Disengage at a free triggered action, one prints
         * Hide at a free maneuver, Make or Assist prints three costs and
         * hands the choice to the Director — so defaulting silently would
         * be wrong on every one of them. */
        actionCost: ActionCostSchema.nullable().default(null),
        /** Composition reference: the parent dispatch's intent id. Within
         * this arm it is the printed break-up ("They can break up this
         * movement with their maneuver and main action however they wish")
         * — a later segment of the SAME action, so it consumes the
         * parent's debit and shares its use counter. */
        partOf: z.string().min(1).optional(),
        /** Operator-paid dispatch [R-0029], for parity with the Effect
         * surface; no common action prints an operator cell today. */
        operatorId: ParticipantIdSchema.optional(),
        /** The action's named participants — Ride's mount, Aid Attack's
         * ally, Catch Breath's self. Actions that name none dispatch [].*/
        targets: z.array(ParticipantIdSchema).default([]),
        /** The printed alternative selected ("Alternatively, …"), by key.
         * Null = the action's primary branch. */
        alternative: z.string().min(1).nullable().default(null),
        /** The child ability this dispatch composes, when the printed text
         * names one (Charge's strike half). Declared here so the arm can
         * check the printed constraint and put the composition on the
         * record; the child is dispatched SEPARATELY as a `use-ability`
         * carrying `partOf`, which is what keeps the one printed cost from
         * being paid twice. Null = not declared. */
        composes: z
          .object({
            abilityArtifactId: z.string().min(1),
            /** The child's compiled header keywords, for the printed
             * substitution test. */
            keywords: z.array(z.string().min(1)).default([]),
          })
          .nullable()
          .default(null),
        /** The printed word "willing", asserted per SUBJECT [design §5].
         *
         * Deliberately NOT a `SpatialFactSchema` member: consent is not a
         * spatial predicate, and the assertor is the SUBJECT's controller,
         * not the acting player — a boolean the actor ticks on their own
         * payload misrepresents who consented. One field shared by Stand
         * Up's ally branch, Use Consumable's administer branch and Ride's
         * mount, or those three diverge on whether a missing entry means
         * not-asserted or asserted-false. Absent = not asserted, which
         * reads `'unknown'`, never `false`. */
        willing: z.record(ParticipantIdSchema, z.boolean()).default({}),
        ...resolutionInputShape,
      })
      .refine(RESOLUTION_INPUT_RULES.distinctTargets.holds, {
        message: RESOLUTION_INPUT_RULES.distinctTargets.message,
      })
      .refine(RESOLUTION_INPUT_RULES.distinctObjectTargets.holds, {
        message: RESOLUTION_INPUT_RULES.distinctObjectTargets.message,
      })
      .refine(
        (payload) =>
          RESOLUTION_INPUT_RULES.recoverySpendsScoped.holds(
            payload,
            effectiveCommonActionResolution(payload).kind,
          ),
        { message: RESOLUTION_INPUT_RULES.recoverySpendsScoped.message },
      )
      .refine(
        (payload) =>
          RESOLUTION_INPUT_RULES.endedInstancesScoped.holds(
            payload,
            effectiveCommonActionResolution(payload).kind,
          ),
        { message: RESOLUTION_INPUT_RULES.endedInstancesScoped.message },
      )
      .refine(
        (payload) =>
          RESOLUTION_INPUT_RULES.savingThrowsScoped.holds(
            payload,
            effectiveCommonActionResolution(payload).kind,
          ),
        { message: RESOLUTION_INPUT_RULES.savingThrowsScoped.message },
      )
      .refine(RESOLUTION_INPUT_RULES.distinctEndedInstances.holds, {
        message: RESOLUTION_INPUT_RULES.distinctEndedInstances.message,
      })
      .refine(
        (payload) =>
          RESOLUTION_INPUT_RULES.testHasSubject.holds(
            payload,
            effectiveCommonActionResolution(payload).kind,
          ),
        { message: RESOLUTION_INPUT_RULES.testHasSubject.message },
      )
      .refine(RESOLUTION_INPUT_RULES.testRollsScoped.holds, {
        message: RESOLUTION_INPUT_RULES.testRollsScoped.message,
      })
      .refine(
        (payload) =>
          RESOLUTION_INPUT_RULES.testInputsScoped.holds(
            payload,
            effectiveCommonActionResolution(payload).kind,
          ),
        { message: RESOLUTION_INPUT_RULES.testInputsScoped.message },
      )
      .refine(
        (payload) =>
          RESOLUTION_INPUT_RULES.automaticNeedsTarget.holds(
            payload,
            effectiveCommonActionResolution(payload).kind,
          ),
        { message: 'automatic common-action programs require at least one target' },
      )
      .refine(
        (payload) =>
          payload.alternative === null ||
          payload.feature.alternatives.some(
            (alternative) => alternative.key === payload.alternative,
          ),
        { message: 'alternative must name one of the compiled printed alternatives' },
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
      /** Asserted-band economy parity (R-0029/R-0030) — see
       * apply-condition's field. Null = a bare Director edit. */
      assertedAbilityUse: AssertedAbilityUseSchema.nullable().default(null),
      /** Asserted rolled-damage provenance [R-0040]. The engine makes no
       * roll on this path, and "If an ability or effect deals damage
       * without requiring a power roll, that is not rolled damage"
       * [Heroes p.74] — so the default is false and a Director applying
       * the result of a roll they made says so explicitly. */
      rolled: z.boolean().default(false),
      /** The creature that dealt it, when the dispatch names one. */
      sourceId: ParticipantIdSchema.nullable().default(null),
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
      commitPayloads: z.record(z.string().min(1), ResolutionPayloadSchema).default({}),
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
    kind: z.literal('roll-resolution'),
    payload: z.object({
      /** The DECLARED entry to roll. */
      resolutionId: z.string().min(1),
      /** The declaration payload, re-supplied so the engine can verify it
       * against the stored declaration hash — the same integrity
       * discipline commit already uses [R-0032/R-0041]. Recorded target
       * EDITS are applied on top; they never change what was declared. */
      payload: UseAbilityPayloadSchema,
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
          z.object({ kind: z.literal('occurrence'), occurrenceId: z.string().min(1) }),
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
      payload: ResolutionPayloadSchema,
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
