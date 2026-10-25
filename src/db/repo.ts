import type { ResolvedChange, TrainingSummary } from '../lib/coach'
import type { ProposedPlan } from '../lib/coachSchema'
import { estimate1RM } from '../lib/e1rm'
import { defaultRepRange, suggestNext, type Progression } from '../lib/progression'
import { toDateKey, weeklyCounts, type Point } from '../lib/metrics'
import { detectPRs } from '../lib/prs'
import { weeklyReview, type WeeklyReview } from '../lib/review'
import { inferFocusMuscles } from '../lib/suggest'
import { totalVolumeKg } from '../lib/summary'
import { canAddWarmups, warmupSet } from '../lib/warmup'
import { dayLabel, sortDays } from '../lib/weeks'
import type { GoalData } from '../lib/goals'
import type { PlanWithDays } from '../lib/schedule'
import type { PlanTemplate } from '../lib/templates'
import type {
  BodyMetric,
  BodyMetricType,
  Goal,
  Exercise,
  LoggingType,
  Plan,
  PlanDay,
  PlanExercise,
  SessionExercise,
  Settings,
  Units,
  SetLog,
  Synced,
  WorkoutSession,
} from '../lib/types'
import { DEFAULT_SETTINGS } from '../lib/types'
import { db } from './db'

const uuid = () => crypto.randomUUID()
const now = () => Date.now()
export const alive = <T extends Synced>(row: T | undefined): row is T => !!row && !row.deletedAt
const byOrder = (a: { order: number }, b: { order: number }) => a.order - b.order

// ---------------------------------------------------------------- Plans

export async function createPlan(name: string, createdBy: Plan['createdBy'] = 'manual'): Promise<string> {
  const id = uuid()
  await db.transaction('rw', db.plans, async () => {
    const hasActive = (await db.plans.toArray()).some((p) => alive(p) && p.isActive)
    await db.plans.add({ id, name, isActive: !hasActive, createdBy, updatedAt: now() })
  })
  return id
}

export async function updatePlan(id: string, patch: Partial<Pick<Plan, 'name' | 'goal'>>) {
  await db.plans.update(id, { ...patch, updatedAt: now() })
}

export async function setActivePlan(id: string) {
  await db.transaction('rw', db.plans, async () => {
    for (const p of await db.plans.toArray())
      if (alive(p) && p.isActive !== (p.id === id)) await db.plans.update(p.id, { isActive: p.id === id, updatedAt: now() })
  })
}

export async function deletePlan(id: string) {
  await db.transaction('rw', db.plans, db.planDays, db.planExercises, async () => {
    const t = now()
    await db.plans.update(id, { deletedAt: t, isActive: false, updatedAt: t })
    for (const day of await db.planDays.where('planId').equals(id).toArray()) await deleteDayRows(day.id, t)
  })
}

async function deleteDayRows(dayId: string, t: number) {
  await db.planDays.update(dayId, { deletedAt: t, updatedAt: t })
  await db.planExercises.where('planDayId').equals(dayId).modify({ deletedAt: t, updatedAt: t })
}

export async function addPlanDay(planId: string, name: string, week?: PlanDay['week']): Promise<string> {
  const id = uuid()
  const order = (await db.planDays.where('planId').equals(planId).filter(alive).count())
  await db.planDays.add({ id, planId, name, order, focusMuscles: inferFocusMuscles(name), ...(week ? { week } : {}), updatedAt: now() })
  return id
}

export async function updatePlanDay(id: string, patch: Partial<Pick<PlanDay, 'name' | 'focusMuscles' | 'week'>>) {
  await db.planDays.update(id, { ...patch, updatedAt: now() })
}

/** Turns alternating weeks on (every day starts in week A) or off (days run every week again). */
export async function setAlternatingWeeks(planId: string, on: boolean) {
  await db.transaction('rw', db.planDays, async () => {
    const t = now()
    for (const day of await db.planDays.where('planId').equals(planId).filter(alive).toArray())
      // Dexie removes a field updated to undefined; sync sends it as null.
      if (on ? !day.week : day.week) await db.planDays.update(day.id, { week: on ? 1 : undefined, updatedAt: t })
  })
}

export async function deletePlanDay(id: string) {
  await db.transaction('rw', db.planDays, db.planExercises, () => deleteDayRows(id, now()))
}

export { defaultRepRange }

export async function addPlanExercise(planDayId: string, exercise: Exercise): Promise<string> {
  const id = uuid()
  const order = await db.planExercises.where('planDayId').equals(planDayId).filter(alive).count()
  const [repMin, repMax] = defaultRepRange(await withLogging(exercise))
  await db.planExercises.add({
    id,
    planDayId,
    exerciseId: exercise.id,
    order,
    targetSets: 3,
    repMin,
    repMax,
    restSec: exercise.defaultRestSec,
    progressionRule: 'double_progression',
    alternates: [],
    updatedAt: now(),
  })
  return id
}

export async function updatePlanExercise(
  id: string,
  patch: Partial<Pick<PlanExercise, 'targetSets' | 'repMin' | 'repMax' | 'restSec' | 'exerciseId' | 'progressionRule'>>,
) {
  await db.planExercises.update(id, { ...patch, updatedAt: now() })
}

export async function deletePlanExercise(id: string) {
  await db.planExercises.update(id, { deletedAt: now(), updatedAt: now() })
}

/** Moves a plan exercise up (-1) or down (+1) within its day. */
export async function movePlanExercise(id: string, direction: -1 | 1) {
  await db.transaction('rw', db.planExercises, async () => {
    const pe = await db.planExercises.get(id)
    if (!pe) return
    const siblings = (await db.planExercises.where('planDayId').equals(pe.planDayId).filter(alive).toArray()).sort(byOrder)
    const i = siblings.findIndex((s) => s.id === id)
    const j = i + direction
    if (j < 0 || j >= siblings.length) return
    ;[siblings[i], siblings[j]] = [siblings[j], siblings[i]]
    const t = now()
    await Promise.all(siblings.map((s, order) => (s.order === order ? null : db.planExercises.update(s.id, { order, updatedAt: t }))))
  })
}

export async function createPlanFromTemplate(template: PlanTemplate): Promise<string> {
  const library = new Map((await db.exercises.toArray()).map((e) => [e.id, e]))
  const planId = uuid()
  const t = now()
  await db.transaction('rw', db.plans, db.planDays, db.planExercises, async () => {
    const hasActive = (await db.plans.toArray()).some((p) => alive(p) && p.isActive)
    await db.plans.add({ id: planId, name: template.name, isActive: !hasActive, createdBy: 'manual', updatedAt: t })
    for (const [dayOrder, day] of template.days.entries()) {
      const dayId = uuid()
      await db.planDays.add({ id: dayId, planId, name: day.name, order: dayOrder, focusMuscles: day.focus, updatedAt: t })
      await db.planExercises.bulkAdd(
        day.exercises.map((e, order) => ({
          id: uuid(),
          planDayId: dayId,
          exerciseId: e.id,
          order,
          targetSets: e.sets,
          repMin: e.reps[0],
          repMax: e.reps[1],
          restSec: library.get(e.id)?.defaultRestSec ?? 120,
          progressionRule: 'double_progression' as const,
          alternates: [],
          updatedAt: t,
        })),
      )
    }
  })
  return planId
}

