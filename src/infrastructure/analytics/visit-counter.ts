import type { VisitCounter } from '@/application/ports'
import { createCounter, type CounterOptions } from './counter'

type Options = Omit<CounterOptions, 'project'>

export function createCounterVisitCounter(options: Options): VisitCounter {
  const counter = createCounter({ ...options, project: 'puntillo' })
  return {
    count(event) {
      if (event.page === 'wiki-article') {
        counter.count(event.name, { page: event.page, lang: event.lang, topic: event.topic })
      } else {
        counter.count(event.name, { page: event.page, lang: event.lang })
      }
    },
  }
}
