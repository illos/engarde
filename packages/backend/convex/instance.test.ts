/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api } from './_generated/api';
import { DEFAULT_INSTANCE_NAME } from './instance';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

describe('instance settings', () => {
  test('getName falls back to the default instance name when unset', async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.instance.getName, {})).toBe(DEFAULT_INSTANCE_NAME);
  });

  test('setName persists and getName reads it back', async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.instance.setName, { name: 'Test Table' });
    expect(await t.query(api.instance.getName, {})).toBe('Test Table');
  });

  test('setName overwrites an existing value instead of duplicating the row', async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.instance.setName, { name: 'First' });
    await t.mutation(api.instance.setName, { name: 'Second' });
    expect(await t.query(api.instance.getName, {})).toBe('Second');
    const rows = await t.run(async (ctx) => await ctx.db.query('instanceSettings').collect());
    expect(rows).toHaveLength(1);
  });
});
