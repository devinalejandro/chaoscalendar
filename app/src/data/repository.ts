import type { Bill, BillInstance, Goal, Paycheck, RecurrenceRule, Snapshot } from '../types'
import { Snapshot as SnapshotSchema } from '../types'
import { createEmptySnapshot, loadSnapshot } from './migrate'
import type { KeyValueStorage } from './storage'
import { assignInstancesToPaychecks } from '../lib/windows'
import { materializeAll } from '../lib/billInstances'

const STORAGE_KEY = 'aurora.snapshot'
const QUARANTINE_PREFIX = 'aurora.corrupt.'
const LAST_REPLACED_KEY = 'aurora.lastReplaced'

export interface LoadOutcome {
  snapshot: Snapshot
  /** true when the previous localStorage contents failed validation and were
      preserved under a aurora.corrupt.* key instead of being discarded. */
  quarantined: boolean
}

/** Loads the household snapshot from storage, migrating legacy shapes
    in-place and quarantining (never discarding) anything that fails
    validation — malformed JSON, a schema version with no migration path,
    or a migration that produces an invalid result. */
export function loadHouseholdSnapshot(storage: KeyValueStorage, deviceId: string, nowIso: string): LoadOutcome {
  const raw = storage.getItem(STORAGE_KEY)
  if (raw === null) return { snapshot: createEmptySnapshot(deviceId, nowIso), quarantined: false }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (e) {
    quarantine(storage, raw, nowIso, e instanceof Error ? e.message : 'JSON.parse failed')
    return { snapshot: createEmptySnapshot(deviceId, nowIso), quarantined: true }
  }

  const result = loadSnapshot(parsed)
  if (result.ok) {
    if (result.migrated) saveSnapshot(storage, result.snapshot)
    return { snapshot: result.snapshot, quarantined: false }
  }
  if (result.reason === 'empty') return { snapshot: createEmptySnapshot(deviceId, nowIso), quarantined: false }

  quarantine(storage, result.raw, nowIso, result.error)
  return { snapshot: createEmptySnapshot(deviceId, nowIso), quarantined: true }
}

function quarantine(storage: KeyValueStorage, raw: unknown, nowIso: string, error: string): void {
  const key = QUARANTINE_PREFIX + nowIso.replace(/[:.]/g, '-')
  try {
    storage.setItem(key, JSON.stringify({ error, raw }))
  } catch {
    // best effort — a full quota should not prevent the app from loading
  }
}

export function saveSnapshot(storage: KeyValueStorage, snapshot: Snapshot): void {
  const validated = SnapshotSchema.parse(snapshot) // throws on a programmer error, never during load
  storage.setItem(STORAGE_KEY, JSON.stringify(validated))
}

/**
 * Backup of the snapshot a destructive replaceSnapshot() call is about to
 * overwrite. Written to storage (not just in-memory state) so the one-step
 * undo survives a page reload — replaceSnapshot is called from Migration,
 * Admin "Pull snapshot", and Settings "Restore backup", all of which can
 * otherwise silently discard real household data with no way back once the
 * tab closes.
 */
export function saveLastReplacedSnapshot(storage: KeyValueStorage, snapshot: Snapshot | null): void {
  if (snapshot === null) {
    storage.removeItem(LAST_REPLACED_KEY)
    return
  }
  storage.setItem(LAST_REPLACED_KEY, JSON.stringify(snapshot))
}

