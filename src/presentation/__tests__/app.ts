import { createPinia } from 'pinia'
import { render } from '@testing-library/vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import App from '@/App.vue'
import type { NoteNamingChoice, WikiLibrary } from '@/application/ports'
import type { Preferences } from '@/application/preferences'
import { presetDifficulty, type Difficulty } from '@/domain/difficulty'
import type { Locale } from '@/domain/language'
import { noteName } from '@/domain/naming'
import { parseStaffExample, type WikiArticle, type WikiTopic } from '@/domain/wiki'
import { createAppI18n } from '@/infrastructure/i18n'
import { clockKey, preferencesKey, randomKey, wikiLibraryKey } from '@/presentation/dependencies'
import { routes } from '@/presentation/router'
import {
  constant,
  createManualClock,
  createMemoryStorage,
  preferencesFor,
  StaffViewStub,
} from './screen'

// The whole app on its routes, feature wiki and on: the choice screen at /, the wiki under /wiki.

// What Practice this of every fake article asks for: First steps, but the half and the eighth
// notes and their durations asked, so its session is told from one of First steps by its row.
export const PRACTICE: Difficulty = {
  ...presetDifficulty('first-steps'),
  durations: ['eighth', 'half'],
  askDuration: true,
}

export const EXAMPLE_LABEL = 'Two half notes'

// The related topics of each fake article, as the real articles have them.
export const RELATED: Record<WikiTopic, WikiTopic[]> = {
  'treble-staff': ['durations', 'accidentals'],
  durations: ['treble-staff'],
  accidentals: ['key-signatures', 'treble-staff'],
  'key-signatures': ['accidentals', 'keys'],
  keys: ['key-signatures', 'accidentals'],
}

const textBlock = (text: string) => ({ kind: 'text' as const, html: `<p>${text}</p>`, text })

// The text tells in which language it was asked and names F♯4 as the real library would; one of
// its blocks is only in the article of its topic in its language: "About keys in ru.".
const articleIn = (topic: WikiTopic, locale: Locale, naming: NoteNamingChoice): WikiArticle => {
  const question = parseStaffExample('4/4 C5/half D5/half')
  if (!question) throw new Error('the fake example does not parse')
  const sharp = noteName('F', naming.noteNaming, naming.seventhNote, 1)
  return {
    practice: PRACTICE,
    related: RELATED[topic],
    blocks: [
      textBlock(`Article text in ${locale}.`),
      { kind: 'staff', label: EXAMPLE_LABEL, question },
      textBlock(`The note ${sharp}.`),
      textBlock(`About ${topic} in ${locale}.`),
    ],
  }
}

// 'ready' gives the article at once; 'held' only on release(); 'failing' never.
export type Loading = 'ready' | 'held' | 'failing'

export function fakeWikiLibrary(loading: Loading = 'ready') {
  const loads: { topic: WikiTopic; locale: Locale }[] = []
  const held: (() => void)[] = []
  const library: WikiLibrary = {
    load(topic, locale, naming) {
      loads.push({ topic, locale })
      const article = articleIn(topic, locale, naming)
      if (loading === 'failing') return Promise.reject(new Error('the network is down'))
      if (loading === 'ready') return Promise.resolve(article)
      return new Promise((resolve) => held.push(() => resolve(article)))
    },
  }
  return {
    library,
    loads,
    release() {
      for (const resolve of held.splice(0)) resolve()
    },
    // Gives the articles of the last count loads held, leaving the earlier ones held.
    releaseLast(count: number) {
      for (const resolve of held.splice(held.length - count)) resolve()
    },
  }
}

export interface AppVisit {
  path?: string
  locale?: Locale
  preferences?: Preferences
  library?: WikiLibrary
}

// A new user, so First steps, unless preferences are given. The random source and the clock are
// those of the session tests.
export async function renderApp({
  path = '/',
  locale = 'en',
  preferences = preferencesFor([locale], createMemoryStorage()),
  library = fakeWikiLibrary().library,
}: AppVisit = {}) {
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push(path)
  await router.isReady()
  document.documentElement.lang = preferences.language
  const result = render(App, {
    global: {
      plugins: [createAppI18n(preferences.language), createPinia(), router],
      stubs: { StaffView: StaffViewStub },
      provide: {
        [randomKey as symbol]: constant(0),
        [clockKey as symbol]: createManualClock().clock,
        [preferencesKey as symbol]: preferences,
        [wikiLibraryKey as symbol]: library,
      },
    },
  })
  return { ...result, router }
}
