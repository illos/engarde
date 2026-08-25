import { type ApplyResult, type EngineContext, applyIntent } from './apply-intent.js';
import { type InvariantViolation, checkInvariants } from './invariants.js';
import type { EncounterState, Intent, LogEntry, ParticipantStats } from './schemas.js';

/**
 * Driver harness v0 (engine-plan 4.1, pilot thin form): the programmatic
 * first-class interface — create an encounter, dispatch intents, read state,
 * read log. The CLI, MCP, and Convex hosts are thin skins over this; tests
 * and scripted encounters use it directly.
 *
 * Every dispatch runs the invariant suite as an oracle and the transcript
 * records intent, log, and violations per step — the reviewable artifact
 * that pilot step 8 reads against canon.
 */

export interface TranscriptStep {
  step: number;
  intent: Intent;
  log: LogEntry[];
  violations: InvariantViolation[];
}

export interface Transcript {
  schemaVersion: 1;
  schema: 'engarde-encounter-transcript-v1';
  participants: Array<{ id: string; sourceRecordId: string | null }>;
  steps: TranscriptStep[];
  finalState: EncounterState;
  violationCount: number;
}

export interface Driver {
  dispatch(intent: Intent): ApplyResult & { violations: InvariantViolation[] };
  state(): EncounterState;
  log(): LogEntry[];
  transcript(): Transcript;
}

export interface DriverParticipant {
  id: string;
  /** The real corpus record this actor embodies (prime directive: actors
   * are corpus records, never invented stat blocks). */
  sourceRecordId?: string;
  /** Heroes vs Director-controlled creatures split on death rules — explicit
   * at seed time, no default (design SE-6). */
  kind: 'hero' | 'director-creature';
  /** Stat-block-sourced or Director-asserted stats; omitted = table-mode
   * actor (no stat automation, receipts only). */
  stats?: ParticipantStats;
}

/** The one home for initial encounter state — every host (driver, CLI,
 * Convex) starts an encounter through this, never by hand-building state.
 * Stamina starts at its maximum [rule.health/stamina]. */
export function initialEncounterState(participants: readonly DriverParticipant[]): EncounterState {
  if (participants.length === 0) throw new Error('an encounter needs participants');
  const seen = new Set<string>();
  for (const participant of participants) {
    if (seen.has(participant.id)) throw new Error(`duplicate participant id ${participant.id}`);
    seen.add(participant.id);
  }
  return {
    schemaVersion: 4,
    participants: Object.fromEntries(
      participants.map((participant) => [
        participant.id,
        {
          id: participant.id,
          conditions: [],
          sourceRecordId: participant.sourceRecordId ?? null,
          kind: participant.kind,
          stats: participant.stats ?? null,
          stamina: participant.stats
            ? {
                current: participant.stats.staminaMax,
                temporary: 0,
                // Seeds full, mirroring the Stamina-at-maximum convention;
                // hosts asserting mid-day attrition adjust post-seed.
                recoveries: participant.stats.recoveriesMax ?? null,
              }
            : null,
          grants: [],
        },
      ]),
    ),
    terrainFacts: [],
  };
}

export function createDriver(
  participants: readonly DriverParticipant[],
  context: EngineContext,
): Driver {
  let state: EncounterState = initialEncounterState(participants);
  const fullLog: LogEntry[] = [];
  const steps: TranscriptStep[] = [];

  return {
    dispatch(intent: Intent) {
      const result = applyIntent(state, intent, context);
      const violations = checkInvariants(state, intent, result);
      if (violations.length === 0) {
        state = result.state;
        fullLog.push(...result.log);
      }
      steps.push({ step: steps.length + 1, intent, log: result.log, violations });
      return { ...result, state, violations };
    },
    state: () => state,
    log: () => [...fullLog],
    transcript: () => ({
      schemaVersion: 1,
      schema: 'engarde-encounter-transcript-v1',
      participants: participants.map((participant) => ({
        id: participant.id,
        sourceRecordId: participant.sourceRecordId ?? null,
      })),
      steps: [...steps],
      finalState: state,
      violationCount: steps.reduce((sum, step) => sum + step.violations.length, 0),
    }),
  };
}
