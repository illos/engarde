import { ECONOMY_CANON, debitActionCost } from './action-economy.js';
import type { LifecycleContext } from './condition-lifecycle.js';
import type { RandomSource } from './determinism.js';
import {
  type ResolutionBinding,
  type ResolutionDispatch,
  executeResolutionDispatch,
  resolutionRefusal,
} from './effect-execution.js';
import type {
  ActionCost,
  CommonActionPerRoundCap,
  CommonActionProgramData,
  EncounterState,
  LogEntry,
  ParsedIntent,
} from './schemas.js';

/**
 * `use-common-action` — the ONE dispatch path for all 17 printed common
 * actions [common-actions design §2, S1].
 *
 * It is deliberately a thin caller into the shared resolution dispatch: the
 * cost debit, the verbatim table directive, the refusal preamble and the
 * per-resolution executors are the same code `use-effect` runs. What lives
 * here is only what the common-action surface genuinely owns — where the
 * printed cost comes from (a group directory plus a dispatch override, not
 * a header cell), which dispatch pays it, the printed once-per-round caps
 * and their subjects, and the printed alternatives.
 *
 * The four dispatch surfaces the per-action specs each proposed
 * (`use-common-action`, `use-effect` with a synthesized program,
 * `remove-condition` + an asserted band, `use-ability`) would have grown
 * four copies of the debit, the eligibility gate, the asserted-fact check
 * and `partOf` composition. There is one.
 */

type UseCommonActionIntent = Extract<ParsedIntent, { kind: 'use-common-action' }>;

/** Canon grounding for the common-action surface (pointers only). */
export const COMMON_ACTION_CANON = {
  /** "gets to take a main action, a maneuver, and a move action on their
   * turn" — the budget every common action is spent against. */
  turn: ECONOMY_CANON.turn,
} as const;

/**
 * The printed cap that binds the ACTOR of a dispatch — the one value
 * `debitActionCost` takes as `usesPerRound` for this action. Ride prints
 * two capped sentences with different subjects; keyed to one counter, a
 * creature that both rides and is ridden in a round warns at the wrong
 * time.
 */
export function actorPerRoundCap(program: CommonActionProgramData): CommonActionPerRoundCap | null {
  return program.perRoundCaps.find((cap) => cap.subject === 'actor') ?? null;
}

/** The printed cap that binds a NAMED TARGET of a dispatch (Ride's
 * mount-side sentence), counted on that target under its own key. */
export function targetPerRoundCap(
  program: CommonActionProgramData,
): CommonActionPerRoundCap | null {
  return program.perRoundCaps.find((cap) => cap.subject === 'target') ?? null;
}

/**
 * The per-ability counter key for a printed cap that binds a named target
 * rather than the actor. A distinct key is required, not cosmetic: the two
 * printed sentences have different subjects ("A creature can USE the Ride
 * move action" vs "A mounted creature can only HAVE this move action
 * APPLIED TO THEM"), so one shared key would make a creature that both
 * rides and is ridden in a round warn at the wrong time.
 */
export function targetCapAbilityKey(featureArtifactId: string): string {
  return `${featureArtifactId}#applied-to-target`;
}

export interface ResolvedCommonActionCost {
  cost: ActionCost;
  /** Where the effective cost came from — recorded on every receipt so a
   * default is never mistaken for a printed reading. */
  source: 'dispatch' | 'group-directory';
  /** The compiled group-directory value, whether or not it was used. */
  groupDefault: ActionCost;
}

/**
 * S3 — the effective cost of a dispatch. The group directory supplies the
 * default; a dispatch may override it, because the printed exceptions are
 * real (two class features print Disengage at a free triggered action, one
 * prints Hide at a free maneuver, one prints Knockback at a free maneuver,
 * Make or Assist prints three costs and hands the choice to the Director,
 * and free strikes are reached off-turn). Defaulting silently would be
 * right most of the time and quietly wrong on every one of those.
 */
