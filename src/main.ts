import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import { createAppI18n } from './infrastructure/i18n'
import { createMathRandom } from './infrastructure/random'
import { createTimeoutScheduler } from './infrastructure/scheduler'
import router from './presentation/router'
import { randomKey, schedulerKey } from './presentation/trainer'

const app = createApp(App)

app.use(createPinia())
app.use(createAppI18n())
app.use(router)
app.provide(randomKey, createMathRandom())
app.provide(schedulerKey, createTimeoutScheduler())

app.mount('#app')
