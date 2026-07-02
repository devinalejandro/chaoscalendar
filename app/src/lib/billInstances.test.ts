import { describe, expect, it } from 'vitest'
import { materializeAll, materializeBillInstances } from './billInstances'
import type { Bill, BillInstance, RecurrenceRule } from '../types'

const bill = (overrides: Partial<Bill>): Bill => ({
  id: 'bill_test',
  householdId: 'hh_test',
  name: 'Test Bill',
  category: 'other',
  isFixed: true,
  active: true,
  ...overrides,
})

const rule = (overrides: Partial<RecurrenceRule>): RecurrenceRule => ({
  id: 'rr_test',
  householdId: 'hh_test',
  frequency: 'monthly',
  dayOfMonth: 1,
  ...overrides,
})

describe('materializeBillInstances', () => {
  it('generates one instance per recurrence occurrence, carrying the bill title and amount', () => {
    const b = bill({ expectedAmount: 5000 })
    const r = rule({})
    const out = materializeBillInstances({ bill: b, rule: r, from: '2026-06-01', to: '2026-08-31', existing: [] })
    expect(out).toHaveLength(3)
    expect(out.map((i) => i.dueDate)).toEqual(['2026-06-01', '2026-07-01', '2026-08-01'])
    expect(out.every((i) => i.title === 'Test Bill' && i.amount === 5000 && i.status === 'expected')).toBe(true)
  })

  it('is idempotent: re-running with already-generated instances produces nothing new', () => {
    const b = bill({})
    const r = rule({})
    const first = materializeBillInstances({ bill: b, rule: r, from: '2026-06-01', to: '2026-08-31', existing: [] })
    const second = materializeBillInstances({ bill: b, rule: r, from: '2026-06-01', to: '2026-08-31', existing: first })
    expect(second).toEqual([])
  })

  it('returns nothing for an inactive bill', () => {
    const b = bill({ active: false })
    const r = rule({})
    expect(materializeBillInstances({ bill: b, rule: r, from: '2026-06-01', to: '2026-08-31', existing: [] })).toEqual([])
  })

  it('uses the bill.dueDate one-off when there is no recurrence rule', () => {
    const b = bill({ dueDate: '2026-07-15' })
    const out = materializeBillInstances({ bill: b, from: '2026-06-01', to: '2026-08-31', existing: [] })
    expect(out).toHaveLength(1)
    expect(out[0].dueDate).toBe('2026-07-15')
  })

  it('produces nothing when the one-off due date falls outside the horizon', () => {
    const b = bill({ dueDate: '2027-01-01' })
    expect(materializeBillInstances({ bill: b, from: '2026-06-01', to: '2026-08-31', existing: [] })).toEqual([])
  })

  it('does not regenerate a due date that already has an instance for a different bill', () => {
    const b = bill({ id: 'bill_a' })
    const r = rule({})
    const existing: BillInstance[] = [
      { id: 'bi_other', billId: 'bill_b', householdId: 'hh_test', title: 'Other', dueDate: '2026-06-01', status: 'expected' },
    ]
    const out = materializeBillInstances({ bill: b, rule: r, from: '2026-06-01', to: '2026-06-30', existing })
    expect(out).toHaveLength(1)
    expect(out[0].billId).toBe('bill_a')
  })
})

describe('materializeAll', () => {
  it('materializes every bill in one pass without cross-bill duplication', () => {
    const bills = [bill({ id: 'bill_a' }), bill({ id: 'bill_b', name: 'Second' })]
    const rules = [rule({ id: 'rr_a' }), rule({ id: 'rr_b' })]
    bills[0].recurrenceRuleId = 'rr_a'
    bills[1].recurrenceRuleId = 'rr_b'
    const out = materializeAll({ bills, rules, existing: [], from: '2026-06-01', to: '2026-07-31' })
    expect(out.filter((i) => i.billId === 'bill_a')).toHaveLength(2)
    expect(out.filter((i) => i.billId === 'bill_b')).toHaveLength(2)
  })
})