export interface PlanDetail {
  plan: Plan
  days: { day: PlanDay; exercises: { pe: PlanExercise; exercise: Exercise }[] }[]
}

export async function loadPlan(planId: string): Promise<PlanDetail | null> {
  const plan = await db.plans.get(planId)
  if (!alive(plan)) return null
  const days = sortDays(await db.planDays.where('planId').equals(planId).filter(alive).toArray())
  const pes = await db.planExercises.where('planDayId').anyOf(days.map((d) => d.id)).filter(alive).toArray()
  const exercises = await loadExercises(pes.map((p) => p.exerciseId))
  return {
    plan,
    days: days.map((day) => ({
      day,
      exercises: pes
        .filter((pe) => pe.planDayId === day.id && exercises.has(pe.exerciseId))
        .sort(byOrder)
        .map((pe) => ({ pe, exercise: exercises.get(pe.exerciseId)! })),
    })),
  }
}

// ---------------------------------------------------------------- Workouts

export async function getActiveSession(): Promise<WorkoutSession | undefined> {
  return (await db.sessions.toArray()).find((s) => alive(s) && !s.endedAt)
}

/** Completed working/drop/failure sets from the most recent earlier workout that included this exercise. */
export async function lastPerformance(exerciseId: string, excludeSessionId?: string): Promise<SetLog[]> {
  const sets = await db.setLogs
    .where('[exerciseId+completedAt]')
    .between([exerciseId, 0], [exerciseId, Infinity])
    .reverse()
    .filter(alive)
    .toArray()
  for (const s of sets) {
    const se = await db.sessionExercises.get(s.sessionExerciseId)
    if (!alive(se) || se.sessionId === excludeSessionId) continue
    return sets
      .filter((x) => x.sessionExerciseId === se.id && x.setType !== 'warmup')
      .sort((a, b) => a.setNumber - b.setNumber)
  }
  return []
}

/** Working sets from the last `count` workouts of an exercise, newest first (for progression). */
export async function recentPerformances(exerciseId: string, count: number, excludeSessionId?: string): Promise<SetLog[][]> {
  const sets = await db.setLogs
    .where('[exerciseId+completedAt]')
    .between([exerciseId, 0], [exerciseId, Infinity])
    .reverse()
    .filter((s) => alive(s) && s.setType !== 'warmup')
    .toArray()
  const out: SetLog[][] = []
  const seen = new Set<string>()
  for (const s of sets) {
    if (seen.has(s.sessionExerciseId)) continue
    seen.add(s.sessionExerciseId)
    const se = await db.sessionExercises.get(s.sessionExerciseId)
    if (!alive(se) || se.sessionId === excludeSessionId || !alive(await db.sessions.get(se.sessionId))) continue
    out.push(sets.filter((x) => x.sessionExerciseId === se.id).sort((a, b) => a.setNumber - b.setNumber))
    if (out.length === count) break
  }
  return out
}

async function currentUnits(): Promise<Units> {
  return ((await db.kv.get('settings'))?.value as Partial<Settings> | undefined)?.units ?? DEFAULT_SETTINGS.units
}

type SetTarget = { sets: number; repMin: number; repMax: number }

/** The plan's target for an exercise in this workout, or sensible defaults for one added on the day. */
async function targetFor(exercise: Exercise, sessionId: string): Promise<{ target: SetTarget; rule: PlanExercise['progressionRule'] }> {
  const session = await db.sessions.get(sessionId)
  const pe = session?.planDayId
    ? (await db.planExercises.where('planDayId').equals(session.planDayId).filter(alive).toArray()).find((p) => p.exerciseId === exercise.id)
    : undefined
  if (pe) return { target: { sets: pe.targetSets, repMin: pe.repMin, repMax: pe.repMax }, rule: pe.progressionRule }
  const [repMin, repMax] = defaultRepRange(exercise)
  return { target: { sets: 3, repMin, repMax }, rule: 'double_progression' }
}

/** What to aim for on an exercise in this workout, and why (progressive overload). */
export async function progressionFor(exercise: Exercise, sessionId: string, given?: { target: SetTarget; rule: PlanExercise['progressionRule'] }): Promise<Progression> {
  const { target, rule } = given ?? (await targetFor(exercise, sessionId))
  const history = await recentPerformances(exercise.id, 2, sessionId)
  return suggestNext({ history, target, exercise, rule, units: await currentUnits() })
}

/** Planned (not yet completed) set rows, pre-filled with the progression target so logging is usually one tap. */
async function planSets(
  sessionExerciseId: string,
  exercise: Exercise,
  count: number,
  sessionId: string,
  given?: { target: SetTarget; rule: PlanExercise['progressionRule'] },
): Promise<SetLog[]> {
  const { sets } = await progressionFor(exercise, sessionId, given && { ...given, target: { ...given.target, sets: count } })
  const planned = sets.length === count ? sets : Array.from({ length: count }, (_, i) => sets[Math.min(i, sets.length - 1)])
  return planned.map((p, i) => ({
    id: uuid(),
    sessionExerciseId,
    exerciseId: exercise.id,
    setNumber: i + 1,
    setType: 'working' as const,
    weightKg: p.weightKg,
    reps: p.reps,
    ...(p.durationSec !== undefined ? { durationSec: p.durationSec } : {}),
    updatedAt: now(),
  }))
}

export async function startSession(planDayId?: string): Promise<string> {
  const existing = await getActiveSession()
  if (existing) return existing.id

  const sessionId = uuid()
  const day = planDayId ? await db.planDays.get(planDayId) : undefined
  const pes = day ? (await db.planExercises.where('planDayId').equals(day.id).filter(alive).toArray()).sort(byOrder) : []
  const exercises = await loadExercises(pes.map((pe) => pe.exerciseId))

  const sessionExercises: SessionExercise[] = []
  const sets: SetLog[] = []
  for (const [order, pe] of pes.entries()) {
    const exercise = exercises.get(pe.exerciseId)
    if (!exercise) continue
    const se: SessionExercise = { id: uuid(), sessionId, exerciseId: pe.exerciseId, order, updatedAt: now() }
    sessionExercises.push(se)
    const given = { target: { sets: pe.targetSets, repMin: pe.repMin, repMax: pe.repMax }, rule: pe.progressionRule }
    sets.push(...(await planSets(se.id, exercise, pe.targetSets, sessionId, given)))
  }

  await db.transaction('rw', db.sessions, db.sessionExercises, db.setLogs, async () => {
    await db.sessions.add({ id: sessionId, planDayId: day?.id, name: day ? dayLabel(day) : 'Workout', startedAt: now(), updatedAt: now() })
    await db.sessionExercises.bulkAdd(sessionExercises)
    await db.setLogs.bulkAdd(sets)
  })
  return sessionId
}

