import { describe, expect, it } from 'vitest';
import { applyIntent } from './apply-intent.js';
import { applySquadDamage, isMinion, squadOf } from './damage.js';
import { createSeededRandomSource } from './determinism.js';
import { initialEncounterState, squadSeedWarnings } from './driver.js';
import { checkInvariants } from './invariants.js';
import type {
  AbilityEffectData,
  EffectProgramData,
  EncounterState,
  Intent,
  LogEntry,
  ParticipantStats,
} from './schemas.js';

/**
 * Minion squad Stamina pools (R-0023..R-0028, docs/minion-pool-design.md).
 * Fixtures are real corpus records quoted verbatim from the accepted pin;
 * participant ids and asserted stats are host identifiers/test assertions,
 * not rule content. The two PRINTED worked examples (the spinecleaver
 * 40-pool threshold walk, Monsters p.7/p.8, and the Incinerate 15-not-18
 * area cap, Monsters p.8) are reproduced exactly; their drift-guarded
 * verbatim fixtures live in packages/canon/src/fixtures/.
 */

/** Goblin Spinecleaver — monsters/md/monster/goblin/statblock/
 * goblin-spinecleaver.md: Stamina 5, Minion Brute, M+2 A0 R0 I0 P-1, no
 * immunity/weakness. "a goblin spinecleaver has 5 Stamina, so a squad of
 * eight spinecleavers has a Stamina pool of 40" [§Shared Low Stamina]. */
const SPINECLEAVER_STATS: ParticipantStats = {
  staminaMax: 5,
  characteristics: { might: 2, agility: 0, reason: 0, intuition: 0, presence: -1 },
  immunities: [],
  weaknesses: [],
  potencies: null,
  organization: 'Minion',
  recoveriesMax: null,
  withCaptain: null,
};

const SPINECLEAVER_RECORD = 'mcdm.monsters.v1/monster.goblin.statblock/goblin-spinecleaver';

/** Goblin Warrior — monsters/md/monster/goblin/statblock/goblin-warrior.md:
 * Stamina 15, Horde Harrier (a real NON-minion — the captain fixture). */
const GOBLIN_WARRIOR_STATS: ParticipantStats = {
  staminaMax: 15,
  characteristics: { might: -2, agility: 2, reason: 0, intuition: 0, presence: -1 },
  immunities: [],
  weaknesses: [],
  potencies: null,
  organization: 'Horde',
  recoveriesMax: null,
  withCaptain: null,
};

/** Host-asserted hero stats (test assertion, not rule content). */
const HERO_STATS: ParticipantStats = {
  staminaMax: 18,
  characteristics: { might: 0, agility: 0, reason: 2, intuition: 0, presence: 0 },
  immunities: [],
  weaknesses: [],
  potencies: null,
  organization: null,
  recoveriesMax: 8,
  withCaptain: null,
};

/**
 * Incinerate — heroes/md/feature/ability/talent/level-1/incinerate.md:
 * keywords "Area, Fire, Psionic, Pyrokinesis, Ranged"; Main action; "Each
 * enemy in the area"; Power Roll + Reason; ≤11: 2 fire damage; 12–16: 4
 * fire damage; 17+: 6 fire damage. The printed area worked example's
 * ability [§Minions and Area Effects].
 */
const INCINERATE: AbilityEffectData = {
  abilityArtifactId: 'mcdm.heroes.v1/feature.ability.talent.level-1/incinerate',
  actionType: 'Main action',
  keywords: ['Area', 'Fire', 'Psionic', 'Pyrokinesis', 'Ranged'],
  targetsText: 'Each enemy in the area',
  powerRollBonus: { kind: 'characteristic', options: ['R'] },
  tiers: {
    tier1: {
      damage: { amount: 2, characteristicOptions: [], typeOptions: ['fire'] },
      potency: null,
      conditionIds: [],
      ending: null,
    },
    tier2: {
      damage: { amount: 4, characteristicOptions: [], typeOptions: ['fire'] },
      potency: null,
      conditionIds: [],
      ending: null,
    },
    tier3: {
      damage: { amount: 6, characteristicOptions: [], typeOptions: ['fire'] },
      potency: null,
      conditionIds: [],
      ending: null,
    },
  },
};

/** Skitterling, Claws (monsters/md/monster/goblin/statblock/skitterling.md):
 * keywords "Melee, Strike, Weapon"; "One creature per minion"; Power Roll
 * + 2; 17+: 3 poison damage — a real NON-area multi-target damage source. */
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

const SC_IDS = ['sc1', 'sc2', 'sc3', 'sc4', 'sc5', 'sc6', 'sc7', 'sc8'] as const;

