import { describe, expect, it } from 'vitest'
import { buildAdminHealthReport } from './adminHealth'
import { seedHousehold } from '../data/seed'
import { createEmptySnapshot } from '../data/migrate'

describe('buildAdminHealthReport', () => {
  it('passes cutover-critical checks when data and archive are present', () => {
    const report = buildAdminHealthReport({
      snapshot: seedHousehold('2026-07-02T00:00:00.000Z'),
      supabaseConfigured: true,
      hasLegacyArchive: true,
      hasServiceWorker: true,
    })

    expect(report.readyForCutover).toBe(true)
    expect(report.checks.every((check) => check.status === 'pass')).toBe(true)
  })

  it('fails when household or legacy archive are missing', () => {
    const report = buildAdminHealthReport({
      snapshot: createEmptySnapshot('dev', '2026-07-02T00:00:00.000Z'),
      supabaseConfigured: false,
      hasLegacyArchive: false,
      hasServiceWorker: false,
    })

    expect(report.readyForCutover).toBe(false)
    expect(report.checks.find((check) => check.id === 'household')?.status).toBe('fail')
    expect(report.checks.find((check) => check.id === 'legacy')?.status).toBe('fail')
    expect(report.checks.find((check) => check.id === 'supabase')?.status).toBe('warn')
  })
})
