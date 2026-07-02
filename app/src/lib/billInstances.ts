import type { Bill, BillInstance, RecurrenceRule } from '../types'
import { newId } from './id'
import { occurrencesInRange } from './recurrence'

export interface MaterializeParams {
  bill: Bill
  rule?: RecurrenceRule
  from: string
  to: string
  /** Instances already on record — used only to avoid duplicating a due date
      that already has an instance for this bill. */
  existing: BillInstance[]
}

/** Generates the BillInstances a template is missing over [from, to].
    Idempotent: re-running with the same `existing` set never duplicates a
    due date. Editing a Bill template only changes instances generated after
    the edit — it never mutates instances that already exist (PRD validation
    rule: "Recurring bills should create instances, not overwrite the bill
    template"). */
export function materializeBillInstances({ bill, rule, from, to, existing }: MaterializeParams): BillInstance[] {
  if (!bill.active) return []

  const existingDates = new Set(
    existing
      .filter((i) => i.billId === bill.id)
      .map((i) => i.dueDate)
      .filter((d): d is string => Boolean(d)),
  )

  const dueDates = rule
    ? occurrencesInRange(rule, from, to)
    : bill.dueDate && bill.dueDate >= from && bill.dueDate <= to
      ? [bill.dueDate]
      : []

  return dueDates
    .filter((dueDate) => !existingDates.has(dueDate))
    .map((dueDate) => ({
      id: newId('bi'),
      billId: bill.id,
      householdId: bill.householdId,
      title: bill.name,
      dueDate,
      amount: bill.expectedAmount,
      status: 'expected' as const,
    }))
}

export interface MaterializeAllParams {
  bills: Bill[]
  rules: RecurrenceRule[]
  existing: BillInstance[]
  from: string
  to: string
}

/** Materializes instances for every bill in one pass. Returns only the newly
    created instances; merge with `existing` to get the full set. */
export function materializeAll({ bills, rules, existing, from, to }: MaterializeAllParams): BillInstance[] {
  const ruleById = new Map(rules.map((r) => [r.id, r]))
  const created: BillInstance[] = []
  for (const bill of bills) {
    const rule = bill.recurrenceRuleId ? ruleById.get(bill.recurrenceRuleId) : undefined
    created.push(
      ...materializeBillInstances({
        bill,
        rule,
        from,
        to,
        existing: [...existing, ...created],
      }),
    )
  }
  return created
}
