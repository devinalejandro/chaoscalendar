import { useState, type FormEvent } from 'react'
import { useHouseholdStore, type SaveBillInput } from '../../store/useHouseholdStore'
import { formatCents, parseCents } from '../../lib/money'
import { iso, isValidIso } from '../../lib/dates'
import { describeRecurrence } from '../../lib/recurrence'
import { BillList } from '../../ui/BillList'
import type { Bill, BillCategory } from '../../types'

const CATEGORIES: BillCategory[] = [
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
]

const CATEGORY_LABELS: Record<BillCategory, string> = {
  mortgage_rent: 'Rent/Mortgage',
  utilities: 'Utilities',
  phone_internet: 'Phone/Internet',
  insurance: 'Insurance',
  car: 'Car',
  credit_card: 'Credit card',
  medical: 'Medical',
  kids: 'Kids',
  subscriptions: 'Subscriptions',
  other: 'Other',
}

type RecurrenceKind = 'monthly' | 'weekly' | 'biweekly' | 'custom_days' | 'once'

const KIND_LABELS: Record<RecurrenceKind, string> = {
  monthly: 'Monthly',
  weekly: 'Weekly',
  biweekly: 'Biweekly',
  custom_days: 'Every N days',
  once: 'One-time',
}

interface FormState {
  id?: string
  name: string
  category: BillCategory
  amount: string
  kind: RecurrenceKind
  dayOfMonth: string
  anchorDate: string
  intervalDays: string
  dueDate: string
}

function emptyForm(): FormState {
  const today = iso(new Date())
  return { name: '', category: 'other', amount: '', kind: 'monthly', dayOfMonth: '1', anchorDate: today, intervalDays: '30', dueDate: today }
}

