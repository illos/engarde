import { describe, expect, it } from 'vitest';
import { applyIntent } from './apply-intent.js';
import { createSeededRandomSource } from './determinism.js';
import { initialEncounterState } from './driver.js';
import { checkInvariants } from './invariants.js';
import { deriveOccurrences } from './occurrences.js';
import type {
  EffectProgramDataInput,
  EncounterState,
  Intent,
  LogEntry,
  NextRollGrant,
  ParticipantStats,
} from './schemas.js';

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

const GRAB_EFFECT: EffectProgramDataInput = {
  effectArtifactId: 'mcdm.heroes.v1/feature.ability.common/grab',
  effectOrdinal: 1,
  sourceSpan: { byteStart: 0, byteEnd: 20 },
  sourceText: 'The target is grabbed.',
  canonRefs: [],
  actionType: 'Maneuver',
  actionCost: 'maneuver',
  targetsText: 'One creature',
  distanceText: 'Melee 1',
  keywords: ['Melee', 'Weapon'],
  resolution: { kind: 'table' },
};

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
    expect(result.state.occurrences.map((row) => row.kind)).toEqual([
      'damage-taken',
      'stamina-lost',
    ]);
    const occurrence = result.state.occurrences.find((row) => row.kind === 'damage-taken');
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
    expect(state.occurrences).toHaveLength(4);
    // Ids are unique and deterministic — a reaction points at exactly one.
    expect(new Set(state.occurrences.map((row) => row.occurrenceId)).size).toBe(4);

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

  it('a successful nonrolling use-effect records the exact use and targets without inventing a resolution', () => {
    const result = dispatch(base(), {
      intentId: 'grab-effect',
      kind: 'use-effect',
      actor: { kind: 'participant', participantId: 'hero' },
      payload: { actorParticipantId: 'hero', effect: GRAB_EFFECT, targets: ['warrior'] },
    } as Intent);
    expect(result.state.occurrences).toContainEqual(
      expect.objectContaining({
        kind: 'ability-used',
        actorId: 'hero',
        abilityArtifactId: GRAB_EFFECT.effectArtifactId,
        resolutionId: null,
      }),
    );
    expect(result.state.occurrences).toContainEqual(
      expect.objectContaining({
        kind: 'targeted',
        participantId: 'warrior',
        actorId: 'hero',
        resolutionId: null,
      }),
    );

    const refused = applyIntent(
      base(),
      {
        intentId: 'bad-grab-effect',
        kind: 'use-effect',
        actor: { kind: 'participant', participantId: 'hero' },
        payload: { actorParticipantId: 'hero', effect: GRAB_EFFECT, targets: ['nobody'] },
      } as Intent,
      context,
    );
    expect(refused.log.some((entry) => entry.kind === 'refusal')).toBe(true);
    expect(refused.state.occurrences).toEqual([]);
  });

  it('asserted-band applications record an ability use and target; bare Director edits do not', () => {
    const asserted = dispatch(
      base(),
      director('apply-damage', {
        target: 'warrior',
        amount: 2,
        reason: 'Director-asserted nonrolling band',
        assertedAbilityUse: {
          actorParticipantId: 'hero',
          abilityArtifactId: 'canon/ability/asserted-band',
          actionCost: 'main-action',
        },
      }),
    );
    expect(asserted.state.occurrences).toContainEqual(
      expect.objectContaining({
        kind: 'ability-used',
        actorId: 'hero',
        abilityArtifactId: 'canon/ability/asserted-band',
        resolutionId: null,
      }),
    );
    expect(asserted.state.occurrences).toContainEqual(
      expect.objectContaining({
        kind: 'targeted',
        participantId: 'warrior',
        actorId: 'hero',
        resolutionId: null,
      }),
    );

    const conditioned = dispatch(
      base(),
      director('apply-condition', {
        target: 'warrior',
        conditionId: 'mcdm.heroes.v1/condition/slowed',
        ending: { kind: 'save-ends' },
        source: {
          participantId: 'hero',
          effectArtifactId: 'canon/ability/asserted-condition-band',
        },
        assertedAbilityUse: {
          actorParticipantId: 'hero',
          abilityArtifactId: 'canon/ability/asserted-condition-band',
          actionCost: 'main-action',
        },
      }),
    );
    expect(conditioned.state.occurrences).toContainEqual(
      expect.objectContaining({
        kind: 'ability-used',
        actorId: 'hero',
        abilityArtifactId: 'canon/ability/asserted-condition-band',
        resolutionId: null,
      }),
    );
    expect(conditioned.state.occurrences).toContainEqual(
      expect.objectContaining({
        kind: 'targeted',
        participantId: 'warrior',
        actorId: 'hero',
        resolutionId: null,
      }),
    );

    const bare = dispatch(
      base(),
      director('apply-condition', {
        target: 'warrior',
        conditionId: 'mcdm.heroes.v1/condition/slowed',
        ending: { kind: 'save-ends' },
        source: { participantId: 'hero' },
      }),
    );
    expect(bare.state.occurrences.some((row) => row.kind === 'ability-used')).toBe(false);
    expect(bare.state.occurrences.some((row) => row.kind === 'targeted')).toBe(false);
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
    expect(kinds).toContain('targeted');
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

  it('a shared squad turn records each participating member, never the squad container', () => {
    const minionStats: ParticipantStats = {
      ...GOBLIN_WARRIOR,
      staminaMax: 5,
      organization: 'Minion',
    };
    let state = initialEncounterState(
      ['m1', 'm2'].map((id) => ({
        id,
        kind: 'director-creature' as const,
        sourceRecordId: 'canon/minion',
        stats: minionStats,
      })),
      [{ squadId: 'squad-m', name: 'minions', memberIds: ['m1', 'm2'] }],
    );
    state = dispatch(state, director('begin-combat', { firstSide: 'director', roll: 7 })).state;
    const started = dispatch(state, director('start-turn', { turnId: 'squad-m' }));
    const startRows = started.state.occurrences.filter((row) => row.kind === 'turn-started');
    expect(startRows.map((row) => row.participantId).sort()).toEqual(['m1', 'm2']);
    expect(startRows.some((row) => row.participantId === 'squad-m')).toBe(false);

    const ended = dispatch(started.state, director('end-turn', { participantId: 'squad-m' }));
    const endRows = ended.state.occurrences.filter((row) => row.kind === 'turn-ended');
    expect(endRows.map((row) => row.participantId).sort()).toEqual(['m1', 'm2']);
    expect(endRows.some((row) => row.participantId === 'squad-m')).toBe(false);
  });

  it('known and pending squad kills both record death at the pool transition', () => {
    const minionStats: ParticipantStats = {
      ...GOBLIN_WARRIOR,
      staminaMax: 5,
      organization: 'Minion',
    };
    const state = initialEncounterState(
      ['m1', 'm2', 'm3'].map((id) => ({
        id,
        kind: 'director-creature' as const,
        sourceRecordId: 'canon/minion',
        stats: minionStats,
      })),
      [{ squadId: 'squad-m', name: 'minions', memberIds: ['m1', 'm2', 'm3'] }],
    );
    const damaged = dispatch(
      state,
      director('apply-damage', { target: 'm1', amount: 10, reason: 'cross two thresholds' }),
    );
    const deaths = damaged.state.occurrences.filter(
      (row) => row.kind === 'health-transition' && row.transition === 'died',
    );
    expect(deaths).toContainEqual(
      expect.objectContaining({
        participantId: 'm1',
        squadId: 'squad-m',
        pendingIdentity: false,
      }),
    );
    expect(deaths).toContainEqual(
      expect.objectContaining({
        participantId: null,
        squadId: 'squad-m',
        pendingIdentity: true,
      }),
    );
    expect(deaths).toHaveLength(2);

    const named = dispatch(
      damaged.state,
      director('resolve-pending-kills', {
        squadId: 'squad-m',
        victimMemberIds: ['m2'],
        reason: 'nearest remaining minion',
      }),
    );
    expect(
      named.state.occurrences.filter(
        (row) => row.kind === 'health-transition' && row.transition === 'died',
      ),
    ).toHaveLength(2);
    expect(
      named.state.occurrences.some(
        (row) => row.kind === 'health-transition' && row.intentId === named.log[0]?.intentId,
      ),
    ).toBe(false);
  });
});

