import { type LifecycleContext, applyConditionInstance } from './condition-lifecycle.js';
import { applyDamage, damageAutomationBlocker, withParticipant } from './damage.js';
import type { RandomSource } from './determinism.js';
import {
  GRANT_CANON,
  grantContribution,
  scopeMatchesRoll,
  splitGrants,
} from './grant-lifecycle.js';
import { CHARACTERISTIC_KEY, POTENCY_CANON, resolvePotency } from './potency.js';
import {
  POWER_ROLL_CANON,
  POWER_ROLL_DIE,
  type PowerRollResolution,
  type Tier,
  resolvePowerRoll,
} from './power-roll.js';
import type {
  CharacteristicLetter,
  DamageType,
  EncounterState,
  LogEntry,
  NextRollGrant,
  ParsedIntent,
  ParticipantState,
} from './schemas.js';

/**
 * use-ability executor (docs/power-roll-design.md §4.1): ONE power roll per
 * ability, damage dealt to ALL targets first, then non-damage effects per
 * target in presented order [rule.dice/ability-roll §Abilities With Damage
 * and Effects]. All refusal checks run BEFORE any mutation (the
 * refusal-with-change invariant holds by construction).
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

/** Bind the roll's added value per the compiled power-roll bonus. */
function bindRollValue(
  intent: UseAbilityIntent,
  actor: ParticipantState,
): { value: number; label: string } | { error: string } {
  const bonus = intent.payload.ability.powerRollBonus;
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
    const choice = intent.payload.characteristicChoice;
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
function bindDamageCharacteristic(
  intent: UseAbilityIntent,
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
  const choice = intent.payload.damageCharacteristicChoice;
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

export function executeUseAbility(
  state: EncounterState,
  intent: UseAbilityIntent,
  random: RandomSource,
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
  const rollBinding = bindRollValue(intent, actor);
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
  // mutation: grant consumption precedes the roll, and a refusal may never
  // follow a mutation (refusal-with-change). Binding errors are
  // target-independent, so this is safe to hoist.
  const damageBindings = new Map<Tier, { value: number; label: string; defaulted: boolean }>();
  for (const tierNumber of [1, 2, 3] as const) {
    const tierDamage = ability.tiers[`tier${tierNumber}`].damage;
    if (!tierDamage) continue;
    const binding = bindDamageCharacteristic(intent, actor, tierDamage.characteristicOptions);
    if ('error' in binding) return refuse(state, context, binding.error);
    damageBindings.set(tierNumber, binding);
  }

  const log: LogEntry[] = [];
  let nextState = state;

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
      (grant) => grant.direction === direction && scopeMatchesRoll(grant.scope, rollShape),
    );
    let edges = 0;
    let banes = 0;
    for (const grant of split.consumed) {
      const contribution = grantContribution(grant.polarity);
      edges += contribution.edges;
      banes += contribution.banes;
    }
    if (split.consumed.length > 0) {
      nextState = withParticipant(nextState, { ...holder, grants: split.remaining });
      log.push(
        entry(
          context,
          'mutation',
          direction === 'outbound'
            ? `${holder.id}'s pending next-roll modifiers apply to this roll and are spent (${split.consumed.map((grant) => grant.polarity).join(', ')})`
            : `the mark on ${holder.id} applies to this strike against them and is spent (${split.consumed.map((grant) => grant.polarity).join(', ')})`,
          [
            GRANT_CANON.powerRoll,
            ...(direction === 'inbound' ? [GRANT_CANON.rollAgainstMultipleCreatures] : []),
          ],
          {
            removedGrantIds: split.consumed.map((grant) => grant.grantId),
            grantsConsumed: split.consumed.map((grant) => ({
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
    return { edges, banes, consumed: split.consumed };
  };

  const liveActor = nextState.participants[payload.actorParticipantId];
  const outbound = liveActor
    ? consumeGrantsFrom(liveActor, 'outbound')
    : { edges: 0, banes: 0, consumed: [] };
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
  const baseEdges = payload.edges + outbound.edges;
  const baseBanes = payload.banes + outbound.banes;
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
  if (inboundByTarget.size > 0) {
    perTarget = {};
    for (const targetId of payload.targets) {
      const extra = inboundByTarget.get(targetId) ?? { edges: 0, banes: 0 };
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
      `${actor.id} rolls ${ability.abilityArtifactId.split('/').pop()}: ${dice[0]}+${dice[1]}${rollBinding.value >= 0 ? '+' : ''}${rollBinding.value} (${rollBinding.label}) → total ${resolution.total}, tier ${resolution.tier}`,
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
          grantsConsumed: [
            ...outbound.consumed.map((grant) => ({
              grantId: grant.grantId,
              holderId: payload.actorParticipantId,
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

  // Critical hit: natural 19–20 on a MAIN-ACTION ability roll — the extra
  // main action is a table directive until action economy is a mechanism.
  const isMainAction = ability.actionType?.toLowerCase().includes('main action') ?? false;
  if (resolution.naturalTopEnd && isMainAction) {
    log.push(
      entry(
        context,
        'table-directive',
        `critical hit — ${actor.id} immediately takes an additional main action after this resolves (even off-turn, even dazed)`,
        [POWER_ROLL_CANON.criticalHit, POWER_ROLL_CANON.naturalRoll],
        { criticalHit: true, natural: resolution.natural },
      ),
    );
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

  // ── damage phase: all targets first [rule.dice/ability-roll] ───────────
  const defaultedTiersLogged = new Set<Tier>();
  for (const targetId of payload.targets) {
    const tierNumber = tierNumberFor(targetId);
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
      const amount = tierData.damage.amount + damageBinding.value + extra;
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
        },
        context,
      );
      nextState = withParticipant(nextState, outcome.participant);
      log.push(...outcome.log);
    }
  }

  // ── effect phase: per target, in presented order ────────────────────────
  for (const targetId of payload.targets) {
    const target = nextState.participants[targetId];
    if (!target) continue; // presence proven by the refusal gates
    const tierData = ability.tiers[`tier${tierNumberFor(targetId)}` as 'tier1' | 'tier2' | 'tier3'];
    if (tierData.conditionIds.length === 0) continue;

    if (tierData.potency) {
      const adjustment = payload.potencyAdjustments
        .filter((item) => item.target === undefined || item.target === targetId)
        .reduce((sum, item) => sum + item.delta, 0);
      const gate = resolvePotency(tierData.potency, actor, target, adjustment);
      if (!gate.resolved) {
        log.push(
          entry(
            context,
            'table-directive',
            `potency ${tierData.potency.characteristic} < ${tierData.potency.threshold.kind === 'named' ? tierData.potency.threshold.name.toUpperCase() : tierData.potency.threshold.value} on ${targetId} cannot be resolved — ${gate.reason}; effects not applied`,
            [POTENCY_CANON, ability.abilityArtifactId],
            {
              potencyUnresolved: {
                targetId,
                reason: gate.reason,
                conditionIds: tierData.conditionIds,
              },
            },
          ),
        );
        continue;
      }
      log.push(
        entry(
          context,
          'informational',
          `potency vs ${targetId}: ${tierData.potency.characteristic} ${gate.targetScore} < ${gate.adjustedValue} → ${gate.applies ? 'affected' : 'resisted'}`,
          [POTENCY_CANON],
          { potency: { targetId, ...gate, conditionIds: tierData.conditionIds } },
        ),
      );
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
            instanceId: `${conditionId}#${intent.intentId}-${targetId}`,
            conditionId,
            ending: tierData.ending === 'save-ends' ? { kind: 'save-ends' } : { kind: 'external' },
            source: {
              participantId: payload.actorParticipantId,
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
