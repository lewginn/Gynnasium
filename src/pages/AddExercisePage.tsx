import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import ExerciseBrowser from '../components/ExerciseBrowser'
import Page from '../components/Page'
import { db } from '../db/db'
import { addExercise, recentExerciseIds, startWorkout, useActiveSession } from '../db/workout'
import type { Exercise } from '../lib/types'

export default function AddExercisePage() {
  const session = useActiveSession()
  const navigate = useNavigate()
  const recent = useLiveQuery(async () => {
    const exercises = await db.exercises.bulkGet(await recentExerciseIds())
    return exercises.filter((e): e is Exercise => !!e)
  })

  const pick = async (exercise: Exercise) => {
    const target = session ?? (await startWorkout())
    const added = await addExercise(target.id, exercise.id)
    navigate('/workout', { replace: true, state: { activeId: added.id } })
  }

  return (
    <Page title="Add exercise" back={{ to: '/workout', label: 'Workout' }}>
      <ExerciseBrowser onPick={pick} featured={recent && { title: 'Recent', exercises: recent }} />
    </Page>
  )
}
