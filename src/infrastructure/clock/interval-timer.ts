import type { Timer } from '@/application/ports'

export function createIntervalTimer(): Timer {
  return {
    every(intervalMs, tick) {
      const id = setInterval(tick, intervalMs)
      return () => clearInterval(id)
    },
  }
}
