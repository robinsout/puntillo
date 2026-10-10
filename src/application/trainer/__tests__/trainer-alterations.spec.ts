import { describe, expect, it } from 'vitest'
import { createTrainer } from '@/application/trainer'
import type { Trainer } from '@/application/trainer'
import type { KeySignature } from '@/domain/key-signature'
import type { Letter, Pitch } from '@/domain/pitch'
import type { Duration, Note, Question } from '@/domain/question'
import { COMMON_TIME, createQuestionOf } from '@/domain/question'

// Feature accidentals, slice 1: the toggles Sharp and Flat (criterion 7) and the grading of the
// altered notes (criterion 8).
//
// Each note has an alteration of its own: none, sharp (+1) or flat (−1); the top-level
// `alteration` mirrors the current note, as the other choice fields do. The toggles exclude each
// other: Sharp releases Flat and the other way round, and a pressed toggle pressed again leaves
// the note natural. The alteration and the name chosen make the pitch answered. The alteration
// alone never completes a note, so it never moves the highlight on: it is set before the name, or
// the duration, whichever completes the note, as the dot is.
//
// In the second attempt a wrong pitch is dropped together with its alteration. The wrong pitch
// is the name and the alteration together: a rejected «fa» leaves «fa♯» open, and the other way
// round.

const quarter: Duration = { value: 'quarter' }
const half: Duration = { value: 'half' }

const ONE_SHARP: KeySignature = { count: 1, accidental: 'sharp' }
const TWO_FLATS: KeySignature = { count: 2, accidental: 'flat' }

const note = (letter: Letter, alteration?: Pitch['alteration'], duration = quarter): Note => ({
  pitch: alteration === undefined ? { letter, octave: 5 } : { letter, octave: 5, alteration },
  duration,
})

// F♯5, a quarter, in a key of one sharp: the note on the 5th line.
const F_SHARP = createQuestionOf(COMMON_TIME, [note('F', 1)], ONE_SHARP)
// F♯5 a half, then E5 a quarter, in a key of one sharp.
const TWO = createQuestionOf(COMMON_TIME, [note('F', 1, half), note('E')], ONE_SHARP)
// B♭4… in two flats: B♭5 here.
const B_FLAT = createQuestionOf(COMMON_TIME, [note('B', -1)], TWO_FLATS)
// G5 in a key of one sharp: a natural note.
const G = createQuestionOf(COMMON_TIME, [note('G')], ONE_SHARP)
const NEXT = createQuestionOf(COMMON_TIME, [note('A')], ONE_SHARP)

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

const start = (question: Question = F_SHARP, options: Options = {}) =>
  createTrainer(sourceOf(question, NEXT), options)

const alterationsOf = (trainer: Trainer) => trainer.state.notes.map(({ alteration }) => alteration)

function answer(trainer: Trainer, letter: Letter, toggle?: 'sharp' | 'flat') {
  if (toggle === 'sharp') trainer.toggleSharp()
  if (toggle === 'flat') trainer.toggleFlat()
  trainer.select(letter)
  trainer.selectDuration(quarter)
}

describe('the alteration of a note', () => {
  it('is none when the question opens, for every note', () => {
    const trainer = start(TWO)

    expect(trainer.state.alteration).toBeNull()
    expect(alterationsOf(trainer)).toEqual([null, null])
  })

  it('is a sharp once Sharp is pressed, and none once pressed again', () => {
    const trainer = start()

    trainer.toggleSharp()
    expect(trainer.state.alteration).toBe(1)

    trainer.toggleSharp()
    expect(trainer.state.alteration).toBeNull()
  })

  it('is a flat once Flat is pressed, and none once pressed again', () => {
    const trainer = start()

    trainer.toggleFlat()
    expect(trainer.state.alteration).toBe(-1)

    trainer.toggleFlat()
    expect(trainer.state.alteration).toBeNull()
  })

  it('goes from a sharp to a flat and back: the toggles exclude each other', () => {
    const trainer = start()

    trainer.toggleSharp()
    trainer.toggleFlat()
    expect(trainer.state.alteration).toBe(-1)

    trainer.toggleSharp()
    expect(trainer.state.alteration).toBe(1)
  })

  it('stays for the next name chosen instead', () => {
    const trainer = start()

    trainer.toggleSharp()
    trainer.select('G')
    trainer.select('F')

    expect(trainer.state.alteration).toBe(1)
    expect(trainer.state.selected).toBe('F')
  })

  it('belongs to the current note alone', () => {
    const trainer = start(TWO)

    trainer.toggleSharp()
    trainer.goToNote(1)

    expect(alterationsOf(trainer)).toEqual([1, null])
    expect(trainer.state.alteration).toBeNull()
  })

  it('clears the hint, as a choice does', () => {
    const trainer = start()
    trainer.check()

    trainer.toggleFlat()

    expect(trainer.state.hint).toBe(false)
  })
})

