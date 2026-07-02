import type { BillInstance } from '../types'
import { formatCents } from '../lib/money'
import { formatDisplay } from '../lib/dates'

export function BillList({
  instances,
  onTogglePaid,
  emptyLabel = 'Nothing here yet.',
}: {
  instances: BillInstance[]
  onTogglePaid: (id: string) => void
  emptyLabel?: string
}) {
  if (!instances.length) return <p className="placeholder">{emptyLabel}</p>

  return (
    <ul className="bill-list">
      {instances.map((i) => (
        <li key={i.id} className={`bill-row${i.status === 'paid' ? ' paid' : ''}`}>
          <label className="bill-check">
            <input
              type="checkbox"
              checked={i.status === 'paid'}
              onChange={() => onTogglePaid(i.id)}
              aria-label={`Mark ${i.title} paid`}
            />
          </label>
          <span className="bill-title">{i.title}</span>
          <span className="bill-date">{i.dueDate ? formatDisplay(i.dueDate) : 'No due date'}</span>
          <span className="bill-amount">{i.amount != null ? formatCents(i.amount) : ''}</span>
        </li>
      ))}
    </ul>
  )
}
