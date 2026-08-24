import { type LifecycleContext, applyConditionInstance } from './condition-lifecycle.js';
import { applyDamage, damageAutomationBlocker, withParticipant } from './damage.js';
import type { RandomSource } from './determinism.js';
import { CHARACTERISTIC_KEY, POTENCY_CANON, resolvePotency } from './potency.js';
import { POWER_ROLL_CANON, POWER_ROLL_DIE, resolvePowerRoll } from './power-roll.js';
import type {
  CharacteristicLetter,
  DamageType,
  EncounterState,
  LogEntry,
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

  const log: LogEntry[] = [];

  // ── the roll: dice as input; asserted dice draw NOTHING (SE-4) ─────────
  const dice: [number, number] = payload.dice ?? [
    random.roll(POWER_ROLL_DIE),
    random.roll(POWER_ROLL_DIE),
  ];
  const resolution = resolvePowerRoll({
    dice,
    characteristicValue: rollBinding.value,
    bonuses: payload.bonuses,
    penalties: payload.penalties,
    edges: payload.edges,
    banes: payload.banes,
    automaticOutcomes: payload.automaticOutcomes,
    downgradeToTier: payload.downgradeToTier,
  });
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
          edges: payload.edges,
          banes: payload.banes,
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

  const tierData = ability.tiers[`tier${resolution.tier}` as 'tier1' | 'tier2' | 'tier3'];
  let nextState = state;

  // ── damage phase: all targets first [rule.dice/ability-roll] ───────────
  if (tierData.damage) {
    const damageBinding = bindDamageCharacteristic(
      intent,
      actor,
      tierData.damage.characteristicOptions,
    );
    if ('error' in damageBinding) return refuse(state, context, damageBinding.error);
    const damageType: DamageType | null =
      tierData.damage.typeOptions.length === 0
        ? null
        : tierData.damage.typeOptions.length === 1
          ? (tierData.damage.typeOptions[0] ?? null)
          : (payload.damageTypeChoice ?? null);
    if (damageBinding.defaulted) {
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
    for (const targetId of payload.targets) {
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
          reason: `${damageType ? `${damageType} ` : ''}damage from ${actor.id}'s ability (tier ${resolution.tier})`,
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
