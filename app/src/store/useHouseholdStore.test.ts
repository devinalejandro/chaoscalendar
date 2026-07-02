import { describe, expect, it } from 'vitest'
import { createHouseholdStore } from './useHouseholdStore'
import { createMemoryStorage } from '../data/storage'
import { saveSnapshot } from '../data/repository'
import { createEmptySnapshot } from '../data/migrate'

describe('createHouseholdStore — first run', () => {
  it('seeds a demonstration household when storage is empty', () => {
    const store = createHouseholdStore(createMemoryStorage())
    const { snapshot, quarantined } = store.getState()
    expect(quarantined).toBe(false)
    expect(snapshot.data.household?.name).toBe("Karla's Household")
    expect(snapshot.data.paychecks.length).toBeGreaterThan(0)
    expect(snapshot.data.billInstances.length).toBeGreaterThan(0)
  })

  it('persists the seed so a second store instance over the same storage does not reseed', () => {
    const storage = createMemoryStorage()
    const first = createHouseholdStore(storage)
    const seededAt = first.getState().snapshot.updatedAt

    const second = createHouseholdStore(storage)
    expect(second.getState().snapshot.updatedAt).toBe(seededAt)
    expect(second.getState().snapshot.data.paychecks).toEqual(first.getState().snapshot.data.paychecks)
  })
})

describe('createHouseholdStore — does not reseed real (non-empty) data', () => {
  it('keeps an explicitly empty household as empty rather than seeding over it', () => {
    const storage = createMemoryStorage()
    const empty = createEmptySnapshot('dev_1', '2026-06-01T00:00:00.000Z')
    // a household with no bills/paychecks yet, but an explicit household record
    // (e.g. after onboarding, before the first bill is added) must not be seeded over
    saveSnapshot(storage, { ...empty, data: { ...empty.data, household: { id: 'hh_real', name: 'Real', timezone: 'America/Phoenix', createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z' } } })
    const store = createHouseholdStore(storage)
    expect(store.getState().snapshot.data.household?.id).toBe('hh_real')
    expect(store.getState().snapshot.data.paychecks).toEqual([])
  })
})

describe('createHouseholdStore — actions', () => {
  it('markPaid updates status/paidDate and persists to storage', () => {
    const storage = createMemoryStorage()
    const store = createHouseholdStore(storage)
    const instance = store.getState().snapshot.data.billInstances[0]

    store.getState().markPaid(instance.id, '2026-06-05')
    const updated = store.getState().snapshot.data.billInstances.find((i) => i.id === instance.id)
    expect(updated).toMatchObject({ status: 'paid', paidDate: '2026-06-05' })

    // persisted, not just in-memory
    const reopened = createHouseholdStore(storage)
    const reopenedInstance = reopened.getState().snapshot.data.billInstances.find((i) => i.id === instance.id)
    expect(reopenedInstance).toMatchObject({ status: 'paid', paidDate: '2026-06-05' })
  })

  it('markPaid defaults paidDate to today when omitted', () => {
    const store = createHouseholdStore(createMemoryStorage())
    const instance = store.getState().snapshot.data.billInstances[0]
    store.getState().markPaid(instance.id)
    const updated = store.getState().snapshot.data.billInstances.find((i) => i.id === instance.id)
    expect(updated?.paidDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('addQuickBill creates an ad-hoc instance and assigns it to the covering paycheck window', () => {
    const store = createHouseholdStore(createMemoryStorage())
    const before = store.getState().snapshot.data.billInstances.length
    const targetWindow = store.getState().snapshot.data.paychecks[0]

    store.getState().addQuickBill({ title: 'Groceries', amount: 8000, dueDate: targetWindow.periodStart })

    const { billInstances } = store.getState().snapshot.data
    expect(billInstances).toHaveLength(before + 1)
    const created = billInstances.find((i) => i.title === 'Groceries')
    expect(created).toMatchObject({ amount: 8000, dueDate: targetWindow.periodStart, status: 'expected', paycheckId: targetWindow.id })
  })

  it('addQuickBill leaves paycheckId unset when the date matches no window', () => {
    const store = createHouseholdStore(createMemoryStorage())
    store.getState().addQuickBill({ title: 'Far future', amount: 1000, dueDate: '2099-01-01' })
    const created = store.getState().snapshot.data.billInstances.find((i) => i.title === 'Far future')
    expect(created?.paycheckId).toBeUndefined()
  })
})
