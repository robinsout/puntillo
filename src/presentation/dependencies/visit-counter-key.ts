import { inject, type InjectionKey } from 'vue'
import type { VisitCounter } from '@/application/ports'

export const visitCounterKey: InjectionKey<VisitCounter> = Symbol('visitCounter')

const NONE: VisitCounter = { count: () => {} }

export const useVisitCounter = (): VisitCounter => inject(visitCounterKey, NONE)
