import { SCHEMA_VERSION, Snapshot } from '../../types'
import type { BillInstance, Paycheck, Snapshot as SnapshotT } from '../../types'
import { assignInstancesToPaychecks } from '../../lib/windows'
import { isValidIso } from '../../lib/dates'

const HOUSEHOLD_ID = 'hh_legacy'

type LegacyItem = {
  id?: unknown
  type?: unknown
  title?: unknown
  amount?: unknown
  dueDate?: unknown
  paid?: unknown
  paidDate?: unknown
  category?: unknown
  note?: unknown
}

type LegacyPaycheck = {
  id?: unknown
  date?: unknown
  amount?: unknown
  start?: unknown
  end?: unknown
}

export interface LegacyImportReport {
  itemsRead: number
  paychecksRead: number
  billInstances: number
  paychecks: number
  skipped: string[]
}

export interface LegacyImportResult {
  snapshot: SnapshotT
  report: LegacyImportReport
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function dollarsToCents(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined
  const n = typeof value === 'number' ? value : Number(String(value).replace(/[$,\s]/g, ''))
  return Number.isFinite(n) ? Math.round(n * 100) : undefined
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function legacyItems(raw: unknown): LegacyItem[] {
  const obj = asRecord(raw)
  const nested = asRecord(obj.data)
  const items = Array.isArray(obj.items) ? obj.items : Array.isArray(nested.items) ? nested.items : []
  return items as LegacyItem[]
}

function legacyPaychecks(raw: unknown): LegacyPaycheck[] {
  const obj = asRecord(raw)
  const nested = asRecord(obj.data)
  const paychecks = Array.isArray(obj.paychecks) ? obj.paychecks : Array.isArray(nested.paychecks) ? nested.paychecks : []
  return paychecks as LegacyPaycheck[]
}

function convertPaychecks(paychecks: LegacyPaycheck[], householdId: string, skipped: string[]): Paycheck[] {
  return paychecks.flatMap((p, index) => {
    const date = str(p.date)
    const start = str(p.start)
    const end = str(p.end)
    if (!date || !start || !end || !isValidIso(date) || !isValidIso(start) || !isValidIso(end)) {
      skipped.push(`paycheck ${index + 1}: invalid date window`)
      return []
    }
    return [{
      id: str(p.id) ?? `pc_${date}`,
      householdId,
      payDate: date,
      amount: dollarsToCents(p.amount) ?? 0,
      periodStart: start,
      periodEnd: end,
    }]
  }).sort((a, b) => a.periodStart.localeCompare(b.periodStart))
}

function convertInstances(items: LegacyItem[], householdId: string, skipped: string[]): BillInstance[] {
  return items.flatMap((item, index) => {
    const type = str(item.type)
    if (type !== 'bill' && type !== 'event' && type !== 'appointment') {
      skipped.push(`item ${index + 1}: unsupported type ${type ?? 'unknown'}`)
      return []
    }
    const title = str(item.title)
    if (!title) {
      skipped.push(`item ${index + 1}: missing title`)
      return []
    }
    const dueDate = str(item.dueDate)
    if (dueDate && !isValidIso(dueDate)) {
      skipped.push(`${title}: invalid due date`)
      return []
    }
    const paidDate = str(item.paidDate)
    const paid = item.paid === true
    return [{
      id: str(item.id)?.startsWith('bi_') ? str(item.id)! : `legacy_${str(item.id) ?? index}`,
      householdId,
      title,
      dueDate,
      amount: dollarsToCents(item.amount),
      status: paid ? 'paid' : 'expected',
      paidDate: paid ? (paidDate && isValidIso(paidDate) ? paidDate : dueDate) : undefined,
      notes: str(item.note),
    }]
  })
}

export function importLegacyAurora(raw: unknown, nowIso: string, deviceId = 'legacy_import'): LegacyImportResult {
  const skipped: string[] = []
  const items = legacyItems(raw)
  const paychecksRaw = legacyPaychecks(raw)
  const paychecks = convertPaychecks(paychecksRaw, HOUSEHOLD_ID, skipped)
  const instances = assignInstancesToPaychecks(convertInstances(items, HOUSEHOLD_ID, skipped), paychecks)

  const snapshot: SnapshotT = {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: nowIso,
    deviceId,
    data: {
      household: {
        id: HOUSEHOLD_ID,
        name: "Karla's Household",
        timezone: 'America/Phoenix',
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      users: [],
      paychecks,
      bills: [],
      billInstances: instances,
      goals: [],
      recurrenceRules: [],
      auditEvents: [],
    },
  }

  return {
    snapshot: Snapshot.parse(snapshot),
    report: {
      itemsRead: items.length,
      paychecksRead: paychecksRaw.length,
      billInstances: instances.length,
      paychecks: paychecks.length,
      skipped,
    },
  }
}
