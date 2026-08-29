import { normalizeActionCostValue } from './action-cost.js';
import { ECONOMY_CANON, debitActionCost, grantCriticalHitAction } from './action-economy.js';
import { type LifecycleContext, applyConditionInstance } from './condition-lifecycle.js';
import {
  type PendingSquadContribution,
  applyDamage,
  collectSquadContribution,
  damageAutomationBlocker,
  flushSquadContributions,
  withParticipant,
} from './damage.js';
import type { RandomSource } from './determinism.js';
import {
  GRANT_CANON,
  grantConsumedByRoll,
  grantContribution,
  splitGrants,
} from './grant-lifecycle.js';
import { hashDeclaration, hashPayload } from './payload-hash.js';
import { CHARACTERISTIC_KEY, gatePotencyWithReceipt } from './potency.js';
import {
  POWER_ROLL_CANON,
  POWER_ROLL_DIE,
  type PowerRollResolution,
  type Tier,
  resolvePowerRoll,
} from './power-roll.js';
import type {
  ActionCost,
  CharacteristicLetter,
  DamageType,
  DeclaredResolutionEntry,
  EncounterState,
  LogEntry,
  NextRollGrant,
  ParsedIntent,
  ParticipantState,
  ResolutionEntry,
  RollReceipt,
  UseAbilityPayload,
} from './schemas.js';
import { resolutionOpenedClaim } from './schemas.js';

/**
 * use-ability executor (docs/power-roll-design.md §4.1; action-economy
 * design §3): ONE power roll per ability. Outside combat (`turnState`
 * null) the v5 single-dispatch behavior holds — damage to ALL targets
 * first, then non-damage effects per target in presented order
 * [rule.dice/ability-roll §Abilities With Damage and Effects]. In combat,
 * a rolling ability debits its action cost, rolls, and OPENS a resolution
 * entry on the stack [R-0032]; application happens at the explicit
 * commit-resolution dispatch (hosts pipeline commit for one-tap UX — the
 * engine never auto-commits). All refusal checks run BEFORE any mutation
 * (the refusal-with-change invariant holds by construction).
 */

type UseAbilityIntent = Extract<ParsedIntent, { kind: 'use-ability' }>;

interface ExecutionResult {
  state: EncounterState;
  log: LogEntry[];
}

function entry(
  context: LifecycleContext,
  kind: LogEntry['kind'],
  message: string,
  canonRefs: string[],
  data: Record<string, unknown>,
): LogEntry {
  return { kind, intentId: context.intentId, actor: context.actor, canonRefs, message, data };
}

function refuse(
  state: EncounterState,
  context: LifecycleContext,
  message: string,
): ExecutionResult {
  return { state, log: [entry(context, 'refusal', message, [], {})] };
}

function highestCharacteristic(stats: NonNullable<ParticipantState['stats']>): number {
  const characteristics = stats.characteristics;
  return Math.max(
    characteristics.might,
    characteristics.agility,
    characteristics.reason,
    characteristics.intuition,
    characteristics.presence,
  );
}

interface AbilityBindingPayload {
  ability: Pick<UseAbilityPayload['ability'], 'powerRollBonus'>;
  characteristicChoice?: CharacteristicLetter;
  damageCharacteristicChoice?: CharacteristicLetter;
}

/** Bind the roll's added value per the compiled power-roll bonus. */
export function bindRollValue(
  payload: AbilityBindingPayload,
  actor: ParticipantState,
): { value: number; label: string } | { error: string } {
  const bonus = payload.ability.powerRollBonus;
  if (bonus.kind === 'fixed') return { value: bonus.value, label: `fixed +${bonus.value}` };
  if (actor.stats === null) {
    return { error: `${actor.id} has no tracked characteristics — assert stats before rolling` };
  }
  if (bonus.kind === 'highest') {
    return { value: highestCharacteristic(actor.stats), label: 'highest characteristic' };
  }
  const [firstOption, ...restOptions] = bonus.options;
  if (firstOption === undefined)
    return { error: 'the compiled power-roll bonus offers no characteristic' };
  const options = bonus.options;
  let letter: CharacteristicLetter;
  if (restOptions.length === 0) {
    letter = firstOption;
  } else {
    const choice = payload.characteristicChoice;
    if (!choice)
      return {
        error: `this ability rolls with a choice of ${options.join(' or ')} — name characteristicChoice`,
      };
    if (!options.includes(choice)) {
      return { error: `characteristicChoice ${choice} is not offered (${options.join(' or ')})` };
    }
    letter = choice;
  }
  return { value: actor.stats.characteristics[CHARACTERISTIC_KEY[letter]], label: letter };
}

/** Bind the damage-time characteristic ("N + M or A damage") — defaults to
 * the actor's highest among the offered options, logged as defaulted (PL-5). */
