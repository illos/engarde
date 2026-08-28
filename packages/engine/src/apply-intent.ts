import { executeUseAbility } from './ability-execution.js';
import {
  ECONOMY_CANON,
  debitActionCost,
  isOnActiveTurn,
  sideOfParticipant,
} from './action-economy.js';
import { runBoundarySweeps } from './boundary-sweeps.js';
import { shiftCaptainBenefit } from './captain-benefits.js';
import {
  CANON,
  SAVING_THROW,
  applyConditionInstance,
  removeConditionInstance,
} from './condition-lifecycle.js';
import {
  MINION_CANON,
  type PendingSquadContribution,
  applyDamage,
  collectSquadContribution,
  damageAutomationBlocker,
  flushSquadContributions,
  isMinion,
  squadMemberStats,
  withParticipant,
  withSquad,
} from './damage.js';
import type { RandomSource } from './determinism.js';
import { TERRAIN_CANON, executeUseEffect } from './effect-execution.js';
import { appendGrant } from './grant-lifecycle.js';
import { HEALTH_CANON, isDead, isDying, isHealthSourcedInstance } from './health.js';
import { commitResolutionEntry, isOpenResolution, openResolutionsOwnedBy } from './resolution.js';
import { type EncounterState, type Intent, IntentSchema, type LogEntry } from './schemas.js';
import {
  executeSquadFreeStrike,
  executeSquadManeuver,
  executeSquadSignatureAttack,
} from './squad-actions.js';

/**
 * The pure reducer (engine-plan 3.1): state + intent (dice as input) → new
 * state + structured log. Identical inputs are identical outputs; the only
 * chance enters through the injected RandomSource, and an asserted roll on
 * the payload always wins over it (manual entry is the override, auto-roll
 * the default).
 */
export interface EngineContext {
  random: RandomSource;
}

export interface ApplyResult {
  state: EncounterState;
  log: LogEntry[];
}

function refusal(intent: Intent, message: string): LogEntry {
  return {
    kind: 'refusal',
    intentId: intent.intentId,
    actor: intent.actor,
    canonRefs: [],
    message,
    data: {},
  };
}