export async function addSessionExercise(sessionId: string, exercise: Exercise): Promise<string> {
  const id = uuid()
  const ex = await withLogging(exercise)
  const order = await db.sessionExercises.where('sessionId').equals(sessionId).filter(alive).count()
  const sets = await planSets(id, ex, 3, sessionId)
  await db.transaction('rw', db.sessionExercises, db.setLogs, async () => {
    await db.sessionExercises.add({ id, sessionId, exerciseId: exercise.id, order, updatedAt: now() })
    await db.setLogs.bulkAdd(sets)
  })
  return id
}

/** Swaps an exercise mid-workout (e.g. machine taken). Sets not yet done are re-filled from the new exercise's history. */
export async function swapSessionExercise(sessionExerciseId: string, newExercise: Exercise) {
  const se = await db.sessionExercises.get(sessionExerciseId)
  if (!se) return
  const ex = await withLogging(newExercise)
  const sets = (await db.setLogs.where('sessionExerciseId').equals(se.id).filter(alive).toArray()).sort(
    (a, b) => a.setNumber - b.setNumber,
  )
  const pending = sets.filter((s) => !s.completedAt)
  const done = sets.filter((s) => s.completedAt)
  // Warm-ups not yet done were for the old exercise's weight: they go, and the new one can have its own.
  const refill = await planSets(se.id, ex, pending.filter((s) => s.setType !== 'warmup').length, se.sessionId)
  await db.transaction('rw', db.sessionExercises, db.setLogs, async () => {
    await db.sessionExercises.update(se.id, {
      exerciseId: newExercise.id,
      swappedFromExerciseId: se.swappedFromExerciseId ?? se.exerciseId,
      updatedAt: now(),
    })
    // Completed sets keep their original exercise; they really were done on it.
    // Soft-deleted (not removed) so the deletion syncs.
    const t = now()
    await db.setLogs.where('id').anyOf(pending.map((s) => s.id)).modify({ deletedAt: t, updatedAt: t })
    await db.setLogs.bulkAdd(refill.map((s, i) => ({ ...s, setNumber: done.length + i + 1 })))
  })
}

export async function removeSessionExercise(sessionExerciseId: string) {
  const t = now()
  await db.transaction('rw', db.sessionExercises, db.setLogs, async () => {
    await db.sessionExercises.update(sessionExerciseId, { deletedAt: t, updatedAt: t })
    await db.setLogs.where('sessionExerciseId').equals(sessionExerciseId).modify({ deletedAt: t, updatedAt: t })
  })
}

/** Moves an exercise up (-1) or down (+1) within a workout, e.g. when the squat rack is busy. */
export async function moveSessionExercise(sessionExerciseId: string, direction: -1 | 1) {
  await db.transaction('rw', db.sessionExercises, async () => {
    const se = await db.sessionExercises.get(sessionExerciseId)
    if (!se) return
    const siblings = (await db.sessionExercises.where('sessionId').equals(se.sessionId).filter(alive).toArray()).sort(byOrder)
    const i = siblings.findIndex((s) => s.id === se.id)
    const j = i + direction
    if (j < 0 || j >= siblings.length) return
    ;[siblings[i], siblings[j]] = [siblings[j], siblings[i]]
    const t = now()
    await Promise.all(siblings.map((s, order) => (s.order === order ? null : db.sessionExercises.update(s.id, { order, updatedAt: t }))))
  })
}

export async function addSet(sessionExerciseId: string) {
  const se = await db.sessionExercises.get(sessionExerciseId)
  if (!se) return
  const sets = (await db.setLogs.where('sessionExerciseId').equals(se.id).filter(alive).toArray()).sort(
    (a, b) => a.setNumber - b.setNumber,
  )
  const last = sets.at(-1)
  const timed = (await loggingOf(se.exerciseId)) === 'time'
  await db.setLogs.add({
    id: uuid(),
    sessionExerciseId: se.id,
    exerciseId: se.exerciseId,
    setNumber: (last?.setNumber ?? 0) + 1,
    setType: 'working',
    weightKg: last?.weightKg ?? 0,
    reps: last?.reps ?? (timed ? 0 : 10),
    ...(timed ? { durationSec: last?.durationSec ?? 30 } : {}),
    rpe: last?.rpe,
    updatedAt: now(),
  })
}

/**
 * Puts the warm-up set (`lib/warmup.ts`) before the first working set, from the weight it holds now.
 * Does nothing once the exercise has a warm-up set or a completed set, so a double tap can't add two.
 * Returns whether a set was added.
 */
export async function addWarmupSet(sessionExerciseId: string): Promise<boolean> {
  return db.transaction('rw', db.setLogs, db.sessionExercises, db.exercises, db.kv, async () => {
    const se = await db.sessionExercises.get(sessionExerciseId)
    if (!alive(se)) return false
    const sets = (await db.setLogs.where('sessionExerciseId').equals(se.id).filter(alive).toArray()).sort(
      (a, b) => a.setNumber - b.setNumber,
    )
    if (!canAddWarmups(sets)) return false
    const exercise = await loadExercise(se.exerciseId)
    if (!exercise) return false
    const warmup = warmupSet({
      workingWeightKg: sets.find((s) => s.setType === 'working')?.weightKg ?? 0,
      equipment: exercise.equipment,
      logging: exercise.logging,
      units: await currentUnits(),
    })
    if (!warmup) return false
    const t = now()
    // Existing sets move down to make room, so set numbers stay in order.
    for (const s of sets) await db.setLogs.update(s.id, { setNumber: s.setNumber + 1, updatedAt: t })
    await db.setLogs.add({
      id: uuid(),
      sessionExerciseId: se.id,
      exerciseId: se.exerciseId,
      setNumber: 1,
      setType: 'warmup',
      weightKg: warmup.weightKg,
      reps: warmup.reps,
      updatedAt: t,
    })
    return true
  })
}

type SetPatch = Partial<Pick<SetLog, 'weightKg' | 'reps' | 'durationSec' | 'rpe' | 'setType'>>

