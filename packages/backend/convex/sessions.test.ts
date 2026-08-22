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

async function addPlayer(t: Harness, email: string, handle: string) {
  const userId: Id<'users'> = await t.run(async (ctx) =>
    ctx.db.insert('users', { email, emailVerificationTime: Date.now() }),
  );
  const client = t.withIdentity({
    subject: `${userId}|test-session`,
    tokenIdentifier: `test|${userId}`,
  });
  await client.mutation(api.profiles.completeOnboarding, { displayName: handle, handle });
  return { userId, client };
}

async function setupCampaign(t: Harness) {
  const owner = await addPlayer(t, 'owner@example.test', 'owner_user');
  const member = await addPlayer(t, 'member@example.test', 'member_user');
  const campaignId = await owner.client.mutation(api.campaigns.create, {
    name: 'Morrowind',
    description: '',
  });
  const { joinCode } = await owner.client.query(api.campaigns.getSettings, { campaignId });
  await member.client.mutation(api.campaigns.requestToJoin, { code: joinCode });
  await owner.client.mutation(api.campaigns.approveRequest, {
    campaignId,
    targetUserId: member.userId,
  });
  const ownerCharacter = await owner.client.mutation(api.characters.create, {
    name: 'Nerevar',
    concept: '',
    campaignId,
  });
  const memberCharacter = await member.client.mutation(api.characters.create, {
    name: 'Jiub',
    concept: '',
    campaignId,
  });
  await owner.client.mutation(api.characters.approve, {
    campaignId,
    characterId: memberCharacter.characterId,
  });
  return {
    owner,
    member,
    campaignId,
    ownerCharacterId: ownerCharacter.characterId,
    memberCharacterId: memberCharacter.characterId,
  };
}

