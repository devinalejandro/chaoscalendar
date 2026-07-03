import { create, type StoreApi, type UseBoundStore } from 'zustand'
import type { Bill, BillCategory, BillInstance, Snapshot } from '../types'
import { createMemoryStorage, getBrowserStorage, type KeyValueStorage } from '../data/storage'
import {
  loadHouseholdSnapshot,
  loadLastReplacedSnapshot,
  markInstancePaid,
  regenerateInstances,
  resetFutureInstancesForBill,
  saveLastReplacedSnapshot,
  saveSnapshot,
  unmarkInstancePaid,
  upsertBill,
  upsertGoal,
  upsertPaycheck,
  upsertRecurrenceRule,
} from '../data/repository'
import { assignInstancesToPaychecks, generatePaychecks } from '../lib/windows'
import { seedHousehold } from '../data/seed'
import { newId } from '../lib/id'
import { addMonths, iso } from '../lib/dates'
import { buildRecurrenceRule, type RecurrenceInput } from '../lib/recurrence'
import { findMatchingBillTemplate } from '../lib/billLearning'
import { appendAuditEvent } from '../lib/audit'

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

export interface AcceptedImportItem {
  type: 'paycheck' | 'bill' | 'appointment'
  title: string
  /** integer cents, null when no amount was accepted */
  amount: number | null
  /** ISO date — required; the review screen only allows accepting a row with a resolved date */
  date: string
  paid: boolean
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
  lastReplacedSnapshot: Snapshot | null
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
  /** Persists exactly the accepted rows from the paste-import review screen
      (features/import) — nothing else. Paycheck rows generate windows for
      those exact paydays; bill/appointment rows become ad-hoc BillInstances,
      immediately assigned to their paycheck window. A row that already
      matches an existing instance (same title/date/amount) is skipped so
      re-running an import isn't destructive or duplicative. */
  applyImport: (items: AcceptedImportItem[]) => void
  saveGoal: (input: { id?: string; name: string; targetAmount: number; targetDate?: string; currentAmount?: number }) => void
  /** Wholesale-replaces the household (Migration "Save migrated data",
      Admin "Pull snapshot", Settings "Restore backup"). The snapshot being
      overwritten is saved to storage first — not just in-memory state — so
      undoReplaceSnapshot() survives a page reload. Callers should still
      confirm with the user before calling this; it has no confirmation of
      its own. */
  replaceSnapshot: (snapshot: Snapshot) => void
  undoReplaceSnapshot: () => void
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
  const initialLastReplaced = loadLastReplacedSnapshot(storage)

