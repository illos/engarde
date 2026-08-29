import {
  bindDamageCharacteristic,
  bindRollValue,
  resolveAbilityRoll,
} from './ability-execution.js';
import { debitActionCost, grantCriticalHitAction } from './action-economy.js';
import { type LifecycleContext, applyConditionInstance } from './condition-lifecycle.js';
import {
  type PendingSquadContribution,
  applyDamage,
  collectSquadContribution,
  damageAutomationBlocker,
  flushSquadContributions,
  squadMemberStats,
  withParticipant,
} from './damage.js';
import type { RandomSource } from './determinism.js';
import { hashDeclaration, hashPayload } from './payload-hash.js';
import { gatePotencyWithReceipt } from './potency.js';
import { POWER_ROLL_CANON, type Tier } from './power-roll.js';
import type {
  DamageType,
  EncounterState,
  LogEntry,
  ParsedIntent,
  ResolutionEntry,
  SquadAbilityData,
  SquadParticipation,
  SquadSignatureAttackPayload,
} from './schemas.js';
import { resolutionOpenedClaim } from './schemas.js';

const SQUAD_CANON = {
  action: 'mcdm.monsters.v1/chapter/monster-basics#squad-action',
  maneuvers: 'mcdm.monsters.v1/chapter/monster-basics#minion-maneuvers',
  freeStrike: 'mcdm.monsters.v1/chapter/monster-basics#free-strike-together',
  captain: 'mcdm.monsters.v1/rule.monster/captain',
} as const;

type SquadSignatureIntent = Extract<ParsedIntent, { kind: 'squad-signature-attack' }>;
type SquadFreeStrikeIntent = Extract<ParsedIntent, { kind: 'squad-free-strike' }>;
type SquadManeuverIntent = Extract<ParsedIntent, { kind: 'squad-maneuver' }>;

