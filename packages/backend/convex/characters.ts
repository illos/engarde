import { ConvexError, v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { type MutationCtx, type QueryCtx, mutation, query } from './_generated/server';
import { requireActiveMember, requireCampaignAdmin, requireProfile } from './authz';
import {
  expireControlGrantsForBinding,
  expireControlGrantsForGranteeInCampaign,
  removeCharacterFromActiveSession,
} from './sessions';

const CHARACTER_NOT_FOUND = 'Character not found';
const CAMPAIGN_NOT_FOUND = 'Campaign not found';
const MAX_CHARACTERS_PER_USER = 50;
const MAX_BOUND_CHARACTERS_PER_CAMPAIGN = 200;

const bindingStatusValidator = v.union(v.literal('pending'), v.literal('active'));
const bindingView = v.object({
  campaignId: v.id('campaigns'),
  campaignName: v.string(),
  status: bindingStatusValidator,
});

// Mirrors the engine's CharacteristicsSchema field names (packages/engine
// schemas). Plain numbers only — legal ranges/arrays are builder-track rule
// logic backed by canon, never substrate validation.
const characteristicsValidator = v.object({
  might: v.number(),
  agility: v.number(),
  reason: v.number(),
  intuition: v.number(),
  presence: v.number(),
});

const ownedCharacterView = v.object({
  characterId: v.id('characters'),
  name: v.string(),
  concept: v.string(),
  level: v.number(),
  classScc: v.union(v.string(), v.null()),
  characteristics: v.union(characteristicsValidator, v.null()),
  binding: v.union(bindingView, v.null()),
});

const campaignCharacterView = v.object({
  characterId: v.id('characters'),
  ownerUserId: v.id('users'),
  name: v.string(),
  concept: v.string(),
  level: v.number(),
  classScc: v.union(v.string(), v.null()),
  characteristics: v.union(characteristicsValidator, v.null()),
  status: bindingStatusValidator,
  isMine: v.boolean(),
});

type DatabaseCtx = QueryCtx | MutationCtx;
type BindingStatus = 'pending' | 'active';
type EventType =
  | 'submitted'
  | 'auto_approved'
  | 'approved'
  | 'denied'
  | 'withdrawn'
  | 'removed'
  | 'kicked'
  | 'membership_ended';

function validateName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 80)
    throw new ConvexError('Character name must be 1–80 characters');
  return trimmed;
}

function validateConcept(concept: string): string {
  const trimmed = concept.trim();
  if (trimmed.length > 300) throw new ConvexError('Concept must be at most 300 characters');
  return trimmed;
}

// Shape-only: a class reference is a non-empty pinned-corpus scc string
// (`mcdm.<book>.v1/<category-path>/<slug>`). Which sccs name classes is
// builder-track knowledge, not substrate validation.
function validateClassScc(classScc: string): string {
  const trimmed = classScc.trim();
  if (trimmed.length < 1 || trimmed.length > 200)
    throw new ConvexError('Class reference must be 1–200 characters');
  return trimmed;
}

type CharacteristicsInput = {
  might: number;
  agility: number;
  reason: number;
  intuition: number;
  presence: number;
};

// Shape-only: finite integers, mirroring the engine schema's number kind.
// Legal score ranges are canon-backed builder-track rule logic, not substrate.
function validateCharacteristics(characteristics: CharacteristicsInput): CharacteristicsInput {
  for (const value of Object.values(characteristics)) {
    if (!Number.isInteger(value)) throw new ConvexError('Characteristics must be integers');
  }
  return characteristics;
}

async function bindingFor(
  ctx: DatabaseCtx,
  characterId: Id<'characters'>,
): Promise<Doc<'characterCampaignBindings'> | null> {
  return await ctx.db
    .query('characterCampaignBindings')
    .withIndex('by_characterId', (q) => q.eq('characterId', characterId))
    .unique();
}

async function requireOwnedCharacter(
  ctx: DatabaseCtx,
  characterId: Id<'characters'>,
): Promise<{ character: Doc<'characters'>; ownerUserId: Id<'users'> }> {
  const profile = await requireProfile(ctx);
  const character = await ctx.db.get(characterId);
  if (!character || character.ownerUserId !== profile.userId)
    throw new ConvexError(CHARACTER_NOT_FOUND);
  return { character, ownerUserId: profile.userId };
}

async function requireCampaignModerator(
  ctx: DatabaseCtx,
  campaignId: Id<'campaigns'>,
): Promise<{ campaign: Doc<'campaigns'>; actorUserId: Id<'users'> }> {
  const { campaign, profile } = await requireCampaignAdmin(ctx, campaignId);
  return { campaign, actorUserId: profile.userId };
}

