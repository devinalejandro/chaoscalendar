import { z } from 'zod'

/** Dates are stored as explicit YYYY-MM-DD strings; amounts as integer cents. */
export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
export const Cents = z.number().int()
export const Id = z.string().min(1)

export const Household = z.object({
  id: Id,
  name: z.string(),
  timezone: z.string().default('America/Phoenix'),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type Household = z.infer<typeof Household>

export const User = z.object({
  id: Id,
  householdId: Id,
  name: z.string(),
  role: z.enum(['owner', 'member']),
  login: z.string().optional(),
  createdAt: z.string(),
})
export type User = z.infer<typeof User>

export const Paycheck = z.object({
  id: Id,
  householdId: Id,
  payDate: IsoDate,
  amount: Cents,
  sourceLabel: z.string().optional(),
  periodStart: IsoDate,
  periodEnd: IsoDate,
  recurrenceRuleId: Id.optional(),
  notes: z.string().optional(),
})
export type Paycheck = z.infer<typeof Paycheck>

export const BillCategory = z.enum([
  'mortgage_rent',
  'utilities',
  'phone_internet',
  'insurance',
  'car',
  'credit_card',
  'medical',
  'kids',
  'subscriptions',
  'other',
])
export type BillCategory = z.infer<typeof BillCategory>

/** Bill is a template; BillInstance is the dated occurrence. */
export const Bill = z.object({
  id: Id,
  householdId: Id,
  name: z.string(),
  category: BillCategory.default('other'),
  expectedAmount: Cents.optional(),
  dueDay: z.number().int().min(1).max(31).optional(),
  dueDate: IsoDate.optional(),
  recurrenceRuleId: Id.optional(),
  isFixed: z.boolean().default(true),
  active: z.boolean().default(true),
  notes: z.string().optional(),
})
export type Bill = z.infer<typeof Bill>

export const BillInstanceStatus = z.enum(['expected', 'scheduled', 'paid', 'skipped', 'late'])
export type BillInstanceStatus = z.infer<typeof BillInstanceStatus>

export const BillInstance = z.object({
  id: Id,
  billId: Id.optional(),
  householdId: Id,
  title: z.string(),
  dueDate: IsoDate.optional(),
  amount: Cents.optional(),
  status: BillInstanceStatus.default('expected'),
  paidDate: IsoDate.optional(),
  paycheckId: Id.optional(),
  sourceImportId: Id.optional(),
  notes: z.string().optional(),
})
export type BillInstance = z.infer<typeof BillInstance>

export const RecurrenceFrequency = z.enum(['monthly', 'weekly', 'biweekly', 'custom_days'])
export type RecurrenceFrequency = z.infer<typeof RecurrenceFrequency>

/** Drives BillInstance materialization (lib/billInstances.ts). Bill.recurrenceRuleId
    points here; a Bill without a rule and without its own dueDate produces no instances. */
export const RecurrenceRule = z.object({
  id: Id,
  householdId: Id,
  frequency: RecurrenceFrequency,
  /** monthly: day of month, clamped to the last day of short months */
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  /** weekly/biweekly/custom_days: date the cadence is anchored to */
  anchorDate: IsoDate.optional(),
  /** custom_days: repeat every N days from anchorDate */
  intervalDays: z.number().int().positive().optional(),
})
export type RecurrenceRule = z.infer<typeof RecurrenceRule>

export const ImportBatch = z.object({
  id: Id,
  householdId: Id,
  sourceType: z.enum(['paste', 'file', 'email', 'manual']),
  rawText: z.string(),
  status: z.enum(['reviewing', 'applied', 'ignored']),
  createdAt: z.string(),
})
export type ImportBatch = z.infer<typeof ImportBatch>

export const SuggestionType = z.enum(['paycheck', 'bill', 'billInstance', 'appointment', 'task'])
export type SuggestionType = z.infer<typeof SuggestionType>

export const ImportSuggestion = z.object({
  id: Id,
  importBatchId: Id,
  suggestedType: SuggestionType,
  title: z.string(),
  amount: Cents.optional(),
  date: IsoDate.optional(),
  paid: z.boolean().default(false),
  confidence: z.enum(['low', 'medium', 'high']),
  rawText: z.string(),
  accepted: z.boolean().default(false),
  editedPayload: z.record(z.string(), z.unknown()).optional(),
})
export type ImportSuggestion = z.infer<typeof ImportSuggestion>

export const Goal = z.object({
  id: Id,
  householdId: Id,
  name: z.string(),
  targetAmount: Cents,
  targetDate: IsoDate.optional(),
  currentAmount: Cents.default(0),
  monthlyContribution: Cents.optional(),
  status: z.enum(['active', 'reached', 'paused', 'archived']).default('active'),
})
export type Goal = z.infer<typeof Goal>

export const AuditEvent = z.object({
  id: Id,
  householdId: Id,
  actor: z.string(),
  action: z.string(),
  entityType: z.string(),
  entityId: Id,
  before: z.unknown().optional(),
  after: z.unknown().optional(),
  createdAt: z.string(),
})
export type AuditEvent = z.infer<typeof AuditEvent>

/** Versioned envelope for the local cache; every shape change bumps this and
    adds a migration in src/data/migrate/.
    v4: added users and auditEvents for the Supabase/auth foundation. */
export const SCHEMA_VERSION = 4

export const Snapshot = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  updatedAt: z.string(),
  deviceId: z.string(),
  data: z.object({
    household: Household.optional(),
    users: z.array(User).default([]),
    paychecks: z.array(Paycheck).default([]),
    bills: z.array(Bill).default([]),
    billInstances: z.array(BillInstance).default([]),
    goals: z.array(Goal).default([]),
    recurrenceRules: z.array(RecurrenceRule).default([]),
    auditEvents: z.array(AuditEvent).default([]),
  }),
})
export type Snapshot = z.infer<typeof Snapshot>
