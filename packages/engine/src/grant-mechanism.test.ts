import { describe, expect, it } from 'vitest';
import { applyIntent } from './apply-intent.js';
import { createSeededRandomSource } from './determinism.js';
import { initialEncounterState } from './driver.js';
import { checkInvariants } from './invariants.js';
import type {
  AbilityEffectData,
  EffectProgramData,
  EncounterState,
  Intent,
  NextRollGrant,
  ParticipantStats,
} from './schemas.js';

/**
 * Next-roll grant mechanism (R-0012..R-0016, docs/next-roll-grant-design.md).
 * Fixtures are real corpus records quoted verbatim from the accepted pin;
 * participant ids and asserted stats are host identifiers/test assertions,
 * not rule content.
 */

const STATS: ParticipantStats = {
  staminaMax: 20,
  characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 },
  immunities: [],
  weaknesses: [],
  potencies: null,
  organization: null,
  recoveriesMax: null,
  withCaptain: null,
};

/** Skitterling, Claws (monsters/md/monster/goblin/statblock/skitterling.md):
 * keywords "Melee, Strike, Weapon"; Main action; "One creature per minion";
 * Power Roll + 2; ≤11: 1 poison damage; 12–16: 2 poison damage; 17+: 3
 * poison damage. */
const SKITTERLING_CLAWS: AbilityEffectData = {
  abilityArtifactId: 'mcdm.monsters.v1/monster.goblin.statblock/skitterling#claws',
  actionType: 'Main action',
  keywords: ['Melee', 'Strike', 'Weapon'],
  targetsText: 'One creature per minion',
  powerRollBonus: { kind: 'fixed', value: 2 },
  tiers: {
    tier1: {
      damage: { amount: 1, characteristicOptions: [], typeOptions: ['poison'] },
      potency: null,
      conditionIds: [],
      ending: null,
    },
    tier2: {
      damage: { amount: 2, characteristicOptions: [], typeOptions: ['poison'] },
      potency: null,
      conditionIds: [],
      ending: null,
    },
    tier3: {
      damage: { amount: 3, characteristicOptions: [], typeOptions: ['poison'] },
      potency: null,
      conditionIds: [],
      ending: null,
    },
  },
};

/** "The target takes a bane on their next strike." — Skitterling Claws
 * Effect line (bare outbound strike-scoped bane). */
const CLAWS_GRANT_EFFECT: EffectProgramData = {
  effectArtifactId: 'mcdm.monsters.v1/monster.goblin.statblock/skitterling',
  effectOrdinal: 1,
  sourceSpan: { byteStart: 10, byteEnd: 56 },
  sourceText: 'The target takes a bane on their next strike.',
  canonRefs: [],
  actionType: 'Main action',
  targetsText: 'One creature per minion',
  distanceText: null,
  keywords: [],
  resolution: {
    kind: 'next-roll-grant',
    polarity: 'bane',
    scope: 'strike',
    direction: 'outbound',
    subject: 'the-target',
    window: null,
  },
};

/** "The next strike made against the target gains an edge." — Ghost, Heat
 * Death Effect line (inbound mark). */
const GHOST_MARK_EFFECT: EffectProgramData = {
  effectArtifactId: 'mcdm.monsters.v1/monster.undead.1st-echelon.statblock/ghost',
  effectOrdinal: 1,
  sourceSpan: { byteStart: 10, byteEnd: 64 },
  sourceText: 'The next strike made against the target gains an edge.',
  canonRefs: [],
  actionType: 'Main action',
  targetsText: 'Two creatures or objects',
  distanceText: null,
  keywords: [],
  resolution: {
    kind: 'next-roll-grant',
    polarity: 'edge',
    scope: 'strike',
    direction: 'inbound',
    subject: 'the-target',
    window: null,
  },
};

/** Same sentence from a DIFFERENT ability — Shadow Elf Sniper, Lumina Arrow
 * (different-ability marks combine; same-ability marks collapse). */
const SNIPER_MARK_EFFECT: EffectProgramData = {
  ...GHOST_MARK_EFFECT,
  effectArtifactId: 'mcdm.monsters.v1/monster.elf-shadow.statblock/shadow-elf-sniper',
  targetsText: 'One creature or object per minion',
};

/** "The target takes a bane on their next power roll made before the end of
 * their next turn." — Raider's Awe Effect line (windowed, power-roll
 * scoped). */
