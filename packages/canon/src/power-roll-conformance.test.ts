import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  type EncounterState,
  type Intent,
  applyIntent,
  checkInvariants,
  createDriver,
  createSeededRandomSource,
  isDead,
} from '@engarde/engine';
import { describe, expect, it } from 'vitest';
import { compileAbilities, compileAbility } from './effect-conformance.js';
import { auditGrammarConservation, parseEffectText } from './effect-grammar.js';
import { ingestStructuredRecord } from './extract.js';

/**
 * Channel-1 conformance for the power-roll resolution cluster
 * (docs/power-roll-design.md §8): verbatim corpus text → grammar →
 * compileAbilities → engine dispatch, asserted against the books' own
 * numbers. Every fixture is a real record; dice are asserted vectors.
 */

const sourceRoot = process.env.ENGARDE_CORPUS_ROOT
  ? resolve(process.env.ENGARDE_CORPUS_ROOT)
  : undefined;

async function ingestText(markdownPath: string): Promise<string> {
  const jsonPath = markdownPath.replace('/md/', '/json/').replace(/\.md$/, '.json');
  const bundle = ingestStructuredRecord({
    markdownPath,
    markdown: await readFile(resolve(sourceRoot ?? '', markdownPath)),
    jsonPath,
    json: await readFile(resolve(sourceRoot ?? '', jsonPath)),
  });
  const artifact = bundle.records.find((record) => record.recordKind === 'artifact');
  if (!artifact || artifact.recordKind !== 'artifact') throw new Error('no artifact');
  return artifact.text;
}

describe.skipIf(!sourceRoot)('grammar: the measured damage/bonus shapes', () => {
  it('melee weapon free strike: choice roll bonus and choice damage', async () => {
    const text = await ingestText(
      'en/books/heroes/md/feature/ability/common/melee-weapon-free-strike.md',
    );
    const parse = parseEffectText(text);
    expect(auditGrammarConservation(text, parse)).toEqual([]);
    const powerRoll = parse.clauses.find((clause) => clause.kind === 'power-roll');
    expect(powerRoll?.bonusData).toEqual({ kind: 'characteristic', options: ['M', 'A'] });
    const tiers = parse.clauses.filter((clause) => clause.kind === 'tier-outcome');
    expect(tiers.map((clause) => clause.data.damage?.amount)).toEqual([2, 5, 7]);
    for (const clause of tiers) {
      expect(clause.data.damage?.characteristicOptions).toEqual(['M', 'A']);
      expect(clause.data.damage?.typeOptions).toEqual([]);
    }
  });

  it('high elf dawn mage: fixed stat-block bonus and typed holy damage', async () => {
    const text = await ingestText(
      'en/books/monsters/md/monster/elf-high/statblock/high-elf-dawn-mage.md',
    );
    const parse = parseEffectText(text);
    expect(auditGrammarConservation(text, parse)).toEqual([]);
    const compiled = compileAbilities(
      parse,
      'mcdm.monsters.v1/monster.elf-high.statblock/high-elf-dawn-mage',
    );
    const holy = compiled.abilities.find(
      (ability) => ability.tiers.tier1.damage?.typeOptions[0] === 'holy',
    );
    expect(holy).toBeDefined();
    expect(holy?.powerRollBonus).toEqual({ kind: 'fixed', value: 2 });
    expect(
      [holy?.tiers.tier1, holy?.tiers.tier2, holy?.tiers.tier3].map((tier) => tier?.damage?.amount),
    ).toEqual([1, 2, 3]);
  });

  it('blood for blood compiles whole: Might roll, M damage, named potencies, conditions', async () => {
    const text = await ingestText(
      'en/books/heroes/md/feature/ability/fury/level-1/blood-for-blood.md',
    );
    const compiled = compileAbility(
      parseEffectText(text),
      'mcdm.heroes.v1/feature.ability.fury.level-1/blood-for-blood',
    );
    if (!('ability' in compiled))
      throw new Error(`did not compile: ${compiled.missing.join(', ')}`);
    const { ability } = compiled;
    expect(ability.powerRollBonus).toEqual({ kind: 'characteristic', options: ['M'] });
    expect(ability.actionType).toBe('Main action');
    expect(ability.tiers.tier3.damage).toEqual({
      amount: 10,
      characteristicOptions: ['M'],
      typeOptions: [],
    });
    expect(ability.tiers.tier1.potency).toEqual({
      characteristic: 'M',
      threshold: { kind: 'named', name: 'weak' },
    });
    expect(ability.tiers.tier3.potency).toEqual({
      characteristic: 'M',
      threshold: { kind: 'named', name: 'strong' },
    });
    for (const tier of [ability.tiers.tier1, ability.tiers.tier2, ability.tiers.tier3]) {
      expect(tier.conditionIds).toEqual([
        'mcdm.heroes.v1/condition/bleeding',
        'mcdm.heroes.v1/condition/weakened',
      ]);
      expect(tier.ending).toBe('save-ends');
    }
  });
});

