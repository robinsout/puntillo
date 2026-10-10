import { describe, expect, it } from 'vitest'
import { createQuestionGenerator } from '@/application/question-generation'
import type { Random } from '@/application/ports'
import {
  ACCIDENTAL_SETS,
  allowedPitches,
  isPlayable,
  KEY_SIGNATURE_LIMITS,
  PRESETS,
  presetDifficulty,
  QUESTION_LENGTHS,
  type Difficulty,
} from '@/domain/difficulty'
import { keySignatureLetters, type KeySignature } from '@/domain/key-signature'
import { diatonicPitchesBetween, diatonicStep, type Letter, type Pitch } from '@/domain/pitch'
import {
  barsOf,
  cancelledByNatural,
  DURATION_VALUES,
  isNote,
  type Note,
  type Question,
  type TimeSignature,
} from '@/domain/question'

// Feature accidentals, slice 2, criteria 4 and 5: with Accidentals set to Sharp and flat, a sharp
// or a flat stands before some notes of a question. It never repeats the key signature nor a sign
// earlier in the bar: it stands only where the note would sound natural. The notes sound by the
// bar rule, with courtesy signs where the common practice asks for them (applyAccidentals of the
// domain, docs/notation-references.md).
//
// The signs spend their values last, after the elements and the key signature: for each note in
// turn one value, a sign from 3/4 on; then, if a sign may stand there, one more: below 1/2 a
// sharp, from 1/2 on a flat. With Accidentals set to None they spend nothing, so the values go as
// before.
//
// Slice 3, criterion 6: with Sharp, flat and natural, a natural stands, from 3/4 on, before a note
// that would sound altered: on a letter of the key signature, or at a place a sharp or a flat
// stood at earlier in the bar. It takes no value for its kind, so the values go as with Sharp and
// flat. A note that already sounds natural takes a sharp or a flat as before, and a note after a
// natural at its place in the bar takes nothing.

const SIGNS = { sharp: '#', flat: 'b', natural: 'n' } as const
const SOUNDS: Record<string, string> = { '1': '#', '-1': 'b' }

// 'F#4' as it sounds; a sign before the note leads: '#F#4', 'nF4'.
const written = ({ pitch, accidental }: Note): string =>
  `${accidental ? SIGNS[accidental] : ''}${pitch.letter}${SOUNDS[String(pitch.alteration)] ?? ''}${pitch.octave}`
const notesOf = (question: Question) => question.notes.map(written)

const ALMOST_ONE = 1 - Number.EPSILON

// An extra call fails the test.
function scripted(...values: number[]): Random {
  const queue = [...values]
  return {
    next() {
      const value = queue.shift()
      if (value === undefined) throw new Error('scripted random is exhausted')
      return value
    },
  }
}

// mulberry32: a deterministic seeded generator.
function seeded(seed: number): Random {
  let state = seed >>> 0
  return {
    next() {
      state = (state + 0x6d2b79f5) >>> 0
      let t = state
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    },
  }
}

// First steps: one note of the seven D4…C5 by floor(next × 7), then half or quarter by
// floor(next × 2); no key signatures. F4 is the third of the seven, E4 the second.
const FIRST_STEPS = presetDifficulty('first-steps')
const F4 = 2.5 / 7
const E4 = 1.5 / 7

const values = (overrides: Partial<Difficulty>): Difficulty => ({
  ...FIRST_STEPS,
  accidentals: 'sharp-and-flat',
  ...overrides,
})
const generate = (random: Random, overrides: Partial<Difficulty> = {}) =>
  createQuestionGenerator(random, values(overrides))()

describe('a question without accidentals', () => {
  it('has no signs and spends no value on them', () => {
    const question = generate(scripted(F4, 0), { accidentals: 'none' })

    expect(notesOf(question)).toEqual(['F4'])
    expect(question.notes[0]).not.toHaveProperty('accidental')
  })
})

