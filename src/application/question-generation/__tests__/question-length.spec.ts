import { describe, expect, it } from 'vitest'
import { createQuestionGenerator } from '@/application/question-generation'
import type { Random } from '@/application/ports'
import {
  allowedPitches,
  isPlayable,
  presetDifficulty,
  QUESTION_LENGTHS,
  type Difficulty,
} from '@/domain/difficulty'
import { diatonicPitchesBetween, diatonicStep, type Pitch } from '@/domain/pitch'
import {
  COMMON_TIME,
  DURATION_VALUES,
  type Duration,
  type Note,
  type Question,
} from '@/domain/question'
import { ledgerLines } from '@/domain/staff'

// Feature multi-note-questions, slice 1, criterion 4: «2–4 notes» asks about two to four notes in
// one 4/4 bar, which need not be full.

const name = (pitch: Pitch): string => `${pitch.letter}${pitch.octave}`
const notesOf = (question: Question) =>
  question.notes.map((note) => `${name(note.pitch)} ${note.duration.value}`)

const ALMOST_ONE = 1 - Number.EPSILON

// Sixteenths in a 4/4 bar.
const BAR = 16
const LENGTH: Record<Duration['value'], number> = {
  whole: 16,
  half: 8,
  quarter: 4,
  eighth: 2,
  sixteenth: 1,
}

const sum = (notes: readonly Note[]) =>
  notes.reduce((total, note) => total + LENGTH[note.duration.value], 0)

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

// C4–C5 with one ledger line: the eight notes C4…C5, and four durations from the whole to the
// eighth, as in question-generation.spec.ts.
const SEVERAL: Difficulty = {
  range: { low: { letter: 'C', octave: 4 }, high: { letter: 'C', octave: 5 } },
  ledgerLines: 1,
  durations: ['whole', 'half', 'quarter', 'eighth'],
  askDuration: true,
  questionLength: 'two-to-four-notes',
  timeSignatures: [COMMON_TIME],
  rests: false,
  dots: false,
}

const severalWith = (durations: Difficulty['durations']): Difficulty => ({
  ...SEVERAL,
  durations,
})

// The random values are spent in this order: the number of notes first, then the pitch and the
// duration of each note in turn. A question of one note spends only the last two, as before.
describe('a question of two to four notes', () => {
  describe('the number of notes', () => {
    it.each([
      [0, 2],
      [0.33, 2],
      [0.34, 3],
      [0.66, 3],
      [0.67, 4],
      [ALMOST_ONE, 4],
    ])('is picked by the first value: %f gives %i', (value, count) => {
      const values = [value, ...Array<number>(2 * count).fill(ALMOST_ONE)]

      expect(createQuestionGenerator(scripted(...values), SEVERAL)().notes).toHaveLength(count)
    })

    // Two half notes fill the bar: a third note would not fit.
    it('is two when the shortest duration is the half note', () => {
      const nextQuestion = createQuestionGenerator(
        scripted(ALMOST_ONE, 0, 0, 0, 0),
        severalWith(['whole', 'half']),
      )

      expect(notesOf(nextQuestion())).toEqual(['C4 half', 'D4 half'])
    })
  })

  describe('the notes', () => {
    it('are the lowest notes in turn, as long as fits, for a source that gives 0', () => {
      const nextQuestion = createQuestionGenerator(scripted(0, 0, 0, 0, 0), SEVERAL)

      expect(notesOf(nextQuestion())).toEqual(['C4 half', 'D4 half'])
    })

    // Each duration is picked among the allowed ones that leave room for the notes after it,
    // at the shortest allowed duration each, by floor(next × their number).
    it('take each duration among those that leave room for the notes after it', () => {
      // 4 notes: C4 half, the whole leaving no room; D4 eighth, the last of quarter and eighth;
      // C4 quarter, the first of quarter and eighth; D4 eighth, the only one left.
      const values = [0.7, 0, 0, 0, 0.99, 0, 0, 0, 0]

      expect(notesOf(createQuestionGenerator(scripted(...values), SEVERAL)())).toEqual([
        'C4 half',
        'D4 eighth',
        'C4 quarter',
        'D4 eighth',
      ])
    })

    it('pick the pitch of each note among the allowed ones but the note before it', () => {
      // 3 notes: the 6th of eight, A4; the 3rd of the seven without A4, E4; the 7th of the seven
      // without E4, C5.
      const values = [0.5, 5.5 / 8, 0, 2.5 / 7, 0, 6.5 / 7, 0]

      expect(
        createQuestionGenerator(scripted(...values), SEVERAL)().notes.map((n) => name(n.pitch)),
      ).toEqual(['A4', 'E4', 'C5'])
    })

    it('never repeat the note just before, even for the same random value', () => {
      const nextQuestion = createQuestionGenerator({ next: () => 0.5 }, SEVERAL)

      const names = nextQuestion().notes.map((note) => name(note.pitch))

      expect(names).toEqual(['G4', 'F4', 'G4'])
    })

    it('alternate the two lowest notes for a source that always gives 0', () => {
      const nextQuestion = createQuestionGenerator({ next: () => 0 }, SEVERAL)

      const pitches = [nextQuestion(), nextQuestion()].map((q) => q.notes.map((n) => name(n.pitch)))

      expect(pitches).toEqual([
        ['C4', 'D4'],
        ['C4', 'D4'],
      ])
    })

    it('do not start with the last note of the previous question, whatever it was', () => {
      // First question: C4 and D4 halves. The second starts among the seven without D4.
      const nextQuestion = createQuestionGenerator(
        scripted(0, 0, 0, 0, 0, 0, 1.5 / 7, 0, 0, 0),
        SEVERAL,
      )
      nextQuestion()

      expect(name(nextQuestion().notes[0]!.pitch)).toBe('E4')
    })
  })

  it('stays one note after another when the length is one note', () => {
    const nextQuestion = createQuestionGenerator(scripted(0, 0, 0, 0), {
      ...SEVERAL,
      questionLength: 'one-note',
    })

    expect([nextQuestion(), nextQuestion()].map(notesOf)).toEqual([['C4 whole'], ['D4 whole']])
  })

  it.each(['first-steps', 'confident-reading', 'advanced'] as const)(
    'gives several notes with the values of %s and the length changed',
    (preset) => {
      const difficulty: Difficulty = {
        ...presetDifficulty(preset),
        questionLength: 'two-to-four-notes',
      }
      const question = createQuestionGenerator(seeded(5), difficulty)()

      expect(question.notes.length).toBeGreaterThanOrEqual(2)
      expect(difficulty.timeSignatures).toContainEqual(question.timeSignature)
      expect(question.clef).toBe('treble')
    },
  )
})

