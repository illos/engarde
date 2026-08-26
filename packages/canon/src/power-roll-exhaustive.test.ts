import { resolve } from 'node:path';
import {
  type AbilityEffectData,
  type EncounterState,
  type ParticipantStats,
  applyIntent,
  checkInvariants,
  createSeededRandomSource,
  resolvePowerRoll,
  upgradeEncounterState,
} from '@engarde/engine';
import { describe, expect, it } from 'vitest';
import {
  type EffectClause,
  type GrammarParse,
  type TierOutcomeData,
  parseEffectText,
} from './effect-grammar.js';
import { loadCorePowerRollFixtures } from './power-roll-corpus-fixtures.js';

/**
 * Corpus-gated channel-1 verification for every currently compilable power
 * roll. The source is the pinned SteelCompendium checkout, not a hand-picked
 * fixture: source text is ingested, parsed, compiled, and dispatched through
 * the pure engine at all three tier bands.
 *
 * The expected tier data is assembled independently from compileAbilities'
 * internal shaping step. This keeps a compiler regression from making the
 * executable assertions tautological while still grounding every expectation
 * in verbatim artifact bytes.
 */

const sourceRoot = process.env.ENGARDE_CORPUS_ROOT
  ? resolve(process.env.ENGARDE_CORPUS_ROOT)
  : undefined;
const manifestPath = resolve(
  process.env.ENGARDE_CANON_MANIFEST ??
    '../../.artifacts/canon/campaign/accepted/final-campaign-manifest.json',
);

type Tier = 1 | 2 | 3;
type TierSlot = 'tier1' | 'tier2' | 'tier3';

interface ParsedCluster {
  powerRoll: Extract<EffectClause, { kind: 'power-roll' }>;
  tiers: Partial<Record<TierSlot, TierOutcomeData>>;
}

interface ExpectedTier {
  damage: TierOutcomeData['damage'] extends infer T
    ? T extends null
      ? null
      : {
          amount: number;
          characteristicOptions: string[];
          typeOptions: string[];
        }
    : never;
  potency: {
    characteristic: string;
    threshold:
      | { kind: 'numeric'; value: number }
      | { kind: 'named'; name: 'weak' | 'average' | 'strong' };
  } | null;
  conditionIds: string[];
  ending: 'save-ends' | null;
}

const ACTOR_STATS: ParticipantStats = {
  staminaMax: 100_000,
  characteristics: { might: 1, agility: 1, reason: 1, intuition: 1, presence: 1 },
  immunities: [],
  weaknesses: [],
  potencies: { weak: 1, average: 2, strong: 3 },
  organization: null,
  recoveriesMax: null,
  withCaptain: null,
};

const TARGET_STATS: ParticipantStats = {
  staminaMax: 100_000,
  characteristics: { might: -5, agility: -5, reason: -5, intuition: -5, presence: -5 },
  immunities: [],
  weaknesses: [],
  potencies: null,
  organization: null,
  recoveriesMax: null,
  withCaptain: null,
};

const STARTING_STAMINA = 100_000;

function tierSlot(tier: Tier): TierSlot {
  return `tier${tier}` as TierSlot;
}

function clustersFromParse(parse: GrammarParse): ParsedCluster[] {
  const clusters: ParsedCluster[] = [];
  for (const clause of parse.clauses) {
    if (clause.kind === 'power-roll') {
      clusters.push({ powerRoll: clause, tiers: {} });
      continue;
    }
    if (clause.kind !== 'tier-outcome') continue;
    const cluster = clusters.at(-1);
    if (!cluster) continue;
    const slot =
      clause.data.band === '≤11' ? 'tier1' : clause.data.band === '12-16' ? 'tier2' : 'tier3';
    if (!(slot in cluster.tiers)) cluster.tiers[slot] = clause.data;
  }
  return clusters;
}

function expectedTier(data: TierOutcomeData): ExpectedTier {
  return {
    damage: data.damage,
    potency: data.potency
      ? {
          characteristic: data.potency.characteristic,
          threshold: /^\d+$/.test(data.potency.threshold)
            ? { kind: 'numeric', value: Number(data.potency.threshold) }
            : {
                kind: 'named',
                name: data.potency.threshold.toLowerCase() as 'weak' | 'average' | 'strong',
              },
        }
      : null,
    conditionIds: data.conditionIds,
    ending: data.ending,
  };
}

