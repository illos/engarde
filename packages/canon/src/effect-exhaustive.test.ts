import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  type EffectProgramData,
  type ParticipantStats,
  applyIntent,
  checkInvariants,
  createDriver,
  createSeededRandomSource,
  initialEncounterState,
} from '@engarde/engine';
import { describe, expect, it } from 'vitest';
import {
  AUTOMATIC_EFFECT_CANON_EXPECTATIONS,
  EFFECT_CANON_PIN,
  FLAT_RESOURCE_CANON_EXPECTATIONS,
  NEXT_ROLL_GRANT_CANON_EXPECTATIONS,
  TEST_EFFECT_CANON_EXPECTATIONS,
} from './effect-canon-expectations.js';
import { loadCoreEffectFixtures } from './effect-corpus-fixtures.js';
import { CampaignAuditManifestSchema } from './schemas.js';

const manifestPath = resolve(
  process.env.ENGARDE_CANON_MANIFEST ??
    '../../.artifacts/canon/campaign/accepted/final-campaign-manifest.json',
);

function effectKey(artifactId: string, effectOrdinal: number): string {
  return `${artifactId}#${effectOrdinal}`;
}

const expectationByKey = new Map(
  AUTOMATIC_EFFECT_CANON_EXPECTATIONS.map((expectation) => [
    effectKey(expectation.artifactId, expectation.effectOrdinal),
    expectation,
  ]),
);

const testExpectationByKey = new Map(
  TEST_EFFECT_CANON_EXPECTATIONS.map((expectation) => [
    effectKey(expectation.artifactId, expectation.effectOrdinal),
    expectation,
  ]),
);

const grantExpectationByKey = new Map(
  NEXT_ROLL_GRANT_CANON_EXPECTATIONS.map((expectation) => [
    effectKey(expectation.artifactId, expectation.effectOrdinal),
    expectation,
  ]),
);

const flatExpectationByKey = new Map(
  FLAT_RESOURCE_CANON_EXPECTATIONS.map((expectation) => [
    effectKey(expectation.artifactId, expectation.effectOrdinal),
    expectation,
  ]),
);

