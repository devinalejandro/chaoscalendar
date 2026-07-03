import { describe, expect, it } from 'vitest'
import { buildProjection } from './predict'
import type { BillInstance, Paycheck } from '../types'

const pc = (date: string, amount = 100_000): Paycheck => ({
  id: 'pc_' + date,
  householdId: 'hh',
  payDate: date,
  amount,
  periodStart: date,
  periodEnd: date,
})

const bill = (id: string, paycheckId: string, amount: number): BillInstance => ({
  id,
  householdId: 'hh',
  title: id,
  amount,
  dueDate: '2026-07-01',
  paycheckId,
  status: 'expected',
})

describe('buildProjection', () => {
  it('summarizes upcoming paycheck left totals for next 4 and next 8 windows', () => {
    const paychecks = Array.from({ length: 8 }, (_, i) => pc(`2026-07-${String(i + 1).padStart(2, '0')}`))
    const instances = paychecks.map((p, i) => bill('bill_' + i, p.id, (i + 1) * 10_000))

    const projection = buildProjection({ paychecks, instances, todayIso: '2026-07-01' })

    expect(projection.next4Left).toBe(300_000)
    expect(projection.next8Left).toBe(440_000)
    expect(projection.averageLeft).toBe(55_000)
  })

  it('ignores past windows and counts paychecks needed to reach a vacation goal', () => {
    const paychecks = [pc('2026-06-01'), pc('2026-07-01'), pc('2026-07-15')]
    const instances = [bill('rent', 'pc_2026-07-01', 40_000), bill('car', 'pc_2026-07-15', 70_000)]

    const projection = buildProjection({ paychecks, instances, todayIso: '2026-07-01', goalAmount: 80_000 })

    expect(projection.windows.map((w) => w.paycheck.id)).toEqual(['pc_2026-07-01', 'pc_2026-07-15'])
    expect(projection.windows.map((w) => w.summary.left)).toEqual([60_000, 30_000])
    expect(projection.paychecksToGoal).toBe(2)
  })

  it('returns null when the visible horizon cannot reach the goal', () => {
    const projection = buildProjection({
      paychecks: [pc('2026-07-01')],
      instances: [bill('rent', 'pc_2026-07-01', 90_000)],
      todayIso: '2026-07-01',
      goalAmount: 20_000,
    })

    expect(projection.paychecksToGoal).toBeNull()
  })
})
