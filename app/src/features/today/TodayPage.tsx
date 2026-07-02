import { useState, type FormEvent } from 'react'
import { useHouseholdStore } from '../../store/useHouseholdStore'
import { summarizeWindow } from '../../lib/windows'
import { parseCents } from '../../lib/money'
import { iso, isValidIso } from '../../lib/dates'
import { WindowSummaryCard } from '../../ui/WindowSummaryCard'
import { BillList } from '../../ui/BillList'

export default function TodayPage() {
  const snapshot = useHouseholdStore((s) => s.snapshot)
  const markPaid = useHouseholdStore((s) => s.markPaid)
  const addQuickBill = useHouseholdStore((s) => s.addQuickBill)

  const todayIso = iso(new Date())
  const currentWindow = snapshot.data.paychecks.find((p) => todayIso >= p.periodStart && todayIso <= p.periodEnd)
  const summary = currentWindow ? summarizeWindow(currentWindow, snapshot.data.billInstances) : null

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
        <BillList instances={dueSoon} onTogglePaid={markPaid} emptyLabel="Nothing due — you're caught up." />
      </div>

      <form className="card quick-add" onSubmit={submitQuickAdd}>
        <strong>Quick add</strong>
        <input
          className="field"
          placeholder="Title"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
        />
        <input
          className="field"
          placeholder="Amount, e.g. 45.00"
          inputMode="decimal"
          value={form.amount}
          onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
        />
        <input
          className="field"
          type="date"
          value={form.dueDate}
          onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
        />
        {formError && <p className="form-error">{formError}</p>}
        <button type="submit">Add</button>
      </form>
    </div>
  )
}
