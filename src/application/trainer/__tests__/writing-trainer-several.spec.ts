import { describe, expect, it } from 'vitest'
import { createWritingTrainer, type WritingTrainer } from '@/application/trainer'
import { diatonicPitchesBetween, type Letter, type Pitch } from '@/domain/pitch'
import { createQuestion, createQuestionOf, type Duration, type Question } from '@/domain/question'

// Feature m2-write-notes, slice 2: questions of several notes and the duration in Write notes.
// Each note of the question is written in turn: the current one takes a touch, a step, a duration
// and the dot; previousNote(), nextNote() and goToNote() move between the notes, a touch with the
// index of a note makes it current (criterion 9). Unlike M1, writing a note does not move on to
// the next one: after a touch the note often still needs a step. Check grades the whole question;
// the pitch and the duration of each note apart, the second attempt only on the wrong parts, as in
// M1 (criterion 12). A rejected step cannot be checked again, nor a rejected duration chosen again.

const pitch = (letter: Letter, octave: number): Pitch => ({ letter, octave })
const C4 = pitch('C', 4)
const E4 = pitch('E', 4)
const F4 = pitch('F', 4)
const G4 = pitch('G', 4)
const A4 = pitch('A', 4)

// Confident reading: C4–G5, twelve steps.
const STEPS = diatonicPitchesBetween(C4, pitch('G', 5))

const HALF: Duration = { value: 'half' }
const QUARTER: Duration = { value: 'quarter' }
const EIGHTH: Duration = { value: 'eighth' }

// C4 half, E4 quarter, G4 quarter; then the same again.
const DO_MI_SOL = createQuestion(
  { pitch: C4, duration: HALF },
  { pitch: E4, duration: QUARTER },
  { pitch: G4, duration: QUARTER },
)

function setup(
  question: Question = DO_MI_SOL,
  options: { attempts?: 1 | 2; askDuration?: boolean } = {},
) {
  const served: Question[] = []
  const trainer = createWritingTrainer(
    () => {
      served.push(question)
      return question
    },
    STEPS,
    { askDuration: true, ...options },
  )
  return { trainer, served }
}

// Writes the notes from the first, each by a touch with its index and then its duration.
function writeAll(trainer: WritingTrainer, notes: readonly [Pitch, Duration | null][]) {
  notes.forEach(([note, duration], index) => {
    trainer.place(note, index)
    if (duration) trainer.selectDuration(duration)
  })
}

const RIGHT: readonly [Pitch, Duration][] = [
  [C4, HALF],
  [E4, QUARTER],
  [G4, QUARTER],
]

describe('a writing question of several notes', () => {
  it('opens on the first note, nothing written, the duration asked', () => {
    const { trainer } = setup()

    expect(trainer.state.current).toBe(0)
    expect(trainer.state.askDuration).toBe(true)
    expect(trainer.state.notes).toHaveLength(3)
    expect(trainer.state.placed).toBeNull()
    expect(trainer.state.selectedDuration).toBeNull()
    expect(trainer.state.dot).toBe(false)
  })

  it('does not ask for the duration unless told', () => {
    const served: Question[] = []
    const trainer = createWritingTrainer(() => {
      served.push(DO_MI_SOL)
      return DO_MI_SOL
    }, STEPS)

    expect(trainer.state.askDuration).toBe(false)
  })
})

