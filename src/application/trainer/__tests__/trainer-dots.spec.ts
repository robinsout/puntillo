import { describe, expect, it } from 'vitest'
import { createTrainer } from '@/application/trainer'
import type { Trainer } from '@/application/trainer'
import type { Letter } from '@/domain/pitch'
import type { Duration, Note, Question } from '@/domain/question'
import { createQuestion } from '@/domain/question'

// Feature multi-note-questions, slice 5: the toggle Dot (criterion 13) and the grading of dotted
// durations (criterion 18).
//
// Each note has a dot of its own, on or off; the top-level `dot` mirrors the current note, as the
// other choice fields do. The dot belongs to the duration: a duration chosen while the dot is on
// is dotted, and turning the dot on or off changes the duration already chosen. The dot alone
// never completes a note, so it never moves the highlight on: it is set before the duration, or
// the name, whichever comes last.
//
// In the second attempt a wrong duration is dropped together with its dot. The wrong duration is
// the value and the dot together: a rejected plain quarter leaves the dotted quarter open, and
// the other way round.

const half: Duration = { value: 'half' }
const quarter: Duration = { value: 'quarter' }
const eighth: Duration = { value: 'eighth' }
const dotted = (value: Duration['value']): Duration => ({ value, dots: 1 })

const note = (letter: Letter, duration: Duration): Note => ({
  pitch: { letter, octave: 4 },
  duration,
})

// C4 dotted quarter.
const ONE = createQuestion(note('C', dotted('quarter')))
// C4 dotted half, E4 quarter.
const TWO = createQuestion(note('C', dotted('half')), note('E', quarter))
const NEXT = createQuestion(note('A', half))

function sourceOf(...questions: Question[]) {
  let served = 0
  return () => {
    const question = questions[served]
    if (!question) throw new Error('question source exhausted')
    served += 1
    return question
  }
}

type Options = Parameters<typeof createTrainer>[1]

const start = (question: Question = ONE, options: Options = {}) =>
  createTrainer(sourceOf(question, NEXT), options)

const durationsOf = (trainer: Trainer) =>
  trainer.state.notes.map(({ selectedDuration }) =>
    selectedDuration ? `${selectedDuration.value}${selectedDuration.dots ? '.' : ''}` : '-',
  )
const dotsOf = (trainer: Trainer) => trainer.state.notes.map(({ dot }) => dot)

describe('the dot of a note', () => {
  it('is off when the question opens, for every note', () => {
    const trainer = start(TWO)

    expect(trainer.state.dot).toBe(false)
    expect(dotsOf(trainer)).toEqual([false, false])
  })

  it('turns on and off', () => {
    const trainer = start()

    trainer.toggleDot()
    expect(trainer.state.dot).toBe(true)

    trainer.toggleDot()
    expect(trainer.state.dot).toBe(false)
  })

  it('dots the duration chosen after it', () => {
    const trainer = start()

    trainer.toggleDot()
    trainer.selectDuration(quarter)

    expect(trainer.state.selectedDuration).toEqual(dotted('quarter'))
  })

  it('dots the duration chosen before it', () => {
    const trainer = start()

    trainer.selectDuration(quarter)
    trainer.toggleDot()

    expect(trainer.state.selectedDuration).toEqual(dotted('quarter'))
  })

  it('leaves the chosen duration plain once turned off', () => {
    const trainer = start()

    trainer.toggleDot()
    trainer.selectDuration(quarter)
    trainer.toggleDot()

    expect(trainer.state.selectedDuration).toEqual(quarter)
  })

  it('stays on for the next duration chosen instead', () => {
    const trainer = start()

    trainer.toggleDot()
    trainer.selectDuration(quarter)
    trainer.selectDuration(half)

    expect(trainer.state.selectedDuration).toEqual(dotted('half'))
    expect(trainer.state.dot).toBe(true)
  })

  it('belongs to the current note alone', () => {
    const trainer = start(TWO)

    trainer.toggleDot()
    trainer.goToNote(1)

    expect(dotsOf(trainer)).toEqual([true, false])
    expect(trainer.state.dot).toBe(false)
  })

  it('clears the hint, as a choice does', () => {
    const trainer = start()
    trainer.check()

    trainer.toggleDot()

    expect(trainer.state.hint).toBe(false)
  })

  it('does nothing when the duration is not asked', () => {
    const trainer = start(ONE, { askDuration: false })

    trainer.toggleDot()

    expect(trainer.state.dot).toBe(false)
  })
})

