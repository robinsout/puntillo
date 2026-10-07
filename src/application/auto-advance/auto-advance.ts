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
}

export interface AutoAdvanceActions {
  // Что значит «дальше» после результата: решает владелец (тренажёр, сессия).
  next(): void
  // Уведомление о том, что «дальше» случилось само, по таймеру.
  onAdvance(): void
}

// Обёртка над тренажёром: после появления результата при включённой галке
// планирует действие «дальше». Тренажёр о таймере не знает, автопереход —
// о том, что именно происходит «дальше».
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
  }
}
