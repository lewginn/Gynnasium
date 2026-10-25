import { Flame } from 'lucide-react'
import { addWarmupSet, type SessionDetail } from '../db/repo'
import { canAddWarmups, hasWarmup } from '../lib/warmup'

/**
 * One tap puts a warm-up set before the first working set (`lib/warmup.ts`). Shown on any weighted
 * exercise until it has a warm-up or any of its sets is done.
 */
export default function WarmupButton({ entry }: { entry: SessionDetail['exercises'][number] }) {
  const { se, exercise, sets } = entry
  if (!hasWarmup(exercise.equipment, exercise.logging) || !canAddWarmups(sets)) return null
  return (
    <button className="btn btn-sm" onClick={() => void addWarmupSet(se.id)}>
      <Flame size={18} aria-hidden /> Warm-up
    </button>
  )
}