describe('writing the current note', () => {
  it('writes the touched step on the current note only', () => {
    const { trainer } = setup()

    trainer.place(E4)

    expect(trainer.state.notes.map((note) => note.placed)).toEqual([E4, null, null])
  })

  it('stays on the note once it is written, the step and the duration chosen', () => {
    const { trainer } = setup()

    trainer.place(C4)
    trainer.selectDuration(HALF)

    expect(trainer.state.current).toBe(0)
  })

  it('moves the current note one step', () => {
    const { trainer } = setup()
    trainer.place(E4, 1)

    trainer.stepUp()

    expect(trainer.state.notes.map((note) => note.placed)).toEqual([null, F4, null])
  })

  it('chooses the duration of the current note', () => {
    const { trainer } = setup()
    trainer.goToNote(2)

    trainer.selectDuration(EIGHTH)

    expect(trainer.state.selectedDuration).toEqual(EIGHTH)
    expect(trainer.state.notes.map((note) => note.selectedDuration)).toEqual([null, null, EIGHTH])
  })

  it('changes a written note before the check', () => {
    const { trainer } = setup()
    trainer.place(E4, 0)
    trainer.selectDuration(QUARTER)
    trainer.goToNote(1)

    trainer.place(C4, 0)
    trainer.selectDuration(HALF)

    expect(trainer.state.notes[0]).toMatchObject({ placed: C4, selectedDuration: HALF })
  })

  it('ignores a duration when the duration is not asked', () => {
    const { trainer } = setup(DO_MI_SOL, { askDuration: false })

    trainer.selectDuration(HALF)
    trainer.toggleDot()

    expect(trainer.state.selectedDuration).toBeNull()
    expect(trainer.state.dot).toBe(false)
  })

  describe('the dot', () => {
    it('dots the chosen duration and undots it', () => {
      const { trainer } = setup()
      trainer.selectDuration(HALF)

      trainer.toggleDot()
      expect(trainer.state.selectedDuration).toEqual({ value: 'half', dots: 1 })
      expect(trainer.state.dot).toBe(true)

      trainer.toggleDot()
      expect(trainer.state.selectedDuration).toEqual(HALF)
      expect(trainer.state.dot).toBe(false)
    })

    it('dots the duration chosen after it', () => {
      const { trainer } = setup()
      trainer.toggleDot()

      trainer.selectDuration(QUARTER)

      expect(trainer.state.selectedDuration).toEqual({ value: 'quarter', dots: 1 })
    })
  })
})

describe('moving between the notes', () => {
  it('goes to the next and the previous note', () => {
    const { trainer } = setup()

    trainer.nextNote()
    expect(trainer.state.current).toBe(1)
    trainer.nextNote()
    expect(trainer.state.current).toBe(2)
    trainer.previousNote()
    expect(trainer.state.current).toBe(1)
  })

  it('stays on the last note going on and on the first going back', () => {
    const { trainer } = setup()

    trainer.previousNote()
    expect(trainer.state.current).toBe(0)

    trainer.goToNote(2)
    trainer.nextNote()
    expect(trainer.state.current).toBe(2)
  })

  it('goes to a note by its index, ignoring one out of the question', () => {
    const { trainer } = setup()

    trainer.goToNote(2)
    trainer.goToNote(5)

    expect(trainer.state.current).toBe(2)
  })

  // The touch of another column: its note becomes current and takes the step at once.
  it('makes a touched note current and writes it', () => {
    const { trainer } = setup()

    trainer.place(G4, 2)

    expect(trainer.state.current).toBe(2)
    expect(trainer.state.placed).toEqual(G4)
  })

  it('mirrors the current note in the top-level fields', () => {
    const { trainer } = setup()
    trainer.place(E4, 1)
    trainer.selectDuration(QUARTER)

    trainer.goToNote(0)
    expect(trainer.state.placed).toBeNull()
    expect(trainer.state.selectedDuration).toBeNull()

    trainer.goToNote(1)
    expect(trainer.state.placed).toEqual(E4)
    expect(trainer.state.selectedDuration).toEqual(QUARTER)
  })

  it('tells whether the current note can move a step', () => {
    const { trainer } = setup()

    trainer.place(C4, 0)
    expect(trainer.state.canStepDown).toBe(false)

    trainer.goToNote(1)
    expect(trainer.state.canStepDown).toBe(true)
  })
})

