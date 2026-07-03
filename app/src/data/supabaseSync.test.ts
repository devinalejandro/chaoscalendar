import { describe, expect, it } from 'vitest'
import { buildSnapshotPullRequest, buildSnapshotUpsertRequest, canSyncSnapshot } from './supabaseSync'
import { seedHousehold } from './seed'
import { createEmptySnapshot } from './migrate'

const config = { url: 'https://example.supabase.co', anonKey: 'anon' }

describe('Supabase snapshot sync boundary', () => {
  it('requires both Supabase config and a household id', () => {
    expect(canSyncSnapshot(seedHousehold('2026-07-03T00:00:00.000Z'), config)).toBe(true)
    expect(canSyncSnapshot(seedHousehold('2026-07-03T00:00:00.000Z'), null)).toBe(false)
    expect(canSyncSnapshot(createEmptySnapshot('dev', '2026-07-03T00:00:00.000Z'), config)).toBe(false)
  })

  it('builds an upsert request for the cloud_snapshots table', () => {
    const snapshot = seedHousehold('2026-07-03T00:00:00.000Z')
    const request = buildSnapshotUpsertRequest(config, snapshot)
    const body = JSON.parse(request.init.body as string)

    expect(request.url).toBe('https://example.supabase.co/rest/v1/cloud_snapshots')
    expect(request.init.method).toBe('POST')
    expect(body.household_id).toBe(snapshot.data.household?.id)
    expect(body.snapshot.schemaVersion).toBe(snapshot.schemaVersion)
  })

  it('builds a pull request scoped to one household', () => {
    const request = buildSnapshotPullRequest(config, 'hh_1')
    expect(request.url).toBe('https://example.supabase.co/rest/v1/cloud_snapshots?household_id=eq.hh_1&select=snapshot&limit=1')
    expect(request.init.method).toBe('GET')
  })
})