function spinecleaverEncounter(): EncounterState {
  return initialEncounterState(
    [
      ...SC_IDS.map((id) => ({
        id,
        kind: 'director-creature' as const,
        sourceRecordId: SPINECLEAVER_RECORD,
        stats: SPINECLEAVER_STATS,
      })),
      { id: 'talent', kind: 'hero', stats: HERO_STATS },
      { id: 'warrior', kind: 'director-creature', stats: GOBLIN_WARRIOR_STATS },
    ],
    [{ squadId: 'squad-sc', name: 'goblin spinecleavers', memberIds: [...SC_IDS] }],
  );
}

function dispatch(before: EncounterState, intent: Intent) {
  const result = applyIntent(before, intent, { random: createSeededRandomSource(11) });
  expect(checkInvariants(before, intent, result)).toEqual([]);
  return result;
}

let intentCounter = 0;

function damageIntent(
  target: string,
  amount: number,
  overrides: Partial<Extract<Intent, { kind: 'apply-damage' }>['payload']> = {},
): Intent {
  intentCounter += 1;
  return {
    intentId: `squad-i${intentCounter}`,
    kind: 'apply-damage',
    actor: { kind: 'director' },
    payload: { target, amount, reason: 'damage (test vector)', ...overrides },
  };
}

function squad(state: EncounterState, squadId = 'squad-sc') {
  const found = state.squads.find((candidate) => candidate.squadId === squadId);
  if (!found) throw new Error(`no squad ${squadId}`);
  return found;
}

function deaths(log: readonly LogEntry[]): string[] {
  return log.flatMap((entry) =>
    Array.isArray(entry.data.squadDeaths)
      ? (entry.data.squadDeaths as { memberId: string }[]).map((death) => death.memberId)
      : [],
  );
}

describe('squad seeding [R-0023]', () => {
  it('pool = per-minion Stamina × member count (printed: eight spinecleavers → 40)', () => {
    const state = spinecleaverEncounter();
    expect(squad(state).pool).toEqual({ current: 40, max: 40 });
    expect(squad(state).perMinionStamina).toBe(5);
    expect(squad(state).memberIds).toEqual([...SC_IDS]);
    expect(squad(state).deadMemberIds).toEqual([]);
    expect(squad(state).pendingKills).toBe(0);
    expect(squad(state).captainId).toBeNull();
  });

  it('squad members carry stamina: null — the pool is the one home for their vitality', () => {
    const state = spinecleaverEncounter();
    for (const id of SC_IDS) {
      expect(state.participants[id]?.stamina).toBeNull();
      expect(state.participants[id]?.stats).not.toBeNull();
    }
    // Non-members are untouched.
    expect(state.participants.talent?.stamina?.current).toBe(18);
    expect(state.participants.warrior?.stamina?.current).toBe(15);
  });

  it('refuses a mixed-statblock squad (canon-incoherent: one per-minion Stamina)', () => {
    expect(() =>
      initialEncounterState(
        [
          {
            id: 'sc1',
            kind: 'director-creature',
            sourceRecordId: SPINECLEAVER_RECORD,
            stats: SPINECLEAVER_STATS,
          },
          {
            id: 'sk1',
            kind: 'director-creature',
            sourceRecordId: 'mcdm.monsters.v1/monster.goblin.statblock/skitterling',
            // Skitterling: Stamina 3, Minion Hexer (skitterling.md).
            stats: { ...SPINECLEAVER_STATS, staminaMax: 3 },
          },
        ],
        [{ squadId: 'mixed', name: 'mixed goblins', memberIds: ['sc1', 'sk1'] }],
      ),
    ).toThrow(/mixes stat blocks/);
  });

  it('refuses a non-minion member and an unknown member', () => {
    const participants = [
      {
        id: 'sc1',
        kind: 'director-creature' as const,
        sourceRecordId: SPINECLEAVER_RECORD,
        stats: SPINECLEAVER_STATS,
      },
      { id: 'warrior', kind: 'director-creature' as const, stats: GOBLIN_WARRIOR_STATS },
    ];
    expect(() =>
      initialEncounterState(participants, [
        { squadId: 's', name: 's', memberIds: ['sc1', 'warrior'] },
      ]),
    ).toThrow(/not a Minion/);
    expect(() =>
      initialEncounterState(participants, [{ squadId: 's', name: 's', memberIds: ['ghost'] }]),
    ).toThrow(/unknown participant/);
  });

  it('refuses one participant in two squads', () => {
    const participants = SC_IDS.map((id) => ({
      id,
      kind: 'director-creature' as const,
      sourceRecordId: SPINECLEAVER_RECORD,
      stats: SPINECLEAVER_STATS,
    }));
    expect(() =>
      initialEncounterState(participants, [
        { squadId: 'a', name: 'a', memberIds: ['sc1', 'sc2'] },
        { squadId: 'b', name: 'b', memberIds: ['sc2', 'sc3'] },
      ]),
    ).toThrow(/two squads/);
  });

  it('warns and applies a squad of more than eight (printed bound, coherent math)', () => {
    const ids = [...SC_IDS, 'sc9'];
    const participants = ids.map((id) => ({
      id,
      kind: 'director-creature' as const,
      sourceRecordId: SPINECLEAVER_RECORD,
      stats: SPINECLEAVER_STATS,
    }));
    const seeds = [{ squadId: 'big', name: 'big squad', memberIds: ids }];
    const state = initialEncounterState(participants, seeds);
    expect(squad(state, 'big').pool).toEqual({ current: 45, max: 45 });
    expect(squadSeedWarnings(seeds)).toHaveLength(1);
    expect(squadSeedWarnings(seeds)[0]).toMatch(/up to eight/);
  });

  it('a minion NOT seeded into a squad keeps table-routed damage (seeding is the boundary)', () => {
    const state = initialEncounterState([
      {
        id: 'lone',
        kind: 'director-creature',
        sourceRecordId: SPINECLEAVER_RECORD,
        stats: SPINECLEAVER_STATS,
      },
    ]);
    const lone = state.participants.lone;
    if (!lone) throw new Error('missing');
    expect(isMinion(lone)).toBe(true);
    expect(squadOf(state, 'lone')).toBeUndefined();
    const result = dispatch(state, damageIntent('lone', 3));
    expect(result.state).toEqual(state);
    expect(
      result.log.some(
        (entry) => entry.kind === 'table-directive' && entry.data.unautomatedDamage !== undefined,
      ),
    ).toBe(true);
    expect(result.log[0]?.message).toMatch(/not seeded into a squad/);
  });
});

