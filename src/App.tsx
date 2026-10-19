import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import ExercisesPage from './pages/ExercisesPage'
import ExerciseDetailPage from './pages/ExerciseDetailPage'
import PlansPage from './pages/PlansPage'
import ProgressPage from './pages/ProgressPage'
import SettingsPage from './pages/SettingsPage'
import TodayPage from './pages/TodayPage'

const NAV = [
  { to: '/', label: 'Today', icon: '●' },
  { to: '/plans', label: 'Plans', icon: '☰' },
  { to: '/exercises', label: 'Exercises', icon: '◆' },
  { to: '/progress', label: 'Progress', icon: '▲' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
]

export default function App() {
  return (
    <div className="app">
      <main className="content">
        <Routes>
          <Route path="/" element={<TodayPage />} />
          <Route path="/plans" element={<PlansPage />} />
          <Route path="/exercises" element={<ExercisesPage />} />
          <Route path="/exercises/:id" element={<ExerciseDetailPage />} />
          <Route path="/progress" element={<ProgressPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <nav className="bottom-nav" aria-label="Main">
        {NAV.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to === '/'} className="nav-item">
            <span className="nav-icon" aria-hidden>
              {item.icon}
            </span>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