  return create<HouseholdState>((set, get) => {
    const persist = (next: Snapshot) => {
      saveSnapshot(storage, next)
      set({ snapshot: next })
    }
    const persistAudited = (
      next: Snapshot,
      event: { action: string; entityType: string; entityId: string; before?: unknown; after?: unknown },
    ) => {
      persist(appendAuditEvent(next, event))
    }

    return {
      snapshot: initialSnapshot,
      lastReplacedSnapshot: initialLastReplaced,
      quarantined: loaded.quarantined,
      markPaid: (instanceId, paidDate) => {
        const before = get().snapshot.data.billInstances.find((i) => i.id === instanceId)
        const next = markInstancePaid(get().snapshot, instanceId, paidDate ?? iso(new Date()))
        const after = next.data.billInstances.find((i) => i.id === instanceId)
        persistAudited(next, { action: 'bill_instance.mark_paid', entityType: 'billInstance', entityId: instanceId, before, after })
      },
      unmarkPaid: (instanceId) => {
        const before = get().snapshot.data.billInstances.find((i) => i.id === instanceId)
        const next = unmarkInstancePaid(get().snapshot, instanceId)
        const after = next.data.billInstances.find((i) => i.id === instanceId)
        persistAudited(next, { action: 'bill_instance.unmark_paid', entityType: 'billInstance', entityId: instanceId, before, after })
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
        const next = { ...snapshot, data: { ...snapshot.data, billInstances } }
        persistAudited(next, { action: 'bill_instance.quick_add', entityType: 'billInstance', entityId: instance.id, after: instance })
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
        persistAudited(next, { action: input.id ? 'bill.update' : 'bill.create', entityType: 'bill', entityId: billId, before: previous, after: bill })
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
        persistAudited(next, { action: active ? 'bill.activate' : 'bill.deactivate', entityType: 'bill', entityId: billId, before: bill, after: { ...bill, active } })
      },
      applyImport: (items) => {
        if (!items.length) return
        const snapshot = get().snapshot
        const householdId = snapshot.data.household?.id ?? 'hh_local'
        let next = snapshot

        const paydayItems = items.filter((i) => i.type === 'paycheck')
        if (paydayItems.length) {
          const amount = paydayItems.find((p) => p.amount != null)?.amount ?? next.data.paychecks[0]?.amount ?? 0
          const explicitDates = [...new Set(paydayItems.map((p) => p.date))].sort()
          // count = explicitDates.length: only materialize the paydays actually
          // in this paste, no speculative extension beyond what was parsed.
          const generated = generatePaychecks(
            { frequency: 'custom', amount, baseDate: explicitDates[0], explicitDates, count: explicitDates.length },
            householdId,
          )
          generated.forEach((pc) => {
            const existing = next.data.paychecks.find((p) => p.id === pc.id)
            next = upsertPaycheck(next, existing ? { ...existing, amount: pc.amount, payDate: pc.payDate } : pc)
          })
        }

        const billLike = items.filter((i) => i.type === 'bill' || i.type === 'appointment')
        const newInstances: BillInstance[] = []
        const updatedBillIds = new Set<string>()
        billLike.forEach((i) => {
          let billId: string | undefined
          // Only reconcile against a bill template the user already set up
          // (e.g. in the Bills tab) — never fabricate a new recurring
          // monthly template from an import line. A pasted paycheck note
          // has no way to say "this repeats"; assuming every dollar amount
          // next to a date is a permanent monthly charge silently corrupts
          // every future budget/prediction total for what may well have
          // been a one-time bill. If the user wants recurrence, they add it
          // explicitly on the Bills tab (saveBill), which then becomes the
          // matchable template the next import reconciles against.
          if (i.type === 'bill' && i.amount != null) {
            const matchedBill = findMatchingBillTemplate(next.data.bills, i.title)
            if (matchedBill) {
              billId = matchedBill.id
              if (matchedBill.expectedAmount !== i.amount) {
                next = upsertBill(next, { ...matchedBill, expectedAmount: i.amount })
                updatedBillIds.add(matchedBill.id)
              }
            }
          }

          const match = next.data.billInstances.find(
            (existing) =>
              existing.dueDate === i.date &&
              existing.amount === (i.amount ?? undefined) &&
              (existing.title === i.title || (billId != null && existing.billId === billId)),
          )
          if (!match) {
            newInstances.push({
              id: newId('bi'),
              billId,
              householdId,
              title: i.title,
              amount: i.amount ?? undefined,
              dueDate: i.date,
              status: i.paid ? 'paid' : 'expected',
              paidDate: i.paid ? i.date : undefined,
            })
          } else if (i.paid && match.status !== 'paid') {
            // Already tracked (e.g. materialized from a fixed-bill template)
            // but the paste's ✅ says it's actually been paid — reconcile
            // instead of silently no-op'ing or creating a duplicate.
            next = markInstancePaid(next, match.id, i.date)
          }
        })

        if (paydayItems.length || newInstances.length) {
          // Re-assign every instance, not just the new ones — new paycheck
          // windows from this import can also cover pre-existing instances.
          const billInstances = assignInstancesToPaychecks([...next.data.billInstances, ...newInstances], next.data.paychecks)
          next = { ...next, data: { ...next.data, billInstances } }
        }

        if (updatedBillIds.size) {
          // A matched template's amount changed — discard its stale future
          // instances so the new amount actually reaches Today/Paychecks
          // (same reasoning as saveBill's resetFutureInstancesForBill call).
          const today = iso(new Date())
          updatedBillIds.forEach((id) => {
            next = resetFutureInstancesForBill(next, id, today)
          })
          const { from, to } = defaultHorizon(next)
          next = regenerateInstances(next, from, to)
        }

        persistAudited(next, { action: 'import.apply', entityType: 'import', entityId: newId('import'), after: { acceptedCount: items.length } })
      },
      saveGoal: (input) => {
        const snapshot = get().snapshot
        const householdId = snapshot.data.household?.id ?? 'hh_local'
        const goalId = input.id ?? newId('goal')
        const before = snapshot.data.goals.find((g) => g.id === goalId)
        const goal = {
            id: goalId,
            householdId,
            name: input.name,
            targetAmount: input.targetAmount,
            targetDate: input.targetDate,
            currentAmount: input.currentAmount ?? 0,
            status: 'active',
          } as const
        persistAudited(upsertGoal(snapshot, goal), { action: input.id ? 'goal.update' : 'goal.create', entityType: 'goal', entityId: goalId, before, after: goal })
      },
      replaceSnapshot: (snapshot) => {
        const outgoing = get().snapshot
        saveLastReplacedSnapshot(storage, outgoing)
        set({ lastReplacedSnapshot: outgoing })
        persistAudited(snapshot, { action: 'snapshot.replace', entityType: 'snapshot', entityId: snapshot.data.household?.id ?? 'local', after: { schemaVersion: snapshot.schemaVersion } })
      },
      undoReplaceSnapshot: () => {
        const previous = get().lastReplacedSnapshot
        if (!previous) return
        const next = appendAuditEvent(previous, { action: 'snapshot.restore_undo', entityType: 'snapshot', entityId: previous.data.household?.id ?? 'local' })
        saveSnapshot(storage, next)
        saveLastReplacedSnapshot(storage, null)
        set({ snapshot: next, lastReplacedSnapshot: null })
      },
    }
  })
}

export const useHouseholdStore = createHouseholdStore(getBrowserStorage() ?? createMemoryStorage())
