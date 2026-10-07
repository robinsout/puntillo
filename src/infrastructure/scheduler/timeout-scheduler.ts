import type { Scheduler } from '@/application/ports'

export function createTimeoutScheduler(): Scheduler {
  return {
    schedule(ms, task) {
      const id = setTimeout(task, ms)
      return () => clearTimeout(id)
    },
  }
}
