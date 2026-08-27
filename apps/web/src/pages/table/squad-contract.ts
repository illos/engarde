import type { api } from '@engarde/backend/convex/_generated/api';
import type { FunctionReturnType } from 'convex/server';

// Minion squad Stamina pools and one-roll actions on the Table (R-0023..R-0039,
// docs/minion-pool-design.md §3 "Hosts"). The generated api carries the
// squads slot and the three Director mutations (resolvePendingKills /
// attachCaptain / detachCaptain) — components call `api.encounters.*`
// directly and every view type below DERIVES from the generated return
// type. No local seam, no casts.

/** The active-encounter view exactly as the backend's validator types it. */
export type ActiveEncounterView = NonNullable<FunctionReturnType<typeof api.encounters.getActive>>;

/** One squad as the Table view presents it. `withCaptain` remains verbatim;
 * `withCaptainBenefit` is its closed-template tag for live modifier/directive
 * chips while attached. */
export type SquadView = ActiveEncounterView['squads'][number];

/** The engine's persisted squad-damage receipt (LogEntry.data.squadDamage,
 * packages/engine/src/damage.ts `applySquadDamage`). */
export interface SquadDamageLogData {
  squadId: string;
  area: boolean;
  damageType: string | null;
  contributions: Array<{ targetId: string; damage: number; counted: number }>;
  cappedSum: number;
  weaknessApplied: boolean;
  immunityApplied: boolean;
  /** The full damage, pre-floor — R-0024's receipt requirement. */
  fullPoolReduction: number;
  overflowDiscarded: number;
  kills: number;
}

/** Engine claim rows accompanying a squad-damage receipt. */
export interface SquadPoolDelta {
  squadId: string;
  from: number;
  to: number;
}
