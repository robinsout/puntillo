import { describe, expect, it } from 'vitest'
import { createWritingTrainer, type WritingTrainer } from '@/application/trainer'
import { NO_KEY_SIGNATURE, type KeySignature } from '@/domain/key-signature'
import { diatonicPitchesBetween, type Letter, type Pitch } from '@/domain/pitch'
import {
  applyAccidentals,
  createQuestionOf,
  type Accidental,
  type NoteOrRest,
  type Question,
  type TimeSignature,
} from '@/domain/question'

// Feature m2-write-notes, slice 3, criteria 7 and 11: Sharp, Flat and Natural put a sign before
// the current note; pressed again, the same one takes it away, another one replaces it. A sign may
// be chosen before the note is written: it stays with the note and goes with it when it is
// written. The written sign is graded against the right notation of the question (gradeWriting).
// In the second attempt the rejected answer of a note is its step and its sign together: the same
// step with another sign is another answer, as in M1 a rejected letter with another alteration.

const FOUR_FOUR: TimeSignature = { beats: 4, beatValue: 4 }
const G_MAJOR: KeySignature = { count: 1, accidental: 'sharp' }

const place = (letter: Letter, octave: number): Pitch => ({ letter, octave })
const F4 = place('F', 4)
const G4 = place('G', 4)

const STEPS = diatonicPitchesBetween(place('C', 4), place('G', 5))

const quarter = (letter: Letter, octave: number, accidental?: Accidental): NoteOrRest =>
  accidental
    ? { pitch: place(letter, octave), duration: { value: 'quarter' }, accidental }
    : { pitch: place(letter, octave), duration: { value: 'quarter' } }

const questionOf = (keySignature: KeySignature, ...elements: NoteOrRest[]): Question =>
  createQuestionOf(FOUR_FOUR, applyAccidentals(elements, FOUR_FOUR, keySignature), keySignature)

// G major, F4: written without a sign.
const F_IN_G_MAJOR = questionOf(G_MAJOR, quarter('F', 4))
// C major, F♯4: written with its sharp.
const F_SHARP = questionOf(NO_KEY_SIGNATURE, quarter('F', 4, 'sharp'))
// C major, F♯4 then G4.
const F_SHARP_G = questionOf(NO_KEY_SIGNATURE, quarter('F', 4, 'sharp'), quarter('G', 4))

function setup(question: Question, attempts: 1 | 2 = 2): WritingTrainer {
  return createWritingTrainer(() => question, STEPS, { attempts })
}

describe('the signs of a written note', () => {
  it('starts without a sign', () => {
    const trainer = setup(F_SHARP)

    expect(trainer.state.accidental).toBeNull()
  })

  it.each([
    ['toggleSharp', 'sharp'],
    ['toggleFlat', 'flat'],
    ['toggleNatural', 'natural'],
  ] as const)('puts a sign with %s', (toggle, accidental) => {
    const trainer = setup(F_SHARP)
    trainer.place(F4)

    trainer[toggle]()

    expect(trainer.state.accidental).toBe(accidental)
  })

  it('takes the sign away when it is pressed again', () => {
    const trainer = setup(F_SHARP)
    trainer.place(F4)
    trainer.toggleSharp()

    trainer.toggleSharp()

    expect(trainer.state.accidental).toBeNull()
  })

  it('replaces the sign with another one', () => {
    const trainer = setup(F_SHARP)
    trainer.place(F4)
    trainer.toggleSharp()

    trainer.toggleNatural()

    expect(trainer.state.accidental).toBe('natural')
  })

  it('keeps the sign when the note is moved', () => {
    const trainer = setup(F_SHARP)
    trainer.place(G4)
    trainer.toggleSharp()

    trainer.stepDown()

    expect(trainer.state.placed).toEqual(F4)
    expect(trainer.state.accidental).toBe('sharp')
  })

  it('takes a sign before the note is written, the note keeping it once written', () => {
    const trainer = setup(F_SHARP)

    trainer.toggleSharp()
    trainer.place(F4)

    expect(trainer.state.accidental).toBe('sharp')
  })

  it('puts the sign on the current note only', () => {
    const trainer = setup(F_SHARP_G)
    trainer.place(F4, 0)
    trainer.place(G4, 1)

    trainer.toggleFlat()

    expect(trainer.state.notes.map((note) => note.accidental)).toEqual([null, 'flat'])
  })

  it('drops the request of Check on a sign', () => {
    const trainer = setup(F_SHARP)
    trainer.check()

    trainer.toggleSharp()

    expect(trainer.state.hint).toBeNull()
  })
})

