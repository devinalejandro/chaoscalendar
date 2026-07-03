import type { Snapshot } from '../types'
import type { SupabaseConfig } from './supabase'

export interface SyncRequest {
  url: string
  init: RequestInit
}

export function canSyncSnapshot(snapshot: Snapshot, config: SupabaseConfig | null): boolean {
  return Boolean(config && snapshot.data.household?.id)
}

export function buildSnapshotUpsertRequest(config: SupabaseConfig, snapshot: Snapshot): SyncRequest {
  const householdId = snapshot.data.household?.id
  if (!householdId) throw new Error('Cannot sync without a household id.')
  return {
    url: `${config.url}/rest/v1/cloud_snapshots`,
    init: {
      method: 'POST',
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${config.anonKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        household_id: householdId,
        schema_version: snapshot.schemaVersion,
        snapshot,
        updated_at: snapshot.updatedAt,
      }),
    },
  }
}

export function buildSnapshotPullRequest(config: SupabaseConfig, householdId: string): SyncRequest {
  return {
    url: `${config.url}/rest/v1/cloud_snapshots?household_id=eq.${encodeURIComponent(householdId)}&select=snapshot&limit=1`,
    init: {
      method: 'GET',
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${config.anonKey}`,
        Accept: 'application/json',
      },
    },
  }
}
