import type { VisitCounter } from '@/application/ports'
import { createCounter, type CounterOptions } from './counter'

type Options = Omit<CounterOptions, 'project'>

export function createCounterVisitCounter(options: Options): VisitCounter {
  const counter = createCounter({ ...options, project: 'puntillo' })
  return {
    count(event) {
      switch (event.name) {
        case 'view':
          if (event.page === 'wiki-article') {
            counter.count(event.name, { page: event.page, lang: event.lang, topic: event.topic })
          } else {
            counter.count(event.name, { page: event.page, lang: event.lang })
          }
          return
        case 'session':
          counter.count(event.name, { exercise: event.exercise, preset: event.preset })
          return
        case 'summary':
          counter.count(event.name, {
            exercise: event.exercise,
            score: event.score,
            total: event.total,
          })
      }
    },
  }
}