export async function updateSet(id: string, patch: SetPatch) {
  await db.transaction('rw', db.setLogs, db.sessionExercises, db.exercises, db.kv, async () => {
    const set = await db.setLogs.get(id)
    if (!set) return
    const next = { ...set, ...patch }
    // Editing a completed set re-checks whether it's a PR.
    const prs = set.completedAt ? detectPRs(next, await priorSets(set), await loggingOf(set.exerciseId)) : undefined
    await db.setLogs.update(id, { ...patch, ...(set.completedAt ? { prs } : {}), updatedAt: now() })

    // Carry weight/reps/time down to later sets that aren't done and still hold the old value,
    // so typing 80kg on set 1 fills sets 2–4 too. Sets you've changed yourself are left alone.
    const later = (await db.setLogs.where('sessionExerciseId').equals(set.sessionExerciseId).filter(alive).toArray()).filter(
      (s) => s.setNumber > set.setNumber && !s.completedAt && s.setType === set.setType,
    )
    for (const field of ['weightKg', 'reps', 'durationSec'] as const) {
      const value = patch[field]
      if (value === undefined) continue
      for (const s of later) if (s[field] === set[field]) await db.setLogs.update(s.id, { [field]: value, updatedAt: now() } as SetPatch)
    }
  })
}

/**
 * Completed sets of the same exercise before this one, for PR comparison. Empty when the exercise has never
 * been done in an earlier workout: the first session sets a baseline rather than a string of "PRs".
 */
async function priorSets(set: SetLog): Promise<SetLog[]> {
  const prior = await db.setLogs
    .where('[exerciseId+completedAt]')
    .between([set.exerciseId, 0], [set.exerciseId, set.completedAt ?? Infinity], true, false)
    .filter((s) => alive(s) && s.id !== set.id)
    .toArray()
  const thisSession = (await db.sessionExercises.get(set.sessionExerciseId))?.sessionId
  const ses = await db.sessionExercises.bulkGet([...new Set(prior.map((s) => s.sessionExerciseId))])
  const earlierSession = ses.some((se) => alive(se) && se.sessionId !== thisSession)
  return earlierSession ? prior : []
}

/** Marks a set done. Returns the PRs it set, if any. */
export async function completeSet(id: string): Promise<SetLog['prs']> {
  return db.transaction('rw', db.setLogs, db.sessionExercises, db.sessions, db.exercises, db.kv, async () => {
    const set = await db.setLogs.get(id)
    if (!set) return []
    // Ticking a set while editing a finished workout files it under that workout's time, not today.
    const se = await db.sessionExercises.get(set.sessionExerciseId)
    const session = se ? await db.sessions.get(se.sessionId) : undefined
    const completedAt = session?.endedAt ?? now()
    const prs = detectPRs(set, await priorSets({ ...set, completedAt }), await loggingOf(set.exerciseId))
    await db.setLogs.update(id, { completedAt, prs, updatedAt: now() })
    return prs
  })
}

export async function uncompleteSet(id: string) {
  // Dexie's update() ignores undefined values, so clear the fields via modify().
  await db.setLogs
    .where('id')
    .equals(id)
    .modify((s) => {
      delete s.completedAt
      delete s.prs
      s.updatedAt = now()
    })
}

export async function deleteSet(id: string) {
  await db.setLogs.update(id, { deletedAt: now(), updatedAt: now() })
}

/** Drops sets that were never ticked and exercises left with none. Returns whether anything was logged. */
async function tidySession(sessionId: string, t: number): Promise<boolean> {
  const ses = await db.sessionExercises.where('sessionId').equals(sessionId).filter(alive).toArray()
  let anyDone = false
  for (const se of ses) {
    const sets = await db.setLogs.where('sessionExerciseId').equals(se.id).filter(alive).toArray()
    const pending = sets.filter((s) => !s.completedAt)
    await db.setLogs.where('id').anyOf(pending.map((s) => s.id)).modify({ deletedAt: t, updatedAt: t })
    if (pending.length === sets.length) await db.sessionExercises.update(se.id, { deletedAt: t, updatedAt: t })
    else anyDone = true
  }
  return anyDone
}

/** Ends the workout, dropping sets that were never done. Returns false (and discards it) if nothing was logged. */
export async function finishSession(sessionId: string): Promise<boolean> {
  const t = now()
  return db.transaction('rw', db.sessions, db.sessionExercises, db.setLogs, async () => {
    if (!(await tidySession(sessionId, t))) {
      await db.sessions.update(sessionId, { deletedAt: t, endedAt: t, updatedAt: t })
      return false
    }
    await db.sessions.update(sessionId, { endedAt: t, updatedAt: t })
    return true
  })
}

/**
 * Saves edits to a finished workout: tidies unticked sets and re-checks PRs for its exercises across all
 * history, since changing an old workout can make or unmake PRs in later ones. Returns false if it's now empty.
 */
export async function saveSessionEdits(sessionId: string): Promise<boolean> {
  const t = now()
  const exerciseIds = await sessionExerciseIds(sessionId)
  const kept = await db.transaction('rw', db.sessions, db.sessionExercises, db.setLogs, async () => {
    const anyDone = await tidySession(sessionId, t)
    await db.sessions.update(sessionId, anyDone ? { updatedAt: t } : { deletedAt: t, updatedAt: t })
    return anyDone
  })
  await recomputePRs(exerciseIds)
  return kept
}

/** Discards an in-progress workout, or deletes a finished one, re-checking PRs it may have held. */
export async function discardSession(sessionId: string) {
  const t = now()
  const exerciseIds = await sessionExerciseIds(sessionId)
  await db.transaction('rw', db.sessions, db.sessionExercises, db.setLogs, async () => {
    const ses = await db.sessionExercises.where('sessionId').equals(sessionId).toArray()
    await db.setLogs.where('sessionExerciseId').anyOf(ses.map((s) => s.id)).modify({ deletedAt: t, updatedAt: t })
    await db.sessionExercises.where('sessionId').equals(sessionId).modify({ deletedAt: t, updatedAt: t })
    await db.sessions.update(sessionId, { deletedAt: t, endedAt: t, updatedAt: t })
  })
  await recomputePRs(exerciseIds)
}

async function sessionExerciseIds(sessionId: string): Promise<string[]> {
  const ses = await db.sessionExercises.where('sessionId').equals(sessionId).toArray()
  const sets = await db.setLogs.where('sessionExerciseId').anyOf(ses.map((s) => s.id)).toArray()
  return [...new Set([...ses.map((s) => s.exerciseId), ...sets.map((s) => s.exerciseId)])]
}

