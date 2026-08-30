import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { type Characteristics, ParticipantStatsSchema } from '@engarde/engine';
import { describe, expect, it } from 'vitest';
import { heroStats } from './hero-stats.js';

const sourceRoot = process.env.ENGARDE_CORPUS_ROOT
  ? resolve(process.env.ENGARDE_CORPUS_ROOT)
  : undefined;

async function structured(jsonPath: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(resolve(sourceRoot ?? '', jsonPath), 'utf8'));
}

/** Fury starting assignment: ❝You start with a Might of 2 and an Agility of
 * 2❞ + the printed array ❝1, 0, 0❞ for the other scores
 * (en/books/heroes/md/class/fury.md §Basics — Starting Characteristics). */
const furyStart: Characteristics = { might: 2, agility: 2, reason: 1, intuition: 0, presence: 0 };

describe.skipIf(!sourceRoot)('heroStats over real class records', () => {
  it('fury at 1st level: printed starting stamina and recoveries, schema-valid', async () => {
    // en/books/heroes/json/class/fury.json: starting_stamina 21,
    // stamina_per_level 9, recoveries 10 (paired md prints ❝Starting Stamina
    // at 1st Level: 21❞ / ❝Stamina Gained at 2nd and Higher Levels: 9❞ /
    // ❝Recoveries: 10❞).
    const stats = heroStats(await structured('en/books/heroes/json/class/fury.json'), 1, furyStart);
    expect(stats).not.toBeNull();
    expect(ParticipantStatsSchema.parse(stats)).toEqual({
      staminaMax: 21,
      characteristics: furyStart,
      immunities: [],
      weaknesses: [],
      potencies: null,
      organization: null,
      recoveriesMax: 10,
      freeStrike: null,
      withCaptain: null,
      withCaptainBenefit: null,
    });
  });

  it('fury at 3rd level: the per-level gain lands at each of levels 2..3', async () => {
    const stats = heroStats(await structured('en/books/heroes/json/class/fury.json'), 3, furyStart);
    // 21 + 9 gained at 2nd + 9 gained at 3rd.
    expect(ParticipantStatsSchema.parse(stats).staminaMax).toBe(21 + 9 + 9);
    expect(stats?.recoveriesMax).toBe(10);
  });

  it('fury at 10th level: top of the printed advancement table', async () => {
    const stats = heroStats(
      await structured('en/books/heroes/json/class/fury.json'),
      10,
      furyStart,
    );
    expect(ParticipantStatsSchema.parse(stats).staminaMax).toBe(21 + 9 * 9);
  });

  it('conduit: distinct printed values flow through (18 / 6 / 8)', async () => {
    // en/books/heroes/json/class/conduit.json: starting_stamina 18,
    // stamina_per_level 6, recoveries 8. Characteristic assignment from the
    // conduit Basics starting Intuition 2 + an in-range spread.
    const stats = heroStats(await structured('en/books/heroes/json/class/conduit.json'), 2, {
      might: -1,
      agility: -1,
      reason: 1,
      intuition: 2,
      presence: 2,
    });
    const parsed = ParticipantStatsSchema.parse(stats);
    expect(parsed.staminaMax).toBe(18 + 6);
    expect(parsed.recoveriesMax).toBe(8);
    expect(parsed.potencies).toBeNull();
  });

  it('tactician at 1st level: schema-valid with printed values (21 / 9 / 10)', async () => {
    // en/books/heroes/json/class/tactician.json: starting_stamina 21,
    // stamina_per_level 9, recoveries 10.
    const stats = heroStats(await structured('en/books/heroes/json/class/tactician.json'), 1, {
      might: 2,
      agility: 0,
      reason: 2,
      intuition: 1,
      presence: 0,
    });
    const parsed = ParticipantStatsSchema.parse(stats);
    expect(parsed.staminaMax).toBe(21);
    expect(parsed.recoveriesMax).toBe(10);
  });

  it('every class record produces schema-valid stats at every printed level', async () => {
    const classes = [
      'censor',
      'conduit',
      'elementalist',
      'fury',
      'null',
      'shadow',
      'tactician',
      'talent',
      'troubadour',
    ];
    const zero: Characteristics = { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 };
    for (const name of classes) {
      const record = await structured(`en/books/heroes/json/class/${name}.json`);
      for (let level = 1; level <= 10; level += 1) {
        const stats = heroStats(record, level, zero);
        expect(stats, `${name} L${level}`).not.toBeNull();
        expect(() => ParticipantStatsSchema.parse(stats), `${name} L${level}`).not.toThrow();
      }
    }
  });

  it('rejects levels outside the printed 1..10 range and non-integer levels', async () => {
    const record = await structured('en/books/heroes/json/class/fury.json');
    expect(heroStats(record, 0, furyStart)).toBeNull();
    expect(heroStats(record, 11, furyStart)).toBeNull();
    expect(heroStats(record, 2.5, furyStart)).toBeNull();
  });

  it('rejects an out-of-range characteristic assignment', async () => {
    const record = await structured('en/books/heroes/json/class/fury.json');
    expect(heroStats(record, 1, { ...furyStart, might: 6 })).toBeNull();
    expect(heroStats(record, 1, { ...furyStart, presence: -6 })).toBeNull();
  });
});

describe('heroStats input guards (no corpus needed)', () => {
  const zero: Characteristics = { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 };

  it('returns null for a non-class record', () => {
    expect(heroStats({ type: 'statblock', stamina: 15 }, 1, zero)).toBeNull();
  });

  it('returns null when the printed stamina/recoveries fields are missing or unusable', () => {
    expect(heroStats({ type: 'class' }, 1, zero)).toBeNull();
    expect(
      heroStats({ type: 'class', starting_stamina: 21, stamina_per_level: 9 }, 1, zero),
    ).toBeNull();
    expect(
      heroStats(
        { type: 'class', starting_stamina: '21', stamina_per_level: 9, recoveries: 10 },
        1,
        zero,
      ),
    ).toBeNull();
    expect(
      heroStats(
        { type: 'class', starting_stamina: 21, stamina_per_level: 0, recoveries: 10 },
        1,
        zero,
      ),
    ).toBeNull();
  });
});
