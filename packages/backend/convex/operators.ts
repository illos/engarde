import { getAuthUserId } from '@convex-dev/auth/server';
import { ConvexError, v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { type MutationCtx, mutation, query } from './_generated/server';
import { requireInstanceOperator } from './authz';
import { DEFAULT_INSTANCE_NAME, validateInstanceName } from './instance';

const SETUP_KEY = 'installation' as const;
const MAX_OPERATORS = 50;
const MAX_AUDIT_EVENTS = 100;

async function operatorFor(ctx: MutationCtx, userId: Id<'users'>) {
  return await ctx.db
    .query('instanceOperators')
    .withIndex('by_userId', (q) => q.eq('userId', userId))
    .unique();
}

async function audit(
  ctx: MutationCtx,
  actorUserId: Id<'users'>,
  type: Doc<'operatorAuditEvents'>['type'],
  subjectUserId?: Id<'users'>,
) {
  await ctx.db.insert('operatorAuditEvents', {
    actorUserId,
    ...(subjectUserId === undefined ? {} : { subjectUserId }),
    type,
    occurredAt: Date.now(),
  });
}

async function grantOperator(
  ctx: MutationCtx,
  actorUserId: Id<'users'>,
  target: Doc<'users'>,
): Promise<void> {
  if (target.emailVerificationTime === undefined)
    throw new ConvexError('Verified identity required');
  const existing = await operatorFor(ctx, target._id);
  if (existing?.status === 'active') return;
  const active = await ctx.db
    .query('instanceOperators')
    .withIndex('by_status', (q) => q.eq('status', 'active'))
    .take(MAX_OPERATORS);
  if (active.length >= MAX_OPERATORS) throw new ConvexError('Operator limit reached');
  const now = Date.now();
  if (existing) {
    await ctx.db.patch(existing._id, {
      status: 'active',
      source: 'granted',
      grantedByUserId: actorUserId,
      grantedAt: now,
      revokedByUserId: undefined,
      revokedAt: undefined,
      updatedAt: now,
    });
  } else {
    await ctx.db.insert('instanceOperators', {
      userId: target._id,
      status: 'active',
      source: 'granted',
      grantedByUserId: actorUserId,
      grantedAt: now,
      updatedAt: now,
    });
  }
  await audit(ctx, actorUserId, 'operator_granted', target._id);
}

export const setupStatus = query({
  args: {},
  returns: v.union(v.literal('setup_pending'), v.literal('setup_complete')),
  handler: async (ctx) => {
    const setup = await ctx.db
      .query('instanceSetup')
      .withIndex('by_key', (q) => q.eq('key', SETUP_KEY))
      .unique();
    return setup ? 'setup_complete' : 'setup_pending';
  },
});

export const bootstrap = mutation({
  args: { capability: v.string(), instanceName: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError('Unauthenticated');
    const user = await ctx.db.get(userId);
    if (!user || user.emailVerificationTime === undefined)
      throw new ConvexError('Verified identity required');
    const configured = process.env.ENGARDE_SETUP_CAPABILITY;
    if (!configured || args.capability !== configured)
      throw new ConvexError('Invalid setup capability');
    const setup = await ctx.db
      .query('instanceSetup')
      .withIndex('by_key', (q) => q.eq('key', SETUP_KEY))
      .unique();
    if (setup) throw new ConvexError('Installation setup is already complete');

    const now = Date.now();
    await ctx.db.insert('instanceOperators', {
      userId: user._id,
      status: 'active',
      source: 'provisioned',
      grantedAt: now,
      updatedAt: now,
    });
    const instanceName = args.instanceName.trim()
      ? validateInstanceName(args.instanceName)
      : DEFAULT_INSTANCE_NAME;
    const existingName = await ctx.db
      .query('instanceSettings')
      .withIndex('by_key', (q) => q.eq('key', 'instanceName'))
      .unique();
    if (existingName) await ctx.db.patch(existingName._id, { value: instanceName });
    else await ctx.db.insert('instanceSettings', { key: 'instanceName', value: instanceName });
    await ctx.db.insert('instanceSetup', {
      key: SETUP_KEY,
      status: 'complete',
      completedByUserId: user._id,
      completedAt: now,
      capabilityConsumedAt: now,
    });
    await audit(ctx, user._id, 'installation_bootstrapped', user._id);
    return null;
  },
});

export const list = query({
  args: {},
  returns: v.array(
    v.object({
      userId: v.id('users'),
      email: v.string(),
      status: v.union(v.literal('active'), v.literal('revoked')),
      source: v.union(v.literal('provisioned'), v.literal('granted')),
      grantedAt: v.number(),
      isCurrent: v.boolean(),
    }),
  ),
  handler: async (ctx) => {
    const { user: currentUser } = await requireInstanceOperator(ctx);
    const rows = await ctx.db
      .query('instanceOperators')
      .withIndex('by_status', (q) => q.eq('status', 'active'))
      .take(MAX_OPERATORS);
    const result = [];
    for (const row of rows) {
      const user = await ctx.db.get(row.userId);
      result.push({
        userId: row.userId,
        email: user?.email ?? '',
        status: row.status,
        source: row.source,
        grantedAt: row.grantedAt,
        isCurrent: row.userId === currentUser._id,
      });
    }
    return result;
  },
});

export const grant = mutation({
  args: { targetUserId: v.id('users') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user: actor } = await requireInstanceOperator(ctx);
    const target = await ctx.db.get(args.targetUserId);
    if (!target) throw new ConvexError('Verified identity required');
    await grantOperator(ctx, actor._id, target);
    return null;
  },
});

