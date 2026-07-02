import { describe, expect, it } from 'vitest'
import { assignInstancesToPaychecks, generatePaychecks, summarizeWindow } from './windows'
import type { BillInstance, Paycheck } from '../types'

describe('generatePaychecks — biweekly', () => {
  it('generates windows that end the day before the next payday', () => {
    const out = generatePaychecks({ frequency: 'biweekly', amount: 180000, baseDate: '2026-07-10', count: 3 }, 'hh')
    expect(out).toHaveLength(3)
    expect(out[0]).toMatchObject({ payDate: '2026-06-26', periodStart: '2026-06-26', periodEnd: '2026-07-09' })
    expect(out[1]).toMatchObject({ payDate: '2026-07-10', periodStart: '2026-07-10', periodEnd: '2026-07-23' })
    // windows are contiguous, no gap or overlap
    expect(out[1].periodStart).toBe('2026-07-10')
  })
})

describe('generatePaychecks — monthly', () => {
  it('generates one window per calendar month', () => {
    const out = generatePaychecks({ frequency: 'monthly', amount: 300000, baseDate: '2026-03-01', count: 2 }, 'hh')
    expect(out[0]).toMatchObject({ payDate: '2026-02-01', periodStart: '2026-02-01', periodEnd: '2026-02-28' })
    expect(out[1]).toMatchObject({ payDate: '2026-03-01', periodStart: '2026-03-01', periodEnd: '2026-03-31' })
  })
})

describe('generatePaychecks — custom explicit dates', () => {
  it('uses the supplied paydays as-is and extends beyond them by the fallback step', () => {
    const out = generatePaychecks(
      {
        frequency: 'custom',
        amount: 189348,
        baseDate: '2026-06-03',
        explicitDates: ['2026-06-03', '2026-06-17', '2026-07-01'],
        count: 4,
      },
      'hh',
    )
    expect(out).toHaveLength(4)
    expect(out.map((p) => p.payDate)).toEqual(['2026-06-03', '2026-06-17', '2026-07-01', '2026-07-15'])
    expect(out[0]).toMatchObject({ periodStart: '2026-06-03', periodEnd: '2026-06-16' })
    expect(out[2]).toMatchObject({ periodStart: '2026-07-01', periodEnd: '2026-07-14' })
  })

  it('returns an empty list when no explicit dates are given', () => {
    expect(generatePaychecks({ frequency: 'custom', amount: 1000, baseDate: '2026-06-03' }, 'hh')).toEqual([])
  })
})

describe('assignInstancesToPaychecks', () => {
  const paychecks: Paycheck[] = generatePaychecks(
    { frequency: 'biweekly', amount: 180000, baseDate: '2026-07-10', count: 2 },
    'hh',
  )

  it('assigns a dated instance to the window covering its due date', () => {
    const instances: BillInstance[] = [
      { id: 'bi_1', householdId: 'hh', title: 'Rent', dueDate: '2026-07-06', status: 'expected' },
    ]
    const out = assignInstancesToPaychecks(instances, paychecks)
    expect(out[0].paycheckId).toBe(paychecks[0].id)
  })

  it('clears the assignment when the due date falls outside every window', () => {
    const instances: BillInstance[] = [
      { id: 'bi_1', householdId: 'hh', title: 'Far off', dueDate: '2030-01-01', status: 'expected' },
    ]
    expect(assignInstancesToPaychecks(instances, paychecks)[0].paycheckId).toBeUndefined()
  })

  it('preserves a manual paycheckId on an undated instance if it still resolves to a real window', () => {
    const instances: BillInstance[] = [
      { id: 'bi_1', householdId: 'hh', title: 'Undated', status: 'expected', paycheckId: paychecks[0].id },
    ]
    expect(assignInstancesToPaychecks(instances, paychecks)[0].paycheckId).toBe(paychecks[0].id)
  })

  it('clears an undated instance pointing at a paycheck that no longer exists', () => {
    const instances: BillInstance[] = [
      { id: 'bi_1', householdId: 'hh', title: 'Undated', status: 'expected', paycheckId: 'pc_gone' },
    ]
    expect(assignInstancesToPaychecks(instances, paychecks)[0].paycheckId).toBeUndefined()
  })
})

describe('summarizeWindow', () => {
  it('computes total, billsTotal, left, and billCount for the window', () => {
    const paycheck: Paycheck = {
      id: 'pc_1',
      householdId: 'hh',
      payDate: '2026-07-05',
      amount: 215000,
      periodStart: '2026-07-05',
      periodEnd: '2026-07-18',
    }
    const instances: BillInstance[] = [
      { id: 'bi_1', householdId: 'hh', title: 'Rent', dueDate: '2026-07-06', amount: 180000, status: 'expected', paycheckId: 'pc_1' },
      { id: 'bi_2', householdId: 'hh', title: 'Electric', dueDate: '2026-07-09', amount: 16000, status: 'paid', paycheckId: 'pc_1' },
      { id: 'bi_3', householdId: 'hh', title: 'Other window', dueDate: '2026-07-20', amount: 5000, status: 'expected', paycheckId: 'pc_2' },
    ]
    const summary = summarizeWindow(paycheck, instances)
    expect(summary.billCount).toBe(2)
    expect(summary.billsTotal).toBe(196000)
    expect(summary.left).toBe(19000)
    expect(summary.instances.map((i) => i.id)).toEqual(['bi_1', 'bi_2']) // sorted by dueDate
  })
})
