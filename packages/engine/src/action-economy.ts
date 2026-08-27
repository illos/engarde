import type { LifecycleContext } from './condition-lifecycle.js';
import { withParticipant } from './damage.js';
import type {
  ActionCost,
  ActionGrant,
  BudgetActionCost,
  EncounterState,
  LogEntry,
  ParticipantState,
  Side,
  TurnState,
} from './schemas.js';

/**
 * Action-economy substrate (design §3, R-0029/R-0030/R-0033) — the ONE home
 * for the enum→debit mapping and for consuming an action's cost. Every
 * dispatch that spends an action (use-ability, use-effect,
 * use-triggered-action, use-villain-action, convert-action) routes through
 * `debitActionCost`; nothing re-derives budget math elsewhere.
 *
 * Posture is R-0030 throughout: economy violations WARN-AND-APPLY with a
 * rule-violation receipt naming the printed rule; grants consume silently
 * and carry printed escapes; refusals stay structural.
 */

/** Canon artifact ids this substrate's behavior traces to (pointers only). */
export const ECONOMY_CANON = {
  turn: 'mcdm.heroes.v1/rule.combat/turn',
  combatRound: 'mcdm.heroes.v1/rule.combat/combat-round',
  triggeredAction: 'mcdm.heroes.v1/rule.combat/triggered-action',
  freeManeuver: 'mcdm.heroes.v1/rule.combat/free-maneuver',
  surprised: 'mcdm.heroes.v1/rule.combat/surprised',
  dazed: 'mcdm.heroes.v1/condition/dazed',
  criticalHit: 'mcdm.heroes.v1/rule.combat/critical-hit',
  villainAction: 'mcdm.monsters.v1/rule.monster/villain-action',
  squad: 'mcdm.monsters.v1/rule.monster/squad',
  bleeding: 'mcdm.heroes.v1/condition/bleeding',
} as const;

/**
 * The ONE exported enum→debit mapping [design §3; canon-constants
 * one-home]. Grounding, per cost:
 * - main/maneuver/move: "gets to take a **main action**, a **maneuver**,
 *   and a **move action** on their turn" [rule.combat/turn] — one budget
 *   counter each, own-turn actions.
 * - triggered-action: "You can use one triggered action per round, either
 *   on your turn or another creature's turn" [rule.combat/
 *   triggered-action] — the per-round counter, usable off-turn.
 * - free-triggered-action: "doesn't count against your limit of one
 *   triggered action per round" — no counter, but BOTH prevention
 *   couplings hold ("Any effect that prevents you from using triggered
 *   actions also prevents you from using free triggered actions").
 * - free-maneuver: debits nothing ("you can typically take as many free
 *   maneuvers as you like" [rule.combat/free-maneuver]); turn-only per
 *   R-0001; the maneuver→free-maneuver prevention coupling holds.
 * - no-action: debits nothing.
 * - villain-action: debits the encounter-level villain economy, never a
 *   personal counter [rule.monster/villain-action].
 */
export interface ActionCostDebit {
  /** Personal budget counter consumed, if any. */
  budget: BudgetActionCost | null;
  /** Counts against "one triggered action per round". */
  triggeredCounter: boolean;
  /** Debits the encounter-level villain economy. */
  villainEconomy: boolean;
  /** An own-turn action (off-turn use is an R-0030 violation; for
   * free-maneuver specifically this is R-0001's turn-only ruling). */
  turnOnly: boolean;
  /** Dazed "can do only one thing on their turn" applies. */
  dazedOneThing: boolean;
  /** Dazed "can't use triggered actions, free triggered actions, or free
   * maneuvers" applies [condition/dazed]. */
  dazedPrevented: boolean;
  /** "A surprised creature can't take triggered actions or free triggered
   * actions" applies [rule.combat/surprised]. */
  surprisedPrevented: boolean;
}