// Multi-note-questions, criterion 10: the highlight moves on once the note has its name and
// its duration.
describe('the alteration and the highlight', () => {
  it('does not complete a note on its own', () => {
    const trainer = start(TWO)

    trainer.selectDuration(half)
    trainer.toggleSharp()

    expect(trainer.state.current).toBe(0)
  })

  it('goes with the name that completes the note, and the highlight moves on', () => {
    const trainer = start(TWO)

    trainer.selectDuration(half)
    trainer.toggleSharp()
    trainer.select('F')

    expect(alterationsOf(trainer)).toEqual([1, null])
    expect(trainer.state.current).toBe(1)
  })

  it('goes with the duration that completes the note', () => {
    const trainer = start(TWO)

    trainer.select('F')
    trainer.toggleSharp()
    trainer.selectDuration(half)

    expect(alterationsOf(trainer)).toEqual([1, null])
    expect(trainer.state.current).toBe(1)
  })

  // The note is complete before the sharp, so the sharp is the next note's.
  it('pressed after the note is complete, is the alteration of the next note', () => {
    const trainer = start(TWO)

    trainer.select('F')
    trainer.selectDuration(half)
    trainer.toggleSharp()

    expect(alterationsOf(trainer)).toEqual([null, 1])
  })

  it('changes an answered note once the user goes back to it, staying there', () => {
    const trainer = start(TWO)
    trainer.select('F')
    trainer.selectDuration(half)

    trainer.previousNote()
    trainer.toggleSharp()

    expect(alterationsOf(trainer)).toEqual([1, null])
    expect(trainer.state.current).toBe(0)
  })
})

// Criterion 8.
describe('checking with alterations', () => {
  it('takes F♯ answered with the sharp', () => {
    const trainer = start()

    answer(trainer, 'F', 'sharp')
    trainer.check()

    expect(trainer.state.outcome).toBe('correct')
    expect(trainer.state.firstGrade).toEqual([{ pitch: true, duration: true }])
  })

  it('refuses F♯ answered without the sharp', () => {
    const trainer = start()

    answer(trainer, 'F')
    trainer.check()

    expect(trainer.state.firstGrade).toEqual([{ pitch: false, duration: true }])
  })

  it('refuses F♯ answered with the flat', () => {
    const trainer = start()

    answer(trainer, 'F', 'flat')
    trainer.check()

    expect(trainer.state.firstGrade).toEqual([{ pitch: false, duration: true }])
  })

  // The writing counts: G♭ sounds as F♯, yet it is another note.
  it('refuses G♭ for F♯', () => {
    const trainer = start()

    answer(trainer, 'G', 'flat')
    trainer.check()

    expect(trainer.state.firstGrade).toEqual([{ pitch: false, duration: true }])
  })

  it('takes B♭ answered with the flat', () => {
    const trainer = start(B_FLAT)

    answer(trainer, 'B', 'flat')
    trainer.check()

    expect(trainer.state.outcome).toBe('correct')
  })

  it('refuses a natural note answered with a sharp', () => {
    const trainer = start(G)

    answer(trainer, 'G', 'sharp')
    trainer.check()

    expect(trainer.state.firstGrade).toEqual([{ pitch: false, duration: true }])
  })

  it('takes a natural note answered with the toggles released', () => {
    const trainer = start(G)

    trainer.toggleSharp()
    trainer.toggleSharp()
    answer(trainer, 'G')
    trainer.check()

    expect(trainer.state.outcome).toBe('correct')
  })
})