describe('non-area pool damage [R-0024]', () => {
  it('reproduces the printed threshold walk: 40 → 35, 30, 25, 20, 15, 10, 5, 0 — one death each', () => {
    // "If a squad of goblin spinecleavers has its Stamina pool reduced from
    // 40 to 35, the minion who took the damage that reduced the pool dies.
    // When the Stamina pool hits 30, 25, 20, 15, 10, 5, and finally 0,
    // another minion in the squad dies each time." [§Dropping One Minion]
    let state = spinecleaverEncounter();
    const expectedPools = [35, 30, 25, 20, 15, 10, 5, 0];
    for (const [index, expectedPool] of expectedPools.entries()) {
      const targetId = SC_IDS[index];
      if (!targetId) throw new Error('walk exhausted');
      const result = dispatch(state, damageIntent(targetId, 5));
      state = result.state;
      expect(squad(state).pool.current).toBe(expectedPool);
      expect(deaths(result.log)).toEqual([targetId]);
      expect(squad(state).deadMemberIds).toHaveLength(index + 1);
    }
    expect(squad(state).memberIds).toEqual([]);
    expect(squad(state).pendingKills).toBe(0);
  });

  it('decrements the FULL damage with carryover between thresholds — nothing rounds away', () => {
    // R-0024's accepted example: minions of 2 Stamina, 7 damage → three
    // kills and the seventh point carried toward the next kill. Stats here
    // are the ruling's own worked numbers (host assertion, R-0024).
    const twoStamina: ParticipantStats = { ...SPINECLEAVER_STATS, staminaMax: 2 };
    const ids = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8'];
    const state = initialEncounterState(
      ids.map((id) => ({ id, kind: 'director-creature' as const, stats: twoStamina })),
      [{ squadId: 'pool2', name: 'two-Stamina minions', memberIds: ids }],
    );
    expect(squad(state, 'pool2').pool.max).toBe(16);
    const first = dispatch(state, damageIntent('m1', 7));
    expect(squad(first.state, 'pool2').pool.current).toBe(9);
    // Three kills: the hit minion first, two more pending identity.
    expect(deaths(first.log)).toEqual(['m1']);
    expect(squad(first.state, 'pool2').pendingKills).toBe(2);
    expect(
      first.log.some(
        (entry) => entry.kind === 'table-directive' && entry.data.pendingKillIdentity !== undefined,
      ),
    ).toBe(true);
    // The carried point counts toward the next threshold: 1 more damage
    // crosses it (9 → 8; floor(8/2) − floor(7/2) = 1 kill).
    const second = dispatch(first.state, damageIntent('m2', 1));
    expect(squad(second.state, 'pool2').pool.current).toBe(8);
    expect(deaths(second.log)).toEqual(['m2']);
  });

  it('damage past the last pool point is discarded with the full damage on the receipt', () => {
    const ids = ['m1', 'm2'];
    const twoStamina: ParticipantStats = { ...SPINECLEAVER_STATS, staminaMax: 2 };
    const state = initialEncounterState(
      ids.map((id) => ({ id, kind: 'director-creature' as const, stats: twoStamina })),
      [{ squadId: 'small', name: 'small squad', memberIds: ids }],
    );
    const result = dispatch(state, damageIntent('m1', 9, { minionKillVictims: ['m2'] }));
    const receipt = result.log.find((entry) => entry.data.squadDamage !== undefined)?.data
      .squadDamage as { fullPoolReduction: number; overflowDiscarded: number };
    expect(squad(result.state, 'small').pool.current).toBe(0);
    expect(receipt.fullPoolReduction).toBe(9);
    expect(receipt.overflowDiscarded).toBe(5);
    expect(deaths(result.log)).toEqual(['m1', 'm2']);
    expect(squad(result.state, 'small').pendingKills).toBe(0);
  });

  it('every death receipts "counts as being reduced to 0 Stamina for triggering effects" [R-0027]', () => {
    const result = dispatch(spinecleaverEncounter(), damageIntent('sc1', 5));
    const death = result.log.find((entry) => entry.data.zeroStaminaTrigger !== undefined);
    expect(death?.message).toMatch(/counts as being reduced to 0 Stamina for triggering effects/);
  });

  it('named victims die after the damaged target; the rest goes pending', () => {
    const result = dispatch(
      spinecleaverEncounter(),
      damageIntent('sc1', 17, { minionKillVictims: ['sc5', 'sc7'] }),
    );
    // 40 → 23: floor(17/5) = 3 kills — sc1 (hit) first, then sc5, sc7.
    expect(squad(result.state).pool.current).toBe(23);
    expect(deaths(result.log)).toEqual(['sc1', 'sc5', 'sc7']);
    expect(squad(result.state).pendingKills).toBe(0);
  });

  it('refuses minionKillVictims on a non-squad target (invalid payload)', () => {
    const state = spinecleaverEncounter();
    const result = applyIntent(state, damageIntent('warrior', 3, { minionKillVictims: ['sc1'] }), {
      random: createSeededRandomSource(1),
    });
    expect(result.log[0]?.kind).toBe('refusal');
    expect(result.state).toEqual(state);
  });

  it('a non-area multi-target instance aggregates into ONE pool application at full damage', () => {
    // Skitterling Claws (Melee, Strike, Weapon — no Area keyword) at tier 3
    // deals 3 poison to each of two spinecleavers: the pool takes the full
    // 6 in one application (one squadDamage receipt).
    intentCounter += 1;
    const intent: Intent = {
      intentId: `squad-i${intentCounter}`,
      kind: 'use-ability',
      actor: { kind: 'director' },
      payload: {
        actorParticipantId: 'warrior',
        ability: SKITTERLING_CLAWS,
        targets: ['sc1', 'sc2'],
        automaticOutcomes: [3],
      },
    };
    const result = dispatch(spinecleaverEncounter(), intent);
    expect(squad(result.state).pool.current).toBe(34);
    const receipts = result.log.filter((entry) => entry.data.squadDamage !== undefined);
    expect(receipts).toHaveLength(1);
    // floor(6/5) = 1 kill: the first damaged target dies.
    expect(deaths(result.log)).toEqual(['sc1']);
  });
});