function applyIntentCore(
  state: EncounterState,
  rawIntent: Intent,
  context: EngineContext,
): ApplyResult {
  const intent = IntentSchema.parse(rawIntent);
  const lifecycleContext = { intentId: intent.intentId, actor: intent.actor };

  switch (intent.kind) {
    case 'apply-condition': {
      const target = state.participants[intent.payload.target];
      if (!target) {
        return { state, log: [refusal(intent, `unknown participant ${intent.payload.target}`)] };
      }
      const asserted = intent.payload.assertedAbilityUse;
      if (asserted !== null && !state.participants[asserted.actorParticipantId]) {
        return {
          state,
          log: [refusal(intent, `unknown participant ${asserted.actorParticipantId}`)],
        };
      }
      // Asserted-band economy parity (R-0029/R-0030): a manual tier
      // assertion is still a use of the ability — it debits through the one
      // home like the rolled path (silent grant consumption, warn-and-apply
      // violations), and opens NO resolution entry (nothing rolled).
      let preState = state;
      const preLog: LogEntry[] = [];
      if (asserted !== null && state.turnState !== null) {
        const debited = debitActionCost(
          preState,
          {
            cost: asserted.actionCost,
            payerId: asserted.actorParticipantId,
            abilityKey: asserted.abilityArtifactId,
            usesPerRound: asserted.usesPerRound,
            partOf: asserted.partOf ?? null,
            sharesAbilityUse: asserted.partOf !== undefined,
          },
          lifecycleContext,
        );
        preState = debited.state;
        preLog.push(...debited.log);
      }
      const liveTarget = preState.participants[intent.payload.target] ?? target;
      const applied = applyConditionInstance(
        preState,
        {
          target: liveTarget,
          instance: {
            // Deterministic identity: derived from the (host-unique) intent
            // id, never from ambient randomness.
            instanceId: `${intent.payload.conditionId}#${intent.intentId}`,
            conditionId: intent.payload.conditionId,
            ending: intent.payload.ending,
            source: intent.payload.source,
          },
          replacesOnNewSource: intent.payload.replacesOnNewSource,
        },
        lifecycleContext,
      );
      return { state: applied.state, log: [...preLog, ...applied.log] };
    }
    case 'remove-condition': {
      const target = state.participants[intent.payload.target];
      if (!target) {
        return { state, log: [refusal(intent, `unknown participant ${intent.payload.target}`)] };
      }
      const instance = target.conditions.find(
        (candidate) => candidate.instanceId === intent.payload.instanceId,
      );
      // R-0004: the dying-mandated bleeding "can't be negated or removed in
      // any way until you are no longer dying" [rule.health/dying]. This is a
      // representational refusal, not a permissive warn-and-apply violation.
      if (
        instance !== undefined &&
        isHealthSourcedInstance(instance) &&
        instance.source.effectArtifactId === HEALTH_CANON.dying &&
        target.stamina !== null &&
        isDying(target.stamina.current)
      ) {
        return {
          state,
          log: [
            {
              kind: 'refusal',
              intentId: intent.intentId,
              actor: intent.actor,
              canonRefs: [HEALTH_CANON.dying],
              message: `${target.id} is still dying — this bleeding instance can't be removed until they are no longer dying`,
              data: { instanceId: instance.instanceId },
            },
          ],
        };
      }
      // R-0001 wiring (pilot step 7): "A creature who imposes an effect on
      // another creature using an ability can end that effect as a free
      // maneuver unless the ability says otherwise" [chapter/classes
      // §Ending Effects] — and free maneuvers are TURN-ONLY (R-0001). An
      // imposer ending their imposed effect routes through the one debit
      // home as a free maneuver: off-turn use warns-and-applies; the
      // printed "(no action required)" ability-text escape is asserted at
      // dispatch via noActionRequired.
      let preState = state;
      const preLog: LogEntry[] = [];
      if (
        state.turnState !== null &&
        instance !== undefined &&
        instance.source.effectArtifactId !== undefined &&
        intent.actor.kind === 'participant' &&
        intent.actor.participantId === instance.source.participantId &&
        intent.actor.participantId !== target.id &&
        !intent.payload.noActionRequired
      ) {
        const debited = debitActionCost(
          preState,
          {
            cost: 'free-maneuver',
            payerId: intent.actor.participantId,
            abilityKey: instance.source.effectArtifactId,
            usesPerRound: null,
            partOf: null,
            sharesAbilityUse: false,
          },
          lifecycleContext,
        );
        preState = debited.state;
        preLog.push(...debited.log);
      }
      const liveTarget = preState.participants[intent.payload.target] ?? target;
      const removed = removeConditionInstance(
        preState,
        liveTarget,
        intent.payload.instanceId,
        lifecycleContext,
        [CANON.creatureEndsAbilityEffect],
        `condition instance removed from ${liveTarget.id}${intent.payload.reason ? `: ${intent.payload.reason}` : ''}`,
      );
      return { state: removed.state, log: [...preLog, ...removed.log] };
    }
    case 'use-ability':
      return executeUseAbility(state, intent, context.random);
    case 'squad-signature-attack':
      return executeSquadSignatureAttack(state, intent, context.random);
    case 'squad-free-strike':
      return executeSquadFreeStrike(state, intent);
    case 'squad-maneuver':
      return executeSquadManeuver(state, intent, context.random);
    case 'use-effect':
      return executeUseEffect(state, intent, context.random);
    case 'apply-damage': {
      const target = state.participants[intent.payload.target];
      if (!target) {
        return { state, log: [refusal(intent, `unknown participant ${intent.payload.target}`)] };
      }
      const asserted = intent.payload.assertedAbilityUse;
      if (asserted !== null && !state.participants[asserted.actorParticipantId]) {
        return {
          state,
          log: [refusal(intent, `unknown participant ${asserted.actorParticipantId}`)],
        };
      }
      // The minionKillVictims structural gate, hoisted above the economy
      // debit so a refusal never follows a mutation (refusal-with-change
      // holds by construction).
      const targetIsLivingSquadMember = state.squads.some((candidate) =>
        candidate.memberIds.includes(intent.payload.target),
      );
      if (!targetIsLivingSquadMember && intent.payload.minionKillVictims.length > 0) {
        return {
          state,
          log: [
            refusal(
              intent,
              `${intent.payload.target} is not a living member of a seeded squad — minionKillVictims applies only to squad-pooled damage`,
            ),
          ],
        };
      }
      // Asserted-band economy parity (R-0029/R-0030): a manual tier
      // assertion is still a use of the ability — it debits through the one
      // home like the rolled path, and opens NO resolution entry.
      let economyState = state;
      const economyLog: LogEntry[] = [];
      if (asserted !== null && state.turnState !== null) {
        const debited = debitActionCost(
          economyState,
          {
            cost: asserted.actionCost,
            payerId: asserted.actorParticipantId,
            abilityKey: asserted.abilityArtifactId,
            usesPerRound: asserted.usesPerRound,
            partOf: asserted.partOf ?? null,
            sharesAbilityUse: asserted.partOf !== undefined,
          },
          lifecycleContext,
        );
        economyState = debited.state;
        economyLog.push(...debited.log);
      }
      const liveTarget = economyState.participants[intent.payload.target] ?? target;
      // A living squad member's damage decrements the shared pool — the ONE
      // home for squad vitality [R-0024]; the dispatch-asserted `area` flag
      // is the manual half of the R-0025 discriminator.
      const pendingContributions = new Map<string, PendingSquadContribution[]>();
      const squad = collectSquadContribution(
        economyState,
        liveTarget,
        {
          targetId: intent.payload.target,
          damage: intent.payload.amount,
          type: intent.payload.damageType ?? null,
        },
        pendingContributions,
      );
      if (squad) {
        const preLog: LogEntry[] = [];
        // Manual area damage names ONE contributor per dispatch, but the
        // squad's weakness/immunity step applies "once, even if multiple
        // minions share the same immunity or weakness" per damage instance
        // [R-0026]. Warn when the squad's stats carry such a row: if the
        // same area effect damaged other squad members, they must be
        // batched into one dispatch or the adjustment multiply-applies —
        // one application per dispatch instead of one per instance.
        const squadStats = squadMemberStats(economyState, squad);
        if (
          intent.payload.area &&
          squadStats !== null &&
          (squadStats.weaknesses.length > 0 || squadStats.immunities.length > 0)
        ) {
          preLog.push({
            kind: 'warning',
            intentId: intent.intentId,
            actor: intent.actor,
            canonRefs: [MINION_CANON.weaknessImmunity],
            message: `manual area damage against ${squad.name}: the once-per-squad weakness/immunity step applies to this dispatch alone — if the same area effect damaged other squad members, batch all contributions in one dispatch, or the adjustment applies once per dispatch instead of once per damage instance`,
            data: {
              manualAreaWeaknessImmunityInstance: {
                squadId: squad.squadId,
                targetId: intent.payload.target,
              },
            },
          });
        }
        const flushed = flushSquadContributions(
          economyState,
          pendingContributions,
          {
            area: intent.payload.area,
            namedVictims: intent.payload.minionKillVictims,
            reason: `(${intent.payload.reason})`,
          },
          lifecycleContext,
        );
        return { state: flushed.state, log: [...economyLog, ...preLog, ...flushed.log] };
      }
      // (The minionKillVictims structural gate ran above the economy debit.)
      const blocker = damageAutomationBlocker(liveTarget);
      if (blocker !== null) {
        return {
          state: economyState,
          log: [
            ...economyLog,
            {
              kind: 'table-directive',
              intentId: intent.intentId,
              actor: intent.actor,
              canonRefs: [HEALTH_CANON.damage],
              message: `${target.id} takes ${intent.payload.amount}${intent.payload.damageType ? ` ${intent.payload.damageType}` : ''} damage (${intent.payload.reason}) — ${blocker}`,
              data: {
                unautomatedDamage: {
                  targetId: target.id,
                  amount: intent.payload.amount,
                  damageType: intent.payload.damageType ?? null,
                },
              },
            },
          ],
        };
      }
      const outcome = applyDamage(
        liveTarget,
        { amount: intent.payload.amount, type: intent.payload.damageType ?? null },
        { knockOut: intent.payload.knockOut, reason: intent.payload.reason },
        lifecycleContext,
      );
      return {
        state: withParticipant(economyState, outcome.participant),
        log: [...economyLog, ...outcome.log],
      };
    }
    case 'end-turn': {
      const turnId = intent.payload.participantId;
      const endingSquad = state.squads.find((candidate) => candidate.squadId === turnId);
      const endingParticipant = state.participants[turnId];
      if (!endingParticipant && !endingSquad) {
        return {
          state,
          log: [refusal(intent, `unknown participant ${turnId}`)],
        };
      }
      // The participants whose per-turn boundary passes: the ending
      // participant, or every living member of the ending squad [R-0033].
      const endingIds = endingSquad ? [...endingSquad.memberIds] : [turnId];
      const log: LogEntry[] = [];
      let nextState = state;
      const skipInstanceIds = new Set<string>();

      if (state.turnState !== null) {
        // ── force-commit open resolutions owned by the ending actor FIRST
        // [design §3, red-team F8]: printed damage is never discarded. A
        // missing re-supplied payload is a structural refusal, checked
        // before any mutation.
        const owned = openResolutionsOwnedBy(state, [turnId, ...endingIds]);
        for (const open of owned) {
          if (intent.payload.commitPayloads[open.resolutionId] === undefined) {
            return {
              state,
              log: [
                refusal(
                  intent,
                  `resolution ${open.resolutionId} (owned by ${open.actorId}) is still open — end-turn must re-supply its payload via commitPayloads so the printed damage is never discarded [R-0032]`,
                ),
              ],
            };
          }
        }
        const preCommitInstances = new Map<string, Set<string>>();
        for (const endingId of endingIds) {
          const participant = state.participants[endingId];
          if (participant) {
            preCommitInstances.set(
              endingId,
              new Set(participant.conditions.map((instance) => instance.instanceId)),
            );
          }
        }
        for (const open of [...owned].reverse()) {
          const payload = intent.payload.commitPayloads[open.resolutionId];
          if (payload === undefined) continue; // proven present above
          const committed = commitResolutionEntry(
            nextState,
            { resolutionId: open.resolutionId, payload, forced: true },
            lifecycleContext,
          );
          if (!committed.ok) {
            return { state, log: [refusal(intent, committed.refusal)] };
          }
          nextState = committed.state;
          log.push(...committed.log);
        }
        // Saving throws run AFTER the forced commit: a condition the
        // commit just imposed on an ending participant saves next turn,
        // not this one [design §3].
        for (const endingId of endingIds) {
          const before = preCommitInstances.get(endingId);
          const participant = nextState.participants[endingId];
          if (!before || !participant) continue;
          for (const instance of participant.conditions) {
            if (!before.has(instance.instanceId)) skipInstanceIds.add(instance.instanceId);
          }
        }
      }

      // Per-slot boundary behavior (conditions' saving throws + expiry,
      // grants' windowed expiry [R-0016], per-turn ability counters) lives
      // in the boundary-sweep registry; the handler names the boundary
      // once per ending participant.
      for (const endingId of endingIds) {
        if (!nextState.participants[endingId]) continue;
        const swept = runBoundarySweeps(
          nextState,
          {
            kind: 'end-of-turn',
            participantId: endingId,
            rolls: intent.payload.rolls ?? {},
            rollSavingThrow: () => context.random.roll(SAVING_THROW.die),
            skipInstanceIds,
          },
          lifecycleContext,
        );
        nextState = swept.state;
        log.push(...swept.log);
      }

      // ── turn bookkeeping [design §3] ─────────────────────────────────
      const turnState = nextState.turnState;
      if (turnState !== null) {
        if (turnState.activeTurnId !== null && turnState.activeTurnId !== turnId) {
          log.push({
            kind: 'warning',
            intentId: intent.intentId,
            actor: intent.actor,
            canonRefs: [ECONOMY_CANON.turn],
            message: `end-turn for ${turnId} while the active turn is ${turnState.activeTurnId} — applied anyway (permissive engine, R-0030)`,
            data: {
              ruleViolation: {
                kind: 'off-turn',
                participantId: turnId,
                cost: null,
                abilityKey: null,
              },
            },
          });
        }
        const deltas: Array<Record<string, unknown>> = [];
        if (turnState.activeTurnId !== null) {
          deltas.push({ field: 'activeTurnId', from: turnState.activeTurnId, to: null });
        }
        if (turnState.lastTurnId !== turnId) {
          deltas.push({ field: 'lastTurnId', from: turnState.lastTurnId, to: turnId });
        }
        if (deltas.length > 0) {
          nextState = {
            ...nextState,
            turnState: { ...turnState, activeTurnId: null, lastTurnId: turnId },
          };
          log.push({
            kind: 'mutation',
            intentId: intent.intentId,
            actor: intent.actor,
            canonRefs: [ECONOMY_CANON.turn],
            message: `${turnId} ends their turn`,
            data: { turnStateDeltas: deltas },
          });
        }
      }
      return { state: nextState, log };
    }
    case 'end-encounter': {
      // Per-slot boundary behavior (conditions' ending-effects sweep with
      // the health exemption, grant clearing [R-0012], temporary-Stamina
      // disappearance, terrain-fact clearing [R-0022]) lives in the
      // boundary-sweep registry; the handler names the boundary once.
      return runBoundarySweeps(
        state,
        { kind: 'end-of-encounter', keepInstanceIds: intent.payload.keepInstanceIds },
        lifecycleContext,
      );
    }
    case 'begin-combat': {
      // "Sometimes figuring out who gets to take the first turn in combat
      // is automatic. If all the creatures on one side are surprised, then
      // a creature on the other side gets to act first." Otherwise "the
      // Director or a player they choose rolls a d10. On a 6 or higher,
      // the players determine who goes first—the heroes' side or the other
      // side. Otherwise, the Director decides which side goes first."
      // [rule.combat/combat-round §Determine Who Goes First]. Deviations
      // are warn-and-apply — project permissive policy, NOT printed
      // authority (red-team ledger).
      const log: LogEntry[] = [];
      const payload = intent.payload;
      if (state.turnState !== null) {
        log.push({
          kind: 'warning',
          intentId: intent.intentId,
          actor: intent.actor,
          canonRefs: [ECONOMY_CANON.combatRound],
          message: `combat already begun (round ${state.turnState.round}) — reinitialized on Director assertion (permissive engine, R-0030)`,
          data: { ruleViolation: { kind: 'combat-reinitialized', participantId: null } },
        });
      }
      let roll: number | null = null;
      if (payload.surprisedSide !== null) {
        if (payload.firstSide === payload.surprisedSide) {
          log.push({
            kind: 'warning',
            intentId: intent.intentId,
            actor: intent.actor,
            canonRefs: [ECONOMY_CANON.combatRound, ECONOMY_CANON.surprised],
            message: `the entirely-surprised side (${payload.surprisedSide}) is asserted to act first — "If all the creatures on one side are surprised, then a creature on the other side gets to act first." Applied anyway (permissive engine, R-0030)`,
            data: {
              ruleViolation: { kind: 'surprised-first-side', participantId: null },
            },
          });
        }
      } else {
        roll = payload.roll ?? context.random.roll(10);
        const assignedTo = roll >= 6 ? 'players' : 'director';
        if (payload.chosenBy !== undefined && payload.chosenBy !== assignedTo) {
          log.push({
            kind: 'warning',
            intentId: intent.intentId,
            actor: intent.actor,
            canonRefs: [ECONOMY_CANON.combatRound],
            message: `the d10 rolled ${roll}, assigning the first-side choice to the ${assignedTo === 'players' ? 'players ("On a 6 or higher, the players determine who goes first")' : 'Director ("Otherwise, the Director decides which side goes first")'} — ${payload.chosenBy} chose instead. Applied anyway (Director-deviation policy, R-0030)`,
            data: { ruleViolation: { kind: 'first-side-choice-deviation', participantId: null } },
          });
        }
      }
      const turnState = {
        round: 1,
        firstSide: payload.firstSide,
        sideToChoose: payload.firstSide,
        activeTurnId: null,
        lastTurnId: null,
        turnsTaken: {},
      };
      log.push({
        kind: 'mutation',
        intentId: intent.intentId,
        actor: intent.actor,
        canonRefs: [ECONOMY_CANON.combatRound],
        message: `combat begins — round 1, ${payload.firstSide} act first${roll !== null ? ` (d10: ${roll}${payload.roll !== undefined ? ', asserted' : ''})` : payload.surprisedSide !== null ? ` (${payload.surprisedSide} are entirely surprised and cede the first action)` : ''}`,
        data: {
          turnStateInitialized: true,
          beginCombat: {
            firstSide: payload.firstSide,
            surprisedSide: payload.surprisedSide,
            roll,
            rollAsserted: payload.roll !== undefined,
          },
          // Re-begin claims: a mid-combat reinitialization clears the
          // villain economy and the resolution stack; the claims keep the
          // state↔log walk whole.
          ...(state.villainActions.usedThisRound
            ? { villainEconomyDeltas: [{ usedThisRoundFrom: true, usedThisRoundTo: false }] }
            : {}),
          ...(state.villainActions.usedByAbility.length > 0
            ? { villainAbilitiesCleared: state.villainActions.usedByAbility }
            : {}),
          ...(state.resolutionStack.length > 0
            ? {
                resolutionsCleared: state.resolutionStack.map(
                  (candidate) => candidate.resolutionId,
                ),
              }
            : {}),
        },
      });
      return {
        state: {
          ...state,
          turnState,
          villainActions: { usedThisRound: false, usedByAbility: [] },
          resolutionStack: [],
        },
        log,
      };
    }
    case 'start-turn': {
      const turnState = state.turnState;
      if (turnState === null) {
        return {
          state,
          log: [refusal(intent, 'combat has not begun — dispatch begin-combat first')],
        };
      }
      const turnId = intent.payload.turnId;
      const squad = state.squads.find((candidate) => candidate.squadId === turnId);
      const participant = state.participants[turnId];
      if (!participant && !squad) {
        return { state, log: [refusal(intent, `unknown participant or squad ${turnId}`)] };
      }
      const log: LogEntry[] = [];
      let nextState = state;
      const side: 'heroes' | 'director' = participant ? sideOfParticipant(participant) : 'director';

      if (participant?.traits.subActorOf !== null && participant?.traits.subActorOf !== undefined) {
        log.push({
          kind: 'warning',
          intentId: intent.intentId,
          actor: intent.actor,
          canonRefs: [ECONOMY_CANON.turn],
          message: `${turnId} is a declared sub-actor of ${participant.traits.subActorOf} — sub-actors spend budgets within their owner's turn and do not take turns of their own. Applied anyway (permissive engine, R-0030)`,
          data: { ruleViolation: { kind: 'sub-actor-turn', participantId: turnId } },
        });
      }
      const memberSquad = participant
        ? state.squads.find((candidate) => candidate.memberIds.includes(turnId))
        : undefined;
      if (memberSquad) {
        log.push({
          kind: 'warning',
          intentId: intent.intentId,
          actor: intent.actor,
          canonRefs: [ECONOMY_CANON.squad],
          message: `${turnId} is a member of ${memberSquad.squadId} — "All members of a minion squad act together on the same initiative" (the squad occupies one turn slot) [R-0033]. Applied anyway (permissive engine, R-0030)`,
          data: { ruleViolation: { kind: 'squad-member-turn', participantId: turnId } },
        });
      }

      // ── allowance: printed one turn per round; solo traits and turn
      // grants extend it; a turn grant consumes SILENTLY [R-0030] ─────────
      const taken = turnState.turnsTaken[turnId] ?? 0;
      const allowance = participant?.traits.turnAllowance ?? 1;
      let consumedTurnGrant = false;
      let noConsecutiveFromGrant = false;
      if (taken >= allowance && participant) {
        const grant = participant.grants.find(
          (candidate) => candidate.kind === 'turn' && candidate.mode === 'allowance',
        );
        if (grant && grant.kind === 'turn') {
          consumedTurnGrant = true;
          noConsecutiveFromGrant = grant.constraint === 'no-consecutive';
          const remaining =
            grant.magnitude > 1
              ? participant.grants.map((candidate) =>
                  candidate === grant
                    ? { ...candidate, magnitude: candidate.magnitude - 1 }
                    : candidate,
                )
              : participant.grants.filter((candidate) => candidate !== grant);
          nextState = {
            ...nextState,
            participants: {
              ...nextState.participants,
              [turnId]: { ...participant, grants: remaining },
            },
          };
          log.push({
            kind: 'mutation',
            intentId: intent.intentId,
            actor: intent.actor,
            canonRefs: [ECONOMY_CANON.combatRound],
            message: `${turnId} takes an additional turn through a granted allowance (printed escape — no warning) [R-0030]`,
            data:
              grant.magnitude > 1
                ? { grantMagnitudeConsumed: grant.grantId }
                : { removedGrantIds: [grant.grantId] },
          });
        }
      }
      if (taken >= allowance && !consumedTurnGrant) {
        log.push({
          kind: 'warning',
          intentId: intent.intentId,
          actor: intent.actor,
          canonRefs: [ECONOMY_CANON.combatRound],
          message: `${turnId} acts again after taking ${taken} turn(s) this round — "Unless an ability or special rule allows them to do so, any creature who has taken a turn during a combat round can't act again until a new round begins". Applied anyway (permissive engine, R-0030)`,
          data: { ruleViolation: { kind: 'already-acted', participantId: turnId } },
        });
      }

      // ── no-consecutive: the printed multi-turn solo constraint ─────────
      const noConsecutive =
        (participant?.traits.noConsecutiveTurns ?? false) || noConsecutiveFromGrant;
      if (noConsecutive && turnState.lastTurnId === turnId) {
        log.push({
          kind: 'warning',
          intentId: intent.intentId,
          actor: intent.actor,
          canonRefs: [ECONOMY_CANON.combatRound],
          message: `${turnId} takes consecutive turns — their printed multi-turn allowance says "They can't take turns consecutively". Applied anyway (permissive engine, R-0030)`,
          data: { ruleViolation: { kind: 'consecutive-turns', participantId: turnId } },
        });
      }

      // ── alternation: warn out-of-order unless an insertion grant covers
      // it or the choosing side has no living unspent turns (tail-of-round
      // free order) ──────────────────────────────────────────────────────
      let consumedInsertion = false;
      if (side !== turnState.sideToChoose) {
        const insertionHolder = nextState.participants[turnId];
        const insertion = insertionHolder?.grants.find(
          (candidate) => candidate.kind === 'turn' && candidate.mode === 'insertion',
        );
        if (insertionHolder && insertion && insertion.kind === 'turn') {
          consumedInsertion = true;
          // Magnitude-aware consumption — decrement, remove at 0 (the same
          // shape as the allowance grant's consumption above).
          const remainingInsertionGrants =
            insertion.magnitude > 1
              ? insertionHolder.grants.map((candidate) =>
                  candidate === insertion
                    ? { ...candidate, magnitude: candidate.magnitude - 1 }
                    : candidate,
                )
              : insertionHolder.grants.filter((candidate) => candidate !== insertion);
          nextState = {
            ...nextState,
            participants: {
              ...nextState.participants,
              [turnId]: {
                ...insertionHolder,
                grants: remainingInsertionGrants,
              },
            },
          };
          log.push({
            kind: 'mutation',
            intentId: intent.intentId,
            actor: intent.actor,
            canonRefs: [ECONOMY_CANON.combatRound],
            message: `${turnId} takes an inserted out-of-order turn through a grant (printed-scheduling escape — no warning) [R-0030]`,
            data:
              insertion.magnitude > 1
                ? { grantMagnitudeConsumed: insertion.grantId }
                : { removedGrantIds: [insertion.grantId] },
          });
        }
        if (!consumedInsertion) {
          const sideExhausted = Object.values(state.participants)
            .filter(
              (candidate) =>
                sideOfParticipant(candidate) === turnState.sideToChoose &&
                candidate.traits.subActorOf === null &&
                !state.squads.some((squadCandidate) =>
                  squadCandidate.memberIds.includes(candidate.id),
                ),
            )
            .every(
              (candidate) =>
                (turnState.turnsTaken[candidate.id] ?? 0) >= candidate.traits.turnAllowance,
            );
          if (!sideExhausted) {
            log.push({
              kind: 'warning',
              intentId: intent.intentId,
              actor: intent.actor,
              canonRefs: [ECONOMY_CANON.combatRound],
              message: `${turnId} (${side}) acts while the turn choice belongs to ${turnState.sideToChoose} (side alternation, Heroes p.267). Applied anyway (permissive engine, R-0030)`,
              data: { ruleViolation: { kind: 'out-of-alternation', participantId: turnId } },
            });
          }
        }
      }

      // ── mutations: the turn opens ──────────────────────────────────────
      const nextTurnsTaken = { ...turnState.turnsTaken, [turnId]: taken + 1 };
      nextState = {
        ...nextState,
        turnState: {
          ...turnState,
          activeTurnId: turnId,
          sideToChoose: side === 'heroes' ? 'director' : 'heroes',
          turnsTaken: nextTurnsTaken,
        },
      };
      log.push({
        kind: 'mutation',
        intentId: intent.intentId,
        actor: intent.actor,
        canonRefs: [ECONOMY_CANON.turn],
        message: `${turnId} starts their turn (round ${turnState.round})`,
        data: {
          turnStateDeltas: [
            { field: 'activeTurnId', from: turnState.activeTurnId, to: turnId },
            ...(turnState.sideToChoose !== (side === 'heroes' ? 'director' : 'heroes')
              ? [
                  {
                    field: 'sideToChoose',
                    from: turnState.sideToChoose,
                    to: side === 'heroes' ? 'director' : 'heroes',
                  },
                ]
              : []),
          ],
          turnsTakenDeltas: [{ turnId, from: taken, to: taken + 1 }],
        },
      });
      // Fresh printed budget for the acting participants (a two-turn solo
      // gets a new budget each turn); declared sub-actors of the starter
      // ride along [design §3].
      const actingIds = [
        ...(squad ? squad.memberIds : [turnId]),
        ...Object.values(state.participants)
          .filter((candidate) => candidate.traits.subActorOf === turnId)
          .map((candidate) => candidate.id),
      ];
      const swept = runBoundarySweeps(
        nextState,
        { kind: 'start-of-turn', participantIds: actingIds },
        lifecycleContext,
      );
      return { state: swept.state, log: [...log, ...swept.log] };
    }
    case 'advance-round': {
      const turnState = state.turnState;
      if (turnState === null) {
        return {
          state,
          log: [refusal(intent, 'combat has not begun — dispatch begin-combat first')],
        };
      }
      const log: LogEntry[] = [];
      // Advisory warn [design §3, red-team F6]: the printed round
      // definition ("Once every creature has taken a turn, a new round
      // begins") is uncomputable from engine state (dead/skipped actors,
      // sub-actors), so round advance is Director-asserted; the engine
      // lists living turn-takers with unspent turns.
      const unspent: string[] = [];
      for (const participant of Object.values(state.participants)) {
        if (participant.traits.subActorOf !== null) continue;
        if (state.squads.some((candidate) => candidate.memberIds.includes(participant.id)))
          continue;
        const alive =
          participant.stamina === null ||
          participant.kind === 'hero' ||
          participant.stamina.current > 0;
        if (!alive) continue;
        if ((turnState.turnsTaken[participant.id] ?? 0) < participant.traits.turnAllowance) {
          unspent.push(participant.id);
        }
      }
      for (const squad of state.squads) {
        if (squad.memberIds.length === 0) continue;
        if ((turnState.turnsTaken[squad.squadId] ?? 0) < 1) unspent.push(squad.squadId);
      }
      if (unspent.length > 0) {
        log.push({
          kind: 'warning',
          intentId: intent.intentId,
          actor: intent.actor,
          canonRefs: [ECONOMY_CANON.combatRound],
          message: `round advances with living unspent turns: ${unspent.join(', ')} — "During a combat round, each creature in the battle takes a turn." Applied anyway (Director-asserted round advance, R-0030)`,
          data: {
            ruleViolation: { kind: 'unspent-turns', participantId: null },
            unspentTurns: unspent,
          },
        });
      }
      const swept = runBoundarySweeps(state, { kind: 'start-of-round' }, lifecycleContext);
      return { state: swept.state, log: [...log, ...swept.log] };
    }
    case 'convert-action': {
      const turnState = state.turnState;
      if (turnState === null) {
        return {
          state,
          log: [refusal(intent, 'combat has not begun — dispatch begin-combat first')],
        };
      }
      const participant = state.participants[intent.payload.participantId];
      if (!participant) {
        return {
          state,
          log: [refusal(intent, `unknown participant ${intent.payload.participantId}`)],
        };
      }
      // "You can also turn your main action into a move action or a
      // maneuver" [rule.combat/turn]: debit the main action through the
      // one home (its violations warn there), then grant the target cost.
      const debited = debitActionCost(
        state,
        {
          cost: 'main-action',
          payerId: participant.id,
          abilityKey: `convert-action:${intent.payload.to}`,
          usesPerRound: null,
          partOf: null,
          sharesAbilityUse: false,
        },
        lifecycleContext,
      );
      const afterDebit = debited.state.participants[participant.id];
      if (!afterDebit) return { state, log: debited.log };
      const cell = afterDebit.actionBudget[intent.payload.to] ?? { used: 0, granted: 0 };
      const nextCell = { used: cell.used, granted: cell.granted + 1 };
      const nextState = {
        ...debited.state,
        participants: {
          ...debited.state.participants,
          [participant.id]: {
            ...afterDebit,
            actionBudget: { ...afterDebit.actionBudget, [intent.payload.to]: nextCell },
          },
        },
      };
      return {
        state: nextState,
        log: [
          ...debited.log,
          {
            kind: 'mutation',
            intentId: intent.intentId,
            actor: intent.actor,
            canonRefs: [ECONOMY_CANON.turn],
            message: `${participant.id} turns their main action into a ${intent.payload.to} — "You can also turn your main action into a move action or a maneuver"`,
            data: {
              actionBudgetDeltas: [
                {
                  participantId: participant.id,
                  cost: intent.payload.to,
                  usedFrom: cell.used,
                  usedTo: nextCell.used,
                  grantedFrom: cell.granted,
                  grantedTo: nextCell.granted,
                },
              ],
              actionConverted: { from: 'main-action', to: intent.payload.to },
            },
          },
        ],
      };
    }
    case 'use-triggered-action': {
      const turnState = state.turnState;
      if (turnState === null) {
        return {
          state,
          log: [refusal(intent, 'combat has not begun — dispatch begin-combat first')],
        };
      }
      const participant = state.participants[intent.payload.participantId];
      if (!participant) {
        return {
          state,
          log: [refusal(intent, `unknown participant ${intent.payload.participantId}`)],
        };
      }
      const log: LogEntry[] = [
        {
          kind: 'informational',
          intentId: intent.intentId,
          actor: intent.actor,
          canonRefs: [ECONOMY_CANON.triggeredAction, intent.payload.abilityArtifactId],
          message:
            intent.payload.trigger === null
              ? `${participant.id} uses ${intent.payload.abilityArtifactId} with no recorded trigger occurrence — the trigger is table-asserted ("only when the action's trigger occurs")`
              : intent.payload.trigger.kind === 'occurrence'
                ? `${participant.id} uses ${intent.payload.abilityArtifactId}, triggered by dispatch ${intent.payload.trigger.intentId}`
                : `${participant.id} uses ${intent.payload.abilityArtifactId}; asserted trigger: ${intent.payload.trigger.text}`,
          data: { trigger: intent.payload.trigger },
        },
      ];
      const debited = debitActionCost(
        state,
        {
          cost: intent.payload.free ? 'free-triggered-action' : 'triggered-action',
          payerId: participant.id,
          abilityKey: intent.payload.abilityArtifactId,
          usesPerRound: intent.payload.perRoundCap,
          partOf: null,
          sharesAbilityUse: false,
        },
        lifecycleContext,
      );
      return { state: debited.state, log: [...log, ...debited.log] };
    }
    case 'use-villain-action': {
      const turnState = state.turnState;
      if (turnState === null) {
        return {
          state,
          log: [refusal(intent, 'combat has not begun — dispatch begin-combat first')],
        };
      }
      const participant = state.participants[intent.payload.participantId];
      if (!participant) {
        return {
          state,
          log: [refusal(intent, `unknown participant ${intent.payload.participantId}`)],
        };
      }
      const debited = debitActionCost(
        state,
        {
          cost: 'villain-action',
          payerId: participant.id,
          abilityKey: intent.payload.abilityArtifactId,
          usesPerRound: null,
          partOf: null,
          sharesAbilityUse: false,
        },
        lifecycleContext,
      );
      return debited;
    }
    case 'add-grant': {
      const target = state.participants[intent.payload.target];
      if (!target) {
        return { state, log: [refusal(intent, `unknown participant ${intent.payload.target}`)] };
      }
      // Deterministic identity, like condition instances: derived from the
      // (host-unique) intent id.
      const grant = { ...intent.payload.grant, grantId: `grant#${intent.intentId}` };
      const added = appendGrant(state, { target, grant }, lifecycleContext);
      return added;
    }
    case 'commit-resolution': {
      const committed = commitResolutionEntry(
        state,
        {
          resolutionId: intent.payload.resolutionId,
          payload: intent.payload.payload,
          forced: false,
        },
        lifecycleContext,
      );
      if (!committed.ok) return { state, log: [refusal(intent, committed.refusal)] };
      return { state: committed.state, log: committed.log };
    }
    case 'modify-resolution': {
      const stackEntry = state.resolutionStack.find(
        (candidate) => candidate.resolutionId === intent.payload.resolutionId,
      );
      if (!stackEntry) {
        return {
          state,
          log: [refusal(intent, `unknown resolution ${intent.payload.resolutionId}`)],
        };
      }
      const log: LogEntry[] = [];
      if (!isOpenResolution(stackEntry)) {
        // "Anything arriving after commit is a warned table correction,
        // not a reopen" [R-0032]: recorded on the entry's history with a
        // warning; nothing re-executes.
        log.push({
          kind: 'warning',
          intentId: intent.intentId,
          actor: intent.actor,
          canonRefs: [],
          message: `modification arrives after resolution ${stackEntry.resolutionId} committed — recorded as a table correction, not a reopen; the Director adjudicates [R-0032]`,
          data: {
            ruleViolation: {
              kind: 'post-commit-modification',
              participantId: stackEntry.actorId,
            },
          },
        });
      }
      const nextState = {
        ...state,
        resolutionStack: state.resolutionStack.map((candidate) =>
          candidate.resolutionId === stackEntry.resolutionId
            ? {
                ...candidate,
                modifications: [...candidate.modifications, intent.payload.modification],
              }
            : candidate,
        ),
      };
      log.push({
        kind: 'mutation',
        intentId: intent.intentId,
        actor: intent.actor,
        canonRefs: [stackEntry.abilityArtifactId],
        message: `resolution ${stackEntry.resolutionId} records a ${intent.payload.modification.kind} modification (modifications apply in dispatch order at commit)`,
        data: {
          resolutionModificationDeltas: [
            {
              resolutionId: stackEntry.resolutionId,
              from: stackEntry.modifications.length,
              to: stackEntry.modifications.length + 1,
            },
          ],
          modificationRecorded: intent.payload.modification,
        },
      });
      return { state: nextState, log };
    }
    case 'resolve-pending-kills': {
      // Identity assignment for pool-counted kills [R-0024]: "the minions
      // nearest to those taken out suffer the same fate" is spatial, so the
      // Director-or-damager names the victims. The 0-Stamina trigger receipt
      // fired ANONYMOUSLY when each kill was counted (the count-time entry
      // carries `zeroStaminaTrigger: { pending: true, … }`) — naming only
      // assigns identity, never a second trigger [R-0027].
      const squad = state.squads.find((candidate) => candidate.squadId === intent.payload.squadId);
      if (!squad) {
        return { state, log: [refusal(intent, `unknown squad ${intent.payload.squadId}`)] };
      }
      const victims = intent.payload.victimMemberIds;
      if (new Set(victims).size !== victims.length) {
        return { state, log: [refusal(intent, 'victimMemberIds must be distinct')] };
      }
      if (victims.length > squad.pendingKills) {
        return {
          state,
          log: [
            refusal(
              intent,
              `${victims.length} victims named but only ${squad.pendingKills} kill(s) await identity in ${squad.name}`,
            ),
          ],
        };
      }
      const notLiving = victims.filter((victimId) => !squad.memberIds.includes(victimId));
      if (notLiving.length > 0) {
        return {
          state,
          log: [
            refusal(
              intent,
              `${notLiving.join(', ')} ${notLiving.length === 1 ? 'is not a living member' : 'are not living members'} of ${squad.name}`,
            ),
          ],
        };
      }
      const nextSquad = {
        ...squad,
        memberIds: squad.memberIds.filter((memberId) => !victims.includes(memberId)),
        deadMemberIds: [...squad.deadMemberIds, ...victims],
        pendingKills: squad.pendingKills - victims.length,
      };
      return {
        state: withSquad(state, nextSquad),
        log: [
          {
            kind: 'mutation',
            intentId: intent.intentId,
            actor: intent.actor,
            canonRefs: [MINION_CANON.droppingMultiple],
            message: `${victims.join(', ')} identified as the pool's counted kill(s) in ${squad.name}${intent.payload.reason ? ` (${intent.payload.reason})` : ''} — the 0-Stamina trigger fired anonymously when each kill was counted; naming assigns identity only`,
            data: {
              squadDeaths: victims.map((memberId) => ({ squadId: squad.squadId, memberId })),
              pendingKillsDeltas: [
                {
                  squadId: squad.squadId,
                  from: squad.pendingKills,
                  to: nextSquad.pendingKills,
                },
              ],
            },
          },
        ],
      };
    }
    case 'attach-captain': {
      // R-0028: attachment is tracked state; Director authority (trust gates
      // live in the host). Captain Stamina stays individual — no pool math.
      const squad = state.squads.find((candidate) => candidate.squadId === intent.payload.squadId);
      if (!squad) {
        return { state, log: [refusal(intent, `unknown squad ${intent.payload.squadId}`)] };
      }
      const captain = state.participants[intent.payload.captainId];
      if (!captain) {
        return { state, log: [refusal(intent, `unknown participant ${intent.payload.captainId}`)] };
      }
      if (isMinion(captain)) {
        // "Any non-Mount, non-minion creature … can be attached to that
        // squad as a captain" [rule.monster/captain] — a minion captain is
        // canon-incoherent state the schema/invariants cannot hold.
        return {
          state,
          log: [
            refusal(
              intent,
              `${captain.id} is a minion — only a non-minion creature can captain a squad`,
            ),
          ],
        };
      }
      if (squad.captainId === captain.id) {
        return {
          state,
          log: [
            {
              kind: 'informational',
              intentId: intent.intentId,
              actor: intent.actor,
              canonRefs: [MINION_CANON.captain],
              message: `${captain.id} already captains ${squad.name} — nothing to change`,
              data: {},
            },
          ],
        };
      }
      const log: LogEntry[] = [];
      let nextState = state;
      if (squad.captainId !== null) {
        // "A squad of minions can have only one captain" — replacing is the
        // Director exercising the printed rule; warn for visibility.
        log.push({
          kind: 'warning',
          intentId: intent.intentId,
          actor: intent.actor,
          canonRefs: [MINION_CANON.captain],
          message: `${squad.name} already has captain ${squad.captainId} — replaced by ${captain.id} (a squad can have only one captain)`,
          data: { replacedCaptainId: squad.captainId, squadId: squad.squadId },
        });
      }
      // "a creature can't be captain to more than one squad of minions" —
      // attaching moves them; warn and detach from the old squad.
      const previousSquad = nextState.squads.find(
        (candidate) => candidate.squadId !== squad.squadId && candidate.captainId === captain.id,
      );
      if (previousSquad) {
        log.push({
          kind: 'warning',
          intentId: intent.intentId,
          actor: intent.actor,
          canonRefs: [MINION_CANON.captain],
          message: `${captain.id} already captains ${previousSquad.name} — detached from it (a creature can't be captain to more than one squad)`,
          data: { detachedFromSquadId: previousSquad.squadId },
        });
        log.push({
          kind: 'mutation',
          intentId: intent.intentId,
          actor: intent.actor,
          canonRefs: [MINION_CANON.captain],
          message: `${captain.id} is no longer the captain of ${previousSquad.name}`,
          data: {
            captainDeltas: [{ squadId: previousSquad.squadId, from: captain.id, to: null }],
          },
        });
        const shifted = shiftCaptainBenefit(nextState, previousSquad, 'detach', lifecycleContext);
        nextState = shifted.state;
        log.push(...shifted.log);
        nextState = withSquad(nextState, { ...shifted.squad, captainId: null });
      }
      // The printed eligibility is "Any non-Mount, non-minion creature, who
      // speaks a language that a squad of minions can understand"
      // [rule.monster/captain]. The engine verifies ONLY non-minion —
      // statblock stats parse no roles and no languages — so the receipt
      // names the two table-asserted halves explicitly [R-0028].
      log.push({
        kind: 'mutation',
        intentId: intent.intentId,
        actor: intent.actor,
        canonRefs: [MINION_CANON.captain],
        message: `${captain.id} is attached to ${squad.name} as its captain — the engine verified only that they are not a minion; that they are not a Mount and speak a language the squad can understand is table-asserted. With-Captain benefits apply per the stat block (table-adjudicated); the captain's Stamina stays individual`,
        data: {
          captainDeltas: [{ squadId: squad.squadId, from: squad.captainId, to: captain.id }],
          tableAssertedEligibility: ['non-Mount role', 'shared language'],
        },
      });
      const liveSquad =
        nextState.squads.find((candidate) => candidate.squadId === squad.squadId) ?? squad;
      nextState = withSquad(nextState, { ...liveSquad, captainId: captain.id });
      if (liveSquad.captainId === null) {
        const shifted = shiftCaptainBenefit(
          nextState,
          { ...liveSquad, captainId: captain.id },
          'attach',
          lifecycleContext,
        );
        nextState = shifted.state;
        log.push(...shifted.log);
      }
      return { state: nextState, log };
    }
    case 'detach-captain': {
      const squad = state.squads.find((candidate) => candidate.squadId === intent.payload.squadId);
      if (!squad) {
        return { state, log: [refusal(intent, `unknown squad ${intent.payload.squadId}`)] };
      }
      if (squad.captainId === null) {
        return { state, log: [refusal(intent, `${squad.name} has no captain attached`)] };
      }
      const shifted = shiftCaptainBenefit(state, squad, 'detach', lifecycleContext);
      return {
        state: withSquad(shifted.state, { ...shifted.squad, captainId: null }),
        log: [
          ...shifted.log,
          {
            kind: 'mutation',
            intentId: intent.intentId,
            actor: intent.actor,
            canonRefs: [MINION_CANON.captain],
            message: `${squad.captainId} is detached from ${squad.name}${intent.payload.reason ? ` (${intent.payload.reason})` : ''} — a new allied creature can become captain at the start of the next round (no action required)`,
            data: {
              captainDeltas: [{ squadId: squad.squadId, from: squad.captainId, to: null }],
            },
          },
        ],
      };
    }
    case 'clear-terrain-fact': {
      const fact = state.terrainFacts.find(
        (candidate) => candidate.factId === intent.payload.factId,
      );
      if (!fact) {
        return { state, log: [refusal(intent, `unknown terrain fact ${intent.payload.factId}`)] };
      }
      return {
        state: {
          ...state,
          terrainFacts: state.terrainFacts.filter((candidate) => candidate !== fact),
        },
        log: [
          {
            kind: 'mutation',
            intentId: intent.intentId,
            actor: intent.actor,
            canonRefs: [TERRAIN_CANON.difficultTerrain],
            message: `terrain fact cleared${intent.payload.reason ? `: ${intent.payload.reason}` : ''} — the area${fact.areaText ? ` (${fact.areaText})` : ''} is no longer difficult terrain`,
            data: { terrainFactCleared: fact },
          },
        ],
      };
    }
  }
}

