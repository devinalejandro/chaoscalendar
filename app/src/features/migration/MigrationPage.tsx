import { useState } from 'react'
import { Link } from 'react-router-dom'
import { importLegacyAurora, type LegacyImportResult } from '../../data/migrate/legacy'
import { useHouseholdStore } from '../../store/useHouseholdStore'
import { formatCents } from '../../lib/money'

export default function MigrationPage() {
  const replaceSnapshot = useHouseholdStore((s) => s.replaceSnapshot)
  const [raw, setRaw] = useState('')
  const [preview, setPreview] = useState<LegacyImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  function parseRaw(text = raw) {
    try {
      const parsed = JSON.parse(text)
      setPreview(importLegacyAurora(parsed, new Date().toISOString()))
      setError(null)
      setDone(false)
    } catch (e) {
      setPreview(null)
      setError(e instanceof Error ? e.message : 'Could not parse that JSON export.')
    }
  }

  function pickFile(file: File | null) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result ?? '')
      setRaw(text)
      parseRaw(text)
    }
    reader.readAsText(file)
  }

  function saveMigration() {
    if (!preview) return
    if (!window.confirm('This replaces everything currently in the app (bills, paychecks, goals, history) with the imported legacy data. You can undo this once from Settings > Undo last restore. Continue?')) {
      return
    }
    replaceSnapshot(preview.snapshot)
    setDone(true)
  }

  if (done) {
    return (
      <div className="stack">
        <section className="card">
          <strong>Migration saved</strong>
          <p className="placeholder">The reviewed legacy data is now saved in the new Aurora Finance app.</p>
          <div className="form-actions">
            <Link to="/today" className="secondary-button link-as-button">
              Go to Today
            </Link>
            <Link to="/paychecks" className="secondary-button link-as-button">
              Review Paychecks
            </Link>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="stack">
      <section className="card quick-add">
        <strong>Legacy migration</strong>
        <p className="placeholder placeholder-tight">
          Paste or upload the JSON exported from the legacy app. Nothing is saved until you review and confirm below.
        </p>
        <label className="field-label">
          Legacy export file
          <input className="field" type="file" accept="application/json,.json" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
        </label>
        <label className="field-label">
          Legacy export JSON
          <textarea
            className="field textarea"
            rows={10}
            placeholder='{"items":[],"paychecks":[]}'
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
          />
        </label>
        <div className="sr-status" aria-live="polite">
          {error && <p className="form-error">{error}</p>}
        </div>
        <button type="button" disabled={!raw.trim()} onClick={() => parseRaw()}>
          Review export
        </button>
      </section>

      {preview && (
        <section className="card">
          <strong>Review migration</strong>
          <div className="migration-grid">
            <div><span>Legacy items</span><strong>{preview.report.itemsRead}</strong></div>
            <div><span>Bill instances</span><strong>{preview.report.billInstances}</strong></div>
            <div><span>Paychecks</span><strong>{preview.report.paychecks}</strong></div>
            <div><span>Total income</span><strong>{formatCents(preview.snapshot.data.paychecks.reduce((s, p) => s + p.amount, 0))}</strong></div>
          </div>
          {preview.report.skipped.length > 0 && (
            <div className="migration-skips">
              <strong>Skipped for review</strong>
              <ul>
                {preview.report.skipped.slice(0, 12).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              {preview.report.skipped.length > 12 && <p className="placeholder-tight">Plus {preview.report.skipped.length - 12} more.</p>}
            </div>
          )}
          <div className="form-actions">
            <button type="button" className="secondary-button" onClick={() => setPreview(null)}>
              Back
            </button>
            <button type="button" onClick={saveMigration}>
              Save migrated data
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