describe('a note with sharps and flats allowed', () => {
  it.each([0, 0.5, 0.74])('has no sign below 3/4: %f', (chance) => {
    const question = generate(scripted(F4, 0, chance))

    expect(notesOf(question)).toEqual(['F4'])
    expect(question.notes[0]).not.toHaveProperty('accidental')
  })

  it.each([
    [0.75, 0, '#F#4'],
    [0.9, 0.49, '#F#4'],
    [0.9, 0.5, 'bFb4'],
    [ALMOST_ONE, ALMOST_ONE, 'bFb4'],
  ])(
    'has a sign from 3/4, %f, a sharp below 1/2 and a flat from it, %f: %s',
    (chance, sign, note) => {
      expect(notesOf(generate(scripted(F4, 0, chance, sign)))).toEqual([note])
    },
  )

  it('stands on the place it had without the sign', () => {
    const plain = generate(scripted(F4, 0), { accidentals: 'none' }).notes[0].pitch
    const signed = generate(scripted(F4, 0, 0.9, 0.5)).notes[0]

    expect({ letter: signed.pitch.letter, octave: signed.pitch.octave }).toEqual(plain)
    expect(signed.duration).toEqual({ value: 'half' })
  })

  it('spends its values after the key signature', () => {
    // E4 a half, one sharp, then a sharp before E4.
    const question = generate(scripted(E4, 0, 0.5, 0, 0.9, 0), { keySignatures: 2 })

    expect(question.keySignature).toEqual({ count: 1, accidental: 'sharp' })
    expect(notesOf(question)).toEqual(['#E#4'])
  })

  // Criterion 5 and spec 6.1: if F♯ is in the key signature, no sharp stands before F.
  it('takes no sign on a letter of the key signature, spending no value on the kind', () => {
    const question = generate(scripted(F4, 0, 0.5, 0, 0.9), { keySignatures: 2 })

    expect(notesOf(question)).toEqual(['F#4'])
  })

  it('takes no flat on a letter of the key signature of flats either', () => {
    // B4, the sixth of the seven, with one flat.
    const question = generate(scripted(5.5 / 7, 0, 0.5, 0.5, ALMOST_ONE), { keySignatures: 2 })

    expect(notesOf(question)).toEqual(['Bb4'])
  })
})

// Three notes of First steps in one bar of 4/4: the number of notes, the 2nd of 2, 3 and 4; F4, G4
// among the other six, F4 among the other six; each a quarter, the 2nd of half and quarter. Then
// for each note its sign.
const F4_G4_F4 = [0.5, F4, 0.5, 2.5 / 6, 0.5, 2.5 / 6, 0.5]

// Criterion 4.
describe('the notes of a bar after a sign', () => {
  const several = (...signs: number[]) =>
    generate(scripted(...F4_G4_F4, ...signs), { questionLength: 'two-to-four-notes' })

  it('sound as the sign says at the same place, with no sign of their own', () => {
    expect(notesOf(several(0.9, 0, 0, 0.9))).toEqual(['#F#4', 'G4', 'F#4'])
  })

  it('keep a flat as they keep a sharp', () => {
    expect(notesOf(several(0.9, 0.5, 0, 0))).toEqual(['bFb4', 'G4', 'Fb4'])
  })

  it('take a sign at another place', () => {
    expect(notesOf(several(0, 0.9, 0.5, 0))).toEqual(['F4', 'bGb4', 'F4'])
  })
})

// Two bars of First steps, half notes: F4 and G4, then F4 and A4. Each note spends its pitch, F4
// first, then one of the other six, and its duration, the first of half and quarter.
const TWO_BARS = [F4, 0, 2.5 / 6, 0, 2.5 / 6, 0, 3.5 / 6, 0]

describe('the bar after a sign', () => {
  const twoBars = (...signs: number[]) =>
    generate(scripted(...TWO_BARS, ...signs), { questionLength: 'two-bars' })

  it('lets the same note take a sign of its own again', () => {
    expect(notesOf(twoBars(0.9, 0, 0, 0.9, 0.5, 0))).toEqual(['#F#4', 'G4', 'bFb4', 'A4'])
  })

  it('gives the same note a courtesy natural when it takes no sign of its own', () => {
    expect(notesOf(twoBars(0.9, 0, 0, 0, 0))).toEqual(['#F#4', 'G4', 'nF4', 'A4'])
  })
})

const NATURALS = { accidentals: 'sharp-flat-and-natural' } as const

