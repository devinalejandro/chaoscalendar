import { describe, expect, it } from 'vitest'
import { createMemoryStorage } from './storage'
import {
  loadHouseholdSnapshot,
  markInstancePaid,
  regenerateInstances,
  saveSnapshot,
  upsertBill,
  upsertPaycheck,
  upsertRecurrenceRule,
} from './repository'
import { createEmptySnapshot } from './migrate'
import type { Bill, RecurrenceRule } from '../types'

const NOW = '2026-06-01T00:00:00.000Z'

describe('loadHouseholdSnapshot', () => {
  it('returns an empty snapshot when storage has nothing', () => {
    const storage = createMemoryStorage()
    const { snapshot, quarantined } = loadHouseholdSnapshot(storage, 'dev_1', NOW)
    expect(quarantined).toBe(false)
    expect(snapshot.data.bills).toEqual([])
  })

  it('quarantines unparsable JSON instead of discarding it, and still returns a usable empty snapshot', () => {
    const storage = createMemoryStorage()
    storage.setItem('aurora.snapshot', '{not json')
    const { snapshot, quarantined } = loadHouseholdSnapshot(storage, 'dev_1', NOW)
    expect(quarantined).toBe(true)
    expect(snapshot.data.bills).toEqual([])
    const quarantineEntry = storage.getItem('aurora.corrupt.' + NOW.replace(/[:.]/g, '-'))
    expect(quarantineEntry).not.toBeNull()
    expect(JSON.parse(quarantineEntry!).raw).toBe('{not json')
  })

  it('quarantines a schema-invalid snapshot rather than resetting silently', () => {
    const storage = createMemoryStorage()
    storage.setItem('aurora.snapshot', JSON.stringify({ nonsense: true }))
    const { quarantined } = loadHouseholdSnapshot(storage, 'dev_1', NOW)
    expect(quarantined).toBe(true)
  })

  it('auto-migrates a legacy v2 payload and persists the upgraded shape back to storage', () => {
    const storage = createMemoryStorage()
    const v2 = {
      schemaVersion: 2,
      updatedAt: NOW,
      deviceId: 'dev_0',
      data: { paychecks: [], bills: [], billInstances: [], goals: [] },
    }
    storage.setItem('aurora.snapshot', JSON.stringify(v2))
    const { snapshot, quarantined } = loadHouseholdSnapshot(storage, 'dev_1', NOW)
    expect(quarantined).toBe(false)
    expect(snapshot.schemaVersion).toBe(3)
    const persisted = JSON.parse(storage.getItem('aurora.snapshot')!)
    expect(persisted.schemaVersion).toBe(3)
    expect(persisted.data.recurrenceRules).toEqual([])
  })
})

describe('service helpers', () => {
  it('upsertBill inserts then updates by id', () => {
    let snap = createEmptySnapshot('dev_1', NOW)
    const bill: Bill = { id: 'bill_1', householdId: 'hh', name: 'Rent', category: 'mortgage_rent', isFixed: true, active: true }
    snap = upsertBill(snap, bill)
    expect(snap.data.bills).toHaveLength(1)
    snap = upsertBill(snap, { ...bill, name: 'Rent (updated)' })
    expect(snap.data.bills).toHaveLength(1)
    expect(snap.data.bills[0].name).toBe('Rent (updated)')
  })

  it('upsertPaycheck and upsertRecurrenceRule follow the same insert/update contract', () => {
    let snap = createEmptySnapshot('dev_1', NOW)
    snap = upsertPaycheck(snap, { id: 'pc_1', householdId: 'hh', payDate: '2026-06-01', amount: 100000, periodStart: '2026-06-01', periodEnd: '2026-06-14' })
    expect(snap.data.paychecks).toHaveLength(1)
    const rule: RecurrenceRule = { id: 'rr_1', householdId: 'hh', frequency: 'monthly', dayOfMonth: 1 }
    snap = upsertRecurrenceRule(snap, rule)
    snap = upsertRecurrenceRule(snap, { ...rule, dayOfMonth: 15 })
    expect(snap.data.recurrenceRules).toHaveLength(1)
    expect(snap.data.recurrenceRules[0].dayOfMonth).toBe(15)
  })

  it('regenerateInstances materializes and assigns, and is idempotent across repeated calls', () => {
    let snap = createEmptySnapshot('dev_1', NOW)
    snap = upsertPaycheck(snap, { id: 'pc_1', householdId: 'hh', payDate: '2026-06-01', amount: 300000, periodStart: '2026-06-01', periodEnd: '2026-06-30' })
    snap = upsertRecurrenceRule(snap, { id: 'rr_1', householdId: 'hh', frequency: 'monthly', dayOfMonth: 10 })
    snap = upsertBill(snap, { id: 'bill_1', householdId: 'hh', name: 'STRATA CC', category: 'credit_card', expectedAmount: 4500, recurrenceRuleId: 'rr_1', isFixed: true, active: true })

    snap = regenerateInstances(snap, '2026-06-01', '2026-06-30')
    expect(snap.data.billInstances).toHaveLength(1)
    expect(snap.data.billInstances[0].paycheckId).toBe('pc_1')

    const again = regenerateInstances(snap, '2026-06-01', '2026-06-30')
    expect(again.data.billInstances).toHaveLength(1)
  })

  it('markInstancePaid sets status and paidDate without touching other instances', () => {
    let snap = createEmptySnapshot('dev_1', NOW)
    snap = { ...snap, data: { ...snap.data, billInstances: [
      { id: 'bi_1', householdId: 'hh', title: 'A', status: 'expected' },
      { id: 'bi_2', householdId: 'hh', title: 'B', status: 'expected' },
    ] } }
    snap = markInstancePaid(snap, 'bi_1', '2026-06-05')
    expect(snap.data.billInstances[0]).toMatchObject({ status: 'paid', paidDate: '2026-06-05' })
    expect(snap.data.billInstances[1]).toMatchObject({ status: 'expected' })
  })

  it('saveSnapshot round-trips through storage.getItem/JSON.parse', () => {
    const storage = createMemoryStorage()
    const snap = createEmptySnapshot('dev_1', NOW)
    saveSnapshot(storage, snap)
    expect(JSON.parse(storage.getItem('aurora.snapshot')!)).toEqual(snap)
  })
})
