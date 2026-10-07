import type { InjectionKey } from 'vue'
import type { Random } from '@/application/ports'

// Источник случайности создаёт точка сборки (src/main.ts) и передаёт через provide.
export const randomKey: InjectionKey<Random> = Symbol('random')
