import { describe, expect, it } from 'vitest'
import { buildReminderSummary } from './reminders'
import { createEmptySnapshot } from '../data/migrate'

describe('buildReminderSummary', () => {
  it('groups unpaid bills into overdue, due today, and next 7 days', () => {
    const snap = createEmptySnapshot('dev', '2026-07-01T00:00:00.000Z')
    const snapshot = {
      ...snap,
      data: {
        ...snap.data,
        billInstances: [
          { id: 'late', householdId: 'hh', title: 'Late', status: 'expected' as const, dueDate: '2026-06-30' },
          { id: 'today', householdId: 'hh', title: 'Today', status: 'expected' as const, dueDate: '2026-07-01' },
          { id: 'soon', householdId: 'hh', title: 'Soon', status: 'expected' as const, dueDate: '2026-07-08' },
          { id: 'paid', householdId: 'hh', title: 'Paid', status: 'paid' as const, dueDate: '2026-07-02' },
          { id: 'later', householdId: 'hh', title: 'Later', status: 'expected' as const, dueDate: '2026-07-09' },
        ],
      },
    }

    const summary = buildReminderSummary(snapshot, '2026-07-01')

    expect(summary.overdue.map((i) => i.id)).toEqual(['late'])
    expect(summary.dueToday.map((i) => i.id)).toEqual(['today'])
    expect(summary.dueNext7.map((i) => i.id)).toEqual(['soon'])
  })

  it('estimates goal contribution across upcoming checks', () => {
    const snap = createEmptySnapshot('dev', '2026-07-01T00:00:00.000Z')
    const snapshot = {
      ...snap,
      data: {
        ...snap.data,
        paychecks: [
          { id: 'old', householdId: 'hh', payDate: '2026-06-01', amount: 1, periodStart: '2026-06-01', periodEnd: '2026-06-14' },
          { id: 'a', householdId: 'hh', payDate: '2026-07-01', amount: 1, periodStart: '2026-07-01', periodEnd: '2026-07-14' },
          { id: 'b', householdId: 'hh', payDate: '2026-07-15', amount: 1, periodStart: '2026-07-15', periodEnd: '2026-07-28' },
        ],
        goals: [
          { id: 'goal', householdId: 'hh', name: 'Trip', targetAmount: 100000, currentAmount: 25000, status: 'active' as const },
        ],
      },
    }

    const summary = buildReminderSummary(snapshot, '2026-07-01')

    expect(summary.activeGoal?.name).toBe('Trip')
    expect(summary.goalNeededPerUpcomingCheck).toBe(37500)
  })
})