describe('area pool damage [R-0025]', () => {
  function incinerateAt(targets: string[]): Intent {
    intentCounter += 1;
    return {
      intentId: `squad-i${intentCounter}`,
      kind: 'use-ability',
      actor: { kind: 'director' },
      payload: {
        actorParticipantId: 'talent',
        ability: INCINERATE,
        targets,
        automaticOutcomes: [3],
      },
    };
  }

  it('reproduces the printed example: tier-3 Incinerate on three spinecleavers → 15, not 18', () => {
    // "a tier 3 outcome for the talent's Incinerate ability deals 6 fire
    // damage to each target in its area. If three goblin spinecleavers with
    // Stamina 5 are caught in the area, the minion pool loses 15 Stamina
    // instead of 18, leaving the other minions in the squad unscathed."
    // [§Minions and Area Effects]
    const result = dispatch(spinecleaverEncounter(), incinerateAt(['sc1', 'sc2', 'sc3']));
    expect(squad(result.state).pool.current).toBe(25);
    const receipt = result.log.find((entry) => entry.data.squadDamage !== undefined)?.data
      .squadDamage as { cappedSum: number; area: boolean };
    expect(receipt.area).toBe(true);
    expect(receipt.cappedSum).toBe(15);
    // Exactly the three bound in-area minions die — no pending identity.
    expect(deaths(result.log).sort()).toEqual(['sc1', 'sc2', 'sc3']);
    expect(squad(result.state).pendingKills).toBe(0);
  });

  it('the dispatch-asserted area flag caps manual damage the same way', () => {
    const result = dispatch(spinecleaverEncounter(), damageIntent('sc1', 9, { area: true }));
    // min(9, 5) = 5 → pool 40 → 35, one kill.
    expect(squad(result.state).pool.current).toBe(35);
    expect(deaths(result.log)).toEqual(['sc1']);
  });
});