export const ACTION_COST_DEBITS: Readonly<Record<ActionCost, ActionCostDebit>> = {
  'main-action': {
    budget: 'main-action',
    triggeredCounter: false,
    villainEconomy: false,
    turnOnly: true,
    dazedOneThing: true,
    dazedPrevented: false,
    surprisedPrevented: false,
  },
  maneuver: {
    budget: 'maneuver',
    triggeredCounter: false,
    villainEconomy: false,
    turnOnly: true,
    dazedOneThing: true,
    dazedPrevented: false,
    surprisedPrevented: false,
  },
  'move-action': {
    budget: 'move-action',
    triggeredCounter: false,
    villainEconomy: false,
    turnOnly: true,
    dazedOneThing: true,
    dazedPrevented: false,
    surprisedPrevented: false,
  },
  'triggered-action': {
    budget: null,
    triggeredCounter: true,
    villainEconomy: false,
    turnOnly: false,
    dazedOneThing: false,
    dazedPrevented: true,
    surprisedPrevented: true,
  },
  'free-triggered-action': {
    budget: null,
    triggeredCounter: false,
    villainEconomy: false,
    turnOnly: false,
    dazedOneThing: false,
    dazedPrevented: true,
    surprisedPrevented: true,
  },
  'free-maneuver': {
    budget: null,
    triggeredCounter: false,
    villainEconomy: false,
    turnOnly: true,
    dazedOneThing: false,
    dazedPrevented: true,
    surprisedPrevented: false,
  },
  'no-action': {
    budget: null,
    triggeredCounter: false,
    villainEconomy: false,
    turnOnly: false,
    dazedOneThing: false,
    dazedPrevented: false,
    surprisedPrevented: false,
  },
  'villain-action': {
    budget: null,
    triggeredCounter: false,
    villainEconomy: true,
    turnOnly: false,
    dazedOneThing: false,
    dazedPrevented: false,
    surprisedPrevented: false,
  },
};

/** The printed per-turn budget: one of each own-turn action
 * [rule.combat/turn]. Capacity beyond this is `granted` counters only. */
export const BASE_TURN_BUDGET = 1 as const;

export function sideOfParticipant(participant: ParticipantState): Side {
  return participant.kind === 'hero' ? 'heroes' : 'director';
}

/** Is `payerId` acting within the active turn slot? True for the active
 * entity itself, a declared sub-actor of it, or a member of the active
 * squad [design §3, R-0033]. */
export function isOnActiveTurn(
  state: EncounterState,
  turnState: TurnState,
  payerId: string,
): boolean {
  const active = turnState.activeTurnId;
  if (active === null) return false;
  if (active === payerId) return true;
  const payer = state.participants[payerId];
  if (payer?.traits.subActorOf === active) return true;
  const squad = state.squads.find((candidate) => candidate.squadId === active);
  return squad?.memberIds.includes(payerId) ?? false;
}