describe('session runtime', () => {
  test('starts from a durable character roster and never regenerates the resource basis', async () => {
    const t = makeHarness();
    const setup = await setupCampaign(t);
    await expect(
      setup.member.client.mutation(api.sessions.start, {
        campaignId: setup.campaignId,
        characterIds: [setup.memberCharacterId],
      }),
    ).rejects.toThrow('Director access required');
    await setup.owner.client.mutation(api.sessions.start, {
      campaignId: setup.campaignId,
      characterIds: [setup.ownerCharacterId],
    });
    const started = await setup.owner.client.query(api.sessions.getActive, {
      campaignId: setup.campaignId,
    });
    expect(started?.number).toBe(1);
    expect(started?.resources).toMatchObject({ basisCharacterCount: 1, basisLevelTotal: 1 });
    expect(started?.roster).toEqual([
      expect.objectContaining({
        characterId: setup.ownerCharacterId,
        name: 'Nerevar',
        initial: true,
      }),
    ]);

    await setup.owner.client.mutation(api.sessions.addCharacter, {
      campaignId: setup.campaignId,
      characterId: setup.memberCharacterId,
    });
    await setup.owner.client.mutation(api.sessions.removeCharacter, {
      campaignId: setup.campaignId,
      characterId: setup.ownerCharacterId,
    });
    const changed = await setup.owner.client.query(api.sessions.getActive, {
      campaignId: setup.campaignId,
    });
    expect(changed?.roster).toEqual([
      expect.objectContaining({ characterId: setup.memberCharacterId, initial: false }),
    ]);
    expect(changed?.resources).toEqual(started?.resources);
  });

  test('a live Director handoff changes authority without changing the session', async () => {
    const t = makeHarness();
    const setup = await setupCampaign(t);
    const sessionId = await setup.owner.client.mutation(api.sessions.start, {
      campaignId: setup.campaignId,
      characterIds: [setup.ownerCharacterId],
    });
    await setup.owner.client.mutation(api.campaigns.setDirector, {
      campaignId: setup.campaignId,
      targetUserId: setup.member.userId,
    });
    await expect(
      setup.owner.client.mutation(api.sessions.end, { campaignId: setup.campaignId }),
    ).rejects.toThrow('Director access required');
    const active = await setup.member.client.query(api.sessions.getActive, {
      campaignId: setup.campaignId,
    });
    expect(active?.sessionId).toBe(sessionId);
    expect(active?.viewer.isDirector).toBe(true);
    expect(active?.roster[0]?.canControl).toBe(true);
    await setup.member.client.mutation(api.sessions.end, { campaignId: setup.campaignId });
    expect(
      await setup.owner.client.query(api.sessions.getActive, { campaignId: setup.campaignId }),
    ).toBeNull();
  });

  test('lists completed sessions newest first without including the active session', async () => {
    const t = makeHarness();
    const setup = await setupCampaign(t);
    const firstSessionId = await setup.owner.client.mutation(api.sessions.start, {
      campaignId: setup.campaignId,
      characterIds: [setup.ownerCharacterId],
    });
    await setup.owner.client.mutation(api.sessions.end, { campaignId: setup.campaignId });
    const secondSessionId = await setup.owner.client.mutation(api.sessions.start, {
      campaignId: setup.campaignId,
      characterIds: [setup.memberCharacterId],
    });

    expect(
      await setup.member.client.query(api.sessions.listHistory, {
        campaignId: setup.campaignId,
      }),
    ).toEqual([expect.objectContaining({ sessionId: firstSessionId, number: 1 })]);

    await setup.owner.client.mutation(api.sessions.end, { campaignId: setup.campaignId });
    const history = await setup.member.client.query(api.sessions.listHistory, {
      campaignId: setup.campaignId,
    });
    expect(history).toEqual([
      expect.objectContaining({ sessionId: secondSessionId, number: 2 }),
      expect.objectContaining({ sessionId: firstSessionId, number: 1 }),
    ]);
    expect(history.every((session) => session.endedAt >= session.startedAt)).toBe(true);
  });

  test('control requires acceptance; session grants expire and persistent grants follow only the binding', async () => {
    const t = makeHarness();
    const setup = await setupCampaign(t);
    await setup.owner.client.mutation(api.sessions.start, {
      campaignId: setup.campaignId,
      characterIds: [setup.ownerCharacterId],
    });
    const sessionGrantId = await setup.owner.client.mutation(api.sessions.offerControl, {
      characterId: setup.ownerCharacterId,
      granteeUserId: setup.member.userId,
      scope: 'session',
    });
    let memberView = await setup.member.client.query(api.sessions.getActive, {
      campaignId: setup.campaignId,
    });
    expect(memberView?.roster[0]?.canControl).toBe(false);
    await setup.member.client.mutation(api.sessions.respondToControl, {
      grantId: sessionGrantId,
      accept: true,
    });
    memberView = await setup.member.client.query(api.sessions.getActive, {
      campaignId: setup.campaignId,
    });
    expect(memberView?.roster[0]?.canControl).toBe(true);
    await setup.owner.client.mutation(api.sessions.end, { campaignId: setup.campaignId });
    expect(
      (
        await setup.member.client.query(api.sessions.listControlGrants, {
          campaignId: setup.campaignId,
        })
      )[0]?.status,
    ).toBe('expired');

    const persistentGrantId = await setup.owner.client.mutation(api.sessions.offerControl, {
      characterId: setup.ownerCharacterId,
      granteeUserId: setup.member.userId,
      scope: 'persistent',
    });
    await setup.member.client.mutation(api.sessions.respondToControl, {
      grantId: persistentGrantId,
      accept: true,
    });
    await setup.owner.client.mutation(api.sessions.start, {
      campaignId: setup.campaignId,
      characterIds: [setup.ownerCharacterId],
    });
    memberView = await setup.member.client.query(api.sessions.getActive, {
      campaignId: setup.campaignId,
    });
    expect(memberView?.roster[0]?.canControl).toBe(true);
    await setup.owner.client.mutation(api.characters.removeFromCampaign, {
      characterId: setup.ownerCharacterId,
    });
    memberView = await setup.member.client.query(api.sessions.getActive, {
      campaignId: setup.campaignId,
    });
    expect(memberView?.roster).toEqual([]);
    const persistent = (
      await setup.member.client.query(api.sessions.listControlGrants, {
        campaignId: setup.campaignId,
      })
    ).find((grant) => grant.grantId === persistentGrantId);
    expect(persistent?.status).toBe('expired');
  });

  test('expires grants received by a member before leave and rejoin', async () => {
    const t = makeHarness();
    const setup = await setupCampaign(t);
    const grantId = await setup.owner.client.mutation(api.sessions.offerControl, {
      characterId: setup.ownerCharacterId,
      granteeUserId: setup.member.userId,
      scope: 'persistent',
    });
    await setup.member.client.mutation(api.sessions.respondToControl, {
      grantId,
      accept: true,
    });

    await setup.member.client.mutation(api.campaigns.leaveCampaign, {
      campaignId: setup.campaignId,
    });
    const { joinCode } = await setup.owner.client.query(api.campaigns.getSettings, {
      campaignId: setup.campaignId,
    });
    await setup.member.client.mutation(api.campaigns.requestToJoin, { code: joinCode });
    await setup.owner.client.mutation(api.campaigns.approveRequest, {
      campaignId: setup.campaignId,
      targetUserId: setup.member.userId,
    });
    await setup.owner.client.mutation(api.sessions.start, {
      campaignId: setup.campaignId,
      characterIds: [setup.ownerCharacterId],
    });

    const memberView = await setup.member.client.query(api.sessions.getActive, {
      campaignId: setup.campaignId,
    });
    expect(memberView?.roster[0]?.canControl).toBe(false);
    expect(await t.run(async (ctx) => (await ctx.db.get(grantId))?.status)).toBe('expired');
  });

  test('historical grants cannot hide a fresh accepted persistent grant from authz, listing, or binding cleanup', async () => {
    const t = makeHarness();
    const setup = await setupCampaign(t);
    const bindingId = await t.run(async (ctx) => {
      const binding = await ctx.db
        .query('characterCampaignBindings')
        .withIndex('by_characterId', (q) => q.eq('characterId', setup.ownerCharacterId))
        .unique();
      if (!binding) throw new Error('Expected owner character binding');
      for (let index = 0; index < 200; index++) {
        await ctx.db.insert('characterControlGrants', {
          campaignId: setup.campaignId,
          characterId: setup.ownerCharacterId,
          bindingId: binding._id,
          grantorUserId: setup.owner.userId,
          granteeUserId: setup.member.userId,
          scope: 'persistent',
          status: 'declined',
          offeredAt: index,
          respondedAt: index,
          updatedAt: index,
        });
      }
      return binding._id;
    });
    const grantId = await setup.owner.client.mutation(api.sessions.offerControl, {
      characterId: setup.ownerCharacterId,
      granteeUserId: setup.member.userId,
      scope: 'persistent',
    });
    await setup.member.client.mutation(api.sessions.respondToControl, {
      grantId,
      accept: true,
    });
    await setup.owner.client.mutation(api.sessions.start, {
      campaignId: setup.campaignId,
      characterIds: [setup.ownerCharacterId],
    });

    const memberView = await setup.member.client.query(api.sessions.getActive, {
      campaignId: setup.campaignId,
    });
    expect(memberView?.roster[0]).toMatchObject({ bindingId, canControl: true });
    expect(
      await setup.member.client.query(api.sessions.listControlGrants, {
        campaignId: setup.campaignId,
      }),
    ).toContainEqual(expect.objectContaining({ grantId, status: 'accepted' }));

    await setup.owner.client.mutation(api.characters.removeFromCampaign, {
      characterId: setup.ownerCharacterId,
    });
    expect(await t.run(async (ctx) => (await ctx.db.get(grantId))?.status)).toBe('expired');
  });

  test('historical session grants cannot prevent a fresh grant from expiring when the session ends', async () => {
    const t = makeHarness();
    const setup = await setupCampaign(t);
    const sessionId = await setup.owner.client.mutation(api.sessions.start, {
      campaignId: setup.campaignId,
      characterIds: [setup.ownerCharacterId],
    });
    await t.run(async (ctx) => {
      const binding = await ctx.db
        .query('characterCampaignBindings')
        .withIndex('by_characterId', (q) => q.eq('characterId', setup.ownerCharacterId))
        .unique();
      if (!binding) throw new Error('Expected owner character binding');
      for (let index = 0; index < 200; index++) {
        await ctx.db.insert('characterControlGrants', {
          campaignId: setup.campaignId,
          characterId: setup.ownerCharacterId,
          bindingId: binding._id,
          grantorUserId: setup.owner.userId,
          granteeUserId: setup.member.userId,
          scope: 'session',
          sessionId,
          status: 'declined',
          offeredAt: index,
          respondedAt: index,
          updatedAt: index,
        });
      }
    });
    const grantId = await setup.owner.client.mutation(api.sessions.offerControl, {
      characterId: setup.ownerCharacterId,
      granteeUserId: setup.member.userId,
      scope: 'session',
    });
    await setup.member.client.mutation(api.sessions.respondToControl, {
      grantId,
      accept: true,
    });

    await setup.owner.client.mutation(api.sessions.end, { campaignId: setup.campaignId });
    expect(await t.run(async (ctx) => (await ctx.db.get(grantId))?.status)).toBe('expired');
  });
});
