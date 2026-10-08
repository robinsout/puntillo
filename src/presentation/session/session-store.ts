import { computed, inject, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import { createQuestionGenerator } from '@/application/question-generation'
import { createSession } from '@/application/session'
import type { SessionState } from '@/application/session'
import type { Letter } from '@/domain/pitch'
import type { SessionLength } from '@/domain/session'
import { clockKey, randomKey } from '@/presentation/dependencies'

export type QuestionScreen = Extract<SessionState, { phase: 'question' }>

// Rules live in the application layer; the store only makes its immutable snapshot reactive.
export const useSessionStore = defineStore('session', () => {
  const random = inject(randomKey)
  if (!random) throw new Error('Random source is not provided: provide it with randomKey')
  const clock = inject(clockKey)
  if (!clock) throw new Error('Clock is not provided: provide it with clockKey')

  const session = createSession(createQuestionGenerator(random), clock)
  const state = shallowRef(session.state)
  const autoNext = ref(session.autoAdvance)
  const showAnswerAtOnce = ref(session.showAnswerAtOnce)
  const sync = () => {
    state.value = session.state
  }

  // Kept for the whole page, not per session: once VexFlow is loaded, later notes are drawn
  // at once, so hiding the answer buttons again would only make them blink.
  const staffReady = ref(false)

  const question = computed(() => (state.value.phase === 'question' ? state.value : null))

  function setAutoNext(on: boolean) {
    session.setAutoAdvance(on)
    autoNext.value = session.autoAdvance
    sync()
  }

  function setShowAnswerAtOnce(on: boolean) {
    session.setShowAnswerAtOnce(on)
    showAnswerAtOnce.value = session.showAnswerAtOnce
  }

  function start(length: SessionLength) {
    session.start(length)
    sync()
  }

  function noteDrawn() {
    session.noteDrawn()
    staffReady.value = true
  }

  function select(letter: Letter) {
    session.select(letter)
    sync()
  }

  function check() {
    session.check()
    sync()
  }

  function answer(letter: Letter) {
    session.answer(letter)
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
    showAnswerAtOnce,
    staffReady,
    setAutoNext,
    setShowAnswerAtOnce,
    noteDrawn,
    start,
    select,
    check,
    answer,
    next,
    finish,
    newSession,
  }
})
