import { describe, expect, it } from 'vitest'
import type { Clock, CounterEvent, VisitCounter } from '@/application/ports'
import { createSession } from '@/application/session'
import type { ProgressRecorder, Session } from '@/application/session'
import { presetDifficulty, type Difficulty, type Preset } from '@/domain/difficulty'
import type { SavedSession } from '@/domain/progress'
import { createQuestion, type Question } from '@/domain/question'
import type { Exercise } from '@/domain/session'

// Feature visit-counter, slice 2 of 3, criteria 2 and 3.
//
// - Each start of a session, Start and Practice only these, counts one event session with the
//   exercise and the preset: the preset of the preferences if the difficulty of the session is the
//   one of that preset, otherwise custom. Practice only these keeps the exercise and the difficulty
//   of the session before it and compares them with the preset of the preferences now.
// - A session resumed is not a new one: no event session.
// - Each way into the results counts one event summary with the exercise, the points and the
//   points possible, a session resumed included.
//
// The questions are all E4 as a whole note, on the staff of First steps, which writes no note on a
// ledger line; in First steps a note earns 1 point of 1, as no
// duration is asked. One attempt per question unless told otherwise, so a wrong answer is done.

const FIRST_STEPS = presetDifficulty('first-steps')
const ADVANCED = presetDifficulty('advanced')
const MINUTE = 60_000

const WHOLE_E4: Question = createQuestion({
  pitch: { letter: 'E', octave: 4 },
  duration: { value: 'whole' },
})

interface Modes {
  difficulty: Difficulty
  exercise: Exercise
  preset: Preset | undefined
}

function fakeCounter() {
  const events: CounterEvent[] = []
  const counter: VisitCounter = {
    count(event) {
      events.push(event)
    },
  }
  return { counter, events }
}

function fakeProgress() {
  let saved: SavedSession | null = null
  const progress: ProgressRecorder = {
    recordAnswers() {},
    recordSession() {},
    saveSession(session) {
      saved = session
    },
    discardSession() {
      saved = null
    },
  }
  return {
    progress,
    unfinished(): SavedSession {
      if (!saved) throw new Error('expected a session saved')
      return saved
    },
  }
}

type Progress = ReturnType<typeof fakeProgress>

// Unless told otherwise: Read notes in First steps, the preset of the preferences.
function openPage(initial: Partial<Modes> = {}, progress: Progress = fakeProgress()) {
  const modes: Modes = {
    difficulty: FIRST_STEPS,
    exercise: 'read',
    preset: 'first-steps',
    ...initial,
  }
  let now = 0
  const clock: Clock = { now: () => now }
  const { counter, events } = fakeCounter()
  const session = createSession(
    () => () => WHOLE_E4,
    clock,
    {
      get difficulty() {
        return modes.difficulty
      },
      get exercise() {
        return modes.exercise
      },
      get preset() {
        return modes.preset
      },
      autoAdvance: false,
      showAnswerAtOnce: true,
      chooseAutoAdvance() {},
      chooseShowAnswerAtOnce() {},
    },
    undefined,
    progress.progress,
    counter,
  )
  return {
    session,
    events,
    modes,
    progress,
    elapse(ms: number) {
      now += ms
    },
  }
}

function answerRight(session: Session) {
  if (session.state.phase === 'writing') session.place({ letter: 'E', octave: 4 })
  else session.select('E')
  session.check()
}

function answerWrong(session: Session) {
  if (session.state.phase === 'writing') session.place({ letter: 'G', octave: 4 })
  else session.select('D')
  session.check()
}

const sessionEvent = (exercise: Exercise, preset: Preset | 'custom'): CounterEvent => ({
  name: 'session',
  exercise,
  preset,
})

const summaryEvent = (exercise: Exercise, score: number, total: number): CounterEvent => ({
  name: 'summary',
  exercise,
  score,
  total,
})

