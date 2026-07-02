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

describe('createHouseholdStore — saveBill', () => {
  it('creates a monthly recurring bill and materializes instances over the default ~6-month horizon', () => {
    const store = createHouseholdStore(createMemoryStorage())
    const bills = store.getState().snapshot.data.bills.length

    store.getState().saveBill({ name: 'Water', category: 'utilities', amount: 7000, recurrence: { kind: 'monthly', dayOfMonth: 18 } })

    const { bills: newBills, billInstances, recurrenceRules } = store.getState().snapshot.data
    expect(newBills).toHaveLength(bills + 1)
    const water = newBills.find((b) => b.name === 'Water')!
    expect(water.isFixed).toBe(true)
    expect(water.active).toBe(true)
    expect(recurrenceRules.some((r) => r.id === water.recurrenceRuleId)).toBe(true)

    const waterInstances = billInstances.filter((i) => i.billId === water.id)
    // ~6 months out from today should produce 6 or 7 monthly occurrences
    expect(waterInstances.length).toBeGreaterThanOrEqual(5)
    expect(waterInstances.every((i) => i.amount === 7000 && i.title === 'Water')).toBe(true)
  })

  it('is idempotent: saving the same bill again does not duplicate instances', () => {
    const store = createHouseholdStore(createMemoryStorage())
    store.getState().saveBill({ name: 'Water', category: 'utilities', amount: 7000, recurrence: { kind: 'monthly', dayOfMonth: 18 } })
    const water = store.getState().snapshot.data.bills.find((b) => b.name === 'Water')!
    const countAfterFirst = store.getState().snapshot.data.billInstances.filter((i) => i.billId === water.id).length

    // "editing and re-saving" the same bill (same id, same recurrence)
    store.getState().saveBill({ id: water.id, name: 'Water', category: 'utilities', amount: 7000, recurrence: { kind: 'monthly', dayOfMonth: 18 } })
    const countAfterSecond = store.getState().snapshot.data.billInstances.filter((i) => i.billId === water.id).length

    expect(countAfterSecond).toBe(countAfterFirst)
  })

  it('editing a bill updates the template without mutating instances already generated', () => {
    const store = createHouseholdStore(createMemoryStorage())
    store.getState().saveBill({ name: 'Water', category: 'utilities', amount: 7000, recurrence: { kind: 'monthly', dayOfMonth: 18 } })
    const water = store.getState().snapshot.data.bills.find((b) => b.name === 'Water')!
    const firstInstance = store.getState().snapshot.data.billInstances.find((i) => i.billId === water.id)!
    store.getState().markPaid(firstInstance.id, '2026-06-18')

    store.getState().saveBill({ id: water.id, name: 'Water bill', category: 'utilities', amount: 7500, recurrence: { kind: 'monthly', dayOfMonth: 18 } })

    const updatedTemplate = store.getState().snapshot.data.bills.find((b) => b.id === water.id)!
    expect(updatedTemplate.name).toBe('Water bill')
    expect(updatedTemplate.expectedAmount).toBe(7500)
    // the already-paid instance is untouched by the template edit
    const stillPaid = store.getState().snapshot.data.billInstances.find((i) => i.id === firstInstance.id)!
    expect(stillPaid).toMatchObject({ status: 'paid', paidDate: '2026-06-18', title: 'Water', amount: 7000 })
  })

  it('creates a one-time bill with a single instance on its due date', () => {
    const store = createHouseholdStore(createMemoryStorage())
    const target = store.getState().snapshot.data.paychecks[0].periodStart
    store.getState().saveBill({ name: 'Vet visit', category: 'other', amount: 12000, recurrence: { kind: 'once', dueDate: target } })

    const bill = store.getState().snapshot.data.bills.find((b) => b.name === 'Vet visit')!
    expect(bill.isFixed).toBe(false)
    expect(bill.recurrenceRuleId).toBeUndefined()
    const instances = store.getState().snapshot.data.billInstances.filter((i) => i.billId === bill.id)
    expect(instances).toHaveLength(1)
    expect(instances[0].dueDate).toBe(target)
  })
})

describe('createHouseholdStore — setBillActive', () => {
  it('stops future materialization but keeps existing instances', () => {
    const store = createHouseholdStore(createMemoryStorage())
    store.getState().saveBill({ name: 'Water', category: 'utilities', amount: 7000, recurrence: { kind: 'monthly', dayOfMonth: 18 } })
    const water = store.getState().snapshot.data.bills.find((b) => b.name === 'Water')!
    const countBefore = store.getState().snapshot.data.billInstances.filter((i) => i.billId === water.id).length
    expect(countBefore).toBeGreaterThan(0)

    store.getState().setBillActive(water.id, false)

    expect(store.getState().snapshot.data.bills.find((b) => b.id === water.id)?.active).toBe(false)
    const countAfter = store.getState().snapshot.data.billInstances.filter((i) => i.billId === water.id).length
    expect(countAfter).toBe(countBefore)
  })
})