export function resolveCommonActionCost(
  program: CommonActionProgramData,
  override: ActionCost | null,
): ResolvedCommonActionCost {
  return {
    cost: override ?? program.defaultActionCost,
    source: override === null ? 'group-directory' : 'dispatch',
    groupDefault: program.defaultActionCost,
  };
}

function bindingOf(program: CommonActionProgramData): ResolutionBinding {
  return {
    artifactId: program.featureArtifactId,
    ordinal: 1,
    sourceText: program.sourceText,
    sourceSpan: program.sourceSpan,
    canonRefs: program.canonRefs,
    // A prose feature prints no targets or distance cell and carries no
    // header keywords — the fields exist on the shared binding, and
    // asserting anything into them would be inventing a header.
    targetsText: null,
    distanceText: null,
    keywords: [],
    provenance: 'prose-feature',
  };
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

/** The dispatch a common-action intent resolves to, built once so the arm
 * and its callers (the offer surface, tests) read the same shape. */
export function commonActionDispatch(
  intent: UseCommonActionIntent,
  preludeLog: readonly LogEntry[],
): ResolutionDispatch {
  const { feature, actorParticipantId, targets, partOf, operatorId } = intent.payload;
  const resolved = resolveCommonActionCost(feature, intent.payload.actionCost);
  const actorCap = actorPerRoundCap(feature);
  const alternative =
    intent.payload.alternative === null
      ? null
      : (feature.alternatives.find((item) => item.key === intent.payload.alternative) ?? null);
  return {
    binding: bindingOf(feature),
    resolution: feature.resolution,
    inputs: {
      actorParticipantId,
      targets,
      ...(partOf === undefined ? {} : { partOf }),
      ...(operatorId === undefined ? {} : { operatorId }),
      testRolls: intent.payload.testRolls,
      objectTargets: intent.payload.objectTargets,
      knockOut: intent.payload.knockOut,
      recoverySpends: intent.payload.recoverySpends,
    },
    economy: {
      cost: resolved.cost,
      actionCostResidue: null,
      // A prose feature has no header cell; there is no raw value to
      // normalize and none is invented.
      actionType: null,
      operatorPays: false,
      usesPerRound: actorCap?.uses ?? null,
      abilityKey: feature.featureArtifactId,
      // A `partOf` dispatch of a common action is a later SEGMENT of the
      // same printed action ("They can break up this movement with their
      // maneuver and main action however they wish"), not a second use:
      // it consumes the parent's debit AND shares its use counter, or a
      // legal broken-up Ride fires a spurious "once per round" violation
      // on its second segment.
      sharesAbilityUse: partOf !== undefined,
      debitSuppressed: feature.debitContract === 'companion',
    },
    // The printed trigger word is "ability"; Advance, Catch Breath and
    // Stand Up are not abilities. Firing `ability-used` for them would
    // un-hide a creature for taking Catch Breath. The common-action
    // occurrence arm is its own ruled unit of work [S17 + W0-c].
    emitsNonrollingClaim: false,
    preludeLog,
    receiptExtras: {
      commonAction: {
        group: feature.group,
        actionCost: resolved.cost,
        actionCostSource: resolved.source,
        actionCostGroupDefault: resolved.groupDefault,
        debitContract: feature.debitContract,
        ...(feature.debitContract === 'companion'
          ? { companionArtifactIds: feature.companionArtifactIds }
          : {}),
        ...(alternative === null ? {} : { alternative }),
      },
    },
  };
}

/**
 * Entries the arm emits before the debit: who pays, which printed
 * alternative was taken, and any recorded terrain the Director should see
 * at the moment a moving action is adjudicated.
 */
function preludeEntries(
  state: EncounterState,
  intent: UseCommonActionIntent,
  context: LifecycleContext,
): LogEntry[] {
  const { feature } = intent.payload;
  const log: LogEntry[] = [];
  const refs = [...new Set([feature.featureArtifactId, ...feature.canonRefs])];

  if (feature.debitContract === 'companion') {
    // Free Strike, Grab, Escape Grab and Knockback: the printed cost is on
    // the compiled companion ability's header cell, and the companion
    // dispatch pays it. Debiting here too would charge the actor twice for
    // one printed cost — so this arm is behaviourally empty by contract,
    // and says so on the record rather than skipping in silence.
    log.push(
      entry(
        context,
        'table-directive',
        `${feature.featureArtifactId} takes no debit here — its printed cost is carried by the companion ability it hands off to (${feature.companionArtifactIds.join(', ')}), dispatched separately`,
        [...refs, ...feature.companionArtifactIds, COMMON_ACTION_CANON.turn],
        {
          commonActionCompanionPays: {
            featureArtifactId: feature.featureArtifactId,
            companionArtifactIds: feature.companionArtifactIds,
          },
        },
      ),
    );
  }

  const alternative = feature.alternatives.find((item) => item.key === intent.payload.alternative);
  if (alternative !== undefined) {
    log.push(
      entry(context, 'table-directive', alternative.sourceText, refs, {
        commonActionAlternative: {
          featureArtifactId: feature.featureArtifactId,
          key: alternative.key,
          sourceText: alternative.sourceText,
        },
      }),
    );
  }

  // "they move a number of squares up to their speed" — the engine models
  // no geometry [DEC-0011], so recorded terrain is SURFACED, never
  // evaluated: `TerrainFactSchema.areaText` is free prose with no
  // coordinates, and whether the path crossed one is the Director's call
  // [R-0022].
  if (feature.movesActor && state.terrainFacts.length > 0) {
    log.push(
      entry(
        context,
        'table-directive',
        `${intent.payload.actorParticipantId} moves — ${state.terrainFacts.length} recorded terrain fact(s) are in play; whether the path crosses one is table-adjudicated`,
        refs,
        { recordedTerrainAtMovement: state.terrainFacts },
      ),
    );
  }
  return log;
}

/**
 * Debits a printed cap that binds a NAMED TARGET rather than the actor
 * (Ride's mount-side sentence). Routed through the same one debit home
 * with `no-action`: it consumes no budget and carries no prevention
 * couplings, so it can never produce a spurious off-turn warning on a
 * creature whose turn it isn't — while the per-ability counter, its
 * verbatim "once per round" warning and the start-of-round reset all come
 * out of that one call.
 */
function debitTargetCaps(
  state: EncounterState,
  intent: UseCommonActionIntent,
  context: LifecycleContext,
): { state: EncounterState; log: LogEntry[] } {
  const { feature, targets, partOf } = intent.payload;
  const cap = targetPerRoundCap(feature);
  // A later segment of the same action must not re-tick the target's
  // counter any more than the actor's.
  if (cap === null || partOf !== undefined) return { state, log: [] };
  let nextState = state;
  const log: LogEntry[] = [];
  for (const targetId of targets) {
    const debited = debitActionCost(
      nextState,
      {
        cost: 'no-action',
        payerId: targetId,
        abilityKey: targetCapAbilityKey(feature.featureArtifactId),
        usesPerRound: cap.uses,
        partOf: null,
        sharesAbilityUse: false,
      },
      context,
    );
    nextState = debited.state;
    log.push(...debited.log);
  }
  return { state: nextState, log };
}

export function executeUseCommonAction(
  state: EncounterState,
  intent: UseCommonActionIntent,
  random: RandomSource,
): { state: EncounterState; log: LogEntry[] } {
  const context: LifecycleContext = { intentId: intent.intentId, actor: intent.actor };
  const prelude = preludeEntries(state, intent, context);
  const dispatch = commonActionDispatch(intent, prelude);

  // Structural refusals run first and identically to every other
  // resolution dispatch — no mutation may precede one.
  const refusal = resolutionRefusal(state, dispatch, context);
  if (refusal !== null) return { state, log: [refusal] };

  const resolved = executeResolutionDispatch(state, dispatch, context, random);
  const targetCaps = debitTargetCaps(resolved.state, intent, context);
  return { state: targetCaps.state, log: [...resolved.log, ...targetCaps.log] };
}