export function bindDamageCharacteristic(
  payload: AbilityBindingPayload,
  actor: ParticipantState,
  options: readonly CharacteristicLetter[],
): { value: number; label: string; defaulted: boolean } | { error: string } {
  if (options.length === 0) return { value: 0, label: 'none', defaulted: false };
  if (actor.stats === null) {
    return {
      error: `${actor.id} has no tracked characteristics to add to damage — assert stats first`,
    };
  }
  const stats = actor.stats;
  const choice = payload.damageCharacteristicChoice;
  if (choice !== undefined) {
    if (!options.includes(choice)) {
      return {
        error: `damageCharacteristicChoice ${choice} is not offered (${options.join(' or ')})`,
      };
    }
    return {
      value: stats.characteristics[CHARACTERISTIC_KEY[choice]],
      label: choice,
      defaulted: false,
    };
  }
  const best = options.reduce((bestSoFar, letter) =>
    stats.characteristics[CHARACTERISTIC_KEY[letter]] >
    stats.characteristics[CHARACTERISTIC_KEY[bestSoFar]]
      ? letter
      : bestSoFar,
  );
  return {
    value: stats.characteristics[CHARACTERISTIC_KEY[best]],
    label: best,
    defaulted: options.length > 1,
  };
}

/** Leading count word of a verbatim targets line ("One creature or object"
 * → 1). Unrecognized shapes yield null — no warning, never a guess. */
export function targetCountOf(targetsText: string | null): number | null {
  if (targetsText === null) return null;
  const normalized = targetsText.trim().toLowerCase();
  if (
    normalized === 'the triggering creature' ||
    normalized === 'the triggering creature or object'
  ) {
    return 1;
  }
  const word = normalized.split(/\s+/)[0];
  const counts: Record<string, number> = { one: 1, two: 2, three: 3, four: 4 };
  return word !== undefined ? (counts[word] ?? null) : null;
}

/** The compiled cost with the pre-v6 fallback through the one
 * normalization home [R-0029]. */
export function abilityCostOf(ability: {
  actionCost: ActionCost | null;
  actionType: string | null;
}): ActionCost | null {
  return ability.actionCost ?? normalizeActionCostValue(ability.actionType)?.cost ?? null;
}

/**
 * The damage + effect application phases — the ONE home shared by the v5
 * single-dispatch path and the R-0032 commit path (which parameterizes the
 * per-target tier and damage/potency transforms with the entry's
 * modification list).
 */
export interface AbilityOutcomeArgs {
  payload: UseAbilityPayload;
  /** Effective targets (commit-time retargets applied). */
  targets: readonly string[];
  tierFor: (targetId: string) => Tier;
  /** Per-target damage transform (damage-halve modifications). */
  damageTransform?: (targetId: string, amount: number) => { amount: number; note: string | null };
  /** Extra potency delta from modifications, per target. */
  extraPotencyFor?: (targetId: string) => number;
  /** The resolution this outcome belongs to, for damage provenance
   * [R-0040]. Null on the out-of-combat single-dispatch path, which opens
   * no resolution entry. */
  resolutionId?: string | null;
}

