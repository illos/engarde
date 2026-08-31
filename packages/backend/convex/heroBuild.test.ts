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

const FURY = 'mcdm.heroes.v1/class/fury';
const ASPECT_BERSERKER = 'mcdm.heroes.v1/feature.fury.level-1/primordial-aspect#berserker';
const SKILLS_2 = 'mcdm.heroes.v1/class/fury#skills-2';
const CHARACTERISTICS = { might: 2, agility: 2, reason: 2, intuition: -1, presence: -1 };

type BuildView = {
  level: number;
  build: { decisions: { seq: number }[]; selections: Record<string, unknown> };
  projection: {
    pillars: Record<string, string>;
    characteristics: Record<string, number> | null;
    selections: Record<string, unknown>;
  };
  unanswered: { key: string; status: string }[];
};

describe('hero decision log (heroBuild)', () => {
  test('append maintains the log and every stored projection atomically', async () => {
    const t = makeHarness();
    const player = await addPlayer(t, 'player@example.test', 'player_user');
    const { characterId } = await player.client.mutation(api.characters.create, {
      name: 'Khorva',
      concept: '',
    });
    await player.client.mutation(api.heroBuild.append, {
      characterId,
      action: { kind: 'set-pillar', pillar: 'class', value: FURY },
    });
    await player.client.mutation(api.heroBuild.append, {
      characterId,
      action: { kind: 'set-characteristics', assignment: CHARACTERISTICS },
    });
    const view = (await player.client.mutation(api.heroBuild.append, {
      characterId,
      action: { kind: 'set-pillar', pillar: 'subclass', value: ASPECT_BERSERKER },
    })) as BuildView;
    expect(view.build.decisions.map((decision) => decision.seq)).toEqual([0, 1, 2]);
    expect(view.projection.pillars).toEqual({ class: FURY, subclass: ASPECT_BERSERKER });
    // The stored projection columns update in the SAME mutation (§2.3).
    const row = await t.run(async (ctx) => await ctx.db.get(characterId));
    expect(row?.classScc).toBe(FURY);
    expect(row?.subclassSccs).toEqual([ASPECT_BERSERKER]);
    expect(row?.characteristics).toEqual(CHARACTERISTICS);
    expect(row?.level).toBe(1);
  });

  test('non-owner cannot read or write the decision log', async () => {
    const t = makeHarness();
    const owner = await addPlayer(t, 'owner@example.test', 'owner_user');
    const stranger = await addPlayer(t, 'stranger@example.test', 'stranger_user');
    const { characterId } = await owner.client.mutation(api.characters.create, {
      name: 'Khorva',
      concept: '',
    });
    await expect(
      stranger.client.mutation(api.heroBuild.append, {
        characterId,
        action: { kind: 'set-pillar', pillar: 'class', value: FURY },
      }),
    ).rejects.toThrow('Character not found');
    await expect(stranger.client.query(api.heroBuild.get, { characterId })).rejects.toThrow(
      'Character not found',
    );
  });

  test('malformed actions are refused at the one Zod home', async () => {
    const t = makeHarness();
    const player = await addPlayer(t, 'player@example.test', 'player_user');
    const { characterId } = await player.client.mutation(api.characters.create, {
      name: 'Khorva',
      concept: '',
    });
    await expect(
      player.client.mutation(api.heroBuild.append, {
        characterId,
        action: { kind: 'set-pillar', pillar: 'class', value: '' },
      }),
    ).rejects.toThrow('Invalid decision');
    await expect(
      player.client.mutation(api.heroBuild.append, {
        characterId,
        action: { kind: 'no-such-kind' },
      }),
    ).rejects.toThrow('Invalid decision');
  });

  test('revert = rewind: truncation re-projects to the exact prior character', async () => {
    const t = makeHarness();
    const player = await addPlayer(t, 'player@example.test', 'player_user');
    const { characterId } = await player.client.mutation(api.characters.create, {
      name: 'Khorva',
      concept: '',
    });
    await player.client.mutation(api.heroBuild.append, {
      characterId,
      action: { kind: 'set-pillar', pillar: 'class', value: FURY },
    });
    const before = (await player.client.query(api.heroBuild.get, { characterId })) as BuildView;
    await player.client.mutation(api.heroBuild.append, {
      characterId,
      action: { kind: 'set-pillar', pillar: 'subclass', value: ASPECT_BERSERKER },
    });
    await player.client.mutation(api.heroBuild.append, {
      characterId,
      action: {
        kind: 'select',
        key: SKILLS_2,
        payload: {
          kind: 'pick',
          selected: [
            'mcdm.heroes.v1/skill.exploration/climb',
            'mcdm.heroes.v1/skill.intrigue/hide',
          ],
          origin: 'player',
        },
      },
    });
    const reverted = (await player.client.mutation(api.heroBuild.revert, {
      characterId,
      keepCount: 1,
    })) as BuildView;
    expect(reverted.build.decisions).toEqual(before.build.decisions);
    expect(reverted.projection).toEqual(before.projection);
    // Stored pillar columns whose decisions vanished are cleared, not stale.
    const row = await t.run(async (ctx) => await ctx.db.get(characterId));
    expect(row?.classScc).toBe(FURY);
    expect(row?.subclassSccs).toBeUndefined();
    expect(row?.build).toMatchObject({ selections: {} });
    await expect(
      player.client.mutation(api.heroBuild.revert, { characterId, keepCount: 7 }),
    ).rejects.toThrow('keepCount');
  });

  test('completeness is derived and gaps stay explicit in the view', async () => {
    const t = makeHarness();
    const player = await addPlayer(t, 'player@example.test', 'player_user');
    const { characterId } = await player.client.mutation(api.characters.create, {
      name: 'Khorva',
      concept: '',
    });
    const view = (await player.client.query(api.heroBuild.get, { characterId })) as BuildView;
    // The unbuilt character reports the class step + four explicit pillar
    // gaps — never an empty completed state.
    expect(view.unanswered.map((unanswered) => unanswered.status)).toEqual([
      'unanswered',
      'gap',
      'gap',
      'gap',
      'gap',
    ]);
  });
});
