import type { Duration } from '@/domain/question'

export const DURATION_FRACTIONS: Record<Duration['value'], string> = {
  whole: '1/1',
  half: '1/2',
  quarter: '1/4',
  eighth: '1/8',
  sixteenth: '1/16',
}
