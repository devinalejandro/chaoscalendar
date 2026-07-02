# Aurora Finance App PRD

## Summary
Rebuild Aurora Calendar from a single-file prototype into a structured household finance app for Karla's family. The app should keep the soft, simple UI style, but the data layer must become reliable enough for ongoing use, imports, future projections, and safe updates without losing or corrupting saved data.

## Problem
The current static HTML app is useful as a prototype, but it is brittle:
- Paycheck and bill data are stored as one broad state object.
- Bad saved data can survive deployments and keep showing issues like `Invalid date`.
- Pasted notes are parsed directly into app state instead of going through a review/import pipeline.
- Finance logic is mixed into UI code.
- There is no schema versioning, migration system, audit log, or true recurring bill model.

## Goals
- Make paycheck budgeting accurate and understandable.
- Track fixed bills, variable bills, paychecks, paid status, and spending room.
- Support Karla's paste-from-notes workflow with a clear review step.
- Add prediction planning for vacations, savings goals, and future bill windows.
- Protect data during future app updates.
- Keep the interface simple enough for daily household use.

## Non-Goals For First Rebuild
- No bank account linking.
- No automatic bill pay.
- No credit score or investment tracking.
- No complex double-entry accounting.
- No automatic email scanning until the core finance model is stable.

## Target Users
- Primary: Karla, managing household bills, paychecks, family reminders, and spending room.
- Secondary: Devin/admin, maintaining the app, backups, and future feature additions.

## Core UX
Use four primary tabs:
- Today: current pay period, next bills, alerts, quick add.
- Paychecks: total income, bills due in the period, what's left, prediction calculator.
- Calendar: paydays, bill due dates, appointments, reminders.
- Bills: fixed bill library, subscriptions, one-time bills, paid history.

The UI should remain mobile-first and soft/vintage floral, but desktop should be a full browser experience, not a phone preview.

## Data Model
Use structured entities instead of one loose state object.

### Household
- id
- name
- timezone
- createdAt
- updatedAt

### User
- id
- householdId
- name
- role: owner, member
- email or login identifier
- createdAt

### Paycheck
- id
- householdId
- payDate
- amount
- sourceLabel
- periodStart
- periodEnd
- recurrenceRuleId
- notes

### Bill
- id
- householdId
- name
- category
- expectedAmount
- dueDay or dueDate
- recurrenceRuleId
- isFixed
- active
- notes

### BillInstance
- id
- billId
- householdId
- dueDate
- amount
- status: expected, scheduled, paid, skipped, late
- paidDate
- paycheckId
- sourceImportId
- notes

### ImportBatch
- id
- householdId
- sourceType: paste, file, email, manual
- rawText
- status: reviewing, applied, ignored
- createdAt

### ImportSuggestion
- id
- importBatchId
- suggestedType: paycheck, bill, billInstance, appointment, task
- title
- amount
- date
- confidence
- rawText
- accepted
- editedPayload

### Goal
- id
- householdId
- name
- targetAmount
- targetDate
- currentAmount
- monthlyContribution
- status

### AuditEvent
- id
- householdId
- actor
- action
- entityType
- entityId
- before
- after
- createdAt

## Key Features

### 1. Paycheck Budgeting
Each paycheck window must show:
- Total: paycheck amount.
- Bills: all bill instances due in that pay period.
- Left: total minus bills.
- Bill count.
- List of bills due in that period.

Paid status should remain visible on individual bills, but paycheck summaries should focus on planning, not paid/unpaid labels.

### 2. Fixed Bill Library
Allow Karla to maintain expected bills:
- Name.
- Expected amount.
- Due day/date.
- Category.
- Recurrence.
- Active/inactive.

The app should generate future bill instances from this library.

### 3. Paste Import Review
Support Karla's notes format:
- `PAYDAYS 6/3 6/17 7/1 7/15 7/29 1,893.48`
- `6/7 $41.25 Apple Subscription✅`
- `6/22 $154.74 TEP`

Import flow:
- Paste notes.
- Parse suggestions.
- Show review list grouped by paychecks, bills, appointments, and needs review.
- Karla can Save, Edit, Ignore.
- Green check mark means paid.
- No check mark means unpaid/expected.
- Nothing writes to final finance records until accepted.

### 4. Prediction Calculator
Use known paychecks and fixed bills to project:
- Left after bills for next paycheck.
- Next 4 paychecks.
- Next 8 paychecks.
- Monthly average leftover.
- Goal planner: "How many paychecks until we can save X?"
- Vacation planner: target amount and target date.

### 5. Data Safety
Required:
- Schema version field.
- Migrations for every data shape change.
- Automatic repair for invalid dates and orphaned bill/paycheck links.
- Backups before migration.
- Export JSON and CSV.
- Audit log for major changes.

### 6. Authentication And Storage
Recommended backend:
- Supabase Postgres + Auth for the full finance app.
- Netlify remains the hosting layer.

Reason:
- Netlify Blobs is fine for simple key/value storage, but this app needs relational finance data, queries, migrations, and safer update paths.

### 7. Reminders
Initial:
- In-app upcoming reminders.
- Bill due soon.
- Paycheck window starting.

Later:
- Email reminders.
- Push notifications.
- SMS optional.

## Architecture Recommendation

### Frontend
- Next.js or Vite React.
- TypeScript.
- Component-based UI.
- Mobile-first responsive layout.
- Local optimistic state with backend sync.

### Backend
- Supabase Postgres.
- Supabase Auth.
- Row-level security by household.
- Server functions for parsing/import logic if needed.

### Hosting
- Netlify.
- Environment variables for backend keys.
- Preview deploys for testing before production.

## Migration From Current App
1. Add export button to current app.
2. Export current state JSON.
3. Build importer for old `auroraCalendar.v1` shape.
4. Normalize into households, paychecks, bills, and bill instances.
5. Run validation.
6. Show migration review before saving.

## Validation Rules
- No paycheck may have invalid date fields.
- Every bill instance with a due date should map to a paycheck window when possible.
- Amounts must be numbers, never formatted strings.
- Imported dates must store year, month, and day explicitly.
- Recurring bills should create instances, not overwrite the bill template.

## MVP Scope
- Authenticated household dashboard.
- Paycheck windows.
- Fixed bill library.
- Bill instances.
- Paste import review.
- Paycheck budgeting view.
- Prediction calculator.
- Calendar view.
- Data export/import.
- Migration from current prototype data.

## Later Scope
- Email scan.
- Coupon/deal tracker.
- Receipt/photo scan.
- Shared household users.
- Push notifications.
- Budget categories.
- Cash-flow charting.
- Vacation planner with recommended savings per paycheck.

## Success Criteria
- Karla can paste her notes and review clean suggestions.
- Paycheck tab never shows `Invalid date`.
- Paycheck windows show accurate Total, Bills, and Left.
- Future projections match fixed bills and known paychecks.
- App updates do not erase or corrupt existing data.
- The UI remains simple enough to use daily from a phone.

## Open Questions
- Should the first real backend be Supabase or Firebase?
- Should login remain one household password or move to named user accounts?
- Should current Netlify Blobs data be migrated automatically or manually imported once?
- How far ahead should fixed bills generate by default: 3, 6, or 12 months?
- Should vacation goals reserve money automatically from Left, or only show planning guidance?