export function hasCondition(participant: ParticipantState, conditionId: string): boolean {
  return participant.conditions.some((instance) => instance.conditionId === conditionId);
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

export type EconomyViolationKind =
  | 'off-turn'
  | 'over-budget'
  | 'dazed-one-thing'
  | 'dazed-prevented'
  | 'surprised-prevented'
  | 'triggered-limit'
  | 'per-ability-cap'
  | 'villain-once-per-round'
  | 'villain-once-per-encounter'
  | 'villain-timing'
  | 'minion-budget'
  | 'free-maneuver-off-turn';

interface Violation {
  kind: EconomyViolationKind;
  canonRefs: string[];
  message: string;
  /** A consumed action grant with this escape suppresses the warning. */
  suppressedBy: 'offTurn' | 'ignoresDazed' | 'ignoresSurprised' | 'grant' | null;
}

export interface DebitRequest {
  cost: ActionCost;
  /** Who pays (the dispatching adjacent operator for operator-paid
   * fixture abilities [R-0029]). */
  payerId: string;
  /** Ability artifact id, for per-ability counters + receipts. */
  abilityKey: string;
  /** Compiled printed once-per-round cap (null = none). */
  usesPerRound: number | null;
  /** Composition parent reference — the parent's debit covers this
   * dispatch [design §3]. */
  partOf: string | null;
  /** True only when `partOf` is another dispatch of this SAME printed
   * ability use. A composed child with its own ability key still counts as
   * its own use even though the parent pays the action debit. */
  sharesAbilityUse: boolean;
}

/**
 * R-0033 printed minion menu — the ONE home for the two-move-actions combo
 * (shared by the debit path and the receipt-aware budget invariant): "On
 * their shared turn, each minion can take only a move action and a main
 * action, a move action and a maneuver, or two move actions" (Acting
 * Together, Monsters p.8–9, R-0033). A member's second move action on the
 * squad's shared turn is within the printed menu — no over-budget warn and
 * no receipt required. Off-menu combos (a second main, a third action) stay
 * violations.
 */
export function withinMinionMoveMenu(
  state: EncounterState,
  activeTurnId: string | null,
  payerId: string,
  budget: BudgetActionCost,
  usedAfter: number,
): boolean {
  if (budget !== 'move-action' || usedAfter > 2) return false;
  const squad = state.squads.find((candidate) => candidate.memberIds.includes(payerId));
  return squad !== undefined && activeTurnId === squad.squadId;
}

/** Total own-turn actions already used this turn (the dazed one-thing
 * measure [condition/dazed]). */
function ownTurnActionsUsed(payer: ParticipantState): number {
  return (['main-action', 'maneuver', 'move-action'] as const).reduce(
    (sum, cost) => sum + (payer.actionBudget[cost]?.used ?? 0),
    0,
  );
}

/**
 * Consume an action's cost — budget counters, triggered counter, villain
 * economy, per-ability counters — with the R-0030 permissive posture.
 * Inactive (no-op) while combat has not begun (`turnState` null): the
 * pre-combat/table paths keep their v5 behavior.
 */
export function debitActionCost(
  state: EncounterState,
  request: DebitRequest,
  context: LifecycleContext,
): { state: EncounterState; log: LogEntry[] } {
  const turnState = state.turnState;
  if (turnState === null) return { state, log: [] };
  const payer = state.participants[request.payerId];
  if (!payer) return { state, log: [] }; // presence is the caller's refusal gate
  const debit = ACTION_COST_DEBITS[request.cost];
  const log: LogEntry[] = [];
  let nextState = state;
  let nextPayer = payer;

  // ── per-ability usage counters ─────────────────────────────────────────
  // A partOf child that realizes another half/target of the SAME printed
  // ability use shares both the action debit and the usage counter [N-1].
  // A composed child with a different ability key (Charge → its inner
  // strike) still records its own use even though the parent paid the cost.
  const uses = payer.abilityUses[request.abilityKey] ?? { round: 0, turn: 0, encounter: 0 };
  const nextUses = request.sharesAbilityUse
    ? uses
    : { round: uses.round + 1, turn: uses.turn + 1, encounter: uses.encounter + 1 };
  if (!request.sharesAbilityUse) {
    nextPayer = {
      ...nextPayer,
      abilityUses: { ...nextPayer.abilityUses, [request.abilityKey]: nextUses },
    };
  }
  const abilityUseDeltas = request.sharesAbilityUse
    ? []
    : [{ participantId: payer.id, abilityKey: request.abilityKey, from: uses, to: nextUses }];
  const violations: Violation[] = [];
  if (
    !request.sharesAbilityUse &&
    request.usesPerRound !== null &&
    nextUses.round > request.usesPerRound
  ) {
    violations.push({
      kind: 'per-ability-cap',
      canonRefs: [request.abilityKey],
      message: `${payer.id} uses ${request.abilityKey} for the ${nextUses.round}th time this round; its printed text caps it at ${request.usesPerRound} per round ("once per round")`,
      suppressedBy: null,
    });
  }

  // ── composition: the parent dispatch already paid [design §3] ──────────
  if (request.partOf !== null) {
    nextState = withParticipant(nextState, nextPayer);
    log.push(
      entry(
        context,
        'mutation',
        `${payer.id}'s ${request.abilityKey} resolves as part of ${request.partOf} — it consumes the parent's already-debited action, never a second one`,
        [ECONOMY_CANON.turn],
        { abilityUseDeltas, partOf: request.partOf },
      ),
    );
    log.push(...emitViolations(violations, request, context));
    return { state: nextState, log };
  }

  const onTurn = isOnActiveTurn(state, turnState, request.payerId);
  const dazed = hasCondition(payer, ECONOMY_CANON.dazed);
  const surprised = hasCondition(payer, ECONOMY_CANON.surprised);

  // ── villain economy [rule.monster/villain-action] ──────────────────────
  if (debit.villainEconomy) {
    const villain = state.villainActions;
    if (villain.usedThisRound) {
      violations.push({
        kind: 'villain-once-per-round',
        canonRefs: [ECONOMY_CANON.villainAction],
        message: `a villain action was already used this round — "no more than one villain action can be used per round" (even across creatures)`,
        suppressedBy: null,
      });
    }
    if (villain.usedByAbility.includes(request.abilityKey)) {
      violations.push({
        kind: 'villain-once-per-encounter',
        canonRefs: [ECONOMY_CANON.villainAction],
        message: `${request.abilityKey} was already used this encounter — "Each villain action can be used only once per encounter"`,
        suppressedBy: null,
      });
    }
    if (turnState.activeTurnId === request.payerId) {
      violations.push({
        kind: 'villain-timing',
        canonRefs: [ECONOMY_CANON.villainAction],
        message: `${payer.id} uses a villain action during their own turn — "A creature can use a villain action at the end of any other creature's turn during combat"`,
        suppressedBy: null,
      });
    }
    const nextVillain = {
      usedThisRound: true,
      usedByAbility: villain.usedByAbility.includes(request.abilityKey)
        ? villain.usedByAbility
        : [...villain.usedByAbility, request.abilityKey],
    };
    nextState = withParticipant({ ...nextState, villainActions: nextVillain }, nextPayer);
    log.push(
      entry(
        context,
        'mutation',
        `${payer.id} spends the encounter's villain action for this round on ${request.abilityKey} (that its timing is the end of another creature's turn is table-adjudicated)`,
        [ECONOMY_CANON.villainAction],
        {
          abilityUseDeltas,
          villainEconomyDeltas: [
            { usedThisRoundFrom: villain.usedThisRound, usedThisRoundTo: true },
          ],
          ...(nextVillain.usedByAbility.length > villain.usedByAbility.length
            ? { villainAbilityUses: [request.abilityKey] }
            : {}),
        },
      ),
    );
    log.push(...emitViolations(violations, request, context));
    return { state: nextState, log };
  }

  // ── own-turn / prevention violations ───────────────────────────────────
  if (debit.turnOnly && !onTurn) {
    if (request.cost === 'free-maneuver') {
      violations.push({
        kind: 'free-maneuver-off-turn',
        canonRefs: [ECONOMY_CANON.freeManeuver],
        message: `${payer.id} takes a free maneuver outside their turn — free maneuvers are turn-only (R-0001; the printed escape is ability text granting "no action required")`,
        suppressedBy: 'offTurn',
      });
    } else {
      violations.push({
        kind: 'off-turn',
        canonRefs: [ECONOMY_CANON.combatRound, ECONOMY_CANON.turn],
        message: `${payer.id} acts outside their turn — "any creature who has taken a turn during a combat round can't act again until a new round begins"`,
        suppressedBy: 'offTurn',
      });
    }
  }
  if (debit.dazedPrevented && dazed) {
    violations.push({
      kind: 'dazed-prevented',
      canonRefs: [ECONOMY_CANON.dazed],
      message: `${payer.id} is dazed — a dazed creature "can't use triggered actions, free triggered actions, or free maneuvers"`,
      suppressedBy: 'ignoresDazed',
    });
  }
  if (debit.surprisedPrevented && surprised) {
    violations.push({
      kind: 'surprised-prevented',
      canonRefs: [ECONOMY_CANON.surprised],
      message: `${payer.id} is surprised — "A surprised creature can't take triggered actions or free triggered actions"`,
      suppressedBy: 'ignoresSurprised',
    });
  }
  if (debit.dazedOneThing && dazed && ownTurnActionsUsed(payer) >= 1) {
    violations.push({
      kind: 'dazed-one-thing',
      canonRefs: [ECONOMY_CANON.dazed],
      message: `${payer.id} is dazed and already acted this turn — a dazed creature "can do only one thing on their turn: use a main action, use a maneuver, or use a move action"`,
      suppressedBy: 'ignoresDazed',
    });
  }

  // ── budget counter ─────────────────────────────────────────────────────
  let consumedGrant: ActionGrant | null = null;
  if (debit.budget !== null) {
    const cell = payer.actionBudget[debit.budget] ?? { used: 0, granted: 0 };
    // R-0033: the printed two-move combo on the squad's shared turn is
    // within the minion menu — not over budget, no grant needed [one home:
    // withinMinionMoveMenu].
    const menuMove = withinMinionMoveMenu(
      state,
      turnState.activeTurnId,
      payer.id,
      debit.budget,
      cell.used + 1,
    );
    const overBudget = !menuMove && cell.used + 1 > BASE_TURN_BUDGET + cell.granted;
    // A grant is consumed when the printed budget alone cannot cover this
    // use — over budget, off-turn, or through a dazed restriction. Silent,
    // and its escapes suppress the matching warnings [R-0030].
    const needsGrant =
      overBudget || violations.some((violation) => violation.suppressedBy !== null);
    if (needsGrant) {
      const candidates = payer.grants.filter(
        (grant): grant is ActionGrant => grant.kind === 'action' && grant.cost === debit.budget,
      );
      const required = violations
        .map((violation) => violation.suppressedBy)
        .filter(
          (flag): flag is 'offTurn' | 'ignoresDazed' | 'ignoresSurprised' =>
            flag === 'offTurn' || flag === 'ignoresDazed' || flag === 'ignoresSurprised',
        );
      consumedGrant =
        candidates.find((grant) => required.every((flag) => grant.escapes[flag])) ?? null;
    }
    if (consumedGrant !== null) {
      const remainingGrants =
        consumedGrant.magnitude > 1
          ? payer.grants.map((grant) =>
              grant === consumedGrant ? { ...grant, magnitude: grant.magnitude - 1 } : grant,
            )
          : payer.grants.filter((grant) => grant !== consumedGrant);
      const nextCell = { used: cell.used + 1, granted: cell.granted + 1 };
      nextPayer = {
        ...nextPayer,
        grants: remainingGrants,
        actionBudget: { ...nextPayer.actionBudget, [debit.budget]: nextCell },
      };
      nextState = withParticipant(nextState, nextPayer);
      log.push(
        entry(
          context,
          'mutation',
          `${payer.id} takes an additional ${debit.budget} through a granted action (printed escape — no warning) [R-0030]`,
          [
            ECONOMY_CANON.turn,
            ...(consumedGrant.source.effectArtifactId
              ? [consumedGrant.source.effectArtifactId]
              : []),
          ],
          {
            abilityUseDeltas,
            actionBudgetDeltas: [
              {
                participantId: payer.id,
                cost: debit.budget,
                usedFrom: cell.used,
                usedTo: nextCell.used,
                grantedFrom: cell.granted,
                grantedTo: nextCell.granted,
              },
            ],
            ...(consumedGrant.magnitude > 1
              ? { grantMagnitudeConsumed: consumedGrant.grantId }
              : { removedGrantIds: [consumedGrant.grantId] }),
            grantEscapes: consumedGrant.escapes,
          },
        ),
      );
      // Escapes suppress their violations; anything uncovered still warns.
      const surviving = violations.filter(
        (violation) =>
          violation.suppressedBy === null ||
          (violation.suppressedBy !== 'grant' && !consumedGrant?.escapes[violation.suppressedBy]),
      );
      log.push(...emitViolations(surviving, request, context));
      return { state: nextState, log };
    }
    if (overBudget) {
      violations.push({
        kind: 'over-budget',
        canonRefs: [ECONOMY_CANON.turn],
        message: `${payer.id} exceeds their turn budget for a ${debit.budget} — each creature "gets to take a main action, a maneuver, and a move action on their turn"`,
        suppressedBy: 'grant',
      });
    }
    const nextCell = { used: cell.used + 1, granted: cell.granted };
    nextPayer = {
      ...nextPayer,
      actionBudget: { ...nextPayer.actionBudget, [debit.budget]: nextCell },
    };
    nextState = withParticipant(nextState, nextPayer);
    log.push(
      entry(
        context,
        'mutation',
        `${payer.id} spends a ${debit.budget}${request.abilityKey ? ` on ${request.abilityKey}` : ''}`,
        [ECONOMY_CANON.turn],
        {
          abilityUseDeltas,
          actionBudgetDeltas: [
            {
              participantId: payer.id,
              cost: debit.budget,
              usedFrom: cell.used,
              usedTo: nextCell.used,
              grantedFrom: cell.granted,
              grantedTo: nextCell.granted,
            },
          ],
        },
      ),
    );
    // ── minion per-member budget within the squad's turn [R-0033] ────────
    const squad = state.squads.find((candidate) => candidate.memberIds.includes(payer.id));
    if (squad && turnState.activeTurnId === squad.squadId) {
      const used = {
        main: nextPayer.actionBudget['main-action']?.used ?? 0,
        maneuver: nextPayer.actionBudget.maneuver?.used ?? 0,
        move: nextPayer.actionBudget['move-action']?.used ?? 0,
      };
      if (used.main > 0 && used.maneuver > 0) {
        violations.push({
          kind: 'minion-budget',
          canonRefs: [ECONOMY_CANON.squad],
          message: `${payer.id} takes both a main action and a maneuver on the squad's turn — "each minion can take only a move action and a main action, a move action and a maneuver, or two move actions" (Acting Together, Monsters p.8–9, R-0033)`,
          suppressedBy: null,
        });
      }
      if (used.main + used.maneuver + used.move > 2) {
        violations.push({
          kind: 'minion-budget',
          canonRefs: [ECONOMY_CANON.squad],
          message: `${payer.id} takes a third action on the squad's turn — "Minion turns are meant to be short. On their shared turn, each minion can take only a move action and a main action, a move action and a maneuver, or two move actions." (Acting Together, Monsters p.8–9, R-0033)`,
          suppressedBy: null,
        });
      }
      if (debit.budget === 'maneuver') {
        log.push(
          entry(
            context,
            'table-directive',
            `${payer.id} takes an individual maneuver — "If they do, they can't participate in their squad's main action or maneuver during the turn" (Minion Maneuvers, Monsters p.8–9, R-0033); squad-action participation is table-adjudicated until the squad-attack family`,
            [ECONOMY_CANON.squad],
            { minionManeuverForfeit: { squadId: squad.squadId, memberId: payer.id } },
          ),
        );
      }
    }
    log.push(...emitViolations(violations, request, context));
    return { state: nextState, log };
  }

  // ── triggered counter [rule.combat/triggered-action] ───────────────────
  if (debit.triggeredCounter) {
    const limit = payer.traits.triggeredActionLimit;
    const nextCount = payer.triggeredThisRound + 1;
    if (nextCount > limit) {
      violations.push({
        kind: 'triggered-limit',
        canonRefs: [ECONOMY_CANON.triggeredAction],
        message: `${payer.id} uses a ${nextCount}th triggered action this round (limit ${limit}) — "You can use one triggered action per round, either on your turn or another creature's turn"`,
        suppressedBy: null,
      });
    }
    nextPayer = { ...nextPayer, triggeredThisRound: nextCount };
    nextState = withParticipant(nextState, nextPayer);
    log.push(
      entry(
        context,
        'mutation',
        `${payer.id} uses a triggered action (${request.abilityKey}) — ${nextCount} of ${limit} this round`,
        [ECONOMY_CANON.triggeredAction],
        {
          abilityUseDeltas,
          triggeredCountDeltas: [
            { participantId: payer.id, from: payer.triggeredThisRound, to: nextCount },
          ],
        },
      ),
    );
    log.push(...emitViolations(violations, request, context));
    return { state: nextState, log };
  }

  // ── free / no-cost paths (free-triggered, free-maneuver, no-action) ────
  nextState = withParticipant(nextState, nextPayer);
  log.push(
    entry(
      context,
      'mutation',
      request.cost === 'free-triggered-action'
        ? `${payer.id} uses a free triggered action (${request.abilityKey}) — it "doesn't count against your limit of one triggered action per round"`
        : `${payer.id} uses ${request.abilityKey} (${request.cost} — no budget debit)`,
      [
        request.cost === 'free-triggered-action'
          ? ECONOMY_CANON.triggeredAction
          : request.cost === 'free-maneuver'
            ? ECONOMY_CANON.freeManeuver
            : ECONOMY_CANON.turn,
      ],
      { abilityUseDeltas },
    ),
  );
  log.push(...emitViolations(violations, request, context));
  return { state: nextState, log };
}

function emitViolations(
  violations: Violation[],
  request: DebitRequest,
  context: LifecycleContext,
): LogEntry[] {
  return violations.map((violation) =>
    entry(
      context,
      'warning',
      `${violation.message} — applied anyway (permissive engine, R-0030)`,
      violation.canonRefs,
      {
        ruleViolation: {
          kind: violation.kind,
          participantId: request.payerId,
          cost: request.cost,
          abilityKey: request.abilityKey,
        },
      },
    ),
  );
}
