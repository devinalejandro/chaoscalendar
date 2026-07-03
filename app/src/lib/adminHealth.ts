import type { Snapshot } from '../types'

export type HealthStatus = 'pass' | 'warn' | 'fail'

export interface HealthCheck {
  id: string
  label: string
  status: HealthStatus
  detail: string
}

export interface AdminHealthReport {
  checks: HealthCheck[]
  readyForCutover: boolean
}

export function buildAdminHealthReport({
  snapshot,
  supabaseConfigured,
  hasLegacyArchive,
  hasServiceWorker,
}: {
  snapshot: Snapshot
  supabaseConfigured: boolean
  /** null while the /legacy reachability check is still in flight — not
      yet verified, so it must not report "pass". */
  hasLegacyArchive: boolean | null
  hasServiceWorker: boolean
}): AdminHealthReport {
  const checks: HealthCheck[] = [
    {
      id: 'household',
      label: 'Household',
      status: snapshot.data.household ? 'pass' : 'fail',
      detail: snapshot.data.household ? snapshot.data.household.name : 'No household record found.',
    },
    {
      id: 'finance-data',
      label: 'Finance data',
      status: snapshot.data.paychecks.length > 0 && snapshot.data.billInstances.length > 0 ? 'pass' : 'warn',
      detail: `${snapshot.data.paychecks.length} paychecks, ${snapshot.data.bills.length} bill templates, ${snapshot.data.billInstances.length} bill instances.`,
    },
    {
      id: 'schema',
      label: 'Schema',
      status: snapshot.schemaVersion >= 4 ? 'pass' : 'fail',
      detail: `Local snapshot schema v${snapshot.schemaVersion}.`,
    },
    {
      id: 'supabase',
      label: 'Supabase',
      status: supabaseConfigured ? 'pass' : 'warn',
      detail: supabaseConfigured ? 'Public Supabase env is configured.' : 'Running in local draft mode until Supabase env is set.',
    },
    {
      id: 'legacy',
      label: 'Legacy archive',
      status: hasLegacyArchive === null ? 'warn' : hasLegacyArchive ? 'pass' : 'fail',
      detail:
        hasLegacyArchive === null
          ? 'Checking whether /legacy responds…'
          : hasLegacyArchive
            ? 'Legacy app is available at /legacy.'
            : '/legacy did not respond — the archive route may be missing or broken.',
    },
    {
      id: 'pwa',
      label: 'PWA shell',
      status: hasServiceWorker ? 'pass' : 'warn',
      detail: hasServiceWorker ? 'Service worker registration is available.' : 'Service worker is not available in this browser.',
    },
  ]

  return {
    checks,
    readyForCutover: checks.every((check) => check.status !== 'fail'),
  }
}
