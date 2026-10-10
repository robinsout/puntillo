import { describe, expect, expectTypeOf, it } from 'vitest'
import type { KeySignature } from '@/domain/key-signature'
import type { Letter, Pitch } from '@/domain/pitch'
import {
  alterationSource,
  applyAccidentals,
  createQuestionOf,
  isNote,
  type Accidental,
  type AlterationSource,
  type Note,
  type NoteOrRest,
  type TimeSignature,
} from '@/domain/question'

// Feature accidentals, slice 2: accidentals and the bar rule (criterion 4), by the common
// practice rule (docs/notation-references.md, «Альтерации»).
//
// A note may carry a sign written before it: a sharp, a flat or a natural. applyAccidentals takes
// the notes of a question on their places, a letter and an octave, each with the sign of its own
// if it has one, and gives them back as they sound:
// - a note with a sign sounds as the sign says;
// - a note without one sounds as the last sign at its place earlier in the bar says, else as the
//   key signature says; the bar line ends every sign;
// - a note without a sign of its own gets a courtesy sign, telling how it sounds, when it is the
//   first note of its place in the bar and a sign on its letter said otherwise earlier in the bar
//   in another octave, or anywhere in the bar before. A courtesy sign changes no sound.
//
// alterationSource tells where the alteration of a note comes from: its sign, a sign at its place
// earlier in the bar, or the key signature. The review names it (criterion 12).

const TWO_FOUR: TimeSignature = { beats: 2, beatValue: 4 }
const FOUR_FOUR: TimeSignature = { beats: 4, beatValue: 4 }
const NONE: KeySignature = { count: 0 }
const ONE_SHARP: KeySignature = { count: 1, accidental: 'sharp' }
const ONE_FLAT: KeySignature = { count: 1, accidental: 'flat' }

