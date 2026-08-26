import { type LifecycleContext, endEncounterSweep, endOfTurnSweep } from './condition-lifecycle.js';
import { withParticipant } from './damage.js';
import { TERRAIN_CANON } from './effect-execution.js';
import { endEncounterGrantSweep, endOfTurnGrantSweep } from './grant-lifecycle.js';
import { HEALTH_CANON, isDying, isHealthSourcedInstance } from './health.js';
import type { EncounterState, LogEntry } from './schemas.js';

/**
 * Boundary-sweep registry — per state slot, one config entry declaring what
 * happens to that slot when a runtime boundary passes. Intent handlers call
 * `runBoundarySweeps` once per boundary instead of hand-appending sequential
 * sweep calls; a new swept slot (schema v6's resolution stack, generalized
 * grants) adds a registry entry, and a new boundary kind (start-of-round)
 * adds a `BoundaryByKind` member — not new handler plumbing.
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
}

/** End of the encounter (the `end-encounter` intent). */
export interface EndOfEncounterBoundary {
  kind: 'end-of-encounter';
  /** Player-asserted condition instances kept past the encounter. */
  keepInstanceIds: readonly string[];
}

interface BoundaryByKind {
  'end-of-turn': EndOfTurnBoundary;
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

/**
 * DECLARATION ORDER IS SWEEP ORDER — sweep order is observable in the log
 * entries each boundary emits, so entries run top-to-bottom. Today:
 * - end-of-turn:      conditions → grants
 * - end-of-encounter: conditions → grants → temporary Stamina → terrain facts
 */
const BOUNDARY_SWEEP_REGISTRY: readonly SlotSweeps[] = [
  {
    slot: 'conditions',
    'end-of-turn': (state, boundary, context) => {
      const target = state.participants[boundary.participantId];
      if (!target) return { state, log: [] };
      return endOfTurnSweep(state, target, boundary.rolls, boundary.rollSavingThrow, context);
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
    // [R-0016]; the same sweep is the current-turn clause.
    'end-of-turn': (state, boundary, context) => {
      const target = state.participants[boundary.participantId];
      if (!target) return { state, log: [] };
      return endOfTurnGrantSweep(state, target, context);
    },
    // Every remaining next-roll grant clears with the encounter [R-0012];
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
          log.push({
            kind: 'mutation',
            intentId: context.intentId,
            actor: context.actor,
            canonRefs: [HEALTH_CANON.temporaryStamina],
            message: `temporary Stamina on ${participant.id} disappears with the encounter`,
            data: {
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
          });
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
          {
            kind: 'mutation',
            intentId: context.intentId,
            actor: context.actor,
            canonRefs: [TERRAIN_CANON.difficultTerrain],
            message: `${state.terrainFacts.length} recorded terrain fact(s) end with the encounter`,
            data: { terrainFactsCleared: state.terrainFacts.map((fact) => fact.factId) },
          },
        ],
      };
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
  for (const entry of BOUNDARY_SWEEP_REGISTRY) {
    const swept =
      boundary.kind === 'end-of-turn'
        ? entry['end-of-turn']?.(nextState, boundary, context)
        : entry['end-of-encounter']?.(nextState, boundary, context);
    if (swept === undefined) continue;
    nextState = swept.state;
    log.push(...swept.log);
  }
  return { state: nextState, log };
}