async function recordEvent(
  ctx: MutationCtx,
  args: {
    characterId: Id<'characters'>;
    campaignId: Id<'campaigns'>;
    actorUserId: Id<'users'>;
    type: EventType;
    occurredAt: number;
  },
): Promise<void> {
  await ctx.db.insert('characterCampaignEvents', args);
}

async function ensureCampaignCapacity(
  ctx: MutationCtx,
  campaignId: Id<'campaigns'>,
): Promise<void> {
  const active = await ctx.db
    .query('characterCampaignBindings')
    .withIndex('by_campaignId_status', (q) => q.eq('campaignId', campaignId).eq('status', 'active'))
    .take(MAX_BOUND_CHARACTERS_PER_CAMPAIGN);
  const pending = await ctx.db
    .query('characterCampaignBindings')
    .withIndex('by_campaignId_status', (q) =>
      q.eq('campaignId', campaignId).eq('status', 'pending'),
    )
    .take(MAX_BOUND_CHARACTERS_PER_CAMPAIGN);
  if (active.length + pending.length >= MAX_BOUND_CHARACTERS_PER_CAMPAIGN)
    throw new ConvexError('This campaign has reached its character limit');
}

async function bindCharacter(
  ctx: MutationCtx,
  character: Doc<'characters'>,
  campaignId: Id<'campaigns'>,
): Promise<BindingStatus> {
  const { campaign, profile } = await requireActiveMember(ctx, campaignId);
  if (profile.userId !== character.ownerUserId) throw new ConvexError(CHARACTER_NOT_FOUND);
  if (await bindingFor(ctx, character._id))
    throw new ConvexError('Character is already submitted to a campaign');
  await ensureCampaignCapacity(ctx, campaign._id);

  const now = Date.now();
  const status: BindingStatus = campaign.ownerId === character.ownerUserId ? 'active' : 'pending';
  await ctx.db.insert('characterCampaignBindings', {
    characterId: character._id,
    campaignId: campaign._id,
    ownerUserId: character.ownerUserId,
    status,
    submittedAt: now,
    ...(status === 'active' ? { reviewedAt: now, reviewedBy: campaign.ownerId } : {}),
    updatedAt: now,
  });
  await recordEvent(ctx, {
    characterId: character._id,
    campaignId: campaign._id,
    actorUserId: character.ownerUserId,
    type: status === 'active' ? 'auto_approved' : 'submitted',
    occurredAt: now,
  });
  return status;
}

// Called in the same transaction as membership removal/block/leave. A user
// cannot remain represented by campaign characters after losing membership.
export async function detachCharactersForMembershipEnd(
  ctx: MutationCtx,
  args: {
    campaignId: Id<'campaigns'>;
    ownerUserId: Id<'users'>;
    actorUserId: Id<'users'>;
  },
): Promise<void> {
  const bindings = await ctx.db
    .query('characterCampaignBindings')
    .withIndex('by_campaignId_ownerUserId', (q) =>
      q.eq('campaignId', args.campaignId).eq('ownerUserId', args.ownerUserId),
    )
    .take(MAX_CHARACTERS_PER_USER);
  const now = Date.now();
  for (const binding of bindings) {
    await recordEvent(ctx, {
      characterId: binding.characterId,
      campaignId: binding.campaignId,
      actorUserId: args.actorUserId,
      type: 'membership_ended',
      occurredAt: now,
    });
    await removeCharacterFromActiveSession(ctx, {
      campaignId: binding.campaignId,
      characterId: binding.characterId,
      actorUserId: args.actorUserId,
    });
    await expireControlGrantsForBinding(ctx, binding._id);
    await ctx.db.delete(binding._id);
  }
  await expireControlGrantsForGranteeInCampaign(ctx, {
    campaignId: args.campaignId,
    granteeUserId: args.ownerUserId,
  });
}