describe.skipIf(!sourceRoot)('end to end: goblin warrior strike through the engine', () => {
  /** Goblin Assassin stats — the real stat block JSON
   * (monsters/json/monster/goblin/statblock/goblin-assassin.json). */
  const targetStats = {
    staminaMax: 15,
    characteristics: { might: -2, agility: 2, reason: 0, intuition: 0, presence: -2 },
    immunities: [],
    weaknesses: [],
    potencies: null,
    organization: 'Horde',
    recoveriesMax: null,
  };

  function freshState(): EncounterState {
    return {
      schemaVersion: 4,
      terrainFacts: [],
      participants: {
        warrior: {
          id: 'warrior',
          conditions: [],
          sourceRecordId: 'mcdm.monsters.v1/monster.goblin.statblock/goblin-warrior',
          kind: 'director-creature',
          stats: null,
          stamina: null,
          grants: [],
        },
        assassin: {
          id: 'assassin',
          conditions: [],
          sourceRecordId: 'mcdm.monsters.v1/monster.goblin.statblock/goblin-assassin',
          kind: 'director-creature',
          stats: targetStats,
          stamina: { current: 15, temporary: 0, recoveries: null },
          grants: [],
        },
      },
    };
  }

  it('the bleeding strike (Power Roll + 2; 5/6/7 damage; M < 0/1/2 bleeding, save ends)', async () => {
    const text = await ingestText(
      'en/books/monsters/md/monster/goblin/statblock/goblin-warrior.md',
    );
    const parse = parseEffectText(text);
    const { abilities } = compileAbilities(
      parse,
      'mcdm.monsters.v1/monster.goblin.statblock/goblin-warrior',
    );
    const strike = abilities.find((ability) =>
      ability.tiers.tier1.conditionIds.includes('mcdm.heroes.v1/condition/bleeding'),
    );
    expect(strike).toBeDefined();
    if (!strike) return;
    expect(strike.powerRollBonus).toEqual({ kind: 'fixed', value: 2 });

    // Dice 4+5 → natural 9, +2 → 11 → tier 1: 5 damage; M < 0 vs Might −2
    // → bleeding applies (−2 < 0, strictly less).
    const before = freshState();
    const intent: Intent = {
      intentId: 'e2e-1',
      actor: { kind: 'director' },
      kind: 'use-ability',
      payload: {
        actorParticipantId: 'warrior',
        ability: strike,
        targets: ['assassin'],
        dice: [4, 5],
      },
    };
    const result = applyIntent(before, intent, { random: createSeededRandomSource(1) });
    expect(checkInvariants(before, intent, result)).toEqual([]);
    const assassin = result.state.participants.assassin;
    expect(assassin?.stamina).toEqual({ current: 10, temporary: 0, recoveries: null });
    expect(assassin?.conditions.map((instance) => instance.conditionId)).toEqual([
      'mcdm.heroes.v1/condition/bleeding',
    ]);
    expect(assassin?.conditions[0]?.ending).toEqual({ kind: 'save-ends' });
  });

  it('tier 3 (dice 10+8, +2 → 20): 7 damage and the M < 2 gate still applies', async () => {
    const text = await ingestText(
      'en/books/monsters/md/monster/goblin/statblock/goblin-warrior.md',
    );
    const { abilities } = compileAbilities(
      parseEffectText(text),
      'mcdm.monsters.v1/monster.goblin.statblock/goblin-warrior',
    );
    const strike = abilities.find((ability) =>
      ability.tiers.tier1.conditionIds.includes('mcdm.heroes.v1/condition/bleeding'),
    );
    if (!strike) throw new Error('bleeding strike not compiled');
    const before = freshState();
    const intent: Intent = {
      intentId: 'e2e-2',
      actor: { kind: 'director' },
      kind: 'use-ability',
      payload: {
        actorParticipantId: 'warrior',
        ability: strike,
        targets: ['assassin'],
        dice: [10, 8],
      },
    };
    const result = applyIntent(before, intent, { random: createSeededRandomSource(1) });
    expect(checkInvariants(before, intent, result)).toEqual([]);
    expect(result.state.participants.assassin?.stamina).toEqual({
      current: 8,
      temporary: 0,
      recoveries: null,
    });
    expect(result.state.participants.assassin?.conditions).toHaveLength(1);
  });
});

