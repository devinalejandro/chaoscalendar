import { Link } from 'react-router-dom'
import { useHouseholdStore } from '../../store/useHouseholdStore'
import { buildAdminHealthReport, type HealthStatus } from '../../lib/adminHealth'
import { isSupabaseConfigured } from '../../data/supabase'

const STATUS_LABEL: Record<HealthStatus, string> = {
  pass: 'Ready',
  warn: 'Needs review',
  fail: 'Blocked',
}

export default function AdminPage() {
  const snapshot = useHouseholdStore((s) => s.snapshot)
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
    </div>
  )
}
