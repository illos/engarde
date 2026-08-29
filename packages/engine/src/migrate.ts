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
export function upgradeEncounterState(stored: unknown): EncounterState {
  const v7 = EncounterStateSchema.safeParse(stored);
  if (v7.success) return v7.data;
  // v6 → v7 (R-0040): `occurrences` is a derived ledger with no history to
  // reconstruct — a stored encounter's past events were never recorded, so
  // the honest upgrade is an empty ledger, not invented occurrences. Any
  // reaction pointing at a pre-upgrade event asserts it instead.
  const v6 = EncounterStateV6Schema.safeParse(stored);
  if (v6.success) {
    return EncounterStateSchema.parse({ ...v6.data, schemaVersion: 7 });
  }
  const v5 = EncounterStateV5Schema.safeParse(stored);
  if (v5.success) {
    return EncounterStateSchema.parse({ ...v5.data, schemaVersion: 7 });
  }
  const v4 = EncounterStateV4Schema.safeParse(stored);
  if (v4.success) {
    return EncounterStateSchema.parse({ ...v4.data, schemaVersion: 7 });
  }
  const v3 = EncounterStateV3Schema.safeParse(stored);
  if (v3.success) {
    return EncounterStateSchema.parse({ ...v3.data, schemaVersion: 7 });
  }
  const v2 = EncounterStateV2Schema.safeParse(stored);
  if (v2.success) {
    return EncounterStateSchema.parse({ ...v2.data, schemaVersion: 7 });
  }
  const v1: EncounterStateV1 = EncounterStateV1Schema.parse(stored);
  return EncounterStateSchema.parse({
    schemaVersion: 7,
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
