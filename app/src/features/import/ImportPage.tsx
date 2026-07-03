import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useHouseholdStore } from '../../store/useHouseholdStore'
import { buildImportSuggestions, type ImportSuggestion, type SuggestionType } from '../../lib/import'
import { parseCents } from '../../lib/money'
import { isValidIso } from '../../lib/dates'

const TYPE_LABELS: Record<SuggestionType, string> = {
  paycheck: 'Paycheck',
  bill: 'Bill',
  appointment: 'Appointment',
  task: 'Task',
}
const GROUP_ORDER: SuggestionType[] = ['paycheck', 'bill', 'appointment', 'task']

const PLACEHOLDER = `PAYDAYS 6/3 6/17 7/1 7/15 7/29 1,893.48
6/7 $41.25 Apple Subscription✅
6/22 $154.74 TEP
6/25 Dentist appointment`

interface Row extends ImportSuggestion {
  accepted: boolean
}

function isAcceptable(row: Row): boolean {
  return row.suggestedType !== 'task' && row.date != null && isValidIso(row.date)
}

export default function ImportPage() {
  const applyImport = useHouseholdStore((s) => s.applyImport)
  const [pasteText, setPasteText] = useState('')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [result, setResult] = useState<{ saved: number; skipped: number } | null>(null)

  function parse() {
    const suggestions = buildImportSuggestions(pasteText, new Date())
    setRows(
      suggestions.map((s) => ({
        ...s,
        // Nothing is saved just by parsing — this only sets the review
        // screen's starting checkbox state, which the user can still change
        // before the explicit "Save selected" action below.
        accepted: s.suggestedType !== 'task' && s.date != null,
      })),
    )
    setResult(null)
  }

  function updateRow(id: string, patch: Partial<Row>) {
    setRows((prev) => (prev ? prev.map((r) => (r.id === id ? { ...r, ...patch } : r)) : prev))
  }

  function saveSelected() {
    if (!rows) return
    const accepted = rows.filter((r) => r.accepted && isAcceptable(r))
    applyImport(
      accepted.map((r) => ({
        type: r.suggestedType as 'paycheck' | 'bill' | 'appointment',
        title: r.title,
        amount: r.amount,
        date: r.date!,
        paid: r.paid,
      })),
    )
    setResult({ saved: accepted.length, skipped: rows.length - accepted.length })
    setRows(null)
    setPasteText('')
  }

  if (result) {
    return (
      <div className="stack">
        <div className="card">
          <strong>Import complete</strong>
          <p className="placeholder">
            Saved {result.saved} item{result.saved === 1 ? '' : 's'}
            {result.skipped > 0 ? `, left ${result.skipped} unsaved` : ''}.
          </p>
          <div className="form-actions">
            <button type="button" className="secondary-button" onClick={() => setResult(null)}>
              Import more
            </button>
            <Link to="/today" className="secondary-button link-as-button">
              Go to Today
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (!rows) {
    return (
      <div className="stack">
        <div className="card quick-add">
          <strong>Paste your notes</strong>
          <p className="placeholder placeholder-tight">
            Paste your Apple Notes bill list. Nothing is saved until you review and accept it below.
          </p>
          <textarea
            className="field textarea"
            rows={10}
            placeholder={PLACEHOLDER}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
          />
          <button type="button" disabled={!pasteText.trim()} onClick={parse}>
            Parse
          </button>
        </div>
      </div>
    )
  }

  const groups = GROUP_ORDER.map((type) => ({ type, items: rows.filter((r) => r.suggestedType === type) })).filter((g) => g.items.length)
  const acceptedCount = rows.filter((r) => r.accepted && isAcceptable(r)).length

  if (!groups.length) {
    return (
      <div className="stack">
        <div className="card">
          <p className="placeholder">Nothing recognizable in that paste.</p>
          <button type="button" className="secondary-button" onClick={() => setRows(null)}>
            Back
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="stack">
      {groups.map(({ type, items }) => (
        <div className="card" key={type}>
          <strong>
            {TYPE_LABELS[type]}s ({items.length})
          </strong>
          {type === 'task' && (
            <p className="placeholder placeholder-tight">
              Tasks aren't tracked yet — change the type to Bill or Appointment to save one, or leave it skipped.
            </p>
          )}
          <ul className="import-list">
            {items.map((r) => {
              const acceptable = isAcceptable(r)
              return (
                <li key={r.id} className="import-row">
                  <label className="bill-check">
                    <input
                      type="checkbox"
                      checked={r.accepted && acceptable}
                      disabled={!acceptable}
                      onChange={(e) => updateRow(r.id, { accepted: e.target.checked })}
                      aria-label={`Accept ${r.title}`}
                    />
                  </label>
                  <div className="import-fields">
                    <input
                      className="field"
                      value={r.title}
                      onChange={(e) => updateRow(r.id, { title: e.target.value })}
                    />
                    <select
                      className="field"
                      value={r.suggestedType}
                      onChange={(e) => updateRow(r.id, { suggestedType: e.target.value as SuggestionType })}
                    >
                      {GROUP_ORDER.map((t) => (
                        <option key={t} value={t}>
                          {TYPE_LABELS[t]}
                        </option>
                      ))}
                    </select>
                    <input
                      className="field"
                      placeholder="Amount"
                      inputMode="decimal"
                      value={r.amount != null ? (r.amount / 100).toString() : ''}
                      onChange={(e) => updateRow(r.id, { amount: e.target.value.trim() ? parseCents(e.target.value) : null })}
                    />
                    <input
                      className="field"
                      type="date"
                      value={r.date ?? ''}
                      onChange={(e) => updateRow(r.id, { date: e.target.value || null })}
                    />
                    <div className="import-meta">
                      <span className={`confidence confidence-${r.confidence}`}>{r.confidence} confidence</span>
                      {!acceptable && <span className="form-error">Needs a date to save</span>}
                      {r.paid && <span className="confidence confidence-high">paid ✅</span>}
                    </div>
                    <span className="import-raw">"{r.rawText}"</span>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      ))}

      <div className="card form-actions">
        <button type="button" className="secondary-button" onClick={() => setRows(null)}>
          Cancel
        </button>
        <button type="button" disabled={acceptedCount === 0} onClick={saveSelected}>
          Save {acceptedCount} selected
        </button>
      </div>
    </div>
  )
}
