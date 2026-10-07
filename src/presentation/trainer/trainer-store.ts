import { inject, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import { createTrainer } from '@/application/trainer'
import { createQuestionGenerator } from '@/application/question-generation'
import type { Letter } from '@/domain/pitch'
import { randomKey } from './random-key'

// Тонкая обёртка над автоматом тренажёра: правила живут в слое приложения,
// стор только делает его неизменяемый снимок реактивным.
export const useTrainerStore = defineStore('trainer', () => {
  const random = inject(randomKey)
  if (!random) throw new Error('Random source is not provided: provide it with randomKey')
  const trainer = createTrainer(createQuestionGenerator(random))
  const state = shallowRef(trainer.state)
  const sync = () => {
    state.value = trainer.state
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

  return { state, select, check, next }
})