// Spec 16: on random settings a generated question always keeps to the limits of spec 6.1. Here in
// 4/4 alone, with one note or 2–4 notes; question-bars.spec.ts covers every length and time
// signature.
describe('questions of a random length over random settings', () => {
  const SPAN = diatonicPitchesBetween({ letter: 'A', octave: 3 }, { letter: 'C', octave: 6 })

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
        durations: DURATION_VALUES.filter(() => random.next() < 0.5),
        askDuration: random.next() < 0.5,
        questionLength: element(QUESTION_LENGTHS.slice(0, 2), random),
        timeSignatures: [COMMON_TIME],
        rests: false,
        dots: false,
      }
      if (isPlayable(difficulty)) return difficulty
    }
  }

  const describeSettings = (difficulty: Difficulty) =>
    `${name(difficulty.range.low)}–${name(difficulty.range.high)}, ` +
    `${difficulty.ledgerLines} ledger lines, ${difficulty.durations.join(' ')}, ` +
    difficulty.questionLength

  const shortest = (difficulty: Difficulty) =>
    Math.min(...difficulty.durations.map((value) => LENGTH[value]))

  // The numbers of notes that fit: as many notes of the shortest duration as the bar holds.
  const possibleCounts = (difficulty: Difficulty) =>
    difficulty.questionLength === 'one-note'
      ? [1]
      : [2, 3, 4].filter((count) => count * shortest(difficulty) <= BAR)

  // Several notes leave the whole note out: it fills the bar alone.
  const possibleDurations = (difficulty: Difficulty) =>
    difficulty.questionLength === 'one-note'
      ? difficulty.durations
      : difficulty.durations.filter((value) => value !== 'whole')

  // What breaks the limits, so that a failure names the settings and the question.
  function breaches(difficulty: Difficulty, questions: readonly Question[]): string[] {
    const allowed = allowedPitches(difficulty).map(name)
    let previous: string | undefined
    return questions.flatMap((question, index) => {
      const where = `${describeSettings(difficulty)}: question ${index + 1}, ${notesOf(question).join(', ')}`
      const found: string[] = []
      if (!possibleCounts(difficulty).includes(question.notes.length))
        found.push(`${where} has ${question.notes.length} notes`)
      if (difficulty.questionLength !== 'one-note' && sum(question.notes) > BAR)
        found.push(`${where} does not fit the bar`)
      for (const note of question.notes) {
        const pitch = name(note.pitch)
        if (!allowed.includes(pitch)) found.push(`${where}: ${pitch} is not allowed`)
        if (ledgerLines(note.pitch, 'treble') > difficulty.ledgerLines)
          found.push(`${where}: ${pitch} needs too many ledger lines`)
        if (!possibleDurations(difficulty).includes(note.duration.value))
          found.push(`${where}: a ${note.duration.value} note`)
        if (pitch === previous) found.push(`${where}: ${pitch} repeats the note before it`)
        previous = pitch
      }
      return found
    })
  }

  it.each([3, 31, 2027])(
    'seed %i: 200 settings, 200 questions each, keep to the bar, the range, the ledger lines and the durations',
    (seed) => {
      const settings = seeded(seed)
      for (let run = 0; run < 200; run++) {
        const difficulty = randomDifficulty(settings)
        const nextQuestion = createQuestionGenerator(seeded(seed * 1000 + run), difficulty)

        expect(breaches(difficulty, Array.from({ length: 200 }, nextQuestion))).toEqual([])
      }
    },
  )

  it.each([3, 31, 2027])(
    'seed %i: 50 settings, 1000 questions each, use every possible number of notes, note and duration',
    (seed) => {
      const settings = seeded(seed)
      for (let run = 0; run < 50; run++) {
        const difficulty = randomDifficulty(settings)
        const nextQuestion = createQuestionGenerator(seeded(seed * 1000 + run), difficulty)
        const questions = Array.from({ length: 1000 }, nextQuestion)
        const notes = questions.flatMap((question) => question.notes)

        expect({
          settings: describeSettings(difficulty),
          counts: new Set(questions.map((question) => question.notes.length)),
          pitches: new Set(notes.map((note) => name(note.pitch))),
          durations: new Set(notes.map((note) => note.duration.value)),
        }).toEqual({
          settings: describeSettings(difficulty),
          counts: new Set(possibleCounts(difficulty)),
          pitches: new Set(allowedPitches(difficulty).map(name)),
          durations: new Set(possibleDurations(difficulty)),
        })
      }
    },
  )
})
