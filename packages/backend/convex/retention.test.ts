/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { afterEach, expect, test, vi } from 'vitest';
import { internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const DAY_MS = 24 * 60 * 60 * 1_000;

afterEach(() => vi.useRealTimers());

test('retention deletes expired rows in bounded self-draining batches', async () => {
  vi.useFakeTimers();
  const now = new Date('2026-08-22T04:00:00Z');
  vi.setSystemTime(now);
  const t = convexTest(schema, modules);

  await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', {
      email: 'owner@example.test',
      emailVerificationTime: now.valueOf(),
    });
    const campaignId = await ctx.db.insert('campaigns', {
      name: 'Retention test',
      description: '',
      ownerId: userId,
      visibility: 'private',
      joinability: 'open',
      joinCode: 'RETAIN24',
      joinCodeRotatedAt: now.valueOf(),
      memberCount: 1,
      createdAt: now.valueOf(),
      updatedAt: now.valueOf(),
    });
    for (let index = 0; index < 205; index++) {
      await ctx.db.insert('authEmailIssuanceLimits', {
        key: `expired:${index}`,
        windowStartedAt: now.valueOf() - 2 * DAY_MS,
        sends: 1,
      });
      await ctx.db.insert('lobbyMessages', {
        campaignId,
        authorUserId: userId,
        body: `expired ${index}`,
        sentAt: now.valueOf() - 31 * DAY_MS,
      });
    }
    await ctx.db.insert('authEmailIssuanceLimits', {
      key: 'recent',
      windowStartedAt: now.valueOf(),
      sends: 1,
    });
    await ctx.db.insert('lobbyMessages', {
      campaignId,
      authorUserId: userId,
      body: 'recent',
      sentAt: now.valueOf(),
    });
  });

  expect(await t.mutation(internal.retention.cleanupExpired, {})).toEqual({
    authLimitsDeleted: 200,
    lobbyMessagesDeleted: 200,
  });
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  const remaining = await t.run(async (ctx) => ({
    auth: await ctx.db.query('authEmailIssuanceLimits').collect(),
    messages: await ctx.db.query('lobbyMessages').collect(),
  }));
  expect(remaining.auth.map((row) => row.key)).toEqual(['recent']);
  expect(remaining.messages.map((row) => row.body)).toEqual(['recent']);
});
