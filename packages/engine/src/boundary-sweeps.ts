import { type LifecycleContext, endEncounterSweep, endOfTurnSweep } from './condition-lifecycle.js';
import { withParticipant } from './damage.js';
import { TERRAIN_CANON } from './effect-execution.js';
import {
  endEncounterGrantSweep,
  endOfTurnGrantSweep,
  startOfRoundGrantSweep,
} from './grant-lifecycle.js';
import { HEALTH_CANON, isDying, isHealthSourcedInstance } from './health.js';
import { openResolutions } from './resolution.js';
import type { EncounterState, LogEntry } from './schemas.js';

/**
 * Boundary-sweep registry — per state slot, one config entry declaring what
 * happens to that slot when a runtime boundary passes. Intent handlers call
 * `runBoundarySweeps` once per boundary instead of hand-appending sequential
 * sweep calls; a new swept slot (schema v6's budgets, counters, villain
 * economy, resolution stack) adds a registry entry, and a new boundary kind
 * (v6's start-of-turn / start-of-round) adds a `BoundaryByKind` member —
 * not new handler plumbing.
 */

/** End of one participant's turn (the `end-turn` intent). */
export interface EndOfTurnBoundary {
  kind: 'end-of-turn';
  /** The participant whose turn is ending. */
  participantId: string;
  /** Asserted saving-throw rolls by instance id (manual entry wins). */
  rolls: Readonly<Record<string, number>>;
  /** Injected roll for save-ends instances without an asserted roll. */
  rollSavingThrow: () => number;
  /** Condition instances imposed by this same dispatch's force-committed
   * resolutions: saving throws run AFTER the forced commit, so a
   * just-imposed save-ends condition saves next turn, not this one
   * [design §3, red-team F8]. */
  skipInstanceIds?: ReadonlySet<string>;
}

/** Start of one turn (the `start-turn` intent): the acting entity's own
 * per-turn slots reset — a two-turn solo gets a fresh printed budget on
 * each of its turns [rule.combat/turn; design §3]. */
export interface StartOfTurnBoundary {
  kind: 'start-of-turn';
  /** The acting participant(s): the starter, squad members for a squad
   * turn [R-0033], and declared sub-actors of the starter. */
  participantIds: readonly string[];
}

/** Start of a new round (the `advance-round` intent) [design §3]. */
export interface StartOfRoundBoundary {
  kind: 'start-of-round';
}

/** End of the encounter (the `end-encounter` intent). */
export interface EndOfEncounterBoundary {
  kind: 'end-of-encounter';
  /** Player-asserted condition instances kept past the encounter. */
  keepInstanceIds: readonly string[];
}

interface BoundaryByKind {
  'end-of-turn': EndOfTurnBoundary;
  'start-of-turn': StartOfTurnBoundary;
  'start-of-round': StartOfRoundBoundary;
  'end-of-encounter': EndOfEncounterBoundary;
}

export type BoundaryKind = keyof BoundaryByKind;
export type Boundary = BoundaryByKind[BoundaryKind];

export interface SweepResult {
  state: EncounterState;
  log: LogEntry[];
}

/**
 * One registry row: the state slot it owns, plus an optional sweep per
 * boundary kind. A slot with no entry for a boundary is untouched there.
 */
type SlotSweeps = {
  /** The state slot this entry owns (documentation, not dispatch). */
  readonly slot: string;
} & {
  readonly [K in BoundaryKind]?: (
    state: EncounterState,
    boundary: BoundaryByKind[K],
    context: LifecycleContext,
  ) => SweepResult;
};

function mutation(
  context: LifecycleContext,
  message: string,
  canonRefs: string[],
  data: Record<string, unknown>,
): LogEntry {
  return {
    kind: 'mutation',
    intentId: context.intentId,
    actor: context.actor,
    canonRefs,
    message,
    data,
  };
}

