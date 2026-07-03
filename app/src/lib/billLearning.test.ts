import { describe, expect, it } from 'vitest'
import { findMatchingBillTemplate, inferBillCategory, normalizeBillName } from './billLearning'
import type { Bill } from '../types'

describe('bill learning helpers', () => {
  it('normalizes noisy imported bill names for template matching', () => {
    expect(normalizeBillName('STRATA CC - scheduled')).toBe('strata cc')
    expect(normalizeBillName('Apple Subscription paid')).toBe('apple subscription')
  })

  it('infers practical categories from Karla-style bill titles', () => {
    expect(inferBillCategory('TEP')).toBe('utilities')
    expect(inferBillCategory('Netflix')).toBe('subscriptions')
    expect(inferBillCategory('Citi Simplicity CC')).toBe('credit_card')
    expect(inferBillCategory('Mystery')).toBe('other')
  })

  it('matches existing bill templates by normalized name', () => {
    const bills: Bill[] = [
      { id: 'bill_1', householdId: 'hh', name: 'STRATA CC', category: 'credit_card', isFixed: true, active: true },
    ]
    expect(findMatchingBillTemplate(bills, 'strata cc scheduled')?.id).toBe('bill_1')
  })
})
