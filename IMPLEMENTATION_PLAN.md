# Aurora Finance App — Implementation Plan

Source of truth: [FINANCE_APP_PRD.md](FINANCE_APP_PRD.md). This plan covers the
rebuild of the single-file prototype ([index.html](index.html)) into a
structured React/TypeScript finance app, in the PRD's priority order: data
safety, paycheck budgeting, fixed bills, paste import review, prediction
calculator, migrations/repair — while preserving the soft vintage UI.

---

## 1. Audit of the current prototype

### What exists

| Piece | State |
|---|---|
| `index.html` (~1,155 lines) | Entire app in one file: CSS + DC-style template + hand-rolled reactive runtime + `Component` class |
| `netlify/edge-functions/auth.mjs` | Themed password login, signed `aurora_session` cookie, 30-day TTL |
| `netlify/functions/state.mjs` | `/api/state` GET/PUT → Netlify Blobs store `aurora-calendar`, single key `household-state` |
| Persistence | `localStorage` (`auroraCalendar.v1`) + debounced (700 ms) whole-snapshot cloud PUT |
| State shape | One loose object: `items, paychecks, payday, remindLead, remindTypes, homeView, onboarded` |
| Parser | Regex `parseNote()` that already handles Karla's real format: `M/D $amount Title✅`, run-on single-line pastes, `- scheduled M/D`, `paid M/D`, comma amounts, month headers, PAYDAY lines |
| Paycheck engine | `generatePaychecks()` (weekly/biweekly/twice-monthly/monthly/explicit dates); windows end the day before the next check; `assignPc()` maps items by due date |

### What to carry forward

- **The parser.** It survives Karla's real pastes today. Port it with a fixture
  test suite before touching anything; do not rewrite from scratch.
- **Paycheck-window semantics** (window = payday through day before next
  payday) — matches the PRD exactly.
- **The visual system**: Plus Jakarta Sans, `#F1B9C7 → #D98CA0` gradients,
  accent `#C97C93`, sparkle layer (seeded PRNG, 147 nodes), rounded cards,
  "Yo Momma K's Calendar" hero, the themed login page.

### Confirmed PRD problems, verified in code

1. **One broad state object** — no entities, no relations; a bill is just an
   `items[]` row with a `pc` string pointing at a regenerated window id.
2. **Bad data survives**: `_load()` swallows all errors → corrupt JSON becomes
   "new user" and the next persist overwrites the cloud copy. `Invalid date`
   renders because nothing validates dates on the way in.
3. **Paste writes straight into state** — no ImportBatch/review step. (The
   onboarding preview list exists but items save wholesale.)
4. **Sync is last-write-wins** on a single blob key; two devices/tabs clobber
   each other silently. `clearAll()` wipes the cloud blob with no backup.
