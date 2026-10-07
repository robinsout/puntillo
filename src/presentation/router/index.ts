import { createRouter, createWebHistory } from 'vue-router'
import { TrainerView } from '@/presentation/trainer'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [{ path: '/', component: TrainerView }],
})

export default router