/** Re-derives PR flags for every completed set of these exercises, in the order they were done. */
export async function recomputePRs(exerciseIds: string[]) {
  for (const exerciseId of exerciseIds) {
    const logging = await loggingOf(exerciseId)
    const sets = await db.setLogs
      .where('[exerciseId+completedAt]')
      .between([exerciseId, 0], [exerciseId, Infinity])
      .filter(alive)
      .toArray()
    const ses = new Map((await db.sessionExercises.bulkGet([...new Set(sets.map((s) => s.sessionExerciseId))])).filter(alive).map((se) => [se.id, se]))
    const liveSessions = new Set(
      (await db.sessions.bulkGet([...new Set([...ses.values()].map((se) => se.sessionId))])).filter(alive).map((s) => s.id),
    )
    const sessionOf = (s: SetLog) => ses.get(s.sessionExerciseId)?.sessionId
    const ordered = sets
      .filter((s) => liveSessions.has(sessionOf(s) ?? ''))
      .sort((a, b) => a.completedAt! - b.completedAt! || a.setNumber - b.setNumber)

    const prior: SetLog[] = []
    for (const s of ordered) {
      const hasEarlierSession = prior.some((p) => sessionOf(p) !== sessionOf(s))
      const prs = hasEarlierSession ? detectPRs(s, prior, logging) : []
      if (JSON.stringify(prs) !== JSON.stringify(s.prs ?? [])) await db.setLogs.update(s.id, { prs })
      prior.push(s)
    }
  }
}

export interface SessionDetail {
  session: WorkoutSession
  exercises: { se: SessionExercise; exercise: Exercise; sets: SetLog[] }[]
}

export async function loadSession(sessionId: string): Promise<SessionDetail | null> {
  const session = await db.sessions.get(sessionId)
  if (!alive(session)) return null
  const ses = (await db.sessionExercises.where('sessionId').equals(sessionId).filter(alive).toArray()).sort(byOrder)
  const sets = await db.setLogs.where('sessionExerciseId').anyOf(ses.map((s) => s.id)).filter(alive).toArray()
  const exercises = await loadExercises(ses.map((s) => s.exerciseId))
  return {
    session,
    exercises: ses
      .filter((se) => exercises.has(se.exerciseId))
      .map((se) => ({
        se,
        exercise: exercises.get(se.exerciseId)!,
        sets: sets.filter((s) => s.sessionExerciseId === se.id).sort((a, b) => a.setNumber - b.setNumber),
      })),
  }
}

// ---------------------------------------------------------------- Exercises & logging type

/** Per-exercise "log as" choices that override the library default, e.g. logging a machine as bodyweight. */
export async function loggingOverrides(): Promise<Record<string, LoggingType>> {
  return ((await db.kv.get('loggingOverrides'))?.value as Record<string, LoggingType> | undefined) ?? {}
}

export async function setLoggingOverride(exerciseId: string, logging: LoggingType) {
  await db.transaction('rw', db.kv, db.exercises, async () => {
    const overrides = await loggingOverrides()
    const libraryDefault = (await db.exercises.get(exerciseId))?.logging ?? 'weight_reps'
    if (logging === libraryDefault) delete overrides[exerciseId]
    else overrides[exerciseId] = logging
    await db.kv.bulkPut([
      { key: 'loggingOverrides', value: overrides },
      { key: 'settingsUpdatedAt', value: now() }, // overrides sync with settings
    ])
  })
  await recomputePRs([exerciseId])
}

async function withLogging(exercise: Exercise): Promise<Exercise> {
  return { ...exercise, logging: (await loggingOverrides())[exercise.id] ?? exercise.logging ?? 'weight_reps' }
}

export async function loggingOf(exerciseId: string): Promise<LoggingType> {
  return (await loggingOverrides())[exerciseId] ?? (await db.exercises.get(exerciseId))?.logging ?? 'weight_reps'
}

/** Exercises by id, with any "log as" override applied. */
export async function loadExercises(ids: string[]): Promise<Map<string, Exercise>> {
  const overrides = await loggingOverrides()
  const rows = (await db.exercises.bulkGet([...new Set(ids)])).filter((e): e is Exercise => !!e)
  return new Map(rows.map((e) => [e.id, { ...e, logging: overrides[e.id] ?? e.logging ?? 'weight_reps' }]))
}

export async function loadExercise(id: string): Promise<Exercise | null> {
  return (await loadExercises([id])).get(id) ?? null
}

// ---------------------------------------------------------------- History

export async function recentSessions(limit = 20): Promise<WorkoutSession[]> {
  return db.sessions
    .orderBy('startedAt')
    .reverse()
    .filter((s) => alive(s) && !!s.endedAt)
    .limit(limit)
    .toArray()
}

export interface ExerciseHistoryEntry {
  session: WorkoutSession
  sets: SetLog[]
}

export async function exerciseHistory(exerciseId: string): Promise<ExerciseHistoryEntry[]> {
  const sets = await db.setLogs
    .where('[exerciseId+completedAt]')
    .between([exerciseId, 0], [exerciseId, Infinity])
    .filter(alive)
    .toArray()
  const ses = await db.sessionExercises.bulkGet([...new Set(sets.map((s) => s.sessionExerciseId))])
  const sessionIdBySe = new Map(ses.filter(alive).map((se) => [se.id, se.sessionId]))
  const sessions = new Map(
    (await db.sessions.bulkGet([...new Set(sessionIdBySe.values())])).filter(alive).map((s) => [s.id, s]),
  )
  const grouped = new Map<string, SetLog[]>()
  for (const s of sets) {
    const sid = sessionIdBySe.get(s.sessionExerciseId)
    if (sid && sessions.has(sid)) grouped.set(sid, [...(grouped.get(sid) ?? []), s])
  }
  return [...grouped.entries()]
    .map(([sid, ss]) => ({ session: sessions.get(sid)!, sets: ss.sort((a, b) => a.setNumber - b.setNumber) }))
    .sort((a, b) => b.session.startedAt - a.session.startedAt)
}

export async function recentPRSets(limit = 10): Promise<{ set: SetLog; exercise: Exercise }[]> {
  const sets = await db.setLogs
    .filter((s) => alive(s) && !!s.completedAt && !!s.prs?.length)
    .toArray()
  sets.sort((a, b) => b.completedAt! - a.completedAt!)
  const top = sets.slice(0, limit)
  const exercises = await loadExercises(top.map((s) => s.exerciseId))
  return top.filter((s) => exercises.has(s.exerciseId)).map((set) => ({ set, exercise: exercises.get(set.exerciseId)! }))
}

// ---------------------------------------------------------------- Body metrics & trends

export async function addBodyMetric(type: BodyMetricType, value: number, date: string): Promise<string> {
  const id = uuid()
  await db.bodyMetrics.add({ id, type, value, date, source: 'manual', updatedAt: now() })
  return id
}

export async function deleteBodyMetric(id: string) {
  await db.bodyMetrics.update(id, { deletedAt: now(), updatedAt: now() })
}

