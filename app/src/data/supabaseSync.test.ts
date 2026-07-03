import { describe, expect, it } from 'vitest'
import {
  buildSnapshotPullRequest,
  buildSnapshotUpsertRequest,
  canSyncSnapshot,
  pullSnapshotFromSupabase,
  pushSnapshotToSupabase,
} from './supabaseSync'
import { seedHousehold } from './seed'
import { createEmptySnapshot } from './migrate'

const config = { url: 'https://example.supabase.co', anonKey: 'anon' }

describe('Supabase snapshot sync boundary', () => {
  it('requires Supabase config and a household id, but a locally-generated id is never enough', () => {
    // cloud_snapshots.household_id is a Postgres `uuid` column; seedHousehold's
    // id ("hh_karla") is a prefixed string like every other local id, so it
    // must NOT report sync as ready — push/pull would fail at the database
    // layer regardless of RLS or Supabase env.
    expect(canSyncSnapshot(seedHousehold('2026-07-03T00:00:00.000Z'), config)).toBe(false)
    expect(canSyncSnapshot(seedHousehold('2026-07-03T00:00:00.000Z'), null)).toBe(false)
    expect(canSyncSnapshot(createEmptySnapshot('dev', '2026-07-03T00:00:00.000Z'), config)).toBe(false)
  })

  it('is ready only once the household id is a real UUID', () => {
    const snapshot = seedHousehold('2026-07-03T00:00:00.000Z')
    const withUuid = { ...snapshot, data: { ...snapshot.data, household: { ...snapshot.data.household!, id: '3fa85f64-5717-4562-b3fc-2c963f66afa6' } } }
    expect(canSyncSnapshot(withUuid, config)).toBe(true)
    expect(canSyncSnapshot(withUuid, null)).toBe(false)
  })

  it('builds an upsert request for the cloud_snapshots table', () => {
    const snapshot = seedHousehold('2026-07-03T00:00:00.000Z')
    const request = buildSnapshotUpsertRequest(config, snapshot)
    const body = JSON.parse(request.init.body as string)

    expect(request.url).toBe('https://example.supabase.co/rest/v1/cloud_snapshots')
    expect(request.init.method).toBe('POST')
    expect((request.init.headers as Record<string, string>).Prefer).toContain('return=representation')
    expect(body.household_id).toBe(snapshot.data.household?.id)
    expect(body.snapshot.schemaVersion).toBe(snapshot.schemaVersion)
  })

  it('builds a pull request scoped to one household', () => {
    const request = buildSnapshotPullRequest(config, 'hh_1')
    expect(request.url).toBe('https://example.supabase.co/rest/v1/cloud_snapshots?household_id=eq.hh_1&select=snapshot&limit=1')
    expect(request.init.method).toBe('GET')
  })

  it('pushes a snapshot with the supplied fetcher', async () => {
    const calls: string[] = []
    const result = await pushSnapshotToSupabase(config, seedHousehold('2026-07-03T00:00:00.000Z'), async (url) => {
      calls.push(String(url))
      return new Response('[]', { status: 201 })
    })

    expect(result).toEqual({ ok: true })
    expect(calls).toEqual(['https://example.supabase.co/rest/v1/cloud_snapshots'])
  })

  it('pulls and validates a cloud snapshot', async () => {
    const snapshot = seedHousehold('2026-07-03T00:00:00.000Z')
    const result = await pullSnapshotFromSupabase(config, 'hh_karla', async () => new Response(JSON.stringify([{ snapshot }]), { status: 200 }))

    expect(result).toMatchObject({ ok: true })
    if (result.ok) expect(result.snapshot.data.household?.id).toBe('hh_karla')
  })

  it('rejects invalid cloud snapshot payloads', async () => {
    const result = await pullSnapshotFromSupabase(config, 'hh_karla', async () => new Response(JSON.stringify([{ snapshot: { bad: true } }]), { status: 200 }))

    expect(result.ok).toBe(false)
  })
})
