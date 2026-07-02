import { describe, expect, it } from 'vitest'
import { parseNote, parsePaydays } from './parseNote'
import { JUNE_MULTILINE, JUNE_RUNON, SIMPLE_LIST, TASKS } from './fixtures'
import { resolveMonthDay } from '../dates'
import { formatCents, parseCents } from '../money'

describe('parsePaydays', () => {
  it('extracts explicit payday dates and typical amount from the header', () => {
    const p = parsePaydays(JUNE_MULTILINE)
    expect(p).not.toBeNull()
    expect(p!.dates).toEqual(['6/3', '6/17', '7/1', '7/15', '7/29'])
    expect(p!.amount).toBe(189348)
  })

  it('works on the run-on single-line paste too', () => {
    const p = parsePaydays(JUNE_RUNON)
    expect(p!.dates).toEqual(['6/3', '6/17', '7/1', '7/15', '7/29'])
  })

  it('returns null when there is no PAYDAYS header', () => {
    expect(parsePaydays(SIMPLE_LIST)).toBeNull()
  })
})

describe('parseNote — June multiline fixture', () => {
  const parsed = parseNote(JUNE_MULTILINE)
  const bills = parsed.filter((p) => p.type === 'bill')

  it('finds all 23 bills', () => {
    expect(bills).toHaveLength(23)
  })

  it('marks ✅ lines paid and unmarked lines unpaid', () => {
    expect(bills.filter((b) => b.paid)).toHaveLength(21)
    const unpaid = bills.filter((b) => !b.paid).map((b) => b.title)
    expect(unpaid).toEqual(['TEP', 'Rite way'])
  })

  it('parses comma and decimal amounts as cents', () => {
    const mortgage = bills.find((b) => b.title === 'Mortgage')!
    expect(mortgage.amount).toBe(152455)
    const prime = bills.find((b) => b.title === 'Amazon Prime')!
    expect(prime.amount).toBe(760)
  })

  it('strips scheduled/paid annotations and checkmarks from titles', () => {
    const titles = bills.map((b) => b.title)
    expect(titles).toContain('Smile Gen CC')
    expect(titles).toContain('HD CC')
    expect(titles).toContain('WATER')
    for (const t of titles) {
      expect(t).not.toMatch(/✅|scheduled|paid/i)
    }
  })

  it('skips month headers, PAYDAYS list, and bare PAYDAY markers', () => {
    expect(parsed.some((p) => /june|paydays?/i.test(p.title))).toBe(false)
  })

  it('inherits the previous date for undated lines (Peacock)', () => {
    const peacock = parsed.find((p) => p.title === 'Peacock')!
    expect(peacock.date).toBe('6/1')
    expect(peacock.amount).toBe(324)
  })
})

describe('parseNote — run-on single-line paste', () => {
  it('splits the run-on line into the same records', () => {
    const parsed = parseNote(JUNE_RUNON)
    const bills = parsed.filter((p) => p.type === 'bill')
    expect(bills.map((b) => b.title)).toEqual([
      'Mortgage',
      'Citi Simplicity CC',
      'Peacock',
      'Claude',
      'Apple Subscription',
      'STRATA CC',
      'TEP',
      'Rite way',
    ])
    expect(bills.find((b) => b.title === 'TEP')!.paid).toBe(false)
    expect(bills.find((b) => b.title === 'STRATA CC')!.paid).toBe(true)
  })
})

describe('parseNote — simple due-style list (KNOWN LIMITATION)', () => {
  // The run-on normalizer splits "Title $X due M/D" before the "$", so the
  // title and date are lost for this format. Amounts survive. This documents
  // the ported prototype behavior; fixing it is M4 (import review) work — a
  // fix must update this test deliberately.
  it('currently keeps amounts but loses titles/dates for "Title $X due M/D"', () => {
    const parsed = parseNote(SIMPLE_LIST)
    expect(parsed.map((p) => [p.title, p.amount, p.date])).toEqual([
      ['due', 4125, null],
      ['due', 12050, null],
      ['due', 999, null],
      ['due', 34575, null],
    ])
  })
})

describe('parseNote — tasks', () => {
  it('classifies check/call/look lines as tasks', () => {
    const parsed = parseNote(TASKS)
    expect(parsed.every((p) => p.type === 'task')).toBe(true)
    expect(parsed).toHaveLength(3)
  })
})

describe('date + money helpers used at import time', () => {
  it('resolves M/D against a reference year', () => {
    const ref = new Date(2026, 5, 30) // 2026-06-30
    expect(resolveMonthDay('7/7', ref)).toBe('2026-07-07')
    // within ±6 months stays in the reference year
    expect(resolveMonthDay('1/5', ref)).toBe('2026-01-05')
    // a December paste mentioning January rolls forward a year
    const dec = new Date(2026, 11, 1) // 2026-12-01
    expect(resolveMonthDay('1/5', dec)).toBe('2027-01-05')
    expect(resolveMonthDay('2/31', ref)).toBeNull()
  })

  it('round-trips cents formatting', () => {
    expect(parseCents('1,893.48')).toBe(189348)
    expect(formatCents(189348)).toBe('$1,893.48')
    expect(formatCents(4500)).toBe('$45')
  })
})