describe('the declared phase [R-0041]', () => {
  function inCombat(): EncounterState {
    let state = dispatch(
      base(),
      director('begin-combat', { firstSide: 'director', roll: 7 }),
    ).state;
    state = dispatch(state, director('start-turn', { turnId: 'warrior' })).state;
    return state;
  }

  const declaration = {
    actorParticipantId: 'warrior',
    ability: SPEAR_CHARGE,
    targets: ['hero'],
    dice: [5, 5] as [number, number],
  };

  function declare(state: EncounterState) {
    return dispatch(state, {
      intentId: 'declare-spear-charge',
      kind: 'use-ability',
      actor: { kind: 'participant', participantId: 'warrior' },
      payload: { ...declaration, holdAtDeclaration: true },
    } as Intent);
  }

  it('holding at declaration opens an entry with targets and no dice', () => {
    const declared = declare(inCombat());
    const entry = declared.state.resolutionStack[0];
    expect(entry?.phase).toBe('declared');
    if (entry?.phase !== 'declared') throw new Error('expected a declared entry');
    expect(entry.declaredTargets).toEqual(['hero']);
    // The whole point: a being-targeted reaction has a moment to act.
    expect(declared.state.occurrences).toContainEqual(
      expect.objectContaining({ kind: 'targeted', participantId: 'hero', actorId: 'warrior' }),
    );
    // No dice were thrown, so no roll occurred and no damage landed.
    const kinds = declared.state.occurrences.map((row) => row.kind);
    expect(kinds).not.toContain('roll-made');
    expect(kinds).not.toContain('damage-taken');
    expect(declared.state.participants.hero?.stamina?.current).toBe(15);
    expect(declared.state.participants.warrior?.actionBudget['main-action']).toBeUndefined();
    expect(declared.state.participants.warrior?.abilityUses[SPEAR_CHARGE.abilityArtifactId]).toBe(
      undefined,
    );
  });

  it('a declared entry refuses commit — there is no roll to apply', () => {
    const declared = declare(inCombat());
    const result = applyIntent(
      declared.state,
      director('commit-resolution', {
        resolutionId: 'declare-spear-charge',
        payload: declaration,
      }),
      context,
    );
    const refusal = result.log.find((entry) => entry.kind === 'refusal');
    expect(refusal?.message).toContain('DECLARED but not rolled');
    expect(result.state).toEqual(declared.state);
  });

  it('roll-resolution advances the SAME entry, keeping its id and its edits', () => {
    const declared = declare(inCombat());
    const rolled = dispatch(
      declared.state,
      director('roll-resolution', {
        resolutionId: 'declare-spear-charge',
        payload: declaration,
      }),
    );
    // One entry, not two: the declaration is what rolled.
    expect(rolled.state.resolutionStack).toHaveLength(1);
    const entry = rolled.state.resolutionStack[0];
    expect(entry?.phase).toBe('rolled');
    expect(entry?.resolutionId).toBe('declare-spear-charge');
    expect(entry?.declarationHash).toBe(declared.state.resolutionStack[0]?.declarationHash);
    expect(rolled.state.occurrences.map((row) => row.kind)).toContain('roll-made');
    expect(rolled.state.participants.warrior?.actionBudget['main-action']?.used).toBe(1);
    expect(
      rolled.state.participants.warrior?.abilityUses[SPEAR_CHARGE.abilityArtifactId]?.round,
    ).toBe(1);
  });

  it('the roll must re-supply what was DECLARED', () => {
    const declared = declare(inCombat());
    const result = applyIntent(
      declared.state,
      director('roll-resolution', {
        resolutionId: 'declare-spear-charge',
        payload: { ...declaration, targets: ['warrior'] },
      }),
      context,
    );
    const refusal = result.log.find((entry) => entry.kind === 'refusal');
    expect(refusal?.message).toContain('does not match');
  });

  it('the declaration hash pins the executable ability, not only its artifact id', () => {
    const declared = declare(inCombat());
    const altered = {
      ...SPEAR_CHARGE,
      tiers: {
        ...SPEAR_CHARGE.tiers,
        tier1: {
          ...SPEAR_CHARGE.tiers.tier1,
          damage: { ...SPEAR_CHARGE.tiers.tier1.damage, amount: 19 },
        },
      },
    };
    const result = applyIntent(
      declared.state,
      director('roll-resolution', {
        resolutionId: 'declare-spear-charge',
        payload: { ...declaration, ability: altered },
      }),
      context,
    );
    expect(result.log.find((row) => row.kind === 'refusal')?.message).toContain('does not match');
    expect(result.state).toEqual(declared.state);
  });

  it('a target swapped before the roll is the target rolled against [Meat Shield]', () => {
    // "A creature targets the monarch with a strike. Effect: The ally is
    // the target of the triggering strike instead." [Monsters p.164]
    const mark: NextRollGrant = {
      kind: 'next-roll',
      grantId: 'hero-inbound-edge',
      polarity: 'edge',
      scope: 'strike',
      direction: 'inbound',
      source: { participantId: 'hero' },
      window: null,
    };
    const before = inCombat();
    const hero = before.participants.hero;
    if (!hero) throw new Error('hero fixture missing');
    const declared = declare({
      ...before,
      participants: {
        ...before.participants,
        hero: { ...hero, grants: [mark] },
      },
    });
    const swapped = dispatch(
      declared.state,
      director('modify-resolution', {
        resolutionId: 'declare-spear-charge',
        modification: { kind: 'retarget', from: 'hero', to: 'warrior', reason: 'Meat Shield' },
      }),
    );
    const rolled = dispatch(
      swapped.state,
      director('roll-resolution', {
        resolutionId: 'declare-spear-charge',
        payload: declaration,
      }),
    );
    const entry = rolled.state.resolutionStack[0];
    if (entry?.phase !== 'rolled') throw new Error('expected a rolled entry');
    // The recorded edit rode through: the swap is on the entry's history
    // and the declaration hash still pins what was originally declared.
    expect(entry.modifications).toHaveLength(1);
    expect(entry.declarationHash).toBe(declared.state.resolutionStack[0]?.declarationHash);
    expect(entry.rollTargets).toEqual(['warrior']);
    expect(entry.rollReceipt.perTarget.hero).toBeUndefined();
    expect(rolled.state.participants.hero?.grants).toEqual([mark]);
    const committed = dispatch(
      rolled.state,
      director('commit-resolution', {
        resolutionId: 'declare-spear-charge',
        payload: declaration,
      }),
    );
    expect(committed.state.participants.hero?.stamina?.current).toBe(15);
    expect(committed.state.participants.warrior?.stamina?.current).toBeLessThan(15);
  });

  it('a declaration that never rolls cancels at end of turn — nothing is lost', () => {
    const declared = declare(inCombat());
    const ended = dispatch(
      declared.state,
      director('end-turn', { participantId: 'warrior', commitPayloads: {} }),
    );
    // Cancelled, not force-committed: no payload was required, and the
    // target took nothing.
    expect(ended.state.resolutionStack).toEqual([]);
    expect(ended.state.participants.hero?.stamina?.current).toBe(15);
    expect(ended.state.participants.warrior?.actionBudget['main-action']).toBeUndefined();
    expect(ended.log.some((entry) => entry.data.resolutionCancelled !== undefined)).toBe(true);
  });

  it('end-encounter distinguishes an unrolled declaration from a rolled outcome', () => {
    const declared = declare(inCombat());
    const endedDeclared = dispatch(declared.state, director('end-encounter', {}));
    const declaredWarning = endedDeclared.log.find(
      (entry) => entry.data.uncommittedResolutions !== undefined,
    );
    expect(declaredWarning?.message).toContain('declared resolution(s) never rolled');
    expect(declaredWarning?.message).toContain('no rolled outcome');
    expect(declaredWarning?.message).not.toMatch(/^\d+ rolled resolution/);

    const freshDeclaration = declare(inCombat());
    const rolled = dispatch(
      freshDeclaration.state,
      director('roll-resolution', {
        resolutionId: 'declare-spear-charge',
        payload: declaration,
      }),
    );
    const endedRolled = dispatch(rolled.state, director('end-encounter', {}));
    const rolledWarning = endedRolled.log.find(
      (entry) => entry.data.uncommittedResolutions !== undefined,
    );
    expect(rolledWarning?.message).toContain('rolled resolution(s) never committed');
    expect(rolledWarning?.message).toContain('printed outcomes are table-adjudicated');
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

  it('damage that lowers current Stamina derives both distinct trigger classes', () => {
    const derived = deriveOccurrences([claim('damage')], { intentId: 'i1', round: 1 });
    expect(derived.map((row) => row.kind)).toEqual(['damage-taken', 'stamina-lost']);
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
    expect(first.map((row) => row.occurrenceId)).toEqual(['i1#0', 'i1#1', 'i1#2']);
  });

  it('temporary-only absorption is damage without current-Stamina loss', () => {
    const row = claim('damage');
    row.data.staminaEvent = { ...(row.data.staminaEvent as object), from: 15, to: 15 };
    expect(deriveOccurrences([row], { intentId: 'i1', round: 1 }).map((item) => item.kind)).toEqual(
      ['damage-taken'],
    );
  });

  it('reaching 0 Stamina and characteristic tests have exact occurrences', () => {
    const zero = claim('loss');
    zero.data.staminaEvent = { ...(zero.data.staminaEvent as object), from: 5, to: 0 };
    const test: LogEntry = {
      kind: 'informational',
      intentId: 'i1',
      actor: { kind: 'director' },
      canonRefs: [],
      message: 'a test',
      data: {
        testRoll: {
          targetId: 'warrior',
          edges: 1,
          banes: 0,
          resolution: { tier: 2, natural: 12 },
        },
      },
    };
    const derived = deriveOccurrences([zero, test], { intentId: 'i1', round: 1 });
    expect(derived).toContainEqual(
      expect.objectContaining({
        kind: 'stamina-reduced-to-zero',
        participantId: 'warrior',
        pendingIdentity: false,
      }),
    );
    expect(derived).toContainEqual(
      expect.objectContaining({
        kind: 'roll-made',
        actorId: 'warrior',
        resolutionId: null,
        tier: 2,
      }),
    );
  });
});