describe('squad weakness/immunity — once, last [R-0026]', () => {
  const weakStats: ParticipantStats = {
    ...SPINECLEAVER_STATS,
    weaknesses: [{ appliesTo: 'fire', value: 3 }],
  };
  const immuneStats: ParticipantStats = {
    ...SPINECLEAVER_STATS,
    immunities: [{ appliesTo: 'fire', value: 3 }],
  };

  function encounterWith(stats: ParticipantStats): EncounterState {
    return initialEncounterState(
      [
        ...SC_IDS.map((id) => ({ id, kind: 'director-creature' as const, stats })),
        { id: 'talent', kind: 'hero' as const, stats: HERO_STATS },
      ],
      [{ squadId: 'squad-sc', name: 'weak spinecleavers', memberIds: [...SC_IDS] }],
    );
  }

  function incinerateAt(targets: string[]): Intent {
    intentCounter += 1;
    return {
      intentId: `squad-i${intentCounter}`,
      kind: 'use-ability',
      actor: { kind: 'director' },
      payload: {
        actorParticipantId: 'talent',
        ability: INCINERATE,
        targets,
        automaticOutcomes: [3],
      },
    };
  }

  it('applies weakness ONCE to the capped sum, last — and it can push a kill past the bound count', () => {
    // The R-0026 card composition: the Incinerate 15 + fire weakness 3 → 18.
    // With 2 carried pool points from an earlier hit, the 18 crosses a
    // FOURTH threshold — "can drop (or save!) multiple minions from any
    // source of damage, including area effects".
    const carried = dispatch(encounterWith(weakStats), damageIntent('sc8', 2));
    expect(squad(carried.state).pool.current).toBe(38);
    expect(deaths(carried.log)).toEqual([]);

    const result = dispatch(carried.state, incinerateAt(['sc1', 'sc2', 'sc3']));
    const receipt = result.log.find((entry) => entry.data.squadDamage !== undefined)?.data
      .squadDamage as {
      cappedSum: number;
      fullPoolReduction: number;
      weaknessApplied: unknown;
    };
    expect(receipt.cappedSum).toBe(15);
    expect(receipt.fullPoolReduction).toBe(18);
    expect(receipt.weaknessApplied).not.toBeNull();
    expect(squad(result.state).pool.current).toBe(20);
    // Four kills: the three bound in-area targets + one beyond them.
    expect(deaths(result.log).sort()).toEqual(['sc1', 'sc2', 'sc3']);
    expect(squad(result.state).pendingKills).toBe(1);
  });

  it('applies immunity ONCE to the sum — the "save!" direction', () => {
    const result = dispatch(encounterWith(immuneStats), incinerateAt(['sc1', 'sc2', 'sc3']));
    // 15 capped − 3 immunity = 12 → pool 28, floor(12/5) = 2 kills.
    expect(squad(result.state).pool.current).toBe(28);
    expect(deaths(result.log)).toEqual(['sc1', 'sc2']);
    expect(squad(result.state).pendingKills).toBe(0);
  });
});

