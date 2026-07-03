import type { Bill, BillCategory } from '../types'

const CATEGORY_PATTERNS: Array<[BillCategory, RegExp]> = [
  ['mortgage_rent', /\b(mortgage|rent)\b/i],
  ['utilities', /\b(tep|electric|water|gas|sw gas|utility|utilities)\b/i],
  ['phone_internet', /\b(verizon|phone|internet|cox|xfinity)\b/i],
  ['insurance', /\b(progressive|insurance)\b/i],
  ['car', /\b(car payment|auto|vehicle)\b/i],
  ['credit_card', /\b(cc|credit|citi|chase|strata|wf|pyramid|hd)\b/i],
  ['medical', /\b(dentist|doctor|medical|smile)\b/i],
  ['subscriptions', /\b(netflix|apple|peacock|claude|chatgpt|prime|hbo|max|subscription|groupon)\b/i],
]

export function normalizeBillName(title: string): string {
  return title
    .toLowerCase()
    .replace(/\b(scheduled|paid)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function inferBillCategory(title: string): BillCategory {
  return CATEGORY_PATTERNS.find(([, pattern]) => pattern.test(title))?.[0] ?? 'other'
}

export function findMatchingBillTemplate(bills: Bill[], title: string): Bill | undefined {
  const normalized = normalizeBillName(title)
  return bills.find((b) => normalizeBillName(b.name) === normalized)
}

export function dayOfMonth(isoDate: string): number {
  return new Date(isoDate + 'T00:00:00').getDate()
}
