import type { api } from '@engarde/backend/convex/_generated/api';
import type { FunctionReturnType } from 'convex/server';

// Action economy + two-phase commit on the Table (R-0029..R-0033,
// docs/action-economy-design.md §3 "Hosts"). The generated api carries the
// v6 view slots (turnState / actionBudget / villainActions / resolutions /
// the split grant kinds) and the arc's mutations — components call
// `api.encounters.*` directly and every view type below DERIVES from the
// generated return type. No local seam, no casts (squad-contract precedent).

/** The active-encounter view exactly as the backend's validator types it. */
export type ActiveEncounterView = NonNullable<FunctionReturnType<typeof api.encounters.getActive>>;

export type ParticipantView = ActiveEncounterView['participants'][number];

/** Combat turn structure — null until begin-combat [design §3]. */
export type TurnStateView = NonNullable<ActiveEncounterView['turnState']>;

/** Encounter-level villain-action economy (once each per encounter, no
 * more than one per round even across creatures) [R-0030 warn-enforced]. */
export type VillainActionsView = ActiveEncounterView['villainActions'];

/** One OPEN resolution-stack entry [R-0032] — the open-roll card contract. */
export type ResolutionView = ActiveEncounterView['resolutions'][number];

export type ResolutionModificationView = ResolutionView['modifications'][number];

/** The engine's begin-combat receipt payload (LogEntry.data.beginCombat,
 * packages/engine apply-intent): the rolled/asserted d10 and the sides. The
 * rail renders the receipt's verbatim message — it never re-derives the
 * 1–5/6+ assignment client-side (one canon rule, one implementation). */
export interface BeginCombatLogData {
  firstSide: 'heroes' | 'director';
  surprisedSide: 'heroes' | 'director' | null;
  roll: number | null;
  rollAsserted: boolean;
}

/** The engine's advance-round unspent-turns warn data [R-0030]. */
export interface UnspentTurnsLogData {
  unspentTurns: string[];
}

/** Display shortener for artifact ids (`…/statblock/goblin-monarch#kill`
 * → `kill`); presentation only, never an address the app dispatches. */
export function shortAbilityName(artifactId: string): string {
  const afterSlash = artifactId.split('/').pop() ?? artifactId;
  return afterSlash.split('#').pop() ?? afterSlash;
}
