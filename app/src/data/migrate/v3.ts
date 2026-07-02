import { z } from 'zod'
import { Household, Paycheck, Bill, BillInstance, Goal } from '../../types'
import type { Snapshot } from '../../types'

/** Frozen shape of the schemaVersion-2 snapshot (the shape shipped in M0,
    before recurrenceRules existed). Entity sub-schemas are unchanged between
    v2 and v3, so they're reused directly from types/index.ts. */
export const SnapshotV2 = z.object({
  schemaVersion: z.literal(2),
  updatedAt: z.string(),
  deviceId: z.string(),
  data: z.object({
    household: Household.optional(),
    paychecks: z.array(Paycheck).default([]),
    bills: z.array(Bill).default([]),
    billInstances: z.array(BillInstance).default([]),
    goals: z.array(Goal).default([]),
  }),
})
export type SnapshotV2 = z.infer<typeof SnapshotV2>

/** v2 -> v3: adds recurrenceRules. Purely additive — v2 had no recurrence
    data at all, so every household starts with an empty rules list and picks
    up recurrence the next time a bill template is edited to use one. */
export function migrateV2toV3(prev: SnapshotV2): Snapshot {
  return {
    schemaVersion: 3,
    updatedAt: prev.updatedAt,
    deviceId: prev.deviceId,
    data: {
      ...prev.data,
      recurrenceRules: [],
    },
  }
}
