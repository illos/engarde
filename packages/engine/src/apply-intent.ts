import { executeUseAbility } from './ability-execution.js';
import {
  CANON,
  SAVING_THROW,
  applyConditionInstance,
  endEncounterSweep,
  endOfTurnSweep,
  removeConditionInstance,
} from './condition-lifecycle.js';
import {
  MINION_CANON,
  applyDamage,
  damageAutomationBlocker,
  flushSquadContributions,
  isMinion,
  squadMemberStats,
  squadOf,
  withParticipant,
  withSquad,
} from './damage.js';
import type { RandomSource } from './determinism.js';
import { TERRAIN_CANON, executeUseEffect } from './effect-execution.js';
import { endEncounterGrantSweep, endOfTurnGrantSweep } from './grant-lifecycle.js';
import { HEALTH_CANON, isDying, isHealthSourcedInstance } from './health.js';
import { type EncounterState, type Intent, IntentSchema, type LogEntry } from './schemas.js';

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

export function applyIntent(
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
      return applyConditionInstance(
        state,
        {
          target,
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
      return removeConditionInstance(
        state,
        target,
        intent.payload.instanceId,
        lifecycleContext,
        [CANON.creatureEndsAbilityEffect],
        `condition instance removed from ${target.id}${intent.payload.reason ? `: ${intent.payload.reason}` : ''}`,
      );
    }
    case 'use-ability':
      return executeUseAbility(state, intent, context.random);
    case 'use-effect':
      return executeUseEffect(state, intent, context.random);
    case 'apply-damage': {
      const target = state.participants[intent.payload.target];
      if (!target) {
        return { state, log: [refusal(intent, `unknown participant ${intent.payload.target}`)] };
      }
      // A living squad member's damage decrements the shared pool — the ONE
      // home for squad vitality [R-0024]; the dispatch-asserted `area` flag
      // is the manual half of the R-0025 discriminator.
      const squad = isMinion(target) ? squadOf(state, intent.payload.target) : undefined;
      if (squad) {
        const preLog: LogEntry[] = [];
        // Manual area damage names ONE contributor per dispatch, but the
        // squad's weakness/immunity step applies "once, even if multiple
        // minions share the same immunity or weakness" per damage instance
        // [R-0026]. Warn when the squad's stats carry such a row: if the
        // same area effect damaged other squad members, they must be
        // batched into one dispatch or the adjustment multiply-applies —
        // one application per dispatch instead of one per instance.
        const squadStats = squadMemberStats(state, squad);
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
          state,
          new Map([
            [
              squad.squadId,
              [
                {
                  targetId: intent.payload.target,
                  damage: intent.payload.amount,
                  type: intent.payload.damageType ?? null,
                },
              ],
            ],
          ]),
          {
            area: intent.payload.area,
            namedVictims: intent.payload.minionKillVictims,
            reason: `(${intent.payload.reason})`,
          },
          lifecycleContext,
        );
        return { state: flushed.state, log: [...preLog, ...flushed.log] };
      }
      if (intent.payload.minionKillVictims.length > 0) {
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
      const blocker = damageAutomationBlocker(target);
      if (blocker !== null) {
        return {
          state,
          log: [
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
        target,
        { amount: intent.payload.amount, type: intent.payload.damageType ?? null },
        { knockOut: intent.payload.knockOut, reason: intent.payload.reason },
        lifecycleContext,
      );
      return { state: withParticipant(state, outcome.participant), log: outcome.log };
    }
    case 'end-turn': {
      const target = state.participants[intent.payload.participantId];
      if (!target) {
        return {
          state,
          log: [refusal(intent, `unknown participant ${intent.payload.participantId}`)],
        };
      }
      const swept = endOfTurnSweep(
        state,
        target,
        intent.payload.rolls ?? {},
        () => context.random.roll(SAVING_THROW.die),
        lifecycleContext,
      );
      // Windowed next-roll grants expire at the holder's end-turn event
      // [R-0016]; the same sweep is the current-turn clause.
      const liveTarget = swept.state.participants[intent.payload.participantId];
      if (!liveTarget) return swept;
      const grantSwept = endOfTurnGrantSweep(swept.state, liveTarget, lifecycleContext);
      return { state: grantSwept.state, log: [...swept.log, ...grantSwept.log] };
    }
    case 'end-encounter': {
      const swept = endEncounterSweep(
        state,
        intent.payload.keepInstanceIds,
        lifecycleContext,
        (participant, instance) =>
          isHealthSourcedInstance(instance) &&
          (instance.source.effectArtifactId !== HEALTH_CANON.dying ||
            (participant.stamina !== null && isDying(participant.stamina.current))),
      );
      // Every remaining next-roll grant clears with the encounter [R-0012];
      // out-of-encounter retention stays Director/table state.
      const grantsSwept = endEncounterGrantSweep(swept.state, lifecycleContext);
      // Temporary Stamina disappears at the end of an encounter
      // [rule.health/temporary-stamina].
      let nextState = grantsSwept.state;
      const log = [...swept.log, ...grantsSwept.log];
      for (const participant of Object.values(nextState.participants)) {
        if (participant.stamina !== null && participant.stamina.temporary > 0) {
          const cleared = {
            ...participant,
            stamina: { ...participant.stamina, temporary: 0 },
          };
          nextState = withParticipant(nextState, cleared);
          log.push({
            kind: 'mutation',
            intentId: intent.intentId,
            actor: intent.actor,
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
      // Terrain facts do not survive the encounter [R-0022].
      if (nextState.terrainFacts.length > 0) {
        log.push({
          kind: 'mutation',
          intentId: intent.intentId,
          actor: intent.actor,
          canonRefs: [TERRAIN_CANON.difficultTerrain],
          message: `${nextState.terrainFacts.length} recorded terrain fact(s) end with the encounter`,
          data: { terrainFactsCleared: nextState.terrainFacts.map((fact) => fact.factId) },
        });
        nextState = { ...nextState, terrainFacts: [] };
      }
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
        nextState = withSquad(nextState, { ...previousSquad, captainId: null });
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
      nextState = withSquad(nextState, { ...squad, captainId: captain.id });
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
      return {
        state: withSquad(state, { ...squad, captainId: null }),
        log: [
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