describe('Effect-program and test-tier damage route to the pool', () => {
  it('an Effect damage program with the Area keyword caps per contribution [R-0025]', () => {
    // Lich, Cages of Wasting (monsters/md/monster/lich/statblock/lich.md):
    // header keywords "Area, Magic, Ranged". The second Effect line "The
    // lich deals an additional 10 corruption damage to each creature
    // restrained this way." compiles to a damage program under that header.
    const effect: EffectProgramData = {
      effectArtifactId: 'mcdm.monsters.v1/monster.lich.statblock/lich',
      effectOrdinal: 2,
      sourceSpan: { byteStart: 10, byteEnd: 100 },
      sourceText:
        'The lich deals an additional 10 corruption damage to each creature restrained this way.',
      canonRefs: [],
      actionType: null,
      targetsText: 'Each creature in the area',
      distanceText: 'Two 3 cubes within 10',
      keywords: ['Area', 'Magic', 'Ranged'],
      resolution: { kind: 'damage', amount: 10, damageType: 'corruption' },
    };
    intentCounter += 1;
    const result = dispatch(spinecleaverEncounter(), {
      intentId: `squad-i${intentCounter}`,
      kind: 'use-effect',
      actor: { kind: 'director' },
      payload: { actorParticipantId: 'talent', effect, targets: ['sc1', 'sc2'] },
    });
    // min(10, 5) × 2 = 10 → pool 30, one squadDamage receipt, two kills.
    expect(squad(result.state).pool.current).toBe(30);
    expect(result.log.filter((entry) => entry.data.squadDamage !== undefined)).toHaveLength(1);
    expect(deaths(result.log).sort()).toEqual(['sc1', 'sc2']);
  });

  it('a forced test whose tier bullet deals flat damage routes each roll to the pool as its own instance', () => {
    // Lich, Cages of Wasting tier-3 bullet: "20 corruption damage" — each
    // target's independent test roll is its own damage instance [R-0026],
    // area-capped per contribution [R-0025].
    const effect: EffectProgramData = {
      effectArtifactId: 'mcdm.monsters.v1/monster.lich.statblock/lich',
      effectOrdinal: 1,
      sourceSpan: { byteStart: 10, byteEnd: 60 },
      sourceText: 'Each target makes an Agility test.',
      canonRefs: [],
      actionType: null,
      targetsText: 'Each creature in the area',
      distanceText: 'Two 3 cubes within 10',
      keywords: ['Area', 'Magic', 'Ranged'],
      resolution: {
        kind: 'test',
        characteristic: 'agility',
        subject: 'each-target',
        tiers: {
          tier1: {
            kind: 'automatic',
            sourceText:
              '- **≤11:** 10 corruption damage; [restrained](scc.v1:mcdm.heroes.v1/condition/restrained) (save ends)',
            data: {
              damage: { amount: 10, characteristicOptions: [], typeOptions: ['corruption'] },
              potency: null,
              conditionIds: ['mcdm.heroes.v1/condition/restrained'],
              ending: 'save-ends',
            },
          },
          tier2: {
            kind: 'verbatim',
            sourceText:
              '- **12-16:** 16 corruption damage; [restrained](scc.v1:mcdm.heroes.v1/condition/restrained) (EoT)',
          },
          tier3: {
            kind: 'automatic',
            sourceText: '- **17+:** 20 corruption damage',
            data: {
              damage: { amount: 20, characteristicOptions: [], typeOptions: ['corruption'] },
              potency: null,
              conditionIds: [],
              ending: null,
            },
          },
        },
      },
    };
    intentCounter += 1;
    const result = dispatch(spinecleaverEncounter(), {
      intentId: `squad-i${intentCounter}`,
      kind: 'use-effect',
      actor: { kind: 'director' },
      payload: {
        actorParticipantId: 'talent',
        effect,
        targets: ['sc1', 'sc2'],
        // Both members obtain tier 1 (agility 0): 10 corruption each,
        // area-capped to 5 per instance → pool 40 → 30.
        testRolls: { sc1: { dice: [1, 2] }, sc2: { dice: [1, 2] } },
      },
    });
    expect(squad(result.state).pool.current).toBe(30);
    // Two independent instances → two receipts (legitimate for tests).
    expect(result.log.filter((entry) => entry.data.squadDamage !== undefined)).toHaveLength(2);
    expect(deaths(result.log).sort()).toEqual(['sc1', 'sc2']);
    // The tier-1 restrained condition still lands per-member.
    expect(
      result.state.participants.sc1?.conditions.some(
        (instance) => instance.conditionId === 'mcdm.heroes.v1/condition/restrained',
      ),
    ).toBe(true);
  });
});

