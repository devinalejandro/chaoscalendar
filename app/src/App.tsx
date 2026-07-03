import { Link, NavLink, Navigate, Route, Routes } from 'react-router-dom'
import TodayPage from './features/today/TodayPage'
import PaychecksPage from './features/paychecks/PaychecksPage'
import CalendarPage from './features/calendar/CalendarPage'
import BillsPage from './features/bills/BillsPage'
import ImportPage from './features/import/ImportPage'
import MigrationPage from './features/migration/MigrationPage'

const TABS = [
  { to: '/today', label: 'Today' },
  { to: '/paychecks', label: 'Paychecks' },
  { to: '/calendar', label: 'Calendar' },
  { to: '/bills', label: 'Bills' },
]

export default function App() {
  return (
    <div className="shell">
      <header className="shell-header">
        <div className="sub">Aurora Finance</div>
        <h1>Yo Momma K's Calendar</h1>
        <Link to="/import" className="import-entry">
          Paste import
        </Link>
        <Link to="/migration" className="import-entry import-entry-secondary">
          Legacy migration
        </Link>
      </header>

      <Routes>
        <Route path="/" element={<Navigate to="/today" replace />} />
        <Route path="/today" element={<TodayPage />} />
        <Route path="/paychecks" element={<PaychecksPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/bills" element={<BillsPage />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="/migration" element={<MigrationPage />} />
      </Routes>

      <nav className="tabbar" aria-label="Main">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} className={({ isActive }) => (isActive ? 'active' : '')}>
            {t.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
