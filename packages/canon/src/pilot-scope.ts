import { z } from 'zod';
import type { ArtifactRecord } from './schemas.js';

/**
 * Pilot scope assembly (engine-plan §Pilot, step 2): the true scope is the
 * DISCOVERED canon-dependency closure of the seed, never a hand-declared list.
 * Discovery is mechanical and every inclusion carries provenance:
 *
 * - `seed` — a configured starting record.
 * - `dependency` — reached by following outbound SCC references.
 * - `resolution` — a chapter-base reference resolved through an accepted
 *   disposition map (chapter bases are discovery leads, never resolved
 *   blindly to every child).
 * - `inbound-machinery` — a chapter chunk whose own references point INTO the
 *   pilot's condition core; rules machinery names conditions, conditions
 *   don't name their machinery, so this reversed edge is how shared
 *   lifecycle prose is located.
 * - `semantic-supplement` — a reviewed addition reference-following cannot
 *   reach, with its recorded reason. Explicit, never silent.
 *
 * Anything the walk touches but cannot account for becomes a finding; the
 * assembler never drops an edge on the floor.
 */

export const PilotConfigSchema = z.object({
  schemaVersion: z.literal(1),
  schema: z.literal('engarde-conditions-pilot-config-v1'),
  description: z.string().min(1),
  seeds: z.object({
    conditions: z.array(z.string().min(1)).min(1),
    abilities: z.array(z.string().min(1)),
  }),
  chapterResolutions: z.array(
    z.object({
      from: z.string().min(1),
      reference: z.string().min(1),
      disposition: z.enum(['covered-by-structured-artifact', 'context-only']),
      selectedArtifactIds: z.array(z.string().min(1)),
      note: z.string().min(1).optional(),
    }),
  ),
  supplements: z.array(z.object({ id: z.string().min(1), reason: z.string().min(1) })),
  maxDepth: z.number().int().positive(),
});

export type PilotConfig = z.infer<typeof PilotConfigSchema>;

export type ScopeInclusion =
  | 'seed'
  | 'dependency'
  | 'resolution'
  | 'inbound-machinery'
  | 'semantic-supplement';

export interface PilotScopeEntry {
  id: string;
  inclusion: ScopeInclusion;
  depth: number | null;
  via: string | null;
  reason: string | null;
}

export interface PilotScopeFinding {
  code:
    | 'missing-seed'
    | 'missing-supplement'
    | 'unresolved-reference'
    | 'missing-resolved-artifact';
  from: string;
  reference: string;
}

export interface PilotScope {
  seeds: string[];
  maxDepth: number;
  entries: PilotScopeEntry[];
  contextOnly: Array<{ from: string; reference: string }>;
  inboundCandidates: string[];
  findings: PilotScopeFinding[];
  counts: {
    included: number;
    seeds: number;
    dependencies: number;
    resolutions: number;
    inboundMachinery: number;
    supplements: number;
    contextOnly: number;
    inboundCandidates: number;
    findings: number;
  };
}

/** The mechanical condition-core test: condition records and the condition rule. */
function isConditionCore(id: string): boolean {
  return id.includes('/condition/') || id.endsWith('/condition');
}

function isChapterChunk(id: string): boolean {
  return id.includes('#');
}

