import type { Router } from 'vue-router'
import { screenViewOf } from '@/application/analytics'
import type { VisitCounter } from '@/application/ports'
import type { Locale } from '@/domain/language'

export function countScreenViews(
  router: Router,
  counter: VisitCounter,
  language: () => Locale,
): void {
  router.afterEach((to, _from, failure) => {
    if (failure) return
    const view = screenViewOf(to.path)
    if (view) counter.count({ name: 'view', lang: language(), ...view })
  })
}
