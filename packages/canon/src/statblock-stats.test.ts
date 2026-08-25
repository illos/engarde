import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { statblockStats } from './statblock-stats.js';

const sourceRoot = process.env.ENGARDE_CORPUS_ROOT
  ? resolve(process.env.ENGARDE_CORPUS_ROOT)
  : undefined;

async function structured(jsonPath: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(resolve(sourceRoot ?? '', jsonPath), 'utf8'));
}

describe.skipIf(!sourceRoot)('statblockStats over real stat blocks', () => {
  it('goblin assassin: full characteristics, stamina, Horde organization', async () => {
    const stats = statblockStats(
      await structured('en/books/monsters/json/monster/goblin/statblock/goblin-assassin.json'),
    );
    expect(stats).toEqual({
      staminaMax: 15,
      characteristics: { might: -2, agility: 2, reason: 0, intuition: 0, presence: -2 },
      immunities: [],
      weaknesses: [],
      potencies: null,
      organization: 'Horde',
      recoveriesMax: null,
      unparsedRows: [],
    });
  });

  it('count rhodar: typed immunities parse with values', async () => {
    const stats = statblockStats(
      await structured(
        'en/books/monsters/json/monster/count-rhodar-von-glauer/statblock/count-rhodar-von-glauer.json',
      ),
    );
    expect(stats?.staminaMax).toBe(650);
    expect(stats?.immunities).toEqual([
      { appliesTo: 'corruption', value: 10 },
      { appliesTo: 'poison', value: 10 },
    ]);
    expect(stats?.organization).toBe('Solo');
  });

  it('troll mercenary: the malformed upstream "fire" weakness row is a receipt, not a guess', async () => {
    const stats = statblockStats(
      await structured('en/books/monsters/json/monster/retainer/statblock/troll-mercenary.json'),
    );
    expect(stats?.weaknesses).toEqual([{ appliesTo: 'acid', value: 5 }]);
    expect(stats?.unparsedRows).toEqual(['weakness: fire']);
  });

  it('a non-statblock record yields null', async () => {
    const stats = statblockStats(
      await structured('en/books/heroes/json/feature/ability/fury/level-1/blood-for-blood.json'),
    );
    expect(stats).toBeNull();
  });
});
