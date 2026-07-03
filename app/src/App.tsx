import { Link, NavLink, Navigate, Route, Routes } from 'react-router-dom'
import TodayPage from './features/today/TodayPage'
import PaychecksPage from './features/paychecks/PaychecksPage'
import CalendarPage from './features/calendar/CalendarPage'
import BillsPage from './features/bills/BillsPage'
import ImportPage from './features/import/ImportPage'
import MigrationPage from './features/migration/MigrationPage'
import AuthStatus from './features/auth/AuthStatus'
import SettingsPage from './features/settings/SettingsPage'
import AdminPage from './features/admin/AdminPage'

const TABS = [
  { to: '/today', label: 'Today' },
  { to: '/paychecks', label: 'Paychecks' },
  { to: '/calendar', label: 'Calendar' },
  { to: '/bills', label: 'Bills' },
]

export default function App() {
  return (
    <div className="shell theme-romantic-light">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <header className="shell-header">
        <div className="brand-block">
          <div className="sub">Household finance planner</div>
          <h1>Karla's Chaos Calendar</h1>
        </div>
        <details className="overflow-menu">
          <summary aria-label="Open secondary navigation">Menu</summary>
          <div className="overflow-menu-panel">
            <Link to="/import">Paste import</Link>
            <Link to="/migration">Legacy migration</Link>
            <Link to="/settings">Settings</Link>
            <Link to="/admin">Admin</Link>
          </div>
        </details>
        <AuthStatus />
      </header>

      <main id="main-content" tabIndex={-1}>
        <Routes>
          <Route path="/" element={<Navigate to="/today" replace />} />
          <Route path="/today" element={<TodayPage />} />
          <Route path="/paychecks" element={<PaychecksPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/bills" element={<BillsPage />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/migration" element={<MigrationPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </main>

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
