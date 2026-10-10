import { describe, expect, it } from 'vitest'
import { isWikiTopic, WIKI_TOPICS } from '@/domain/wiki'

// Feature wiki, criterion 2 and its assumption: the four topics of spec §10.2 and the notes on
// the treble staff, which comes first as the most common mistake of the trainer is the place of a
// note.
describe('the wiki topics', () => {
  it('are the five topics in their order', () => {
    expect(WIKI_TOPICS).toEqual([
      'treble-staff',
      'durations',
      'accidentals',
      'key-signatures',
      'keys',
    ])
  })

  it('tell a topic from any other text', () => {
    for (const topic of WIKI_TOPICS) expect(isWikiTopic(topic)).toBe(true)
    expect(isWikiTopic('xyz')).toBe(false)
    expect(isWikiTopic('')).toBe(false)
  })
})
