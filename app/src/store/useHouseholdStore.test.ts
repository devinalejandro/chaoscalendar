import { describe, expect, it } from 'vitest'
import { createHouseholdStore } from './useHouseholdStore'
import { createMemoryStorage } from '../data/storage'
import { saveSnapshot } from '../data/repository'
import { createEmptySnapshot } from '../data/migrate'
import { iso } from '../lib/dates'

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
  it('removes future/today unpaid instances immediately, keeping only past-due history', () => {
    const store = createHouseholdStore(createMemoryStorage())
    store.getState().saveBill({ name: 'Water', category: 'utilities', amount: 7000, recurrence: { kind: 'monthly', dayOfMonth: 18 } })
    const water = store.getState().snapshot.data.bills.find((b) => b.name === 'Water')!
    const before = store.getState().snapshot.data.billInstances.filter((i) => i.billId === water.id)
    const today = iso(new Date())
    const pastCount = before.filter((i) => i.dueDate! < today).length
    const futureOrTodayCount = before.filter((i) => i.dueDate! >= today).length
    expect(futureOrTodayCount).toBeGreaterThan(0) // sanity: there is something to remove

    store.getState().setBillActive(water.id, false)

    expect(store.getState().snapshot.data.bills.find((b) => b.id === water.id)?.active).toBe(false)
    const after = store.getState().snapshot.data.billInstances.filter((i) => i.billId === water.id)
    expect(after).toHaveLength(pastCount)
    expect(after.every((i) => i.dueDate! < today)).toBe(true)
  })

  it('keeps a paid past instance when the bill is deactivated', () => {
    const store = createHouseholdStore(createMemoryStorage())
    store.getState().saveBill({ name: 'Water', category: 'utilities', amount: 7000, recurrence: { kind: 'monthly', dayOfMonth: 18 } })
    const water = store.getState().snapshot.data.bills.find((b) => b.name === 'Water')!
    const firstInstance = store.getState().snapshot.data.billInstances.find((i) => i.billId === water.id)!
    store.getState().markPaid(firstInstance.id, '2026-06-18')

    store.getState().setBillActive(water.id, false)

    const remaining = store.getState().snapshot.data.billInstances.filter((i) => i.billId === water.id)
    expect(remaining).toEqual([{ ...firstInstance, status: 'paid', paidDate: '2026-06-18' }])
  })

  it('reactivating regenerates the future instances that were removed on deactivation', () => {
    const store = createHouseholdStore(createMemoryStorage())
    store.getState().saveBill({ name: 'Water', category: 'utilities', amount: 7000, recurrence: { kind: 'monthly', dayOfMonth: 18 } })
    const water = store.getState().snapshot.data.bills.find((b) => b.name === 'Water')!
    const today = iso(new Date())
    store.getState().setBillActive(water.id, false)
    expect(store.getState().snapshot.data.billInstances.filter((i) => i.billId === water.id && i.dueDate! >= today)).toHaveLength(0)

    store.getState().setBillActive(water.id, true)

    const future = store.getState().snapshot.data.billInstances.filter((i) => i.billId === water.id && i.dueDate! >= today)
    expect(future.length).toBeGreaterThan(0)
    expect(future.every((i) => i.amount === 7000)).toBe(true)
  })
})

