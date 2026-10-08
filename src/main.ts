import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import { createPerformanceClock } from './infrastructure/clock'
import { createAppI18n, pickLocale } from './infrastructure/i18n'
import { createMathRandom } from './infrastructure/random'
import { createTimeoutScheduler } from './infrastructure/scheduler'
import router from './presentation/router'
import { clockKey, randomKey, schedulerKey } from './presentation/dependencies'

const preferences = navigator.languages.length > 0 ? navigator.languages : [navigator.language]
const locale = pickLocale(preferences)
document.documentElement.lang = locale

const app = createApp(App)

app.use(createPinia())
app.use(createAppI18n(locale))
app.use(router)
app.provide(randomKey, createMathRandom())
app.provide(schedulerKey, createTimeoutScheduler())
app.provide(clockKey, createPerformanceClock())

app.mount('#app')
