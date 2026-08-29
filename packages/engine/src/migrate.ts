import { hashDeclaration } from './payload-hash.js';
import {
  type EncounterState,
  EncounterStateSchema,
  type EncounterStateV1,
  EncounterStateV1Schema,
  EncounterStateV2Schema,
  EncounterStateV3Schema,
  EncounterStateV4Schema,
  EncounterStateV5Schema,
  EncounterStateV6Schema,
  EncounterStateV7Schema,
} from './schemas.js';

/**
 * Stored-state migration — the ONE home for lifting persisted encounter
 * states across schema versions (design SE-2). Pure; hosts call it on read.
 *
 * v1 → v2: participants gain kind/stats/stamina. Every v1 participant was a
 * corpus monster record played without stat automation, so the lossless
 * upgrade is `kind: 'director-creature'`, `stats: null`, `stamina: null`
 * (the table-mode receipts path). No v1 field is dropped.
 *
 * v2 → v3: participants gain the `grants` slot (next-roll edge/bane grants,
 * R-0012..R-0016). No v2 encounter could hold a pending grant, so the
 * lossless upgrade is `grants: []` — supplied by the schema default; the
 * migration re-stamps the version.
 *
 * v3 → v4: stats gain `recoveriesMax`, stamina gains `recoveries`, the
 * encounter gains `terrainFacts` (flat-resource family, R-0017..R-0022). No
 * v3 encounter tracked Recoveries or terrain, so the lossless upgrade is
 * null / null / [] — supplied by the schema defaults; the migration
 * re-stamps the version.
 *
 * v4 → v5: the encounter gains the `squads` slot (minion squad Stamina
 * pools, R-0023..R-0028). No v4 encounter could hold a seeded squad (every
 * minion routed to the table), so the lossless upgrade is `squads: []` —
 * supplied by the schema default; the migration re-stamps the version.
 *
 * v5 → v6 (action economy + two-phase commit, R-0029..R-0033): the
 * encounter gains `turnState` (null — combat not begun), `villainActions`,
 * and `resolutionStack`; participants gain `traits`, `actionBudget`,
 * `triggeredThisRound`, and `abilityUses`; stored grants generalize to the
 * `kind`-discriminated union — every existing entry wraps as
 * `kind: 'next-roll'`, supplied by that member's defaulted discriminator.
 * No v5 encounter was mid-combat (no turn structure existed), so every new
 * slot's default is the lossless upgrade; the migration re-stamps the
 * version.
 */
/** The targets a stored (pre-v8) entry rolled against: an ability entry's
 * squad breakdown names them; an entry without one has no stored target
 * list, and an empty declaration is the honest reconstruction — the roll
 * receipt's per-target keys are the audit trail, not a target list. */
function declaredTargetsOf(entry: Record<string, unknown>): string[] {
  const breakdown = entry.squadBreakdown;
  if (!Array.isArray(breakdown)) return [];
  return breakdown.flatMap((row) => {
    const targetId = (row as Record<string, unknown> | null)?.targetId;
    return typeof targetId === 'string' ? [targetId] : [];
  });
}

export function upgradeEncounterState(stored: unknown): EncounterState {
  const v8 = EncounterStateSchema.safeParse(stored);
  if (v8.success) return v8.data;
  // v7 → v8 (R-0041): entries gain a `declarationHash`. A stored entry was
  // rolled without a declaration phase, so its declaration is exactly what
  // it rolled against — reconstructed from the entry's own actor, ability,
  // and squad participation where present. Nothing is invented: if an
  // entry does not carry what the hash needs, the parse below rejects it
  // rather than stamping a fabricated hash.
  const v7 = EncounterStateV7Schema.safeParse(stored);
  if (v7.success) {
    return EncounterStateSchema.parse({
      ...v7.data,
      schemaVersion: 8,
      resolutionStack: v7.data.resolutionStack.map((entry) => ({
        ...entry,
        declarationHash:
          typeof entry.declarationHash === 'string'
            ? entry.declarationHash
            : hashDeclaration({
                actorId: String(entry.actorId),
                abilityArtifactId: String(entry.abilityArtifactId),
                targets: declaredTargetsOf(entry),
              }),
      })),
    });
  }
  // v6 → v7 (R-0040): `occurrences` is a derived ledger with no history to
  // reconstruct — a stored encounter's past events were never recorded, so
  // the honest upgrade is an empty ledger, not invented occurrences. Any
  // reaction pointing at a pre-upgrade event asserts it instead.
  const v6 = EncounterStateV6Schema.safeParse(stored);
  if (v6.success) {
    return upgradeEncounterState({ ...v6.data, schemaVersion: 7 });
  }
  const v5 = EncounterStateV5Schema.safeParse(stored);
  if (v5.success) {
    return upgradeEncounterState({ ...v5.data, schemaVersion: 6 });
  }
  const v4 = EncounterStateV4Schema.safeParse(stored);
  if (v4.success) {
    return upgradeEncounterState({ ...v4.data, schemaVersion: 5 });
  }
  const v3 = EncounterStateV3Schema.safeParse(stored);
  if (v3.success) {
    return upgradeEncounterState({ ...v3.data, schemaVersion: 4 });
  }
  const v2 = EncounterStateV2Schema.safeParse(stored);
  if (v2.success) {
    return upgradeEncounterState({ ...v2.data, schemaVersion: 3 });
  }
  const v1: EncounterStateV1 = EncounterStateV1Schema.parse(stored);
  return EncounterStateSchema.parse({
    schemaVersion: 8,
    participants: Object.fromEntries(
      Object.entries(v1.participants).map(([id, participant]) => [
        id,
        {
          id: participant.id,
          conditions: participant.conditions,
          sourceRecordId: participant.sourceRecordId ?? null,
          kind: 'director-creature',
          stats: null,
          stamina: null,
        },
      ]),
    ),
  });
}
