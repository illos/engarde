import { describe, expect, it } from 'vitest';
import { applyIntent } from './apply-intent.js';
import { spendRecovery } from './damage.js';
import { createSeededRandomSource } from './determinism.js';
import { initialEncounterState } from './driver.js';
import { recoveryValue } from './health.js';
import { checkInvariants } from './invariants.js';
import { upgradeEncounterState } from './migrate.js';
import type {
  EffectProgramDataInput,
  EncounterState,
  Intent,
  ParticipantStats,
} from './schemas.js';

/**
 * Flat-resource family (docs/flat-resource-design.md, R-0017..R-0022):
 * spend-recovery / regain-stamina / temporary-stamina / terrain-fact
 * resolutions plus the recoveries slot, the regain clamp, and terrain-fact
 * lifecycle. Every dispatch also runs the invariant oracle.
 */

const HERO_STATS: ParticipantStats = {
  staminaMax: 21,
  characteristics: { might: 2, agility: 0, reason: 0, intuition: 0, presence: 0 },
  immunities: [],
  weaknesses: [],
  potencies: null,
  organization: null,
  recoveriesMax: 8,
  freeStrike: null,
  withCaptain: null,
  withCaptainBenefit: null,
};

const MONSTER_STATS: ParticipantStats = {
  staminaMax: 20,
  characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 },
  immunities: [],
  weaknesses: [],
  potencies: null,
  organization: null,
  recoveriesMax: null,
  freeStrike: null,
  withCaptain: null,
  withCaptainBenefit: null,
};

const MINION_STATS: ParticipantStats = { ...MONSTER_STATS, organization: 'Minion' };

function encounter(): EncounterState {
  return initialEncounterState([
    { id: 'hero', kind: 'hero', stats: HERO_STATS },
    { id: 'ally', kind: 'hero', stats: HERO_STATS },
    { id: 'npc', kind: 'director-creature', stats: MONSTER_STATS },
    { id: 'minion', kind: 'director-creature', stats: MINION_STATS },
  ]);
}

function program(
  resolution: EffectProgramDataInput['resolution'],
  overrides: Partial<EffectProgramDataInput> = {},
): EffectProgramDataInput {
  return {
    effectArtifactId: 'canon/effect/flat-resource-example',
    effectOrdinal: 1,
    sourceSpan: { byteStart: 10, byteEnd: 40 },
    sourceText: 'x effect instruction',
    canonRefs: ['canon/rule/example'],
    actionType: 'Main action',
    targetsText: 'One creature',
    distanceText: null,
    keywords: [],
    resolution,
    ...overrides,
  };
}

function useEffect(
  effect: EffectProgramDataInput,
  targets: string[],
  extras: Partial<Extract<Intent, { kind: 'use-effect' }>['payload']> = {},
): Intent {
  return {
    intentId: 'flat-i1',
    kind: 'use-effect',
    actor: { kind: 'participant', participantId: 'hero' },
    payload: { actorParticipantId: 'hero', effect, targets, ...extras },
  };
}

function dispatch(before: EncounterState, intent: Intent) {
  const result = applyIntent(before, intent, { random: createSeededRandomSource(7) });
  expect(checkInvariants(before, intent, result)).toEqual([]);
  return result;
}

function damaged(state: EncounterState, id: string, current: number): EncounterState {
  const participant = state.participants[id];
  if (!participant?.stamina) throw new Error(`no tracked stamina for ${id}`);
  return {
    ...state,
    participants: {
      ...state.participants,
      [id]: { ...participant, stamina: { ...participant.stamina, current } },
    },
  };
}

describe('recoveryValue one home [R-0018]', () => {
  it('is one-third of Stamina maximum, rounded down', () => {
    expect(recoveryValue(21)).toBe(7);
    expect(recoveryValue(20)).toBe(6);
    expect(recoveryValue(2)).toBe(0);
  });
});