export async function bodyMetrics(type?: BodyMetricType): Promise<BodyMetric[]> {
  const rows = (await db.bodyMetrics.toArray()).filter((m) => alive(m) && (!type || m.type === type))
  return rows.sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt)
}

/** The headline number per workout: best est. 1RM, most reps (bodyweight) or longest time (timed). */
export function sessionBest(sets: SetLog[], logging: LoggingType): number | null {
  const working = sets.filter((s) => s.completedAt && s.setType !== 'warmup')
  if (working.length === 0) return null
  if (logging === 'time') return Math.max(...working.map((s) => s.durationSec ?? 0))
  if (logging === 'bodyweight') return Math.max(...working.map((s) => s.reps))
  const best = Math.max(...working.map((s) => estimate1RM(s.weightKg, s.reps, s.rpe) ?? 0))
  return best > 0 ? best : null
}

export async function exerciseTrend(exerciseId: string): Promise<Point[]> {
  const logging = await loggingOf(exerciseId)
  const history = await exerciseHistory(exerciseId)
  return history
    .map(({ session, sets }) => ({ x: session.startedAt, y: sessionBest(sets, logging) }))
    .filter((p): p is Point => p.y !== null)
    .sort((a, b) => a.x - b.x)
}

/** Your most-trained weighted lifts recently, with their est. 1RM trend. */
export async function topLifts(limit = 4, sinceDays = 90): Promise<{ exercise: Exercise; trend: Point[] }[]> {
  const since = now() - sinceDays * 86_400_000
  const sets = await db.setLogs.filter((s) => alive(s) && !!s.completedAt && s.completedAt >= since && s.setType !== 'warmup').toArray()
  const sessionsPer = new Map<string, Set<string>>()
  for (const s of sets) sessionsPer.set(s.exerciseId, (sessionsPer.get(s.exerciseId) ?? new Set()).add(s.sessionExerciseId))
  const exercises = await loadExercises([...sessionsPer.keys()])
  const ranked = [...sessionsPer.entries()]
    .filter(([id]) => exercises.get(id)?.logging === 'weight_reps')
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, limit)
  return Promise.all(
    ranked.map(async ([id]) => ({ exercise: exercises.get(id)!, trend: (await exerciseTrend(id)).filter((p) => p.x >= since) })),
  )
}

/** Working sets completed per week, for the last `weeks` weeks. */
export async function weeklySets(weeks = 12): Promise<Point[]> {
  const sets = await db.setLogs.filter((s) => alive(s) && !!s.completedAt && s.setType !== 'warmup').toArray()
  const ses = new Map((await db.sessionExercises.bulkGet([...new Set(sets.map((s) => s.sessionExerciseId))])).filter(alive).map((se) => [se.id, se]))
  const live = new Set((await db.sessions.bulkGet([...new Set([...ses.values()].map((se) => se.sessionId))])).filter(alive).map((s) => s.id))
  const counted = sets.filter((s) => live.has(ses.get(s.sessionExerciseId)?.sessionId ?? ''))
  return weeklyCounts(
    counted.map((s) => s.completedAt!),
    weeks,
  )
}

/** Start times of every finished workout, for the week strip and streak on Today. */
export async function finishedSessionStarts(): Promise<number[]> {
  return (await db.sessions.filter((s) => alive(s) && !!s.endedAt).toArray()).map((s) => s.startedAt)
}

/** Weight moved since `since`, on weight × reps exercises only: bodyweight and timed sets aren't comparable. */
export async function volumeSinceKg(since: number): Promise<number> {
  const sets = await db.setLogs.filter((s) => alive(s) && !!s.completedAt && s.completedAt >= since).toArray()
  const exercises = await loadExercises(sets.map((s) => s.exerciseId))
  return totalVolumeKg(sets.filter((s) => exercises.get(s.exerciseId)?.logging === 'weight_reps'))
}

// ---------------------------------------------------------------- Coach

/** Creates a plan from one Claude proposed (already checked against the library). */
/** Creates a plan from one Claude proposed (already checked against the library); as a goal phase when `phase` is given. */
export async function createPlanFromProposal(
  proposal: ProposedPlan,
  phase?: { goalId: string; startsOn: string; endsOn: string },
): Promise<string> {
  const library = await loadExercises(proposal.days.flatMap((d) => d.exercises.map((e) => e.exerciseId)))
  const planId = uuid()
  const t = now()
  await db.transaction('rw', db.plans, db.planDays, db.planExercises, async () => {
    const hasActive = (await db.plans.toArray()).some((p) => alive(p) && p.isActive)
    await db.plans.add({
      id: planId,
      name: proposal.name,
      goal: proposal.goal || undefined,
      isActive: !phase && !hasActive,
      createdBy: 'ai',
      ...(phase ?? {}),
      updatedAt: t,
    })
    for (const [dayOrder, day] of proposal.days.entries()) {
      const dayId = uuid()
      await db.planDays.add({
        id: dayId,
        planId,
        name: day.name,
        order: dayOrder,
        focusMuscles: day.focusMuscles,
        ...(day.week ? { week: day.week } : {}),
        ...(day.weekdays?.length ? { weekdays: [...new Set(day.weekdays)].sort() } : {}),
        updatedAt: t,
      })
      await db.planExercises.bulkAdd(
        day.exercises
          .filter((e) => library.has(e.exerciseId))
          .map((e, order) => newPlanExercise(dayId, e.exerciseId, order, { sets: e.sets, repMin: e.repMin, repMax: e.repMax, restSec: e.restSec }, t)),
      )
    }
  })
  return planId
}

type Target = { sets: number; repMin: number; repMax: number; restSec: number }

function newPlanExercise(planDayId: string, exerciseId: string, order: number, target: Target, t: number): PlanExercise {
  return {
    id: uuid(),
    planDayId,
    exerciseId,
    order,
    targetSets: target.sets,
    repMin: target.repMin,
    repMax: target.repMax,
    restSec: target.restSec,
    progressionRule: 'double_progression',
    alternates: [],
    updatedAt: t,
  }
}

const targetPatch = (t: Partial<Target>): Partial<PlanExercise> => ({
  ...(t.sets !== undefined && { targetSets: t.sets }),
  ...(t.repMin !== undefined && { repMin: t.repMin }),
  ...(t.repMax !== undefined && { repMax: t.repMax }),
  ...(t.restSec !== undefined && { restSec: t.restSec }),
})