// Criterion 10: the highlight moves on once the note has its name and its duration.
describe('the dot and the highlight', () => {
  it('does not complete a note on its own', () => {
    const trainer = start(TWO)

    trainer.select('C')
    trainer.toggleDot()

    expect(trainer.state.current).toBe(0)
  })

  it('goes with the duration that completes the note, and the highlight moves on', () => {
    const trainer = start(TWO)

    trainer.select('C')
    trainer.toggleDot()
    trainer.selectDuration(half)

    expect(durationsOf(trainer)).toEqual(['half.', '-'])
    expect(trainer.state.current).toBe(1)
  })

  it('goes with the name that completes the note', () => {
    const trainer = start(TWO)

    trainer.selectDuration(half)
    trainer.toggleDot()
    trainer.select('C')

    expect(durationsOf(trainer)).toEqual(['half.', '-'])
    expect(trainer.state.current).toBe(1)
  })

  // The note is complete before the dot, so the dot is the next note's.
  it('pressed after the note is complete, is the dot of the next note', () => {
    const trainer = start(TWO)

    trainer.select('C')
    trainer.selectDuration(half)
    trainer.toggleDot()

    expect(dotsOf(trainer)).toEqual([false, true])
    expect(durationsOf(trainer)).toEqual(['half', '-'])
  })

  it('changes an answered note once the user goes back to it, staying there', () => {
    const trainer = start(TWO)
    trainer.select('C')
    trainer.selectDuration(half)

    trainer.previousNote()
    trainer.toggleDot()

    expect(durationsOf(trainer)).toEqual(['half.', '-'])
    expect(trainer.state.current).toBe(0)
  })
})

// Criterion 18.
describe('checking with dots', () => {
  function answerOne(trainer: Trainer, duration: Duration['value'], withDot: boolean) {
    trainer.select('C')
    if (withDot) trainer.toggleDot()
    trainer.selectDuration({ value: duration })
    trainer.check()
  }

  it('takes a dotted quarter answered with the dot', () => {
    const trainer = start()

    answerOne(trainer, 'quarter', true)

    expect(trainer.state.outcome).toBe('correct')
    expect(trainer.state.firstGrade).toEqual([{ pitch: true, duration: true }])
  })

  it('refuses a dotted quarter answered without the dot', () => {
    const trainer = start()

    answerOne(trainer, 'quarter', false)

    expect(trainer.state.firstGrade).toEqual([{ pitch: true, duration: false }])
  })

  it('refuses a plain quarter answered with a dot', () => {
    const trainer = start(createQuestion(note('C', quarter)))

    answerOne(trainer, 'quarter', true)

    expect(trainer.state.firstGrade).toEqual([{ pitch: true, duration: false }])
  })
})