export function applyAbilityOutcome(
  state: EncounterState,
  args: AbilityOutcomeArgs,
  context: LifecycleContext,
): ExecutionResult {
  const { payload, targets, tierFor } = args;
  const ability = payload.ability;
  const actorId = payload.actorParticipantId;
  const log: LogEntry[] = [];
  let nextState = state;

  const actor = state.participants[actorId];
  if (!actor) return refuse(state, context, `unknown participant ${actorId}`);

  const damageBindings = new Map<Tier, { value: number; label: string; defaulted: boolean }>();
  for (const tierNumber of [1, 2, 3] as const) {
    const tierDamage = ability.tiers[`tier${tierNumber}`].damage;
    if (!tierDamage) continue;
    const binding = bindDamageCharacteristic(payload, actor, tierDamage.characteristicOptions);
    if ('error' in binding) return refuse(state, context, binding.error);
    damageBindings.set(tierNumber, binding);
  }

  // ── damage phase: all targets first [rule.dice/ability-roll] ───────────
  // Same-squad minion targets aggregate into ONE pool application per squad
  // (required by R-0026's once-per-squad weakness/immunity step); the Area
  // keyword is the printed discriminator for the per-minion cap [R-0025].
  const isArea = ability.keywords.some((keyword) => keyword.trim().toLowerCase() === 'area');
  const squadContributions = new Map<string, PendingSquadContribution[]>();
  const defaultedTiersLogged = new Set<Tier>();
  for (const targetId of targets) {
    const tierNumber = tierFor(targetId);
    const tierData = ability.tiers[`tier${tierNumber}` as 'tier1' | 'tier2' | 'tier3'];
    if (!tierData.damage) continue;
    const damageBinding = damageBindings.get(tierNumber);
    if (!damageBinding) continue; // bound above for every tier with damage
    const damageType: DamageType | null =
      tierData.damage.typeOptions.length === 0
        ? null
        : tierData.damage.typeOptions.length === 1
          ? (tierData.damage.typeOptions[0] ?? null)
          : (payload.damageTypeChoice ?? null);
    if (damageBinding.defaulted && !defaultedTiersLogged.has(tierNumber)) {
      defaultedTiersLogged.add(tierNumber);
      log.push(
        entry(
          context,
          'informational',
          `damage characteristic defaulted to ${damageBinding.label} (the actor's highest among the offered)`,
          [POWER_ROLL_CANON.abilityRoll],
          { damageCharacteristicDefaulted: damageBinding.label },
        ),
      );
    }
    {
      const target = nextState.participants[targetId];
      if (!target) continue; // presence proven by the refusal gates
      const extra = payload.extraDamage
        .filter((item) => item.target === undefined || item.target === targetId)
        .reduce((sum, item) => sum + item.value, 0);
      let amount = tierData.damage.amount + damageBinding.value + extra;
      if (args.damageTransform) {
        const transformed = args.damageTransform(targetId, amount);
        if (transformed.note !== null) {
          log.push(
            entry(context, 'informational', transformed.note, [ability.abilityArtifactId], {
              damageTransformed: { targetId, from: amount, to: transformed.amount },
            }),
          );
        }
        amount = transformed.amount;
      }
      if (
        collectSquadContribution(
          nextState,
          target,
          { targetId, damage: amount, type: damageType },
          squadContributions,
        )
      ) {
        continue;
      }
      const blocker = damageAutomationBlocker(target);
      if (blocker !== null) {
        log.push(
          entry(
            context,
            'table-directive',
            `${targetId} takes ${amount}${damageType ? ` ${damageType}` : ''} damage — ${blocker}`,
            [ability.abilityArtifactId],
            { unautomatedDamage: { targetId, amount, damageType } },
          ),
        );
        continue;
      }
      const outcome = applyDamage(
        target,
        { amount, type: damageType },
        {
          knockOut: payload.knockOut,
          reason: `${damageType ? `${damageType} ` : ''}damage from ${actor.id}'s ability (tier ${tierNumber})`,
          // Tier damage exists BECAUSE of the power roll, so it is rolled
          // damage [Heroes p.74 §Rolled Damage].
          provenance: { rolled: true, sourceId: actor.id, resolutionId: args.resolutionId ?? null },
        },
        context,
      );
      nextState = withParticipant(nextState, outcome.participant);
      log.push(...outcome.log);
    }
  }
  if (squadContributions.size > 0) {
    const flushed = flushSquadContributions(
      nextState,
      squadContributions,
      {
        area: isArea,
        reason: `from ${actor.id}'s ability`,
        provenance: { rolled: true, sourceId: actor.id, resolutionId: args.resolutionId ?? null },
      },
      context,
    );
    nextState = flushed.state;
    log.push(...flushed.log);
  }

  // ── effect phase: per target, in presented order ────────────────────────
  for (const targetId of targets) {
    const target = nextState.participants[targetId];
    if (!target) continue; // presence proven by the refusal gates
    const tierData = ability.tiers[`tier${tierFor(targetId)}` as 'tier1' | 'tier2' | 'tier3'];
    if (tierData.forcedMovement) {
      log.push(
        entry(
          context,
          'table-directive',
          `${actor.id} pushes ${targetId} ${tierData.forcedMovement.distance} square(s) — movement geometry is table-resolved`,
          [ability.abilityArtifactId],
          { forcedMovement: { targetId, ...tierData.forcedMovement } },
        ),
      );
    }
    if (tierData.conditionIds.length === 0) continue;

    if (tierData.potency) {
      const adjustment =
        payload.potencyAdjustments
          .filter((item) => item.target === undefined || item.target === targetId)
          .reduce((sum, item) => sum + item.delta, 0) + (args.extraPotencyFor?.(targetId) ?? 0);
      const gate = gatePotencyWithReceipt(
        tierData.potency,
        actor,
        target,
        adjustment,
        {
          targetId,
          conditionIds: tierData.conditionIds,
          abilityArtifactId: ability.abilityArtifactId,
        },
        context,
      );
      log.push(...gate.log);
      if (!gate.applies) continue;
    }

    for (const conditionId of tierData.conditionIds) {
      const liveTarget = nextState.participants[targetId];
      if (!liveTarget) continue;
      const applied = applyConditionInstance(
        nextState,
        {
          target: liveTarget,
          instance: {
            instanceId: `${conditionId}#${context.intentId}-${targetId}`,
            conditionId,
            ending: tierData.ending === 'save-ends' ? { kind: 'save-ends' } : { kind: 'external' },
            source: {
              participantId: actorId,
              effectArtifactId: ability.abilityArtifactId,
            },
          },
          replacesOnNewSource: false,
        },
        context,
      );
      nextState = applied.state;
      log.push(...applied.log);
    }
  }

  return { state: nextState, log };
}

