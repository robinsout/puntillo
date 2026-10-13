import { describe, expect, it } from 'vitest'
import { createQuestionGenerator } from '@/application/question-generation'
import type { Random } from '@/application/ports'
import {
  ACCIDENTAL_SETS,
  allowedPitches,
  barCount,
  durationsOf,
  fewestNotes,
  fittingTimeSignatures,
  isPlayable,
  MAX_NOTES,
  PRESETS,
  presetDifficulty,
  QUESTION_LENGTHS,
  type Difficulty,
} from '@/domain/difficulty'
import { applyKeySignature, keySignatureLetters, type KeySignature } from '@/domain/key-signature'
import { isSamePitch, type Letter, type Pitch } from '@/domain/pitch'
import {
  barsOf,
  barSixteenths,
  COMMON_TIME,
  isNote,
  isRest,
  isSameDuration,
  sixteenths,
  sixteenthsOf,
  type Duration,
  type Note,
  type NoteOrRest,
  type Question,
} from '@/domain/question'
import type { ReviewItem } from '@/domain/review-queue'

// Feature review-queue, slice 2: questions of several notes, and the limits of the difficulty in
// every length of question.
//
// Criterion 6: an item due is a note of the question, of the same pitch as written (letter,
// alteration, octave) and the same duration, dotted if it was. The other notes go as usual. Where
// it stands among them is the generator's: the tests only ask that it does not always stand in the
// same place, so that a return does not give itself away.
//
// Every limit of the difficulty holds (spec 6.1 and 7.3). A question takes an item only if the
// item fits it: its duration fits the bar with the notes the length needs, and a sign it needs
// before it is one the difficulty allows. A natural item in a key signature that alters its letter
// needs a natural; a sharp or a flat item needs a sharp or a flat where the key signature leaves
// its letter natural, and never stands on a letter of the key signature with another sign. A
// question that does not take the item leaves it due, and the first question that may take it
// does (edge case 3): so whenever the question as generated, its time signature and key
// signature, would take the item, the item is in it.
//
// Criterion 7: the items come in the order of their priority. With more due than the question has
// notes, the notes are the first of them.

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

const SEEDS = Array.from({ length: 30 }, (_, index) => index + 1)

// Two to four notes in one bar of 4/4, C4–G5, no signs: every item of quarters and eighths fits.
const SEVERAL: Difficulty = {
  range: { low: { letter: 'C', octave: 4 }, high: { letter: 'G', octave: 5 } },
  ledgerLines: 1,
  keySignatures: 0,
  accidentals: 'none',
  durations: ['half', 'quarter', 'eighth'],
  askDuration: true,
  questionLength: 'two-to-four-notes',
  timeSignatures: [COMMON_TIME],
  rests: false,
  dots: false,
}

// One bar of 4/4 or 3/4 with rests, up to two signs in the key, sharps and flats.
const CONFIDENT_READING = presetDifficulty('confident-reading')
// Two bars of any time signature with rests and dots, any key, sharps, flats and naturals.
const ADVANCED = presetDifficulty('advanced')

const pitch = (letter: Letter, octave: number, alteration?: Pitch['alteration']): Pitch =>
  alteration === undefined ? { letter, octave } : { letter, octave, alteration }

const item = (asked: Pitch, duration: Duration): ReviewItem => ({ pitch: asked, duration })

const QUARTER: Duration = { value: 'quarter' }
const EIGHTH: Duration = { value: 'eighth' }

const SOUNDS: Record<string, string> = { '1': '#', '-1': 'b' }
const pitchText = ({ letter, octave, alteration }: Pitch) =>
  `${letter}${SOUNDS[String(alteration)] ?? ''}${octave}`
const durationText = ({ value, dots }: Duration) => `${value}${dots ? '.' : ''}`
const itemText = ({ pitch: asked, duration }: ReviewItem) =>
  `${pitchText(asked)}/${durationText(duration)}`
const elementText = (element: NoteOrRest) =>
  isNote(element) ? itemText(element) : `rest/${durationText(element.duration)}`
const elementsOf = (question: Question) => question.elements.map(elementText).join(' ')

const isItem = (note: Note, due: ReviewItem) =>
  isSamePitch(note.pitch, due.pitch) && isSameDuration(note.duration, due.duration)

const holds = (question: Question, due: ReviewItem) =>
  question.notes.some((note) => isItem(note, due))