interface ExecutionResult {
  state: EncounterState;
  log: LogEntry[];
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

function refuse(
  state: EncounterState,
  context: LifecycleContext,
  message: string,
): ExecutionResult {
  return { state, log: [entry(context, 'refusal', message, [], {})] };
}

export interface SummationContribution {
  memberId: string;
  value: number;
  count?: number;
}

/** The ONE summation home shared by signature helper values and Free Strike
 * Together. Rows stay visible so receipts can reproduce the total. */
export function sumSquadContributions(rows: readonly SummationContribution[]): {
  contributions: Array<{ memberId: string; value: number; count: number; subtotal: number }>;
  total: number;
} {
  const contributions = rows.map((row) => {
    const count = row.count ?? 1;
    return { memberId: row.memberId, value: row.value, count, subtotal: row.value * count };
  });
  return {
    contributions,
    total: contributions.reduce((sum, row) => sum + row.subtotal, 0),
  };
}

function captainBenefit(state: EncounterState, squadId: string) {
  const squad = state.squads.find((candidate) => candidate.squadId === squadId);
  if (!squad || squad.captainId === null) return null;
  return squadMemberStats(state, squad)?.withCaptainBenefit ?? null;
}

function uniqueParticipatingMembers(participation: readonly SquadParticipation[]): string[] {
  return [...new Set(participation.flatMap((row) => row.memberIds))];
}

export type SquadBreakdown = NonNullable<ResolutionEntry['squadBreakdown']>;

/** Pure roll-time packet + stacking breakdown [R-0034]. */
export function buildSquadBreakdown(
  state: EncounterState,
  payload: Pick<
    SquadSignatureAttackPayload,
    'squadId' | 'ability' | 'participation' | 'damageTypeChoice'
  >,
  tierFor: (targetId: string) => Tier,
  allowStacking: boolean,
): SquadBreakdown {
  const benefit = captainBenefit(state, payload.squadId);
  const strikeDamageBonus = benefit?.kind === 'strike-damage' ? benefit.amount : 0;
  return payload.participation.map((row) => {
    const tier = tierFor(row.targetId);
    const packet = payload.ability.tiers[`tier${tier}`];
    let stacking: SquadBreakdown[number]['stacking'] = { kind: 'none' };
    if (allowStacking && row.memberIds.length > 1) {
      if (packet.kind === 'residue') {
        stacking = {
          kind: 'residue',
          reason: 'the tier packet is not in the closed single-damage grammar',
          sourceText: packet.sourceText,
        };
      } else if (packet.data.damage === null) {
        stacking = {
          kind: 'residue',
          reason: 'the tier result carries no ability damage packet',
          sourceText: packet.sourceText,
        };
      } else {
        const helperRows = row.memberIds.slice(1).map((memberId) => ({
          memberId,
          value: state.participants[memberId]?.stats?.freeStrike ?? 0,
        }));
        const summed = sumSquadContributions(helperRows);
        const damageType: DamageType | null =
          packet.data.damage.typeOptions.length === 0
            ? null
            : packet.data.damage.typeOptions.length === 1
              ? (packet.data.damage.typeOptions[0] ?? null)
              : (payload.damageTypeChoice ?? null);
        stacking = {
          kind: 'applied',
          contributions: summed.contributions.map(({ memberId, value }) => ({ memberId, value })),
          total: summed.total,
          damageType,
        };
      }
    }
    return {
      targetId: row.targetId,
      instanceOwner: row.instanceOwner,
      memberIds: row.memberIds,
      tier,
      packet,
      stacking,
      strikeDamageBonus,
    };
  });
}

function validateParticipation(
  state: EncounterState,
  squadId: string,
  participation: readonly SquadParticipation[],
  isArea: boolean,
): string | null {
  const squad = state.squads.find((candidate) => candidate.squadId === squadId);
  if (!squad) return `unknown squad ${squadId}`;
  const targets = participation.map((row) => row.targetId);
  if (new Set(targets).size !== targets.length) return 'participation targetIds must be distinct';
  const globallyUsed = new Set<string>();
  for (const row of participation) {
    if (!state.participants[row.targetId]) return `unknown participant ${row.targetId}`;
    if (!row.memberIds.includes(row.instanceOwner)) {
      return `${row.instanceOwner} must be one of the members attacking ${row.targetId}`;
    }
    for (const memberId of row.memberIds) {
      if (!squad.memberIds.includes(memberId)) {
        return `${memberId} is not a living member of ${squad.name}`;
      }
      if (!isArea && globallyUsed.has(memberId)) {
        return `${memberId} is assigned to more than one non-area target`;
      }
      globallyUsed.add(memberId);
    }
  }
  return null;
}

function rollInput(payload: SquadSignatureAttackPayload, actorParticipantId: string) {
  return {
    actorParticipantId,
    ability: payload.ability,
    targets: payload.participation.map((row) => row.targetId),
    dice: payload.dice,
    edges: payload.edges,
    banes: payload.banes,
    bonuses: payload.bonuses,
    penalties: payload.penalties,
    automaticOutcomes: payload.automaticOutcomes,
    downgradeToTier: payload.downgradeToTier,
  };
}

function validateSquadDamageBindings(
  state: EncounterState,
  payload: SquadSignatureAttackPayload,
): string | null {
  const damagePackets = Object.values(payload.ability.tiers)
    .filter((packet) => packet.kind === 'automatic')
    .map((packet) => packet.data.damage)
    .filter((damage) => damage !== null);
  const offeredTypes = new Set(damagePackets.flatMap((damage) => damage.typeOptions));
  if (damagePackets.some((damage) => damage.typeOptions.length > 1)) {
    if (payload.damageTypeChoice === undefined) {
      return `this ability's damage offers a type choice (${[...offeredTypes].join(' or ')}) — name damageTypeChoice`;
    }
  }
  if (payload.damageTypeChoice !== undefined && !offeredTypes.has(payload.damageTypeChoice)) {
    return `damageTypeChoice ${payload.damageTypeChoice} is not offered`;
  }
  for (const ownerId of new Set(payload.participation.map((row) => row.instanceOwner))) {
    const owner = state.participants[ownerId];
    if (!owner) return `unknown participant ${ownerId}`;
    for (const damage of damagePackets) {
      const binding = bindDamageCharacteristic(payload, owner, damage.characteristicOptions);
      if ('error' in binding) return binding.error;
    }
  }
  return null;
}

export function executeSquadSignatureAttack(
  state: EncounterState,
  intent: SquadSignatureIntent,
  random: RandomSource,
): ExecutionResult {
  const context: LifecycleContext = { intentId: intent.intentId, actor: intent.actor };
  const payload = intent.payload;
  const problem = validateParticipation(
    state,
    payload.squadId,
    payload.participation,
    payload.ability.keywords.some((keyword) => keyword.trim().toLowerCase() === 'area'),
  );
  if (problem) return refuse(state, context, problem);
  const squad = state.squads.find((candidate) => candidate.squadId === payload.squadId);
  if (!squad) return refuse(state, context, `unknown squad ${payload.squadId}`);
  const firstOwnerId = payload.participation[0]?.instanceOwner;
  const firstOwner = firstOwnerId ? state.participants[firstOwnerId] : undefined;
  if (!firstOwner) return refuse(state, context, 'squad participation has no instance owner');
  const binding = bindRollValue(payload, firstOwner);
  if ('error' in binding) return refuse(state, context, binding.error);
  const damageBindingProblem = validateSquadDamageBindings(state, payload);
  if (damageBindingProblem) return refuse(state, context, damageBindingProblem);

  let nextState = state;
  const log: LogEntry[] = [];
  // Every living member spends/wastes the squad signature action [R-0033,
  // R-0034]. Charge composition shares the parent debit but still records
  // this distinct child ability use (N-1 semantics from 5baaa39).
  if (state.turnState !== null) {
    for (const memberId of squad.memberIds) {
      const debited = debitActionCost(
        nextState,
        {
          cost: 'main-action',
          payerId: memberId,
          abilityKey: payload.ability.abilityArtifactId,
          usesPerRound: null,
          partOf: payload.partOfByMember[memberId] ?? null,
          sharesAbilityUse: false,
        },
        context,
      );
      nextState = debited.state;
      log.push(...debited.log);
    }
  }

  const targetIdsByMember = new Map<string, string[]>();
  for (const row of payload.participation) {
    for (const memberId of row.memberIds) {
      targetIdsByMember.set(memberId, [...(targetIdsByMember.get(memberId) ?? []), row.targetId]);
    }
  }
  const benefit = captainBenefit(nextState, payload.squadId);
  const derivedModifiers =
    benefit?.kind === 'strike-edge'
      ? [{ sourceText: benefit.sourceText, edges: benefit.magnitude, banes: 0 }]
      : [];
  const rolled = resolveAbilityRoll(
    nextState,
    rollInput(payload, firstOwner.id),
    binding,
    random,
    context,
    {
      actorLabel: squad.squadId,
      outboundBindings: [...targetIdsByMember].map(([memberId, targetIds]) => ({
        memberId,
        targetIds,
      })),
      derivedModifiers,
    },
  );
  nextState = rolled.state;
  log.push(...rolled.log);
  const isArea = payload.ability.keywords.some(
    (keyword) => keyword.trim().toLowerCase() === 'area',
  );
  const breakdown = buildSquadBreakdown(nextState, payload, rolled.tierFor, !isArea);
  for (const row of breakdown) {
    if (row.memberIds.length > 3 && !isArea) {
      log.push(
        entry(
          context,
          'warning',
          `${row.memberIds.length} minions attack ${row.targetId}; the printed simultaneous stacking maximum is three — applied anyway`,
          [SQUAD_CANON.action],
          { ruleViolation: { kind: 'squad-stacking-maximum', targetId: row.targetId } },
        ),
      );
    }
    if (row.stacking.kind === 'residue') {
      log.push(
        entry(
          context,
          'warning',
          `helper damage against ${row.targetId} requires table adjudication — ${row.stacking.reason}. Tier: ${row.stacking.sourceText}`,
          [SQUAD_CANON.action, payload.ability.abilityArtifactId],
          { squadStackingResidue: row.stacking },
        ),
      );
    }
  }

  if (rolled.resolution.naturalTopEnd) {
    // R-0035, through the shared crit home: one grant per PARTICIPATING
    // member, and out of combat a table directive rather than a persistent
    // grant that would survive begin-combat.
    const crit = grantCriticalHitAction(
      nextState,
      {
        participantIds: uniqueParticipatingMembers(payload.participation),
        grantIdPrefix: 'squad-critical-hit',
        natural: rolled.resolution.natural,
        extraCanonRefs: [SQUAD_CANON.action],
      },
      context,
    );
    nextState = crit.state;
    log.push(...crit.log);
  }

  const resolutionEntry: ResolutionEntry = {
    kind: 'squad-signature',
    resolutionId: intent.intentId,
    actorId: squad.squadId,
    abilityArtifactId: payload.ability.abilityArtifactId,
    actionCost: 'main-action',
    payloadHash: hashPayload(payload),
    declarationHash: hashDeclaration({
      actorId: squad.squadId,
      abilityArtifactId: payload.ability.abilityArtifactId,
      targets: payload.participation.map((row) => row.targetId),
    }),
    actionKey: intent.intentId,
    phase: 'rolled',
    rollReceipt: rolled.rollReceipt,
    modifications: [],
    squadBreakdown: breakdown,
  };
  if (state.turnState !== null) {
    nextState = { ...nextState, resolutionStack: [...nextState.resolutionStack, resolutionEntry] };
    log.push(
      entry(
        context,
        'mutation',
        `${squad.name}'s signature attack is rolled and OPEN as one squad-owned resolution`,
        [SQUAD_CANON.action, payload.ability.abilityArtifactId],
        { resolutionOpened: resolutionOpenedClaim(resolutionEntry), squadBreakdown: breakdown },
      ),
    );
    return { state: nextState, log };
  }
  const applied = applySquadBreakdown(nextState, payload, breakdown, context, new Map());
  return { state: applied.state, log: [...log, ...applied.log] };
}

export function executeSquadFreeStrike(
  state: EncounterState,
  intent: SquadFreeStrikeIntent,
): ExecutionResult {
  const context: LifecycleContext = { intentId: intent.intentId, actor: intent.actor };
  const payload = intent.payload;
  const squad = state.squads.find((candidate) => candidate.squadId === payload.squadId);
  if (!squad) return refuse(state, context, `unknown squad ${payload.squadId}`);
  const target = state.participants[payload.targetId];
  if (!target) return refuse(state, context, `unknown participant ${payload.targetId}`);
  for (const row of payload.contributions) {
    if (!squad.memberIds.includes(row.memberId)) {
      return refuse(state, context, `${row.memberId} is not a living member of ${squad.name}`);
    }
    if (state.participants[row.memberId]?.stats?.freeStrike == null) {
      return refuse(state, context, `${row.memberId} has no printed free-strike value`);
    }
  }
  const benefit = captainBenefit(state, payload.squadId);
  const bonus = benefit?.kind === 'strike-damage' ? benefit.amount : 0;
  const summed = sumSquadContributions(
    payload.contributions.map((row) => ({
      memberId: row.memberId,
      value: (state.participants[row.memberId]?.stats?.freeStrike ?? 0) + bonus,
      count: row.count,
    })),
  );
  const log: LogEntry[] = [
    entry(
      context,
      'informational',
      `${squad.name} combines ${summed.contributions.length} free-strike contribution(s) into one ${summed.total}-damage strike against ${target.id}`,
      [SQUAD_CANON.freeStrike],
      {
        squadFreeStrike: {
          squadId: squad.squadId,
          targetId: target.id,
          ...summed,
          captainBonus: bonus,
        },
      },
    ),
  ];
  const pending = new Map<string, PendingSquadContribution[]>();
  if (
    collectSquadContribution(
      state,
      target,
      { targetId: target.id, damage: summed.total, type: null },
      pending,
    )
  ) {
    const flushed = flushSquadContributions(
      state,
      pending,
      {
        area: false,
        reason: 'from Free Strike Together',
        // Printed free-strike VALUES, no power roll [R-0037].
        provenance: { rolled: false, sourceId: payload.squadId, resolutionId: null },
      },
      context,
    );
    return { state: flushed.state, log: [...log, ...flushed.log] };
  }
  const blocker = damageAutomationBlocker(target);
  if (blocker !== null) {
    log.push(
      entry(
        context,
        'table-directive',
        `${target.id} takes ${summed.total} damage from the combined strike — ${blocker}`,
        [SQUAD_CANON.freeStrike],
        { unautomatedDamage: { targetId: target.id, amount: summed.total, damageType: null } },
      ),
    );
    return { state, log };
  }
  const outcome = applyDamage(
    target,
    { amount: summed.total, type: null },
    {
      knockOut: payload.knockOut,
      reason: 'from Free Strike Together (one strike)',
      // Minion free strikes sum PRINTED free-strike values — no power roll
      // is made [R-0037], so this is not rolled damage [Heroes p.74].
      provenance: { rolled: false, sourceId: payload.squadId, resolutionId: null },
    },
    context,
  );
  return { state: withParticipant(state, outcome.participant), log: [...log, ...outcome.log] };
}

export function executeSquadManeuver(
  state: EncounterState,
  intent: SquadManeuverIntent,
  random: RandomSource,
): ExecutionResult {
  const context: LifecycleContext = { intentId: intent.intentId, actor: intent.actor };
  const payload = intent.payload;
  if (payload.maneuver !== 'knockback' || payload.ability === null) {
    const problem = validateParticipation(state, payload.squadId, payload.participation, false);
    if (problem) return refuse(state, context, problem);
    let nextState = state;
    const debitLog: LogEntry[] = [];
    if (state.turnState !== null) {
      for (const memberId of uniqueParticipatingMembers(payload.participation)) {
        const debited = debitActionCost(
          nextState,
          {
            cost: 'maneuver',
            payerId: memberId,
            abilityKey: `squad-maneuver:${payload.maneuver}`,
            usesPerRound: null,
            partOf: null,
            sharesAbilityUse: false,
          },
          context,
        );
        nextState = debited.state;
        debitLog.push(...debited.log);
      }
    }
    return {
      state: nextState,
      log: [
        ...debitLog,
        entry(
          context,
          'table-directive',
          `${payload.squadId} uses ${payload.maneuver} together — resolve from the verbatim instruction: ${payload.sourceText}`,
          [SQUAD_CANON.maneuvers],
          {
            squadManeuverDirective: {
              squadId: payload.squadId,
              maneuver: payload.maneuver,
              sourceText: payload.sourceText,
              participation: payload.participation,
              amendmentRequired: payload.maneuver === 'grab',
            },
          },
        ),
      ],
    };
  }
  const ability = payload.ability;
  // Knockback is the bounded compiled case. Reuse the squad roll/breakdown
  // path with stacking disabled and a maneuver cost on each participant.
  const signaturePayload: SquadSignatureAttackPayload = {
    ...payload,
    ability,
    partOfByMember: {},
  };
  const problem = validateParticipation(state, payload.squadId, payload.participation, false);
  if (problem) return refuse(state, context, problem);
  const squad = state.squads.find((candidate) => candidate.squadId === payload.squadId);
  const ownerId = payload.participation[0]?.instanceOwner;
  const owner = ownerId ? state.participants[ownerId] : undefined;
  if (!squad || !owner) return refuse(state, context, 'invalid Knockback squad participation');
  const binding = bindRollValue(signaturePayload, owner);
  if ('error' in binding) return refuse(state, context, binding.error);
  const damageBindingProblem = validateSquadDamageBindings(state, signaturePayload);
  if (damageBindingProblem) return refuse(state, context, damageBindingProblem);
  let nextState = state;
  const log: LogEntry[] = [];
  if (state.turnState !== null) {
    for (const memberId of uniqueParticipatingMembers(payload.participation)) {
      const debited = debitActionCost(
        nextState,
        {
          cost: 'maneuver',
          payerId: memberId,
          abilityKey: ability.abilityArtifactId,
          usesPerRound: null,
          partOf: null,
          sharesAbilityUse: false,
        },
        context,
      );
      nextState = debited.state;
      log.push(...debited.log);
    }
  }
  const rolled = resolveAbilityRoll(
    nextState,
    rollInput(signaturePayload, owner.id),
    binding,
    random,
    context,
    {
      actorLabel: squad.squadId,
    },
  );
  nextState = rolled.state;
  log.push(...rolled.log);
  const breakdown = buildSquadBreakdown(nextState, signaturePayload, rolled.tierFor, false);
  const resolutionEntry: ResolutionEntry = {
    kind: 'squad-maneuver',
    resolutionId: intent.intentId,
    actorId: squad.squadId,
    abilityArtifactId: ability.abilityArtifactId,
    actionCost: 'maneuver',
    payloadHash: hashPayload(payload),
    declarationHash: hashDeclaration({
      actorId: squad.squadId,
      abilityArtifactId: ability.abilityArtifactId,
      targets: payload.participation.map((row) => row.targetId),
    }),
    actionKey: intent.intentId,
    phase: 'rolled',
    rollReceipt: rolled.rollReceipt,
    modifications: [],
    squadBreakdown: breakdown,
  };
  if (state.turnState !== null) {
    return {
      state: { ...nextState, resolutionStack: [...nextState.resolutionStack, resolutionEntry] },
      log: [
        ...log,
        entry(
          context,
          'mutation',
          `${squad.name}'s Knockback is rolled and OPEN as one squad-owned resolution`,
          [SQUAD_CANON.maneuvers, ability.abilityArtifactId],
          { resolutionOpened: resolutionOpenedClaim(resolutionEntry), squadBreakdown: breakdown },
        ),
      ],
    };
  }
  const applied = applySquadBreakdown(nextState, signaturePayload, breakdown, context, new Map());
  return { state: applied.state, log: [...log, ...applied.log] };
}

/** Apply stored squad breakdown. Damage for every target precedes all tier
 * riders, matching the ordinary ability executor's ordering. */
export function applySquadBreakdown(
  state: EncounterState,
  payload: SquadSignatureAttackPayload,
  breakdown: SquadBreakdown,
  context: LifecycleContext,
  halves: ReadonlyMap<string | null, 'down' | 'up'>,
  potencyExtras: ReadonlyMap<string | null, number> = new Map(),
  /** The resolution this breakdown belongs to, for damage provenance
   * [R-0040]; null on the out-of-combat single-dispatch path. */
  resolutionId: string | null = null,
): ExecutionResult {
  let nextState = state;
  const log: LogEntry[] = [];
  const pending = new Map<string, PendingSquadContribution[]>();
  for (const row of breakdown) {
    if (row.packet.kind === 'residue') continue;
    const tierData = row.packet.data;
    if (tierData.damage === null) continue;
    const owner = nextState.participants[row.instanceOwner];
    const target = nextState.participants[row.targetId];
    if (!owner || !target) continue;
    const binding = bindDamageCharacteristic(payload, owner, tierData.damage.characteristicOptions);
    if ('error' in binding) return refuse(state, context, binding.error);
    const damageType: DamageType | null =
      tierData.damage.typeOptions.length === 0
        ? null
        : tierData.damage.typeOptions.length === 1
          ? (tierData.damage.typeOptions[0] ?? null)
          : (payload.damageTypeChoice ?? null);
    const helperDamage = row.stacking.kind === 'applied' ? row.stacking.total : 0;
    let amount = tierData.damage.amount + binding.value + row.strikeDamageBonus + helperDamage;
    const rounding = halves.get(row.targetId) ?? halves.get(null);
    if (rounding !== undefined) {
      const before = amount;
      amount = rounding === 'down' ? Math.floor(amount / 2) : Math.ceil(amount / 2);
      log.push(
        entry(
          context,
          'informational',
          `damage against ${row.targetId} is halved (${before} → ${amount}, rounded ${rounding} as asserted)`,
          [payload.ability.abilityArtifactId],
          { damageTransformed: { targetId: row.targetId, from: before, to: amount } },
        ),
      );
    }
    if (
      collectSquadContribution(
        nextState,
        target,
        { targetId: row.targetId, damage: amount, type: damageType },
        pending,
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
          `${row.targetId} takes ${amount}${damageType ? ` ${damageType}` : ''} damage — ${blocker}`,
          [payload.ability.abilityArtifactId],
          { unautomatedDamage: { targetId: row.targetId, amount, damageType } },
        ),
      );
      continue;
    }
    const outcome = applyDamage(
      target,
      { amount, type: damageType },
      {
        knockOut: payload.knockOut,
        reason: `from squad signature tier ${row.tier} (${row.instanceOwner} owns the instance)`,
        // One roll for the whole squad [R-0034] — rolled damage.
        provenance: {
          rolled: true,
          sourceId: row.instanceOwner,
          resolutionId: resolutionId ?? null,
        },
      },
      context,
    );
    nextState = withParticipant(nextState, outcome.participant);
    log.push(...outcome.log);
  }
  if (pending.size > 0) {
    const flushed = flushSquadContributions(
      nextState,
      pending,
      {
        area: payload.ability.keywords.some((keyword) => keyword.trim().toLowerCase() === 'area'),
        reason: `from ${payload.squadId}'s squad signature`,
        // One roll for the whole squad [R-0034].
        provenance: { rolled: true, sourceId: payload.squadId, resolutionId: resolutionId ?? null },
      },
      context,
    );
    nextState = flushed.state;
    log.push(...flushed.log);
  }

