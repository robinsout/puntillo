import { describe, expect, it } from 'vitest'
import type { NoteNamingChoice } from '@/application/ports'
import type { Difficulty } from '@/domain/difficulty'
import { LOCALES } from '@/domain/language'
import type { Pitch } from '@/domain/pitch'
import { matchesQuery, WIKI_TOPICS, type WikiArticle, type WikiTopic } from '@/domain/wiki'
import { createWikiLibrary } from '@/infrastructure/wiki'

// Feature wiki, slices 1 and 2, and spec §10.3: every topic has an article in every language, made of
// text and at least one example on the staff, with the same Practice this and the same related
// topics in each language. The texts themselves are checked by a human when the slice is merged.

const LATIN: NoteNamingChoice = { noteNaming: 'latin-syllable', seventhNote: 'B' }

const textOf = (html: string) => {
  const element = document.createElement('div')
  element.innerHTML = html
  return element.textContent?.trim() ?? ''
}

const load = (topic: WikiTopic, locale: (typeof LOCALES)[number]) =>
  createWikiLibrary().load(topic, locale, LATIN)

describe.each(WIKI_TOPICS)('the article %s', (topic) => {
  describe.each(LOCALES)('in %s', (locale) => {
    it('has text and at least one example on the staff', async () => {
      const { blocks } = await load(topic, locale)

      const texts = blocks.flatMap((block) => (block.kind === 'text' ? [textOf(block.html)] : []))
      expect(texts.length).toBeGreaterThan(0)
      expect(texts.every((text) => text.length > 0)).toBe(true)
      expect(blocks.some((block) => block.kind === 'staff')).toBe(true)
    })

    it('leaves the heading of the page to the title: its own headings are of level 2 and below', async () => {
      const { blocks } = await load(topic, locale)

      const html = blocks.flatMap((block) => (block.kind === 'text' ? [block.html] : []))
      expect(html.filter((each) => /<h1/.test(each))).toEqual([])
    })

    it('labels every example', async () => {
      const { blocks } = await load(topic, locale)

      const labels = blocks.flatMap((block) => (block.kind === 'staff' ? [block.label.trim()] : []))
      expect(labels).not.toContain('')
    })
  })

  it('practices the same and links the same topics in every language', async () => {
    const articles: WikiArticle[] = await Promise.all(LOCALES.map((locale) => load(topic, locale)))
    const [english, ...others] = articles

    for (const other of others) {
      expect(other.practice).toEqual(english?.practice)
      expect(other.related).toEqual(english?.related)
    }
  })

  it('does not link to itself', async () => {
    expect((await load(topic, 'en')).related).not.toContain(topic)
  })
})

// Feature wiki, slice 2: the content guarantees of every article. The topics are listed here
// rather than taken from WIKI_TOPICS, so that a topic left out there still fails here.
const TOPICS: readonly WikiTopic[] = [
  'treble-staff',
  'durations',
  'accidentals',
  'key-signatures',
  'keys',
  'piano-keyboard',
  'instrument',
]
const NAMINGS: NoteNamingChoice[] = [
  { noteNaming: 'latin-syllable', seventhNote: 'B' },
  { noteNaming: 'cyrillic-syllable', seventhNote: 'B' },
  { noteNaming: 'letter', seventhNote: 'B' },
  { noteNaming: 'letter', seventhNote: 'H' },
]

describe.each(TOPICS)('the article %s, in every language and every naming', (topic) => {
  it.each(LOCALES.flatMap((locale) => NAMINGS.map((naming) => [locale, naming] as const)))(
    'loads in %s with %o',
    async (locale, naming) => {
      const { blocks } = await createWikiLibrary().load(topic, locale, naming)

      expect(blocks.some((block) => block.kind === 'text')).toBe(true)
      expect(blocks.some((block) => block.kind === 'staff')).toBe(true)
    },
  )

  it('links one related topic at least, each known and once', async () => {
    const { related } = await load(topic, 'en')

    expect(related.length).toBeGreaterThan(0)
    expect(related.every((each) => (WIKI_TOPICS as readonly string[]).includes(each))).toBe(true)
    expect(new Set(related).size).toBe(related.length)
    expect(related).not.toContain(topic)
  })

  it('gives each text block its plain text', async () => {
    const { blocks } = await load(topic, 'en')

    const words = (text: string) => text.replace(/\s+/g, ' ').trim()
    const texts = blocks.flatMap((block) => (block.kind === 'text' ? [block] : []))

    expect(texts.length).toBeGreaterThan(0)
    expect(texts.map(({ text }) => words(text))).toEqual(
      texts.map(({ html }) => words(textOf(html))),
    )
  })
})