describe('createHouseholdStore — editing a bill reconciles future instances', () => {
  it('updates the amount on existing future unpaid instances, not just new ones', () => {
    const store = createHouseholdStore(createMemoryStorage())
    store.getState().saveBill({ name: 'Netflix v2', category: 'subscriptions', amount: 2934, recurrence: { kind: 'monthly', dayOfMonth: 7 } })
    const bill = store.getState().snapshot.data.bills.find((b) => b.name === 'Netflix v2')!
    const today = iso(new Date())
    const before = store.getState().snapshot.data.billInstances.filter((i) => i.billId === bill.id)
    expect(before.length).toBeGreaterThan(0)
    expect(before.every((i) => i.amount === 2934)).toBe(true)

    store.getState().saveBill({ id: bill.id, name: 'Netflix v2', category: 'subscriptions', amount: 3199, recurrence: { kind: 'monthly', dayOfMonth: 7 } })

    const afterAll = store.getState().snapshot.data.billInstances.filter((i) => i.billId === bill.id && i.status !== 'paid')
    const future = afterAll.filter((i) => i.dueDate! >= today)
    const past = afterAll.filter((i) => i.dueDate! < today)
    expect(future.length).toBeGreaterThan(0)
    expect(future.every((i) => i.amount === 3199)).toBe(true)
    // an already-past, still-unpaid occurrence keeps the amount that was actually due at the time
    expect(past.every((i) => i.amount === 2934)).toBe(true)
  })

  it('does not change an already-paid instance when the template amount changes', () => {
    const store = createHouseholdStore(createMemoryStorage())
    store.getState().saveBill({ name: 'Netflix v2', category: 'subscriptions', amount: 2934, recurrence: { kind: 'monthly', dayOfMonth: 7 } })
    const bill = store.getState().snapshot.data.bills.find((b) => b.name === 'Netflix v2')!
    const paidInstance = store.getState().snapshot.data.billInstances.find((i) => i.billId === bill.id)!
    store.getState().markPaid(paidInstance.id, '2026-06-07')

    store.getState().saveBill({ id: bill.id, name: 'Netflix v2', category: 'subscriptions', amount: 3199, recurrence: { kind: 'monthly', dayOfMonth: 7 } })

    const stillThere = store.getState().snapshot.data.billInstances.find((i) => i.id === paidInstance.id)!
    expect(stillThere).toMatchObject({ amount: 2934, status: 'paid', paidDate: '2026-06-07' })
  })
})

describe('createHouseholdStore — setInstancePaid is reversible', () => {
  it('marks an instance paid and then back to unpaid', () => {
    const store = createHouseholdStore(createMemoryStorage())
    const instance = store.getState().snapshot.data.billInstances[0]

    store.getState().setInstancePaid(instance.id, true)
    expect(store.getState().snapshot.data.billInstances.find((i) => i.id === instance.id)?.status).toBe('paid')

    store.getState().setInstancePaid(instance.id, false)
    const reverted = store.getState().snapshot.data.billInstances.find((i) => i.id === instance.id)!
    expect(reverted.status).toBe('expected')
    expect(reverted.paidDate).toBeUndefined()
  })
})

