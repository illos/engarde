import { abilityCostOf, targetCountOf } from './ability-execution.js';
import { ECONOMY_CANON, debitActionCost } from './action-economy.js';
import { type LifecycleContext, applyConditionInstance } from './condition-lifecycle.js';
import {
  type DamageOutcome,
  MINION_CANON,
  type PendingSquadContribution,
  applyDamage,
  collectSquadContribution,
  damageAutomationBlocker,
  flushSquadContributions,
  gainTemporaryStamina,
  minionRegainRouting,
  recoverySpendBlocker,
  regainAutomationBlocker,
  regainStamina,
  spendRecovery,
  withParticipant,
} from './damage.js';
import type { RandomSource } from './determinism.js';
import {
  GRANT_CANON,
  addGrant,
  grantConsumedByRoll,
  grantContribution,
  splitGrants,
} from './grant-lifecycle.js';
import { HEALTH_CANON, UNCONSCIOUS_CONDITION_ID } from './health.js';
import { POTENCY_CANON, resolvePotency } from './potency.js';
import { POWER_ROLL_CANON, POWER_ROLL_DIE, resolvePowerRoll } from './power-roll.js';
import type {
  ActionCost,
  EffectResolution,
  EncounterState,
  LogEntry,
  NextRollGrant,
  ParsedIntent,
  ParticipantState,
  TestTier,
} from './schemas.js';
import { nonrollingAbilityApplicationClaim } from './schemas.js';

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

/**
 * What a resolution executes AGAINST — the provenance-carrying source of
 * the printed instruction, independent of which dispatch surface produced
 * it. `provenance` is not decoration: a prose common action has no
 * `**Effect:**` line, so a receipt that labelled one `manualEffect` would
 * misattribute the printed text to a line the book never printed.
 */
export interface ResolutionBinding {
  artifactId: string;
  /** One-based occurrence within the artifact (always 1 for a prose
   * feature, which has no repeatable instruction line). */
  ordinal: number;
  sourceText: string;
  sourceSpan: { byteStart: number; byteEnd: number };
  canonRefs: readonly string[];
  targetsText: string | null;
  distanceText: string | null;
  keywords: readonly string[];
  provenance: 'effect-program' | 'prose-feature';
}

/** The dispatch-supplied inputs a resolution consumes — the shared shape
 * `use-effect` and `use-common-action` both carry [schemas.ts
 * `resolutionInputShape`]. */
export interface ResolutionInputs {
  actorParticipantId: string;
  targets: readonly string[];
  partOf?: string;
  operatorId?: string;
  testRolls: Record<
    string,
    {
      dice?: [number, number];
      edges: number;
      banes: number;
      bonuses: Array<{ value: number; reason: string }>;
      penalties: Array<{ value: number; reason: string }>;
    }
  >;
  objectTargets: readonly string[];
  knockOut: boolean;
  recoverySpends: Record<string, boolean>;
}

/**
 * The action-economy half of a dispatch, resolved by the CALLER. The two
 * surfaces read their cost from different printed places — an ability
 * header cell (normalized at compile time) versus a common action's group
 * directory plus an optional dispatch override — and exactly one of them
 * may skip the debit entirely (a companion-paid common action). Resolving
 * it above this executor keeps `debitActionCost` the one debit home while
 * letting each surface answer "what does the book charge here?" its own
 * way.
 */
export interface ResolutionEconomy {
  cost: ActionCost | null;
  actionCostResidue: string | null;
  /** The raw printed cell, for the residue directive. */
  actionType: string | null;
  operatorPays: boolean;
  usesPerRound: number | null;
  /** Per-ability counter key; the artifact id for both surfaces today. */
  abilityKey: string;
  /** A `partOf` child that realizes another part of the SAME printed use
   * shares its parent's use counter [action-economy.ts]. */
  sharesAbilityUse: boolean;
  /** Skip the debit entirely: the printed cost is carried by another
   * dispatch (a common action's compiled companion ability). Never a
   * silent skip — the caller emits the receipt that says who pays. */
  debitSuppressed: boolean;
}

