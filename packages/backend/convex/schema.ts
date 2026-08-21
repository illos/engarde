import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

// Instance-level configuration, one row per key. Deliberately generic backend
// substrate: knows about deployments and settings, not about the game.
export default defineSchema({
  instanceSettings: defineTable({
    key: v.string(),
    value: v.string(),
  }).index('by_key', ['key']),
});
