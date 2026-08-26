import {
  type Intent,
  ParticipantStatsSchema,
  createDriver,
  createSeededRandomSource,
} from '@engarde/engine';
import { describe, expect, it } from 'vitest';
import { compileAbility } from './effect-conformance.js';
import { parseEffectText } from './effect-grammar.js';
import { GOBLIN_SPINECLEAVER } from './fixtures/goblin-spinecleaver.verbatim.js';
import { INCINERATE } from './fixtures/incinerate.verbatim.js';
import { SKITTERLING } from './fixtures/skitterling.verbatim.js';

/**
 * Minion squad pool golden channel (R-0023..R-0026,
 * docs/minion-pool-design.md §3): the two PRINTED worked examples reproduced
 * exactly through the real compiled artifacts and the driver —
 *
 * 1. "a goblin spinecleaver has 5 Stamina, so a squad of eight
 *    spinecleavers has a Stamina pool of 40" and the §Dropping One Minion /
 *    §Prepping Minion Stamina Pools threshold walk: one minion dies at 35,
 *    30, 25, 20, 15, 10, 5, and 0 [Monsters p.7–8].
 * 2. "a tier 3 outcome for the talent's Incinerate ability deals 6 fire
 *    damage to each target in its area. If three goblin spinecleavers with
 *    Stamina 5 are caught in the area, the minion pool loses 15 Stamina
 *    instead of 18" [§Minions and Area Effects, Monsters p.8].
 *
 * Both statblocks/abilities come from drift-guarded verbatim fixtures
 * (fixtures.corpus.test.ts re-cuts them from the pin); the ability data is
 * COMPILED from the fixture text by the certified grammar, never
 * hand-transcribed here.
 */

const SPINECLEAVER_STATS = ParticipantStatsSchema.parse(JSON.parse(GOBLIN_SPINECLEAVER.statsJson));
const SC_IDS = ['sc1', 'sc2', 'sc3', 'sc4', 'sc5', 'sc6', 'sc7', 'sc8'];

function spinecleaverDriver() {
  return createDriver(
    [
      ...SC_IDS.map((id) => ({
        id,
        kind: 'director-creature' as const,
        sourceRecordId: GOBLIN_SPINECLEAVER.artifactId,
        stats: SPINECLEAVER_STATS,
      })),
      {
        id: 'talent',
        kind: 'hero' as const,
        // Host-asserted hero stats (test assertion, not rule content).
        stats: ParticipantStatsSchema.parse({
          staminaMax: 18,
          characteristics: { might: 0, agility: 0, reason: 2, intuition: 0, presence: 0 },
          immunities: [],
          weaknesses: [],
          potencies: null,
          organization: null,
          recoveriesMax: null,
        }),
      },
    ],
    { random: createSeededRandomSource(23) },
    [{ squadId: 'squad-sc', name: 'goblin spinecleavers', memberIds: SC_IDS }],
  );
}

describe('minion pool golden channel [R-0023..R-0026]', () => {
  it('seeds the printed pool: eight spinecleavers (Stamina 5) → 40', () => {
    const driver = spinecleaverDriver();
    const squad = driver.state().squads[0];
    expect(SPINECLEAVER_STATS.staminaMax).toBe(5);
    expect(squad?.perMinionStamina).toBe(5);
    expect(squad?.pool).toEqual({ current: 40, max: 40 });
  });

  it('walks the printed thresholds: one death at 35, 30, 25, 20, 15, 10, 5, and 0', () => {
    const driver = spinecleaverDriver();
    const expectedPools = [35, 30, 25, 20, 15, 10, 5, 0];
    for (const [index, expectedPool] of expectedPools.entries()) {
      const intent: Intent = {
        intentId: `walk-${index + 1}`,
        kind: 'apply-damage',
        actor: { kind: 'director' },
        payload: { target: SC_IDS[index] ?? '', amount: 5, reason: 'damage (test vector)' },
      };
      const result = driver.dispatch(intent);
      expect(result.violations).toEqual([]);
      const squad = driver.state().squads[0];
      expect(squad?.pool.current).toBe(expectedPool);
      expect(squad?.deadMemberIds).toHaveLength(index + 1);
    }
    expect(driver.state().squads[0]?.memberIds).toEqual([]);
    expect(driver.transcript().violationCount).toBe(0);
  });

  it('compiles the real Incinerate artifact and reproduces 15-not-18 with three kills max', () => {
    const parse = parseEffectText(INCINERATE.text);
    const compiled = compileAbility(parse, INCINERATE.artifactId);
    if (!('ability' in compiled)) throw new Error('Incinerate did not compile');
    const ability = compiled.ability;
    expect(ability.keywords).toContain('Area');
    expect(ability.tiers.tier3.damage).toEqual({
      amount: 6,
      characteristicOptions: [],
      typeOptions: ['fire'],
    });

    const driver = spinecleaverDriver();
    const result = driver.dispatch({
      intentId: 'incinerate-1',
      kind: 'use-ability',
      actor: { kind: 'participant', participantId: 'talent' },
      payload: {
        actorParticipantId: 'talent',
        ability,
        targets: ['sc1', 'sc2', 'sc3'],
        automaticOutcomes: [3],
      },
    });
    expect(result.violations).toEqual([]);
    const squad = driver.state().squads[0];
    // "the minion pool loses 15 Stamina instead of 18, leaving the other
    // minions in the squad unscathed."
    expect(squad?.pool.current).toBe(25);
    expect(squad?.deadMemberIds.sort()).toEqual(['sc1', 'sc2', 'sc3']);
    expect(squad?.pendingKills).toBe(0);
    expect(squad?.memberIds).toEqual(['sc4', 'sc5', 'sc6', 'sc7', 'sc8']);
  });

  it('squad-seeded skitterling E2E: pool damage through the drift-guarded fixture', () => {
    const skitterlingStats = ParticipantStatsSchema.parse(JSON.parse(SKITTERLING.statsJson));
    expect(skitterlingStats.staminaMax).toBe(3);
    const driver = createDriver(
      [
        ...['sk1', 'sk2', 'sk3', 'sk4'].map((id) => ({
          id,
          kind: 'director-creature' as const,
          sourceRecordId: SKITTERLING.artifactId,
          stats: skitterlingStats,
        })),
      ],
      { random: createSeededRandomSource(29) },
      [{ squadId: 'squad-sk', name: 'skitterlings', memberIds: ['sk1', 'sk2', 'sk3', 'sk4'] }],
    );
    expect(driver.state().squads[0]?.pool).toEqual({ current: 12, max: 12 });
    const result = driver.dispatch({
      intentId: 'sk-hit-1',
      kind: 'apply-damage',
      actor: { kind: 'director' },
      payload: { target: 'sk1', amount: 7, reason: 'damage (test vector)' },
    });
    expect(result.violations).toEqual([]);
    // Full decrement with carryover [R-0024]: 12 → 5, floor(7/3) = 2 kills —
    // the hit skitterling first, one pending identity.
    expect(driver.state().squads[0]?.pool.current).toBe(5);
    expect(driver.state().squads[0]?.deadMemberIds).toEqual(['sk1']);
    expect(driver.state().squads[0]?.pendingKills).toBe(1);
  });
});
