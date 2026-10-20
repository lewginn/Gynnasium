import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeftRight, ArrowUp, ArrowUpDown, Check, ChevronLeft, LoaderCircle, Minus, Pencil, Plus, TriangleAlert } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { askCoach, CoachFailure } from '../coach/client'
import {
  activeGoal,
  alive,
  applyGoalPlan,
  applyPlanChanges,
  coachTrainingSummary,
  createPlanFromProposal,
  daysOff,
  goalData,
  goalPhases,
  loadExercises,
  loadPlan,
} from '../db/repo'
import { db } from '../db/db'
import { useSettings } from '../db/settings'
import {
  checkChanges,
  checkGoalPlan,
  checkNewPlan,
  describeChange,
  describeTarget,
  goalText,
  planText,
  trainingText,
  type ChangeKind,
  type ChangeLine,
  type CheckedPhase,
  type ResolvedChange,
} from '../lib/coach'
import type { CoachMode, CoachTurn, ProposedNutrition, ProposedPlan } from '../lib/coachSchema'
import { targetProgress } from '../lib/goals'
import { WEEKDAY_SHORT, shortDate, todayKey } from '../lib/schedule'
import { useConfirm } from '../state/confirm'
import { syncNow, useSync } from '../sync'

type Proposal =
  | { kind: 'plan'; plan: ProposedPlan; names: Record<string, string>; logging: Record<string, string>; skipped: string[] }
  | { kind: 'changes'; changes: ResolvedChange[]; lines: ChangeLine[]; skipped: string[] }
  | {
      kind: 'goal'
      goalId: string
      phases: CheckedPhase[]
      nutrition: ProposedNutrition | null
      names: Record<string, string>
      skipped: string[]
    }

type Entry =
  | { role: 'user'; text: string }
  | { role: 'coach'; text: string; proposal: Proposal | null; status: 'open' | 'applied' | 'dismissed'; planId?: string }

const STARTERS: Record<CoachMode, string[]> = {
  build: ['3 days a week, full gym, build muscle', 'Get stronger on the big lifts, 4 days', 'Dumbbells only, at home', 'I’m new to lifting'],
  edit: ['The squat rack is taken today', 'Make it 3 days a week', 'More arm work', 'Shorter workouts: 45 minutes'],
  goal: ['Build me a plan to the date', 'I can train Mon, Wed, Fri and Sat', 'Gym 4 days a week, 60 minutes', 'Lose fat but keep my strength'],
}

const storageKey = (key: string | undefined) => `gynnasium.coach.${key ?? 'new'}`
function loadChat(planId: string | undefined): Entry[] {
  try {
    return JSON.parse(sessionStorage.getItem(storageKey(planId)) ?? '[]') as Entry[]
  } catch {
    return []
  }
}
function saveChat(planId: string | undefined, entries: Entry[]) {
  try {
    sessionStorage.setItem(storageKey(planId), JSON.stringify(entries))
  } catch {
    // Storage unavailable: the chat just isn't kept if you leave the page.
  }
}

/** What Claude said, as it's sent back on later turns: the message plus what became of any proposal. */
function turnText(e: Entry): string {
  if (e.role === 'user' || !e.proposal) return e.text
  const what =
    e.proposal.kind === 'plan'
      ? `a plan, "${e.proposal.plan.name}"`
      : e.proposal.kind === 'goal'
        ? `a plan to the goal in ${e.proposal.phases.length} phases`
        : `${e.proposal.changes.length} changes`
  const outcome = { open: 'hasn’t decided yet', applied: 'applied it', dismissed: 'chose not to apply it' }[e.status]
  return `${e.text}\n[You proposed ${what}; the user ${outcome}.]`
}

/**
 * Chat with Claude to build a plan (/coach), change one (/plans/:planId/coach), or plan to your goal's date
 * in phases (/goal/coach). Claude only proposes; you apply.
 */
