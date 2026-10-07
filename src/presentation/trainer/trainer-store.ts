import { shallowRef } from 'vue'
import { defineStore } from 'pinia'
import { createTrainer } from '@/application/trainer'
import { generateQuestion } from '@/application/question-generation'
import type { Letter } from '@/domain/pitch'

// Тонкая обёртка над автоматом тренажёра: правила живут в слое приложения,
// стор только делает его неизменяемый снимок реактивным.
export const useTrainerStore = defineStore('trainer', () => {
  const trainer = createTrainer(generateQuestion)
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
