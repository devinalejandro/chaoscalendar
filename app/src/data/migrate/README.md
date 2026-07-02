# Migrations

Every change to the `Snapshot` shape (see `src/types/index.ts`) bumps
`SCHEMA_VERSION` and adds a step here: `v<N>.ts` exporting
`migrate(prev: unknown): unknown` for N-1 → N. `index.ts` chains steps and is
the only entry point; loading code never touches raw shapes directly.

Reserved: `legacy.ts` — importer for the current prototype's
`auroraCalendar.v1` localStorage/blob shape (schemaVersion 1). It normalizes
`payday`/`paychecks`/`items` into Paycheck / Bill / BillInstance entities and
feeds the migration review screen (M6, WS6 in IMPLEMENTATION_PLAN.md).
Corrupt input is quarantined, never discarded.