describe('the visit counter of a session', () => {
  it('counts nothing before a session starts', () => {
    const { events } = openPage()

    expect(events).toEqual([])
  })

  describe('the event session (criterion 2)', () => {
    it('is counted once on Start, with the exercise and the preset of the preferences', () => {
      const { session, events } = openPage()

      session.start(10)

      expect(events).toEqual([sessionEvent('read', 'first-steps')])
    })

    it('names the preset whose difficulty the session has, compared by value', () => {
      const { session, events } = openPage({
        preset: 'advanced',
        difficulty: structuredClone(ADVANCED),
      })

      session.start('unlimited')

      expect(events).toEqual([sessionEvent('read', 'advanced')])
    })

    it('is custom once the difficulty differs from the one of the preset', () => {
      const { session, events } = openPage({
        preset: 'first-steps',
        difficulty: { ...FIRST_STEPS, ledgerLines: 1 },
      })

      session.start(10)

      expect(events).toEqual([sessionEvent('read', 'custom')])
    })

    it('is custom for a session with a difficulty of its own, as from the wiki', () => {
      const { session, events } = openPage()

      session.start('unlimited', { ...FIRST_STEPS, askDuration: true })

      expect(events).toEqual([sessionEvent('read', 'custom')])
    })

    it('names the preset for a session given the difficulty of that preset', () => {
      const { session, events } = openPage()

      session.start('unlimited', presetDifficulty('first-steps'))

      expect(events).toEqual([sessionEvent('read', 'first-steps')])
    })

    it('is custom when no preset is known', () => {
      const { session, events } = openPage({ preset: undefined })

      session.start(10)

      expect(events).toEqual([sessionEvent('read', 'custom')])
    })

    it('names the exercise Write notes as write', () => {
      const { session, events } = openPage({ exercise: 'write' })

      session.start(10)

      expect(events).toEqual([sessionEvent('write', 'first-steps')])
    })

    it('is counted for each session started on the page', () => {
      const { session, events } = openPage()
      session.start('unlimited')
      session.finish()
      session.newSession()

      session.start(20)

      expect(events.filter(({ name }) => name === 'session')).toHaveLength(2)
    })

    it('is not counted by the questions, the checks and the moves within a session', () => {
      const { session, events } = openPage()
      session.start(10)

      answerRight(session)
      session.next()
      answerWrong(session)
      session.next()

      expect(events).toEqual([sessionEvent('read', 'first-steps')])
    })
  })

  describe('Practice only these (criterion 2)', () => {
    function resultsWithAMistake(initial: Partial<Modes> = {}) {
      const page = openPage(initial)
      page.session.start('unlimited')
      answerWrong(page.session)
      page.session.finish()
      return page
    }

    it('counts a new session with the exercise and the preset of the session before', () => {
      const { session, events } = resultsWithAMistake()

      session.practiceMostMistakes()

      expect(events).toEqual([
        sessionEvent('read', 'first-steps'),
        summaryEvent('read', 0, 1),
        sessionEvent('read', 'first-steps'),
      ])
    })

    it('keeps the exercise of the session before, whatever the preferences say now', () => {
      const { session, events, modes } = resultsWithAMistake({ exercise: 'write' })
      modes.exercise = 'read'

      session.practiceMostMistakes()

      expect(events.at(-1)).toEqual(sessionEvent('write', 'first-steps'))
    })

    it('is custom once the preset of the preferences is another than the difficulty', () => {
      const { session, events, modes } = resultsWithAMistake()
      modes.preset = 'advanced'
      modes.difficulty = ADVANCED

      session.practiceMostMistakes()

      expect(events.at(-1)).toEqual(sessionEvent('read', 'custom'))
    })

    it('is counted once per press', () => {
      const { session, events } = resultsWithAMistake()

      session.practiceMostMistakes()

      expect(events.filter(({ name }) => name === 'session')).toHaveLength(2)
    })
  })

  describe('the event summary (criterion 3)', () => {
    it('is counted on Finish with the exercise, the points and the points possible', () => {
      const { session, events } = openPage()
      session.start('unlimited')
      answerRight(session)
      session.next()
      answerWrong(session)
      session.next()
      answerRight(session)

      session.finish()

      expect(events).toEqual([sessionEvent('read', 'first-steps'), summaryEvent('read', 2, 3)])
    })

    it('counts the points of the duration as well', () => {
      const { session, events } = openPage({
        preset: undefined,
        difficulty: { ...FIRST_STEPS, askDuration: true },
      })
      session.start('unlimited')
      session.select('E')
      session.selectDuration({ value: 'whole' })
      session.check()

      session.finish()

      expect(events.at(-1)).toEqual(summaryEvent('read', 2, 2))
    })

    it('is counted after the last question of a length', () => {
      const { session, events } = openPage()
      session.start(10)
      for (let question = 1; question < 10; question++) {
        answerRight(session)
        session.next()
      }
      answerWrong(session)
      expect(events.filter(({ name }) => name === 'summary')).toEqual([])

      session.next()

      expect(events.at(-1)).toEqual(summaryEvent('read', 9, 10))
    })

    it('is counted once the time is up', () => {
      const { session, events, elapse } = openPage()
      session.start({ minutes: 3 })
      answerRight(session)
      session.next()
      elapse(3 * MINUTE)
      answerRight(session)

      session.next()

      expect(session.state.phase).toBe('results')
      expect(events.at(-1)).toEqual(summaryEvent('read', 2, 2))
    })

    it('names the exercise Write notes as write', () => {
      const { session, events } = openPage({ exercise: 'write' })
      session.start('unlimited')
      answerRight(session)

      session.finish()

      expect(events.at(-1)).toEqual(summaryEvent('write', 1, 1))
    })

    it('is not counted by Finish before any check, which leads back to the choice', () => {
      const { session, events } = openPage()
      session.start('unlimited')

      session.finish()

      expect(events).toEqual([sessionEvent('read', 'first-steps')])
    })

    it('is counted once per session, whatever is done on the results', () => {
      const { session, events } = openPage()
      session.start('unlimited')
      answerRight(session)
      session.finish()

      session.finish()
      session.next()
      session.newSession()

      expect(events.filter(({ name }) => name === 'summary')).toHaveLength(1)
    })
  })

  describe('a session resumed (criteria 2 and 3)', () => {
    it('counts no event session', () => {
      const before = openPage()
      before.session.start('unlimited')
      answerRight(before.session)
      const after = openPage({}, before.progress)

      after.session.resume(before.progress.unfinished())

      expect(after.events).toEqual([])
    })

    it('counts no event session for a question resumed unchecked', () => {
      const before = openPage()
      before.session.start('unlimited')
      answerRight(before.session)
      before.session.next()
      before.session.saveProgress()
      const after = openPage({}, before.progress)

      after.session.resume(before.progress.unfinished())

      expect(after.events).toEqual([])
    })

    it('counts the summary with the points of the whole session on Finish', () => {
      const before = openPage({ exercise: 'write' })
      before.session.start('unlimited')
      answerRight(before.session)
      const after = openPage({ exercise: 'read' }, before.progress)
      after.session.resume(before.progress.unfinished())
      answerWrong(after.session)

      after.session.finish()

      expect(after.events).toEqual([summaryEvent('write', 1, 2)])
    })

    it('counts the summary when it resumes past its last question', () => {
      const before = openPage()
      before.session.start(10)
      for (let question = 1; question < 10; question++) {
        answerRight(before.session)
        before.session.next()
      }
      answerRight(before.session)
      const after = openPage({}, before.progress)

      after.session.resume(before.progress.unfinished())

      expect(after.session.state.phase).toBe('results')
      expect(after.events).toEqual([summaryEvent('read', 10, 10)])
    })
  })
})
