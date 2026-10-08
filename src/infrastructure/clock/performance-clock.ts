import type { Clock } from '@/application/ports'

export function createPerformanceClock(): Clock {
  return { now: () => performance.now() }
}
