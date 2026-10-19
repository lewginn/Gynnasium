import type { Muscle } from './types'

export interface TemplateExercise {
  id: string
  sets: number
  reps: [number, number]
}

export interface TemplateDay {
  name: string
  focus: Muscle[]
  exercises: TemplateExercise[]
}

export interface PlanTemplate {
  key: string
  name: string
  description: string
  days: TemplateDay[]
}

const ex = (id: string, sets: number, min: number, max: number): TemplateExercise => ({ id, sets, reps: [min, max] })

export const PLAN_TEMPLATES: PlanTemplate[] = [
  {
    key: 'ppl',
    name: 'Push / Pull / Legs',
    description: '3 days, or 6 if you run it twice a week. Good for building muscle.',
    days: [
      {
        name: 'Push',
        focus: ['chest', 'shoulders', 'triceps'],
        exercises: [
          ex('Barbell_Bench_Press_-_Medium_Grip', 4, 5, 8),
          ex('Incline_Dumbbell_Press', 3, 8, 12),
          ex('Dumbbell_Shoulder_Press', 3, 8, 12),
          ex('Side_Lateral_Raise', 3, 12, 15),
          ex('Triceps_Pushdown_-_Rope_Attachment', 3, 10, 15),
        ],
      },
      {
        name: 'Pull',
        focus: ['lats', 'upper_back', 'biceps'],
        exercises: [
          ex('Pullups', 4, 5, 10),
          ex('Bent_Over_Barbell_Row', 3, 6, 10),
          ex('Seated_Cable_Rows', 3, 8, 12),
          ex('Face_Pull', 3, 12, 15),
          ex('Hammer_Curls', 3, 10, 12),
        ],
      },
      {
        name: 'Legs',
        focus: ['quads', 'hamstrings', 'glutes', 'calves'],
        exercises: [
          ex('Barbell_Squat', 4, 5, 8),
          ex('Romanian_Deadlift', 3, 6, 10),
          ex('Leg_Press', 3, 10, 12),
          ex('Lying_Leg_Curls', 3, 10, 15),
          ex('Standing_Calf_Raises', 4, 10, 15),
        ],
      },
    ],
  },
  {
    key: 'upper-lower',
    name: 'Upper / Lower',
    description: '4 days a week. Balanced strength and size.',
    days: [
      {
        name: 'Upper A',
        focus: ['chest', 'lats', 'upper_back', 'shoulders', 'biceps', 'triceps'],
        exercises: [
          ex('Barbell_Bench_Press_-_Medium_Grip', 4, 5, 8),
          ex('Bent_Over_Barbell_Row', 4, 6, 10),
          ex('Dumbbell_Shoulder_Press', 3, 8, 12),
          ex('Wide-Grip_Lat_Pulldown', 3, 8, 12),
          ex('Barbell_Curl', 2, 10, 12),
          ex('Triceps_Pushdown', 2, 10, 12),
        ],
      },
      {
        name: 'Lower A',
        focus: ['quads', 'hamstrings', 'glutes', 'calves'],
        exercises: [
          ex('Barbell_Squat', 4, 5, 8),
          ex('Romanian_Deadlift', 3, 6, 10),
          ex('Split_Squat_with_Dumbbells', 3, 8, 12),
          ex('Seated_Leg_Curl', 3, 10, 15),
          ex('Standing_Calf_Raises', 3, 10, 15),
        ],
      },
      {
        name: 'Upper B',
        focus: ['chest', 'lats', 'upper_back', 'shoulders', 'biceps', 'triceps'],
        exercises: [
          ex('Pullups', 4, 5, 10),
          ex('Incline_Dumbbell_Press', 4, 8, 12),
          ex('Seated_Cable_Rows', 3, 8, 12),
          ex('Side_Lateral_Raise', 3, 12, 15),
          ex('Hammer_Curls', 2, 10, 12),
          ex('Cable_Rope_Overhead_Triceps_Extension', 2, 10, 12),
        ],
      },
      {
        name: 'Lower B',
        focus: ['quads', 'hamstrings', 'glutes', 'calves'],
        exercises: [
          ex('Barbell_Deadlift', 3, 3, 6),
          ex('Leg_Press', 3, 10, 12),
          ex('Barbell_Hip_Thrust', 3, 8, 12),
          ex('Leg_Extensions', 3, 12, 15),
          ex('Seated_Calf_Raise', 3, 12, 15),
        ],
      },
    ],
  },
  {
    key: 'full-body',
    name: 'Full Body ×3',
    description: '3 days a week. Simple and great if you\'re short on time.',
    days: [
      {
        name: 'Full Body A',
        focus: ['chest', 'lats', 'quads', 'hamstrings'],
        exercises: [
          ex('Barbell_Squat', 3, 5, 8),
          ex('Barbell_Bench_Press_-_Medium_Grip', 3, 5, 8),
          ex('Bent_Over_Barbell_Row', 3, 6, 10),
          ex('Lying_Leg_Curls', 2, 10, 15),
          ex('Cable_Crunch', 3, 10, 15),
        ],
      },
      {
        name: 'Full Body B',
        focus: ['shoulders', 'lats', 'hamstrings', 'glutes'],
        exercises: [
          ex('Barbell_Deadlift', 3, 3, 6),
          ex('Standing_Military_Press', 3, 5, 8),
          ex('Pullups', 3, 5, 10),
          ex('Split_Squat_with_Dumbbells', 2, 8, 12),
          ex('Hanging_Leg_Raise', 3, 8, 15),
        ],
      },
      {
        name: 'Full Body C',
        focus: ['chest', 'upper_back', 'quads', 'glutes'],
        exercises: [
          ex('Leg_Press', 3, 8, 12),
          ex('Incline_Dumbbell_Press', 3, 8, 12),
          ex('Seated_Cable_Rows', 3, 8, 12),
          ex('Barbell_Hip_Thrust', 3, 8, 12),
          ex('Side_Lateral_Raise', 2, 12, 15),
        ],
      },
    ],
  },
]
