/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

async function addUser(t: ReturnType<typeof convexTest>, email: string, verified = true) {
  const userId: Id<'users'> = await t.run(async (ctx) =>
    ctx.db.insert('users', {
      email,
      ...(verified ? { emailVerificationTime: Date.now() } : {}),
    }),
  );
  return {
    userId,
    client: t.withIdentity({
      subject: `${userId}|test-session`,
      tokenIdentifier: `test|${userId}`,
    }),
  };
}

describe('installation operators', () => {
  test('setup requires a verified identity and the deployment capability, then seals', async () => {
    const previous = process.env.ENGARDE_SETUP_CAPABILITY;
    process.env.ENGARDE_SETUP_CAPABILITY = 'one-time-secret';
    try {
      const t = convexTest(schema, modules);
      const first = await addUser(t, 'first@example.test');
      const second = await addUser(t, 'second@example.test');
      expect(await t.query(api.operators.setupStatus, {})).toBe('setup_pending');
      await expect(
        first.client.mutation(api.operators.bootstrap, {
          capability: 'wrong',
          instanceName: 'The Iron Yard',
        }),
      ).rejects.toThrow('Invalid setup capability');
      await first.client.mutation(api.operators.bootstrap, {
        capability: 'one-time-secret',
        instanceName: 'The Iron Yard',
      });
      expect(await t.query(api.operators.setupStatus, {})).toBe('setup_complete');
      expect(await first.client.query(api.operators.current, {})).toBe(true);
      expect(await first.client.query(api.profiles.current, {})).toBeNull();
      await expect(
        second.client.mutation(api.operators.bootstrap, {
          capability: 'one-time-secret',
          instanceName: 'Captured',
        }),
      ).rejects.toThrow('already complete');
    } finally {
      if (previous === undefined) Reflect.deleteProperty(process.env, 'ENGARDE_SETUP_CAPABILITY');
      else process.env.ENGARDE_SETUP_CAPABILITY = previous;
    }
  });

  test('operators can grant and revoke independently of profiles, but not orphan setup', async () => {
    const previous = process.env.ENGARDE_SETUP_CAPABILITY;
    process.env.ENGARDE_SETUP_CAPABILITY = 'setup';
    try {
      const t = convexTest(schema, modules);
      const first = await addUser(t, 'first@example.test');
      const second = await addUser(t, 'second@example.test');
      await first.client.mutation(api.operators.bootstrap, {
        capability: 'setup',
        instanceName: '',
      });
      await expect(
        first.client.mutation(api.operators.revoke, { targetUserId: first.userId }),
      ).rejects.toThrow('last operator');
      await first.client.mutation(api.operators.grant, { targetUserId: second.userId });
      expect(await second.client.query(api.operators.current, {})).toBe(true);
      await second.client.mutation(api.operators.revoke, { targetUserId: first.userId });
      expect(await first.client.query(api.operators.current, {})).toBe(false);
      await expect(first.client.query(api.operators.list, {})).rejects.toThrow(
        'Operator access required',
      );
    } finally {
      if (previous === undefined) Reflect.deleteProperty(process.env, 'ENGARDE_SETUP_CAPABILITY');
      else process.env.ENGARDE_SETUP_CAPABILITY = previous;
    }
  });

  test('the control-center surface grants by verified email and exposes operator-only audit', async () => {
    const previous = process.env.ENGARDE_SETUP_CAPABILITY;
    process.env.ENGARDE_SETUP_CAPABILITY = 'setup';
    try {
      const t = convexTest(schema, modules);
      const operator = await addUser(t, 'operator@example.test');
      const candidate = await addUser(t, 'candidate@example.test');
      const outsider = await addUser(t, 'outsider@example.test');
      await operator.client.mutation(api.operators.bootstrap, {
        capability: 'setup',
        instanceName: 'The Iron Yard',
      });
      await expect(outsider.client.query(api.operators.listAudit, {})).rejects.toThrow(
        'Operator access required',
      );
      await expect(
        outsider.client.mutation(api.operators.grantByEmail, {
          email: 'candidate@example.test',
        }),
      ).rejects.toThrow('Operator access required');

      await operator.client.mutation(api.operators.grantByEmail, {
        email: ' CANDIDATE@example.test ',
      });
      const operators = await operator.client.query(api.operators.list, {});
      expect(operators).toContainEqual(
        expect.objectContaining({
          userId: candidate.userId,
          email: 'candidate@example.test',
          isCurrent: false,
        }),
      );
      const audit = await operator.client.query(api.operators.listAudit, {});
      expect(audit[0]).toMatchObject({
        type: 'operator_granted',
        actorEmail: 'operator@example.test',
        subjectEmail: 'candidate@example.test',
      });
    } finally {
      if (previous === undefined) Reflect.deleteProperty(process.env, 'ENGARDE_SETUP_CAPABILITY');
      else process.env.ENGARDE_SETUP_CAPABILITY = previous;
    }
  });
});
