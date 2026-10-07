import type { Letter } from '@/domain/pitch'
import type { Scheduler } from '@/application/ports'
import type { Trainer, TrainerState } from '@/application/trainer'

export const AUTO_ADVANCE_DELAY_MS = 1500

export interface AutoAdvance {
  readonly state: TrainerState
  readonly enabled: boolean
  setEnabled(on: boolean): void
  select(letter: Letter): void
  check(): void
  next(): void
  cancel(): void
}

export interface AutoAdvanceActions {
  // The owner (trainer or session) decides what "next" means.
  next(): void
  // Called when the timer, not the user, moved on.
  onAdvance(): void
}

// The trainer knows nothing about the timer, and auto-advance nothing about what "next" does.
export function createAutoAdvance(
  trainer: Trainer,
  scheduler: Scheduler,
  actions: AutoAdvanceActions,
): AutoAdvance {
  let enabled = false
  let cancelPending: (() => void) | null = null

  const cancel = () => {
    cancelPending?.()
    cancelPending = null
  }

  const advance = () => {
    cancelPending = null
    actions.next()
    actions.onAdvance()
  }

  return {
    get state() {
      return trainer.state
    },

    get enabled() {
      return enabled
    },

    setEnabled(on) {
      enabled = on
      if (!on) cancel()
    },

    select(letter) {
      trainer.select(letter)
    },

    check() {
      const hadResult = trainer.state.grade !== null
      trainer.check()
      if (enabled && !hadResult && trainer.state.grade !== null) {
        cancelPending = scheduler.schedule(AUTO_ADVANCE_DELAY_MS, advance)
      }
    },

    next() {
      if (trainer.state.grade === null) return
      cancel()
      actions.next()
    },

    cancel,
  }
}
