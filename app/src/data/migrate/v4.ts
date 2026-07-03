import { z } from 'zod'
import { Household, Paycheck, Bill, BillInstance, Goal, RecurrenceRule } from '../../types'
import type { Snapshot } from '../../types'

/** Frozen shape of schemaVersion 3 before auth users and auditEvents existed. */
export const SnapshotV3 = z.object({
  schemaVersion: z.literal(3),
  updatedAt: z.string(),
  deviceId: z.string(),
  data: z.object({
    household: Household.optional(),
    paychecks: z.array(Paycheck).default([]),
    bills: z.array(Bill).default([]),
    billInstances: z.array(BillInstance).default([]),
    goals: z.array(Goal).default([]),
    recurrenceRules: z.array(RecurrenceRule).default([]),
  }),
})
export type SnapshotV3 = z.infer<typeof SnapshotV3>

export function migrateV3toV4(prev: SnapshotV3): Snapshot {
  return {
    schemaVersion: 4,
    updatedAt: prev.updatedAt,
    deviceId: prev.deviceId,
    data: {
      ...prev.data,
      users: [],
      auditEvents: [],
    },
  }
}
