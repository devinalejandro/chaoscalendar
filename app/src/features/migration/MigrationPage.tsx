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
    } catch {
      setPreview(null)
      setError('That backup file could not be read. Nothing was changed.')
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
    if (!window.confirm('This replaces everything currently in the app with the restored backup. You can undo this once from Settings > Undo last restore. Continue?')) {
      return
    }
    replaceSnapshot(preview.snapshot)
    setDone(true)
  }

  if (done) {
    return (
      <div className="stack">
        <section className="card">
          <strong>Backup restored</strong>
          <p className="placeholder">The reviewed old-app data is now saved in Karla's Chaos Calendar.</p>
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
        <strong>Restore old backup</strong>
        <p className="placeholder placeholder-tight">
          Upload or paste the backup exported from the old app. Nothing is saved until you review and confirm below.
        </p>
        <label className="field-label">
          Backup file
          <input className="field" type="file" accept="application/json,.json" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
        </label>
        <label className="field-label">
          Backup contents
          <textarea
            className="field textarea"
            rows={10}
            placeholder="Paste the old app backup here"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
          />
        </label>
        <div className="sr-status" aria-live="polite">
          {error && <p className="form-error">{error}</p>}
        </div>
        <button type="button" disabled={!raw.trim()} onClick={() => parseRaw()}>
          Review backup
        </button>
      </section>

      {preview && (
        <section className="card">
          <strong>Review backup</strong>
          <div className="migration-grid">
            <div><span>Items found</span><strong>{preview.report.itemsRead}</strong></div>
            <div><span>Bills</span><strong>{preview.report.billInstances}</strong></div>
            <div><span>Paychecks</span><strong>{preview.report.paychecks}</strong></div>
            <div><span>Total income</span><strong>{formatCents(preview.snapshot.data.paychecks.reduce((s, p) => s + p.amount, 0))}</strong></div>
          </div>
          {preview.report.skipped.length > 0 && (
            <div className="migration-skips">
              <strong>Needs review</strong>
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
              Save restored data
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