export default function BillsPage() {
  const snapshot = useHouseholdStore((s) => s.snapshot)
  const saveBill = useHouseholdStore((s) => s.saveBill)
  const setBillActive = useHouseholdStore((s) => s.setBillActive)

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [error, setError] = useState<string | null>(null)

  const bills = [...snapshot.data.bills].sort((a, b) => a.name.localeCompare(b.name))
  const paidHistory = snapshot.data.billInstances
    .filter((i) => i.status === 'paid')
    .sort((a, b) => (b.paidDate ?? '').localeCompare(a.paidDate ?? ''))
    .slice(0, 20)

  function openAdd() {
    setForm(emptyForm())
    setError(null)
    setShowForm(true)
  }

  function openEdit(bill: Bill) {
    const rule = snapshot.data.recurrenceRules.find((r) => r.id === bill.recurrenceRuleId)
    const today = iso(new Date())
    setForm({
      id: bill.id,
      name: bill.name,
      category: bill.category,
      amount: bill.expectedAmount != null ? (bill.expectedAmount / 100).toString() : '',
      kind: rule ? rule.frequency : 'once',
      dayOfMonth: rule?.dayOfMonth ? String(rule.dayOfMonth) : '1',
      anchorDate: rule?.anchorDate ?? today,
      intervalDays: rule?.intervalDays ? String(rule.intervalDays) : '30',
      dueDate: bill.dueDate ?? today,
    })
    setError(null)
    setShowForm(true)
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) {
      setError('Name is required.')
      return
    }
    const amount = parseCents(form.amount)
    if (amount === null) {
      setError('Enter a valid amount, like 45 or 45.50.')
      return
    }

    let recurrence: SaveBillInput['recurrence']
    if (form.kind === 'once') {
      if (!isValidIso(form.dueDate)) {
        setError('Enter a valid due date.')
        return
      }
      recurrence = { kind: 'once', dueDate: form.dueDate }
    } else if (form.kind === 'monthly') {
      const day = parseInt(form.dayOfMonth, 10)
      if (!Number.isInteger(day) || day < 1 || day > 31) {
        setError('Day of month must be between 1 and 31.')
        return
      }
      recurrence = { kind: 'monthly', dayOfMonth: day }
    } else if (form.kind === 'custom_days') {
      const interval = parseInt(form.intervalDays, 10)
      if (!Number.isInteger(interval) || interval < 1) {
        setError('Interval must be a positive number of days.')
        return
      }
      if (!isValidIso(form.anchorDate)) {
        setError('Enter a valid start date.')
        return
      }
      recurrence = { kind: 'custom_days', intervalDays: interval, anchorDate: form.anchorDate }
    } else {
      if (!isValidIso(form.anchorDate)) {
        setError('Enter a valid start date.')
        return
      }
      recurrence = { kind: form.kind, anchorDate: form.anchorDate }
    }

    saveBill({ id: form.id, name: form.name.trim(), category: form.category, amount, recurrence })
    setShowForm(false)
    setError(null)
  }

  return (
    <div className="stack">
      <div className="card">
        <div className="section-header">
          <strong>Fixed bill library</strong>
          <button type="button" className="link-button" onClick={openAdd}>
            + Add bill
          </button>
        </div>
        {bills.length === 0 ? (
          <p className="placeholder">No bills yet.</p>
        ) : (
          <ul className="bill-template-list">
            {bills.map((bill) => (
              <li key={bill.id} className={`bill-template-row${bill.active ? '' : ' inactive'}`}>
                <div className="bill-template-main">
                  <span className="bill-title">{bill.name}</span>
                  <span className="bill-template-meta">
                    {CATEGORY_LABELS[bill.category]} · {describeRecurrence(bill, snapshot.data.recurrenceRules)}
                  </span>
                </div>
                <span className="bill-amount">{bill.expectedAmount != null ? formatCents(bill.expectedAmount) : ''}</span>
                <button type="button" className="link-button" onClick={() => openEdit(bill)}>
                  Edit
                </button>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={bill.active}
                    onChange={(e) => setBillActive(bill.id, e.target.checked)}
                    aria-label={`${bill.name} active`}
                  />
                  <span>{bill.active ? 'Active' : 'Inactive'}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>

      {showForm && (
        <form className="card quick-add" onSubmit={submit}>
          <strong>{form.id ? 'Edit bill' : 'Add bill'}</strong>
          <label className="field-label">
            Bill name
            <input
              className="field"
              placeholder="Example: Netflix"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </label>
          <label className="field-label">
            Category
            <select
              className="field"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as BillCategory }))}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Expected amount
            <input
              className="field"
              placeholder="45.00"
              inputMode="decimal"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            />
          </label>

          <div className="radio-row">
            {(Object.keys(KIND_LABELS) as RecurrenceKind[]).map((kind) => (
              <label key={kind} className={`radio-pill${form.kind === kind ? ' active' : ''}`}>
                <input type="radio" name="kind" checked={form.kind === kind} onChange={() => setForm((f) => ({ ...f, kind }))} />
                {KIND_LABELS[kind]}
              </label>
            ))}
          </div>

          {form.kind === 'monthly' && (
            <label className="field-label">
              Day of month
              <input
                className="field"
                type="number"
                min={1}
                max={31}
                placeholder="1"
                value={form.dayOfMonth}
                onChange={(e) => setForm((f) => ({ ...f, dayOfMonth: e.target.value }))}
              />
            </label>
          )}
          {(form.kind === 'weekly' || form.kind === 'biweekly') && (
            <label className="field-label">
              Start date
              <input
                className="field"
                type="date"
                value={form.anchorDate}
                onChange={(e) => setForm((f) => ({ ...f, anchorDate: e.target.value }))}
              />
            </label>
          )}
          {form.kind === 'custom_days' && (
            <>
              <label className="field-label">
                Repeat every
                <input
                  className="field"
                  type="number"
                  min={1}
                  placeholder="30"
                  value={form.intervalDays}
                  onChange={(e) => setForm((f) => ({ ...f, intervalDays: e.target.value }))}
                />
              </label>
              <label className="field-label">
                Start date
                <input
                  className="field"
                  type="date"
                  value={form.anchorDate}
                  onChange={(e) => setForm((f) => ({ ...f, anchorDate: e.target.value }))}
                />
              </label>
            </>
          )}
          {form.kind === 'once' && (
            <label className="field-label">
              Due date
              <input
                className="field"
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
              />
            </label>
          )}

          <div className="sr-status" aria-live="polite">
            {error && <p className="form-error">{error}</p>}
          </div>
          <div className="form-actions">
            <button type="button" className="secondary-button" onClick={() => setShowForm(false)}>
              Cancel
            </button>
            <button type="submit">{form.id ? 'Save' : 'Add'}</button>
          </div>
        </form>
      )}

      <div className="card">
        <strong>Paid history</strong>
        <BillList
          instances={paidHistory}
          onTogglePaid={() => {}}
          emptyLabel="No paid bills yet."
          readOnly
          showPaidDate
        />
      </div>
    </div>
  )
}
