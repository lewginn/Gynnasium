import { updateSettings, useSettings } from '../db/settings'
import type { Units } from '../lib/types'

const REST_OPTIONS = [60, 90, 120, 150, 180, 240]

export default function SettingsPage() {
  const settings = useSettings()

  return (
    <>
      <header className="page-header">
        <h1>Settings</h1>
      </header>
      <section className="card">
        <h2 id="units-label">Units</h2>
        <div className="segmented" role="radiogroup" aria-labelledby="units-label">
          {(['kg', 'lb'] as Units[]).map((u) => (
            <button key={u} role="radio" aria-checked={settings.units === u} onClick={() => updateSettings({ units: u })}>
              {u}
            </button>
          ))}
        </div>
        <p className="muted small">Weights are stored in kg, so switching never changes your history.</p>
      </section>
      <section className="card">
        <label className="field">
          <span>Default rest timer</span>
          <select
            className="input"
            value={settings.defaultRestSec}
            onChange={(e) => updateSettings({ defaultRestSec: Number(e.target.value) })}
          >
            {REST_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s % 60 === 0 ? `${s / 60} min` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`}
              </option>
            ))}
          </select>
        </label>
        <p className="muted small">Used when an exercise doesn't have its own rest time.</p>
      </section>
      <section className="card">
        <label className="toggle">
          <span>
            Log RPE
            <span className="muted small block">How hard a set felt, 1–10. RPE 8 means you had about 2 reps left.</span>
          </span>
          <input type="checkbox" checked={settings.showRpe} onChange={(e) => updateSettings({ showRpe: e.target.checked })} />
        </label>
      </section>
    </>
  )
}
