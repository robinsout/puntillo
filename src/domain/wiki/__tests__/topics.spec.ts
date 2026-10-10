import { describe, expect, it } from 'vitest'
import { isWikiTopic, WIKI_TOPICS } from '@/domain/wiki'

// Feature wiki, slice 1: the section starts with one topic; the rest come in slice 2.
describe('the wiki topics', () => {
  it('are the durations alone for now', () => {
    expect(WIKI_TOPICS).toEqual(['durations'])
  })

  it('tell a topic from any other text', () => {
    expect(isWikiTopic('durations')).toBe(true)
    expect(isWikiTopic('xyz')).toBe(false)
    expect(isWikiTopic('')).toBe(false)
  })
})
