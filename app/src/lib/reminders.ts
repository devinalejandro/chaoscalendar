import type { BillInstance, Goal, Snapshot } from '../types'
import { addDays } from './dates'

export interface ReminderSummary {
  overdue: BillInstance[]
  dueToday: BillInstance[]
  dueNext7: BillInstance[]
  activeGoal: Goal | null
  goalNeededPerUpcomingCheck: number | null
}

export function buildReminderSummary(snapshot: Snapshot, todayIso: string): ReminderSummary {
  const next7Iso = addDays(todayIso, 7)
  const unpaidWithDates = snapshot.data.billInstances
    .filter((i) => i.status !== 'paid' && i.dueDate)
    .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))

  const overdue = unpaidWithDates.filter((i) => i.dueDate! < todayIso)
  const dueToday = unpaidWithDates.filter((i) => i.dueDate === todayIso)
  const dueNext7 = unpaidWithDates.filter((i) => i.dueDate! > todayIso && i.dueDate! <= next7Iso)
  const activeGoal = snapshot.data.goals.find((g) => g.status === 'active') ?? null

  const upcomingChecks = snapshot.data.paychecks.filter((p) => p.periodEnd >= todayIso).length
  const remainingGoal = activeGoal ? Math.max(0, activeGoal.targetAmount - activeGoal.currentAmount) : 0
  const goalNeededPerUpcomingCheck = activeGoal && upcomingChecks > 0 ? Math.ceil(remainingGoal / upcomingChecks) : null

  return { overdue, dueToday, dueNext7, activeGoal, goalNeededPerUpcomingCheck }
}
