import { describe, expect, it } from 'vitest'
import { createQuestionOf, type Duration, type NoteOrRest } from '@/domain/question'
import { parsePitchText, parseStaffExample } from '@/domain/wiki'

// Feature wiki, slice 1: an article names a note as :note[F#4] and draws an example from a staff
// block; both describe notes as text. A pitch is its letter, its sign and its octave: "C4", "F#4",
// "Bb4", "Bn4" (a natural). An example is the time signature and then the notes and the rests in
// their order, each with its duration and an ending dot when dotted: "4/4 C4/half. rest/quarter".

describe('the text of a pitch', () => {
  it('reads a natural note as its letter and octave', () => {
    expect(parsePitchText('C4')).toEqual({ letter: 'C', octave: 4 })
    expect(parsePitchText('G5')).toEqual({ letter: 'G', octave: 5 })
  })

  it('reads # as a sharp and b as a flat', () => {
    expect(parsePitchText('F#4')).toEqual({ letter: 'F', octave: 4, alteration: 1 })
    expect(parsePitchText('Bb4')).toEqual({ letter: 'B', octave: 4, alteration: -1 })
  })

  it('reads n as a natural: the pitch has no alteration', () => {
    expect(parsePitchText('Bn4')).toEqual({ letter: 'B', octave: 4 })
  })

  it.each(['', 'H4', 'c4', 'C', 'C#', 'Cx4', 'C44', ' C4', 'C4 '])(
    'gives nothing for "%s"',
    (text) => {
      expect(parsePitchText(text)).toBeNull()
    },
  )
})

const plain = (value: Duration['value']): Duration => ({ value })
const dotted = (value: Duration['value']): Duration => ({ value, dots: 1 })

describe('the text of a staff example', () => {
  it('reads the time signature and one note', () => {
    expect(parseStaffExample('4/4 C4/whole')).toEqual(
      createQuestionOf({ beats: 4, beatValue: 4 }, [
        { pitch: { letter: 'C', octave: 4 }, duration: plain('whole') },
      ]),
    )
  })

  it('reads every offered time signature', () => {
    expect(parseStaffExample('3/4 C4/half.')?.timeSignature).toEqual({ beats: 3, beatValue: 4 })
    expect(parseStaffExample('2/4 C4/half')?.timeSignature).toEqual({ beats: 2, beatValue: 4 })
    expect(parseStaffExample('6/8 C4/half.')?.timeSignature).toEqual({ beats: 6, beatValue: 8 })
  })

  it('reads notes and rests in their order, with every duration', () => {
    const elements: NoteOrRest[] = [
      { pitch: { letter: 'C', octave: 5 }, duration: plain('half') },
      { duration: plain('quarter') },
      { pitch: { letter: 'E', octave: 4 }, duration: plain('eighth') },
      { pitch: { letter: 'G', octave: 4 }, duration: plain('sixteenth') },
      { duration: plain('sixteenth') },
      { duration: plain('whole') },
    ]

    expect(
      parseStaffExample(
        '4/4 C5/half rest/quarter E4/eighth G4/sixteenth rest/sixteenth rest/whole',
      ),
    ).toEqual(createQuestionOf({ beats: 4, beatValue: 4 }, elements))
  })

  it('reads an ending dot as a dotted duration, of a note or of a rest', () => {
    expect(parseStaffExample('4/4 C4/half. rest/quarter')?.elements).toEqual([
      { pitch: { letter: 'C', octave: 4 }, duration: dotted('half') },
      { duration: plain('quarter') },
    ])
    expect(parseStaffExample('4/4 rest/quarter. C4/eighth')?.elements).toEqual([
      { duration: dotted('quarter') },
      { pitch: { letter: 'C', octave: 4 }, duration: plain('eighth') },
    ])
  })

  it('writes the sign of an altered note before it', () => {
    expect(parseStaffExample('4/4 F#4/half Bb4/quarter Bn4/quarter')?.elements).toEqual([
      {
        pitch: { letter: 'F', octave: 4, alteration: 1 },
        duration: plain('half'),
        accidental: 'sharp',
      },
      {
        pitch: { letter: 'B', octave: 4, alteration: -1 },
        duration: plain('quarter'),
        accidental: 'flat',
      },
      { pitch: { letter: 'B', octave: 4 }, duration: plain('quarter'), accidental: 'natural' },
    ])
  })

  it('has no key signature', () => {
    expect(parseStaffExample('4/4 C4/whole')?.keySignature).toEqual({ count: 0 })
  })

  it('takes any spaces and line breaks between the parts', () => {
    expect(parseStaffExample('  4/4\n C4/half\n\tD4/half \n')?.notes).toHaveLength(2)
  })

  it.each([
    ['nothing', ''],
    ['no time signature', 'C4/whole'],
    ['a time signature not offered', '5/4 C4/whole'],
    ['the time signature alone', '4/4'],
    ['rests alone: there is no note to show', '4/4 rest/whole'],
    ['an unknown duration', '4/4 C4/double'],
    ['a note without a duration', '4/4 C4'],
    ['a wrong pitch', '4/4 H4/whole'],
    ['a dotted sixteenth', '4/4 C4/sixteenth.'],
    ['two dots', '4/4 C4/half..'],
    ['the time signature in the middle', '4/4 C4/half 3/4 D4/half'],
  ])('gives nothing for %s', (_, text) => {
    expect(parseStaffExample(text)).toBeNull()
  })
})