// Criterion 6 and spec 6.1.
describe('a note with sharps, flats and naturals allowed', () => {
  it.each([
    [0.75, 0, '#F#4'],
    [0.9, 0.5, 'bFb4'],
  ])('takes a sharp or a flat where it sounds natural, as before: %f, %f', (chance, sign, note) => {
    expect(notesOf(generate(scripted(F4, 0, chance, sign), NATURALS))).toEqual([note])
  })

  it('has no sign below 3/4 on a letter of the key signature', () => {
    // F4 a half, one sharp.
    const question = generate(scripted(F4, 0, 0.5, 0, 0.74), { ...NATURALS, keySignatures: 2 })

    expect(notesOf(question)).toEqual(['F#4'])
  })

  it('takes a natural from 3/4 on a letter of the key signature, spending no value on the kind', () => {
    const question = generate(scripted(F4, 0, 0.5, 0, 0.75), { ...NATURALS, keySignatures: 2 })

    expect(notesOf(question)).toEqual(['nF4'])
  })

  it('takes a natural on a letter of the key signature of flats', () => {
    // B4, the sixth of the seven, with one flat.
    const question = generate(scripted(5.5 / 7, 0, 0.5, 0.5, ALMOST_ONE), {
      ...NATURALS,
      keySignatures: 2,
    })

    expect(notesOf(question)).toEqual(['nB4'])
  })

  it('takes no natural with sharps and flats alone', () => {
    const question = generate(scripted(F4, 0, 0.5, 0, 0.9), { keySignatures: 2 })

    expect(notesOf(question)).toEqual(['F#4'])
  })
})

describe('the notes of a bar with naturals allowed', () => {
  const several = (overrides: Partial<Difficulty>, ...values: number[]) =>
    generate(scripted(...F4_G4_F4, ...values), {
      ...NATURALS,
      questionLength: 'two-to-four-notes',
      ...overrides,
    })

  it('take a natural at the place of a sharp earlier in the bar', () => {
    expect(notesOf(several({}, 0.9, 0, 0, 0.9))).toEqual(['#F#4', 'G4', 'nF4'])
  })

  it('take a natural at the place of a flat earlier in the bar', () => {
    expect(notesOf(several({}, 0.9, 0.5, 0, 0.9))).toEqual(['bFb4', 'G4', 'nF4'])
  })

  it('keep the sign earlier in the bar below 3/4', () => {
    expect(notesOf(several({}, 0.9, 0, 0, 0.5))).toEqual(['#F#4', 'G4', 'F#4'])
  })

  it('sound natural after a natural at their place, taking no sign again', () => {
    // One sharp: a natural before the first F4, the second may take none.
    expect(notesOf(several({ keySignatures: 2 }, 0.5, 0, 0.9, 0, 0.9))).toEqual(['nF4', 'G4', 'F4'])
  })

  it('take a natural at another place of the letter of the key signature, the octave apart', () => {
    // D4–G5, eleven places: three quarters, F4, G4 among the other ten, F5 among the other ten;
    // one sharp; no sign before F4 and G4, a natural before F5.
    const question = generate(
      scripted(0.5, 2.5 / 11, 0.5, 2.5 / 10, 0.5, 8.5 / 10, 0.5, 0.5, 0, 0, 0, 0.9),
      {
        ...NATURALS,
        questionLength: 'two-to-four-notes',
        keySignatures: 2,
        range: { low: { letter: 'D', octave: 4 }, high: { letter: 'G', octave: 5 } },
      },
    )

    expect(notesOf(question)).toEqual(['F#4', 'G4', 'nF5'])
  })
})

describe('the bar after a natural', () => {
  // Gould: once the bar line ends the natural, the key signature comes back with a courtesy sign.
  it('brings back the key signature with a courtesy sharp', () => {
    const question = generate(scripted(...TWO_BARS, 0.5, 0, 0.9, 0, 0, 0), {
      ...NATURALS,
      questionLength: 'two-bars',
      keySignatures: 2,
    })

    expect(notesOf(question)).toEqual(['nF4', 'G4', '#F#4', 'A4'])
  })
})

describe('the values of a question with naturals allowed', () => {
  // Counts the values the generator spends.
  function counted(random: Random): Random & { readonly count: number } {
    let count = 0
    return {
      next() {
        count++
        return random.next()
      },
      get count() {
        return count
      },
    }
  }
  const placesOf = (question: Question) =>
    question.notes.map(({ pitch, duration }) => [pitch.letter, pitch.octave, duration])

  it.each(PRESETS)(
    'are the same as with sharps and flats alone, the notes on the same places, in %s',
    (preset) => {
      const difficulty: Difficulty = { ...presetDifficulty(preset), keySignatures: 7 }
      const withNaturals = counted(seeded(13))
      const without = counted(seeded(13))
      const nextWith = createQuestionGenerator(withNaturals, {
        ...difficulty,
        accidentals: 'sharp-flat-and-natural',
      })
      const nextWithout = createQuestionGenerator(without, {
        ...difficulty,
        accidentals: 'sharp-and-flat',
      })
      for (let count = 0; count < 200; count++) {
        expect(placesOf(nextWith())).toEqual(placesOf(nextWithout()))
        expect(withNaturals.count).toBe(without.count)
      }
    },
  )
})

