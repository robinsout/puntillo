import { describe, expect, it } from 'vitest'
import { createAutoAdvance } from '@/application/auto-advance'
import type { Scheduler } from '@/application/ports'
import { createTrainer } from '@/application/trainer'
import type { Letter } from '@/domain/pitch'
import type { Question } from '@/domain/question'
import { createQuestion } from '@/domain/question'

const questionOn = (letter: Letter): Question =>
  createQuestion({ pitch: { letter, octave: 4 }, duration: { value: 'whole' } })

function fakeScheduler() {
  let now = 0
  let tasks: { due: number; task: () => void }[] = []

  const scheduler: Scheduler = {
    schedule(ms, task) {
      const entry = { due: now + ms, task }
      tasks.push(entry)
      return () => {
        tasks = tasks.filter((other) => other !== entry)
      }
    },
  }

  return {
    scheduler,
    get pending() {
      return tasks.length
    },
    elapse(ms: number) {
      now += ms
      const due = tasks.filter((entry) => entry.due <= now)
      tasks = tasks.filter((entry) => entry.due > now)
      due.forEach((entry) => entry.task())
    },
  }
}

function setup(...letters: Letter[]) {
  const questions = letters.map(questionOn)
  let served = 0
  const trainer = createTrainer(() => {
    const question = questions[served]
    if (!question) throw new Error('question source exhausted')
    served += 1
    return question
  })
  const clock = fakeScheduler()
  const advances = { count: 0 }
  const log: string[] = []
  const auto = createAutoAdvance(trainer, clock.scheduler, {
    next: () => {
      log.push('next')
      trainer.next()
    },
    onAdvance: () => {
      log.push('onAdvance')
      advances.count += 1
    },
  })
  return { auto, clock, questions, advances, log }
}

const answer = (auto: { select(letter: Letter): void; check(): void }, letter: Letter) => {
  auto.select(letter)
  auto.check()
}