const RAIDERS_AWE_EFFECT: EffectProgramData = {
  effectArtifactId: 'mcdm.heroes.v1/feature.ability.raider/raiders-awe',
  effectOrdinal: 1,
  sourceSpan: { byteStart: 10, byteEnd: 100 },
  sourceText:
    'The target takes a bane on their next power roll made before the end of their next turn.',
  canonRefs: [],
  actionType: 'Main action',
  targetsText: 'One creature',
  distanceText: null,
  keywords: [],
  resolution: {
    kind: 'next-roll-grant',
    polarity: 'bane',
    scope: 'power-roll',
    direction: 'outbound',
    subject: 'the-target',
    window: 'end-of-targets-next-turn',
  },
};

/** Devil Adjudicator #2-style forced test (the characteristic-test family's
 * engine fixture shape) — used here to prove R-0013 consumption scope. */
function testEffect(): EffectProgramData {
  return {
    effectArtifactId: 'mcdm.monsters.v1/monster.devil.statblock/devil-adjudicator',
    effectOrdinal: 2,
    sourceSpan: { byteStart: 10, byteEnd: 60 },
    sourceText: 'The target makes a **Presence test**.',
    canonRefs: [],
    actionType: 'Maneuver',
    targetsText: 'One creature',
    distanceText: null,
    keywords: [],
    resolution: {
      kind: 'test',
      characteristic: 'presence',
      subject: 'the-target',
      tiers: {
        tier1: { kind: 'verbatim', sourceText: 'tier 1 outcome (verbatim)' },
        tier2: { kind: 'verbatim', sourceText: 'tier 2 outcome (verbatim)' },
        tier3: { kind: 'verbatim', sourceText: 'tier 3 outcome (verbatim)' },
      },
    },
  };
}

function freshState(): EncounterState {
  return initialEncounterState([
    { id: 'skitterling', kind: 'director-creature', stats: STATS },
    { id: 'hero-1', kind: 'hero', stats: STATS },
    { id: 'hero-2', kind: 'hero', stats: STATS },
  ]);
}

function withGrants(
  state: EncounterState,
  participantId: string,
  grants: NextRollGrant[],
): EncounterState {
  const participant = state.participants[participantId];
  if (!participant) throw new Error(`no participant ${participantId}`);
  return {
    ...state,
    participants: {
      ...state.participants,
      [participantId]: { ...participant, grants },
    },
  };
}

function dispatchChecked(state: EncounterState, intent: Intent) {
  const result = applyIntent(state, intent, { random: createSeededRandomSource(7) });
  expect(checkInvariants(state, intent, result)).toEqual([]);
  return result;
}

function grantEffectIntent(
  effect: EffectProgramData,
  targets: string[],
  intentId = 'grant-i1',
): Intent {
  return {
    intentId,
    kind: 'use-effect',
    actor: { kind: 'director' },
    payload: { actorParticipantId: 'skitterling', effect, targets },
  };
}

function clawsIntent(targets: string[], overrides: Record<string, unknown> = {}): Intent {
  return {
    intentId: 'claws-i1',
    kind: 'use-ability',
    actor: { kind: 'director' },
    payload: {
      actorParticipantId: 'skitterling',
      ability: SKITTERLING_CLAWS,
      targets,
      dice: [5, 4] as [number, number], // 9 + 2 = 11 → tier 1 unmodified
      ...overrides,
    },
  };
}

const bareBane = (grantId: string, sourceAbility: string): NextRollGrant => ({
  grantId,
  polarity: 'bane',
  scope: 'strike',
  direction: 'outbound',
  source: { participantId: 'hero-2', effectArtifactId: sourceAbility },
  window: null,
});

describe('granting via use-effect (R-0012, R-0014)', () => {
  it('stores an attributed pending bane on the target', () => {
    const before = freshState();
    const result = dispatchChecked(before, grantEffectIntent(CLAWS_GRANT_EFFECT, ['hero-1']));
    const grants = result.state.participants['hero-1']?.grants ?? [];
    expect(grants).toHaveLength(1);
    expect(grants[0]).toMatchObject({
      polarity: 'bane',
      scope: 'strike',
      direction: 'outbound',
      window: null,
      source: {
        participantId: 'skitterling',
        effectArtifactId: CLAWS_GRANT_EFFECT.effectArtifactId,
      },
    });
    expect(
      result.log.some(
        (entry) => entry.kind === 'mutation' && Array.isArray(entry.data.addedGrantIds),
      ),
    ).toBe(true);
  });

  it('collapses a same-ability repeat instead of stacking (Stacking Unique Effects)', () => {
    const before = freshState();
    const first = dispatchChecked(before, grantEffectIntent(CLAWS_GRANT_EFFECT, ['hero-1'], 'g1'));
    const second = dispatchChecked(
      first.state,
      grantEffectIntent(CLAWS_GRANT_EFFECT, ['hero-1'], 'g2'),
    );
    const grants = second.state.participants['hero-1']?.grants ?? [];
    expect(grants).toHaveLength(1);
    expect(grants[0]?.grantId).toContain('#g2-');
    expect(
      second.log.some(
        (entry) => entry.kind === 'mutation' && Array.isArray(entry.data.removedGrantIds),
      ),
    ).toBe(true);
  });

  it('keeps grants from different abilities side by side', () => {
    const before = freshState();
    const first = dispatchChecked(before, grantEffectIntent(GHOST_MARK_EFFECT, ['hero-1'], 'g1'));
    const second = dispatchChecked(
      first.state,
      grantEffectIntent(SNIPER_MARK_EFFECT, ['hero-1'], 'g2'),
    );
    expect(second.state.participants['hero-1']?.grants).toHaveLength(2);
  });
});