export const create = mutation({
  args: {
    name: v.string(),
    concept: v.string(),
    campaignId: v.optional(v.id('campaigns')),
  },
  returns: v.object({
    characterId: v.id('characters'),
    bindingStatus: v.union(bindingStatusValidator, v.null()),
  }),
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const existing = await ctx.db
      .query('characters')
      .withIndex('by_ownerUserId', (q) => q.eq('ownerUserId', profile.userId))
      .take(MAX_CHARACTERS_PER_USER);
    if (existing.length >= MAX_CHARACTERS_PER_USER)
      throw new ConvexError(`You already have ${MAX_CHARACTERS_PER_USER} characters`);
    const now = Date.now();
    const characterId = await ctx.db.insert('characters', {
      ownerUserId: profile.userId,
      name: validateName(args.name),
      concept: validateConcept(args.concept),
      level: 1,
      createdAt: now,
      updatedAt: now,
    });
    const character = await ctx.db.get(characterId);
    if (!character) throw new ConvexError('Unable to create character');
    const bindingStatus =
      args.campaignId === undefined ? null : await bindCharacter(ctx, character, args.campaignId);
    return { characterId, bindingStatus };
  },
});

export const listMine = query({
  args: {},
  returns: v.array(ownedCharacterView),
  handler: async (ctx) => {
    const profile = await requireProfile(ctx);
    const characters = await ctx.db
      .query('characters')
      .withIndex('by_ownerUserId', (q) => q.eq('ownerUserId', profile.userId))
      .order('desc')
      .take(MAX_CHARACTERS_PER_USER);
    const views = [];
    for (const character of characters) {
      const binding = await bindingFor(ctx, character._id);
      const campaign = binding ? await ctx.db.get(binding.campaignId) : null;
      views.push({
        characterId: character._id,
        name: character.name,
        concept: character.concept,
        level: character.level,
        classScc: character.classScc ?? null,
        characteristics: character.characteristics ?? null,
        binding:
          binding && campaign
            ? { campaignId: campaign._id, campaignName: campaign.name, status: binding.status }
            : null,
      });
    }
    return views;
  },
});

export const listForCampaign = query({
  args: { campaignId: v.id('campaigns') },
  returns: v.object({
    viewer: v.object({
      userId: v.id('users'),
      isOwner: v.boolean(),
      canAdminister: v.boolean(),
    }),
    characters: v.array(campaignCharacterView),
  }),
  handler: async (ctx, args) => {
    const { campaign, profile, membership } = await requireActiveMember(ctx, args.campaignId);
    const active = await ctx.db
      .query('characterCampaignBindings')
      .withIndex('by_campaignId_status', (q) =>
        q.eq('campaignId', campaign._id).eq('status', 'active'),
      )
      .take(MAX_BOUND_CHARACTERS_PER_CAMPAIGN);
    const pending =
      campaign.ownerId === profile.userId || (membership.campaignAccess ?? 'user') === 'admin'
        ? await ctx.db
            .query('characterCampaignBindings')
            .withIndex('by_campaignId_status', (q) =>
              q.eq('campaignId', campaign._id).eq('status', 'pending'),
            )
            .take(MAX_BOUND_CHARACTERS_PER_CAMPAIGN)
        : (
            await ctx.db
              .query('characterCampaignBindings')
              .withIndex('by_campaignId_ownerUserId', (q) =>
                q.eq('campaignId', campaign._id).eq('ownerUserId', profile.userId),
              )
              .take(MAX_CHARACTERS_PER_USER)
          ).filter((binding) => binding.status === 'pending');
    const views = [];
    for (const binding of [...active, ...pending]) {
      const character = await ctx.db.get(binding.characterId);
      if (!character) continue;
      views.push({
        characterId: character._id,
        ownerUserId: character.ownerUserId,
        name: character.name,
        concept: character.concept,
        level: character.level,
        classScc: character.classScc ?? null,
        characteristics: character.characteristics ?? null,
        status: binding.status,
        isMine: character.ownerUserId === profile.userId,
      });
    }
    return {
      viewer: {
        userId: profile.userId,
        isOwner: campaign.ownerId === profile.userId,
        canAdminister:
          campaign.ownerId === profile.userId || (membership.campaignAccess ?? 'user') === 'admin',
      },
      characters: views,
    };
  },
});

export const submit = mutation({
  args: { characterId: v.id('characters'), campaignId: v.id('campaigns') },
  returns: bindingStatusValidator,
  handler: async (ctx, args) => {
    const { character } = await requireOwnedCharacter(ctx, args.characterId);
    return await bindCharacter(ctx, character, args.campaignId);
  },
});

