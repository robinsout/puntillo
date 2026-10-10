import { describe, expect, it } from 'vitest'
import type { NoteNamingChoice, WikiLibrary } from '@/application/ports'
import { searchTopics } from '@/application/wiki'
import { presetDifficulty } from '@/domain/difficulty'
import type { Locale } from '@/domain/language'
import { parseStaffExample, WIKI_TOPICS, type WikiArticle, type WikiTopic } from '@/domain/wiki'

// Feature wiki, criterion 3: the search finds a topic by its title, given by the caller in the
// language of the interface, or by the text of its article in that language and in the naming of
// the user. The titles alone are enough for an empty query, so no article is loaded for it.

const LATIN: NoteNamingChoice = { noteNaming: 'latin-syllable', seventhNote: 'B' }

const TITLES: Record<WikiTopic, string> = {
  'treble-staff': 'Notes on the treble staff',
  durations: 'Durations of notes and rests',
  accidentals: 'Sharp, flat and natural',
  'key-signatures': 'Key signatures',
  keys: 'Keys and how to tell them by the key signature',
}

const EXAMPLE = parseStaffExample('4/4 C5/whole')
if (!EXAMPLE) throw new Error('the example does not parse')

const articleWith = (...texts: string[]): WikiArticle => ({
  practice: presetDifficulty('first-steps'),
  related: [],
  blocks: [
    ...texts.map((text) => ({ kind: 'text' as const, html: `<p><em>${text}</em></p>`, text })),
    { kind: 'staff', label: 'A whole note with a hidden label', question: EXAMPLE },
  ],
  hint: { html: 'A hint the search does not read.', label: 'A hint example', question: EXAMPLE },
})

// Each topic has its own words; a missing article fails to load.
type Articles = Partial<Record<WikiTopic, WikiArticle | Promise<WikiArticle>>>

function fakeLibrary(articles: Articles = {}) {
  const loads: { topic: WikiTopic; locale: Locale; naming: NoteNamingChoice }[] = []
  const library: WikiLibrary = {
    async load(topic, locale, naming) {
      loads.push({ topic, locale, naming })
      const article = articles[topic]
      if (!article) throw new Error(`no article ${topic}`)
      return article
    },
  }
  return { library, loads }
}

const search = (query: string, articles: Articles = {}, locale: Locale = 'en') =>
  searchTopics(fakeLibrary(articles).library, { query, locale, naming: LATIN, titles: TITLES })

describe('searching the topics', () => {
  it.each(['', '   '])('gives every topic in order for an empty query "%s"', async (query) => {
    expect(await search(query)).toEqual([...WIKI_TOPICS])
  })

  it('loads no article for an empty query', async () => {
    const { library, loads } = fakeLibrary()

    await searchTopics(library, { query: ' ', locale: 'en', naming: LATIN, titles: TITLES })

    expect(loads).toEqual([])
  })

  it('finds a topic by its title, whatever the case', async () => {
    expect(await search('SHARP')).toEqual(['accidentals'])
  })

  it('gives every topic found in the order of the topics', async () => {
    expect(await search('key')).toEqual(['key-signatures', 'keys'])
    expect(await search('notes')).toEqual(['treble-staff', 'durations'])
  })

  it('finds a topic by the text of its article', async () => {
    const articles: Articles = {
      keys: articleWith('The tonic is the home note.'),
      durations: articleWith('A whole note lasts four beats.'),
    }

    expect(await search('tonic', articles)).toEqual(['keys'])
  })

  it('finds a topic by any text block of its article', async () => {
    const articles: Articles = {
      accidentals: articleWith('First block.', 'The natural cancels a sharp: fa♯ becomes fa.'),
    }

    expect(await search('becomes fa', articles)).toEqual(['accidentals'])
  })

  it('finds a topic once when both its title and its text match', async () => {
    expect(await search('sharp', { accidentals: articleWith('A sharp raises a note.') })).toEqual([
      'accidentals',
    ])
  })

  it('searches the visible text, not the markup', async () => {
    expect(await search('<em>', { keys: articleWith('Plain words.') })).toEqual([])
  })

  it('does not search the labels of the examples', async () => {
    expect(await search('hidden label', { keys: articleWith('Plain words.') })).toEqual([])
  })

  it('gives the topics in their order whatever order their articles arrive in', async () => {
    let releaseFirst: (article: WikiArticle) => void = () => {}
    const articles: Articles = {
      'treble-staff': new Promise((resolve) => (releaseFirst = resolve)),
      keys: articleWith('the word'),
    }

    const found = search('the word', articles)
    await Promise.resolve()
    releaseFirst(articleWith('the word too'))

    expect(await found).toEqual(['treble-staff', 'keys'])
  })

  it('loads the articles in the language and the naming given', async () => {
    const { library, loads } = fakeLibrary()
    const naming: NoteNamingChoice = { noteNaming: 'letter', seventhNote: 'H' }

    await searchTopics(library, { query: 'word', locale: 'ru', naming, titles: TITLES })

    expect(loads.length).toBeGreaterThan(0)
    for (const load of loads) expect(load).toMatchObject({ locale: 'ru', naming })
  })

  it('finds an article that fails to load by its title alone, and does not fail', async () => {
    expect(await search('sharp')).toEqual(['accidentals'])
    expect(await search('tonic', { durations: articleWith('No such word.') })).toEqual([])
  })

  it('still finds the other articles by their text when one fails to load', async () => {
    expect(await search('tonic', { keys: articleWith('The tonic.') })).toEqual(['keys'])
  })

  it('takes a text with marks for one without them', async () => {
    expect(await search('cuando', { keys: articleWith('Cuándo se usa.') })).toEqual(['keys'])
  })
})
