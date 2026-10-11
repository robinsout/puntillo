import { describe, expect, it } from 'vitest'
import { createWritingTrainer, type WritingTrainer } from '@/application/trainer'
import { diatonicPitchesBetween, type Letter, type Pitch } from '@/domain/pitch'
import { createQuestion, type Question } from '@/domain/question'

// Feature m2-write-notes, slice 1: the question of Write notes, one note named, which the user
// writes on a step of the staff (criterion 5, edge cases 1–2) and checks (criterion 10). A wrong
// note is marked and tried again; after that, or at once with one attempt, the question is over
// (criterion 12).

const pitch = (letter: Letter, octave: number): Pitch => ({ letter, octave })

// The steps of First steps: D4–C5, as allowedPitches gives them. G4 is in the middle.
const STEPS = diatonicPitchesBetween(pitch('D', 4), pitch('C', 5))

const G4 = pitch('G', 4)
const F4 = pitch('F', 4)
const E4 = pitch('E', 4)

const quarterOn = (note: Pitch): Question =>
  createQuestion({ pitch: note, duration: { value: 'quarter' } })

// The questions go G4, F4, G4… and the ones served are recorded.
function questionSource(...pitches: Pitch[]) {
  const order = pitches.length > 0 ? pitches : [G4, F4]
  const served: Question[] = []
  const next = () => {
    const question = quarterOn(order[served.length % order.length] ?? G4)
    served.push(question)
    return question
  }
  return { next, served }
}

function setup(attempts?: 1 | 2) {
  const source = questionSource()
  const trainer = createWritingTrainer(
    source.next,
    STEPS,
    attempts === undefined ? {} : { attempts },
  )
  return { trainer, source }
}

function writeAndCheck(trainer: WritingTrainer, note: Pitch) {
  trainer.place(note)
  trainer.check()
}

describe('a writing question', () => {
  it('opens on the first question with nothing written', () => {
    const { trainer, source } = setup()

    expect(trainer.state.question).toBe(source.served[0])
    expect(trainer.state.placed).toBeNull()
    expect(trainer.state.wrongPitch).toBeNull()
    expect(trainer.state.firstGrade).toBeNull()
    expect(trainer.state.outcome).toBeNull()
    expect(trainer.state.hint).toBeNull()
  })

  it('takes one question only until next()', () => {
    const { source } = setup()

    expect(source.served).toHaveLength(1)
  })
})

describe('writing the note', () => {
  it('writes it on the touched step', () => {
    const { trainer } = setup()

    trainer.place(pitch('A', 4))

    expect(trainer.state.placed).toEqual(pitch('A', 4))
  })

  it('moves it to another touched step', () => {
    const { trainer } = setup()
    trainer.place(pitch('A', 4))

    trainer.place(pitch('D', 4))

    expect(trainer.state.placed).toEqual(pitch('D', 4))
  })

  // Edge case 1.
  it('writes it on the top step for a touch above the steps', () => {
    const { trainer } = setup()

    trainer.place(pitch('F', 5))

    expect(trainer.state.placed).toEqual(pitch('C', 5))
  })

  it('writes it on the bottom step for a touch below the steps', () => {
    const { trainer } = setup()

    trainer.place(pitch('A', 3))

    expect(trainer.state.placed).toEqual(pitch('D', 4))
  })

  it('moves it one step up and one step down', () => {
    const { trainer } = setup()
    trainer.place(G4)

    trainer.stepUp()
    expect(trainer.state.placed).toEqual(pitch('A', 4))

    trainer.stepDown()
    trainer.stepDown()
    expect(trainer.state.placed).toEqual(F4)
  })

  // Edge case 2.
  it.each(['stepUp', 'stepDown'] as const)(
    'writes it on the middle step with %s before it is written',
    (step) => {
      const { trainer } = setup()

      trainer[step]()

      expect(trainer.state.placed).toEqual(G4)
    },
  )

  it('cannot move up from the top step, nor down from the bottom one', () => {
    const { trainer } = setup()

    trainer.place(pitch('C', 5))
    trainer.stepUp()
    expect(trainer.state.placed).toEqual(pitch('C', 5))
    expect(trainer.state.canStepUp).toBe(false)
    expect(trainer.state.canStepDown).toBe(true)

    trainer.place(pitch('D', 4))
    trainer.stepDown()
    expect(trainer.state.placed).toEqual(pitch('D', 4))
    expect(trainer.state.canStepDown).toBe(false)
    expect(trainer.state.canStepUp).toBe(true)
  })

  it('can move both ways before the note is written and from a step inside the range', () => {
    const { trainer } = setup()

    expect(trainer.state.canStepUp).toBe(true)
    expect(trainer.state.canStepDown).toBe(true)

    trainer.place(G4)
    expect(trainer.state.canStepUp).toBe(true)
    expect(trainer.state.canStepDown).toBe(true)
  })
})

