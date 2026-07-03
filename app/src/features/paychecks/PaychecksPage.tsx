import { useState } from 'react'
import { useHouseholdStore } from '../../store/useHouseholdStore'
import { formatDisplay, iso } from '../../lib/dates'
import { formatCents, parseCents } from '../../lib/money'
import { buildProjection } from '../../lib/predict'
import { WindowSummaryCard } from '../../ui/WindowSummaryCard'
import { BillList } from '../../ui/BillList'

export default function PaychecksPage() {
  const snapshot = useHouseholdStore((s) => s.snapshot)
  const setInstancePaid = useHouseholdStore((s) => s.setInstancePaid)
  const saveGoal = useHouseholdStore((s) => s.saveGoal)
  const savedGoal = snapshot.data.goals.find((g) => g.status === 'active')
  const [goal, setGoal] = useState(savedGoal ? (savedGoal.targetAmount / 100).toString() : '')
  const [goalName, setGoalName] = useState(savedGoal?.name ?? 'Vacation')
  const todayIso = iso(new Date())
  const goalAmount = goal.trim() ? parseCents(goal) : null
  const projection = buildProjection({
    paychecks: snapshot.data.paychecks,
    instances: snapshot.data.billInstances,
    todayIso,
    goalAmount,
  })

  if (!projection.windows.length) {
    return (
      <div className="card">
        <p className="placeholder">No paycheck windows yet.</p>
      </div>
    )
  }

  return (
    <div className="stack">
      <section className="card prediction-card">
        <div className="section-header">
          <strong>Prediction calculator</strong>
          <span className="spark">✧</span>
        </div>
        <p className="placeholder placeholder-tight">Uses upcoming paychecks minus bills due in each pay period.</p>
        <div className="prediction-grid">
          <div>
            <span className="label">Next 4 left</span>
            <span className="value">{formatCents(projection.next4Left)}</span>
          </div>
          <div>
            <span className="label">Next 8 left</span>
            <span className="value">{formatCents(projection.next8Left)}</span>
          </div>
          <div>
            <span className="label">Avg left</span>
            <span className="value">{formatCents(Math.round(projection.averageLeft))}</span>
          </div>
        </div>
        <div className="goal-row">
          <input
            className="field"
            placeholder="Goal name"
            value={goalName}
            onChange={(e) => setGoalName(e.target.value)}
          />
          <input
            className="field"
            inputMode="decimal"
            placeholder="Vacation goal, e.g. 1200"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
          />
          <div className="goal-answer">
            <span className="label">Paychecks</span>
            <span className="value">{goalAmount && goalAmount > 0 ? (projection.paychecksToGoal ?? 'Not in horizon') : '—'}</span>
          </div>
          <button
            type="button"
            className="secondary-button"
            disabled={!goalAmount || goalAmount <= 0 || !goalName.trim()}
            onClick={() => {
              if (!goalAmount || goalAmount <= 0) return
              saveGoal({ id: savedGoal?.id, name: goalName.trim(), targetAmount: goalAmount })
            }}
          >
            Save goal
          </button>
        </div>
      </section>

      {projection.windows.map(({ paycheck, summary }) => {
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