const RELATED: Record<WikiTopic, WikiTopic[]> = {
  'treble-staff': ['durations', 'accidentals'],
  durations: ['treble-staff'],
  accidentals: ['key-signatures', 'treble-staff'],
  'key-signatures': ['accidentals', 'keys'],
  keys: ['key-signatures', 'accidentals'],
  'piano-keyboard': ['treble-staff', 'accidentals'],
  // Feature microphone-input, slice 5.
  instrument: ['treble-staff', 'piano-keyboard'],
}

describe.each(TOPICS)('the related topics of %s', (topic) => {
  it('are those of the feature', async () => {
    const { related } = await load(topic, 'en')

    expect([...related].sort()).toEqual([...RELATED[topic]].sort())
  })
})

const C4: Pitch = { letter: 'C', octave: 4 }
const C5: Pitch = { letter: 'C', octave: 5 }
const G5: Pitch = { letter: 'G', octave: 5 }
const COMMON_TIME_ONLY = [{ beats: 4, beatValue: 4 }]

// Practice this practises what the article teaches, and nothing the reader has not met yet.
const PRACTICE: Record<WikiTopic, Partial<Difficulty>> = {
  'treble-staff': {
    range: { low: { letter: 'A', octave: 3 }, high: { letter: 'C', octave: 6 } },
    ledgerLines: 2,
    durations: ['quarter'],
    askDuration: false,
    questionLength: 'one-note',
    keySignatures: 0,
    accidentals: 'none',
    rests: false,
    dots: false,
  },
  durations: {
    range: { low: C4, high: C5 },
    ledgerLines: 0,
    durations: ['eighth', 'half', 'quarter', 'whole'],
    askDuration: true,
    questionLength: 'one-bar',
    timeSignatures: COMMON_TIME_ONLY,
    keySignatures: 0,
    accidentals: 'none',
    rests: true,
  },
  accidentals: {
    range: { low: C4, high: C5 },
    ledgerLines: 0,
    durations: ['quarter'],
    askDuration: false,
    questionLength: 'one-bar',
    timeSignatures: COMMON_TIME_ONLY,
    keySignatures: 0,
    accidentals: 'sharp-flat-and-natural',
    rests: false,
    dots: false,
  },
  'key-signatures': {
    range: { low: C4, high: G5 },
    ledgerLines: 0,
    durations: ['quarter'],
    askDuration: false,
    questionLength: 'one-bar',
    timeSignatures: COMMON_TIME_ONLY,
    keySignatures: 7,
    accidentals: 'none',
    rests: false,
    dots: false,
  },
  keys: {
    range: { low: C4, high: G5 },
    ledgerLines: 0,
    durations: ['quarter'],
    askDuration: false,
    questionLength: 'one-bar',
    timeSignatures: COMMON_TIME_ONLY,
    keySignatures: 7,
    accidentals: 'none',
    rests: false,
    dots: false,
  },
  // Feature piano-keyboard, slice 3: First steps.
  'piano-keyboard': {
    range: { low: C4, high: C5 },
    askDuration: false,
    questionLength: 'one-note',
    keySignatures: 0,
    accidentals: 'none',
  },
  // Feature microphone-input, slice 5: one note at a time, within reach of every instrument of
  // either tuning, no signs, as First steps.
  instrument: {
    range: { low: C4, high: C5 },
    askDuration: false,
    questionLength: 'one-note',
    keySignatures: 0,
    accidentals: 'none',
  },
}

describe.each(TOPICS)('Practice this of %s', (topic) => {
  it('practises the topic of the article', async () => {
    const { practice } = await load(topic, 'en')
    const sorted = { ...practice, durations: [...practice.durations].sort() }

    expect(sorted).toMatchObject(PRACTICE[topic])
  })
})

const examplesOf = async (topic: WikiTopic) =>
  (await load(topic, 'en')).blocks.flatMap((block) =>
    block.kind === 'staff' ? [block.question] : [],
  )

describe.each(['key-signatures', 'keys'] as const)('the examples of %s', (topic) => {
  it.each(['sharp', 'flat'] as const)('show a key signature of %ss', async (accidental) => {
    const examples = await examplesOf(topic)

    expect(
      examples.some(
        ({ keySignature }) => keySignature.count !== 0 && keySignature.accidental === accidental,
      ),
    ).toBe(true)
  })
})