const STATS: ParticipantStats = {
  staminaMax: 100_000,
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

function state() {
  return initialEncounterState([
    { id: 'actor', sourceRecordId: 'mcdm.heroes.v1/class/fury', kind: 'hero', stats: STATS },
    {
      id: 'actor-2',
      sourceRecordId: 'mcdm.heroes.v1/class/censor',
      kind: 'hero',
      stats: STATS,
    },
    {
      id: 'target',
      sourceRecordId: 'mcdm.monsters.v1/monster.goblin.statblock/goblin-warrior',
      kind: 'director-creature',
      stats: STATS,
    },
  ]);
}

function rawPayload(spanText: string): string {
  const line = spanText.trim().replace(/^> /, '');
  const prefix = '**Effect:** ';
  if (!line.startsWith(prefix)) throw new Error(`not a whole Effect line: ${line}`);
  return line.slice(prefix.length);
}

function dispatch(program: EffectProgramData, intentId: string) {
  const before = state();
  const intent = {
    intentId,
    kind: 'use-effect' as const,
    actor: { kind: 'participant' as const, participantId: 'actor' },
    payload: {
      actorParticipantId: 'actor',
      effect: program,
      targets: ['target'],
      // A Recovery offer needs every bound participant's answer [R-0018].
      ...(program.resolution.kind === 'spend-recovery' ? { recoverySpends: { target: true } } : {}),
    },
  };
  const result = applyIntent(before, intent, { random: createSeededRandomSource(1) });
  return { before, intent, result };
}

describe.skipIf(!existsSync(manifestPath))('exhaustive core Effect conformance', () => {
  it('accounts for every accepted Effect line exactly once with stable truthfulness counts', async () => {
    const manifest = CampaignAuditManifestSchema.parse(
      JSON.parse(await readFile(manifestPath, 'utf8')),
    );
    expect(manifest.source).toMatchObject({
      pin: EFFECT_CANON_PIN,
      checkout: EFFECT_CANON_PIN,
      clean: true,
    });
    expect(manifest.counts.artifactRecords).toBe(3529);
    expect(expectationByKey.size).toBe(AUTOMATIC_EFFECT_CANON_EXPECTATIONS.length);
    expect(expectationByKey.size).toBe(12);
    expect(testExpectationByKey.size).toBe(TEST_EFFECT_CANON_EXPECTATIONS.length);
    expect(testExpectationByKey.size).toBe(29);
    expect(grantExpectationByKey.size).toBe(NEXT_ROLL_GRANT_CANON_EXPECTATIONS.length);
    expect(grantExpectationByKey.size).toBe(14);
    expect(flatExpectationByKey.size).toBe(FLAT_RESOURCE_CANON_EXPECTATIONS.length);
    expect(flatExpectationByKey.size).toBe(12);

    const fixtures = await loadCoreEffectFixtures(manifestPath);
    expect(fixtures).toHaveLength(1688);
    expect(new Set(fixtures.map((fixture) => fixture.artifactId)).size).toBe(1044);
    expect(new Set(fixtures.map((fixture) => fixture.fixtureId)).size).toBe(fixtures.length);

    const counts = {
      damage: 0,
      condition: 0,
      test: 0,
      'next-roll-grant': 0,
      'spend-recovery': 0,
      'regain-stamina': 0,
      'temporary-stamina': 0,
      'terrain-fact': 0,
      table: 0,
    };
    const seenAutomatic = new Set<string>();
    const seenTest = new Set<string>();
    const seenGrant = new Set<string>();
    const seenFlat = new Set<string>();
    for (const fixture of fixtures) {
      expect(fixture.program.sourceText, fixture.fixtureId).toBe(
        rawPayload(fixture.clause.span.text),
      );
      expect(fixture.clause.data.sourceText, fixture.fixtureId).toBe(fixture.program.sourceText);
      expect(fixture.program.effectArtifactId).toBe(fixture.artifactId);
      expect(fixture.program.effectOrdinal).toBe(fixture.clauseOrdinal);
      expect(fixture.program.sourceSpan).toEqual({
        byteStart: fixture.clause.span.byteStart,
        byteEnd: fixture.clause.span.byteEnd,
      });
      const key = effectKey(fixture.artifactId, fixture.program.effectOrdinal);
      const expectation = expectationByKey.get(key);
      if (expectation) {
        seenAutomatic.add(key);
        expect(fixture.artifact.source.path, fixture.fixtureId).toBe(expectation.sourcePath);
        expect(fixture.program.sourceSpan, fixture.fixtureId).toEqual(expectation.sourceSpan);
        expect(fixture.program.sourceText, fixture.fixtureId).toBe(expectation.sourceText);
        expect(fixture.program.targetsText, fixture.fixtureId).toBe(expectation.targetsText);
        expect(fixture.program.resolution, fixture.fixtureId).toEqual(expectation.resolution);
        counts[expectation.resolution.kind] += 1;
      } else {
        const testExpectation = testExpectationByKey.get(key);
        const grantExpectation = grantExpectationByKey.get(key);
        if (testExpectation) {
          seenTest.add(key);
          expect(fixture.artifact.source.path, fixture.fixtureId).toBe(testExpectation.sourcePath);
          expect(fixture.program.sourceSpan, fixture.fixtureId).toEqual(testExpectation.sourceSpan);
          expect(fixture.program.sourceText, fixture.fixtureId).toBe(testExpectation.sourceText);
          expect(fixture.program.targetsText, fixture.fixtureId).toBe(testExpectation.targetsText);
          expect(fixture.program.resolution, fixture.fixtureId).toEqual(testExpectation.resolution);
          counts.test += 1;
        } else if (grantExpectation) {
          seenGrant.add(key);
          expect(fixture.artifact.source.path, fixture.fixtureId).toBe(grantExpectation.sourcePath);
          expect(fixture.program.sourceSpan, fixture.fixtureId).toEqual(
            grantExpectation.sourceSpan,
          );
          expect(fixture.program.sourceText, fixture.fixtureId).toBe(grantExpectation.sourceText);
          expect(fixture.program.targetsText, fixture.fixtureId).toBe(grantExpectation.targetsText);
          expect(fixture.program.resolution, fixture.fixtureId).toEqual(
            grantExpectation.resolution,
          );
          counts['next-roll-grant'] += 1;
        } else {
          const flatExpectation = flatExpectationByKey.get(key);
          if (flatExpectation) {
            seenFlat.add(key);
            expect(fixture.artifact.source.path, fixture.fixtureId).toBe(
              flatExpectation.sourcePath,
            );
            expect(fixture.program.sourceSpan, fixture.fixtureId).toEqual(
              flatExpectation.sourceSpan,
            );
            expect(fixture.program.sourceText, fixture.fixtureId).toBe(flatExpectation.sourceText);
            expect(fixture.program.targetsText, fixture.fixtureId).toBe(
              flatExpectation.targetsText,
            );
            expect(fixture.program.resolution, fixture.fixtureId).toEqual(
              flatExpectation.resolution,
            );
            counts[flatExpectation.resolution.kind] += 1;
          } else {
            expect(fixture.program.resolution, fixture.fixtureId).toEqual({ kind: 'table' });
            counts.table += 1;
          }
        }
      }
    }
    expect(seenAutomatic).toEqual(new Set(expectationByKey.keys()));
    expect(seenTest).toEqual(new Set(testExpectationByKey.keys()));
    expect(seenGrant).toEqual(new Set(grantExpectationByKey.keys()));
    expect(seenFlat).toEqual(new Set(flatExpectationByKey.keys()));
    // 87 attached bullets across the 29 tests: 21 automatic / 66 verbatim.
    const bullets = TEST_EFFECT_CANON_EXPECTATIONS.flatMap((expectation) => [
      expectation.resolution.tiers.tier1,
      expectation.resolution.tiers.tier2,
      expectation.resolution.tiers.tier3,
    ]);
    expect(bullets).toHaveLength(87);
    expect(bullets.filter((bullet) => bullet.kind === 'automatic')).toHaveLength(21);
    // Re-frozen 2026-08-25 after the 12 flat-resource lines compiled out of
    // the table set (R-0017..R-0022; spend-recovery-exact 6 → 0,
    // regains-stamina-flat 2 → 0, temporary-stamina-flat 1 → 0,
    // area-difficult-terrain 3 → 0). Previous freeze: the 14 next-roll grant
    // lines (R-0012..R-0016).
    expect(counts).toEqual({
      damage: 5,
      condition: 7,
      test: 29,
      'next-roll-grant': 14,
      'spend-recovery': 6,
      'regain-stamina': 2,
      'temporary-stamina': 1,
      'terrain-fact': 3,
      table: 1621,
    });
  });

  it('executes every program through the engine with exact deltas or a verbatim directive', async () => {
    const fixtures = await loadCoreEffectFixtures(manifestPath);
    for (const fixture of fixtures) {
      const { before, intent, result } = dispatch(
        fixture.program,
        `effect-exhaustive-${fixture.clauseIndex}`,
      );
      expect(checkInvariants(before, intent, result), fixture.fixtureId).toEqual([]);
      expect(
        result.log.some((entry) => entry.kind === 'refusal'),
        fixture.fixtureId,
      ).toBe(false);
      const receipt = result.log.find((entry) => entry.data.effectResolution !== undefined);
      expect(receipt, fixture.fixtureId).toBeDefined();
      expect(receipt?.canonRefs).toContain(fixture.artifactId);

      const key = effectKey(fixture.artifactId, fixture.program.effectOrdinal);
      const expectation = expectationByKey.get(key);
      const testExpectation = testExpectationByKey.get(key);
      if (!expectation && testExpectation) {
        // Per-tier execution against the GOLDEN resolution [R-0006..R-0011]:
        // deterministic dice force each band (all synthetic characteristics
        // are 0; sums stay below natural 19 so only the band is under test).
        const goldenTiers = testExpectation.resolution.tiers;
        const diceForTier: Record<'tier1' | 'tier2' | 'tier3', [number, number]> = {
          tier1: [1, 2],
          tier2: [6, 6],
          tier3: [9, 9],
        };
        for (const slot of ['tier1', 'tier2', 'tier3'] as const) {
          const tierBefore = state();
          const tierIntent = {
            intentId: `effect-test-${fixture.clauseIndex}-${slot}`,
            kind: 'use-effect' as const,
            actor: { kind: 'participant' as const, participantId: 'actor' },
            payload: {
              actorParticipantId: 'actor',
              effect: fixture.program,
              targets: ['target'],
              testRolls: { target: { dice: diceForTier[slot] } },
            },
          };
          const tierResult = applyIntent(tierBefore, tierIntent, {
            random: createSeededRandomSource(1),
          });
          expect(checkInvariants(tierBefore, tierIntent, tierResult), fixture.fixtureId).toEqual(
            [],
          );
          const golden = goldenTiers[slot];
          if (golden.kind === 'verbatim') {
            expect(tierResult.state, `${fixture.fixtureId} ${slot}`).toEqual(tierBefore);
            const directive = tierResult.log.find(
              (entry) => entry.data.testTierDirective !== undefined,
            );
            expect(directive?.message, `${fixture.fixtureId} ${slot}`).toBe(golden.sourceText);
          } else {
            const data = golden.data;
            const target = tierResult.state.participants.target;
            if (data.damage) {
              expect(target?.stamina?.current, `${fixture.fixtureId} ${slot}`).toBe(
                STATS.staminaMax - data.damage.amount,
              );
            } else {
              expect(target?.stamina?.current, `${fixture.fixtureId} ${slot}`).toBe(
                STATS.staminaMax,
              );
            }
            // Synthetic target characteristics are all 0, so a numeric
            // potency gate applies exactly when 0 < value.
            const gateApplies =
              data.potency === null ||
              (data.potency.threshold.kind === 'numeric' && 0 < data.potency.threshold.value);
            if (data.conditionIds.length > 0 && gateApplies) {
              expect(
                target?.conditions.map((instance) => instance.conditionId),
                `${fixture.fixtureId} ${slot}`,
              ).toEqual(data.conditionIds);
            } else {
              expect(target?.conditions, `${fixture.fixtureId} ${slot}`).toEqual([]);
            }
          }
        }
        // Object targets never roll: automatic tier 1 [R-0007].
        if (testExpectation.targetsText?.toLowerCase().includes('object')) {
          const objectBefore = state();
          const objectIntent = {
            intentId: `effect-test-${fixture.clauseIndex}-object`,
            kind: 'use-effect' as const,
            actor: { kind: 'participant' as const, participantId: 'actor' },
            payload: {
              actorParticipantId: 'actor',
              effect: fixture.program,
              targets: [],
              objectTargets: ['object-1'],
            },
          };
          const objectResult = applyIntent(objectBefore, objectIntent, {
            random: createSeededRandomSource(1),
          });
          expect(
            checkInvariants(objectBefore, objectIntent, objectResult),
            fixture.fixtureId,
          ).toEqual([]);
          expect(objectResult.state, fixture.fixtureId).toEqual(objectBefore);
          const directive = objectResult.log.find(
            (entry) => entry.data.testTierDirective !== undefined,
          );
          expect(directive?.message, fixture.fixtureId).toBe(goldenTiers.tier1.sourceText);
        }
        continue;
      }
      const grantExpectation = grantExpectationByKey.get(key);
      if (!expectation && grantExpectation) {
        // A grant program stores exactly one attributed pending modifier on
        // the target [R-0012..R-0016] — nothing else changes.
        const golden = grantExpectation.resolution;
        expect(fixture.program.resolution, fixture.fixtureId).toEqual(golden);
        const grants = result.state.participants.target?.grants ?? [];
        expect(grants, fixture.fixtureId).toHaveLength(1);
        expect(grants[0], fixture.fixtureId).toMatchObject({
          polarity: golden.polarity,
          scope: golden.scope,
          direction: golden.direction,
          window: golden.window,
          source: {
            participantId: 'actor',
            effectArtifactId: fixture.artifactId,
          },
        });
        expect(result.state.participants.target?.conditions, fixture.fixtureId).toEqual([]);
        expect(result.state.participants.target?.stamina?.current, fixture.fixtureId).toBe(
          STATS.staminaMax,
        );
        continue;
      }
      const flatExpectation = flatExpectationByKey.get(key);
      if (!expectation && flatExpectation) {
        const golden = flatExpectation.resolution;
        expect(fixture.program.resolution, fixture.fixtureId).toEqual(golden);
        const target = result.state.participants.target;
        if (golden.kind === 'spend-recovery') {
          // The synthetic target is a Director-controlled creature at full
          // Stamina: the accepted offer converts to a one-third-maximum
          // regain [R-0019b], clamped to 0 at the maximum [R-0017].
          expect(target?.stamina, fixture.fixtureId).toEqual({
            current: STATS.staminaMax,
            temporary: 0,
            recoveries: null,
          });
          const regain = result.log.find((entry) => entry.data.staminaDeltas !== undefined);
          expect(regain?.data.clampedAtMax, fixture.fixtureId).toBe(true);
          expect(regain?.data.requestedAmount, fixture.fixtureId).toBe(
            Math.floor(STATS.staminaMax / 3),
          );
        } else if (golden.kind === 'regain-stamina') {
          expect(target?.stamina?.current, fixture.fixtureId).toBe(STATS.staminaMax);
          const regain = result.log.find((entry) => entry.data.staminaDeltas !== undefined);
          expect(regain?.data.requestedAmount, fixture.fixtureId).toBe(golden.amount);
        } else if (golden.kind === 'temporary-stamina') {
          expect(target?.stamina, fixture.fixtureId).toEqual({
            current: STATS.staminaMax,
            temporary: golden.amount,
            recoveries: null,
          });
        } else {
          expect(result.state.terrainFacts, fixture.fixtureId).toHaveLength(1);
          expect(result.state.terrainFacts[0], fixture.fixtureId).toMatchObject({
            terrain: 'difficult',
            effectArtifactId: fixture.artifactId,
            effectOrdinal: fixture.program.effectOrdinal,
            areaText: fixture.program.distanceText,
            createdBy: 'actor',
          });
          expect(result.state.participants, fixture.fixtureId).toEqual(before.participants);
        }
        continue;
      }
      if (!expectation) {
        expect(fixture.program.resolution, fixture.fixtureId).toEqual({ kind: 'table' });
        expect(result.state, fixture.fixtureId).toEqual(before);
        const directive = result.log.find((entry) => entry.data.manualEffect !== undefined);
        expect(directive?.message, fixture.fixtureId).toBe(fixture.program.sourceText);
        continue;
      }
      const resolution = expectation.resolution;
      expect(fixture.program.resolution, fixture.fixtureId).toEqual(resolution);
      if (resolution.kind === 'damage') {
        expect(result.state.participants.target?.stamina?.current, fixture.fixtureId).toBe(
          STATS.staminaMax - resolution.amount,
        );
        const damage = result.log.find((entry) => entry.data.pipeline !== undefined);
        expect(damage?.data.pipeline, fixture.fixtureId).toEqual(
          expect.objectContaining({ inputAmount: resolution.amount, type: resolution.damageType }),
        );
        continue;
      }
      expect(result.state.participants.target?.conditions, fixture.fixtureId).toEqual([
        expect.objectContaining({
          conditionId: resolution.conditionId,
          ending: resolution.ending,
          source: {
            participantId: 'actor',
            effectArtifactId: fixture.artifactId,
          },
        }),
      ]);
    }
  });

  it('produces a replayable, invariant-clean fight transcript from a real Effect artifact', async () => {
    const fixtures = await loadCoreEffectFixtures(manifestPath);
    const fixture = fixtures.find(
      (item) => item.artifactId === 'mcdm.heroes.v1/project/imbue-treasure',
    );
    expect(fixture).toBeDefined();
    if (!fixture) return;
    const driver = createDriver(
      [
        { id: 'actor', sourceRecordId: 'mcdm.heroes.v1/class/fury', kind: 'hero', stats: STATS },
        {
          id: 'target',
          sourceRecordId: 'mcdm.monsters.v1/monster.goblin.statblock/goblin-warrior',
          kind: 'director-creature',
          stats: STATS,
        },
      ],
      { random: createSeededRandomSource(0xeffec7) },
    );
    const outcome = driver.dispatch({
      intentId: 'effect-replay-1',
      kind: 'use-effect',
      actor: { kind: 'participant', participantId: 'actor' },
      payload: { actorParticipantId: 'actor', effect: fixture.program, targets: ['target'] },
    });
    expect(outcome.violations).toEqual([]);
    expect(driver.transcript().violationCount).toBe(0);
    expect(driver.transcript().finalState.participants.target?.stamina?.current).toBe(99_995);
    expect(driver.transcript().steps[0]?.log.some((entry) => entry.data.effectResolution)).toBe(
      true,
    );
  });

  it('obeys the taunted new-source replacement rule and expires the surviving instance', async () => {
    const fixtures = await loadCoreEffectFixtures(manifestPath);
    const fixture = fixtures.find(
      (item) =>
        item.artifactId === 'mcdm.heroes.v1/feature.ability.shining-armor/protective-attack',
    );
    expect(fixture).toBeDefined();
    if (!fixture) return;
    expect(fixture.program.resolution).toEqual({
      kind: 'condition',
      conditionId: 'mcdm.heroes.v1/condition/taunted',
      ending: { kind: 'end-of-targets-next-turn' },
      replacesOnNewSource: true,
    });

    const before = state();
    const firstIntent = {
      intentId: 'taunt-source-1',
      kind: 'use-effect' as const,
      actor: { kind: 'participant' as const, participantId: 'actor' },
      payload: {
        actorParticipantId: 'actor',
        effect: fixture.program,
        targets: ['target'],
      },
    };
    const first = applyIntent(before, firstIntent, { random: createSeededRandomSource(1) });
    expect(checkInvariants(before, firstIntent, first)).toEqual([]);

    const secondIntent = {
      intentId: 'taunt-source-2',
      kind: 'use-effect' as const,
      actor: { kind: 'participant' as const, participantId: 'actor-2' },
      payload: {
        actorParticipantId: 'actor-2',
        effect: fixture.program,
        targets: ['target'],
      },
    };
    const second = applyIntent(first.state, secondIntent, {
      random: createSeededRandomSource(1),
    });
    expect(checkInvariants(first.state, secondIntent, second)).toEqual([]);
    expect(second.state.participants.target?.conditions).toEqual([
      expect.objectContaining({
        instanceId: 'mcdm.heroes.v1/condition/taunted#taunt-source-2-target',
        source: {
          participantId: 'actor-2',
          effectArtifactId: fixture.artifactId,
        },
      }),
    ]);
    expect(
      second.log.some((entry) =>
        Array.isArray(entry.data.removedInstanceIds)
          ? entry.data.removedInstanceIds.includes(
              'mcdm.heroes.v1/condition/taunted#taunt-source-1-target',
            )
          : false,
      ),
    ).toBe(true);

    const endTurnIntent = {
      intentId: 'taunt-expiry',
      kind: 'end-turn' as const,
      actor: { kind: 'participant' as const, participantId: 'target' },
      payload: { participantId: 'target' },
    };
    const expired = applyIntent(second.state, endTurnIntent, {
      random: createSeededRandomSource(1),
    });
    expect(checkInvariants(second.state, endTurnIntent, expired)).toEqual([]);
    expect(expired.state.participants.target?.conditions).toEqual([]);
  });

  it('surfaces over-targeting for a singular triggering-creature Effect from canon', async () => {
    const fixtures = await loadCoreEffectFixtures(manifestPath);
    const fixture = fixtures.find(
      (item) =>
        item.artifactId === 'mcdm.monsters.v1/monster.elemental.statblock/essence-of-storms' &&
        item.program.effectOrdinal === 3,
    );
    expect(fixture).toBeDefined();
    if (!fixture) return;
    expect(fixture.program.targetsText).toBe('The triggering creature');

    const before = state();
    const effectIntent = {
      intentId: 'essence-over-target',
      kind: 'use-effect' as const,
      actor: { kind: 'participant' as const, participantId: 'actor' },
      payload: {
        actorParticipantId: 'actor',
        effect: fixture.program,
        targets: ['target', 'actor-2'],
      },
    };
    const result = applyIntent(before, effectIntent, { random: createSeededRandomSource(1) });

    expect(checkInvariants(before, effectIntent, result)).toEqual([]);
    expect(result.log.find((entry) => entry.kind === 'warning')).toMatchObject({
      data: { declaredTargets: 1, namedTargets: 2 },
    });
    expect(result.state.participants.target?.stamina?.current).toBe(STATS.staminaMax - 5);
    expect(result.state.participants['actor-2']?.stamina?.current).toBe(STATS.staminaMax - 5);
  });
});
