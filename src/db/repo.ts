import { detectPRs } from '../lib/prs'
import { inferFocusMuscles } from '../lib/suggest'
import { totalVolumeKg } from '../lib/summary'
import type { PlanTemplate } from '../lib/templates'
import type {
  Exercise,
  LoggingType,
  Plan,
  PlanDay,
  PlanExercise,
  SessionExercise,
  SetLog,
  Synced,
  WorkoutSession,
} from '../lib/types'
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

export async function addPlanDay(planId: string, name: string): Promise<string> {
  const id = uuid()
  const order = (await db.planDays.where('planId').equals(planId).filter(alive).count())
  await db.planDays.add({ id, planId, name, order, focusMuscles: inferFocusMuscles(name), updatedAt: now() })
  return id
}

export async function updatePlanDay(id: string, patch: Partial<Pick<PlanDay, 'name' | 'focusMuscles'>>) {
  await db.planDays.update(id, { ...patch, updatedAt: now() })
}

export async function deletePlanDay(id: string) {
  await db.transaction('rw', db.planDays, db.planExercises, () => deleteDayRows(id, now()))
}

/** Default target: reps for most exercises, seconds for timed ones. */
export function defaultRepRange(exercise: Pick<Exercise, 'mechanic' | 'logging'>): [number, number] {
  if (exercise.logging === 'time') return [30, 60]
  return exercise.mechanic === 'compound' ? [6, 10] : [10, 15]
}

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
  patch: Partial<Pick<PlanExercise, 'targetSets' | 'repMin' | 'repMax' | 'restSec' | 'exerciseId'>>,
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
  const days = (await db.planDays.where('planId').equals(planId).filter(alive).toArray()).sort(byOrder)
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

/** Planned (not yet completed) set rows, pre-filled from last time so logging is usually one tap. */
async function planSets(
  sessionExerciseId: string,
  exercise: Pick<Exercise, 'id' | 'logging'>,
  count: number,
  /** Reps, or seconds for timed exercises, when there's no history to copy. */
  target: number,
  sessionId: string,
): Promise<SetLog[]> {
  const last = await lastPerformance(exercise.id, sessionId)
  const timed = exercise.logging === 'time'
  return Array.from({ length: count }, (_, i) => {
    const ref = last[Math.min(i, last.length - 1)]
    return {
      id: uuid(),
      sessionExerciseId,
      exerciseId: exercise.id,
      setNumber: i + 1,
      setType: 'working' as const,
      weightKg: ref?.weightKg ?? 0,
      reps: timed ? 0 : (ref?.reps ?? target),
      ...(timed ? { durationSec: ref?.durationSec ?? target } : {}),
      updatedAt: now(),
    }
  })
}

/** What to pre-fill when there's no history: the top of the rep range, or the bottom of a time range. */
const planTarget = (exercise: Exercise, pe: Pick<PlanExercise, 'repMin' | 'repMax'>) =>
  exercise.logging === 'time' ? pe.repMin : pe.repMax

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
    sets.push(...(await planSets(se.id, exercise, pe.targetSets, planTarget(exercise, pe), sessionId)))
  }

  await db.transaction('rw', db.sessions, db.sessionExercises, db.setLogs, async () => {
    await db.sessions.add({ id: sessionId, planDayId: day?.id, name: day?.name ?? 'Workout', startedAt: now(), updatedAt: now() })
    await db.sessionExercises.bulkAdd(sessionExercises)
    await db.setLogs.bulkAdd(sets)
  })
  return sessionId
}

export async function addSessionExercise(sessionId: string, exercise: Exercise): Promise<string> {
  const id = uuid()
  const ex = await withLogging(exercise)
  const order = await db.sessionExercises.where('sessionId').equals(sessionId).filter(alive).count()
  const [repMin, repMax] = defaultRepRange(ex)
  const sets = await planSets(id, ex, 3, planTarget(ex, { repMin, repMax }), sessionId)
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
  const [repMin, repMax] = defaultRepRange(ex)
  const refill = await planSets(se.id, ex, pending.length, planTarget(ex, { repMin, repMax }), se.sessionId)
  await db.transaction('rw', db.sessionExercises, db.setLogs, async () => {
    await db.sessionExercises.update(se.id, {
      exerciseId: newExercise.id,
      swappedFromExerciseId: se.swappedFromExerciseId ?? se.exerciseId,
      updatedAt: now(),
    })
    // Completed sets keep their original exercise; they really were done on it.
    await db.setLogs.bulkDelete(pending.map((s) => s.id))
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
    await db.setLogs.bulkDelete(pending.map((s) => s.id))
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
    await db.kv.put({ key: 'loggingOverrides', value: overrides })
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
