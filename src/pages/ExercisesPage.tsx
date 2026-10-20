import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ProfileButton } from '../components/Avatar'
import { db } from '../db/db'
import { EQUIPMENT_LABELS, MUSCLES_BY_REGION, MUSCLE_LABELS, PATTERN_LABELS, REGION_LABELS } from '../lib/labels'
import { rankSearchResults } from '../lib/suggest'
import type { Equipment, Muscle, Region } from '../lib/types'

const PAGE_SIZE = 60

export default function ExercisesPage() {
  const exercises = useLiveQuery(async () => rankSearchResults(await db.exercises.toArray()))
  const [query, setQuery] = useState('')
  const [region, setRegion] = useState<Region | null>(null)
  const [muscle, setMuscle] = useState<Muscle | null>(null)
  const [equipment, setEquipment] = useState<Equipment | ''>('')
  const [limit, setLimit] = useState(PAGE_SIZE)

  const filtered = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    return (exercises ?? []).filter(
      (e) =>
        (!region || e.region === region) &&
        (!muscle || e.primaryMuscles.includes(muscle)) &&
        (!equipment || e.equipment === equipment) &&
        words.every((w) => e.name.toLowerCase().includes(w)),
    )
  }, [exercises, query, region, muscle, equipment])

  const pickRegion = (r: Region) => {
    setRegion(region === r ? null : r)
    setMuscle(null)
    setLimit(PAGE_SIZE)
  }

  return (
    <>
      <header className="page-header">
        <h1>Exercises</h1>
        <ProfileButton />
      </header>
      <div className="filters">
        <input
          type="search"
          className="input"
          placeholder="Search exercises"
          aria-label="Search exercises"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setLimit(PAGE_SIZE)
          }}
        />
        <div className="chips" role="group" aria-label="Body region">
          {(Object.keys(REGION_LABELS) as Region[]).map((r) => (
            <button key={r} className="chip" aria-pressed={region === r} onClick={() => pickRegion(r)}>
              {REGION_LABELS[r]}
            </button>
          ))}
        </div>
        {region && (
          <div className="chips" role="group" aria-label="Muscle">
            {MUSCLES_BY_REGION[region].map((m) => (
              <button key={m} className="chip chip-sm" aria-pressed={muscle === m} onClick={() => setMuscle(muscle === m ? null : m)}>
                {MUSCLE_LABELS[m]}
              </button>
            ))}
          </div>
        )}
        <select
          className="input"
          aria-label="Equipment"
          value={equipment}
          onChange={(e) => setEquipment(e.target.value as Equipment | '')}
        >
          <option value="">Any equipment</option>
          {(Object.keys(EQUIPMENT_LABELS) as Equipment[]).map((eq) => (
            <option key={eq} value={eq}>
              {EQUIPMENT_LABELS[eq]}
            </option>
          ))}
        </select>
      </div>

      <p className="muted small" aria-live="polite">
        {exercises ? `${filtered.length} exercises` : 'Loading…'}
      </p>
      <ul className="list">
        {filtered.slice(0, limit).map((e) => (
          <li key={e.id}>
            <Link to={`/exercises/${encodeURIComponent(e.id)}`} className="list-row">
              <span className="list-title">{e.name}</span>
              <span className="list-meta">
                {e.primaryMuscles.map((m) => MUSCLE_LABELS[m]).join(', ')} · {EQUIPMENT_LABELS[e.equipment]} ·{' '}
                {PATTERN_LABELS[e.movementPattern]}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {filtered.length > limit && (
        <button className="btn btn-block" onClick={() => setLimit(limit + PAGE_SIZE)}>
          Show more
        </button>
      )}
    </>
  )
}
