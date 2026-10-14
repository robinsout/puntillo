import { describe, expect, it } from 'vitest'
import { createTrainer } from '@/application/trainer'
import type { Trainer } from '@/application/trainer'
import type { PianoKey } from '@/domain/keyboard'
import type { Alteration, Letter } from '@/domain/pitch'
import type { Duration, Note, Question } from '@/domain/question'
import { createQuestion } from '@/domain/question'

// Feature piano-keyboard, slice 1: with the keyboard as the note input a key played chooses the
// pitch of the current note, as a name does (criterion 7), and is graded by its sound and with its
// octave (criterion 8). The second attempt, Show the right answer at once and the moves between
// notes are as with the names (criteria 9, 10, edge case 7).

const half: Duration = { value: 'half' }
const quarter: Duration = { value: 'quarter' }
const whole: Duration = { value: 'whole' }

const key = (number: number): PianoKey => ({ number })

// The keys of C4, its octave above, D4 and the black key of C♯4 and D♭4.
const C4 = key(60)
const C5 = key(72)
const D4 = key(62)
const C_SHARP_4 = key(61)

const note = (letter: Letter, duration: Duration = whole, alteration?: Alteration): Note => ({
  pitch: alteration === undefined ? { letter, octave: 4 } : { letter, octave: 4, alteration },
  duration,
})

const ON_C4 = createQuestion(note('C'))
const ON_D4 = createQuestion(note('D'))
// C4 half, E4 quarter, G4 quarter.
const THREE = createQuestion(note('C', half), note('E', quarter), note('G', quarter))

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

const start = (question: Question = ON_C4, options: Options = {}) =>
  createTrainer(sourceOf(question, ON_D4), { input: 'keyboard', ...options })

function play(trainer: Trainer, played: PianoKey, duration: Duration = whole) {
  trainer.pressKey(played)
  trainer.selectDuration(duration)
}

function playAndCheck(trainer: Trainer, played: PianoKey, duration: Duration = whole) {
  play(trainer, played, duration)
  trainer.check()
}

const keysOf = (trainer: Trainer) => trainer.state.notes.map((choice) => choice.key?.number ?? null)

