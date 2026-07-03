import { Link } from 'react-router-dom'
import { useHouseholdStore } from '../../store/useHouseholdStore'
import { buildAdminHealthReport, type HealthStatus } from '../../lib/adminHealth'
import { getSupabaseConfig, isSupabaseConfigured } from '../../data/supabase'
import { canSyncSnapshot } from '../../data/supabaseSync'
import { recentAuditEvents } from '../../lib/audit'

const STATUS_LABEL: Record<HealthStatus, string> = {
  pass: 'Ready',
  warn: 'Needs review',
  fail: 'Blocked',
}

export default function AdminPage() {
  const snapshot = useHouseholdStore((s) => s.snapshot)
  const syncReady = canSyncSnapshot(snapshot, getSupabaseConfig())
  const auditEvents = recentAuditEvents(snapshot, 8)
  const report = buildAdminHealthReport({
    snapshot,
    supabaseConfigured: isSupabaseConfigured(),
    hasLegacyArchive: true,
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
            : 'Set Supabase env and keep a household record before enabling cloud sync.'}
        </p>
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