describe('the second attempt after a wrong dot', () => {
  // The dotted quarter answered plain.
  function missedDot(options: Options = {}) {
    const trainer = start(ONE, options)
    trainer.select('C')
    trainer.selectDuration(quarter)
    trainer.check()
    return trainer
  }

  // The plain quarter answered dotted.
  function extraDot() {
    const trainer = start(createQuestion(note('C', quarter)))
    trainer.select('C')
    trainer.toggleDot()
    trainer.selectDuration(quarter)
    trainer.check()
    return trainer
  }

  it('marks the plain quarter as the wrong duration and drops it', () => {
    const { state } = missedDot()

    expect(state.wrongDuration).toEqual(quarter)
    expect(state.selectedDuration).toBeNull()
    expect(state.dot).toBe(false)
  })

  it('drops a wrong dotted duration together with its dot', () => {
    const { state } = extraDot()

    expect(state.wrongDuration).toEqual(dotted('quarter'))
    expect(state.selectedDuration).toBeNull()
    expect(state.dot).toBe(false)
  })

  it('refuses the rejected plain quarter again', () => {
    const trainer = missedDot()

    trainer.selectDuration(quarter)

    expect(trainer.state.selectedDuration).toBeNull()
  })

  it('takes the dotted quarter, which was not rejected', () => {
    const trainer = missedDot()

    trainer.toggleDot()
    trainer.selectDuration(quarter)
    trainer.check()

    expect(trainer.state.outcome).toBe('correct-second-try')
  })

  it('refuses the rejected dotted quarter again but takes the plain one', () => {
    const trainer = extraDot()

    trainer.toggleDot()
    trainer.selectDuration(quarter)
    expect(trainer.state.selectedDuration).toBeNull()

    trainer.toggleDot()
    trainer.selectDuration(quarter)
    trainer.check()
    expect(trainer.state.outcome).toBe('correct-second-try')
  })

  // Turning the dot off would make the chosen duration the rejected one.
  it('drops the chosen duration when the dot turns it into the rejected one', () => {
    const trainer = missedDot()
    trainer.toggleDot()
    trainer.selectDuration(quarter)

    trainer.toggleDot()

    expect(trainer.state.dot).toBe(false)
    expect(trainer.state.selectedDuration).toBeNull()
  })

  it('keeps the name and the dot of a duration that was right', () => {
    const trainer = start(ONE)
    trainer.select('D')
    trainer.toggleDot()
    trainer.selectDuration(quarter)
    trainer.check()

    expect(trainer.state.selectedDuration).toEqual(dotted('quarter'))
    expect(trainer.state.dot).toBe(true)

    trainer.toggleDot()
    expect(trainer.state.dot).toBe(true)
    expect(trainer.state.selectedDuration).toEqual(dotted('quarter'))
  })

  it('keeps the wrong dotted duration as chosen with one attempt, for the review', () => {
    const trainer = start(createQuestion(note('C', quarter)), { attempts: 1 })
    trainer.select('C')
    trainer.toggleDot()
    trainer.selectDuration(quarter)
    trainer.check()

    expect(trainer.state.outcome).toBe('incorrect')
    expect(trainer.state.selectedDuration).toEqual(dotted('quarter'))
    expect(trainer.state.wrongDuration).toEqual(dotted('quarter'))
  })

  it('ignores the dot once the question is over', () => {
    const trainer = start()
    trainer.select('C')
    trainer.toggleDot()
    trainer.selectDuration(quarter)
    trainer.check()

    trainer.toggleDot()

    expect(trainer.state.dot).toBe(true)
    expect(trainer.state.selectedDuration).toEqual(dotted('quarter'))
  })
})

describe('clearing the choice with a dot', () => {
  it('turns the dot off with the duration', () => {
    const trainer = start(TWO)
    trainer.toggleDot()
    trainer.selectDuration(eighth)

    trainer.clearChoice()

    expect(dotsOf(trainer)).toEqual([false, false])
    expect(durationsOf(trainer)).toEqual(['-', '-'])
  })

  it('keeps the dot of a duration settled in the first attempt', () => {
    const trainer = start(ONE)
    trainer.select('D')
    trainer.toggleDot()
    trainer.selectDuration(quarter)
    trainer.check()

    trainer.clearChoice()

    expect(trainer.state.dot).toBe(true)
    expect(trainer.state.selectedDuration).toEqual(dotted('quarter'))
  })
})

describe('the next question', () => {
  it('opens with every dot off', () => {
    const trainer = start()
    trainer.select('C')
    trainer.toggleDot()
    trainer.selectDuration(quarter)
    trainer.check()

    trainer.next()

    expect(trainer.state.dot).toBe(false)
  })
})
