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

async function makeCampaign(client: Client, name = 'The Iron Vow') {
  const campaignId = await client.mutation(api.campaigns.create, {
    name,
    description: 'A campaign of oaths and consequences',
  });
  const settings = await client.query(api.campaigns.getSettings, { campaignId });
  return { campaignId, joinCode: settings.joinCode };
}

const FIRST_PAGE = { paginationOpts: { numItems: 20, cursor: null } };

describe('campaigns', () => {
  test('rejects unauthenticated and profile-less callers', async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.campaigns.listMine, {})).rejects.toThrow('Unauthenticated');
    const bare = await t.run(
      async (ctx) =>
        await ctx.db.insert('users', { email: 'bare@example.test', emailVerificationTime: 1 }),
    );
    const bareClient = t.withIdentity({
      subject: `${bare}|test-session`,
      tokenIdentifier: `test|${bare}`,
    });
    await expect(
      bareClient.mutation(api.campaigns.create, { name: 'Nope', description: '' }),
    ).rejects.toThrow('Profile required');
  });

  test('create bootstraps a private campaign with a code and the owner as active director', async () => {
    const t = convexTest(schema, modules);
    const owner = await addPlayer(t, 'owner@example.test', 'owner_user');
    const { campaignId, joinCode } = await makeCampaign(owner.client);

    expect(joinCode).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    const settings = await owner.client.query(api.campaigns.getSettings, { campaignId });
    expect(settings.visibility).toBe('private');

    const cards = await owner.client.query(api.campaigns.listMine, {});
    expect(cards).toEqual([
      expect.objectContaining({ campaignId, status: 'active', role: 'director', isOwner: true }),
    ]);
    const roster = await owner.client.query(api.campaigns.listRoster, { campaignId });
    expect(roster.members).toEqual([
      expect.objectContaining({ userId: owner.userId, role: 'director', isOwner: true }),
    ]);
    expect(roster.pending).toEqual([]);
    expect(roster.blocked).toEqual([]);
    expect(roster).not.toHaveProperty('joinCode');
    expect(roster.members[0]).not.toHaveProperty('joinCode');
  });

  test('code reaches a private campaign; its ID does not; public opens the ID and directory routes', async () => {
    const t = convexTest(schema, modules);
    const owner = await addPlayer(t, 'owner@example.test', 'owner_user');
    const joiner = await addPlayer(t, 'joiner@example.test', 'joiner_user');
    const { campaignId, joinCode } = await makeCampaign(owner.client);

    const byCode = await joiner.client.query(api.campaigns.getJoinPreview, {
      code: ` ${joinCode.toLowerCase()} `,
    });
    expect(byCode).toMatchObject({
      campaignId,
      name: 'The Iron Vow',
      ownerName: 'owner_user',
      memberCount: 1,
      viewerStatus: 'none',
    });
    expect(byCode).not.toHaveProperty('joinCode');

    await expect(joiner.client.query(api.campaigns.getJoinPreview, { campaignId })).rejects.toThrow(
      'Campaign not found',
    );
    let directory = await joiner.client.query(api.campaigns.listDirectory, FIRST_PAGE);
    expect(directory.page).toEqual([]);

    await owner.client.mutation(api.campaigns.setVisibility, { campaignId, visibility: 'public' });
    const byId = await joiner.client.query(api.campaigns.getJoinPreview, { campaignId });
    expect(byId.viewerStatus).toBe('none');
    directory = await joiner.client.query(api.campaigns.listDirectory, FIRST_PAGE);
    expect(directory.page).toEqual([expect.objectContaining({ campaignId })]);
    expect(directory.page[0]).not.toHaveProperty('joinCode');
  });

  test('request, cancel, re-request, approve reaches the roster as player', async () => {
    const t = convexTest(schema, modules);
    const owner = await addPlayer(t, 'owner@example.test', 'owner_user');
    const joiner = await addPlayer(t, 'joiner@example.test', 'joiner_user');
    const { campaignId, joinCode } = await makeCampaign(owner.client);

    expect(await joiner.client.mutation(api.campaigns.requestToJoin, { code: joinCode })).toBe(
      'pending',
    );
    // Idempotent while pending; own pending card resolves the private ID path.
    expect(await joiner.client.mutation(api.campaigns.requestToJoin, { code: joinCode })).toBe(
      'pending',
    );
    expect(
      (await joiner.client.query(api.campaigns.getJoinPreview, { campaignId })).viewerStatus,
    ).toBe('pending');
    expect(await joiner.client.query(api.campaigns.listMine, {})).toEqual([
      expect.objectContaining({ campaignId, status: 'pending', isOwner: false }),
    ]);
    // A pending requester is not yet a member: the roster stays not-found.
    await expect(joiner.client.query(api.campaigns.listRoster, { campaignId })).rejects.toThrow(
      'Campaign not found',
    );

    await joiner.client.mutation(api.campaigns.cancelJoinRequest, { campaignId });
    expect(await joiner.client.query(api.campaigns.listMine, {})).toEqual([]);

    await joiner.client.mutation(api.campaigns.requestToJoin, { code: joinCode });
    const seen = await owner.client.query(api.campaigns.listRoster, { campaignId });
    expect(seen.pending).toEqual([expect.objectContaining({ userId: joiner.userId })]);
    await owner.client.mutation(api.campaigns.approveRequest, {
      campaignId,
      targetUserId: joiner.userId,
    });
    const roster = await owner.client.query(api.campaigns.listRoster, { campaignId });
    expect(roster.members).toHaveLength(2);
    expect(roster.members).toContainEqual(
      expect.objectContaining({ userId: joiner.userId, role: 'player', isOwner: false }),
    );
    expect(await joiner.client.mutation(api.campaigns.requestToJoin, { code: joinCode })).toBe(
      'active',
    );
  });

  test('deny deletes the request and allows a fresh one', async () => {
    const t = convexTest(schema, modules);
    const owner = await addPlayer(t, 'owner@example.test', 'owner_user');
    const joiner = await addPlayer(t, 'joiner@example.test', 'joiner_user');
    const { campaignId, joinCode } = await makeCampaign(owner.client);

    await joiner.client.mutation(api.campaigns.requestToJoin, { code: joinCode });
    await owner.client.mutation(api.campaigns.denyRequest, {
      campaignId,
      targetUserId: joiner.userId,
    });
    expect(await joiner.client.query(api.campaigns.listMine, {})).toEqual([]);
    expect(await joiner.client.mutation(api.campaigns.requestToJoin, { code: joinCode })).toBe(
      'pending',
    );
  });

  test('block fails re-requests generically without leaking state; unblock restores the path', async () => {
    const t = convexTest(schema, modules);
    const owner = await addPlayer(t, 'owner@example.test', 'owner_user');
    const joiner = await addPlayer(t, 'joiner@example.test', 'joiner_user');
    const { campaignId, joinCode } = await makeCampaign(owner.client);

    await joiner.client.mutation(api.campaigns.requestToJoin, { code: joinCode });
    await owner.client.mutation(api.campaigns.blockUser, {
      campaignId,
      targetUserId: joiner.userId,
    });

    // No special state on the join screen or the campaigns list...
    expect(
      (await joiner.client.query(api.campaigns.getJoinPreview, { code: joinCode })).viewerStatus,
    ).toBe('none');
    expect(await joiner.client.query(api.campaigns.listMine, {})).toEqual([]);
    // ...the private campaign's ID and roster behave as nonexistent...
    await expect(joiner.client.query(api.campaigns.getJoinPreview, { campaignId })).rejects.toThrow(
      'Campaign not found',
    );
    await expect(joiner.client.query(api.campaigns.listRoster, { campaignId })).rejects.toThrow(
      'Campaign not found',
    );
    // ...and the request fails with the generic message.
    await expect(
      joiner.client.mutation(api.campaigns.requestToJoin, { code: joinCode }),
    ).rejects.toThrow('Unable to send request');

    const roster = await owner.client.query(api.campaigns.listRoster, { campaignId });
    expect(roster.blocked).toEqual([expect.objectContaining({ userId: joiner.userId })]);
    await owner.client.mutation(api.campaigns.unblockUser, {
      campaignId,
      targetUserId: joiner.userId,
    });
    expect(await joiner.client.mutation(api.campaigns.requestToJoin, { code: joinCode })).toBe(
      'pending',
    );
  });

  test('owner mutations reject non-owners, and roster hides moderation lists from members', async () => {
    const t = convexTest(schema, modules);
    const owner = await addPlayer(t, 'owner@example.test', 'owner_user');
    const member = await addPlayer(t, 'member@example.test', 'member_user');
    const outsider = await addPlayer(t, 'outsider@example.test', 'outsider_user');
    const { campaignId, joinCode } = await makeCampaign(owner.client);
    await member.client.mutation(api.campaigns.requestToJoin, { code: joinCode });
    await owner.client.mutation(api.campaigns.approveRequest, {
      campaignId,
      targetUserId: member.userId,
    });

    const asMember = { campaignId, targetUserId: outsider.userId };
    for (const call of [
      () => member.client.query(api.campaigns.getSettings, { campaignId }),
      () =>
        member.client.mutation(api.campaigns.setVisibility, { campaignId, visibility: 'public' }),
      () => member.client.mutation(api.campaigns.regenerateJoinCode, { campaignId }),
      () =>
        member.client.mutation(api.campaigns.updateSettings, {
          campaignId,
          name: 'Hijacked',
          description: '',
        }),
      () => member.client.mutation(api.campaigns.approveRequest, asMember),
      () => member.client.mutation(api.campaigns.denyRequest, asMember),
      () => member.client.mutation(api.campaigns.blockUser, asMember),
      () => member.client.mutation(api.campaigns.unblockUser, asMember),
      () =>
        member.client.mutation(api.campaigns.setDirector, {
          campaignId,
          targetUserId: member.userId,
        }),
      () =>
        member.client.mutation(api.campaigns.removeMember, {
          campaignId,
          targetUserId: owner.userId,
        }),
    ]) {
      await expect(call()).rejects.toThrow('Campaign not found');
    }

    const memberView = await member.client.query(api.campaigns.listRoster, { campaignId });
    expect(memberView.pending).toBeUndefined();
    expect(memberView.blocked).toBeUndefined();
    await expect(outsider.client.query(api.campaigns.listRoster, { campaignId })).rejects.toThrow(
      'Campaign not found',
    );
  });

  test('setDirector swaps atomically and keeps exactly one director', async () => {
    const t = convexTest(schema, modules);
    const owner = await addPlayer(t, 'owner@example.test', 'owner_user');
    const member = await addPlayer(t, 'member@example.test', 'member_user');
    const { campaignId, joinCode } = await makeCampaign(owner.client);
    await member.client.mutation(api.campaigns.requestToJoin, { code: joinCode });

    // Only an active member can take the screen.
    await expect(
      owner.client.mutation(api.campaigns.setDirector, {
        campaignId,
        targetUserId: member.userId,
      }),
    ).rejects.toThrow('active member');
    await owner.client.mutation(api.campaigns.approveRequest, {
      campaignId,
      targetUserId: member.userId,
    });
    await owner.client.mutation(api.campaigns.setDirector, {
      campaignId,
      targetUserId: member.userId,
    });

    const roster = await owner.client.query(api.campaigns.listRoster, { campaignId });
    const directors = roster.members.filter((entry) => entry.role === 'director');
    expect(directors).toEqual([expect.objectContaining({ userId: member.userId })]);
    expect(roster.members).toContainEqual(
      expect.objectContaining({ userId: owner.userId, role: 'player', isOwner: true }),
    );
  });

  test('the director leaving, being removed, or being blocked reverts the role to the owner', async () => {
    const t = convexTest(schema, modules);
    const owner = await addPlayer(t, 'owner@example.test', 'owner_user');
    const { campaignId, joinCode } = await makeCampaign(owner.client);

    const expectOwnerIsDirector = async () => {
      const roster = await owner.client.query(api.campaigns.listRoster, { campaignId });
      expect(roster.members.filter((entry) => entry.role === 'director')).toEqual([
        expect.objectContaining({ userId: owner.userId }),
      ]);
    };
    const join = async (who: { userId: Id<'users'>; client: Client }) => {
      await who.client.mutation(api.campaigns.requestToJoin, { code: joinCode });
      await owner.client.mutation(api.campaigns.approveRequest, {
        campaignId,
        targetUserId: who.userId,
      });
      await owner.client.mutation(api.campaigns.setDirector, {
        campaignId,
        targetUserId: who.userId,
      });
    };

    const leaver = await addPlayer(t, 'leaver@example.test', 'leaver_user');
    await join(leaver);
    await leaver.client.mutation(api.campaigns.leaveCampaign, { campaignId });
    await expectOwnerIsDirector();

    const removed = await addPlayer(t, 'removed@example.test', 'removed_user');
    await join(removed);
    await owner.client.mutation(api.campaigns.removeMember, {
      campaignId,
      targetUserId: removed.userId,
    });
    await expectOwnerIsDirector();

    const blocked = await addPlayer(t, 'blocked@example.test', 'blocked_user');
    await join(blocked);
    await owner.client.mutation(api.campaigns.blockUser, {
      campaignId,
      targetUserId: blocked.userId,
    });
    await expectOwnerIsDirector();
  });

  test('the owner cannot leave, be removed, or be blocked', async () => {
    const t = convexTest(schema, modules);
    const owner = await addPlayer(t, 'owner@example.test', 'owner_user');
    const { campaignId } = await makeCampaign(owner.client);

    await expect(
      owner.client.mutation(api.campaigns.leaveCampaign, { campaignId }),
    ).rejects.toThrow('owner cannot leave');
    await expect(
      owner.client.mutation(api.campaigns.removeMember, {
        campaignId,
        targetUserId: owner.userId,
      }),
    ).rejects.toThrow('owner cannot be removed');
    await expect(
      owner.client.mutation(api.campaigns.blockUser, { campaignId, targetUserId: owner.userId }),
    ).rejects.toThrow('owner cannot be blocked');
  });

  test('regenerating the join code kills the old code and link', async () => {
    const t = convexTest(schema, modules);
    const owner = await addPlayer(t, 'owner@example.test', 'owner_user');
    const joiner = await addPlayer(t, 'joiner@example.test', 'joiner_user');
    const { campaignId, joinCode: oldCode } = await makeCampaign(owner.client);

    const newCode = await owner.client.mutation(api.campaigns.regenerateJoinCode, { campaignId });
    expect(newCode).not.toBe(oldCode);
    await expect(
      joiner.client.query(api.campaigns.getJoinPreview, { code: oldCode }),
    ).rejects.toThrow('Campaign not found');
    expect(
      (await joiner.client.query(api.campaigns.getJoinPreview, { code: newCode })).campaignId,
    ).toBe(campaignId);
  });

  test('join-target resolution requires exactly one of code and campaignId', async () => {
    const t = convexTest(schema, modules);
    const owner = await addPlayer(t, 'owner@example.test', 'owner_user');
    const { campaignId, joinCode } = await makeCampaign(owner.client);
    await expect(owner.client.query(api.campaigns.getJoinPreview, {})).rejects.toThrow(
      'either a campaign or a join code',
    );
    await expect(
      owner.client.query(api.campaigns.getJoinPreview, { campaignId, code: joinCode }),
    ).rejects.toThrow('either a campaign or a join code');
  });
});
