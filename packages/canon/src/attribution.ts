import { z } from 'zod';

/**
 * Category attribution by source location (engine-plan 2.2 as amended by
 * DEC-0010): human judgment is applied ONCE, at chapter/namespace scale, in
 * a committed reviewed map — every artifact then inherits its category
 * mechanically from where it lives in the books. Reproducible by
 * construction; the totality check proves every artifact is attributed or
 * explicitly unmatched (a finding, never a silent drop).
 *
 * Matching:  artifact ids look like `mcdm.<book>.v1/<category>/<slug>` or
 * `mcdm.<book>.v1/chapter/<name>#<key>`. Chapter chunks match on
 * `<book>/chapter/<name>` exactly; structured records match
 * `<book>/<category>` by LONGEST dotted-prefix (a rule for
 * `heroes/feature.ability` covers `heroes/feature.ability.fury.level-1`).
 */

export const AttributionConfigSchema = z.object({
  schemaVersion: z.literal(1),
  schema: z.literal('engarde-category-attribution-v1'),
  status: z.enum(['proposed', 'accepted']),
  description: z.string().min(1),
  buckets: z.array(z.string().regex(/^[a-z0-9-]+$/)).min(1),
  rules: z
    .array(
      z.object({
        match: z.string().min(1),
        bucket: z.string().regex(/^[a-z0-9-]+$/),
        note: z.string().min(1).optional(),
      }),
    )
    .min(1),
});

export type AttributionConfig = z.infer<typeof AttributionConfigSchema>;

export function attributionKeyOf(artifactId: string): string {
  const segments = artifactId.split('/');
  const namespace = segments[0] ?? '';
  const book = namespace.split('.')[1] ?? '';
  const category = segments[1] ?? '';
  if (book.length === 0 || category.length === 0) {
    throw new Error(`cannot derive attribution key from id: ${artifactId}`);
  }
  if (category === 'chapter') {
    const chapterName = (segments[2] ?? '').split('#')[0] ?? '';
    return `${book}/chapter/${chapterName}`;
  }
  return `${book}/${category}`;
}

/** Longest dotted-prefix match of a rule key against an attribution key. */
function ruleMatches(ruleKey: string, key: string): boolean {
  if (ruleKey === key) return true;
  // dotted-prefix only applies within the category part, never across books
  return key.startsWith(`${ruleKey}.`);
}

export interface AttributionResult {
  ok: boolean;
  attributed: Array<{ artifactId: string; key: string; bucket: string; rule: string }>;
  unmatched: Array<{ artifactId: string; key: string }>;
  byBucket: Record<string, number>;
}

export function attributeArtifacts(
  artifactIds: readonly string[],
  config: AttributionConfig,
): AttributionResult {
  const bucketSet = new Set(config.buckets);
  for (const rule of config.rules) {
    if (!bucketSet.has(rule.bucket)) {
      throw new Error(`rule "${rule.match}" names undeclared bucket "${rule.bucket}"`);
    }
  }
  const attributed: AttributionResult['attributed'] = [];
  const unmatched: AttributionResult['unmatched'] = [];
  const byBucket: Record<string, number> = {};

  for (const artifactId of [...artifactIds].sort()) {
    const key = attributionKeyOf(artifactId);
    let best: { match: string; bucket: string } | null = null;
    for (const rule of config.rules) {
      if (!ruleMatches(rule.match, key)) continue;
      if (best === null || rule.match.length > best.match.length) best = rule;
    }
    if (best === null) {
      unmatched.push({ artifactId, key });
      continue;
    }
    attributed.push({ artifactId, key, bucket: best.bucket, rule: best.match });
    byBucket[best.bucket] = (byBucket[best.bucket] ?? 0) + 1;
  }
  return {
    ok: unmatched.length === 0,
    attributed,
    unmatched,
    byBucket: Object.fromEntries(Object.entries(byBucket).sort(([a], [b]) => a.localeCompare(b))),
  };
}
