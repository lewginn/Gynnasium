import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, Search, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { db } from '../db/db'
import { EQUIPMENT_LABELS, MUSCLE_LABELS, REGION_LABELS } from '../lib/labels'
import { rankSearchResults } from '../lib/suggest'
import type { Exercise, Region } from '../lib/types'
import Sheet from './Sheet'

export interface PickerSuggestion {
  exercise: Exercise
  reason?: string
}

interface Props {
  title: string
  onClose: () => void
  onPick: (exercise: Exercise) => void
  suggestions?: PickerSuggestion[]
  suggestionsTitle?: string
  excludeIds?: string[]
}

const RESULT_LIMIT = 50

export default function ExercisePicker({ title, onClose, onPick, suggestions = [], suggestionsTitle = 'Suggested', excludeIds = [] }: Props) {
  const library = useLiveQuery(() => db.exercises.toArray())
  const [query, setQuery] = useState('')
  const [region, setRegion] = useState<Region | null>(null)

  const exclude = useMemo(() => new Set(excludeIds), [excludeIds])
  const results = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    const matches = (library ?? []).filter(
      (e) =>
        !exclude.has(e.id) &&
        (!region || e.region === region) &&
        words.every((w) => e.name.toLowerCase().includes(w) || e.primaryMuscles.some((m) => MUSCLE_LABELS[m].toLowerCase().includes(w))),
    )
    return rankSearchResults(matches).slice(0, RESULT_LIMIT)
  }, [library, query, region, exclude])

  const showSuggestions = !query && !region && suggestions.length > 0
  const pick = (e: Exercise) => {
    onPick(e)
    onClose()
  }

  return (
    <Sheet title={title} onClose={onClose} tall>
      <div className="search-field">
        <Search size={18} aria-hidden />
        <input
          type="search"
          className="input"
          placeholder="Search exercises or muscles"
          aria-label="Search exercises"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="chips" role="group" aria-label="Body region">
        {(Object.keys(REGION_LABELS) as Region[]).map((r) => (
          <button key={r} className="chip chip-sm" aria-pressed={region === r} onClick={() => setRegion(region === r ? null : r)}>
            {REGION_LABELS[r]}
          </button>
        ))}
      </div>

      {showSuggestions && (
        <section aria-label={suggestionsTitle}>
          <h3 className="section-label">
            <Sparkles size={14} aria-hidden /> {suggestionsTitle}
          </h3>
          <ul className="list">
            {suggestions.map(({ exercise, reason }) => (
              <PickRow key={exercise.id} exercise={exercise} detail={reason} onPick={pick} />
            ))}
          </ul>
        </section>
      )}

      <h3 className="section-label">{showSuggestions ? 'All exercises' : `${results.length}${results.length === RESULT_LIMIT ? '+' : ''} results`}</h3>
      <ul className="list">
        {results.map((e) => (
          <PickRow key={e.id} exercise={e} onPick={pick} />
        ))}
      </ul>
    </Sheet>
  )
}

function PickRow({ exercise, detail, onPick }: { exercise: Exercise; detail?: string; onPick: (e: Exercise) => void }) {
  return (
    <li>
      <button className="list-row pick-row" onClick={() => onPick(exercise)}>
        <span>
          <span className="list-title">{exercise.name}</span>
          <span className="list-meta">
            {detail ?? `${exercise.primaryMuscles.map((m) => MUSCLE_LABELS[m]).join(', ')} · ${EQUIPMENT_LABELS[exercise.equipment]}`}
          </span>
        </span>
        <Plus size={20} className="pick-icon" aria-hidden />
      </button>
    </li>
  )
}
