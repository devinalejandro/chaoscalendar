import type { BillInstance } from '../types'
import { formatCents } from '../lib/money'
import { formatDisplay } from '../lib/dates'

export function BillList({
  instances,
  onTogglePaid,
  emptyLabel = 'Nothing here yet.',
  readOnly = false,
  showPaidDate = false,
}: {
  instances: BillInstance[]
  /** called with the checkbox's new checked state, so the toggle is reversible */
  onTogglePaid: (id: string, paid: boolean) => void
  emptyLabel?: string
  /** hides the checkbox — used for read-only views like paid history */
  readOnly?: boolean
  /** shows "Paid <date>" instead of the due date */
  showPaidDate?: boolean
}) {
  if (!instances.length) return <p className="placeholder">{emptyLabel}</p>

  return (
    <ul className="bill-list">
      {instances.map((i) => (
        <li key={i.id} className={`bill-row${i.status === 'paid' ? ' paid' : ''}`}>
          {readOnly ? (
            <span className="bill-check bill-check-static" aria-hidden="true">
              ✓
            </span>
          ) : (
            <label className="bill-check">
              <input
                type="checkbox"
                checked={i.status === 'paid'}
                onChange={(e) => onTogglePaid(i.id, e.target.checked)}
                aria-label={`Mark ${i.title} ${i.status === 'paid' ? 'unpaid' : 'paid'}`}
              />
            </label>
          )}
          <span className="bill-title">{i.title}</span>
          <span className="bill-date">
            {showPaidDate && i.paidDate ? `Paid ${formatDisplay(i.paidDate)}` : i.dueDate ? formatDisplay(i.dueDate) : 'No due date'}
          </span>
          <span className="bill-amount">{i.amount != null ? formatCents(i.amount) : ''}</span>
        </li>
      ))}
    </ul>
  )
}