// Hero-participant seams (substrate): owner-only set/clear of the pinned-class
// reference and the characteristic scores. Passing null clears the field.
export const setClass = mutation({
  args: {
    characterId: v.id('characters'),
    classScc: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { character } = await requireOwnedCharacter(ctx, args.characterId);
    await ctx.db.patch(character._id, {
      classScc: args.classScc === null ? undefined : validateClassScc(args.classScc),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const setCharacteristics = mutation({
  args: {
    characterId: v.id('characters'),
    characteristics: v.union(characteristicsValidator, v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { character } = await requireOwnedCharacter(ctx, args.characterId);
    await ctx.db.patch(character._id, {
      characteristics:
        args.characteristics === null ? undefined : validateCharacteristics(args.characteristics),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const withdraw = mutation({
  args: { characterId: v.id('characters') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { character, ownerUserId } = await requireOwnedCharacter(ctx, args.characterId);
    const binding = await bindingFor(ctx, character._id);
    if (!binding || binding.status !== 'pending')
      throw new ConvexError('Character has no pending submission');
    const now = Date.now();
    await recordEvent(ctx, {
      characterId: character._id,
      campaignId: binding.campaignId,
      actorUserId: ownerUserId,
      type: 'withdrawn',
      occurredAt: now,
    });
    await removeCharacterFromActiveSession(ctx, {
      campaignId: binding.campaignId,
      characterId: binding.characterId,
      actorUserId: ownerUserId,
    });
    await expireControlGrantsForBinding(ctx, binding._id);
    await ctx.db.delete(binding._id);
    return null;
  },
});

export const removeFromCampaign = mutation({
  args: { characterId: v.id('characters') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { character, ownerUserId } = await requireOwnedCharacter(ctx, args.characterId);
    const binding = await bindingFor(ctx, character._id);
    if (!binding || binding.status !== 'active')
      throw new ConvexError('Character is not attached to a campaign');
    const now = Date.now();
    await recordEvent(ctx, {
      characterId: character._id,
      campaignId: binding.campaignId,
      actorUserId: ownerUserId,
      type: 'removed',
      occurredAt: now,
    });
    await removeCharacterFromActiveSession(ctx, {
      campaignId: binding.campaignId,
      characterId: binding.characterId,
      actorUserId: ownerUserId,
    });
    await expireControlGrantsForBinding(ctx, binding._id);
    await ctx.db.delete(binding._id);
    return null;
  },
});

async function requireBindingForReview(
  ctx: MutationCtx,
  campaignId: Id<'campaigns'>,
  characterId: Id<'characters'>,
  status: BindingStatus,
): Promise<{
  binding: Doc<'characterCampaignBindings'>;
  actorUserId: Id<'users'>;
}> {
  const { actorUserId } = await requireCampaignModerator(ctx, campaignId);
  const binding = await bindingFor(ctx, characterId);
  if (!binding || binding.campaignId !== campaignId || binding.status !== status)
    throw new ConvexError(
      status === 'pending' ? 'No pending submission for that character' : 'Character is not active',
    );
  return { binding, actorUserId };
}

export const approve = mutation({
  args: { campaignId: v.id('campaigns'), characterId: v.id('characters') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { binding, actorUserId } = await requireBindingForReview(
      ctx,
      args.campaignId,
      args.characterId,
      'pending',
    );
    const now = Date.now();
    await ctx.db.patch(binding._id, {
      status: 'active',
      reviewedAt: now,
      reviewedBy: actorUserId,
      updatedAt: now,
    });
    await recordEvent(ctx, {
      characterId: binding.characterId,
      campaignId: binding.campaignId,
      actorUserId,
      type: 'approved',
      occurredAt: now,
    });
    return null;
  },
});

export const deny = mutation({
  args: { campaignId: v.id('campaigns'), characterId: v.id('characters') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { binding, actorUserId } = await requireBindingForReview(
      ctx,
      args.campaignId,
      args.characterId,
      'pending',
    );
    const now = Date.now();
    await recordEvent(ctx, {
      characterId: binding.characterId,
      campaignId: binding.campaignId,
      actorUserId,
      type: 'denied',
      occurredAt: now,
    });
    await ctx.db.delete(binding._id);
    return null;
  },
});

export const kick = mutation({
  args: { campaignId: v.id('campaigns'), characterId: v.id('characters') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { binding, actorUserId } = await requireBindingForReview(
      ctx,
      args.campaignId,
      args.characterId,
      'active',
    );
    const now = Date.now();
    await recordEvent(ctx, {
      characterId: binding.characterId,
      campaignId: binding.campaignId,
      actorUserId,
      type: 'kicked',
      occurredAt: now,
    });
    await removeCharacterFromActiveSession(ctx, {
      campaignId: binding.campaignId,
      characterId: binding.characterId,
      actorUserId,
    });
    await expireControlGrantsForBinding(ctx, binding._id);
    await ctx.db.delete(binding._id);
    return null;
  },
});
