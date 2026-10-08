import { describe, expect, it } from 'vitest'
import { createTrainer } from '@/application/trainer'
import type { Letter } from '@/domain/pitch'
import type { Question } from '@/domain/question'
import { createQuestion } from '@/domain/question'

const questionOn = (letter: Letter): Question =>
  createQuestion({ pitch: { letter, octave: 4 }, duration: { value: 'whole' } })

function sourceOf(...questions: Question[]) {
  const source = Object.assign(
    () => {
      const question = questions[source.calls]
      if (!question) throw new Error('question source exhausted')
      source.calls += 1
      return question
    },
    { calls: 0 },
  )
  return source
}

const startOn = (...letters: Letter[]) => createTrainer(sourceOf(...letters.map(questionOn)))

describe('trainer', () => {
  describe('when opened', () => {
    it('shows the first question from the source', () => {
      const first = questionOn('C')
      const source = sourceOf(first, questionOn('D'))

      const trainer = createTrainer(source)

      expect(trainer.state.question).toBe(first)
      expect(source.calls).toBe(1)
    })

    it('has no selected name, no result and no hint', () => {
      const { state } = startOn('C')

      expect(state.selected).toBeNull()
      expect(state.firstGrade).toBeNull()
      expect(state.outcome).toBeNull()
      expect(state.wrongChoice).toBeNull()
      expect(state.hint).toBe(false)
    })
  })

  describe('selecting a name', () => {
    it('marks the chosen name as selected', () => {
      const trainer = startOn('C')

      trainer.select('E')

      expect(trainer.state.selected).toBe('E')
    })

    it('replaces the previous choice with the new one', () => {
      const trainer = startOn('C')

      trainer.select('E')
      trainer.select('G')

      expect(trainer.state.selected).toBe('G')
    })

    it('does not grade the answer by itself', () => {
      const trainer = startOn('C')

      trainer.select('C')

      expect(trainer.state.firstGrade).toBeNull()
      expect(trainer.state.outcome).toBeNull()
    })
  })

  describe('checking the first attempt', () => {
    it('grades the right name as correct and ends the question', () => {
      const trainer = startOn('C')

      trainer.select('C')
      trainer.check()

      expect(trainer.state.firstGrade).toEqual({ correct: true })
      expect(trainer.state.outcome).toBe('correct')
    })

    it('grades against the current question, not a fixed note', () => {
      const trainer = startOn('A')

      trainer.select('A')
      trainer.check()

      expect(trainer.state.outcome).toBe('correct')
    })

    it('keeps the question and the chosen name after the result', () => {
      const trainer = startOn('C')
      const question = trainer.state.question

      trainer.select('C')
      trainer.check()

      expect(trainer.state.question).toBe(question)
      expect(trainer.state.selected).toBe('C')
      expect(trainer.state.wrongChoice).toBeNull()
      expect(trainer.state.hint).toBe(false)
    })

    it('grades a wrong name as incorrect, which is what the question counts as', () => {
      const trainer = startOn('C')

      trainer.select('D')
      trainer.check()

      expect(trainer.state.firstGrade).toEqual({ correct: false })
    })
  })

  describe('after a wrong first attempt', () => {
    function triedWrong(wrong: Letter = 'D') {
      const trainer = startOn('C', 'G')
      trainer.select(wrong)
      trainer.check()
      return trainer
    }

    it('asks to try again: the question is not over', () => {
      const trainer = triedWrong()

      expect(trainer.state.outcome).toBeNull()
    })

    it('keeps the wrongly chosen name as the wrong choice', () => {
      const trainer = triedWrong('E')

      expect(trainer.state.wrongChoice).toBe('E')
    })

    it('clears the choice and shows no hint', () => {
      const trainer = triedWrong()

      expect(trainer.state.selected).toBeNull()
      expect(trainer.state.hint).toBe(false)
    })

    it('keeps the same question', () => {
      const first = questionOn('C')
      const trainer = createTrainer(sourceOf(first, questionOn('G')))

      trainer.select('D')
      trainer.check()

      expect(trainer.state.question).toBe(first)
    })

    it('does not let the wrong choice be chosen again', () => {
      const trainer = triedWrong('D')

      trainer.select('D')

      expect(trainer.state.selected).toBeNull()
    })

    it('keeps another name chosen when the wrong choice is pressed again', () => {
      const trainer = triedWrong('D')
      trainer.select('E')

      trainer.select('D')

      expect(trainer.state.selected).toBe('E')
    })

    it('lets any other name be chosen', () => {
      const trainer = triedWrong('D')

      trainer.select('C')

      expect(trainer.state.selected).toBe('C')
    })
  })

  describe('checking the second attempt', () => {
    function secondAttempt(second: Letter) {
      const trainer = startOn('C', 'G')
      trainer.select('D')
      trainer.check()
      trainer.select(second)
      trainer.check()
      return trainer
    }

    it('ends the question as correct on the second try when the name is right', () => {
      const trainer = secondAttempt('C')

      expect(trainer.state.outcome).toBe('correct-second-try')
    })

    it('ends the question as incorrect when the name is wrong again', () => {
      const trainer = secondAttempt('E')

      expect(trainer.state.outcome).toBe('incorrect')
    })

    it('keeps the first attempt graded as incorrect, whatever the second one is', () => {
      expect(secondAttempt('C').state.firstGrade).toEqual({ correct: false })
      expect(secondAttempt('E').state.firstGrade).toEqual({ correct: false })
    })

    it('keeps both the wrong choice and the second chosen name for the review', () => {
      const { state } = secondAttempt('E')

      expect(state.wrongChoice).toBe('D')
      expect(state.selected).toBe('E')
      expect(state.hint).toBe(false)
    })

    it('shows the hint when nothing is chosen, leaving the question open', () => {
      const trainer = startOn('C')
      trainer.select('D')
      trainer.check()

      trainer.check()

      expect(trainer.state.hint).toBe(true)
      expect(trainer.state.outcome).toBeNull()
      expect(trainer.state.wrongChoice).toBe('D')
      expect(trainer.state.firstGrade).toEqual({ correct: false })
    })

    it('still accepts the second attempt after the hint', () => {
      const trainer = startOn('C')
      trainer.select('D')
      trainer.check()
      trainer.check()

      trainer.select('C')
      trainer.check()

      expect(trainer.state.outcome).toBe('correct-second-try')
      expect(trainer.state.hint).toBe(false)
    })
  })

  // Criterion 5: the right answer is shown at once, instead of a second attempt.
  describe('with one attempt', () => {
    const startWithOneAttemptOn = (...letters: Letter[]) =>
      createTrainer(sourceOf(...letters.map(questionOn)), { attempts: 1 })

    function triedWrong(wrong: Letter = 'D') {
      const trainer = startWithOneAttemptOn('C', 'G')
      trainer.select(wrong)
      trainer.check()
      return trainer
    }

    it('ends the question as correct when the name is right', () => {
      const trainer = startWithOneAttemptOn('C')

      trainer.select('C')
      trainer.check()

      expect(trainer.state.firstGrade).toEqual({ correct: true })
      expect(trainer.state.outcome).toBe('correct')
      expect(trainer.state.wrongChoice).toBeNull()
    })

    it('ends the question as incorrect at once when the name is wrong', () => {
      const trainer = triedWrong()

      expect(trainer.state.firstGrade).toEqual({ correct: false })
      expect(trainer.state.outcome).toBe('incorrect')
    })

    // The review names the last chosen name and marks it, as after a wrong second attempt.
    it('keeps the wrong name as both the chosen one and the wrong choice', () => {
      const first = questionOn('C')
      const trainer = createTrainer(sourceOf(first, questionOn('G')), { attempts: 1 })

      trainer.select('E')
      trainer.check()

      expect(trainer.state).toEqual({
        question: first,
        selected: 'E',
        firstGrade: { correct: false },
        outcome: 'incorrect',
        wrongChoice: 'E',
        hint: false,
      })
    })

    it('ignores choosing and checking again after a wrong name', () => {
      const trainer = triedWrong('D')
      const before = trainer.state

      trainer.select('C')
      trainer.check()

      expect(trainer.state).toEqual(before)
    })

    it('still shows the hint on check without a name, leaving the question open', () => {
      const trainer = startWithOneAttemptOn('C')

      trainer.check()

      expect(trainer.state.hint).toBe(true)
      expect(trainer.state.firstGrade).toBeNull()
      expect(trainer.state.outcome).toBeNull()
    })

    it('opens the next question with one attempt again', () => {
      const trainer = triedWrong('D')

      trainer.next()
      trainer.select('A')
      trainer.check()

      expect(trainer.state.outcome).toBe('incorrect')
      expect(trainer.state.wrongChoice).toBe('A')
    })
  })

  describe('with two attempts given explicitly', () => {
    it('asks to try again after a wrong name, as by default', () => {
      const trainer = createTrainer(sourceOf(questionOn('C')), { attempts: 2 })

      trainer.select('D')
      trainer.check()

      expect(trainer.state.outcome).toBeNull()
      expect(trainer.state.wrongChoice).toBe('D')
      expect(trainer.state.selected).toBeNull()
    })
  })

  describe('checking without a chosen name', () => {
    it('does not accept the answer and gives no result', () => {
      const trainer = startOn('C')

      trainer.check()

      expect(trainer.state.firstGrade).toBeNull()
      expect(trainer.state.outcome).toBeNull()
      expect(trainer.state.selected).toBeNull()
    })

    it('shows the hint to choose a name', () => {
      const trainer = startOn('C')

      trainer.check()

      expect(trainer.state.hint).toBe(true)
    })

    it('hides the hint once a name is chosen', () => {
      const trainer = startOn('C')

      trainer.check()
      trainer.select('F')

      expect(trainer.state.hint).toBe(false)
      expect(trainer.state.selected).toBe('F')
    })

    it('still accepts the answer after the hint', () => {
      const trainer = startOn('C')

      trainer.check()
      trainer.select('C')
      trainer.check()

      expect(trainer.state.outcome).toBe('correct')
      expect(trainer.state.hint).toBe(false)
    })
  })

  describe('clearing the choice', () => {
    it('hides the shown hint, leaving nothing chosen and no result', () => {
      const trainer = startOn('C')
      trainer.check()

      trainer.clearChoice()

      expect(trainer.state.hint).toBe(false)
      expect(trainer.state.selected).toBeNull()
      expect(trainer.state.firstGrade).toBeNull()
      expect(trainer.state.outcome).toBeNull()
    })

    it('keeps the question', () => {
      const first = questionOn('C')
      const trainer = createTrainer(sourceOf(first, questionOn('D')))
      trainer.check()

      trainer.clearChoice()

      expect(trainer.state.question).toBe(first)
    })

    it('lets the hint show again on the next check without a name', () => {
      const trainer = startOn('C')
      trainer.check()
      trainer.clearChoice()

      trainer.check()

      expect(trainer.state.hint).toBe(true)
    })

    it('unselects a chosen name before the check', () => {
      const trainer = startOn('C')
      trainer.select('E')

      trainer.clearChoice()

      expect(trainer.state.selected).toBeNull()
      expect(trainer.state.firstGrade).toBeNull()
      expect(trainer.state.hint).toBe(false)
    })

    it('keeps the second attempt going with its wrong choice', () => {
      const trainer = startOn('C')
      trainer.select('D')
      trainer.check()
      trainer.select('E')

      trainer.clearChoice()

      expect(trainer.state).toEqual({
        question: questionOn('C'),
        selected: null,
        firstGrade: { correct: false },
        outcome: null,
        wrongChoice: 'D',
        hint: false,
      })
    })

    it('leaves a finished question as it is', () => {
      const trainer = startOn('C')
      trainer.select('C')
      trainer.check()

      trainer.clearChoice()

      expect(trainer.state).toEqual({
        question: questionOn('C'),
        selected: 'C',
        firstGrade: { correct: true },
        outcome: 'correct',
        wrongChoice: null,
        hint: false,
      })
    })
  })

  describe('after the question is over, before next', () => {
    it('ignores choosing another name after the first try', () => {
      const trainer = startOn('C')
      trainer.select('C')
      trainer.check()
      const before = trainer.state

      trainer.select('D')

      expect(trainer.state).toEqual(before)
    })

    it('ignores choosing another name after the second try', () => {
      const trainer = startOn('C')
      trainer.select('D')
      trainer.check()
      trainer.select('E')
      trainer.check()
      const before = trainer.state

      trainer.select('C')

      expect(trainer.state).toEqual(before)
      expect(trainer.state.selected).toBe('E')
    })

    it('ignores checking again', () => {
      const trainer = startOn('C')
      trainer.select('D')
      trainer.check()
      trainer.select('E')
      trainer.check()
      const before = trainer.state

      trainer.check()

      expect(trainer.state).toEqual(before)
      expect(trainer.state.outcome).toBe('incorrect')
    })
  })

  describe('next', () => {
    it('takes a new question from the source', () => {
      const second = questionOn('G')
      const source = sourceOf(questionOn('C'), second)
      const trainer = createTrainer(source)
      trainer.select('C')
      trainer.check()

      trainer.next()

      expect(trainer.state.question).toBe(second)
      expect(source.calls).toBe(2)
    })

    it('clears the choice, the result and the wrong choice', () => {
      const trainer = startOn('C', 'C')
      trainer.select('D')
      trainer.check()
      trainer.select('E')
      trainer.check()

      trainer.next()

      expect(trainer.state.selected).toBeNull()
      expect(trainer.state.firstGrade).toBeNull()
      expect(trainer.state.outcome).toBeNull()
      expect(trainer.state.wrongChoice).toBeNull()
      expect(trainer.state.hint).toBe(false)
    })

    it('lets the new question be answered with the first attempt again', () => {
      const trainer = startOn('C', 'G')
      trainer.select('D')
      trainer.check()
      trainer.select('C')
      trainer.check()
      trainer.next()

      trainer.select('G')
      trainer.check()

      expect(trainer.state.outcome).toBe('correct')
      expect(trainer.state.firstGrade).toEqual({ correct: true })
    })

    it('lets the name rejected on the previous question be chosen again', () => {
      const trainer = startOn('C', 'D')
      trainer.select('D')
      trainer.check()
      trainer.select('C')
      trainer.check()
      trainer.next()

      trainer.select('D')

      expect(trainer.state.selected).toBe('D')
    })

    // The quick mode of this slice still moves on right after a wrong answer;
    // the first attempt is already counted, so leaving is safe.
    it('leaves the second attempt for a new question', () => {
      const second = questionOn('G')
      const source = sourceOf(questionOn('C'), second)
      const trainer = createTrainer(source)
      trainer.select('D')
      trainer.check()

      trainer.next()

      expect(trainer.state.question).toBe(second)
      expect(trainer.state.wrongChoice).toBeNull()
      expect(trainer.state.firstGrade).toBeNull()
    })

    it('does nothing before the answer is checked', () => {
      const source = sourceOf(questionOn('C'), questionOn('D'))
      const trainer = createTrainer(source)
      trainer.select('E')
      const before = trainer.state

      trainer.next()

      expect(trainer.state).toEqual(before)
      expect(source.calls).toBe(1)
    })

    it('does nothing while only the hint is shown', () => {
      const source = sourceOf(questionOn('C'), questionOn('D'))
      const trainer = createTrainer(source)
      trainer.check()
      const before = trainer.state

      trainer.next()

      expect(trainer.state).toEqual(before)
      expect(source.calls).toBe(1)
    })
  })

  describe('state snapshot', () => {
    it('is replaced, not mutated, on every change', () => {
      const trainer = startOn('C')
      const opened = trainer.state

      trainer.select('D')

      expect(trainer.state).not.toBe(opened)
      expect(opened.selected).toBeNull()
    })
  })
})
