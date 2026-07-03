import { useState } from 'react'
import { useHouseholdStore } from '../../store/useHouseholdStore'
import { formatDisplay, iso } from '../../lib/dates'
import { formatCents, parseCents } from '../../lib/money'
import { buildProjection } from '../../lib/predict'
import { buildPayTimingSuggestion } from '../../lib/payTiming'
import { WindowSummaryCard } from '../../ui/WindowSummaryCard'
import { BillList } from '../../ui/BillList'

export default function PaychecksPage() {
  const snapshot = useHouseholdStore((s) => s.snapshot)
  const setInstancePaid = useHouseholdStore((s) => s.setInstancePaid)
  const moveInstanceToPaycheck = useHouseholdStore((s) => s.moveInstanceToPaycheck)
  const saveGoal = useHouseholdStore((s) => s.saveGoal)
  const savedGoal = snapshot.data.goals.find((g) => g.status === 'active')
  const [goal, setGoal] = useState(savedGoal ? (savedGoal.targetAmount / 100).toString() : '')
  const [goalName, setGoalName] = useState(savedGoal?.name ?? 'Vacation')
  const [goalMessage, setGoalMessage] = useState<string | null>(null)
  const [plannerOpen, setPlannerOpen] = useState(false)
  const [timingOpen, setTimingOpen] = useState(false)
  const todayIso = iso(new Date())
  const goalAmount = goal.trim() ? parseCents(goal) : null
  const projection = buildProjection({
    paychecks: snapshot.data.paychecks,
    instances: snapshot.data.billInstances,
    todayIso,
    goalAmount,
  })
  const timingSuggestion = buildPayTimingSuggestion(projection.windows)

  if (!projection.windows.length) {
    return (
      <div className="card">
        <p className="placeholder">No paycheck windows yet.</p>
      </div>
    )
  }

  return (
    <div className="stack">
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
            <details className="paycheck-bills" {...(current ? { open: true } : {})}>
              <summary>{summary.billCount ? `Show ${summary.billCount} planned bills` : 'No bills planned'}</summary>
              <BillList
                instances={summary.instances}
                onTogglePaid={setInstancePaid}
                onMovePaycheck={moveInstanceToPaycheck}
                paychecks={snapshot.data.paychecks}
                emptyLabel="No bills in this window."
              />
            </details>
          </WindowSummaryCard>
        )
      })}

      <section className="card paycheck-tools">
        <strong>Planning tools</strong>
        <p className="placeholder placeholder-tight">Open these when you want to test savings or timing options.</p>
        <div className="form-actions">
          <button type="button" className="primary-button" onClick={() => setPlannerOpen(true)}>
            Plan a goal
          </button>
          <button type="button" className="secondary-button" disabled={!timingSuggestion} onClick={() => setTimingOpen(true)}>
            Timing idea
          </button>
        </div>
      </section>

      {timingOpen && timingSuggestion && (
        <div className="modal-backdrop" role="presentation">
          <section className="card planner-sheet timing-card" role="dialog" aria-modal="true" aria-labelledby="timing-title">
            <div className="section-header">
              <strong id="timing-title">Timing idea</strong>
              <button type="button" className="link-button" onClick={() => setTimingOpen(false)}>
                Close
              </button>
            </div>
            <p>
              Pay <strong>{timingSuggestion.title}</strong> ({formatCents(timingSuggestion.amount)}) with the{' '}
              <strong>{formatDisplay(timingSuggestion.toLabel)}</strong> paycheck instead.
            </p>
            <div className="timing-grid">
              <div>
                <span>Earlier check left</span>
                <strong>{formatCents(timingSuggestion.toLeftAfter)}</strong>
                <em>was {formatCents(timingSuggestion.toLeftBefore)}</em>
              </div>
              <div>
                <span>Later check left</span>
                <strong>{formatCents(timingSuggestion.fromLeftAfter)}</strong>
                <em>was {formatCents(timingSuggestion.fromLeftBefore)}</em>
              </div>
            </div>
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                moveInstanceToPaycheck(timingSuggestion.instanceId, timingSuggestion.toPaycheckId)
                setTimingOpen(false)
              }}
            >
              Use this plan
            </button>
          </section>
        </div>
      )}

      {plannerOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="card planner-sheet" role="dialog" aria-modal="true" aria-labelledby="planner-title">
            <div className="section-header">
              <strong id="planner-title">Goal planner</strong>
              <button type="button" className="link-button" onClick={() => setPlannerOpen(false)}>
                Close
              </button>
            </div>
            <p className="placeholder placeholder-tight">
              Enter a target and the app estimates how many checks it takes using the money left after bills.
            </p>
            <label className="field-label">
              What are you saving for?
              <input className="field" placeholder="Vacation" value={goalName} onChange={(e) => setGoalName(e.target.value)} />
            </label>
            <label className="field-label">
              Target amount
              <input className="field" inputMode="decimal" placeholder="1200" value={goal} onChange={(e) => setGoal(e.target.value)} />
            </label>
            <div className="planner-answer">
              <div>
                <span>Estimated checks</span>
                <strong>{goalAmount && goalAmount > 0 ? (projection.paychecksToGoal ?? 'More than shown') : '-'}</strong>
              </div>
              <div>
                <span>Left next 4 checks</span>
                <strong>{formatCents(projection.next4Left)}</strong>
              </div>
            </div>
            <button
              type="button"
              className="primary-button"
              disabled={!goalAmount || goalAmount <= 0 || !goalName.trim()}
              onClick={() => {
                if (!goalAmount || goalAmount <= 0) return
                saveGoal({ id: savedGoal?.id, name: goalName.trim(), targetAmount: goalAmount })
                setGoalMessage('Goal saved.')
                setPlannerOpen(false)
              }}
            >
              Save goal
            </button>
            <div className="sr-status" aria-live="polite">
              {goalMessage && <p className="field-help">{goalMessage}</p>}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
