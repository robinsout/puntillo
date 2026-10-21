import { describe, expect, it } from 'vitest'
import { screenViewOf } from '@/application/analytics'
import { WIKI_TOPICS } from '@/domain/wiki'

// Feature visit-counter, slice 1 of 3, criteria 1 and 4: a screen is counted by a fixed id;
// nothing else of the address leaves the page.

describe('screenViewOf', () => {
  it.each([
    ['/', 'trainer'],
    ['/progress', 'progress'],
    ['/settings', 'settings'],
    ['/wiki', 'wiki'],
  ] as const)('names %s as the %s screen', (path, page) => {
    expect(screenViewOf(path)).toEqual({ page })
  })

  it.each(WIKI_TOPICS)('names the wiki article %s by its topic', (topic) => {
    expect(screenViewOf(`/wiki/${topic}`)).toEqual({ page: 'wiki-article', topic })
  })

  it('names an article that is not in the wiki as unknown, not by its address', () => {
    expect(screenViewOf('/wiki/my-secret-notes')).toEqual({
      page: 'wiki-article',
      topic: 'unknown',
    })
  })

  it.each([
    ['/progress/', { page: 'progress' }],
    ['/settings/', { page: 'settings' }],
    ['/wiki/', { page: 'wiki' }],
    ['/wiki/keys/', { page: 'wiki-article', topic: 'keys' }],
  ] as const)('takes %s with a trailing slash for the same screen', (path, view) => {
    expect(screenViewOf(path)).toEqual(view)
  })

  it.each(['/design-system', '/nowhere', '/wiki/keys/more', '/progressive', '/settings/extra', ''])(
    'does not count %j, which is not a screen of the app',
    (path) => {
      expect(screenViewOf(path)).toBeNull()
    },
  )
})