/** Reducer wrapper for R-0038's only automatic captain transition: when a
 * dispatch kills an attached captain, detach immediately and remove the
 * live With-Captain benefit (including R-0039's pool shift). */
export function applyIntent(
  state: EncounterState,
  rawIntent: Intent,
  context: EngineContext,
): ApplyResult {
  const result = applyIntentCore(state, rawIntent, context);
  if (result.state === state || result.log.some((item) => item.kind === 'refusal')) return result;
  const lifecycleContext = { intentId: rawIntent.intentId, actor: rawIntent.actor };
  let nextState = result.state;
  const log = [...result.log];
  for (const original of result.state.squads) {
    if (original.captainId === null) continue;
    const captain = nextState.participants[original.captainId];
    if (!captain || !isDead(captain)) continue;
    const liveSquad =
      nextState.squads.find((candidate) => candidate.squadId === original.squadId) ?? original;
    const shifted = shiftCaptainBenefit(nextState, liveSquad, 'detach', lifecycleContext);
    nextState = withSquad(shifted.state, { ...shifted.squad, captainId: null });
    log.push(...shifted.log, {
      kind: 'mutation',
      intentId: rawIntent.intentId,
      actor: rawIntent.actor,
      canonRefs: [MINION_CANON.captain],
      message: `${original.captainId} died and is automatically detached from ${original.name}; a new allied creature can become captain at the start of the next round (no action required)`,
      data: {
        captainDeltas: [{ squadId: original.squadId, from: original.captainId, to: null }],
        automaticCaptainDetach: { squadId: original.squadId, captainId: original.captainId },
      },
    });
  }
  return { state: nextState, log };
}
