import { useMemo, useState } from 'react'
import { useHouseholdStore } from '../../store/useHouseholdStore'
import { formatDisplay, iso } from '../../lib/dates'
import { formatCents } from '../../lib/money'
import { BillList } from '../../ui/BillList'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthTitle(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function sameMonthIso(d: Date, day: number): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export default function CalendarPage() {
  const snapshot = useHouseholdStore((s) => s.snapshot)
  const setInstancePaid = useHouseholdStore((s) => s.setInstancePaid)
  const todayIso = iso(new Date())
  const [cursor, setCursor] = useState(() => new Date(todayIso + 'T00:00:00'))
  const [selectedDate, setSelectedDate] = useState(todayIso)

  const eventsByDay = useMemo(() => {
    const map = new Map<string, { bills: number; paychecks: number }>()
    snapshot.data.billInstances.forEach((instance) => {
      if (!instance.dueDate) return
      const entry = map.get(instance.dueDate) ?? { bills: 0, paychecks: 0 }
      entry.bills += 1
      map.set(instance.dueDate, entry)
    })
    snapshot.data.paychecks.forEach((paycheck) => {
      const entry = map.get(paycheck.payDate) ?? { bills: 0, paychecks: 0 }
      entry.paychecks += 1
      map.set(paycheck.payDate, entry)
    })
    return map
  }, [snapshot.data.billInstances, snapshot.data.paychecks])

  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const days = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()
    const out: Array<{ isoDate?: string; day?: number; events?: { bills: number; paychecks: number } }> = []
    for (let i = 0; i < first.getDay(); i += 1) out.push({})
    for (let day = 1; day <= days; day += 1) {
      const isoDate = sameMonthIso(cursor, day)
      out.push({ isoDate, day, events: eventsByDay.get(isoDate) })
    }
    return out
  }, [cursor, eventsByDay])

  const selectedBills = snapshot.data.billInstances
    .filter((instance) => instance.dueDate === selectedDate)
    .sort((a, b) => a.title.localeCompare(b.title))
  const selectedPaychecks = snapshot.data.paychecks.filter((paycheck) => paycheck.payDate === selectedDate)

  function shiftMonth(delta: number) {
    const next = new Date(cursor)
    next.setMonth(next.getMonth() + delta)
    setCursor(next)
    if (monthKey(next) !== selectedDate.slice(0, 7)) setSelectedDate(sameMonthIso(next, 1))
  }

  return (
    <div className="stack">
      <section className="card">
        <div className="calendar-header">
          <button type="button" className="secondary-button compact-button" onClick={() => shiftMonth(-1)}>
            ‹
          </button>
          <strong>{monthTitle(cursor)}</strong>
          <button type="button" className="secondary-button compact-button" onClick={() => shiftMonth(1)}>
            ›
          </button>
        </div>
        <div className="calendar-weekdays">
          {WEEKDAYS.map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>
        <div className="calendar-grid">
          {cells.map((cell, index) =>
            cell.isoDate ? (
              <button
                key={cell.isoDate}
                type="button"
                className={`calendar-cell${cell.isoDate === selectedDate ? ' selected' : ''}${cell.isoDate === todayIso ? ' today' : ''}`}
                onClick={() => setSelectedDate(cell.isoDate!)}
              >
                <span>{cell.day}</span>
                <span className="calendar-dots">
                  {cell.events?.paychecks ? <i className="dot paycheck-dot" /> : null}
                  {cell.events?.bills ? <i className="dot bill-dot" /> : null}
                </span>
              </button>
            ) : (
              <span key={`blank_${index}`} className="calendar-cell blank" />
            ),
          )}
        </div>
        <div className="calendar-legend">
          <span><i className="dot paycheck-dot" /> Paycheck</span>
          <span><i className="dot bill-dot" /> Bill</span>
        </div>
      </section>

      <section className="card">
        <strong>{formatDisplay(selectedDate)}</strong>
        {selectedPaychecks.length > 0 && (
          <div className="calendar-paychecks">
            {selectedPaychecks.map((paycheck) => (
              <div key={paycheck.id} className="calendar-paycheck-row">
                <span>Paycheck</span>
                <strong>{formatCents(paycheck.amount)}</strong>
              </div>
            ))}
          </div>
        )}
        <BillList
          instances={selectedBills}
          onTogglePaid={setInstancePaid}
          emptyLabel={selectedPaychecks.length ? 'No bills due this day.' : 'Nothing scheduled this day.'}
        />
      </section>
    </div>
  )
}
