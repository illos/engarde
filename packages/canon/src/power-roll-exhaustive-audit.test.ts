import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  type AbilityEffectData,
  type EncounterState,
  type Intent,
  type ParticipantStats,
  applyIntent,
  checkInvariants,
  createSeededRandomSource,
  upgradeEncounterState,
} from '@engarde/engine';
import { describe, expect, it } from 'vitest';
import { parseEffectText } from './effect-grammar.js';
import {
  type CorePowerRollFixture,
  loadCorePowerRollFixtures,
} from './power-roll-corpus-fixtures.js';

/**
 * Independent corpus audit for the power-roll cluster.
 *
 * The fixture loader is intentionally not the only source of truth here:
 * this test re-walks each artifact's clauses and retains duplicate bands.
 * compileAbilities currently keeps the first occurrence of a band, so a test
 * that only counts compiled abilities could falsely certify malformed prose.
 */

const manifestPath =
  process.env.ENGARDE_CORE_MANIFEST ??
  resolve('../../.artifacts/canon/campaign/accepted/final-campaign-manifest.json');

const BANDS = ['≤11', '12-16', '17+'] as const;
type Band = (typeof BANDS)[number];

interface AuditCluster {
  bands: Band[];
}

function clustersIn(text: string): AuditCluster[] {
  // Independent re-implementation of the R-0011 ownership rule: a power-roll
  // heading owns only contiguously-following tier lines — whitespace passes,
  // while residue prose or any other clause closes the open cluster. Kept
  // separate from groupPowerRollClusters on purpose (two readers).
  const parse = parseEffectText(text);
  const events = [
    ...parse.clauses.map((clause) => ({ byteStart: clause.span.byteStart, clause })),
    ...parse.residue.map((item) => ({ byteStart: item.span.byteStart, clause: null })),
  ].sort((left, right) => left.byteStart - right.byteStart);
  const clusters: AuditCluster[] = [];
  let current: AuditCluster | undefined;
  for (const event of events) {
    const clause = event.clause;
    if (clause === null) {
      current = undefined; // residue separates
      continue;
    }
    if (clause.kind === 'whitespace') continue;
    if (clause.kind === 'power-roll') {
      current = { bands: [] };
      clusters.push(current);
      continue;
    }
    if (clause.kind === 'tier-outcome') {
      if (current) current.bands.push(clause.data.band);
      continue;
    }
    current = undefined; // header, Effect line, flavor — all close ownership
  }
  return clusters;
}

function isExactlyOneOfEachBand(cluster: AuditCluster): boolean {
  return (
    cluster.bands.length === 3 &&
    new Set(cluster.bands).size === 3 &&
    BANDS.every((band) => cluster.bands.includes(band))
  );
}

function sourceVersion(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function characteristicStats(): ParticipantStats {
  return {
    staminaMax: 100,
    characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 },
    immunities: [],
    weaknesses: [],
    // Synthetic stored values make named potency gates deterministic without
    // pretending the corpus has resolved hero character construction.
    potencies: { weak: 1, average: 2, strong: 3 },
    organization: null,
    recoveriesMax: null,
    freeStrike: null,
    withCaptain: null,
    withCaptainBenefit: null,
  };
}

function state(): EncounterState {
  const stats = characteristicStats();
  return upgradeEncounterState({
    schemaVersion: 5,
    terrainFacts: [],
    squads: [],
    participants: {
      actor: {
        id: 'actor',
        conditions: [],
        sourceRecordId: null,
        kind: 'hero',
        stats,
        stamina: { current: 100, temporary: 0, recoveries: null },
        grants: [],
      },
      target: {
        id: 'target',
        conditions: [],
        sourceRecordId: null,
        kind: 'director-creature',
        stats: { ...stats, potencies: null },
        stamina: { current: 100, temporary: 0, recoveries: null },
        grants: [],
      },
    },
  });
}

function rollValue(ability: AbilityEffectData): number {
  if (ability.powerRollBonus.kind === 'fixed') return ability.powerRollBonus.value;
  // All tracked characteristics are zero in the deterministic harness.
  return 0;
}

function diceForTier(ability: AbilityEffectData, tier: 1 | 2 | 3): [number, number] {
  const bonus = rollValue(ability);
  const natural = [...Array(19)]
    .map((_, index) => index + 2)
    .find((sum) => {
      const total = sum + bonus;
      const band = total >= 17 ? 3 : total >= 12 ? 2 : 1;
      // Keep tier 3 vectors below natural 19 so the audit tests only the band,
      // not the unrelated critical-hit directive.
      return band === tier && sum < 19;
    });
  if (natural === undefined) {
    throw new Error(`no deterministic dice vector for ${ability.abilityArtifactId}, tier ${tier}`);
  }
  return [Math.max(1, natural - 10), Math.min(10, natural - 1)];
}

function intentFor(fixture: CorePowerRollFixture, tier: 1 | 2 | 3): Intent {
  const ability = fixture.ability;
  const typeOptions = [
    ability.tiers.tier1.damage?.typeOptions ?? [],
    ability.tiers.tier2.damage?.typeOptions ?? [],
    ability.tiers.tier3.damage?.typeOptions ?? [],
  ].flat();
  const choiceOptions =
    ability.powerRollBonus.kind === 'characteristic' ? ability.powerRollBonus.options : [];
  const selectedTypeOptions = ability.tiers[`tier${tier}`].damage?.typeOptions ?? [];
  const sharedTypeChoice = typeOptions.find((type) => selectedTypeOptions.includes(type));
  return {
    intentId: `power-roll-audit-${fixture.clusterIndex}-${tier}`,
    actor: { kind: 'participant', participantId: 'actor' },
    kind: 'use-ability',
    payload: {
      actorParticipantId: 'actor',
      ability,
      targets: ['target'],
      dice: diceForTier(ability, tier),
      characteristicChoice: choiceOptions.length > 1 ? choiceOptions[0] : undefined,
      damageTypeChoice: sharedTypeChoice,
    },
  };
}

