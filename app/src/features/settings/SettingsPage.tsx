import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useHouseholdStore } from '../../store/useHouseholdStore'
import { Snapshot } from '../../types'

export default function SettingsPage() {
  const snapshot = useHouseholdStore((s) => s.snapshot)
  const replaceSnapshot = useHouseholdStore((s) => s.replaceSnapshot)
  const undoReplaceSnapshot = useHouseholdStore((s) => s.undoReplaceSnapshot)
  const canUndoRestore = useHouseholdStore((s) => s.lastReplacedSnapshot !== null)
  const [restoreText, setRestoreText] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  function exportSnapshot() {
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `chaos-calendar-backup-${snapshot.updatedAt.slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setMessage('Backup exported.')
  }

  function restoreSnapshot() {
    try {
      const parsed = Snapshot.parse(JSON.parse(restoreText))
      if (!window.confirm('This replaces everything currently in the app with this backup. You can undo this once with "Undo last restore" below. Continue?')) {
        return
      }
      replaceSnapshot({ ...parsed, updatedAt: new Date().toISOString() })
      setRestoreText('')
      setMessage('Backup restored.')
    } catch {
      setMessage('That backup could not be validated. Nothing was changed.')
    }
  }

  return (
    <div className="stack">
      <section className="card quick-add">
        <strong>Recovery</strong>
        <p className="placeholder placeholder-tight">Export before big changes, or restore a validated app backup.</p>
        <button type="button" onClick={exportSnapshot}>
          Export backup
        </button>
        <label className="field-label">
          Backup JSON
          <textarea
            className="field textarea"
            rows={8}
            placeholder="Paste a Chaos Calendar backup JSON"
            value={restoreText}
            onChange={(e) => setRestoreText(e.target.value)}
          />
        </label>
        <button type="button" className="secondary-button" disabled={!restoreText.trim()} onClick={restoreSnapshot}>
          Restore backup
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={!canUndoRestore}
          onClick={() => {
            undoReplaceSnapshot()
            setMessage('Restore undone.')
          }}
        >
          Undo last restore
        </button>
        <div className="sr-status" aria-live="polite">
          {message && <p className="form-error settings-message">{message}</p>}
        </div>
      </section>

      <section className="card">
        <strong>Data status</strong>
        <div className="settings-grid">
          <div>
            <span>Schema</span>
            <strong>v{snapshot.schemaVersion}</strong>
          </div>
          <div>
            <span>Bills</span>
            <strong>{snapshot.data.bills.length}</strong>
          </div>
          <div>
            <span>Instances</span>
            <strong>{snapshot.data.billInstances.length}</strong>
          </div>
          <div>
            <span>Goals</span>
            <strong>{snapshot.data.goals.length}</strong>
          </div>
        </div>
        <Link to="/migration" className="secondary-button link-as-button settings-link">
          Legacy migration
        </Link>
      </section>
    </div>
  )
}
