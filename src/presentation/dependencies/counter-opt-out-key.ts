import { inject, type InjectionKey } from 'vue'
import type { CounterOptOut } from '@/application/ports'

export const counterOptOutKey: InjectionKey<CounterOptOut> = Symbol('counterOptOut')

const NONE: CounterOptOut = { isOff: () => false, setOff: () => {}, canSave: () => true }

export const useCounterOptOut = (): CounterOptOut => inject(counterOptOutKey, NONE)
