/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

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

async function makeCampaign(client: Client, name: string) {
  const campaignId = await client.mutation(api.campaigns.create, { name, description: '' });
  const settings = await client.query(api.campaigns.getSettings, { campaignId });
  return { campaignId, joinCode: settings.joinCode };
}

async function joinCampaign(
  owner: { client: Client },
  member: { userId: Id<'users'>; client: Client },
  campaignId: Id<'campaigns'>,
  joinCode: string,
) {
  await member.client.mutation(api.campaigns.requestToJoin, { code: joinCode });
  await owner.client.mutation(api.campaigns.approveRequest, {
    campaignId,
    targetUserId: member.userId,
  });
}

describe('characters', () => {
  test('requires a profile and validates the pre-engine character identity fields', async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.characters.create, { name: 'Nobody', concept: '' }),
    ).rejects.toThrow('Unauthenticated');
    const player = await addPlayer(t, 'player@example.test', 'player_user');
    await expect(
      player.client.mutation(api.characters.create, { name: '   ', concept: '' }),
    ).rejects.toThrow('1–80');
    await expect(
      player.client.mutation(api.characters.create, {
        name: 'Valid',
        concept: 'x'.repeat(301),
      }),
    ).rejects.toThrow('at most 300');
  });

  test('creates portable user-owned characters and allows many in one campaign', async () => {
    const t = convexTest(schema, modules);
    const owner = await addPlayer(t, 'owner@example.test', 'owner_user');
    const { campaignId } = await makeCampaign(owner.client, 'Morrowind');

    const unbound = await owner.client.mutation(api.characters.create, {
      name: 'Nerevar',
      concept: 'An unbound wanderer',
    });
    expect(unbound.bindingStatus).toBeNull();
    const first = await owner.client.mutation(api.characters.create, {
      name: 'Vivec',
      concept: 'Poet warrior',
      campaignId,
    });
    const second = await owner.client.mutation(api.characters.create, {
      name: 'Almalexia',
      concept: 'The Lady of Mercy',
      campaignId,
    });
    expect(first.bindingStatus).toBe('active');
    expect(second.bindingStatus).toBe('active');

    const mine = await owner.client.query(api.characters.listMine, {});
    expect(mine).toHaveLength(3);
    expect(mine).toContainEqual(
      expect.objectContaining({ characterId: unbound.characterId, level: 1, binding: null }),
    );
    const campaign = await owner.client.query(api.characters.listForCampaign, { campaignId });
    expect(campaign.characters).toHaveLength(2);
    expect(campaign.characters.map((character) => character.name).sort()).toEqual([
      'Almalexia',
      'Vivec',
    ]);
  });

  test('member submissions stay private while pending and the campaign owner can approve', async () => {
    const t = convexTest(schema, modules);
    const owner = await addPlayer(t, 'owner@example.test', 'owner_user');
    const submitter = await addPlayer(t, 'submitter@example.test', 'submitter_user');
    const peer = await addPlayer(t, 'peer@example.test', 'peer_user');
    const { campaignId, joinCode } = await makeCampaign(owner.client, 'The Iron Vow');
    await joinCampaign(owner, submitter, campaignId, joinCode);
    await joinCampaign(owner, peer, campaignId, joinCode);

    const created = await submitter.client.mutation(api.characters.create, {
      name: 'Sefa',
      concept: 'A shadow on the road',
      campaignId,
    });
    expect(created.bindingStatus).toBe('pending');
    expect(
      (await submitter.client.query(api.characters.listForCampaign, { campaignId })).characters,
    ).toEqual([expect.objectContaining({ characterId: created.characterId, status: 'pending' })]);
    expect(
      (await peer.client.query(api.characters.listForCampaign, { campaignId })).characters,
    ).toEqual([]);
    expect(
      (await owner.client.query(api.characters.listForCampaign, { campaignId })).characters,
    ).toEqual([expect.objectContaining({ characterId: created.characterId, status: 'pending' })]);

    await owner.client.mutation(api.characters.approve, {
      campaignId,
      characterId: created.characterId,
    });
    const approved = await peer.client.query(api.characters.listForCampaign, { campaignId });
    expect(approved.characters).toEqual([
      expect.objectContaining({ characterId: created.characterId, status: 'active' }),
    ]);
  });

  test('one character cannot bind twice, but denial and kick free it without losing progression', async () => {
    const t = convexTest(schema, modules);
    const alphaOwner = await addPlayer(t, 'alpha@example.test', 'alpha_owner');
    const betaOwner = await addPlayer(t, 'beta@example.test', 'beta_owner');
    const player = await addPlayer(t, 'player@example.test', 'player_user');
    const alpha = await makeCampaign(alphaOwner.client, 'Alpha');
    const beta = await makeCampaign(betaOwner.client, 'Beta');
    await joinCampaign(alphaOwner, player, alpha.campaignId, alpha.joinCode);
    await joinCampaign(betaOwner, player, beta.campaignId, beta.joinCode);

    const { characterId } = await player.client.mutation(api.characters.create, {
      name: 'Portable Hero',
      concept: '',
      campaignId: alpha.campaignId,
    });
    await expect(
      player.client.mutation(api.characters.submit, {
        characterId,
        campaignId: beta.campaignId,
      }),
    ).rejects.toThrow('already submitted');

    await alphaOwner.client.mutation(api.characters.deny, {
      campaignId: alpha.campaignId,
      characterId,
    });
    expect(
      await player.client.mutation(api.characters.submit, {
        characterId,
        campaignId: beta.campaignId,
      }),
    ).toBe('pending');
    await betaOwner.client.mutation(api.characters.approve, {
      campaignId: beta.campaignId,
      characterId,
    });
    await betaOwner.client.mutation(api.characters.kick, {
      campaignId: beta.campaignId,
      characterId,
    });

    const [character] = await player.client.query(api.characters.listMine, {});
    expect(character).toMatchObject({ characterId, level: 1, binding: null });
    const eventTypes = await t.run(async (ctx) => {
      const events = await ctx.db
        .query('characterCampaignEvents')
        .withIndex('by_characterId', (q) => q.eq('characterId', characterId))
        .collect();
      return events.map((event) => event.type);
    });
    expect(eventTypes).toEqual(['submitted', 'denied', 'submitted', 'approved', 'kicked']);
  });

  test('character owners can withdraw pending and remove active bindings', async () => {
    const t = convexTest(schema, modules);
    const owner = await addPlayer(t, 'owner@example.test', 'owner_user');
    const player = await addPlayer(t, 'player@example.test', 'player_user');
    const { campaignId, joinCode } = await makeCampaign(owner.client, 'Morrowind');
    await joinCampaign(owner, player, campaignId, joinCode);

    const { characterId } = await player.client.mutation(api.characters.create, {
      name: 'Jiub',
      concept: '',
      campaignId,
    });
    await player.client.mutation(api.characters.withdraw, { characterId });
    expect((await player.client.query(api.characters.listMine, {}))[0]?.binding).toBeNull();

    await player.client.mutation(api.characters.submit, { characterId, campaignId });
    await owner.client.mutation(api.characters.approve, { campaignId, characterId });
    await player.client.mutation(api.characters.removeFromCampaign, { characterId });
    expect((await player.client.query(api.characters.listMine, {}))[0]?.binding).toBeNull();
  });

  test('authorization hides characters and moderation from outsiders and other members', async () => {
    const t = convexTest(schema, modules);
    const owner = await addPlayer(t, 'owner@example.test', 'owner_user');
    const player = await addPlayer(t, 'player@example.test', 'player_user');
    const outsider = await addPlayer(t, 'outsider@example.test', 'outsider_user');
    const { campaignId, joinCode } = await makeCampaign(owner.client, 'Morrowind');
    await joinCampaign(owner, player, campaignId, joinCode);
    const { characterId } = await player.client.mutation(api.characters.create, {
      name: 'Fargoth',
      concept: '',
      campaignId,
    });

    await expect(
      outsider.client.query(api.characters.listForCampaign, { campaignId }),
    ).rejects.toThrow('Campaign not found');
    await expect(
      player.client.mutation(api.characters.approve, { campaignId, characterId }),
    ).rejects.toThrow('Campaign not found');
    await expect(
      outsider.client.mutation(api.characters.withdraw, { characterId }),
    ).rejects.toThrow('Character not found');
  });

  test('losing campaign membership transactionally releases every owned character', async () => {
    const t = convexTest(schema, modules);
    const owner = await addPlayer(t, 'owner@example.test', 'owner_user');
    const player = await addPlayer(t, 'player@example.test', 'player_user');
    const { campaignId, joinCode } = await makeCampaign(owner.client, 'Morrowind');
    await joinCampaign(owner, player, campaignId, joinCode);

    for (const name of ['Ahnassi', 'Caius']) {
      const created = await player.client.mutation(api.characters.create, {
        name,
        concept: '',
        campaignId,
      });
      await owner.client.mutation(api.characters.approve, {
        campaignId,
        characterId: created.characterId,
      });
    }
    await owner.client.mutation(api.campaigns.removeMember, {
      campaignId,
      targetUserId: player.userId,
    });
    const mine = await player.client.query(api.characters.listMine, {});
    expect(mine).toHaveLength(2);
    expect(mine.every((character) => character.binding === null)).toBe(true);
  });
});
