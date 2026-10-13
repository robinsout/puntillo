import { createPinia } from 'pinia'
import { render } from '@testing-library/vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import App from '@/App.vue'
import type { KeyValueStorage, Random, WikiLibrary } from '@/application/ports'
import type { Preferences } from '@/application/preferences'
import type { Progress } from '@/application/progress'
import type { Locale } from '@/domain/language'
import { createAppI18n } from '@/infrastructure/i18n'
import {
  clockKey,
  preferencesKey,
  progressKey,
  randomKey,
  timerKey,
  wikiLibraryKey,
} from '@/presentation/dependencies'
import { routes } from '@/presentation/router'
import {
  constant,
  createManualClock,
  createMemoryStorage,
  preferencesFor,
  progressOver,
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
  // The storage of the page: the preferences and the progress are read from it unless given.
  storage?: KeyValueStorage
  preferences?: Preferences
  progress?: Progress
  library?: WikiLibrary
  random?: Random
}

// A new user, so First steps, unless preferences or a storage are given. The random source, unless
// given, and the clock are those of the session tests. A new render over the same storage stands
// for a page reload.
export async function renderApp({
  path = '/',
  locale = 'en',
  storage = createMemoryStorage(),
  preferences = preferencesFor([locale], storage),
  progress = progressOver(storage),
  library = fakeWikiLibrary().library,
  random = constant(0),
}: AppVisit = {}) {
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push(path)
  await router.isReady()
  document.documentElement.lang = preferences.language
  const time = createManualClock()
  const result = render(App, {
    global: {
      plugins: [createAppI18n(preferences.language), createPinia(), router],
      stubs: { StaffView: StaffViewStub },
      provide: {
        [randomKey as symbol]: random,
        [clockKey as symbol]: time.clock,
        [timerKey as symbol]: time.timer,
        [preferencesKey as symbol]: preferences,
        [progressKey as symbol]: progress,
        [wikiLibraryKey as symbol]: library,
      },
    },
  })
  return { ...result, router }
}
