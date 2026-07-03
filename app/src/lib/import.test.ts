import { describe, expect, it } from 'vitest'
import { buildImportSuggestions } from './import'
import { JUNE_MULTILINE, JUNE_RUNON, TASKS } from './parser/fixtures'

const REF = new Date(2026, 5, 30) // 2026-06-30, matches the fixtures' June dates

describe('buildImportSuggestions — JUNE_MULTILINE', () => {
  const suggestions = buildImportSuggestions(JUNE_MULTILINE, REF)

  it('produces one high-confidence paycheck suggestion per PAYDAYS date', () => {
    const paychecks = suggestions.filter((s) => s.suggestedType === 'paycheck')
    expect(paychecks).toHaveLength(5)
    expect(paychecks.every((p) => p.confidence === 'high' && p.amount === 189348)).toBe(true)
    expect(paychecks.map((p) => p.date)).toEqual(['2026-06-03', '2026-06-17', '2026-07-01', '2026-07-15', '2026-07-29'])
  })

  it('does not also produce paycheck suggestions from the bare "PAYDAY" line markers', () => {
    // parseNote drops bare PAYDAY markers; only the PAYDAYS header feeds paycheck suggestions
    const paycheckTitles = suggestions.filter((s) => s.suggestedType === 'paycheck').map((s) => s.rawText)
    expect(paycheckTitles.every((t) => t.startsWith('PAYDAYS'))).toBe(true)
  })

  it('maps bill lines to high-confidence bill suggestions with resolved dates and paid flags', () => {
    const bills = suggestions.filter((s) => s.suggestedType === 'bill')
    expect(bills).toHaveLength(23)
    const mortgage = bills.find((b) => b.title === 'Mortgage')!
    expect(mortgage).toMatchObject({ amount: 152455, date: '2026-06-01', paid: true, confidence: 'high' })
    const tep = bills.find((b) => b.title === 'TEP')!
    expect(tep).toMatchObject({ amount: 15474, date: '2026-06-22', paid: false, confidence: 'high' })
  })

  it('resolves the June dates to 2026, not some other year', () => {
    const bills = suggestions.filter((s) => s.suggestedType === 'bill')
    expect(bills.every((b) => b.date?.startsWith('2026-06'))).toBe(true)
  })
})

describe('buildImportSuggestions — run-on paste', () => {
  it('produces the same paycheck and bill suggestions as the multiline version', () => {
    const suggestions = buildImportSuggestions(JUNE_RUNON, REF)
    expect(suggestions.filter((s) => s.suggestedType === 'paycheck')).toHaveLength(5)
    const bills = suggestions.filter((s) => s.suggestedType === 'bill')
    expect(bills.map((b) => b.title)).toEqual(['Mortgage', 'Citi Simplicity CC', 'Peacock', 'Claude', 'Apple Subscription', 'STRATA CC', 'TEP', 'Rite way'])
  })
})

describe('buildImportSuggestions — appointments', () => {
  it('maps a dentist/doctor line to an appointment suggestion', () => {
    // amount immediately follows the date, matching Karla's real format
    // (the normalizer splits "Title $amount" — amount-at-line-end — onto its
    // own line, same as the live parser; this is documented, fixture-locked
    // parser behavior, not something import.ts works around)
    const suggestions = buildImportSuggestions('6/25 $75 Dentist appointment', REF)
    const appt = suggestions.find((s) => s.suggestedType === 'appointment')
    expect(appt).toMatchObject({ amount: 7500, date: '2026-06-25', confidence: 'high' })
  })
})

describe('buildImportSuggestions — tasks', () => {
  it('maps check/call/look lines to low-confidence task suggestions with no date', () => {
    const suggestions = buildImportSuggestions(TASKS, REF)
    expect(suggestions).toHaveLength(3)
    expect(suggestions.every((s) => s.suggestedType === 'task' && s.confidence === 'low' && s.date === null)).toBe(true)
  })
})

describe('buildImportSuggestions — no PAYDAYS header', () => {
  it('produces zero paycheck suggestions', () => {
    const suggestions = buildImportSuggestions('6/7 $41.25 Apple Subscription', REF)
    expect(suggestions.filter((s) => s.suggestedType === 'paycheck')).toHaveLength(0)
  })
})
