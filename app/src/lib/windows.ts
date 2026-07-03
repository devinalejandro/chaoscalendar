import type { BillInstance, Paycheck } from '../types'
import { addDays, iso } from './dates'

export type PaydayFrequency = 'weekly' | 'biweekly' | 'twicemonthly' | 'monthly' | 'custom'

export interface PaydayConfig {
  frequency: PaydayFrequency
  /** cents */
  amount: number
  /** ISO anchor payday, used by every frequency except 'custom' */
  baseDate: string
  /** ISO dates, required when frequency === 'custom' (e.g. a pasted "PAYDAYS" line) */
  explicitDates?: string[]
  /** number of windows to generate; default 12 */
  count?: number
}

const STEP_DAYS: Record<'weekly' | 'biweekly' | 'twicemonthly', number> = {
  weekly: 7,
  biweekly: 14,
  twicemonthly: 15,
}

/** Ports generatePaychecks() from the live prototype. A window starts on its
    payday and ends the day before the next payday. */
export function generatePaychecks(config: PaydayConfig, householdId: string): Paycheck[] {
  const count = config.count ?? 12
  const amount = config.amount

  if (config.frequency === 'custom') {
    const explicit = [...new Set((config.explicitDates ?? []).slice())].sort()
    if (!explicit.length) return []
    const step = 14
    const dates = [...explicit]
    while (dates.length < count) {
      dates.push(addDays(dates[dates.length - 1], step))
    }
    return dates.map((start, i) => {
      const end = dates[i + 1] ? addDays(dates[i + 1], -1) : addDays(start, step - 1)
      return { id: 'pc_' + start, householdId, payDate: start, amount, periodStart: start, periodEnd: end }
    })
  }

  if (config.frequency === 'monthly') {
    const out: Paycheck[] = []
    const d = new Date(config.baseDate + 'T00:00:00')
    d.setMonth(d.getMonth() - 1)
    for (let i = 0; i < count; i++) {
      const start = iso(d)
      const e = new Date(d)
      e.setMonth(e.getMonth() + 1)
      e.setDate(e.getDate() - 1)
      out.push({ id: 'pc_' + start, householdId, payDate: start, amount, periodStart: start, periodEnd: iso(e) })
      d.setMonth(d.getMonth() + 1)
    }
    return out
  }

  const step = STEP_DAYS[config.frequency]
  const out: Paycheck[] = []
  let start = addDays(config.baseDate, -step)
  for (let i = 0; i < count; i++) {
    const end = addDays(start, step - 1)
    out.push({ id: 'pc_' + start, householdId, payDate: start, amount, periodStart: start, periodEnd: end })
    start = addDays(start, step)
  }
  return out
}

/**
 * Assigns each instance to the paycheck window covering its due date.
 *
 * KNOWN LIMITATION (ported from the prototype's assignPc): for a dated
 * instance, the window is always recomputed from the due date — a manual
 * "move to next paycheck" override is not preserved across regeneration.
 * The PRD calls for manual override support; that lands with the M2
 * budgeting UI, which will need to mark overridden instances so this
 * function can skip them.
 */
export function assignInstancesToPaychecks(instances: BillInstance[], paychecks: Paycheck[]): BillInstance[] {
  return instances.map((i) => {
    if (i.paycheckOverride) {
      const stillValid = i.paycheckId ? paychecks.some((p) => p.id === i.paycheckId) : false
      return stillValid ? i : { ...i, paycheckId: undefined, paycheckOverride: undefined }
    }
    if (!i.dueDate) {
      const stillValid = i.paycheckId ? paychecks.some((p) => p.id === i.paycheckId) : false
      return stillValid ? i : { ...i, paycheckId: undefined }
    }
    const window = paychecks.find((p) => i.dueDate! >= p.periodStart && i.dueDate! <= p.periodEnd)
    return { ...i, paycheckId: window ? window.id : undefined }
  })
}

export interface WindowSummary {
  paycheckId: string
  /** cents */
  total: number
  /** cents, sum of every instance due in the window regardless of paid status */
  billsTotal: number
  /** cents, total - billsTotal */
  left: number
  billCount: number
  instances: BillInstance[]
}

/** Total / Bills / Left / bill list for one paycheck window (PRD "Paycheck
    Budgeting"). Paid/unpaid stays visible per instance; this summary is for
    planning, not paid-status. */
export function summarizeWindow(paycheck: Paycheck, instances: BillInstance[]): WindowSummary {
  const inWindow = instances
    .filter((i) => i.paycheckId === paycheck.id)
    .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
  const billsTotal = inWindow.reduce((sum, i) => sum + (i.amount ?? 0), 0)
  return {
    paycheckId: paycheck.id,
    total: paycheck.amount,
    billsTotal,
    left: paycheck.amount - billsTotal,
    billCount: inWindow.length,
    instances: inWindow,
  }
}