export const grantByEmail = mutation({
  args: { email: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user: actor } = await requireInstanceOperator(ctx);
    const email = args.email.trim().toLowerCase();
    if (!email) throw new ConvexError('Enter a verified account email');
    const target = await ctx.db
      .query('users')
      .withIndex('email', (q) => q.eq('email', email))
      .unique();
    if (!target || target.emailVerificationTime === undefined)
      throw new ConvexError('No verified account found for that email');
    await grantOperator(ctx, actor._id, target);
    return null;
  },
});

export const revoke = mutation({
  args: { targetUserId: v.id('users') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user: actor } = await requireInstanceOperator(ctx);
    const target = await operatorFor(ctx, args.targetUserId);
    if (!target || target.status !== 'active') throw new ConvexError('Operator not found');
    const active = await ctx.db
      .query('instanceOperators')
      .withIndex('by_status', (q) => q.eq('status', 'active'))
      .take(2);
    if (active.length <= 1) throw new ConvexError('The last operator cannot be revoked');
    const now = Date.now();
    await ctx.db.patch(target._id, {
      status: 'revoked',
      revokedByUserId: actor._id,
      revokedAt: now,
      updatedAt: now,
    });
    await audit(ctx, actor._id, 'operator_revoked', target.userId);
    return null;
  },
});

export const current = query({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return false;
    const row = await ctx.db
      .query('instanceOperators')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .unique();
    return row?.status === 'active';
  },
});

export const listAudit = query({
  args: {},
  returns: v.array(
    v.object({
      eventId: v.id('operatorAuditEvents'),
      type: v.union(
        v.literal('installation_bootstrapped'),
        v.literal('operator_granted'),
        v.literal('operator_revoked'),
        v.literal('instance_name_set'),
      ),
      actorEmail: v.string(),
      subjectEmail: v.union(v.string(), v.null()),
      occurredAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    await requireInstanceOperator(ctx);
    const events = await ctx.db
      .query('operatorAuditEvents')
      .withIndex('by_occurredAt')
      .order('desc')
      .take(MAX_AUDIT_EVENTS);
    const result = [];
    for (const event of events) {
      const actor = await ctx.db.get(event.actorUserId);
      const subject = event.subjectUserId ? await ctx.db.get(event.subjectUserId) : null;
      result.push({
        eventId: event._id,
        type: event.type,
        actorEmail: actor?.email ?? 'unknown',
        subjectEmail: subject?.email ?? null,
        occurredAt: event.occurredAt,
      });
    }
    return result;
  },
});
