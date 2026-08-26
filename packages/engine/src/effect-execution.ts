import { targetCountOf } from './ability-execution.js';
import { type LifecycleContext, applyConditionInstance } from './condition-lifecycle.js';
import {
  type DamageOutcome,
  MINION_CANON,
  type PendingSquadContribution,
  applyDamage,
  damageAutomationBlocker,
  flushSquadContributions,
  gainTemporaryStamina,
  isMinion,
  minionRegainRouting,
  recoverySpendBlocker,
  regainAutomationBlocker,
  regainStamina,
  spendRecovery,
  squadOf,
  withParticipant,
} from './damage.js';
import type { RandomSource } from './determinism.js';
import { GRANT_CANON, addGrant, grantContribution, splitGrants } from './grant-lifecycle.js';
import { HEALTH_CANON, UNCONSCIOUS_CONDITION_ID } from './health.js';
import { POTENCY_CANON, resolvePotency } from './potency.js';
import { POWER_ROLL_CANON, POWER_ROLL_DIE, resolvePowerRoll } from './power-roll.js';
import type {
  EncounterState,
  LogEntry,
  ParsedIntent,
  ParticipantState,
  TestTier,
} from './schemas.js';

/** Canon grounding for recorded terrain facts [R-0022]. */
export const TERRAIN_CANON = {
  /** "It costs 1 additional square of movement to enter a square of
   * difficult terrain." — the cost stays table-adjudicated. */
  difficultTerrain: 'mcdm.heroes.v1/movement/difficult-terrain',
} as const;

/** Canon grounding for characteristic-test resolution [R-0006..R-0011]. */
export const TEST_CANON = {
  test: 'mcdm.heroes.v1/rule.test/test',
  reactiveTest: 'mcdm.heroes.v1/rule.test/reactive-test',
  /** "If an ability forces an object to make a test, the object
   * automatically gets a tier 1 result on the test." */
  objectTarget: 'mcdm.heroes.v1/rule.combat/target',
} as const;

/**
 * Executor for compiled `**Effect:**` programs. This is deliberately a small
 * interpreter over canon-produced data: exact damage and condition forms use
 * their one-home engine cores; everything else becomes an attributed,
 * verbatim table directive. All refusal gates run before mutation.
 */

type UseEffectIntent = Extract<ParsedIntent, { kind: 'use-effect' }>;

interface ExecutionResult {
  state: EncounterState;
  log: LogEntry[];
}