// The items the question holds when it should not, or misses when it should, each named with the
// question, so that a failure shows it.
const misplaced = (question: Question, due: readonly ReviewItem[], expected = true): string[] =>
  due
    .filter((each) => holds(question, each) !== expected)
    .map((each) => `${itemText(each)} ${expected ? 'missing from' : 'in'} ${elementsOf(question)}`)

const positionOf = (question: Question, due: ReviewItem) =>
  question.notes.findIndex((note) => isItem(note, due))

const sorted = (texts: readonly string[]) => [...texts].sort()

// Whether the question as generated, with its time signature and key signature, may take the item.
function takes(difficulty: Difficulty, question: Question, due: ReviewItem): boolean {
  const bar = barSixteenths(question.timeSignature)
  const length = sixteenthsOf(due.duration)
  const shortest = Math.min(...difficulty.durations.map(sixteenths))
  const lengths = durationsOf(difficulty)
  const { questionLength, accidentals } = difficulty
  const fitsBar = (() => {
    switch (questionLength) {
      case 'one-note':
        return length <= bar
      case 'two-to-four-notes':
        return length + shortest <= bar
      case 'one-bar':
      case 'two-bars':
        return (
          length <= bar &&
          1 +
            fewestNotes(bar - length, lengths) +
            (barCount(questionLength) - 1) * fewestNotes(bar, lengths) <=
            MAX_NOTES
        )
    }
  })()
  const { letter, octave, alteration } = due.pitch
  const fromKey = applyKeySignature({ letter, octave }, question.keySignature).alteration
  const fitsSign =
    alteration === fromKey ||
    (alteration === undefined
      ? accidentals === 'sharp-flat-and-natural'
      : fromKey === undefined && accidentals !== 'none')
  return fitsBar && fitsSign
}

const ALTERATIONS = { sharp: 1, flat: -1, natural: undefined } as const
const keyAlteration = (keySignature: KeySignature, letter: Letter) =>
  keySignature.count !== 0 && keySignatureLetters(keySignature).includes(letter)
    ? ALTERATIONS[keySignature.accidental]
    : undefined
const samePlace = (a: Pitch, b: Pitch) => a.letter === b.letter && a.octave === b.octave
const sum = (elements: readonly NoteOrRest[]) =>
  elements.reduce((total, element) => total + sixteenthsOf(element.duration), 0)

