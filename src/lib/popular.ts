/**
 * Well-known gym staples, roughly most common first. The library has ~700 exercises, many obscure
 * (chains, bands, strongman), so suggestions and search rank these first.
 */
export const POPULAR_EXERCISE_IDS = [
  // Chest
  'Barbell_Bench_Press_-_Medium_Grip',
  'Dumbbell_Bench_Press',
  'Incline_Dumbbell_Press',
  'Barbell_Incline_Bench_Press_-_Medium_Grip',
  'Leverage_Chest_Press',
  'Machine_Bench_Press',
  'Dumbbell_Flyes',
  'Butterfly',
  'Incline_Cable_Flye',
  'Flat_Bench_Cable_Flyes',
  'Dips_-_Chest_Version',
  'Pushups',
  // Back
  'Pullups',
  'Chin-Up',
  'Wide-Grip_Lat_Pulldown',
  'Close-Grip_Front_Lat_Pulldown',
  'V-Bar_Pulldown',
  'Bent_Over_Barbell_Row',
  'Seated_Cable_Rows',
  'One-Arm_Dumbbell_Row',
  'T-Bar_Row_with_Handle',
  'Leverage_High_Row',
  'Leverage_Iso_Row',
  'Straight-Arm_Pulldown',
  'Barbell_Deadlift',
  'Inverted_Row',
  // Shoulders
  'Standing_Military_Press',
  'Dumbbell_Shoulder_Press',
  'Leverage_Shoulder_Press',
  'Machine_Shoulder_Military_Press',
  'Side_Lateral_Raise',
  'Cable_Seated_Lateral_Raise',
  'Face_Pull',
  'Reverse_Machine_Flyes',
  'Cable_Rear_Delt_Fly',
  'Seated_Bent-Over_Rear_Delt_Raise',
  'Barbell_Shrug',
  'Dumbbell_Shrug',
  // Arms
  'Barbell_Curl',
  'Dumbbell_Bicep_Curl',
  'Hammer_Curls',
  'Preacher_Curl',
  'Cable_Hammer_Curls_-_Rope_Attachment',
  'Incline_Hammer_Curls',
  'Triceps_Pushdown',
  'Triceps_Pushdown_-_Rope_Attachment',
  'Cable_Rope_Overhead_Triceps_Extension',
  'EZ-Bar_Skullcrusher',
  'Close-Grip_Barbell_Bench_Press',
  'Dips_-_Triceps_Version',
  // Legs
  'Barbell_Squat',
  'Front_Squat_Clean_Grip',
  'Leg_Press',
  'Barbell_Hack_Squat',
  'Goblet_Squat',
  'Romanian_Deadlift',
  'Barbell_Hip_Thrust',
  'Split_Squat_with_Dumbbells',
  'Dumbbell_Lunges',
  'Barbell_Walking_Lunge',
  'Leg_Extensions',
  'Lying_Leg_Curls',
  'Seated_Leg_Curl',
  'Glute_Ham_Raise',
  'Standing_Calf_Raises',
  'Seated_Calf_Raise',
  'Sumo_Deadlift',
  // Core
  'Plank',
  'Hanging_Leg_Raise',
  'Cable_Crunch',
  'Ab_Roller',
  'Crunches',
]

const RANK = new Map(POPULAR_EXERCISE_IDS.map((id, i) => [id, i]))

/** 0 for the most popular, increasing; Infinity if not in the list. */
export function popularityRank(id: string): number {
  return RANK.get(id) ?? Infinity
}