describe('outbound consumption (R-0013, R-0015)', () => {
  it('a pending bane applies to the next strike, shifts the receipt counts, and is spent', () => {
    const grant = bareBane('test-grant-1', 'mcdm.monsters.v1/monster.goblin.statblock/skitterling');
    const before = withGrants(freshState(), 'skitterling', [grant]);
    const result = dispatchChecked(before, clawsIntent(['hero-1']));
    // dice 5+4=9, +2 fixed, bane −2 → total 9 → tier 1; the receipt carries
    // the effective counts and the consumption claim.
    const roll = result.log.find((entry) => entry.data.powerRoll !== undefined)?.data.powerRoll as {
      edges: number;
      banes: number;
      assertedBanes: number;
      resolution: { total: number; tier: number };
    };
    expect(roll.banes).toBe(1);
    expect(roll.assertedBanes).toBe(0);
    expect(roll.resolution.total).toBe(9);
    expect(result.state.participants.skitterling?.grants).toEqual([]);
    expect(
      result.log.some(
        (entry) =>
          entry.kind === 'mutation' &&
          Array.isArray(entry.data.removedGrantIds) &&
          (entry.data.removedGrantIds as string[]).includes('test-grant-1'),
      ),
    ).toBe(true);
  });

  it('a strike-scoped grant sits dormant across a test and is not consumed (R-0013)', () => {
    const grant = bareBane('test-grant-2', 'mcdm.monsters.v1/monster.goblin.statblock/skitterling');
    const before = withGrants(freshState(), 'hero-1', [grant]);
    const dispatched: Intent = {
      intentId: 'test-i1',
      kind: 'use-effect',
      actor: { kind: 'director' },
      payload: {
        actorParticipantId: 'skitterling',
        effect: testEffect(),
        targets: ['hero-1'],
        testRolls: { 'hero-1': { dice: [5, 4] as [number, number] } },
      },
    };
    const result = dispatchChecked(before, dispatched);
    const roll = result.log.find((entry) => entry.data.testRoll !== undefined)?.data.testRoll as {
      edges: number;
      banes: number;
    };
    expect(roll.banes).toBe(0);
    expect(result.state.participants['hero-1']?.grants).toHaveLength(1);
  });

  it('a power-roll-scoped grant is consumed by a test (a test is a power roll, R-0013)', () => {
    const grant: NextRollGrant = {
      grantId: 'test-grant-3',
      polarity: 'bane',
      scope: 'power-roll',
      direction: 'outbound',
      source: {
        participantId: 'hero-2',
        effectArtifactId: 'mcdm.heroes.v1/feature.ability.raider/raiders-awe',
      },
      window: 'end-of-targets-next-turn',
    };
    const before = withGrants(freshState(), 'hero-1', [grant]);
    const dispatched: Intent = {
      intentId: 'test-i2',
      kind: 'use-effect',
      actor: { kind: 'director' },
      payload: {
        actorParticipantId: 'skitterling',
        effect: testEffect(),
        targets: ['hero-1'],
        testRolls: { 'hero-1': { dice: [8, 6] as [number, number] } },
      },
    };
    const result = dispatchChecked(before, dispatched);
    const roll = result.log.find((entry) => entry.data.testRoll !== undefined)?.data.testRoll as {
      banes: number;
      resolution: { total: number };
    };
    // 8+6=14, bane −2 → 12 (tier 2 instead of 14's tier 2 — the count is
    // what matters; totals recompute through the invariant).
    expect(roll.banes).toBe(1);
    expect(roll.resolution.total).toBe(12);
    expect(result.state.participants['hero-1']?.grants).toEqual([]);
  });

  it('a grant is spent even when cancellation zeroes its effect (R-0015)', () => {
    const grant = bareBane('test-grant-4', 'mcdm.monsters.v1/monster.goblin.statblock/skitterling');
    const before = withGrants(freshState(), 'skitterling', [grant]);
    const result = dispatchChecked(
      before,
      clawsIntent(['hero-1'], { edges: 1 }), // situational edge cancels the granted bane
    );
    const roll = result.log.find((entry) => entry.data.powerRoll !== undefined)?.data.powerRoll as {
      edges: number;
      banes: number;
      resolution: { total: number; netEdgeBane?: number };
    };
    expect(roll.edges).toBe(1);
    expect(roll.banes).toBe(1);
    expect(roll.resolution.total).toBe(11); // 9 + 2, cancelled pair adds nothing
    expect(result.state.participants.skitterling?.grants).toEqual([]);
  });
});

