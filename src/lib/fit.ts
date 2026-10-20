import { Encoder, Profile, type ActivityMesg, type EventMesg, type FileIdMesg, type LapMesg, type SessionMesg, type SetMesg } from '@garmin/fitsdk'
import type { Exercise, SetLog, Units, WorkoutSession } from './types'

// Exports a finished workout as a FIT activity file (Garmin's format): a strength-training session with one
// "set" record per set (reps, weight, exercise category) and rest in between, which Garmin Connect imports.
// The app only knows when each set was ticked, so a set is assumed to take a few seconds a rep (or its own
// duration when timed) and to end when it was ticked; the gaps between sets are rest.

export interface FitExercise {
  exercise: Pick<Exercise, 'name' | 'logging' | 'movementPattern'>
  sets: SetLog[]
}

type Category = NonNullable<SetMesg['category']>[number]

/** Garmin's exercise categories (FIT profile names), matched on the exercise name, then its movement pattern. */
const BY_NAME: [RegExp, Category][] = [
  [/leg curl|hamstring curl/i, 'legCurl'],
  [/calf/i, 'calfRaise'],
  [/bench press|chest press|floor press/i, 'benchPress'],
  [/push-?ups?|press-?ups?/i, 'pushUp'],
  [/pull-?ups?|chin-?ups?|pulldown/i, 'pullUp'],
  [/deadlift|rack pull|good morning/i, 'deadlift'],
  [/lunge|split squat|step-?up/i, 'lunge'],
  [/squat|leg press|hack/i, 'squat'],
  [/hip thrust|glute bridge|hip raise/i, 'hipRaise'],
  [/clean|snatch|jerk/i, 'olympicLift'],
  [/fl(y|ye|yes)\b|butterfly|pec deck/i, 'flye'],
  [/lateral raise|side raise|front raise|rear delt/i, 'lateralRaise'],
  [/shrug/i, 'shrug'],
  [/triceps|pushdown|skull ?crusher|dips?\b|kickback/i, 'tricepsExtension'],
  [/curl/i, 'curl'],
  [/row/i, 'row'],
  [/shoulder press|overhead press|military|arnold|push press/i, 'shoulderPress'],
  [/plank/i, 'plank'],
  [/crunch/i, 'crunch'],
  [/sit-?up/i, 'sitUp'],
  [/leg raise|knee raise/i, 'legRaise'],
  [/hyperextension|back extension/i, 'hyperextension'],
  [/carry|farmer/i, 'carry'],
  [/chop|woodchop/i, 'chop'],
]

const BY_PATTERN: Partial<Record<Exercise['movementPattern'], Category>> = {
  horizontal_push: 'benchPress',
  vertical_push: 'shoulderPress',
  horizontal_pull: 'row',
  vertical_pull: 'pullUp',
  squat: 'squat',
  hinge: 'deadlift',
  lunge: 'lunge',
  carry: 'carry',
}

export function garminCategory(exercise: Pick<Exercise, 'name' | 'movementPattern'>): Category {
  return BY_NAME.find(([re]) => re.test(exercise.name))?.[1] ?? BY_PATTERN[exercise.movementPattern] ?? 'unknown'
}

export interface TimelineStep {
  kind: 'active' | 'rest'
  start: number
  end: number
  set?: SetLog
  exercise?: FitExercise['exercise']
}

/** 1989-12-31T00:00:00Z, where FIT time starts. */
const FIT_EPOCH_SEC = 631065600
const SECONDS_PER_REP = 4
const MIN_SET_SEC = 15
const MAX_SET_SEC = 120

