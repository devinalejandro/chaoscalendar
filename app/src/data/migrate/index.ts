import { Snapshot, SCHEMA_VERSION } from '../../types'
import type { Snapshot as SnapshotT } from '../../types'
import { SnapshotV2, migrateV2toV3 } from './v3'
import { SnapshotV3, migrateV3toV4 } from './v4'

export type LoadResult =
  | { ok: true; snapshot: SnapshotT; migrated: boolean }
  | { ok: false; reason: 'empty' }
  | { ok: false; reason: 'corrupt'; raw: unknown; error: string }

/**
 * Interprets raw parsed JSON at any known schema version and returns the
 * current-shape Snapshot. Corrupt or unrecognized input is *reported*, never
 * silently discarded — callers (data/repository.ts) quarantine it instead of
 * resetting to an empty household.
 */
export function loadSnapshot(raw: unknown): LoadResult {
  if (raw === null || raw === undefined) return { ok: false, reason: 'empty' }

  const current = Snapshot.safeParse(raw)
  if (current.success) return { ok: true, snapshot: current.data, migrated: false }

  const v2 = SnapshotV2.safeParse(raw)
  if (v2.success) {
    const migrated = migrateV2toV3(v2.data)
    const revalidated = Snapshot.safeParse(migrated)
    if (revalidated.success) return { ok: true, snapshot: revalidated.data, migrated: true }
    return { ok: false, reason: 'corrupt', raw, error: 'migration v2->v4 produced an invalid snapshot' }
  }

  const v3 = SnapshotV3.safeParse(raw)
  if (v3.success) {
    const migrated = migrateV3toV4(v3.data)
    const revalidated = Snapshot.safeParse(migrated)
    if (revalidated.success) return { ok: true, snapshot: revalidated.data, migrated: true }
    return { ok: false, reason: 'corrupt', raw, error: 'migration v3->v4 produced an invalid snapshot' }
  }

  return { ok: false, reason: 'corrupt', raw, error: current.error.message }
}

export function createEmptySnapshot(deviceId: string, nowIso: string): SnapshotT {
  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: nowIso,
    deviceId,
    data: { users: [], paychecks: [], bills: [], billInstances: [], goals: [], recurrenceRules: [], auditEvents: [] },
  }
}