5. **No schema version, no migrations, no audit log, no recurring-bill model**
   (each month's bills exist only if pasted or manually added).
6. Finance math is interleaved with view-model code in one class; zero tests.

---

## 2. Target architecture

Per the PRD's recommendation:

- **Frontend:** Vite + React 18 + TypeScript (strict), Zustand for local
  optimistic state, zod for validation, date-fns for dates, Vitest for tests.
  Money stored as **integer cents** everywhere; dates as `YYYY-MM-DD` strings.
- **Backend:** Supabase Postgres + Supabase Auth, row-level security keyed by
  `household_id`. SQL migrations checked into the repo (`supabase/migrations`).
- **Hosting:** Netlify (static frontend + preview deploys). The existing edge
  password gate stays during transition, then retires when Supabase Auth lands.

```
src/
  types/            zod schemas: Household, User, Paycheck, Bill,
                    BillInstance, ImportBatch, ImportSuggestion, Goal, AuditEvent
  lib/
    money.ts        cents math + formatting
    dates.ts        parse/normalize (explicit year rules for M/D input)
    parser/         ported parseNote + fixtures from Karla's real pastes
    windows.ts      paycheck window generation + instance assignment
    predict.ts      projection engine (next 4/8 checks, goals, vacation)
  data/
    supabase.ts     client, typed queries
    local.ts        offline cache (localStorage), optimistic queue
    sync.ts         push/pull, conflict handling, backup snapshots
    migrate/        legacy auroraCalendar.v1 → entities importer + repair
  features/
    today/          current window, next bills, alerts, quick add
    paychecks/      window cards, budgeting view, prediction calculator
    calendar/       month/week views, paydays + due dates + appointments
    bills/          fixed bill library, subscriptions, one-time, paid history
    import/         paste screen + review flow (ImportBatch lifecycle)
    settings/       reminders, export, repair, danger zone
  ui/               theme tokens, Card, Check, Sheet, Modal, Sparkles
```

Four tabs per the PRD: **Today · Paychecks · Calendar · Bills** (Deals/Family/
Lists stay out; they're Later Scope).

### Data model notes (deltas the code must honor)

- `Bill` is a **template** (name, expectedAmount, dueDay, recurrence, isFixed,
  active); `BillInstance` is the dated occurrence carrying status
  (`expected | scheduled | paid | skipped | late`), `paidDate`, `paycheckId`,
  `sourceImportId`. Marking an instance paid never mutates the template.
- Recurring bills **generate instances** (default horizon: 6 months ahead —
  see Open Questions) rather than overwriting templates.
- Paycheck summaries show **Total / Bills / Left / count** and de-emphasize
  paid-vs-unpaid (paid status remains visible on each instance row).
- Every mutation of paychecks/bills/instances/goals writes an `AuditEvent`
  (`before`/`after` JSON) — this doubles as the undo source.

---

## 3. Workstreams

### WS1 — Data safety foundation (first, blocks everything)

- zod schemas for every entity; **all** input paths (paste, forms, import,
  sync pulls) validate before touching state.
- `schemaVersion` on the local cache envelope; migration chain with unit tests;
  corrupt local data is quarantined (`aurora.corrupt.<ts>`), never discarded.
- Automatic repair pass on load: invalid dates flagged for review, orphaned
  `paycheckId`/`billId` links re-resolved or nulled, string amounts coerced to
  cents (the PRD's `Invalid date` bug dies here).
- Backups: snapshot before any migration or bulk import; rolling last-5 local;
  export JSON + CSV from Settings.
- Supabase: SQL migrations versioned in-repo; RLS by household; no destructive
  column changes without a data-copy migration step.

### WS2 — Paycheck budgeting

- Port `generatePaychecks`/`assignPc` into typed, tested `windows.ts`
  (explicit-date lists like `PAYDAYS 6/3 6/17 7/1...`, month boundaries,
  twice-monthly).
- Paycheck cards: Total, Bills (sum of instances due in window), Left,
  bill count, instance list. Editable per-check amount. Move-instance-to-next-
  window action.

### WS3 — Fixed bill library

- Bills tab: fixed bill library CRUD (name, expected amount, due day, category,
  recurrence, active toggle), subscriptions treated as fixed bills with a
  category, one-time bills, paid history view.
- Instance materializer: generates future `BillInstance`s from active
  templates on a rolling horizon; idempotent (re-running never duplicates);
  editing a template only affects `expected` future instances.

### WS4 — Paste import review

- Parser ported verbatim + fixture suite from real pastes (✅ = paid, no mark =
  expected; `PAYDAYS` line → explicit paydays; amounts with commas).
- Import pipeline per PRD: paste → `ImportBatch(reviewing)` →
  `ImportSuggestion[]` grouped (Paychecks / Bills / Appointments / Needs
  review) → per-row Save / Edit / Ignore → accepted rows become entities with
  `sourceImportId`; batch marked `applied`. **Nothing writes to finance records
  until accepted.**
- Dedupe on accept: match instance (billId or normalized title, amount, due
  month) → offer update / skip / add anyway. Suggest linking recurring-looking
  items to existing templates.

### WS5 — Prediction calculator

- `predict.ts` from known paychecks + active fixed-bill templates:
  next-check Left, next 4, next 8, monthly average leftover.
- Goal planner: "how many paychecks until $X" given per-check set-aside.
- Vacation planner: target amount + date → required per-check contribution and
  feasibility flag against projected Left.
- UI lives in the Paychecks tab; card-based, no heavy charts (guidance only —
  it does not reserve money automatically, per Open Questions).

### WS6 — Migration from the current app

Exactly the PRD's path:
1. Ship an **Export JSON** button into the *current* `index.html` (tiny,
   low-risk addition — reads the snapshot it already has).
2. New app's importer accepts the `auroraCalendar.v1` shape.
3. Normalizer: `payday`+`paychecks` → Paycheck rows; recurring-looking `items`
   → Bill templates + instances; one-offs → instances or appointments.
4. Validation + repair report, then a **migration review screen** (same UX as
   paste review) before anything saves.
5. Netlify Blobs data: migrated **manually once** via this flow, then the blob
   endpoint is retired (recommendation for the PRD's open question).

### WS7 — Soft vintage UI preservation

- Extract palette/radii/shadows into theme tokens; port `<Sparkles/>` with the
  same seeded PRNG; keep the hero card and login page visuals.
- Desktop = real full-width browser layout (grid: sidebar-ish nav + content),
  not a phone frame; mobile-first breakpoints as today.
- Accessibility while porting: 44 px targets, labeled checkboxes, paid state
  never conveyed by color alone.

---

## 4. Milestones

| # | Contents | Exit criteria |
|---|---|---|
| M0 | Vite/TS scaffold, theme tokens, Supabase project + schema migrations, CI (typecheck+tests), deploy to a Netlify preview | Themed shell renders; `supabase db reset` builds schema from migrations |

**M0 status (2026-07-02): scaffold landed in `app/`.** Vite + React 19 + TS
strict; router with the four tabs; aurora design tokens (`src/ui/tokens.css`);
zod entity schemas (`src/types`); cents/dates helpers; parser ported from the
prototype with a 14-test fixture suite locking Karla's real paste formats
(multiline + run-on), including one documented limitation: `Title $X due M/D`
lines lose title/date (fix scheduled with M4 import review). Root `index.html`
and `netlify.toml` untouched — the live static app still deploys exactly as
before; the new app is dev/preview only until cutover. Remaining M0 items:
Supabase project + SQL migrations, CI, Netlify preview wiring.
| M1 | Data safety core: zod schemas, local cache w/ versioning, repair pass, backups, export | Corrupt/legacy fixtures load without data loss; repair report correct |

**M1 status (2026-07-02): core finance model landed in `app/`.** Versioned
`Snapshot` cache (`schemaVersion` 2→3, `src/data/migrate/`) with a chained
migration entry point that quarantines corrupt/unrecognized JSON under
`aurora.corrupt.<ts>` instead of discarding it — `loadHouseholdSnapshot`
never resets a household to empty on bad data. Pure functional service layer
(`src/data/repository.ts`) for bill/paycheck/recurrence-rule CRUD, paid
marking, and idempotent instance regeneration, backed by a swappable
`KeyValueStorage` (memory for tests, `window.localStorage` in the browser).
Paycheck-window generator ported (`src/lib/windows.ts`: weekly/biweekly/
twice-monthly/monthly/explicit-paydays, window-summary totals) plus a new
recurrence engine (`src/lib/recurrence.ts`) and Bill→BillInstance
materializer (`src/lib/billInstances.ts`) — templates generate instances,
never mutate them, and re-running materialization is a no-op. Seed data
(`src/data/seed.ts`) builds a full household from the real numbers in
FINANCE_APP_PRD.md's paste examples, cross-checked against the parser
fixtures. 57/57 tests pass, `tsc -b` + `vite build` + lint all clean. Not yet
done: export JSON/CSV, backups-before-migration, UI wiring (still M2+).
Known limitation carried from windows.ts (documented in code): automatic
due-date assignment always overwrites a bill instance's paycheck, so a future
"move to next paycheck" manual override won't survive regeneration yet —
tracked for the M2 budgeting UI.

| M2 | Paychecks: windows engine + budgeting view + Today tab | Karla's June data reproduces correct Total/Bills/Left per window; no `Invalid date` possible |

**M2 status (2026-07-02): Today + Paychecks wired to the M1 data model.**
`store/useHouseholdStore.ts` is a factory (`createHouseholdStore(storage)`)
bound to real `localStorage` in the browser and to isolated in-memory
storage in tests — first run seeds the Karla demonstration household from
M1, but never reseeds over real (even empty-of-bills) household data. Today
shows the current pay-period `WindowSummaryCard`, a due-soon list across all
windows, and a validated quick-add form (title/amount/date → an ad-hoc
`BillInstance`, immediately assigned to its paycheck window). Paychecks
lists every window with Total/Bills/Left/Count and its bill list, current
window highlighted. Shared `ui/WindowSummaryCard` and `ui/BillList`
eliminate duplication between the two pages. Verified live in the browser:
Karla's seeded numbers reproduce correctly (Mortgage $1,524.55 + Netflix
$29.34 + STRATA CC $45 = Bills $1,598.89, Left $294.59 against a $1,893.48
paycheck), marking paid and quick-add both update totals and persist across
reload, and the empty-window case renders its placeholder instead of
crashing. `formatDisplay` (lib/dates.ts) falls back to the raw string for an
invalid date instead of rendering `Invalid Date`, closing the PRD's core
complaint. 64/64 tests pass (7 new store tests), `tsc -b` + `vite build` +
lint all clean. Calendar and Bills tabs remain M3/M5 placeholders.

| M3 | Bills: template library + instance materializer + history | Templates generate 6 months of instances idempotently |

**M3 status (2026-07-02): Bills tab landed — fixed bill library, one-time
bills, and paid history.** `saveBill`/`setBillActive` on the store build a
`RecurrenceRule` from the form's chosen cadence (monthly/weekly/biweekly/
every-N-days) or a one-off `dueDate`, upsert the Bill template, and call
`regenerateInstances` over a default horizon (today back to the earliest
known paycheck window, forward 6 months — `lib/dates.addMonths`), so newly
added or edited bills immediately populate the windows already on screen.
`lib/recurrence.ts` gained `buildRecurrenceRule` and `describeRecurrence`
(human-readable "Monthly on day 18" / "One-time · Jul 15" labels) alongside
the M1 occurrence engine. Editing a bill's amount/name only affects future
materialization — already-generated instances (including paid ones) are
untouched, verified by a test that pays an instance, edits the template, and
confirms the paid instance keeps its original title/amount. The
active/inactive toggle stops future generation without deleting instance
history, matching the PRD's "recurring bills should create instances, not
overwrite the bill template" rule. Verified live: added a monthly Water bill
($71.70, day 18) and watched it materialize into the correct paycheck window
in real time; toggling it inactive visually dimmed the row and persisted.
74/74 tests pass (10 new: recurrence builder/describer + saveBill/
setBillActive, including the M3 exit criterion — saving the same bill twice
produces zero duplicate instances). `tsc -b`, `vite build`, lint all clean.
Paid history still shows only the most recent 20 entries; CSV/JSON export
remains M1's unfinished item, not addressed here.

**M3 fix (2026-07-02): stale-forecast bugs from code review.** Three issues
found reviewing M3 — editing a bill's amount/name never reached already-
materialized future instances (forecasts stayed wrong until the instance was
paid), deactivating a bill left it counted in Total/Bills/Left for up to the
6-month horizon, and the paid checkbox was write-only (no way to undo a
mis-click). Fixed with one new repository primitive,
`resetFutureInstancesForBill(snapshot, billId, fromIso)`: removes a bill's
not-yet-paid instances due today or later, keeping paid instances and
anything already in the past as history. `saveBill` and `setBillActive` both
call it before `regenerateInstances`, so an edit or deactivation is followed
by a fresh rebuild from the current template — past-due unpaid instances
intentionally keep their original amount (what was actually owed at the
time) rather than being retroactively rewritten. Added `unmarkInstancePaid`
+ a `setInstancePaid(id, paid)` store action wired to the checkbox's actual
`checked` value (`BillList`'s `onTogglePaid` now takes `(id, paid)` instead
of just `(id)`). Verified live: edited Netflix $29.34→$31.99 — the Jun 7
(past) instance stayed at $29.34, the Jul 7 (future) instance updated to
$31.99, and the paycheck window's Bills/Left recalculated by exactly $2.65;
deactivating Netflix removed the Jul 7 instance immediately (Bills −$31.99,
Left +$31.99) while leaving Jun 7 as history; the paid checkbox now
toggles both ways. 81/81 tests pass (10 new/updated, including one that
previously asserted the buggy behavior and had to be corrected), `tsc -b`,
`vite build`, lint all clean.

| M4 | Import: parser port + fixtures + full review flow | Real paste → grouped review → accept; nothing saves unreviewed |

**M4 status (2026-07-02): paste-import review flow landed at `/import`.**
`lib/import.ts` (`buildImportSuggestions`) bridges the M0 parser to reviewable
suggestions: one `paycheck` suggestion per date in a `PAYDAYS` header (parser
already drops the redundant bare `PAYDAY` line markers), and one `bill` /
`appointment` / `task` suggestion per parsed line, with M/D dates resolved
against "now" and a confidence rating (high when both amount and date are
present, low for a dateless task). `features/import/ImportPage.tsx` is a
two-step flow — paste → grouped, editable review (Paychecks/Bills/
Appointments/Tasks, each row showing the original text) → explicit "Save N
selected." Task suggestions can't be saved as-is (no Task entity in this
PRD's data model) — their checkbox is disabled with an explanation, and the
row's type can be changed to Bill/Appointment to promote it if it actually
has a date. `applyImport` on the store only ever touches what's in that
accepted list: paycheck rows generate exactly those paycheck windows (no
speculative extension beyond the parsed dates), bill/appointment rows become
ad-hoc BillInstances assigned to their window. A basic dedupe guards
re-import: a row matching an existing instance (same title/date/amount) is
skipped — except when the paste marks it paid and the existing instance
isn't yet, in which case the existing instance is reconciled to paid rather
than silently ignored or duplicated (caught by my own test using the seeded
household, where Netflix already existed unpaid before the "import"). Two
real bugs surfaced writing tests, both fixed before commit: an appointment
fixture used an amount-at-line-end format the parser was never built to
support (fixed the test, not the parser — documented as parser-scope, not a
bug); and the dedupe originally just skipped a paid re-import entirely
instead of reconciling. Verified live: pasted a mixed paste (paydays + paid
bill + unpaid bill + appointment + a task) and got 5+2+1 = 8 correctly
grouped, pre-checked suggestions with the task disabled; saved 8, and
Paychecks immediately showed the paid Apple Subscription (strikethrough)
alongside the pre-existing seeded bills in the same window, with Bills/Left
recalculated correctly throughout. 96/96 tests pass, `tsc -b`, `vite build`,
lint all clean. Not done: ImportBatch/ImportSuggestion audit-log persistence
(kept as ephemeral component state, per M1's deferred audit-log item) and
file/.txt upload (paste-only for now, matching the PRD's MVP note).

| M5 | Prediction calculator + Calendar tab | Projections match hand-computed fixtures; goal/vacation planners answer PRD examples |
| M6 | Migration + cutover: legacy export button, importer + review, Supabase Auth replaces password gate, old app archived at `/legacy/` | Live household data migrated with review; success criteria in PRD §Success all pass |

The deployed prototype stays live and untouched until M6; all new work ships
on Netlify preview URLs.

## 5. Recommendations on the PRD's open questions

- **Supabase over Firebase** — relational model (Bill→BillInstance, audit log)
  fits Postgres; RLS handles household scoping cleanly.
- **Auth:** move to named user accounts (Karla + Devin/admin) via Supabase
  Auth; keep it to email+password, no OAuth complexity.
- **Blobs data:** one-time manual import through the migration review screen,
  then retire `/api/state`.
- **Instance horizon:** 6 months default, regenerated on a rolling basis.
- **Vacation goals:** planning guidance only in MVP; automatic reservation
  from Left is Later Scope.

## 6. Risks

- **Parser regressions** — locked by fixtures from real pastes before refactor.
- **Migration correctness** — the legacy importer gets its own fixture suite
  built from a real export of the live household data.
- **Offline/two-device conflicts** — Supabase + per-entity rows shrink the
  blast radius vs. one blob, but offline queue conflicts still need
  newest-updatedAt-wins per row + audit trail for recovery.
- **Scope creep** — Deals/Family/Lists/email scan explicitly deferred (PRD
  Later Scope).
