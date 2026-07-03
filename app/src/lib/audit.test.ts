import { describe, expect, it } from 'vitest'
import { appendAuditEvent, recentAuditEvents } from './audit'
import { seedHousehold } from '../data/seed'

describe('audit helpers', () => {
  it('prepends audit events and caps history at 100', () => {
    let snapshot = seedHousehold('2026-07-03T00:00:00.000Z')
    for (let i = 0; i < 105; i += 1) {
      snapshot = appendAuditEvent(snapshot, {
        action: 'test.action',
        entityType: 'test',
        entityId: String(i),
        createdAt: `2026-07-03T00:00:${String(i).padStart(2, '0')}.000Z`,
      })
    }

    expect(snapshot.data.auditEvents).toHaveLength(100)
    expect(snapshot.data.auditEvents[0].entityId).toBe('104')
    expect(snapshot.data.auditEvents.at(-1)?.entityId).toBe('5')
  })

  it('returns recent events sorted newest first', () => {
    let snapshot = seedHousehold('2026-07-03T00:00:00.000Z')
    snapshot = appendAuditEvent(snapshot, { action: 'old', entityType: 'bill', entityId: '1', createdAt: '2026-07-03T00:00:00.000Z' })
    snapshot = appendAuditEvent(snapshot, { action: 'new', entityType: 'bill', entityId: '2', createdAt: '2026-07-03T00:01:00.000Z' })

    expect(recentAuditEvents(snapshot, 1).map((e) => e.action)).toEqual(['new'])
  })
})
