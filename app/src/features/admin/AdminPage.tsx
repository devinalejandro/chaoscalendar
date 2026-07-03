import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useHouseholdStore } from '../../store/useHouseholdStore'
import { buildAdminHealthReport, type HealthStatus } from '../../lib/adminHealth'
import { getSupabaseConfig, isSupabaseConfigured } from '../../data/supabase'
import { canSyncSnapshot, pullSnapshotFromSupabase, pushSnapshotToSupabase } from '../../data/supabaseSync'
import { recentAuditEvents } from '../../lib/audit'

const STATUS_LABEL: Record<HealthStatus, string> = {
  pass: 'Ready',
  warn: 'Needs review',
  fail: 'Blocked',
}

export default function AdminPage() {
  const snapshot = useHouseholdStore((s) => s.snapshot)
  const replaceSnapshot = useHouseholdStore((s) => s.replaceSnapshot)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  // null until the reachability check below resolves — the health report
  // treats null as "not yet verified" rather than a false "pass".
  const [legacyReachable, setLegacyReachable] = useState<boolean | null>(null)
  const supabaseConfig = getSupabaseConfig()
  const syncReady = canSyncSnapshot(snapshot, supabaseConfig)
  const auditEvents = recentAuditEvents(snapshot, 8)

  useEffect(() => {
    let cancelled = false
    fetch('/legacy', { method: 'HEAD' })
      .then((res) => {
        if (!cancelled) setLegacyReachable(res.ok)
      })
      .catch(() => {
        if (!cancelled) setLegacyReachable(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const report = buildAdminHealthReport({
    snapshot,
    supabaseConfigured: isSupabaseConfigured(),
    hasLegacyArchive: legacyReachable,
    hasServiceWorker: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
  })

  return (
    <div className="stack">
      <section className="card">
        <div className="section-header">
          <strong>Admin health</strong>
          <span className={`confidence confidence-${report.readyForCutover ? 'high' : 'medium'}`}>
            {report.readyForCutover ? 'Cutover ready' : 'Review first'}
          </span>
        </div>
        <ul className="admin-check-list">
          {report.checks.map((check) => (
            <li key={check.id} className={`admin-check admin-check-${check.status}`}>
              <div>
                <strong>{check.label}</strong>
                <span>{check.detail}</span>
              </div>
              <em>{STATUS_LABEL[check.status]}</em>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <strong>Launch links</strong>
        <div className="form-actions admin-actions">
          <Link to="/settings" className="secondary-button link-as-button">
            Backups
          </Link>
          <Link to="/migration" className="secondary-button link-as-button">
            Migration
          </Link>
          <a href="/legacy" className="secondary-button link-as-button">
            Legacy app
          </a>
        </div>
      </section>

      <section className="card">
        <div className="section-header">
          <strong>Cloud sync</strong>
          <span className={`confidence confidence-${syncReady ? 'high' : 'medium'}`}>
            {syncReady ? 'Ready' : 'Local only'}
          </span>
        </div>
        <p className="placeholder placeholder-tight">
          {syncReady
            ? 'Snapshot sync can use the Supabase cloud_snapshots table.'
            : supabaseConfig && snapshot.data.household?.id
              ? 'This household’s id is not a Supabase-compatible UUID yet, so push/pull cannot succeed even though Supabase env is configured.'
              : 'Set Supabase env and keep a household record before enabling cloud sync.'}
        </p>
        <div className="form-actions admin-actions">
          <button
            type="button"
            className="secondary-button"
            disabled={!syncReady || !supabaseConfig}
            onClick={async () => {
              if (!supabaseConfig) return
              const result = await pushSnapshotToSupabase(supabaseConfig, snapshot)
              setSyncMessage(result.ok ? 'Snapshot pushed to Supabase.' : result.error)
            }}
          >
            Push snapshot
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={!syncReady || !supabaseConfig || !snapshot.data.household?.id}
            onClick={async () => {
              if (!supabaseConfig || !snapshot.data.household?.id) return
              if (!window.confirm('This replaces everything currently in the app with the cloud snapshot. You can undo this once from Settings > Undo last restore. Continue?')) {
                return
              }
              const result = await pullSnapshotFromSupabase(supabaseConfig, snapshot.data.household.id)
              if (result.ok) {
                replaceSnapshot(result.snapshot)
                setSyncMessage('Snapshot pulled from Supabase.')
              } else {
                setSyncMessage(result.error)
              }
            }}
          >
            Pull snapshot
          </button>
        </div>
        {syncMessage && <p className="form-error settings-message">{syncMessage}</p>}
      </section>

      <section className="card">
        <strong>Recent history</strong>
        {auditEvents.length ? (
          <ul className="audit-list">
            {auditEvents.map((event) => (
              <li key={event.id}>
                <span>{event.action}</span>
                <em>{new Date(event.createdAt).toLocaleString()}</em>
              </li>
            ))}
          </ul>
        ) : (
          <p className="placeholder placeholder-tight">No tracked changes yet.</p>
        )}
      </section>
    </div>
  )
}
