import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import { createPreferences } from './application/preferences'
import { createProgress } from './application/progress'
import {
  createIntervalTimer,
  createPerformanceClock,
  createWallClock,
} from './infrastructure/clock'
import { createAppI18n } from './infrastructure/i18n'
import { createMathRandom } from './infrastructure/random'
import { createLocalStorage } from './infrastructure/storage'
import { createWikiLibrary } from './infrastructure/wiki'
import router from './presentation/router'
import {
  clockKey,
  preferencesKey,
  progressKey,
  randomKey,
  timerKey,
  wikiLibraryKey,
} from './presentation/dependencies'

const browserLanguages = navigator.languages.length > 0 ? navigator.languages : [navigator.language]
const storage = createLocalStorage()
const preferences = createPreferences(storage, browserLanguages)
const progress = createProgress(storage, createWallClock())
document.documentElement.lang = preferences.language

const app = createApp(App)

app.use(createPinia())
app.use(createAppI18n(preferences.language))
app.use(router)
app.provide(randomKey, createMathRandom())
app.provide(clockKey, createPerformanceClock())
app.provide(timerKey, createIntervalTimer())
app.provide(preferencesKey, preferences)
app.provide(progressKey, progress)
app.provide(wikiLibraryKey, createWikiLibrary())

app.mount('#app')
