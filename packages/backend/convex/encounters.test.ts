import { register as registerRateLimiter } from '@convex-dev/rate-limiter/test';
/// <reference types="vite/client" />
import { BLOOD_FOR_BLOOD } from '@engarde/canon/fixtures/blood-for-blood';
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

/** Real corpus ids only (prime directive). Class records carry neutral
 * placeholder text here (their prose plays no role in these tests); the
 * ability record is the committed checksum-pinned verbatim cut. */
const FURY = 'mcdm.heroes.v1/class/fury';
const CENSOR = 'mcdm.heroes.v1/class/censor';

async function seedRecords(t: Harness) {
  await t.run(async (ctx) => {
    for (const record of [
      { artifactId: FURY, slug: 'fury', text: 'x\n', textSha256: 'seeded-for-test' },
      { artifactId: CENSOR, slug: 'censor', text: 'x\n', textSha256: 'seeded-for-test' },
      {
        artifactId: BLOOD_FOR_BLOOD.artifactId,
        slug: BLOOD_FOR_BLOOD.slug,
        text: BLOOD_FOR_BLOOD.text,
        textSha256: BLOOD_FOR_BLOOD.textSha256,
      },
    ]) {
      await ctx.db.insert('canonRecords', record);
    }
  });
}

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

async function setupTable(t: Harness) {
  await seedRecords(t);
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
  const character = await owner.client.mutation(api.characters.create, {
    name: 'Nerevar',
    concept: '',
    campaignId,
  });
  await owner.client.mutation(api.sessions.start, {
    campaignId,
    characterIds: [character.characterId],
  });
  return { owner, member, campaignId };
}

const TRIO = [
  { id: 'fury', recordId: FURY },
  { id: 'censor', recordId: CENSOR },
];

