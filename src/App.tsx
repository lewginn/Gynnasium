import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import Icon, { type IconName } from './components/Icon'
import WorkoutBar from './components/workout/WorkoutBar'
import AddExercisePage from './pages/AddExercisePage'
import ExercisesPage from './pages/ExercisesPage'
import ExerciseDetailPage from './pages/ExerciseDetailPage'
import PlansPage from './pages/PlansPage'
import ProgressPage from './pages/ProgressPage'
import SettingsPage from './pages/SettingsPage'
import TodayPage from './pages/TodayPage'
import { useRestAlarm } from './hooks/useRest'
import WorkoutPage from './pages/WorkoutPage'
import WorkoutSummaryPage from './pages/WorkoutSummaryPage'

const NAV: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Today', icon: 'today' },
  { to: '/plans', label: 'Plans', icon: 'plans' },
  { to: '/exercises', label: 'Exercises', icon: 'dumbbell' },
  { to: '/progress', label: 'Progress', icon: 'chart' },
  { to: '/settings', label: 'Settings', icon: 'gear' },
]

export default function App() {
  useRestAlarm()
  // The workout screen is full-screen: no tab bar to mis-tap mid-set.
  const inWorkout = /^\/workout(\/|$)/.test(useLocation().pathname)

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
          <Route path="/workout" element={<WorkoutPage />} />
          <Route path="/workout/add" element={<AddExercisePage />} />
          <Route path="/workouts/:id" element={<WorkoutSummaryPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {!inWorkout && <WorkoutBar />}
      {!inWorkout && (
        <nav className="tab-bar glass" aria-label="Main">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'} className="tab">
              <Icon name={item.icon} size={24} />
              {item.label}
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  )
}
