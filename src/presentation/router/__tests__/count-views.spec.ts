import { describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter, type RouteRecordRaw } from 'vue-router'
import type { CounterEvent, VisitCounter } from '@/application/ports'
import type { Locale } from '@/domain/language'
import { countScreenViews } from '@/presentation/router/count-views'

// Feature visit-counter, slice 1 of 3, criteria 1, 4 and 8.

const Page = { template: '<div />' }

const routes: RouteRecordRaw[] = [
  { path: '/', component: Page },
  { path: '/progress', component: Page },
  { path: '/settings', component: Page },
  { path: '/wiki', component: Page },
  { path: '/wiki/:topic', component: Page },
  { path: '/design-system', component: Page },
  { path: '/:unknown(.*)*', component: Page },
]

function setUp(initialLanguage: Locale = 'en') {
  const events: CounterEvent[] = []
  const counter: VisitCounter = { count: (event) => events.push(event) }
  const router = createRouter({ history: createMemoryHistory(), routes })
  let language = initialLanguage
  countScreenViews(router, counter, () => language)
  return {
    router,
    events,
    setLanguage: (next: Locale) => {
      language = next
    },
  }
}

describe('countScreenViews', () => {
  it('counts the screen of the first load', async () => {
    const { router, events } = setUp('ru')

    await router.push('/')

    expect(events).toEqual([{ name: 'view', lang: 'ru', page: 'trainer' }])
  })

  it('counts each later move to another screen', async () => {
    const { router, events } = setUp()

    await router.push('/')
    await router.push('/progress')
    await router.push('/wiki/keys')
    await router.push('/settings')

    expect(events).toEqual([
      { name: 'view', lang: 'en', page: 'trainer' },
      { name: 'view', lang: 'en', page: 'progress' },
      { name: 'view', lang: 'en', page: 'wiki-article', topic: 'keys' },
      { name: 'view', lang: 'en', page: 'settings' },
    ])
  })

  it('counts with the language of the moment of the move', async () => {
    const { router, events, setLanguage } = setUp('en')

    await router.push('/settings')
    setLanguage('es')
    await router.push('/wiki')

    expect(events.map((event) => event.name === 'view' && event.lang)).toEqual(['en', 'es'])
  })

  it('sends neither the query nor the hash of the address', async () => {
    const { router, events } = setUp()

    await router.push('/wiki/durations?from=mistake#rests')

    expect(events).toEqual([{ name: 'view', lang: 'en', page: 'wiki-article', topic: 'durations' }])
  })

  it('counts an article that is not in the wiki as unknown', async () => {
    const { router, events } = setUp()

    await router.push('/wiki/whatever')

    expect(events).toEqual([{ name: 'view', lang: 'en', page: 'wiki-article', topic: 'unknown' }])
  })

  it('does not count a move that a guard cancels', async () => {
    const { router, events } = setUp()
    router.beforeEach((to) => to.path !== '/settings')

    await router.push('/')
    await router.push('/settings')

    expect(events).toEqual([{ name: 'view', lang: 'en', page: 'trainer' }])
  })

  it('does not count a move to the screen already open', async () => {
    const { router, events } = setUp()

    await router.push('/progress')
    await router.push('/progress')

    expect(events).toHaveLength(1)
  })

  it.each(['/design-system', '/nowhere'])(
    'does not count %s, which is not a screen',
    async (path) => {
      const { router, events } = setUp()

      await router.push(path)

      expect(events).toEqual([])
    },
  )
})