describe('encounter host', () => {
  test('start is Director-gated, needs a session, and rejects unknown records', async () => {
    const t = makeHarness();
    await seedRecords(t);
    const owner = await addPlayer(t, 'owner@example.test', 'owner_user');
    const campaignId = await owner.client.mutation(api.campaigns.create, {
      name: 'Morrowind',
      description: '',
    });
    await expect(
      owner.client.mutation(api.encounters.start, { campaignId, participants: TRIO }),
    ).rejects.toThrow('Start a session before starting an encounter');

    const character = await owner.client.mutation(api.characters.create, {
      name: 'Nerevar',
      concept: '',
      campaignId,
    });
    await owner.client.mutation(api.sessions.start, {
      campaignId,
      characterIds: [character.characterId],
    });
    await expect(
      owner.client.mutation(api.encounters.start, {
        campaignId,
        participants: [{ id: 'ghost', recordId: 'mcdm.heroes.v1/class/not-a-record' }],
      }),
    ).rejects.toThrow('Unknown canon record');
    await owner.client.mutation(api.encounters.start, { campaignId, participants: TRIO });
    await expect(
      owner.client.mutation(api.encounters.start, { campaignId, participants: TRIO }),
    ).rejects.toThrow('An encounter is already running');
  });

  test('member (non-director) cannot start but can act; non-member sees nothing', async () => {
    const t = makeHarness();
    const table = await setupTable(t);
    await expect(
      table.member.client.mutation(api.encounters.start, {
        campaignId: table.campaignId,
        participants: TRIO,
      }),
    ).rejects.toThrow('Director access required');
    await table.owner.client.mutation(api.encounters.start, {
      campaignId: table.campaignId,
      participants: TRIO,
    });

    const outsider = await addPlayer(t, 'outsider@example.test', 'outsider_user');
    await expect(
      outsider.client.query(api.encounters.getActive, { campaignId: table.campaignId }),
    ).rejects.toThrow('Campaign not found');

    // The member plays the ability — permissive host, attribution recorded.
    await table.member.client.mutation(api.encounters.useAbility, {
      campaignId: table.campaignId,
      artifactId: BLOOD_FOR_BLOOD.artifactId,
      band: '17+',
      actorParticipantId: 'fury',
      targetParticipantId: 'censor',
    });
    const view = await table.member.client.query(api.encounters.getActive, {
      campaignId: table.campaignId,
    });
    const censor = view?.participants.find((participant) => participant.id === 'censor');
    expect(censor?.conditions.map((condition) => condition.conditionSlug).sort()).toEqual([
      'bleeding',
      'weakened',
    ]);
    expect(censor?.conditions.every((condition) => condition.ending === 'save-ends')).toBe(true);
    expect(censor?.conditions.every((condition) => condition.sourceParticipantId === 'fury')).toBe(
      true,
    );
  });

  test('useAbility compiles the verbatim text: state, receipts, and table card', async () => {
    const t = makeHarness();
    const table = await setupTable(t);
    await table.owner.client.mutation(api.encounters.start, {
      campaignId: table.campaignId,
      participants: TRIO,
    });
    await table.owner.client.mutation(api.encounters.useAbility, {
      campaignId: table.campaignId,
      artifactId: BLOOD_FOR_BLOOD.artifactId,
      band: '17+',
      actorParticipantId: 'fury',
      targetParticipantId: 'censor',
    });
    const view = await table.owner.client.query(api.encounters.getActive, {
      campaignId: table.campaignId,
    });
    if (!view) throw new Error('no active encounter');
    const log = await table.owner.client.query(api.encounters.listLog, {
      campaignId: table.campaignId,
      encounterId: view.encounterId,
    });
    const kinds = log.map((entry) => entry.kind);
    expect(kinds).toContain('mutation'); // conditions applied
    expect(kinds).toContain('not-automated'); // damage + potency receipts
    expect(kinds).toContain('table-card'); // the Effect line, verbatim
    expect(kinds).not.toContain('invariant-violation');
    const card = log.find((entry) => entry.kind === 'table-card');
    // The card is the record's own residue text, never authored by the host.
    expect(card && BLOOD_FOR_BLOOD.text.includes(card.message)).toBe(true);
    const notAutomated = log.filter((entry) => entry.kind === 'not-automated');
    expect(notAutomated.some((entry) => entry.message.startsWith('damage:'))).toBe(true);
    expect(notAutomated.some((entry) => entry.message.startsWith('potency:'))).toBe(true);

    await expect(
      table.owner.client.mutation(api.encounters.useAbility, {
        campaignId: table.campaignId,
        artifactId: FURY, // neutral text: nothing parses
        band: '17+',
        actorParticipantId: 'fury',
        targetParticipantId: 'censor',
      }),
    ).rejects.toThrow('No parsed tier outcome');
  });

  test('end-turn saves (asserted and auto), removal authz, and Director end', async () => {
    const t = makeHarness();
    const table = await setupTable(t);
    await table.owner.client.mutation(api.encounters.start, {
      campaignId: table.campaignId,
      participants: TRIO,
    });
    await table.owner.client.mutation(api.encounters.useAbility, {
      campaignId: table.campaignId,
      artifactId: BLOOD_FOR_BLOOD.artifactId,
      band: '17+',
      actorParticipantId: 'fury',
      targetParticipantId: 'censor',
    });
    const before = await table.owner.client.query(api.encounters.getActive, {
      campaignId: table.campaignId,
    });
    const conditions = before?.participants.find((p) => p.id === 'censor')?.conditions ?? [];
    const weakened = conditions.find((c) => c.conditionSlug === 'weakened');
    const bleeding = conditions.find((c) => c.conditionSlug === 'bleeding');
    if (!weakened || !bleeding) throw new Error('conditions missing');

    // Asserted rolls: save off weakened (7), fail bleeding (2).
    await table.owner.client.mutation(api.encounters.endTurn, {
      campaignId: table.campaignId,
      participantId: 'censor',
      rolls: { [weakened.instanceId]: 7, [bleeding.instanceId]: 2 },
    });
    const after = await table.owner.client.query(api.encounters.getActive, {
      campaignId: table.campaignId,
    });
    const remaining = after?.participants.find((p) => p.id === 'censor')?.conditions ?? [];
    expect(remaining.map((c) => c.conditionSlug)).toEqual(['bleeding']);

    // A member removing without naming an acting participant is refused;
    // naming the imposer works.
    await expect(
      table.member.client.mutation(api.encounters.removeCondition, {
        campaignId: table.campaignId,
        targetParticipantId: 'censor',
        instanceId: bleeding.instanceId,
      }),
    ).rejects.toThrow('Name the participant acting');
    await table.member.client.mutation(api.encounters.removeCondition, {
      campaignId: table.campaignId,
      targetParticipantId: 'censor',
      instanceId: bleeding.instanceId,
      asParticipantId: 'fury',
      reason: 'imposer ends their ability effect',
    });

    await expect(
      table.member.client.mutation(api.encounters.endEncounter, {
        campaignId: table.campaignId,
      }),
    ).rejects.toThrow('Director access required');
    await table.owner.client.mutation(api.encounters.endEncounter, {
      campaignId: table.campaignId,
    });
    const ended = await table.owner.client.query(api.encounters.getActive, {
      campaignId: table.campaignId,
    });
    expect(ended).toBeNull();
  });

  test('searchRecords finds seeded records and reports parsed tiers', async () => {
    const t = makeHarness();
    const table = await setupTable(t);
    const hits = await table.member.client.query(api.encounters.searchRecords, {
      campaignId: table.campaignId,
      term: 'blood-for-blood',
    });
    const hit = hits.find((entry) => entry.artifactId === BLOOD_FOR_BLOOD.artifactId);
    expect(hit?.parsedTiers).toEqual(['≤11', '12-16', '17+']);
    expect(hit && hit.residueSpans > 0).toBe(true);
  });
});
