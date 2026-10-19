import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import Icon, { type IconName } from './components/Icon'
import ExercisesPage from './pages/ExercisesPage'
import ExerciseDetailPage from './pages/ExerciseDetailPage'
import PlansPage from './pages/PlansPage'
import ProgressPage from './pages/ProgressPage'
import SettingsPage from './pages/SettingsPage'
import TodayPage from './pages/TodayPage'

const NAV: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Today', icon: 'today' },
  { to: '/plans', label: 'Plans', icon: 'plans' },
  { to: '/exercises', label: 'Exercises', icon: 'dumbbell' },
  { to: '/progress', label: 'Progress', icon: 'chart' },
  { to: '/settings', label: 'Settings', icon: 'gear' },
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
      <nav className="tab-bar glass" aria-label="Main">
        {NAV.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to === '/'} className="tab">
            <Icon name={item.icon} size={24} />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
