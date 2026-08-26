/// <reference types="vite/client" />
import { register as registerRateLimiter } from '@convex-dev/rate-limiter/test';
import { BLOOD_FOR_BLOOD } from '@engarde/canon/fixtures/blood-for-blood';
import { DEVIL_ADJUDICATOR } from '@engarde/canon/fixtures/devil-adjudicator';
import { GOBLIN_SPINECLEAVER } from '@engarde/canon/fixtures/goblin-spinecleaver';
import { GOBLIN_WARRIOR } from '@engarde/canon/fixtures/goblin-warrior';
import { SKITTERLING } from '@engarde/canon/fixtures/skitterling';
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';
import {
  GOBLIN_MONARCH,
  HEALING_GRACE,
  KOBOLD_SIGNIFER,
  WAR_DOG_AEROCITE,
} from './verbatimFixtures';

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
const WODE_SENTRY = 'mcdm.monsters.v1/monster.elf-wode.statblock/wode-elf-sentry';
const WODE_EFFECT_TEXT =
  '> **Effect:** Allies gain an edge on abilities against a target marked by any wode elf.\n> **Effect:** Each target takes 3 damage.\n';

/** Web Crypto (the edge-runtime test environment has no Node builtins). */
async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function seedRecords(t: Harness) {
  await t.run(async (ctx) => {
    for (const record of [
      { artifactId: FURY, slug: 'fury', text: 'x\n', textSha256: await sha256('x\n') },
      { artifactId: CENSOR, slug: 'censor', text: 'x\n', textSha256: await sha256('x\n') },
      {
        artifactId: BLOOD_FOR_BLOOD.artifactId,
        slug: BLOOD_FOR_BLOOD.slug,
        text: BLOOD_FOR_BLOOD.text,
        textSha256: BLOOD_FOR_BLOOD.textSha256,
      },
      {
        artifactId: GOBLIN_WARRIOR.artifactId,
        slug: GOBLIN_WARRIOR.slug,
        text: GOBLIN_WARRIOR.text,
        textSha256: GOBLIN_WARRIOR.textSha256,
        statsJson: GOBLIN_WARRIOR.statsJson,
      },
      {
        artifactId: DEVIL_ADJUDICATOR.artifactId,
        slug: DEVIL_ADJUDICATOR.slug,
        text: DEVIL_ADJUDICATOR.text,
        textSha256: DEVIL_ADJUDICATOR.textSha256,
        statsJson: DEVIL_ADJUDICATOR.statsJson,
      },
      {
        artifactId: SKITTERLING.artifactId,
        slug: SKITTERLING.slug,
        text: SKITTERLING.text,
        textSha256: SKITTERLING.textSha256,
        statsJson: SKITTERLING.statsJson,
      },
      {
        artifactId: GOBLIN_SPINECLEAVER.artifactId,
        slug: GOBLIN_SPINECLEAVER.slug,
        text: GOBLIN_SPINECLEAVER.text,
        textSha256: GOBLIN_SPINECLEAVER.textSha256,
        statsJson: GOBLIN_SPINECLEAVER.statsJson,
      },
      {
        artifactId: KOBOLD_SIGNIFER.artifactId,
        slug: KOBOLD_SIGNIFER.slug,
        text: KOBOLD_SIGNIFER.text,
        textSha256: KOBOLD_SIGNIFER.textSha256,
        statsJson: KOBOLD_SIGNIFER.statsJson,
      },
      {
        artifactId: HEALING_GRACE.artifactId,
        slug: HEALING_GRACE.slug,
        text: HEALING_GRACE.text,
        textSha256: HEALING_GRACE.textSha256,
      },
      {
        artifactId: WAR_DOG_AEROCITE.artifactId,
        slug: WAR_DOG_AEROCITE.slug,
        text: WAR_DOG_AEROCITE.text,
        textSha256: WAR_DOG_AEROCITE.textSha256,
        statsJson: WAR_DOG_AEROCITE.statsJson,
      },
      {
        artifactId: GOBLIN_MONARCH.artifactId,
        slug: GOBLIN_MONARCH.slug,
        text: GOBLIN_MONARCH.text,
        textSha256: GOBLIN_MONARCH.textSha256,
        statsJson: GOBLIN_MONARCH.statsJson,
      },
      {
        artifactId: WODE_SENTRY,
        slug: 'wode-elf-sentry',
        // Exact accepted-corpus Effect lines in occurrence order; the host
        // test needs only these cuts, while exhaustive canon owns the record.
        text: WODE_EFFECT_TEXT,
        textSha256: await sha256(WODE_EFFECT_TEXT),
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
      targetParticipantIds: ['censor'],
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

  test('ability and Effect dispatch compile stored canon into state and exact receipts', async () => {
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
      targetParticipantIds: ['censor'],
    });
    await table.owner.client.mutation(api.encounters.useEffect, {
      campaignId: table.campaignId,
      artifactId: BLOOD_FOR_BLOOD.artifactId,
      effectOrdinal: 1,
      actorParticipantId: 'fury',
      targetParticipantIds: ['censor'],
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
    expect(kinds).toContain('table-directive'); // explicitly invoked Effect, verbatim
    expect(kinds).not.toContain('invariant-violation');
    const directive = log.find((entry) => entry.kind === 'table-directive');
    expect(directive?.message).toBe(
      'You can deal 1d6 damage to yourself to deal an extra 1d6 damage to the target.',
    );
    expect(directive?.data).toMatchObject({
      manualEffect: {
        effectArtifactId: BLOOD_FOR_BLOOD.artifactId,
        effectOrdinal: 1,
        targets: ['censor'],
      },
    });
    expect(
      log.some(
        (entry) =>
          (entry.data as { effectResolution?: { effectOrdinal?: number } } | null)?.effectResolution
            ?.effectOrdinal === 1,
      ),
    ).toBe(true);
    const notAutomated = log.filter((entry) => entry.kind === 'not-automated');
    expect(notAutomated.some((entry) => entry.message.includes('damage:'))).toBe(true);
    expect(notAutomated.some((entry) => entry.message.includes('potency:'))).toBe(true);

    await expect(
      table.owner.client.mutation(api.encounters.useAbility, {
        campaignId: table.campaignId,
        artifactId: FURY, // neutral text: nothing parses
        band: '17+',
        actorParticipantId: 'fury',
        targetParticipantIds: ['censor'],
      }),
    ).rejects.toThrow('No parsed tier outcome');
    await expect(
      table.owner.client.mutation(api.encounters.useEffect, {
        campaignId: table.campaignId,
        artifactId: BLOOD_FOR_BLOOD.artifactId,
        effectOrdinal: 2,
        actorParticipantId: 'fury',
        targetParticipantIds: [],
      }),
    ).rejects.toThrow('No Effect instruction #2');
  });

  test('Effect dispatch rejects stored canon whose text checksum no longer matches', async () => {
    const t = makeHarness();
    const table = await setupTable(t);
    await table.owner.client.mutation(api.encounters.start, {
      campaignId: table.campaignId,
      participants: TRIO,
    });
    await t.run(async (ctx) => {
      const record = await ctx.db
        .query('canonRecords')
        .withIndex('by_artifactId', (q) => q.eq('artifactId', BLOOD_FOR_BLOOD.artifactId))
        .unique();
      if (!record) throw new Error('missing seeded record');
      await ctx.db.patch(record._id, { textSha256: '0'.repeat(64) });
    });

    await expect(
      table.owner.client.mutation(api.encounters.useEffect, {
        campaignId: table.campaignId,
        artifactId: BLOOD_FOR_BLOOD.artifactId,
        effectOrdinal: 1,
        actorParticipantId: 'fury',
        targetParticipantIds: ['censor'],
      }),
    ).rejects.toThrow('Canon record checksum mismatch');
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
      targetParticipantIds: ['censor'],
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

  test('rolled path: stat-block participants take engine-resolved damage and potency', async () => {
    const t = makeHarness();
    const table = await setupTable(t);
    await table.owner.client.mutation(api.encounters.start, {
      campaignId: table.campaignId,
      participants: [
        { id: 'warrior-a', recordId: GOBLIN_WARRIOR.artifactId },
        { id: 'warrior-b', recordId: GOBLIN_WARRIOR.artifactId },
      ],
    });
    // Asserted dice 4+5 → natural 9, fixed +2 → 11 → tier 1 of the first
    // compiled cluster (Spear Charge): 3 damage, no rider.
    await table.owner.client.mutation(api.encounters.useAbility, {
      campaignId: table.campaignId,
      artifactId: GOBLIN_WARRIOR.artifactId,
      actorParticipantId: 'warrior-a',
      targetParticipantIds: ['warrior-b'],
      dice: [4, 5],
    });
    const view = await table.owner.client.query(api.encounters.getActive, {
      campaignId: table.campaignId,
    });
    if (!view) throw new Error('no active encounter');
    const target = view.participants.find((participant) => participant.id === 'warrior-b');
    expect(target?.vitals).toMatchObject({
      staminaCurrent: 12,
      staminaMax: 15,
      winded: false,
      dying: false,
      dead: false,
    });
    const log = await table.owner.client.query(api.encounters.listLog, {
      campaignId: table.campaignId,
      encounterId: view.encounterId,
    });
    expect(log.map((entry) => entry.kind)).not.toContain('invariant-violation');
    // The power-roll breakdown receipt is persisted (design SE-3).
    const roll = log.find(
      (entry) => (entry.data as { powerRoll?: unknown } | null)?.powerRoll !== undefined,
    );
    expect(roll).toBeDefined();
  });

  test('automatic Effect damage supports several targets and the knockout choice', async () => {
    const t = makeHarness();
    const table = await setupTable(t);
    await table.owner.client.mutation(api.encounters.start, {
      campaignId: table.campaignId,
      participants: [
        { id: 'warrior-a', recordId: GOBLIN_WARRIOR.artifactId },
        { id: 'warrior-b', recordId: GOBLIN_WARRIOR.artifactId },
        { id: 'warrior-c', recordId: GOBLIN_WARRIOR.artifactId },
      ],
    });
    await table.owner.client.mutation(api.encounters.useEffect, {
      campaignId: table.campaignId,
      artifactId: WODE_SENTRY,
      effectOrdinal: 2,
      actorParticipantId: 'warrior-a',
      targetParticipantIds: ['warrior-b', 'warrior-c'],
    });
    for (let repeat = 0; repeat < 3; repeat += 1) {
      await table.owner.client.mutation(api.encounters.useEffect, {
        campaignId: table.campaignId,
        artifactId: WODE_SENTRY,
        effectOrdinal: 2,
        actorParticipantId: 'warrior-a',
        targetParticipantIds: ['warrior-b'],
      });
    }
    await table.owner.client.mutation(api.encounters.useEffect, {
      campaignId: table.campaignId,
      artifactId: WODE_SENTRY,
      effectOrdinal: 2,
      actorParticipantId: 'warrior-a',
      targetParticipantIds: ['warrior-b'],
      knockOut: true,
    });

    const view = await table.owner.client.query(api.encounters.getActive, {
      campaignId: table.campaignId,
    });
    const warriorB = view?.participants.find((participant) => participant.id === 'warrior-b');
    const warriorC = view?.participants.find((participant) => participant.id === 'warrior-c');
    expect(warriorB?.vitals).toMatchObject({ staminaCurrent: 0, dead: false });
    expect(
      warriorB?.conditions.some((condition) => condition.conditionId.endsWith('#unconscious')),
    ).toBe(true);
    expect(warriorC?.vitals?.staminaCurrent).toBe(12);
    if (!view) throw new Error('no active encounter');
    const log = await table.owner.client.query(api.encounters.listLog, {
      campaignId: table.campaignId,
      encounterId: view.encounterId,
    });
    expect(log.map((entry) => entry.kind)).not.toContain('invariant-violation');
  });

  test('rolled path refuses cleanly when the roll cannot bind, and falls back to asserted tiers', async () => {
    const t = makeHarness();
    const table = await setupTable(t);
    await table.owner.client.mutation(api.encounters.start, {
      campaignId: table.campaignId,
      participants: [...TRIO, { id: 'warrior', recordId: GOBLIN_WARRIOR.artifactId }],
    });
    // blood-for-blood rolls + Might; the fury participant is a class record
    // with no stats — the engine refuses (a log row, state untouched).
    await table.owner.client.mutation(api.encounters.useAbility, {
      campaignId: table.campaignId,
      artifactId: BLOOD_FOR_BLOOD.artifactId,
      actorParticipantId: 'fury',
      targetParticipantIds: ['warrior'],
    });
    const view = await table.owner.client.query(api.encounters.getActive, {
      campaignId: table.campaignId,
    });
    if (!view) throw new Error('no active encounter');
    const log = await table.owner.client.query(api.encounters.listLog, {
      campaignId: table.campaignId,
      encounterId: view.encounterId,
    });
    expect(log.some((entry) => entry.kind === 'refusal')).toBe(true);
    expect(
      view.participants.find((participant) => participant.id === 'warrior')?.vitals?.staminaCurrent,
    ).toBe(15);
    // A record whose text compiles nothing cannot roll — assert a tier instead.
    await expect(
      table.owner.client.mutation(api.encounters.useAbility, {
        campaignId: table.campaignId,
        artifactId: FURY,
        actorParticipantId: 'fury',
        targetParticipantIds: ['censor'],
      }),
    ).rejects.toThrow('cannot be auto-resolved');
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
    expect(hit?.residueSpans).toBe(0);
    expect(hit?.effects).toEqual([
      {
        effectOrdinal: 1,
        sourceText:
          'You can deal 1d6 damage to yourself to deal an extra 1d6 damage to the target.',
        resolutionKind: 'table',
      },
    ]);
  });
});

test('characteristic tests roll each target server-side; objects auto-obtain tier 1', async () => {
  const t = makeHarness();
  const table = await setupTable(t);
  await table.owner.client.mutation(api.encounters.start, {
    campaignId: table.campaignId,
    participants: [
      { id: 'adjudicator', recordId: DEVIL_ADJUDICATOR.artifactId },
      { id: 'warrior-a', recordId: GOBLIN_WARRIOR.artifactId },
      { id: 'warrior-b', recordId: GOBLIN_WARRIOR.artifactId },
    ],
  });
  // Effect #2 is Adjudicator's Interdiction: "The target makes a Presence
  // test." — each creature target rolls server-side (seeded, replayable);
  // the object target never rolls and gets a tier 1 result [R-0007].
  await table.owner.client.mutation(api.encounters.useEffect, {
    campaignId: table.campaignId,
    artifactId: DEVIL_ADJUDICATOR.artifactId,
    effectOrdinal: 2,
    actorParticipantId: 'adjudicator',
    targetParticipantIds: ['warrior-a', 'warrior-b'],
    objectTargetLabels: ['iron door'],
  });
  const view = await table.owner.client.query(api.encounters.getActive, {
    campaignId: table.campaignId,
  });
  if (!view) throw new Error('no active encounter');
  const log = await table.owner.client.query(api.encounters.listLog, {
    campaignId: table.campaignId,
    encounterId: view.encounterId,
  });
  expect(log.map((entry) => entry.kind)).not.toContain('invariant-violation');
  const rolls = log
    .map((entry) => (entry.data as { testRoll?: { targetId: string } } | null)?.testRoll)
    .filter((roll) => roll !== undefined);
  expect(rolls.map((roll) => roll?.targetId)).toEqual(['warrior-a', 'warrior-b']);
  expect(
    log.some(
      (entry) =>
        (entry.data as { objectTestTier1?: { objectLabel: string } } | null)?.objectTestTier1
          ?.objectLabel === 'iron door',
    ),
  ).toBe(true);
  // The object's directive carries the EXACT tier-1 bullet line from the
  // verbatim record — never a paraphrase.
  const tier1Line = DEVIL_ADJUDICATOR.text
    .split('\n')
    .find((line) => line.includes('**≤11:** The target is [slowed]'));
  if (!tier1Line) throw new Error('fixture missing the Interdiction tier-1 bullet');
  const objectDirective = log.find(
    (entry) =>
      (entry.data as { testTierDirective?: { objectLabel?: string } } | null)?.testTierDirective
        ?.objectLabel === 'iron door',
  );
  expect(objectDirective?.message).toBe(tier1Line);
});

test('next-roll grants store on the target, surface in the view, and are consumed by the next strike', async () => {
  const t = makeHarness();
  const table = await setupTable(t);
  await table.owner.client.mutation(api.encounters.start, {
    campaignId: table.campaignId,
    participants: [
      { id: 'skitterling', recordId: SKITTERLING.artifactId },
      { id: 'warrior-a', recordId: GOBLIN_WARRIOR.artifactId },
      { id: 'warrior-b', recordId: GOBLIN_WARRIOR.artifactId },
    ],
  });
  // Skitterling Claws Effect #1: "The target takes a bane on their next
  // strike." [R-0012, R-0013] — stored on the struck warrior.
  await table.owner.client.mutation(api.encounters.useEffect, {
    campaignId: table.campaignId,
    artifactId: SKITTERLING.artifactId,
    effectOrdinal: 1,
    actorParticipantId: 'skitterling',
    targetParticipantIds: ['warrior-a'],
  });
  const marked = await table.owner.client.query(api.encounters.getActive, {
    campaignId: table.campaignId,
  });
  const warriorA = marked?.participants.find((participant) => participant.id === 'warrior-a');
  expect(warriorA?.grants).toEqual([
    expect.objectContaining({
      polarity: 'bane',
      scope: 'strike',
      direction: 'outbound',
      window: null,
      sourceParticipantId: 'skitterling',
      sourceRecordSlug: 'skitterling',
    }),
  ]);
  // The warrior's next strike (Strike keyword) consumes the bane: asserted
  // dice 5+4 = 9, +2 fixed, −2 bane → total 9 [R-0015].
  await table.owner.client.mutation(api.encounters.useAbility, {
    campaignId: table.campaignId,
    artifactId: GOBLIN_WARRIOR.artifactId,
    actorParticipantId: 'warrior-a',
    targetParticipantIds: ['skitterling'],
    dice: [5, 4],
  });
  const after = await table.owner.client.query(api.encounters.getActive, {
    campaignId: table.campaignId,
  });
  expect(after?.participants.find((participant) => participant.id === 'warrior-a')?.grants).toEqual(
    [],
  );
  if (!after) throw new Error('no active encounter');
  const log = await table.owner.client.query(api.encounters.listLog, {
    campaignId: table.campaignId,
    encounterId: after.encounterId,
  });
  expect(log.map((entry) => entry.kind)).not.toContain('invariant-violation');
  const roll = log
    .map(
      (entry) =>
        (entry.data as { powerRoll?: { banes: number; assertedBanes?: number } } | null)?.powerRoll,
    )
    .find((data) => data !== undefined);
  expect(roll?.banes).toBe(1);
  expect(roll?.assertedBanes).toBe(0);
  expect(
    log.some((entry) =>
      Array.isArray((entry.data as { removedGrantIds?: string[] } | null)?.removedGrantIds),
    ),
  ).toBe(true);
});

test('flat regain: Glory to the Legion regains exactly 5 Stamina per bound target', async () => {
  const t = makeHarness();
  const table = await setupTable(t);
  await table.owner.client.mutation(api.encounters.start, {
    campaignId: table.campaignId,
    participants: [
      { id: 'signifer', recordId: KOBOLD_SIGNIFER.artifactId },
      { id: 'warrior-a', recordId: GOBLIN_WARRIOR.artifactId },
      { id: 'warrior-b', recordId: GOBLIN_WARRIOR.artifactId },
    ],
  });
  // Damage both targets first through the existing automatic-damage path
  // (wode sentry Effect #2, 3 damage each), twice: 15 → 9. 9 + 5 = 14 stays
  // under the maximum, so the regain is unclamped and exact [R-0017].
  for (let repeat = 0; repeat < 2; repeat += 1) {
    await table.owner.client.mutation(api.encounters.useEffect, {
      campaignId: table.campaignId,
      artifactId: WODE_SENTRY,
      effectOrdinal: 2,
      actorParticipantId: 'signifer',
      targetParticipantIds: ['warrior-a', 'warrior-b'],
    });
  }
  // Signifer's Glory to the Legion, Effect #2: "Each target regains 5
  // Stamina." — automatic, binding-targeted [R-0020].
  await table.owner.client.mutation(api.encounters.useEffect, {
    campaignId: table.campaignId,
    artifactId: KOBOLD_SIGNIFER.artifactId,
    effectOrdinal: 2,
    actorParticipantId: 'signifer',
    targetParticipantIds: ['warrior-a', 'warrior-b'],
  });
  const view = await table.owner.client.query(api.encounters.getActive, {
    campaignId: table.campaignId,
  });
  if (!view) throw new Error('no active encounter');
  for (const id of ['warrior-a', 'warrior-b']) {
    expect(view.participants.find((participant) => participant.id === id)?.vitals).toMatchObject({
      staminaCurrent: 14,
      staminaMax: 15,
      // Director creatures have no Recoveries [R-0019b] — untracked in view.
      recoveriesCurrent: null,
      recoveriesMax: null,
    });
  }
  const log = await table.owner.client.query(api.encounters.listLog, {
    campaignId: table.campaignId,
    encounterId: view.encounterId,
  });
  expect(log.map((entry) => entry.kind)).not.toContain('invariant-violation');
  const regains = log
    .map((entry) => (entry.data as { regained?: number } | null)?.regained)
    .filter((regained) => regained !== undefined);
  expect(regains).toEqual([5, 5]);
});

test('spend-recovery: recoverySpends passes through — every bound target must answer, accepting regains', async () => {
  const t = makeHarness();
  const table = await setupTable(t);
  await table.owner.client.mutation(api.encounters.start, {
    campaignId: table.campaignId,
    participants: [
      { id: 'conduit', recordId: FURY },
      { id: 'warrior', recordId: GOBLIN_WARRIOR.artifactId },
    ],
  });
  // Damage the recipient so the regain is visible: 15 → 9 (two wode Effect
  // #2 dispatches); 9 + 5 = 14 stays under the maximum (unclamped).
  for (let repeat = 0; repeat < 2; repeat += 1) {
    await table.owner.client.mutation(api.encounters.useEffect, {
      campaignId: table.campaignId,
      artifactId: WODE_SENTRY,
      effectOrdinal: 2,
      actorParticipantId: 'conduit',
      targetParticipantIds: ['warrior'],
    });
  }
  // Healing Grace Effect #1: "The target can spend a Recovery." A dispatch
  // with no accept/decline answer is refused by the engine (a log row,
  // state untouched) [R-0018].
  await table.owner.client.mutation(api.encounters.useEffect, {
    campaignId: table.campaignId,
    artifactId: HEALING_GRACE.artifactId,
    effectOrdinal: 1,
    actorParticipantId: 'conduit',
    targetParticipantIds: ['warrior'],
  });
  const unanswered = await table.owner.client.query(api.encounters.getActive, {
    campaignId: table.campaignId,
  });
  expect(
    unanswered?.participants.find((participant) => participant.id === 'warrior')?.vitals
      ?.staminaCurrent,
  ).toBe(9);
  // Accepting spends. NOTE: hero recoveriesMax is not seedable through the
  // existing start path (participants seed as director-creatures from
  // statblock statsJson, which carries no Recoveries), so this asserts the
  // Director-creature conversion instead: the offered spend converts to a
  // regain of one-third Stamina maximum, floor(15 / 3) = 5, and nothing
  // decrements [R-0019b].
  await table.owner.client.mutation(api.encounters.useEffect, {
    campaignId: table.campaignId,
    artifactId: HEALING_GRACE.artifactId,
    effectOrdinal: 1,
    actorParticipantId: 'conduit',
    targetParticipantIds: ['warrior'],
    recoverySpends: { warrior: true },
  });
  const accepted = await table.owner.client.query(api.encounters.getActive, {
    campaignId: table.campaignId,
  });
  expect(
    accepted?.participants.find((participant) => participant.id === 'warrior')?.vitals,
  ).toMatchObject({ staminaCurrent: 14, recoveriesCurrent: null, recoveriesMax: null });
  // Declining is legal and receipted — no state change [R-0018].
  await table.owner.client.mutation(api.encounters.useEffect, {
    campaignId: table.campaignId,
    artifactId: HEALING_GRACE.artifactId,
    effectOrdinal: 1,
    actorParticipantId: 'conduit',
    targetParticipantIds: ['warrior'],
    recoverySpends: { warrior: false },
  });
  const declined = await table.owner.client.query(api.encounters.getActive, {
    campaignId: table.campaignId,
  });
  expect(
    declined?.participants.find((participant) => participant.id === 'warrior')?.vitals
      ?.staminaCurrent,
  ).toBe(14);
  if (!declined) throw new Error('no active encounter');
  const log = await table.owner.client.query(api.encounters.listLog, {
    campaignId: table.campaignId,
    encounterId: declined.encounterId,
  });
  expect(log.map((entry) => entry.kind)).not.toContain('invariant-violation');
  expect(
    log.some((entry) =>
      entry.message.includes("a Recovery offer needs every bound participant's answer"),
    ),
  ).toBe(true);
  expect(log.some((entry) => entry.message.includes('declines the offered Recovery'))).toBe(true);
});

/** Handles for a four-skitterling squad (per-minion Stamina 3 — asserted
 * from the drift-guarded fixture, never hand-typed). */
const SK_IDS = ['sk1', 'sk2', 'sk3', 'sk4'];
const SK_PARTICIPANTS = SK_IDS.map((id) => ({ id, recordId: SKITTERLING.artifactId }));
const SK_SQUAD = { squadId: 'squad-sk', name: 'skitterlings', memberIds: SK_IDS };

test('squad pool E2E: seed → view card; non-area damage decrements, kills, pending-kill flow', async () => {
  const t = makeHarness();
  const table = await setupTable(t);
  expect(JSON.parse(SKITTERLING.statsJson).staminaMax).toBe(3);
  await table.owner.client.mutation(api.encounters.start, {
    campaignId: table.campaignId,
    participants: SK_PARTICIPANTS,
    squads: [SK_SQUAD],
  });
  const seeded = await table.owner.client.query(api.encounters.getActive, {
    campaignId: table.campaignId,
  });
  if (!seeded) throw new Error('no active encounter');
  expect(seeded.squads).toEqual([
    {
      squadId: 'squad-sk',
      name: 'skitterlings',
      poolCurrent: 12,
      poolMax: 12,
      perMinionStamina: 3,
      livingMemberIds: SK_IDS,
      deadMemberIds: [],
      pendingKills: 0,
      captainId: null,
      withCaptain: null, // R-0028: display only while a captain is attached
    },
  ]);
  // The pool is the ONE home for squad vitality [R-0023]: member vitals are
  // null in the view — the squad card is the vitals surface.
  for (const id of SK_IDS) {
    expect(seeded.participants.find((participant) => participant.id === id)?.vitals).toBeNull();
  }

  // Manual damage is Director adjudication.
  await expect(
    table.member.client.mutation(api.encounters.applyDamage, {
      campaignId: table.campaignId,
      targetParticipantId: 'sk1',
      amount: 4,
      reason: 'test vector',
    }),
  ).rejects.toThrow('Director');

  // Non-area 4 damage on sk1 [R-0024]: full decrement 12 → 8, one threshold
  // kill — the damaged minion dies; the extra point carries in the pool.
  await table.owner.client.mutation(api.encounters.applyDamage, {
    campaignId: table.campaignId,
    targetParticipantId: 'sk1',
    amount: 4,
    reason: 'test vector',
  });
  const afterFirst = await table.owner.client.query(api.encounters.getActive, {
    campaignId: table.campaignId,
  });
  expect(afterFirst?.squads[0]).toMatchObject({
    poolCurrent: 8,
    deadMemberIds: ['sk1'],
    livingMemberIds: ['sk2', 'sk3', 'sk4'],
    pendingKills: 0,
  });

  // Non-area 7 damage on sk2 outkills the bound target: 8 → 1, two more
  // threshold kills — sk2 dies, one kill awaits its victim's identity.
  await table.owner.client.mutation(api.encounters.applyDamage, {
    campaignId: table.campaignId,
    targetParticipantId: 'sk2',
    amount: 7,
    reason: 'test vector',
  });
  const outkilled = await table.owner.client.query(api.encounters.getActive, {
    campaignId: table.campaignId,
  });
  expect(outkilled?.squads[0]).toMatchObject({
    poolCurrent: 1,
    deadMemberIds: ['sk1', 'sk2'],
    livingMemberIds: ['sk3', 'sk4'],
    pendingKills: 1,
  });

  // Naming the victim is Director adjudication; the view updates.
  await expect(
    table.member.client.mutation(api.encounters.resolvePendingKills, {
      campaignId: table.campaignId,
      squadId: 'squad-sk',
      victimMemberIds: ['sk3'],
    }),
  ).rejects.toThrow('Director');
  await table.owner.client.mutation(api.encounters.resolvePendingKills, {
    campaignId: table.campaignId,
    squadId: 'squad-sk',
    victimMemberIds: ['sk3'],
    reason: 'nearest to sk2',
  });
  const resolved = await table.owner.client.query(api.encounters.getActive, {
    campaignId: table.campaignId,
  });
  expect(resolved?.squads[0]).toMatchObject({
    poolCurrent: 1,
    deadMemberIds: ['sk1', 'sk2', 'sk3'],
    livingMemberIds: ['sk4'],
    pendingKills: 0,
  });

  if (!resolved) throw new Error('no active encounter');
  const log = await table.owner.client.query(api.encounters.listLog, {
    campaignId: table.campaignId,
    encounterId: resolved.encounterId,
  });
  expect(log.map((entry) => entry.kind)).not.toContain('invariant-violation');
  // Every death fired the 0-Stamina trigger receipt when counted [R-0027].
  const deaths = log.flatMap(
    (entry) => (entry.data as { squadDeaths?: { memberId: string }[] } | null)?.squadDeaths ?? [],
  );
  expect(deaths.map((death) => death.memberId)).toEqual(['sk1', 'sk2', 'sk3']);
  // The pending kill's trigger fired ANONYMOUSLY at count time; naming
  // (resolve-pending-kills) assigned identity only [R-0027].
  expect(
    log.some((entry) => {
      const trigger = (
        entry.data as { zeroStaminaTrigger?: { pending?: boolean; count?: number } } | null
      )?.zeroStaminaTrigger;
      return trigger?.pending === true && trigger.count === 1;
    }),
  ).toBe(true);
  expect(
    log.some((entry) => entry.kind === 'table-directive' && entry.message.includes('nearest')),
  ).toBe(true);
});

test('squad pool E2E: dispatch-asserted area damage caps each contribution at per-minion Stamina [R-0025]', async () => {
  const t = makeHarness();
  const table = await setupTable(t);
  await table.owner.client.mutation(api.encounters.start, {
    campaignId: table.campaignId,
    participants: SK_PARTICIPANTS,
    squads: [SK_SQUAD],
  });
  // 7 damage as an area source feeds the pool at most the per-minion 3 —
  // one bound target, one kill, no pending remainder.
  await table.owner.client.mutation(api.encounters.applyDamage, {
    campaignId: table.campaignId,
    targetParticipantId: 'sk1',
    amount: 7,
    area: true,
    reason: 'test vector',
  });
  const view = await table.owner.client.query(api.encounters.getActive, {
    campaignId: table.campaignId,
  });
  expect(view?.squads[0]).toMatchObject({
    poolCurrent: 9,
    deadMemberIds: ['sk1'],
    livingMemberIds: ['sk2', 'sk3', 'sk4'],
    pendingKills: 0,
  });
});

test('captain attach/detach: verbatim With-Captain surfaces only while attached [R-0028]', async () => {
  const t = makeHarness();
  const table = await setupTable(t);
  await table.owner.client.mutation(api.encounters.start, {
    campaignId: table.campaignId,
    participants: [...SK_PARTICIPANTS, { id: 'warrior', recordId: GOBLIN_WARRIOR.artifactId }],
    squads: [SK_SQUAD],
  });
  await expect(
    table.member.client.mutation(api.encounters.attachCaptain, {
      campaignId: table.campaignId,
      squadId: 'squad-sk',
      captainId: 'warrior',
    }),
  ).rejects.toThrow('Director');
  await table.owner.client.mutation(api.encounters.attachCaptain, {
    campaignId: table.campaignId,
    squadId: 'squad-sk',
    captainId: 'warrior',
  });
  const attached = await table.owner.client.query(api.encounters.getActive, {
    campaignId: table.campaignId,
  });
  // The With-Captain string comes from the drift-guarded fixture's
  // statsJson — asserted against the same cut, never hand-typed here.
  const fixtureWithCaptain = (JSON.parse(SKITTERLING.statsJson) as { withCaptain: string })
    .withCaptain;
  expect(fixtureWithCaptain.length).toBeGreaterThan(0);
  expect(attached?.squads[0]).toMatchObject({
    captainId: 'warrior',
    withCaptain: fixtureWithCaptain,
  });
  // The captain's Stamina stays individual — never pooled [R-0028].
  expect(
    attached?.participants.find((participant) => participant.id === 'warrior')?.vitals,
  ).toMatchObject({ staminaCurrent: 15, staminaMax: 15 });

  await table.owner.client.mutation(api.encounters.detachCaptain, {
    campaignId: table.campaignId,
    squadId: 'squad-sk',
    reason: 'the warrior falls back',
  });
  const detached = await table.owner.client.query(api.encounters.getActive, {
    campaignId: table.campaignId,
  });
  expect(detached?.squads[0]).toMatchObject({ captainId: null, withCaptain: null });
});

test('minion regain refusal [R-0027] is a per-binding refusal receipt in the log', async () => {
  const t = makeHarness();
  const table = await setupTable(t);
  await table.owner.client.mutation(api.encounters.start, {
    campaignId: table.campaignId,
    participants: [{ id: 'signifer', recordId: KOBOLD_SIGNIFER.artifactId }, ...SK_PARTICIPANTS],
    squads: [SK_SQUAD],
  });
  // Glory to the Legion Effect #2 ("Each target regains 5 Stamina") bound
  // to a squad member: rule-mandated refusal — no individual Stamina exists
  // to receive it; the pool is untouched.
  await table.owner.client.mutation(api.encounters.useEffect, {
    campaignId: table.campaignId,
    artifactId: KOBOLD_SIGNIFER.artifactId,
    effectOrdinal: 2,
    actorParticipantId: 'signifer',
    targetParticipantIds: ['sk1'],
  });
  const view = await table.owner.client.query(api.encounters.getActive, {
    campaignId: table.campaignId,
  });
  if (!view) throw new Error('no active encounter');
  expect(view.squads[0]).toMatchObject({ poolCurrent: 12, poolMax: 12 });
  const log = await table.owner.client.query(api.encounters.listLog, {
    campaignId: table.campaignId,
    encounterId: view.encounterId,
  });
  expect(log.map((entry) => entry.kind)).not.toContain('invariant-violation');
  const refusal = log.find(
    (entry) => entry.kind === 'refusal' && entry.message.includes("can't regain Stamina"),
  );
  expect(refusal).toBeDefined();
  expect(refusal?.data).toMatchObject({
    minionRegainRefused: { targetId: 'sk1', ruling: 'R-0027' },
  });
});

test('squad seeding: mixed-statblock seed rejected server-side; over-eight warns and applies', async () => {
  const t = makeHarness();
  const table = await setupTable(t);
  // Mixed statblock (skitterling + spinecleaver) is canon-incoherent — the
  // engine refuses and the mutation rejects atomically [R-0023].
  await expect(
    table.owner.client.mutation(api.encounters.start, {
      campaignId: table.campaignId,
      participants: [
        { id: 'sk1', recordId: SKITTERLING.artifactId },
        { id: 'sc1', recordId: GOBLIN_SPINECLEAVER.artifactId },
      ],
      squads: [{ squadId: 'squad-mixed', name: 'mixed', memberIds: ['sk1', 'sc1'] }],
    }),
  ).rejects.toThrow('mixes stat blocks');
  expect(
    await table.owner.client.query(api.encounters.getActive, { campaignId: table.campaignId }),
  ).toBeNull();

  // Nine minions exceed the printed up-to-eight bound: warn-and-apply.
  const nineIds = ['n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'n8', 'n9'];
  await table.owner.client.mutation(api.encounters.start, {
    campaignId: table.campaignId,
    participants: nineIds.map((id) => ({ id, recordId: SKITTERLING.artifactId })),
    squads: [{ squadId: 'squad-nine', name: 'nine skitterlings', memberIds: nineIds }],
  });
  const view = await table.owner.client.query(api.encounters.getActive, {
    campaignId: table.campaignId,
  });
  if (!view) throw new Error('no active encounter');
  expect(view.squads[0]).toMatchObject({ poolCurrent: 27, poolMax: 27, perMinionStamina: 3 });
  const log = await table.owner.client.query(api.encounters.listLog, {
    campaignId: table.campaignId,
    encounterId: view.encounterId,
  });
  expect(
    log.some((entry) => entry.kind === 'warning' && entry.message.includes('up to eight')),
  ).toBe(true);
});

test('terrain facts surface in the view; clearing is Director adjudication', async () => {
  const t = makeHarness();
  const table = await setupTable(t);
  await table.owner.client.mutation(api.encounters.start, {
    campaignId: table.campaignId,
    participants: [{ id: 'aerocite', recordId: WAR_DOG_AEROCITE.artifactId }],
  });
  // Caustic Paste Bomb Effect #1: "The area is difficult terrain." — a
  // typed, attributed fact; no targets bind [R-0022].
  await table.owner.client.mutation(api.encounters.useEffect, {
    campaignId: table.campaignId,
    artifactId: WAR_DOG_AEROCITE.artifactId,
    effectOrdinal: 1,
    actorParticipantId: 'aerocite',
    targetParticipantIds: [],
  });
  const view = await table.owner.client.query(api.encounters.getActive, {
    campaignId: table.campaignId,
  });
  if (!view) throw new Error('no active encounter');
  expect(view.terrainFacts).toEqual([
    {
      factId: expect.stringContaining(WAR_DOG_AEROCITE.artifactId),
      terrain: 'difficult',
      areaText: '3 cube within 5',
      sourceRecordSlug: 'war-dog-aerocite',
      createdBy: 'aerocite',
    },
  ]);
  const factId = view.terrainFacts[0]?.factId;
  if (!factId) throw new Error('no terrain fact recorded');
  // A non-director member cannot clear terrain — Director adjudication only.
  await expect(
    table.member.client.mutation(api.encounters.clearTerrainFact, {
      campaignId: table.campaignId,
      factId,
    }),
  ).rejects.toThrow('Director');
  await table.owner.client.mutation(api.encounters.clearTerrainFact, {
    campaignId: table.campaignId,
    factId,
    reason: 'the paste is scraped away',
  });
  const cleared = await table.owner.client.query(api.encounters.getActive, {
    campaignId: table.campaignId,
  });
  expect(cleared?.terrainFacts).toEqual([]);
  const log = await table.owner.client.query(api.encounters.listLog, {
    campaignId: table.campaignId,
    encounterId: view.encounterId,
  });
  expect(log.map((entry) => entry.kind)).not.toContain('invariant-violation');
  expect(
    log.some((entry) => entry.message.includes('terrain fact cleared: the paste is scraped away')),
  ).toBe(true);
});

// ─── action economy + two-phase commit host E2E (v6, R-0029..R-0033) ────────

const WARRIORS = [
  { id: 'warrior-a', recordId: GOBLIN_WARRIOR.artifactId },
  { id: 'warrior-b', recordId: GOBLIN_WARRIOR.artifactId },
];
const MONARCH = GOBLIN_MONARCH.artifactId;
/** Abilities inside the monarch's statblock record, addressed by the
 * engine-test `#slug` convention. All three are printed on the fixture. */
const MEAT_SHIELD = `${MONARCH}#meat-shield`;
const WHAT_ARE_YOU_WAITING_FOR = `${MONARCH}#what-are-you-waiting-for`;
const FOCUS_FIRE = `${MONARCH}#focus-fire`;
/** Verbatim Meat Shield trigger line from the drift-guarded fixture. */
const MEAT_SHIELD_TRIGGER = 'A creature targets the monarch with a strike.';

describe('action economy host', () => {
  test('full round walk: begin-combat is Director-gated and server-rolled; turns and round advance track', async () => {
    const t = makeHarness();
    const table = await setupTable(t);
    await table.owner.client.mutation(api.encounters.start, {
      campaignId: table.campaignId,
      participants: WARRIORS,
    });
    await expect(
      table.member.client.mutation(api.encounters.beginCombat, {
        campaignId: table.campaignId,
        firstSide: 'director',
      }),
    ).rejects.toThrow('Director access required');
    await table.owner.client.mutation(api.encounters.beginCombat, {
      campaignId: table.campaignId,
      firstSide: 'director',
    });
    const begun = await table.owner.client.query(api.encounters.getActive, {
      campaignId: table.campaignId,
    });
    expect(begun?.turnState).toMatchObject({
      round: 1,
      firstSide: 'director',
      activeTurnId: null,
      lastTurnId: null,
      turnsTaken: {},
    });
    expect(begun?.villainActions).toEqual({ usedThisRound: false, usedByAbility: [] });

    await expect(
      table.member.client.mutation(api.encounters.startTurn, {
        campaignId: table.campaignId,
        turnId: 'warrior-a',
      }),
    ).rejects.toThrow('Director access required');
    await table.owner.client.mutation(api.encounters.startTurn, {
      campaignId: table.campaignId,
      turnId: 'warrior-a',
    });
    // Pipelined one-tap dispatch: the roll opens a resolution entry and the
    // HOST commits it in the same mutation [R-0032] — dice 4+5 → 11 → tier 1
    // of Spear Charge (3 damage), applied at commit.
    const resolutionId = await table.owner.client.mutation(api.encounters.useAbility, {
      campaignId: table.campaignId,
      artifactId: GOBLIN_WARRIOR.artifactId,
      actorParticipantId: 'warrior-a',
      targetParticipantIds: ['warrior-b'],
      dice: [4, 5],
    });
    expect(typeof resolutionId).toBe('string');
    const midTurn = await table.owner.client.query(api.encounters.getActive, {
      campaignId: table.campaignId,
    });
    expect(midTurn?.resolutions).toEqual([]); // committed, not held
    expect(midTurn?.participants.find((p) => p.id === 'warrior-b')?.vitals?.staminaCurrent).toBe(
      12,
    );
    const warriorA = midTurn?.participants.find((p) => p.id === 'warrior-a');
    expect(warriorA?.actionBudget['main-action']).toMatchObject({ used: 1 });
    expect(midTurn?.turnState).toMatchObject({
      activeTurnId: 'warrior-a',
      turnsTaken: { 'warrior-a': 1 },
    });

    await table.owner.client.mutation(api.encounters.endTurn, {
      campaignId: table.campaignId,
      participantId: 'warrior-a',
    });
    await table.owner.client.mutation(api.encounters.startTurn, {
      campaignId: table.campaignId,
      turnId: 'warrior-b',
    });
    await table.owner.client.mutation(api.encounters.endTurn, {
      campaignId: table.campaignId,
      participantId: 'warrior-b',
    });
    await expect(
      table.member.client.mutation(api.encounters.advanceRound, {
        campaignId: table.campaignId,
      }),
    ).rejects.toThrow('Director access required');
    await table.owner.client.mutation(api.encounters.advanceRound, {
      campaignId: table.campaignId,
    });
    const nextRound = await table.owner.client.query(api.encounters.getActive, {
      campaignId: table.campaignId,
    });
    expect(nextRound?.turnState).toMatchObject({
      round: 2,
      activeTurnId: null,
      turnsTaken: {},
      lastTurnId: 'warrior-b', // survives the boundary (no-consecutive spans rounds)
    });
    expect(
      nextRound?.participants.find((p) => p.id === 'warrior-a')?.actionBudget['main-action']
        ?.used ?? 0,
    ).toBe(0);
    if (!nextRound) throw new Error('no active encounter');
    const log = await table.owner.client.query(api.encounters.listLog, {
      campaignId: table.campaignId,
      encounterId: nextRound.encounterId,
    });
    expect(log.map((entry) => entry.kind)).not.toContain('invariant-violation');
    expect(log.some((entry) => entry.message.includes('combat begins — round 1'))).toBe(true);
    expect(log.some((entry) => entry.message.includes('round 2 begins'))).toBe(true);
  });

  test('triggered action consumes the one-per-round counter; free triggered actions bypass it', async () => {
    const t = makeHarness();
    const table = await setupTable(t);
    await table.owner.client.mutation(api.encounters.start, {
      campaignId: table.campaignId,
      participants: [{ id: 'monarch', recordId: MONARCH }, ...WARRIORS],
    });
    await table.owner.client.mutation(api.encounters.beginCombat, {
      campaignId: table.campaignId,
      firstSide: 'director',
    });
    await table.owner.client.mutation(api.encounters.startTurn, {
      campaignId: table.campaignId,
      turnId: 'warrior-a',
    });
    await expect(
      table.owner.client.mutation(api.encounters.useTriggeredAction, {
        campaignId: table.campaignId,
        participantId: 'monarch',
        abilityArtifactId: 'mcdm.monsters.v1/monster.goblin.statblock/not-a-record#nothing',
      }),
    ).rejects.toThrow('Unknown canon record');
    await table.owner.client.mutation(api.encounters.useTriggeredAction, {
      campaignId: table.campaignId,
      participantId: 'monarch',
      abilityArtifactId: MEAT_SHIELD,
      triggerText: MEAT_SHIELD_TRIGGER,
    });
    const first = await table.owner.client.query(api.encounters.getActive, {
      campaignId: table.campaignId,
    });
    const monarchFirst = first?.participants.find((p) => p.id === 'monarch');
    expect(monarchFirst?.triggeredThisRound).toBe(1);
    expect(monarchFirst?.triggeredActionLimit).toBe(1);
    expect(monarchFirst?.abilityUses[MEAT_SHIELD]).toMatchObject({ round: 1 });

    // The second triggered action this round breaches the printed limit —
    // warn-and-apply [R-0030].
    await table.owner.client.mutation(api.encounters.useTriggeredAction, {
      campaignId: table.campaignId,
      participantId: 'monarch',
      abilityArtifactId: MEAT_SHIELD,
      triggerText: MEAT_SHIELD_TRIGGER,
    });
    // A free triggered action bypasses the round counter.
    await table.owner.client.mutation(api.encounters.useTriggeredAction, {
      campaignId: table.campaignId,
      participantId: 'monarch',
      abilityArtifactId: MEAT_SHIELD,
      free: true,
      triggerText: MEAT_SHIELD_TRIGGER,
    });
    const after = await table.owner.client.query(api.encounters.getActive, {
      campaignId: table.campaignId,
    });
    expect(after?.participants.find((p) => p.id === 'monarch')?.triggeredThisRound).toBe(2);
    if (!after) throw new Error('no active encounter');
    const log = await table.owner.client.query(api.encounters.listLog, {
      campaignId: table.campaignId,
      encounterId: after.encounterId,
    });
    expect(log.map((entry) => entry.kind)).not.toContain('invariant-violation');
    expect(
      log.some(
        (entry) =>
          entry.kind === 'warning' &&
          entry.message.includes('one triggered action per round') &&
          (entry.data as { ruleViolation?: { kind?: string } } | null)?.ruleViolation?.kind ===
            'triggered-limit',
      ),
    ).toBe(true);
    expect(
      log.some((entry) =>
        entry.message.includes("doesn't count against your limit of one triggered action"),
      ),
    ).toBe(true);
  });

  test('critical hit grants an escape-flagged main action, consumed silently off-turn [R-0030]', async () => {
    const t = makeHarness();
    const table = await setupTable(t);
    await table.owner.client.mutation(api.encounters.start, {
      campaignId: table.campaignId,
      participants: WARRIORS,
    });
    await table.owner.client.mutation(api.encounters.beginCombat, {
      campaignId: table.campaignId,
      firstSide: 'director',
    });
    await table.owner.client.mutation(api.encounters.startTurn, {
      campaignId: table.campaignId,
      turnId: 'warrior-a',
    });
    // Natural 20 on a main-action ability roll: the printed crit grant —
    // "immediately take an additional main action after resolving the power
    // roll, whether or not it's your turn and even if you are dazed" —
    // compiles to an escape-flagged action grant.
    await table.owner.client.mutation(api.encounters.useAbility, {
      campaignId: table.campaignId,
      artifactId: GOBLIN_WARRIOR.artifactId,
      actorParticipantId: 'warrior-a',
      targetParticipantIds: ['warrior-b'],
      dice: [10, 10],
    });
    const crit = await table.owner.client.query(api.encounters.getActive, {
      campaignId: table.campaignId,
    });
    expect(crit?.participants.find((p) => p.id === 'warrior-b')?.vitals?.staminaCurrent).toBe(10);
    expect(crit?.participants.find((p) => p.id === 'warrior-a')?.actionGrants).toEqual([
      expect.objectContaining({
        cost: 'main-action',
        magnitude: 1,
        escapes: { ignoresDazed: true, ignoresSurprised: false, offTurn: true },
        expiry: null,
        sourceParticipantId: 'warrior-a',
        sourceRecordSlug: 'critical-hit',
      }),
    ]);

    // Off-turn, over-budget use: the grant covers it SILENTLY — no off-turn
    // violation warning (printed escapes never warn).
    await table.owner.client.mutation(api.encounters.endTurn, {
      campaignId: table.campaignId,
      participantId: 'warrior-a',
    });
    await table.owner.client.mutation(api.encounters.startTurn, {
      campaignId: table.campaignId,
      turnId: 'warrior-b',
    });
    await table.owner.client.mutation(api.encounters.useAbility, {
      campaignId: table.campaignId,
      artifactId: GOBLIN_WARRIOR.artifactId,
      actorParticipantId: 'warrior-a',
      targetParticipantIds: ['warrior-b'],
      dice: [4, 5],
    });
    const after = await table.owner.client.query(api.encounters.getActive, {
      campaignId: table.campaignId,
    });
    expect(after?.participants.find((p) => p.id === 'warrior-a')?.actionGrants).toEqual([]);
    expect(after?.participants.find((p) => p.id === 'warrior-b')?.vitals?.staminaCurrent).toBe(7);
    if (!after) throw new Error('no active encounter');
    const log = await table.owner.client.query(api.encounters.listLog, {
      campaignId: table.campaignId,
      encounterId: after.encounterId,
    });
    expect(log.map((entry) => entry.kind)).not.toContain('invariant-violation');
    expect(log.some((entry) => entry.message.includes('through a granted action'))).toBe(true);
    expect(
      log.some(
        (entry) =>
          (entry.data as { ruleViolation?: { kind?: string } } | null)?.ruleViolation?.kind ===
          'off-turn',
      ),
    ).toBe(false);
  });

  test('villain actions: legal timing spends the round; own-turn reuse warns both constraints; round advance resets the flag', async () => {
    const t = makeHarness();
    const table = await setupTable(t);
    await table.owner.client.mutation(api.encounters.start, {
      campaignId: table.campaignId,
      participants: [{ id: 'monarch', recordId: MONARCH }, ...WARRIORS],
    });
    await table.owner.client.mutation(api.encounters.beginCombat, {
      campaignId: table.campaignId,
      firstSide: 'director',
    });
    await table.owner.client.mutation(api.encounters.startTurn, {
      campaignId: table.campaignId,
      turnId: 'warrior-a',
    });
    await table.owner.client.mutation(api.encounters.endTurn, {
      campaignId: table.campaignId,
      participantId: 'warrior-a',
    });
    await expect(
      table.member.client.mutation(api.encounters.useVillainAction, {
        campaignId: table.campaignId,
        participantId: 'monarch',
        abilityArtifactId: WHAT_ARE_YOU_WAITING_FOR,
      }),
    ).rejects.toThrow('Director access required');
    // Legal timing: the end of another creature's turn — no villain warns.
    await table.owner.client.mutation(api.encounters.useVillainAction, {
      campaignId: table.campaignId,
      participantId: 'monarch',
      abilityArtifactId: WHAT_ARE_YOU_WAITING_FOR,
    });
    const legal = await table.owner.client.query(api.encounters.getActive, {
      campaignId: table.campaignId,
    });
    expect(legal?.villainActions).toEqual({
      usedThisRound: true,
      usedByAbility: [WHAT_ARE_YOU_WAITING_FOR],
    });
    if (!legal) throw new Error('no active encounter');
    const legalLog = await table.owner.client.query(api.encounters.listLog, {
      campaignId: table.campaignId,
      encounterId: legal.encounterId,
    });
    expect(
      legalLog.some((entry) =>
        String(
          (entry.data as { ruleViolation?: { kind?: string } } | null)?.ruleViolation?.kind ?? '',
        ).startsWith('villain-'),
      ),
    ).toBe(false);

    // A second villain action this round, during the monarch's own turn:
    // both printed constraints warn-and-apply [R-0030].
    await table.owner.client.mutation(api.encounters.startTurn, {
      campaignId: table.campaignId,
      turnId: 'monarch',
    });
    await table.owner.client.mutation(api.encounters.useVillainAction, {
      campaignId: table.campaignId,
      participantId: 'monarch',
      abilityArtifactId: FOCUS_FIRE,
    });
    const warned = await table.owner.client.query(api.encounters.getActive, {
      campaignId: table.campaignId,
    });
    expect(warned?.villainActions.usedByAbility).toEqual([WHAT_ARE_YOU_WAITING_FOR, FOCUS_FIRE]);
    if (!warned) throw new Error('no active encounter');
    const log = await table.owner.client.query(api.encounters.listLog, {
      campaignId: table.campaignId,
      encounterId: warned.encounterId,
    });
    const violationKinds = log
      .map(
        (entry) =>
          (entry.data as { ruleViolation?: { kind?: string } } | null)?.ruleViolation?.kind,
      )
      .filter((kind): kind is string => kind !== undefined);
    expect(violationKinds).toContain('villain-once-per-round');
    expect(violationKinds).toContain('villain-timing');
    expect(log.map((entry) => entry.kind)).not.toContain('invariant-violation');

    // "no more than one villain action can be used per round" — the flag
    // resets with the round; once-per-encounter spends survive.
    await table.owner.client.mutation(api.encounters.endTurn, {
      campaignId: table.campaignId,
      participantId: 'monarch',
    });
    await table.owner.client.mutation(api.encounters.advanceRound, {
      campaignId: table.campaignId,
    });
    const nextRound = await table.owner.client.query(api.encounters.getActive, {
      campaignId: table.campaignId,
    });
    expect(nextRound?.villainActions).toEqual({
      usedThisRound: false,
      usedByAbility: [WHAT_ARE_YOU_WAITING_FOR, FOCUS_FIRE],
    });
  });

  test('held-open resolution: hold → modify (downgrade) → commit; end-turn force-commits the rest [R-0032]', async () => {
    const t = makeHarness();
    const table = await setupTable(t);
    await table.owner.client.mutation(api.encounters.start, {
      campaignId: table.campaignId,
      participants: WARRIORS,
    });
    await table.owner.client.mutation(api.encounters.beginCombat, {
      campaignId: table.campaignId,
      firstSide: 'director',
    });
    await table.owner.client.mutation(api.encounters.startTurn, {
      campaignId: table.campaignId,
      turnId: 'warrior-a',
    });
    // dice 8+9 → natural 17, +2 → 19 → tier 3 (5 damage) — held open, so
    // nothing applies yet.
    const resolutionId = await table.owner.client.mutation(api.encounters.useAbility, {
      campaignId: table.campaignId,
      artifactId: GOBLIN_WARRIOR.artifactId,
      actorParticipantId: 'warrior-a',
      targetParticipantIds: ['warrior-b'],
      dice: [8, 9],
      hold: true,
    });
    if (typeof resolutionId !== 'string') throw new Error('no resolution opened');
    const held = await table.owner.client.query(api.encounters.getActive, {
      campaignId: table.campaignId,
    });
    expect(held?.participants.find((p) => p.id === 'warrior-b')?.vitals?.staminaCurrent).toBe(15);
    expect(held?.resolutions).toEqual([
      {
        resolutionId,
        actorId: 'warrior-a',
        abilityArtifactId: GOBLIN_WARRIOR.artifactId,
        abilitySlug: 'goblin-warrior',
        actionCost: 'main-action',
        phase: 'rolled',
        roll: { dice: [8, 9], natural: 17, total: 19, tier: 3 },
        modifications: [],
      },
    ]);

    // Modification authz follows the removeCondition pattern.
    await expect(
      table.member.client.mutation(api.encounters.modifyResolution, {
        campaignId: table.campaignId,
        resolutionId,
        modification: { kind: 'downgrade', toTier: 2 },
      }),
    ).rejects.toThrow('Name the participant acting');
    await table.owner.client.mutation(api.encounters.modifyResolution, {
      campaignId: table.campaignId,
      resolutionId,
      modification: { kind: 'downgrade', toTier: 2 },
      asParticipantId: 'warrior-a',
    });
    const modified = await table.owner.client.query(api.encounters.getActive, {
      campaignId: table.campaignId,
    });
    expect(modified?.resolutions[0]?.modifications).toEqual([{ kind: 'downgrade', toTier: 2 }]);

    // Commit re-supplies the stored payload; the engine hash-verifies and
    // executes at the downgraded tier 2 (4 damage).
    await table.owner.client.mutation(api.encounters.commitResolution, {
      campaignId: table.campaignId,
      resolutionId,
      asParticipantId: 'warrior-a',
    });
    const committed = await table.owner.client.query(api.encounters.getActive, {
      campaignId: table.campaignId,
    });
    expect(committed?.participants.find((p) => p.id === 'warrior-b')?.vitals?.staminaCurrent).toBe(
      11,
    );
    expect(committed?.resolutions).toEqual([]);
    await expect(
      table.owner.client.mutation(api.encounters.commitResolution, {
        campaignId: table.campaignId,
        resolutionId,
        asParticipantId: 'warrior-a',
      }),
    ).rejects.toThrow('No held payload');

    // A second held roll is FORCE-committed by end-turn (printed damage is
    // never discarded): dice 4+5 → tier 1 → 3 damage at the boundary.
    await table.owner.client.mutation(api.encounters.useAbility, {
      campaignId: table.campaignId,
      artifactId: GOBLIN_WARRIOR.artifactId,
      actorParticipantId: 'warrior-a',
      targetParticipantIds: ['warrior-b'],
      dice: [4, 5],
      hold: true,
    });
    await table.owner.client.mutation(api.encounters.endTurn, {
      campaignId: table.campaignId,
      participantId: 'warrior-a',
    });
    const forced = await table.owner.client.query(api.encounters.getActive, {
      campaignId: table.campaignId,
    });
    expect(forced?.participants.find((p) => p.id === 'warrior-b')?.vitals?.staminaCurrent).toBe(8);
    expect(forced?.resolutions).toEqual([]);
    if (!forced) throw new Error('no active encounter');
    const log = await table.owner.client.query(api.encounters.listLog, {
      campaignId: table.campaignId,
      encounterId: forced.encounterId,
    });
    expect(log.map((entry) => entry.kind)).not.toContain('invariant-violation');
    expect(log.some((entry) => entry.message.includes('FORCE-committed'))).toBe(true);
  });

  test('squad turn: members spend within the shared slot; a third member action warns per Acting Together [R-0033]', async () => {
    const t = makeHarness();
    const table = await setupTable(t);
    await table.owner.client.mutation(api.encounters.start, {
      campaignId: table.campaignId,
      participants: [...SK_PARTICIPANTS, { id: 'warrior', recordId: GOBLIN_WARRIOR.artifactId }],
      squads: [SK_SQUAD],
    });
    await table.owner.client.mutation(api.encounters.beginCombat, {
      campaignId: table.campaignId,
      firstSide: 'director',
    });
    // The squad occupies ONE turn slot — "All members of a minion squad act
    // together on the same initiative" [R-0033].
    await table.owner.client.mutation(api.encounters.startTurn, {
      campaignId: table.campaignId,
      turnId: 'squad-sk',
    });
    const started = await table.owner.client.query(api.encounters.getActive, {
      campaignId: table.campaignId,
    });
    expect(started?.turnState).toMatchObject({
      activeTurnId: 'squad-sk',
      turnsTaken: { 'squad-sk': 1 },
    });

    // A member acts within the squad's active slot: no off-turn warn.
    // Claws, dice 4+5 → 11 → tier 1 → 1 poison damage (pipelined commit).
    const clawsOnce = async () =>
      await table.owner.client.mutation(api.encounters.useAbility, {
        campaignId: table.campaignId,
        artifactId: SKITTERLING.artifactId,
        actorParticipantId: 'sk1',
        targetParticipantIds: ['warrior'],
        dice: [4, 5],
      });
    await clawsOnce();
    const oneAction = await table.owner.client.query(api.encounters.getActive, {
      campaignId: table.campaignId,
    });
    expect(oneAction?.participants.find((p) => p.id === 'warrior')?.vitals?.staminaCurrent).toBe(
      14,
    );
    expect(
      oneAction?.participants.find((p) => p.id === 'sk1')?.actionBudget['main-action'],
    ).toMatchObject({ used: 1 });

    // A second and third main action from the same member: the printed
    // per-turn budget warns, and the third action breaches the minion
    // two-action shape — "a move action and a main action, a move action
    // and a maneuver, or two move actions" (Acting Together, R-0033).
    await clawsOnce();
    await clawsOnce();
    await table.owner.client.mutation(api.encounters.endTurn, {
      campaignId: table.campaignId,
      participantId: 'squad-sk',
    });
    const ended = await table.owner.client.query(api.encounters.getActive, {
      campaignId: table.campaignId,
    });
    expect(ended?.turnState?.activeTurnId).toBeNull();
    if (!ended) throw new Error('no active encounter');
    const log = await table.owner.client.query(api.encounters.listLog, {
      campaignId: table.campaignId,
      encounterId: ended.encounterId,
    });
    expect(log.map((entry) => entry.kind)).not.toContain('invariant-violation');
    const violationKinds = log
      .map(
        (entry) =>
          (entry.data as { ruleViolation?: { kind?: string } } | null)?.ruleViolation?.kind,
      )
      .filter((kind): kind is string => kind !== undefined);
    expect(violationKinds).toContain('over-budget');
    expect(violationKinds).toContain('minion-budget');
    expect(violationKinds).not.toContain('off-turn');
    expect(
      log.some((entry) => entry.kind === 'warning' && entry.message.includes('Acting Together')),
    ).toBe(true);
  });
});
