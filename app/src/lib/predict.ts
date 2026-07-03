import type { BillInstance, Paycheck } from '../types'
import { summarizeWindow, type WindowSummary } from './windows'

export interface ProjectionWindow {
  paycheck: Paycheck
  summary: WindowSummary
}

export interface Projection {
  windows: ProjectionWindow[]
  next4Left: number
  next8Left: number
  averageLeft: number
  paychecksToGoal: number | null
}

export function buildProjection({
  paychecks,
  instances,
  todayIso,
  goalAmount,
}: {
  paychecks: Paycheck[]
  instances: BillInstance[]
  todayIso: string
  goalAmount?: number | null
}): Projection {
  const windows = paychecks
    .filter((p) => p.periodEnd >= todayIso)
    .sort((a, b) => a.periodStart.localeCompare(b.periodStart))
    .map((paycheck) => ({ paycheck, summary: summarizeWindow(paycheck, instances) }))

  const sumLeft = (rows: ProjectionWindow[]) => rows.reduce((sum, row) => sum + row.summary.left, 0)
  const next4Left = sumLeft(windows.slice(0, 4))
  const next8Left = sumLeft(windows.slice(0, 8))
  const averageLeft = windows.length ? sumLeft(windows) / windows.length : 0
  const target = goalAmount ?? 0

  let paychecksToGoal: number | null = null
  if (target > 0) {
    let running = 0
    for (let i = 0; i < windows.length; i += 1) {
      running += Math.max(0, windows[i].summary.left)
      if (running >= target) {
        paychecksToGoal = i + 1
        break
      }
    }
  }

  return { windows, next4Left, next8Left, averageLeft, paychecksToGoal }
}
