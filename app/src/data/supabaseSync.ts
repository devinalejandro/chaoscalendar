import { Snapshot as SnapshotSchema, type Snapshot } from '../types'
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
        Prefer: 'resolution=merge-duplicates,return=representation',
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

export async function pushSnapshotToSupabase(
  config: SupabaseConfig,
  snapshot: Snapshot,
  fetcher: typeof fetch = fetch,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const request = buildSnapshotUpsertRequest(config, snapshot)
    const response = await fetcher(request.url, request.init)
    if (!response.ok) return { ok: false, error: `Push failed: ${response.status}` }
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Push failed' }
  }
}

export async function pullSnapshotFromSupabase(
  config: SupabaseConfig,
  householdId: string,
  fetcher: typeof fetch = fetch,
): Promise<{ ok: true; snapshot: Snapshot } | { ok: false; error: string }> {
  try {
    const request = buildSnapshotPullRequest(config, householdId)
    const response = await fetcher(request.url, request.init)
    if (!response.ok) return { ok: false, error: `Pull failed: ${response.status}` }
    const rows = (await response.json()) as unknown
    if (!Array.isArray(rows) || rows.length === 0) return { ok: false, error: 'No cloud snapshot found.' }
    const parsed = SnapshotSchema.safeParse((rows[0] as { snapshot?: unknown }).snapshot)
    if (!parsed.success) return { ok: false, error: 'Cloud snapshot failed validation.' }
    return { ok: true, snapshot: parsed.data }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Pull failed' }
  }
}