describe('createHouseholdStore — applyImport', () => {
  it('does nothing when given an empty list (nothing saves unreviewed by default)', () => {
    const store = createHouseholdStore(createMemoryStorage())
    const before = store.getState().snapshot
    store.getState().applyImport([])
    expect(store.getState().snapshot).toEqual(before)
  })

  it('creates exactly the accepted paycheck windows for the given paydays, no more', () => {
    const store = createHouseholdStore(createMemoryStorage())
    store.getState().applyImport([
      { type: 'paycheck', title: 'Paycheck', amount: 189348, date: '2026-06-03', paid: false },
      { type: 'paycheck', title: 'Paycheck', amount: 189348, date: '2026-06-17', paid: false },
    ])
    const newWindows = store.getState().snapshot.data.paychecks.filter((p) => p.id === 'pc_2026-06-03' || p.id === 'pc_2026-06-17')
    expect(newWindows).toHaveLength(2)
    expect(newWindows.every((p) => p.amount === 189348)).toBe(true)
    expect(newWindows.find((p) => p.id === 'pc_2026-06-03')).toMatchObject({ periodStart: '2026-06-03', periodEnd: '2026-06-16' })
  })

  it('creates bill/appointment instances and assigns them to the imported paycheck windows', () => {
    const store = createHouseholdStore(createMemoryStorage())
    store.getState().applyImport([
      { type: 'paycheck', title: 'Paycheck', amount: 189348, date: '2026-06-03', paid: false },
      { type: 'bill', title: 'Imported Rent', amount: 180000, date: '2026-06-06', paid: false },
      { type: 'appointment', title: 'Dentist', amount: 7500, date: '2026-06-11', paid: false },
    ])
    const rent = store.getState().snapshot.data.billInstances.find((i) => i.title === 'Imported Rent')!
    expect(rent).toMatchObject({ amount: 180000, dueDate: '2026-06-06', status: 'expected', paycheckId: 'pc_2026-06-03' })
    const dentist = store.getState().snapshot.data.billInstances.find((i) => i.title === 'Dentist')!
    expect(dentist).toMatchObject({ amount: 7500, dueDate: '2026-06-11', paycheckId: 'pc_2026-06-03' })
  })

  it('marks an accepted paid item as paid with paidDate set to its due date', () => {
    const store = createHouseholdStore(createMemoryStorage())
    store.getState().applyImport([{ type: 'bill', title: 'Netflix', amount: 2934, date: '2026-06-07', paid: true }])
    const netflix = store.getState().snapshot.data.billInstances.find((i) => i.title === 'Netflix')!
    expect(netflix).toMatchObject({ status: 'paid', paidDate: '2026-06-07' })
  })

  it('learns an accepted imported bill as a monthly bill template and generates future instances', () => {
    const store = createHouseholdStore(createMemoryStorage())

    store.getState().applyImport([{ type: 'bill', title: 'TEP', amount: 15474, date: '2026-07-22', paid: false }])

    const bill = store.getState().snapshot.data.bills.find((b) => b.name === 'TEP')!
    expect(bill).toMatchObject({ expectedAmount: 15474, dueDay: 22, category: 'utilities', isFixed: true, active: true })
    expect(bill.recurrenceRuleId).toBeTruthy()
    const instances = store.getState().snapshot.data.billInstances.filter((i) => i.billId === bill.id)
    expect(instances.some((i) => i.dueDate === '2026-07-22' && i.amount === 15474)).toBe(true)
    expect(instances.some((i) => i.dueDate === '2026-08-22' && i.amount === 15474)).toBe(true)
  })

  it('updates an existing learned template instead of creating a duplicate template', () => {
    const store = createHouseholdStore(createMemoryStorage())

    store.getState().applyImport([{ type: 'bill', title: 'STRATA CC scheduled', amount: 4500, date: '2026-07-10', paid: false }])

    const strataBills = store.getState().snapshot.data.bills.filter((b) => b.name === 'STRATA CC')
    expect(strataBills).toHaveLength(1)
    expect(strataBills[0]).toMatchObject({ expectedAmount: 4500, dueDay: 10 })
    const instancesOnDate = store
      .getState()
      .snapshot.data.billInstances.filter((i) => i.billId === strataBills[0].id && i.dueDate === '2026-07-10' && i.amount === 4500)
    expect(instancesOnDate).toHaveLength(1)
  })

  it('reconciles paid status onto a matching instance instead of skipping or duplicating it', () => {
    // The seeded household already has an unpaid Netflix instance materialized
    // for 2026-06-07 from the Bills-tab template. Importing a paste that
    // marks that same bill paid (✅) should flip the existing instance, not
    // silently no-op (the old dedupe behavior) or create a second row.
    const store = createHouseholdStore(createMemoryStorage())
    const before = store.getState().snapshot.data.billInstances.filter((i) => i.title === 'Netflix' && i.dueDate === '2026-06-07')
    expect(before).toHaveLength(1)
    expect(before[0].status).toBe('expected')
    const existingId = before[0].id

    store.getState().applyImport([{ type: 'bill', title: 'Netflix', amount: 2934, date: '2026-06-07', paid: true }])

    const after = store.getState().snapshot.data.billInstances.filter((i) => i.title === 'Netflix' && i.dueDate === '2026-06-07')
    expect(after).toHaveLength(1)
    expect(after[0]).toMatchObject({ id: existingId, status: 'paid', paidDate: '2026-06-07' })
  })

  it('skips a row that already matches an existing instance (title, date, amount)', () => {
    const store = createHouseholdStore(createMemoryStorage())
    const item = { type: 'bill' as const, title: 'Imported Rent', amount: 180000, date: '2026-06-06', paid: false }
    store.getState().applyImport([item])
    const countAfterFirst = store
      .getState()
      .snapshot.data.billInstances.filter((i) => i.title === 'Imported Rent' && i.dueDate === item.date && i.amount === item.amount).length

    store.getState().applyImport([item])
    const countAfterSecond = store
      .getState()
      .snapshot.data.billInstances.filter((i) => i.title === 'Imported Rent' && i.dueDate === item.date && i.amount === item.amount).length

    expect(countAfterSecond).toBe(countAfterFirst)
    expect(countAfterFirst).toBe(1)
  })

  it('falls back to an existing paycheck amount when a re-import omits the header amount', () => {
    const store = createHouseholdStore(createMemoryStorage()) // seeded household already has $1,893.48 paychecks
    const existingAmount = store.getState().snapshot.data.paychecks[0].amount
    store.getState().applyImport([{ type: 'paycheck', title: 'Paycheck', amount: null, date: '2026-09-02', paid: false }])
    const created = store.getState().snapshot.data.paychecks.find((p) => p.id === 'pc_2026-09-02')!
    expect(created.amount).toBe(existingAmount)
  })

  it('does not stretch an existing paycheck window when a partial PAYDAYS header is imported', () => {
    const store = createHouseholdStore(createMemoryStorage())
    const before = store.getState().snapshot.data.paychecks.find((p) => p.id === 'pc_2026-07-01')!
    expect(before).toMatchObject({ periodStart: '2026-07-01', periodEnd: '2026-07-14' })

    store.getState().applyImport([
      { type: 'paycheck', title: 'Paycheck', amount: 189348, date: '2026-07-01', paid: false },
      { type: 'paycheck', title: 'Paycheck', amount: 189348, date: '2026-07-29', paid: false },
    ])

    const after = store.getState().snapshot.data.paychecks.find((p) => p.id === 'pc_2026-07-01')!
    expect(after).toMatchObject({ periodStart: '2026-07-01', periodEnd: '2026-07-14' })
  })
})

