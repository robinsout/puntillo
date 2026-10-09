import { computed, inject, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import { createQuestionGenerator } from '@/application/question-generation'
import { createSession } from '@/application/session'
import type { SessionState } from '@/application/session'
import type { Letter } from '@/domain/pitch'
import type { Duration } from '@/domain/question'
import type { SessionLength } from '@/domain/session'
import { clockKey, preferencesKey, randomKey } from '@/presentation/dependencies'
import { usePreferencesStore } from '@/presentation/preferences'

export type QuestionScreen = Extract<SessionState, { phase: 'question' }>

// Rules live in the application layer; the store only makes its immutable snapshot reactive.
export const useSessionStore = defineStore('session', () => {
  const random = inject(randomKey)
  if (!random) throw new Error('Random source is not provided: provide it with randomKey')
  const clock = inject(clockKey)
  if (!clock) throw new Error('Clock is not provided: provide it with clockKey')

  const preferences = inject(preferencesKey)
  if (!preferences)
    throw new Error('Preferences are not provided: provide them with preferencesKey')

  const preferencesStore = usePreferencesStore()

  const session = createSession(
    (difficulty) => createQuestionGenerator(random, difficulty),
    clock,
    preferences,
  )
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
    preferencesStore.refreshCanSave()
    sync()
  }

  function setShowAnswerAtOnce(on: boolean) {
    session.setShowAnswerAtOnce(on)
    showAnswerAtOnce.value = session.showAnswerAtOnce
    preferencesStore.refreshCanSave()
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

  function selectDuration(duration: Duration) {
    session.selectDuration(duration)
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

  function answerDuration(duration: Duration) {
    session.answerDuration(duration)
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
    selectDuration,
    check,
    answer,
    answerDuration,
    next,
    finish,
    newSession,
  }
})
