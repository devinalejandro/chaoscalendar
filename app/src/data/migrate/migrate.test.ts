import { describe, expect, it } from 'vitest'
import { createEmptySnapshot, loadSnapshot } from './index'
import { SCHEMA_VERSION } from '../../types'

const v2Payload = {
  schemaVersion: 2,
  updatedAt: '2026-06-01T00:00:00.000Z',
  deviceId: 'dev_1',
  data: {
    paychecks: [
      { id: 'pc_1', householdId: 'hh', payDate: '2026-06-01', amount: 100000, periodStart: '2026-06-01', periodEnd: '2026-06-14' },
    ],
    bills: [],
    billInstances: [],
    goals: [],
  },
}

describe('loadSnapshot', () => {
  it('passes a current-version snapshot through unchanged', () => {
    const current = createEmptySnapshot('dev_1', '2026-06-01T00:00:00.000Z')
    const result = loadSnapshot(current)
    expect(result).toMatchObject({ ok: true, migrated: false })
    if (result.ok) expect(result.snapshot).toEqual(current)
  })

  it('migrates a v2 snapshot to current, adding an empty recurrenceRules array', () => {
    const result = loadSnapshot(v2Payload)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.migrated).toBe(true)
    expect(result.snapshot.schemaVersion).toBe(SCHEMA_VERSION)
    expect(result.snapshot.data.recurrenceRules).toEqual([])
    expect(result.snapshot.data.paychecks).toEqual(v2Payload.data.paychecks)
  })

  it('reports reason "empty" for null/undefined input', () => {
    expect(loadSnapshot(null)).toEqual({ ok: false, reason: 'empty' })
    expect(loadSnapshot(undefined)).toEqual({ ok: false, reason: 'empty' })
  })

  it('reports reason "corrupt" for garbage input instead of throwing', () => {
    const result = loadSnapshot({ nonsense: true })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('corrupt')
  })

  it('reports reason "corrupt" for a snapshot with an invalid date field', () => {
    const bad = { ...v2Payload, data: { ...v2Payload.data, paychecks: [{ ...v2Payload.data.paychecks[0], payDate: 'not-a-date' }] } }
    const result = loadSnapshot(bad)
    expect(result.ok).toBe(false)
  })
})

describe('createEmptySnapshot', () => {
  it('produces a schema-valid snapshot with empty collections', () => {
    const snap = createEmptySnapshot('dev_1', '2026-06-01T00:00:00.000Z')
    expect(snap.schemaVersion).toBe(SCHEMA_VERSION)
    expect(snap.data.household).toBeUndefined()
    expect(snap.data.paychecks).toEqual([])
    expect(snap.data.recurrenceRules).toEqual([])
  })
})