export default function CoachPage({ goal: forGoal = false }: { goal?: boolean }) {
  const { planId } = useParams()
  const mode: CoachMode = forGoal ? 'goal' : planId ? 'edit' : 'build'
  const chatKey = forGoal ? 'goal' : planId
  const navigate = useNavigate()
  const confirm = useConfirm()
  const settings = useSettings()
  const sync = useSync()
  const plan = useLiveQuery(async () => (planId ? ((await loadPlan(planId)) ?? null) : null), [planId])
  const [entries, setEntries] = useState<Entry[]>(() => loadChat(chatKey))
  const [draft, setDraft] = useState('')
  const [thinking, setThinking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    saveChat(chatKey, entries)
  }, [chatKey, entries])
  // Keep the newest message in view, above the message box. (Braces matter: newer browsers return a Promise
  // from scrollTo, and React would take a returned value for a cleanup function.)
  useEffect(() => {
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' })
  }, [entries.length, thinking])
  useEffect(() => () => abortRef.current?.abort(), [])

  const update = (i: number, patch: Partial<Extract<Entry, { role: 'coach' }>>) =>
    setEntries((list) => list.map((e, j) => (j === i && e.role === 'coach' ? { ...e, ...patch } : e)))

  const send = async (text: string) => {
    const question = text.trim()
    if (!question || thinking) return
    const withQuestion: Entry[] = [...entries, { role: 'user', text: question }]
    setEntries(withQuestion)
    setDraft('')
    setError(null)
    setThinking(true)
    const abort = new AbortController()
    abortRef.current = abort
    try {
      const detail = planId ? await loadPlan(planId) : null
      if (planId && !detail) throw new CoachFailure('This plan no longer exists.')
      const training = trainingText(await coachTrainingSummary(planId), settings.units)
      let context = detail ? `${training}\n\n${planText(detail)}` : training
      const goal = forGoal ? await activeGoal() : null
      if (forGoal) {
        if (!goal) throw new CoachFailure('Set a goal first.')
        const today = todayKey()
        const data = await goalData(goal)
        const progress = goal.targets.map((t) => targetProgress(t, goal, data, today))
        const active = (await db.plans.toArray()).find((p) => alive(p) && p.isActive)
        const current = active ? await loadPlan(active.id) : null
        context = [
          goalText(goal, progress, await goalPhases(goal.id), [...(await daysOff()).keys()].sort(), today, settings.units),
          training,
          current ? `Plan they're on now (for reference):\n${planText(current)}` : '',
        ]
          .filter(Boolean)
          .join('\n\n')
      }
      const turns: CoachTurn[] = withQuestion.map((e) => ({ role: e.role === 'user' ? 'user' : 'assistant', content: turnText(e) }))
      const reply = await askCoach({ mode, turns, context }, abort.signal)

      let proposal: Proposal | null = null
      if (reply.goalPlan && goal) {
        const ids = reply.goalPlan.phases.flatMap((p) => p.plan.days.flatMap((d) => d.exercises.map((e) => e.exerciseId)))
        const library = await loadExercises(ids)
        const checked = checkGoalPlan(reply.goalPlan, goal, library, todayKey())
        if (checked.phases.length > 0)
          proposal = {
            kind: 'goal',
            goalId: goal.id,
            phases: checked.phases,
            nutrition: checked.nutrition,
            names: Object.fromEntries([...library.values()].map((e) => [e.id, e.name])),
            skipped: checked.skipped,
          }
      } else if (reply.newPlan) {
        const library = await loadExercises(reply.newPlan.days.flatMap((d) => d.exercises.map((e) => e.exerciseId)))
        const checked = checkNewPlan(reply.newPlan, library)
        if (checked.plan.days.length > 0)
          proposal = {
            kind: 'plan',
            plan: checked.plan,
            names: Object.fromEntries([...library.values()].map((e) => [e.id, e.name])),
            logging: Object.fromEntries([...library.values()].map((e) => [e.id, e.logging])),
            skipped: checked.skipped,
          }
      } else if (reply.changes?.length && detail) {
        const library = await loadExercises(reply.changes.flatMap((c) => [c.exerciseId ?? '', ...(c.exercises ?? []).map((e) => e.exerciseId)]))
        const checked = checkChanges(reply.changes, detail, library)
        if (checked.changes.length > 0)
          proposal = { kind: 'changes', changes: checked.changes, lines: checked.changes.map((c) => describeChange(c, detail)), skipped: checked.skipped }
      }
      setEntries([...withQuestion, { role: 'coach', text: reply.message, proposal, status: 'open' }])
    } catch (e) {
      if (abort.signal.aborted) return
      // Take the question back so the chat still alternates; it's back in the box to resend.
      setEntries(entries)
      setDraft(question)
      setError(e instanceof CoachFailure ? e.message : 'Something went wrong. Try again.')
    } finally {
      setThinking(false)
    }
  }

  const apply = async (i: number, proposal: Proposal) => {
    if (proposal.kind === 'goal') {
      const existing = await goalPhases(proposal.goalId)
      if (existing.length && !(await confirm({ title: 'Replace your goal plan?', message: `Its ${existing.length} current phases are replaced. Workouts you’ve logged are kept.`, action: 'Replace plan' })))
        return
      await applyGoalPlan(
        proposal.goalId,
        proposal.phases.map(({ plan, startsOn, endsOn }) => ({ plan, startsOn, endsOn })),
        proposal.nutrition && { calories: proposal.nutrition.calories, proteinG: proposal.nutrition.proteinG, nutritionNote: proposal.nutrition.note || undefined },
      )
      update(i, { status: 'applied' })
    } else if (proposal.kind === 'plan') {
      const id = await createPlanFromProposal(proposal.plan)
      update(i, { status: 'applied', planId: id })
    } else {
      await applyPlanChanges(planId!, proposal.changes)
      update(i, { status: 'applied' })
    }
    void syncNow()
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void send(draft)
  }

  if (planId && plan === null)
    return (
      <section className="card">
        <h2>Plan not found</h2>
        <Link to="/plans">Back to plans</Link>
      </section>
    )

  return (
    <>
      <header className="page-header">
        <Link to={forGoal ? '/goal' : planId ? `/plans/${planId}` : '/plans'} className="back-link">
          <ChevronLeft size={18} aria-hidden /> {forGoal ? 'Goal' : planId ? (plan?.plan.name ?? 'Plan') : 'Plans'}
        </Link>
        <h1>{{ build: 'Build a plan', edit: 'Ask Claude', goal: 'Plan to your goal' }[mode]}</h1>
        <p className="muted">
          {
            {
              build: 'Tell Claude your goal, how often you can train and what equipment you have. You’ll see the plan before it’s saved.',
              edit: 'Ask for changes, like swapping an exercise when a machine is taken. You’ll see each change before it’s applied.',
              goal: 'Claude plans phases from today to your goal date, on the days you can train, with calorie and protein targets. You’ll see it all before it’s saved.',
            }[mode]
          }
        </p>
      </header>

      {!sync.configured && <p className="card muted">The coach needs an account, which this version of the app doesn’t have.</p>}

      {entries.length === 0 && (
        <div className="chip-wrap coach-starters" role="group" aria-label="Ideas">
          {STARTERS[mode].map((s) => (
            <button key={s} className="chip" onClick={() => void send(s)} disabled={thinking}>
              {s}
            </button>
          ))}
        </div>
      )}

      <ol className="chat" aria-label="Conversation" aria-live="polite">
        {entries.map((e, i) =>
          e.role === 'user' ? (
            <li key={i} className="bubble bubble-user">
              {e.text}
            </li>
          ) : (
            <li key={i} className="bubble bubble-coach">
              <p>{e.text}</p>
              {e.proposal && (
                <ProposalCard
                  proposal={e.proposal}
                  status={e.status}
                  createdPlanId={e.planId}
                  onApply={() => apply(i, e.proposal!)}
                  onDismiss={() => update(i, { status: 'dismissed' })}
                  onOpen={(path) => navigate(path)}
                />
              )}
            </li>
          ),
        )}
        {thinking && (
          <li className="bubble bubble-coach coach-thinking" role="status">
            <LoaderCircle size={18} className="spin" aria-hidden /> Thinking… this can take up to a minute.
          </li>
        )}
      </ol>

      {error && (
        <p className="warning small" role="alert">
          <TriangleAlert size={16} aria-hidden /> {error}
        </p>
      )}

      <form className="composer" onSubmit={submit}>
        <label className="sr-only" htmlFor="coach-input">
          Message Claude
        </label>
        <textarea
          id="coach-input"
          className="input composer-input"
          rows={2}
          maxLength={4000}
          placeholder={{ build: 'e.g. 4 days, gym, build muscle', edit: 'e.g. No bench free, swap it', goal: 'e.g. I can train Mon, Wed, Fri' }[mode]}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              void send(draft)
            }
          }}
        />
        <button type="submit" className="btn btn-primary composer-send" aria-label="Send" disabled={thinking || !draft.trim()}>
          <ArrowUp size={22} aria-hidden />
        </button>
      </form>
    </>
  )
}