describe('inbound marks are target-local (R-0014)', () => {
  it('one strike gains the edge against the marked target only, with per-target tiers', () => {
    const mark: NextRollGrant = {
      grantId: 'mark-1',
      polarity: 'edge',
      scope: 'strike',
      direction: 'inbound',
      source: {
        participantId: 'skitterling',
        effectArtifactId: 'mcdm.monsters.v1/monster.undead.1st-echelon.statblock/ghost',
      },
      window: null,
    };
    const before = withGrants(freshState(), 'hero-1', [mark]);
    const result = dispatchChecked(before, clawsIntent(['hero-1', 'hero-2']));
    // Base: 9 + 2 = 11 → tier 1 (hero-2). hero-1 pool gains the mark's edge:
    // 11 + 2 = 13 → tier 2. Different tiers from ONE roll.
    const roll = result.log.find((entry) => entry.data.powerRoll !== undefined)?.data.powerRoll as {
      resolution: { tier: number };
      perTarget: Record<string, { edges: number; resolution: { tier: number } }>;
    };
    expect(roll.resolution.tier).toBe(1);
    expect(roll.perTarget['hero-1']?.edges).toBe(1);
    expect(roll.perTarget['hero-1']?.resolution.tier).toBe(2);
    expect(roll.perTarget['hero-2']?.resolution.tier).toBe(1);
    // Damage follows the per-target tier: 2 poison vs 1 poison.
    expect(result.state.participants['hero-1']?.stamina?.current).toBe(18);
    expect(result.state.participants['hero-2']?.stamina?.current).toBe(19);
    // The mark is spent; marks never leak to the unmarked target.
    expect(result.state.participants['hero-1']?.grants).toEqual([]);
    expect(result.state.participants['hero-2']?.grants).toEqual([]);
  });

  it('different-ability marks on one target combine into a double edge; both are spent', () => {
    const ghostMark: NextRollGrant = {
      grantId: 'mark-ghost',
      polarity: 'edge',
      scope: 'strike',
      direction: 'inbound',
      source: {
        effectArtifactId: 'mcdm.monsters.v1/monster.undead.1st-echelon.statblock/ghost',
      },
      window: null,
    };
    const sniperMark: NextRollGrant = {
      ...ghostMark,
      grantId: 'mark-sniper',
      source: {
        effectArtifactId: 'mcdm.monsters.v1/monster.elf-shadow.statblock/shadow-elf-sniper',
      },
    };
    const before = withGrants(freshState(), 'hero-1', [ghostMark, sniperMark]);
    const result = dispatchChecked(before, clawsIntent(['hero-1']));
    const roll = result.log.find((entry) => entry.data.powerRoll !== undefined)?.data.powerRoll as {
      perTarget: Record<string, { edges: number; resolution: { tier: number } }>;
    };
    // Two edges = double edge: no +2, tier steps 1 → 2 [rule.dice/edge].
    expect(roll.perTarget['hero-1']?.edges).toBe(2);
    expect(roll.perTarget['hero-1']?.resolution.tier).toBe(2);
    expect(result.state.participants['hero-1']?.grants).toEqual([]);
  });

  it('a non-strike roll neither consumes nor sees a strike-scoped mark', () => {
    const mark: NextRollGrant = {
      grantId: 'mark-2',
      polarity: 'edge',
      scope: 'strike',
      direction: 'inbound',
      source: {
        effectArtifactId: 'mcdm.monsters.v1/monster.undead.1st-echelon.statblock/ghost',
      },
      window: null,
    };
    const nonStrike: AbilityEffectData = {
      ...SKITTERLING_CLAWS,
      abilityArtifactId: 'mcdm.monsters.v1/monster.goblin.statblock/skitterling#claws-area-proxy',
      keywords: ['Area', 'Magic'],
    };
    const before = withGrants(freshState(), 'hero-1', [mark]);
    const result = dispatchChecked(before, clawsIntent(['hero-1'], { ability: nonStrike }));
    const roll = result.log.find((entry) => entry.data.powerRoll !== undefined)?.data.powerRoll as {
      edges: number;
      perTarget?: unknown;
    };
    expect(roll.edges).toBe(0);
    expect(roll.perTarget).toBeUndefined();
    expect(result.state.participants['hero-1']?.grants).toHaveLength(1);
  });
});

