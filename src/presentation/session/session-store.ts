import { computed, inject, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import { createQuestionGenerator } from '@/application/question-generation'
import { createReviewQueueService } from '@/application/review-queue'
import { createSession } from '@/application/session'
import type { SessionState } from '@/application/session'
import type { Difficulty } from '@/domain/difficulty'
import type { Letter, Pitch } from '@/domain/pitch'
import type { Duration } from '@/domain/question'
import type { SessionLength } from '@/domain/session'
import { clockKey, preferencesKey, progressKey, randomKey } from '@/presentation/dependencies'
import { usePreferencesStore } from '@/presentation/preferences'

export type QuestionScreen = Extract<SessionState, { phase: 'question' }>
export type WritingScreen = Extract<SessionState, { phase: 'writing' }>

// Rules live in the application layer; the store only makes its immutable snapshot reactive.
export const useSessionStore = defineStore('session', () => {
  const random = inject(randomKey)
  if (!random) throw new Error('Random source is not provided: provide it with randomKey')
  const clock = inject(clockKey)
  if (!clock) throw new Error('Clock is not provided: provide it with clockKey')

  const preferences = inject(preferencesKey)
  if (!preferences)
    throw new Error('Preferences are not provided: provide them with preferencesKey')

  const progress = inject(progressKey)
  if (!progress) throw new Error('Progress is not provided: provide it with progressKey')

  const preferencesStore = usePreferencesStore()

  const session = createSession(
    (difficulty) => createQuestionGenerator(random, difficulty),
    clock,
    preferences,
    (queue) => createReviewQueueService(random, queue),
    // The progress saves to the storage of the preferences: a full one is found here too.
    {
      recordAnswers(answers) {
        progress.recordAnswers(answers)
        preferencesStore.refreshCanSave()
      },
      recordSession(summary) {
        progress.recordSession(summary)
        preferencesStore.refreshCanSave()
      },
      saveSession(saved) {
        progress.saveSession(saved)
        preferencesStore.refreshCanSave()
      },
      discardSession() {
        progress.discardSession()
        preferencesStore.refreshCanSave()
      },
    },
  )
  const state = shallowRef(session.state)
  // The progress is not reactive: read again on each change of the session.
  const unfinishedSession = shallowRef(progress.unfinishedSession)
  const autoNext = ref(session.autoAdvance)
  const showAnswerAtOnce = ref(session.showAnswerAtOnce)
  const sync = () => {
    state.value = session.state
    unfinishedSession.value = progress.unfinishedSession
  }

  // Kept for the whole page, not per session: once VexFlow is loaded, later notes are drawn
  // at once, so hiding the answer buttons again would only make them blink.
  const staffReady = ref(false)

  const question = computed(() => (state.value.phase === 'question' ? state.value : null))
  const writing = computed(() => (state.value.phase === 'writing' ? state.value : null))
  const timed = computed(() => typeof (question.value ?? writing.value)?.length === 'object')

  // The Why? whose hint led to an article, to take the focus again once back on the question.
  // In memory only: after a reload there is no question to go back to.
  let hintOpener: number | null = null

  function rememberHintOpener(index: number) {
    hintOpener = index
  }

  function takeHintOpener(): number | null {
    const index = hintOpener
    hintOpener = null
    return index
  }

  // Likewise the link of Most mistakes that led to an article, by its place in the list.
  let resultsLink: number | null = null

  function rememberResultsLink(index: number) {
    resultsLink = index
  }

  function takeResultsLink(): number | null {
    const index = resultsLink
    resultsLink = null
    return index
  }

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

  function start(length: SessionLength, difficulty?: Difficulty) {
    session.start(length, difficulty)
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

  function toggleDot() {
    session.toggleDot()
    sync()
  }

  function toggleSharp() {
    session.toggleSharp()
    sync()
  }

  function toggleFlat() {
    session.toggleFlat()
    sync()
  }

  function toggleNatural() {
    session.toggleNatural()
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

  function previousNote() {
    session.previousNote()
    sync()
  }

  function nextNote() {
    session.nextNote()
    sync()
  }

  function goToNote(index: number) {
    session.goToNote(index)
    sync()
  }

  function place(pitch: Pitch, index?: number) {
    session.place(pitch, index)
    sync()
  }

  function stepUp() {
    session.stepUp()
    sync()
  }

  function stepDown() {
    session.stepDown()
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

  function practiceMostMistakes() {
    session.practiceMostMistakes()
    sync()
  }

  // Arrow functions, unlike hoisted declarations, keep the progress narrowed as provided.
  const resume = () => {
    const saved = progress.unfinishedSession
    if (saved) session.resume(saved)
    sync()
  }

  const discardSession = () => {
    progress.discardSession()
    preferencesStore.refreshCanSave()
    sync()
  }

  function saveProgress() {
    session.saveProgress()
  }

  return {
    state,
    question,
    writing,
    timed,
    autoNext,
    showAnswerAtOnce,
    staffReady,
    setAutoNext,
    setShowAnswerAtOnce,
    noteDrawn,
    start,
    select,
    selectDuration,
    toggleDot,
    toggleSharp,
    toggleFlat,
    toggleNatural,
    check,
    answer,
    answerDuration,
    previousNote,
    nextNote,
    goToNote,
    place,
    stepUp,
    stepDown,
    next,
    finish,
    newSession,
    practiceMostMistakes,
    unfinishedSession,
    resume,
    discardSession,
    saveProgress,
    // The time passed is read from the clock: a new snapshot is all a tick of the timer needs.
    refresh: sync,
    rememberHintOpener,
    takeHintOpener,
    rememberResultsLink,
    takeResultsLink,
  }
})
