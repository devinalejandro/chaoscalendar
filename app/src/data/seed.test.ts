import { describe, expect, it } from 'vitest'
import { seedHousehold } from './seed'
import { Snapshot } from '../types'

describe('seedHousehold', () => {
  const snap = seedHousehold('2026-06-01T00:00:00.000Z')

  it('produces a schema-valid snapshot', () => {
    expect(() => Snapshot.parse(snap)).not.toThrow()
  })

  it('generates the requested number of paycheck windows from the explicit paydays', () => {
    expect(snap.data.paychecks).toHaveLength(6)
    expect(snap.data.paychecks[0].payDate).toBe('2026-06-03')
    expect(snap.data.paychecks[0].amount).toBe(189348)
  })

  it('materializes instances for every bill and assigns each to a real window', () => {
    expect(snap.data.billInstances.length).toBeGreaterThan(0)
    for (const bill of snap.data.bills) {
      const instances = snap.data.billInstances.filter((i) => i.billId === bill.id)
      expect(instances.length).toBeGreaterThan(0)
    }
    for (const instance of snap.data.billInstances) {
      expect(instance.paycheckId).toBeDefined()
      expect(snap.data.paychecks.some((p) => p.id === instance.paycheckId)).toBe(true)
    }
  })

  it('carries the bill category through to the household (STRATA CC as credit_card)', () => {
    const strata = snap.data.bills.find((b) => b.name === 'STRATA CC')
    expect(strata?.category).toBe('credit_card')
    expect(strata?.expectedAmount).toBe(4500)
  })
})