/** Applies changes the user approved, in one transaction. Changes to rows an earlier change removed are skipped. */
export async function applyPlanChanges(planId: string, changes: ResolvedChange[]) {
  await db.transaction('rw', db.plans, db.planDays, db.planExercises, async () => {
    const t = now()
    const dayRows = async (dayId: string) => (await db.planExercises.where('planDayId').equals(dayId).filter(alive).toArray()).sort(byOrder)
    const renumber = async (rows: { id: string; order: number }[]) => {
      for (const [order, row] of rows.entries()) if (row.order !== order) await db.planExercises.update(row.id, { order, updatedAt: t })
    }
    const place = async (dayId: string, row: PlanExercise, position: number | null) => {
      const rows = (await dayRows(dayId)).filter((r) => r.id !== row.id)
      rows.splice(position === null ? rows.length : Math.min(rows.length, position - 1), 0, row)
      await renumber(rows)
    }
    const liveRow = async (id: string) => {
      const row = await db.planExercises.get(id)
      return alive(row) ? row : undefined
    }

    for (const c of changes) {
      switch (c.op) {
        case 'add_exercise': {
          if (!alive(await db.planDays.get(c.dayId))) break
          const row = newPlanExercise(c.dayId, c.exercise.id, Number.MAX_SAFE_INTEGER, c.target, t)
          await db.planExercises.add(row)
          await place(c.dayId, row, c.position)
          break
        }
        case 'remove_exercise': {
          const row = await liveRow(c.planExerciseId)
          if (!row) break
          await db.planExercises.update(row.id, { deletedAt: t, updatedAt: t })
          await renumber(await dayRows(row.planDayId))
          break
        }
        case 'replace_exercise':
          if (await liveRow(c.planExerciseId)) await db.planExercises.update(c.planExerciseId, { exerciseId: c.exercise.id, ...targetPatch(c.target), updatedAt: t })
          break
        case 'update_exercise':
          if (await liveRow(c.planExerciseId)) await db.planExercises.update(c.planExerciseId, { ...targetPatch(c.target), updatedAt: t })
          break
        case 'move_exercise': {
          const row = await liveRow(c.planExerciseId)
          if (row) await place(row.planDayId, row, c.position)
          break
        }
        case 'add_day': {
          const dayId = uuid()
          const order = await db.planDays.where('planId').equals(planId).filter(alive).count()
          const muscles = [...new Set(c.exercises.flatMap((e) => e.exercise.primaryMuscles))]
          await db.planDays.add({
            id: dayId,
            planId,
            name: c.name,
            order,
            focusMuscles: muscles.length ? muscles : inferFocusMuscles(c.name),
            ...(c.week ? { week: c.week } : {}),
            updatedAt: t,
          })
          await db.planExercises.bulkAdd(c.exercises.map((e, i) => newPlanExercise(dayId, e.exercise.id, i, e.target, t)))
          break
        }
        case 'remove_day': {
          if (!alive(await db.planDays.get(c.dayId))) break
          await deleteDayRows(c.dayId, t)
          const days = (await db.planDays.where('planId').equals(planId).filter(alive).toArray()).sort(byOrder)
          for (const [order, day] of days.entries()) if (day.order !== order) await db.planDays.update(day.id, { order, updatedAt: t })
          break
        }
        case 'rename_day':
          if (alive(await db.planDays.get(c.dayId))) await db.planDays.update(c.dayId, { name: c.name, updatedAt: t })
          break
        case 'set_day_week':
          if (alive(await db.planDays.get(c.dayId))) await db.planDays.update(c.dayId, { week: c.week ?? undefined, updatedAt: t })
          break
        case 'rename_plan':
          await db.plans.update(planId, { name: c.name, updatedAt: t })
          break
      }
    }
  })
}

/** What the coach should know about your recent training: how often, your best sets, bodyweight, other plans. */
export async function coachTrainingSummary(excludePlanId?: string, weeks = 6): Promise<TrainingSummary> {
  const since = now() - weeks * 7 * 86_400_000
  const sessions = (await db.sessions.toArray()).filter((s) => alive(s) && !!s.endedAt && s.startedAt >= since)
  const ses = (await db.sessionExercises.where('sessionId').anyOf(sessions.map((s) => s.id)).toArray()).filter(alive)
  const sets = (await db.setLogs.where('sessionExerciseId').anyOf(ses.map((s) => s.id)).toArray()).filter(
    (s) => alive(s) && !!s.completedAt && s.setType !== 'warmup',
  )
  const exercises = await loadExercises(sets.map((s) => s.exerciseId))

  const byExercise = new Map<string, SetLog[]>()
  for (const s of sets) byExercise.set(s.exerciseId, [...(byExercise.get(s.exerciseId) ?? []), s])
  const score = (s: SetLog, logging: LoggingType) =>
    logging === 'time' ? (s.durationSec ?? 0) : logging === 'bodyweight' ? s.reps : (estimate1RM(s.weightKg, s.reps, s.rpe) ?? s.weightKg)
  const lifts = [...byExercise.entries()]
    .filter(([id]) => exercises.has(id))
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 15)
    .map(([id, list]) => {
      const exercise = exercises.get(id)!
      const best = list.reduce((a, b) => (score(b, exercise.logging) > score(a, exercise.logging) ? b : a))
      return {
        exercise,
        weightKg: best.weightKg,
        reps: best.reps,
        durationSec: best.durationSec,
        e1rmKg: exercise.logging === 'weight_reps' ? estimate1RM(best.weightKg, best.reps, best.rpe) : null,
        date: toDateKey(best.completedAt!),
      }
    })

  const weight = (await bodyMetrics('bodyweight'))[0]
  const otherPlans = (await db.plans.toArray()).filter((p) => alive(p) && p.id !== excludePlanId).map((p) => p.name)
  return { workouts: sessions.length, weeks, bodyweightKg: weight && { value: weight.value, date: weight.date }, lifts, otherPlans }
}

// ---------------------------------------------------------------- Weekly review

/** Last Monday–Sunday, reviewed against the plan (see lib/review.ts). Reads only; nothing leaves the phone. */
export async function lastWeekReview(today: string = toDateKey(now())): Promise<WeeklyReview> {
  const sessions = (await db.sessions.toArray()).filter((s) => alive(s) && !!s.endedAt)
  const live = new Map(sessions.map((s) => [s.id, s]))
  const ses = new Map((await db.sessionExercises.toArray()).filter((se) => alive(se) && live.has(se.sessionId)).map((se) => [se.id, se.sessionId]))
  const sets = (await db.setLogs.toArray()).filter((s) => alive(s) && !!s.completedAt && s.setType !== 'warmup' && ses.has(s.sessionExerciseId))
  const bySession = new Map<string, SetLog[]>()
  for (const s of sets) {
    const id = ses.get(s.sessionExerciseId)!
    bySession.set(id, [...(bySession.get(id) ?? []), s])
  }
  const planExercises = (await db.planExercises.toArray()).filter(alive)
  return weeklyReview({
    today,
    plans: await plansWithDays(),
    planExercises,
    daysOff: await daysOff(),
    workouts: sessions.map((session) => ({ session, sets: bySession.get(session.id) ?? [] })),
    exercises: await loadExercises([...sets.map((s) => s.exerciseId), ...planExercises.map((pe) => pe.exerciseId)]),
    units: await currentUnits(),
  })
}