function characteristicValue(ability: AbilityEffectData): number {
  // Every characteristic is deliberately 1 in the harness. This makes every
  // compiled characteristic choice deterministic while still exercising the
  // binding path; fixed bonuses retain their corpus value.
  return ability.powerRollBonus.kind === 'fixed' ? ability.powerRollBonus.value : 1;
}

function diceForTier(ability: AbilityEffectData, tier: Tier): [number, number] {
  const value = characteristicValue(ability);
  for (let d1 = 1; d1 <= 10; d1 += 1) {
    for (let d2 = 1; d2 <= 10; d2 += 1) {
      const resolution = resolvePowerRoll({
        dice: [d1, d2],
        characteristicValue: value,
        bonuses: [],
        penalties: [],
        edges: 0,
        banes: 0,
        automaticOutcomes: [],
      });
      // Avoid natural 19–20 so tier-3 checks exercise the ordinary 17+ band
      // and tier-1/2 checks cannot be promoted by the natural floor.
      if (resolution.tier === tier && !resolution.naturalTopEnd) return [d1, d2];
    }
  }
  throw new Error(`no non-natural dice pair can produce tier ${tier}`);
}

function freshState(): EncounterState {
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
        stats: ACTOR_STATS,
        stamina: { current: STARTING_STAMINA, temporary: 0, recoveries: null },
        grants: [],
      },
      target: {
        id: 'target',
        conditions: [],
        sourceRecordId: null,
        kind: 'director-creature',
        stats: TARGET_STATS,
        stamina: { current: STARTING_STAMINA, temporary: 0, recoveries: null },
        grants: [],
      },
    },
  });
}

function choicePayload(ability: AbilityEffectData, tier: Tier): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (
    ability.powerRollBonus.kind === 'characteristic' &&
    ability.powerRollBonus.options.length > 1
  ) {
    payload.characteristicChoice = ability.powerRollBonus.options[0];
  }
  const tierData = ability.tiers[tierSlot(tier)];
  if (tierData.damage && tierData.damage.characteristicOptions.length > 1) {
    payload.damageCharacteristicChoice = tierData.damage.characteristicOptions[0];
  }
  // The engine's refusal gate requires a choice when any tier offers multiple
  // damage types, even if the selected tier itself is untyped.
  const damageWithChoices = [ability.tiers.tier1, ability.tiers.tier2, ability.tiers.tier3]
    .map((item) => item.damage)
    .find((damage) => damage !== null && damage.typeOptions.length > 1);
  if (damageWithChoices) payload.damageTypeChoice = damageWithChoices.typeOptions[0];
  return payload;
}

function potencyExpectation(
  tierData: ExpectedTier,
): { applies: boolean; value: number; targetScore: number } | null {
  if (tierData.potency === null) return null;
  const threshold = tierData.potency.threshold;
  const value =
    threshold.kind === 'numeric' ? threshold.value : (ACTOR_STATS.potencies?.[threshold.name] ?? 0);
  const targetScore = -5;
  return { applies: targetScore < value, value, targetScore };
}

