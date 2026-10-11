export const EXERCISES = ['read', 'write'] as const

export type Exercise = (typeof EXERCISES)[number]

export const isExercise = (value: string): value is Exercise =>
  (EXERCISES as readonly string[]).includes(value)
