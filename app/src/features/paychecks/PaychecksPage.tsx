import { useHouseholdStore } from '../../store/useHouseholdStore'
import { summarizeWindow } from '../../lib/windows'
import { formatDisplay, iso } from '../../lib/dates'
import { WindowSummaryCard } from '../../ui/WindowSummaryCard'
import { BillList } from '../../ui/BillList'

export default function PaychecksPage() {
  const snapshot = useHouseholdStore((s) => s.snapshot)
  const setInstancePaid = useHouseholdStore((s) => s.setInstancePaid)
  const todayIso = iso(new Date())

  const windows = [...snapshot.data.paychecks]
    .sort((a, b) => a.payDate.localeCompare(b.payDate))
    .map((paycheck) => ({ paycheck, summary: summarizeWindow(paycheck, snapshot.data.billInstances) }))

  if (!windows.length) {
    return (
      <div className="card">
        <p className="placeholder">No paycheck windows yet.</p>
      </div>
    )
  }

  return (
    <div className="stack">
      {windows.map(({ paycheck, summary }) => {
        const current = todayIso >= paycheck.periodStart && todayIso <= paycheck.periodEnd
        return (
          <WindowSummaryCard
            key={paycheck.id}
            paycheck={paycheck}
            summary={summary}
            label={`${formatDisplay(paycheck.payDate)} paycheck`}
            current={current}
          >
            <BillList instances={summary.instances} onTogglePaid={setInstancePaid} emptyLabel="No bills in this window." />
          </WindowSummaryCard>
        )
      })}
    </div>
  )
}
