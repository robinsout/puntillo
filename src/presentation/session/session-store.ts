import { computed, inject, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import { createQuestionGenerator } from '@/application/question-generation'
import { createSession } from '@/application/session'
import type { SessionState } from '@/application/session'
import type { Letter } from '@/domain/pitch'
import type { SessionLength } from '@/domain/session'
import { randomKey, schedulerKey } from '@/presentation/dependencies'

export type QuestionScreen = Extract<SessionState, { phase: 'question' }>

// Rules live in the application layer; the store only makes its immutable snapshot reactive.
export const useSessionStore = defineStore('session', () => {
  const random = inject(randomKey)
  if (!random) throw new Error('Random source is not provided: provide it with randomKey')
  const scheduler = inject(schedulerKey)
  if (!scheduler) throw new Error('Scheduler is not provided: provide it with schedulerKey')

  // The question screen watches this counter to move the focus after an auto-advance.
  const autoAdvances = ref(0)
  const session = createSession(createQuestionGenerator(random), scheduler, () => {
    sync()
    autoAdvances.value++
  })
  const state = shallowRef(session.state)
  const autoNext = ref(session.autoAdvance)
  const sync = () => {
    state.value = session.state
  }

  const question = computed(() => (state.value.phase === 'question' ? state.value : null))

  function setAutoNext(on: boolean) {
    session.setAutoAdvance(on)
    autoNext.value = session.autoAdvance
  }

  function start(length: SessionLength) {
    session.start(length)
    sync()
  }

  function select(letter: Letter) {
    session.select(letter)
    sync()
  }

  function check() {
    session.check()
    sync()
  }

  function next() {
    session.next()
    sync()
  }

  function finish() {
    session.finish()
    sync()
  }

  function newSession() {
    session.newSession()
    sync()
  }

  return {
    state,
    question,
    autoNext,
    autoAdvances,
    setAutoNext,
    start,
    select,
    check,
    next,
    finish,
    newSession,
  }
})
