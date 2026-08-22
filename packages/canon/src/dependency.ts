import type { ArtifactRecord } from './schemas.js';

export interface ReferenceClosure {
  seeds: string[];
  maxDepth: number | null;
  artifactIds: string[];
  depths: Array<{ id: string; depth: number }>;
  missing: Array<{ from: string; reference: string }>;
}

export function computeReferenceClosure(
  artifacts: readonly ArtifactRecord[],
  seedIds: readonly string[],
  options: { maxDepth?: number } = {},
): ReferenceClosure {
  const byId = new Map<string, ArtifactRecord>();
  for (const artifact of artifacts) {
    if (byId.has(artifact.id)) throw new Error(`duplicate artifact ID: ${artifact.id}`);
    byId.set(artifact.id, artifact);
  }

  const seeds = [...new Set(seedIds)].sort();
  for (const seed of seeds) {
    if (!byId.has(seed)) throw new Error(`seed artifact is missing: ${seed}`);
  }

  const visited = new Set<string>();
  const depths = new Map<string, number>();
  const missing = new Map<string, { from: string; reference: string }>();
  const maximumDepth = options.maxDepth ?? Number.POSITIVE_INFINITY;
  if (
    options.maxDepth !== undefined &&
    (!Number.isInteger(options.maxDepth) || options.maxDepth < 0)
  ) {
    throw new Error('maxDepth must be a nonnegative integer');
  }
  const queue = seeds.map((id) => ({ id, depth: 0 }));

  while (queue.length > 0) {
    const next = queue.shift();
    if (!next || visited.has(next.id)) continue;
    const { id, depth } = next;
    visited.add(id);
    depths.set(id, depth);
    const artifact = byId.get(id);
    if (!artifact) continue;
    if (depth >= maximumDepth) continue;

    for (const reference of artifact.references) {
      if (byId.has(reference)) {
        if (!visited.has(reference)) queue.push({ id: reference, depth: depth + 1 });
      } else {
        missing.set(`${id}\0${reference}`, { from: id, reference });
      }
    }
  }

  return {
    seeds,
    maxDepth: Number.isFinite(maximumDepth) ? maximumDepth : null,
    artifactIds: [...visited].sort(),
    depths: [...depths]
      .map(([id, depth]) => ({ id, depth }))
      .sort((left, right) => left.depth - right.depth || left.id.localeCompare(right.id)),
    missing: [...missing.values()].sort(
      (left, right) =>
        left.from.localeCompare(right.from) || left.reference.localeCompare(right.reference),
    ),
  };
}
