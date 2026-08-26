import type { Id } from '@engarde/backend/convex/_generated/dataModel';
import { makeFunctionReference } from 'convex/server';

// Pinned view contract for minion squad Stamina pools (R-0023..R-0028,
// docs/minion-pool-design.md §3 "Hosts"). The backend lane is building
// `getActive().squads` in exactly this shape plus the three Director
// mutations; until the generated api carries them, the web reads squads
// through `squadsOf` and dispatches through named function references —
// the same runtime wire `api.encounters.*` resolves to. When the backend
// lands, these references can be swapped for the generated ones with no
// behavior change (identical function names and argument shapes).

/** One squad as the Table view presents it. `withCaptain` is a verbatim
 * statblock string passed through the view, present only while a captain
 * is attached — the web renders it untouched and never composes it. */
export interface SquadView {
  squadId: string;
  name: string;
  poolCurrent: number;
  poolMax: number;
  perMinionStamina: number;
  livingMemberIds: string[];
  deadMemberIds: string[];
  pendingKills: number;
  captainId: string | null;
  withCaptain: string | null;
}

/** Read the squads slot off the active-encounter view. The generated
 * `getActive` return type predates the squads slot; this cast is the one
 * pinned-contract seam and disappears when the backend lane lands. */
export function squadsOf(view: object): SquadView[] {
  return (view as { squads?: SquadView[] }).squads ?? [];
}

export const resolvePendingKillsRef = makeFunctionReference<
  'mutation',
  { campaignId: Id<'campaigns'>; squadId: string; victimMemberIds: string[] }
>('encounters:resolvePendingKills');

export const attachCaptainRef = makeFunctionReference<
  'mutation',
  { campaignId: Id<'campaigns'>; squadId: string; captainId: string }
>('encounters:attachCaptain');

export const detachCaptainRef = makeFunctionReference<
  'mutation',
  { campaignId: Id<'campaigns'>; squadId: string }
>('encounters:detachCaptain');

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
