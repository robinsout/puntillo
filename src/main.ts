import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import './presentation/ui/styles.css'
import { createPreferences } from './application/preferences'
import { createProgress } from './application/progress'
import { createKeySound } from './application/sound'
import {
  createIntervalTimer,
  createPerformanceClock,
  createWallClock,
} from './infrastructure/clock'
import { createCounterVisitCounter } from './infrastructure/analytics'
import { createDownloadSaver } from './infrastructure/file'
import { createAppI18n } from './infrastructure/i18n'
import { createWebMidiInput } from './infrastructure/midi'
import { createMathRandom } from './infrastructure/random'
import { createWebAudioPiano } from './infrastructure/sound'
import { createLocalStorage } from './infrastructure/storage'
import { createWikiLibrary } from './infrastructure/wiki'
import router from './presentation/router'
import { countScreenViews } from './presentation/router/count-views'
import {
  clockKey,
  fileSaverKey,
  keySoundKey,
  midiInputKey,
  preferencesKey,
  progressKey,
  randomKey,
  timerKey,
  visitCounterKey,
  wallClockKey,
  wikiLibraryKey,
} from './presentation/dependencies'

const browserLanguages = navigator.languages.length > 0 ? navigator.languages : [navigator.language]
const storage = createLocalStorage()
const preferences = createPreferences(storage, browserLanguages)
const wallClock = createWallClock()
const progress = createProgress(storage, wallClock)
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
app.provide(wallClockKey, wallClock)
app.provide(fileSaverKey, createDownloadSaver())
app.provide(midiInputKey, createWebMidiInput())
app.provide(keySoundKey, createKeySound(createWebAudioPiano(import.meta.env.BASE_URL), preferences))

// Counted only on the published site: the Lighthouse run of CI serves the same build on localhost.
const counterEndpoint =
  location.origin === 'https://robinsout.github.io'
    ? (import.meta.env.VITE_COUNTER_ENDPOINT ?? '')
    : ''
const visitCounter = createCounterVisitCounter({ endpoint: counterEndpoint })
countScreenViews(router, visitCounter, () => preferences.language)
app.provide(visitCounterKey, visitCounter)

app.mount('#app')
