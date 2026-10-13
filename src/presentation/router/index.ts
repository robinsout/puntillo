import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { SessionView } from '@/presentation/session'

export const routes: RouteRecordRaw[] = [
  { path: '/', component: SessionView },
  // Starting the trainer needs neither the progress nor the wiki: they stay out of the initial
  // bundle (spec §18).
  { path: '/progress', component: () => import('@/presentation/progress/ProgressView.vue') },
  { path: '/wiki', component: () => import('@/presentation/wiki/WikiTopicsView.vue') },
  {
    path: '/wiki/:topic',
    component: () => import('@/presentation/wiki/WikiArticleView.vue'),
    props: true,
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

export default router
