/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

async function addUser(
  t: ReturnType<typeof convexTest>,
  email: string,
  verified = true,
): Promise<Id<'users'>> {
  return await t.run(
    async (ctx) =>
      await ctx.db.insert('users', {
        email,
        ...(verified ? { emailVerificationTime: Date.now() } : {}),
      }),
  );
}

function asUser(t: ReturnType<typeof convexTest>, userId: Id<'users'>) {
  return t.withIdentity({ subject: `${userId}|test-session`, tokenIdentifier: `test|${userId}` });
}

describe('profiles', () => {
  test('rejects profile reads without authentication', async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.profiles.current, {})).rejects.toThrow('Unauthenticated');
  });

  test('rejects unauthenticated onboarding and unverified users', async () => {
    const t = convexTest(schema, modules);
    const args = { displayName: 'Nope', handle: 'nope_user' };
    await expect(t.mutation(api.profiles.completeOnboarding, args)).rejects.toThrow(
      'Unauthenticated',
    );
    const unverified = await addUser(t, 'unverified@example.test', false);
    await expect(
      asUser(t, unverified).mutation(api.profiles.completeOnboarding, args),
    ).rejects.toThrow('Verify your email');
  });

  test('bootstraps the first profile as admin and later profiles as members', async () => {
    const t = convexTest(schema, modules);
    const firstUser = await addUser(t, 'first@example.test');
    const secondUser = await addUser(t, 'second@example.test');

    const first = await asUser(t, firstUser).mutation(api.profiles.completeOnboarding, {
      displayName: 'First',
      handle: 'First_Player',
    });
    const second = await asUser(t, secondUser).mutation(api.profiles.completeOnboarding, {
      displayName: 'Second',
      handle: 'second_player',
    });

    expect(first).toMatchObject({ handle: 'first_player', role: 'admin' });
    expect(second).toMatchObject({ handle: 'second_player', role: 'member' });
  });

  test('onboarding is idempotent and handles stay unique', async () => {
    const t = convexTest(schema, modules);
    const firstUser = await addUser(t, 'first@example.test');
    const secondUser = await addUser(t, 'second@example.test');
    const firstClient = asUser(t, firstUser);

    const original = await firstClient.mutation(api.profiles.completeOnboarding, {
      displayName: 'Original',
      handle: 'duelist',
    });
    const repeated = await firstClient.mutation(api.profiles.completeOnboarding, {
      displayName: 'Changed',
      handle: 'different',
    });
    expect(repeated).toEqual(original);

    await expect(
      asUser(t, secondUser).mutation(api.profiles.completeOnboarding, {
        displayName: 'Second',
        handle: 'Duelist',
      }),
    ).rejects.toThrow('already taken');
  });

  test('update changes the owner profile, rejects collisions, and rejects deactivated users', async () => {
    const t = convexTest(schema, modules);
    const firstUser = await addUser(t, 'first@example.test');
    const secondUser = await addUser(t, 'second@example.test');
    const firstClient = asUser(t, firstUser);
    const secondClient = asUser(t, secondUser);
    await firstClient.mutation(api.profiles.completeOnboarding, {
      displayName: 'First',
      handle: 'first_user',
    });
    await secondClient.mutation(api.profiles.completeOnboarding, {
      displayName: 'Second',
      handle: 'second_user',
    });

    await expect(
      firstClient.mutation(api.profiles.update, { displayName: 'First', handle: 'second_user' }),
    ).rejects.toThrow('already taken');
    expect(
      await firstClient.mutation(api.profiles.update, {
        displayName: 'Updated',
        handle: 'updated_user',
      }),
    ).toMatchObject({ displayName: 'Updated', handle: 'updated_user' });

    await t.run(async (ctx) => {
      const profile = await ctx.db
        .query('profiles')
        .withIndex('by_userId', (q) => q.eq('userId', firstUser))
        .unique();
      if (!profile) throw new Error('missing test profile');
      await ctx.db.patch(profile._id, { lifecycle: 'deactivated' });
    });
    await expect(firstClient.query(api.profiles.current, {})).rejects.toThrow(
      'Account deactivated',
    );
    await expect(
      firstClient.mutation(api.profiles.update, { displayName: 'Again', handle: 'again_user' }),
    ).rejects.toThrow('Account deactivated');
  });

  test('configured verified email claims admin instead of the first registrant', async () => {
    const previous = process.env.ENGARDE_INITIAL_ADMIN_EMAIL;
    process.env.ENGARDE_INITIAL_ADMIN_EMAIL = 'chosen@example.test';
    try {
      const t = convexTest(schema, modules);
      const firstUser = await addUser(t, 'first@example.test');
      const chosenUser = await addUser(t, 'chosen@example.test');
      const first = await asUser(t, firstUser).mutation(api.profiles.completeOnboarding, {
        displayName: 'First',
        handle: 'first_user',
      });
      const chosen = await asUser(t, chosenUser).mutation(api.profiles.completeOnboarding, {
        displayName: 'Chosen',
        handle: 'chosen_user',
      });
      expect(first.role).toBe('member');
      expect(chosen.role).toBe('admin');
    } finally {
      if (previous === undefined)
        Reflect.deleteProperty(process.env, 'ENGARDE_INITIAL_ADMIN_EMAIL');
      else process.env.ENGARDE_INITIAL_ADMIN_EMAIL = previous;
    }
  });
});
