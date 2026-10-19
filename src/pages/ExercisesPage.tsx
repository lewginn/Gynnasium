import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../components/Icon'
import Page from '../components/Page'
import { PopUpSelect } from '../components/controls'
import { db } from '../db/db'
import { EQUIPMENT_LABELS, MUSCLES_BY_REGION, MUSCLE_LABELS, PATTERN_LABELS, REGION_LABELS } from '../lib/labels'
import type { Equipment, Muscle, Region } from '../lib/types'

const PAGE_SIZE = 60

export default function ExercisesPage() {
  const exercises = useLiveQuery(() => db.exercises.orderBy('name').toArray())
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

  const search = (q: string) => {
    setQuery(q)
    setLimit(PAGE_SIZE)
  }

  const pickRegion = (r: Region) => {
    setRegion(region === r ? null : r)
    setMuscle(null)
    setLimit(PAGE_SIZE)
  }

  return (
    <Page title="Exercises">
      <div className="filters">
        <div className="search">
          <Icon name="search" size={18} />
          <input
            type="search"
            placeholder="Search"
            aria-label="Search exercises"
            enterKeyHint="search"
            value={query}
            onChange={(e) => search(e.target.value)}
          />
          {query && (
            <button className="search-clear" aria-label="Clear search" onClick={() => search('')}>
              <Icon name="clear" size={18} />
            </button>
          )}
        </div>
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
              <button key={m} className="chip" aria-pressed={muscle === m} onClick={() => setMuscle(muscle === m ? null : m)}>
                {MUSCLE_LABELS[m]}
              </button>
            ))}
          </div>
        )}
        <PopUpSelect
          className="popup-pill"
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
        </PopUpSelect>
      </div>

      <section className="section">
        <p className="section-header" aria-live="polite">
          {exercises ? `${filtered.length} exercises` : 'Loading…'}
        </p>
        {filtered.length > 0 && (
          <ul className="group">
            {filtered.slice(0, limit).map((e) => (
              <li key={e.id}>
                <Link to={`/exercises/${encodeURIComponent(e.id)}`} className="row">
                  <span className="row-body">
                    <span className="row-title">{e.name}</span>
                    <span className="row-subtitle">
                      {e.primaryMuscles.map((m) => MUSCLE_LABELS[m]).join(', ')} · {EQUIPMENT_LABELS[e.equipment]} ·{' '}
                      {PATTERN_LABELS[e.movementPattern]}
                    </span>
                  </span>
                  <Icon name="chevronRight" size={16} className="row-chevron" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      {filtered.length > limit && (
        <button className="btn btn-gray" onClick={() => setLimit(limit + PAGE_SIZE)}>
          Show more
        </button>
      )}
    </Page>
  )
}
