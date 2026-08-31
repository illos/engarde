import { sideOfParticipant } from './action-economy.js';
import { type ApplyResult, type EngineContext, applyIntent } from './apply-intent.js';
import { isMinion } from './damage.js';
import { type InvariantViolation, checkInvariants } from './invariants.js';
import {
  type EncounterState,
  EncounterStateSchema,
  type Intent,
  type LogEntry,
  type ParticipantStats,
  type SquadState,
} from './schemas.js';

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
   * at seed time, no default (design SE-6). What the participant IS, never
   * which side it fights on — that is `side`. */
  kind: 'hero' | 'director-creature';
  /** Which side the participant fights on — independent of kind (v9,
   * ROAD-0005 seam 4). Omitted = the kind default (hero → 'heroes',
   * director-creature → 'director') via the one sideOfParticipant home.
   * Set explicitly to seed a hero-side statblock creature (the retainer /
   * Summoner-minion shape). */
  side?: 'heroes' | 'director';
  /** Stat-block-sourced or Director-asserted stats; omitted = table-mode
   * actor (no stat automation, receipts only). */
  stats?: ParticipantStats;
  /** Seeded trait data (v6, design §3): printed turn/trigger structure —
   * a two-turn solo's allowance + no-consecutive constraint, Ajax's
   * triggered-action limit, declared sub-actors. Asserted from the stat
   * block at seed time, never derived. */
  traits?: {
    turnAllowance?: number;
    noConsecutiveTurns?: boolean;
    triggeredActionLimit?: number;
    subActorOf?: string | null;
  };
}

/**
 * A squad to seed at encounter build (R-0023): same-statblock minion
 * members, pool = per-minion Stamina × member count (the printed formula).
 * Membership is asserted here — "The minions you buy can be arranged into
 * squads" [chapter/monster-basics §Minions Come in Groups of Four]. Seeding
 * is the automation boundary: a minion participant seeded into NO squad
 * keeps table-routed damage. Captains attach via the attach-captain intent,
 * never at seed.
 */
export interface DriverSquadSeed {
  squadId: string;
  /** Display label (e.g. "goblin spinecleavers"). */
  name: string;
  memberIds: readonly string[];
}

/**
 * Canon-incoherence gate for squad seeds (R-0023, the zipper class): throws
 * on a seed the pool formula cannot coherently represent. Statblock identity
 * is the members' shared `sourceRecordId` when any is present; asserted-stat
 * members (all sourceRecordId null) must at least share one per-minion
 * Stamina.
 */
function validateSquadSeeds(
  participants: readonly DriverParticipant[],
  squads: readonly DriverSquadSeed[],
): void {
  const byId = new Map(participants.map((participant) => [participant.id, participant]));
  const seenSquadIds = new Set<string>();
  const memberOwner = new Map<string, string>();
  for (const squad of squads) {
    if (seenSquadIds.has(squad.squadId)) throw new Error(`duplicate squad id ${squad.squadId}`);
    seenSquadIds.add(squad.squadId);
    if (squad.memberIds.length === 0) throw new Error(`squad ${squad.squadId} has no members`);
    const records = new Set<string | null>();
    const staminas = new Set<number>();
    const sides = new Set<'heroes' | 'director'>();
    for (const memberId of squad.memberIds) {
      const owner = memberOwner.get(memberId);
      if (owner !== undefined) {
        throw new Error(
          `participant ${memberId} cannot be in two squads (${owner}, ${squad.squadId})`,
        );
      }
      memberOwner.set(memberId, squad.squadId);
      const member = byId.get(memberId);
      if (!member) throw new Error(`squad ${squad.squadId} names unknown participant ${memberId}`);
      if (!member.stats) {
        throw new Error(
          `squad ${squad.squadId} member ${memberId} has no stats — a squad pool needs the stat block's per-minion Stamina [R-0023]`,
        );
      }
      if (!isMinion(member)) {
        throw new Error(
          `squad ${squad.squadId} member ${memberId} is not a Minion-organization creature — only minions form squads [rule.monster/squad, R-0023]`,
        );
      }
      records.add(member.sourceRecordId ?? null);
      staminas.add(member.stats.staminaMax);
      sides.add(sideOfParticipant(member));
    }
    // A squad occupies ONE turn slot [R-0033]; a mixed-side squad cannot be
    // represented coherently by side alternation — substrate-invariant
    // refusal (the zipper class), not a warn.
    if (sides.size > 1) {
      throw new Error(
        `squad ${squad.squadId} mixes sides — a squad acts together on one turn slot [R-0033], so its members must share one side`,
      );
    }
    // "Minions with the same name … can be organized into squads"
    // [rule.monster/squad]: a mixed-statblock squad is REFUSED — the printed
    // pool formula requires one per-minion Stamina [R-0023].
    if (records.size > 1 || staminas.size > 1) {
      throw new Error(
        `squad ${squad.squadId} mixes stat blocks — minions with the same name share one per-minion Stamina; a mixed squad is canon-incoherent [rule.monster/squad, R-0023]`,
      );
    }
  }
}

