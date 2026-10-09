import { describe, expect, it } from 'vitest'
import { createTrainer } from '@/application/trainer'
import type { Trainer } from '@/application/trainer'
import type { Letter } from '@/domain/pitch'
import type { Duration, Note, Question } from '@/domain/question'
import { createQuestion } from '@/domain/question'

// Feature multi-note-questions, slice 1: a question of several notes is answered note by note,
// criteria 9–11 and 14–17. The quick mode is slice 2.

const whole: Duration = { value: 'whole' }
const half: Duration = { value: 'half' }
const quarter: Duration = { value: 'quarter' }
const eighth: Duration = { value: 'eighth' }

const note = (letter: Letter, duration: Duration): Note => ({
  pitch: { letter, octave: 4 },
  duration,
})

// C4 half, E4 quarter, G4 quarter.
const THREE = createQuestion(note('C', half), note('E', quarter), note('G', quarter))
// C4, D4, E4, F4 as quarter notes.
const FOUR = createQuestion(
  note('C', quarter),
  note('D', quarter),
  note('E', quarter),
  note('F', quarter),
)
const ONE = createQuestion(note('A', whole))

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

const start = (question: Question = THREE, options: Options = {}) =>
  createTrainer(sourceOf(question, ONE), options)

// Answers the current note.
function answerNote(trainer: Trainer, letter: Letter, duration: Duration) {
  trainer.select(letter)
  trainer.selectDuration(duration)
}

const answerThree = (trainer: Trainer, ...answers: [Letter, Duration][]) => {
  for (const [letter, duration] of answers) answerNote(trainer, letter, duration)
}

const choicesOf = (trainer: Trainer) =>
  trainer.state.notes.map(({ selected, selectedDuration }) =>
    [selected ?? '-', selectedDuration?.value ?? '-'].join(' '),
  )