const ECONOMY_TURN = 'mcdm.heroes.v1/rule.combat/turn';
const ECONOMY_ROUND = 'mcdm.heroes.v1/rule.combat/combat-round';
const ECONOMY_TRIGGERED = 'mcdm.heroes.v1/rule.combat/triggered-action';
const ECONOMY_VILLAIN = 'mcdm.monsters.v1/rule.monster/villain-action';
const POWER_ROLL = 'mcdm.heroes.v1/rule.dice/power-roll';

/** Reset the per-turn action budget for a set of participants, with
 * machine-readable claims. */
function resetBudgets(
  state: EncounterState,
  participantIds: readonly string[],
  context: LifecycleContext,
  reason: string,
): SweepResult {
  let nextState = state;
  const deltas: Array<Record<string, unknown>> = [];
  for (const participantId of participantIds) {
    const participant = nextState.participants[participantId];
    if (!participant) continue;
    const cells = Object.entries(participant.actionBudget).filter(
      ([, cell]) => cell !== undefined && (cell.used > 0 || cell.granted > 0),
    );
    if (cells.length === 0) continue;
    for (const [cost, cell] of cells) {
      if (!cell) continue;
      deltas.push({
        participantId,
        cost,
        usedFrom: cell.used,
        usedTo: 0,
        grantedFrom: cell.granted,
        grantedTo: 0,
      });
    }
    nextState = withParticipant(nextState, { ...participant, actionBudget: {} });
  }
  if (deltas.length === 0) return { state: nextState, log: [] };
  return {
    state: nextState,
    log: [
      mutation(context, `action budgets reset (${reason})`, [ECONOMY_TURN], {
        actionBudgetDeltas: deltas,
      }),
    ],
  };
}

/** Reset one counter field of every participant's abilityUses. */
function resetAbilityUseWindow(
  state: EncounterState,
  participantIds: readonly string[],
  window: 'round' | 'turn',
  context: LifecycleContext,
  reason: string,
): SweepResult {
  let nextState = state;
  const deltas: Array<Record<string, unknown>> = [];
  for (const participantId of participantIds) {
    const participant = nextState.participants[participantId];
    if (!participant) continue;
    const touched = Object.entries(participant.abilityUses).filter(
      ([, counters]) => counters !== undefined && counters[window] > 0,
    );
    if (touched.length === 0) continue;
    const nextUses = { ...participant.abilityUses };
    for (const [abilityKey, counters] of touched) {
      if (!counters) continue;
      const to = { ...counters, [window]: 0 };
      deltas.push({ participantId, abilityKey, from: counters, to });
      nextUses[abilityKey] = to;
    }
    nextState = withParticipant(nextState, { ...participant, abilityUses: nextUses });
  }
  if (deltas.length === 0) return { state: nextState, log: [] };
  return {
    state: nextState,
    log: [
      mutation(context, `per-ability ${window} counters reset (${reason})`, [], {
        abilityUseDeltas: deltas,
      }),
    ],
  };
}

/**
 * DECLARATION ORDER IS SWEEP ORDER — sweep order is observable in the log
 * entries each boundary emits, so entries run top-to-bottom. Today:
 * - end-of-turn:      conditions → grants → abilityUses
 * - start-of-turn:    actionBudget → abilityUses
 * - start-of-round:   turnState → actionBudget → triggeredThisRound →
 *                     abilityUses → villainActions → grants
 * - end-of-encounter: conditions → grants → temporary Stamina → terrain
 *                     facts → turnState → actionBudget → triggered →
 *                     abilityUses → villainActions → resolutionStack
 */