/** One resolution dispatch, whatever surface produced it. */
export interface ResolutionDispatch {
  binding: ResolutionBinding;
  resolution: EffectResolution;
  inputs: ResolutionInputs;
  economy: ResolutionEconomy;
  /**
   * Emit the nonrolling application claim, from which `deriveOccurrences`
   * reads `ability-used` / `targeted` [R-0040]. TRUE for compiled Effect
   * programs (they are ability text). FALSE for common actions: the
   * printed trigger word is "ability", and Advance, Catch Breath and Stand
   * Up are not abilities — firing `ability-used` for them would make every
   * printed "if you use an ability" trigger fire on walking. The
   * common-action occurrence arm is its own ruled unit of work
   * [common-actions design S17 + W0-c].
   */
  emitsNonrollingClaim: boolean;
  /**
   * Entries the calling surface produced before the debit — the printed
   * eligibility gates, a companion-pays receipt, a selected alternative.
   * They land after the informational entry and BEFORE the economy debit,
   * which is where a printed precondition belongs: it is quoted at the
   * moment it applies, and it never short-circuits [R-0030].
   */
  preludeLog?: readonly LogEntry[];
  /** Surface-specific receipt fields merged into the dispatch receipt. */
  receiptExtras?: Record<string, unknown>;
}

/** Receipt identity for a binding, keyed by provenance — a prose feature
 * has no Effect ordinal and must never be read back as an Effect line. */
function bindingIdFields(binding: ResolutionBinding): Record<string, unknown> {
  return binding.provenance === 'prose-feature'
    ? { featureArtifactId: binding.artifactId }
    : { effectArtifactId: binding.artifactId, effectOrdinal: binding.ordinal };
}

function bindingRefs(binding: ResolutionBinding, extra: readonly string[] = []): string[] {
  return [...new Set([binding.artifactId, ...binding.canonRefs, ...extra])];
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

/** The identity half of every receipt this executor emits, keyed by
 * provenance so a prose feature is never read back as an Effect line. */
function bindingReceiptBody(
  binding: ResolutionBinding,
  resolution: EffectResolution,
  targets: readonly string[],
): Record<string, unknown> {
  return binding.provenance === 'prose-feature'
    ? {
        featureArtifactId: binding.artifactId,
        sourceSpan: binding.sourceSpan,
        sourceText: binding.sourceText,
        resolutionKind: resolution.kind,
        targets: [...targets],
      }
    : {
        effectArtifactId: binding.artifactId,
        effectOrdinal: binding.ordinal,
        sourceSpan: binding.sourceSpan,
        sourceText: binding.sourceText,
        resolutionKind: resolution.kind,
        targets: [...targets],
      };
}

function dispatchReceipt(dispatch: ResolutionDispatch): Record<string, unknown> {
  const { binding, resolution, inputs } = dispatch;
  const body = bindingReceiptBody(binding, resolution, inputs.targets);
  return {
    ...(binding.provenance === 'prose-feature'
      ? { commonActionResolution: { ...body, ...dispatch.receiptExtras } }
      : { effectResolution: { ...body, ...dispatch.receiptExtras } }),
    ...(dispatch.emitsNonrollingClaim && inputs.partOf === undefined
      ? {
          nonrollingAbilityApplication: nonrollingAbilityApplicationClaim({
            actorId: inputs.actorParticipantId,
            abilityArtifactId: binding.artifactId,
            targetIds: inputs.targets,
          }),
        }
      : {}),
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
  binding: ResolutionBinding,
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
        canonRefs: bindingRefs(binding, item.canonRefs),
      })),
    );
  }
  return nextState;
}

/**
 * The shared refusal preamble — every whole-dispatch structural gate, run
 * BEFORE any mutation so a refusal never follows a state change
 * (refusal-with-change holds by construction). Returns the refusal entry,
 * or null when the dispatch may proceed.
 *
 * These are substrate invariants only (unknown participants, missing stats
 * a roll needs, id collisions, an unanswered Recovery offer). Rule
 * violations warn and apply [R-0030]; nothing here gatekeeps a choice.
 */
