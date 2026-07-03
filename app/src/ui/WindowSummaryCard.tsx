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
  const isShort = summary.left < 0
  const billsProgress = summary.total > 0 ? Math.min(100, Math.round((summary.billsTotal / summary.total) * 100)) : 0
  const leftProgress = Math.max(0, 100 - billsProgress)

  return (
    <div className={`card window-card${current ? ' current' : ''}${isShort ? ' short' : ''}`}>
      <div className="window-card-label">{label}</div>
      <div className="window-card-dates">
        {formatDisplay(paycheck.periodStart)} – {formatDisplay(paycheck.periodEnd)}
      </div>
      <div className="paycheck-progress" aria-label={`Bills use ${billsProgress}% of this paycheck, with ${leftProgress}% left`}>
        <span className="paycheck-progress-bills" style={{ width: `${billsProgress}%` }} />
        <span className="paycheck-progress-left" style={{ width: `${leftProgress}%` }} />
      </div>
      <div className="paycheck-progress-key" aria-hidden="true">
        <span><i className="key-bills" /> Bills</span>
        <span><i className="key-left" /> Left</span>
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
          <span className="label">{isShort ? 'Short' : 'Left'}</span>
          <span className={`value strong${isShort ? ' short-value' : ''}`}>{formatCents(summary.left)}</span>
        </div>
        <div>
          <span className="label">Bills due</span>
          <span className="value">{summary.billCount}</span>
        </div>
      </div>
      {children}
    </div>
  )
}
