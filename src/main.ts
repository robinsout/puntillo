import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import { createAppI18n } from './infrastructure/i18n'
import router from './presentation/router'

const app = createApp(App)

app.use(createPinia())
app.use(createAppI18n())
app.use(router)

app.mount('#app')