describe('checking the question', () => {
  // Edge case 3: Check asks for what is missing and grades nothing.
  it('asks for a note before every one is written', () => {
    const { trainer } = setup()
    writeAll(trainer, [
      [C4, HALF],
      [E4, QUARTER],
    ])

    trainer.check()

    expect(trainer.state.hint).toBe('place-note')
    expect(trainer.state.firstGrade).toBeNull()
  })

  it('asks for a duration once every note is written but one has none', () => {
    const { trainer } = setup()
    writeAll(trainer, [
      [C4, HALF],
      [E4, null],
      [G4, QUARTER],
    ])

    trainer.check()

    expect(trainer.state.hint).toBe('choose-duration')
    expect(trainer.state.firstGrade).toBeNull()
  })

  it('asks for no duration when it is not asked', () => {
    const { trainer } = setup(DO_MI_SOL, { askDuration: false })
    writeAll(trainer, [
      [C4, null],
      [E4, null],
      [G4, null],
    ])

    trainer.check()

    expect(trainer.state.hint).toBeNull()
    expect(trainer.state.firstGrade).toEqual([
      { pitch: true, duration: null },
      { pitch: true, duration: null },
      { pitch: true, duration: null },
    ])
  })

  it.each([
    ['a duration', (trainer: WritingTrainer) => trainer.selectDuration(QUARTER)],
    ['a touch', (trainer: WritingTrainer) => trainer.place(E4)],
    ['the dot', (trainer: WritingTrainer) => trainer.toggleDot()],
  ])('drops the request on %s', (_, write) => {
    const { trainer } = setup()
    trainer.check()

    write(trainer)

    expect(trainer.state.hint).toBeNull()
  })

  it('is correct when every note is right in its step and its duration', () => {
    const { trainer } = setup()
    writeAll(trainer, RIGHT)

    trainer.check()

    expect(trainer.state.outcome).toBe('correct')
    expect(trainer.state.firstGrade).toEqual([
      { pitch: true, duration: true },
      { pitch: true, duration: true },
      { pitch: true, duration: true },
    ])
  })

  it('grades the pitch and the duration of each note apart', () => {
    const { trainer } = setup()
    writeAll(trainer, [
      [C4, QUARTER],
      [F4, QUARTER],
      [G4, QUARTER],
    ])

    trainer.check()

    expect(trainer.state.firstGrade).toEqual([
      { pitch: true, duration: false },
      { pitch: false, duration: true },
      { pitch: true, duration: true },
    ])
    expect(trainer.state.outcome).toBeNull()
  })

  it('is right only with the dot of a dotted note', () => {
    const dotted = createQuestion({ pitch: G4, duration: { value: 'half', dots: 1 } })
    const { trainer } = setup(dotted)
    trainer.place(G4)
    trainer.selectDuration(HALF)

    trainer.check()

    expect(trainer.state.firstGrade).toEqual([{ pitch: true, duration: false }])
  })

  // Rests need no answer: only the notes are written and graded.
  it('leaves the rests of the question out', () => {
    const withRest = createQuestionOf({ beats: 4, beatValue: 4 }, [
      { pitch: C4, duration: HALF },
      { duration: QUARTER },
      { pitch: E4, duration: QUARTER },
    ])
    const { trainer } = setup(withRest)

    expect(trainer.state.notes).toHaveLength(2)
    writeAll(trainer, [
      [C4, HALF],
      [E4, QUARTER],
    ])
    trainer.check()

    expect(trainer.state.outcome).toBe('correct')
  })
})

