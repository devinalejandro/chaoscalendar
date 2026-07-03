import { describe, expect, it } from 'vitest'
import { importLegacyAurora } from './legacy'

const NOW = '2026-07-02T12:00:00.000Z'

describe('importLegacyAurora', () => {
  it('converts legacy paychecks and finance items into the current snapshot shape', () => {
    const result = importLegacyAurora({
      paychecks: [
        { id: 'pc_2026-07-01', date: '2026-07-01', amount: 1893.48, start: '2026-07-01', end: '2026-07-14' },
      ],
      items: [
        { id: 'a', type: 'bill', title: 'Apple Subscription', amount: 41.25, dueDate: '2026-07-07', paid: true },
        { id: 'b', type: 'event', title: 'Dentist', amount: 75, dueDate: '2026-07-11' },
        { id: 'c', type: 'task', title: 'Call school' },
      ],
    }, NOW)

    expect(result.report).toMatchObject({ paychecksRead: 1, paychecks: 1, itemsRead: 3, billInstances: 2 })
    expect(result.report.skipped).toEqual(['item 3: unsupported type task'])
    expect(result.snapshot.data.paychecks[0]).toMatchObject({ amount: 189348, periodStart: '2026-07-01', periodEnd: '2026-07-14' })
    expect(result.snapshot.data.billInstances).toEqual([
      expect.objectContaining({
        title: 'Apple Subscription',
        amount: 4125,
        dueDate: '2026-07-07',
        status: 'paid',
        paidDate: '2026-07-07',
        paycheckId: 'pc_2026-07-01',
      }),
      expect.objectContaining({
        title: 'Dentist',
        amount: 7500,
        dueDate: '2026-07-11',
        status: 'expected',
        paycheckId: 'pc_2026-07-01',
      }),
    ])
  })

  it('accepts the Netlify /api/state wrapper shape', () => {
    const result = importLegacyAurora({
      data: {
        paychecks: [{ date: '2026-07-15', amount: 1893.48, start: '2026-07-15', end: '2026-07-28' }],
        items: [{ type: 'bill', title: 'Netflix', amount: 29.34, dueDate: '2026-07-17' }],
      },
    }, NOW)

    expect(result.snapshot.data.paychecks[0].id).toBe('pc_2026-07-15')
    expect(result.snapshot.data.billInstances[0]).toMatchObject({ title: 'Netflix', paycheckId: 'pc_2026-07-15' })
  })

  it('skips invalid date windows and invalid item due dates instead of creating bad records', () => {
    const result = importLegacyAurora({
      paychecks: [{ date: 'Invalid date', amount: 100, start: 'Invalid date', end: 'Invalid date' }],
      items: [{ type: 'bill', title: 'Broken', amount: 10, dueDate: 'Invalid date' }],
    }, NOW)

    expect(result.snapshot.data.paychecks).toEqual([])
    expect(result.snapshot.data.billInstances).toEqual([])
    expect(result.report.skipped).toEqual(['paycheck 1: invalid date window', 'Broken: invalid due date'])
  })
})
