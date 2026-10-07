import type { InjectionKey } from 'vue'
import type { Scheduler } from '@/application/ports'

// Таймер автоперехода создаёт точка сборки (src/main.ts) и передаёт через provide.
export const schedulerKey: InjectionKey<Scheduler> = Symbol('scheduler')