describe('the second attempt', () => {
  // C4 written with a quarter, F4 for E4; G4 right.
  function checkWrong(trainer: WritingTrainer) {
    writeAll(trainer, [
      [C4, QUARTER],
      [F4, QUARTER],
      [G4, QUARTER],
    ])
    trainer.check()
  }

  it('starts on the first wrong note', () => {
    const { trainer } = setup()
    trainer.goToNote(2)

    checkWrong(trainer)

    expect(trainer.state.current).toBe(0)
  })

  it('keeps every written step and clears the wrong durations', () => {
    const { trainer } = setup()

    checkWrong(trainer)

    expect(trainer.state.notes.map((note) => note.placed)).toEqual([C4, F4, G4])
    expect(trainer.state.notes.map((note) => note.selectedDuration)).toEqual([
      null,
      QUARTER,
      QUARTER,
    ])
  })

  it('marks the wrong step and the wrong duration of each note', () => {
    const { trainer } = setup()

    checkWrong(trainer)

    expect(trainer.state.notes.map((note) => note.wrongPitch)).toEqual([null, F4, null])
    expect(trainer.state.notes.map((note) => note.wrongDuration)).toEqual([QUARTER, null, null])
  })

  it('moves only between the notes still wrong', () => {
    const { trainer } = setup()
    checkWrong(trainer)

    trainer.nextNote()
    expect(trainer.state.current).toBe(1)
    trainer.nextNote()
    expect(trainer.state.current).toBe(1)

    trainer.goToNote(2)
    expect(trainer.state.current).toBe(1)
  })

  it('does not write on a note right on the first attempt', () => {
    const { trainer } = setup()
    checkWrong(trainer)

    trainer.place(A4, 2)

    expect(trainer.state.notes[2]?.placed).toEqual(G4)
    expect(trainer.state.current).toBe(0)
  })

  it('keeps a part right on the first attempt as it is', () => {
    const { trainer } = setup()
    checkWrong(trainer)

    // Note 1: the step was right, so it stays; note 2: the duration was right.
    trainer.goToNote(0)
    trainer.place(E4)
    trainer.stepUp()
    trainer.goToNote(1)
    trainer.selectDuration(HALF)
    trainer.toggleDot()

    expect(trainer.state.notes[0]?.placed).toEqual(C4)
    expect(trainer.state.notes[1]?.selectedDuration).toEqual(QUARTER)
    expect(trainer.state.notes[1]?.dot).toBe(false)
  })

  // As in M1: a rejected duration cannot be chosen again, with the dot it was tried with.
  it('refuses the rejected duration', () => {
    const { trainer } = setup()
    checkWrong(trainer)

    trainer.goToNote(0)
    trainer.selectDuration(QUARTER)
    expect(trainer.state.selectedDuration).toBeNull()

    trainer.toggleDot()
    trainer.selectDuration(QUARTER)
    expect(trainer.state.selectedDuration).toEqual({ value: 'quarter', dots: 1 })
  })

  it('asks to move a note still on its rejected step', () => {
    const { trainer } = setup()
    checkWrong(trainer)
    trainer.goToNote(0)
    trainer.selectDuration(HALF)

    trainer.check()

    expect(trainer.state.hint).toBe('move-note')
    expect(trainer.state.outcome).toBeNull()
  })

  it('asks for the cleared duration before the step', () => {
    const { trainer } = setup()
    checkWrong(trainer)
    trainer.place(E4, 1)

    trainer.check()

    expect(trainer.state.hint).toBe('choose-duration')
  })

  it('is correct on the second try once the wrong parts are right', () => {
    const { trainer } = setup()
    checkWrong(trainer)
    trainer.goToNote(0)
    trainer.selectDuration(HALF)
    trainer.place(E4, 1)

    trainer.check()

    expect(trainer.state.outcome).toBe('correct-second-try')
  })

  it('is incorrect when a part is still wrong', () => {
    const { trainer } = setup()
    checkWrong(trainer)
    trainer.goToNote(0)
    trainer.selectDuration(EIGHTH)
    trainer.place(E4, 1)

    trainer.check()

    expect(trainer.state.outcome).toBe('incorrect')
    expect(trainer.state.notes[0]?.selectedDuration).toEqual(EIGHTH)
  })

  it('keeps the grade of the first attempt', () => {
    const { trainer } = setup()
    checkWrong(trainer)
    trainer.goToNote(0)
    trainer.selectDuration(HALF)
    trainer.place(E4, 1)

    trainer.check()

    expect(trainer.state.firstGrade).toEqual([
      { pitch: true, duration: false },
      { pitch: false, duration: true },
      { pitch: true, duration: true },
    ])
  })
})

describe('one attempt', () => {
  it('ends the question at once, every written part kept for the review', () => {
    const { trainer } = setup(DO_MI_SOL, { attempts: 1 })
    writeAll(trainer, [
      [C4, QUARTER],
      [F4, QUARTER],
      [G4, QUARTER],
    ])

    trainer.check()

    expect(trainer.state.outcome).toBe('incorrect')
    expect(trainer.state.notes.map((note) => note.selectedDuration)).toEqual([
      QUARTER,
      QUARTER,
      QUARTER,
    ])
    expect(trainer.state.notes.map((note) => note.placed)).toEqual([C4, F4, G4])
  })
})

describe('a question that is over', () => {
  it('takes no step, duration, dot or move', () => {
    const { trainer } = setup()
    writeAll(trainer, RIGHT)
    trainer.check()

    trainer.place(A4, 1)
    trainer.selectDuration(EIGHTH)
    trainer.toggleDot()

    expect(trainer.state.notes.map((note) => note.placed)).toEqual([C4, E4, G4])
    expect(trainer.state.notes[1]?.selectedDuration).toEqual(QUARTER)
    expect(trainer.state.dot).toBe(false)
  })

  it('opens the next question on its first note, nothing written', () => {
    const { trainer, served } = setup()
    writeAll(trainer, RIGHT)
    trainer.check()

    trainer.next()

    expect(served).toHaveLength(2)
    expect(trainer.state.current).toBe(0)
    expect(trainer.state.notes.every((note) => note.placed === null)).toBe(true)
    expect(trainer.state.notes.every((note) => note.selectedDuration === null)).toBe(true)
  })
})
