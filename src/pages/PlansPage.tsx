import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronRight, MessagesSquare, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ProfileButton } from '../components/Avatar'
import { db } from '../db/db'
import { alive, createPlan, createPlanFromTemplate } from '../db/repo'
import { PLAN_TEMPLATES } from '../lib/templates'

export default function PlansPage() {
  const navigate = useNavigate()
  const plans = useLiveQuery(async () => {
    const all = (await db.plans.toArray()).filter(alive)
    const days = (await db.planDays.toArray()).filter(alive)
    return all
      .sort((a, b) => Number(b.isActive) - Number(a.isActive) || b.updatedAt - a.updatedAt)
      .map((plan) => ({ plan, dayCount: days.filter((d) => d.planId === plan.id).length }))
  })
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')

  const create = async () => {
    const id = await createPlan(name.trim() || 'My plan')
    navigate(`/plans/${id}`)
  }

  return (
    <>
      <header className="page-header">
        <h1>Plans</h1>
        <ProfileButton />
      </header>

      {plans && plans.length > 0 && (
        <ul className="list">
          {plans.map(({ plan, dayCount }) => (
            <li key={plan.id}>
              <Link to={`/plans/${plan.id}`} className="list-row list-row-split">
                <span>
                  <span className="list-title">
                    {plan.name} {plan.isActive && <span className="badge">Active</span>}
                  </span>
                  <span className="list-meta">
                    {dayCount} {dayCount === 1 ? 'day' : 'days'}
                  </span>
                </span>
                <ChevronRight size={20} aria-hidden className="muted" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {naming ? (
        <form
          className="card stack"
          onSubmit={(e) => {
            e.preventDefault()
            void create()
          }}
        >
          <label className="field">
            <span>Plan name</span>
            <input className="input" autoFocus value={name} placeholder="e.g. My PPL" onChange={(e) => setName(e.target.value)} />
          </label>
          <div className="row">
            <button type="button" className="btn" onClick={() => setNaming(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary grow">
              Create plan
            </button>
          </div>
        </form>
      ) : (
        <button className="btn btn-primary btn-block" onClick={() => setNaming(true)}>
          <Plus size={20} aria-hidden /> New plan
        </button>
      )}
      <Link to="/coach" className="btn btn-block">
        <MessagesSquare size={20} aria-hidden /> Build a plan with Claude
      </Link>

      <h2 className="section-title">Start from a template</h2>
      <p className="muted small">You can change anything afterwards.</p>
      {PLAN_TEMPLATES.map((t) => (
        <section key={t.key} className="card">
          <h3>{t.name}</h3>
          <p className="muted small">{t.description}</p>
          <p className="small">{t.days.map((d) => d.name).join(' · ')}</p>
          <button
            className="btn btn-block"
            onClick={async () => navigate(`/plans/${await createPlanFromTemplate(t)}`)}
            aria-label={`Use ${t.name} template`}
          >
            Use this template
          </button>
        </section>
      ))}
    </>
  )
}