/** Active sets in the order they were done, with rest between, inside the workout's start and end. */
export function timeline(session: Pick<WorkoutSession, 'startedAt' | 'endedAt'>, exercises: FitExercise[]): TimelineStep[] {
  const done = exercises
    .flatMap(({ exercise, sets }) => sets.filter((s) => s.completedAt && !s.deletedAt).map((set) => ({ exercise, set })))
    .sort((a, b) => a.set.completedAt! - b.set.completedAt!)
  const steps: TimelineStep[] = []
  let cursor = session.startedAt
  for (const { exercise, set } of done) {
    const seconds =
      exercise.logging === 'time' ? (set.durationSec ?? 30) : Math.min(MAX_SET_SEC, Math.max(MIN_SET_SEC, set.reps * SECONDS_PER_REP))
    // Edited workouts can have sets ticked out of order or after the end: keep the timeline moving forward.
    const end = Math.max(set.completedAt!, cursor + 1000)
    const start = Math.max(cursor, end - seconds * 1000)
    if (start > cursor) steps.push({ kind: 'rest', start: cursor, end: start })
    steps.push({ kind: 'active', start, end, set, exercise })
    cursor = end
  }
  return steps
}

/** The FIT file for a finished workout. */
export function encodeWorkout(session: WorkoutSession, exercises: FitExercise[], units: Units): Uint8Array {
  const steps = timeline(session, exercises)
  const start = new Date(session.startedAt)
  const endMs = Math.max(session.endedAt ?? session.startedAt, steps.at(-1)?.end ?? session.startedAt)
  const end = new Date(endMs)
  const elapsedSec = (endMs - session.startedAt) / 1000
  const encoder = new Encoder()

  const fileId: FileIdMesg = {
    type: 'activity',
    manufacturer: 'development',
    product: 1,
    productName: 'Gynnasium',
    timeCreated: start,
    serialNumber: 1,
  }
  encoder.onMesg(Profile.MesgNum.FILE_ID, fileId)
  const startEvent: EventMesg = { timestamp: start, event: 'timer', eventType: 'start' }
  encoder.onMesg(Profile.MesgNum.EVENT, startEvent)

  steps.forEach((step, messageIndex) => {
    const set = step.set
    const timed = step.exercise?.logging === 'time'
    const mesg: SetMesg = {
      timestamp: new Date(step.end),
      startTime: new Date(step.start),
      duration: (step.end - step.start) / 1000,
      setType: step.kind,
      messageIndex,
      ...(set && step.exercise
        ? {
            category: [garminCategory(step.exercise)],
            ...(timed ? {} : { repetitions: set.reps }),
            // Garmin has no negative weight: assisted sets go in without one.
            ...(set.weightKg > 0 ? { weight: set.weightKg, weightDisplayUnit: units === 'kg' ? 'kilogram' : 'pound' } : {}),
          }
        : {}),
    }
    encoder.onMesg(Profile.MesgNum.SET, mesg)
  })

  const stopEvent: EventMesg = { timestamp: end, event: 'timer', eventType: 'stopAll' }
  encoder.onMesg(Profile.MesgNum.EVENT, stopEvent)
  const summary: LapMesg & SessionMesg = {
    timestamp: end,
    startTime: start,
    totalElapsedTime: elapsedSec,
    totalTimerTime: elapsedSec,
    sport: 'training',
    subSport: 'strengthTraining',
  }
  const lap: LapMesg = { ...summary, messageIndex: 0, event: 'lap', eventType: 'stop' }
  encoder.onMesg(Profile.MesgNum.LAP, lap)
  const fitSession: SessionMesg = { ...summary, messageIndex: 0, event: 'session', eventType: 'stop', firstLapIndex: 0, numLaps: 1 }
  encoder.onMesg(Profile.MesgNum.SESSION, fitSession)
  const activity: ActivityMesg = {
    timestamp: end,
    totalTimerTime: elapsedSec,
    numSessions: 1,
    type: 'manual',
    event: 'activity',
    eventType: 'stop',
    // Local time as a raw FIT timestamp: seconds since 1989-12-31, shifted by the phone's time zone.
    localTimestamp: Math.round((endMs - end.getTimezoneOffset() * 60_000) / 1000) - FIT_EPOCH_SEC,
  }
  encoder.onMesg(Profile.MesgNum.ACTIVITY, activity)
  return encoder.close()
}

/** "2026-10-19-push.fit" */
export function fitFileName(session: Pick<WorkoutSession, 'startedAt' | 'name'>): string {
  const d = new Date(session.startedAt)
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const slug = session.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'workout'
  return `${date}-${slug}.fit`
}