// ---------------------------------------------------------------- Calendar

/** Every plan with its days in order: what the calendar works from. */
export async function plansWithDays(): Promise<PlanWithDays[]> {
  const plans = (await db.plans.toArray()).filter(alive)
  const days = (await db.planDays.toArray()).filter(alive)
  return plans.map((plan) => ({ plan, days: sortDays(days.filter((d) => d.planId === plan.id)) }))
}

/** Days off by date, with their notes. */
export async function daysOff(): Promise<Map<string, string | undefined>> {
  return new Map((await db.daysOff.toArray()).filter(alive).map((d) => [d.date, d.note]))
}

/** Marks a date as a day off, or clears it. */
export async function setDayOff(date: string, off: boolean, note?: string) {
  await db.transaction('rw', db.daysOff, async () => {
    const existing = (await db.daysOff.where('date').equals(date).toArray()).filter(alive)
    const t = now()
    if (!off) return Promise.all(existing.map((d) => db.daysOff.update(d.id, { deletedAt: t, updatedAt: t })))
    if (existing[0]) return db.daysOff.update(existing[0].id, { note: note?.trim() || undefined, updatedAt: t })
    return db.daysOff.add({ id: uuid(), date, note: note?.trim() || undefined, updatedAt: t })
  })
}

/**
 * Puts a plan day on a weekday (or clears that weekday when dayId is null). A weekday holds one day per
 * week group, so whatever was on it in that week (A, B, or every week) comes off.
 */
export async function assignWeekday(planId: string, weekday: number, dayId: string | null, week?: 1 | 2) {
  await db.transaction('rw', db.planDays, async () => {
    const t = now()
    const days = (await db.planDays.where('planId').equals(planId).toArray()).filter(alive)
    for (const d of days) {
      if ((d.week ?? undefined) !== week) continue
      const has = d.weekdays?.includes(weekday) ?? false
      const wants = d.id === dayId
      if (has === wants) continue
      const weekdays = wants ? [...(d.weekdays ?? []), weekday].sort() : (d.weekdays ?? []).filter((w) => w !== weekday)
      await db.planDays.update(d.id, { weekdays, updatedAt: t })
    }
  })
}

/** Finished workouts by local date, for marking the calendar. */
export async function workoutsByDate(): Promise<Map<string, WorkoutSession[]>> {
  const out = new Map<string, WorkoutSession[]>()
  for (const s of (await db.sessions.toArray()).filter((s) => alive(s) && !!s.endedAt)) {
    const key = toDateKey(s.startedAt)
    out.set(key, [...(out.get(key) ?? []), s])
  }
  return out
}

// ---------------------------------------------------------------- Goals

export async function activeGoal(): Promise<Goal | null> {
  return (await db.goals.toArray()).find((g) => alive(g) && g.isActive) ?? null
}

export type GoalFields = Pick<Goal, 'name' | 'description' | 'targetDate' | 'targets' | 'calories' | 'proteinG' | 'nutritionNote'>

/** Creates a goal (it becomes the active one) or updates one. */
export async function saveGoal(fields: GoalFields, id?: string): Promise<string> {
  const t = now()
  const goalId = id ?? uuid()
  await db.transaction('rw', db.goals, async () => {
    if (id) return db.goals.update(id, { ...fields, updatedAt: t })
    for (const g of (await db.goals.toArray()).filter((g) => alive(g) && g.isActive)) await db.goals.update(g.id, { isActive: false, updatedAt: t })
    await db.goals.add({ id: goalId, ...fields, startsOn: toDateKey(t), isActive: true, updatedAt: t })
  })
  return goalId
}

/** Deletes a goal. Its phase plans are kept as ordinary plans (no longer tied to dates). */
export async function deleteGoal(id: string) {
  await db.transaction('rw', db.goals, db.plans, async () => {
    const t = now()
    await db.goals.update(id, { deletedAt: t, isActive: false, updatedAt: t })
    for (const p of (await db.plans.toArray()).filter((p) => alive(p) && p.goalId === id))
      await db.plans.update(p.id, { goalId: undefined, startsOn: undefined, endsOn: undefined, updatedAt: t })
  })
}

/** A goal's phases, in date order. */
export async function goalPhases(goalId: string): Promise<Plan[]> {
  return (await db.plans.toArray()).filter((p) => alive(p) && p.goalId === goalId).sort((a, b) => (a.startsOn ?? '').localeCompare(b.startsOn ?? ''))
}

/** What goal progress is measured from: body metrics and, for lift targets, best est. 1RM per workout. */
export async function goalData(goal: Goal): Promise<GoalData> {
  const metrics = (await db.bodyMetrics.toArray()).filter(alive)
  const lifts = new Map<string, { date: string; e1rm: number }[]>()
  const ids = goal.targets.flatMap((t) => (t.kind === 'lift' ? [t.exerciseId] : []))
  for (const id of ids) lifts.set(id, (await exerciseTrend(id)).map((p) => ({ date: toDateKey(p.x), e1rm: p.y })))
  const names = new Map([...(await loadExercises(ids)).values()].map((e) => [e.id, e.name]))
  return { metrics, lifts, names }
}

/**
 * Makes the goal phase covering today the active plan, so Today, workouts and the coach all use it.
 * Runs when Today opens; does nothing when there's no phase today or it's already active.
 */
export async function syncActivePhase(today: string = toDateKey(now())) {
  const goal = await activeGoal()
  if (!goal) return
  const phase = (await goalPhases(goal.id)).find((p) => p.startsOn! <= today && today <= p.endsOn!)
  if (phase && !phase.isActive) await setActivePlan(phase.id)
}

/**
 * Replaces a goal's phases with the ones Claude proposed (already checked), and saves its nutrition targets.
 * Old phases are deleted (soft), like any plan.
 */
export async function applyGoalPlan(
  goalId: string,
  phases: { plan: ProposedPlan; startsOn: string; endsOn: string }[],
  nutrition: Pick<Goal, 'calories' | 'proteinG' | 'nutritionNote'> | null,
): Promise<string[]> {
  for (const old of await goalPhases(goalId)) await deletePlan(old.id)
  const ids: string[] = []
  for (const p of phases) ids.push(await createPlanFromProposal(p.plan, { goalId, startsOn: p.startsOn, endsOn: p.endsOn }))
  if (nutrition) await db.goals.update(goalId, { ...nutrition, updatedAt: now() })
  await syncActivePhase()
  return ids
}
