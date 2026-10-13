import type { InjectionKey } from 'vue'
import type { Timer } from '@/application/ports'

export const timerKey: InjectionKey<Timer> = Symbol('timer')
