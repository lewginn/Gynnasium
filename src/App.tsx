import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { ChartLine, Dumbbell, House, ListChecks, Settings } from 'lucide-react'
import WorkoutBar from './components/WorkoutBar'
import ExerciseDetailPage from './pages/ExerciseDetailPage'
import EditSessionPage from './pages/EditSessionPage'
import ExercisesPage from './pages/ExercisesPage'
import PlanEditPage from './pages/PlanEditPage'
import PlansPage from './pages/PlansPage'
import ProgressPage from './pages/ProgressPage'
import SessionPage from './pages/SessionPage'
import SettingsPage from './pages/SettingsPage'
import TodayPage from './pages/TodayPage'
import WorkoutPage from './pages/WorkoutPage'

const NAV = [
  { to: '/', label: 'Today', Icon: House },
  { to: '/plans', label: 'Plans', Icon: ListChecks },
  { to: '/exercises', label: 'Exercises', Icon: Dumbbell },
  { to: '/progress', label: 'Progress', Icon: ChartLine },
  { to: '/settings', label: 'Settings', Icon: Settings },
]

export default function App() {
  // The workout screen is full-height: no bottom nav competing with the rest timer.
  const path = useLocation().pathname
  const inWorkout = path === '/workout' || path.endsWith('/edit')

  return (
    <div className="app">
      <main className={`content ${inWorkout ? 'content-workout' : ''}`}>
        <Routes>
          <Route path="/" element={<TodayPage />} />
          <Route path="/workout" element={<WorkoutPage />} />
          <Route path="/history/:sessionId" element={<SessionPage />} />
          <Route path="/history/:sessionId/edit" element={<EditSessionPage />} />
          <Route path="/plans" element={<PlansPage />} />
          <Route path="/plans/:planId" element={<PlanEditPage />} />
          <Route path="/exercises" element={<ExercisesPage />} />
          <Route path="/exercises/:id" element={<ExerciseDetailPage />} />
          <Route path="/progress" element={<ProgressPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {/* Today has its own resume card. */}
      {!inWorkout && path !== '/' && <WorkoutBar />}
      {!inWorkout && (
        <nav className="bottom-nav glass" aria-label="Main">
          {NAV.map(({ to, label, Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} className="nav-item">
              <Icon size={24} aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  )
}