describe.skipIf(!sourceRoot)(
  'replayable fight: two goblin warriors trade Bury the Point to the death',
  () => {
    it('runs a full seeded fight under the invariant oracle, byte-identical on replay', async () => {
      const text = await ingestText(
        'en/books/monsters/md/monster/goblin/statblock/goblin-warrior.md',
      );
      const { abilities } = compileAbilities(
        parseEffectText(text),
        'mcdm.monsters.v1/monster.goblin.statblock/goblin-warrior',
      );
      const strike = abilities.find((ability) =>
        ability.tiers.tier1.conditionIds.includes('mcdm.heroes.v1/condition/bleeding'),
      );
      if (!strike) throw new Error('bleeding strike not compiled');
      const warriorStats = {
        staminaMax: 15,
        characteristics: { might: -2, agility: 2, reason: 0, intuition: 0, presence: -1 },
        immunities: [],
        weaknesses: [],
        potencies: null,
        organization: 'Horde',
        recoveriesMax: null,
      };

      const runFight = () => {
        const driver = createDriver(
          [
            {
              id: 'red',
              sourceRecordId: strike.abilityArtifactId,
              kind: 'director-creature' as const,
              stats: warriorStats,
            },
            {
              id: 'blue',
              sourceRecordId: strike.abilityArtifactId,
              kind: 'director-creature' as const,
              stats: warriorStats,
            },
          ],
          { random: createSeededRandomSource(0xf16f7) },
        );
        let step = 0;
        // Alternate auto-rolled strikes + end-of-turn saves until one dies
        // (bounded: the corpus numbers guarantee death well inside the cap).
        for (let round = 0; round < 30; round += 1) {
          const attacker = round % 2 === 0 ? 'red' : 'blue';
          const defender = round % 2 === 0 ? 'blue' : 'red';
          step += 1;
          const attack = driver.dispatch({
            intentId: `f${step}`,
            kind: 'use-ability',
            actor: { kind: 'participant', participantId: attacker },
            payload: {
              actorParticipantId: attacker,
              ability: strike,
              targets: [defender],
            },
          });
          expect(attack.violations).toEqual([]);
          const fallen = Object.values(driver.state().participants).find((participant) =>
            isDead(participant),
          );
          if (fallen) break;
          step += 1;
          const turn = driver.dispatch({
            intentId: `f${step}`,
            kind: 'end-turn',
            actor: { kind: 'participant', participantId: defender },
            payload: { participantId: defender },
          });
          expect(turn.violations).toEqual([]);
        }
        return driver.transcript();
      };

      const first = runFight();
      const again = runFight();
      // Same seed, same corpus text: byte-identical transcript (replayable).
      expect(JSON.stringify(again)).toBe(JSON.stringify(first));
      expect(first.violationCount).toBe(0);
      // The fight ends in a death, with the full receipts trail behind it.
      const participants = Object.values(first.finalState.participants);
      expect(participants.some((participant) => isDead(participant))).toBe(true);
      const allLog = first.steps.flatMap((entry) => entry.log);
      expect(allLog.some((entry) => entry.data.powerRoll !== undefined)).toBe(true);
      expect(allLog.some((entry) => entry.message.includes('dies'))).toBe(true);
    });
  },
);
