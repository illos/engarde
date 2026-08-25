import {
  type EncounterState,
  EncounterStateSchema,
  type EncounterStateV1,
  EncounterStateV1Schema,
  EncounterStateV2Schema,
  EncounterStateV3Schema,
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
 */
export function upgradeEncounterState(stored: unknown): EncounterState {
  const v4 = EncounterStateSchema.safeParse(stored);
  if (v4.success) return v4.data;
  const v3 = EncounterStateV3Schema.safeParse(stored);
  if (v3.success) {
    return EncounterStateSchema.parse({ ...v3.data, schemaVersion: 4 });
  }
  const v2 = EncounterStateV2Schema.safeParse(stored);
  if (v2.success) {
    return EncounterStateSchema.parse({ ...v2.data, schemaVersion: 4 });
  }
  const v1: EncounterStateV1 = EncounterStateV1Schema.parse(stored);
  return EncounterStateSchema.parse({
    schemaVersion: 4,
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
