import { create, type StoreApi, type UseBoundStore } from 'zustand'
import type { BillInstance, Snapshot } from '../types'
import { createMemoryStorage, getBrowserStorage, type KeyValueStorage } from '../data/storage'
import { loadHouseholdSnapshot, markInstancePaid, saveSnapshot } from '../data/repository'
import { assignInstancesToPaychecks } from '../lib/windows'
import { seedHousehold } from '../data/seed'
import { newId } from '../lib/id'
import { iso } from '../lib/dates'

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

export interface HouseholdState {
  snapshot: Snapshot
  /** true when the previous local snapshot failed validation and was
      quarantined rather than discarded (see data/repository.ts) */
  quarantined: boolean
  markPaid: (instanceId: string, paidDate?: string) => void
  addQuickBill: (input: { title: string; amount: number; dueDate: string }) => void
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
    }
  })
}

export const useHouseholdStore = createHouseholdStore(getBrowserStorage() ?? createMemoryStorage())