describe('spend-recovery resolution [R-0018, R-0019]', () => {
  const offer = program({
    kind: 'spend-recovery',
    subjectText: 'The target',
    singular: true,
  });

  it('spends: −1 Recovery, +recoveryValue Stamina through the one home', () => {
    const before = damaged(encounter(), 'ally', 5);
    const result = dispatch(before, useEffect(offer, ['ally'], { recoverySpends: { ally: true } }));
    const ally = result.state.participants.ally;
    expect(ally?.stamina).toEqual({ current: 12, temporary: 0, recoveries: 7 });
    expect(result.log.some((entry) => entry.data.recoveriesDeltas !== undefined)).toBe(true);
  });

  it('clamps the regain at Stamina maximum [R-0017]', () => {
    const before = damaged(encounter(), 'ally', 20);
    const result = dispatch(before, useEffect(offer, ['ally'], { recoverySpends: { ally: true } }));
    expect(result.state.participants.ally?.stamina?.current).toBe(21);
  });

  it('lets a dying hero accept, ending dying without removing the offer path', () => {
    const before = damaged(encounter(), 'ally', -2);
    const result = dispatch(before, useEffect(offer, ['ally'], { recoverySpends: { ally: true } }));
    expect(result.state.participants.ally?.stamina?.current).toBe(5);
    expect(result.log.some((entry) => entry.message.includes('no longer dying'))).toBe(true);
  });

  it('declining is legal and receipted; nothing changes', () => {
    const before = encounter();
    const result = dispatch(
      before,
      useEffect(offer, ['ally'], { recoverySpends: { ally: false } }),
    );
    expect(result.state.participants.ally?.stamina?.recoveries).toBe(8);
    expect(result.log.some((entry) => entry.data.declined === true)).toBe(true);
  });

  it('refuses the whole dispatch when a bound participant has no answer', () => {
    const before = encounter();
    const result = dispatch(before, useEffect(offer, ['ally'], {}));
    expect(result.log.some((entry) => entry.kind === 'refusal')).toBe(true);
    expect(result.state).toEqual(before);
  });

  it('a hero with 0 Recoveries cannot spend — per-binding non-application, siblings proceed [R-0019a]', () => {
    let before = damaged(encounter(), 'hero', 5);
    before = damaged(before, 'ally', 5);
    const heroState = before.participants.hero;
    if (!heroState?.stamina) throw new Error('hero untracked');
    before = {
      ...before,
      participants: {
        ...before.participants,
        hero: { ...heroState, stamina: { ...heroState.stamina, recoveries: 0 } },
      },
    };
    const plural = program({
      kind: 'spend-recovery',
      subjectText: 'Each ally in the area',
      singular: false,
    });
    const result = dispatch(
      before,
      useEffect(plural, ['hero', 'ally'], { recoverySpends: { hero: true, ally: true } }),
    );
    expect(result.state.participants.hero?.stamina).toEqual({
      current: 5,
      temporary: 0,
      recoveries: 0,
    });
    expect(result.state.participants.ally?.stamina).toEqual({
      current: 12,
      temporary: 0,
      recoveries: 7,
    });
    expect(result.log.some((entry) => entry.data.recoverySpendRefused !== undefined)).toBe(true);
  });

  it('a Director-controlled creature converts to one-third maximum with no pool [R-0019b]', () => {
    const before = damaged(encounter(), 'npc', 3);
    const result = dispatch(before, useEffect(offer, ['npc'], { recoverySpends: { npc: true } }));
    expect(result.state.participants.npc?.stamina).toEqual({
      current: 9,
      temporary: 0,
      recoveries: null,
    });
  });

  it('a SQUADLESS minion routes to the table, not the refusal — R-0027 scopes the refusal to squad members', () => {
    // "minions … can't regain Stamina … during a battle" [chapter/
    // monster-basics §Shared Low Stamina]: the R-0027 refusal's rationale
    // (no individual Stamina to receive the change) holds only for pooled
    // squad members. This minion is seeded into no squad, so the printed
    // rule routes to the Director at the table — and the receipt must not
    // claim their Stamina is pooled.
    const before = damaged(encounter(), 'minion', 3);
    const result = dispatch(
      before,
      useEffect(offer, ['minion'], { recoverySpends: { minion: true } }),
    );
    expect(result.state.participants.minion?.stamina?.current).toBe(3);
    const routed = result.log.find(
      (entry) =>
        entry.kind === 'table-directive' && entry.data.minionRecoverySpendTableRouted !== undefined,
    );
    expect(routed?.message).toMatch(/can't regain Stamina/);
    expect(routed?.message).not.toMatch(/pool/);
    expect(result.log.every((entry) => entry.kind !== 'refusal')).toBe(true);
  });

  it('warns and applies when a singular subject binds more than one spender', () => {
    const before = encounter();
    const result = dispatch(
      before,
      useEffect(offer, ['hero', 'ally'], { recoverySpends: { hero: false, ally: false } }),
    );
    expect(result.log.some((entry) => entry.kind === 'warning')).toBe(true);
  });

  it('the core refuses a standalone spend at 0 Recoveries', () => {
    const zero = encounter().participants.hero;
    if (!zero?.stamina) throw new Error('hero untracked');
    const participant = { ...zero, stamina: { ...zero.stamina, recoveries: 0 } };
    const outcome = spendRecovery(
      participant,
      { reason: 'test' },
      { intentId: 'i', actor: { kind: 'director' } },
    );
    expect(outcome.participant).toBe(participant);
    expect(outcome.log[0]?.kind).toBe('refusal');
  });
});

describe('regain leaving dying: bleeding persistence [R-0017 ∩ R-0004]', () => {
  it('bleeding survives the regain and becomes removable once no longer dying', () => {
    // Damage the hero into dying — the mandated bleeding instance auto-applies.
    const before = encounter();
    const damage: Intent = {
      intentId: 'flat-d1',
      kind: 'apply-damage',
      actor: { kind: 'director' },
      payload: { target: 'ally', amount: 23, reason: 'test damage' },
    };
    const dying = dispatch(before, damage);
    const bleeding = dying.state.participants.ally?.conditions.find((instance) =>
      instance.conditionId.includes('bleeding'),
    );
    expect(bleeding).toBeDefined();
    if (!bleeding) throw new Error('no bleeding instance');

    // Removal refuses while still dying [R-0004].
    const removeWhileDying: Intent = {
      intentId: 'flat-d2',
      kind: 'remove-condition',
      actor: { kind: 'director' },
      payload: { target: 'ally', instanceId: bleeding.instanceId },
    };
    const refused = dispatch(dying.state, removeWhileDying);
    expect(refused.log[0]?.kind).toBe('refusal');

    // Regain above 0: dying ends by definition; bleeding is NOT auto-removed.
    const regain = program({
      kind: 'regain-stamina',
      amount: 5,
      subjectText: 'The target',
      singular: true,
    });
    const healed = dispatch(dying.state, useEffect(regain, ['ally']));
    expect(healed.state.participants.ally?.stamina?.current).toBe(3);
    expect(
      healed.state.participants.ally?.conditions.some(
        (instance) => instance.instanceId === bleeding.instanceId,
      ),
    ).toBe(true);

    // No longer dying: the same removal now succeeds.
    const removed = dispatch(healed.state, {
      ...removeWhileDying,
      intentId: 'flat-d3',
    });
    expect(
      removed.state.participants.ally?.conditions.some(
        (instance) => instance.instanceId === bleeding.instanceId,
      ),
    ).toBe(false);
  });
});

describe('unconscious spend target flag (design §5, book-silent)', () => {
  it('warns and applies when a knocked-out target accepts a spend', () => {
    const base = encounter();
    const ally = base.participants.ally;
    if (!ally?.stamina) throw new Error('ally untracked');
    const unconscious = {
      ...base,
      participants: {
        ...base.participants,
        ally: {
          ...ally,
          stamina: { ...ally.stamina, current: 0 },
          conditions: [
            {
              instanceId: 'mcdm.heroes.v1/rule.health/stamina#unconscious#seed-ally',
              conditionId: 'mcdm.heroes.v1/rule.health/stamina#unconscious',
              ending: { kind: 'external' as const },
              source: {
                effectArtifactId: 'mcdm.heroes.v1/rule.health/stamina#knocking-creatures-out',
              },
            },
          ],
        },
      },
    };
    const offer = program({
      kind: 'spend-recovery',
      subjectText: 'The target',
      singular: true,
    });
    const result = dispatch(
      unconscious,
      useEffect(offer, ['ally'], { recoverySpends: { ally: true } }),
    );
    expect(result.log.some((entry) => entry.data.unconsciousSpendTarget !== undefined)).toBe(true);
    expect(result.state.participants.ally?.stamina?.recoveries).toBe(7);
  });
});

describe('regain-stamina resolution [R-0017, R-0020]', () => {
  const regain = program({
    kind: 'regain-stamina',
    amount: 5,
    subjectText: 'Each target',
    singular: false,
  });

  it('applies automatically, clamped at maximum, from negative values', () => {
    let before = damaged(encounter(), 'ally', -1);
    before = damaged(before, 'npc', 18);
    const result = dispatch(before, useEffect(regain, ['ally', 'npc']));
    expect(result.state.participants.ally?.stamina?.current).toBe(4);
    expect(result.state.participants.npc?.stamina?.current).toBe(20);
    const clamped = result.log.find(
      (entry) =>
        (entry.data.staminaDeltas as { participantId: string }[])?.[0]?.participantId === 'npc',
    );
    expect(clamped?.data.clampedAtMax).toBe(true);
  });

  it('logs the no-longer-winded transition on crossing the threshold', () => {
    const before = damaged(encounter(), 'ally', 8);
    const result = dispatch(
      before,
      useEffect(
        program({ kind: 'regain-stamina', amount: 5, subjectText: 'The target', singular: true }),
        ['ally'],
      ),
    );
    expect(result.state.participants.ally?.stamina?.current).toBe(13);
    expect(result.log.some((entry) => entry.message.includes('no longer winded'))).toBe(true);
  });

  it('never restores temporary Stamina', () => {
    const base = encounter();
    const ally = base.participants.ally;
    if (!ally?.stamina) throw new Error('ally untracked');
    const before = {
      ...base,
      participants: {
        ...base.participants,
        ally: { ...ally, stamina: { current: 5, temporary: 3, recoveries: 8 } },
      },
    };
    const result = dispatch(before, useEffect(regain, ['ally']));
    expect(result.state.participants.ally?.stamina?.temporary).toBe(3);
  });

  it('a SQUADLESS minion target routes to the table, not the refusal — R-0027 scopes the refusal to squad members', () => {
    // The refusal's incoherence rationale (no individual Stamina number)
    // holds only for pooled squad members; this squadless minion tracks
    // individual Stamina, so the printed rule table-routes instead and the
    // receipt must not claim a pool.
    const before = damaged(encounter(), 'minion', 2);
    const result = dispatch(before, useEffect(regain, ['minion']));
    expect(result.state.participants.minion?.stamina?.current).toBe(2);
    const routed = result.log.find(
      (entry) =>
        entry.kind === 'table-directive' && entry.data.minionRegainTableRouted !== undefined,
    );
    expect(routed?.message).toMatch(/can't regain Stamina/);
    expect(routed?.message).not.toMatch(/pool/);
    expect(result.log.every((entry) => entry.kind !== 'refusal')).toBe(true);
  });
});

describe('temporary-stamina resolution [R-0021]', () => {
  const grant = program({
    kind: 'temporary-stamina',
    amount: 20,
    subjectText: 'You',
    singular: true,
  });

  it('sets the pool to the greater amount — never the sum', () => {
    const base = encounter();
    const hero = base.participants.hero;
    if (!hero?.stamina) throw new Error('hero untracked');
    const before = {
      ...base,
      participants: {
        ...base.participants,
        hero: { ...hero, stamina: { ...hero.stamina, temporary: 5 } },
      },
    };
    const result = dispatch(before, useEffect(grant, ['hero']));
    expect(result.state.participants.hero?.stamina?.temporary).toBe(20);

    const bigger = {
      ...before,
      participants: {
        ...before.participants,
        hero: { ...hero, stamina: { ...hero.stamina, temporary: 25 } },
      },
    };
    const kept = dispatch(bigger, useEffect(grant, ['hero']));
    expect(kept.state.participants.hero?.stamina?.temporary).toBe(25);
  });

  it('clears in the end-encounter sweep', () => {
    const before = dispatch(encounter(), useEffect(grant, ['hero'])).state;
    expect(before.participants.hero?.stamina?.temporary).toBe(20);
    const ended = dispatch(before, {
      intentId: 'flat-i2',
      kind: 'end-encounter',
      actor: { kind: 'director' },
      payload: {},
    });
    expect(ended.state.participants.hero?.stamina?.temporary).toBe(0);
  });
});

describe('terrain-fact resolution and lifecycle [R-0022]', () => {
  const terrain = program(
    { kind: 'terrain-fact', terrain: 'difficult' },
    { distanceText: '3 burst', targetsText: 'Each enemy and object in the area' },
  );

  it('records an attributed fact carrying the verbatim area text; no targets needed', () => {
    const result = dispatch(encounter(), useEffect(terrain, []));
    expect(result.state.terrainFacts).toHaveLength(1);
    const fact = result.state.terrainFacts[0];
    expect(fact?.areaText).toBe('3 burst');
    expect(fact?.createdBy).toBe('hero');
    expect(fact?.terrain).toBe('difficult');
  });

  it('refuses a duplicate fact id from a replayed intent', () => {
    const first = dispatch(encounter(), useEffect(terrain, []));
    const replay = applyIntent(first.state, useEffect(terrain, []), {
      random: createSeededRandomSource(7),
    });
    expect(replay.log.some((entry) => entry.kind === 'refusal')).toBe(true);
    expect(replay.state.terrainFacts).toHaveLength(1);
  });

  it('the Director clears a fact; clearing an unknown fact refuses', () => {
    const first = dispatch(encounter(), useEffect(terrain, []));
    const factId = first.state.terrainFacts[0]?.factId;
    if (!factId) throw new Error('no fact recorded');
    const cleared = dispatch(first.state, {
      intentId: 'flat-i3',
      kind: 'clear-terrain-fact',
      actor: { kind: 'director' },
      payload: { factId, reason: 'rubble shoveled aside' },
    });
    expect(cleared.state.terrainFacts).toHaveLength(0);

    const unknown = dispatch(encounter(), {
      intentId: 'flat-i4',
      kind: 'clear-terrain-fact',
      actor: { kind: 'director' },
      payload: { factId: 'nope' },
    });
    expect(unknown.log[0]?.kind).toBe('refusal');
  });

  it('facts do not survive the encounter', () => {
    const first = dispatch(encounter(), useEffect(terrain, []));
    const ended = dispatch(first.state, {
      intentId: 'flat-i5',
      kind: 'end-encounter',
      actor: { kind: 'director' },
      payload: {},
    });
    expect(ended.state.terrainFacts).toEqual([]);
    expect(ended.log.some((entry) => entry.data.terrainFactsCleared !== undefined)).toBe(true);
  });
});

describe('migration v3 → v4', () => {
  it('lifts a v3 state losslessly: null recoveries, empty terrain', () => {
    const v3 = {
      schemaVersion: 3,
      participants: {
        goblin: {
          id: 'goblin',
          conditions: [],
          kind: 'director-creature',
          stats: MONSTER_STATS,
          stamina: { current: 12, temporary: 2 },
          grants: [],
        },
      },
    };
    const lifted = upgradeEncounterState(v3);
    expect(lifted.schemaVersion).toBe(6);
    expect(lifted.terrainFacts).toEqual([]);
    expect(lifted.participants.goblin?.stamina).toEqual({
      current: 12,
      temporary: 2,
      recoveries: null,
    });
  });
});
