/// <reference types="vite/client" />
import { register as registerRateLimiter } from '@convex-dev/rate-limiter/test';
import { BLOOD_FOR_BLOOD } from '@engarde/canon/fixtures/blood-for-blood';
import { FURY_CLASS } from '@engarde/canon/fixtures/fury-class';
import { GOBLIN_WARRIOR } from '@engarde/canon/fixtures/goblin-warrior';
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

const FURY = 'mcdm.heroes.v1/class/fury';
const ASPECT_BERSERKER = 'mcdm.heroes.v1/feature.fury.level-1/primordial-aspect#berserker';
const CHARACTERISTICS = { might: 2, agility: 2, reason: 2, intuition: -1, presence: -1 };

const L1_DECISIONS = [
  { kind: 'set-pillar', pillar: 'class', value: FURY },
  { kind: 'set-characteristics', assignment: CHARACTERISTICS },
  { kind: 'set-pillar', pillar: 'subclass', value: ASPECT_BERSERKER },
  {
    kind: 'select',
    key: 'mcdm.heroes.v1/class/fury#skills-2',
    payload: {
      kind: 'pick',
      selected: [
        'mcdm.heroes.v1/skill.exploration/climb',
        'mcdm.heroes.v1/skill.intrigue/alertness',
      ],
      origin: 'player',
    },
  },
  {
    kind: 'select',
    key: 'mcdm.heroes.v1/feature.fury.level-1/fury-abilities#signature-ability',
    payload: {
      kind: 'pick',
      selected: ['mcdm.heroes.v1/feature.ability.fury.level-1/brutal-slam'],
      origin: 'player',
    },
  },
  {
    kind: 'select',
    key: 'mcdm.heroes.v1/feature.fury.level-1/fury-abilities#3pt-ability',
    payload: {
      kind: 'pick',
      selected: ['mcdm.heroes.v1/feature.ability.fury.level-1/back'],
      origin: 'player',
    },
  },
  {
    kind: 'select',
    key: 'mcdm.heroes.v1/feature.fury.level-1/fury-abilities#5pt-ability',
    payload: {
      kind: 'pick',
      selected: [BLOOD_FOR_BLOOD.artifactId],
      origin: 'player',
    },
  },
  {
    kind: 'select',
    key: 'mcdm.heroes.v1/feature.fury.level-1/kit',
    payload: { kind: 'pick', selected: ['mcdm.heroes.v1/kit/panther'], origin: 'player' },
  },
];

/**
 * The Fury-vertical end-to-end proof (ROAD-0007 step 3): build a Fury L1
 * hero through the decision log, compile at encounters.start, and have
 * them ACT — a real dispatch through the engine with the invariant oracle
 * on. Every number asserted below is printed content: class Basics
 * (Stamina 21 / Recoveries 10 / Might potencies), panther kit (+6 per
 * echelon), blood-for-blood tiers.
 */