// What breaks the limits of spec 6.1 and of the generator, so that a failure names the question.
// The same rules as question-bars, question-rests, question-dots and question-accidentals check
// for the questions without the queue.
function breaches(difficulty: Difficulty, question: Question): string[] {
  const found: string[] = []
  const where = elementsOf(question)
  const { elements, notes, timeSignature, keySignature } = question
  const { questionLength } = difficulty
  const bar = barSixteenths(timeSignature)
  const ofBars = questionLength === 'one-bar' || questionLength === 'two-bars'
  const allowed = allowedPitches(difficulty)
  if (!fittingTimeSignatures(difficulty).some((each) => barSixteenths(each) === bar))
    found.push(`the time signature does not fit: ${where}`)
  if (elements.length > MAX_NOTES) found.push(`${elements.length} elements: ${where}`)
  if (notes.length === 0) found.push(`no note: ${where}`)
  if (ofBars) {
    const bars = barsOf(question)
    if (bars.length !== barCount(questionLength) || bars.some((each) => sum(each) !== bar))
      found.push(`not ${barCount(questionLength)} full bars: ${where}`)
  } else if (sum(elements) > bar) found.push(`longer than a bar: ${where}`)
  if (questionLength === 'one-note' && elements.length !== 1) found.push(`not one note: ${where}`)
  if (questionLength === 'two-to-four-notes' && (elements.length < 2 || elements.length > 4))
    found.push(`not 2–4 notes: ${where}`)
  const rests = elements.filter(isRest)
  if (rests.length > 0 && !(difficulty.rests && ofBars)) found.push(`a rest: ${where}`)
  elements.slice(1).forEach((each, at) => {
    const before = elements[at]
    if (before && isRest(before) && isRest(each)) found.push(`two rests in a row: ${where}`)
  })
  for (const { duration } of elements) {
    if (!difficulty.durations.includes(duration.value)) found.push(`a ${duration.value}: ${where}`)
    if (duration.dots && !difficulty.dots) found.push(`a dot with the dots off: ${where}`)
    if (duration.dots && duration.value === 'sixteenth') found.push(`a dotted sixteenth: ${where}`)
  }
  notes.forEach((note, index) => {
    if (!allowed.some((each) => samePlace(each, note.pitch)))
      found.push(`${pitchText(note.pitch)} off the range: ${where}`)
    const before = notes[index - 1]
    if (before && samePlace(before.pitch, note.pitch))
      found.push(`${pitchText(note.pitch)} repeats the note before it: ${where}`)
  })

  const bars = barsOf(question).map((each) => each.filter(isNote))
  // The signs on the letter that say otherwise than the note sounds.
  const contradictingIn = (barNotes: readonly Note[], { letter, alteration }: Pitch) =>
    barNotes.filter(
      (each) =>
        each.pitch.letter === letter &&
        each.accidental &&
        ALTERATIONS[each.accidental] !== alteration,
    )
  bars.forEach((barNotes, barIndex) => {
    const barBefore = bars[barIndex - 1] ?? []
    barNotes.forEach((note, index) => {
      const what = `${note.accidental ?? ''} ${pitchText(note.pitch)}, bar ${barIndex + 1}: ${where}`
      const before = barNotes.slice(0, index)
      const { pitch: sounding, accidental } = note
      if (difficulty.accidentals === 'none' && accidental) found.push(`a sign: ${what}`)
      const lastSign = before.findLast((each) => each.accidental && samePlace(each.pitch, sounding))
      const withoutSign = lastSign?.accidental
        ? ALTERATIONS[lastSign.accidental]
        : keyAlteration(keySignature, sounding.letter)
      const sound = accidental ? ALTERATIONS[accidental] : withoutSign
      if (sounding.alteration !== sound) found.push(`a wrong sound: ${what}`)
      const contradicting = [
        ...contradictingIn(barBefore, sounding),
        ...contradictingIn(before, sounding).filter(
          (each) => each.pitch.octave !== sounding.octave,
        ),
      ]
      const courtesy = accidental !== undefined && sound === withoutSign && contradicting.length > 0
      if ((accidental === 'sharp' || accidental === 'flat') && !courtesy) {
        if (keyAlteration(keySignature, sounding.letter) !== undefined)
          found.push(`a sign over the key signature: ${what}`)
        if (lastSign && lastSign.accidental !== 'natural')
          found.push(`a sign over a sign earlier in the bar: ${what}`)
      }
      if (accidental === 'natural' && !courtesy) {
        if (withoutSign === undefined) found.push(`a natural without a reason: ${what}`)
        else if (difficulty.accidentals !== 'sharp-flat-and-natural')
          found.push(`a natural not allowed: ${what}`)
      }
      const firstAtPlace = !before.some((each) => samePlace(each.pitch, sounding))
      if (!accidental && firstAtPlace && contradicting.length > 0)
        found.push(`no courtesy sign: ${what}`)
    })
  })
  return found
}

describe('a due item in a question of several notes (criterion 6)', () => {
  it.each<[string, Difficulty]>([
    ['2–4 notes', SEVERAL],
    ['one bar', CONFIDENT_READING],
    ['two bars', ADVANCED],
  ])('is a note of a question of %s, the same pitch and duration', (_, difficulty) => {
    // A4 quarter fits every time signature, and every key of these difficulties takes it.
    const due = item(pitch('A', 4), QUARTER)

    for (const seed of SEEDS) {
      const question = createQuestionGenerator(seeded(seed), difficulty)([due])

      expect(misplaced(question, [due])).toEqual([])
      expect(breaches(difficulty, question)).toEqual([])
    }
  })

  it('is a note of a later question of the session too', () => {
    const due = item(pitch('D', 5), EIGHTH)
    const nextQuestion = createQuestionGenerator(seeded(7), SEVERAL)
    for (let asked = 0; asked < 5; asked++) nextQuestion([])

    expect(holds(nextQuestion([due]), due)).toBe(true)
  })

  it('keeps a dotted item dotted', () => {
    const due = item(pitch('E', 5), { value: 'quarter', dots: 1 })

    for (const seed of SEEDS) {
      const question = createQuestionGenerator(seeded(seed), ADVANCED)([due])

      expect(misplaced(question, [due])).toEqual([])
      expect(breaches(ADVANCED, question)).toEqual([])
    }
  })

  it('keeps a sharp item sharp, whatever the key signature', () => {
    // F♯ is in the keys of one and two sharps; the keys of one and two flats leave F natural.
    const due = item(pitch('F', 4, 1), QUARTER)

    for (const seed of SEEDS) {
      const question = createQuestionGenerator(seeded(seed), CONFIDENT_READING)([due])

      expect(misplaced(question, [due])).toEqual([])
      expect(breaches(CONFIDENT_READING, question)).toEqual([])
    }
  })

  it('keeps a flat item flat, not the same sound written otherwise', () => {
    const due = item(pitch('D', 5, -1), QUARTER)

    for (const seed of SEEDS) {
      const question = createQuestionGenerator(seeded(seed), CONFIDENT_READING)([due])

      expect(misplaced(question, [due])).toEqual([])
      expect(question.notes.some((note) => isItem(note, item(pitch('C', 5, 1), QUARTER)))).toBe(
        false,
      )
    }
  })

  it('stands in more than one place among the notes, so that a return does not give itself away', () => {
    const due = item(pitch('A', 4), QUARTER)
    const places = new Set<number>()

    for (const seed of SEEDS) {
      const question = createQuestionGenerator(seeded(seed), SEVERAL)([due])
      places.add(positionOf(question, due))
    }

    expect(places.has(-1)).toBe(false)
    expect(places.size).toBeGreaterThan(1)
  })

  it('leaves the other notes to the difficulty: they vary from question to question', () => {
    const due = item(pitch('A', 4), QUARTER)
    const others = new Set<string>()

    for (const seed of SEEDS) {
      const question = createQuestionGenerator(seeded(seed), SEVERAL)([due])
      for (const note of question.notes) if (!isItem(note, due)) others.add(itemText(note))
    }

    expect(others.size).toBeGreaterThan(5)
  })
})