function refs(
  effect: UseEffectIntent['payload']['effect'],
  extra: readonly string[] = [],
): string[] {
  return [...new Set([effect.effectArtifactId, ...effect.canonRefs, ...extra])];
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

function receipt(intent: UseEffectIntent): Record<string, unknown> {
  return {
    effectResolution: {
      effectArtifactId: intent.payload.effect.effectArtifactId,
      effectOrdinal: intent.payload.effect.effectOrdinal,
      sourceSpan: intent.payload.effect.sourceSpan,
      sourceText: intent.payload.effect.sourceText,
      resolutionKind: intent.payload.effect.resolution.kind,
      targets: intent.payload.targets,
    },
  };
}

/**
 * Shared per-target applicator for per-target resource effects (Recovery
 * spend offers, Stamina regains / temporary-Stamina grants — and the coming
 * surge / heroic-resource / malice families). Walks the bound targets
 * against the evolving state; `applyOne` either returns a one-home outcome
 * to apply or pushes its own per-binding log entries and returns null — a
 * per-binding non-application, so sibling bindings proceed (cf. the
 * potency-gate pattern). Applied outcomes are swapped in via
 * `withParticipant` and their log merged under the effect's canon refs, in
 * dispatch order.
 */
function applyPerTarget(
  state: EncounterState,
  targets: readonly string[],
  effect: UseEffectIntent['payload']['effect'],
  log: LogEntry[],
  applyOne: (target: ParticipantState, targetId: string) => DamageOutcome | null,
): EncounterState {
  let nextState = state;
  for (const targetId of targets) {
    const target = nextState.participants[targetId];
    if (!target) continue; // presence proven by the refusal gates
    const outcome = applyOne(target, targetId);
    if (outcome === null) continue;
    nextState = withParticipant(nextState, outcome.participant);
    log.push(
      ...outcome.log.map((item) => ({
        ...item,
        canonRefs: refs(effect, item.canonRefs),
      })),
    );
  }
  return nextState;
}

export function executeUseEffect(
  state: EncounterState,
  intent: UseEffectIntent,
  random: RandomSource,
): ExecutionResult {
  const context: LifecycleContext = { intentId: intent.intentId, actor: intent.actor };
  const { effect, targets } = intent.payload;
  if (!state.participants[intent.payload.actorParticipantId]) {
    return {
      state,
      log: [
        entry(
          context,
          'refusal',
          `unknown participant ${intent.payload.actorParticipantId}`,
          refs(effect),
          receipt(intent),
        ),
      ],
    };
  }
  for (const targetId of targets) {
    if (!state.participants[targetId]) {
      return {
        state,
        log: [
          entry(
            context,
            'refusal',
            `unknown participant ${targetId}`,
            refs(effect),
            receipt(intent),
          ),
        ],
      };
    }
  }
  if (effect.resolution.kind === 'test') {
    for (const targetId of targets) {
      if (!state.participants[targetId]?.stats) {
        return {
          state,
          log: [
            entry(
              context,
              'refusal',
              `${targetId} has no recorded stats to roll a ${effect.resolution.characteristic} test`,
              refs(effect, [TEST_CANON.test]),
              receipt(intent),
            ),
          ],
        };
      }
    }
  }
  if (effect.resolution.kind === 'next-roll-grant') {
    for (const targetId of targets) {
      const grantId = `${effect.effectArtifactId}#${intent.intentId}-${targetId}`;
      if (state.participants[targetId]?.grants.some((grant) => grant.grantId === grantId)) {
        return {
          state,
          log: [
            entry(
              context,
              'refusal',
              `grant ${grantId} already exists on ${targetId}`,
              refs(effect),
              receipt(intent),
            ),
          ],
        };
      }
    }
  }
  if (effect.resolution.kind === 'condition') {
    for (const targetId of targets) {
      const instanceId = `${effect.resolution.conditionId}#${intent.intentId}-${targetId}`;
      if (
        state.participants[targetId]?.conditions.some(
          (instance) => instance.instanceId === instanceId,
        )
      ) {
        return {
          state,
          log: [
            entry(
              context,
              'refusal',
              `condition instance ${instanceId} already exists on ${targetId}`,
              refs(effect),
              receipt(intent),
            ),
          ],
        };
      }
    }
  }

  const log: LogEntry[] = [
    entry(
      context,
      'informational',
      `${intent.payload.actorParticipantId} resolves ${effect.effectArtifactId} Effect for ${targets.join(', ')}`,
      refs(effect),
      receipt(intent),
    ),
  ];
  const declaredTargets = targetCountOf(effect.targetsText);
  if (declaredTargets !== null && targets.length > declaredTargets) {
    log.push(
      entry(
        context,
        'warning',
        `${targets.length} targets named; the effect's targets line reads "${effect.targetsText}"`,
        refs(effect),
        { declaredTargets, namedTargets: targets.length },
      ),
    );
  }

  if (effect.resolution.kind === 'test') {
    return executeTest(state, intent, effect.resolution, log, context, random);
  }

  if (effect.resolution.kind === 'next-roll-grant') {
    const resolution = effect.resolution;
    let nextState = state;
    for (const targetId of targets) {
      const target = nextState.participants[targetId];
      if (!target) continue; // presence proven by the refusal gates
      const added = addGrant(
        nextState,
        {
          target,
          grant: {
            grantId: `${effect.effectArtifactId}#${intent.intentId}-${targetId}`,
            polarity: resolution.polarity,
            scope: resolution.scope,
            direction: resolution.direction,
            source: {
              participantId: intent.payload.actorParticipantId,
              effectArtifactId: effect.effectArtifactId,
            },
            window: resolution.window,
          },
        },
        context,
      );
      nextState = added.state;
      log.push(
        ...added.log.map((item) => ({
          ...item,
          canonRefs: refs(effect, item.canonRefs),
        })),
      );
    }
    return { state: nextState, log };
  }

  if (effect.resolution.kind === 'spend-recovery') {
    const resolution = effect.resolution;
    for (const targetId of targets) {
      if (intent.payload.recoverySpends[targetId] === undefined) {
        return {
          state,
          log: [
            entry(
              context,
              'refusal',
              `no accept/decline recorded for ${targetId} — a Recovery offer needs every bound participant's answer`,
              refs(effect, [HEALTH_CANON.recoveries]),
              receipt(intent),
            ),
          ],
        };
      }
    }
    if (resolution.singular && targets.length > 1) {
      log.push(
        entry(
          context,
          'warning',
          `${targets.length} participants bound; the effect's subject reads "${resolution.subjectText}"`,
          refs(effect, [HEALTH_CANON.recoveries]),
          { subjectText: resolution.subjectText, namedTargets: targets.length },
        ),
      );
    }
    const recoveryState = applyPerTarget(state, targets, effect, log, (target, targetId) => {
      if (intent.payload.recoverySpends[targetId] !== true) {
        log.push(
          entry(
            context,
            'informational',
            `${targetId} declines the offered Recovery`,
            refs(effect, [HEALTH_CANON.recoveries]),
            { declined: true, targetId },
          ),
        );
        return null;
      }
      // R-0027: a LIVING SQUAD MEMBER accepting a Recovery spend is REFUSED
      // per-binding — "minions … can't regain Stamina … during a battle";
      // no individual Stamina exists to receive it. Siblings proceed (the
      // entry carries the perBinding marker the invariant suite recognizes).
      // A minion outside any seeded squad routes to the table instead — the
      // printed rule applies but their Stamina is not pooled. Squad
      // membership is dispatch-constant on this path, so the outer `state`
      // is the right lookup base.
      const minionRouting = minionRegainRouting(state, target);
      if (minionRouting !== null) {
        if (minionRouting.kind === 'refusal') {
          log.push(
            entry(
              context,
              'refusal',
              `${targetId} cannot spend a Recovery — ${minionRouting.message}`,
              refs(effect, [MINION_CANON.sharedPool, HEALTH_CANON.recoveries]),
              {
                perBinding: true,
                minionRecoverySpendRefused: { targetId, ruling: 'R-0027' },
              },
            ),
          );
        } else {
          log.push(
            entry(
              context,
              'table-directive',
              `${targetId} accepts the offered Recovery — ${minionRouting.message}`,
              refs(effect, [MINION_CANON.sharedPool, HEALTH_CANON.recoveries]),
              { minionRecoverySpendTableRouted: { targetId } },
            ),
          );
        }
        return null;
      }
      const blocker = recoverySpendBlocker(target);
      if (blocker !== null) {
        log.push(
          entry(
            context,
            'table-directive',
            `${targetId} accepts the offered Recovery — ${blocker}`,
            refs(effect, [HEALTH_CANON.recoveries]),
            { unautomatedRecoverySpend: { targetId, blocker } },
          ),
        );
        return null;
      }
      // Book-silent case (design §5): an unconscious (knocked-out) target
      // accepting a spend applies permissively but is flagged for Director
      // adjudication — the unconscious rules bar action-economy items only,
      // and an ability-granted spend is not on that list [rule.health/stamina
      // §Knocking Creatures Out].
      if (
        target.conditions.some((instance) => instance.conditionId === UNCONSCIOUS_CONDITION_ID) &&
        intent.payload.recoverySpends[targetId] === true
      ) {
        log.push(
          entry(
            context,
            'warning',
            `${targetId} accepts the offered Recovery while unconscious — the book does not address this; Director adjudicates`,
            refs(effect, [HEALTH_CANON.recoveries]),
            { unconsciousSpendTarget: { targetId } },
          ),
        );
      }
      // R-0019a: a hero with 0 Recoveries cannot spend — this one binding
      // does not apply while the rest of the dispatch proceeds, so it is a
      // per-binding non-application (the whole-dispatch `refusal` kind would
      // wrongly void sibling spenders; cf. the potency-gate pattern).
      if (target.kind === 'hero' && target.stamina?.recoveries === 0) {
        log.push(
          entry(
            context,
            'informational',
            `${targetId} has no Recoveries left and cannot spend one`,
            refs(effect, [HEALTH_CANON.recoveries]),
            { recoverySpendRefused: { targetId, recoveries: 0, ruling: 'R-0019' } },
          ),
        );
        return null;
      }
      return spendRecovery(
        target,
        { reason: `offered by ${effect.effectArtifactId} Effect` },
        context,
      );
    });
    return { state: recoveryState, log };
  }

  if (
    effect.resolution.kind === 'regain-stamina' ||
    effect.resolution.kind === 'temporary-stamina'
  ) {
    const resolution = effect.resolution;
    if (resolution.singular && targets.length > 1) {
      log.push(
        entry(
          context,
          'warning',
          `${targets.length} participants bound; the effect's subject reads "${resolution.subjectText}"`,
          refs(effect),
          { subjectText: resolution.subjectText, namedTargets: targets.length },
        ),
      );
    }
    const regainState = applyPerTarget(state, targets, effect, log, (target, targetId) => {
      // R-0027: a LIVING SQUAD MEMBER is refused per-binding — "minions
      // can't regain Stamina, and can't gain temporary Stamina during a
      // battle"; sibling bindings proceed. A minion outside any seeded
      // squad routes to the table instead — the printed rule applies but
      // their Stamina is not pooled. Squad membership is dispatch-constant
      // on this path, so the outer `state` is the right lookup base.
      const boundGain =
        resolution.kind === 'regain-stamina'
          ? `regain ${resolution.amount} Stamina`
          : `gain ${resolution.amount} temporary Stamina`;
      const minionRouting = minionRegainRouting(state, target);
      if (minionRouting !== null) {
        if (minionRouting.kind === 'refusal') {
          log.push(
            entry(
              context,
              'refusal',
              `${targetId} cannot ${boundGain} — ${minionRouting.message}`,
              refs(effect, [MINION_CANON.sharedPool]),
              {
                perBinding: true,
                minionRegainRefused: { targetId, kind: resolution.kind, ruling: 'R-0027' },
              },
            ),
          );
        } else {
          log.push(
            entry(
              context,
              'table-directive',
              `${targetId} is bound to ${boundGain} — ${minionRouting.message}`,
              refs(effect, [MINION_CANON.sharedPool]),
              { minionRegainTableRouted: { targetId, kind: resolution.kind } },
            ),
          );
        }
        return null;
      }
      const blocker = regainAutomationBlocker(target);
      if (blocker !== null) {
        log.push(
          entry(
            context,
            'table-directive',
            `${targetId} ${resolution.kind === 'regain-stamina' ? `regains ${resolution.amount} Stamina` : `gains ${resolution.amount} temporary Stamina`} — ${blocker}`,
            refs(effect),
            { unautomatedRegain: { targetId, kind: resolution.kind, amount: resolution.amount } },
          ),
        );
        return null;
      }
      return resolution.kind === 'regain-stamina'
        ? regainStamina(
            target,
            resolution.amount,
            { reason: `from ${effect.effectArtifactId} Effect` },
            context,
          )
        : gainTemporaryStamina(
            target,
            resolution.amount,
            { reason: `from ${effect.effectArtifactId} Effect` },
            context,
          );
    });
    return { state: regainState, log };
  }

  if (effect.resolution.kind === 'terrain-fact') {
    // Ordinal in the id: a future batched dispatch of one artifact's two
    // terrain effects must not collide (audit L-4 hardening).
    const factId = `${effect.effectArtifactId}#${effect.effectOrdinal}#${intent.intentId}-terrain`;
    if (state.terrainFacts.some((fact) => fact.factId === factId)) {
      return {
        state,
        log: [
          entry(
            context,
            'refusal',
            `terrain fact ${factId} already exists`,
            refs(effect, [TERRAIN_CANON.difficultTerrain]),
            receipt(intent),
          ),
        ],
      };
    }
    const fact = {
      factId,
      terrain: effect.resolution.terrain,
      effectArtifactId: effect.effectArtifactId,
      effectOrdinal: effect.effectOrdinal,
      areaText: effect.distanceText,
      createdBy: intent.payload.actorParticipantId,
      intentId: intent.intentId,
    };
    log.push(
      entry(
        context,
        'mutation',
        `the area${effect.distanceText ? ` (${effect.distanceText})` : ''} is difficult terrain — recorded; +1 square to enter stays table-adjudicated [R-0022]`,
        refs(effect, [TERRAIN_CANON.difficultTerrain]),
        { terrainFactAdded: fact },
      ),
    );
    return { state: { ...state, terrainFacts: [...state.terrainFacts, fact] }, log };
  }

  if (effect.resolution.kind === 'table') {
    log.push(
      entry(context, 'table-directive', effect.sourceText, refs(effect), {
        manualEffect: {
          effectArtifactId: effect.effectArtifactId,
          effectOrdinal: effect.effectOrdinal,
          sourceSpan: effect.sourceSpan,
          sourceText: effect.sourceText,
          targets,
        },
      }),
    );
    return { state, log };
  }

  let nextState = state;
  if (effect.resolution.kind === 'damage') {
    // Same-squad minion targets aggregate into ONE pool application per
    // squad [R-0026]; the effect header's Area keyword is the printed
    // discriminator for the per-minion cap [R-0025].
    const isArea = effect.keywords.some((keyword) => keyword.trim().toLowerCase() === 'area');
    const squadContributions = new Map<string, PendingSquadContribution[]>();
    for (const targetId of targets) {
      const target = nextState.participants[targetId];
      if (!target) continue;
      const squad = isMinion(target) ? squadOf(nextState, targetId) : undefined;
      if (squad) {
        const list = squadContributions.get(squad.squadId) ?? [];
        list.push({
          targetId,
          damage: effect.resolution.amount,
          type: effect.resolution.damageType,
        });
        squadContributions.set(squad.squadId, list);
        continue;
      }
      const blocker = damageAutomationBlocker(target);
      if (blocker !== null) {
        log.push(
          entry(
            context,
            'table-directive',
            `${targetId} takes ${effect.resolution.amount}${effect.resolution.damageType ? ` ${effect.resolution.damageType}` : ''} damage — ${blocker}`,
            refs(effect),
            {
              unautomatedDamage: {
                targetId,
                amount: effect.resolution.amount,
                damageType: effect.resolution.damageType,
              },
            },
          ),
        );
        continue;
      }
      const outcome = applyDamage(
        target,
        { amount: effect.resolution.amount, type: effect.resolution.damageType },
        {
          knockOut: intent.payload.knockOut,
          reason: `damage from ${effect.effectArtifactId} Effect`,
        },
        context,
      );
      nextState = withParticipant(nextState, outcome.participant);
      log.push(
        ...outcome.log.map((item) => ({
          ...item,
          canonRefs: refs(effect, item.canonRefs),
        })),
      );
    }
    if (squadContributions.size > 0) {
      const flushed = flushSquadContributions(
        nextState,
        squadContributions,
        { area: isArea, reason: `from ${effect.effectArtifactId} Effect` },
        context,
      );
      nextState = flushed.state;
      log.push(
        ...flushed.log.map((item) => ({ ...item, canonRefs: refs(effect, item.canonRefs) })),
      );
    }
    return { state: nextState, log };
  }

  for (const targetId of targets) {
    const target = nextState.participants[targetId];
    if (!target) continue;
    const applied = applyConditionInstance(
      nextState,
      {
        target,
        instance: {
          instanceId: `${effect.resolution.conditionId}#${intent.intentId}-${targetId}`,
          conditionId: effect.resolution.conditionId,
          ending: effect.resolution.ending,
          source: {
            participantId: intent.payload.actorParticipantId,
            effectArtifactId: effect.effectArtifactId,
          },
        },
        replacesOnNewSource: effect.resolution.replacesOnNewSource,
      },
      context,
    );
    nextState = applied.state;
    log.push(
      ...applied.log.map((item) => ({
        ...item,
        canonRefs: refs(effect, item.canonRefs),
      })),
    );
  }
  return { state: nextState, log };
}

type TestResolution = Extract<UseEffectIntent['payload']['effect']['resolution'], { kind: 'test' }>;

const CHARACTERISTIC_LABEL: Record<TestResolution['characteristic'], string> = {
  might: 'Might',
  agility: 'Agility',
  reason: 'Reason',
  intuition: 'Intuition',
  presence: 'Presence',
};

/**
 * Characteristic-test execution [R-0006..R-0011]: each creature target rolls
 * their own independent test through the power-roll core; each object target
 * automatically obtains a tier 1 result without rolling. The rolled tier's
 * bullet either executes through the one-home damage/potency/condition cores
 * (automatic) or is emitted verbatim as a tier-level table directive.
 */
function executeTest(
  state: EncounterState,
  intent: UseEffectIntent,
  resolution: TestResolution,
  log: LogEntry[],
  context: LifecycleContext,
  random: RandomSource,
): ExecutionResult {
  const { effect, targets, objectTargets, testRolls, knockOut } = intent.payload;
  const actorId = intent.payload.actorParticipantId;
  let nextState = state;

  for (const targetId of targets) {
    const target = nextState.participants[targetId];
    if (!target?.stats) continue; // presence + stats proven by the refusal gates
    const rollInput = testRolls[targetId];
    const dice: [number, number] = rollInput?.dice ?? [
      random.roll(POWER_ROLL_DIE),
      random.roll(POWER_ROLL_DIE),
    ];
    const score = target.stats.characteristics[resolution.characteristic];
    // A test is a power roll: the roller's pending outbound power-roll-scoped
    // grants are consumed by it and contribute to its modifier pool; strike-
    // scoped grants sit dormant across tests [R-0013, R-0015].
    const { remaining, consumed } = splitGrants(
      target,
      (grant) => grant.direction === 'outbound' && grant.scope === 'power-roll',
    );
    let grantEdges = 0;
    let grantBanes = 0;
    for (const grant of consumed) {
      const contribution = grantContribution(grant.polarity);
      grantEdges += contribution.edges;
      grantBanes += contribution.banes;
    }
    if (consumed.length > 0) {
      nextState = withParticipant(nextState, { ...target, grants: remaining });
      log.push(
        entry(
          context,
          'mutation',
          `${targetId}'s pending next-roll modifiers apply to this test and are spent (${consumed.map((grant) => grant.polarity).join(', ')})`,
          refs(effect, [GRANT_CANON.powerRoll]),
          {
            removedGrantIds: consumed.map((grant) => grant.grantId),
            grantsConsumed: consumed.map((grant) => ({
              grantId: grant.grantId,
              holderId: targetId,
              direction: grant.direction,
              polarity: grant.polarity,
              contribution: grantContribution(grant.polarity),
            })),
          },
        ),
      );
    }
    const effectiveEdges = (rollInput?.edges ?? 0) + grantEdges;
    const effectiveBanes = (rollInput?.banes ?? 0) + grantBanes;
    const rolled = resolvePowerRoll({
      dice,
      characteristicValue: score,
      bonuses: rollInput?.bonuses ?? [],
      penalties: rollInput?.penalties ?? [],
      edges: effectiveEdges,
      banes: effectiveBanes,
      automaticOutcomes: [],
    });
    log.push(
      entry(
        context,
        'informational',
        `${targetId} makes a ${CHARACTERISTIC_LABEL[resolution.characteristic]} test: ${dice[0]}+${dice[1]}${score >= 0 ? '+' : ''}${score} → total ${rolled.total}, tier ${rolled.tier}`,
        refs(effect, [TEST_CANON.test, TEST_CANON.reactiveTest, POWER_ROLL_CANON.powerRoll]),
        {
          testRoll: {
            targetId,
            characteristic: resolution.characteristic,
            dice,
            diceAsserted: rollInput?.dice !== undefined,
            characteristicValue: score,
            edges: effectiveEdges,
            banes: effectiveBanes,
            resolution: rolled,
            testCriticalSuccess: rolled.naturalTopEnd,
          },
        },
      ),
    );
    if (rolled.naturalTopEnd) {
      // "you score a critical success. This critical success automatically
      // lets you succeed on the task with a reward" [rule.dice/natural-19-20].
      log.push(
        entry(
          context,
          'informational',
          `${targetId} scores a critical success on the test (natural ${rolled.natural}) — success with a reward`,
          refs(effect, [POWER_ROLL_CANON.natural1920, POWER_ROLL_CANON.naturalRoll]),
          { testCriticalSuccess: { targetId, natural: rolled.natural } },
        ),
      );
    }
    const applied = applyTestTier(
      nextState,
      log,
      context,
      intent,
      resolution.tiers[`tier${rolled.tier}`],
      rolled.tier,
      targetId,
      actorId,
      knockOut,
    );
    nextState = applied;
  }

  for (const objectLabel of objectTargets) {
    // "If an ability forces an object to make a test, the object
    // automatically gets a tier 1 result on the test." [rule.combat/target]
    log.push(
      entry(
        context,
        'informational',
        `object "${objectLabel}" automatically gets a tier 1 result on the test`,
        refs(effect, [TEST_CANON.objectTarget]),
        { objectTestTier1: { objectLabel } },
      ),
    );
    const tier1 = resolution.tiers.tier1;
    log.push(
      entry(context, 'table-directive', tier1.sourceText, refs(effect, [TEST_CANON.objectTarget]), {
        testTierDirective: {
          objectLabel,
          tier: 1,
          sourceText: tier1.sourceText,
          effectArtifactId: effect.effectArtifactId,
          effectOrdinal: effect.effectOrdinal,
        },
      }),
    );
  }

  return { state: nextState, log };
}

/** Apply one rolled tier bullet to one creature target through the one-home
 * cores; anything the bullet's data cannot express stays verbatim. */
function applyTestTier(
  state: EncounterState,
  log: LogEntry[],
  context: LifecycleContext,
  intent: UseEffectIntent,
  tier: TestTier,
  tierNumber: 1 | 2 | 3,
  targetId: string,
  actorId: string,
  knockOut: boolean,
): EncounterState {
  const effect = intent.payload.effect;
  const directive = (): void => {
    log.push(
      entry(context, 'table-directive', tier.sourceText, refs(effect), {
        testTierDirective: {
          targetId,
          tier: tierNumber,
          sourceText: tier.sourceText,
          effectArtifactId: effect.effectArtifactId,
          effectOrdinal: effect.effectOrdinal,
        },
      }),
    );
  };
  if (tier.kind === 'verbatim') {
    directive();
    return state;
  }
  const data = tier.data;
  // The compiler only marks flat, single-type damage automatic for tests;
  // anything else would need a binding the test payload cannot express.
  if (
    data.damage &&
    (data.damage.characteristicOptions.length > 0 || data.damage.typeOptions.length > 1)
  ) {
    directive();
    return state;
  }
  let nextState = state;
  if (data.damage) {
    const target = nextState.participants[targetId];
    if (!target) return nextState;
    const damageType = data.damage.typeOptions[0] ?? null;
    // A squad member's test-tier damage routes to the pool. Each target's
    // independent test roll is its own damage instance (own tier outcome),
    // so it flushes alone — the once-per-squad weakness step applies per
    // instance [R-0026]; the effect header's Area keyword still selects the
    // per-minion cap [R-0025].
    const squad = isMinion(target) ? squadOf(nextState, targetId) : undefined;
    if (squad) {
      const isArea = effect.keywords.some((keyword) => keyword.trim().toLowerCase() === 'area');
      const flushed = flushSquadContributions(
        nextState,
        new Map([[squad.squadId, [{ targetId, damage: data.damage.amount, type: damageType }]]]),
        {
          area: isArea,
          reason: `from ${effect.effectArtifactId} test (tier ${tierNumber})`,
        },
        context,
      );
      nextState = flushed.state;
      log.push(
        ...flushed.log.map((item) => ({ ...item, canonRefs: refs(effect, item.canonRefs) })),
      );
    } else {
      const blocker = damageAutomationBlocker(target);
      if (blocker !== null) {
        log.push(
          entry(
            context,
            'table-directive',
            `${targetId} takes ${data.damage.amount}${damageType ? ` ${damageType}` : ''} damage — ${blocker}`,
            refs(effect),
            {
              unautomatedDamage: { targetId, amount: data.damage.amount, damageType },
            },
          ),
        );
      } else {
        const outcome = applyDamage(
          target,
          { amount: data.damage.amount, type: damageType },
          {
            knockOut,
            reason: `${damageType ? `${damageType} ` : ''}damage from ${effect.effectArtifactId} test (tier ${tierNumber})`,
          },
          context,
        );
        nextState = withParticipant(nextState, outcome.participant);
        log.push(
          ...outcome.log.map((item) => ({ ...item, canonRefs: refs(effect, item.canonRefs) })),
        );
      }
    }
  }
  if (data.conditionIds.length === 0) return nextState;
  const actor = nextState.participants[actorId];
  const target = nextState.participants[targetId];
  if (!target) return nextState;
  if (data.potency) {
    if (!actor) {
      directive();
      return nextState;
    }
    const gate = resolvePotency(data.potency, actor, target, 0);
    if (!gate.resolved) {
      log.push(
        entry(
          context,
          'table-directive',
          `potency ${data.potency.characteristic} < ${data.potency.threshold.kind === 'named' ? data.potency.threshold.name.toUpperCase() : data.potency.threshold.value} on ${targetId} cannot be resolved — ${gate.reason}; effects not applied`,
          refs(effect, [POTENCY_CANON]),
          {
            potencyUnresolved: {
              targetId,
              reason: gate.reason,
              conditionIds: data.conditionIds,
            },
          },
        ),
      );
      return nextState;
    }
    log.push(
      entry(
        context,
        'informational',
        `potency vs ${targetId}: ${data.potency.characteristic} ${gate.targetScore} < ${gate.adjustedValue} → ${gate.applies ? 'affected' : 'resisted'}`,
        refs(effect, [POTENCY_CANON]),
        { potency: { targetId, ...gate, conditionIds: data.conditionIds } },
      ),
    );
    if (!gate.applies) return nextState;
  }
  for (const conditionId of data.conditionIds) {
    const liveTarget = nextState.participants[targetId];
    if (!liveTarget) continue;
    const applied = applyConditionInstance(
      nextState,
      {
        target: liveTarget,
        instance: {
          instanceId: `${conditionId}#${intent.intentId}-${targetId}`,
          conditionId,
          ending: data.ending === 'save-ends' ? { kind: 'save-ends' } : { kind: 'external' },
          source: { participantId: actorId, effectArtifactId: effect.effectArtifactId },
        },
        replacesOnNewSource: false,
      },
      context,
    );
    nextState = applied.state;
    log.push(...applied.log.map((item) => ({ ...item, canonRefs: refs(effect, item.canonRefs) })));
  }
  return nextState;
}
