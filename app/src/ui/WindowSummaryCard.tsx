import type { ReactNode } from 'react'
import type { Paycheck } from '../types'
import type { WindowSummary } from '../lib/windows'
import { formatCents } from '../lib/money'
import { formatDisplay } from '../lib/dates'

export function WindowSummaryCard({
  paycheck,
  summary,
  label,
  current,
  children,
}: {
  paycheck: Paycheck
  summary: WindowSummary
  label: string
  current?: boolean
  children?: ReactNode
}) {
  return (
    <div className={`card window-card${current ? ' current' : ''}`}>
      <div className="window-card-label">{label}</div>
      <div className="window-card-dates">
        {formatDisplay(paycheck.periodStart)} – {formatDisplay(paycheck.periodEnd)}
      </div>
      <div className="window-totals">
        <div>
          <span className="label">Total</span>
          <span className="value">{formatCents(summary.total)}</span>
        </div>
        <div>
          <span className="label">Bills</span>
          <span className="value">{formatCents(summary.billsTotal)}</span>
        </div>
        <div>
          <span className="label">Left</span>
          <span className="value strong">{formatCents(summary.left)}</span>
        </div>
        <div>
          <span className="label">Count</span>
          <span className="value">{summary.billCount}</span>
        </div>
      </div>
      {children}
    </div>
  )
}
