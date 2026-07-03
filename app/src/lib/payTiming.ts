import type { ProjectionWindow } from './predict'

export interface PayTimingSuggestion {
  instanceId: string
  title: string
  amount: number
  fromPaycheckId: string
  toPaycheckId: string
  fromLabel: string
  toLabel: string
  fromLeftBefore: number
  fromLeftAfter: number
  toLeftBefore: number
  toLeftAfter: number
}

export function buildPayTimingSuggestion(windows: ProjectionWindow[]): PayTimingSuggestion | null {
  const upcoming = windows.slice(0, 8)

  for (let i = 1; i < upcoming.length; i += 1) {
    const from = upcoming[i]
    const to = upcoming[i - 1]
    const candidates = from.summary.instances
      .filter((instance) => instance.status !== 'paid' && (instance.amount ?? 0) > 0)
      .sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))

    const candidate = candidates.find((instance) => to.summary.left - (instance.amount ?? 0) >= 0)
    if (!candidate || candidate.amount == null) continue

    return {
      instanceId: candidate.id,
      title: candidate.title,
      amount: candidate.amount,
      fromPaycheckId: from.paycheck.id,
      toPaycheckId: to.paycheck.id,
      fromLabel: from.paycheck.payDate,
      toLabel: to.paycheck.payDate,
      fromLeftBefore: from.summary.left,
      fromLeftAfter: from.summary.left + candidate.amount,
      toLeftBefore: to.summary.left,
      toLeftAfter: to.summary.left - candidate.amount,
    }
  }

  return null
}
