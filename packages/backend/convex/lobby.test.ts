/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { PRESENCE_STALE_MS } from './lobby';
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

async function makeCampaign(client: Client, name = 'The Iron Vow') {
  const campaignId = await client.mutation(api.campaigns.create, {
    name,
    description: 'A campaign of oaths and consequences',
  });
  const settings = await client.query(api.campaigns.getSettings, { campaignId });
  return { campaignId, joinCode: settings.joinCode };
}

// Owner creates the campaign; the joiner requests by code and is approved.
async function setupTable(t: Harness) {
  const owner = await addPlayer(t, 'owner@example.test', 'owner_user');
  const player = await addPlayer(t, 'player@example.test', 'player_user');
  const { campaignId, joinCode } = await makeCampaign(owner.client);
  await player.client.mutation(api.campaigns.requestToJoin, { code: joinCode });
  await owner.client.mutation(api.campaigns.approveRequest, {
    campaignId,
    targetUserId: player.userId,
  });
  return { owner, player, campaignId };
}

describe('lobby (the Table)', () => {
  test('every surface answers uniform not-found for outsiders and pending members', async () => {
    const t = convexTest(schema, modules);
    const owner = await addPlayer(t, 'owner@example.test', 'owner_user');
    const stranger = await addPlayer(t, 'stranger@example.test', 'stranger_user');
    const pending = await addPlayer(t, 'pending@example.test', 'pending_user');
    const { campaignId, joinCode } = await makeCampaign(owner.client);
    await pending.client.mutation(api.campaigns.requestToJoin, { code: joinCode });

    for (const client of [stranger.client, pending.client]) {
      await expect(client.mutation(api.lobby.join, { campaignId })).rejects.toThrow(
        'Campaign not found',
      );
      await expect(client.query(api.lobby.listPresent, { campaignId })).rejects.toThrow(
        'Campaign not found',
      );
      await expect(client.query(api.lobby.listMessages, { campaignId })).rejects.toThrow(
        'Campaign not found',
      );
      await expect(
        client.mutation(api.lobby.sendMessage, { campaignId, body: 'hello' }),
      ).rejects.toThrow('Campaign not found');
    }
  });

  test('join / heartbeat / leave drive the present-player list', async () => {
    const t = convexTest(schema, modules);
    const { owner, player, campaignId } = await setupTable(t);

    await owner.client.mutation(api.lobby.join, { campaignId });
    await player.client.mutation(api.lobby.join, { campaignId });
    // Rejoin is idempotent: still one row per (campaign, user).
    await player.client.mutation(api.lobby.join, { campaignId });

    const present = await owner.client.query(api.lobby.listPresent, { campaignId });
    expect(present).toHaveLength(2);
    expect(present[0]).toMatchObject({
      userId: owner.userId,
      handle: 'owner_user',
      role: 'director',
      isOwner: true,
    });
    expect(present[1]).toMatchObject({
      userId: player.userId,
      handle: 'player_user',
      role: 'player',
      isOwner: false,
    });

    await player.client.mutation(api.lobby.leave, { campaignId });
    const afterLeave = await owner.client.query(api.lobby.listPresent, { campaignId });
    expect(afterLeave.map((p) => p.userId)).toEqual([owner.userId]);
  });

  test('a stale row reads as absent and is swept by the next heartbeat', async () => {
    const t = convexTest(schema, modules);
    const { owner, player, campaignId } = await setupTable(t);
    await owner.client.mutation(api.lobby.join, { campaignId });
    await player.client.mutation(api.lobby.join, { campaignId });

    // Simulate the player's tab dying: age their row past the stale window.
    await t.run(async (ctx) => {
      const theirs = await ctx.db
        .query('lobbyPresence')
        .withIndex('by_campaignId_userId', (q) =>
          q.eq('campaignId', campaignId).eq('userId', player.userId),
        )
        .unique();
      if (!theirs) throw new Error('expected a presence row');
      await ctx.db.patch(theirs._id, { lastSeenAt: Date.now() - PRESENCE_STALE_MS - 1_000 });
    });

    const present = await owner.client.query(api.lobby.listPresent, { campaignId });
    expect(present.map((p) => p.userId)).toEqual([owner.userId]);

    await owner.client.mutation(api.lobby.heartbeat, { campaignId });
    const rowCount = await t.run(
      async (ctx) =>
        (
          await ctx.db
            .query('lobbyPresence')
            .withIndex('by_campaignId', (q) => q.eq('campaignId', campaignId))
            .collect()
        ).length,
    );
    expect(rowCount).toBe(1);
  });

  test('a member removed mid-session drops from the list before their row goes stale', async () => {
    const t = convexTest(schema, modules);
    const { owner, player, campaignId } = await setupTable(t);
    await player.client.mutation(api.lobby.join, { campaignId });
    await owner.client.mutation(api.campaigns.removeMember, {
      campaignId,
      targetUserId: player.userId,
    });
    const present = await owner.client.query(api.lobby.listPresent, { campaignId });
    expect(present).toEqual([]);
  });

  test('messages are tagged with author and time, oldest first', async () => {
    const t = convexTest(schema, modules);
    const { owner, player, campaignId } = await setupTable(t);
    const before = Date.now();
    await owner.client.mutation(api.lobby.sendMessage, { campaignId, body: 'Take your seats.' });
    await player.client.mutation(api.lobby.sendMessage, { campaignId, body: '  Ready!  ' });

    const messages = await player.client.query(api.lobby.listMessages, { campaignId });
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      authorUserId: owner.userId,
      authorName: 'owner_user',
      authorHandle: 'owner_user',
      body: 'Take your seats.',
    });
    // Bodies are trimmed; timestamps are real epoch millis.
    expect(messages[1]).toMatchObject({ authorUserId: player.userId, body: 'Ready!' });
    for (const message of messages) {
      expect(message.sentAt).toBeGreaterThanOrEqual(before);
      expect(message.sentAt).toBeLessThanOrEqual(Date.now());
    }
    expect(messages[0]?.sentAt ?? 0).toBeLessThanOrEqual(messages[1]?.sentAt ?? 0);
  });

  test('rejects empty and oversized messages', async () => {
    const t = convexTest(schema, modules);
    const { owner, campaignId } = await setupTable(t);
    await expect(
      owner.client.mutation(api.lobby.sendMessage, { campaignId, body: '   ' }),
    ).rejects.toThrow('Message is empty');
    await expect(
      owner.client.mutation(api.lobby.sendMessage, { campaignId, body: 'x'.repeat(1001) }),
    ).rejects.toThrow('at most 1000 characters');
  });

  test('listMessages returns only the latest page', async () => {
    const t = convexTest(schema, modules);
    const { owner, campaignId } = await setupTable(t);
    await t.run(async (ctx) => {
      for (let i = 0; i < 55; i++) {
        await ctx.db.insert('lobbyMessages', {
          campaignId,
          authorUserId: owner.userId,
          body: `message ${i}`,
          sentAt: 1_000 + i,
        });
      }
    });
    const messages = await owner.client.query(api.lobby.listMessages, { campaignId });
    expect(messages).toHaveLength(50);
    expect(messages[0]?.body).toBe('message 5');
    expect(messages[49]?.body).toBe('message 54');
  });
});
