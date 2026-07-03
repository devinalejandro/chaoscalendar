import { describe, expect, it } from 'vitest'
import { buildPayTimingSuggestion } from './payTiming'
import type { ProjectionWindow } from './predict'

describe('buildPayTimingSuggestion', () => {
  it('suggests pulling an unpaid later bill into the previous paycheck when there is room', () => {
    const windows: ProjectionWindow[] = [
      {
        paycheck: { id: 'pc_1', householdId: 'hh', payDate: '2026-07-01', amount: 100000, periodStart: '2026-07-01', periodEnd: '2026-07-14' },
        summary: { paycheckId: 'pc_1', total: 100000, billsTotal: 50000, left: 50000, billCount: 1, instances: [] },
      },
      {
        paycheck: { id: 'pc_2', householdId: 'hh', payDate: '2026-07-15', amount: 100000, periodStart: '2026-07-15', periodEnd: '2026-07-28' },
        summary: {
          paycheckId: 'pc_2',
          total: 100000,
          billsTotal: 90000,
          left: 10000,
          billCount: 1,
          instances: [{ id: 'bi_1', householdId: 'hh', title: 'Phone', amount: 30000, dueDate: '2026-07-16', status: 'expected', paycheckId: 'pc_2' }],
        },
      },
    ]

    expect(buildPayTimingSuggestion(windows)).toMatchObject({
      instanceId: 'bi_1',
      toPaycheckId: 'pc_1',
      fromPaycheckId: 'pc_2',
      toLeftAfter: 20000,
      fromLeftAfter: 40000,
    })
  })

  it('does not suggest moving a bill when the previous paycheck would go below zero', () => {
    const windows: ProjectionWindow[] = [
      {
        paycheck: { id: 'pc_1', householdId: 'hh', payDate: '2026-07-01', amount: 100000, periodStart: '2026-07-01', periodEnd: '2026-07-14' },
        summary: { paycheckId: 'pc_1', total: 100000, billsTotal: 95000, left: 5000, billCount: 1, instances: [] },
      },
      {
        paycheck: { id: 'pc_2', householdId: 'hh', payDate: '2026-07-15', amount: 100000, periodStart: '2026-07-15', periodEnd: '2026-07-28' },
        summary: {
          paycheckId: 'pc_2',
          total: 100000,
          billsTotal: 90000,
          left: 10000,
          billCount: 1,
          instances: [{ id: 'bi_1', householdId: 'hh', title: 'Phone', amount: 30000, dueDate: '2026-07-16', status: 'expected', paycheckId: 'pc_2' }],
        },
      },
    ]

    expect(buildPayTimingSuggestion(windows)).toBeNull()
  })
})
