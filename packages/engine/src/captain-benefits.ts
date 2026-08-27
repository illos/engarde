import type { LifecycleContext } from './condition-lifecycle.js';
import { squadMemberStats, withSquad } from './damage.js';
import type { EncounterState, LogEntry, SquadState } from './schemas.js';

export const CAPTAIN_BENEFIT_CANON = 'mcdm.monsters.v1/chapter/monster-basics#captain';

export interface CaptainBenefitShift {
  state: EncounterState;
  squad: SquadState;
  log: LogEntry[];
}

/** R-0039's one home for applying/removing a Stamina-type With-Captain
 * benefit. The effective divisor, max, current pool, and area cap move
 * together. Only living-at-shift members move current; the full seeded
 * roster moves max. */
export function shiftCaptainBenefit(
  state: EncounterState,
  squad: SquadState,
  direction: 'attach' | 'detach',
  context: LifecycleContext,
): CaptainBenefitShift {
  const benefit = squadMemberStats(state, squad)?.withCaptainBenefit ?? null;
  if (benefit?.kind !== 'stamina') return { state, squad, log: [] };

  const sign = direction === 'attach' ? 1 : -1;
  const deltaPer = sign * benefit.amount;
  const total = squad.memberIds.length + squad.deadMemberIds.length;
  const living = Math.max(0, squad.memberIds.length - squad.pendingKills);
  const perMinionStamina = squad.perMinionStamina + deltaPer;
  const max = squad.pool.max + deltaPer * total;
  const unclampedCurrent = squad.pool.current + deltaPer * living;
  const current = Math.max(0, Math.min(max, unclampedCurrent));
  const countedBefore = squad.deadMemberIds.length + squad.pendingKills;
  const countedAfter = Math.floor((max - current) / perMinionStamina);
  const newlyPending = Math.max(0, countedAfter - countedBefore);
  const pendingKills = squad.pendingKills + newlyPending;
  const nextSquad: SquadState = {
    ...squad,
    perMinionStamina,
    pool: { current, max },
    pendingKills,
  };
  const data: Record<string, unknown> = {
    captainBenefitApplication: {
      direction,
      sourceText: benefit.sourceText,
      amountPerMinion: benefit.amount,
      livingMembers: living,
      totalMembers: total,
      currentFloorDiscarded: Math.max(0, -unclampedCurrent),
    },
    squadPoolDeltas: [{ squadId: squad.squadId, from: squad.pool.current, to: current }],
    squadPoolMaxDeltas: [{ squadId: squad.squadId, from: squad.pool.max, to: max }],
    squadPerMinionDeltas: [
      { squadId: squad.squadId, from: squad.perMinionStamina, to: perMinionStamina },
    ],
  };
  if (newlyPending > 0) {
    data.pendingKillsDeltas = [
      { squadId: squad.squadId, from: squad.pendingKills, to: pendingKills },
    ];
    data.zeroStaminaTrigger = { pending: true, count: newlyPending, ruling: 'R-0039' };
  }
  const log: LogEntry[] = [
    {
      kind: 'mutation',
      intentId: context.intentId,
      actor: context.actor,
      canonRefs: [CAPTAIN_BENEFIT_CANON],
      message: `${squad.name}'s ${benefit.sourceText} benefit ${direction === 'attach' ? 'begins' : 'ends'}: effective per-minion Stamina ${squad.perMinionStamina} → ${perMinionStamina}, pool ${squad.pool.current}/${squad.pool.max} → ${current}/${max}${newlyPending > 0 ? `; ${newlyPending} newly counted kill(s) await victim identity` : ''}`,
      data,
    },
  ];
  return { state: withSquad(state, nextSquad), squad: nextSquad, log };
}