function expectedConditions(fixture: CorePowerRollFixture, tier: 1 | 2 | 3): string[] {
  const data = fixture.ability.tiers[`tier${tier}`];
  if (data.conditionIds.length === 0) return [];
  if (data.potency === null) return data.conditionIds;
  const threshold = data.potency.threshold;
  const value =
    threshold.kind === 'numeric'
      ? threshold.value
      : { weak: 1, average: 2, strong: 3 }[threshold.name];
  return 0 < value ? data.conditionIds : [];
}

function powerRollEntry(result: ReturnType<typeof applyIntent>) {
  return result.log.find((entry) => entry.data.powerRoll !== undefined);
}

describe.skipIf(!existsSync(manifestPath))('exhaustive power-roll corpus audit', () => {
  it('has a stable inventory and rejects duplicate or omitted tier bands', async () => {
    const fixtures = await loadCorePowerRollFixtures(manifestPath);
    const seen = new Set<string>();
    const malformed: Array<{ fixtureId: string; bands: Band[]; duplicateConditions: string[] }> =
      [];
    for (const fixture of fixtures) {
      const key = `${fixture.artifactId}::${fixture.clusterIndex}`;
      expect(seen.has(key), `duplicate fixture key ${key}`).toBe(false);
      seen.add(key);
      expect(fixture.artifactVersion).toBe(sourceVersion(fixture.text));
      const cluster = clustersIn(fixture.text)[fixture.clusterIndex];
      expect(cluster, `missing source cluster for ${fixture.fixtureId}`).toBeDefined();
      const duplicateConditions = Object.values(fixture.ability.tiers).flatMap((tier) =>
        tier.conditionIds.filter((conditionId, index, all) => all.indexOf(conditionId) !== index),
      );
      if (!cluster || !isExactlyOneOfEachBand(cluster) || duplicateConditions.length > 0) {
        malformed.push({
          fixtureId: fixture.fixtureId,
          bands: cluster?.bands ?? [],
          duplicateConditions,
        });
      }
    }

    // Baseline for the pinned final campaign manifest after rejecting
    // duplicate bands and unsupported alternative/(EoT) outcome branches.
    // Re-frozen 2026-08-25 under R-0011 ownership hardening: 11 previously
    // leak-suppressed clusters compile (e.g. devil-adjudicator Infernal
    // Injunction), and 5 leak-assembled clusters correctly fell out — four
    // counterfeits stitched from a later ability's bullets (count-rhodar,
    // vampire-lord, servok-miner, fire-giant-chief) and one silent
    // precondition loss (the-nameless winded gate).
    // Further re-frozen after the strict whole-payload tail check landed in
    // parseTierPayload (same day): 34 clusters whose bullets silently
    // swallowed middle clauses (forced movement, resource grants), potency
    // gates, or endings now correctly fail to residue and stay verbatim.
    expect(fixtures.length).toBe(587);
    expect(new Set(fixtures.map((fixture) => fixture.artifactId)).size).toBe(504);
    expect(malformed).toEqual([]);
  });

  it('executes every independently complete cluster exactly once at tiers 1, 2, and 3', async () => {
    const fixtures = await loadCorePowerRollFixtures(manifestPath);
    const complete = fixtures.filter((fixture) => {
      const cluster = clustersIn(fixture.text)[fixture.clusterIndex];
      const duplicateConditions = Object.values(fixture.ability.tiers).some(
        (tier) => new Set(tier.conditionIds).size !== tier.conditionIds.length,
      );
      return cluster !== undefined && isExactlyOneOfEachBand(cluster) && !duplicateConditions;
    });
    expect(complete.length).toBe(587);

    for (const fixture of complete) {
      expect(sourceVersion(fixture.text)).toBe(fixture.artifactVersion);
      const executed = new Set<number>();
      for (const tier of [1, 2, 3] as const) {
        expect(executed.has(tier), `duplicate tier ${tier} in ${fixture.fixtureId}`).toBe(false);
        executed.add(tier);
        const before = state();
        const intent = intentFor(fixture, tier);
        const result = applyIntent(before, intent, {
          random: createSeededRandomSource(0xa0d17),
        });
        expect(checkInvariants(before, intent, result), fixture.fixtureId).toEqual([]);
        expect(
          result.log.some((entry) => entry.kind === 'refusal'),
          fixture.fixtureId,
        ).toBe(false);

        const roll = powerRollEntry(result);
        expect(roll, fixture.fixtureId).toBeDefined();
        expect(roll?.canonRefs).toContain(fixture.artifactId);
        const data = roll?.data.powerRoll as {
          dice: [number, number];
          resolution: { tier: number };
        };
        expect(data.dice).toEqual(diceForTier(fixture.ability, tier));
        expect(data.resolution.tier).toBe(tier);

        const expected = fixture.ability.tiers[`tier${tier}`];
        const target = result.state.participants.target;
        const damage = expected.damage?.amount ?? 0;
        expect(target?.stamina?.current).toBe(100 - damage);
        expect(target?.conditions.map((condition) => condition.conditionId)).toEqual(
          expectedConditions(fixture, tier),
        );
      }
      expect(executed).toEqual(new Set([1, 2, 3]));
    }
  });
});