describe('a trainer with the piano keyboard', () => {
  describe('when opened', () => {
    it('has no key played and none rejected', () => {
      const { state } = start()

      expect(state.key).toBeNull()
      expect(state.wrongKey).toBeNull()
      expect(state.notes[0]).toMatchObject({ key: null, wrongKey: null })
    })
  })

  describe('playing a key (criterion 7)', () => {
    it('chooses the key for the current note', () => {
      const trainer = start()

      trainer.pressKey(D4)

      expect(trainer.state.key).toEqual(D4)
      expect(trainer.state.notes[0]?.key).toEqual(D4)
    })

    it('changes the key with the next one played', () => {
      const trainer = start()

      trainer.pressKey(D4)
      trainer.pressKey(C5)

      expect(trainer.state.key).toEqual(C5)
    })

    it('chooses no name', () => {
      const trainer = start()

      trainer.pressKey(D4)

      expect(trainer.state.selected).toBeNull()
      expect(trainer.state.alteration).toBeNull()
    })

    it('clears the hint left from a Check without an answer', () => {
      const trainer = start()
      trainer.check()

      trainer.pressKey(C4)

      expect(trainer.state.hint).toBe(false)
    })
  })

  describe('Check without an answer', () => {
    it('shows the hint without a key', () => {
      const trainer = start()

      trainer.selectDuration(whole)
      trainer.check()

      expect(trainer.state.hint).toBe(true)
      expect(trainer.state.firstGrade).toBeNull()
    })

    it('shows the hint with a key and no duration when the duration is asked', () => {
      const trainer = start()

      trainer.pressKey(C4)
      trainer.check()

      expect(trainer.state.hint).toBe(true)
      expect(trainer.state.firstGrade).toBeNull()
    })

    it('grades a key alone when the duration is not asked', () => {
      const trainer = start(ON_C4, { askDuration: false })

      trainer.pressKey(C4)
      trainer.check()

      expect(trainer.state.firstGrade).toEqual([{ pitch: true, duration: null }])
      expect(trainer.state.outcome).toBe('correct')
    })
  })

  describe('Check (criterion 8)', () => {
    it('grades the key the note sounds on as right', () => {
      const trainer = start()

      playAndCheck(trainer, C4)

      expect(trainer.state.firstGrade).toEqual([{ pitch: true, duration: true }])
      expect(trainer.state.outcome).toBe('correct')
    })

    it('grades the key an octave off as wrong', () => {
      const trainer = start()

      playAndCheck(trainer, C5)

      expect(trainer.state.firstGrade).toEqual([{ pitch: false, duration: true }])
      expect(trainer.state.outcome).toBeNull()
    })

    it('grades one black key right for C♯4 and for D♭4', () => {
      const sharp = start(createQuestion(note('C', whole, 1)))
      const flat = start(createQuestion(note('D', whole, -1)))

      playAndCheck(sharp, C_SHARP_4)
      playAndCheck(flat, C_SHARP_4)

      expect(sharp.state.outcome).toBe('correct')
      expect(flat.state.outcome).toBe('correct')
    })

    it('grades the duration as with the names', () => {
      const trainer = start()

      playAndCheck(trainer, C4, half)

      expect(trainer.state.firstGrade).toEqual([{ pitch: true, duration: false }])
    })
  })

  describe('the second attempt (criteria 9, 10)', () => {
    it('rejects the wrong key and clears it', () => {
      const trainer = start()

      playAndCheck(trainer, C5)

      expect(trainer.state.wrongKey).toEqual(C5)
      expect(trainer.state.key).toBeNull()
    })

    it('ignores the rejected key played again', () => {
      const trainer = start()
      playAndCheck(trainer, C5)

      trainer.pressKey(C5)

      expect(trainer.state.key).toBeNull()
    })

    it('takes another key and grades it right on the second try', () => {
      const trainer = start()
      playAndCheck(trainer, C5)

      trainer.pressKey(C4)
      trainer.check()

      expect(trainer.state.key).toEqual(C4)
      expect(trainer.state.outcome).toBe('correct-second-try')
      expect(trainer.secondGrade).toEqual([{ pitch: true, duration: true }])
    })

    it('ends wrong for a wrong key on the second try', () => {
      const trainer = start()
      playAndCheck(trainer, C5)

      trainer.pressKey(D4)
      trainer.check()

      expect(trainer.state.outcome).toBe('incorrect')
    })

    it('keeps the key right in the first attempt and ignores keys played (edge case 7)', () => {
      const trainer = start()
      playAndCheck(trainer, C4, half)

      trainer.pressKey(D4)

      expect(trainer.state.key).toEqual(C4)
      expect(trainer.state.wrongKey).toBeNull()
    })

    it('rejects no key when only the duration was wrong', () => {
      const trainer = start()

      playAndCheck(trainer, C4, half)

      expect(trainer.state.wrongKey).toBeNull()
      expect(trainer.state.wrongDuration).toEqual(half)
    })
  })

  describe('with the right answer shown at once', () => {
    it('keeps the wrong key as both the key played and the rejected one', () => {
      const trainer = start(ON_C4, { attempts: 1 })

      playAndCheck(trainer, C5)

      expect(trainer.state.outcome).toBe('incorrect')
      expect(trainer.state.key).toEqual(C5)
      expect(trainer.state.wrongKey).toEqual(C5)
    })
  })

  describe('after the outcome', () => {
    it('ignores keys played after a right answer', () => {
      const trainer = start()
      playAndCheck(trainer, C4)

      trainer.pressKey(D4)

      expect(trainer.state.key).toEqual(C4)
    })

    it('ignores keys played after a wrong answer', () => {
      const trainer = start(ON_C4, { attempts: 1 })
      playAndCheck(trainer, C5)

      trainer.pressKey(C4)

      expect(trainer.state.key).toEqual(C5)
    })
  })

  describe('the next question', () => {
    it('opens with no key played and none rejected', () => {
      const trainer = start(ON_C4, { attempts: 1 })
      playAndCheck(trainer, C5)

      trainer.next()

      expect(trainer.state.question).toBe(ON_D4)
      expect(trainer.state.key).toBeNull()
      expect(trainer.state.wrongKey).toBeNull()
    })
  })

  describe('Clear', () => {
    it('clears the key played', () => {
      const trainer = start()
      play(trainer, D4)

      trainer.clearChoice()

      expect(trainer.state.key).toBeNull()
    })

    it('keeps the key right in the first attempt', () => {
      const trainer = start()
      playAndCheck(trainer, C4, half)

      trainer.clearChoice()

      expect(trainer.state.key).toEqual(C4)
    })
  })

  describe('on a question of several notes', () => {
    it('moves to the next note once the current one has its key and duration', () => {
      const trainer = start(THREE)

      play(trainer, C4, half)

      expect(trainer.state.current).toBe(1)
      expect(keysOf(trainer)).toEqual([60, null, null])
    })

    it('stays on the note while its duration is still to choose', () => {
      const trainer = start(THREE)

      trainer.pressKey(C4)

      expect(trainer.state.current).toBe(0)
    })

    it('moves on with the key alone when the duration is not asked', () => {
      const trainer = start(THREE, { askDuration: false })

      trainer.pressKey(C4)

      expect(trainer.state.current).toBe(1)
    })

    it('grades each key against the note at its place', () => {
      const trainer = start(THREE)

      play(trainer, C4, half)
      play(trainer, key(64), quarter)
      play(trainer, key(79), quarter)
      trainer.check()

      expect(trainer.state.firstGrade).toEqual([
        { pitch: true, duration: true },
        { pitch: true, duration: true },
        { pitch: false, duration: true },
      ])
    })

    it('opens the second attempt on the wrong note, its key rejected and cleared', () => {
      const trainer = start(THREE)
      play(trainer, C4, half)
      play(trainer, key(64), quarter)
      play(trainer, key(79), quarter)

      trainer.check()

      expect(trainer.state.current).toBe(2)
      expect(trainer.state.wrongKey).toEqual(key(79))
      expect(keysOf(trainer)).toEqual([60, 64, null])
    })

    it('clears the keys of the open notes only', () => {
      const trainer = start(THREE)
      play(trainer, C4, half)
      play(trainer, key(65), quarter)
      play(trainer, key(67), quarter)
      trainer.check()
      trainer.goToNote(1)
      trainer.pressKey(key(64))

      trainer.clearChoice()

      expect(keysOf(trainer)).toEqual([60, null, 67])
      expect(trainer.state.current).toBe(1)
    })
  })
})