export function assemblePilotScope(
  artifacts: readonly ArtifactRecord[],
  config: PilotConfig,
): PilotScope {
  const byId = new Map<string, ArtifactRecord>();
  for (const artifact of artifacts) {
    if (byId.has(artifact.id)) throw new Error(`duplicate artifact ID: ${artifact.id}`);
    byId.set(artifact.id, artifact);
  }

  const resolutionByEdge = new Map<string, PilotConfig['chapterResolutions'][number]>();
  for (const resolution of config.chapterResolutions) {
    resolutionByEdge.set(`${resolution.from}\0${resolution.reference}`, resolution);
  }

  const included = new Map<string, PilotScopeEntry>();
  const contextOnly = new Map<string, { from: string; reference: string }>();
  const findings = new Map<string, PilotScopeFinding>();

  function finding(code: PilotScopeFinding['code'], from: string, reference: string): void {
    findings.set(`${code}\0${from}\0${reference}`, { code, from, reference });
  }

  interface QueueItem {
    id: string;
    depth: number;
    inclusion: ScopeInclusion;
    via: string | null;
    reason: string | null;
  }

  function walk(initial: QueueItem[]): void {
    const queue = [...initial];
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) continue;
      const existing = included.get(next.id);
      if (existing) {
        // First inclusion wins; a shallower rediscovery still doesn't re-walk.
        continue;
      }
      included.set(next.id, {
        id: next.id,
        inclusion: next.inclusion,
        depth: next.depth,
        via: next.via,
        reason: next.reason,
      });
      const artifact = byId.get(next.id);
      if (!artifact || next.depth >= config.maxDepth) continue;

      for (const reference of artifact.references) {
        if (byId.has(reference)) {
          if (!included.has(reference)) {
            queue.push({
              id: reference,
              depth: next.depth + 1,
              inclusion: 'dependency',
              via: next.id,
              reason: null,
            });
          }
          continue;
        }
        const resolution = resolutionByEdge.get(`${next.id}\0${reference}`);
        if (!resolution) {
          finding('unresolved-reference', next.id, reference);
          continue;
        }
        if (resolution.disposition === 'context-only') {
          contextOnly.set(`${next.id}\0${reference}`, { from: next.id, reference });
          continue;
        }
        for (const selected of resolution.selectedArtifactIds) {
          if (!byId.has(selected)) {
            finding('missing-resolved-artifact', next.id, selected);
            continue;
          }
          if (!included.has(selected)) {
            queue.push({
              id: selected,
              depth: next.depth + 1,
              inclusion: 'resolution',
              via: `${next.id} -> ${reference}`,
              reason: null,
            });
          }
        }
      }
    }
  }

  // Phase 1: forward closure from the configured seeds.
  const seedIds = [...new Set([...config.seeds.conditions, ...config.seeds.abilities])].sort();
  for (const seed of seedIds) {
    if (!byId.has(seed)) finding('missing-seed', seed, seed);
  }
  walk(
    seedIds
      .filter((id) => byId.has(id))
      .map((id) => ({ id, depth: 0, inclusion: 'seed' as const, via: null, reason: null })),
  );

  // Phase 2: inbound discovery against the condition core of the closure.
  const conditionCore = new Set([...included.keys()].filter(isConditionCore));
  const machinerySeeds: QueueItem[] = [];
  const inboundCandidates = new Set<string>();
  for (const artifact of [...byId.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    if (included.has(artifact.id)) continue;
    const target = artifact.references.find((reference) => conditionCore.has(reference));
    if (!target) continue;
    if (isChapterChunk(artifact.id)) {
      machinerySeeds.push({
        id: artifact.id,
        // Machinery enters at the depth ceiling minus one so its direct
        // dependencies join the scope without reopening a full-depth walk.
        depth: config.maxDepth - 1,
        inclusion: 'inbound-machinery',
        via: target,
        reason: null,
      });
    } else {
      inboundCandidates.add(artifact.id);
    }
  }
  walk(machinerySeeds);

  // Phase 3: reviewed semantic supplements (pointers with reasons).
  const supplementSeeds: QueueItem[] = [];
  for (const supplement of [...config.supplements].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!byId.has(supplement.id)) {
      finding('missing-supplement', supplement.id, supplement.id);
      continue;
    }
    if (!included.has(supplement.id)) {
      supplementSeeds.push({
        id: supplement.id,
        depth: config.maxDepth - 1,
        inclusion: 'semantic-supplement',
        via: null,
        reason: supplement.reason,
      });
    }
  }
  walk(supplementSeeds);

  const entries = [...included.values()].sort((a, b) => a.id.localeCompare(b.id));
  const count = (inclusion: ScopeInclusion): number =>
    entries.filter((entry) => entry.inclusion === inclusion).length;
  const contextOnlyList = [...contextOnly.values()].sort(
    (a, b) => a.from.localeCompare(b.from) || a.reference.localeCompare(b.reference),
  );
  const findingList = [...findings.values()].sort(
    (a, b) =>
      a.code.localeCompare(b.code) ||
      a.from.localeCompare(b.from) ||
      a.reference.localeCompare(b.reference),
  );

  return {
    seeds: seedIds,
    maxDepth: config.maxDepth,
    entries,
    contextOnly: contextOnlyList,
    inboundCandidates: [...inboundCandidates].sort(),
    findings: findingList,
    counts: {
      included: entries.length,
      seeds: count('seed'),
      dependencies: count('dependency'),
      resolutions: count('resolution'),
      inboundMachinery: count('inbound-machinery'),
      supplements: count('semantic-supplement'),
      contextOnly: contextOnlyList.length,
      inboundCandidates: inboundCandidates.size,
      findings: findingList.length,
    },
  };
}