  for (const row of breakdown) {
    if (row.packet.kind === 'residue') {
      log.push(
        entry(
          context,
          'table-directive',
          `${row.targetId} resolves tier ${row.tier} from the verbatim residue: ${row.packet.sourceText}`,
          [payload.ability.abilityArtifactId],
          { squadTierResidue: { targetId: row.targetId, sourceText: row.packet.sourceText } },
        ),
      );
      continue;
    }
    const tierData = row.packet.data;
    if (tierData.forcedMovement) {
      log.push(
        entry(
          context,
          'table-directive',
          `${row.instanceOwner} pushes ${row.targetId} ${tierData.forcedMovement.distance} square(s) — movement geometry is table-resolved`,
          [payload.ability.abilityArtifactId],
          { forcedMovement: { targetId: row.targetId, ...tierData.forcedMovement } },
        ),
      );
    }
    const owner = nextState.participants[row.instanceOwner];
    const target = nextState.participants[row.targetId];
    if (!owner || !target || tierData.conditionIds.length === 0) continue;
    if (tierData.potency) {
      // Same gate, same receipts as the ordinary ability path — a resisted
      // or unresolvable potency is never a silent drop.
      const gate = gatePotencyWithReceipt(
        tierData.potency,
        owner,
        target,
        (potencyExtras.get(row.targetId) ?? 0) + (potencyExtras.get(null) ?? 0),
        {
          targetId: row.targetId,
          conditionIds: tierData.conditionIds,
          abilityArtifactId: payload.ability.abilityArtifactId,
        },
        context,
      );
      log.push(...gate.log);
      if (!gate.applies) continue;
    }
    for (const conditionId of tierData.conditionIds) {
      const liveTarget = nextState.participants[row.targetId];
      if (!liveTarget) continue;
      const applied = applyConditionInstance(
        nextState,
        {
          target: liveTarget,
          instance: {
            instanceId: `${conditionId}#${context.intentId}-${row.targetId}`,
            conditionId,
            ending: tierData.ending === 'save-ends' ? { kind: 'save-ends' } : { kind: 'external' },
            source: {
              participantId: row.instanceOwner,
              effectArtifactId: payload.ability.abilityArtifactId,
            },
          },
          replacesOnNewSource: false,
        },
        context,
      );
      nextState = applied.state;
      log.push(...applied.log);
    }
  }
  // The ability's printed `**Effect:**` line(s) are DIRECTIVES, surfaced
  // once per resolution rather than per target instance. The squad compiler
  // automates only power-roll tiers, so without this the clause was parsed,
  // passed grammar conservation, and then vanished — Bugbear Snare's
  // "the target is automatically grabbed" among them.
  for (const effectLine of payload.ability.effectLines) {
    log.push(
      entry(
        context,
        'table-directive',
        `${payload.squadId}'s ${payload.ability.abilityArtifactId.split('/').pop()} carries a printed Effect the engine does not automate — resolve it at the table: ${effectLine}`,
        [SQUAD_CANON.action, payload.ability.abilityArtifactId],
        {
          squadAbilityEffectDirective: {
            squadId: payload.squadId,
            abilityArtifactId: payload.ability.abilityArtifactId,
            sourceText: effectLine,
            targetIds: breakdown.map((row) => row.targetId),
          },
        },
      ),
    );
  }
  log.push(
    entry(
      context,
      'informational',
      `${payload.squadId}'s one-roll squad outcome resolves across ${breakdown.length} target instance(s)`,
      [SQUAD_CANON.action, POWER_ROLL_CANON.abilityRoll],
      { squadBreakdown: breakdown },
    ),
  );
  return { state: nextState, log };
}
