/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

describe('auth email issuance limits', () => {
  test('allows three sends per address and purpose, then rejects', async () => {
    const t = convexTest(schema, modules);
    const args = { identifier: 'User@Example.test', purpose: 'password-reset' };
    await t.mutation(internal.emailRateLimits.consume, args);
    await t.mutation(internal.emailRateLimits.consume, args);
    await t.mutation(internal.emailRateLimits.consume, args);
    await expect(t.mutation(internal.emailRateLimits.consume, args)).rejects.toThrow(
      'Too many email requests',
    );
    await expect(
      t.mutation(internal.emailRateLimits.consume, { ...args, purpose: 'password-verify' }),
    ).resolves.toBeNull();
  });
});