describe('checking the signs', () => {
  it('is correct for F4 without a sign in G major', () => {
    const trainer = setup(F_IN_G_MAJOR)
    trainer.place(F4)

    trainer.check()

    expect(trainer.state.outcome).toBe('correct')
  })

  it('is wrong for a sharp the key signature gives already', () => {
    const trainer = setup(F_IN_G_MAJOR)
    trainer.place(F4)
    trainer.toggleSharp()

    trainer.check()

    expect(trainer.state.firstGrade).toEqual([{ pitch: false, duration: null }])
  })

  it('is correct for a needed sharp and wrong without it', () => {
    const right = setup(F_SHARP)
    right.place(F4)
    right.toggleSharp()
    right.check()
    expect(right.state.outcome).toBe('correct')

    const wrong = setup(F_SHARP)
    wrong.place(F4)
    wrong.check()
    expect(wrong.state.firstGrade).toEqual([{ pitch: false, duration: null }])
  })
})

describe('the second attempt with signs', () => {
  function rejectSharp(trainer: WritingTrainer) {
    trainer.place(F4)
    trainer.toggleSharp()
    trainer.check()
  }

  it('keeps the rejected note with its sign, both marked', () => {
    const trainer = setup(F_IN_G_MAJOR)

    rejectSharp(trainer)

    expect(trainer.state.placed).toEqual(F4)
    expect(trainer.state.accidental).toBe('sharp')
    expect(trainer.state.wrongPitch).toEqual(F4)
    expect(trainer.state.wrongAccidental).toBe('sharp')
  })

  it('asks to change the note while its step and its sign are those rejected', () => {
    const trainer = setup(F_IN_G_MAJOR)
    rejectSharp(trainer)

    trainer.check()

    expect(trainer.state.hint).toBe('move-note')
    expect(trainer.state.outcome).toBeNull()
  })

  it('takes the same step with another sign as another answer', () => {
    const trainer = setup(F_IN_G_MAJOR)
    rejectSharp(trainer)

    trainer.toggleSharp()
    trainer.check()

    expect(trainer.state.hint).toBeNull()
    expect(trainer.state.outcome).toBe('correct-second-try')
  })

  it('asks again once the rejected sign is put back on the rejected step', () => {
    const trainer = setup(F_IN_G_MAJOR)
    rejectSharp(trainer)
    trainer.toggleSharp()

    trainer.toggleSharp()
    trainer.check()

    expect(trainer.state.hint).toBe('move-note')
  })

  it('takes another step with the rejected sign as another answer', () => {
    const trainer = setup(F_IN_G_MAJOR)
    rejectSharp(trainer)

    trainer.stepUp()
    trainer.check()

    expect(trainer.state.hint).toBeNull()
    expect(trainer.state.outcome).toBe('incorrect')
  })

  it('takes no sign on a note right on the first attempt', () => {
    const trainer = setup(F_SHARP_G)
    trainer.place(F4, 0)
    trainer.place(G4, 1)
    trainer.check()
    expect(trainer.state.current).toBe(0)

    trainer.goToNote(1)
    trainer.toggleFlat()

    expect(trainer.state.notes[1]?.accidental).toBeNull()
  })

  it('takes no sign once the question is over', () => {
    const trainer = setup(F_SHARP, 1)
    trainer.place(F4)
    trainer.check()

    trainer.toggleSharp()

    expect(trainer.state.accidental).toBeNull()
  })

  it('opens the next question without signs', () => {
    const trainer = setup(F_SHARP)
    trainer.place(F4)
    trainer.toggleSharp()
    trainer.check()

    trainer.next()

    expect(trainer.state.notes.every((note) => note.accidental === null)).toBe(true)
    expect(trainer.state.wrongAccidental).toBeNull()
  })
})