/**
 * The roll-resolution pipeline — grant consumption, per-target edge/bane
 * pools, resolvePowerRoll, and receipt assembly — exported as the ONE
 * named home so commit-resolution's recompute and the squad-attack
 * family's one-roll-for-the-squad attacks call it directly instead of
 * re-inlining it (design §3; squad-attack forward-dep).
 */
export interface AbilityRollOutcome {
  state: EncounterState;
  log: LogEntry[];
  dice: [number, number];
  resolution: PowerRollResolution;
  perTarget: Record<
    string,
    { edges: number; banes: number; resolution: PowerRollResolution }
  > | null;
  tierFor: (targetId: string) => Tier;
  rollReceipt: RollReceipt;
}

export interface AbilityRollInput {
  actorParticipantId: string;
  ability: { abilityArtifactId: string; keywords: string[] };
  targets: string[];
  dice?: [number, number];
  edges: number;
  banes: number;
  bonuses: UseAbilityPayload['bonuses'];
  penalties: UseAbilityPayload['penalties'];
  automaticOutcomes: UseAbilityPayload['automaticOutcomes'];
  downgradeToTier?: 1 | 2;
}

export interface AbilityRollOptions {
  /** Omitted on ordinary participant rolls. A squad roll consumes each
   * listed member's outbound grants once, then contributes them only to the
   * targets that member attacks [R-0034(d)]. */
  outboundBindings?: Array<{ memberId: string; targetIds: string[] }>;
  derivedModifiers?: Array<{ sourceText: string; edges: number; banes: number }>;
  actorLabel?: string;
}