// 'F4' a quarter on its place; '#F4' with a sharp before it, 'bF4' with a flat, 'nF4' with a
// natural; 'rest' a quarter rest.
function element(text: string): NoteOrRest {
  if (text === 'rest') return { duration: { value: 'quarter' } }
  const match = /^([#bn]?)([A-G])(\d)$/.exec(text)
  if (!match) throw new Error(`not a note: ${text}`)
  const SIGNS: Record<string, Accidental> = { '#': 'sharp', b: 'flat', n: 'natural' }
  const sign = SIGNS[match[1] ?? '']
  const pitch: Pitch = { letter: match[2] as Letter, octave: Number(match[3]) }
  const note: Note = { pitch, duration: { value: 'quarter' } }
  return sign ? { ...note, accidental: sign } : note
}

const elements = (...texts: string[]) => texts.map(element)

// 'F#4' as it sounds; a sign before the note leads: 'sharp F#4', 'natural F5'.
function written(result: readonly NoteOrRest[]): string[] {
  return result.map((each) => {
    if (!isNote(each)) return 'rest'
    const { letter, octave, alteration } = each.pitch
    const sound = `${letter}${alteration === 1 ? '#' : alteration === -1 ? 'b' : ''}${octave}`
    return each.accidental ? `${each.accidental} ${sound}` : sound
  })
}

const applied = (
  timeSignature: TimeSignature,
  keySignature: KeySignature,
  ...texts: string[]
): string[] => written(applyAccidentals(elements(...texts), timeSignature, keySignature))

describe('the sign of a note', () => {
  it('is a sharp, a flat or a natural, and a note without one has no field', () => {
    expectTypeOf<Accidental>().toEqualTypeOf<'sharp' | 'flat' | 'natural'>()
    expectTypeOf<Note['accidental']>().toEqualTypeOf<Accidental | undefined>()
    expectTypeOf<{ pitch: Pitch; duration: { value: 'quarter' } }>().toExtend<Note>()
  })
})

describe('applyAccidentals', () => {
  it('leaves the notes natural without signs or a key signature', () => {
    expect(applied(FOUR_FOUR, NONE, 'F4', 'G4', 'C5')).toEqual(['F4', 'G4', 'C5'])
  })

  it('gives no natural note an alteration field', () => {
    const [note] = applyAccidentals(elements('F4'), FOUR_FOUR, NONE)

    expect(note).toEqual({ pitch: { letter: 'F', octave: 4 }, duration: { value: 'quarter' } })
  })

  it('applies the key signature to its letters in every octave, with no sign', () => {
    expect(applied(FOUR_FOUR, ONE_SHARP, 'F4', 'G4', 'F5')).toEqual(['F#4', 'G4', 'F#5'])
    expect(applied(FOUR_FOUR, ONE_FLAT, 'B4', 'B3')).toEqual(['Bb4', 'Bb3'])
  })

  it('sounds a note as its own sign says', () => {
    expect(applied(FOUR_FOUR, NONE, '#F4', 'bB4', '#E5')).toEqual([
      'sharp F#4',
      'flat Bb4',
      'sharp E#5',
    ])
  })

  it('keeps the sign for the note at the same place later in the bar', () => {
    expect(applied(FOUR_FOUR, NONE, '#F4', 'G4', 'F4', 'A4')).toEqual([
      'sharp F#4',
      'G4',
      'F#4',
      'A4',
    ])
  })

  it('lets a later sign at the same place take over for the rest of the bar', () => {
    expect(applied(FOUR_FOUR, NONE, '#F4', 'bF4', 'F4', 'G4')).toEqual([
      'sharp F#4',
      'flat Fb4',
      'Fb4',
      'G4',
    ])
  })

  it('ends the sign at the bar line, with a courtesy natural on that note in the next bar', () => {
    expect(applied(TWO_FOUR, NONE, '#F4', 'G4', 'F4', 'F4')).toEqual([
      'sharp F#4',
      'G4',
      'natural F4',
      'F4',
    ])
  })

  it('counts the bars over rests', () => {
    expect(applied(TWO_FOUR, NONE, '#F4', 'rest', 'rest', 'F4')).toEqual([
      'sharp F#4',
      'rest',
      'rest',
      'natural F4',
    ])
  })

  it('puts a courtesy sign on the note of the letter in another octave of the bar', () => {
    expect(applied(FOUR_FOUR, NONE, '#F4', 'F5', 'G4', 'F5')).toEqual([
      'sharp F#4',
      'natural F5',
      'G4',
      'F5',
    ])
  })

  it('puts a courtesy sign on the first note of the letter in each octave of the next bar', () => {
    expect(applied(TWO_FOUR, NONE, '#F4', 'G4', 'F5', 'F4')).toEqual([
      'sharp F#4',
      'G4',
      'natural F5',
      'natural F4',
    ])
  })

  it('gives no courtesy sign two bars later', () => {
    expect(applied(TWO_FOUR, NONE, '#F4', 'G4', 'A4', 'B4', 'F4', 'G4')).toEqual([
      'sharp F#4',
      'G4',
      'A4',
      'B4',
      'F4',
      'G4',
    ])
  })

  it('gives no courtesy sign to another letter', () => {
    expect(applied(TWO_FOUR, NONE, '#F4', 'G4', 'G4', 'E4')).toEqual([
      'sharp F#4',
      'G4',
      'G4',
      'E4',
    ])
  })

  it('gives no courtesy sign to a note before the sign in the bar', () => {
    expect(applied(FOUR_FOUR, NONE, 'F5', '#F4', 'G4', 'A4')).toEqual([
      'F5',
      'sharp F#4',
      'G4',
      'A4',
    ])
  })

  it('brings back the key signature with a courtesy sign of its own kind', () => {
    expect(applied(TWO_FOUR, ONE_SHARP, 'bF4', 'G4', 'F4', 'G4')).toEqual([
      'flat Fb4',
      'G4',
      'sharp F#4',
      'G4',
    ])
    expect(applied(FOUR_FOUR, ONE_FLAT, '#B4', 'B3', 'C4', 'D4')).toEqual([
      'sharp B#4',
      'flat Bb3',
      'C4',
      'D4',
    ])
  })

  it('gives no courtesy sign to a note that sounds as the sign before it said', () => {
    expect(applied(TWO_FOUR, ONE_SHARP, '#F4', 'G4', 'F4', 'G4')).toEqual([
      'sharp F#4',
      'G4',
      'F#4',
      'G4',
    ])
  })

  it('keeps a sign the note did not need', () => {
    expect(applied(FOUR_FOUR, NONE, 'nF4', 'G4')).toEqual(['natural F4', 'G4'])
  })

  it('takes the place of a note from its letter and octave alone', () => {
    const sharpWithoutSign: Note = {
      pitch: { letter: 'F', octave: 4, alteration: 1 },
      duration: { value: 'quarter' },
    }

    expect(written(applyAccidentals([sharpWithoutSign], FOUR_FOUR, NONE))).toEqual(['F4'])
  })

  // A courtesy sign tells the sound the note has anyway, so it changes nothing given again.
  it('changes nothing when given its own result', () => {
    const once = applyAccidentals(
      elements('#F4', 'G4', 'F5', 'bB4', 'F4', 'B4', 'B3', 'F5'),
      TWO_FOUR,
      ONE_SHARP,
    )

    expect(applyAccidentals(once, TWO_FOUR, ONE_SHARP)).toEqual(once)
  })

  it('keeps the durations and the rests', () => {
    const given: NoteOrRest[] = [
      {
        pitch: { letter: 'F', octave: 4 },
        duration: { value: 'half', dots: 1 },
        accidental: 'sharp',
      },
      { duration: { value: 'quarter' } },
    ]

    expect(applyAccidentals(given, FOUR_FOUR, NONE)).toEqual([
      {
        pitch: { letter: 'F', octave: 4, alteration: 1 },
        duration: { value: 'half', dots: 1 },
        accidental: 'sharp',
      },
      { duration: { value: 'quarter' } },
    ])
  })

  it('leaves the given elements as they were', () => {
    const given = elements('#F4', 'G4', 'F4', 'F5')
    const before = structuredClone(given)

    applyAccidentals(given, FOUR_FOUR, NONE)

    expect(given).toEqual(before)
  })
})

describe('alterationSource', () => {
  const question = (timeSignature: TimeSignature, keySignature: KeySignature, ...texts: string[]) =>
    createQuestionOf(
      timeSignature,
      applyAccidentals(elements(...texts), timeSignature, keySignature),
      keySignature,
    )
  const sources = (
    timeSignature: TimeSignature,
    keySignature: KeySignature,
    ...texts: string[]
  ): (AlterationSource | undefined)[] => {
    const asked = question(timeSignature, keySignature, ...texts)
    return asked.notes.map((_, index) => alterationSource(asked, index))
  }

  it('is a sign, a sign earlier in the bar or the key signature', () => {
    expectTypeOf<AlterationSource>().toEqualTypeOf<
      'sign' | 'earlier in the bar' | 'key signature'
    >()
  })

  it('is none for a natural note without signs', () => {
    expect(sources(FOUR_FOUR, NONE, 'F4', 'G4')).toEqual([undefined, undefined])
  })

  it('is the key signature for a note of its letters', () => {
    expect(sources(FOUR_FOUR, ONE_SHARP, 'F4', 'G4', 'F5')).toEqual([
      'key signature',
      undefined,
      'key signature',
    ])
  })

  it('is the sign before the note, its own or a courtesy one', () => {
    expect(sources(FOUR_FOUR, NONE, '#F4', 'F5')).toEqual(['sign', 'sign'])
  })

  it('is the sign earlier in the bar for a note at its place', () => {
    expect(sources(FOUR_FOUR, NONE, '#F4', 'G4', 'F4')).toEqual([
      'sign',
      undefined,
      'earlier in the bar',
    ])
  })

  it('is the sign earlier in the bar over the key signature', () => {
    expect(sources(FOUR_FOUR, ONE_SHARP, 'bF4', 'F4')).toEqual(['sign', 'earlier in the bar'])
  })

  it('is no sign of the bar before', () => {
    expect(sources(TWO_FOUR, NONE, '#F4', 'G4', 'A4', 'F4')).toEqual([
      'sign',
      undefined,
      undefined,
      'sign',
    ])
  })

  it('is no sign in another octave', () => {
    const asked = createQuestionOf(FOUR_FOUR, elements('#F4', 'F5'))

    expect(alterationSource(asked, 1)).toBeUndefined()
  })

  it('counts the notes alone, not the rests', () => {
    expect(sources(FOUR_FOUR, NONE, '#F4', 'rest', 'F4')).toEqual(['sign', 'earlier in the bar'])
  })

  it('throws for a note the question does not have', () => {
    const asked = question(FOUR_FOUR, NONE, 'F4')

    expect(() => alterationSource(asked, 1)).toThrow('no note')
    expect(() => alterationSource(asked, -1)).toThrow('no note')
  })
})