const KIND_ICON: Record<ChangeKind, typeof Plus> = { add: Plus, remove: Minus, swap: ArrowLeftRight, edit: Pencil, move: ArrowUpDown }
const KIND_LABEL: Record<ChangeKind, string> = { add: 'Add', remove: 'Remove', swap: 'Swap', edit: 'Change', move: 'Move' }

function ProposalCard({
  proposal,
  status,
  createdPlanId,
  onApply,
  onDismiss,
  onOpen,
}: {
  proposal: Proposal
  status: 'open' | 'applied' | 'dismissed'
  createdPlanId?: string
  onApply: () => Promise<void>
  onDismiss: () => void
  onOpen: (path: string) => void
}) {
  const [applying, setApplying] = useState(false)
  const isPlan = proposal.kind === 'plan'
  const isGoal = proposal.kind === 'goal'

  return (
    <section
      className="proposal"
      aria-label={proposal.kind === 'plan' ? `Proposed plan: ${proposal.plan.name}` : isGoal ? 'Proposed plan to your goal' : 'Proposed changes'}
    >
      {proposal.kind === 'goal' ? (
        <GoalPlanPreview phases={proposal.phases} nutrition={proposal.nutrition} names={proposal.names} />
      ) : proposal.kind === 'plan' ? (
        <>
          <h3>{proposal.plan.name}</h3>
          {proposal.plan.goal && <p className="muted small">{proposal.plan.goal}</p>}
          {proposal.plan.days.map((d, i) => (
            <div key={i} className="proposal-day">
              <p className="section-label">{d.name}</p>
              <ul className="plain-list small">
                {d.exercises.map((x, j) => (
                  <li key={j}>
                    {proposal.names[x.exerciseId] ?? x.exerciseId}{' '}
                    <span className="muted">· {describeTarget(x, proposal.logging[x.exerciseId] === 'time' ? 'time' : 'weight_reps')}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </>
      ) : (
        <ul className="change-list">
          {proposal.lines.map((l, i) => {
            const Icon = KIND_ICON[l.kind]
            return (
              <li key={i} className={`change change-${l.kind}`}>
                <span className="change-icon" aria-label={KIND_LABEL[l.kind]} role="img">
                  <Icon size={16} aria-hidden />
                </span>
                <span>
                  <span className="list-title">{l.title}</span>
                  <span className="list-meta">{l.detail}</span>
                </span>
              </li>
            )
          })}
        </ul>
      )}
      {proposal.skipped.length > 0 && (
        <p className="muted small">
          Left out {proposal.skipped.length} {proposal.skipped.length === 1 ? 'suggestion' : 'suggestions'} that didn’t match your plan or the exercise library.
        </p>
      )}

      {status === 'open' ? (
        <div className="row">
          <button className="btn btn-sm" onClick={onDismiss} disabled={applying}>
            Not now
          </button>
          <button
            className="btn btn-sm btn-primary grow"
            disabled={applying}
            onClick={async () => {
              setApplying(true)
              await onApply()
              setApplying(false)
            }}
          >
            {proposal.kind === 'goal'
              ? 'Apply plan'
              : proposal.kind === 'plan'
                ? 'Create plan'
                : proposal.changes.length === 1
                  ? 'Apply change'
                  : `Apply ${proposal.changes.length} changes`}
          </button>
        </div>
      ) : status === 'applied' ? (
        <div className="row proposal-done" role="status">
          <Check size={18} aria-hidden /> {isPlan ? 'Plan created' : 'Applied'}
          {createdPlanId && (
            <button className="btn btn-sm btn-plain" onClick={() => onOpen(`/plans/${createdPlanId}`)}>
              Open plan
            </button>
          )}
          {isGoal && (
            <button className="btn btn-sm btn-plain" onClick={() => onOpen('/calendar')}>
              Open calendar
            </button>
          )}
        </div>
      ) : (
        <p className="muted small">Not applied.</p>
      )}
    </section>
  )
}

/** Phases with their dates and weekly schedule, then the nutrition targets. */
function GoalPlanPreview({ phases, nutrition, names }: { phases: CheckedPhase[]; nutrition: ProposedNutrition | null; names: Record<string, string> }) {
  return (
    <>
      {phases.map((ph, i) => (
        <div key={i} className="proposal-phase">
          <h3>{ph.name}</h3>
          <p className="muted small">
            {shortDate(ph.startsOn)} – {shortDate(ph.endsOn)}
            {ph.focus && ` · ${ph.focus}`}
          </p>
          <ul className="plain-list small">
            {ph.plan.days.map((d, j) => (
              <li key={j}>
                <strong>{d.name}</strong>
                {d.weekdays?.length ? ` · ${d.weekdays.map((w) => WEEKDAY_SHORT[w]).join(', ')}` : ''}
                {d.week ? ` · week ${d.week === 1 ? 'A' : 'B'}` : ''}
                <span className="muted block">{d.exercises.map((x) => names[x.exerciseId] ?? x.exerciseId).join(', ')}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {nutrition && (
        <div className="proposal-phase">
          <h3>Food</h3>
          <p className="small">
            {nutrition.calories.toLocaleString()} kcal and {nutrition.proteinG} g protein a day
          </p>
          {nutrition.note && <p className="muted small">{nutrition.note}</p>}
        </div>
      )}
    </>
  )
}
