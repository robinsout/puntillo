import { createPinia } from 'pinia'
import { render } from '@testing-library/vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import App from '@/App.vue'
import type { Random, WikiLibrary } from '@/application/ports'
import type { Preferences } from '@/application/preferences'
import type { Locale } from '@/domain/language'
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
import { fakeWikiLibrary } from './wiki-library'

export {
  EXAMPLE_LABEL,
  fakeWikiLibrary,
  HINT_LABEL,
  hintText,
  PRACTICE,
  RELATED,
  type Loading,
} from './wiki-library'

// The whole app on its routes, feature wiki and on: the choice screen at /, the wiki under /wiki.

export interface AppVisit {
  path?: string
  locale?: Locale
  preferences?: Preferences
  library?: WikiLibrary
  random?: Random
}

// A new user, so First steps, unless preferences are given. The random source, unless given, and
// the clock are those of the session tests.
export async function renderApp({
  path = '/',
  locale = 'en',
  preferences = preferencesFor([locale], createMemoryStorage()),
  library = fakeWikiLibrary().library,
  random = constant(0),
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
        [randomKey as symbol]: random,
        [clockKey as symbol]: createManualClock().clock,
        [preferencesKey as symbol]: preferences,
        [wikiLibraryKey as symbol]: library,
      },
    },
  })
  return { ...result, router }
}
