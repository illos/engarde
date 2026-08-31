import { describe, expect, it } from 'vitest';
import { type ApplyResult, applyIntent } from './apply-intent.js';
import { createSeededRandomSource } from './determinism.js';
import { initialEncounterState } from './driver.js';
import { checkInvariants } from './invariants.js';
import type { EncounterState, Intent, ParticipantStats } from './schemas.js';

/**
 * The asserted band as ONE family [S11, R-0029/R-0030].
 *
 * `apply-condition`, `apply-damage` and `remove-condition` all accept a
 * manual assertion that a named ability was used, and all three route it
 * through `assertedEconomyPrelude`. These are fires-in-anger dispatch tests
 * — every case goes through `applyIntent` with the invariant oracle on it.
 */

/** Goblin warrior (committed verbatim fixture): staminaMax 15; M −2, A +2. */
const GOBLIN_WARRIOR_STATS: ParticipantStats = {
  staminaMax: 15,
  characteristics: { might: -2, agility: 2, reason: 0, intuition: 0, presence: -1 },
  immunities: [],
  weaknesses: [],
  potencies: null,
  organization: 'Horde',
  recoveriesMax: null,
  freeStrike: null,
  withCaptain: null,
  withCaptainBenefit: null,
};

/** Real pinned artifacts only (prime directive). */
const PRONE = 'mcdm.heroes.v1/condition/prone';
const KNOCKBACK_ABILITY = 'mcdm.heroes.v1/feature.ability.common/knockback';
const STAND_UP = 'mcdm.heroes.v1/feature.common.maneuvers/stand-up';

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

function dispatchChecked(state: EncounterState, intent: Intent, seed = 1): ApplyResult {
  const result = applyIntent(state, intent, { random: createSeededRandomSource(seed) });
  expect(checkInvariants(state, intent, result)).toEqual([]);
  return result;
}

function onHeroTurn(): EncounterState {
  const begun = dispatchChecked(
    initialEncounterState([
      { id: 'hero', kind: 'hero', stats: { ...GOBLIN_WARRIOR_STATS, recoveriesMax: 8 } },
      { id: 'warrior', kind: 'director-creature', stats: GOBLIN_WARRIOR_STATS },
    ]),
    {
      intentId: nextId('begin'),
      kind: 'begin-combat',
      actor: { kind: 'director' },
      payload: { firstSide: 'heroes', roll: 7 },
    },
  ).state;
  return dispatchChecked(begun, {
    intentId: nextId('start'),
    kind: 'start-turn',
    actor: { kind: 'director' },
    payload: { turnId: 'hero' },
  }).state;
}

/** The hero imposes prone on the warrior with a named ability, so the
 * removal below has both a real instance and a real imposer. */
function proneOnWarrior(state: EncounterState): { state: EncounterState; instanceId: string } {
  const applied = dispatchChecked(state, {
    intentId: nextId('impose'),
    kind: 'apply-condition',
    actor: { kind: 'participant', participantId: 'hero' },
    payload: {
      target: 'warrior',
      conditionId: PRONE,
      ending: { kind: 'external' },
      source: { participantId: 'hero', effectArtifactId: KNOCKBACK_ABILITY },
    },
  });
  const instanceId = applied.state.participants.warrior?.conditions[0]?.instanceId ?? '';
  expect(instanceId).not.toBe('');
  return { state: applied.state, instanceId };
}