// Spec 16: on random settings a generated question always keeps to the limits of spec 6.1.
describe('questions with accidentals over random settings', () => {
  const SPAN = diatonicPitchesBetween({ letter: 'A', octave: 3 }, { letter: 'C', octave: 6 })
  const TIME_SIGNATURES: TimeSignature[] = [
    { beats: 4, beatValue: 4 },
    { beats: 3, beatValue: 4 },
    { beats: 2, beatValue: 4 },
    { beats: 6, beatValue: 8 },
  ]

  function element<T>(items: readonly T[], random: Random): T {
    const item = items[Math.floor(random.next() * items.length)]
    if (item === undefined) throw new Error('no item to pick')
    return item
  }

  // Only what the panel lets one choose: a playable difficulty.
  function randomDifficulty(random: Random): Difficulty {
    for (;;) {
      const [low, high] = [element(SPAN, random), element(SPAN, random)].sort(
        (a, b) => diatonicStep(a) - diatonicStep(b),
      )
      if (!low || !high) throw new Error('no range')
      const difficulty: Difficulty = {
        range: { low, high },
        ledgerLines: element([0, 1, 2] as const, random),
        keySignatures: element(KEY_SIGNATURE_LIMITS, random),
        accidentals: element(ACCIDENTAL_SETS, random),
        durations: DURATION_VALUES.filter(() => random.next() < 0.5),
        askDuration: random.next() < 0.5,
        questionLength: element(QUESTION_LENGTHS, random),
        timeSignatures: TIME_SIGNATURES.filter(() => random.next() < 0.5),
        rests: random.next() < 0.5,
        dots: random.next() < 0.5,
      }
      if (isPlayable(difficulty)) return difficulty
    }
  }

  const ALTERATIONS = { sharp: 1, flat: -1, natural: undefined } as const
  const keyAlteration = (keySignature: KeySignature, letter: Letter) =>
    keySignature.count !== 0 && keySignatureLetters(keySignature).includes(letter)
      ? ALTERATIONS[keySignature.accidental]
      : undefined
  const samePlace = (a: Pitch, b: Pitch) => a.letter === b.letter && a.octave === b.octave

  // What breaks the limits, so that a failure names the question and the note.
  function breaches(difficulty: Difficulty, question: Question): string[] {
    const found: string[] = []
    const allowed = allowedPitches(difficulty)
    const bars = barsOf(question).map((bar) => bar.filter(isNote))
    // The signs on the letter that say otherwise than the note sounds.
    const contradictingIn = (notes: readonly Note[], { letter, alteration }: Pitch) =>
      notes.filter(
        (each) =>
          each.pitch.letter === letter &&
          each.accidental &&
          ALTERATIONS[each.accidental] !== alteration,
      )
    bars.forEach((notes, barIndex) => {
      const barBefore = bars[barIndex - 1] ?? []
      notes.forEach((note, index) => {
        const what = `${written(note)}, note ${index + 1} of bar ${barIndex + 1}: ${notesOf(question).join(' ')}`
        const before = notes.slice(0, index)
        const { pitch, accidental } = note
        if (!allowed.some((each) => samePlace(each, pitch))) found.push(`off the range: ${what}`)
        if (difficulty.accidentals === 'none' && accidental) found.push(`a sign: ${what}`)
        const lastSign = before.findLast((each) => each.accidental && samePlace(each.pitch, pitch))
        const withoutSign = lastSign?.accidental
          ? ALTERATIONS[lastSign.accidental]
          : keyAlteration(question.keySignature, pitch.letter)
        const sound = accidental ? ALTERATIONS[accidental] : withoutSign
        if (pitch.alteration !== sound) found.push(`a wrong sound: ${what}`)
        const contradicting = [
          ...contradictingIn(barBefore, pitch),
          ...contradictingIn(before, pitch).filter((each) => each.pitch.octave !== pitch.octave),
        ]
        // A courtesy sign tells the sound the note has anyway.
        const courtesy =
          accidental !== undefined && sound === withoutSign && contradicting.length > 0
        if ((accidental === 'sharp' || accidental === 'flat') && !courtesy) {
          if (keyAlteration(question.keySignature, pitch.letter) !== undefined)
            found.push(`a sign over the key signature: ${what}`)
          if (lastSign && lastSign.accidental !== 'natural')
            found.push(`a sign over a sign earlier in the bar: ${what}`)
        }
        // Criterion 6: a natural of its own stands where the note would sound altered without it.
        if (accidental === 'natural' && !courtesy) {
          if (withoutSign === undefined) found.push(`a natural without a reason: ${what}`)
          else if (difficulty.accidentals !== 'sharp-flat-and-natural')
            found.push(`a natural not allowed: ${what}`)
        }
        const firstAtPlace = !before.some((each) => samePlace(each.pitch, pitch))
        if (!accidental && firstAtPlace && contradicting.length > 0)
          found.push(`no courtesy sign: ${what}`)
      })
    })
    return found
  }

  it('keep to the bar rule and never repeat a sign, on 300 random settings', () => {
    const random = seeded(7)
    for (let run = 0; run < 300; run++) {
      const difficulty = randomDifficulty(random)
      const nextQuestion = createQuestionGenerator(random, difficulty)
      for (let count = 0; count < 20; count++) {
        const question = nextQuestion()
        expect(breaches(difficulty, question)).toEqual([])
      }
    }
  })

  it.each(PRESETS.flatMap((preset) => ACCIDENTAL_SETS.map((set) => [preset, set] as const)))(
    'keep to the bar rule in %s with %s',
    (preset, accidentals) => {
      const difficulty: Difficulty = { ...presetDifficulty(preset), accidentals }
      const nextQuestion = createQuestionGenerator(seeded(3), difficulty)
      for (let count = 0; count < 300; count++) {
        expect(breaches(difficulty, nextQuestion())).toEqual([])
      }
    },
  )

  it('put a sign before about a quarter of the notes that may take one, sharps and flats alike', () => {
    const nextQuestion = createQuestionGenerator(seeded(11), values({}))
    const signs: string[] = []
    for (let count = 0; count < 2000; count++)
      signs.push(nextQuestion().notes[0].accidental ?? 'none')

    const share = (sign: string) => signs.filter((each) => each === sign).length / signs.length
    expect(share('sharp') + share('flat')).toBeGreaterThan(0.2)
    expect(share('sharp') + share('flat')).toBeLessThan(0.3)
    expect(share('sharp')).toBeGreaterThan(0.1)
    expect(share('flat')).toBeGreaterThan(0.1)
  })

  it('put signs into questions of Confident reading, some of them courtesy naturals', () => {
    const nextQuestion = createQuestionGenerator(seeded(5), presetDifficulty('confident-reading'))
    const signs = new Set<string>()
    for (let count = 0; count < 300; count++)
      for (const note of nextQuestion().notes) signs.add(note.accidental ?? 'none')

    expect([...signs].sort()).toEqual(['flat', 'natural', 'none', 'sharp'])
  })

  it('put a natural before about a quarter of the notes on the letters of the key signature', () => {
    const nextQuestion = createQuestionGenerator(
      seeded(17),
      values({ ...NATURALS, keySignatures: 7 }),
    )
    const signs: string[] = []
    for (let count = 0; count < 4000; count++) {
      const question = nextQuestion()
      const [note] = question.notes
      if (keySignatureLetters(question.keySignature).includes(note.pitch.letter))
        signs.push(note.accidental ?? 'none')
    }

    const naturals = signs.filter((each) => each === 'natural').length / signs.length
    expect(signs.length).toBeGreaterThan(1000)
    expect(naturals).toBeGreaterThan(0.2)
    expect(naturals).toBeLessThan(0.3)
    expect(signs.filter((each) => each !== 'natural' && each !== 'none')).toEqual([])
  })

  it('put naturals into questions of Advanced, against the key signature and earlier signs', () => {
    const nextQuestion = createQuestionGenerator(seeded(19), presetDifficulty('advanced'))
    const cancelled = new Set<string>()
    for (let count = 0; count < 300; count++) {
      const question = nextQuestion()
      question.notes.forEach((_, index) => {
        const what = cancelledByNatural(question, index)
        if (what) cancelled.add(`${what.accidental} ${what.source}`)
      })
    }

    expect([...cancelled].sort()).toEqual([
      'flat earlier in the bar',
      'flat key signature',
      'sharp earlier in the bar',
      'sharp key signature',
    ])
  })
})
