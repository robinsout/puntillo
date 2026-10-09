import { describe, expect, it } from 'vitest'
import { createTrainer } from '@/application/trainer'
import type { Trainer } from '@/application/trainer'
import type { Letter } from '@/domain/pitch'
import type { Duration, Note, Question, Rest } from '@/domain/question'
import { createQuestionOf } from '@/domain/question'

// Feature multi-note-questions, slice 4: rests need no answer and are worth no points (criterion
// 6); the highlight passes them by (criterion 10). The trainer works on the notes of a question,
// so a rest takes no place among them: note 2 is the second note, whatever rests stand before it.

const half: Duration = { value: 'half' }
const quarter: Duration = { value: 'quarter' }
const eighth: Duration = { value: 'eighth' }

const note = (letter: Letter, duration: Duration): Note => ({
  pitch: { letter, octave: 4 },
  duration,
})
const rest = (duration: Duration): Rest => ({ duration })

// A quarter rest, C4 quarter, a quarter rest, E4 eighth, an eighth rest, G4 quarter: one bar of 4/4.
const WITH_RESTS = createQuestionOf({ beats: 4, beatValue: 4 }, [
  rest(quarter),
  note('C', quarter),
  rest(quarter),
  note('E', eighth),
  rest(eighth),
  note('G', quarter),
])
// C4 half and a half rest.
const ONE_NOTE_AND_A_REST = createQuestionOf({ beats: 4, beatValue: 4 }, [
  note('C', half),
  rest(half),
])

function sourceOf(...questions: Question[]) {
  let served = 0
  return () => {
    const question = questions[served]
    if (!question) throw new Error('question source exhausted')
    served += 1
    return question
  }
}

const start = (
  question: Question = WITH_RESTS,
  options: Parameters<typeof createTrainer>[1] = {},
) => createTrainer(sourceOf(question, ONE_NOTE_AND_A_REST), options)

function answerNotes(trainer: Trainer, ...answers: [Letter, Duration][]) {
  for (const [letter, duration] of answers) {
    trainer.select(letter)
    trainer.selectDuration(duration)
  }
}

describe('a trainer on a question with rests', () => {
  it('asks about the three notes alone, the first one current', () => {
    const { state } = start()

    expect(state.notes).toHaveLength(3)
    expect(state.current).toBe(0)
  })

  it('moves from an answered note to the next note, past the rest', () => {
    const trainer = start()

    answerNotes(trainer, ['C', quarter])

    expect(trainer.state.current).toBe(1)
  })

  it('moves between the notes with the next and the previous note, past the rests', () => {
    const trainer = start()

    trainer.nextNote()
    trainer.nextNote()
    expect(trainer.state.current).toBe(2)

    trainer.nextNote()
    expect(trainer.state.current).toBe(2)

    trainer.previousNote()
    expect(trainer.state.current).toBe(1)
  })

  it('takes an answer for each note, not for the rests', () => {
    const trainer = start()

    answerNotes(trainer, ['C', quarter], ['E', eighth], ['G', quarter])
    trainer.check()

    expect(trainer.state.hint).toBe(false)
    expect(trainer.state.outcome).toBe('correct')
    expect(trainer.state.firstGrade).toEqual([
      { pitch: true, duration: true },
      { pitch: true, duration: true },
      { pitch: true, duration: true },
    ])
  })

  it('grades each answer against its note, the rests left out', () => {
    const trainer = start()

    answerNotes(trainer, ['C', quarter], ['F', eighth], ['G', eighth])
    trainer.check()

    expect(trainer.state.firstGrade).toEqual([
      { pitch: true, duration: true },
      { pitch: false, duration: true },
      { pitch: true, duration: false },
    ])
  })

  it('asks to answer every note before the check, the rests needing none', () => {
    const trainer = start()

    answerNotes(trainer, ['C', quarter], ['E', eighth])
    trainer.check()

    expect(trainer.state.hint).toBe(true)
    expect(trainer.state.firstGrade).toBeNull()
  })

  it('makes a question of one note and a rest one of one note', () => {
    const trainer = start(ONE_NOTE_AND_A_REST)

    answerNotes(trainer, ['C', half])
    trainer.check()

    expect(trainer.state.notes).toHaveLength(1)
    expect(trainer.state.outcome).toBe('correct')
  })
})
