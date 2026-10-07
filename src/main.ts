import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import { createAppI18n, pickLocale } from './infrastructure/i18n'
import { createMathRandom } from './infrastructure/random'
import { createTimeoutScheduler } from './infrastructure/scheduler'
import router from './presentation/router'
import { randomKey, schedulerKey } from './presentation/trainer'

// Язык интерфейса — первый поддерживаемый из настроек браузера.
const preferences = navigator.languages.length > 0 ? navigator.languages : [navigator.language]
const locale = pickLocale(preferences)
document.documentElement.lang = locale

const app = createApp(App)

app.use(createPinia())
app.use(createAppI18n(locale))
app.use(router)
app.provide(randomKey, createMathRandom())
app.provide(schedulerKey, createTimeoutScheduler())

app.mount('#app')