describe('fury vertical end-to-end', () => {
  test('decision log → compile → encounters.start → the hero acts', async () => {
    const t = makeHarness();
    // Real corpus records only: the fury class record (full verbatim cut +
    // structured JSON), the chosen ability, and the foe's stat block.
    await t.run(async (ctx) => {
      for (const record of [
        {
          artifactId: FURY_CLASS.artifactId,
          slug: FURY_CLASS.slug,
          text: FURY_CLASS.text,
          textSha256: FURY_CLASS.textSha256,
        },
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
      ]) {
        await ctx.db.insert('canonRecords', record);
      }
    });
    const owner = await addPlayer(t, 'owner@example.test', 'owner_user');
    const campaignId = await owner.client.mutation(api.campaigns.create, {
      name: 'Morrowind',
      description: '',
    });
    const { characterId } = await owner.client.mutation(api.characters.create, {
      name: 'Khorva',
      concept: '',
      campaignId, // owner submission auto-approves → active binding
    });

    // ── leg 1: the wizard's decisions land in the append-only log ──────
    for (const action of L1_DECISIONS) {
      await owner.client.mutation(api.heroBuild.append, { characterId, action });
    }
    const view = (await owner.client.query(api.heroBuild.get, { characterId })) as {
      unanswered: { status: string }[];
      build: { decisions: unknown[] };
    };
    // Class track fully answered; only the explicit pillar gaps remain.
    expect(view.unanswered.every((unanswered) => unanswered.status === 'gap')).toBe(true);
    expect(view.build.decisions).toHaveLength(L1_DECISIONS.length);

    // ── leg 3: compile at encounters.start with kind 'hero' ────────────
    await owner.client.mutation(api.sessions.start, { campaignId, characterIds: [characterId] });
    await owner.client.mutation(api.encounters.start, {
      campaignId,
      participants: [
        { id: 'khorva', characterId },
        { id: 'gob', recordId: GOBLIN_WARRIOR.artifactId },
      ],
    });
    const seeded = await owner.client.query(api.encounters.getActive, { campaignId });
    if (!seeded) throw new Error('no active encounter');
    const khorva = seeded.participants.find((participant) => participant.id === 'khorva');
    // ❝Starting Stamina at 1st Level: 21❞ + panther ❝+6 per echelon❞ ×
    // echelon 1 = 27; ❝Recoveries: 10❞.
    expect(khorva?.vitals).toMatchObject({
      staminaCurrent: 27,
      staminaMax: 27,
      recoveriesCurrent: 10,
      recoveriesMax: 10,
    });
    // R-M potencies from the class-printed characteristic (Might 2).
    const stored = await t.run(async (ctx) => {
      const doc = await ctx.db.get(seeded.encounterId);
      if (!doc) throw new Error('missing encounter');
      return doc;
    });
    const heroState = (
      stored.state as {
        participants: Record<string, { kind: string; stats: { potencies: unknown } }>;
      }
    ).participants.khorva;
    expect(heroState?.kind).toBe('hero');
    expect(heroState?.stats.potencies).toEqual({ weak: 0, average: 1, strong: 2 });
    // DEC-0019: seeding initialized the sheet-owned vitals.
    const sheetAfterSeed = await t.run(async (ctx) => await ctx.db.get(characterId));
    expect((sheetAfterSeed?.runtime as { vitals: unknown } | undefined)?.vitals).toEqual({
      staminaCurrent: 27,
      recoveriesCurrent: 10,
    });
    // Unrepresentable kit bonuses and granted features surfaced as receipts.
    const seedLog = await owner.client.query(api.encounters.listLog, {
      campaignId,
      encounterId: seeded.encounterId,
    });
    const receiptText = seedLog
      .filter((entry) => entry.kind === 'not-automated')
      .map((entry) => entry.message)
      .join('\n');
    expect(receiptText).toContain('panther: Speed Bonus +1');
    expect(receiptText).toContain('Ferocity');
    const compiledRow = seedLog.find((entry) => entry.message.includes('compiled from "Khorva"'));
    expect(compiledRow?.canonRefs).toContain(BLOOD_FOR_BLOOD.artifactId);
    expect(compiledRow?.canonRefs).toContain(
      'mcdm.heroes.v1/feature.ability.fury.level-1/lines-of-force',
    );

    // ── the hero ACTS: chosen 5-Ferocity ability through the engine ────
    await owner.client.mutation(api.encounters.beginCombat, {
      campaignId,
      firstSide: 'heroes',
    });
    await owner.client.mutation(api.encounters.startTurn, { campaignId, turnId: 'khorva' });
    // Asserted dice 10+10 = 20 + Might 2 = 22 → tier 3: ❝10 + M damage❞
    // = 12 → goblin warrior 15 → 3.
    await owner.client.mutation(api.encounters.useAbility, {
      campaignId,
      artifactId: BLOOD_FOR_BLOOD.artifactId,
      actorParticipantId: 'khorva',
      targetParticipantIds: ['gob'],
      dice: [10, 10],
    });
    const afterStrike = await owner.client.query(api.encounters.getActive, { campaignId });
    expect(
      afterStrike?.participants.find((participant) => participant.id === 'gob')?.vitals
        ?.staminaCurrent,
    ).toBe(3);
    // The hero spent their main action — a real turn, not a free ride.
    expect(
      afterStrike?.participants.find((participant) => participant.id === 'khorva')?.actionBudget[
        'main-action'
      ],
    ).toMatchObject({ used: 1 });

    // ── DEC-0019 write-through: damage to the hero reaches the sheet ───
    await owner.client.mutation(api.encounters.endTurn, {
      campaignId,
      participantId: 'khorva',
    });
    await owner.client.mutation(api.encounters.startTurn, { campaignId, turnId: 'gob' });
    // Goblin's printed ability, asserted dice 4+5 = 9 + Agility 2 = 11 →
    // tier 1 (3 damage) → khorva 27 → 24, written to the character row in
    // the same transaction.
    await owner.client.mutation(api.encounters.useAbility, {
      campaignId,
      artifactId: GOBLIN_WARRIOR.artifactId,
      actorParticipantId: 'gob',
      targetParticipantIds: ['khorva'],
      dice: [4, 5],
    });
    const afterHit = await owner.client.query(api.encounters.getActive, { campaignId });
    const heroVitals = afterHit?.participants.find(
      (participant) => participant.id === 'khorva',
    )?.vitals;
    expect(heroVitals?.staminaCurrent).toBe(24);
    const sheetAfterHit = await t.run(async (ctx) => await ctx.db.get(characterId));
    expect((sheetAfterHit?.runtime as { vitals: unknown } | undefined)?.vitals).toEqual({
      staminaCurrent: 24,
      recoveriesCurrent: 10,
    });

    // ── invariant oracle stayed green through the whole flow ───────────
    const log = await owner.client.query(api.encounters.listLog, {
      campaignId,
      encounterId: seeded.encounterId,
    });
    expect(log.map((entry) => entry.kind)).not.toContain('invariant-violation');
    // Attribution: every row carries the acting user.
    expect(log.every((entry) => entry.actorName === 'owner_user')).toBe(true);
  });

  test('a hero with no build compiles to table mode with explicit receipts', async () => {
    const t = makeHarness();
    const owner = await addPlayer(t, 'owner@example.test', 'owner_user');
    const campaignId = await owner.client.mutation(api.campaigns.create, {
      name: 'Morrowind',
      description: '',
    });
    const { characterId } = await owner.client.mutation(api.characters.create, {
      name: 'Unbuilt',
      concept: '',
      campaignId,
    });
    await owner.client.mutation(api.sessions.start, { campaignId, characterIds: [characterId] });
    await owner.client.mutation(api.encounters.start, {
      campaignId,
      participants: [{ id: 'unbuilt', characterId }],
    });
    const view = await owner.client.query(api.encounters.getActive, { campaignId });
    if (!view) throw new Error('no active encounter');
    expect(
      view.participants.find((participant) => participant.id === 'unbuilt')?.vitals,
    ).toBeNull();
    const log = await owner.client.query(api.encounters.listLog, {
      campaignId,
      encounterId: view.encounterId,
    });
    expect(
      log.some(
        (entry) =>
          entry.kind === 'not-automated' &&
          entry.message.includes('no class recorded on the character'),
      ),
    ).toBe(true);
  });

  test('characterId excludes recordId/asserted stats and requires a campaign binding', async () => {
    const t = makeHarness();
    const owner = await addPlayer(t, 'owner@example.test', 'owner_user');
    const campaignId = await owner.client.mutation(api.campaigns.create, {
      name: 'Morrowind',
      description: '',
    });
    const bound = await owner.client.mutation(api.characters.create, {
      name: 'Bound',
      concept: '',
      campaignId,
    });
    const unbound = await owner.client.mutation(api.characters.create, {
      name: 'Unbound',
      concept: '',
    });
    await owner.client.mutation(api.sessions.start, {
      campaignId,
      characterIds: [bound.characterId],
    });
    await expect(
      owner.client.mutation(api.encounters.start, {
        campaignId,
        participants: [
          { id: 'x', characterId: bound.characterId, recordId: 'mcdm.heroes.v1/class/fury' },
        ],
      }),
    ).rejects.toThrow('characterId replaces recordId/stats');
    await expect(
      owner.client.mutation(api.encounters.start, {
        campaignId,
        participants: [{ id: 'x', characterId: unbound.characterId }],
      }),
    ).rejects.toThrow('not active in this campaign');
  });
});