// Feature piano-keyboard, slice 3: the article ties the keys to the staff by middle C and the C
// above it, and shows one black key written as a sharp and as a flat.
describe.each(LOCALES)('the examples of piano-keyboard in %s', (locale) => {
  const pitchesOf = async () =>
    (await load('piano-keyboard', locale)).blocks.flatMap((block) =>
      block.kind === 'staff' ? block.question.notes.map(({ pitch }) => pitch) : [],
    )
  const has = (pitches: Pitch[], wanted: Pitch) =>
    pitches.some(
      ({ letter, octave, alteration }) =>
        letter === wanted.letter && octave === wanted.octave && alteration === wanted.alteration,
    )

  it('show middle C and the C above it', async () => {
    const pitches = await pitchesOf()

    expect(has(pitches, C4)).toBe(true)
    expect(has(pitches, C5)).toBe(true)
  })

  it('show C♯4 and D♭4, one key', async () => {
    const pitches = await pitchesOf()

    expect(has(pitches, { letter: 'C', octave: 4, alteration: 1 })).toBe(true)
    expect(has(pitches, { letter: 'D', octave: 4, alteration: -1 })).toBe(true)
  })
})

describe('the examples of accidentals', () => {
  it.each(['sharp', 'flat', 'natural'] as const)('show a %s sign', async (sign) => {
    const examples = await examplesOf('accidentals')

    expect(examples.some(({ notes }) => notes.some((note) => note.accidental === sign))).toBe(true)
  })
})