describe('checking', () => {
  // Edge case 3.
  describe('before the note is written', () => {
    it('asks for the note and grades nothing', () => {
      const { trainer } = setup()

      trainer.check()

      expect(trainer.state.hint).toBe('place-note')
      expect(trainer.state.firstGrade).toBeNull()
      expect(trainer.state.outcome).toBeNull()
    })

    it.each([
      ['writing it', (trainer: WritingTrainer) => trainer.place(G4)],
      ['a step', (trainer: WritingTrainer) => trainer.stepUp()],
    ])('drops the request on %s', (_, write) => {
      const { trainer } = setup()
      trainer.check()

      write(trainer)

      expect(trainer.state.hint).toBeNull()
    })
  })

  it('is correct for the note on the step of the question note', () => {
    const { trainer } = setup()

    writeAndCheck(trainer, G4)

    expect(trainer.state.outcome).toBe('correct')
    expect(trainer.state.firstGrade).toEqual([{ pitch: true, duration: null }])
  })

  it('is correct for a note moved onto the right step', () => {
    const { trainer } = setup()
    trainer.place(E4)
    trainer.stepUp()
    trainer.stepUp()

    trainer.check()

    expect(trainer.state.outcome).toBe('correct')
  })

  it('is wrong for the right letter in another octave', () => {
    const source = questionSource(pitch('C', 5))
    const trainer = createWritingTrainer(source.next, diatonicPitchesBetween(E4, pitch('C', 6)))

    writeAndCheck(trainer, pitch('C', 6))

    expect(trainer.state.firstGrade).toEqual([{ pitch: false, duration: null }])
  })

  describe('a wrong note with two attempts', () => {
    it('grades the first attempt and leaves the question open for the second one', () => {
      const { trainer } = setup()

      writeAndCheck(trainer, E4)

      expect(trainer.state.firstGrade).toEqual([{ pitch: false, duration: null }])
      expect(trainer.state.outcome).toBeNull()
    })

    it('marks the wrong note and leaves it written, to be moved from there', () => {
      const { trainer } = setup()

      writeAndCheck(trainer, E4)

      expect(trainer.state.wrongPitch).toEqual(E4)
      expect(trainer.state.placed).toEqual(E4)
    })

    it('lets the note be moved in the second attempt', () => {
      const { trainer } = setup()
      writeAndCheck(trainer, E4)

      trainer.stepUp()

      expect(trainer.state.placed).toEqual(F4)
      expect(trainer.state.wrongPitch).toEqual(E4)
    })

    it('is correct on the second try for the right note then', () => {
      const { trainer } = setup()
      writeAndCheck(trainer, E4)

      writeAndCheck(trainer, G4)

      expect(trainer.state.outcome).toBe('correct-second-try')
    })

    it('is incorrect for a wrong note then', () => {
      const { trainer } = setup()
      writeAndCheck(trainer, E4)

      writeAndCheck(trainer, F4)

      expect(trainer.state.outcome).toBe('incorrect')
      expect(trainer.state.placed).toEqual(F4)
    })

    // As a rejected name in M1 cannot be chosen again: a second Check by mistake must not spend
    // the second attempt.
    describe('checked again on the rejected step', () => {
      it('asks to move the note and does not spend the second attempt', () => {
        const { trainer } = setup()
        writeAndCheck(trainer, E4)

        trainer.check()

        expect(trainer.state.hint).toBe('move-note')
        expect(trainer.state.outcome).toBeNull()
        expect(trainer.state.placed).toEqual(E4)
        expect(trainer.state.firstGrade).toEqual([{ pitch: false, duration: null }])
      })

      it.each([
        ['a step', (trainer: WritingTrainer) => trainer.stepUp()],
        ['a touch', (trainer: WritingTrainer) => trainer.place(F4)],
      ])('drops the request once the note is moved by %s', (_, move) => {
        const { trainer } = setup()
        writeAndCheck(trainer, E4)
        trainer.check()

        move(trainer)

        expect(trainer.state.hint).toBeNull()
      })

      it('asks again for a note moved back onto the rejected step', () => {
        const { trainer } = setup()
        writeAndCheck(trainer, E4)
        trainer.stepUp()
        trainer.stepDown()

        trainer.check()

        expect(trainer.state.hint).toBe('move-note')
        expect(trainer.state.outcome).toBeNull()
      })

      it('grades the second attempt once the note is on another step', () => {
        const { trainer } = setup()
        writeAndCheck(trainer, E4)
        trainer.check()

        writeAndCheck(trainer, F4)

        expect(trainer.state.outcome).toBe('incorrect')
        expect(trainer.state.hint).toBeNull()
      })
    })

    // Only the first attempt counts towards the score.
    it('keeps the grade of the first attempt', () => {
      const { trainer } = setup()
      writeAndCheck(trainer, E4)

      writeAndCheck(trainer, G4)

      expect(trainer.state.firstGrade).toEqual([{ pitch: false, duration: null }])
    })
  })

  // Show the right answer at once: one attempt.
  describe('a wrong note with one attempt', () => {
    it('is incorrect at once', () => {
      const { trainer } = setup(1)

      writeAndCheck(trainer, E4)

      expect(trainer.state.outcome).toBe('incorrect')
      expect(trainer.state.firstGrade).toEqual([{ pitch: false, duration: null }])
      expect(trainer.state.placed).toEqual(E4)
    })
  })

  it('is correct with one attempt for the right note', () => {
    const { trainer } = setup(1)

    writeAndCheck(trainer, G4)

    expect(trainer.state.outcome).toBe('correct')
  })
})

