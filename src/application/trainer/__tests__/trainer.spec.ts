import { describe, expect, it } from 'vitest'
import { createTrainer } from '@/application/trainer'
import type { Trainer } from '@/application/trainer'
import type { Letter } from '@/domain/pitch'
import type { Duration, Question } from '@/domain/question'
import { createQuestion } from '@/domain/question'

const whole: Duration = { value: 'whole' }
const half: Duration = { value: 'half' }
const quarter: Duration = { value: 'quarter' }
const eighth: Duration = { value: 'eighth' }

const questionOn = (letter: Letter, duration: Duration = whole): Question =>
  createQuestion({ pitch: { letter, octave: 4 }, duration })

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

// Every question is a whole note unless given otherwise.
const startOn = (...letters: Letter[]) =>
  createTrainer(sourceOf(...letters.map((l) => questionOn(l))))

function answer(trainer: Trainer, letter: Letter, duration: Duration = whole) {
  trainer.select(letter)
  trainer.selectDuration(duration)
  trainer.check()
}

describe('trainer', () => {
  describe('when opened', () => {
    it('shows the first question from the source', () => {
      const first = questionOn('C')
      const source = sourceOf(first, questionOn('D'))

      const trainer = createTrainer(source)

      expect(trainer.state.question).toBe(first)
      expect(source.calls).toBe(1)
    })

    it('has no selected name or duration, no result and no hint', () => {
      const { state } = startOn('C')

      expect(state.selected).toBeNull()
      expect(state.selectedDuration).toBeNull()
      expect(state.firstGrade).toBeNull()
      expect(state.outcome).toBeNull()
      expect(state.wrongChoice).toBeNull()
      expect(state.wrongDuration).toBeNull()
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

  describe('selecting a duration', () => {
    it('marks the chosen duration as selected', () => {
      const trainer = startOn('C')

      trainer.selectDuration(quarter)

      expect(trainer.state.selectedDuration).toEqual(quarter)
    })

    it('replaces the previous choice with the new one', () => {
      const trainer = startOn('C')

      trainer.selectDuration(quarter)
      trainer.selectDuration(eighth)

      expect(trainer.state.selectedDuration).toEqual(eighth)
    })

    it('keeps the chosen name, in whichever order both are chosen', () => {
      const nameFirst = startOn('C')
      nameFirst.select('E')
      nameFirst.selectDuration(half)

      const durationFirst = startOn('C')
      durationFirst.selectDuration(half)
      durationFirst.select('E')

      expect(nameFirst.state.selected).toBe('E')
      expect(nameFirst.state.selectedDuration).toEqual(half)
      expect(durationFirst.state).toEqual(nameFirst.state)
    })

    it('does not grade the answer by itself, even with a name chosen', () => {
      const trainer = startOn('C')
      trainer.select('C')

      trainer.selectDuration(whole)

      expect(trainer.state.firstGrade).toBeNull()
      expect(trainer.state.outcome).toBeNull()
    })
  })

  describe('checking the first attempt', () => {
    it('grades the right name and duration as correct and ends the question', () => {
      const trainer = startOn('C')

      answer(trainer, 'C', whole)

      expect(trainer.state.firstGrade).toEqual({ pitch: true, duration: true })
      expect(trainer.state.outcome).toBe('correct')
    })

    it('grades against the current question, not a fixed note', () => {
      const trainer = createTrainer(sourceOf(questionOn('A', eighth)))

      answer(trainer, 'A', eighth)

      expect(trainer.state.outcome).toBe('correct')
    })

    it('keeps the question and the chosen name and duration after the result', () => {
      const trainer = startOn('C')
      const question = trainer.state.question

      answer(trainer, 'C', whole)

      expect(trainer.state.question).toBe(question)
      expect(trainer.state.selected).toBe('C')
      expect(trainer.state.selectedDuration).toEqual(whole)
      expect(trainer.state.wrongChoice).toBeNull()
      expect(trainer.state.wrongDuration).toBeNull()
      expect(trainer.state.hint).toBe(false)
    })

    it('grades the name and the duration separately', () => {
      const wrongName = startOn('C')
      answer(wrongName, 'D', whole)

      const wrongDuration = startOn('C')
      answer(wrongDuration, 'C', half)

      const bothWrong = startOn('C')
      answer(bothWrong, 'D', half)

      expect(wrongName.state.firstGrade).toEqual({ pitch: false, duration: true })
      expect(wrongDuration.state.firstGrade).toEqual({ pitch: true, duration: false })
      expect(bothWrong.state.firstGrade).toEqual({ pitch: false, duration: false })
    })
  })

  describe('after a wrong name in the first attempt', () => {
    function triedWrong(wrong: Letter = 'D') {
      const trainer = startOn('C', 'G')
      answer(trainer, wrong, whole)
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

    it('clears the name and shows no hint', () => {
      const trainer = triedWrong()

      expect(trainer.state.selected).toBeNull()
      expect(trainer.state.hint).toBe(false)
    })

    it('keeps the right duration chosen and has no wrong duration', () => {
      const trainer = triedWrong()

      expect(trainer.state.selectedDuration).toEqual(whole)
      expect(trainer.state.wrongDuration).toBeNull()
    })

    it('does not let the right duration be changed', () => {
      const trainer = triedWrong()

      trainer.selectDuration(half)

      expect(trainer.state.selectedDuration).toEqual(whole)
    })

    it('keeps the same question', () => {
      const first = questionOn('C')
      const trainer = createTrainer(sourceOf(first, questionOn('G')))

      answer(trainer, 'D', whole)

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

  describe('after a wrong duration in the first attempt', () => {
    function triedWrongDuration(wrong: Duration = quarter) {
      const trainer = createTrainer(sourceOf(questionOn('C', half), questionOn('G')))
      answer(trainer, 'C', wrong)
      return trainer
    }

    it('asks to try again: the question is not over', () => {
      expect(triedWrongDuration().state.outcome).toBeNull()
    })

    it('keeps the wrongly chosen duration as the wrong duration and clears the duration', () => {
      const { state } = triedWrongDuration(eighth)

      expect(state.wrongDuration).toEqual(eighth)
      expect(state.selectedDuration).toBeNull()
      expect(state.hint).toBe(false)
    })

    it('keeps the right name chosen and has no wrong name', () => {
      const { state } = triedWrongDuration()

      expect(state.selected).toBe('C')
      expect(state.wrongChoice).toBeNull()
    })

    it('does not let the right name be changed', () => {
      const trainer = triedWrongDuration()

      trainer.select('D')

      expect(trainer.state.selected).toBe('C')
    })

    it('does not let the wrong duration be chosen again', () => {
      const trainer = triedWrongDuration(quarter)
      trainer.selectDuration(whole)

      trainer.selectDuration(quarter)

      expect(trainer.state.selectedDuration).toEqual(whole)
    })

    it('lets any other duration be chosen', () => {
      const trainer = triedWrongDuration(quarter)

      trainer.selectDuration(half)

      expect(trainer.state.selectedDuration).toEqual(half)
    })
  })

  describe('after a wrong name and a wrong duration in the first attempt', () => {
    function triedBothWrong() {
      const trainer = createTrainer(sourceOf(questionOn('C', half)))
      answer(trainer, 'D', quarter)
      return trainer
    }

    it('asks to try again with both cleared and both kept as wrong', () => {
      const { state } = triedBothWrong()

      expect(state.outcome).toBeNull()
      expect(state.selected).toBeNull()
      expect(state.selectedDuration).toBeNull()
      expect(state.wrongChoice).toBe('D')
      expect(state.wrongDuration).toEqual(quarter)
    })

    it('lets another name and another duration be chosen', () => {
      const trainer = triedBothWrong()

      trainer.select('E')
      trainer.selectDuration(eighth)

      expect(trainer.state.selected).toBe('E')
      expect(trainer.state.selectedDuration).toEqual(eighth)
    })
  })

  describe('checking the second attempt', () => {
    function secondAttempt(second: Letter) {
      const trainer = startOn('C', 'G')
      answer(trainer, 'D', whole)
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

    it('keeps the first attempt graded as it was, whatever the second one is', () => {
      expect(secondAttempt('C').state.firstGrade).toEqual({ pitch: false, duration: true })
      expect(secondAttempt('E').state.firstGrade).toEqual({ pitch: false, duration: true })
    })

    it('keeps both the wrong choice and the second chosen name for the review', () => {
      const { state } = secondAttempt('E')

      expect(state.wrongChoice).toBe('D')
      expect(state.selected).toBe('E')
      expect(state.selectedDuration).toEqual(whole)
      expect(state.hint).toBe(false)
    })

    it('shows the hint when nothing is chosen, leaving the question open', () => {
      const trainer = startOn('C')
      answer(trainer, 'D', whole)

      trainer.check()

      expect(trainer.state.hint).toBe(true)
      expect(trainer.state.outcome).toBeNull()
      expect(trainer.state.wrongChoice).toBe('D')
      expect(trainer.state.firstGrade).toEqual({ pitch: false, duration: true })
    })

    it('still accepts the second attempt after the hint', () => {
      const trainer = startOn('C')
      answer(trainer, 'D', whole)
      trainer.check()

      trainer.select('C')
      trainer.check()

      expect(trainer.state.outcome).toBe('correct-second-try')
      expect(trainer.state.hint).toBe(false)
    })
  })

  describe('checking the second attempt on the duration', () => {
    function secondAttempt(second: Duration) {
      const trainer = createTrainer(sourceOf(questionOn('C', half)))
      answer(trainer, 'C', quarter)
      trainer.selectDuration(second)
      trainer.check()
      return trainer
    }

    it('ends the question as correct on the second try when the duration is right', () => {
      expect(secondAttempt(half).state.outcome).toBe('correct-second-try')
    })

    it('ends the question as incorrect when the duration is wrong again', () => {
      expect(secondAttempt(eighth).state.outcome).toBe('incorrect')
    })

    it('keeps the wrong and the second chosen durations for the review', () => {
      const { state } = secondAttempt(eighth)

      expect(state.wrongDuration).toEqual(quarter)
      expect(state.selectedDuration).toEqual(eighth)
      expect(state.selected).toBe('C')
      expect(state.wrongChoice).toBeNull()
    })

    it('shows the hint when no duration is chosen, the right name being kept', () => {
      const trainer = createTrainer(sourceOf(questionOn('C', half)))
      answer(trainer, 'C', quarter)

      trainer.check()

      expect(trainer.state.hint).toBe(true)
      expect(trainer.state.outcome).toBeNull()
      expect(trainer.state.selected).toBe('C')
    })
  })

  describe('checking the second attempt on both', () => {
    function secondAttempt(letter: Letter, duration: Duration) {
      const trainer = createTrainer(sourceOf(questionOn('C', half)))
      answer(trainer, 'D', quarter)
      trainer.select(letter)
      trainer.selectDuration(duration)
      trainer.check()
      return trainer
    }

    it('ends the question as correct on the second try when both are right', () => {
      expect(secondAttempt('C', half).state.outcome).toBe('correct-second-try')
    })

    it('ends the question as incorrect when either is wrong again', () => {
      expect(secondAttempt('E', half).state.outcome).toBe('incorrect')
      expect(secondAttempt('C', eighth).state.outcome).toBe('incorrect')
      expect(secondAttempt('E', eighth).state.outcome).toBe('incorrect')
    })

    it('shows the hint while one of them is not chosen', () => {
      const nameOnly = createTrainer(sourceOf(questionOn('C', half)))
      answer(nameOnly, 'D', quarter)
      nameOnly.select('C')
      nameOnly.check()

      const durationOnly = createTrainer(sourceOf(questionOn('C', half)))
      answer(durationOnly, 'D', quarter)
      durationOnly.selectDuration(half)
      durationOnly.check()

      expect(nameOnly.state.hint).toBe(true)
      expect(nameOnly.state.outcome).toBeNull()
      expect(durationOnly.state.hint).toBe(true)
      expect(durationOnly.state.outcome).toBeNull()
    })
  })

  // Criterion 5: the right answer is shown at once, instead of a second attempt.
  describe('with one attempt', () => {
    const startWithOneAttemptOn = (...letters: Letter[]) =>
      createTrainer(sourceOf(...letters.map((l) => questionOn(l))), { attempts: 1 })

    function triedWrong(wrong: Letter = 'D') {
      const trainer = startWithOneAttemptOn('C', 'G')
      answer(trainer, wrong, whole)
      return trainer
    }

    it('ends the question as correct when both are right', () => {
      const trainer = startWithOneAttemptOn('C')

      answer(trainer, 'C', whole)

      expect(trainer.state.firstGrade).toEqual({ pitch: true, duration: true })
      expect(trainer.state.outcome).toBe('correct')
      expect(trainer.state.wrongChoice).toBeNull()
      expect(trainer.state.wrongDuration).toBeNull()
    })

    it('ends the question as incorrect at once when the name is wrong', () => {
      const trainer = triedWrong()

      expect(trainer.state.firstGrade).toEqual({ pitch: false, duration: true })
      expect(trainer.state.outcome).toBe('incorrect')
    })

    it('ends the question as incorrect at once when only the duration is wrong', () => {
      const trainer = startWithOneAttemptOn('C')

      answer(trainer, 'C', eighth)

      expect(trainer.state.firstGrade).toEqual({ pitch: true, duration: false })
      expect(trainer.state.outcome).toBe('incorrect')
    })

    // The review names the last choices and marks the wrong ones, as after a wrong second attempt.
    it('keeps the wrong name as both the chosen one and the wrong choice', () => {
      const first = questionOn('C')
      const trainer = createTrainer(sourceOf(first, questionOn('G')), { attempts: 1 })

      answer(trainer, 'E', whole)

      expect(trainer.state).toEqual({
        question: first,
        selected: 'E',
        selectedDuration: whole,
        firstGrade: { pitch: false, duration: true },
        outcome: 'incorrect',
        wrongChoice: 'E',
        wrongDuration: null,
        hint: false,
      })
    })

    it('keeps the wrong duration as both the chosen one and the wrong duration', () => {
      const first = questionOn('C', half)
      const trainer = createTrainer(sourceOf(first), { attempts: 1 })

      answer(trainer, 'C', quarter)

      expect(trainer.state).toEqual({
        question: first,
        selected: 'C',
        selectedDuration: quarter,
        firstGrade: { pitch: true, duration: false },
        outcome: 'incorrect',
        wrongChoice: null,
        wrongDuration: quarter,
        hint: false,
      })
    })

    it('ignores choosing and checking again after a wrong answer', () => {
      const trainer = triedWrong('D')
      const before = trainer.state

      trainer.select('C')
      trainer.selectDuration(half)
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
      answer(trainer, 'A', whole)

      expect(trainer.state.outcome).toBe('incorrect')
      expect(trainer.state.wrongChoice).toBe('A')
    })
  })

  describe('with two attempts given explicitly', () => {
    it('asks to try again after a wrong name, as by default', () => {
      const trainer = createTrainer(sourceOf(questionOn('C')), { attempts: 2 })

      answer(trainer, 'D', whole)

      expect(trainer.state.outcome).toBeNull()
      expect(trainer.state.wrongChoice).toBe('D')
      expect(trainer.state.selected).toBeNull()
    })
  })

  describe('checking without a full answer', () => {
    it('does not accept the answer and gives no result when nothing is chosen', () => {
      const trainer = startOn('C')

      trainer.check()

      expect(trainer.state.firstGrade).toBeNull()
      expect(trainer.state.outcome).toBeNull()
      expect(trainer.state.selected).toBeNull()
      expect(trainer.state.selectedDuration).toBeNull()
    })

    it('shows the hint when nothing is chosen', () => {
      const trainer = startOn('C')

      trainer.check()

      expect(trainer.state.hint).toBe(true)
    })

    it('shows the hint and keeps the name when only a name is chosen', () => {
      const trainer = startOn('C')
      trainer.select('C')

      trainer.check()

      expect(trainer.state.hint).toBe(true)
      expect(trainer.state.firstGrade).toBeNull()
      expect(trainer.state.selected).toBe('C')
    })

    it('shows the hint and keeps the duration when only a duration is chosen', () => {
      const trainer = startOn('C')
      trainer.selectDuration(whole)

      trainer.check()

      expect(trainer.state.hint).toBe(true)
      expect(trainer.state.firstGrade).toBeNull()
      expect(trainer.state.selectedDuration).toEqual(whole)
    })

    it('hides the hint once a name is chosen', () => {
      const trainer = startOn('C')

      trainer.check()
      trainer.select('F')

      expect(trainer.state.hint).toBe(false)
      expect(trainer.state.selected).toBe('F')
    })

    it('hides the hint once a duration is chosen', () => {
      const trainer = startOn('C')

      trainer.check()
      trainer.selectDuration(half)

      expect(trainer.state.hint).toBe(false)
      expect(trainer.state.selectedDuration).toEqual(half)
    })

    it('still accepts the answer after the hint', () => {
      const trainer = startOn('C')

      trainer.check()
      answer(trainer, 'C', whole)

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
      expect(trainer.state.selectedDuration).toBeNull()
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

    it('unselects a chosen name and duration before the check', () => {
      const trainer = startOn('C')
      trainer.select('E')
      trainer.selectDuration(half)

      trainer.clearChoice()

      expect(trainer.state.selected).toBeNull()
      expect(trainer.state.selectedDuration).toBeNull()
      expect(trainer.state.firstGrade).toBeNull()
      expect(trainer.state.hint).toBe(false)
    })

    it('keeps the second attempt going with its wrong choice and the right duration', () => {
      const trainer = startOn('C')
      answer(trainer, 'D', whole)
      trainer.select('E')

      trainer.clearChoice()

      expect(trainer.state).toEqual({
        question: questionOn('C'),
        selected: null,
        selectedDuration: whole,
        firstGrade: { pitch: false, duration: true },
        outcome: null,
        wrongChoice: 'D',
        wrongDuration: null,
        hint: false,
      })
    })

    it('keeps the right name when the duration is tried again', () => {
      const trainer = createTrainer(sourceOf(questionOn('C', half)))
      answer(trainer, 'C', quarter)
      trainer.selectDuration(eighth)

      trainer.clearChoice()

      expect(trainer.state).toEqual({
        question: questionOn('C', half),
        selected: 'C',
        selectedDuration: null,
        firstGrade: { pitch: true, duration: false },
        outcome: null,
        wrongChoice: null,
        wrongDuration: quarter,
        hint: false,
      })
    })

    it('leaves a finished question as it is', () => {
      const trainer = startOn('C')
      answer(trainer, 'C', whole)

      trainer.clearChoice()

      expect(trainer.state).toEqual({
        question: questionOn('C'),
        selected: 'C',
        selectedDuration: whole,
        firstGrade: { pitch: true, duration: true },
        outcome: 'correct',
        wrongChoice: null,
        wrongDuration: null,
        hint: false,
      })
    })
  })

  describe('after the question is over, before next', () => {
    it('ignores choosing another name or duration after the first try', () => {
      const trainer = startOn('C')
      answer(trainer, 'C', whole)
      const before = trainer.state

      trainer.select('D')
      trainer.selectDuration(half)

      expect(trainer.state).toEqual(before)
    })

    it('ignores choosing another name or duration after the second try', () => {
      const trainer = createTrainer(sourceOf(questionOn('C', half)))
      answer(trainer, 'D', quarter)
      answer(trainer, 'E', eighth)
      const before = trainer.state

      trainer.select('C')
      trainer.selectDuration(half)

      expect(trainer.state).toEqual(before)
      expect(trainer.state.selected).toBe('E')
      expect(trainer.state.selectedDuration).toEqual(eighth)
    })

    it('ignores checking again', () => {
      const trainer = startOn('C')
      answer(trainer, 'D', whole)
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
      answer(trainer, 'C', whole)

      trainer.next()

      expect(trainer.state.question).toBe(second)
      expect(source.calls).toBe(2)
    })

    it('clears the choices, the result and the wrong choices', () => {
      const trainer = createTrainer(sourceOf(questionOn('C', half), questionOn('C')))
      answer(trainer, 'D', quarter)
      answer(trainer, 'E', eighth)

      trainer.next()

      expect(trainer.state.selected).toBeNull()
      expect(trainer.state.selectedDuration).toBeNull()
      expect(trainer.state.firstGrade).toBeNull()
      expect(trainer.state.outcome).toBeNull()
      expect(trainer.state.wrongChoice).toBeNull()
      expect(trainer.state.wrongDuration).toBeNull()
      expect(trainer.state.hint).toBe(false)
    })

    it('lets the new question be answered with the first attempt again', () => {
      const trainer = startOn('C', 'G')
      answer(trainer, 'D', whole)
      trainer.select('C')
      trainer.check()
      trainer.next()

      answer(trainer, 'G', whole)

      expect(trainer.state.outcome).toBe('correct')
      expect(trainer.state.firstGrade).toEqual({ pitch: true, duration: true })
    })

    it('lets the name and the duration rejected on the previous question be chosen again', () => {
      const trainer = createTrainer(sourceOf(questionOn('C', half), questionOn('D')))
      answer(trainer, 'D', quarter)
      answer(trainer, 'C', half)
      trainer.next()

      trainer.select('D')
      trainer.selectDuration(quarter)

      expect(trainer.state.selected).toBe('D')
      expect(trainer.state.selectedDuration).toEqual(quarter)
    })

    // The quick mode leaves a question during the second attempt when turned on;
    // the first attempt is already counted, so leaving is safe.
    it('leaves the second attempt for a new question', () => {
      const second = questionOn('G')
      const source = sourceOf(questionOn('C'), second)
      const trainer = createTrainer(source)
      answer(trainer, 'D', whole)

      trainer.next()

      expect(trainer.state.question).toBe(second)
      expect(trainer.state.wrongChoice).toBeNull()
      expect(trainer.state.firstGrade).toBeNull()
    })

    it('does nothing before the answer is checked', () => {
      const source = sourceOf(questionOn('C'), questionOn('D'))
      const trainer = createTrainer(source)
      trainer.select('E')
      trainer.selectDuration(half)
      const before = trainer.state

      trainer.next()

      expect(trainer.state).toEqual(before)
      expect(source.calls).toBe(1)
    })

    it('does nothing while only the hint is shown', () => {
      const source = sourceOf(questionOn('C'), questionOn('D'))
      const trainer = createTrainer(source)
      trainer.select('C')
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
      const named = trainer.state
      trainer.selectDuration(half)

      expect(trainer.state).not.toBe(opened)
      expect(trainer.state).not.toBe(named)
      expect(opened.selected).toBeNull()
      expect(named.selectedDuration).toBeNull()
    })
  })
})
