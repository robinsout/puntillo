import { describe, expect, it } from 'vitest'
import type { NoteNamingChoice } from '@/application/ports'
import { LOCALES } from '@/domain/language'
import { WIKI_TOPICS, type WikiArticle, type WikiTopic } from '@/domain/wiki'
import { createWikiLibrary } from '@/infrastructure/wiki'

// Feature wiki, slice 1, and spec §10.3: every topic has an article in every language, made of
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

describe('the article on durations', () => {
  it('practices the durations: Practice this asks for them', async () => {
    const { practice } = await load('durations', 'en')

    expect(practice.askDuration).toBe(true)
    expect(practice.durations.length).toBeGreaterThan(1)
  })
})
