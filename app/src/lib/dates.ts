/** Dates are explicit YYYY-MM-DD strings. M/D input (Karla's notes) is
    resolved against a reference year so imports never produce Invalid date. */

export function iso(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function isValidIso(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(s + 'T00:00:00')
  return !Number.isNaN(d.getTime()) && iso(d) === s
}

/**
 * Resolve "M/D" to an ISO date near the reference date. If the resolved date
 * would land more than ~6 months in the past, roll it to the next year
 * (handles December pastes mentioning January bills, and vice versa).
 */
export function resolveMonthDay(md: string, reference: Date): string | null {
  const m = md.match(/^(\d{1,2})\/(\d{1,2})$/)
  if (!m) return null
  const month = +m[1]
  const day = +m[2]
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const candidate = new Date(reference.getFullYear(), month - 1, day)
  if (candidate.getMonth() !== month - 1) return null // e.g. 2/31
  const halfYearMs = 182 * 24 * 3600 * 1000
  if (reference.getTime() - candidate.getTime() > halfYearMs) {
    candidate.setFullYear(candidate.getFullYear() + 1)
  } else if (candidate.getTime() - reference.getTime() > halfYearMs) {
    candidate.setFullYear(candidate.getFullYear() - 1)
  }
  return iso(candidate)
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return iso(d)
}
