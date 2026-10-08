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
      expect(state.grade).toBeNull()
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

      expect(trainer.state.grade).toBeNull()
    })
  })

  describe('checking', () => {
    it('grades the right name as correct', () => {
      const trainer = startOn('C')

      trainer.select('C')
      trainer.check()

      expect(trainer.state.grade).toEqual({ correct: true })
    })

    it('grades a wrong name as incorrect', () => {
      const trainer = startOn('C')

      trainer.select('D')
      trainer.check()

      expect(trainer.state.grade).toEqual({ correct: false })
    })

    it('grades against the current question, not a fixed note', () => {
      const trainer = startOn('A')

      trainer.select('A')
      trainer.check()

      expect(trainer.state.grade).toEqual({ correct: true })
    })

    it('keeps the question and the chosen name after the result', () => {
      const trainer = startOn('C')
      const question = trainer.state.question

      trainer.select('D')
      trainer.check()

      expect(trainer.state.question).toBe(question)
      expect(trainer.state.selected).toBe('D')
      expect(trainer.state.hint).toBe(false)
    })
  })

  describe('checking without a chosen name', () => {
    it('does not accept the answer and gives no result', () => {
      const trainer = startOn('C')

      trainer.check()

      expect(trainer.state.grade).toBeNull()
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

      expect(trainer.state.grade).toEqual({ correct: true })
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
      expect(trainer.state.grade).toBeNull()
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
      expect(trainer.state.grade).toBeNull()
      expect(trainer.state.hint).toBe(false)
    })

    it('leaves a graded question as it is', () => {
      const trainer = startOn('C')
      trainer.select('C')
      trainer.check()

      trainer.clearChoice()

      expect(trainer.state).toEqual({
        question: questionOn('C'),
        selected: 'C',
        grade: { correct: true },
        hint: false,
      })
    })
  })

  describe('after the result, before next', () => {
    it('ignores choosing another name', () => {
      const trainer = startOn('C')
      trainer.select('D')
      trainer.check()
      const before = trainer.state

      trainer.select('C')

      expect(trainer.state).toEqual(before)
      expect(trainer.state.selected).toBe('D')
      expect(trainer.state.grade).toEqual({ correct: false })
    })

    it('ignores checking again', () => {
      const trainer = startOn('C')
      trainer.select('C')
      trainer.check()
      const before = trainer.state

      trainer.check()

      expect(trainer.state).toEqual(before)
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

    it('clears the choice and the result', () => {
      const trainer = startOn('C', 'C')
      trainer.select('D')
      trainer.check()

      trainer.next()

      expect(trainer.state.selected).toBeNull()
      expect(trainer.state.grade).toBeNull()
      expect(trainer.state.hint).toBe(false)
    })

    it('lets the new question be answered', () => {
      const trainer = startOn('C', 'G')
      trainer.select('C')
      trainer.check()
      trainer.next()

      trainer.select('G')
      trainer.check()

      expect(trainer.state.grade).toEqual({ correct: true })
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