describe('several items due at once (criteria 6 and 7)', () => {
  it('puts both into a question of 2–4 notes', () => {
    const due = [item(pitch('C', 5), QUARTER), item(pitch('E', 4), EIGHTH)]

    for (const seed of SEEDS) {
      const question = createQuestionGenerator(seeded(seed), SEVERAL)(due)

      expect(misplaced(question, due)).toEqual([])
      expect(breaches(SEVERAL, question)).toEqual([])
    }
  })

  it.each<[string, Difficulty]>([
    ['one bar', CONFIDENT_READING],
    ['two bars', ADVANCED],
  ])('puts both into a question of %s when they fit it together', (_, difficulty) => {
    // A quarter and an eighth fit together into a bar of every time signature.
    const due = [item(pitch('G', 4), QUARTER), item(pitch('D', 5), EIGHTH)]

    for (const seed of SEEDS) {
      const question = createQuestionGenerator(seeded(seed), difficulty)(due)

      expect(misplaced(question, due)).toEqual([])
      expect(breaches(difficulty, question)).toEqual([])
    }
  })

  it('makes every note an item, the first ones, when more are due than the question has notes', () => {
    // In the order of their priority, as the queue gives them.
    const due = [
      item(pitch('C', 4), QUARTER),
      item(pitch('E', 4), QUARTER),
      item(pitch('G', 4), QUARTER),
      item(pitch('B', 4), QUARTER),
      item(pitch('D', 5), QUARTER),
    ]

    for (const seed of SEEDS) {
      const question = createQuestionGenerator(seeded(seed), SEVERAL)(due)
      const count = question.notes.length

      expect({
        question: elementsOf(question),
        notes: sorted(question.notes.map(itemText)),
      }).toEqual({
        question: elementsOf(question),
        notes: sorted(due.slice(0, count).map(itemText)),
      })
      expect(breaches(SEVERAL, question)).toEqual([])
    }
  })

  it('skips an item the question does not take and takes the next one in its stead', () => {
    // A whole note never fits a question of 2–4 notes in 4/4: the half and the quarter go in.
    const whole = item(pitch('C', 5), { value: 'whole' })
    const due = [whole, item(pitch('E', 4), { value: 'half' }), item(pitch('G', 4), QUARTER)]
    const difficulty: Difficulty = { ...SEVERAL, durations: ['whole', 'half', 'quarter'] }

    for (const seed of SEEDS) {
      const question = createQuestionGenerator(seeded(seed), difficulty)(due)

      expect(holds(question, whole)).toBe(false)
      expect(misplaced(question, due.slice(1))).toEqual([])
      expect(breaches(difficulty, question)).toEqual([])
    }
  })
})

