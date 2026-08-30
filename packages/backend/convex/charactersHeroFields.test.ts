/// <reference types="vite/client" />
import { register as registerRateLimiter } from '@convex-dev/rate-limiter/test';
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

function makeHarness() {
  const t = convexTest(schema, modules);
  registerRateLimiter(t);
  return t;
}

type Harness = ReturnType<typeof convexTest>;
type Client = ReturnType<Harness['withIdentity']>;

async function addPlayer(
  t: Harness,
  email: string,
  handle: string,
): Promise<{ userId: Id<'users'>; client: Client }> {
  const userId = await t.run(
    async (ctx) => await ctx.db.insert('users', { email, emailVerificationTime: Date.now() }),
  );
  const client = t.withIdentity({
    subject: `${userId}|test-session`,
    tokenIdentifier: `test|${userId}`,
  });
  await client.mutation(api.profiles.completeOnboarding, { displayName: handle, handle });
  return { userId, client };
}

// A deliberately synthetic scc-shaped reference (not an mcdm namespace claim).
// Identity substrate only — which sccs name classes is builder-track
// knowledge; the backend never interprets the string.
const CLASS_SCC = 'test.heroes.v1/class/example-class';
const CHARACTERISTICS = { might: 2, agility: 1, reason: 1, intuition: 0, presence: -1 };

describe('character hero fields', () => {
  test('owner can set and clear class and characteristics, and views expose them', async () => {
    const t = makeHarness();
    const player = await addPlayer(t, 'player@example.test', 'player_user');
    const { characterId } = await player.client.mutation(api.characters.create, {
      name: 'Nerevar',
      concept: 'An unbound wanderer',
    });

    const [before] = await player.client.query(api.characters.listMine, {});
    expect(before).toMatchObject({ characterId, classScc: null, characteristics: null });

    await player.client.mutation(api.characters.setClass, { characterId, classScc: CLASS_SCC });
    await player.client.mutation(api.characters.setCharacteristics, {
      characterId,
      characteristics: CHARACTERISTICS,
    });
    const [after] = await player.client.query(api.characters.listMine, {});
    expect(after).toMatchObject({
      characterId,
      classScc: CLASS_SCC,
      characteristics: CHARACTERISTICS,
    });

    await player.client.mutation(api.characters.setClass, { characterId, classScc: null });
    await player.client.mutation(api.characters.setCharacteristics, {
      characterId,
      characteristics: null,
    });
    const [cleared] = await player.client.query(api.characters.listMine, {});
    expect(cleared).toMatchObject({ characterId, classScc: null, characteristics: null });
  });

  test('rejects unauthenticated callers, non-owners, and malformed values', async () => {
    const t = makeHarness();
    const owner = await addPlayer(t, 'owner@example.test', 'owner_user');
    const other = await addPlayer(t, 'other@example.test', 'other_user');
    const { characterId } = await owner.client.mutation(api.characters.create, {
      name: 'Vivec',
      concept: '',
    });

    await expect(
      t.mutation(api.characters.setClass, { characterId, classScc: CLASS_SCC }),
    ).rejects.toThrow('Unauthenticated');
    await expect(
      other.client.mutation(api.characters.setClass, { characterId, classScc: CLASS_SCC }),
    ).rejects.toThrow('Character not found');
    await expect(
      other.client.mutation(api.characters.setCharacteristics, {
        characterId,
        characteristics: CHARACTERISTICS,
      }),
    ).rejects.toThrow('Character not found');

    await expect(
      owner.client.mutation(api.characters.setClass, { characterId, classScc: '   ' }),
    ).rejects.toThrow('1–200');
    await expect(
      owner.client.mutation(api.characters.setCharacteristics, {
        characterId,
        characteristics: { ...CHARACTERISTICS, might: 1.5 },
      }),
    ).rejects.toThrow('integers');

    const [untouched] = await owner.client.query(api.characters.listMine, {});
    expect(untouched).toMatchObject({ characterId, classScc: null, characteristics: null });
  });

  test('campaign view exposes hero fields for bound characters', async () => {
    const t = makeHarness();
    const owner = await addPlayer(t, 'owner@example.test', 'owner_user');
    const campaignId = await owner.client.mutation(api.campaigns.create, {
      name: 'Morrowind',
      description: '',
    });
    const { characterId } = await owner.client.mutation(api.characters.create, {
      name: 'Almalexia',
      concept: '',
      campaignId,
    });
    await owner.client.mutation(api.characters.setClass, { characterId, classScc: CLASS_SCC });
    await owner.client.mutation(api.characters.setCharacteristics, {
      characterId,
      characteristics: CHARACTERISTICS,
    });

    const campaign = await owner.client.query(api.characters.listForCampaign, { campaignId });
    expect(campaign.characters).toEqual([
      expect.objectContaining({
        characterId,
        classScc: CLASS_SCC,
        characteristics: CHARACTERISTICS,
      }),
    ]);
  });
});
