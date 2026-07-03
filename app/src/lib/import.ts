/** Turns raw parser output (lib/parser/parseNote.ts) into reviewable
    suggestions for the paste-import screen (features/import). Nothing here
    touches the store — buildImportSuggestions is pure, and the review
    screen is the only thing allowed to turn an accepted suggestion into a
    real entity (PRD: "nothing writes to final finance records until
    accepted"). */

import { parseNote, parsePaydays, type ParsedLine } from './parser/parseNote'
import { resolveMonthDay } from './dates'

export type SuggestionType = 'paycheck' | 'bill' | 'appointment' | 'task'
export type Confidence = 'low' | 'medium' | 'high'

export interface ImportSuggestion {
  id: string
  suggestedType: SuggestionType
  title: string
  /** integer cents, null when no amount was detected */
  amount: number | null
  /** resolved ISO date, null when the line had no date or it failed to resolve */
  date: string | null
  paid: boolean
  confidence: Confidence
  rawText: string
}

function mapType(t: ParsedLine['type']): SuggestionType | null {
  switch (t) {
    case 'bill':
      return 'bill'
    case 'event':
      return 'appointment'
    case 'task':
      return 'task'
    case 'paycheck':
      // Paydays come from the PAYDAYS header (parsePaydays) — parseNote
      // deliberately drops bare "PAYDAY" line markers as redundant with it.
      return null
  }
}

function confidenceFor(type: SuggestionType, amount: number | null, date: string | null): Confidence {
  if (type === 'task') return date ? 'medium' : 'low'
  if (amount != null && date != null) return 'high'
  if (amount != null || date != null) return 'medium'
  return 'low'
}

/** Builds the full suggestion list for the review screen: one entry per
    explicit payday plus one per parsed line, with M/D dates resolved
    against `reference` (normally "now"). */
export function buildImportSuggestions(text: string, reference: Date): ImportSuggestion[] {
  const out: ImportSuggestion[] = []

  const paydays = parsePaydays(text)
  if (paydays) {
    paydays.dates.forEach((md, i) => {
      const date = resolveMonthDay(md, reference)
      out.push({
        id: `paycheck_${i}`,
        suggestedType: 'paycheck',
        title: 'Paycheck',
        amount: paydays.amount,
        date,
        paid: false,
        confidence: date ? 'high' : 'low',
        rawText: `PAYDAYS ${md}`,
      })
    })
  }

  parseNote(text).forEach((p) => {
    const type = mapType(p.type)
    if (!type) return
    const date = p.date ? resolveMonthDay(p.date, reference) : null
    out.push({
      id: `line_${p.index}`,
      suggestedType: type,
      title: p.title,
      amount: p.amount,
      date,
      paid: p.paid,
      confidence: confidenceFor(type, p.amount, date),
      rawText: p.raw,
    })
  })

  return out
}
