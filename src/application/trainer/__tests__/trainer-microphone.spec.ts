import { describe, expect, it } from 'vitest'
import { createTrainer, noteAnswerOf } from '@/application/trainer'
import type { NoteChoice } from '@/application/trainer'
import type { PianoKey } from '@/domain/keyboard'
import type { Alteration, Letter } from '@/domain/pitch'
import type { Duration, Note, Question } from '@/domain/question'
import { createQuestion } from '@/domain/question'

// Feature microphone-input, slice 1: with the microphone as the note input a note heard chooses
// the key of the current note, as a key of the piano keyboard does, and is graded by its sound and
// with its octave (criterion 8). Only the pitch is asked: the duration is not, whatever the
// difficulty says, so a note is worth one point (criterion 7).

const whole: Duration = { value: 'whole' }
const quarter: Duration = { value: 'quarter' }

const key = (number: number): PianoKey => ({ number })

const C4 = key(60)
const C5 = key(72)
const C_SHARP_4 = key(61)

const note = (letter: Letter, duration: Duration = whole, alteration?: Alteration): Note => ({
  pitch: alteration === undefined ? { letter, octave: 4 } : { letter, octave: 4, alteration },
  duration,
})

const ON_C4 = createQuestion(note('C'))
const ON_D4 = createQuestion(note('D'))

function sourceOf(...questions: Question[]) {
  let served = 0
  return () => {
    const question = questions[served]
    if (!question) throw new Error('question source exhausted')
    served += 1
    return question
  }
}

// The difficulty asks for the duration: the microphone does not.
const start = (question: Question = ON_C4) =>
  createTrainer(sourceOf(question, ON_D4), { input: 'microphone', askDuration: true })

describe('a trainer with the microphone', () => {
  it('does not ask for the duration, though the difficulty does (criterion 7)', () => {
    expect(start().state.askDuration).toBe(false)
  })

  it('takes the note heard for the key of the current note', () => {
    const trainer = start()

    trainer.pressKey(C5)

    expect(trainer.state.key).toEqual(C5)
  })

  it('takes no duration', () => {
    const trainer = start()

    trainer.selectDuration(whole)

    expect(trainer.state.selectedDuration).toBeNull()
  })

  it('grades the note alone, worth one point, without a duration (criterion 7)', () => {
    const trainer = start()

    trainer.pressKey(C4)
    trainer.check()

    expect(trainer.state.firstGrade).toEqual([{ pitch: true, duration: null }])
    expect(trainer.state.outcome).toBe('correct')
  })

  it('grades a note an octave off as wrong (criterion 8)', () => {
    const trainer = start()

    trainer.pressKey(C5)
    trainer.check()

    expect(trainer.state.firstGrade).toEqual([{ pitch: false, duration: null }])
    expect(trainer.state.wrongKey).toEqual(C5)
  })

  it('grades one sound right for C♯4 and for D♭4 (criterion 8)', () => {
    const sharp = start(createQuestion(note('C', quarter, 1)))
    const flat = start(createQuestion(note('D', quarter, -1)))

    sharp.pressKey(C_SHARP_4)
    sharp.check()
    flat.pressKey(C_SHARP_4)
    flat.check()

    expect(sharp.state.outcome).toBe('correct')
    expect(flat.state.outcome).toBe('correct')
  })
})

describe('the answer of a note heard', () => {
  it('is its key, without a duration', () => {
    const choice: NoteChoice = {
      selected: null,
      selectedDuration: null,
      wrongChoice: null,
      alteration: null,
      wrongAlteration: null,
      wrongDuration: null,
      dot: false,
      key: C4,
      wrongKey: null,
    }

    expect(noteAnswerOf(choice, 'microphone', false)).toEqual({ key: C4, duration: null })
  })
})
