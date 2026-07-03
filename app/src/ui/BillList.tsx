import type { BillInstance, Paycheck } from '../types'
import { formatCents } from '../lib/money'
import { formatDisplay, iso } from '../lib/dates'

export function BillList({
  instances,
  onTogglePaid,
  emptyLabel = 'Nothing here yet.',
  readOnly = false,
  showPaidDate = false,
  paychecks = [],
  onMovePaycheck,
}: {
  instances: BillInstance[]
  /** called with the checkbox's new checked state, so the toggle is reversible */
  onTogglePaid: (id: string, paid: boolean) => void
  emptyLabel?: string
  /** hides the checkbox — used for read-only views like paid history */
  readOnly?: boolean
  /** shows "Paid <date>" instead of the due date */
  showPaidDate?: boolean
  paychecks?: Paycheck[]
  onMovePaycheck?: (id: string, paycheckId: string) => void
}) {
  if (!instances.length) return <p className="placeholder">{emptyLabel}</p>

  const canMove = !readOnly && paychecks.length > 0 && typeof onMovePaycheck === 'function'
  const todayIso = iso(new Date())

  return (
    <ul className="bill-list">
      {instances.map((i) => {
        const overdue = i.status !== 'paid' && i.dueDate != null && i.dueDate < todayIso
        return (
        <li key={i.id} className={`bill-row${i.status === 'paid' ? ' paid' : ''}${overdue ? ' overdue' : ''}${canMove ? ' with-move' : ''}`}>
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
            {showPaidDate && i.paidDate
              ? `Paid ${formatDisplay(i.paidDate)}`
              : i.dueDate
                ? `${overdue ? 'Overdue - ' : ''}${formatDisplay(i.dueDate)}`
                : 'No due date'}
          </span>
          <span className="bill-amount">{i.amount != null ? formatCents(i.amount) : ''}</span>
          {canMove && (
            <label className="bill-move">
              <span>Pay with</span>
              <select
                value={i.paycheckId ?? ''}
                onChange={(e) => onMovePaycheck?.(i.id, e.target.value)}
                aria-label={`Choose paycheck for ${i.title}`}
              >
                <option value="" disabled>
                  Pick check
                </option>
                {paychecks.map((paycheck) => (
                  <option key={paycheck.id} value={paycheck.id}>
                    {formatDisplay(paycheck.payDate)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </li>
      )})}
    </ul>
  )
}
