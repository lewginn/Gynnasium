import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from './Icon'
import { PopUpSelect } from './controls'
import { db } from '../db/db'
import { EQUIPMENT_LABELS, MUSCLES_BY_REGION, MUSCLE_LABELS, PATTERN_LABELS, REGION_LABELS } from '../lib/labels'
import type { Equipment, Exercise, Muscle, Region } from '../lib/types'

const PAGE_SIZE = 60

type Props = {
  /** When set, rows pick an exercise instead of opening its detail page. */
  onPick?: (exercise: Exercise) => void
  /** Shown above the results while no search or filter is active, e.g. recently used exercises. */
  featured?: { title: string; exercises: Exercise[] }
}

/** Searchable, filterable exercise library list. */
export default function ExerciseBrowser({ onPick, featured }: Props) {
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

  const filtering = !!(query || region || equipment)

  const row = (e: Exercise) => {
    const body = (
      <>
        <span className="row-body">
          <span className="row-title">{e.name}</span>
          <span className="row-subtitle">
            {e.primaryMuscles.map((m) => MUSCLE_LABELS[m]).join(', ')} · {EQUIPMENT_LABELS[e.equipment]} ·{' '}
            {PATTERN_LABELS[e.movementPattern]}
          </span>
        </span>
        {onPick ? (
          <Icon name="plus" size={20} className="row-add" />
        ) : (
          <Icon name="chevronRight" size={16} className="row-chevron" />
        )}
      </>
    )
    return (
      <li key={e.id}>
        {onPick ? (
          <button className="row" onClick={() => onPick(e)} aria-label={`Add ${e.name}`}>
            {body}
          </button>
        ) : (
          <Link to={`/exercises/${encodeURIComponent(e.id)}`} className="row">
            {body}
          </Link>
        )}
      </li>
    )
  }

  return (
    <>
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

      {featured && featured.exercises.length > 0 && !filtering && (
        <section className="section">
          <h2 className="section-header">{featured.title}</h2>
          <ul className="group">{featured.exercises.map(row)}</ul>
        </section>
      )}
      <section className="section">
        <p className="section-header" aria-live="polite">
          {exercises ? `${filtered.length} exercises` : 'Loading…'}
        </p>
        {filtered.length > 0 && <ul className="group">{filtered.slice(0, limit).map(row)}</ul>}
      </section>
      {filtered.length > limit && (
        <button className="btn btn-gray" onClick={() => setLimit(limit + PAGE_SIZE)}>
          Show more
        </button>
      )}
    </>
  )
}