const BOUNDARY_SWEEP_REGISTRY: readonly SlotSweeps[] = [
  {
    slot: 'conditions',
    'end-of-turn': (state, boundary, context) => {
      const target = state.participants[boundary.participantId];
      if (!target) return { state, log: [] };
      return endOfTurnSweep(
        state,
        target,
        boundary.rolls,
        boundary.rollSavingThrow,
        context,
        boundary.skipInstanceIds,
      );
    },
    'end-of-encounter': (state, boundary, context) =>
      endEncounterSweep(
        state,
        boundary.keepInstanceIds,
        context,
        // classes#ending-effects health exemption: the knock-out unconscious
        // and the dying-mandated bleeding (while its stamina precondition
        // holds) persist past the encounter.
        (participant, instance) =>
          isHealthSourcedInstance(instance) &&
          (instance.source.effectArtifactId !== HEALTH_CANON.dying ||
            (participant.stamina !== null && isDying(participant.stamina.current))),
      ),
  },
  {
    slot: 'grants',
    // Windowed next-roll grants expire at the holder's end-turn event
    // [R-0016]; the same sweep is the current-turn clause. Per-kind expiry
    // lives in the grant registry (grant-lifecycle.ts), not here.
    'end-of-turn': (state, boundary, context) => {
      const target = state.participants[boundary.participantId];
      if (!target) return { state, log: [] };
      return endOfTurnGrantSweep(state, target, context);
    },
    'start-of-round': (state, _boundary, context) => startOfRoundGrantSweep(state, context),
    // Every remaining grant clears with the encounter [R-0012];
    // out-of-encounter retention stays Director/table state.
    'end-of-encounter': (state, _boundary, context) => endEncounterGrantSweep(state, context),
  },
  {
    slot: 'temporary Stamina',
    // Temporary Stamina disappears at the end of an encounter
    // [rule.health/temporary-stamina].
    'end-of-encounter': (state, _boundary, context) => {
      let nextState = state;
      const log: LogEntry[] = [];
      for (const participant of Object.values(state.participants)) {
        if (participant.stamina !== null && participant.stamina.temporary > 0) {
          nextState = withParticipant(nextState, {
            ...participant,
            stamina: { ...participant.stamina, temporary: 0 },
          });
          log.push(
            mutation(
              context,
              `temporary Stamina on ${participant.id} disappears with the encounter`,
              [HEALTH_CANON.temporaryStamina],
              {
                staminaDeltas: [
                  {
                    participantId: participant.id,
                    from: participant.stamina.current,
                    to: participant.stamina.current,
                    temporaryFrom: participant.stamina.temporary,
                    temporaryTo: 0,
                  },
                ],
              },
            ),
          );
        }
      }
      return { state: nextState, log };
    },
  },
  {
    slot: 'terrainFacts',
    // Terrain facts do not survive the encounter [R-0022].
    'end-of-encounter': (state, _boundary, context) => {
      if (state.terrainFacts.length === 0) return { state, log: [] };
      return {
        state: { ...state, terrainFacts: [] },
        log: [
          mutation(
            context,
            `${state.terrainFacts.length} recorded terrain fact(s) end with the encounter`,
            [TERRAIN_CANON.difficultTerrain],
            { terrainFactsCleared: state.terrainFacts.map((fact) => fact.factId) },
          ),
        ],
      };
    },
  },
  {
    slot: 'turnState',
    // Round advance [design §3]: the new round opens with no active turn,
    // choice back with the first side ("The side whose members acted first
    // during the initial combat round goes first in all subsequent
    // rounds."), and a fresh turnsTaken count map. `lastTurnId` survives
    // the boundary — the printed no-consecutive-turns constraint spans
    // rounds (last turn of round N into first of round N+1).
    'start-of-round': (state, _boundary, context) => {
      const turnState = state.turnState;
      if (turnState === null) return { state, log: [] };
      const next = {
        ...turnState,
        round: turnState.round + 1,
        sideToChoose: turnState.firstSide,
        activeTurnId: null,
        turnsTaken: {},
      };
      return {
        state: { ...state, turnState: next },
        log: [
          mutation(
            context,
            `round ${turnState.round} ends; round ${next.round} begins — ${next.sideToChoose} choose first`,
            [ECONOMY_ROUND],
            {
              turnStateDeltas: [
                { field: 'round', from: turnState.round, to: next.round },
                { field: 'sideToChoose', from: turnState.sideToChoose, to: next.sideToChoose },
                ...(turnState.activeTurnId !== null
                  ? [{ field: 'activeTurnId', from: turnState.activeTurnId, to: null }]
                  : []),
              ],
              turnsTakenDeltas: Object.entries(turnState.turnsTaken)
                .filter(([, count]) => count > 0)
                .map(([turnId, count]) => ({ turnId, from: count, to: 0 })),
            },
          ),
        ],
      };
    },
    'end-of-encounter': (state, _boundary, context) => {
      if (state.turnState === null) return { state, log: [] };
      return {
        state: { ...state, turnState: null },
        log: [
          mutation(context, 'combat ends — the turn structure stands down', [ECONOMY_ROUND], {
            turnStateCleared: true,
          }),
        ],
      };
    },
  },
  {
    slot: 'actionBudget',
    'start-of-turn': (state, boundary, context) =>
      resetBudgets(state, boundary.participantIds, context, 'a fresh turn begins'),
    'start-of-round': (state, _boundary, context) =>
      resetBudgets(state, Object.keys(state.participants), context, 'a new round begins'),
    'end-of-encounter': (state, _boundary, context) =>
      resetBudgets(state, Object.keys(state.participants), context, 'the encounter ends'),
  },
  {
    slot: 'triggeredThisRound',
    // "You can use one triggered action per round" — the counter is
    // per-round by definition [rule.combat/triggered-action].
    'start-of-round': (state, _boundary, context) => {
      let nextState = state;
      const deltas: Array<Record<string, unknown>> = [];
      for (const participant of Object.values(state.participants)) {
        if (participant.triggeredThisRound === 0) continue;
        deltas.push({ participantId: participant.id, from: participant.triggeredThisRound, to: 0 });
        nextState = withParticipant(nextState, { ...participant, triggeredThisRound: 0 });
      }
      if (deltas.length === 0) return { state: nextState, log: [] };
      return {
        state: nextState,
        log: [
          mutation(context, 'triggered-action counters reset with the round', [ECONOMY_TRIGGERED], {
            triggeredCountDeltas: deltas,
          }),
        ],
      };
    },
    'end-of-encounter': (state, _boundary, context) => {
      let nextState = state;
      const deltas: Array<Record<string, unknown>> = [];
      for (const participant of Object.values(state.participants)) {
        if (participant.triggeredThisRound === 0) continue;
        deltas.push({ participantId: participant.id, from: participant.triggeredThisRound, to: 0 });
        nextState = withParticipant(nextState, { ...participant, triggeredThisRound: 0 });
      }
      if (deltas.length === 0) return { state: nextState, log: [] };
      return {
        state: nextState,
        log: [
          mutation(
            context,
            'triggered-action counters clear with the encounter',
            [ECONOMY_TRIGGERED],
            {
              triggeredCountDeltas: deltas,
            },
          ),
        ],
      };
    },
  },
  {
    slot: 'abilityUses',
    'end-of-turn': (state, boundary, context) =>
      resetAbilityUseWindow(state, [boundary.participantId], 'turn', context, 'the turn ends'),
    'start-of-turn': (state, boundary, context) =>
      resetAbilityUseWindow(state, boundary.participantIds, 'turn', context, 'a fresh turn begins'),
    'start-of-round': (state, _boundary, context) =>
      resetAbilityUseWindow(
        state,
        Object.keys(state.participants),
        'round',
        context,
        'a new round begins',
      ),
    'end-of-encounter': (state, _boundary, context) => {
      let nextState = state;
      const deltas: Array<Record<string, unknown>> = [];
      for (const participant of Object.values(state.participants)) {
        const touched = Object.entries(participant.abilityUses).filter(
          ([, counters]) =>
            counters !== undefined &&
            (counters.round > 0 || counters.turn > 0 || counters.encounter > 0),
        );
        if (touched.length === 0) continue;
        for (const [abilityKey, counters] of touched) {
          if (!counters) continue;
          deltas.push({
            participantId: participant.id,
            abilityKey,
            from: counters,
            to: { round: 0, turn: 0, encounter: 0 },
          });
        }
        nextState = withParticipant(nextState, { ...participant, abilityUses: {} });
      }
      if (deltas.length === 0) return { state: nextState, log: [] };
      return {
        state: nextState,
        log: [
          mutation(context, 'per-ability counters clear with the encounter', [], {
            abilityUseDeltas: deltas,
          }),
        ],
      };
    },
  },
  {
    slot: 'villainActions',
    // "no more than one villain action can be used per round" — the
    // per-round flag resets; per-encounter spends persist
    // [rule.monster/villain-action].
    'start-of-round': (state, _boundary, context) => {
      if (!state.villainActions.usedThisRound) return { state, log: [] };
      return {
        state: { ...state, villainActions: { ...state.villainActions, usedThisRound: false } },
        log: [
          mutation(context, 'the villain-action-per-round window reopens', [ECONOMY_VILLAIN], {
            villainEconomyDeltas: [{ usedThisRoundFrom: true, usedThisRoundTo: false }],
          }),
        ],
      };
    },
    'end-of-encounter': (state, _boundary, context) => {
      const villain = state.villainActions;
      if (!villain.usedThisRound && villain.usedByAbility.length === 0) return { state, log: [] };
      return {
        state: { ...state, villainActions: { usedThisRound: false, usedByAbility: [] } },
        log: [
          mutation(
            context,
            'the villain-action economy clears with the encounter',
            [ECONOMY_VILLAIN],
            {
              ...(villain.usedThisRound
                ? { villainEconomyDeltas: [{ usedThisRoundFrom: true, usedThisRoundTo: false }] }
                : {}),
              villainAbilitiesCleared: villain.usedByAbility,
            },
          ),
        ],
      };
    },
  },
  {
    slot: 'resolutionStack',
    // Entries resolved by encounter end is the norm; a boundary-crossing
    // OPEN entry WARNS (printed-legal: Breaking Point) and clears with the
    // stack — never silent, never corruption [R-0032].
    'end-of-encounter': (state, _boundary, context) => {
      if (state.resolutionStack.length === 0) return { state, log: [] };
      const open = openResolutions(state);
      const log: LogEntry[] = [];
      if (open.length > 0) {
        log.push({
          kind: 'warning',
          intentId: context.intentId,
          actor: context.actor,
          canonRefs: [POWER_ROLL],
          message: `${open.length} rolled resolution(s) never committed before the encounter ended (${open.map((candidate) => candidate.resolutionId).join(', ')}) — their printed outcomes are table-adjudicated`,
          data: { uncommittedResolutions: open.map((candidate) => candidate.resolutionId) },
        });
      }
      log.push(
        mutation(context, 'the resolution stack clears with the encounter', [POWER_ROLL], {
          resolutionsCleared: state.resolutionStack.map((candidate) => candidate.resolutionId),
        }),
      );
      return { state: { ...state, resolutionStack: [] }, log };
    },
  },
];

/**
 * Run every registered sweep for one boundary, in registry declaration
 * order, chaining state and concatenating logs. The per-kind branch below
 * only narrows the discriminated union for the call — a new boundary kind
 * adds one branch here and a column in the registry, nothing else.
 */
export function runBoundarySweeps(
  state: EncounterState,
  boundary: Boundary,
  context: LifecycleContext,
): SweepResult {
  let nextState = state;
  const log: LogEntry[] = [];
  for (const registryEntry of BOUNDARY_SWEEP_REGISTRY) {
    const swept =
      boundary.kind === 'end-of-turn'
        ? registryEntry['end-of-turn']?.(nextState, boundary, context)
        : boundary.kind === 'start-of-turn'
          ? registryEntry['start-of-turn']?.(nextState, boundary, context)
          : boundary.kind === 'start-of-round'
            ? registryEntry['start-of-round']?.(nextState, boundary, context)
            : registryEntry['end-of-encounter']?.(nextState, boundary, context);
    if (swept === undefined) continue;
    nextState = swept.state;
    log.push(...swept.log);
  }
  return { state: nextState, log };
}
