import { describe, expect, it } from 'vitest'
import type { NoteNamingChoice } from '@/application/ports'
import type { Difficulty } from '@/domain/difficulty'
import { LOCALES } from '@/domain/language'
import type { Pitch } from '@/domain/pitch'
import { WIKI_TOPICS, type WikiArticle, type WikiTopic } from '@/domain/wiki'
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

describe('the examples of accidentals', () => {
  it.each(['sharp', 'flat', 'natural'] as const)('show a %s sign', async (sign) => {
    const examples = await examplesOf('accidentals')

    expect(examples.some(({ notes }) => notes.some((note) => note.accidental === sign))).toBe(true)
  })
})
