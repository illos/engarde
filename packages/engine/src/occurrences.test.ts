import { describe, expect, it } from 'vitest';
import { applyIntent } from './apply-intent.js';
import { createSeededRandomSource } from './determinism.js';
import { initialEncounterState } from './driver.js';
import { checkInvariants } from './invariants.js';
import { deriveOccurrences } from './occurrences.js';
import type { EncounterState, Intent, LogEntry, ParticipantStats } from './schemas.js';

/**
 * Occurrence derivation [R-0040] — fires-in-anger dispatch tests: real
 * intents through applyIntent, asserting the ledger the reactions family
 * will point at, with the invariant oracle on every dispatch. Fixtures are
 * REAL corpus stat blocks (prime directive).
 */

/** Goblin warrior (monsters/md/monster/goblin/statblock/goblin-warrior.md):
 * staminaMax 15; M −2, A +2, R 0, I 0, P −1; organization Horde. */
const GOBLIN_WARRIOR: ParticipantStats = {
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

const context = { random: createSeededRandomSource(7) };

let counter = 0;
function director(kind: Intent['kind'], payload: unknown): Intent {
  counter += 1;
  return {
    intentId: `${kind}-${counter}`,
    kind,
    actor: { kind: 'director' },
    payload,
  } as Intent;
}

function base(): EncounterState {
  return initialEncounterState([
    { id: 'hero', kind: 'hero', stats: GOBLIN_WARRIOR },
    { id: 'warrior', kind: 'director-creature', stats: GOBLIN_WARRIOR },
  ]);
}

function dispatch(state: EncounterState, intent: Intent) {
  const result = applyIntent(state, intent, context);
  expect(checkInvariants(state, intent, result)).toEqual([]);
  return result;
}

describe('occurrence derivation [R-0040]', () => {
  it('damage taken lands as an occurrence carrying amount, type, and dealer', () => {
    const result = dispatch(
      base(),
      director('apply-damage', {
        target: 'warrior',
        amount: 6,
        damageType: 'fire',
        reason: 'a Director-applied hit',
        sourceId: 'hero',
      }),
    );
    expect(result.state.occurrences).toHaveLength(1);
    const occurrence = result.state.occurrences[0];
    expect(occurrence).toMatchObject({
      kind: 'damage-taken',
      participantId: 'warrior',
      sourceId: 'hero',
      amount: 6,
      damageType: 'fire',
    });
  });

  it('damage applied without a power roll is NOT rolled damage [Heroes p.74]', () => {
    const result = dispatch(
      base(),
      director('apply-damage', { target: 'warrior', amount: 4, reason: 'a hazard' }),
    );
    // "If an ability or effect deals damage without requiring a power roll,
    // that is not rolled damage" — the apply-damage path makes no roll, so
    // the default is false and asserting otherwise is the Director's act.
    expect(result.state.occurrences[0]).toMatchObject({ kind: 'damage-taken', rolled: false });
  });

  it('a dispatch may assert rolled provenance the engine did not witness', () => {
    const result = dispatch(
      base(),
      director('apply-damage', {
        target: 'warrior',
        amount: 4,
        reason: 'the result of a roll made at the table',
        rolled: true,
      }),
    );
    expect(result.state.occurrences[0]).toMatchObject({ kind: 'damage-taken', rolled: true });
  });

  it('crossing a health threshold lands its own occurrence beside the damage', () => {
    // 15 staminaMax → winded at 7 (half, rounded down); 9 damage crosses it.
    const result = dispatch(
      base(),
      director('apply-damage', { target: 'warrior', amount: 9, reason: 'a heavy hit' }),
    );
    const kinds = result.state.occurrences.map((occurrence) => occurrence.kind);
    expect(kinds).toContain('damage-taken');
    expect(kinds).toContain('health-transition');
    expect(
      result.state.occurrences.find((occurrence) => occurrence.kind === 'health-transition'),
    ).toMatchObject({ participantId: 'warrior', transition: 'winded' });
  });

  it('the ledger accumulates across dispatches and clears with the encounter', () => {
    let state = base();
    state = dispatch(
      state,
      director('apply-damage', { target: 'warrior', amount: 2, reason: 'first' }),
    ).state;
    state = dispatch(
      state,
      director('apply-damage', { target: 'warrior', amount: 3, reason: 'second' }),
    ).state;
    expect(state.occurrences).toHaveLength(2);
    // Ids are unique and deterministic — a reaction points at exactly one.
    expect(new Set(state.occurrences.map((row) => row.occurrenceId)).size).toBe(2);

    const ended = dispatch(state, director('end-encounter', {}));
    expect(ended.state.occurrences).toEqual([]);
  });

  it('a refused dispatch records nothing — nothing occurred', () => {
    const state = base();
    const result = applyIntent(
      state,
      director('apply-damage', { target: 'nobody', amount: 3, reason: 'a miss' }),
      context,
    );
    expect(result.log.some((entry) => entry.kind === 'refusal')).toBe(true);
    expect(result.state.occurrences).toEqual([]);
  });
});

/** Goblin Warrior, Spear Charge (verbatim fixture, same statblock):
 * "Charge, Melee, Strike, Weapon | Main action; One creature or object;
 * Power Roll + 2; <=11: 3 damage; 12-16: 4 damage; 17+: 5 damage". */
const SPEAR_CHARGE = {
  abilityArtifactId: 'mcdm.monsters.v1/monster.goblin.statblock/goblin-warrior#spear-charge',
  actionType: 'Main action',
  actionCost: 'main-action' as const,
  keywords: ['Charge', 'Melee', 'Strike', 'Weapon'],
  targetsText: 'One creature or object',
  powerRollBonus: { kind: 'fixed' as const, value: 2 },
  tiers: {
    tier1: {
      damage: { amount: 3, characteristicOptions: [], typeOptions: [] },
      potency: null,
      conditionIds: [],
      ending: null,
    },
    tier2: {
      damage: { amount: 4, characteristicOptions: [], typeOptions: [] },
      potency: null,
      conditionIds: [],
      ending: null,
    },
    tier3: {
      damage: { amount: 5, characteristicOptions: [], typeOptions: [] },
      potency: null,
      conditionIds: [],
      ending: null,
    },
  },
};

describe('occurrences through the two-phase resolution flow [R-0040/R-0032]', () => {
  function inCombat(): EncounterState {
    let state = dispatch(
      base(),
      director('begin-combat', { firstSide: 'director', roll: 7 }),
    ).state;
    state = dispatch(state, director('start-turn', { turnId: 'warrior' })).state;
    return state;
  }

  it('rolling opens ability-used and roll-made; committing lands rolled damage', () => {
    const state = inCombat();
    const rollIntent: Intent = {
      intentId: 'use-spear-charge',
      kind: 'use-ability',
      actor: { kind: 'participant', participantId: 'warrior' },
      payload: {
        actorParticipantId: 'warrior',
        ability: SPEAR_CHARGE,
        targets: ['hero'],
        dice: [5, 5],
      },
    } as Intent;
    const rolled = dispatch(state, rollIntent);
    const kinds = rolled.state.occurrences.map((row) => row.kind);
    expect(kinds).toContain('ability-used');
    expect(kinds).toContain('roll-made');
    const used = rolled.state.occurrences.find((row) => row.kind === 'ability-used');
    expect(used).toMatchObject({
      actorId: 'warrior',
      abilityArtifactId: SPEAR_CHARGE.abilityArtifactId,
      resolutionId: 'use-spear-charge',
    });
    // Rolling alone deals nothing — damage lands at commit [R-0032].
    expect(kinds).not.toContain('damage-taken');

    const entry = rolled.state.resolutionStack[0];
    if (!entry) throw new Error('the roll opened no resolution');
    const committed = dispatch(
      rolled.state,
      director('commit-resolution', {
        resolutionId: entry.resolutionId,
        payload: rollIntent.payload,
      }),
    );
    const damage = committed.state.occurrences.find((row) => row.kind === 'damage-taken');
    // Tier damage exists BECAUSE of the power roll [Heroes p.74].
    expect(damage).toMatchObject({
      participantId: 'hero',
      sourceId: 'warrior',
      rolled: true,
      resolutionId: entry.resolutionId,
    });
  });

  it('starting and ending a turn each land an occurrence', () => {
    const started = dispatch(
      dispatch(base(), director('begin-combat', { firstSide: 'director', roll: 7 })).state,
      director('start-turn', { turnId: 'warrior' }),
    );
    expect(started.state.occurrences).toContainEqual(
      expect.objectContaining({ kind: 'turn-started', participantId: 'warrior' }),
    );
    const ended = dispatch(started.state, director('end-turn', { participantId: 'warrior' }));
    expect(ended.state.occurrences).toContainEqual(
      expect.objectContaining({ kind: 'turn-ended', participantId: 'warrior' }),
    );
  });
});

describe('the "loses Stamina" / "takes damage" distinction [R-0040]', () => {
  // The books print both phrasings as separate triggers on one page
  // [Heroes p.132], and never say a loss is damage. Derivation keeps the
  // arms apart so a Bleeding drip cannot fire an Unearthly Reflexes.
  const claim = (kind: 'damage' | 'loss'): LogEntry => ({
    kind: 'mutation',
    intentId: 'i1',
    actor: { kind: 'director' },
    canonRefs: [],
    message: 'a Stamina change',
    data: {
      staminaEvent: {
        participantId: 'warrior',
        kind,
        amount: 5,
        damageType: null,
        rolled: false,
        sourceId: null,
        resolutionId: null,
        from: 15,
        to: 10,
        max: 15,
      },
    },
  });

  it('a damage claim derives damage-taken', () => {
    const derived = deriveOccurrences([claim('damage')], { intentId: 'i1', round: 1 });
    expect(derived.map((row) => row.kind)).toEqual(['damage-taken']);
  });

  it('a loss claim derives stamina-lost and NEVER damage-taken', () => {
    const derived = deriveOccurrences([claim('loss')], { intentId: 'i1', round: 1 });
    expect(derived.map((row) => row.kind)).toEqual(['stamina-lost']);
  });

  it('ids are stable for the same log — a host re-deriving gets the same ids', () => {
    const args = { intentId: 'i1', round: 1 } as const;
    const first = deriveOccurrences([claim('damage'), claim('loss')], args);
    const second = deriveOccurrences([claim('damage'), claim('loss')], args);
    expect(first).toEqual(second);
    expect(first.map((row) => row.occurrenceId)).toEqual(['i1#0', 'i1#1']);
  });
});
