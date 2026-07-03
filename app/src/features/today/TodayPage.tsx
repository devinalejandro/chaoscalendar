import { useState, type FormEvent } from 'react'
import { useHouseholdStore } from '../../store/useHouseholdStore'
import { summarizeWindow } from '../../lib/windows'
import { parseCents } from '../../lib/money'
import { iso, isValidIso } from '../../lib/dates'
import { buildReminderSummary } from '../../lib/reminders'
import { WindowSummaryCard } from '../../ui/WindowSummaryCard'
import { BillList } from '../../ui/BillList'

export default function TodayPage() {
  const snapshot = useHouseholdStore((s) => s.snapshot)
  const setInstancePaid = useHouseholdStore((s) => s.setInstancePaid)
  const addQuickBill = useHouseholdStore((s) => s.addQuickBill)

  const todayIso = iso(new Date())
  const currentWindow = snapshot.data.paychecks.find((p) => todayIso >= p.periodStart && todayIso <= p.periodEnd)
  const summary = currentWindow ? summarizeWindow(currentWindow, snapshot.data.billInstances) : null
  const reminders = buildReminderSummary(snapshot, todayIso)

  const dueSoon = snapshot.data.billInstances
    .filter((i) => i.status !== 'paid' && i.dueDate)
    .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
    .slice(0, 5)

  const [form, setForm] = useState({ title: '', amount: '', dueDate: todayIso })
  const [formError, setFormError] = useState<string | null>(null)

  function submitQuickAdd(e: FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) {
      setFormError('Title is required.')
      return
    }
    const cents = parseCents(form.amount)
    if (cents === null) {
      setFormError('Enter a valid amount, like 45 or 45.50.')
      return
    }
    if (!isValidIso(form.dueDate)) {
      setFormError('Enter a valid due date.')
      return
    }
    addQuickBill({ title: form.title.trim(), amount: cents, dueDate: form.dueDate })
    setForm({ title: '', amount: '', dueDate: todayIso })
    setFormError(null)
  }

  return (
    <div className="stack">
      {summary && currentWindow ? (
        <WindowSummaryCard paycheck={currentWindow} summary={summary} label="Current pay period" current />
      ) : (
        <div className="card">
          <p className="placeholder">No paycheck window covers today yet.</p>
        </div>
      )}

      <div className="card">
        <strong>Due soon</strong>
        <BillList instances={dueSoon} onTogglePaid={setInstancePaid} emptyLabel="Nothing due — you're caught up." />
      </div>

      <div className="card reminders-card">
        <strong>Reminders</strong>
        <div className="settings-grid reminder-grid">
          <div>
            <span>Overdue</span>
            <strong>{reminders.overdue.length}</strong>
          </div>
          <div>
            <span>Today</span>
            <strong>{reminders.dueToday.length}</strong>
          </div>
          <div>
            <span>Next 7</span>
            <strong>{reminders.dueNext7.length}</strong>
          </div>
          <div>
            <span>Goal/check</span>
            <strong>{reminders.goalNeededPerUpcomingCheck == null ? '-' : `$${(reminders.goalNeededPerUpcomingCheck / 100).toFixed(0)}`}</strong>
          </div>
        </div>
        {reminders.overdue.length > 0 && (
          <p className="form-error reminder-note">
            {reminders.overdue.length} bill{reminders.overdue.length === 1 ? '' : 's'} need attention before planning extra spending.
          </p>
        )}
      </div>

      <form className="card quick-add" onSubmit={submitQuickAdd}>
        <strong>Quick add</strong>
        <label className="field-label">
          Bill title
          <input
            className="field"
            placeholder="Example: TEP"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
        </label>
        <label className="field-label">
          Amount
          <input
            className="field"
            placeholder="45.00"
            inputMode="decimal"
            value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
          />
        </label>
        <label className="field-label">
          Due date
          <input
            className="field"
            type="date"
            value={form.dueDate}
            onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
          />
        </label>
        <div className="sr-status" aria-live="polite">
          {formError && <p className="form-error">{formError}</p>}
        </div>
        <button type="submit">Add</button>
      </form>
    </div>
  )
}
