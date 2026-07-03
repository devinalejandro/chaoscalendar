import { create, type StoreApi, type UseBoundStore } from 'zustand'
import type { Bill, BillCategory, BillInstance, Snapshot } from '../types'
import { createMemoryStorage, getBrowserStorage, type KeyValueStorage } from '../data/storage'
import {
  loadHouseholdSnapshot,
  markInstancePaid,
  regenerateInstances,
  resetFutureInstancesForBill,
  saveSnapshot,
  unmarkInstancePaid,
  upsertBill,
  upsertRecurrenceRule,
} from '../data/repository'
import { assignInstancesToPaychecks } from '../lib/windows'
import { seedHousehold } from '../data/seed'
import { newId } from '../lib/id'
import { addMonths, iso } from '../lib/dates'
import { buildRecurrenceRule, type RecurrenceInput } from '../lib/recurrence'

const DEVICE_ID_KEY = 'aurora.deviceId'

function getDeviceId(storage: KeyValueStorage): string {
  const existing = storage.getItem(DEVICE_ID_KEY)
  if (existing) return existing
  const id = newId('dev')
  storage.setItem(DEVICE_ID_KEY, id)
  return id
}

function isEmptyHousehold(snapshot: Snapshot): boolean {
  return !snapshot.data.household && snapshot.data.paychecks.length === 0 && snapshot.data.bills.length === 0
}

/** Instances are generated from today back to the earliest known paycheck
    (so a newly added bill shows up in windows already on screen) through
    6 months out — the PRD's recommended default horizon. */
function defaultHorizon(snapshot: Snapshot): { from: string; to: string } {
  const today = iso(new Date())
  const from = snapshot.data.paychecks[0]?.periodStart ?? today
  return { from, to: addMonths(today, 6) }
}

export type SaveBillInput = {
  /** omit to create a new bill */
  id?: string
  name: string
  category: BillCategory
  /** cents */
  amount: number
  recurrence: RecurrenceInput | { kind: 'once'; dueDate: string }
}

export interface HouseholdState {
  snapshot: Snapshot
  /** true when the previous local snapshot failed validation and was
      quarantined rather than discarded (see data/repository.ts) */
  quarantined: boolean
  markPaid: (instanceId: string, paidDate?: string) => void
  unmarkPaid: (instanceId: string) => void
  /** Checkbox-friendly wrapper: routes to markPaid or unmarkPaid based on
      the checkbox's new checked state, so the paid toggle is reversible. */
  setInstancePaid: (instanceId: string, paid: boolean) => void
  addQuickBill: (input: { title: string; amount: number; dueDate: string }) => void
  /** Creates or updates a Bill template (and its RecurrenceRule, if any).
      Any future not-yet-paid instances for this bill are discarded and
      regenerated from the updated template — otherwise a changed amount,
      due date, or recurrence would leave stale instances on screen for up
      to the materialization horizon. Already-paid instances are untouched.
      Safe to call repeatedly — materialization is idempotent. */
  saveBill: (input: SaveBillInput) => void
  /** Deactivating removes the bill's future not-yet-paid instances (so it
      stops counting toward Total/Bills/Left immediately) while keeping paid
      and past history. Reactivating regenerates them from the template. */
  setBillActive: (billId: string, active: boolean) => void
}

/** Builds an isolated store bound to the given storage — production uses the
    real localStorage singleton, tests inject createMemoryStorage() so each
    test gets a clean household with no cross-test bleed. */