describe('an item a question does not take (criterion 6, edge case 3)', () => {
  it('leaves a whole item out of a bar of 3/4 and puts it into a bar of 4/4', () => {
    // G is in no key of up to two signs.
    const due = item(pitch('G', 4), { value: 'whole' })
    let taken = 0

    for (const seed of SEEDS) {
      const nextQuestion = createQuestionGenerator(seeded(seed), CONFIDENT_READING)
      for (let asked = 0; asked < 5; asked++) {
        const question = nextQuestion([due])
        const { beats } = question.timeSignature

        expect(misplaced(question, [due], beats === 4)).toEqual([])
        expect(breaches(CONFIDENT_READING, question)).toEqual([])
        if (holds(question, due)) taken += 1
      }
    }

    expect(taken).toBeGreaterThan(0)
  })

  it.each<[string, Difficulty]>([
    ['one note', { ...CONFIDENT_READING, questionLength: 'one-note' }],
    ['one bar', CONFIDENT_READING],
  ])(
    'puts a natural item into no key that would need a natural, naturals not allowed: %s',
    (_, difficulty) => {
      // F natural; the keys of one and two sharps would need a natural before it.
      const due = item(pitch('F', 4), QUARTER)
      let taken = 0

      for (const seed of SEEDS) {
        const nextQuestion = createQuestionGenerator(seeded(seed), difficulty)
        for (let asked = 0; asked < 5; asked++) {
          const question = nextQuestion([due])
          const sharpKey = keyAlteration(question.keySignature, 'F') === 1

          expect(misplaced(question, [due], !sharpKey)).toEqual([])
          expect(breaches(difficulty, question)).toEqual([])
          if (holds(question, due)) taken += 1
        }
      }

      expect(taken).toBeGreaterThan(0)
    },
  )

  it.each<[string, Difficulty]>([
    ['one note', { ...CONFIDENT_READING, questionLength: 'one-note', accidentals: 'none' }],
    ['one bar', { ...CONFIDENT_READING, accidentals: 'none' }],
  ])(
    'puts a sharp item only into a key that gives the sharp, accidentals not allowed: %s',
    (_, difficulty) => {
      // F♯ met in a key of sharps: without accidentals only such a key may take it.
      const due = item(pitch('F', 4, 1), QUARTER)
      let taken = 0

      for (const seed of SEEDS) {
        const nextQuestion = createQuestionGenerator(seeded(seed), difficulty)
        for (let asked = 0; asked < 5; asked++) {
          const question = nextQuestion([due])
          const sharpKey = keyAlteration(question.keySignature, 'F') === 1

          expect(misplaced(question, [due], sharpKey)).toEqual([])
          expect(breaches(difficulty, question)).toEqual([])
          if (holds(question, due)) taken += 1
        }
      }

      expect(taken).toBeGreaterThan(0)
    },
  )
})

// Spec 16: on random settings a question with an item due keeps to the limits of spec 6.1, and
// takes the item whenever it may (edge case 3). The items are notes of questions of the same
// difficulty, as in a session (edge case 2).
describe('questions with an item due over many settings', () => {
  const settings: [string, Difficulty][] = PRESETS.flatMap((preset) =>
    QUESTION_LENGTHS.flatMap((questionLength) =>
      ACCIDENTAL_SETS.map((accidentals): [string, Difficulty] => [
        `${preset}, ${questionLength}, ${accidentals}`,
        {
          ...presetDifficulty(preset),
          questionLength,
          accidentals,
          keySignatures: preset === 'first-steps' ? 0 : 7,
        },
      ]),
    ),
  ).filter(([, difficulty]) => isPlayable(difficulty))

  function itemsOf(difficulty: Difficulty, seed: number): ReviewItem[] {
    const nextQuestion = createQuestionGenerator(seeded(seed), difficulty)
    const found = new Map<string, ReviewItem>()
    for (let asked = 0; asked < 10; asked++)
      for (const { pitch: written, duration } of nextQuestion().notes)
        found.set(itemText({ pitch: written, duration }), { pitch: written, duration })
    return [...found.values()].slice(0, 12)
  }

  it.each(settings)(
    'keep to the limits and take the item whenever they may: %s',
    (_, difficulty) => {
      let taken = 0
      const notTaken: string[] = []
      itemsOf(difficulty, 101).forEach((due, index) => {
        const nextQuestion = createQuestionGenerator(seeded(200 + index), difficulty)
        for (let asked = 0; asked < 6; asked++) {
          const question = nextQuestion([due])
          const may = takes(difficulty, question, due)
          const what = `${itemText(due)} in ${question.timeSignature.beats}/${question.timeSignature.beatValue}, ${JSON.stringify(question.keySignature)}: ${elementsOf(question)}`

          expect(breaches(difficulty, question)).toEqual([])
          if (may && !holds(question, due)) notTaken.push(what)
          if (holds(question, due)) taken += 1
        }
      })

      expect(notTaken).toEqual([])
      expect(taken).toBeGreaterThan(0)
    },
  )
})