export function resolutionRefusal(
  state: EncounterState,
  dispatch: ResolutionDispatch,
  context: LifecycleContext,
): LogEntry | null {
  const { binding, resolution, inputs } = dispatch;
  const targets = inputs.targets;
  if (!state.participants[inputs.actorParticipantId]) {
    return entry(
      context,
      'refusal',
      `unknown participant ${inputs.actorParticipantId}`,
      bindingRefs(binding),
      dispatchReceipt(dispatch),
    );
  }
  for (const targetId of targets) {
    if (!state.participants[targetId]) {
      return entry(
        context,
        'refusal',
        `unknown participant ${targetId}`,
        bindingRefs(binding),
        dispatchReceipt(dispatch),
      );
    }
  }
  if (resolution.kind === 'test') {
    for (const targetId of targets) {
      if (!state.participants[targetId]?.stats) {
        return entry(
          context,
          'refusal',
          `${targetId} has no recorded stats to roll a ${resolution.characteristic} test`,
          bindingRefs(binding, [TEST_CANON.test]),
          dispatchReceipt(dispatch),
        );
      }
    }
  }
  if (resolution.kind === 'next-roll-grant') {
    for (const targetId of targets) {
      const grantId = `${binding.artifactId}#${context.intentId}-${targetId}`;
      if (state.participants[targetId]?.grants.some((grant) => grant.grantId === grantId)) {
        return entry(
          context,
          'refusal',
          `grant ${grantId} already exists on ${targetId}`,
          bindingRefs(binding),
          dispatchReceipt(dispatch),
        );
      }
    }
  }
  if (resolution.kind === 'condition') {
    for (const targetId of targets) {
      const instanceId = `${resolution.conditionId}#${context.intentId}-${targetId}`;
      if (
        state.participants[targetId]?.conditions.some(
          (instance) => instance.instanceId === instanceId,
        )
      ) {
        return entry(
          context,
          'refusal',
          `condition instance ${instanceId} already exists on ${targetId}`,
          bindingRefs(binding),
          dispatchReceipt(dispatch),
        );
      }
    }
  }

  // Remaining whole-dispatch refusal conditions, hoisted BEFORE the
  // economy debit so a refusal never follows a mutation
  // (refusal-with-change holds by construction).
  if (resolution.kind === 'spend-recovery') {
    for (const targetId of targets) {
      if (inputs.recoverySpends[targetId] === undefined) {
        return entry(
          context,
          'refusal',
          `no accept/decline recorded for ${targetId} — a Recovery offer needs every bound participant's answer`,
          bindingRefs(binding, [HEALTH_CANON.recoveries]),
          dispatchReceipt(dispatch),
        );
      }
    }
  }
  if (resolution.kind === 'terrain-fact') {
    const factId = `${binding.artifactId}#${binding.ordinal}#${context.intentId}-terrain`;
    if (state.terrainFacts.some((fact) => fact.factId === factId)) {
      return entry(
        context,
        'refusal',
        `terrain fact ${factId} already recorded`,
        bindingRefs(binding),
        dispatchReceipt(dispatch),
      );
    }
  }
  if (inputs.operatorId !== undefined && !state.participants[inputs.operatorId]) {
    return entry(
      context,
      'refusal',
      `unknown participant ${inputs.operatorId}`,
      bindingRefs(binding),
      dispatchReceipt(dispatch),
    );
  }

  return null;
}

/**
 * `use-effect` — a compiled `**Effect:**` program. A thin builder over the
 * one resolution dispatch path; the cost comes from the compiled header
 * cell through `abilityCostOf`, the one home for "compiled cost, else
 * normalize the raw cell".
 */
export function executeUseEffect(
  state: EncounterState,
  intent: UseEffectIntent,
  random: RandomSource,
): ExecutionResult {
  const context: LifecycleContext = { intentId: intent.intentId, actor: intent.actor };
  const { effect } = intent.payload;
  return executeResolutionDispatch(
    state,
    {
      binding: {
        artifactId: effect.effectArtifactId,
        ordinal: effect.effectOrdinal,
        sourceText: effect.sourceText,
        sourceSpan: effect.sourceSpan,
        canonRefs: effect.canonRefs,
        targetsText: effect.targetsText,
        distanceText: effect.distanceText,
        keywords: effect.keywords,
        provenance: 'effect-program',
      },
      resolution: effect.resolution,
      inputs: {
        actorParticipantId: intent.payload.actorParticipantId,
        targets: intent.payload.targets,
        ...(intent.payload.partOf === undefined ? {} : { partOf: intent.payload.partOf }),
        ...(intent.payload.operatorId === undefined
          ? {}
          : { operatorId: intent.payload.operatorId }),
        testRolls: intent.payload.testRolls,
        objectTargets: intent.payload.objectTargets,
        knockOut: intent.payload.knockOut,
        recoverySpends: intent.payload.recoverySpends,
      },
      economy: {
        cost: abilityCostOf({ actionCost: effect.actionCost, actionType: effect.actionType }),
        actionCostResidue: effect.actionCostResidue,
        actionType: effect.actionType,
        operatorPays: effect.operatorPays,
        usesPerRound: effect.usesPerRound,
        abilityKey: effect.effectArtifactId,
        sharesAbilityUse: false,
        debitSuppressed: false,
      },
      emitsNonrollingClaim: true,
    },
    context,
    random,
  );
}