export function resolveAbilityRoll(
  state: EncounterState,
  payload: AbilityRollInput,
  rollBinding: { value: number; label: string },
  random: RandomSource,
  context: LifecycleContext,
  options: AbilityRollOptions = {},
): AbilityRollOutcome {
  const ability = payload.ability;
  const log: LogEntry[] = [];
  let nextState = state;
  const actorLabel = options.actorLabel ?? payload.actorParticipantId;
  // ── grant consumption [R-0013..R-0015] ─────────────────────────────────
  // The actor's pending outbound grants whose scope matches this roll are
  // consumed and contribute to the (uniform) base pool; each target's
  // inbound marks are consumed by a qualifying strike against them and
  // contribute to THAT target's pool only [R-0014, classes#roll-against-
  // multiple-creatures]. Consumption happens whether or not cancellation
  // later zeroes the numeric effect [R-0015].
  const isStrike = ability.keywords.some((keyword) => keyword.trim().toLowerCase() === 'strike');
  const rollShape = { kind: 'ability-roll' as const, isStrike };
  const consumeGrantsFrom = (
    holder: ParticipantState,
    direction: NextRollGrant['direction'],
  ): { edges: number; banes: number; consumed: NextRollGrant[] } => {
    const split = splitGrants(
      holder,
      (grant) =>
        grant.kind === 'next-roll' &&
        grant.direction === direction &&
        // The ONE (grant, roll, binding) consumption predicate — the
        // R-0034(d) per-target-scoping seam: outbound rides the roller's
        // own roll, inbound is answered per struck holder [R-0013, R-0014].
        grantConsumedByRoll(grant, rollShape, {
          attackerId: direction === 'outbound' ? holder.id : payload.actorParticipantId,
          targetId: direction === 'inbound' ? holder.id : null,
        }),
    );
    const consumed = split.consumed.filter(
      (grant): grant is NextRollGrant => grant.kind === 'next-roll',
    );
    let edges = 0;
    let banes = 0;
    for (const grant of consumed) {
      const contribution = grantContribution(grant.polarity);
      edges += contribution.edges;
      banes += contribution.banes;
    }
    if (consumed.length > 0) {
      nextState = withParticipant(nextState, { ...holder, grants: split.remaining });
      log.push(
        entry(
          context,
          'mutation',
          direction === 'outbound'
            ? `${holder.id}'s pending next-roll modifiers apply to this roll and are spent (${consumed.map((grant) => grant.polarity).join(', ')})`
            : `the mark on ${holder.id} applies to this strike against them and is spent (${consumed.map((grant) => grant.polarity).join(', ')})`,
          [
            GRANT_CANON.powerRoll,
            ...(direction === 'inbound' ? [GRANT_CANON.rollAgainstMultipleCreatures] : []),
          ],
          {
            removedGrantIds: consumed.map((grant) => grant.grantId),
            grantsConsumed: consumed.map((grant) => ({
              grantId: grant.grantId,
              holderId: holder.id,
              direction: grant.direction,
              polarity: grant.polarity,
              contribution: grantContribution(grant.polarity),
            })),
          },
        ),
      );
    }
    return { edges, banes, consumed };
  };

  const liveActor = nextState.participants[payload.actorParticipantId];
  const outbound =
    options.outboundBindings === undefined && liveActor
      ? consumeGrantsFrom(liveActor, 'outbound')
      : { edges: 0, banes: 0, consumed: [] };
  const outboundByTarget = new Map<string, { edges: number; banes: number }>();
  const memberOutboundConsumed: Array<{ holderId: string; grant: NextRollGrant }> = [];
  for (const binding of options.outboundBindings ?? []) {
    const holder = nextState.participants[binding.memberId];
    if (!holder) continue;
    const consumed = consumeGrantsFrom(holder, 'outbound');
    memberOutboundConsumed.push(
      ...consumed.consumed.map((grant) => ({ holderId: binding.memberId, grant })),
    );
    for (const targetId of binding.targetIds) {
      const current = outboundByTarget.get(targetId) ?? { edges: 0, banes: 0 };
      outboundByTarget.set(targetId, {
        edges: current.edges + consumed.edges,
        banes: current.banes + consumed.banes,
      });
    }
  }
  const inboundByTarget = new Map<string, { edges: number; banes: number }>();
  for (const targetId of payload.targets) {
    const target = nextState.participants[targetId];
    if (!target) continue; // presence proven by the refusal gates
    const inbound = consumeGrantsFrom(target, 'inbound');
    if (inbound.consumed.length > 0) {
      inboundByTarget.set(targetId, { edges: inbound.edges, banes: inbound.banes });
    }
  }

  // ── the roll: dice as input; asserted dice draw NOTHING (SE-4) ─────────
  const dice: [number, number] = payload.dice ?? [
    random.roll(POWER_ROLL_DIE),
    random.roll(POWER_ROLL_DIE),
  ];
  const derivedModifiers = options.derivedModifiers ?? [];
  const derivedEdges = derivedModifiers.reduce((sum, modifier) => sum + modifier.edges, 0);
  const derivedBanes = derivedModifiers.reduce((sum, modifier) => sum + modifier.banes, 0);
  const baseEdges = payload.edges + outbound.edges + derivedEdges;
  const baseBanes = payload.banes + outbound.banes + derivedBanes;
  const resolution = resolvePowerRoll({
    dice,
    characteristicValue: rollBinding.value,
    bonuses: payload.bonuses,
    penalties: payload.penalties,
    edges: baseEdges,
    banes: baseBanes,
    automaticOutcomes: payload.automaticOutcomes,
    downgradeToTier: payload.downgradeToTier,
  });
  // Per-target resolutions when any inbound mark applied: one dice draw,
  // per-target modifier pools, possibly different tier outcomes
  // [classes#roll-against-multiple-creatures, R-0014].
  let perTarget: Record<
    string,
    { edges: number; banes: number; resolution: PowerRollResolution }
  > | null = null;
  if (inboundByTarget.size > 0 || outboundByTarget.size > 0) {
    perTarget = {};
    for (const targetId of payload.targets) {
      const inboundExtra = inboundByTarget.get(targetId) ?? { edges: 0, banes: 0 };
      const outboundExtra = outboundByTarget.get(targetId) ?? { edges: 0, banes: 0 };
      const extra = {
        edges: inboundExtra.edges + outboundExtra.edges,
        banes: inboundExtra.banes + outboundExtra.banes,
      };
      const targetEdges = baseEdges + extra.edges;
      const targetBanes = baseBanes + extra.banes;
      perTarget[targetId] = {
        edges: targetEdges,
        banes: targetBanes,
        resolution:
          extra.edges === 0 && extra.banes === 0
            ? resolution
            : resolvePowerRoll({
                dice,
                characteristicValue: rollBinding.value,
                bonuses: payload.bonuses,
                penalties: payload.penalties,
                edges: targetEdges,
                banes: targetBanes,
                automaticOutcomes: payload.automaticOutcomes,
                downgradeToTier: payload.downgradeToTier,
              }),
      };
    }
  }
  log.push(
    entry(
      context,
      'informational',
      `${actorLabel} rolls ${ability.abilityArtifactId.split('/').pop()}: ${dice[0]}+${dice[1]}${rollBinding.value >= 0 ? '+' : ''}${rollBinding.value} (${rollBinding.label}) → total ${resolution.total}, tier ${resolution.tier}`,
      [POWER_ROLL_CANON.powerRoll, POWER_ROLL_CANON.tierOutcome, ability.abilityArtifactId],
      {
        powerRoll: {
          dice,
          diceAsserted: payload.dice !== undefined,
          characteristicValue: rollBinding.value,
          characteristicLabel: rollBinding.label,
          bonuses: payload.bonuses,
          penalties: payload.penalties,
          /** Effective counts (asserted + consumed grants) — what the
           * resolution was computed with; the recompute invariant re-derives
           * from these. Asserted payload counts ride alongside. */
          edges: baseEdges,
          banes: baseBanes,
          assertedEdges: payload.edges,
          assertedBanes: payload.banes,
          derivedModifiers,
          grantsConsumed: [
            ...outbound.consumed.map((grant) => ({
              grantId: grant.grantId,
              holderId: payload.actorParticipantId,
              direction: grant.direction,
              polarity: grant.polarity,
              contribution: grantContribution(grant.polarity),
            })),
            ...memberOutboundConsumed.map(({ holderId, grant }) => ({
              grantId: grant.grantId,
              holderId,
              direction: grant.direction,
              polarity: grant.polarity,
              contribution: grantContribution(grant.polarity),
            })),
          ],
          ...(perTarget !== null ? { perTarget } : {}),
          automaticOutcomes: payload.automaticOutcomes,
          downgradeToTier: payload.downgradeToTier ?? null,
          resolution,
        },
      },
    ),
  );
  if (resolution.tier > 1 && !resolution.downgraded) {
    log.push(
      entry(
        context,
        'informational',
        `downgrade available: the roller may take any lower tier's outcome instead`,
        [POWER_ROLL_CANON.powerRoll],
        { downgradeAvailableBelow: resolution.tier },
      ),
    );
  }

  const tierFor = (targetId: string): Tier =>
    perTarget?.[targetId]?.resolution.tier ?? resolution.tier;
  const rollReceipt: RollReceipt = {
    dice,
    characteristicValue: rollBinding.value,
    characteristicLabel: rollBinding.label,
    bonuses: payload.bonuses,
    penalties: payload.penalties,
    edges: baseEdges,
    banes: baseBanes,
    automaticOutcomes: payload.automaticOutcomes,
    downgradeToTier: payload.downgradeToTier ?? null,
    natural: resolution.natural,
    total: resolution.total,
    tier: resolution.tier,
    naturalTopEnd: resolution.naturalTopEnd,
    perTarget: Object.fromEntries(
      Object.entries(perTarget ?? {}).map(([targetId, value]) => [
        targetId,
        { edges: value.edges, banes: value.banes, tier: value.resolution.tier },
      ]),
    ),
    derivedModifiers,
  };
  return { state: nextState, log, dice, resolution, perTarget, tierFor, rollReceipt };
}

