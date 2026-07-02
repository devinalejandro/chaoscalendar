import { describe, expect, it } from 'vitest'
import { occurrencesInRange } from './recurrence'
import type { RecurrenceRule } from '../types'

const rule = (overrides: Partial<RecurrenceRule>): RecurrenceRule => ({
  id: 'rr_test',
  householdId: 'hh_test',
  frequency: 'monthly',
  ...overrides,
})

describe('occurrencesInRange — monthly', () => {
  it('returns one date per month on the configured day', () => {
    const r = rule({ frequency: 'monthly', dayOfMonth: 10 })
    expect(occurrencesInRange(r, '2026-06-01', '2026-08-31')).toEqual(['2026-06-10', '2026-07-10', '2026-08-10'])
  })

  it('clamps to the last day of short months (Feb 31 -> Feb 28)', () => {
    const r = rule({ frequency: 'monthly', dayOfMonth: 31 })
    expect(occurrencesInRange(r, '2026-01-15', '2026-03-31')).toEqual(['2026-01-31', '2026-02-28', '2026-03-31'])
  })

  it('excludes a candidate that falls before `from` in the starting month', () => {
    const r = rule({ frequency: 'monthly', dayOfMonth: 1 })
    expect(occurrencesInRange(r, '2026-06-15', '2026-08-01')).toEqual(['2026-07-01', '2026-08-01'])
  })

  it('returns empty for an invalid or inverted range', () => {
    const r = rule({ frequency: 'monthly', dayOfMonth: 1 })
    expect(occurrencesInRange(r, '2026-08-01', '2026-06-01')).toEqual([])
    expect(occurrencesInRange(r, 'not-a-date', '2026-06-01')).toEqual([])
  })
})

describe('occurrencesInRange — weekly/biweekly', () => {
  it('steps every 7 days from the anchor', () => {
    const r = rule({ frequency: 'weekly', anchorDate: '2026-06-01' })
    expect(occurrencesInRange(r, '2026-06-01', '2026-06-22')).toEqual(['2026-06-01', '2026-06-08', '2026-06-15', '2026-06-22'])
  })

  it('fast-forwards an anchor that predates the range instead of iterating one day at a time', () => {
    const r = rule({ frequency: 'biweekly', anchorDate: '2026-01-01' })
    const result = occurrencesInRange(r, '2026-06-01', '2026-06-30')
    // every date must land on the anchor's 14-day cadence
    for (const d of result) {
      const days = (new Date(d + 'T00:00:00').getTime() - new Date('2026-01-01T00:00:00').getTime()) / 86_400_000
      expect(days % 14).toBe(0)
    }
    expect(result.length).toBeGreaterThan(0)
  })

  it('defaults the anchor to `from` when none is set', () => {
    const r = rule({ frequency: 'weekly' })
    expect(occurrencesInRange(r, '2026-06-01', '2026-06-08')).toEqual(['2026-06-01', '2026-06-08'])
  })
})

describe('occurrencesInRange — custom_days', () => {
  it('steps by intervalDays', () => {
    const r = rule({ frequency: 'custom_days', intervalDays: 10, anchorDate: '2026-06-01' })
    expect(occurrencesInRange(r, '2026-06-01', '2026-06-25')).toEqual(['2026-06-01', '2026-06-11', '2026-06-21'])
  })
})