export function createHouseholdStore(storage: KeyValueStorage): UseBoundStore<StoreApi<HouseholdState>> {
  const deviceId = getDeviceId(storage)
  const nowIso = new Date().toISOString()
  const loaded = loadHouseholdSnapshot(storage, deviceId, nowIso)

  // First run on this device: seed a demonstration household so the UI has
  // real numbers before onboarding/import exists (M4). Never reseeds over
  // real data, and never runs when a corrupt snapshot was quarantined —
  // quarantine already reduced to an empty snapshot, which would otherwise
  // look identical to a genuine first run.
  let initialSnapshot = loaded.snapshot
  if (isEmptyHousehold(initialSnapshot) && !loaded.quarantined) {
    initialSnapshot = seedHousehold(nowIso)
    saveSnapshot(storage, initialSnapshot)
  }

  return create<HouseholdState>((set, get) => {
    const persist = (next: Snapshot) => {
      saveSnapshot(storage, next)
      set({ snapshot: next })
    }

    return {
      snapshot: initialSnapshot,
      quarantined: loaded.quarantined,
      markPaid: (instanceId, paidDate) => {
        persist(markInstancePaid(get().snapshot, instanceId, paidDate ?? iso(new Date())))
      },
      unmarkPaid: (instanceId) => {
        persist(unmarkInstancePaid(get().snapshot, instanceId))
      },
      setInstancePaid: (instanceId, paid) => {
        if (paid) get().markPaid(instanceId)
        else get().unmarkPaid(instanceId)
      },
      addQuickBill: ({ title, amount, dueDate }) => {
        const snapshot = get().snapshot
        const instance: BillInstance = {
          id: newId('bi'),
          householdId: snapshot.data.household?.id ?? 'hh_local',
          title,
          amount,
          dueDate,
          status: 'expected',
        }
        const billInstances = assignInstancesToPaychecks(
          [...snapshot.data.billInstances, instance],
          snapshot.data.paychecks,
        )
        persist({ ...snapshot, data: { ...snapshot.data, billInstances } })
      },
      saveBill: (input) => {
        const snapshot = get().snapshot
        const householdId = snapshot.data.household?.id ?? 'hh_local'
        const billId = input.id ?? newId('bill')
        const previous = snapshot.data.bills.find((b) => b.id === billId)

        let next = snapshot
        let recurrenceRuleId: string | undefined
        let dueDate: string | undefined

        if (input.recurrence.kind === 'once') {
          dueDate = input.recurrence.dueDate
        } else {
          const ruleId = previous?.recurrenceRuleId ?? newId('rr')
          const rule = buildRecurrenceRule(ruleId, householdId, input.recurrence)
          next = upsertRecurrenceRule(next, rule)
          recurrenceRuleId = ruleId
        }

        const bill: Bill = {
          id: billId,
          householdId,
          name: input.name,
          category: input.category,
          expectedAmount: input.amount,
          dueDate,
          recurrenceRuleId,
          isFixed: input.recurrence.kind !== 'once',
          active: previous?.active ?? true,
        }
        next = upsertBill(next, bill)
        // Discard stale future instances before regenerating so an amount,
        // due date, or recurrence change actually reaches Today/Paychecks
        // instead of lingering at the old value until the instance is paid.
        next = resetFutureInstancesForBill(next, billId, iso(new Date()))
        const { from, to } = defaultHorizon(next)
        next = regenerateInstances(next, from, to)
        persist(next)
      },
      setBillActive: (billId, active) => {
        const snapshot = get().snapshot
        const bill = snapshot.data.bills.find((b) => b.id === billId)
        if (!bill) return
        let next = upsertBill(snapshot, { ...bill, active })
        // Deactivating: drop future unpaid instances so they stop counting
        // toward budgets immediately (materializeBillInstances would return
        // [] for an inactive bill anyway, so regenerate below is a no-op for
        // this bill and only rebuilds other bills' instances as needed).
        // Reactivating: the same reset+regenerate rebuilds them fresh.
        next = resetFutureInstancesForBill(next, billId, iso(new Date()))
        const { from, to } = defaultHorizon(next)
        next = regenerateInstances(next, from, to)
        persist(next)
      },
    }
  })
}

export const useHouseholdStore = createHouseholdStore(getBrowserStorage() ?? createMemoryStorage())