export function executeUseAbility(
  state: EncounterState,
  intent: UseAbilityIntent,
  random: RandomSource,
  /** Rolling a previously DECLARED entry [R-0041]: the entry being
   * advanced. Its slot on the stack is REPLACED — same resolutionId, same
   * declaration hash, recorded modifications carried forward — rather than
   * a second entry appended. Null on an ordinary dispatch. Rolling is the
   * ONE path either way; roll-resolution does not re-implement it. */
  declaredEntry: DeclaredResolutionEntry | null = null,
): ExecutionResult {
  const context: LifecycleContext = { intentId: intent.intentId, actor: intent.actor };
  const payload = intent.payload;
  const ability = payload.ability;

  // ── refusal gates (no mutation may precede these) ──────────────────────
  const actor = state.participants[payload.actorParticipantId];
  if (!actor) return refuse(state, context, `unknown participant ${payload.actorParticipantId}`);
  for (const targetId of payload.targets) {
    if (!state.participants[targetId]) {
      return refuse(state, context, `unknown participant ${targetId}`);
    }
  }
  if (payload.operatorId !== undefined && !state.participants[payload.operatorId]) {
    return refuse(state, context, `unknown participant ${payload.operatorId}`);
  }
  const rollBinding = bindRollValue(payload, actor);
  if ('error' in rollBinding) return refuse(state, context, rollBinding.error);

  const tierDamageAny =
    ability.tiers.tier1.damage ?? ability.tiers.tier2.damage ?? ability.tiers.tier3.damage;
  if (
    tierDamageAny &&
    tierDamageAny.typeOptions.length > 1 &&
    payload.damageTypeChoice === undefined
  ) {
    return refuse(
      state,
      context,
      `this ability's damage offers a type choice (${tierDamageAny.typeOptions.join(' or ')}) — name damageTypeChoice`,
    );
  }
  if (
    payload.damageTypeChoice !== undefined &&
    tierDamageAny &&
    tierDamageAny.typeOptions.length > 0 &&
    !tierDamageAny.typeOptions.includes(payload.damageTypeChoice)
  ) {
    return refuse(state, context, `damageTypeChoice ${payload.damageTypeChoice} is not offered`);
  }
  if (payload.targets.length > 1) {
    for (const extra of payload.extraDamage) {
      if (extra.target === undefined) {
        return refuse(
          state,
          context,
          'extraDamage must name its target when the ability has several',
        );
      }
    }
  }

  // Damage bindings pre-validate for every tier carrying damage BEFORE any
  // mutation: debits and grant consumption precede the roll, and a refusal
  // may never follow a mutation (refusal-with-change). Binding errors are
  // target-independent, so this is safe to hoist.
  for (const tierNumber of [1, 2, 3] as const) {
    const tierDamage = ability.tiers[`tier${tierNumber}`].damage;
    if (!tierDamage) continue;
    const binding = bindDamageCharacteristic(payload, actor, tierDamage.characteristicOptions);
    if ('error' in binding) return refuse(state, context, binding.error);
  }

  const log: LogEntry[] = [];
  let nextState = state;

  // ── action-economy debit (v6, R-0029/R-0030; combat only) ──────────────
  const cost = abilityCostOf(ability);
  // R-0029 honest residue: a header cell the closed vocabulary refused
  // carries no debit — never a guessed one. Surface the raw unnormalized
  // value as a table directive instead of skipping silently.
  if (state.turnState !== null && cost === null && ability.actionCostResidue !== null) {
    log.push(
      entry(
        context,
        'table-directive',
        `${ability.abilityArtifactId} carries an unresolved action cost (raw header value ${JSON.stringify(ability.actionType)}) — no debit is guessed; the cost is table-adjudicated. Residue: ${ability.actionCostResidue}`,
        [ECONOMY_CANON.turn, ability.abilityArtifactId],
        {
          actionCostResidue: {
            abilityArtifactId: ability.abilityArtifactId,
            raw: ability.actionType,
            residue: ability.actionCostResidue,
          },
        },
      ),
    );
  }
  if (state.turnState !== null && cost !== null) {
    if (ability.operatorPays && payload.operatorId === undefined) {
      // R-0029: the fixture takes no turns — the debit belongs to the
      // dispatching adjacent operator. No operator named → table directive,
      // never a guessed payer.
      log.push(
        entry(
          context,
          'table-directive',
          `${ability.abilityArtifactId} is operator-paid ("${ability.actionType}") but no operatorId was named — the ${cost} debit is table-adjudicated`,
          [ECONOMY_CANON.turn, ability.abilityArtifactId],
          { operatorDebitUnassigned: { abilityArtifactId: ability.abilityArtifactId, cost } },
        ),
      );
    } else {
      const debited = debitActionCost(
        nextState,
        {
          cost,
          payerId: ability.operatorPays
            ? (payload.operatorId ?? payload.actorParticipantId)
            : payload.actorParticipantId,
          abilityKey: ability.abilityArtifactId,
          usesPerRound: ability.usesPerRound,
          partOf: payload.partOf ?? null,
          // use-ability.partOf composes a distinct child ability (Charge's
          // inner strike): it shares the debit, not its own usage counter.
          sharesAbilityUse: false,
        },
        context,
      );
      nextState = debited.state;
      log.push(...debited.log);
    }
  }

  // ── hold at DECLARATION [R-0041] ──────────────────────────────────────
  // Targets named, dice not thrown, so a being-targeted reaction has a
  // real moment to act. The action cost is NOT debited here: a declaration
  // that never rolls cancels at end of turn and "nothing is lost", which
  // would be false if the action had already been spent. The debit happens
  // on the roll, below, exactly as it always has.
  if (payload.holdAtDeclaration && nextState.turnState !== null && declaredEntry === null) {
    const declared: ResolutionEntry = {
      kind: 'ability',
      resolutionId: intent.intentId,
      actorId: payload.actorParticipantId,
      abilityArtifactId: ability.abilityArtifactId,
      actionCost: cost,
      declarationHash: hashDeclaration({
        actorId: payload.actorParticipantId,
        abilityArtifactId: ability.abilityArtifactId,
        targets: payload.targets,
      }),
      actionKey: payload.partOf ?? intent.intentId,
      phase: 'declared',
      declaredTargets: [...payload.targets],
      modifications: [],
      squadBreakdown: null,
    };
    return {
      state: { ...nextState, resolutionStack: [...nextState.resolutionStack, declared] },
      log: [
        ...log,
        entry(
          context,
          'mutation',
          `${actor.id} DECLARES ${ability.abilityArtifactId.split('/').pop()} against ${payload.targets.join(', ')} — no dice yet; reactions triggered by being targeted may cut in, then roll-resolution throws [R-0041]`,
          [ability.abilityArtifactId],
          { resolutionOpened: resolutionOpenedClaim(declared) },
        ),
      ],
    };
  }

  // ── the roll pipeline (grants → pools → resolve → receipt) ─────────────
  const rolled = resolveAbilityRoll(nextState, payload, rollBinding, random, context);
  nextState = rolled.state;
  log.push(...rolled.log);
  const { dice, resolution, perTarget, rollReceipt } = rolled;

  // Critical hit: natural 19–20 on a MAIN-ACTION ability roll. The
  // discriminator is the compiled actionCost enum [R-0029]. In combat the
  // printed grant compiles to an escape-flagged action grant — "immediately
  // take an additional main action after resolving the power roll, whether
  // or not it's your turn and even if you are dazed"
  // [rule.combat/critical-hit] — consumed silently [R-0030]; outside combat
  // it stays a table directive (v5 behavior).
  const isMainAction = cost === 'main-action';
  if (resolution.naturalTopEnd && isMainAction) {
    const crit = grantCriticalHitAction(
      nextState,
      {
        participantIds: [payload.actorParticipantId],
        grantIdPrefix: 'critical-hit',
        natural: resolution.natural,
        extraCanonRefs: [POWER_ROLL_CANON.naturalRoll],
      },
      context,
    );
    nextState = crit.state;
    log.push(...crit.log);
  }

  // Target count beyond the ability's verbatim targets line is a
  // rule-violation class: warn and apply (permissive engine).
  const declaredTargets = targetCountOf(ability.targetsText);
  if (declaredTargets !== null && payload.targets.length > declaredTargets) {
    log.push(
      entry(
        context,
        'warning',
        `${payload.targets.length} targets named; the ability's targets line reads "${ability.targetsText}"`,
        [ability.abilityArtifactId],
        { declaredTargets, namedTargets: payload.targets.length },
      ),
    );
  }

  // Per-target tier [R-0014]: an inbound mark can shift one target's
  // outcome while the same roll resolves normally against another.
  const tierNumberFor = (targetId: string): Tier =>
    perTarget?.[targetId]?.resolution.tier ?? resolution.tier;
  if (perTarget !== null) {
    for (const targetId of payload.targets) {
      const targetTier = tierNumberFor(targetId);
      if (targetTier !== resolution.tier) {
        log.push(
          entry(
            context,
            'informational',
            `against ${targetId} this roll resolves at tier ${targetTier} (their mark applies to this strike only against them)`,
            [GRANT_CANON.rollAgainstMultipleCreatures],
            { perTargetTier: { targetId, tier: targetTier } },
          ),
        );
      }
    }
  }

  // ── two-phase: in combat, a rolling ability opens a resolution entry ───
  // [R-0032]; the explicit commit executes against commit-time state.
  if (nextState.turnState !== null) {
    const resolutionEntry: ResolutionEntry = {
      kind: 'ability',
      // Advancing a declaration keeps its identity and its recorded
      // edits: the entry a reaction already modified is the entry that
      // rolls [R-0041].
      resolutionId: declaredEntry?.resolutionId ?? intent.intentId,
      actorId: payload.actorParticipantId,
      abilityArtifactId: ability.abilityArtifactId,
      actionCost: cost,
      payloadHash: hashPayload(payload),
      declarationHash:
        declaredEntry?.declarationHash ??
        hashDeclaration({
          actorId: payload.actorParticipantId,
          abilityArtifactId: ability.abilityArtifactId,
          targets: payload.targets,
        }),
      actionKey: declaredEntry?.actionKey ?? payload.partOf ?? intent.intentId,
      phase: 'rolled',
      rollReceipt,
      modifications: declaredEntry?.modifications ?? [],
      squadBreakdown: null,
    };
    nextState = {
      ...nextState,
      resolutionStack:
        declaredEntry === null
          ? [...nextState.resolutionStack, resolutionEntry]
          : nextState.resolutionStack.map((candidate) =>
              candidate.resolutionId === declaredEntry.resolutionId ? resolutionEntry : candidate,
            ),
    };
    log.push(
      entry(
        context,
        'mutation',
        `${actor.id}'s ${ability.abilityArtifactId.split('/').pop()} is rolled and OPEN on the resolution stack — reactions and modifications may cut in; commit-resolution applies it [R-0032]`,
        [POWER_ROLL_CANON.powerRoll, ability.abilityArtifactId],
        // Advancing a declaration is a PHASE change on an entry that
        // already existed, not a birth: it claims `resolutionRolled`, not
        // `resolutionOpened`. The ability was used and its targets were
        // named back at the declaration, and those occurrences already
        // fired — only the ROLL is new here [R-0041].
        declaredEntry === null
          ? { resolutionOpened: resolutionOpenedClaim(resolutionEntry) }
          : {
              resolutionRolled: resolutionOpenedClaim(resolutionEntry),
              resolutionPhaseDeltas: [
                { resolutionId: resolutionEntry.resolutionId, from: 'declared', to: 'rolled' },
              ],
            },
      ),
    );
    return { state: nextState, log };
  }

  // ── v5 single-dispatch path (no combat runtime) ────────────────────────
  const applied = applyAbilityOutcome(
    nextState,
    { payload, targets: payload.targets, tierFor: tierNumberFor },
    context,
  );
  return { state: applied.state, log: [...log, ...applied.log] };
}
