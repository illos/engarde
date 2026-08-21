/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { DEFAULT_INSTANCE_NAME } from './instance';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

async function addProfile(t: ReturnType<typeof convexTest>, role: 'admin' | 'member') {
  const userId: Id<'users'> = await t.run(async (ctx) =>
    ctx.db.insert('users', { email: `${role}@example.test`, emailVerificationTime: Date.now() }),
  );
  await t.run(async (ctx) => {
    const now = Date.now();
    await ctx.db.insert('profiles', {
      userId,
      displayName: role,
      handle: role,
      handleNormalized: role,
      role,
      lifecycle: 'active',
      onboardingCompletedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  });
  return t.withIdentity({ subject: `${userId}|test-session`, tokenIdentifier: `test|${userId}` });
}

describe('instance settings', () => {
  test('getName falls back to the default instance name when unset', async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.instance.getName, {})).toBe(DEFAULT_INSTANCE_NAME);
  });

  test('setName persists and getName reads it back', async () => {
    const t = convexTest(schema, modules);
    const admin = await addProfile(t, 'admin');
    await admin.mutation(api.instance.setName, { name: 'Test Table' });
    expect(await t.query(api.instance.getName, {})).toBe('Test Table');
  });

  test('setName overwrites an existing value instead of duplicating the row', async () => {
    const t = convexTest(schema, modules);
    const admin = await addProfile(t, 'admin');
    await admin.mutation(api.instance.setName, { name: 'First' });
    await admin.mutation(api.instance.setName, { name: 'Second' });
    expect(await t.query(api.instance.getName, {})).toBe('Second');
    const rows = await t.run(async (ctx) => await ctx.db.query('instanceSettings').collect());
    expect(rows).toHaveLength(1);
  });

  test('setName rejects anonymous users and non-admin members', async () => {
    const t = convexTest(schema, modules);
    await expect(t.mutation(api.instance.setName, { name: 'Owned' })).rejects.toThrow(
      'Unauthenticated',
    );
    const member = await addProfile(t, 'member');
    await expect(member.mutation(api.instance.setName, { name: 'Owned' })).rejects.toThrow(
      'Administrator access required',
    );
  });
});
