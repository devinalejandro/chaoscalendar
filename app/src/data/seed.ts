import type { Bill, RecurrenceRule, Snapshot } from '../types'
import { SCHEMA_VERSION } from '../types'
import { assignInstancesToPaychecks, generatePaychecks } from '../lib/windows'
import { materializeAll } from '../lib/billInstances'

/** Demonstration household built from the real numbers in FINANCE_APP_PRD.md's
    paste-format examples (PAYDAYS 6/3 6/17 7/1 7/15 7/29 1,893.48; $41.25
    Apple Subscription; $45 STRATA CC) — the same figures the parser fixtures
    lock, so seed data and parser tests stay cross-checked against one
    real-world source. */
const HOUSEHOLD_ID = 'hh_karla'

export function seedHousehold(nowIso: string): Snapshot {
  const household = {
    id: HOUSEHOLD_ID,
    name: "Karla's Household",
    timezone: 'America/Phoenix',
    createdAt: nowIso,
    updatedAt: nowIso,
  }

  const paychecks = generatePaychecks(
    {
      frequency: 'custom',
      amount: 189348, // $1,893.48
      baseDate: '2026-06-03',
      explicitDates: ['2026-06-03', '2026-06-17', '2026-07-01', '2026-07-15', '2026-07-29'],
      count: 6,
    },
    HOUSEHOLD_ID,
  )

  const recurrenceRules: RecurrenceRule[] = [
    { id: 'rr_mortgage', householdId: HOUSEHOLD_ID, frequency: 'monthly', dayOfMonth: 1 },
    { id: 'rr_strata', householdId: HOUSEHOLD_ID, frequency: 'monthly', dayOfMonth: 10 },
    { id: 'rr_netflix', householdId: HOUSEHOLD_ID, frequency: 'monthly', dayOfMonth: 7 },
  ]

  const bills: Bill[] = [
    {
      id: 'bill_mortgage',
      householdId: HOUSEHOLD_ID,
      name: 'Mortgage',
      category: 'mortgage_rent',
      expectedAmount: 152455, // $1,524.55
      recurrenceRuleId: 'rr_mortgage',
      isFixed: true,
      active: true,
    },
    {
      id: 'bill_strata',
      householdId: HOUSEHOLD_ID,
      name: 'STRATA CC',
      category: 'credit_card',
      expectedAmount: 4500, // $45
      recurrenceRuleId: 'rr_strata',
      isFixed: true,
      active: true,
    },
    {
      id: 'bill_netflix',
      householdId: HOUSEHOLD_ID,
      name: 'Netflix',
      category: 'subscriptions',
      expectedAmount: 2934, // $29.34
      recurrenceRuleId: 'rr_netflix',
      isFixed: true,
      active: true,
    },
  ]

  // Horizon starts at the first paycheck's window start, not the calendar
  // month start — a due date before the earliest known paycheck has no
  // window to land in, so materializing it would only produce an
  // unassigned instance.
  const created = materializeAll({
    bills,
    rules: recurrenceRules,
    existing: [],
    from: paychecks[0].periodStart,
    to: paychecks[paychecks.length - 1].periodEnd,
  })
  const billInstances = assignInstancesToPaychecks(created, paychecks)

  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: nowIso,
    deviceId: 'seed',
    data: { household, paychecks, bills, billInstances, goals: [], recurrenceRules },
  }
}