export function executeResolutionDispatch(
  state: EncounterState,
  dispatch: ResolutionDispatch,
  context: LifecycleContext,
  random: RandomSource,
): ExecutionResult {
  const { binding, resolution, inputs, economy } = dispatch;
  const targets = inputs.targets;
  const refusal = resolutionRefusal(state, dispatch, context);
  if (refusal !== null) return { state, log: [refusal] };

  const log: LogEntry[] = [
    entry(
      context,
      'informational',
      `${inputs.actorParticipantId} resolves ${binding.artifactId} ${binding.provenance === 'prose-feature' ? 'common action' : 'Effect'}${targets.length > 0 ? ` for ${targets.join(', ')}` : ''}`,
      bindingRefs(binding),
      dispatchReceipt(dispatch),
    ),
  ];
  if (dispatch.preludeLog !== undefined) log.push(...dispatch.preludeLog);
  const declaredTargets = targetCountOf(binding.targetsText);
  if (declaredTargets !== null && targets.length > declaredTargets) {
    log.push(
      entry(
        context,
        'warning',
        `${targets.length} targets named; the effect's targets line reads "${binding.targetsText}"`,
        bindingRefs(binding),
        { declaredTargets, namedTargets: targets.length },
      ),
    );
  }

  // ── action-economy debit (v6, R-0029/R-0030; combat only) — the same
  // one-home helper use-ability routes through [design §3].
  let economyState = state;
  const cost = economy.cost;
  // R-0029 honest residue: a header cell the closed vocabulary refused
  // carries no debit — never a guessed one. Surface the raw unnormalized
  // value as a table directive instead of skipping silently.
  if (state.turnState !== null && cost === null && economy.actionCostResidue !== null) {
    log.push(
      entry(
        context,
        'table-directive',
        `${binding.artifactId} carries an unresolved action cost (raw header value ${JSON.stringify(economy.actionType)}) — no debit is guessed; the cost is table-adjudicated. Residue: ${economy.actionCostResidue}`,
        bindingRefs(binding, [ECONOMY_CANON.turn]),
        {
          actionCostResidue: {
            ...bindingIdFields(binding),
            raw: economy.actionType,
            residue: economy.actionCostResidue,
          },
        },
      ),
    );
  }
  if (state.turnState !== null && cost !== null && !economy.debitSuppressed) {
    if (economy.operatorPays && inputs.operatorId === undefined) {
      log.push(
        entry(
          context,
          'table-directive',
          `${binding.artifactId} is operator-paid ("${economy.actionType}") but no operatorId was named — the ${cost} debit is table-adjudicated`,
          bindingRefs(binding, [ECONOMY_CANON.turn]),
          {
            operatorDebitUnassigned: { ...bindingIdFields(binding), cost },
          },
        ),
      );
    } else {
      const debited = debitActionCost(
        economyState,
        {
          cost,
          payerId: economy.operatorPays
            ? (inputs.operatorId ?? inputs.actorParticipantId)
            : inputs.actorParticipantId,
          abilityKey: binding.artifactId,
          usesPerRound: economy.usesPerRound,
          partOf: inputs.partOf ?? null,
          sharesAbilityUse: economy.sharesAbilityUse,
        },
        context,
      );
      economyState = debited.state;
      log.push(...debited.log);
    }
  }

  if (resolution.kind === 'test') {
    return executeTest(economyState, dispatch, resolution, log, context, random);
  }

  if (resolution.kind === 'next-roll-grant') {
    let nextState = economyState;
    for (const targetId of targets) {
      const target = nextState.participants[targetId];
      if (!target) continue; // presence proven by the refusal gates
      const added = addGrant(
        nextState,
        {
          target,
          grant: {
            kind: 'next-roll',
            grantId: `${binding.artifactId}#${context.intentId}-${targetId}`,
            polarity: resolution.polarity,
            scope: resolution.scope,
            direction: resolution.direction,
            source: {
              participantId: inputs.actorParticipantId,
              effectArtifactId: binding.artifactId,
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
          canonRefs: bindingRefs(binding, item.canonRefs),
        })),
      );
    }
    return { state: nextState, log };
  }

  if (resolution.kind === 'spend-recovery') {
    // The missing-answer refusal is hoisted above the economy debit.
    if (resolution.singular && targets.length > 1) {
      log.push(
        entry(
          context,
          'warning',
          `${targets.length} participants bound; the effect's subject reads "${resolution.subjectText}"`,
          bindingRefs(binding, [HEALTH_CANON.recoveries]),
          { subjectText: resolution.subjectText, namedTargets: targets.length },
        ),
      );
    }
    const recoveryState = applyPerTarget(
      economyState,
      targets,
      binding,
      log,
      (target, targetId) => {
        if (inputs.recoverySpends[targetId] !== true) {
          log.push(
            entry(
              context,
              'informational',
              `${targetId} declines the offered Recovery`,
              bindingRefs(binding, [HEALTH_CANON.recoveries]),
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
                bindingRefs(binding, [MINION_CANON.sharedPool, HEALTH_CANON.recoveries]),
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
                bindingRefs(binding, [MINION_CANON.sharedPool, HEALTH_CANON.recoveries]),
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
              bindingRefs(binding, [HEALTH_CANON.recoveries]),
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
          inputs.recoverySpends[targetId] === true
        ) {
          log.push(
            entry(
              context,
              'warning',
              `${targetId} accepts the offered Recovery while unconscious — the book does not address this; Director adjudicates`,
              bindingRefs(binding, [HEALTH_CANON.recoveries]),
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
              bindingRefs(binding, [HEALTH_CANON.recoveries]),
              { recoverySpendRefused: { targetId, recoveries: 0, ruling: 'R-0019' } },
            ),
          );
          return null;
        }
        return spendRecovery(
          target,
          { reason: `offered by ${binding.artifactId} Effect` },
          context,
        );
      },
    );
    return { state: recoveryState, log };
  }

  if (resolution.kind === 'regain-stamina' || resolution.kind === 'temporary-stamina') {
    if (resolution.singular && targets.length > 1) {
      log.push(
        entry(
          context,
          'warning',
          `${targets.length} participants bound; the effect's subject reads "${resolution.subjectText}"`,
          bindingRefs(binding),
          { subjectText: resolution.subjectText, namedTargets: targets.length },
        ),
      );
    }
    const regainState = applyPerTarget(economyState, targets, binding, log, (target, targetId) => {
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
              bindingRefs(binding, [MINION_CANON.sharedPool]),
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
              bindingRefs(binding, [MINION_CANON.sharedPool]),
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
            bindingRefs(binding),
            { unautomatedRegain: { targetId, kind: resolution.kind, amount: resolution.amount } },
          ),
        );
        return null;
      }
      return resolution.kind === 'regain-stamina'
        ? regainStamina(
            target,
            resolution.amount,
            { reason: `from ${binding.artifactId} Effect` },
            context,
          )
        : gainTemporaryStamina(
            target,
            resolution.amount,
            { reason: `from ${binding.artifactId} Effect` },
            context,
          );
    });
    return { state: regainState, log };
  }

  if (resolution.kind === 'terrain-fact') {
    // Ordinal in the id: a future batched dispatch of one artifact's two
    // terrain effects must not collide (audit L-4 hardening).
    const factId = `${binding.artifactId}#${binding.ordinal}#${context.intentId}-terrain`;
    // (The duplicate-factId refusal is hoisted above the economy debit.)
    const fact = {
      factId,
      terrain: resolution.terrain,
      effectArtifactId: binding.artifactId,
      effectOrdinal: binding.ordinal,
      areaText: binding.distanceText,
      createdBy: inputs.actorParticipantId,
      intentId: context.intentId,
    };
    log.push(
      entry(
        context,
        'mutation',
        `the area${binding.distanceText ? ` (${binding.distanceText})` : ''} is difficult terrain — recorded; +1 square to enter stays table-adjudicated [R-0022]`,
        bindingRefs(binding, [TERRAIN_CANON.difficultTerrain]),
        { terrainFactAdded: fact },
      ),
    );
    return { state: { ...economyState, terrainFacts: [...economyState.terrainFacts, fact] }, log };
  }

  if (resolution.kind === 'table') {
    log.push(
      entry(context, 'table-directive', binding.sourceText, bindingRefs(binding), {
        [binding.provenance === 'prose-feature' ? 'manualCommonAction' : 'manualEffect']: {
          ...bindingIdFields(binding),
          sourceSpan: binding.sourceSpan,
          sourceText: binding.sourceText,
          targets,
        },
      }),
    );
    return { state: economyState, log };
  }

  let nextState = economyState;
  if (resolution.kind === 'damage') {
    // Same-squad minion targets aggregate into ONE pool application per
    // squad [R-0026]; the effect header's Area keyword is the printed
    // discriminator for the per-minion cap [R-0025].
    const isArea = binding.keywords.some((keyword) => keyword.trim().toLowerCase() === 'area');
    const squadContributions = new Map<string, PendingSquadContribution[]>();
    for (const targetId of targets) {
      const target = nextState.participants[targetId];
      if (!target) continue;
      if (
        collectSquadContribution(
          nextState,
          target,
          { targetId, damage: resolution.amount, type: resolution.damageType },
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
            `${targetId} takes ${resolution.amount}${resolution.damageType ? ` ${resolution.damageType}` : ''} damage — ${blocker}`,
            bindingRefs(binding),
            {
              unautomatedDamage: {
                targetId,
                amount: resolution.amount,
                damageType: resolution.damageType,
              },
            },
          ),
        );
        continue;
      }
      const outcome = applyDamage(
        target,
        { amount: resolution.amount, type: resolution.damageType },
        {
          knockOut: inputs.knockOut,
          reason: `damage from ${binding.artifactId} Effect`,
          // A whole-line Effect instruction deals its damage without a
          // power roll, so it is NOT rolled damage [Heroes p.74].
          provenance: {
            rolled: false,
            sourceId: inputs.actorParticipantId,
            resolutionId: null,
          },
        },
        context,
      );
      nextState = withParticipant(nextState, outcome.participant);
      log.push(
        ...outcome.log.map((item) => ({
          ...item,
          canonRefs: bindingRefs(binding, item.canonRefs),
        })),
      );
    }
    if (squadContributions.size > 0) {
      const flushed = flushSquadContributions(
        nextState,
        squadContributions,
        {
          area: isArea,
          reason: `from ${binding.artifactId} Effect`,
          provenance: {
            rolled: false,
            sourceId: inputs.actorParticipantId,
            resolutionId: null,
          },
        },
        context,
      );
      nextState = flushed.state;
      log.push(
        ...flushed.log.map((item) => ({
          ...item,
          canonRefs: bindingRefs(binding, item.canonRefs),
        })),
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
          instanceId: `${resolution.conditionId}#${context.intentId}-${targetId}`,
          conditionId: resolution.conditionId,
          ending: resolution.ending,
          source: {
            participantId: inputs.actorParticipantId,
            effectArtifactId: binding.artifactId,
          },
        },
        replacesOnNewSource: resolution.replacesOnNewSource,
      },
      context,
    );
    nextState = applied.state;
    log.push(
      ...applied.log.map((item) => ({
        ...item,
        canonRefs: bindingRefs(binding, item.canonRefs),
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
  dispatch: ResolutionDispatch,
  resolution: TestResolution,
  log: LogEntry[],
  context: LifecycleContext,
  random: RandomSource,
): ExecutionResult {
  const { binding, inputs } = dispatch;
  const { targets, objectTargets, testRolls, knockOut } = inputs;
  const actorId = inputs.actorParticipantId;
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
    const split = splitGrants(
      target,
      (grant) =>
        grant.kind === 'next-roll' &&
        grantConsumedByRoll(
          grant,
          { kind: 'test', isStrike: false },
          { attackerId: targetId, targetId: null },
        ) &&
        grant.direction === 'outbound',
    );
    const remaining = split.remaining;
    const consumed = split.consumed.filter(
      (grant): grant is NextRollGrant => grant.kind === 'next-roll',
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
          bindingRefs(binding, [GRANT_CANON.powerRoll]),
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
        bindingRefs(binding, [
          TEST_CANON.test,
          TEST_CANON.reactiveTest,
          POWER_ROLL_CANON.powerRoll,
        ]),
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
          bindingRefs(binding, [POWER_ROLL_CANON.natural1920, POWER_ROLL_CANON.naturalRoll]),
          { testCriticalSuccess: { targetId, natural: rolled.natural } },
        ),
      );
    }
    const applied = applyTestTier(
      nextState,
      log,
      context,
      dispatch,
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
        bindingRefs(binding, [TEST_CANON.objectTarget]),
        { objectTestTier1: { objectLabel } },
      ),
    );
    const tier1 = resolution.tiers.tier1;
    log.push(
      entry(
        context,
        'table-directive',
        tier1.sourceText,
        bindingRefs(binding, [TEST_CANON.objectTarget]),
        {
          testTierDirective: {
            objectLabel,
            tier: 1,
            sourceText: tier1.sourceText,
            ...bindingIdFields(binding),
          },
        },
      ),
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
  dispatch: ResolutionDispatch,
  tier: TestTier,
  tierNumber: 1 | 2 | 3,
  targetId: string,
  actorId: string,
  knockOut: boolean,
): EncounterState {
  const { binding } = dispatch;
  const directive = (): void => {
    log.push(
      entry(context, 'table-directive', tier.sourceText, bindingRefs(binding), {
        testTierDirective: {
          targetId,
          tier: tierNumber,
          sourceText: tier.sourceText,
          ...bindingIdFields(binding),
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
    const pendingContributions = new Map<string, PendingSquadContribution[]>();
    const squad = collectSquadContribution(
      nextState,
      target,
      { targetId, damage: data.damage.amount, type: damageType },
      pendingContributions,
    );
    if (squad) {
      const isArea = binding.keywords.some((keyword) => keyword.trim().toLowerCase() === 'area');
      const flushed = flushSquadContributions(
        nextState,
        pendingContributions,
        {
          area: isArea,
          reason: `from ${binding.artifactId} test (tier ${tierNumber})`,
          // "A test is any power roll that has failure or consequences as
          // an option" [chapter/tests, R-0006] — so test damage IS rolled
          // damage [Heroes p.74].
          provenance: { rolled: true, sourceId: actorId, resolutionId: null },
        },
        context,
      );
      nextState = flushed.state;
      log.push(
        ...flushed.log.map((item) => ({
          ...item,
          canonRefs: bindingRefs(binding, item.canonRefs),
        })),
      );
    } else {
      const blocker = damageAutomationBlocker(target);
      if (blocker !== null) {
        log.push(
          entry(
            context,
            'table-directive',
            `${targetId} takes ${data.damage.amount}${damageType ? ` ${damageType}` : ''} damage — ${blocker}`,
            bindingRefs(binding),
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
            reason: `${damageType ? `${damageType} ` : ''}damage from ${binding.artifactId} test (tier ${tierNumber})`,
            // A test is a power roll [R-0006], so this is rolled damage.
            provenance: { rolled: true, sourceId: actorId, resolutionId: null },
          },
          context,
        );
        nextState = withParticipant(nextState, outcome.participant);
        log.push(
          ...outcome.log.map((item) => ({
            ...item,
            canonRefs: bindingRefs(binding, item.canonRefs),
          })),
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
          bindingRefs(binding, [POTENCY_CANON]),
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
        bindingRefs(binding, [POTENCY_CANON]),
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
          instanceId: `${conditionId}#${context.intentId}-${targetId}`,
          conditionId,
          ending: data.ending === 'save-ends' ? { kind: 'save-ends' } : { kind: 'external' },
          source: { participantId: actorId, effectArtifactId: binding.artifactId },
        },
        replacesOnNewSource: false,
      },
      context,
    );
    nextState = applied.state;
    log.push(
      ...applied.log.map((item) => ({ ...item, canonRefs: bindingRefs(binding, item.canonRefs) })),
    );
  }
  return nextState;
}