describe('auto-advance', () => {
  describe('when opened', () => {
    it('is off', () => {
      const { auto } = setup('C', 'D')

      expect(auto.enabled).toBe(false)
    })

    it('shows the trainer state as is', () => {
      const { auto, questions } = setup('C', 'D')

      expect(auto.state.question).toBe(questions[0])
      expect(auto.state.selected).toBeNull()
      expect(auto.state.grade).toBeNull()
    })
  })

  describe('when on', () => {
    it('opens the next question exactly 1.5 seconds after the result', () => {
      const { auto, clock, questions } = setup('C', 'D')
      auto.setEnabled(true)

      answer(auto, 'C')
      clock.elapse(1499)

      expect(auto.state.question).toBe(questions[0])
      expect(auto.state.grade).toEqual({ correct: true })

      clock.elapse(1)

      expect(auto.state.question).toBe(questions[1])
      expect(auto.state.selected).toBeNull()
      expect(auto.state.grade).toBeNull()
      expect(auto.state.hint).toBe(false)
    })

    it('advances after a wrong answer too', () => {
      const { auto, clock, questions } = setup('C', 'D')
      auto.setEnabled(true)

      answer(auto, 'E')
      clock.elapse(1500)

      expect(auto.state.question).toBe(questions[1])
    })

    it('reports the automatic advance once', () => {
      const { auto, clock, advances } = setup('C', 'D')
      auto.setEnabled(true)

      answer(auto, 'C')

      expect(advances.count).toBe(0)

      clock.elapse(1500)

      expect(advances.count).toBe(1)
    })

    it('does not start on the hint (check without a chosen name)', () => {
      const { auto, clock, questions, advances } = setup('C', 'D')
      auto.setEnabled(true)

      auto.check()

      expect(auto.state.hint).toBe(true)
      expect(clock.pending).toBe(0)

      clock.elapse(1500)

      expect(auto.state.question).toBe(questions[0])
      expect(advances.count).toBe(0)
    })

    it('schedules only once when check is pressed again during the pause', () => {
      const { auto, clock, questions } = setup('C', 'D', 'E')
      auto.setEnabled(true)

      answer(auto, 'C')
      auto.check()

      expect(clock.pending).toBe(1)

      clock.elapse(1500)

      expect(auto.state.question).toBe(questions[1])
    })

    it('works again on the new question after an automatic advance', () => {
      const { auto, clock, questions, advances } = setup('C', 'D', 'E')
      auto.setEnabled(true)
      answer(auto, 'C')
      clock.elapse(1500)

      answer(auto, 'D')

      expect(auto.state.grade).toEqual({ correct: true })

      clock.elapse(1500)

      expect(auto.state.question).toBe(questions[2])
      expect(advances.count).toBe(2)
    })
  })

  describe('next during the pause', () => {
    it('opens the next question right away and cancels the automatic advance', () => {
      const { auto, clock, questions, advances } = setup('C', 'D', 'E')
      auto.setEnabled(true)
      answer(auto, 'C')
      clock.elapse(500)

      auto.next()

      expect(auto.state.question).toBe(questions[1])
      expect(clock.pending).toBe(0)

      clock.elapse(1500)

      expect(auto.state.question).toBe(questions[1])
      expect(advances.count).toBe(0)
    })

    it('lets the new question advance automatically again', () => {
      const { auto, clock, questions } = setup('C', 'D', 'E')
      auto.setEnabled(true)
      answer(auto, 'C')
      auto.next()

      answer(auto, 'D')
      clock.elapse(1500)

      expect(auto.state.question).toBe(questions[2])
    })
  })

  describe('turned on while the result is shown', () => {
    it('does not affect the current result', () => {
      const { auto, clock, questions } = setup('C', 'D', 'E')
      answer(auto, 'C')

      auto.setEnabled(true)
      clock.elapse(1500)

      expect(clock.pending).toBe(0)
      expect(auto.state.question).toBe(questions[0])
      expect(auto.state.grade).toEqual({ correct: true })
    })

    it('starts working from the next check', () => {
      const { auto, clock, questions } = setup('C', 'D', 'E')
      answer(auto, 'C')
      auto.setEnabled(true)

      auto.next()
      answer(auto, 'D')
      clock.elapse(1500)

      expect(auto.state.question).toBe(questions[2])
    })
  })

  describe('turned off during the pause', () => {
    it('cancels the automatic advance', () => {
      const { auto, clock, questions, advances } = setup('C', 'D')
      auto.setEnabled(true)
      answer(auto, 'C')
      clock.elapse(500)

      auto.setEnabled(false)
      clock.elapse(1500)

      expect(auto.enabled).toBe(false)
      expect(clock.pending).toBe(0)
      expect(auto.state.question).toBe(questions[0])
      expect(auto.state.grade).toEqual({ correct: true })
      expect(advances.count).toBe(0)
    })

    it('leaves only next to move on', () => {
      const { auto, questions } = setup('C', 'D')
      auto.setEnabled(true)
      answer(auto, 'C')
      auto.setEnabled(false)

      auto.next()

      expect(auto.state.question).toBe(questions[1])
    })

    it('does not resume when turned on again during the same result', () => {
      const { auto, clock, questions } = setup('C', 'D')
      auto.setEnabled(true)
      answer(auto, 'C')
      auto.setEnabled(false)

      auto.setEnabled(true)
      clock.elapse(1500)

      expect(clock.pending).toBe(0)
      expect(auto.state.question).toBe(questions[0])
    })
  })

  describe('when off', () => {
    it('schedules nothing after the result', () => {
      const { auto, clock, questions, advances } = setup('C', 'D')

      answer(auto, 'C')
      clock.elapse(10_000)

      expect(clock.pending).toBe(0)
      expect(auto.state.question).toBe(questions[0])
      expect(auto.state.grade).toEqual({ correct: true })
      expect(advances.count).toBe(0)
    })

    it('moves on only with next', () => {
      const { auto, questions } = setup('C', 'D')
      answer(auto, 'C')

      auto.next()

      expect(auto.state.question).toBe(questions[1])
    })
  })

  describe('the next action', () => {
    it('is what next runs after the result', () => {
      const { auto, log } = setup('C', 'D')
      answer(auto, 'C')

      auto.next()

      expect(log).toEqual(['next'])
    })

    it('is what the automatic advance runs, followed by the notification', () => {
      const { auto, clock, log } = setup('C', 'D')
      auto.setEnabled(true)
      answer(auto, 'C')

      clock.elapse(1500)

      expect(log).toEqual(['next', 'onAdvance'])
    })

    it('is not run by next before the result', () => {
      const { auto, log } = setup('C', 'D')

      auto.next()
      auto.check()
      auto.next()

      expect(auto.state.hint).toBe(true)
      expect(log).toEqual([])
    })

    it('is run once when next is pressed during the pause', () => {
      const { auto, clock, log } = setup('C', 'D')
      auto.setEnabled(true)
      answer(auto, 'C')

      auto.next()
      clock.elapse(1500)

      expect(log).toEqual(['next'])
    })
  })

  describe('passes the trainer rules through', () => {
    it('ignores next before the result', () => {
      const { auto, questions } = setup('C', 'D')
      auto.setEnabled(true)

      auto.next()

      expect(auto.state.question).toBe(questions[0])
    })

    it('reflects the chosen name', () => {
      const { auto } = setup('C', 'D')

      auto.select('G')

      expect(auto.state.selected).toBe('G')
    })
  })
})