describe('rule-mandated minion exemptions [R-0027]', () => {
  function program(resolution: EffectProgramData['resolution']): EffectProgramData {
    return {
      effectArtifactId: 'canon/effect/squad-exemption-example',
      effectOrdinal: 1,
      sourceSpan: { byteStart: 10, byteEnd: 40 },
      sourceText: 'x effect instruction',
      canonRefs: [],
      actionType: 'Main action',
      targetsText: 'Each target',
      distanceText: null,
      keywords: [],
      resolution,
    };
  }

  function useEffect(
    effect: EffectProgramData,
    targets: string[],
    overrides: Partial<Extract<Intent, { kind: 'use-effect' }>['payload']> = {},
  ): Intent {
    intentCounter += 1;
    return {
      intentId: `squad-i${intentCounter}`,
      kind: 'use-effect',
      actor: { kind: 'director' },
      payload: { actorParticipantId: 'talent', effect, targets, ...overrides },
    };
  }

  it('refuses a squad member regain per-binding — the sibling hero still regains', () => {
    let state = spinecleaverEncounter();
    const talent = state.participants.talent;
    if (!talent?.stamina) throw new Error('talent untracked');
    state = {
      ...state,
      participants: {
        ...state.participants,
        talent: { ...talent, stamina: { ...talent.stamina, current: 10 } },
      },
    };
    const regain = program({
      kind: 'regain-stamina',
      amount: 5,
      subjectText: 'Each target',
      singular: false,
    });
    const result = dispatch(state, useEffect(regain, ['sc1', 'talent']));
    const refusal = result.log.find((entry) => entry.kind === 'refusal');
    expect(refusal?.data.perBinding).toBe(true);
    expect(refusal?.message).toMatch(/can't regain Stamina/);
    expect(result.state.participants.sc1?.stamina).toBeNull();
    expect(squad(result.state).pool.current).toBe(40);
    expect(result.state.participants.talent?.stamina?.current).toBe(15);
  });

  it('refuses temporary Stamina for a squad member per-binding', () => {
    const grant = program({
      kind: 'temporary-stamina',
      amount: 4,
      subjectText: 'Each target',
      singular: false,
    });
    const result = dispatch(spinecleaverEncounter(), useEffect(grant, ['sc1']));
    const refusal = result.log.find((entry) => entry.kind === 'refusal');
    expect(refusal?.data.perBinding).toBe(true);
    expect(refusal?.data.minionRegainRefused).toMatchObject({ ruling: 'R-0027' });
  });

  it('refuses a Recovery spend for a squad member per-binding', () => {
    const offer = program({
      kind: 'spend-recovery',
      subjectText: 'Each target',
      singular: false,
    });
    const result = dispatch(
      spinecleaverEncounter(),
      useEffect(offer, ['sc1'], { recoverySpends: { sc1: true } }),
    );
    const refusal = result.log.find((entry) => entry.kind === 'refusal');
    expect(refusal?.data.perBinding).toBe(true);
    expect(refusal?.data.minionRecoverySpendRefused).toMatchObject({ ruling: 'R-0027' });
  });

  it('pool damage never derives winded or dying for squad members', () => {
    const result = dispatch(spinecleaverEncounter(), damageIntent('sc1', 22));
    expect(result.log.every((entry) => !/is winded|is dying/.test(entry.message))).toBe(true);
  });

  it('naming pending kills assigns identity WITHOUT a second 0-Stamina trigger receipt', () => {
    const hit = dispatch(spinecleaverEncounter(), damageIntent('sc1', 12));
    // floor(12/5) = 2 kills: sc1 + 1 pending.
    expect(squad(hit.state).pendingKills).toBe(1);
    intentCounter += 1;
    const naming = dispatch(hit.state, {
      intentId: `squad-i${intentCounter}`,
      kind: 'resolve-pending-kills',
      actor: { kind: 'director' },
      payload: { squadId: 'squad-sc', victimMemberIds: ['sc2'] },
    });
    expect(squad(naming.state).pendingKills).toBe(0);
    expect(squad(naming.state).deadMemberIds).toEqual(['sc1', 'sc2']);
    expect(naming.log.every((entry) => entry.data.zeroStaminaTrigger === undefined)).toBe(true);
    expect(naming.log[0]?.message).toMatch(/already fired/);
  });
});

describe('kill-identity and captain intents [R-0024, R-0028]', () => {
  function intentOf(
    kind: 'resolve-pending-kills' | 'attach-captain' | 'detach-captain',
    payload: unknown,
  ): Intent {
    intentCounter += 1;
    return {
      intentId: `squad-i${intentCounter}`,
      kind,
      actor: { kind: 'director' },
      payload,
    } as Intent;
  }

  it('refuses naming an unknown squad, a non-living victim, or too many victims', () => {
    const state = dispatch(spinecleaverEncounter(), damageIntent('sc1', 12)).state;
    const random = { random: createSeededRandomSource(1) };
    const unknown = applyIntent(
      state,
      intentOf('resolve-pending-kills', { squadId: 'ghost', victimMemberIds: ['sc2'] }),
      random,
    );
    expect(unknown.log[0]?.kind).toBe('refusal');
    const dead = applyIntent(
      state,
      intentOf('resolve-pending-kills', { squadId: 'squad-sc', victimMemberIds: ['sc1'] }),
      random,
    );
    expect(dead.log[0]?.kind).toBe('refusal');
    const tooMany = applyIntent(
      state,
      intentOf('resolve-pending-kills', { squadId: 'squad-sc', victimMemberIds: ['sc2', 'sc3'] }),
      random,
    );
    expect(tooMany.log[0]?.kind).toBe('refusal');
    expect(unknown.state).toEqual(state);
    expect(dead.state).toEqual(state);
    expect(tooMany.state).toEqual(state);
  });

  it('attaches a non-minion captain; captain Stamina stays individual', () => {
    const result = dispatch(
      spinecleaverEncounter(),
      intentOf('attach-captain', { squadId: 'squad-sc', captainId: 'warrior' }),
    );
    expect(squad(result.state).captainId).toBe('warrior');
    expect(squad(result.state).pool.current).toBe(40);
    expect(result.state.participants.warrior?.stamina?.current).toBe(15);
  });

  it('refuses a minion captain ("non-minion creature" is printed eligibility)', () => {
    const state = spinecleaverEncounter();
    const result = applyIntent(
      state,
      intentOf('attach-captain', { squadId: 'squad-sc', captainId: 'sc1' }),
      { random: createSeededRandomSource(1) },
    );
    expect(result.log[0]?.kind).toBe('refusal');
    expect(result.state).toEqual(state);
  });

  it('attaching over an existing captain warns and replaces', () => {
    let state = spinecleaverEncounter();
    state = dispatch(
      state,
      intentOf('attach-captain', { squadId: 'squad-sc', captainId: 'warrior' }),
    ).state;
    const replaced = dispatch(
      state,
      intentOf('attach-captain', { squadId: 'squad-sc', captainId: 'talent' }),
    );
    expect(replaced.log.some((entry) => entry.kind === 'warning')).toBe(true);
    expect(squad(replaced.state).captainId).toBe('talent');
  });

  it('attaching a captain who captains another squad warns and detaches them from it', () => {
    const scA = SC_IDS.slice(0, 4);
    const scB = SC_IDS.slice(4);
    let state = initialEncounterState(
      [
        ...SC_IDS.map((id) => ({
          id,
          kind: 'director-creature' as const,
          sourceRecordId: SPINECLEAVER_RECORD,
          stats: SPINECLEAVER_STATS,
        })),
        { id: 'warrior', kind: 'director-creature', stats: GOBLIN_WARRIOR_STATS },
      ],
      [
        { squadId: 'squad-a', name: 'squad a', memberIds: scA },
        { squadId: 'squad-b', name: 'squad b', memberIds: scB },
      ],
    );
    state = dispatch(
      state,
      intentOf('attach-captain', { squadId: 'squad-a', captainId: 'warrior' }),
    ).state;
    const moved = dispatch(
      state,
      intentOf('attach-captain', { squadId: 'squad-b', captainId: 'warrior' }),
    );
    expect(moved.log.some((entry) => entry.kind === 'warning')).toBe(true);
    expect(squad(moved.state, 'squad-a').captainId).toBeNull();
    expect(squad(moved.state, 'squad-b').captainId).toBe('warrior');
  });

  it('detaches a captain; refuses when none is attached', () => {
    let state = spinecleaverEncounter();
    state = dispatch(
      state,
      intentOf('attach-captain', { squadId: 'squad-sc', captainId: 'warrior' }),
    ).state;
    const detached = dispatch(state, intentOf('detach-captain', { squadId: 'squad-sc' }));
    expect(squad(detached.state).captainId).toBeNull();
    const again = applyIntent(detached.state, intentOf('detach-captain', { squadId: 'squad-sc' }), {
      random: createSeededRandomSource(1),
    });
    expect(again.log[0]?.kind).toBe('refusal');
  });
});

describe('null-stamina safety across the lifecycle', () => {
  it('end-turn and end-encounter dispatch cleanly with seeded squads', () => {
    let state = spinecleaverEncounter();
    intentCounter += 1;
    const turn = dispatch(state, {
      intentId: `squad-i${intentCounter}`,
      kind: 'end-turn',
      actor: { kind: 'director' },
      payload: { participantId: 'sc1' },
    });
    state = turn.state;
    intentCounter += 1;
    const ended = dispatch(state, {
      intentId: `squad-i${intentCounter}`,
      kind: 'end-encounter',
      actor: { kind: 'director' },
      payload: {},
    });
    expect(ended.state.squads).toEqual(state.squads);
  });

  it('applySquadDamage rejects nothing it should accept: zero-damage instance is a no-op walk', () => {
    const state = spinecleaverEncounter();
    const squadState = squad(state);
    const outcome = applySquadDamage(
      squadState,
      SPINECLEAVER_STATS,
      [{ targetId: 'sc1', damage: 0 }],
      { area: false, type: null, reason: '(test vector)' },
      { intentId: 'squad-zero', actor: { kind: 'director' } },
    );
    expect(outcome.squad.pool.current).toBe(40);
    expect(outcome.squad.memberIds).toEqual([...SC_IDS]);
  });
});