describe('expiry (R-0012, R-0016)', () => {
  const windowed: NextRollGrant = {
    grantId: 'windowed-1',
    polarity: 'bane',
    scope: 'power-roll',
    direction: 'outbound',
    source: {
      participantId: 'hero-2',
      effectArtifactId: 'mcdm.heroes.v1/feature.ability.raider/raiders-awe',
    },
    window: 'end-of-targets-next-turn',
  };
  const bare = bareBane('bare-1', 'mcdm.monsters.v1/monster.goblin.statblock/skitterling');

  it('a windowed grant expires at the holder’s end-turn; a bare grant survives', () => {
    const before = withGrants(freshState(), 'hero-1', [windowed, bare]);
    const result = dispatchChecked(before, {
      intentId: 'et-1',
      kind: 'end-turn',
      actor: { kind: 'participant', participantId: 'hero-1' },
      payload: { participantId: 'hero-1' },
    });
    const remaining = result.state.participants['hero-1']?.grants ?? [];
    expect(remaining.map((grant) => grant.grantId)).toEqual(['bare-1']);
    expect(
      result.log.some(
        (entry) =>
          entry.kind === 'mutation' &&
          Array.isArray(entry.data.removedGrantIds) &&
          (entry.data.removedGrantIds as string[]).includes('windowed-1'),
      ),
    ).toBe(true);
  });

  it('every remaining grant clears with the encounter (R-0012)', () => {
    const before = withGrants(freshState(), 'hero-1', [bare]);
    const result = dispatchChecked(before, {
      intentId: 'ee-1',
      kind: 'end-encounter',
      actor: { kind: 'director' },
      payload: {},
    });
    expect(result.state.participants['hero-1']?.grants).toEqual([]);
    expect(
      result.log.some(
        (entry) =>
          entry.kind === 'mutation' &&
          Array.isArray(entry.data.removedGrantIds) &&
          (entry.data.removedGrantIds as string[]).includes('bare-1'),
      ),
    ).toBe(true);
  });
});

describe('table-mode holders (stats: null)', () => {
  it('an inbound mark on a table-mode target is consumed by the strike while damage stays a receipt', () => {
    const base = initialEncounterState([
      { id: 'skitterling', kind: 'director-creature', stats: STATS },
      { id: 'husk', kind: 'director-creature' },
    ]);
    const mark: NextRollGrant = {
      grantId: 'mark-husk',
      polarity: 'edge',
      scope: 'strike',
      direction: 'inbound',
      source: {
        effectArtifactId: 'mcdm.monsters.v1/monster.undead.1st-echelon.statblock/ghost',
      },
      window: null,
    };
    const before = withGrants(base, 'husk', [mark]);
    const result = dispatchChecked(before, clawsIntent(['husk']));
    // The mark applies to the strike against the table-mode holder and is
    // spent; per-target receipt carries the edge; damage automation stays
    // blocked (stats: null) and routes to a table directive.
    const roll = result.log.find((entry) => entry.data.powerRoll !== undefined)?.data.powerRoll as {
      perTarget: Record<string, { edges: number; resolution: { tier: number } }>;
    };
    expect(roll.perTarget.husk?.edges).toBe(1);
    expect(roll.perTarget.husk?.resolution.tier).toBe(2); // 9 + 2 + 2 = 13
    expect(result.state.participants.husk?.grants).toEqual([]);
    expect(result.state.participants.husk?.stamina).toBeNull();
    expect(result.log.some((entry) => entry.data.unautomatedDamage !== undefined)).toBe(true);
  });
});

describe('grant Effect dispatch bookkeeping', () => {
  it('re-dispatching the same intent id refuses without mutation', () => {
    const before = freshState();
    const first = dispatchChecked(before, grantEffectIntent(CLAWS_GRANT_EFFECT, ['hero-1'], 'dup'));
    const second = dispatchChecked(
      first.state,
      grantEffectIntent(CLAWS_GRANT_EFFECT, ['hero-1'], 'dup'),
    );
    expect(second.log.some((entry) => entry.kind === 'refusal')).toBe(true);
    expect(second.state).toEqual(first.state);
  });
});
