/** Port of the proven parser from the live prototype (index.html).
    Behavior is locked by fixtures in parseNote.test.ts — keep changes
    fixture-driven. Amounts are returned as integer cents; dates stay in the
    raw "M/D" form (year resolution happens at import time via
    lib/dates.resolveMonthDay so the reference date is explicit). */

import { parseCents } from '../money'

export type ParsedType = 'bill' | 'event' | 'paycheck' | 'task'

export interface ParsedLine {
  type: ParsedType
  title: string
  /** integer cents, null when the line has no amount */
  amount: number | null
  /** raw "M/D" as written in the note, null when none applies */
  date: string | null
  paid: boolean
  raw: string
  index: number
}

/** Explicit payday dates from a "PAYDAYS 6/3 6/17 7/1 ..." header line. */
export interface ParsedPaydays {
  dates: string[]
  /** typical amount in cents when the header carries one */
  amount: number | null
}

const AMT_RE = /\$\s*([0-9][0-9,]*(?:\.\d{1,2})?)/
const DATE_RE = /\b(\d{1,2})\/(\d{1,2})\b/
const MONTH_NAMES =
  /^(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)s?$/i

/** Karla often pastes everything as one run-on line; normalize() re-splits it
    on date/$ boundaries the same way the live app does. */
function normalize(text: string): string[] {
  return String(text || '')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/(\b\d{1,2}\/\d{1,2})\s+(?=\$)/g, '$1~')
    .replace(/\s+(?=\d{1,2}\/\d{1,2}~\$)/g, '\n')
    .replace(/\s+(?=\$)/g, '\n')
    .replace(/~/g, ' ')
    .replace(/\s+(?=\d{1,2}\/\d{1,2}\s+PAYDAY\b)/gi, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
}

function cleanTitle(line: string): string {
  return line
    .replace(AMT_RE, '')
    .replace(/\s*-\s*scheduled\s+\d{1,2}\/\d{1,2}\b/gi, '')
    .replace(/\bscheduled\s+\d{1,2}\/\d{1,2}\b/gi, '')
    .replace(/\s*-\s*scheduled\b/gi, '')
    .replace(/\bscheduled\b/gi, '')
    .replace(/\bpaid\s+\d{1,2}\/\d{1,2}\b/gi, '')
    .replace(/\bpaid\b/gi, '')
    .replace(DATE_RE, '')
    .replace(/✅/g, '')
    .replace(/\s*[-:]\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/** Extract explicit paydays from a "PAYDAYS ..." header, if present. */
export function parsePaydays(text: string): ParsedPaydays | null {
  const line = normalize(text).find((l) => /^paydays\b/i.test(l))
  if (!line) return null
  const dates = [...line.matchAll(/\b(\d{1,2}\/\d{1,2})\b/g)].map((m) => m[1])
  const amtMatch = line.match(/([0-9][0-9,]*\.\d{2})(?!\s*\/)/)
  const amount = amtMatch ? parseCents(amtMatch[1]) : null
  return dates.length ? { dates, amount } : null
}

export function parseNote(text: string): ParsedLine[] {
  const records = normalize(text)
  const out: ParsedLine[] = []
  let lastDate: string | null = null

  records.forEach((line) => {
    const low = line.toLowerCase()
    const dm = line.match(/^(\d{1,2}\/\d{1,2})\b/)
    if (dm) lastDate = dm[0]
    const date = dm ? dm[0] : lastDate

    // Skip month headers, the PAYDAYS list, and bare PAYDAY markers.
    if (MONTH_NAMES.test(line) || low.startsWith('paydays') || (/\bpayday\b/i.test(line) && !AMT_RE.test(line))) return

    const hasPaid = /✅|\bpaid\b/i.test(line)
    const am = line.match(AMT_RE)
    let type: ParsedType | 'unknown' = 'unknown'
    let title = line
    let amount: number | null = null

    if (am) {
      amount = parseCents(am[1])
      title = cleanTitle(line)
      type = low.includes('dentist') || low.includes('doctor') || low.includes('appointment') ? 'event' : 'bill'
    } else if (low.includes('paycheck')) {
      type = 'paycheck'
      title = 'Paycheck'
    } else if (low.startsWith('check') || low.startsWith('call') || low.startsWith('look') || low.includes('signup')) {
      type = 'task'
      title = cleanTitle(line) || line.replace(/✅/g, '').trim()
    }

    if (type === 'unknown' || !title) return
    out.push({ type, title, amount, date, paid: hasPaid, raw: line, index: out.length })
  })

  return out
}
