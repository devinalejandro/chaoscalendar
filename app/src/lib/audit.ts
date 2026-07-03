import type { AuditEvent, Snapshot } from '../types'
import { newId } from './id'

export function appendAuditEvent(
  snapshot: Snapshot,
  event: Omit<AuditEvent, 'id' | 'createdAt' | 'householdId' | 'actor'> & {
    householdId?: string
    createdAt?: string
    actor?: string
  },
): Snapshot {
  const householdId = event.householdId ?? snapshot.data.household?.id ?? 'hh_local'
  const createdAt = event.createdAt ?? new Date().toISOString()
  const auditEvent: AuditEvent = {
    id: newId('audit'),
    householdId,
    actor: event.actor ?? 'local',
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId,
    before: event.before,
    after: event.after,
    createdAt,
  }
  return {
    ...snapshot,
    data: {
      ...snapshot.data,
      auditEvents: [auditEvent, ...snapshot.data.auditEvents].slice(0, 100),
    },
  }
}

export function recentAuditEvents(snapshot: Snapshot, limit = 10): AuditEvent[] {
  return [...snapshot.data.auditEvents].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit)
}
