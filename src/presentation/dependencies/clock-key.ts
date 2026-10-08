import type { InjectionKey } from 'vue'
import type { Clock } from '@/application/ports'

export const clockKey: InjectionKey<Clock> = Symbol('clock')
