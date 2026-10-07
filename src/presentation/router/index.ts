import { createRouter, createWebHistory } from 'vue-router'
import { SessionView } from '@/presentation/session'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [{ path: '/', component: SessionView }],
})

export default router