describe('a trainer on a question of several notes', () => {
  describe('when opened', () => {
    it('makes the first note the current one', () => {
      expect(start().state.current).toBe(0)
    })

    it('has no choice for any note, no result and no hint', () => {
      const { state } = start()

      expect(state.notes).toEqual([
        { selected: null, selectedDuration: null, wrongChoice: null, wrongDuration: null },
        { selected: null, selectedDuration: null, wrongChoice: null, wrongDuration: null },
        { selected: null, selectedDuration: null, wrongChoice: null, wrongDuration: null },
      ])
      expect(state.firstGrade).toBeNull()
      expect(state.outcome).toBeNull()
      expect(state.hint).toBe(false)
    })
  })

  // Criterion 10.
  describe('answering the current note', () => {
    it('gives the chosen name to the current note only', () => {
      const trainer = start()

      trainer.select('D')

      expect(choicesOf(trainer)).toEqual(['D -', '- -', '- -'])
      expect(trainer.state.selected).toBe('D')
    })

    it('stays on the note while its duration is still to choose', () => {
      const trainer = start()

      trainer.select('D')

      expect(trainer.state.current).toBe(0)
    })

    it('stays on the note while its name is still to choose', () => {
      const trainer = start()

      trainer.selectDuration(half)

      expect(trainer.state.current).toBe(0)
      expect(trainer.state.selectedDuration).toEqual(half)
    })

    it('moves to the next note once the current one has its name and duration', () => {
      const trainer = start()

      answerNote(trainer, 'C', half)

      expect(trainer.state.current).toBe(1)
      expect(choicesOf(trainer)).toEqual(['C half', '- -', '- -'])
    })

    it('moves on in whichever order the name and the duration are chosen', () => {
      const trainer = start()

      trainer.selectDuration(half)
      trainer.select('C')

      expect(trainer.state.current).toBe(1)
    })

    it('shows the choice of the new current note, which is none yet', () => {
      const trainer = start()

      answerNote(trainer, 'C', half)

      expect(trainer.state.selected).toBeNull()
      expect(trainer.state.selectedDuration).toBeNull()
    })

    it('moves on after the name alone when the duration is not asked', () => {
      const trainer = start(THREE, { askDuration: false })

      trainer.select('C')

      expect(trainer.state.current).toBe(1)
      expect(trainer.state.notes[0]).toMatchObject({ selected: 'C', selectedDuration: null })
    })

    it('ignores a duration when it is not asked', () => {
      const trainer = start(THREE, { askDuration: false })

      trainer.selectDuration(half)

      expect(trainer.state.current).toBe(0)
      expect(trainer.state.notes[0]?.selectedDuration).toBeNull()
    })

    it('skips the notes already answered on its way to the right', () => {
      const trainer = start(FOUR)
      trainer.goToNote(1)
      answerNote(trainer, 'D', quarter)
      trainer.goToNote(0)

      answerNote(trainer, 'C', quarter)

      expect(trainer.state.current).toBe(2)
    })

    it('stays on the last note once it is answered', () => {
      const trainer = start()
      trainer.goToNote(2)

      answerNote(trainer, 'G', quarter)

      expect(trainer.state.current).toBe(2)
    })

    it('stays when every note to the right is answered, even with notes to the left left', () => {
      const trainer = start(FOUR)
      trainer.goToNote(2)
      answerNote(trainer, 'E', quarter)
      answerNote(trainer, 'F', quarter)
      trainer.goToNote(1)

      answerNote(trainer, 'D', quarter)

      expect(trainer.state.current).toBe(1)
      expect(choicesOf(trainer)).toEqual(['- -', 'D quarter', 'E quarter', 'F quarter'])
    })
  })

  // Criterion 11: the choice of an answered note can be changed.
  describe('changing the answer of an answered note', () => {
    function backOnFirst() {
      const trainer = start()
      answerNote(trainer, 'C', half)
      trainer.goToNote(0)
      return trainer
    }

    it('shows the choice of the note made current again', () => {
      const trainer = backOnFirst()

      expect(trainer.state.selected).toBe('C')
      expect(trainer.state.selectedDuration).toEqual(half)
    })

    it('replaces the name, keeping the duration, and stays on the note', () => {
      const trainer = backOnFirst()

      trainer.select('D')

      expect(choicesOf(trainer)).toEqual(['D half', '- -', '- -'])
      expect(trainer.state.current).toBe(0)
    })

    it('replaces the duration, keeping the name, and stays on the note', () => {
      const trainer = backOnFirst()

      trainer.selectDuration(eighth)

      expect(choicesOf(trainer)).toEqual(['C eighth', '- -', '- -'])
      expect(trainer.state.current).toBe(0)
    })
  })

  // Criterion 11 and edge case 2.
  describe('moving between the notes', () => {
    it('goes to the next note and back', () => {
      const trainer = start()

      trainer.nextNote()
      expect(trainer.state.current).toBe(1)
      trainer.nextNote()
      expect(trainer.state.current).toBe(2)
      trainer.previousNote()
      expect(trainer.state.current).toBe(1)
    })

    it('goes no further than the last note', () => {
      const trainer = start()
      trainer.goToNote(2)

      trainer.nextNote()

      expect(trainer.state.current).toBe(2)
    })

    it('goes no further back than the first note', () => {
      const trainer = start()

      trainer.previousNote()

      expect(trainer.state.current).toBe(0)
    })

    it('goes to any note directly, answered or not', () => {
      const trainer = start(FOUR)

      trainer.goToNote(3)
      expect(trainer.state.current).toBe(3)
      trainer.goToNote(1)
      expect(trainer.state.current).toBe(1)
    })

    it.each([-1, 3, 1.5])('ignores going to note %d, which is not in the question', (index) => {
      const trainer = start()
      trainer.goToNote(1)

      trainer.goToNote(index)

      expect(trainer.state.current).toBe(1)
    })

    it('keeps the choices of every note', () => {
      const trainer = start()
      answerNote(trainer, 'C', half)
      trainer.select('E')

      trainer.previousNote()
      trainer.nextNote()
      trainer.goToNote(2)

      expect(choicesOf(trainer)).toEqual(['C half', 'E -', '- -'])
    })

    it('does not grade anything', () => {
      const trainer = start()
      answerThree(trainer, ['C', half], ['E', quarter], ['G', quarter])

      trainer.goToNote(0)
      trainer.nextNote()

      expect(trainer.state.firstGrade).toBeNull()
      expect(trainer.state.outcome).toBeNull()
    })
  })

  // Criterion 14.
  describe('checking before every note has its answer', () => {
    it('asks for the answers and grades nothing when a note has none', () => {
      const trainer = start()
      answerThree(trainer, ['C', half], ['E', quarter])

      trainer.check()

      expect(trainer.state.hint).toBe(true)
      expect(trainer.state.firstGrade).toBeNull()
      expect(trainer.state.outcome).toBeNull()
    })

    it('asks for the answers when a note has its name but not its duration', () => {
      const trainer = start()
      answerThree(trainer, ['C', half], ['E', quarter])
      trainer.select('G')

      trainer.check()

      expect(trainer.state.hint).toBe(true)
      expect(trainer.state.firstGrade).toBeNull()
    })

    it('keeps the choices made and the current note', () => {
      const trainer = start()
      answerNote(trainer, 'C', half)

      trainer.check()

      expect(choicesOf(trainer)).toEqual(['C half', '- -', '- -'])
      expect(trainer.state.current).toBe(1)
    })

    it('drops the request on the next choice', () => {
      const trainer = start()
      trainer.check()

      trainer.select('C')

      expect(trainer.state.hint).toBe(false)
    })
  })

  // Criterion 15.
  describe('checking the first attempt', () => {
    it('grades every note right and ends the question for the right answer', () => {
      const trainer = start()
      answerThree(trainer, ['C', half], ['E', quarter], ['G', quarter])

      trainer.check()

      expect(trainer.state.firstGrade).toEqual([
        { pitch: true, duration: true },
        { pitch: true, duration: true },
        { pitch: true, duration: true },
      ])
      expect(trainer.state.outcome).toBe('correct')
    })

    it('grades the notes one by one, the duration ungraded when not asked', () => {
      const trainer = start(THREE, { askDuration: false })
      trainer.select('C')
      trainer.select('F')
      trainer.select('G')

      trainer.check()

      expect(trainer.state.firstGrade).toEqual([
        { pitch: true, duration: null },
        { pitch: false, duration: null },
        { pitch: true, duration: null },
      ])
    })

    it('opens the next question with the first note current and no choices', () => {
      const four = createTrainer(sourceOf(THREE, FOUR))
      answerThree(four, ['C', half], ['E', quarter], ['G', quarter])
      four.check()

      four.next()

      expect(four.state.question).toBe(FOUR)
      expect(four.state.current).toBe(0)
      expect(choicesOf(four)).toEqual(['- -', '- -', '- -', '- -'])
      expect(four.state.firstGrade).toBeNull()
    })
  })

  // Criterion 16: only the wrong notes are tried again, and only their wrong parts.
  describe('the second attempt', () => {
    // Note 1 right; note 2 with a wrong name (F for E); note 3 with a wrong duration.
    function triedWrong(question: Question = THREE) {
      const trainer = start(question)
      answerThree(trainer, ['C', half], ['F', quarter], ['G', eighth])
      trainer.check()
      return trainer
    }

    it('is not over yet', () => {
      expect(triedWrong().state.outcome).toBeNull()
    })

    it('makes the first wrong note the current one', () => {
      expect(triedWrong().state.current).toBe(1)
    })

    it('keeps the right parts and clears the wrong ones, which become the wrong choices', () => {
      expect(triedWrong().state.notes).toEqual([
        { selected: 'C', selectedDuration: half, wrongChoice: null, wrongDuration: null },
        { selected: null, selectedDuration: quarter, wrongChoice: 'F', wrongDuration: null },
        { selected: 'G', selectedDuration: null, wrongChoice: null, wrongDuration: eighth },
      ])
    })

    it('shows the wrong choice of the current note', () => {
      const { state } = triedWrong()

      expect(state.wrongChoice).toBe('F')
      expect(state.wrongDuration).toBeNull()
    })

    it('ignores the wrong name chosen again', () => {
      const trainer = triedWrong()

      trainer.select('F')

      expect(trainer.state.notes[1]?.selected).toBeNull()
    })

    it('keeps the right duration of a note whose name is wrong', () => {
      const trainer = triedWrong()

      trainer.selectDuration(half)

      expect(trainer.state.notes[1]?.selectedDuration).toEqual(quarter)
    })

    it('moves to the next wrong note once the current one is answered again', () => {
      const trainer = triedWrong()

      trainer.select('E')

      expect(trainer.state.current).toBe(2)
    })

    it('keeps the right name of a note whose duration is wrong', () => {
      const trainer = triedWrong()
      trainer.goToNote(2)

      trainer.select('A')
      trainer.selectDuration(eighth)

      expect(trainer.state.notes[2]).toMatchObject({ selected: 'G', selectedDuration: null })
    })

    it('goes only to the wrong notes', () => {
      const trainer = triedWrong()

      trainer.goToNote(0)
      expect(trainer.state.current).toBe(1)
      trainer.nextNote()
      expect(trainer.state.current).toBe(2)
      trainer.previousNote()
      expect(trainer.state.current).toBe(1)
      trainer.previousNote()
      expect(trainer.state.current).toBe(1)
    })

    it('skips the right notes between two wrong ones', () => {
      const trainer = start(FOUR)
      answerThree(trainer, ['D', quarter], ['D', quarter], ['E', quarter], ['G', quarter])
      trainer.check()

      expect(trainer.state.current).toBe(0)
      trainer.nextNote()
      expect(trainer.state.current).toBe(3)
      trainer.goToNote(2)
      expect(trainer.state.current).toBe(3)
    })

    it('asks for the answers while a wrong note has none', () => {
      const trainer = triedWrong()
      trainer.select('E')

      trainer.check()

      expect(trainer.state.hint).toBe(true)
      expect(trainer.state.outcome).toBeNull()
    })

    it('ends the question as right on the second try when every wrong part is put right', () => {
      const trainer = triedWrong()
      trainer.select('E')
      trainer.selectDuration(quarter)

      trainer.check()

      expect(trainer.state.outcome).toBe('correct-second-try')
    })

    it('keeps the grade of the first attempt', () => {
      const trainer = triedWrong()
      trainer.select('E')
      trainer.selectDuration(quarter)

      trainer.check()

      expect(trainer.state.firstGrade).toEqual([
        { pitch: true, duration: true },
        { pitch: false, duration: true },
        { pitch: true, duration: false },
      ])
    })

    it('ends the question as incorrect when one wrong part is wrong again', () => {
      const trainer = triedWrong()
      trainer.select('D')
      trainer.selectDuration(quarter)

      trainer.check()

      expect(trainer.state.outcome).toBe('incorrect')
      expect(choicesOf(trainer)).toEqual(['C half', 'D quarter', 'G quarter'])
    })

    it('ignores choosing after the question is over', () => {
      const trainer = triedWrong()
      trainer.select('D')
      trainer.selectDuration(quarter)
      trainer.check()
      const before = trainer.state

      trainer.select('E')
      trainer.selectDuration(half)
      trainer.check()

      expect(trainer.state).toEqual(before)
    })
  })

  // Criterion 17 with the right answer shown at once.
  describe('with one attempt', () => {
    it('ends the question as incorrect at once, keeping every choice and marking the wrong ones', () => {
      const trainer = start(THREE, { attempts: 1 })
      answerThree(trainer, ['C', half], ['F', quarter], ['G', eighth])

      trainer.check()

      expect(trainer.state.outcome).toBe('incorrect')
      expect(trainer.state.notes).toEqual([
        { selected: 'C', selectedDuration: half, wrongChoice: null, wrongDuration: null },
        { selected: 'F', selectedDuration: quarter, wrongChoice: 'F', wrongDuration: null },
        { selected: 'G', selectedDuration: eighth, wrongChoice: null, wrongDuration: eighth },
      ])
    })
  })

  describe('clearing the choice', () => {
    it('clears the choices of every note before the check', () => {
      const trainer = start()
      answerThree(trainer, ['C', half], ['E', quarter])

      trainer.clearChoice()

      expect(choicesOf(trainer)).toEqual(['- -', '- -', '- -'])
    })

    it('keeps the right parts during the second attempt', () => {
      const trainer = start()
      answerThree(trainer, ['C', half], ['F', quarter], ['G', eighth])
      trainer.check()
      trainer.select('E')

      trainer.clearChoice()

      expect(choicesOf(trainer)).toEqual(['C half', '- quarter', 'G -'])
    })

    // Slice 2: a clean question starts on its first note, as a new one does.
    it('goes back to the first note', () => {
      const trainer = start()
      answerThree(trainer, ['C', half], ['E', quarter])

      trainer.clearChoice()

      expect(trainer.state.current).toBe(0)
    })

    it('goes back to the first wrong note during the second attempt', () => {
      const trainer = start()
      answerThree(trainer, ['C', half], ['F', quarter], ['G', eighth])
      trainer.check()
      trainer.select('E')

      trainer.clearChoice()

      expect(trainer.state.current).toBe(1)
    })
  })
})

// Edge case 1: a question of one note works as before.
describe('a trainer on a question of one note', () => {
  it('has the one note current and keeps it current once answered', () => {
    const trainer = start(ONE)

    answerNote(trainer, 'A', whole)

    expect(trainer.state.current).toBe(0)
    expect(trainer.state.selected).toBe('A')
  })

  it('does not move with the next and previous note', () => {
    const trainer = start(ONE)

    trainer.nextNote()
    trainer.previousNote()

    expect(trainer.state.current).toBe(0)
  })
})