/**
 * Warn-and-apply notes for squad seeds (permissive default, R-0023): the
 * printed "up to eight creatures" bound [rule.monster/squad] is exceeded but
 * the pool arithmetic stays coherent, so the seed applies and the host
 * surfaces these. Pure over the same inputs as `initialEncounterState`.
 */
export function squadSeedWarnings(squads: readonly DriverSquadSeed[]): string[] {
  const warnings: string[] = [];
  for (const squad of squads) {
    if (squad.memberIds.length > 8) {
      warnings.push(
        `squad ${squad.squadId} seeds ${squad.memberIds.length} minions; the printed bound is "squads of up to eight creatures" [rule.monster/squad] — applied anyway (permissive engine)`,
      );
    }
  }
  return warnings;
}

/** The one home for initial encounter state — every host (driver, CLI,
 * Convex) starts an encounter through this, never by hand-building state.
 * Stamina starts at its maximum [rule.health/stamina]; a squad's pool
 * starts at the printed per-minion × member-count maximum and its members
 * carry `stamina: null` — the pool is the ONE home for squad vitality
 * [R-0023]. */
export function initialEncounterState(
  participants: readonly DriverParticipant[],
  squads: readonly DriverSquadSeed[] = [],
): EncounterState {
  if (participants.length === 0) throw new Error('an encounter needs participants');
  const seen = new Set<string>();
  for (const participant of participants) {
    if (seen.has(participant.id)) throw new Error(`duplicate participant id ${participant.id}`);
    seen.add(participant.id);
  }
  validateSquadSeeds(participants, squads);
  const squadMemberIds = new Set(squads.flatMap((squad) => [...squad.memberIds]));
  const seededSquads: SquadState[] = squads.map((squad) => {
    const first = participants.find((participant) => participant.id === squad.memberIds[0]);
    const perMinionStamina = first?.stats?.staminaMax;
    if (perMinionStamina === undefined) throw new Error(`squad ${squad.squadId} has no stats`);
    const max = perMinionStamina * squad.memberIds.length;
    return {
      squadId: squad.squadId,
      name: squad.name,
      perMinionStamina,
      pool: { current: max, max },
      memberIds: [...squad.memberIds],
      deadMemberIds: [],
      pendingKills: 0,
      captainId: null,
    };
  });
  // Parsed through the schema so every v7 slot lands at its documented
  // default (turnState null until begin-combat, empty budgets/counters,
  // empty occurrence ledger).
  return EncounterStateSchema.parse({
    schemaVersion: 9,
    participants: Object.fromEntries(
      participants.map((participant) => [
        participant.id,
        {
          id: participant.id,
          conditions: [],
          sourceRecordId: participant.sourceRecordId ?? null,
          kind: participant.kind,
          // Explicit side seeds through; omitted stays null = kind-derived
          // in the one sideOfParticipant home (v9 seam — not a behavior
          // change for pre-v9 callers).
          side: participant.side ?? null,
          stats: participant.stats ?? null,
          stamina:
            participant.stats && !squadMemberIds.has(participant.id)
              ? {
                  current: participant.stats.staminaMax,
                  temporary: 0,
                  // Seeds full, mirroring the Stamina-at-maximum convention;
                  // hosts asserting mid-day attrition adjust post-seed.
                  recoveries: participant.stats.recoveriesMax ?? null,
                }
              : null,
          grants: [],
          ...(participant.traits ? { traits: participant.traits } : {}),
        },
      ]),
    ),
    terrainFacts: [],
    squads: seededSquads,
  });
}

export function createDriver(
  participants: readonly DriverParticipant[],
  context: EngineContext,
  squads: readonly DriverSquadSeed[] = [],
): Driver {
  let state: EncounterState = initialEncounterState(participants, squads);
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
