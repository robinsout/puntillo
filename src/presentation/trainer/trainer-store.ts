import { inject, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import { createTrainer } from '@/application/trainer'
import { createQuestionGenerator } from '@/application/question-generation'
import { createAutoAdvance } from '@/application/auto-advance'
import type { Letter } from '@/domain/pitch'
import { randomKey } from './random-key'
import { schedulerKey } from './scheduler-key'

// Тонкая обёртка над автоматом тренажёра: правила живут в слое приложения,
// стор только делает его неизменяемый снимок реактивным.
export const useTrainerStore = defineStore('trainer', () => {
  const random = inject(randomKey)
  if (!random) throw new Error('Random source is not provided: provide it with randomKey')
  const scheduler = inject(schedulerKey)
  if (!scheduler) throw new Error('Scheduler is not provided: provide it with schedulerKey')

  // Счётчик автопереходов: экран следит за ним, чтобы перенести фокус.
  const autoAdvances = ref(0)
  const trainer = createAutoAdvance(
    createTrainer(createQuestionGenerator(random)),
    scheduler,
    () => {
      sync()
      autoAdvances.value++
    },
  )
  const state = shallowRef(trainer.state)
  const autoNext = ref(trainer.enabled)
  const sync = () => {
    state.value = trainer.state
  }

  function setAutoNext(on: boolean) {
    trainer.setEnabled(on)
    autoNext.value = trainer.enabled
  }

  function select(letter: Letter) {
    trainer.select(letter)
    sync()
  }

  function check() {
    trainer.check()
    sync()
  }

  function next() {
    trainer.next()
    sync()
  }

  return { state, autoNext, autoAdvances, setAutoNext, select, check, next }
})