describe('the second attempt after a wrong alteration', () => {
  // F♯ answered as «fa».
  function missedSharp(options: Options = {}) {
    const trainer = start(F_SHARP, options)
    answer(trainer, 'F')
    trainer.check()
    return trainer
  }

  // G answered as «sol♯».
  function extraSharp() {
    const trainer = start(G)
    answer(trainer, 'G', 'sharp')
    trainer.check()
    return trainer
  }

  it('marks «fa» as the wrong pitch and drops it', () => {
    const { state } = missedSharp()

    expect(state.wrongChoice).toBe('F')
    expect(state.wrongAlteration).toBeNull()
    expect(state.selected).toBeNull()
    expect(state.alteration).toBeNull()
  })

  it('drops a wrong altered pitch together with its alteration', () => {
    const { state } = extraSharp()

    expect(state.wrongChoice).toBe('G')
    expect(state.wrongAlteration).toBe(1)
    expect(state.selected).toBeNull()
    expect(state.alteration).toBeNull()
  })

  it('refuses the rejected «fa» again', () => {
    const trainer = missedSharp()

    trainer.select('F')

    expect(trainer.state.selected).toBeNull()
  })

  it('takes «fa♯», which was not rejected', () => {
    const trainer = missedSharp()

    trainer.toggleSharp()
    trainer.select('F')
    trainer.check()

    expect(trainer.state.outcome).toBe('correct-second-try')
  })

  it('refuses the rejected «sol♯» again but takes «sol»', () => {
    const trainer = extraSharp()

    trainer.toggleSharp()
    trainer.select('G')
    expect(trainer.state.selected).toBeNull()

    trainer.toggleSharp()
    trainer.select('G')
    trainer.check()
    expect(trainer.state.outcome).toBe('correct-second-try')
  })

  it('takes «sol♭» as a new pitch, not the rejected one', () => {
    const trainer = extraSharp()

    trainer.toggleFlat()
    trainer.select('G')

    expect(trainer.state.selected).toBe('G')
    expect(trainer.state.alteration).toBe(-1)
  })

  // Releasing the sharp would make the chosen pitch the rejected one.
  it('drops the chosen name when the toggle turns it into the rejected pitch', () => {
    const trainer = missedSharp()
    trainer.toggleSharp()
    trainer.select('F')

    trainer.toggleSharp()

    expect(trainer.state.alteration).toBeNull()
    expect(trainer.state.selected).toBeNull()
  })

  it('drops the chosen name when switching to the rejected sharp', () => {
    const trainer = extraSharp()
    trainer.toggleFlat()
    trainer.select('G')

    trainer.toggleSharp()

    expect(trainer.state.alteration).toBe(1)
    expect(trainer.state.selected).toBeNull()
  })

  it('keeps the name and the alteration of a pitch that was right', () => {
    const trainer = start()
    trainer.toggleSharp()
    trainer.select('F')
    trainer.selectDuration(half)
    trainer.check()

    expect(trainer.state.selected).toBe('F')
    expect(trainer.state.alteration).toBe(1)

    trainer.toggleSharp()
    trainer.toggleFlat()
    expect(trainer.state.alteration).toBe(1)
    expect(trainer.state.selected).toBe('F')
  })

  it('keeps the wrong pitch as chosen with one attempt, for the review', () => {
    const trainer = start(G, { attempts: 1 })
    answer(trainer, 'G', 'sharp')
    trainer.check()

    expect(trainer.state.outcome).toBe('incorrect')
    expect(trainer.state.selected).toBe('G')
    expect(trainer.state.alteration).toBe(1)
    expect(trainer.state.wrongChoice).toBe('G')
    expect(trainer.state.wrongAlteration).toBe(1)
  })

  it('ignores the toggles once the question is over', () => {
    const trainer = start()
    answer(trainer, 'F', 'sharp')
    trainer.check()

    trainer.toggleFlat()
    trainer.toggleSharp()

    expect(trainer.state.alteration).toBe(1)
  })
})

describe('clearing the choice with an alteration', () => {
  it('releases the toggles with the name', () => {
    const trainer = start(TWO)
    trainer.toggleSharp()
    trainer.select('F')

    trainer.clearChoice()

    expect(alterationsOf(trainer)).toEqual([null, null])
    expect(trainer.state.selected).toBeNull()
  })

  it('keeps the alteration of a pitch settled in the first attempt', () => {
    const trainer = start()
    trainer.toggleSharp()
    trainer.select('F')
    trainer.selectDuration(half)
    trainer.check()

    trainer.clearChoice()

    expect(trainer.state.alteration).toBe(1)
    expect(trainer.state.selected).toBe('F')
  })
})

describe('the next question', () => {
  it('opens with every toggle released', () => {
    const trainer = start()
    answer(trainer, 'F', 'sharp')
    trainer.check()

    trainer.next()

    expect(trainer.state.alteration).toBeNull()
    expect(trainer.state.wrongAlteration).toBeNull()
  })
})
