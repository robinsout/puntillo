import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { SessionView } from '@/presentation/session'

// The build leaves a lazy page out only behind a condition it folds itself, not behind an argument.
const catalog: RouteRecordRaw[] = import.meta.env.DEV
  ? [
      {
        path: '/design-system',
        component: () => import('@/presentation/ui/catalog/DesignSystemView.vue'),
      },
    ]
  : []

export function appRoutes(options: { catalog: boolean }): RouteRecordRaw[] {
  return [
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
    ...(options.catalog ? catalog : []),
  ]
}

export const routes = appRoutes({ catalog: import.meta.env.DEV })

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

export default router