export function loadLastReplacedSnapshot(storage: KeyValueStorage): Snapshot | null {
  const raw = storage.getItem(LAST_REPLACED_KEY)
  if (raw === null) return null
  try {
    const parsed = SnapshotSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/* ---- pure snapshot-mutation helpers (service layer) ----
   Every function takes a Snapshot and returns a new Snapshot. UI state
   (M2+) calls these and persists the result via saveSnapshot; nothing here
   touches storage directly except the load/save/quarantine functions above. */

export function upsertBill(snapshot: Snapshot, bill: Bill): Snapshot {
  const exists = snapshot.data.bills.some((b) => b.id === bill.id)
  const bills = exists ? snapshot.data.bills.map((b) => (b.id === bill.id ? bill : b)) : [...snapshot.data.bills, bill]
  return { ...snapshot, data: { ...snapshot.data, bills } }
}

export function upsertPaycheck(snapshot: Snapshot, paycheck: Paycheck): Snapshot {
  const exists = snapshot.data.paychecks.some((p) => p.id === paycheck.id)
  const paychecks = exists
    ? snapshot.data.paychecks.map((p) => (p.id === paycheck.id ? paycheck : p))
    : [...snapshot.data.paychecks, paycheck]
  return { ...snapshot, data: { ...snapshot.data, paychecks } }
}

export function setPaychecks(snapshot: Snapshot, paychecks: Paycheck[]): Snapshot {
  return { ...snapshot, data: { ...snapshot.data, paychecks } }
}

export function upsertRecurrenceRule(snapshot: Snapshot, rule: RecurrenceRule): Snapshot {
  const exists = snapshot.data.recurrenceRules.some((r) => r.id === rule.id)
  const recurrenceRules = exists
    ? snapshot.data.recurrenceRules.map((r) => (r.id === rule.id ? rule : r))
    : [...snapshot.data.recurrenceRules, rule]
  return { ...snapshot, data: { ...snapshot.data, recurrenceRules } }
}

/** Generates missing BillInstances for every active bill up to `horizonEnd`,
    then re-assigns every instance to its paycheck window. Safe to call
    repeatedly — materializeAll never duplicates an existing due date. */
export function regenerateInstances(snapshot: Snapshot, from: string, horizonEnd: string): Snapshot {
  const created = materializeAll({
    bills: snapshot.data.bills,
    rules: snapshot.data.recurrenceRules,
    existing: snapshot.data.billInstances,
    from,
    to: horizonEnd,
  })
  const billInstances = assignInstancesToPaychecks([...snapshot.data.billInstances, ...created], snapshot.data.paychecks)
  return { ...snapshot, data: { ...snapshot.data, billInstances } }
}

export function markInstancePaid(snapshot: Snapshot, instanceId: string, paidDate: string): Snapshot {
  const billInstances = snapshot.data.billInstances.map((i) =>
    i.id === instanceId ? { ...i, status: 'paid' as const, paidDate } : i,
  )
  return { ...snapshot, data: { ...snapshot.data, billInstances } }
}

/** Reverses markInstancePaid — used by the paid checkbox so marking a bill
    paid by mistake can be undone from Today/Paychecks. */
export function unmarkInstancePaid(snapshot: Snapshot, instanceId: string): Snapshot {
  const billInstances = snapshot.data.billInstances.map((i) =>
    i.id === instanceId ? { ...i, status: 'expected' as const, paidDate: undefined } : i,
  )
  return { ...snapshot, data: { ...snapshot.data, billInstances } }
}

/**
 * Removes a bill's future (dueDate >= fromIso) not-yet-paid instances so a
 * template edit or deactivation can be followed by regenerateInstances to
 * rebuild them from the current template — otherwise stale title/amount/due
 * dates would linger for up to the materialization horizon. Paid instances
 * and anything already in the past are kept as history; instances without a
 * due date are kept defensively (materializeBillInstances always sets one,
 * so this should be unreachable for a templated bill).
 */
export function resetFutureInstancesForBill(snapshot: Snapshot, billId: string, fromIso: string): Snapshot {
  const billInstances = snapshot.data.billInstances.filter((i) => {
    if (i.billId !== billId) return true
    if (i.status === 'paid') return true
    if (!i.dueDate) return true
    return i.dueDate < fromIso
  })
  return { ...snapshot, data: { ...snapshot.data, billInstances } }
}

export function upsertGoal(snapshot: Snapshot, goal: Goal): Snapshot {
  const exists = snapshot.data.goals.some((g) => g.id === goal.id)
  const goals = exists ? snapshot.data.goals.map((g) => (g.id === goal.id ? goal : g)) : [...snapshot.data.goals, goal]
  return { ...snapshot, data: { ...snapshot.data, goals } }
}

/** All BillInstances currently on record for a bill (existing.filter). */
export function instancesForBill(snapshot: Snapshot, billId: string): BillInstance[] {
  return snapshot.data.billInstances.filter((i) => i.billId === billId)
}
