import Icon from '../components/Icon'
import Page from '../components/Page'
import { PopUpSelect, Switch } from '../components/controls'
import { updateSettings, useSettings } from '../db/settings'
import type { Units } from '../lib/types'

const REST_OPTIONS = [60, 90, 120, 150, 180, 240]

export default function SettingsPage() {
  const settings = useSettings()

  return (
    <Page title="Settings">
      <section className="section">
        <ul className="group">
          <li>
            <div className="row">
              <span className="row-icon icon-indigo">
                <Icon name="weight" size={18} />
              </span>
              <span className="row-body" id="units-label">
                Units
              </span>
              <div className="segmented" role="radiogroup" aria-labelledby="units-label">
                {(['kg', 'lb'] as Units[]).map((u) => (
                  <button key={u} role="radio" aria-checked={settings.units === u} onClick={() => updateSettings({ units: u })}>
                    {u}
                  </button>
                ))}
              </div>
            </div>
          </li>
        </ul>
        <p className="section-footer">Weights are stored in kg, so switching never changes your history.</p>
      </section>
      <section className="section">
        <ul className="group">
          <li>
            <label className="row">
              <span className="row-icon icon-orange">
                <Icon name="timer" size={19} />
              </span>
              <span className="row-body">Default rest</span>
              <PopUpSelect
                value={settings.defaultRestSec}
                onChange={(e) => updateSettings({ defaultRestSec: Number(e.target.value) })}
              >
                {REST_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s % 60 === 0 ? `${s / 60} min` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`}
                  </option>
                ))}
              </PopUpSelect>
            </label>
          </li>
        </ul>
        <p className="section-footer">Used when an exercise doesn't have its own rest time.</p>
      </section>
      <section className="section">
        <ul className="group">
          <li>
            <label className="row">
              <span className="row-icon icon-red">
                <Icon name="flame" size={19} />
              </span>
              <span className="row-body">Log RPE</span>
              <Switch checked={settings.showRpe} onChange={(e) => updateSettings({ showRpe: e.target.checked })} />
            </label>
          </li>
        </ul>
        <p className="section-footer">How hard a set felt, 1–10. RPE 8 means you had about 2 reps left.</p>
      </section>
    </Page>
  )
}
