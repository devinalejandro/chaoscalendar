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
  /** null while the old-app backup reachability check is still in flight. */
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
      label: 'Data format',
      status: snapshot.schemaVersion >= 4 ? 'pass' : 'fail',
      detail: `Local app data format v${snapshot.schemaVersion}.`,
    },
    {
      id: 'supabase',
      label: 'Cloud storage',
      status: supabaseConfigured ? 'pass' : 'warn',
      detail: supabaseConfigured ? 'Cloud settings are configured.' : 'Running in local draft mode until cloud settings are added.',
    },
    {
      id: 'legacy',
      label: 'Old app backup',
      status: hasLegacyArchive === null ? 'warn' : hasLegacyArchive ? 'pass' : 'fail',
      detail:
        hasLegacyArchive === null
          ? 'Checking whether the old app backup responds...'
          : hasLegacyArchive
            ? 'Old app backup is available.'
            : 'The old app backup did not respond.',
    },
    {
      id: 'pwa',
      label: 'Installable app',
      status: hasServiceWorker ? 'pass' : 'warn',
      detail: hasServiceWorker ? 'This browser can install and load the app offline.' : 'Install mode is not available in this browser.',
    },
  ]

  return {
    checks,
    readyForCutover: checks.every((check) => check.status !== 'fail'),
  }
}