// Feature wiki, slice 3, criterion 8 and spec §10.1: every topic has a hint in every language, of up
// to three sentences, with an example on the staff. A sentence ends with . ! ? or … before the end
// or before a capital, ¿ or ¡: a lowercase note name like «fa♯» after a dot does not count as a new
// sentence, so the count errs on the low side only where a sentence starts with a note name.
const sentencesOf = (text: string) => text.split(/(?<=[.!?…])\s+(?=[\p{Lu}¿¡«"])/u).length

describe('the counting of sentences', () => {
  it.each([
    ['One.', 1],
    ['One. Two! Three?', 3],
    ['Uno. ¿Dos? ¡Tres!', 3],
    ['A half note lasts 1/2. A dot: 1/2 + 1/4 = 3/4.', 2],
  ])('counts %s as %i', (text, count) => {
    expect(sentencesOf(text)).toBe(count)
  })
})

describe.each(TOPICS)('the hint of %s', (topic) => {
  describe.each(LOCALES)('in %s', (locale) => {
    it('has a text of one to three sentences', async () => {
      const { hint } = await load(topic, locale)
      const text = textOf(hint.html).replace(/\s+/g, ' ')

      expect(text).toMatch(/[.!?…]$/)
      expect(sentencesOf(text)).toBeGreaterThanOrEqual(1)
      expect(sentencesOf(text)).toBeLessThanOrEqual(3)
    })

    it('has a labelled example with a note on the staff', async () => {
      const { hint } = await load(topic, locale)

      expect(hint.label.trim()).not.toBe('')
      expect(hint.question.notes.length).toBeGreaterThan(0)
    })

    it('has no block markup in its text', async () => {
      const { hint } = await load(topic, locale)

      expect(hint.html).not.toMatch(/<(h\d|ul|ol|li|pre|blockquote)\b/)
    })
  })

  it('names its notes in every naming', async () => {
    for (const locale of LOCALES)
      for (const naming of NAMINGS) {
        const { hint } = await createWikiLibrary().load(topic, locale, naming)
        expect(hint.html).not.toContain(':note[')
      }
  })
})

// Feature m2-write-notes, slice 4: the article Notes on the treble staff ends with a paragraph on
// octave numbers, which names its notes with :pitch, mentions the exercise Write notes by its name
// in the interface, and an example from B3 up to C5 after it.
describe('the paragraph on octave numbers in treble-staff', () => {
  const EXERCISE = { en: 'Write notes', ru: 'Записывать ноты', es: 'Escribir notas' } as const
  const CYRILLIC: NoteNamingChoice = { noteNaming: 'cyrillic-syllable', seventhNote: 'B' }

  const textsOf = (article: WikiArticle) =>
    article.blocks.flatMap((block) => (block.kind === 'text' ? [textOf(block.html)] : []))

  describe.each(LOCALES)('in %s', (locale) => {
    it('names the exercise as the interface does', async () => {
      const texts = textsOf(await load('treble-staff', locale))

      expect(texts.some((text) => text.includes(EXERCISE[locale]))).toBe(true)
    })

    it('names middle C with its octave in the naming of the user', async () => {
      const latin = textsOf(await load('treble-staff', locale))
      const cyrillic = textsOf(await createWikiLibrary().load('treble-staff', locale, CYRILLIC))

      expect(latin.some((text) => text.includes('do4'))).toBe(true)
      expect(cyrillic.some((text) => text.includes('до4'))).toBe(true)
    })

    it('leaves no pitch mark unnamed', async () => {
      const article = await load('treble-staff', locale)

      expect(textsOf(article).some((text) => text.includes(':pitch'))).toBe(false)
      expect(article.hint.html).not.toContain(':pitch')
    })

    it('ends with the example from B3 up to C5', async () => {
      const last = (await load('treble-staff', locale)).blocks.at(-1)

      expect(last?.kind).toBe('staff')
      const notes = last?.kind === 'staff' ? last.question.notes : []
      expect(notes.map(({ pitch }) => `${pitch.letter}${pitch.octave}`)).toEqual(['B3', 'C4', 'C5'])
    })
  })
})

// Feature midi-input, slice 3, criterion 11: the article The piano keyboard has a paragraph on
// answering with a MIDI keyboard, which names the checkbox as the interface does and says the
// browsers it works in, Safari among those it does not. The search finds this article by «MIDI»,
// and no other: the search looks in the text of the articles, so no other text may say «MIDI».
describe('the paragraph on the MIDI keyboard in piano-keyboard', () => {
  const CHECKBOX = {
    en: 'Use a MIDI keyboard',
    ru: 'MIDI-клавиатура',
    es: 'Usar un teclado MIDI',
  } as const

  const paragraphsOf = (article: WikiArticle) =>
    article.blocks.flatMap((block) => {
      if (block.kind !== 'text') return []
      const element = document.createElement('div')
      element.innerHTML = block.html
      return [...element.querySelectorAll('p')].map((p) => p.textContent?.trim() ?? '')
    })

  describe.each(LOCALES)('in %s', (locale) => {
    it('names the checkbox as the interface does, and Safari', async () => {
      const paragraphs = paragraphsOf(await load('piano-keyboard', locale))

      expect(
        paragraphs.some((text) => text.includes(CHECKBOX[locale]) && text.includes('Safari')),
      ).toBe(true)
    })

    it('makes the article the only one found by MIDI', async () => {
      const found: WikiTopic[] = []
      for (const topic of WIKI_TOPICS) {
        const { blocks } = await load(topic, locale)
        if (blocks.some((block) => block.kind === 'text' && matchesQuery(block.text, 'MIDI')))
          found.push(topic)
      }

      expect(found).toEqual(['piano-keyboard'])
    })
  })
})

// Feature microphone-input, slice 5 of 5, criterion 15: the article Playing your instrument tells
// how to answer with the microphone, chosen in Settings, and why an instrument in B♭ sounds a tone
// below what is written, with the list Instrument to choose. Each is named as the interface names
// it. The search finds the article by the microphone and by the trumpet. The rest of its meaning
// (hold the note, a quiet room, the device about a metre from the bell, the sound staying on the
// device) is checked by a human when the slice is merged.
describe('the article Playing your instrument', () => {
  const NAMES = {
    en: { settings: 'Settings', microphone: 'Microphone', instrument: 'Instrument', bFlat: 'B♭' },
    ru: { settings: 'Настройки', microphone: 'Микрофон', instrument: 'Инструмент', bFlat: 'B♭' },
    es: { settings: 'Ajustes', microphone: 'Micrófono', instrument: 'Instrumento', bFlat: 'Si♭' },
  } as const
  const SEARCHES = {
    en: ['microphone', 'trumpet'],
    ru: ['микрофон', 'труб'],
    es: ['micrófono', 'trompeta'],
  } as const

  const paragraphsOf = (article: WikiArticle) =>
    article.blocks.flatMap((block) => {
      if (block.kind !== 'text') return []
      const element = document.createElement('div')
      element.innerHTML = block.html
      return [...element.querySelectorAll('p')].map((p) => p.textContent?.trim() ?? '')
    })

  describe.each(LOCALES)('in %s', (locale) => {
    const names = NAMES[locale]

    it('says to choose Microphone in Settings', async () => {
      const paragraphs = paragraphsOf(await load('instrument', locale))

      expect(
        paragraphs.some((text) => text.includes(names.microphone) && text.includes(names.settings)),
      ).toBe(true)
    })

    it('names the list Instrument where it tells of B♭', async () => {
      const paragraphs = paragraphsOf(await load('instrument', locale))

      expect(
        paragraphs.some((text) => text.includes(names.instrument) && text.includes(names.bFlat)),
      ).toBe(true)
    })

    it.each(SEARCHES[locale])('is found by «%s»', async (query) => {
      const { blocks } = await load('instrument', locale)

      expect(blocks.some((block) => block.kind === 'text' && matchesQuery(block.text, query))).toBe(
        true,
      )
    })

    // The trumpet in B♭: a written C sounds B♭, a tone below.
    it('shows a C and the B♭ it sounds', async () => {
      const pitches = (await load('instrument', locale)).blocks.flatMap((block) =>
        block.kind === 'staff' ? block.question.notes.map(({ pitch }) => pitch) : [],
      )

      expect(pitches.some(({ letter, alteration }) => letter === 'C' && !alteration)).toBe(true)
      expect(pitches.some(({ letter, alteration }) => letter === 'B' && alteration === -1)).toBe(
        true,
      )
    })
  })
})