describe('a question that is over', () => {
  it('keeps the note where it is', () => {
    const { trainer } = setup()
    writeAndCheck(trainer, G4)

    trainer.place(E4)
    trainer.stepUp()
    trainer.stepDown()

    expect(trainer.state.placed).toEqual(G4)
  })

  it('is not checked again', () => {
    const { trainer } = setup()
    writeAndCheck(trainer, E4)
    writeAndCheck(trainer, F4)

    trainer.check()

    expect(trainer.state.outcome).toBe('incorrect')
  })

  it('can move neither way', () => {
    const { trainer } = setup()

    writeAndCheck(trainer, G4)

    expect(trainer.state.canStepUp).toBe(false)
    expect(trainer.state.canStepDown).toBe(false)
  })
})

describe('next()', () => {
  it('opens the next question with nothing written', () => {
    const { trainer, source } = setup()
    writeAndCheck(trainer, E4)
    writeAndCheck(trainer, F4)

    trainer.next()

    expect(source.served).toHaveLength(2)
    expect(trainer.state.question).toBe(source.served[1])
    expect(trainer.state.placed).toBeNull()
    expect(trainer.state.wrongPitch).toBeNull()
    expect(trainer.state.firstGrade).toBeNull()
    expect(trainer.state.outcome).toBeNull()
    expect(trainer.state.canStepUp).toBe(true)
  })

  it('does nothing before the first check', () => {
    const { trainer, source } = setup()
    trainer.place(G4)

    trainer.next()

    expect(source.served).toHaveLength(1)
    expect(trainer.state.placed).toEqual(G4)
  })

  // The session decides whether leaving during the second attempt is fine.
  it('is allowed once the first attempt is graded', () => {
    const { trainer, source } = setup()
    writeAndCheck(trainer, E4)

    trainer.next()

    expect(source.served).toHaveLength(2)
  })
})