describe('remove-condition — the asserted band [S11]', () => {
  it('debits the asserted ability cost through the one home and records the claim', () => {
    const { state, instanceId } = proneOnWarrior(onHeroTurn());
    const result = dispatchChecked(state, {
      intentId: nextId('remove'),
      kind: 'remove-condition',
      actor: { kind: 'participant', participantId: 'hero' },
      payload: {
        target: 'warrior',
        instanceId,
        assertedAbilityUse: {
          actorParticipantId: 'hero',
          abilityArtifactId: STAND_UP,
          actionCost: 'maneuver',
        },
      },
    });

    expect(result.state.participants.warrior?.conditions).toHaveLength(0);
    expect(result.state.participants.hero?.actionBudget.maneuver).toEqual({ used: 1, granted: 0 });
    expect(result.state.participants.hero?.abilityUses[STAND_UP]).toEqual({
      round: 1,
      turn: 1,
      encounter: 1,
    });
    // The same nonrolling application claim `apply-condition` records — one
    // shape, so `deriveOccurrences` reads all three arms identically.
    const claim = result.log.find((entry) => entry.data.nonrollingAbilityApplication !== undefined);
    expect(claim?.canonRefs).toContain(STAND_UP);
  });

  it('is MUTUALLY EXCLUSIVE with the R-0001 imposer free maneuver', () => {
    // The hero imposed the prone AND asserts an ability that ends it — both
    // economy predicates hold on one dispatch. One printed removal, one
    // cost: the asserted band names it, so the free maneuver does not also
    // tick the imposing ability's counter.
    const { state, instanceId } = proneOnWarrior(onHeroTurn());
    const withBand = dispatchChecked(state, {
      intentId: nextId('remove'),
      kind: 'remove-condition',
      actor: { kind: 'participant', participantId: 'hero' },
      payload: {
        target: 'warrior',
        instanceId,
        assertedAbilityUse: {
          actorParticipantId: 'hero',
          abilityArtifactId: STAND_UP,
          actionCost: 'maneuver',
        },
      },
    });
    expect(withBand.state.participants.hero?.abilityUses[KNOCKBACK_ABILITY]).toBeUndefined();
    expect(withBand.state.participants.hero?.abilityUses[STAND_UP]).toBeDefined();

    // Without the band the imposer default still applies, unchanged: a free
    // maneuver spends no budget, and its trace is the imposing ability's
    // own use counter.
    const withoutBand = dispatchChecked(state, {
      intentId: nextId('remove'),
      kind: 'remove-condition',
      actor: { kind: 'participant', participantId: 'hero' },
      payload: { target: 'warrior', instanceId },
    });
    expect(withoutBand.state.participants.hero?.abilityUses[KNOCKBACK_ABILITY]).toEqual({
      round: 1,
      turn: 1,
      encounter: 1,
    });
    // A free maneuver has no budget row at all — nothing was spent.
    expect(withoutBand.state.participants.hero?.actionBudget.maneuver).toBeUndefined();
  });

  it('refuses an unknown instance BEFORE the debit — no cost for a removal that never happened', () => {
    const state = proneOnWarrior(onHeroTurn()).state;
    const result = dispatchChecked(state, {
      intentId: nextId('remove'),
      kind: 'remove-condition',
      actor: { kind: 'participant', participantId: 'hero' },
      payload: {
        target: 'warrior',
        instanceId: 'no-such-instance',
        assertedAbilityUse: {
          actorParticipantId: 'hero',
          abilityArtifactId: STAND_UP,
          actionCost: 'maneuver',
        },
      },
    });
    expect(result.log).toHaveLength(1);
    expect(result.log[0]?.kind).toBe('refusal');
    // The whole point of the hoist: state is byte-identical, so the
    // maneuver was not spent.
    expect(result.state).toEqual(state);
  });

  it('refuses an asserted payer who is not in the encounter', () => {
    const { state, instanceId } = proneOnWarrior(onHeroTurn());
    const result = dispatchChecked(state, {
      intentId: nextId('remove'),
      kind: 'remove-condition',
      actor: { kind: 'director' },
      payload: {
        target: 'warrior',
        instanceId,
        assertedAbilityUse: {
          actorParticipantId: 'ghost',
          abilityArtifactId: STAND_UP,
          actionCost: 'maneuver',
        },
      },
    });
    expect(result.log[0]?.kind).toBe('refusal');
    expect(result.state).toEqual(state);
  });

  it('records the claim outside combat, where the debit is a documented no-op', () => {
    // Pre-combat posture: `turnState === null` means there is no budget to
    // spend, but an asserted use is still a use and still lands on the log.
    const noCombat = initialEncounterState([
      { id: 'hero', kind: 'hero', stats: GOBLIN_WARRIOR_STATS },
      { id: 'warrior', kind: 'director-creature', stats: GOBLIN_WARRIOR_STATS },
    ]);
    const { state, instanceId } = proneOnWarrior(noCombat);
    const result = dispatchChecked(state, {
      intentId: nextId('remove'),
      kind: 'remove-condition',
      actor: { kind: 'participant', participantId: 'hero' },
      payload: {
        target: 'warrior',
        instanceId,
        assertedAbilityUse: {
          actorParticipantId: 'hero',
          abilityArtifactId: STAND_UP,
          actionCost: 'maneuver',
        },
      },
    });
    expect(result.state.participants.warrior?.conditions).toHaveLength(0);
    expect(result.state.participants.hero?.abilityUses[STAND_UP]).toBeUndefined();
    expect(result.log.some((entry) => entry.data.nonrollingAbilityApplication !== undefined)).toBe(
      true,
    );
  });

  it('a partOf child records no second claim, on every arm of the family', () => {
    // The suppression rule lives in one function now; assert it holds for
    // the arm that just joined the family as well as the one it came from.
    const { state, instanceId } = proneOnWarrior(onHeroTurn());
    const removal = dispatchChecked(state, {
      intentId: nextId('remove'),
      kind: 'remove-condition',
      actor: { kind: 'participant', participantId: 'hero' },
      payload: {
        target: 'warrior',
        instanceId,
        assertedAbilityUse: {
          actorParticipantId: 'hero',
          abilityArtifactId: STAND_UP,
          actionCost: 'maneuver',
          partOf: 'parent-intent',
        },
      },
    });
    expect(removal.log.some((entry) => entry.data.nonrollingAbilityApplication !== undefined)).toBe(
      false,
    );

    const damage = dispatchChecked(onHeroTurn(), {
      intentId: nextId('damage'),
      kind: 'apply-damage',
      actor: { kind: 'participant', participantId: 'hero' },
      payload: {
        target: 'warrior',
        amount: 3,
        reason: 'asserted band',
        assertedAbilityUse: {
          actorParticipantId: 'hero',
          abilityArtifactId: KNOCKBACK_ABILITY,
          actionCost: 'maneuver',
          partOf: 'parent-intent',
        },
      },
    });
    expect(damage.log.some((entry) => entry.data.nonrollingAbilityApplication !== undefined)).toBe(
      false,
    );
  });
});
