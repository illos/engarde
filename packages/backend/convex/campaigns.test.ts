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

async function makeCampaign(client: Client, name = 'The Iron Vow') {
  const campaignId = await client.mutation(api.campaigns.create, {
    name,
    description: 'A campaign of oaths and consequences',
  });
  const settings = await client.query(api.campaigns.getSettings, { campaignId });
  return { campaignId, joinCode: settings.joinCode };
}

async function previewByCode(client: Client, code: string) {
  const result = await client.mutation(api.campaigns.previewJoinCode, { code });
  return result.status === 'found' ? result.preview : null;
}

const FIRST_PAGE = { paginationOpts: { numItems: 20, cursor: null } };

describe('campaigns', () => {
  test('rejects unauthenticated and profile-less callers', async () => {
    const t = makeHarness();
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
    const t = makeHarness();
    const owner = await addPlayer(t, 'owner@example.test', 'owner_user');
    const { campaignId, joinCode } = await makeCampaign(owner.client);

    expect(joinCode).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    const settings = await owner.client.query(api.campaigns.getSettings, { campaignId });
    expect(settings.visibility).toBe('private');

    const cards = await owner.client.query(api.campaigns.listMine, {});
    expect(cards).toEqual([
      expect.objectContaining({
        campaignId,
        status: 'active',
        gameRole: 'director',
        campaignAccess: 'admin',
        isOwner: true,
      }),
    ]);
    const roster = await owner.client.query(api.campaigns.listRoster, { campaignId });
    expect(roster.viewer).toEqual({
      gameRole: 'director',
      campaignAccess: 'admin',
      isOwner: true,
      canAdminister: true,
    });
    expect(roster.members).toEqual([
      expect.objectContaining({ userId: owner.userId, gameRole: 'director', isOwner: true }),
    ]);
    expect(roster.pending).toEqual([]);
    expect(roster.blocked).toEqual([]);
    expect(roster).not.toHaveProperty('joinCode');
    expect(roster.members[0]).not.toHaveProperty('joinCode');
  });

  test('code reaches a private campaign; its ID does not; public opens the ID and directory routes', async () => {
    const t = makeHarness();
    const owner = await addPlayer(t, 'owner@example.test', 'owner_user');
    const joiner = await addPlayer(t, 'joiner@example.test', 'joiner_user');
    const { campaignId, joinCode } = await makeCampaign(owner.client);

    const byCode = await previewByCode(joiner.client, ` ${joinCode.toLowerCase()} `);
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
    const t = makeHarness();
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
      expect.objectContaining({ userId: joiner.userId, gameRole: 'player', isOwner: false }),
    );
    expect(await joiner.client.mutation(api.campaigns.requestToJoin, { code: joinCode })).toBe(
      'active',
    );
  });

  test('deny deletes the request and allows a fresh one', async () => {
    const t = makeHarness();
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
    const t = makeHarness();
    const owner = await addPlayer(t, 'owner@example.test', 'owner_user');
    const joiner = await addPlayer(t, 'joiner@example.test', 'joiner_user');
    const { campaignId, joinCode } = await makeCampaign(owner.client);

    await joiner.client.mutation(api.campaigns.requestToJoin, { code: joinCode });
    await owner.client.mutation(api.campaigns.blockUser, {
      campaignId,
      targetUserId: joiner.userId,
    });

    // No special state on the join screen or the campaigns list...
    expect((await previewByCode(joiner.client, joinCode))?.viewerStatus).toBe('none');
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
    const t = makeHarness();
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
        member.client.mutation(api.campaigns.setJoinability, { campaignId, joinability: 'closed' }),
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
    expect(memberView.viewer).toEqual({
      gameRole: 'player',
      campaignAccess: 'user',
      isOwner: false,
      canAdminister: false,
    });
    expect(memberView.pending).toBeUndefined();
    expect(memberView.blocked).toBeUndefined();
    await expect(outsider.client.query(api.campaigns.listRoster, { campaignId })).rejects.toThrow(
      'Campaign not found',
    );
  });

  test('setDirector swaps atomically and keeps exactly one director', async () => {
    const t = makeHarness();
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
    const directors = roster.members.filter((entry) => entry.gameRole === 'director');
    expect(directors).toEqual([expect.objectContaining({ userId: member.userId })]);
    expect(roster.members).toContainEqual(
      expect.objectContaining({ userId: owner.userId, gameRole: 'player', isOwner: true }),
    );

    // The owner is an active member like any other: they can take it back.
    await owner.client.mutation(api.campaigns.setDirector, {
      campaignId,
      targetUserId: owner.userId,
    });
    const reclaimed = await owner.client.query(api.campaigns.listRoster, { campaignId });
    expect(reclaimed.members.filter((entry) => entry.gameRole === 'director')).toEqual([
      expect.objectContaining({ userId: owner.userId }),
    ]);
  });

  test('the director leaving, being removed, or being blocked reverts the role to the owner', async () => {
    const t = makeHarness();
    const owner = await addPlayer(t, 'owner@example.test', 'owner_user');
    const { campaignId, joinCode } = await makeCampaign(owner.client);

    const expectOwnerIsDirector = async () => {
      const roster = await owner.client.query(api.campaigns.listRoster, { campaignId });
      expect(roster.members.filter((entry) => entry.gameRole === 'director')).toEqual([
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
    const t = makeHarness();
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
    const t = makeHarness();
    const owner = await addPlayer(t, 'owner@example.test', 'owner_user');
    const joiner = await addPlayer(t, 'joiner@example.test', 'joiner_user');
    const { campaignId, joinCode: oldCode } = await makeCampaign(owner.client);

    const newCode = await owner.client.mutation(api.campaigns.regenerateJoinCode, { campaignId });
    expect(newCode).not.toBe(oldCode);
    expect(await previewByCode(joiner.client, oldCode)).toBeNull();
    expect((await previewByCode(joiner.client, newCode))?.campaignId).toBe(campaignId);
  });

  test('closing joinability disables all three routes, hides nothing else, and is reversible', async () => {
    const t = makeHarness();
    const owner = await addPlayer(t, 'owner@example.test', 'owner_user');
    const early = await addPlayer(t, 'early@example.test', 'early_user');
    const late = await addPlayer(t, 'late@example.test', 'late_user');
    const blocked = await addPlayer(t, 'blocked@example.test', 'blocked_user');
    const { campaignId, joinCode } = await makeCampaign(owner.client);
    await owner.client.mutation(api.campaigns.setVisibility, { campaignId, visibility: 'public' });

    expect((await owner.client.query(api.campaigns.getSettings, { campaignId })).joinability).toBe(
      'open',
    );
    await early.client.mutation(api.campaigns.requestToJoin, { code: joinCode });
    await blocked.client.mutation(api.campaigns.requestToJoin, { code: joinCode });
    await owner.client.mutation(api.campaigns.blockUser, {
      campaignId,
      targetUserId: blocked.userId,
    });

    await owner.client.mutation(api.campaigns.setJoinability, {
      campaignId,
      joinability: 'closed',
    });

    // Both request routes refuse with the closed message — including for the
    // blocked user, who stays indistinguishable from anyone else.
    await expect(
      late.client.mutation(api.campaigns.requestToJoin, { code: joinCode }),
    ).rejects.toThrow('not accepting new members');
    await expect(late.client.mutation(api.campaigns.requestToJoin, { campaignId })).rejects.toThrow(
      'not accepting new members',
    );
    await expect(
      blocked.client.mutation(api.campaigns.requestToJoin, { code: joinCode }),
    ).rejects.toThrow('not accepting new members');

    // The preview still resolves (grayed in the UI, not hidden) and carries
    // the flag; the pre-existing pending request survives and is approvable.
    const previewClosed = await previewByCode(late.client, joinCode);
    expect(previewClosed?.joinability).toBe('closed');
    await owner.client.mutation(api.campaigns.approveRequest, {
      campaignId,
      targetUserId: early.userId,
    });

    await owner.client.mutation(api.campaigns.setJoinability, { campaignId, joinability: 'open' });
    expect(await late.client.mutation(api.campaigns.requestToJoin, { code: joinCode })).toBe(
      'pending',
    );
  });

  test('memberCount stays transactionally consistent through the roster lifecycle', async () => {
    const t = makeHarness();
    const owner = await addPlayer(t, 'owner@example.test', 'owner_user');
    const alpha = await addPlayer(t, 'alpha@example.test', 'alpha_user');
    const beta = await addPlayer(t, 'beta@example.test', 'beta_user');
    const { campaignId, joinCode } = await makeCampaign(owner.client);

    const count = async () =>
      (await owner.client.query(api.campaigns.getJoinPreview, { campaignId })).memberCount;
    const join = async (who: { userId: Id<'users'>; client: Client }) => {
      await who.client.mutation(api.campaigns.requestToJoin, { code: joinCode });
      await owner.client.mutation(api.campaigns.approveRequest, {
        campaignId,
        targetUserId: who.userId,
      });
    };

    expect(await count()).toBe(1);
    await join(alpha);
    await join(beta);
    expect(await count()).toBe(3);
    await t.run(async (ctx) => {
      await ctx.db.patch(campaignId, { memberCount: 999 });
    });
    await alpha.client.mutation(api.campaigns.leaveCampaign, { campaignId });
    expect(await count()).toBe(2);
    await owner.client.mutation(api.campaigns.blockUser, {
      campaignId,
      targetUserId: beta.userId,
    });
    expect(await count()).toBe(1);
    await owner.client.mutation(api.campaigns.unblockUser, {
      campaignId,
      targetUserId: beta.userId,
    });
    await join(beta);
    expect(await count()).toBe(2);
    await owner.client.mutation(api.campaigns.removeMember, {
      campaignId,
      targetUserId: beta.userId,
    });
    expect(await count()).toBe(1);
  });

  test('creation and pending-request ceilings bound abuse', async () => {
    const t = makeHarness();
    const owner = await addPlayer(t, 'owner@example.test', 'owner_user');
    const joiner = await addPlayer(t, 'joiner@example.test', 'joiner_user');

    const codes: string[] = [];
    for (let i = 0; i < 20; i++) {
      const { joinCode } = await makeCampaign(owner.client, `Campaign ${i}`);
      codes.push(joinCode);
    }
    await expect(
      owner.client.mutation(api.campaigns.create, { name: 'One too many', description: '' }),
    ).rejects.toThrow('already own');

    for (const code of codes.slice(0, 10)) {
      await joiner.client.mutation(api.campaigns.requestToJoin, { code });
    }
    await expect(
      joiner.client.mutation(api.campaigns.requestToJoin, { code: codes[10] }),
    ).rejects.toThrow('pending join requests');

    const cards = await joiner.client.query(api.campaigns.listMine, {});
    const cancelTarget = cards.find((card) => card.status === 'pending');
    if (!cancelTarget) throw new Error('expected a pending card');
    await joiner.client.mutation(api.campaigns.cancelJoinRequest, {
      campaignId: cancelTarget.campaignId,
    });
    expect(await joiner.client.mutation(api.campaigns.requestToJoin, { code: codes[10] })).toBe(
      'pending',
    );
  });

  test('a campaign pending-request ceiling bounds moderation reads and rejects overflow', async () => {
    const t = makeHarness();
    const owner = await addPlayer(t, 'owner@example.test', 'owner_user');
    const overflow = await addPlayer(t, 'overflow@example.test', 'overflow_user');
    const { campaignId, joinCode } = await makeCampaign(owner.client);

    await t.run(async (ctx) => {
      const now = Date.now();
      for (let index = 0; index < 100; index++) {
        const userId = await ctx.db.insert('users', {
          email: `pending-${index}@example.test`,
          emailVerificationTime: now,
        });
        await ctx.db.insert('profiles', {
          userId,
          displayName: `Pending ${index}`,
          handle: `pending_${index}`,
          handleNormalized: `pending_${index}`,
          lifecycle: 'active',
          onboardingCompletedAt: now,
          createdAt: now,
          updatedAt: now,
        });
        await ctx.db.insert('campaignMemberships', {
          campaignId,
          userId,
          status: 'pending',
          campaignAccess: 'user',
          gameRole: 'player',
          requestedAt: now + index,
          updatedAt: now + index,
        });
      }
    });

    const roster = await owner.client.query(api.campaigns.listRoster, { campaignId });
    expect(roster.pending).toHaveLength(100);
    await expect(
      overflow.client.mutation(api.campaigns.requestToJoin, { code: joinCode }),
    ).rejects.toThrow('too many pending join requests');
  });

  test('active campaign limits bound listMine and prevent new activation paths', async () => {
    const t = makeHarness();
    const owner = await addPlayer(t, 'owner@example.test', 'owner_user');
    const member = await addPlayer(t, 'member@example.test', 'member_user');
    const target = await makeCampaign(owner.client, 'Target campaign');
    await member.client.mutation(api.campaigns.requestToJoin, { code: target.joinCode });

    await t.run(async (ctx) => {
      const now = Date.now();
      for (let index = 0; index < 105; index++) {
        const campaignId = await ctx.db.insert('campaigns', {
          name: `Seeded ${index}`,
          description: '',
          ownerId: owner.userId,
          visibility: 'private',
          joinability: 'open',
          joinCode: `SEED${String(index).padStart(4, '0')}`,
          joinCodeRotatedAt: now,
          memberCount: 1,
          createdAt: now + index,
          updatedAt: now + index,
        });
        await ctx.db.insert('campaignMemberships', {
          campaignId,
          userId: member.userId,
          status: 'active',
          campaignAccess: 'user',
          gameRole: 'player',
          requestedAt: now + index,
          joinedAt: now + index,
          updatedAt: now + index,
        });
      }
    });

    const cards = await member.client.query(api.campaigns.listMine, {});
    expect(cards.filter((card) => card.status === 'active')).toHaveLength(100);
    expect(cards.filter((card) => card.status === 'pending')).toHaveLength(1);
    await expect(
      member.client.mutation(api.campaigns.create, { name: 'Over limit', description: '' }),
    ).rejects.toThrow('active campaigns');
    await expect(
      owner.client.mutation(api.campaigns.approveRequest, {
        campaignId: target.campaignId,
        targetUserId: member.userId,
      }),
    ).rejects.toThrow('active campaign limit');
  });

  test('join-code previews and join requests are throttled per authenticated user', async () => {
    const t = makeHarness();
    const owner = await addPlayer(t, 'owner@example.test', 'owner_user');
    const joiner = await addPlayer(t, 'joiner@example.test', 'joiner_user');
    const peer = await addPlayer(t, 'peer@example.test', 'peer_user');
    const { joinCode } = await makeCampaign(owner.client);

    for (let attempt = 0; attempt < 20; attempt++) {
      await expect(previewByCode(joiner.client, 'WRONGCOD')).resolves.toBeNull();
    }
    await expect(previewByCode(joiner.client, 'WRONGCOD')).rejects.toThrow(
      'Too many join-code attempts',
    );
    await expect(previewByCode(peer.client, joinCode)).resolves.toMatchObject({
      name: 'The Iron Vow',
    });

    for (let attempt = 0; attempt < 30; attempt++) {
      await expect(
        peer.client.mutation(api.campaigns.requestToJoin, { code: joinCode }),
      ).resolves.toBe('pending');
    }
    await expect(
      peer.client.mutation(api.campaigns.requestToJoin, { code: joinCode }),
    ).rejects.toThrow('Too many join requests');
  });

  test('join requests require exactly one of code and campaignId', async () => {
    const t = makeHarness();
    const owner = await addPlayer(t, 'owner@example.test', 'owner_user');
    const { campaignId, joinCode } = await makeCampaign(owner.client);
    await expect(owner.client.mutation(api.campaigns.requestToJoin, {})).rejects.toThrow(
      'either a campaign or a join code',
    );
    await expect(
      owner.client.mutation(api.campaigns.requestToJoin, { campaignId, code: joinCode }),
    ).rejects.toThrow('either a campaign or a join code');
  });

  test('campaign admin and Director are independent, with owner-only admin delegation', async () => {
    const t = makeHarness();
    const owner = await addPlayer(t, 'owner@example.test', 'owner_user');
    const admin = await addPlayer(t, 'admin@example.test', 'admin_user');
    const joiner = await addPlayer(t, 'joiner@example.test', 'joiner_user');
    const { campaignId, joinCode } = await makeCampaign(owner.client);
    await admin.client.mutation(api.campaigns.requestToJoin, { code: joinCode });
    await owner.client.mutation(api.campaigns.approveRequest, {
      campaignId,
      targetUserId: admin.userId,
    });
    await owner.client.mutation(api.campaigns.setCampaignAccess, {
      campaignId,
      targetUserId: admin.userId,
      campaignAccess: 'admin',
    });

    let roster = await admin.client.query(api.campaigns.listRoster, { campaignId });
    expect(roster.viewer).toMatchObject({
      campaignAccess: 'admin',
      gameRole: 'player',
      canAdminister: true,
    });
    await joiner.client.mutation(api.campaigns.requestToJoin, { code: joinCode });
    await admin.client.mutation(api.campaigns.approveRequest, {
      campaignId,
      targetUserId: joiner.userId,
    });
    await admin.client.mutation(api.campaigns.setDirector, {
      campaignId,
      targetUserId: joiner.userId,
    });
    roster = await admin.client.query(api.campaigns.listRoster, { campaignId });
    expect(roster.members).toContainEqual(
      expect.objectContaining({
        userId: admin.userId,
        campaignAccess: 'admin',
        gameRole: 'player',
      }),
    );
    expect(roster.members).toContainEqual(
      expect.objectContaining({
        userId: joiner.userId,
        campaignAccess: 'user',
        gameRole: 'director',
      }),
    );
    await expect(
      admin.client.mutation(api.campaigns.setCampaignAccess, {
        campaignId,
        targetUserId: joiner.userId,
        campaignAccess: 'admin',
      }),
    ).rejects.toThrow('Campaign not found');
    await expect(
      admin.client.mutation(api.campaigns.removeMember, {
        campaignId,
        targetUserId: owner.userId,
      }),
    ).rejects.toThrow('owner cannot be removed');

    await owner.client.mutation(api.campaigns.setCampaignAccess, {
      campaignId,
      targetUserId: admin.userId,
      campaignAccess: 'user',
    });
    await expect(admin.client.query(api.campaigns.getSettings, { campaignId })).rejects.toThrow(
      'Campaign not found',
    );
  });
});
