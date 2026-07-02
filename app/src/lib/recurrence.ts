import type { RecurrenceRule } from '../types'
import { addDays, iso, isValidIso } from './dates'

/** Returns ISO due dates a recurrence rule produces within [fromIso, toIso],
    inclusive on both ends. Pure and side-effect free — callers decide what
    to do with dates that already have a BillInstance (lib/billInstances.ts). */
export function occurrencesInRange(rule: RecurrenceRule, fromIso: string, toIso: string): string[] {
  if (!isValidIso(fromIso) || !isValidIso(toIso) || fromIso > toIso) return []
  switch (rule.frequency) {
    case 'monthly':
      return monthlyOccurrences(rule, fromIso, toIso)
    case 'weekly':
      return intervalOccurrences(rule, fromIso, toIso, 7)
    case 'biweekly':
      return intervalOccurrences(rule, fromIso, toIso, 14)
    case 'custom_days':
      return intervalOccurrences(rule, fromIso, toIso, rule.intervalDays ?? 30)
  }
}

function monthlyOccurrences(rule: RecurrenceRule, fromIso: string, toIso: string): string[] {
  const day = rule.dayOfMonth ?? 1
  const from = new Date(fromIso + 'T00:00:00')
  const to = new Date(toIso + 'T00:00:00')
  const out: string[] = []
  let year = from.getFullYear()
  let month0 = from.getMonth()
  let guard = 0
  for (;;) {
    guard += 1
    if (guard > 1200) break // ~100 years, safety net against a bad rule
    const daysInMonth = new Date(year, month0 + 1, 0).getDate()
    const candidate = new Date(year, month0, Math.min(day, daysInMonth))
    if (candidate > to) break
    const candidateIso = iso(candidate)
    if (candidateIso >= fromIso) out.push(candidateIso)
    month0 += 1
    if (month0 > 11) {
      month0 = 0
      year += 1
    }
  }
  return out
}

function intervalOccurrences(rule: RecurrenceRule, fromIso: string, toIso: string, stepDays: number): string[] {
  const anchor = rule.anchorDate && isValidIso(rule.anchorDate) ? rule.anchorDate : fromIso
  let cursor = anchor
  if (cursor < fromIso) {
    const anchorMs = new Date(cursor + 'T00:00:00').getTime()
    const fromMs = new Date(fromIso + 'T00:00:00').getTime()
    const steps = Math.floor((fromMs - anchorMs) / 86_400_000 / stepDays)
    cursor = addDays(cursor, Math.max(steps, 0) * stepDays)
    while (cursor < fromIso) cursor = addDays(cursor, stepDays)
  }
  const out: string[] = []
  let guard = 0
  while (cursor <= toIso && guard < 10_000) {
    out.push(cursor)
    cursor = addDays(cursor, stepDays)
    guard += 1
  }
  return out
}