describe('createHouseholdStore goals', () => {
  it('saves and updates a persisted planning goal', () => {
    const storage = createMemoryStorage()
    const store = createHouseholdStore(storage)

    store.getState().saveGoal({ name: 'Vacation', targetAmount: 120000 })

    const goal = store.getState().snapshot.data.goals.find((g) => g.name === 'Vacation')!
    expect(goal).toMatchObject({ targetAmount: 120000, currentAmount: 0, status: 'active' })

    store.getState().saveGoal({ id: goal.id, name: 'Disney trip', targetAmount: 150000 })
    const reopened = createHouseholdStore(storage)
    expect(reopened.getState().snapshot.data.goals).toHaveLength(1)
    expect(reopened.getState().snapshot.data.goals[0]).toMatchObject({ id: goal.id, name: 'Disney trip', targetAmount: 150000 })
  })
})

describe('createHouseholdStore recovery', () => {
  it('keeps a one-step undo snapshot when replacing data', () => {
    const storage = createMemoryStorage()
    const store = createHouseholdStore(storage)
    const original = store.getState().snapshot
    const replacement = {
      ...original,
      updatedAt: '2026-07-02T00:00:00.000Z',
      data: {
        ...original.data,
        goals: [
          {
            id: 'goal_restore',
            householdId: original.data.household?.id ?? 'hh',
            name: 'Restore test',
            targetAmount: 1000,
            currentAmount: 0,
            status: 'active' as const,
          },
        ],
      },
    }

    store.getState().replaceSnapshot(replacement)
    expect(store.getState().snapshot.data.goals[0].name).toBe('Restore test')
    expect(store.getState().lastReplacedSnapshot).toEqual(original)

    store.getState().undoReplaceSnapshot()

    expect({ ...store.getState().snapshot, data: { ...store.getState().snapshot.data, auditEvents: [] } }).toEqual(original)
    expect(store.getState().snapshot.data.auditEvents[0]).toMatchObject({ action: 'snapshot.restore_undo' })
    expect(store.getState().lastReplacedSnapshot).toBeNull()
    const reopened = createHouseholdStore(storage)
    expect(reopened.getState().snapshot.data.auditEvents[0]).toMatchObject({ action: 'snapshot.restore_undo' })
  })
})
