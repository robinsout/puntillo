import type { InjectionKey } from 'vue'
import type { Scheduler } from '@/application/ports'

export const schedulerKey: InjectionKey<Scheduler> = Symbol('scheduler')
