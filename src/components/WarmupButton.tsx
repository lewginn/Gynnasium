import { Flame } from 'lucide-react'
import { addWarmupSets, type SessionDetail } from '../db/repo'
import type { Settings } from '../lib/types'
import { canAddWarmups, warmupSets } from '../lib/warmup'

/**
 * One tap puts a ramp of warm-up sets before the first working set, worked out from the weight it's
 * pre-filled with. Shown only while the exercise has no warm-ups and nothing done, and the ramp isn't empty.
 */
export default function WarmupButton({ entry, settings }: { entry: SessionDetail['exercises'][number]; settings: Settings }) {
  const { se, exercise, sets } = entry
  const first = sets.find((s) => s.setType === 'working')
  const ramp =
    first && canAddWarmups(sets)
      ? warmupSets({
          workingWeightKg: first.weightKg,
          workingReps: first.reps,
          equipment: exercise.equipment,
          logging: exercise.logging,
          units: settings.units,
        })
      : []
  if (ramp.length === 0) return null
  return (
    <button className="btn btn-sm" onClick={() => void addWarmupSets(se.id)}>
      <Flame size={18} aria-hidden /> Warm-up
    </button>
  )
}