describe.skipIf(!sourceRoot)('exhaustive core power-roll conformance', () => {
  it('runs every compiled ability at tiers 1, 2, and 3 against its artifact', async () => {
    const fixtures = await loadCorePowerRollFixtures(manifestPath);
    const compiledCount = fixtures.length;
    let executedCount = 0;

    for (const fixture of fixtures) {
      const parse = parseEffectText(fixture.text);
      const sourceCluster = clustersFromParse(parse)[fixture.clusterIndex];
      const ability = fixture.ability;
      expect(sourceCluster, `${fixture.fixtureId} source cluster`).toBeDefined();
      if (!sourceCluster) continue;

      for (const tier of [1, 2, 3] as const) {
        const rawTier = sourceCluster.tiers[tierSlot(tier)];
        expect(rawTier, `${fixture.fixtureId} tier ${tier} source outcome`).toBeDefined();
        if (!rawTier) continue;
        const expected = expectedTier(rawTier);
        expect(
          ability.tiers[tierSlot(tier)],
          `${fixture.fixtureId} tier ${tier} compiled data`,
        ).toEqual(expected);

        const dice = diceForTier(ability, tier);
        const intentId = `exhaustive-${fixture.clusterIndex}-${tier}`;
        const intent = {
          intentId,
          actor: { kind: 'participant' as const, participantId: 'actor' },
          kind: 'use-ability' as const,
          payload: {
            actorParticipantId: 'actor',
            ability,
            targets: ['target'],
            dice,
            ...choicePayload(ability, tier),
          },
        };
        const before = freshState();
        const result = applyIntent(before, intent, { random: createSeededRandomSource(1) });
        const violations = checkInvariants(before, intent, result);
        expect(violations, `${fixture.fixtureId} tier ${tier} invariant violations`).toEqual([]);
        expect(
          result.log.some((entry) => entry.kind === 'refusal'),
          `${fixture.fixtureId} tier ${tier} refusal log`,
        ).toBe(false);

        const rollEntry = result.log.find((entry) => entry.data.powerRoll !== undefined);
        expect(rollEntry, `${fixture.fixtureId} tier ${tier} roll receipt`).toBeDefined();
        const rollData = rollEntry?.data.powerRoll as { resolution: { tier: Tier } } | undefined;
        expect(rollData?.resolution.tier, `${fixture.fixtureId} forced tier ${tier}`).toBe(tier);

        const expectedDamage = expected.damage
          ? expected.damage.amount + (expected.damage.characteristicOptions.length > 0 ? 1 : 0)
          : 0;
        const targetBefore = before.participants.target;
        const targetAfter = result.state.participants.target;
        expect(targetAfter).toBeDefined();
        if (!targetAfter || !targetBefore) continue;
        expect(targetAfter.stamina?.current, `${fixture.fixtureId} tier ${tier} stamina`).toBe(
          STARTING_STAMINA - expectedDamage,
        );
        expect(
          targetAfter.stamina?.temporary,
          `${fixture.fixtureId} tier ${tier} temporary stamina`,
        ).toBe(0);

        const damageLog = result.log.find((entry) => entry.data.staminaDeltas !== undefined);
        if (expected.damage) {
          expect(damageLog, `${fixture.fixtureId} tier ${tier} damage receipt`).toBeDefined();
          const pipeline = damageLog?.data.pipeline as
            | { inputAmount: number; afterImmunity: number; type: string | null }
            | undefined;
          expect(pipeline?.inputAmount, `${fixture.fixtureId} tier ${tier} damage amount`).toBe(
            expectedDamage,
          );
          expect(pipeline?.afterImmunity, `${fixture.fixtureId} tier ${tier} applied damage`).toBe(
            expectedDamage,
          );
          const expectedType = expected.damage.typeOptions[0] ?? null;
          expect(pipeline?.type, `${fixture.fixtureId} tier ${tier} damage type`).toBe(
            expectedType,
          );
        } else {
          expect(damageLog, `${fixture.fixtureId} tier ${tier} no-damage receipt`).toBeUndefined();
        }

        const potency = potencyExpectation(expected);
        const potencyLog = result.log.find((entry) => entry.data.potency !== undefined);
        if (potency) {
          expect(potencyLog, `${fixture.fixtureId} tier ${tier} potency receipt`).toBeDefined();
          const potencyData = potencyLog?.data.potency as
            | { applies: boolean; adjustedValue: number; targetScore: number }
            | undefined;
          expect(potencyData?.applies, `${fixture.fixtureId} tier ${tier} potency gate`).toBe(
            potency.applies,
          );
          expect(
            potencyData?.adjustedValue,
            `${fixture.fixtureId} tier ${tier} potency value`,
          ).toBe(potency.value);
          expect(potencyData?.targetScore, `${fixture.fixtureId} tier ${tier} potency target`).toBe(
            potency.targetScore,
          );
        } else {
          expect(
            potencyLog,
            `${fixture.fixtureId} tier ${tier} no-potency receipt`,
          ).toBeUndefined();
        }

        const expectedConditionIds =
          potency === null || potency.applies ? expected.conditionIds : [];
        expect(
          targetAfter.conditions.map((instance) => instance.conditionId),
          `${fixture.fixtureId} tier ${tier} conditions`,
        ).toEqual(expectedConditionIds);
        expect(
          targetAfter.conditions.map((instance) => instance.ending),
          `${fixture.fixtureId} tier ${tier} condition endings`,
        ).toEqual(
          expectedConditionIds.map(() =>
            expected.ending === 'save-ends' ? { kind: 'save-ends' } : { kind: 'external' },
          ),
        );
        expect(
          result.state.participants.actor,
          `${fixture.fixtureId} tier ${tier} actor unchanged`,
        ).toEqual(before.participants.actor);
        executedCount += 1;
      }
    }

    expect(compiledCount).toBeGreaterThan(0);
    expect(executedCount).toBe(compiledCount * 3);
  });
});
